let enterprises=[], catalog=[], current, tab='overview', productId, nodeId, result, dirty=false;
const $=s=>document.querySelector(s), uid=()=>crypto.randomUUID();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v==null?'—':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const input=(v,path,type='text',extra='')=>`<input type="${type}" value="${esc(v)}" data-path="${path}" ${extra}>`;
const btn=(label,action,cls='')=>`<button class="${cls}" data-action="${action}">${label}</button>`;
const period=()=>$('#month').value==='0'?$('#year').value:`${$('#year').value}-${$('#month').value.padStart(2,'0')}`;
const params=()=>`year=${$('#year').value}&month=${$('#month').value}`;
const tabs={overview:'Обзор мощностей',structure:'Состав и нормы',equipment:'Парк оборудования',t1:'1 · Фонд времени',t2:'2 · Трудоёмкость',t3:'3 · Загрузка и потребность',t4:'4 · Мощность изделий',calendar:'Производственный календарь'};
async function api(url,options){const r=await fetch(url,options);if(!r.ok){let e=await r.json();throw Error(typeof e.detail==='string'?e.detail:JSON.stringify(e.detail))}return r.json()}
function notify(s,error=false){$('#notice').textContent=s;$('#notice').className=error?'error':''}
function mutate(){dirty=true;$('#save').textContent='Сохранить •'}
async function save(){if(!current)return;current=await api('/api/enterprises/'+current.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(current)});enterprises[enterprises.findIndex(e=>e.id===current.id)]=current;dirty=false;$('#save').textContent='Сохранить';notify('Изменения сохранены')}
async function compute(){if(dirty)await save();result=await api(`/api/calculate/${current.id}?${params()}`)}
function panel(title,body,actions=''){return `<section class="panel"><div class="panelHead"><h2>${title}</h2>${actions}</div>${body}</section>`}
function table(head,rows,cls=''){return `<div class="scroll"><table class="${cls}"><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${head.length}" class="empty">Пока нет данных</td></tr>`}</tbody></table></div>`}
const td=(x,cls='')=>`<td class="${cls}">${x}</td>`;
const row=(a)=>`<tr>${a.join('')}</tr>`;
function settings(){return `<details class="body"><summary>Настройки таблицы и подписей</summary><div class="form"><label>Допустимый коэффициент (0–1)${input(current.settings.target,'settings.target','number','step="0.01" min="0.01" max="1"')}</label><label>Порог округления количества${input(current.settings.rounding,'settings.rounding','number','step="0.01" min="0" max="0.99"')}</label><label>Должность утверждающего${input(current.settings.approver_role,'settings.approver_role')}</label><label>Утверждающий, ФИО${input(current.settings.approver,'settings.approver')}</label><label>Разработал${input(current.settings.developer,'settings.developer')}</label><label>Предприятие${input(current.name,'name')}</label></div><p class="muted">Параметры общие для связанных таблиц: изменения применяются ко всему расчёту.</p>${btn('Применить и пересчитать','recalc','primary')}</details>`}
async function render(){
 $('#title').textContent=tabs[tab];$('#crumb').textContent=current?.name||'Рабочее пространство';
 $('#nav').innerHTML=Object.entries(tabs).map(([k,v])=>btn(v,'tab:'+k,k===tab?'active':'')).join('');
 if(!current){$('#content').innerHTML=panel('Начните с предприятия','<div class="empty">Создайте предприятие, добавьте его оборудование и изделия.<br>Данные из образцов не загружаются как реальные производственные данные.</div>',btn('＋ Создать предприятие','newEnterprise','primary'));return}
 try{
 if(['overview','t1','t2','t3','t4'].includes(tab))await compute();
 let html='';
 if(tab==='equipment'){
 html=panel('Полный парк предприятия',table(['Модель / группа','Количество, ед.','Категория нормативов','Потери 1 / 2 / 3 смены, %',''],current.equipment.map((q,i)=>row([td(input(q.name,`equipment.${i}.name`)),td(input(q.count,`equipment.${i}.count`,'number','min="0" step="1"')),td(`<select data-category="${i}">${catalog.map((c,k)=>`<option value="${k}" ${q.category===k?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`),td(`<div class="toolbar">${q.losses.map((v,j)=>input(v,`equipment.${i}.losses.${j}`,'number','min="0" max="99.99" step="0.1" style="width:75px"')).join('')}</div>`),td(btn('Удалить','delEq:'+i,'danger'))])),'editor'),btn('＋ Оборудование','addEq','primary'));
 html+='<div class="note">Включайте весь парк, в том числе незагруженное оборудование. Количество — единицы взаимозаменяемой модели. Альтернативы выбираются в карточке операции; загрузка начисляется только выбранной модели.</div>';
 }else if(tab==='structure'){
 let pi=current.products.findIndex(p=>p.id===productId);if(pi<0)pi=0;let p=current.products[pi];productId=p?.id;
 html=panel('Изделия и программа выпуска',`<div class="body toolbar"><select id="product">${current.products.map(p=>`<option value="${p.id}" ${p.id===productId?'selected':''}>${esc(p.name)}</option>`).join('')}</select>${btn('＋ Изделие','addProduct','primary')}${p?btn('Удалить изделие','delProduct:'+pi,'danger'):''}</div>`+(p?`<div class="body form"><label>Обозначение / название${input(p.name,`products.${pi}.name`)}</label><label>Программа на ${period()}, шт.${input(p.plans[period()],`products.${pi}.plans.${period()}`,'number','min="0" step="1"')}</label></div>`:''));
 if(p){
 let ni=p.nodes.findIndex(n=>n.id===nodeId);if(ni<0)ni=0;let n=p.nodes[ni];nodeId=n?.id;
 const depth=n=>{let d=0,x=n;while(x.parent&&d<40){x=p.nodes.find(v=>v.id===x.parent);if(!x)break;d++}return d};
 const total=n=>{let q=n.qty,x=n;while(x.parent){x=p.nodes.find(v=>v.id===x.parent);if(!x)break;q*=x.qty}return q};
 html+=`<div class="split">${panel('Структура изделия',`<div class="tree">${p.nodes.map(x=>`<button data-action="node:${x.id}" class="${n?.id===x.id?'selected':''}" style="padding-left:${18+depth(x)*22}px"><b>${esc(x.code||'ДСЕ')}</b> · ${esc(x.name)}<span style="float:right">${num(x.qty)} / ${num(total(x))}</span></button>`).join('')}</div><div class="body toolbar">${btn('＋ Корневая ДСЕ','addNode:root')}${n?btn('＋ Дочерняя','addNode:'+n.id):''}</div><div class="body sub">Справа: количество на родителя / полное количество на изделие. Выберите ДСЕ для редактирования её операций.</div>`)}${panel('Карточка ДСЕ',n?`<div class="body form"><label>Обозначение${input(n.code,`products.${pi}.nodes.${ni}.code`)}</label><label>Наименование${input(n.name,`products.${pi}.nodes.${ni}.name`)}</label><label>Количество на родителя${input(n.qty,`products.${pi}.nodes.${ni}.qty`,'number','min="0.000001" step="any"')}</label></div><div class="body">${btn('Удалить ДСЕ','delNode:'+ni,'danger')}</div>`:'<div class="empty">Добавьте ДСЕ</div>')}</div>`;
 if(n)html+=panel('Нормы времени · '+esc(n.name),table(['№','Операция','Выбранное оборудование','Станко-мин / ДСЕ','Допустимые альтернативы',''],n.operations.map((o,j)=>{let base=`products.${pi}.nodes.${ni}.operations.${j}`;return row([td(input(o.number,base+'.number')),td(input(o.name,base+'.name')),td(`<select data-path="${base}.equipment">${current.equipment.map(q=>`<option value="${q.id}" ${o.equipment===q.id?'selected':''}>${esc(q.name)}</option>`).join('')}</select>`),td(input(o.minutes,base+'.minutes','number','min="0" step="any" placeholder="Не задано"')),td(`<select multiple data-alternatives="${base}.alternatives" aria-label="Альтернативное оборудование">${current.equipment.filter(q=>q.id!==o.equipment).map(q=>`<option value="${q.id}" ${o.alternatives.includes(q.id)?'selected':''}>${esc(q.name)}</option>`).join('')}</select><div class="sub">Ctrl / Cmd — несколько</div>`),td(btn('×','delOp:'+j,'danger'))])}),'editor'),btn('＋ Операция','addOp','primary'));
 }
 }else if(tab==='calendar'){
 let c;try{c=await api('/api/calendar/'+$('#year').value)}catch{c={year:Number($('#year').value),source:'',holidays:[],working:[],shortened:[]}}
 html=panel('Календарь РФ · пятидневная неделя, 40 часов',`<div class="body"><div class="note">Встроен федеральный календарь 2026. Для другого года заполните даты по опубликованному производственному календарю РФ. Региональные праздники можно добавить вручную. Даты: ММ-ДД, через запятую. Явно рабочие даты учитывают переносы на субботы.</div><label>Источник / основание<input id="calSource" value="${esc(c.source)}"></label><br><div class="form">${[['holidays','Нерабочие даты'],['working','Рабочие выходные'],['shortened','Сокращённые на 1 час дни']].map(([k,label])=>`<label>${label}<textarea id="cal_${k}">${esc(c[k].join(', '))}</textarea></label>`).join('')}</div><br>${btn('Сохранить календарь','saveCalendar','primary')}</div>`);
 }else{
 const r=result;let s=0;
 html=`<div class="toolbar"><span class="tag">${esc(r.period)}</span><span class="muted">${num(r.calendar.days)} рабочих дней · ${num(r.calendar.hours)} ч · ${r.calendar.shortened} сокращённых дня</span></div>`;
 if(r.issues.length)html+=`<div class="note error">Неполные данные — экспорт заблокирован:<br>${r.issues.map(esc).join('<br>')}</div>`;
 if(tab==='overview'){
 let demands=r.equipment.filter(q=>q.demand!=null).reduce((a,q)=>a+q.demand,0),fund=r.equipment.reduce((a,q)=>a+q.shifts[0].total,0);
 html+=`<div class="cards">${[['Изделий',current.products.length,'в программе предприятия'],['Оборудования',current.equipment.reduce((a,q)=>a+q.count,0),'единиц в полном парке'],['Потребность',r.issues.length?'Неполные данные':num(demands),'станко-часов за период'],['Доступный фонд',num(fund),'станко-часов · 1 смена']].map(([a,b,c])=>`<div class="card"><small>${a}</small><strong>${b}</strong><small>${c}</small></div>`).join('')}</div>`;
 html+=panel('Загрузка оборудования · 1 смена',table(['Оборудование','Количество','Потребность, ст-ч','Фонд, ст-ч','Загрузка'],r.equipment.map(q=>{let k=q.shifts[0].load;return row([td(esc(q.name)),td(num(q.count),'num'),td(num(q.demand),'num'),td(num(q.shifts[0].total),'num'),td(`${k==null?'Не определена':num(k*100)+' %'}<div class="bar"><i class="${k>1?'red':''}" style="width:${Math.min(100,(k||0)*100)}%"></i></div>`,k>1?'over':'')])})),btn('Открыть расчёт','tab:t3'));
 html+='<div class="note">Порядок работы: полный парк → изделия и программа → состав ДСЕ → операции и нормы → четыре отчёта. Годовая и месячная программы вводятся независимо; годовая программа автоматически на месяцы не делится.</div>';
 }else{
 let number=Number(tab[1]),heads=[],rows=[];
 if(number===1){heads=['Оборудование',...['1 смена','2 смены','3 смены'].flatMap(x=>[x+' · номинал, ч','Потери, %','Действительный фонд, ч'])];rows=r.equipment.map(q=>row([td(esc(q.name)),...q.shifts.flatMap((sh,i)=>[td(num(r.calendar.hours*(i+1)),'num'),td(num(q.losses[i]),'num'),td(num(sh.fund),'num')])]));}
 if(number===2){heads=['Оборудование','Изделие','ДСЕ / операция','Кол-во на изделие','Часов на деталь','Часов на изделие','Программа, шт.','Всего, ст-ч'];rows=r.details.map(d=>row([td(esc(r.equipment.find(q=>q.id===d.equipment)?.name)),td(esc(d.product_name)),td(esc(d.node)+' / '+esc(d.operation)),td(num(d.qty),'num'),td(num(d.minutes==null?null:d.minutes/60),'num'),td(num(d.unit),'num'),td(num(d.plan),'num'),td(num(d.demand),'num')]));rows.push(...r.equipment.map(q=>row([td('<b>'+esc(q.name)+' · всего</b>'),...Array(6).fill(td('')),td('<b>'+num(q.demand)+'</b>','num')])));}
 if(number===3){heads=['Оборудование','Кол-во','Трудоёмкость, ст-ч',...[1,2,3].flatMap(s=>[s+' см. · фонд 1 ед.', 'Фонд всего','Кз','Расчётное','Принятое','Баланс'])];rows=r.equipment.map(q=>row([td(esc(q.name)),td(num(q.count),'num'),td(num(q.demand),'num'),...q.shifts.flatMap(sh=>[td(num(sh.fund),'num'),td(num(sh.total),'num'),td(num(sh.load),'num '+(sh.load>1?'over':'')),td(num(sh.need),'num'),td(num(sh.accepted),'num'),td(num(sh.balance),'num '+(sh.balance<0?'over':''))])]));}
 if(number===4){heads=['Изделие','Программа, шт.',...[1,2,3].flatMap(s=>[s+' смена · Кз max','Мощность, шт.','Узкое место'])];rows=r.products.map(p=>row([td(esc(p.name)),td(num(p.plan),'num'),...p.shifts.flatMap(sh=>[td(num(sh.load),'num'),td(num(sh.capacity),'num'),td(esc(sh.bottleneck||'Не определено'))])]));html+='<div class="note">Мощность = программа / максимальный Кз × допустимый коэффициент. Расчёт сохраняет соотношение изделий общей программы, использующей парк. Это не независимая максимальная мощность каждого изделия.</div>';}
 html+=panel(tabs[tab],settings()+table(heads,rows,'report'),btn('↓ Скачать Excel по образцу','export:'+number,'primary'));
 html+='<p class="sub">Настройки исходных данных: '+(number===1?'потери по каждому оборудованию — в разделе «Парк оборудования».':number===2?'программа, состав и нормы — в разделе «Состав и нормы».':'фонд и нормы поступают из таблиц 1–2 автоматически.')+'</p>';
 }
 html+=`<footer>${esc(r.calendar.source)} · Машинное время не приравнивается к трудоёмкости персонала.</footer>`;
 }
 $('#content').innerHTML=html;
 }catch(e){notify(e.message,true);$('#content').innerHTML=panel('Расчёт недоступен',`<div class="body">${esc(e.message)}<br><br>${btn('Настроить календарь','tab:calendar')} ${btn('Проверить данные','tab:structure')}</div>`)}
}
function selection(){ $('#enterprise').innerHTML=enterprises.map(e=>`<option value="${e.id}" ${e.id===current?.id?'selected':''}>${esc(e.name)}</option>`).join('') }
async function action(a){try{
 let [cmd,arg]=a.split(':');let p=current?.products.find(p=>p.id===productId),n=p?.nodes.find(n=>n.id===nodeId);
 if(cmd==='tab'){tab=arg;await render();return}
 if(cmd==='node'){nodeId=arg;await render();return}
 if(cmd==='newEnterprise'){if(dirty)await save();let name=prompt('Название предприятия');if(!name)return;current=await api('/api/enterprises',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});enterprises.push(current);selection();tab='equipment';}
 else if(cmd==='addEq'){current.equipment.push({id:uid(),name:'Новое оборудование',count:1,category:0,losses:[...catalog[0].losses]});mutate()}
 else if(cmd==='delEq'){let eq=current.equipment[arg];if(current.products.some(p=>p.nodes.some(n=>n.operations.some(o=>o.equipment===eq.id||o.alternatives.includes(eq.id)))))throw Error('Оборудование используется в операциях или альтернативах. Сначала измените операции.');if(!confirm('Удалить оборудование?'))return;current.equipment.splice(arg,1);mutate()}
 else if(cmd==='addProduct'){let name=prompt('Обозначение / название изделия');if(!name)return;let p={id:uid(),name,plans:{},nodes:[]};current.products.push(p);productId=p.id;mutate()}
 else if(cmd==='delProduct'){if(!confirm('Удалить изделие со всеми ДСЕ и операциями?'))return;current.products.splice(arg,1);mutate()}
 else if(cmd==='addNode'){let x={id:uid(),code:'',name:'Новая ДСЕ',parent:arg==='root'?null:arg,qty:1,operations:[]};p.nodes.push(x);nodeId=x.id;mutate()}
 else if(cmd==='delNode'){if(p.nodes.some(x=>x.parent===n.id))throw Error('Сначала удалите дочерние ДСЕ');if(!confirm('Удалить ДСЕ и её операции?'))return;p.nodes.splice(arg,1);mutate()}
 else if(cmd==='addOp'){if(!current.equipment.length)throw Error('Сначала добавьте оборудование в парк');n.operations.push({number:String((n.operations.length+1)*5).padStart(3,'0'),name:'Операция',equipment:current.equipment[0].id,minutes:null,alternatives:[]});mutate()}
 else if(cmd==='delOp'){n.operations.splice(arg,1);mutate()}
 else if(cmd==='recalc'){await save()}
 else if(cmd==='saveCalendar'){let data={year:Number($('#year').value),source:$('#calSource').value};for(let f of ['holidays','working','shortened'])data[f]=$('#cal_'+f).value.split(/[\s,;]+/).filter(Boolean);let c=await api('/api/calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});notify(`Календарь сохранён: ${c.days} рабочих дней, ${c.hours} часов`)}
 else if(cmd==='export'){await compute();if(result.issues.length)throw Error('Заполните отсутствующие данные перед экспортом');const response=await fetch(`/api/export/${current.id}/${arg}?${params()}`);if(!response.ok)throw Error((await response.json()).detail);let url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`Таблица${arg}_${period()}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return}
 await render();
 }catch(e){notify(e.message,true)}}
document.addEventListener('click',e=>{let el=e.target.closest('[data-action]');if(el)action(el.dataset.action)});
document.addEventListener('change',e=>{let el=e.target;
 if(el.dataset.path||el.dataset.alternatives){let path=(el.dataset.path||el.dataset.alternatives).split('.'),o=current;for(let k of path.slice(0,-1))o=o[k];let v=el.dataset.alternatives?[...el.selectedOptions].map(x=>x.value):el.type==='number'?(el.value===''?null:Number(el.value)):el.value;const key=path.at(-1);if(v===null&&path.includes('plans'))delete o[key];else o[key]=v;mutate();}
 if(el.dataset.category){let q=current.equipment[Number(el.dataset.category)],k=Number(el.value);q.category=k;q.losses=[...catalog[k].losses];mutate();render()}
 if(el.id==='product'){productId=el.value;render()}
});
$('#save').onclick=()=>save().catch(e=>notify(e.message,true));$('#newEnterprise').onclick=()=>action('newEnterprise');
$('#enterprise').onchange=async e=>{try{if(dirty)await save();current=enterprises.find(x=>x.id===e.target.value);selection();render()}catch(err){notify(err.message,true);selection()}};
$('#year').onchange=()=>render();$('#month').onchange=()=>render();
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
(async()=>{for(let m=1;m<=12;m++)$('#month').add(new Option(new Date(2026,m-1,1).toLocaleString('ru',{month:'long'}),m));[enterprises,catalog]=await Promise.all([api('/api/enterprises'),api('/api/catalog')]);current=enterprises[0];selection();await render()})().catch(e=>notify(e.message,true));
