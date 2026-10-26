let monitorData, monitorScenario=null, monitorTransfers=[], monitorShift=1, monitorFilter='', monitorPeriod='', transferSource=0, transferTarget='', transferSuggestion=null, monitorRequest=0;
const monitorBody=()=>({year:Number($('#year').value),month:Number($('#month').value),shift:monitorShift,transfers:monitorTransfers});
const monitorOptions=()=>`${params()}&shift=${monitorShift}`;
function equipmentRows(data){
 return table(['Предприятие / оборудование','Группа','Кол-во','Потребность, ст-ч','Фонд, ст-ч','Загрузка','Резерв до норматива, ст-ч','Дефицит до норматива, ст-ч'],data.rows.filter(r=>!monitorFilter||r.enterprise===monitorFilter).map(r=>row([td(`<b>${esc(r.enterprise_name)}</b><br>${esc(r.name)}`),td(esc(r.group||'Не подтверждена')),td(num(r.count),'num'),td(num(r.demand),'num'),td(num(r.fund),'num'),td(r.load==null?'Не определена':num(r.load*100)+' %','num '+(r.excess>0?'over':'ok')),td(num(r.free),'num'),td(num(r.excess),'num '+(r.excess>0?'over':''))])));
}
function transferEditor(){
 const ops=monitorData.operations.filter(o=>o.group&&o.quantity>0);
 if(!ops.length)return '<div class="body muted">Для оценки переноса заполните программу и нормы и укажите одинаковый код совместимости на оборудовании двух предприятий.</div>';
 if(transferSource>=ops.length)transferSource=0;
 const op=ops[transferSource];
 const effectiveRows=monitorScenario?.after?.rows||monitorData.rows;
 const alreadyMoved=(monitorScenario?.lines||[]).filter(t=>t.source.enterprise===op.enterprise&&t.source.product===op.product&&t.source.node===op.node&&t.source.operation_index===op.operation_index).reduce((s,t)=>s+t.quantity,0);
 const dests=effectiveRows.filter(r=>r.enterprise!==op.enterprise&&r.group===op.group&&r.demand!=null);
 if(!dests.some(r=>r.enterprise+'|'+r.equipment===transferTarget))transferTarget=dests.length?dests[0].enterprise+'|'+dests[0].equipment:'';
 return `<div class="body"><div class="form"><label>Операция-источник<select id="transferSource">${ops.map((o,i)=>`<option value="${i}" ${i===transferSource?'selected':''}>${esc(o.enterprise_name+' · '+o.product_name+' · '+o.node_name+' · '+o.operation)}</option>`).join('')}</select></label><label>Получатель / оборудование<select id="transferTarget">${dests.map(r=>{const key=r.enterprise+'|'+r.equipment;return `<option value="${esc(key)}" ${key===transferTarget?'selected':''}>${esc(r.enterprise_name+' · '+r.name)} · резерв ${num(r.free)} ч с учётом сценария</option>`}).join('')}</select></label><label>Количество ДСЕ к переносу<input id="transferQty" type="number" min="0.000001" step="any" value="${transferSuggestion??1}"></label><label>Норма получателя, станко-мин/ДСЕ<input id="recipientMinutes" type="number" min="0.000001" step="any" value="${op.minutes}"></label><div class="body sub">В программе: ${num(op.quantity)} ДСЕ.<br>Осталось у источника: ${num(op.quantity-alreadyMoved)} ДСЕ.<br>Норма источника: ${num(op.minutes)} мин.<br>Группа: ${esc(op.group)}</div></div><p class="sub">Переносится выбранная операция, а не автоматически весь маршрут детали. Подтвердите норму на станке получателя. Предложенная норма равна исходной и является допущением.</p>${btn('Добавить в сценарий и оценить','addTransfer','primary')}</div>`;
}
function monitorSummary(r){
 const s=r.summary;
 return `<div class="cards">${[['Общая загрузка',s.load==null?'Не определена':num(s.load*100)+' %','суммарная потребность / суммарный фонд'],['Резерв до норматива',num(s.free),'ст-ч · сумма местных резервов'],['Дефицит до норматива',num(s.excess),'ст-ч · сумма местных дефицитов'],['Полнота данных',r.coverage.complete+' / '+r.coverage.total,'предприятий за выбранный период']].map(([a,b,c])=>`<div class="card"><small>${a}</small><strong>${b}</strong><small>${c}</small></div>`).join('')}</div>`;
}
async function renderMonitoring(){
 const requestNumber=++monitorRequest;
 if(dirty)await save();
 const context=period()+'|'+monitorShift;
 if(monitorPeriod!==context){monitorTransfers=[];monitorScenario=null;transferSuggestion=null;monitorPeriod=context}
 const fresh=await api('/api/monitoring?'+monitorOptions());
 if(requestNumber!==monitorRequest||tab!=='monitoring')return;
 monitorData=fresh;
 if(monitorTransfers.length){monitorScenario=await api('/api/monitoring/scenario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(monitorBody())});monitorData=monitorScenario.before}
 if(requestNumber!==monitorRequest||tab!=='monitoring')return;
 $('#crumb').textContent='Все предприятия · единый расчётный период';
 let html=`<div class="toolbar"><span class="tag">${esc(monitorData.period)}</span><label>Сменность<select id="monitorShift">${[1,2,3].map(s=>`<option value="${s}" ${s===monitorShift?'selected':''}>${s} смен.</option>`).join('')}</select></label><label>Таблица предприятий<select id="monitorFilter"><option value="">Все предприятия</option>${monitorData.enterprises.map(p=>`<option value="${p.id}" ${monitorFilter===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>${btn('Обновить данные','monitorRefresh')}${btn('↓ Общая таблица Excel','exportMonitoring','primary')}</div>`;
 html+=monitorSummary(monitorData);
 html+='<div class="note">Резерв и дефицит рассчитаны относительно допустимого коэффициента каждого предприятия (по умолчанию 0,95). Местные дефициты не погашаются резервом другого завода автоматически. Данные берутся из общей базы этого приложения; копии EXE на разных компьютерах автоматически не обмениваются данными.</div>';
 let problems=monitorData.enterprises.filter(p=>p.issues.length);
 if(problems.length)html+=`<div class="note error">Неполные данные — свободная мощность этих предприятий не подтверждена:<br>${problems.map(p=>'<b>'+esc(p.name)+'</b>: '+p.issues.map(esc).join('; ')).join('<br>')}</div>`;
 html+=panel('Общая таблица загрузки',equipmentRows(monitorData));
 html+=panel('По предприятиям',table(['Предприятие','Статус','Потребность, ст-ч','Фонд, ст-ч','Загрузка','Резерв до норматива','Дефицит до норматива'],monitorData.enterprises.map(p=>row([td(esc(p.name)),td(p.status==='CALCULATED'?'Рассчитано':'Неполные данные'),td(num(p.demand),'num'),td(num(p.fund),'num'),td(p.load==null?'—':num(p.load*100)+' %','num'),td(num(p.free),'num'),td(num(p.excess),'num')]))));
 html+=panel('Сопоставимые группы оборудования',table(['Подтверждённая группа','Предприятий','Потребность, ст-ч','Фонд, ст-ч','Загрузка','Местный резерв','Местный дефицит'],monitorData.groups.map(g=>row([td(esc(g.name)),td(num(g.enterprises),'num'),td(num(g.demand),'num'),td(num(g.fund),'num'),td(g.load==null?'—':num(g.load*100)+' %','num'),td(num(g.free),'num'),td(num(g.excess),'num')]))));
 html+=panel('Варианты разгрузки',`<div class="body sub">Независимые варианты, их объёмы нельзя складывать: несколько предложений могут использовать один резерв. Для совместной проверки добавьте выбранные варианты в сценарий. Здесь нормы получателя предварительно приняты равными исходным.</div>`+table(['Откуда / операция','Куда / оборудование','До, ДСЕ','До, ст-ч',''],monitorData.candidates.map((c,i)=>row([td(esc(c.source.enterprise_name)+'<br>'+esc(c.source.product_name+' / '+c.source.node_name+' / '+c.source.operation)),td(esc(c.target_name)+'<br>'+esc(c.target_equipment_name)),td(num(c.quantity),'num'),td(num(c.hours),'num'),td(btn('Выбрать','pickTransfer:'+i))]))));
 html+=panel('Сценарий переноса · исходные программы сохраняются',transferEditor());
 if(monitorTransfers.length&&monitorScenario){
 const sc=monitorScenario;
 html+=panel('Строки сценария',table(['Откуда','Операция / ДСЕ','Куда','Количество ДСЕ','Норма получателя, мин','Снято / добавлено, ст-ч',''],sc.lines.map((t,i)=>row([td(esc(t.source.enterprise_name)),td(esc(t.source.node_name+' / '+t.source.operation)),td(esc(t.target_name)),td(num(t.quantity),'num'),td(num(t.recipient_minutes),'num'),td(num(t.removed)+' / '+num(t.added),'num'),td(btn('Убрать','removeTransfer:'+i,'danger'))]))),btn('Сбросить сценарий','resetTransfers'));
 html+=panel('Результат до / после',table(['Показатель','До','После'],[['Локальный дефицит до норматива, ст-ч',sc.before.summary.excess,sc.after.summary.excess],['Локальный резерв до норматива, ст-ч',sc.before.summary.free,sc.after.summary.free],['Потребность, ст-ч',sc.before.summary.demand,sc.after.summary.demand]].map(a=>row([td(a[0]),td(num(a[1]),'num'),td(num(a[2]),'num')]))));
 html+=panel('Оборудование после переноса',equipmentRows(sc.after));
 html+='<div class="note">'+esc(sc.note)+' Черновик сценария хранится в текущей сессии; для сохранения результата выгрузите общую таблицу Excel.</div>';
 }
 $('#content').innerHTML=html;
}
async function checkTransfers(next){
 const context=period()+'|'+monitorShift;
 const body={...monitorBody(),transfers:next};
 const evaluated=await api('/api/monitoring/scenario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(context!==period()+'|'+monitorShift)throw Error('Период изменён. Повторите оценку для выбранного периода.');
 monitorTransfers=next;monitorScenario=evaluated;
}
async function monitoringAction(cmd,arg){
 if(cmd==='monitorRefresh'){await render();return true}
 if(cmd==='pickTransfer'){
  const c=monitorData.candidates[Number(arg)],ops=monitorData.operations.filter(o=>o.group&&o.quantity>0);
  transferSource=ops.findIndex(o=>o.enterprise===c.source.enterprise&&o.product===c.source.product&&o.node===c.source.node&&o.operation_index===c.source.operation_index);
  transferTarget=c.target_enterprise+'|'+c.target_equipment;transferSuggestion=c.quantity;await render();$('#transferQty')?.scrollIntoView({block:'center'});return true;
 }
 if(cmd==='addTransfer'){
  const op=monitorData.operations.filter(o=>o.group&&o.quantity>0)[Number($('#transferSource').value)];
  if(!op||!$('#transferTarget').value)throw Error('Нет совместимого оборудования другого предприятия с подтверждённой загрузкой');
  const [target_enterprise,target_equipment]=$('#transferTarget').value.split('|');
  await checkTransfers([...monitorTransfers,{enterprise:op.enterprise,product:op.product,node:op.node,operation_index:op.operation_index,target_enterprise,target_equipment,quantity:Number($('#transferQty').value),recipient_minutes:Number($('#recipientMinutes').value)}]);
  transferSuggestion=null;notify('Сценарий рассчитан. Производственные программы не изменены.');await render();return true;
 }
 if(cmd==='removeTransfer'){await checkTransfers(monitorTransfers.filter((_,i)=>i!==Number(arg)));await render();return true}
 if(cmd==='resetTransfers'){monitorTransfers=[];monitorScenario=null;await render();return true}
 if(cmd==='exportMonitoring'){
  if(dirty)await save();
  const res=await fetch('/api/monitoring/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(monitorBody())});
  if(!res.ok)throw Error((await res.json()).detail);
  const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download=`Мониторинг_${period()}_${monitorShift}см.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
 }
 return false;
}
document.addEventListener('change',async e=>{
 try{
  if(e.target.id==='monitorShift'){monitorShift=Number(e.target.value);await render()}
  if(e.target.id==='monitorFilter'){monitorFilter=e.target.value;await render()}
  if(e.target.id==='transferSource'){transferSource=Number(e.target.value);transferSuggestion=null;await render()}
  if(e.target.id==='transferTarget')transferTarget=e.target.value;
 }catch(err){notify(err.message,true)}
});
