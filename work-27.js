/* Warehouse workflow. Reservations and completion require an online response. */
const workLabels={pending:'Pendiente',active:'En conteo',complete:'Terminada'};
let workAction=null;
function locationWork(id,month=state.workingMonth||state.month){return (state.locationWork||[]).find(w=>w.month===month&&w.locationId===id)||{month,locationId:id,status:'pending',revision:0};}
function pendingRecounts(month=state.workingMonth||state.month){return (state.recounts||[]).filter(r=>r.month===month&&r.status==='pending');}
async function workPost(locationId,action,reason=''){
  await refreshPendingList();
  const month=isWorker()?state.workingMonth:state.month;
  if(['complete','release','reopen'].includes(action)&&pendingEntries.some(e=>e.payload.month===month&&e.payload.locationId===locationId))throw new Error('Sincroniza o resuelve los pendientes de esta ubicación primero.');
  const result=await api('/api/location-work','POST',{month,locationId,action,reason,expectedRevision:locationWork(locationId,month).revision});
  await refreshState(true);return result;
}
async function chooseWorkLocation(id){
  try{
    const work=locationWork(id);
    if(work.status!=='complete'&&(!work.workerId||work.workerId===state.user.id)){
      if(!releaseOnline){if(work.status!=='active'||work.workerId!==state.user.id)throw new Error('Conéctate para reservar esta ubicación antes de contar sin conexión.');}
      else if(work.status!=='active'||work.workerId!==state.user.id)await workPost(id,'claim');
    }
    selectCountLocation(id);
    document.getElementById('warehouseRoute').scrollIntoView({behavior:'smooth',block:'start'});
    return true;
  }catch(error){toast(error.message,true);return false;}
}
function askWorkReason(title,action){
  workAction=action;document.getElementById('workActionTitle').textContent=title;
  document.getElementById('workActionReason').value='';document.getElementById('workActionError').classList.add('hidden');
  openWindow(document.getElementById('workActionWindow'));
}
function requestRecount(productId){askWorkReason('Solicitar reconteo',async reason=>{
  await api('/api/recounts','POST',{month:state.month,productId,reason});await refreshState(true);
});}
function progressCards(month){
  const host=makeNode('div','','warehouse-progress');
  ['Almacén 1','Almacén 2'].forEach(name=>{
    const list=(state.locations||[]).filter(l=>l.warehouse===name).map(l=>locationWork(l.id,month));
    const done=list.filter(w=>w.status==='complete').length,active=list.filter(w=>w.status==='active').length;
    const card=makeNode('article');const bar=document.createElement('progress');bar.max=list.length||1;bar.value=done;bar.setAttribute('aria-label',`${name}: ${done} de ${list.length} terminadas`);
    card.append(makeNode('strong',name),makeNode('span',`${done}/${list.length} terminadas`),bar,makeNode('small',`${active} en conteo · ${list.length-done-active} pendientes`));host.append(card);
  });return host;
}
function renderWork(){
  if(!state.user)return;
  const month=isWorker()?state.workingMonth:state.month;
  const dashboard=document.getElementById('warehouseDashboard'),controls=document.getElementById('locationWorkControls');
  if(isWorker()){
    controls.replaceChildren();
    if(month)controls.append(progressCards(month));
    if(activeLocation&&!choosingLocation&&month&&periodFor(month).status==='open'){
      const work=locationWork(activeLocation,month),owned=work.workerId===state.user.id;
      const box=makeNode('div','','work-control-card');
      box.append(makeNode('strong',`${workLabels[work.status]}${work.workerName?' · '+work.workerName:''}`));
      if(work.status==='active'&&owned){
        const finish=makeNode('button','Terminé esta ubicación','primary-button');finish.type='button';finish.onclick=()=>workPost(activeLocation,'complete').catch(e=>toast(e.message,true));box.append(finish);
        const release=makeNode('button','Liberar ubicación','text-button','warning');release.type='button';release.onclick=()=>askWorkReason('Liberar ubicación',reason=>workPost(activeLocation,'release',reason));box.append(release);
      }else if(work.status==='complete'&&owned){
        const reopen=makeNode('button','Reabrir con motivo','ghost-button','warning');reopen.type='button';reopen.onclick=()=>askWorkReason('Reabrir ubicación',reason=>workPost(activeLocation,'reopen',reason));box.append(reopen);
      }else if(!work.workerId){const start=makeNode('button','Empezar aquí','primary-button');start.type='button';start.onclick=()=>chooseWorkLocation(activeLocation);box.append(start);}
      else box.append(makeNode('p','Elige otra ubicación o solicita al administrador que la libere.'));
      controls.append(box);
      els.movementWindow.classList.toggle('location-waiting',work.status!=='active'||!owned);
    }
    pendingRecounts(month).forEach(request=>{
      const card=makeNode('article','','recount-task');card.append(makeNode('strong','Reconteo solicitado'),makeNode('p',request.name),makeNode('p',locationName(request.locationId)),makeNode('small',request.reason));
      const button=makeNode('button','Recontar producto','ghost-button');button.type='button';button.onclick=async()=>{if(!await chooseWorkLocation(request.locationId))return;openMovement(request.productId);selectedCountKey='';syncCountForm();els.movementQty.focus();};card.append(button);controls.append(card);
    });
  }else{
    const opened=dashboard.querySelector('details')?.open;dashboard.replaceChildren(progressCards(month));
    const details=document.createElement('details');details.open=Boolean(opened);details.append(makeNode('summary','Ubicaciones y responsables'));
    const grid=makeNode('div','','admin-location-grid');
    (state.locations||[]).forEach(l=>{
      const w=locationWork(l.id,month),card=makeNode('article','','work-control-card');card.append(makeNode('strong',l.label),makeNode('span',`${workLabels[w.status]} · ${w.workerName||'Sin responsable'}`));
      if(w.status!=='pending'){
        const button=makeNode('button',w.status==='complete'?'Reabrir':'Liberar','ghost-button','warning');button.type='button';button.onclick=()=>askWorkReason(`${button.textContent}: ${l.name}`,reason=>workPost(l.id,w.status==='complete'?'reopen':'release',reason));card.append(button);
      }grid.append(card);
    });details.append(grid);dashboard.append(details);
    const requests=pendingRecounts(month);dashboard.append(makeNode('p',`${requests.length} reconteos pendientes. Solicítalos desde Revisar y cerrar mes.`,'muted-note'));
  }
}
document.getElementById('workActionForm').onsubmit=async event=>{
  event.preventDefault();const button=event.target.querySelector('[type=submit]');button.disabled=true;
  try{await workAction(document.getElementById('workActionReason').value);closeWindows({saved:true});if(isWorker()){els.movementWindow.classList.remove('hidden');renderWarehouses();renderWork();}}
  catch(error){showError(document.getElementById('workActionError'),error.message);}
  finally{button.disabled=false;}
};
document.getElementById('cancelWorkAction').onclick=()=>{closeWindows();if(isWorker()){els.movementWindow.classList.remove('hidden');renderWarehouses();renderWork();}};
function autoCloseCamera(){try{return localStorage.getItem('camera-auto-close')!=='off';}catch(_){return true;}}
document.getElementById('cameraAutoClose').checked=autoCloseCamera();
document.getElementById('cameraAutoClose').onchange=event=>{try{localStorage.setItem('camera-auto-close',event.target.checked?'on':'off');}catch(_){} };
