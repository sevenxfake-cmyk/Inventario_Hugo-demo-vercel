/* Unified administrator history. Worker deliveries expand without splitting a shipment. */
window.InventoryHistory=(()=>{
  const $=id=>document.getElementById(id),panel=$('historyWindow'),host=$('historyBody');
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  const button=(text,action,cls='text-button')=>{const el=node('button',text,cls);el.type='button';el.onclick=action;return el;};
  let role='admin',runId='',runTitle='',offset=0,next=null,lastKey='',request=0,debounce=null;
  const tones=new Set(['count','new','unknown','removal','edit','structure']);
  const toneClass=value=>'history-tone-'+(tones.has(value)?value:'count');
  const number=value=>new Intl.NumberFormat('es-PE',{maximumFractionDigits:8}).format(value);
  function query(){return new URLSearchParams({role,runId,action:$('historyAction').value,q:$('historySearch').value,from:$('historyFrom').value,to:$('historyTo').value,offset:String(offset)});}
  function syncTabs(){
    $('historyFilterActive').classList.toggle('hidden',!$('historyAction').value);
    $('historyFilterToggle').title=$('historyAction').value||'Filtrar por tipo de cambio';
    $('historyAdminTab').setAttribute('aria-pressed',String(role==='admin'));
    $('historyWorkerTab').setAttribute('aria-pressed',String(role==='worker'));
    $('historyHelp').textContent=role==='admin'?'Cambios del administrador: correcciones, aprobaciones, retiros y estructura.':'Cada entrega reúne los productos enviados por el trabajador. Abre una fila para ver qué hizo en ese almacén y estante.';
    $('historyScope').classList.toggle('hidden',!runId);$('historyScope').querySelector('span').textContent=runTitle||'Inventario seleccionado';
  }
  function facts(item){
    const before=item.before||{},after=item.after||{},box=node('div',undefined,'history-item-facts');
    function fact(label,key,format=v=>String(v)){
      const old=before[key],value=after[key];if(old==null&&value==null)return;
      const content=old!=null&&value!=null&&old!==value?format(old)+' → '+format(value):value!=null?format(value):format(old);
      box.append(node('span',label+': '+content));
    }
    fact(item.measure||'Cantidad','quantity',number);fact('Nivel','level');fact('Posición','sortOrder',v=>String(v+1));
    if(after.beforeCount!=null&&after.afterCount!=null)box.append(node('span','Saldo sin ubicar: '+number(after.beforeCount)+' → '+number(after.afterCount)));
    return box;
  }
  function itemCard(item,entry){
    const card=node('article',undefined,'history-item '+toneClass(item.tone));
    const product=state.products.find(p=>p.id===item.productId),photo=product&&productPhoto(product);
    if(photo)card.append(photo);
    const info=node('div',undefined,'history-item-info');info.append(node('span',item.label,'history-action-tag'),node('strong',item.name||'Cambio de inventario'));
    if(item.sku)info.append(node('small',item.sku));
    info.append(facts(item));
    if(item.location&&item.location!==entry.location)info.append(node('small',item.location));
    const reason=item.after?.retirementReason||item.reason;if(reason&&reason!==entry.reason)info.append(node('p',reason,'history-item-reason'));
    card.append(info);return card;
  }
  async function loadDetails(card,record,body){
    if(body.dataset.loaded)return;body.dataset.loaded='loading';body.replaceChildren(node('p','Cargando detalle…','history-help'));
    const user=state.user?.id,selectedRole=role;
    try{
      const data=await api('/api/activity?'+new URLSearchParams({role:selectedRole,detail:record.id}));
      if(!card.isConnected||state.user?.id!==user)return;
      body.replaceChildren();const entry=data.entry;
      if(entry.reason)body.append(node('p',entry.reason,'history-detail-note'));
      if(entry.kind==='delivery')body.append(node('p','Datos recibidos en esta entrega; las revisiones posteriores figuran en su propio historial.','history-detail-note'));
      const items=node('div',undefined,'history-detail-items');body.append(items);
      let shown=0;const more=button('Ver más productos',append,'ghost-button');
      function append(){const end=Math.min(shown+30,entry.items.length);for(;shown<end;shown++)items.append(itemCard(entry.items[shown],entry));more.textContent='Ver más productos ('+shown+' de '+entry.items.length+')';more.classList.toggle('hidden',shown===entry.items.length);}
      append();if(entry.items.length)body.append(more);
      if(!entry.items.length&&!entry.reason)body.append(node('p',entry.title+(entry.runTitle?' · '+entry.runTitle:''),'history-detail-note'));
      const original=entry.legacyId&&state.history.find(e=>e.id===entry.legacyId);
      if(original&&['Entrada','Salida'].includes(original.type)&&state.products.some(p=>p.id===original.productId))body.append(button('Corregir movimiento',()=>openMovementCorrection(original),'ghost-button'));
      body.dataset.loaded='ready';
    }catch(error){if(!card.isConnected)return;body.dataset.loaded='';body.replaceChildren(node('p',error.message,'form-error'),button('Reintentar',()=>loadDetails(card,record,body)));}
  }
  function summaryCard(record){
    const card=node('details',undefined,'history-entry '+toneClass(record.tone));card.dataset.historyId=record.id;
    const summary=node('summary'),main=node('div',undefined,'history-entry-main');
    main.append(node('span',record.title,'history-action-tag'),node('strong',(record.kind==='delivery'?record.location:record.preview)||record.location||record.runTitle||record.title));
    if(record.kind!=='delivery'&&record.location)main.append(node('small',record.location));
    if(record.runTitle)main.append(node('small',record.runTitle));
    const who=node('div',undefined,'history-entry-who');who.append(node('strong',record.workerName||'Responsable no registrado'),node('time',formatDateTime(record.date)));
    const totals=node('div',undefined,'history-entry-totals');
    if(record.totals){
      totals.append(node('strong',record.totals.products+' '+(record.totals.products===1?'producto':'productos')+' · '+number(record.totals.units)+' '+(record.totals.units===1?'unidad':'unidades')));
      const badges=node('div',undefined,'history-breakdown');
      for(const [key,label,tone] of [['new','del catálogo','new'],['unknown','fuera del catálogo','unknown'],['retirements',record.totals.retirements===1?'retiro solicitado':'retiros solicitados','removal']])if(record.totals[key])badges.append(node('span',record.totals[key]+' '+label,'history-action-tag '+toneClass(tone)));
      totals.append(badges);
    }else if(record.itemCount>1)totals.append(node('span',record.itemCount+' productos'));
    const toggle=node('span','Ver detalle','history-detail-toggle');summary.append(main,who,totals,toggle);
    const body=node('div',undefined,'history-entry-detail');card.append(summary,body);
    card.ontoggle=()=>{toggle.textContent=card.open?'Ocultar detalle':'Ver detalle';if(card.open)loadDetails(card,record,body);};
    return card;
  }
  async function refresh(force=false){
    if(panel.classList.contains('hidden')||state.user?.role!=='admin')return;
    syncTabs();const params=query(),user=state.user.id,key=user+'/'+state.version+'/'+(state.restoreEpoch||'')+'/'+params;
    if(!force&&lastKey===key)return;lastKey=key;const current=++request;
    const expanded=new Set([...host.querySelectorAll('details[open]')].map(e=>e.dataset.historyId));
    $('historyError').classList.add('hidden');host.setAttribute('aria-busy','true');
    try{
      const data=await api('/api/activity?'+params);
      if(current!==request||state.user?.id!==user||panel.classList.contains('hidden'))return;
      if(offset&&offset>=data.matched){offset=0;return refresh(true);}
      const action=$('historyAction').value,actions=data.actions||[];
      $('historyAction').replaceChildren(new Option('Todos los cambios',''),...actions.map(value=>new Option(value,value)));
      if(action&&!actions.includes(action))$('historyAction').append(new Option(action,action));
      $('historyAction').value=action;
      host.replaceChildren(...data.records.map(summaryCard));
      for(const card of host.children)if(expanded.has(card.dataset.historyId))card.open=true;
      next=data.nextOffset;$('historyTotal').textContent=data.matched+' de '+data.total+' registros';
      $('historyAverage').textContent='Fecha y hora de Lima · '+(role==='worker'?'Entregas y actividad de trabajadores':'Acciones del administrador');
      $('historyEmpty').classList.toggle('hidden',data.records.length>0);$('historyEmpty').textContent='No hay registros para esta búsqueda.';
      $('historyPrevious').disabled=offset===0;$('historyNext').disabled=next===null;
      $('historyPage').textContent='Página '+(Math.floor(offset/20)+1)+' de '+Math.max(1,Math.ceil(data.matched/20));
    }catch(error){if(current!==request)return;lastKey='';host.replaceChildren();$('historyEmpty').classList.add('hidden');showError($('historyError'),error.message);}
    finally{if(current===request)host.removeAttribute('aria-busy');}
  }
  function reset(){offset=0;refresh(true);}
  function open(options={}){
    role=options.role==='worker'?'worker':'admin';runId=options.runId||'';runTitle=options.runTitle||'';offset=0;lastKey='';
    if(options.role){$('historySearch').value='';$('historyFrom').value='';$('historyTo').value='';$('historyAction').value='';}
    openWindow(panel);refresh(true);
  }
  $('historyAdminTab').onclick=()=>{role='admin';$('historyAction').value='';reset();};$('historyWorkerTab').onclick=()=>{role='worker';$('historyAction').value='';reset();};
  $('historyAllRuns').onclick=()=>{runId='';runTitle='';reset();};
  $('historySearch').addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(reset,220);});
  function closeFilter(){ $('historyFilterPopover').classList.add('hidden');$('historyFilterToggle').setAttribute('aria-expanded','false'); }
  $('historyFilterToggle').onclick=()=>{const opened=$('historyFilterPopover').classList.toggle('hidden')===false;$('historyFilterToggle').setAttribute('aria-expanded',String(opened));if(opened)$('historyAction').focus();};
  $('historyAction').addEventListener('change',()=>{closeFilter();$('historyFilterToggle').focus();reset();});
  document.addEventListener('click',event=>{if(!event.target.closest('.history-filter-control'))closeFilter();});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('historyFilterPopover').classList.contains('hidden')){event.preventDefault();event.stopPropagation();closeFilter();$('historyFilterToggle').focus();}});
  for(const id of ['historyFrom','historyTo'])$(id).addEventListener('change',reset);
  $('historyPrevious').onclick=()=>{offset=Math.max(0,offset-20);refresh(true);};
  $('historyNext').onclick=()=>{if(next!==null){offset=next;refresh(true);}};
  $('historyRefresh').onclick=()=>refresh(true);
  new MutationObserver(()=>{if(panel.classList.contains('hidden')){closeFilter();request++;lastKey='';clearTimeout(debounce);host.replaceChildren();}}).observe(panel,{attributes:true,attributeFilter:['class']});
  return {open,refresh};
})();
