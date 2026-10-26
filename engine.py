"""Расчётная модель: минуты операций → станко-часы, без кадровых допущений."""
import calendar
import datetime as dt
import json
import math
from pathlib import Path

ROOT = Path(__file__).parent
CATALOG = json.loads((ROOT/'templates/catalog.json').read_text())

def calendar_fund(year, month=0):
    path = ROOT/'calendars'/f'{year}.json'
    if not path.exists():
        raise ValueError(f'Календарь {year} не загружен. Загрузите подтверждённый календарь в настройках.')
    c = json.loads(path.read_text())
    days, hours, short = 0, 0, 0
    for m in ([month] if month else range(1,13)):
        for d in range(1,calendar.monthrange(year,m)[1]+1):
            date=dt.date(year,m,d); key=date.strftime('%m-%d')
            work=(date.weekday()<5 and key not in c['holidays']) or key in c['working']
            if work:
                days+=1; cut=int(key in c['shortened']); short+=cut; hours+=8-cut
    return dict(days=days,hours=hours,shortened=short,source=c['source'])

def validate(e):
    def number(x, name, minimum=0, integer=False):
        if isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or x<minimum or (integer and x!=int(x)):
            raise ValueError(f'{name}: неверное число')
    if not e.get('name','').strip(): raise ValueError('Укажите название предприятия')
    ids=set()
    for eq in e['equipment']:
        if eq['id'] in ids: raise ValueError('Повтор идентификатора оборудования')
        ids.add(eq['id'])
        if not eq['name'].strip(): raise ValueError('Укажите модель оборудования')
        number(eq['count'],'Количество оборудования',integer=True)
        if len(eq['losses'])!=3: raise ValueError('Требуются потери для трёх смен')
        for loss in eq['losses']:
            number(loss,'Потери')
            if loss>=100: raise ValueError('Потери должны быть меньше 100%')
    pids=set()
    for p in e['products']:
        if p['id'] in pids: raise ValueError('Повтор идентификатора изделия')
        pids.add(p['id'])
        if not p['name'].strip(): raise ValueError('Укажите название изделия')
        for v in p['plans'].values(): number(v,'Программа',integer=True)
        nodes={n['id']:n for n in p['nodes']}
        if len(nodes)!=len(p['nodes']): raise ValueError('Повтор идентификатора ДСЕ')
        for n in p['nodes']:
            number(n['qty'],'Количество ДСЕ',minimum=0.000001)
            visited={n['id']}; parent=n.get('parent')
            while parent:
                if parent not in nodes: raise ValueError('Родитель ДСЕ не существует')
                if parent in visited: raise ValueError('Цикл в составе изделия')
                visited.add(parent);parent=nodes[parent].get('parent')
            for op in n['operations']:
                if op['equipment'] not in ids: raise ValueError('Оборудование операции не найдено на предприятии')
                alternatives=op.get('alternatives',[])
                if any(a not in ids for a in alternatives): raise ValueError('Альтернатива отсутствует в парке предприятия')
                if op.get('minutes') is not None: number(op['minutes'],'Норма времени')
    number(e['settings']['target'],'Коэффициент',minimum=0.001)
    if e['settings']['target']>1: raise ValueError('Коэффициент должен быть не больше 1')
    number(e['settings']['rounding'],'Порог округления')
    if e['settings']['rounding']>=1: raise ValueError('Порог округления должен быть меньше 1')

def calculate(e,year,month):
    validate(e)
    cal=calendar_fund(year,month); period=f'{year}-{month:02d}' if month else str(year)
    issues=[]
    if not e['products']: issues.append('Не добавлены изделия')
    if not e['equipment']: issues.append('Не добавлено оборудование')
    totals={q['id']:0 for q in e['equipment']}; details=[]; products=[]
    missing=set()
    for p in e['products']:
        plan=p['plans'].get(period)
        if plan is None: issues.append(f'{p["name"]}: нет программы на {period}')
        nodes={n['id']:n for n in p['nodes']}; per={q['id']:0 for q in e['equipment']}; incomplete=False
        if not any(n['operations'] for n in p['nodes']):
            issues.append(f'{p["name"]}: не заданы операции'); incomplete=True
        for n in p['nodes']:
            qty=n['qty']; parent=n.get('parent')
            while parent:
                qty*=nodes[parent]['qty'];parent=nodes[parent].get('parent')
            for op in n['operations']:
                eq=op['equipment']; minutes=op.get('minutes'); unit=None if minutes is None else qty*minutes/60
                demand=None if unit is None or plan is None else unit*plan
                if demand is None:
                    missing.add(eq);incomplete=True
                    if minutes is None: issues.append(f'{p["name"]} / {n["name"]} / {op["number"]}: не задана норма')
                else: totals[eq]+=demand;per[eq]+=unit
                details.append(dict(product=p['id'],product_name=p['name'],equipment=eq,node=n['code'] or n['name'],qty=qty,minutes=minutes,unit=unit,plan=plan,demand=demand,operation=op['number']))
        products.append(dict(id=p['id'],name=p['name'],plan=plan,per=per,incomplete=incomplete))
    equipment=[]
    for eq in e['equipment']:
        funds=[cal['hours']*s*(1-eq['losses'][s-1]/100) for s in (1,2,3)]
        demand=None if eq['id'] in missing else totals[eq['id']]
        shifts=[]
        for fund in funds:
            total=fund*eq['count']; load=demand/total if demand is not None and total else None
            need=demand/e['settings']['target']/fund if demand is not None and fund else None
            accepted=None if need is None else math.floor(need)+(1 if round(need-math.floor(need),10)>e['settings']['rounding'] else 0)
            shifts.append(dict(fund=fund,total=total,load=load,need=need,accepted=accepted,balance=None if accepted is None else eq['count']-accepted))
        equipment.append(dict(**eq,demand=demand,shifts=shifts))
    for p in products:
        result=[]
        for s in range(3):
            used=[q for q in equipment if p['per'][q['id']]>0]
            bad=p['incomplete'] or p['plan'] is None or not used or any(q['demand'] is None or q['shifts'][s]['total']==0 for q in used)
            kz=None if bad else max(q['shifts'][s]['load'] for q in used)
            # Fixed assortment: all plans scale together; avoids allocating the same park independently.
            capacity=None if bad or not kz else math.floor(p['plan']*e['settings']['target']/kz+0.5)
            result.append(dict(load=kz,capacity=capacity,bottleneck=None if bad else max(used,key=lambda q:q['shifts'][s]['load'])['name']))
        p['shifts']=result;del p['per'];del p['incomplete']
    return dict(period=period,calendar=cal,equipment=equipment,details=details,products=products,issues=sorted(set(issues)),status='INCOMPLETE' if issues else 'CALCULATED')
