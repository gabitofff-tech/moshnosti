"""End-to-end UI test with an isolated, disposable SQLite database."""
import os
import sys
import subprocess
import tempfile
import time
from pathlib import Path
import httpx
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_calculations import fixture

root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as d:
    process=subprocess.Popen([sys.executable,'-m','uvicorn','app:app','--host','127.0.0.1','--port','8001'],cwd=root,env=dict(os.environ,CAPACITY_DB=d+'/test.sqlite'),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                if httpx.get('http://127.0.0.1:8001/').status_code==200:break
            except httpx.TransportError:pass
            time.sleep(.1)
        with sync_playwright() as p:
            b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
            page=b.new_page(viewport={'width':1500,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto('http://127.0.0.1:8001/')
            page.once('dialog',lambda dialog:dialog.accept('Демо · Механический завод'))
            page.locator('#newEnterprise').click()
            page.get_by_role('button',name='＋ Оборудование',exact=True).click()
            page.locator('[data-path="equipment.0.name"]').fill('Токарный станок')
            page.locator('#save').click()
            page.wait_for_function("document.querySelector('#notice').textContent.includes('сохранены')")
            e=page.request.get('http://127.0.0.1:8001/api/enterprises').json()[0]
            f=fixture();f.update(id=e['id'],name=e['name'],revision=e['revision'])
            assert page.request.put('http://127.0.0.1:8001/api/enterprises/'+e['id'],data=f).ok
            page.reload();page.locator('[data-action="tab:structure"]').click()
            page.locator('[data-path="products.0.nodes.0.name"]').wait_for()
            page.locator('[data-action="node:b"]').click()
            norm=page.locator('[data-path="products.0.nodes.1.operations.0.minutes"]');norm.fill('45');norm.press('Tab')
            page.locator('[data-action="tab:t2"]').click()
            page.wait_for_function("document.querySelector('tbody')?.innerText.includes('450')")
            for tab in ['t1','t2','t3','t4']:
                page.locator('[data-action="tab:'+tab+'"]').click()
                page.get_by_text('Настройки таблицы и подписей').wait_for()
                with page.expect_download() as download:
                    page.locator('[data-action="export:'+tab[1]+'"]').click()
                assert download.value.suggested_filename.endswith('.xlsx')
            page.locator('[data-action="tab:overview"]').click();page.locator('.cards').wait_for()
            page.screenshot(path=str(root/'docs/interface.png'),full_page=True)
            page.locator('#month').select_option('1')
            page.wait_for_function("document.querySelector('#content').innerText.includes('120 ч')")
            page.locator('[data-action="tab:calendar"]').click();page.locator('#calSource').wait_for()
            assert not errors,errors
            b.close();print('Browser smoke: create/edit/save, BOM norms, four XLSX downloads, month, calendar — PASS')
    finally:process.terminate();process.wait(timeout=10)
