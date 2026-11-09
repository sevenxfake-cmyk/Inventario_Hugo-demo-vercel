/* Release 2: durable counts, voice search and monthly review. */
let releaseOnline = true;
let syncRunning = null;
let pendingEntries = [];
let replacingPendingId = null;
let activeReview = null;
let reviewLimit = 20;
let voiceToken = null;
let backgroundReady=false, backgroundOwner=null;
const periodLabels = {open:'En conteo',review:'En revisión',closed:'Cerrado'};
const $r = id => document.getElementById(id);
function makeNode(tag, text, className='',tone) { const el=document.createElement(tag); el.textContent=text; el.className=className;if(tone&&tag==='button')el.dataset.actionTone=tone;return el; }
function periodFor(month) { return state.periods?.find(p=>p.month===month) || {month,status:'open',revision:0}; }

// A foreground warning, not an Android notification or a VPN diagnosis.
class SyncStallWatch {
  constructor(){this.reset();}
  reset(owner=null){this.owner=owner;this.failures=0;this.since=null;this.dismissed=false;this.visible=false;}
  sample({owner,entries,network,failed=false,progress=false,now=performance.now()}){
    if(this.owner!==owner)this.reset(owner);
    const eligible=entries.filter(e=>e.workerId===owner&&e.status==='pending'&&!e.waitingForResume);
    if(!owner||!eligible.length||!network||progress){this.reset(owner);return false;}
    if(failed){if(this.since===null)this.since=now;this.failures++;}
    // A cycle can end without sending anything (for example while Android's
    // background sender owns the queue). That does not mean delivery recovered.
    this.visible=!this.dismissed&&this.failures>=3&&now-this.since>=60000;
    return this.visible;
  }
  dismiss(){this.dismissed=true;this.visible=false;}
}
const syncStallWatch=new SyncStallWatch();
const syncStallNotice=document.createElement('section');
syncStallNotice.id='syncStallNotice';syncStallNotice.className='sync-stall-notice hidden';
syncStallNotice.setAttribute('role','status');syncStallNotice.setAttribute('aria-live','polite');
syncStallNotice.innerHTML='<strong>El envío a la PC no está avanzando.</strong><p>Tus conteos están guardados; puedes seguir contando. Comprueba que la PC esté encendida y revisa Tailscale.</p><div><a id="syncStallTailscale" class="ghost-button" href="inventory://tailscale">Abrir Tailscale</a><button id="syncStallRetry" class="primary-button" type="button">Reintentar</button><button id="syncStallDismiss" class="ghost-button" type="button">Cerrar aviso</button></div>';
$r('syncBanner').after(syncStallNotice);
$r('syncStallTailscale').classList.toggle('hidden',!InventoryOffline.native);
$r('syncStallDismiss').onclick=()=>{syncStallWatch.dismiss();syncStallNotice.classList.add('hidden');};
$r('syncStallRetry').onclick=async()=>{
  const button=$r('syncStallRetry');button.disabled=true;button.textContent='Reintentando…';
  try{await syncCounts();}catch{toast('No se pudo completar el envío. Tus conteos siguen guardados.',true);}
  finally{button.disabled=false;button.textContent='Reintentar';}
};
async function observeSyncAttempt(owner,before,outcome){
  if(state.user?.id!==owner){syncStallWatch.reset();syncStallNotice.classList.add('hidden');return;}
  const entries=(await InventoryOffline.list()).filter(e=>e.workerId===owner);
  let network=navigator.onLine;
  if(InventoryOffline.networkAvailable)try{network=await InventoryOffline.networkAvailable();}catch{network=false;}
  const after=new Map(entries.map(e=>[e.id,e]));
  const progress=outcome.progress||before.some(e=>e.status==='pending'&&(!after.has(e.id)||Object.keys(after.get(e.id).photoRefs||{}).length>Object.keys(e.photoRefs||{}).length));
  const visible=syncStallWatch.sample({owner,entries,network,failed:outcome.failed,progress});
  console.info('InventorySyncWatch '+JSON.stringify({eligible:entries.filter(e=>e.status==='pending'&&!e.waitingForResume).length,network,failed:outcome.failed,progress,failures:syncStallWatch.failures,elapsed:syncStallWatch.since===null?0:Math.round(performance.now()-syncStallWatch.since),visible}));
  syncStallNotice.classList.toggle('hidden',!visible);
}

