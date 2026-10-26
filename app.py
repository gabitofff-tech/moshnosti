import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from engine import calculate,validate,ROOT,CATALOG,calendar_fund
from exports import export
from runtime_paths import data_directory, calendar_directory

DB=Path(os.environ.get('CAPACITY_DB',data_directory()/'capacity.sqlite'))
DB.parent.mkdir(parents=True,exist_ok=True)

@contextmanager
def conn():
    db=sqlite3.connect(DB)
    try:
        with db:
            db.execute('CREATE TABLE IF NOT EXISTS enterprises(id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL)')
            yield db
    finally:
        db.close()
with conn(): pass
app=FastAPI(title='Производственные мощности')
app.mount('/static',StaticFiles(directory=ROOT/'static'),name='static')

@app.exception_handler(ValueError)
async def bad(request,exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=422,content={'detail':str(exc)})

@app.get('/')
def index():return FileResponse(ROOT/'static/index.html')
@app.get('/api/catalog')
def catalog():return CATALOG
@app.get('/api/enterprises')
def enterprises():
    with conn() as db:return [dict(json.loads(row[0]),revision=row[1]) for row in db.execute('SELECT body,revision FROM enterprises ORDER BY rowid')]

class New(BaseModel):
    name:str=Field(min_length=1,max_length=200)
@app.post('/api/enterprises')
def create(body:New):
    e=dict(id=uuid.uuid4().hex,name=body.name,equipment=[],products=[],settings=dict(target=.95,rounding=.2,approver='',approver_role='Должность',developer=''))
    with conn() as db:db.execute('INSERT INTO enterprises VALUES(?,?,1)',(e['id'],json.dumps(e)))
    return dict(e,revision=1)
@app.put('/api/enterprises/{eid}')
def save(eid:str,e:dict):
    if eid!=e.get('id'): raise ValueError('Неверный идентификатор')
    validate(e);revision=e.pop('revision',0)
    with conn() as db:
        cur=db.execute('UPDATE enterprises SET body=?,revision=revision+1 WHERE id=? AND revision=?',(json.dumps(e),eid,revision))
        if not cur.rowcount:raise HTTPException(409,'Данные уже изменены. Обновите страницу перед сохранением.')
    return dict(e,revision=revision+1)

def get(eid):
    with conn() as db:r=db.execute('SELECT body FROM enterprises WHERE id=?',(eid,)).fetchone()
    if not r:raise HTTPException(404,'Предприятие не найдено')
    return json.loads(r[0])
@app.get('/api/calculate/{eid}')
def calc(eid:str,year:int=2026,month:int=0):
    if not 2000<=year<=2100 or not 0<=month<=12:raise ValueError('Неверный период')
    return calculate(get(eid),year,month)
@app.get('/api/export/{eid}/{number}')
def download(eid:str,number:int,year:int=2026,month:int=0):
    if number not in range(1,5):raise HTTPException(404)
    r=calc(eid,year,month)
    if r['issues']:raise ValueError('Экспорт заблокирован: заполните программу и неизвестные нормы. '+'; '.join(r['issues']))
    return StreamingResponse(export(get(eid),r,number),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':f'attachment; filename="table{number}_{r["period"]}.xlsx"'})

class CalendarInput(BaseModel):
    year:int=Field(ge=2000,le=2100)
    source:str=Field(min_length=3,max_length=500)
    holidays:list[str]
    working:list[str]
    shortened:list[str]
@app.post('/api/calendar')
def calendar_save(c:CalendarInput):
    import datetime
    for field in [c.holidays,c.working,c.shortened]:
        for day in field:datetime.date.fromisoformat(f'{c.year}-{day}')
    if set(c.holidays)&set(c.working):raise ValueError('День одновременно указан рабочим и выходным')
    (calendar_directory()/f'{c.year}.json').write_text(json.dumps(c.model_dump(),ensure_ascii=False,indent=2), encoding='utf-8')
    return calendar_fund(c.year)
@app.get('/api/calendar/{year}')
def calendar_get(year:int):
    calendar_fund(year)
    return json.loads((calendar_directory()/f'{year}.json').read_text(encoding='utf-8'))
