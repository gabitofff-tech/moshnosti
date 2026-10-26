"""Windows entry point: a local server, browser UI and a small control window."""
import argparse
import json
import logging
import os
from pathlib import Path
import socket
import threading
import time
import urllib.request
import webbrowser

TITLE = 'Производственные мощности'

class LocalServer:
    def __init__(self):
        import uvicorn
        from app import app
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.bind(('127.0.0.1', 0))
        self.url = f'http://127.0.0.1:{self.socket.getsockname()[1]}'
        self.server = uvicorn.Server(uvicorn.Config(app, log_config=None, access_log=False, loop='asyncio', http='h11', ws='none'))
        self.thread = threading.Thread(target=self.server.run, kwargs={'sockets':[self.socket]}, daemon=True)
    def start(self):
        self.thread.start()
        deadline = time.monotonic()+25
        while time.monotonic()<deadline:
            if not self.thread.is_alive():
                raise RuntimeError('Не удалось запустить локальный сервер. Подробности в файле журнала.')
            try:
                with urllib.request.urlopen(self.url+'/api/enterprises', timeout=.5) as r:
                    if r.status==200: return
            except (OSError, ValueError):
                pass
            time.sleep(.1)
        self.stop()
        raise RuntimeError('Превышено время ожидания запуска приложения.')
    def stop(self):
        self.server.should_exit=True
        if self.thread.is_alive(): self.thread.join(timeout=5)
        self.socket.close()


def setup_logging():
    from runtime_paths import data_directory
    folder = data_directory(); folder.mkdir(parents=True, exist_ok=True)
    from logging.handlers import RotatingFileHandler
    logging.basicConfig(level=logging.INFO, handlers=[RotatingFileHandler(folder/'application.log',maxBytes=2_000_000,backupCount=2,encoding='utf-8')],format='%(asctime)s %(levelname)s %(message)s',force=True)
    return folder


def run_window():
    import tkinter as tk
    from tkinter import messagebox, ttk
    folder = setup_logging()
    root = tk.Tk(); root.title(TITLE); root.geometry('510x270'); root.resizable(False,False)
    frame = ttk.Frame(root,padding=24);frame.pack(fill='both',expand=True)
    ttk.Label(frame,text=TITLE,font=('Segoe UI',16,'bold')).pack(anchor='w')
    status = tk.StringVar(value='Запускаем программу…')
    ttk.Label(frame,textvariable=status,wraplength=455).pack(anchor='w',pady=(16,12))
    ttk.Label(frame,text='Интерфейс открывается в вашем браузере.\nЭто окно оставьте открытым во время работы.',wraplength=455).pack(anchor='w')
    buttons = ttk.Frame(frame);buttons.pack(fill='x',pady=20)
    server = LocalServer()
    def open_browser():
        if not webbrowser.open(server.url):
            messagebox.showinfo(TITLE,'Не удалось открыть браузер автоматически.\nАдрес программы: '+server.url)
    open_button=ttk.Button(buttons,text='Открыть программу',command=open_browser,state='disabled');open_button.pack(side='left')
    def show_folder():
        os.startfile(str(folder))
    ttk.Button(buttons,text='Папка данных',command=show_folder).pack(side='left',padx=8)
    def close():
        if messagebox.askyesno(TITLE,'Завершить работу? Сначала сохраните изменения в браузере.'):
            server.stop(); root.destroy()
    ttk.Button(buttons,text='Завершить',command=close).pack(side='right')
    root.protocol('WM_DELETE_WINDOW',close)
    def ready():
        try:
            server.start();status.set('Программа работает. Данные сохраняются на этом компьютере.')
            open_button.configure(state='normal');open_browser()
        except Exception as exc:
            logging.exception('Startup failed');messagebox.showerror(TITLE,str(exc)+'\n\nЖурнал: '+str(folder/'application.log'));server.stop();root.destroy()
    root.after(100,ready)
    try: root.mainloop()
    finally: server.stop()


def smoke_test(report_path):
    """Runs inside the built EXE on Windows; never touches real user data."""
    import tempfile
    from io import BytesIO
    import zipfile
    with tempfile.TemporaryDirectory(prefix='moshnosti-smoke-') as temp:
        os.environ['CAPACITY_DATA_DIR']=temp
        os.environ['CAPACITY_DB']=str(Path(temp)/'capacity.sqlite')
        setup_logging()
        server=LocalServer()
        def request(path,body=None,method=None):
            req=urllib.request.Request(server.url+path,data=None if body is None else json.dumps(body).encode('utf-8'),headers={'Content-Type':'application/json'},method=method)
            with urllib.request.urlopen(req,timeout=20) as r: return r.read()
        try:
            server.start()
            assert b'<html' in request('/')
            assert len(json.loads(request('/api/catalog'))) > 0
            e=json.loads(request('/api/enterprises',{'name':'Тест EXE — завод'}))
            e['equipment']=[dict(id='eq',name='Токарный',count=1,category=0,losses=[0,0,0])]
            e['products']=[dict(id='item',name='Изделие',plans={'2026':100,'2026-01':100},nodes=[dict(id='part',code='ДЕТ.001',name='Деталь',parent=None,qty=1,operations=[dict(number='005',name='Токарная',equipment='eq',alternatives=[],minutes=30)])])]
            e=json.loads(request('/api/enterprises/'+e['id'],e,'PUT'))
            r=json.loads(request('/api/calculate/'+e['id']+'?year=2026&month=1'))
            assert r['calendar']['hours']==120 and r['equipment'][0]['demand']==50
            for n in range(1,5):
                with zipfile.ZipFile(BytesIO(request(f'/api/export/{e["id"]}/{n}?year=2026&month=1'))) as z:
                    assert 'xl/workbook.xml' in z.namelist()
            c=json.loads(request('/api/calendar/2026'));c['source']='Проверка UTF-8 и сохранения календаря EXE'
            request('/api/calendar',c,'POST')
            assert json.loads(request('/api/calendar/2026'))['source']==c['source']
            assert json.loads((Path(temp)/'calendars/2026.json').read_text(encoding='utf-8'))['source']==c['source']
            server.stop();server=LocalServer();server.start()
            assert json.loads(request('/api/enterprises'))[0]['name']==e['name']
            assert json.loads(request('/api/calendar/2026'))['source']==c['source']
        finally: server.stop()
    Path(report_path).write_text(json.dumps({'status':'passed','checks':['bundled assets','UTF-8 Cyrillic','SQLite persistence after restart','monthly calculation','four Excel exports','persistent calendar']},ensure_ascii=False,indent=2),encoding='utf-8')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--smoke-test',metavar='REPORT_JSON')
    args=parser.parse_args()
    if args.smoke_test:
        smoke_test(args.smoke_test)
    else:
        try:run_window()
        except Exception as exc:
            logging.exception('Desktop launcher failed')
            import tkinter.messagebox
            tkinter.messagebox.showerror(TITLE,'Не удалось открыть программу: '+str(exc))
            raise

if __name__=='__main__': main()