async function cacheInventory() {
  if (!state.user) return;
  if(InventoryOffline.native && (backgroundOwner!==state.user.id || !backgroundReady)) {
    try {await InventoryOffline.bind(state.user.id);backgroundOwner=state.user.id;backgroundReady=true;}
    catch(error){backgroundReady=false;}
  }
  const value={restoreEpoch:state.restoreEpoch??null,user:{...state.user},products:state.products,history:state.history.slice(0,300),counts:state.counts,inventoryMonths:state.inventoryMonths,locations:state.locations,locationCounts:state.locationCounts,locationActivity:state.locationActivity,locationWork:state.locationWork,recounts:state.recounts,periods:state.periods,closedComparisons:state.closedComparisons,currentMonth:state.currentMonth,workingMonth:state.workingMonth,savedAt:Date.now()};
  value.inventoryMonths=state.inventoryMonths||{};
  try { await InventoryOffline.snapshot(value); }
  catch(error) { toast(error.message,true); }
}
async function refreshPendingList() {
  const all=await InventoryOffline.list();
  pendingEntries=all.filter(entry=>entry.workerId===state.user?.id).sort((a,b)=>a.createdAt-b.createdAt);
  if(InventoryOffline.native && state.user)backgroundReady=await InventoryOffline.authorized(state.user.id);
  if(!pendingEntries.some(e=>e.status==='pending'&&!e.waitingForResume)||syncStallWatch.owner!==state.user?.id){syncStallWatch.reset(state.user?.id);syncStallNotice.classList.add('hidden');}
  renderReleaseStatus(); renderQueue();
  window.InventoryRuns?.refreshLocal();
}
function renderReleaseStatus() {
  if (!state.user) return;
  $r('workingMonthStatus').textContent=state.workingMonth?'Mes habilitado: '+monthLabel(state.workingMonth):'Sin mes habilitado para trabajadores';
  $r('pauseWorkingMonth').disabled=!state.workingMonth;
  const managementMonth=$r('managementMonth');
  if(managementMonth){managementMonth.value=state.month;managementMonth.max=state.currentMonth;}
  const conflicts=pendingEntries.filter(entry=>entry.status==='conflict').length;
  $r('syncStatus').textContent=`${releaseOnline?'Conectado':'Sin conexión · Conteo local'} · ${pendingEntries.length} pendientes${conflicts?' · '+conflicts+' por revisar':''}`;
  if(InventoryOffline.native)$r('syncStatus').textContent+=backgroundReady?' · Envío automático en segundo plano':' · Abre sesión con Internet para habilitar envío automático';
  $r('syncBanner').classList.toggle('is-offline',!releaseOnline);
  $r('periodStatus').textContent=periodLabels[periodFor(state.month).status];
  const month=isWorker()?state.workingMonth:($r('countMonth').value||state.month);
  $r('workerMonthStatus').textContent=month?`${monthLabel(month)} · ${periodLabels[periodFor(month).status]}`:'Esperando habilitación del administrador';
  const mine=(state.locationCounts||[]).filter(c=>c.workerId===state.user.id&&c.locationId===currentLocation()&&c.month===month).length;
  $r('workerProgress').textContent=currentLocation()?`${mine} productos sincronizados de tu cuenta en esta ubicación`:'Selecciona un estante o espacio para comenzar';
  renderWarehouses();renderWork();
}
function renderRelease() {
  renderWarehouses();
  const select=$r('workerLocation'), selected=select.value;
  const locations=[...new Set(state.products.map(p=>p.location).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  select.replaceChildren(new Option('Todas las ubicaciones',''),...locations.map(value=>new Option(value,value)));
  select.value=locations.includes(selected)?selected:'';
  $r('voiceSearch').classList.toggle('hidden', androidVersion < 5);
  $r('voiceMaster').classList.toggle('hidden', androidVersion < 5);
  renderReleaseStatus();
  refreshPendingList().catch(error=>toast(error.message,true));
}
async function saveDurableCount(payload) {
  if(isWorker()&&(!state.workingMonth||payload.month!==state.workingMonth))throw new Error('Sólo puedes contar el mes habilitado por el administrador.');
  if(!payload.locationId) throw new Error('Selecciona el almacén y el estante o espacio antes de guardar.');
  const work=locationWork(payload.locationId,payload.month);
  if(work.status==='complete')throw new Error('Reabre la ubicación antes de registrar otro conteo.');
  const recount=pendingRecounts(payload.month).find(r=>r.productId===payload.productId&&r.locationId===payload.locationId);
  if(recount)payload.recountId=recount.id;
  const user=state.user;
  const product=state.products.find(p=>p.id===payload.productId);
  await refreshPendingList();
  if (periodFor(payload.month).status!=='open') throw new Error('El mes está en revisión o cerrado. Solicita su reapertura.');
  if (pendingEntries.some(entry=>entry.payload.productId===payload.productId&&entry.payload.month===payload.month&&entry.payload.locationId===payload.locationId&&entry.id!==replacingPendingId)) throw new Error('Este producto ya tiene un conteo pendiente para ese mes. Revísalo en Ver pendientes.');
  const id=InventoryOffline.id();
  const entry={id,workerId:user.id,workerName:user.name,name:product.name,sku:product.sku,createdAt:Date.now(),status:'pending',payload:{...payload,restoreEpoch:state.restoreEpoch??null,operationId:id}};
  if (replacingPendingId) await InventoryOffline.replace(replacingPendingId,entry); else await InventoryOffline.put(entry);
  replacingPendingId=null;
  if (releaseOnline && navigator.onLine) await syncCounts(); else await refreshPendingList();
  const remaining=(await InventoryOffline.list()).find(value=>value.id===id);
  if (remaining?.status==='conflict') throw new Error(remaining.error+' El conteo sigue disponible en Ver pendientes.');
  return {product,pending:Boolean(remaining)};
}
async function syncCounts() {
  if (syncRunning) return syncRunning;
  if (!state.user) return;
  const owner=state.user.id;
  let before=[];const outcome={failed:false,progress:false,observed:false};
  syncRunning=(async()=>{
    before=(await InventoryOffline.list()).filter(e=>e.workerId===owner);
    // Recover requests rejected by older PC versions, once, without changing
    // their operation IDs or payloads (lost receipts remain safe to replay).
    for(const entry of await InventoryOffline.list()){
      if(entry.workerId===owner&&entry.runId&&entry.action==='retirement'&&entry.status==='conflict'&&!entry.retirementRetryVersion&&
        (entry.error==='Otra persona modificó este registro. Actualiza y revisa sus cambios antes de guardar.'||entry.error?.startsWith('Este espacio está siendo contado por '))){
        await InventoryOffline.put({...entry,status:'pending',error:'',retirementRetryVersion:1});
      }
    }
    if(InventoryOffline.native && backgroundReady){
      const report=await InventoryOffline.sync(owner);
      outcome.failed=report?.connectionFailure===true;outcome.progress=report?.progress===true;
      if(outcome.failed)releaseOnline=false;else if(outcome.progress)releaseOnline=true;
      await refreshPendingList();
      await observeSyncAttempt(owner,before,outcome);outcome.observed=true;
      // Evaluate the warning before other requests to an unreachable PC. Those
      // requests each have their own timeout and used to delay every attempt.
      if(outcome.failed||report?.retry===true)return;
      await window.InventoryRuns?.refreshRemote?.().catch(()=>{});
      if(state.user?.id===owner)await refreshState(true).catch(()=>{});
      return;
    }
    const entries=(await InventoryOffline.list()).filter(e=>e.workerId===owner&&e.status==='pending').sort((a,b)=>a.createdAt-b.createdAt);
    let saved=false;
    for (const entry of entries) {
      if (state.user?.id!==owner) break;
      try {
        if(entry.payload.evidenceImage||entry.payload.items?.some(item=>item.evidenceImage)){
          const health=await api('/api/health');
          if(health.findingPhotos!==1){const error='Actualiza el programa de PC para recibir las fotos. La entrega se conserva en este celular.';await InventoryOffline.updatePending({...entry,error});throw new Error(error);}
        }
        let payload=entry.payload;
        if(entry.action==='submit-space'&&entry.payload.items?.some(i=>i.evidenceImage)){
          const health=await api('/api/health');
          if(health.submissionPhotos===1){
            payload=structuredClone(entry.payload);
            for(const item of payload.items){if(!item.evidenceImage)continue;
              const digest=String(payload.items.indexOf(item));
              if(entry.photoRefs?.[digest]){item.evidenceImage=entry.photoRefs[digest];continue;}
              const uploaded=await api('/api/inventories/'+entry.runId+'/submission-photo','POST',{image:item.evidenceImage,locationId:payload.locationId,reservationToken:payload.reservationToken,restoreEpoch:payload.restoreEpoch??null,offlineReopen:payload.offlineReopen===true});
              if(!uploaded.photoRef?.startsWith('photo:'))throw new Error('La PC no confirmó una foto. Tu entrega se conserva.');
              entry.photoRefs={...entry.photoRefs,[digest]:uploaded.photoRef};await InventoryOffline.updatePending(entry);item.evidenceImage=uploaded.photoRef;
            }
          }else if(new TextEncoder().encode(JSON.stringify(payload)).length>5*1024*1024)throw new Error('Actualiza la PC para recibir entregas con muchas fotos. Los datos siguen guardados.');
        }
        const result=await api(entry.runId?'/api/inventories/'+entry.runId+'/'+(entry.action||'rows'):'/api/counts','POST',payload);
        if (!(['submit-space','arrange-space'].includes(entry.action) ? result?.submission?.operationId===entry.id : entry.runId ? result?.row?.id : result?.count?.productId)) {
          outcome.failed=true;throw new Error('El servidor no confirmó el registro. Se conserva pendiente para volver a intentarlo.');
        }
        await InventoryOffline.remove(entry.id); saved=true; releaseOnline=true;
        if(state.user?.id!==owner) break;
        if(entry.runId)continue;
        if(result.count.locationId){
          state.locationCounts=(state.locationCounts||[]).filter(c=>!(c.productId===result.count.productId&&c.month===result.count.month&&c.locationId===result.count.locationId));state.locationCounts.push(result.count);
        } else {
        state.counts=state.counts.filter(c=>!(c.productId===result.count.productId&&c.month===result.count.month));
        state.counts.push(result.count); countsByKey.set(`${result.count.month}/${result.count.productId}`,result.count);
        }
      } catch(error) {
        if(error.status===423){await InventoryOffline.updatePending({...entry,status:'pending',waitingForResume:true,error:error.message});continue;}
        if ([400,403,404,409].includes(error.status)) { await InventoryOffline.updatePending({...entry,status:'conflict',error:error.message}); continue; }
        if (error.network||error.status>=500){outcome.failed=true;releaseOnline=false;}
        break;
      }
    }
    if (saved&&state.user?.id===owner) await refreshState(true).catch(()=>{});
    if (saved&&state.user?.id===owner) await window.InventoryRuns?.refreshRemote?.();
    await refreshPendingList();
  })();
  try { await syncRunning; } finally {
    try{if(!outcome.observed)await observeSyncAttempt(owner,before,outcome);}catch{}
    syncRunning=null;
  }
}
function renderQueue() {
  const host=$r('syncItems'); host.replaceChildren();
  if (!pendingEntries.length) host.append(makeNode('p','No hay conteos pendientes de esta cuenta en este equipo.','muted-note'));
  pendingEntries.forEach(entry=>{
    const card=makeNode('article','','review-card');
    if(['submit-space','arrange-space'].includes(entry.action)){
      card.append(makeNode('strong',entry.name),makeNode('p',entry.payload.items.length+' productos · '+(entry.status==='draft'?'Borrador: entra al andamio y pulsa Terminar para enviar.':entry.error?entry.error:'Entrega confirmada · Pendiente de envío a la PC')));
      if(entry.status==='conflict'){const retry=makeNode('button','Reintentar entrega','ghost-button');retry.type='button';retry.onclick=async()=>{retry.disabled=true;try{await InventoryOffline.put({...entry,status:'pending',error:''});await syncCounts();await refreshPendingList();}catch(e){toast(e.message,true);}finally{retry.disabled=false;}};card.append(retry);}
      host.append(card);return;
    }
    card.append(makeNode('strong',entry.name),makeNode('p',entry.action==='retirement'?`Solicitud de retiro · ${locationName(entry.payload.locationId)} · ${entry.payload.reason}`:`${entry.sku} · ${locationName(entry.payload.locationId)} · ${monthLabel(entry.month||entry.payload.month)} · ${entry.payload.quantity} unidades`),makeNode('p',entry.status==='conflict'?entry.error:'Guardado en este equipo · Pendiente de envío',entry.status==='conflict'?'danger-text':'muted-note'));
    if(entry.status==='conflict') {
      const review=makeNode('button','Revisar y reemplazar','ghost-button','warning');review.type='button';
      review.onclick=async()=>{
        try {
          await refreshState(true);
          if(entry.runId){closeWindows();await InventoryRuns.show(entry.runId);toast('Revisa el registro en el inventario. El pendiente rechazado se conserva hasta que lo descartes.',true);return;}
          if(!state.products.some(p=>p.id===entry.payload.productId)) throw new Error('El producto fue eliminado. Conserva este pendiente como referencia o descártalo.');
          if(periodFor(entry.payload.month).status!=='open') throw new Error('El administrador debe reabrir el mes antes de reemplazar este pendiente.');
          if(isWorker()&&entry.payload.month!==state.workingMonth)throw new Error('El administrador debe habilitar el mes de este pendiente para revisarlo.');
          closeWindows();selectCountLocation(entry.payload.locationId||'');openMovement(entry.payload.productId);$r('countMonth').value=entry.payload.month;selectedCountKey='';syncCountForm();
          els.movementQty.value=entry.payload.quantity;updateMovementPreview();replacingPendingId=entry.id;
          toast('Revisa el conteo vigente, la cantidad y el motivo antes de guardar.');
        }catch(error){toast(error.message,true);}
      };card.append(review);
      const discard=makeNode('button','Descartar pendiente rechazado','text-button','danger');discard.type='button';
      discard.onclick=async()=>{if(confirm(`¿Descartar el conteo rechazado de ${entry.name}? No se registró en el servidor.`)){await InventoryOffline.remove(entry.id);await refreshPendingList();}};
      card.append(discard);
    }
    host.append(card);
  });
}
async function bootInventory() {
  if(!InventoryOffline.native){
    try{
      const health=await fetch('/api/health',{cache:'no-store'}).then(r=>r.json());
      if(health.resetToken&&localStorage.getItem('inventory-reset-token')!==health.resetToken){
        for(const entry of await InventoryOffline.list())await InventoryOffline.remove(entry.id);
        await InventoryOffline.clearSnapshot();
        localStorage.setItem('inventory-reset-token',health.resetToken);
      }
    }catch{}
  }
  try {
    const result=await api('/api/session');state.user=result.user;await refreshState(true);showApp();await syncCounts();
  } catch(error) {
    if(error.network) {
      try {
        const cached=await InventoryOffline.snapshot();
        if(cached?.user && Date.now()-cached.savedAt<7*24*60*60*1000) {
          state.inventoryMonths=cached.inventoryMonths||{};
          Object.assign(state,{restoreEpoch:cached.restoreEpoch??null,user:cached.user,products:cached.products,history:cached.history,counts:cached.counts,inventoryMonths:cached.inventoryMonths||{},locations:cached.locations||[],locationCounts:cached.locationCounts||[],locationActivity:cached.locationActivity||[],locationWork:cached.locationWork||[],recounts:cached.recounts||[],periods:cached.periods||[],currentMonth:cached.currentMonth,workingMonth:cached.workingMonth||'',month:cached.user.role==='worker'?(cached.workingMonth||cached.currentMonth):cached.currentMonth,version:-1});
          countsByKey=new Map(state.counts.map(c=>[`${c.month}/${c.productId}`,c]));releaseOnline=false;showApp();
          state.closedComparisons=cached.closedComparisons||{};frozenComparisons=new Map(Object.entries(state.closedComparisons).flatMap(([month,rows])=>rows.map(row=>[`${month}/${row.productId}`,row])));render();
          toast('Sin conexión: puedes guardar conteos en este equipo. Se enviarán al reconectar.');return;
        }
      } catch(storageError) { showError(els.loginError,storageError.message);return; }
      showError(els.loginError,'Conéctate e inicia sesión una vez para preparar el conteo sin conexión.');
    } else if(error.status!==401) showError(els.loginError,error.message);
  }
}

async function loadReview() {
  if(state.user?.role!=='admin')return;
  $r('reviewError').classList.add('hidden');$r('reviewSummary').textContent='Actualizando revisión…';
  try {activeReview=await api('/api/periods/review?month='+encodeURIComponent(state.month));reviewLimit=20;renderReview();}
  catch(error){activeReview=null;showError($r('reviewError'),error.message);$r('reviewSummary').textContent='No se pudo cargar la revisión.';}
}
function renderReview() {
  if(!activeReview)return;
  const review=activeReview,status=review.period.status;
  $r('reviewTitle').textContent=`Revisión · ${monthLabel(review.month)}`;
  $r('reviewSummary').textContent=`${periodLabels[status]} · ${review.counted}/${review.total} contados · ${review.missing} pendientes · ${review.unresolved} sin justificar · ${review.completedLocations||0}/42 ubicaciones terminadas · ${review.pendingRecounts||0} reconteos pendientes${status==='closed'?' · Informe congelado al cierre':''}`;
  $r('periodForm').classList.toggle('hidden',Boolean(review.archiveRevision));
  $r('advancePeriod').classList.toggle('hidden',status==='closed');$r('advancePeriod').textContent=status==='open'?'Pasar a revisión':'Aprobar y cerrar mes';
  $r('advancePeriod').disabled=status==='open' ? review.missing>0||!review.total||review.completedLocations!==42||review.pendingRecounts>0 : !review.canClose;
  $r('reopenPeriod').classList.toggle('hidden',status==='open');
  const query=$r('reviewSearch').value,filter=$r('reviewFilter').value;
  const rows=review.rows.filter(row=>matchesProduct(row,query)&&(filter==='all'||filter==='issues'&&row.priority>0||row.issue===filter));
  const host=$r('reviewCards');host.replaceChildren();
  rows.slice(0,reviewLimit).forEach(row=>{
    const card=makeNode('article','','review-card');
    const photo=productPhoto(row);if(photo)card.append(photo);
    card.append(makeNode('strong',row.name),makeNode('p',`${row.sku} · ${row.location||'Sin ubicación'}`));
    const alert=row.issue==='pending'?'Falta contar este producto':row.issue==='baseline'?'Sin conteo del mes anterior: documenta la base inicial':row.issue==='difference'?`Diferencia por verificar: ${signedQuantity(row.difference)} unidades`:'Cantidad consistente con entradas y salidas';
    card.append(makeNode('p',alert,'review-alert'));
    card.append(makeNode('p',`Anterior: ${row.previous??'—'} · Movimiento neto: ${signedQuantity(row.netMovement)} · Esperado: ${row.expected??'—'} · Contado: ${row.quantity??'—'}`));
    if(row.justified)card.append(makeNode('p',`Justificado por ${row.note.workerName}: ${row.note.reason}`,'review-note'));
    if(!row.justified&&row.quantity!==null&&row.issue!=='ok'&&status!=='closed') {
      const form=document.createElement('form'),input=document.createElement('input'),button=makeNode('button','Guardar justificación','ghost-button','confirm');
      input.placeholder='Motivo y evidencia de la diferencia';input.setAttribute('aria-label',`Justificación de ${row.sku}`);input.minLength=5;input.maxLength=500;input.required=true;button.type='submit';form.append(input,button);
      form.onsubmit=async event=>{event.preventDefault();button.disabled=true;try{await api('/api/periods/justify','POST',{month:review.month,productId:row.productId,fingerprint:row.fingerprint,reason:input.value});await loadReview();}catch(error){showError($r('reviewError'),error.message);}finally{button.disabled=false;}};
      card.append(form);
    }
    if(status==='open'&&!review.archiveRevision&&row.quantity!==null){
      const button=makeNode('button','Solicitar reconteo','ghost-button','warning');button.type='button';button.onclick=()=>requestRecount(row.productId);card.append(button);
    }
    host.append(card);
  });
  if(!rows.length)host.append(makeNode('p','No hay productos para este filtro.','muted-note'));
  $r('reviewMore').classList.toggle('hidden',rows.length<=reviewLimit);
  $r('periodAudit').replaceChildren(...(review.audit||[]).map(event=>{
    const item=makeNode('p',`${formatDateTime(event.date)} · ${event.workerName} · ${event.status?periodLabels[event.status]:event.action==='working_month'?'Habilitación de mes':event.action?.startsWith('location_')?'Ubicación':event.action?.startsWith('recount_')?'Reconteo':'Justificación'} · ${event.reason}`);
    if(event.closureRevision){const button=makeNode('button',`Ver cierre #${event.closureRevision}`,'text-button');button.type='button';button.onclick=async()=>{try{activeReview=await api(`/api/periods/review?month=${review.month}&closure=${event.closureRevision}`);$r('reviewFilter').value='all';renderReview();}catch(error){showError($r('reviewError'),error.message);}};item.append(button);}return item;
  }));
}
async function transitionPeriod(target) {
  if(!activeReview||!$r('periodForm').reportValidity())return;
  $r('advancePeriod').disabled=true;$r('reopenPeriod').disabled=true;
  try {await api('/api/periods/transition','POST',{month:activeReview.month,status:target,expectedRevision:activeReview.period.revision,fingerprint:activeReview.fingerprint,reason:$r('periodReason').value});$r('periodReason').value='';InventoryFormGuard.clean($r('reviewWindow'));await loadReview();await refreshState(true);toast('Estado del mes actualizado.');}
  catch(error){showError($r('reviewError'),error.message);}
  finally{$r('reopenPeriod').disabled=false;if(activeReview)renderReview();}
}

function clearVoiceMaster() {
  voiceSearchText=null;voiceMasterResult=null;voiceToken=null;
  $r('voiceMaster').setAttribute('aria-pressed','false');
}
function applyMasterQuantity() {
  if(!voiceMasterResult)return;
  els.movementQty.value=voiceMasterResult.quantity===null?'':String(voiceMasterResult.quantity);
  updateMovementPreview();
  voiceMasterResult=null;
}
function startVoiceSearch(master=false) {
  if(androidVersion<5||!state.user||editingMovement)return;
  setMovementMode('manual');$r(master?'voiceMaster':'voiceSearch').setAttribute('aria-pressed','true');voiceToken={request:InventoryOffline.id(),userId:state.user.id,master};
  if(master)els.movementQty.value='';
  $r('voiceStatus').textContent=master?'Di producto y cantidad al final. Ejemplo: Ayudín de litro, cinco unidades.':'Di el nombre del producto. Revisa el texto y selecciona una coincidencia.';
  location.href='inventory://voice?request='+encodeURIComponent(voiceToken.request)+(master?'&mode=master':'');
}
window.inventoryVoiceComplete=(request,text)=>{
  if(!voiceToken||request!==voiceToken.request||voiceToken.userId!==state.user?.id||!voiceToken.master)return false;
  const phrase=InventoryMatching.parseMaster(text);
  return phrase.quantity!==null&&Boolean(phrase.countUnit)&&Boolean(phrase.productText.trim());
};
window.inventoryVoiceResult=result=>{
  if(!voiceToken||result.request!==voiceToken.request||voiceToken.userId!==state.user?.id)return;
  const master=voiceToken.master;voiceToken=null;
  if(result.error){$r('voiceStatus').textContent=result.error;return;}
  if(master) {
    voiceMasterResult=InventoryMatching.voiceMaster(state.products,result.text);
    const parsed=voiceMasterResult;
    els.movementSearch.value=parsed.productText;voiceSearchText=parsed.productText;els.movementProduct.value='';els.movementQty.value='';
    renderMovementOptions();
    const quantity=parsed.quantity===null?'No identifiqué una cantidad. Escríbela antes de guardar.':`Cantidad: ${parsed.quantity}.`;
    if(parsed.selected) {
      els.movementProduct.value=parsed.selected.id;showSelectedProduct(parsed.selected);applyMasterQuantity();
      $r('voiceStatus').textContent=`Producto: ${parsed.selected.name}. ${quantity} Revisa y confirma el registro.`;
    } else {
      const prompt=parsed.matches[0]?.confidence==='low'?`¿Quisiste decir: ${parsed.matches[0].product.name}?`:parsed.matches.length>1?'Estas son las coincidencias más cercanas. Elige el producto.':parsed.matches.length?`¿Quisiste decir: ${parsed.matches[0].product.name}?`:'No encontré un producto seguro. Repite la frase o escribe el nombre.';
      $r('voiceStatus').textContent=`Escuché: “${parsed.text}”. ${quantity} ${prompt}`;
    }
    return;
  }
  els.movementSearch.value=String(result.text||'').slice(0,200);voiceSearchText=els.movementSearch.value;els.movementProduct.value='';
  const matches=InventoryMatching.voiceRank(state.products,voiceSearchText),selected=InventoryMatching.voiceConfident(matches);
  renderMovementOptions();
  if(selected){els.movementProduct.value=selected.id;showSelectedProduct(selected);$r('voiceStatus').textContent=`Producto encontrado: ${selected.name}. Revisa y continúa con el conteo.`;}
  else if(matches[0]?.confidence==='low')$r('voiceStatus').textContent=`Escuché: “${els.movementSearch.value}”. ¿Quisiste decir: ${matches[0].product.name}?`;
  else if(matches.length>1)$r('voiceStatus').textContent=`Escuché: “${els.movementSearch.value}”. Estas son las mejores opciones; elige el producto correcto.`;
  else if(matches.length)$r('voiceStatus').textContent=`Escuché: “${els.movementSearch.value}”. ¿Quisiste decir: ${matches[0].product.name}?`;
  else $r('voiceStatus').textContent=els.movementSearch.value?`Escuché: “${els.movementSearch.value}”. No encontré una coincidencia segura.`:'No se recibió texto. Puedes volver a intentar o escribir.';
};
$r('voiceSearch').onclick=()=>startVoiceSearch(false);
$r('voiceMaster').onclick=()=>startVoiceSearch(true);
$r('workerLocation').onchange=()=>{renderMovementOptions();renderReleaseStatus();};
$r('countMonth').addEventListener('change',renderReleaseStatus);
$r('openSyncQueue').onclick=()=>{openWindow($r('syncWindow'));refreshPendingList().catch(e=>toast(e.message,true));};
$r('closeSync').onclick=()=>closeWindows();
$r('syncNow').onclick=async()=>{try{await syncCounts();await refreshState(true);}catch(error){toast(error.message,true);}};
$r('openReview').onclick=()=>{openWindow($r('reviewWindow'));loadReview();};
$r('closeReview').onclick=()=>closeWindows();$r('reloadReview').onclick=loadReview;
$r('reviewSearch').oninput=()=>{reviewLimit=20;renderReview();};$r('reviewFilter').onchange=()=>{reviewLimit=20;renderReview();};
$r('reviewMore').onclick=()=>{reviewLimit+=20;renderReview();};
$r('periodForm').onsubmit=event=>{event.preventDefault();transitionPeriod(activeReview?.period.status==='open'?'review':'closed');};
$r('reopenPeriod').onclick=()=>transitionPeriod('open');
function retryPendingConnection(){if(state.user)syncCounts().catch(()=>{});}
window.addEventListener('online',retryPendingConnection);
window.addEventListener('inventory-network-change',retryPendingConnection);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)retryPendingConnection();});
window.addEventListener('offline',()=>{releaseOnline=false;syncStallWatch.reset(state.user?.id);syncStallNotice.classList.add('hidden');renderReleaseStatus();});
setInterval(()=>{if(state.user&&!document.hidden&&!submitting)syncCounts().catch(()=>{});},15000);

async function setWorkingMonth(month){
  $r('workingMonthError').classList.add('hidden');
  try{await api('/api/working-month','POST',{month});await refreshState(true);toast(month?'Mes habilitado para los trabajadores.':'Trabajo de inventario pausado.');}
  catch(error){showError($r('workingMonthError'),error.message);}
}
$r('enableWorkingMonth').onclick=()=>setWorkingMonth(state.month);
$r('pauseWorkingMonth').onclick=()=>setWorkingMonth(null);
