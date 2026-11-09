/* Inventory rounds use the existing catalog, voice matcher and native camera. */
window.InventoryRuns = (() => {
  const $=id=>document.getElementById(id);
  let opened=false, selected=null, detail=null, listing=null, fetching=false, pulseBusy=false;
  let owner=null, rowEdit=null, picked=null, operation=null, pendingPayload=null, saving=false;
  let rowRunChanged=false;
  let voice=null, camera=null, lastPoll=0, lastPulse=0, auditBefore=null;
  let auditEvents=[],olderLoaded=false;
  let historyRenderKey=null;
  const labels={draft:'En preparación',open:'Abierto',paused:'Pausado',closed:'Cerrado'};
  const modeLabel=mode=>mode==='guided'?'Con lista':'Boceto nuevo';
  const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const button=(text,action,cls='ghost-button',tone)=>{const e=node('button',text,cls);e.type='button';e.onclick=action;if(tone)e.dataset.actionTone=tone;return e;};
  const stamp=value=>value?new Date(value).toLocaleString('es-PE'):'';
  const page=node('section',undefined,'runs-page hidden');page.id='runsPage';
  page.innerHTML=`<div class="runs-heading"><div><p class="eyebrow">TRABAJO COMPARTIDO</p><h1>Gestión</h1><p>Conteos por ubicación y nivel, con historial de cada cambio.</p></div><button id="runsBack" type="button" class="ghost-button prominent-back">← Volver</button></div>
    <p id="runsConnection" role="status" class="runs-connection">Conectando…</p>
    <section id="runsPeoplePanel" aria-labelledby="runsPeopleTitle"><div class="runs-people-heading"><h2 id="runsPeopleTitle">Trabajadores conectados</h2><span id="runsOnlineCount" class="runs-online-count"></span></div><div id="runsPeople" class="runs-people"></div><details id="runsOfflinePanel"><summary id="runsOfflineTitle">Sin conexión reciente</summary><div id="runsOffline" class="runs-people"></div></details></section>
    <div id="runsListView"><form id="runsCreate" class="runs-create"><h2>Abrir un inventario</h2><label>Nombre<input id="runsTitle" maxlength="100" required placeholder="Ej.: Revisión del estante 01" /></label><label>Tipo<select id="runsMode"><option value="guided">1 · Con lista de Excel</option><option value="blind">2 · Boceto nuevo (en blanco)</option></select></label><label>Ubicación<select id="runsLocation" required></select></label><p>Con lista de Excel: importa los productos del estante y deja las cantidades por contar. Boceto nuevo: empieza vacío y el trabajador agrega lo que encuentra.</p><button class="primary-button" type="submit">Crear en preparación</button></form><div id="runsList" class="runs-list"></div></div>
    <section id="runsDetail" class="hidden"><div class="runs-detail-heading"><div><p id="runModeLabel" class="eyebrow"></p><h2 id="runTitle"></h2><p id="runLocation"></p><p id="runProgress"></p></div><div class="runs-buttons"><button id="runsAll" type="button" class="ghost-button">Ver inventarios</button><button id="runImport" type="button" class="ghost-button hidden">Importar Excel</button><button id="runAdd" type="button" class="primary-button">Agregar producto</button><button id="runStatus" type="button" class="ghost-button"></button></div></div><p id="runHelp" class="runs-help"></p>
    <div class="table-wrap"><table class="runs-table"><thead><tr><th>Nivel</th><th>Nombre de producto</th><th>Cantidad</th><th>Último cambio</th><th>Acción</th></tr></thead><tbody id="runRows"></tbody></table></div><p id="runEmpty" class="runs-help hidden">Todavía no hay productos. Agrega el primero.</p>
    <div id="runAudit" class="runs-audit-columns"><section aria-labelledby="runAdminAuditTitle"><div class="runs-audit-heading"><h2 id="runAdminAuditTitle">Historial del administrador</h2><span id="runAdminAuditCount"></span></div><div id="runAdminAudit" class="runs-audit"></div></section><section aria-labelledby="runWorkerAuditTitle"><div class="runs-audit-heading"><h2 id="runWorkerAuditTitle">Historial de trabajadores</h2><span id="runWorkerAuditCount"></span></div><div id="runWorkerAudit" class="runs-audit"></div></section></div><button id="runMoreAudit" type="button" class="ghost-button hidden">Cargar cambios anteriores de ambos historiales</button></section>`;
  $('appShell').append(page);
  const monthlyManagement=node('details',undefined,'management-monthly');monthlyManagement.id='managementMonthly';monthlyManagement.classList.add('hidden');
  monthlyManagement.setAttribute('aria-labelledby','managementMonthTitle');
  monthlyManagement.innerHTML=`<summary id="managementMonthTitle">Avance de almacenes y revisión mensual</summary>`;
  const monthToolbar=document.querySelector('.working-month-toolbar');
  monthToolbar.querySelector('p:last-child').textContent='La apertura, pausa y reanudación se controlan desde la tarjeta del inventario activo.';
  $('enableWorkingMonth').classList.add('hidden');$('pauseWorkingMonth').classList.add('hidden');
  monthlyManagement.append(monthToolbar,$('warehouseDashboard'),document.querySelector('.period-toolbar'));
  $('runsPeoplePanel').after(monthlyManagement);
  $('runsCreate').innerHTML=`<h2>Iniciar inventario</h2><label>Mes<input id="managementMonth" type="month" required /></label><label>Tipo<select id="runsMode"><option value="guided">Con lista</option><option value="blind">Boceto nuevo</option></select></label><label>Nombre (opcional)<input id="runsTitle" maxlength="100" placeholder="Ej.: Inventario de septiembre" /></label><p>Una sola apertura habilita el mes y el inventario para todos los trabajadores.</p><button type="submit" class="primary-button">Abrir inventario</button>`;
  function updateCreateMonth(){const existing=listing?.runs.find(r=>r.scope==='global'&&r.month===$('managementMonth').value);$('runsCreate').querySelector('button').textContent=existing?'Ver inventario del mes':'Abrir inventario';$('runsMode').disabled=!!existing;$('runsTitle').disabled=!!existing;}
  $('managementMonth').onchange=()=>{const original=$('inventoryMonth');original.value=$('managementMonth').value;original.dispatchEvent(new Event('change'));$('managementMonth').value=state.month;updateCreateMonth();};
  const activePanel=node('section',undefined,'management-active hidden');activePanel.id='managementActive';
  activePanel.innerHTML=`<div><p class="eyebrow">INVENTARIO ACTUAL</p><h2 id="managementActiveTitle"></h2><p id="managementActiveInfo"></p></div><div class="runs-buttons"><button id="managementFollow" type="button" class="primary-button" data-action-tone="info">Ver seguimiento</button><button id="managementPause" type="button" class="ghost-button" data-action-tone="warning">Pausar</button><button id="managementClose" type="button" class="ghost-button" data-action-tone="warning">Cerrar inventario</button><button id="managementDelete" type="button" class="ghost-button worker-delete">Eliminar inventario</button></div>`;
  $('runsConnection').after($('runsCreate'),activePanel);
  $('runsListView').prepend(node('h2','Inventarios anteriores','management-history-title'));
  const historyPanel=node('section',undefined,'management-history');historyPanel.id='managementHistory';
  historyPanel.setAttribute('aria-labelledby','managementHistoryTitle');
  const historyTitle=$('runsListView').querySelector('.management-history-title');historyTitle.id='managementHistoryTitle';
  historyPanel.append(historyTitle,$('runsList'));activePanel.after(historyPanel);
  const waiting=node('p','El administrador todavía no ha abierto un inventario. Se mostrará aquí cuando lo habilite.','runs-help hidden');waiting.id='workerRunWaiting';$('runsListView').prepend(waiting);
  page.querySelector('.runs-heading h1').textContent='Gestión';
  page.querySelector('.runs-heading h1+p').textContent='Abre el inventario del equipo, elige su tipo y supervisa el trabajo en tiempo real.';
  const rowWindow=node('section',undefined,'floating-window hidden');rowWindow.id='runRowWindow';
  rowWindow.setAttribute('role','dialog');rowWindow.setAttribute('aria-modal','true');rowWindow.setAttribute('aria-labelledby','runRowTitle');rowWindow.tabIndex=-1;
  rowWindow.innerHTML=`<div class="window-titlebar"><h2 id="runRowTitle">Registrar producto</h2><button id="runRowClose" type="button" class="ghost-button prominent-back" aria-label="Volver">← Volver</button></div>
    <form id="runRowForm"><input id="runProductKind" type="hidden" value="catalog" /><div id="runCatalog"><label>Buscar nombre o código<input id="runSearch" type="search" autocomplete="off" /></label><div class="runs-buttons run-entry-tools"><button id="runWrite" type="button" class="ghost-button" data-action-tone="info">Escribir</button><button id="runVoice" type="button" class="ghost-button" data-action-tone="info">Voz</button><button id="runMaster" type="button" class="ghost-button" data-action-tone="assist">Voz Maestro</button><button id="runCamera" type="button" class="ghost-button" data-action-tone="info">Cámara</button><button id="runStopCamera" type="button" class="ghost-button hidden" data-action-tone="warning">Pausar cámara</button></div><p id="runVoiceStatus" role="status" class="muted-note"></p><div id="runSearchResults" class="runs-results"></div><p id="runPicked" class="runs-picked hidden"></p></div>
    <label id="runFreeLabel" class="hidden">Nombre encontrado<input id="runFreeName" maxlength="200" /></label><p id="runFreeHelp" class="muted-note hidden">Producto fuera del catálogo.</p><div class="two-columns"><label>Nivel<input id="runLevel" maxlength="40" required placeholder="Ej.: 1, 2, superior" /></label><label>Cantidad encontrada<input id="runQuantity" type="number" min="0" max="1000000000" step="any" inputmode="decimal" /></label></div><p id="runDraftHelp" class="muted-note hidden">Puedes dejar la cantidad vacía para que la complete el trabajador.</p><label id="runReasonLabel" class="hidden">Motivo del cambio<input id="runRowReason" minlength="5" maxlength="300" /></label><p id="runRowError" class="form-error hidden" role="alert"></p><div class="window-actions"><button id="runRowCancel" type="button" class="ghost-button" data-action-tone="neutral">Cancelar</button><button id="runRowSave" type="submit" class="primary-button">Guardar registro</button></div></form>`;
  document.body.append(rowWindow);
  const cameraReadings=InventoryMatching.cameraTracker();
  const cameraReview=node('div',undefined,'camera-review hidden');cameraReview.id='runCameraReview';
  cameraReview.append(node('strong','Lectura lista: elige un producto'),node('p','Compara la foto y la presentación. No se guardará nada hasta que confirmes el registro.'));
  const cameraAgain=button('Seguir escaneando',()=>$('runCamera').onclick(),'ghost-button');cameraAgain.id='runCameraAgain';cameraReview.append(cameraAgain);
  $('runSearchResults').before(cameraReview);
  const findingPhoto=entityPhotoPicker($('runRowForm'),true);
  findingPhoto.box.id='runFindingPhoto';$('runFreeHelp').after(findingPhoto.box);
  $('runFreeHelp').textContent='Si no sabes qué producto es, escribe un nombre provisional y adjunta una foto. Administración lo revisará como No confirmado.';
  const evidenceWindow=node('section',undefined,'floating-window hidden');evidenceWindow.id='findingPhotoWindow';evidenceWindow.setAttribute('role','dialog');evidenceWindow.setAttribute('aria-label','Foto del producto');evidenceWindow.tabIndex=-1;
  const evidenceTitle=node('h2'),evidenceImage=node('img');evidenceImage.className='finding-photo-full';
  evidenceWindow.append(evidenceTitle,evidenceImage,button('Volver',closeWindows,'ghost-button','neutral'));document.body.append(evidenceWindow);
  function rowPhoto(row){
    const product=state.products.find(p=>p.id===row.productId);
    const photo=row.productId?productPhoto(product||{}):productPhoto({name:row.name,image:row.evidenceImage});
    if(photo&&!row.productId&&row.evidenceImage){photo.tabIndex=0;photo.setAttribute('role','button');photo.setAttribute('aria-label','Ver foto de '+row.name);const show=()=>{evidenceTitle.textContent=row.name;evidenceImage.src=row.evidenceImage;evidenceImage.alt='Foto de '+row.name;openWindow(evidenceWindow);};photo.onclick=show;photo.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}};}
    return photo;
  }
  const decisionWindow=node('section',undefined,'floating-window run-decision-window hidden');decisionWindow.id='runDecisionWindow';decisionWindow.tabIndex=-1;
  decisionWindow.setAttribute('role','dialog');decisionWindow.setAttribute('aria-modal','true');decisionWindow.setAttribute('aria-labelledby','runDecisionTitle');decisionWindow.setAttribute('aria-describedby','runDecisionMessage');
  decisionWindow.innerHTML=`<div class="window-titlebar"><div><p class="eyebrow">GESTIÓN DE INVENTARIO</p><h2 id="runDecisionTitle"></h2></div><button id="runDecisionClose" type="button" class="icon-button" aria-label="Cerrar confirmación" data-action-tone="neutral">×</button></div>
    <div id="runDecisionProduct" class="run-decision-product"></div><p id="runDecisionMessage" class="run-decision-message"></p>
    <div class="window-actions"><button id="runDecisionCancel" type="button" class="ghost-button" data-action-tone="neutral">Cancelar</button><button id="runDecisionConfirm" type="button" class="primary-button decision-approve"></button></div>`;
  document.body.append(decisionWindow);
  let pendingDecision=null;
  function confirmDecision({title,message,label,row,reject=false}){
    if(pendingDecision)pendingDecision(false);
    $('runDecisionTitle').textContent=title;$('runDecisionMessage').textContent=message;
    const product=$('runDecisionProduct');product.replaceChildren();product.classList.toggle('hidden',!row);
    if(row){
      // Keep the original node: productPhoto resolves its source asynchronously
      // and attaches load/error handlers that cloneNode does not preserve.
      const photo=rowPhoto(row)||node('span','Sin foto','run-no-photo');photo.onclick=null;photo.onkeydown=null;photo.removeAttribute('tabindex');photo.removeAttribute('role');photo.removeAttribute('aria-label');
      const info=node('div');info.append(node('strong',row.name),node('small',row.sku||'Fuera del catálogo'),node('p',row.locationLabel||''));
      const facts=node('div',undefined,'run-decision-facts');facts.append(node('span','Nivel '+row.level),node('span','Cantidad: '+(row.quantity??'Pendiente')));info.append(facts);product.append(photo,info);
    }
    const accept=$('runDecisionConfirm');accept.textContent=label;accept.disabled=false;accept.className='primary-button '+(reject?'decision-reject':'decision-approve');
    openWindow(decisionWindow);$('runDecisionCancel').focus();
    return new Promise(resolve=>{
      const finish=value=>{if(pendingDecision!==finish)return;pendingDecision=null;observer.disconnect();decisionWindow.removeEventListener('keydown',trapFocus);if(!decisionWindow.classList.contains('hidden'))closeWindows();resolve(value);};
      const observer=new MutationObserver(()=>{if(decisionWindow.classList.contains('hidden'))finish(false);});
      const trapFocus=event=>{if(event.key!=='Tab')return;const first=$('runDecisionClose'),last=accept;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};
      pendingDecision=finish;observer.observe(decisionWindow,{attributes:true,attributeFilter:['class']});decisionWindow.addEventListener('keydown',trapFocus);
      $('runDecisionClose').onclick=$('runDecisionCancel').onclick=()=>finish(false);accept.onclick=()=>{accept.disabled=true;finish(true);};
    });
  }
  const unconfirmed=node('details',undefined,'runs-unconfirmed hidden');unconfirmed.id='runUnconfirmed';
  unconfirmed.innerHTML='<summary><strong>Productos no confirmados · Todas las empresas</strong><span id="runUnconfirmedCount"></span></summary><p class="runs-help">Hallazgos pendientes de revisión de todas las empresas. Revisa la foto y corrige el nombre o selecciona un producto del catálogo antes de aprobar.</p><div id="runUnconfirmedItems"></div>';
  $('runHelp').after(unconfirmed);
  function renderUnconfirmed(){
    const rows=(detail?.rows||[]).filter(isFinding),host=$('runUnconfirmedItems');host.replaceChildren();unconfirmed.classList.toggle('hidden',isWorker()||!rows.length);
    $('runUnconfirmedCount').textContent=rows.length+' productos';
    if(isWorker())return;
    for(const row of rows){
      const card=node('article',undefined,'finding-review-card '+rowStateClass(row)),info=node('div');
      card.append(rowPhoto(row)||node('span','Sin foto','run-no-photo'));
      info.append(node('strong',row.name),node('span',row.retirement?.status==='pending'?'Retiro pendiente':row.productId?'Del catálogo · Pendiente de aprobación':'Fuera del catálogo · No confirmado','run-found-badge'),node('p',row.locationLabel+' · Nivel '+row.level+' · Cantidad: '+(row.quantity??'Pendiente')),node('small','Encontrado por '+(row.foundBy||row.workerName)));
      const actions=node('div',undefined,'runs-buttons'),edit=button('Revisar / corregir',()=>editRow(row));edit.disabled=detail.run.status==='closed';
      const approve=button('Aprobar y añadir a estructura',()=>approveFinding(row,approve),'primary-button decision-approve'),reject=button('Rechazar',()=>rejectFinding(row,reject),'ghost-button decision-reject');approve.disabled=reject.disabled=row.retirement?.status==='pending';
      actions.append(edit);
      if(!row.productId){const create=button('Crear en catálogo',()=>openFindingCatalog(row),'ghost-button','add');create.disabled=detail.run.status==='closed'||row.retirement?.status==='pending';actions.append(create);}
      if(row.productId)actions.append(approve);else info.append(node('p','Primero identifica el producto o crea su ficha completa.','muted-note'));
      actions.append(reject);info.append(actions);card.append(info);host.append(card);
    }
  }

  const findingCatalogWindow=node('section',undefined,'floating-window hidden');findingCatalogWindow.id='findingCatalogWindow';findingCatalogWindow.setAttribute('role','dialog');findingCatalogWindow.setAttribute('aria-label','Crear producto en catálogo');findingCatalogWindow.tabIndex=-1;
  findingCatalogWindow.innerHTML='<div class="window-titlebar"><h2>Nuevo producto</h2><button id="findingCatalogClose" type="button" class="ghost-button" aria-label="Cerrar" data-action-tone="neutral">×</button></div><form id="findingCatalogForm"><label>Nombre<input id="findingCatalogName" maxlength="250" required></label><div class="two-columns"><label>Código<input id="findingCatalogSku" maxlength="100" readonly required title="Código automático al guardar"></label><label>Categoría<select id="findingCatalogCategory" required></select></label></div><label id="findingCatalogNewCategoryLabel" class="hidden">Nueva categoría<input id="findingCatalogNewCategory" maxlength="100"></label><label>Precio (S/)<input id="findingCatalogPrice" type="number" min="0" step="any" placeholder="Opcional: pendiente si no lo conoces"></label><p id="findingCatalogError" class="form-error hidden"></p><div class="window-actions"><button id="findingCatalogCancel" type="button" class="ghost-button" data-action-tone="neutral">Cancelar</button><button type="submit" class="primary-button">Crear y vincular</button></div></form>';
  document.body.append(findingCatalogWindow);const officialPhoto=entityPhotoPicker($('findingCatalogForm'));let catalogTarget=null,catalogOperation=null,catalogSignature=null;
  $('findingCatalogCancel').onclick=closeWindows;$('findingCatalogClose').onclick=closeWindows;
  function openFindingCatalog(row){catalogTarget={row,runId:detail.run.id,revision:detail.run.revision};catalogOperation=InventoryOffline.id();catalogSignature=null;$('findingCatalogForm').reset();$('findingCatalogName').value=row.name;const categories=[...new Set(state.products.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));$('findingCatalogCategory').replaceChildren(new Option('Selecciona una categoría',''),...categories.map(c=>new Option(c,c)),new Option('+ Crear nueva categoría','__new_category__'));$('findingCatalogNewCategoryLabel').classList.add('hidden');$('findingCatalogNewCategory').required=false;const codes=state.products.map(p=>/^UNI(\d+)$/i.exec(p.sku||'')).filter(Boolean);$('findingCatalogSku').value='UNI'+String(Math.max(0,...codes.map(m=>Number(m[1])))+1).padStart(Math.max(5,...codes.map(m=>m[1].length)),'0');$('findingCatalogPrice').value='';officialPhoto.set('');$('findingCatalogError').classList.add('hidden');openWindow(findingCatalogWindow);}
  $('findingCatalogCategory').onchange=()=>{const fresh=$('findingCatalogCategory').value==='__new_category__';$('findingCatalogNewCategoryLabel').classList.toggle('hidden',!fresh);$('findingCatalogNewCategory').required=fresh;};
  $('findingCatalogForm').onsubmit=async event=>{
    event.preventDefault();const form=event.target,submit=form.querySelector('[type=submit]');if(submit.disabled)return;
    try{
      const product={name:$('findingCatalogName').value.trim(),sku:$('findingCatalogSku').value.trim(),autoSku:true,category:($('findingCatalogCategory').value==='__new_category__'?$('findingCatalogNewCategory').value:$('findingCatalogCategory').value).trim(),price:$('findingCatalogPrice').value===''?null:Number($('findingCatalogPrice').value),image:officialPhoto.get()};
      if(!product.name||!product.sku||!product.category||!product.image)throw new Error('Completa nombre, código, categoría e imagen oficial. El precio es opcional.');
      const signature=JSON.stringify(product);if(catalogSignature!==null&&signature!==catalogSignature)catalogOperation=InventoryOffline.id();catalogSignature=signature;
      submit.disabled=true;form.inert=true;
      await api('/api/inventories/'+catalogTarget.runId+'/findings','POST',{decision:'create_product',id:catalogTarget.row.id,expectedRevision:catalogTarget.row.revision,runRevision:catalogTarget.revision,operationId:catalogOperation,product});
      closeWindows({saved:true});await refreshState(true);await poll(true);toast(detail?.run.mode==='blind'?'Producto creado en el catálogo. Registro actualizado.':'Producto creado y vinculado. Puedes aprobarlo en la estructura.');
    }catch(error){showError($('findingCatalogError'),error.message);}finally{submit.disabled=false;form.inert=false;}
  };

  const quantityPad=node('div',undefined,'run-quantity-pad');quantityPad.id='runQuantityPad';
  const rowContext=node('div',undefined,'run-quantity-context');rowContext.id='runQuantityContext';rowContext.classList.add('hidden');
  rowWindow.querySelector('.window-titlebar').after(rowContext);
  const dismissNumericKeyboard=()=>{if(androidVersion>0)InventoryOffline.dismissKeyboard?.().catch(()=>{});};
  let padTarget='runQuantity';
  const padHeading=node('div',undefined,'run-pad-heading'),padTitle=node('strong','Cantidad encontrada');
  const collapseNumberPad=()=>{rowWindow.classList.remove('number-pad-open');rowWindow.classList.add('number-pad-collapsed');$('runLevel').classList.remove('pad-selected');$('runQuantity').classList.remove('pad-selected');};
  const padDone=button('Listo',collapseNumberPad,'ghost-button','confirm');
  padHeading.append(padTitle,padDone);quantityPad.append(padHeading);
  function showNumberPad(id){
    if(androidVersion<=0)return;
    if(id==='runLevel'&&$('runLevel').readOnly)return;
    dismissNumericKeyboard();
    padTarget=id;padTitle.textContent=id==='runLevel'?'Nivel':'Cantidad encontrada';rowWindow.classList.remove('number-pad-collapsed');rowWindow.classList.add('number-pad-open');
    for(const field of ['runLevel','runQuantity'])$(field).classList.toggle('pad-selected',field===id);
    quantityPad.querySelector('[data-decimal]').disabled=id==='runLevel';
  }
  for(const id of ['runLevel','runQuantity']){$(id).addEventListener('focus',()=>showNumberPad(id));$(id).addEventListener('click',()=>showNumberPad(id));$(id).setAttribute('inputmode','none');}
  for(const key of ['1','2','3','4','5','6','7','8','9','.','0','⌫']){
    const keyButton=button(key,()=>{
      if(saving)return;
      const input=$(padTarget);let value=input.value;
      if(key==='⌫')value=value.slice(0,-1);
      else if(key==='.')value=padTarget==='runLevel'||value.includes('.')?value:(value||'0')+'.';
      else value=value==='0'?key:value+key;
      input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));$('runRowError').classList.add('hidden');
    });
    if(key==='⌫')keyButton.setAttribute('aria-label','Borrar último dígito');
    if(key==='.')keyButton.dataset.decimal='true';
    quantityPad.append(keyButton);
  }
  $('runRowForm').querySelector('.two-columns').after(quantityPad);
  const rowLocationLabel=node('label','Ubicación');rowLocationLabel.id='runRowLocationLabel';
  const rowLocation=node('select');rowLocation.id='runRowLocation';rowLocationLabel.append(rowLocation);$('runRowForm').prepend(rowLocationLabel);
  const statusWindow=node('section',undefined,'floating-window compact hidden');statusWindow.id='runStatusWindow';statusWindow.tabIndex=-1;
  statusWindow.setAttribute('role','dialog');statusWindow.setAttribute('aria-modal','true');statusWindow.setAttribute('aria-labelledby','runStatusTitle');
  statusWindow.innerHTML=`<div class="window-titlebar"><h2 id="runStatusTitle">Cambiar estado</h2></div><form id="runStatusForm"><label>Motivo<input id="runStatusReason" minlength="5" maxlength="300" required /></label><p id="runStatusError" role="alert" class="form-error hidden"></p><div class="window-actions"><button id="runStatusCancel" type="button" class="ghost-button" data-action-tone="neutral">Cancelar</button><button type="submit" class="primary-button">Confirmar</button></div></form>`;
  document.body.append(statusWindow);
  async function askDelete(run){
    if(!run||isWorker())return;
    deleteRun=run.id;deleteToken=null;deleteStep=1;
    $('runDeleteName').textContent=run.title;
    $('runDeleteCode').textContent='…';$('runDeleteInput').value='';$('runDeleteFirst').classList.remove('hidden');$('runDeleteSecond').classList.add('hidden');$('runDeleteError').classList.add('hidden');$('runDeleteSubmit').disabled=true;$('runDeleteSubmit').textContent='Verificar código';$('runDeleteSubmit').dataset.actionTone='info';
    openWindow(deleteWindow);
    try{const result=await api('/api/inventories/'+deleteRun+'/delete-challenge','POST',{});deleteToken=result.token;$('runDeleteCode').textContent=result.code;$('runDeleteSubmit').disabled=false;}catch(error){showError($('runDeleteError'),error.message);}
  }
  const deleteButton=button('Eliminar inventario',()=>askDelete(detail?.run),'ghost-button worker-delete');deleteButton.id='runDelete';$('runStatus').after(deleteButton);
  let deleteRun=null,deleteToken=null,deleteStep=1;
  const deleteWindow=node('section',undefined,'floating-window compact hidden');deleteWindow.id='runDeleteWindow';deleteWindow.tabIndex=-1;deleteWindow.setAttribute('role','dialog');deleteWindow.setAttribute('aria-modal','true');deleteWindow.setAttribute('aria-labelledby','runDeleteTitle');
  deleteWindow.innerHTML=`<h2 id="runDeleteTitle">Eliminar inventario</h2><p id="runDeleteName" class="runs-help"></p><form id="runDeleteForm"><div id="runDeleteFirst"><p>Paso 1 de 2. Escribe el código de 6 dígitos:</p><strong id="runDeleteCode" class="run-delete-code"></strong><label>Código de confirmación<input id="runDeleteInput" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off" required /></label></div><div id="runDeleteSecond" class="hidden"><p><strong>Paso 2 de 2. ¿Confirmas la eliminación definitiva?</strong></p><p>Se borrarán los conteos, el resultado mensual y el historial de este inventario. No se puede deshacer. El catálogo y los trabajadores se conservarán.</p></div><p id="runDeleteError" class="form-error hidden" role="alert"></p><div class="window-actions"><button id="runDeleteCancel" class="ghost-button" type="button" data-action-tone="neutral">Cancelar</button><button id="runDeleteSubmit" class="primary-button" type="submit" data-action-tone="info">Verificar código</button></div></form>`;
  document.body.append(deleteWindow);
  $('runDeleteCancel').onclick=closeWindows;
  $('runDeleteForm').onsubmit=async event=>{
    event.preventDefault();if(!deleteToken)return;
    const submit=$('runDeleteSubmit');submit.disabled=true;$('runDeleteCancel').disabled=true;$('runDeleteError').classList.add('hidden');
    try{
      if(deleteStep===1){await api('/api/inventories/'+deleteRun+'/delete-verify','POST',{token:deleteToken,code:$('runDeleteInput').value});deleteStep=2;$('runDeleteFirst').classList.add('hidden');$('runDeleteSecond').classList.remove('hidden');submit.textContent='Sí, eliminar definitivamente';submit.dataset.actionTone='danger';}
      else {await api('/api/inventories/'+deleteRun,'DELETE',{token:deleteToken,confirm:true});closeWindows();selected=null;detail=null;auditEvents=[];await refreshState(true);await poll();toast('Inventario eliminado.');}
    }catch(error){showError($('runDeleteError'),error.message);}finally{submit.disabled=false;$('runDeleteCancel').disabled=false;}
  };
  const findingsButton=button('Actualizar estructura',openFindings);findingsButton.id='runFindings';$('runStatus').after(findingsButton);
  const exportButton=button('Descargar almacén en Excel',openWarehouseExport);exportButton.id='runWarehouseExport';findingsButton.after(exportButton);
  const findingsWindow=node('section',undefined,'floating-window wide hidden');findingsWindow.id='findingsWindow';findingsWindow.tabIndex=-1;findingsWindow.setAttribute('role','dialog');findingsWindow.setAttribute('aria-modal','true');findingsWindow.setAttribute('aria-label','Actualizar estructura');
  findingsWindow.innerHTML='<div class="window-titlebar"><h2>Actualizar estructura</h2><button id="findingsClose" type="button" class="ghost-button prominent-back">← Volver</button></div><p id="findingsHelp">Selecciona qué productos incorporar. Puedes corregir el destino y el nivel para los próximos inventarios. Los conteos originales se conservarán.</p><div id="findingsRows"></div><p id="findingsError" class="form-error hidden" role="alert"></p><div class="window-actions"><button id="findingsSave" type="button" class="primary-button">Guardar estructura para próximos inventarios</button></div>';
  document.body.append(findingsWindow);$('findingsClose').onclick=closeWindows;let findingsData=null,findingsRun=null,findingsEdits=[];
  async function openFindings(){
    findingsRun=detail.run.id;findingsData=null;findingsEdits=[];$('findingsRows').replaceChildren(node('p','Cargando hallazgos…'));$('findingsError').classList.add('hidden');$('findingsSave').disabled=true;openWindow(findingsWindow);
    try{const data=await api('/api/inventories/'+findingsRun+'/findings');findingsData=data;const destinations=new Map();for(const w of data.layout)for(const space of w.spaces)destinations.set(space.id,w.name+' / '+space.name);for(const loc of detail.run.locations||[])if(!destinations.has(loc.id))destinations.set(loc.id,loc.label+' (crear si falta)');$('findingsRows').replaceChildren();
      $('findingsHelp').textContent='Aprueba los hallazgos para incorporarlos a la estructura. Se conservan los conteos originales; las cantidades no se copian a la estructura.';
      const pendingRows=data.rows.filter(row=>!data.incorporated.includes(row.id));
      if(detail?.run.id===findingsRun){detail.incorporated=data.incorporated;render();}
      for(const row of pendingRows){
        const card=node('article',undefined,'finding-card '+rowStateClass(row));const label=node('label',undefined,'finding-select');const photo=rowPhoto(row);if(photo)card.append(photo);const check=node('input');check.type='checkbox';check.disabled=!row.productId||row.retirement?.status==='pending';label.append(check,node('strong',row.name));card.append(label,node('p',`${row.locationLabel} · Nivel ${row.level} · Cantidad ${row.quantity??'Pendiente'} · Encontrado por ${row.foundBy||row.workerName}`));
        const controls=node('div',undefined,'two-columns');const destination=node('label','Destino en la estructura');const select=node('select');for(const [id,text] of destinations)if(!text.endsWith('(crear si falta)')||id===row.locationId)select.add(new Option(text,id));select.value=row.locationId;destination.append(select);const levelLabel=node('label','Nivel');const level=node('input');level.value=row.level;level.maxLength=40;levelLabel.append(level);controls.append(destination,levelLabel);card.append(controls);$('findingsRows').append(card);findingsEdits.push({row,check,select,level});
      }
      if(!pendingRows.length)$('findingsRows').append(node('p','No hay productos pendientes de incorporar a la estructura.'));$('findingsSave').disabled=!pendingRows.some(row=>row.productId&&row.retirement?.status!=='pending')||!['open','paused','closed'].includes(detail.run.status);InventoryFormGuard.clean(findingsWindow);
    }catch(error){showError($('findingsError'),error.message);}
  }
  $('findingsSave').onclick=async()=>{const items=findingsEdits.filter(e=>e.check.checked).map(e=>({id:e.row.id,expectedRevision:e.row.revision,locationId:e.select.value,level:e.level.value}));if(!items.length){showError($('findingsError'),'Selecciona al menos un producto.');return;}$('findingsSave').disabled=true;$('findingsRows').inert=true;try{const result=await api('/api/inventories/'+findingsRun+'/findings','POST',{items,expectedRevision:findingsData.revision,runRevision:findingsData.runRevision});toast(`${result.added} incorporados · ${result.duplicates} ya estaban en la estructura`);InventoryFormGuard.clean(findingsWindow);await poll(true);await openFindings();}catch(error){showError($('findingsError'),error.message);$('findingsSave').disabled=false;}finally{$('findingsRows').inert=false;}};
  const warehouseExportWindow=node('section',undefined,'floating-window compact hidden');warehouseExportWindow.id='warehouseExportWindow';warehouseExportWindow.tabIndex=-1;warehouseExportWindow.setAttribute('role','dialog');warehouseExportWindow.setAttribute('aria-modal','true');warehouseExportWindow.setAttribute('aria-label','Descargar almacén');
  warehouseExportWindow.innerHTML='<h2>Descargar almacén en Excel</h2><p>Una hoja por andamio o espacio, con nivel, código, nombre y cantidad encontrada en este inventario. Los productos sin código dejan esa celda vacía.</p><label>Almacén<select id="warehouseExportSelect"></select></label><p id="warehouseExportError" class="form-error hidden" role="alert"></p><div class="window-actions"><button id="warehouseExportClose" type="button" class="ghost-button" data-action-tone="neutral">Volver</button><button id="warehouseExportSave" type="button" class="primary-button" data-action-tone="info">Descargar Excel</button></div>';
  document.body.append(warehouseExportWindow);$('warehouseExportClose').onclick=closeWindows;let exportRun=null;
  function openWarehouseExport(){exportRun=detail.run.id;$('warehouseExportSelect').replaceChildren(...[...new Set((detail.run.locations||[]).map(l=>l.warehouse))].map(w=>new Option(w,w)));$('warehouseExportError').classList.add('hidden');openWindow(warehouseExportWindow);}
  $('warehouseExportSave').onclick=async()=>{$('warehouseExportSave').disabled=true;try{const result=await api('/api/inventories/'+exportRun+'/warehouse-export?warehouse='+encodeURIComponent($('warehouseExportSelect').value));const bytes=Uint8Array.from(atob(result.xlsx),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Excel del almacén preparado.');}catch(error){showError($('warehouseExportError'),error.message);}finally{$('warehouseExportSave').disabled=false;}};
  const workerEntry=button('Inventarios abiertos · Lista y conteo libre',()=>open(),'primary-button');workerEntry.id='openRunsWorker';
  $('workerRegister').prepend(workerEntry);

  const importWindow=node('section',undefined,'floating-window wide hidden');importWindow.id='runImportWindow';importWindow.tabIndex=-1;
  importWindow.setAttribute('role','dialog');importWindow.setAttribute('aria-modal','true');importWindow.setAttribute('aria-labelledby','runImportTitle');
  importWindow.innerHTML=`<div class="window-titlebar"><h2 id="runImportTitle">Importar lista de Excel</h2><button id="runImportClose" type="button" class="icon-button" aria-label="Cerrar" data-action-tone="neutral">×</button></div>
    <p id="runImportDestination" class="runs-help"></p><p class="muted-note">Se importan productos y niveles. Todas las cantidades quedan pendientes para que las cuente el trabajador. El archivo original no cambia.</p>
    <label>Archivo Excel (.xlsx, hasta 4 MB)<input id="runExcelFile" type="file" accept=".xlsx" /></label>
    <p id="runImportError" class="form-error hidden" role="alert"></p><div id="runExcelMapping" class="hidden">
    <div class="two-columns"><label>Hoja<select id="runExcelSheet"></select></label><label>Fila de encabezados<input id="runExcelHeader" type="number" min="1" step="1" value="1" /></label></div>
    <div class="two-columns"><label>Nombre de producto<select id="runExcelName"></select></label><label>Código / SKU (opcional)<select id="runExcelSku"></select></label><label>Nivel<select id="runExcelLevel"></select></label><label id="runExcelDefaultLabel">Nivel para todos los productos<input id="runExcelDefault" maxlength="40" placeholder="Ej.: 1" /></label><label>Columna de estante (opcional)<select id="runExcelShelf"></select></label><label id="runExcelShelfLabel">Estante de este Excel<select id="runExcelShelfValue"></select></label></div>
    <p id="runExcelSummary" class="runs-help" role="status"></p><div class="table-wrap run-import-preview"><table><thead><tr><th>Fila</th><th>Nivel</th><th>Producto</th><th>Código</th><th>Cantidad</th></tr></thead><tbody id="runExcelPreview"></tbody></table></div></div>
    <div class="window-actions"><button id="runImportCancel" type="button" class="ghost-button" data-action-tone="neutral">Cancelar</button><button id="runImportSave" type="button" class="primary-button" disabled>Importar productos por contar</button></div>`;
  document.body.append(importWindow);
  let excelSheets=[],excelFile=null,excelRun=null,excelRevision=null,excelOperation=null,excelSignature=null,excelLoading=0,excelSaving=false;
  const excelColumn=id=>$(id).value===''?null:Number($(id).value);
  function excelSheet(){return excelSheets.find(s=>s.name===$('runExcelSheet').value);}
  function excelPayload(){return {file:excelFile,sheet:$('runExcelSheet').value,headerRow:Number($('runExcelHeader').value),columns:{name:excelColumn('runExcelName'),level:excelColumn('runExcelLevel'),sku:excelColumn('runExcelSku'),shelf:excelColumn('runExcelShelf')},defaultLevel:$('runExcelDefault').value,shelfValue:$('runExcelShelfValue').value,expectedRevision:excelRevision};}
  function excelPreview(){
    const sheet=excelSheet(),p=excelPayload(),cols=p.columns;
    const body=$('runExcelPreview');body.replaceChildren();$('runImportSave').disabled=true;
    $('runExcelDefaultLabel').classList.toggle('hidden',cols.level!==null);$('runExcelShelfLabel').classList.toggle('hidden',cols.shelf===null);
    if(!sheet)return;
    const indexes=Object.values(cols).filter(v=>v!==null);
    if(cols.name===null||new Set(indexes).size!==indexes.length||!Number.isInteger(p.headerRow)||p.headerRow<1||p.headerRow>=sheet.rows.length){$('runExcelSummary').textContent='Selecciona encabezados y columnas diferentes; el nombre del producto es obligatorio.';return;}
    if(cols.shelf!==null&&!p.shelfValue){$('runExcelSummary').textContent='Elige el estante del Excel que corresponde a la ubicación indicada arriba.';return;}
    const rows=sheet.rows.slice(p.headerRow).map((r,i)=>({r,number:p.headerRow+i+1})).filter(({r})=>r.some(Boolean)&&(cols.shelf===null||r[cols.shelf]===p.shelfValue));
    let invalid=0;
    rows.forEach(({r,number},index)=>{
      const name=r[cols.name]||'',level=cols.level===null?p.defaultLevel.trim():r[cols.level]||'',sku=cols.sku===null?'':r[cols.sku]||'';
      if(!name||name.length>200||!level||level.length>40||sku.length>100)invalid++;
      if(index<30){const tr=node('tr');tr.append(node('td',String(number)),node('td',level||'Falta nivel'),node('td',name||'Falta producto'),node('td',sku||'—'),node('td','Por contar'));body.append(tr);}
    });
    $('runExcelSummary').textContent=`${rows.length} productos para esta ubicación. ${rows.length>30?'Vista previa de los primeros 30. ':''}${invalid?`${invalid} filas incompletas: revisa producto y nivel.`:'Las cantidades del Excel se omiten.'}`;
    $('runImportSave').disabled=excelSaving||!rows.length||!!invalid;
  }
  function excelShelves(){
    const col=excelColumn('runExcelShelf'),sheet=excelSheet();
    const values=col===null?[]:[...new Set((sheet?.rows||[]).slice(Number($('runExcelHeader').value)).map(r=>r[col]).filter(Boolean))];
    $('runExcelShelfValue').replaceChildren(new Option('Selecciona el estante…',''),...values.map(v=>new Option(v,v)));excelPreview();
  }
  function excelColumns(){
    const sheet=excelSheet(),header=Number($('runExcelHeader').value);
    const headers=sheet?.rows[header-1]||[],width=Math.max(0,...(sheet?.rows||[]).map(r=>r.length));
    const aliases={Name:['producto','nombre','nombre de producto','nombre del producto','descripcion'],Sku:['sku','codigo','codigo de producto'],Level:['nivel','division'],Shelf:['estante','ubicacion','ubicacion estante']};
    for(const [key,words] of Object.entries(aliases)){
      const select=$('runExcel'+key);select.replaceChildren(new Option(key==='Name'?'Selecciona columna…':key==='Level'?'Indicar un nivel para todos':key==='Shelf'?'Toda la hoja pertenece a esta ubicación':'Sin código',''));
      for(let i=0;i<width;i++)select.append(new Option(`${i+1} · ${headers[i]||'Sin título'}`,String(i)));
      const found=headers.findIndex(h=>words.includes(normalizeText(h)));if(found>=0)select.value=String(found);
    }
    excelShelves();
  }
  function openExcel(){
    excelLoading++;excelRun=selected;excelRevision=detail.run.revision;excelSheets=[];excelFile=null;excelSignature=null;excelOperation=null;
    $('runExcelFile').value='';$('runExcelFile').disabled=false;$('runExcelDefault').value='';$('runExcelMapping').classList.add('hidden');$('runImportError').classList.add('hidden');$('runImportSave').disabled=true;
    $('runImportDestination').textContent='Destino: '+detail.run.locationLabel+' · '+detail.run.title;
    openWindow(importWindow);
  }
  $('runImport').onclick=openExcel;
  for(const id of ['runImportClose','runImportCancel'])$(id).onclick=()=>{if(!excelSaving&&closeWindows())excelLoading++;};
  $('runExcelFile').onchange=async()=>{
    const ticket=++excelLoading,file=$('runExcelFile').files[0];excelFile=null;excelSheets=[];$('runImportSave').disabled=true;$('runExcelMapping').classList.add('hidden');$('runImportError').classList.add('hidden');
    if(!file)return;
    if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>4*1024*1024){showError($('runImportError'),'Selecciona un archivo .xlsx de hasta 4 MB.');return;}
    $('runExcelFile').disabled=true;const done=InventoryFormGuard.beginWork();
    try{
      const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('No se pudo leer el archivo.'));reader.readAsDataURL(file);});
      const result=await api('/api/inventories/excel-preview','POST',{file:encoded});
      if(ticket!==excelLoading)return;
      excelFile=encoded;excelSheets=result.sheets;$('runExcelSheet').replaceChildren(...excelSheets.map(s=>new Option(s.name,s.name)));$('runExcelHeader').value='1';$('runExcelMapping').classList.remove('hidden');excelColumns();
    }catch(error){if(ticket===excelLoading)showError($('runImportError'),error.message);}finally{if(ticket===excelLoading)$('runExcelFile').disabled=false;done();}
  };
  $('runExcelSheet').onchange=()=>{$('runExcelHeader').value='1';excelColumns();};$('runExcelHeader').oninput=excelColumns;
  $('runExcelShelf').onchange=excelShelves;
  for(const id of ['runExcelName','runExcelLevel','runExcelSku','runExcelShelfValue'])$(id).onchange=excelPreview;
  $('runExcelDefault').oninput=excelPreview;
  $('runImportSave').onclick=async()=>{
    if(excelSaving||!excelFile)return;const payload=excelPayload(),signature=JSON.stringify(payload);
    if(signature!==excelSignature){excelOperation=InventoryOffline.id();excelSignature=signature;}
    excelSaving=true;importWindow.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);$('runImportError').classList.add('hidden');
    try{const result=await api('/api/inventories/'+excelRun+'/import','POST',{...payload,operationId:excelOperation});closeWindows({saved:true});toast(`${result.imported} productos importados. Las cantidades quedan por contar.`);await poll();}
    catch(error){showError($('runImportError'),error.message);}
    finally{excelSaving=false;importWindow.querySelectorAll('input,select,button').forEach(e=>e.disabled=false);excelPreview();}
  };

  function stopNative(){
    if(camera)InventoryOffline.stopScan(camera).catch(()=>{});
    camera=null;voice=null;$('runStopCamera').classList.add('hidden');
    cameraReadings.reset();cameraReview.classList.add('hidden');
  }
  function workerCanGoBack(){return !!(workerWarehouse||(workerCompany&&detail?.run.empresas?.length>1));}
  function closeEditor(options){if(closeWindows(options))stopNative();}
  function close(){if($('workerTasksDrawer')?.open)$('workerTasksDrawer').close();if($('preparationDialog')?.open)$('preparationDialog').close();opened=false;selected=null;detail=null;stopNative();page.classList.add('hidden');document.body.classList.remove('runs-open');if($('openRunsAdmin').classList.contains('active')){ $('openRunsAdmin').classList.remove('active');$('openRunsAdmin').removeAttribute('aria-current');const home=document.querySelector('.side-nav a[href="#inventoryArea"]');home.classList.add('active');home.setAttribute('aria-current','page'); }pulse();}
  async function open(){
    if(!state.user)return;
    assignmentWindow.classList.add('hidden');editor.classList.add('hidden');
    owner=state.user.id;preparedWork=null;autoSaved=false;noticeRecord=null;viewedNotices={};
    opened=true;page.classList.remove('hidden');document.body.classList.add('runs-open');setSidebar(false);
    setTimeout(()=>{if(opened&&!isWorker())document.querySelectorAll('.side-nav a').forEach(link=>{const active=link.id==='openRunsAdmin';link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});},0);
    $('runsCreate').classList.toggle('hidden',isWorker());$('runsPeoplePanel').classList.toggle('hidden',isWorker());
    monthlyManagement.classList.add('hidden');$('managementMonth').value=state.month;$('managementMonth').max=state.currentMonth;
    page.querySelector('.runs-heading h1').textContent=isWorker()?'Inventario de trabajo':'Gestión';
    page.querySelector('.runs-heading h1+p').textContent=isWorker()?'Participa en el inventario abierto por el administrador.':'Abre el inventario del equipo, elige su tipo y supervisa el trabajo en tiempo real.';
    await poll();pulse();
  }
  let connectionOffline=false,lastServerSync=0,downloadedAt=0,downloadedGrants={},preparedWork=null,autoSaved=false;
  function preparationSpaces(data=detail){
    const spaces=data?.spaces||[],mine=spaces.filter(s=>s.reservation?.worker_id===state.user?.id&&['reserved','completed'].includes(s.reservation.status));
    return new Set((mine.length?mine:spaces.filter(s=>!s.reservation||s.reservation.status==='available')).map(s=>s.locationId));
  }
  function preparationRows(data=detail){const spaces=preparationSpaces(data);return (data?.rows||[]).filter(r=>spaces.has(r.locationId)&&!r.retired);}
  function preparationKey(data=detail){
    if(!data)return '';const spaces=preparationSpaces(data);
    return JSON.stringify([data.run.id,data.restoreEpoch,data.run.mode,(data.run.locations||[]).filter(p=>spaces.has(p.id)).map(p=>[p.id,p.empresa_id,p.warehouse,p.name]),preparationRows(data).filter(r=>r.prepared).map(r=>[r.id,r.productId,r.name,r.level,r.evidenceImage||'',state.products.find(p=>p.id===r.productId)?.image||'']),(data.spaces||[]).filter(s=>spaces.has(s.locationId)&&s.reservation?.worker_id===state.user?.id).map(s=>[s.locationId,s.reservation.token])]);
  }
  function spacePreparationKey(id,data=detail){
    const all=JSON.parse(preparationKey(data));
    return JSON.stringify([all[0],all[1],all[2],all[3].filter(p=>p[0]===id),all[4].filter(p=>(data.rows||[]).some(r=>r.id===p[0]&&r.locationId===id)),all[5].filter(p=>p[0]===id)]);
  }
  function preparedKeys(){
    if(preparedWork?.spaceKeys)return preparedWork.spaceKeys;
    // Older installations stored one key for all downloaded spaces.
    try{const all=JSON.parse(preparedWork?.key);return Object.fromEntries(all[3].map(place=>[place[0],JSON.stringify([all[0],all[1],all[2],[place],[],all[5].filter(grant=>grant[0]===place[0])])]));}catch{}
    return {};
  }
  function preparationIdentity(key){
    // Counts, retirement decisions and row order change during normal work.
    // Only a different inventory, restore or assignment requires preparation again.
    try{const value=JSON.parse(key);return JSON.stringify([value[0],value[1],value[2],value[3].map(p=>p[0]).sort(),value[5].slice().sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);}catch{return null;}
  }
  function missingPreparation(){
    const keys=preparedKeys();
    return [...preparationSpaces()].filter(id=>{
      const reservation=detail.spaces?.find(space=>space.locationId===id)?.reservation;
      // Completed work is read-only until explicitly reopened/reassigned.
      // Administrative review must never force the worker to prepare it again.
      if(reservation?.worker_id===state.user?.id&&reservation.status==='completed')return false;
      return !keys[id]||preparationIdentity(keys[id])!==preparationIdentity(spacePreparationKey(id));
    });
  }
  const needsPreparation=(id)=>isWorker()&&detail?.run.mode==='guided'&&(id?missingPreparation().includes(id):missingPreparation().length>0);
  const hasReadySpaces=()=>[...preparationSpaces()].some(id=>!needsPreparation(id));
  let preparationRequested=false,preparationTarget=null;
  const assignedPreparation=()=>detail?.spaces?.some(s=>s.reservation?.status==='reserved'&&s.reservation.worker_id===state.user?.id);
  const preparationSelection=()=>missingPreparation().filter(id=>!preparationTarget||id===preparationTarget);


  function connection(text,error=false){$('runsConnection').textContent=text;$('runsConnection').classList.toggle('error',error);}
  async function cacheRun(strict=false,extraSpaces=new Set()){
    if(!state.user||!listing)return;
    try{await InventoryOffline.runSnapshot(state.user.id,{listing,detail:isWorker()&&detail?.run.mode==='guided'?{...detail,rows:preparationRows().filter(r=>preparedKeys()[r.locationId]||extraSpaces.has(r.locationId))}:detail,selected,workerCompany,workerWarehouse,workerSpace,downloadedAt,lastServerSync,downloadedGrants});}catch(error){if(strict)throw error;toast('No se pudo conservar el inventario para volver a abrirlo sin conexión.',true);}
  }
  function localRows(){
    let rows=(detail?.rows||[]).map(row=>({...row}));
    for(const entry of pendingEntries.filter(e=>e.runId===detail?.run.id&&e.action==='submit-space')){
      rows=rows.filter(r=>r.locationId!==entry.payload.locationId||r.retired);
      rows.push(...entry.payload.items.map(p=>({...p,id:p.id||p.localId,revision:p.expectedRevision,runId:entry.runId,locationId:entry.payload.locationId,workerName:entry.workerName,role:'worker',localDraft:true,localPending:entry,retirement:p.retirementReason?{status:'pending',workerName:entry.workerName,reason:p.retirementReason}:p.retirement})));
    }
    for(const entry of pendingEntries.filter(e=>e.runId===detail?.run.id)){
      if(['submit-space','arrange-space'].includes(entry.action))continue;
      const p=entry.payload;let row=rows.find(r=>r.id===p.id);
      if(entry.action==='retirement'){
        if(row){row={...row,localPending:entry,retirement:{status:'pending',workerName:entry.workerName,reason:p.reason}};rows[rows.findIndex(r=>r.id===p.id)]=row;}
      }else{
        const value={...row,...p,id:p.id||'local-'+entry.id,name:entry.name,sku:entry.sku,workerName:entry.workerName,role:state.user.role,updatedAt:new Date(entry.createdAt).toISOString(),localPending:entry};
        if(row)rows[rows.indexOf(row)]=value;else rows.push(value);
      }
    }
    return rows;
  }
  async function pulse(){
    try{await reportDeviceReady;}catch{return;}
    if(!state.user||pulseBusy||document.hidden)return;
    pulseBusy=true;lastPulse=Date.now();const user=state.user.id;
    try{const pending=(await InventoryOffline.list()).filter(e=>e.workerId===user);const ids=new Set([...(listing?.runs||[]).map(r=>r.id),...pending.map(e=>e.runId).filter(Boolean)]);await api('/api/inventories/pulse','POST',{runId:opened?selected:null,locationId:workerSpace||null,deviceId:reportDevice,previousDeviceIds:reportAliases,pendingReports:[...ids].slice(0,100).map(id=>({runId:id,pending:pending.filter(e=>e.runId===id).length}))});}catch{}finally{pulseBusy=false;}
    if(state.user?.id!==user)owner=null;
  }
  async function poll(force=false){
    if(force)while(fetching&&opened&&state.user)await new Promise(resolve=>setTimeout(resolve,25));
    if(!opened||fetching||!state.user)return;
    fetching=true;lastPoll=Date.now();const runId=selected,user=state.user.id;
    try{
      const list=await api('/api/inventories');
      if(!opened||selected!==runId||state.user?.id!==user)return;
      const nextId=isWorker()?list.runs.find(r=>r.scope==='global'&&['open','paused'].includes(r.status))?.id||null:(list.runs.some(r=>r.id===runId)?runId:null);
      const current=nextId?await api('/api/inventories/'+nextId):null;
      if(current?.run.scope==='global'&&!isWorker()&&current.incorporated==null){
        const findings=await api('/api/inventories/'+nextId+'/findings');current.incorporated=findings.incorporated;
      }
      if(!opened||selected!==runId||state.user?.id!==user)return;
      if(nextId!==selected&&!rowWindow.classList.contains('hidden')&&(saving||InventoryFormGuard.isDirty(rowWindow))){
        rowRunChanged=true;
        showError($('runRowError'),'El inventario cambió en la PC. Esta cantidad pertenece al inventario anterior. Conserva el dato y cierra el formulario antes de entrar al nuevo.');
        connection('El inventario cambió en otra sesión. Tu formulario se conserva; revisa o descarta los cambios antes de continuar.',true);return;
      }
      if(nextId!==selected){
        closeEditor();selected=nextId;auditEvents=[];olderLoaded=false;workerSpace='';workerWarehouse='';workerCompany='';
        if(isWorker()){
          // A new inventory has its own download grants and preparation prompt.
          // Keep the previous run's durable preparation under its run-specific key,
          // but never carry its transient download state into the next run.
          downloadedAt=0;downloadedGrants={};preparedWork=null;preparationRequested=false;preparationTarget=null;preparationError='';noticeRecord=null;
        }
      }
      if(isWorker()&&current?.run.status!=='open'&&!rowWindow.classList.contains('hidden'))closeEditor();
      connectionOffline=false;lastServerSync=Date.now();listing=list;detail=current;if(isWorker()&&detail?.spaces.some(s=>s.reservation?.status==='reserved'&&s.reservation.worker_id===user&&downloadedGrants[s.locationId]!==s.reservation.token))downloadedAt=0;if(!isWorker())loadBackups();
      if(isWorker()&&detail){
        await checkAssignmentNotice();
        preparedWork=await InventoryOffline.preparation(user,detail.run.id)||null;
        if(detail.run.mode==='blind'){autoSaved=false;await cacheRun(true);autoSaved=true;}else await cacheRun(true);
      }else cacheRun();
      render();
      connection('Actualizado '+new Date().toLocaleTimeString('es-PE')+(isWorker()?'':' · Actualización cada 3 segundos. Los registros pendientes se envían al conectar.'));
    }catch(e){if(!autoSaved)$('workerSavedBadge').classList.add('hidden');connectionOffline=!!e.network;if(e.network&&!detail){try{const cached=await InventoryOffline.runSnapshot(user)||JSON.parse(localStorage.getItem('inventory-run-cache-'+user));if(cached&&state.user?.id===user){listing=cached.listing;detail=cached.detail;selected=cached.selected;workerCompany=cached.workerCompany||'';workerWarehouse=cached.workerWarehouse||'';workerSpace=cached.workerSpace||'';downloadedAt=cached.downloadedAt||0;downloadedGrants=cached.downloadedGrants||{};lastServerSync=cached.lastServerSync||0;noticeRecord=await InventoryOffline.assignmentNotice(user,detail.run.id)||null;preparedWork=await InventoryOffline.preparation(user,detail.run.id)||null;autoSaved=true;render();}}catch{}}if(opened&&isWorker()&&detail)renderOfflineWork();connection(e.network?'Sin conexión con la PC · Las reservas y los cambios se conservan en este celular.':'Sin actualizar: '+e.message,true);}finally{fetching=false;}
  }
  let workerCompany='',workerWarehouse='',workerSpace='';
  const staged=()=>isWorker()&&detail?.run.scope==='global';
  const shelfEntry=()=>pendingEntries.find(e=>e.runId===selected&&e.action==='submit-space'&&e.payload.locationId===workerSpace);
  const currentReservation=()=>detail?.spaces?.find(s=>s.locationId===workerSpace)?.reservation;
  const reservationLocked=()=>!!currentReservation()&&currentReservation().status!=='available'&&((currentReservation().status==='completed'&&!shelfEntry()?.payload.offlineReopen)||currentReservation().worker_id!==state.user?.id||!['reserved','completed'].includes(currentReservation().status)||(shelfEntry()?.payload.reservationToken&&shelfEntry().payload.reservationToken!==currentReservation().token));
  const shelfLocked=()=>staged()&&(needsPreparation(workerSpace)||reservationLocked()||!!shelfEntry()&&shelfEntry().status!=='draft');
  let draftSaving=false,reviewTarget=null,shelfSubmitting=false;
  async function saveShelf(change){
    if(draftSaving)throw new Error('Espera a que termine el guardado local.');
    draftSaving=true;
    try{
      if(reservationLocked())throw new Error('Este espacio está terminado o su asignación cambió. Los pendientes se conservan para revisión.');
      const user=state.user,run=detail.run,locationId=workerSpace;
      const entries=(await InventoryOffline.list()).filter(e=>e.workerId===user.id&&e.runId===run.id&&e.payload.locationId===locationId);
      let entry=entries.find(e=>e.action==='submit-space');
      if(entries.some(e=>e.action!=='submit-space')||(entry&&entry.status!=='draft'))throw new Error('Este espacio tiene un envío pendiente. Sincronízalo o revisa el conflicto antes de editar.');
      if(!entry){const id=InventoryOffline.id();entry={id,action:'submit-space',runId:run.id,month:run.month,workerId:user.id,workerName:user.name,name:(run.locations||[]).find(l=>l.id===locationId)?.label||'Andamio',createdAt:Date.now(),status:'draft',payload:{operationId:id,restoreEpoch:detail.restoreEpoch??null,reservationToken:currentReservation()?.status==='reserved'?currentReservation().token:undefined,locationId,items:detail.rows.filter(r=>r.locationId===locationId&&!r.retired).map(r=>({...r,expectedRevision:r.revision}))}};}
      const copy=structuredClone(entry);
      if(copy.payload.levelCount==null)copy.payload.levelCount=detail.spaces?.find(s=>s.locationId===locationId)?.levelCount;
      await change(copy.payload.items,copy);
      const draftBytes=new TextEncoder().encode(JSON.stringify(copy)).length;if(draftBytes>64*1024*1024)throw new Error('Este espacio alcanza el límite de seguridad de 64 MB. Lo anterior sigue guardado; solicita dividir el espacio antes de continuar.');
      if(state.user?.id!==user.id||selected!==run.id||workerSpace!==locationId)throw new Error('Cambió el espacio o la cuenta. Vuelve a abrirlo.');
      await InventoryOffline.put(copy);await refreshPendingList();cacheRun();if(draftBytes>48*1024*1024)toast('Espacio guardado: '+(draftBytes/1024/1024).toFixed(1)+' de 64 MB. Solicita dividirlo antes de alcanzar el límite.',true);return copy;
    }finally{draftSaving=false;}
  }
  async function cancelDraftRetirement(row){
    try{await saveShelf(items=>{const item=items.find(p=>(p.id||p.localId)===row.id);delete item.retirementReason;});toast('Retiro cancelado. El producto se mantiene en el andamio.');}catch(e){toast(e.message,true);}
  }
  const withdrawal=p=>p.retirementReason||p.retirement?.status==='pending';
  const confirmPage=node('section',undefined,'floating-window hidden');confirmPage.id='shelfConfirmedWindow';confirmPage.setAttribute('role','dialog');confirmPage.setAttribute('aria-modal','true');confirmPage.tabIndex=-1;
  confirmPage.innerHTML='<div class="window-titlebar"><h2 id="shelfReviewTitle">Revisar andamio</h2><button id="shelfConfirmedClose" type="button" class="ghost-button" data-action-tone="neutral">Volver</button></div><p id="shelfConfirmedStatus"></p><div id="shelfConfirmedItems"></div><div id="shelfReviewActions"><button id="shelfConfirmSend" type="button" class="primary-button">Confirmar y enviar a la PC</button></div>';
  document.body.append(confirmPage);$('shelfConfirmedClose').onclick=()=>closeWindows();
  const reopenShelf=button('Reabrir andamio',async()=>{
    if(reopeningShelf||shelfSubmitting||draftSaving)return;
    const target=reviewTarget,user=state.user?.id;
    if(!target||target.workerId!==user||selected!==target.runId||workerSpace!==target.locationId)return;
    reopeningShelf=true;reopenShelf.disabled=true;
    try{
      await refreshPendingList();
      if(detail.run.status!=='open')throw new Error('El inventario debe estar abierto.');
      const reservation=currentReservation(),previous=shelfEntry()||target.entry;
      if(reservation?.worker_id!==user)throw new Error('Este andamio ya no esta a tu cargo.');
      const id=InventoryOffline.id(),items=previous?structuredClone(previous.payload.items):structuredClone(target.items);
      const payload={...(previous?.payload||{}),operationId:id,locationId:workerSpace,reservationToken:previous?.payload.reservationToken||reservation.token,restoreEpoch:detail.restoreEpoch??null,items,offlineReopen:true};
      payload.levelCount=previous?.payload.levelCount??target.levelCount;
      payload.replacesOperations=[...new Set([...(previous?.payload.replacesOperations||[]),...(previous?[previous.id]:[])])];
      payload.reopenBaseItems=previous?.payload.reopenBaseItems||items.map(({id,localId,name,productId,level})=>({id,localId,name,productId,level}));
      const draft={id,action:'submit-space',runId:selected,month:detail.run.month,workerId:user,workerName:state.user.name,name:previous?.name||'Andamio',createdAt:Date.now(),status:'draft',payload};
      if(previous)await InventoryOffline.replace(previous.id,draft);else await InventoryOffline.put(draft);
      await refreshPendingList();await cacheRun(true);closeWindows();render();
      toast('Andamio reabierto en este celular. Corrige o agrega productos y vuelve a confirmar.');
    }catch(e){toast(e.message,true);}
    finally{reopeningShelf=false;reopenShelf.disabled=false;}
  },'primary-button');
  let reopeningShelf=false;
  reopenShelf.id='shelfReopen';confirmPage.append(reopenShelf);
  async function openConfirmed(){
    await refreshPendingList();reviewTarget={runId:selected,locationId:workerSpace,workerId:state.user.id,restoreEpoch:detail.restoreEpoch??null};
    const items=localRows().filter(r=>r.locationId===workerSpace&&!r.retired).sort((a,b)=>Number(!!withdrawal(a))-Number(!!withdrawal(b)));
    const draft=shelfEntry()?.status==='draft';
    reviewTarget.entry=structuredClone(shelfEntry()||null);
    reviewTarget.items=detail.rows.filter(r=>r.locationId===workerSpace&&!r.retired).map(r=>({...r,expectedRevision:r.revision}));
    reviewTarget.levelCount=shelfLevelCount();
    reopenShelf.classList.toggle('hidden',!isWorker()||draft||detail.run.status!=='open'||currentReservation()?.worker_id!==state.user.id);
    reopenShelf.disabled=reopeningShelf;
    $('shelfReviewTitle').textContent=draft?'Revisar andamio':'Andamio terminado';
    $('shelfConfirmedStatus').textContent=draft?'Revisa las fotos, cantidades y retiros. Todavía no se ha enviado a la PC. Para corregir algo, pulsa Volver.':shelfEntry()?'Entrega confirmada en el celular. Pendiente de recibir en la PC.':'Información recibida por la PC.';
    $('shelfReviewActions').classList.toggle('hidden',!draft);$('shelfConfirmSend').disabled=shelfSubmitting;
    const list=$('shelfConfirmedItems');list.replaceChildren();
    const grouped=usesLevelCards(),reviewBodies=new Map();let retirementBody=null;
    list.classList.toggle('shelf-review-groups',grouped);
    if(grouped){
      const separateRetirements=detail.run.mode==='guided';
      const regular=items.filter(item=>!separateRetirements||!withdrawal(item));
      const levels=new Set(items.map(item=>String(item.level)));
      for(let i=1;i<=Number(shelfLevelCount()||0);i++)levels.add(String(i));
      const group=(title,count,retirement=false)=>{
        const card=node('details',undefined,'shelf-level-card shelf-review-group'),summary=node('summary'),label=node('span'),body=node('div',undefined,'shelf-level-content');
        card.classList.toggle('shelf-review-retirements',retirement);
        label.append(node('strong',title),node('small',count+' '+(count===1?'producto':'productos')));
        summary.append(node('span',retirement?'!':'≡','shelf-review-icon'),label,node('span','⌄','shelf-level-chevron'));
        card.append(summary,body);list.append(card);
        if(!count)body.append(node('p','Sin productos en este nivel.','shelf-level-empty'));
        return body;
      };
      for(const level of [...levels].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))){
        reviewBodies.set(level,group('Nivel '+level,regular.filter(item=>String(item.level)===level).length));
      }
      const retirements=separateRetirements?items.filter(withdrawal):[];
      if(retirements.length)retirementBody=group('Solicitudes de retiro',retirements.length,true);
    }
    for(const item of items){
      const card=node('article',undefined,'shelf-confirmed-item');card.classList.toggle('shelf-retirement',!!withdrawal(item));
      const product=state.products.find(p=>p.id===item.productId),info=node('div',undefined,'shelf-product-info');
      info.append(node('strong',item.name),node('small','Nivel '+item.level+' \u00b7 '+(item.quantity==null?'Sin conteo':item.quantity+' unidades')));
      if(withdrawal(item))info.append(node('small','Retiro solicitado','shelf-retirement-label'));
      card.append(rowPhoto(item)||node('span','Sin foto','run-no-photo'),info);
      (grouped?(withdrawal(item)&&retirementBody?retirementBody:reviewBodies.get(String(item.level))):list).append(card);
    }
    openWindow(confirmPage);
  }
  let shelfGesture=null;
  function enableShelfDrag(card){
    card.classList.add('shelf-movable');
    let gesture=null;
    const finish=async(cancel=false)=>{
      if(!gesture)return;const g=gesture;gesture=null;clearTimeout(g.timer);cancelAnimationFrame(g.frame);shelfGesture=null;card.classList.remove('shelf-moving');
      if(!g.active)return;
      const ids=Array.from($('runRows').querySelectorAll('tr[data-row-id]')).map(c=>c.dataset.rowId);
      if(cancel){render();return;}
      try{await saveShelf(items=>{const positions=new Map(ids.map((id,i)=>[id,i]));items.sort((a,b)=>(positions.get(a.id||a.localId)??Infinity)-(positions.get(b.id||b.localId)??Infinity));});render();}
      catch(e){render();toast(e.message,true);}
    };
    const move=(x,y)=>{
      const g=gesture;if(!g)return;
      if(!g.active){if(Math.hypot(x-g.x,y-g.y)>10)finish(true);return;}
      const direction=Math.sign(y-g.y)||g.direction;g.direction=direction;g.moved=true;g.x=x;g.y=y;
      const target=document.elementFromPoint(x,y)?.closest('#runRows tr');
      if(target&&target!==card&&target.parentElement===card.parentElement&&!target.classList.contains('run-retirement-pending')){
        const box=target.getBoundingClientRect(),cards=Array.from(card.parentElement.children),from=cards.indexOf(card),to=cards.indexOf(target);
        if(direction<0&&to<from&&y<box.top+box.height/2)card.parentElement.insertBefore(card,target);
        if(direction>0&&to>from&&y>box.top+box.height/2)card.parentElement.insertBefore(card,target.nextSibling);
      }
    };
    const start=(e,x,y)=>{
      if(e.target.closest('button,input,a')||shelfGesture||draftSaving||shelfLocked())return;
      const g={x,y,active:false};gesture=g;shelfGesture=g;
      g.timer=setTimeout(()=>{
        if(gesture!==g||shelfLocked()||!card.isConnected){finish(true);return;}
        g.active=true;card.classList.add('shelf-moving');navigator.vibrate?.(25);
        const scroll=()=>{if(gesture!==g)return;const amount=!g.moved?0:g.y<85?-12:g.y>innerHeight-85?12:0;if(amount){page.scrollTop+=amount;window.scrollBy(0,amount);move(g.x,g.y);}g.frame=requestAnimationFrame(scroll);};scroll();
      },450);
    };
    card.addEventListener('touchstart',e=>{if(e.touches.length===1)start(e,e.touches[0].clientX,e.touches[0].clientY);else finish(true);},{passive:true});
    card.addEventListener('touchmove',e=>{if(gesture?.active)e.preventDefault();if(e.touches.length===1)move(e.touches[0].clientX,e.touches[0].clientY);else finish(true);},{passive:false});
    card.addEventListener('touchend',()=>finish());card.addEventListener('touchcancel',()=>finish(true));
    card.onpointerdown=e=>{if(e.pointerType==='touch'||e.button!==0)return;start(e,e.clientX,e.clientY);if(gesture)card.setPointerCapture(e.pointerId);};
    card.onpointermove=e=>{if(e.pointerType!=='touch')move(e.clientX,e.clientY);};
    card.onpointerup=e=>{if(e.pointerType!=='touch')finish();};card.onpointercancel=e=>{if(e.pointerType!=='touch')finish(true);};
    card.oncontextmenu=e=>e.preventDefault();card.ondragstart=e=>e.preventDefault();
  }
  async function finishShelf(){
    if(draftSaving||saving||retirementBusy)return;
    try{
      if(usesLevelCards()&&detail.run.mode==='blind'&&!shelfLevelCount()&&!localRows().some(r=>r.locationId===workerSpace&&!r.retired)){
        $('shelfLevelCount').focus();throw new Error('Primero indica cuántos niveles tiene este andamio.');
      }
      if(!shelfEntry())await saveShelf(()=>{});
      const entry=shelfEntry();if(entry.status==='conflict')throw new Error(entry.error+' Tu entrega se conserva en Ver pendientes.');
      if(entry.status==='draft'&&entry.payload.items.some(p=>p.quantity==null&&!withdrawal(p)))throw new Error('Faltan cantidades. Completa los productos o solicita su retiro antes de terminar.');
      await openConfirmed();
    }catch(e){toast(e.message,true);}
  }
  $('shelfConfirmSend').onclick=async()=>{
    if(shelfSubmitting||draftSaving)return;
    const target=reviewTarget,user=state.user?.id;
    if(!target||target.workerId!==user||selected!==target.runId||workerSpace!==target.locationId)return;
    shelfSubmitting=true;$('shelfConfirmSend').disabled=true;
    try{
      await saveShelf((items,copy)=>{if(items.some(p=>p.quantity==null&&!withdrawal(p)))throw new Error('Faltan cantidades. Vuelve al andamio para completarlas.');items.sort((a,b)=>Number(!!withdrawal(a))-Number(!!withdrawal(b)));copy.status='pending';});
      $('shelfReviewActions').classList.add('hidden');$('shelfReviewTitle').textContent='Andamio terminado';$('shelfConfirmedStatus').textContent='Entrega guardada en este celular. Pendiente de recibir en la PC. Puedes continuar otro espacio.';
      toast('Andamio guardado. Puedes continuar otro espacio; se enviará al conectar.');
      // Only the durable local write blocks navigation. A slow PC or VPN must
      // not keep shelfSubmitting set while the worker moves to another space.
      syncCounts().then(async()=>{
        if(state.user?.id===user&&selected===target.runId&&workerSpace===target.locationId&&reviewTarget===target&&!confirmPage.classList.contains('hidden'))await openConfirmed();
      }).catch(()=>{});
    }catch(e){toast(e.message,true);}finally{shelfSubmitting=false;$('shelfConfirmSend').disabled=false;}
  };
  let reportDevice;try{reportDevice=localStorage.getItem('inventory-report-device');if(!reportDevice){reportDevice=InventoryOffline.id();localStorage.setItem('inventory-report-device',reportDevice);}}catch{reportDevice=InventoryOffline.id();}
  let reportAliases=[];try{reportAliases=JSON.parse(localStorage.getItem('inventory-report-aliases')||'[]');}catch{}
  const reportDeviceReady=InventoryOffline.reportDevice?InventoryOffline.reportDevice(reportDevice).then(id=>{if(id!==reportDevice){reportAliases=[...new Set([...reportAliases,reportDevice])].slice(-10);localStorage.setItem('inventory-report-aliases',JSON.stringify(reportAliases));}reportDevice=id;localStorage.setItem('inventory-report-device',id);}):Promise.resolve();
  async function chooseSpace(place){
    if(needsPreparation(place.id)){preparationTarget=place.id;preparationRequested=true;preparationError='';renderOfflineWork();return;}
    const current=detail.spaces?.find(s=>s.locationId===place.id),reservation=current?.reservation;
    if(reservation?.status==='completed'){
      if(reservation.worker_id!==state.user.id){toast('Recibido en PC. Solo el administrador puede solicitar un reconteo.',true);return;}
      workerSpace=place.id;await cacheRun();render();page.scrollTop=0;return;
    }
    if(reservation?.status==='reserved'&&reservation.worker_id!==state.user.id){toast('Reservado para '+reservation.worker_name+'.',true);return;}
    const enter=async()=>{workerSpace=place.id;await cacheRun(true);render();page.scrollTop=0;};
    if(reservation?.status==='reserved'&&reservation.worker_id===state.user.id&&(connectionOffline||!navigator.onLine)){await enter();return;}
    try{
      const result=await api('/api/inventories/'+selected+'/spaces','POST',{locationId:place.id,action:'claim',reservationToken:reservation?.status==='reserved'?reservation.token:undefined});
      const wasPrepared=detail.run.mode==='guided'&&!needsPreparation(place.id)&&preparationSpaces().has(place.id),previousKeys=preparedKeys();detail.spaces=result.spaces;
      if(wasPrepared){preparedWork={...preparedWork,key:preparationKey(),spaceKeys:{...previousKeys,[place.id]:spacePreparationKey(place.id)}};await InventoryOffline.preparation(state.user.id,selected,preparedWork);}
      await enter();await poll();pulse();
    }catch(error){
      if(error.network&&reservation?.status==='reserved'&&reservation.worker_id===state.user.id){connectionOffline=true;await enter();toast('Sin conexión: reserva conservada. Puedes continuar tus espacios.');}
      else toast(error.network?'Necesitas conexión para tomar un espacio nuevo. Abre el inventario con conexión antes de bajar.':error.message,true);
    }
  }
  const leaveWindow=node('section',undefined,'floating-window compact hidden');leaveWindow.id='leaveSpaceWindow';leaveWindow.tabIndex=-1;leaveWindow.setAttribute('role','dialog');leaveWindow.setAttribute('aria-modal','true');leaveWindow.setAttribute('aria-labelledby','leaveSpaceTitle');
  leaveWindow.innerHTML='<h2 id="leaveSpaceTitle">¿Liberar este espacio?</h2><p id="leaveSpaceMessage"></p><p>Los conteos guardados se conservarán. Otro trabajador podrá continuar.</p><p id="leaveSpaceError" class="form-error hidden" role="alert"></p><div class="window-actions"><button id="leaveSpaceCancel" type="button" class="ghost-button" data-action-tone="neutral">Seguir contando</button><button id="leaveSpaceConfirm" type="button" class="primary-button" data-action-tone="warning">Sí, liberar y volver</button></div>';
  document.body.append(leaveWindow);let leavingSpace=null;
  $('leaveSpaceCancel').onclick=closeWindows;
  async function askLeaveSpace(){
    if(draftSaving||saving||shelfSubmitting){toast('Espera a que termine el guardado.',true);return;}
    try{
      const shared=!currentReservation()||currentReservation().status==='available',entry=shelfEntry();
      if(shared){
        if(entry?.status==='draft'){
          await api('/api/inventories/'+selected+'/submit-space','POST',{...entry.payload,partial:true});
          await InventoryOffline.remove(entry.id);await refreshPendingList();
        }
        const result=await api('/api/inventories/'+selected+'/spaces','POST',{locationId:workerSpace,action:'release'});detail.spaces=result.spaces;
      }
      await cacheRun(true);workerSpace='';await cacheRun(true);await poll(true);render();pulse();page.scrollTop=0;
      toast(shared?'Avance guardado. Otro trabajador puede continuar el andamio.':'Reserva y borradores conservados. Puedes continuar otro espacio.');
    }
    catch(error){toast(error.message,true);}
  }



  const placePanel=node('section',undefined,'run-place-panel');placePanel.id='runPlacePanel';$('runHelp').after(placePanel);
  const rowsBody=$('runRows'),rowsTable=rowsBody.closest('table'),rowsViewport=rowsTable.parentElement;
  const levelRows=node('div',undefined,'shelf-level-groups');
  const levelControls=node('section',undefined,'shelf-level-controls hidden');rowsViewport.before(levelControls);
  levelControls.innerHTML='<div class="shelf-level-toolbar"><span>Productos por nivel</span><button id="assignShelfLevels" type="button" class="ghost-button">Asignar niveles</button></div><form id="shelfLevelsForm" class="hidden"><label for="shelfLevelCount">¿Cuántos niveles tiene este andamio?</label><p>Se mostrarán del mayor al menor. Los productos guardados se conservan.</p><div class="shelf-level-input"><input id="shelfLevelCount" type="number" inputmode="numeric" min="1" max="100" step="1" required placeholder="Ej.: 6"/><button type="submit" class="primary-button">Guardar niveles</button></div><p id="shelfLevelsError" class="form-error hidden" role="alert"></p><button id="cancelShelfLevels" type="button" class="ghost-button">Cancelar</button></form>';
  if(androidVersion>0){
    const input=$('shelfLevelCount');input.readOnly=true;input.inputMode='none';
    input.addEventListener('focus',dismissNumericKeyboard);input.addEventListener('click',dismissNumericKeyboard);
    const pad=node('div',undefined,'shelf-level-count-pad');pad.id='shelfLevelCountPad';pad.setAttribute('role','group');pad.setAttribute('aria-label','Teclado de cantidad de niveles');
    for(const key of ['1','2','3','4','5','6','7','8','9','⌫','0','Limpiar']){
      const digit=button(key,()=>{const old=input.value;const next=key==='⌫'?old.slice(0,-1):key==='Limpiar'?'':old==='0'?key:old+key;if(next.length<=3)input.value=next;input.dispatchEvent(new Event('input',{bubbles:true}));$('shelfLevelsError').classList.add('hidden');dismissNumericKeyboard();});
      if(key==='⌫')digit.setAttribute('aria-label','Borrar último dígito');pad.append(digit);
    }
    $('shelfLevelsForm').querySelector('.shelf-level-input').after(pad);
  }
  let levelViewKey='',levelEditorKey=null,levelBodies=new Map();
  const usesLevelCards=()=>androidVersion>0&&isWorker()&&detail?.run.scope==='global';
  const usesAdminLevelCards=()=>!isWorker()&&detail?.run.scope==='global';
  let adminRowBodies=new Map();
  const shelfLevelCount=()=>shelfEntry()?.payload.levelCount??detail?.spaces?.find(s=>s.locationId===workerSpace)?.levelCount;
  const levelKey=()=>[state.user?.id,selected,workerSpace].join('/');
  function prepareLevelHost(){
    const key=usesAdminLevelCards()?[state.user?.id,selected,adminSpace].join('/'):levelKey(),open=new Set(levelViewKey===key?[...levelRows.querySelectorAll('details[open]')].map(e=>e.dataset.level):[]);
    levelViewKey=key;
    const grouped=usesLevelCards()||usesAdminLevelCards();rowsViewport.classList.toggle('shelf-level-view',grouped);
    levelRows.classList.toggle('management-level-groups',usesAdminLevelCards());
    if(grouped&&rowsBody.id==='runRows'){rowsBody.removeAttribute('id');levelRows.id='runRows';rowsViewport.replaceChildren(levelRows);}
    else if(!grouped&&levelRows.id==='runRows'){levelRows.removeAttribute('id');rowsBody.id='runRows';rowsViewport.replaceChildren(rowsTable);}
    levelControls.classList.toggle('hidden',!usesLevelCards()||!workerSpace);
    return open;
  }
  $('assignShelfLevels').onclick=()=>{
    levelEditorKey=levelKey();$('shelfLevelCount').value=shelfLevelCount()||'';
    $('shelfLevelsError').classList.add('hidden');render();$('shelfLevelCount').focus();
  };
  $('cancelShelfLevels').onclick=()=>{levelEditorKey=null;render();};
  $('shelfLevelsForm').onsubmit=async event=>{
    event.preventDefault();if(draftSaving||shelfLocked())return;
    const count=Number($('shelfLevelCount').value);
    if(!Number.isInteger(count)||count<1||count>100){showError($('shelfLevelsError'),'Indica entre 1 y 100 niveles.');return;}
    if(localRows().some(r=>r.locationId===workerSpace&&!r.retired&&/^\d+$/.test(r.level)&&Number(r.level)>count)){
      showError($('shelfLevelsError'),'Hay productos en un nivel superior. No puedes ocultar un nivel que contiene productos.');return;
    }
    $('shelfLevelsForm').inert=true;
    try{await saveShelf((items,copy)=>{copy.payload.levelCount=count;});levelEditorKey=null;render();toast('Niveles guardados en este celular.');}
    catch(error){showError($('shelfLevelsError'),error.message);}
    finally{$('shelfLevelsForm').inert=false;}
  };
  function createLevelCards(rows,open){
    levelBodies=new Map();adminRowBodies=new Map();
    if(usesAdminLevelCards()){createAdminLevelCards(rows,open);return;}
    if(!usesLevelCards()||!workerSpace)return;
    const count=shelfLevelCount(),levels=new Set(rows.map(r=>r.level));
    if(Number.isInteger(count))for(let n=1;n<=count;n++)levels.add(String(n));
    const setup=detail.run.mode==='blind'&&!levels.size;
    const editing=setup||levelEditorKey===levelKey();
    $('shelfLevelsForm').classList.toggle('hidden',!editing);
    $('cancelShelfLevels').classList.toggle('hidden',setup);
    $('assignShelfLevels').disabled=shelfLocked()||detail.run.status!=='open';
    $('shelfLevelsForm').querySelector('button[type=submit]').disabled=shelfLocked()||detail.run.status!=='open';
    if(setup&&levelEditorKey!==levelKey()){$('shelfLevelCount').value='';$('shelfLevelsError').classList.add('hidden');levelEditorKey=levelKey();}
    $('runAdd').classList.add('hidden');$('runEmpty').classList.add('hidden');
    for(const level of [...levels].sort((a,b)=>b.localeCompare(a,'es',{numeric:true,sensitivity:'base'}))){
      const items=rows.filter(r=>r.level===level),pending=items.filter(r=>r.quantity==null&&!withdrawal(r)).length;
      const card=node('details',undefined,'shelf-level-card');card.dataset.level=level;card.open=open.has(level);
      const summary=node('summary'),copy=node('span');copy.append(node('strong','Nivel '+level),node('small',items.length+' '+(items.length===1?'producto':'productos')+(pending?' · '+pending+' por contar':'')));
      summary.append(cardIcon('box'),copy,node('span','⌄','shelf-level-chevron'));card.append(summary);
      const content=node('div',undefined,'shelf-level-content'),table=node('table',undefined,'runs-table'),body=node('tbody');table.append(body);content.append(table);levelBodies.set(level,body);
      if(!items.length)content.append(node('p','Todavía no hay productos en este nivel.','shelf-level-empty'));
      const add=button('+ Agregar producto',()=>editRow(null,level),'primary-button');add.classList.add('shelf-level-add');add.disabled=detail.run.status!=='open'||shelfLocked();content.append(add);card.append(content);levelRows.append(card);
    }
    if(!levels.size&&!setup)levelRows.append(node('p','No hay niveles preparados. Usa «Asignar niveles» para agregar uno.','runs-help'));
  }
  function createAdminLevelCards(rows,open){
    const category=row=>'level:'+row.level;
    const groups=new Map();
    for(const row of rows){const key=category(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    const levels=[...new Set(rows.map(row=>row.level))];
    const count=detail.spaces?.find(space=>space.locationId===adminSpace)?.levelCount;
    for(let n=1;n<=Number(count||0);n++)if(!levels.includes(String(n)))levels.push(String(n));
    for(const level of levels)if(!groups.has('level:'+level))groups.set('level:'+level,[]);
    const keys=levels.sort((a,b)=>b.localeCompare(a,'es',{numeric:true})).map(level=>'level:'+level);
    for(const key of keys){
      const items=groups.get(key);
      const title='Nivel '+key.slice(6);
      const card=node('details',undefined,'shelf-level-card management-level-card');card.dataset.level=key;card.open=open.has(key);
      const summary=node('summary'),copy=node('span'),pending=items.filter(row=>row.quantity==null&&!withdrawal(row)).length;
      copy.append(node('strong',title),node('small',items.length+' '+(items.length===1?'producto':'productos')+(pending?' · '+pending+' por contar':'')));
      summary.append(cardIcon('box'),copy,node('span','⌄','shelf-level-chevron'));card.append(summary);
      const content=node('div',undefined,'management-level-content');
      if(items.length){
        const table=node('table',undefined,'runs-table'),body=node('tbody');table.append(rowsTable.querySelector('thead').cloneNode(true),body);content.append(table);
        for(const row of items)adminRowBodies.set(row.id,body);
      }else content.append(node('p','Sin productos en este nivel.','shelf-level-empty'));
      card.append(content);levelRows.append(card);
    }
    if(keys.length)$('runEmpty').classList.add('hidden');
  }
  const assignmentWindow=node('section',undefined,'runs-page hidden assignment-page');
  assignmentWindow.id='assignmentWindow';assignmentWindow.setAttribute('aria-labelledby','assignmentTitle');
  assignmentWindow.innerHTML=`<div class="runs-heading assignment-heading"><div><p class="eyebrow">ORGANIZACIÓN DEL EQUIPO</p><h1 id="assignmentTitle">Asignar Espacios</h1><p>Reserva los andamios de cada trabajador antes de empezar el conteo.</p></div><button id="assignmentRefresh" type="button" class="ghost-button">Actualizar espacios</button></div>
    <p id="assignmentContext" class="assignment-context" role="status"></p>
    <div id="assignmentStats" class="assignment-stats"></div>
    <div class="assignment-notice"><svg class="icon" aria-hidden="true"><use href="#i-lock"></use></svg><p><strong>Reservas protegidas, incluso sin señal</strong><br>Solo el trabajador asignado puede contar. La reserva se conserva hasta que la PC recibe todo; después, las correcciones se realizan en Gestión.</p></div>
    <form id="assignmentForm" data-unsaved-ignore><div class="assignment-layout"><section class="assignment-card assignment-picker"><div class="assignment-card-heading"><div><h2>1. Elige los espacios</h2><p>Selecciona una empresa y marca sus espacios para asignarlos.</p></div></div>
    <div id="assignmentCompanies" class="assignment-company-selector" role="group" aria-label="Seleccionar empresa"></div><div id="assignmentLegend" class="assignment-legend" aria-label="Colores de los espacios"></div>
    <div class="assignment-list-heading"><span id="assignmentResults"></span><button id="assignmentClear" type="button" class="ghost-button">Limpiar selección</button></div><div id="assignmentSpaces" class="assignment-spaces"></div></section>
    <aside class="assignment-card assignment-settings"><h2>2. Define el responsable</h2><label>Acción<select id="assignmentAction"><option value="assign">Asignar / cambiar responsable</option><option value="recount">Solicitar reconteo</option><option value="release">Quitar reserva</option></select></label>
    <p id="assignmentActionHelp" class="assignment-action-help"></p><label>Trabajador<select id="assignmentWorker" required></select></label>
    <p class="assignment-worker-help">Sin una reserva, el trabajador es agente libre y puede tomar espacios disponibles con conexión.</p>
    <label>Motivo del cambio<input id="assignmentReason" maxlength="300" placeholder="Indica por qué se cambia la reserva"></label>
    <label class="assignment-warning"><input id="assignmentConfirm" type="checkbox"><span>He revisado el trabajo pendiente. Cambiar o quitar una reserva invalida entregas antiguas; se conservarán para revisión.</span></label>
    <div class="assignment-submit"><strong id="assignmentSelection" role="status"></strong><p id="assignmentError" class="form-error hidden" role="alert"></p><button id="assignmentSave" type="submit" class="primary-button">Guardar asignaciones</button><p id="assignmentSaved" role="status"></p></div></aside></div></form>`;
  $('appShell').append(assignmentWindow);let assignmentRun=null,assignmentRows=[],assignmentSelected=new Set(),assignmentBusy=false,assignmentLoading=false,assignmentCompany=null,assignmentPeople=[];
  const assignmentLink=$('openRunsAdmin').cloneNode(true);assignmentLink.id='openAssignmentsAdmin';assignmentLink.href='#assignmentWindow';assignmentLink.classList.remove('active');assignmentLink.removeAttribute('aria-current');assignmentLink.querySelector('span').textContent='Asignar Espacios';assignmentLink.querySelector('use').setAttribute('href','#i-target');$('openRunsAdmin').after(assignmentLink);
  InventoryFormGuard.begin(assignmentWindow,{isDirty:()=>assignmentSelected.size>0,busy:()=>assignmentBusy,preserveOnNavigate:true,discard:()=>{assignmentSelected.clear();drawAssignments();}});
  function assignmentWorkerColor(id){
    // Allocate distinct swatches across the whole roster, including inactive owners.
    // Sorting IDs keeps the result independent of names, company and API ordering.
    const ids=[...new Set([...assignmentPeople.map(p=>String(p.id)),...assignmentRows.map(r=>r.reservation?.worker_id).filter(Boolean).map(String),String(id)])].sort();
    const index=ids.indexOf(String(id));
    const palette=['#368fe8','#e38332','#a779df','#26a9b4','#e36780','#b5a52d','#727bd2','#ae7658','#c560b7','#769842'];
    return palette[index]||`hsl(${(index*137.508)%360} 62% ${index%2?62:44}%)`;
  }
  function drawAssignments(){
    const host=$('assignmentSpaces'),action=$('assignmentAction').value;
    host.replaceChildren();$('assignmentWorker').disabled=action==='release';$('assignmentWorker').required=action!=='release';
    $('assignmentActionHelp').textContent=action==='recount'?'Muestra espacios recibidos. Asigna un nuevo conteo y explica el motivo.':action==='release'?'Muestra reservas activas. Revisa primero si el celular tiene entregas pendientes.':'Puedes reservar varios espacios para un trabajador. Cambiar un responsable requiere un motivo y la confirmación.';
    const stats=$('assignmentStats');stats.replaceChildren();
    for(const [status,title] of [['available','Disponibles'],['reserved','Reservados'],['completed','Recibidos en PC']]){const card=node('div',undefined,'assignment-stat '+status);card.append(node('strong',String(assignmentRows.filter(s=>(s.reservation?.status||'available')===status).length)),node('span',title));stats.append(card);}
    const groups=new Map(),locations=new Map((assignmentRun?.locations||[]).map(p=>[p.id,p]));let visible=0;
    const companies=[...(assignmentRun?.empresas||[])];
    for(const item of assignmentRows){const id=locations.get(item.locationId)?.empresa_id||'';if(!companies.some(c=>c.id===id))companies.push({id,name:'Espacios del inventario'});}
    if(!companies.some(c=>c.id===assignmentCompany))assignmentCompany=companies[0]?.id??null;
    const selector=$('assignmentCompanies');selector.replaceChildren();
    for(const company of companies){
      const tab=button('',()=>{assignmentCompany=company.id;drawAssignments();},'assignment-company-tab');tab.setAttribute('aria-pressed',String(company.id===assignmentCompany));tab.setAttribute('aria-label',company.name);
      const portrait=node('div',undefined,'assignment-company-image');portrait.append(node('span',company.name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toLocaleUpperCase(),'assignment-company-initials'));
      if(company.image){const img=node('img');img.src=company.image;img.alt='';img.onerror=()=>img.remove();portrait.append(img);}
      const copy=node('span',undefined,'assignment-company-copy'),rows=assignmentRows.filter(r=>(locations.get(r.locationId)?.empresa_id||'')===company.id);
      copy.append(node('strong',company.name),node('small',rows.length+' espacios · '+rows.filter(r=>assignmentSelected.has(r.locationId)).length+' seleccionados'));tab.append(portrait,copy);selector.append(tab);
    }
    const legend=$('assignmentLegend');legend.replaceChildren();
    const legendItem=(name,color,review=false)=>{const item=node('span',name);item.style.setProperty('--space-color',color);item.classList.toggle('assignment-review',review);legend.append(item);};
    legendItem('Libre: cualquiera puede tomarlo','#21966a');
    for(const person of assignmentPeople)legendItem(person.name,assignmentWorkerColor(person.id));
    legendItem('Recibido en PC','#a3e6a6');legendItem('Recibido · Revisión pendiente','#a3e6a6',true);
    for(const item of assignmentRows){
      const r=item.reservation,completed=r?.status==='completed';if(action==='recount'&&!completed)continue;
      if(action==='release'&&r?.status!=='reserved')continue;
      const place=locations.get(item.locationId),company=(assignmentRun?.empresas||[]).find(c=>c.id===place?.empresa_id),key=company?.id||place?.empresa_id||'';
      if(key!==assignmentCompany)continue;
      if(!groups.has(key)){
        const group=node('section',undefined,'assignment-company'),total=node('span');host.append(group);groups.set(key,{group,total,count:0,warehouses:new Map()});
      }
      const group=groups.get(key),warehouseKey=place?.warehouse||'';group.count++;group.total.textContent=group.count+' espacios';visible++;
      if(!group.warehouses.has(warehouseKey)){const warehouse=node('section',undefined,'assignment-warehouse'),heading=node('h4',place?.warehouseName||place?.warehouse||'Espacios'),grid=node('div',undefined,'assignment-space-grid');warehouse.append(heading,grid);group.group.append(warehouse);group.warehouses.set(warehouseKey,grid);}
      const label=node('label',undefined,'assignment-space'),check=node('input');check.type='checkbox';check.value=item.locationId;check.checked=assignmentSelected.has(item.locationId);
      check.disabled=completed&&action!=='recount';
      const tone=completed?'#a3e6a6':r?.status==='reserved'?assignmentWorkerColor(r.worker_id):'#21966a';label.style.setProperty('--space-color',tone);label.dataset.reservationState=completed?'completed':r?.status==='reserved'?'reserved':'available';label.classList.toggle('assignment-review',completed&&spaceProgress(item).review);
      check.onchange=()=>{check.checked?assignmentSelected.add(item.locationId):assignmentSelected.delete(item.locationId);drawAssignments();};
      const caption=node('span',undefined,'assignment-space-copy');caption.append(node('strong',place?.name||item.label),node('small',r?.status==='reserved'?'Responsable: '+r.worker_name:completed?'Responsable: '+r.worker_name+' · Conteo recibido. Selecciona Solicitar reconteo para habilitarlo.':'Puede tomarlo un agente libre con conexión.'));
      label.append(check,caption,node('span',completed?(spaceProgress(item).review?'Revisión pendiente':'Recibido'):r?.status==='reserved'?'Reservado':'Disponible','assignment-badge '+(r?.status||'available')));group.warehouses.get(warehouseKey).append(label);
    }
    $('assignmentResults').textContent=visible+' espacios visibles en esta empresa';
    if(!host.children.length)host.append(node('p',assignmentRun?'No hay espacios para esta acción en la empresa seleccionada.':'Abre un inventario en Gestión para comenzar a asignar espacios.','assignment-empty'));
    updateAssignmentSelection();
  }
  function updateAssignmentSelection(){const count=assignmentSelected.size;$('assignmentSelection').textContent=count+' espacio'+(count===1?' seleccionado':'s seleccionados');$('assignmentSave').disabled=assignmentBusy||assignmentLoading||!assignmentRun||!count;$('assignmentClear').disabled=!count;}
  $('assignmentClear').onclick=()=>{assignmentSelected.clear();drawAssignments();};
  $('assignmentAction').onchange=()=>{assignmentSelected.clear();$('assignmentSaved').textContent='';drawAssignments();};
  let assignmentPollBusy=false,lastAssignmentPoll=0,assignmentGeneration=0;
  async function refreshAssignments(){
    if(assignmentPollBusy||assignmentBusy||assignmentLoading||!state.user||isWorker()||document.hidden||assignmentWindow.classList.contains('hidden'))return;
    assignmentPollBusy=true;lastAssignmentPoll=Date.now();
    const generation=assignmentGeneration,user=state.user.id;
    try{
      const runs=await api('/api/inventories');
      const active=runs.runs.find(r=>r.scope==='global'&&['open','paused'].includes(r.status));
      const data=active?await api('/api/inventories/'+active.id):null;
      if(generation!==assignmentGeneration||state.user?.id!==user||assignmentBusy||assignmentLoading||assignmentWindow.classList.contains('hidden'))return;
      const nextRun=data?{id:active.id,restoreEpoch:data.restoreEpoch,locations:data.run.locations||[],empresas:data.run.empresas||[]}:null,nextRows=data?.spaces||[];
      const context=active?'Inventario: '+(active.title||active.month)+(active.status==='paused'?' · En pausa':' · Abierto'):'No hay un inventario abierto.';
      $('assignmentContext').textContent=context;
      if(JSON.stringify([assignmentRun,assignmentRows])===JSON.stringify([nextRun,nextRows]))return;
      const previous=new Map(assignmentRows.map(s=>[s.locationId,s.reservation]));
      const valid=new Set(nextRows.filter(s=>{
        const before=previous.get(s.locationId),after=s.reservation;
        return before?.token===after?.token&&before?.status===after?.status&&before?.worker_id===after?.worker_id;
      }).map(s=>s.locationId));
      for(const id of assignmentSelected){
        if(assignmentRun?.id!==nextRun?.id||assignmentRun?.restoreEpoch!==nextRun?.restoreEpoch||!valid.has(id))assignmentSelected.delete(id);
      }
      assignmentRun=nextRun;assignmentRows=nextRows;drawAssignments();
    }catch(error){/* Keep the draft and retry after a temporary connection failure. */}
    finally{assignmentPollBusy=false;lastAssignmentPoll=Date.now();}
  }
  async function loadAssignments(runId){
    assignmentGeneration++;lastAssignmentPoll=Date.now();
    assignmentLoading=true;$('assignmentForm').inert=true;updateAssignmentSelection();$('assignmentRefresh').disabled=true;
    try{
      const runs=await api('/api/inventories');const active=runs.runs.find(r=>r.scope==='global'&&['open','paused'].includes(r.status)&&(!runId||r.id===runId));
      const data=active?await api('/api/inventories/'+active.id):null,people=await api('/api/workers');
      assignmentRun=data?{id:active.id,restoreEpoch:data.restoreEpoch,locations:data.run.locations||[],empresas:data.run.empresas||[]}:null;assignmentRows=data?.spaces||[];assignmentSelected.clear();$('assignmentForm').reset();$('assignmentError').classList.add('hidden');
      $('assignmentContext').textContent=active?'Inventario: '+(active.title||active.month)+(active.status==='paused'?' · En pausa':' · Abierto'):'No hay un inventario abierto.';
      $('assignmentWorker').replaceChildren(new Option('Selecciona un trabajador',''));
      assignmentPeople=people.workers.filter(w=>w.role==='worker'&&w.active);
      for(const w of assignmentPeople)$('assignmentWorker').append(new Option(w.name+' ('+w.username+')',w.id));
      drawAssignments();
    }catch(error){showError($('assignmentError'),error.message);}finally{assignmentLoading=false;$('assignmentForm').inert=assignmentBusy;$('assignmentRefresh').disabled=false;updateAssignmentSelection();}
  }
  async function openAssignments(runId){
    if(!state.user||isWorker())return;
    close();editor.classList.add('hidden');$('productManager')?.classList.add('hidden');assignmentWindow.classList.remove('hidden');setSidebar(false);
    setTimeout(()=>document.querySelectorAll('.side-nav a').forEach(link=>{const active=link.id==='openAssignmentsAdmin';link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}),0);
    if(!assignmentSelected.size)await loadAssignments(runId);
  }
  assignmentLink.onclick=e=>{e.preventDefault();openAssignments();};
  $('assignmentRefresh').onclick=()=>{if(!assignmentLoading&&InventoryFormGuard.request(()=>loadAssignments(),{roots:[assignmentWindow]})){ $('assignmentSaved').textContent='';loadAssignments();}};
  $('assignmentForm').onsubmit=async event=>{
    event.preventDefault();if(assignmentBusy||assignmentLoading||!assignmentRun)return;
    if(!assignmentSelected.size){showError($('assignmentError'),'Selecciona al menos un espacio.');return;}
    assignmentGeneration++;assignmentBusy=true;$('assignmentForm').inert=true;updateAssignmentSelection();$('assignmentError').classList.add('hidden');$('assignmentSaved').textContent='';
    try{
      await api('/api/inventories/'+assignmentRun.id+'/assignments','POST',{action:$('assignmentAction').value,workerId:$('assignmentWorker').value,restoreEpoch:assignmentRun.restoreEpoch,
        spaces:assignmentRows.filter(s=>assignmentSelected.has(s.locationId)).map(s=>({locationId:s.locationId,expectedToken:s.reservation?.token??null})),reason:$('assignmentReason').value.trim(),confirm:$('assignmentConfirm').checked});
      assignmentSelected.clear();await loadAssignments();$('assignmentSaved').textContent='Cambios guardados. Cada trabajador debe abrir la app con conexión antes de perder señal. En Con lista, también debe completar la descarga.';toast('Asignaciones guardadas.');
    }catch(error){showError($('assignmentError'),error.message);}finally{assignmentBusy=false;$('assignmentForm').inert=false;updateAssignmentSelection();}
  };
  const manageAssignments=button('Asignar Espacios',()=>openAssignments());manageAssignments.id='manageAssignments';manageAssignments.dataset.actionTone='neutral';$('managementFollow').after(manageAssignments);
  const offlinePanel=node('details',undefined,'offline-work-panel compact-saved-panel hidden');offlinePanel.id='offlineWorkPanel';
  offlinePanel.innerHTML='<summary><span class="compact-saved-check" aria-hidden="true">✓</span><span class="prepared-eyebrow">Guardado en este celular</span><span class="compact-saved-chevron" aria-hidden="true">⌄</span></summary><div class="compact-saved-details"><strong id="offlineWorkTitle">Inventario preparado</strong><p id="offlineReadyStatus"></p><p id="offlineWorkPending"></p></div>';
  $('runsConnection').after(offlinePanel);let downloading=false,preparationError='';
  const preparationDialog=node('dialog',undefined,'preparation-dialog');preparationDialog.id='preparationDialog';preparationDialog.setAttribute('aria-labelledby','preparationTitle');
  preparationDialog.innerHTML='<div class="preparation-heading"><div class="preparation-symbol" aria-hidden="true">↓</div><div><p class="prepared-eyebrow">INVENTARIO CON LISTA</p><span class="preparation-required">Descarga obligatoria</span></div></div><h2 id="preparationTitle">Tu inventario, listo<br>para contar sin señal</h2><p class="preparation-intro">Guarda tus espacios, sus productos y fotos en este celular antes de comenzar.</p><div id="preparationAssignmentNotice" class="preparation-assigned hidden" role="status"></div><div id="preparationSummary" class="preparation-summary"></div><ul id="preparationSpaceNames" class="preparation-spaces"></ul><p id="offlineWorkStatus" role="status" aria-live="polite"></p><button id="downloadAssignments" type="button" class="primary-button">Descargar y entrar</button><button id="preparationLater" type="button" class="ghost-button hidden">Seguir con mis espacios listos</button><small>La ventana se cerrará al completar la descarga. Si cierras la app antes, volverá a aparecer.</small>';
  document.body.append(preparationDialog);preparationDialog.addEventListener('cancel',event=>event.preventDefault());$('preparationLater').onclick=()=>{if(downloading)return;preparationRequested=false;preparationTarget=null;preparationDialog.close();};
  const taskToolbar=node('div',undefined,'worker-task-toolbar hidden');taskToolbar.id='workerTaskToolbar';
  taskToolbar.innerHTML='<span id="workerSavedBadge" class="worker-saved-badge hidden"></span><button id="workerTasksToggle" type="button" aria-haspopup="dialog" aria-controls="workerTasksDrawer" aria-expanded="false"><span aria-hidden="true">☷</span> Mis espacios <span id="workerTasksBadge" class="hidden"></span></button>';$('runsConnection').after(taskToolbar);
  const taskDrawer=node('dialog',undefined,'worker-tasks-drawer');taskDrawer.id='workerTasksDrawer';taskDrawer.setAttribute('aria-labelledby','workerTasksTitle');
  const pendingShortcut=button('Ver pendientes',()=>$('openSyncQueue').click(),'ghost-button');
  pendingShortcut.id='workerViewPending';pendingShortcut.setAttribute('aria-haspopup','dialog');pendingShortcut.setAttribute('aria-controls','syncWindow');taskToolbar.prepend(pendingShortcut);
  taskDrawer.innerHTML='<header><div><p class="prepared-eyebrow">MI TRABAJO</p><h2 id="workerTasksTitle">Mis espacios</h2></div><button id="workerTasksClose" type="button" class="ghost-button" aria-label="Cerrar mis espacios">✕</button></header><p id="workerTasksSummary" class="worker-tasks-summary" role="status"></p><div class="worker-tasks-legend"><span class="task-new">Nuevo</span><span class="task-pending">Pendiente</span><span class="task-done">Recibido en PC</span></div><div id="workerTasksList"></div><section id="workerSyncCheck" class="worker-sync-check"><div class="worker-sync-copy"><strong>Confirmación final</strong><p id="workerSyncCheckStatus" aria-live="polite"></p></div><button id="workerSyncConfirm" class="primary-button" type="button" aria-label="Confirmar sincronización">Confirmar</button></section>';
  document.body.append(taskDrawer);taskDrawer.querySelector('header').after(offlinePanel);
  let noticeRecord=null,viewedNotices={},noticeQueue=Promise.resolve();
  function queueNotice(work){const next=noticeQueue.then(work,work);noticeQueue=next.catch(()=>{});return next;}
  async function checkAssignmentNotice(){
    if(!state.user||!detail)return;const user=state.user.id,id=detail.run.id,spaces=detail.spaces;
    await queueNotice(async()=>{
      const previous=await InventoryOffline.assignmentNotice(user,id),current=Object.fromEntries(spaces.filter(s=>s.reservation?.worker_id===user&&s.reservation.status==='reserved').map(s=>[s.locationId,s.reservation.token]));
      const unread={};for(const s of spaces){const token=current[s.locationId];if(token&&(previous?.tokens?.[s.locationId]!==token||previous?.unread?.[s.locationId]===token||(!previous?.unread&&previous?.names?.includes(s.label))))unread[s.locationId]=token;}
      const record={tokens:current,unread,names:spaces.filter(s=>unread[s.locationId]).map(s=>s.label)};
      await InventoryOffline.assignmentNotice(user,id,record);if(state.user?.id!==user||detail?.run.id!==id)return;noticeRecord=record;
      $('preparationAssignmentNotice').textContent=record.names.length?'Se te asignó: '+record.names.join(' · '):'';$('preparationAssignmentNotice').classList.toggle('hidden',!record.names.length);renderWorkerTasks();
    });
  }
  async function openWorkerTasks(){
    if(!isWorker()||!detail||!opened||workerSpace)return;viewedNotices={...(noticeRecord?.unread||{})};renderWorkerTasks();if(!taskDrawer.open)taskDrawer.showModal();$('workerTasksToggle').setAttribute('aria-expanded','true');
    const user=state.user.id,id=detail.run.id,seen={...viewedNotices};
    try{await queueNotice(async()=>{
      const saved=await InventoryOffline.assignmentNotice(user,id)||noticeRecord||{},unread={...(saved.unread||{})};
      for(const [location,token] of Object.entries(seen))if(unread[location]===token)delete unread[location];
      const record={...saved,unread,names:(detail?.run.id===id?detail.spaces:[]).filter(s=>unread[s.locationId]).map(s=>s.label)};await InventoryOffline.assignmentNotice(user,id,record);
      if(state.user?.id===user&&detail?.run.id===id){noticeRecord=record;renderWorkerTasks();}
    });}catch(error){toast('No se pudo marcar el aviso como visto. Se conservará para la próxima vez.',true);}
  }
  $('workerTasksToggle').onclick=openWorkerTasks;$('workerTasksClose').onclick=()=>taskDrawer.close();
  taskDrawer.addEventListener('close',()=>{viewedNotices={};$('workerTasksToggle').setAttribute('aria-expanded','false');if(opened&&isWorker()&&detail)render();else renderWorkerTasks();});
  taskDrawer.addEventListener('click',event=>{if(event.target===taskDrawer){const r=taskDrawer.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)taskDrawer.close();}});
  function spaceProgress(space,entry){
    const received=space?.reservation?.status==='completed'||(!space?.reservation&&space?.status==='finished');
    const review=!!(space?.unconfirmed||space?.retirements||space?.missing);
    return {received,review,done:received&&!review&&!entry};
  }
  function workerSpaceTone(space,entry){
    const progress=spaceProgress(space,entry),r=space?.reservation;
    if(progress.received&&!entry)return 'done';
    if(entry||progress.received)return 'pending';
    if(r?.status==='reserved'&&r.worker_id===state.user.id&&(noticeRecord?.unread?.[space.locationId]===r.token||viewedNotices[space.locationId]===r.token))return 'new';
    return !r||r.status==='available'?'available':'pending';
  }
  function renderWorkerTasks(){
    const visible=isWorker()&&!!detail&&opened&&!workerSpace;taskToolbar.classList.toggle('hidden',!visible);if(!visible){if(taskDrawer.open)taskDrawer.close();return;}
    const mine=detail.spaces.filter(s=>s.reservation?.worker_id===state.user.id&&['reserved','completed'].includes(s.reservation.status)),unread=noticeRecord?.unread||{};
    const count=mine.filter(s=>unread[s.locationId]===s.reservation.token).length,trigger=$('workerTasksToggle');trigger.classList.toggle('has-new-tasks',count>0);trigger.setAttribute('aria-label',count?'Mis espacios: '+count+' nuevas asignaciones':'Mis espacios');$('workerTasksBadge').textContent=String(count);$('workerTasksBadge').classList.toggle('hidden',!count);
    const host=$('workerTasksList');host.replaceChildren();let completed=0;
    for(const space of mine){
      const entry=pendingEntries.find(e=>e.runId===selected&&e.payload?.locationId===space.locationId),done=spaceProgress(space,entry).done,newlyAssigned=workerSpaceTone(space,entry)==='new';
      const tone=spaceProgress(space,entry).received&&!entry?'done':newlyAssigned?'new':'pending',card=node('article',undefined,'worker-task-card task-'+tone);card.dataset.locationId=space.locationId;card.dataset.taskState=tone;
      const place=detail.run.locations?.find(p=>p.id===space.locationId);card.append(node('small',place?.warehouse||'Espacio asignado'),node('strong',place?.name||space.label));
      const status=done?'Completado · Recibido en PC':entry?.status==='pending'?(entry.waitingForResume?'Esperando reanudación · Conteo guardado':'Conteo terminado · Pendiente de enviar a la PC'):entry?.status==='conflict'?'Entrega por revisar':entry?.status==='draft'?'Borrador guardado · Falta completar':spaceProgress(space,entry).received?'Recibido en PC · Administración revisará los productos':newlyAssigned?'Nuevo espacio asignado':'Pendiente de contar';card.append(node('span',status,'worker-task-state'));if(needsPreparation(space.locationId)){card.append(node('span','Descarga pendiente · Necesita conexión','worker-task-download-note'),button('Descargar este trabajo',()=>{preparationRequested=true;renderOfflineWork();},'ghost-button'));}host.append(card);if(spaceProgress(space,entry).received&&!entry)completed++;
    }
    renderSyncCheck();
    $('workerTasksSummary').textContent=completed+' de '+mine.length+(mine.length===1?' espacio recibido en PC':' espacios recibidos en PC');if(!mine.length)host.append(node('p','No tienes espacios asignados. Como agente libre puedes tomar un espacio disponible con conexión.','runs-help'));
  }
  function renderSyncCheck(){
    if(!isWorker()||!detail)return;
    const own=(detail.syncConfirmation?.devices||[]).find(d=>d.deviceKey===state.user.id+':'+reportDevice),pending=pendingEntries.some(e=>e.runId===selected&&e.workerId===state.user.id),unfinished=detail.spaces.some(s=>s.reservation?.worker_id===state.user.id&&s.reservation.status==='reserved');
    const finished=!!own?.confirmed&&!pending;
    $('workerSyncCheck').classList.toggle('is-finished',finished);
    $('workerSyncCheck').querySelector('.worker-sync-copy strong').textContent=finished?'Envíos verificados':'Verificar envíos de este celular';
    $('workerSyncConfirm').disabled=syncConfirmBusy||connectionOffline;
    $('workerSyncConfirm').textContent=syncConfirmBusy?'Verificando…':finished?'Verificar de nuevo':'Verificar envíos';
    $('workerSyncCheckStatus').textContent=finished?(connectionOffline?'Sin pendientes en la última verificación con la PC.':'La PC recibió los envíos de este celular.'):connectionOffline?'Conéctate con la PC para verificar tus envíos.':pending?'Se intentarán enviar las entregas pendientes. Los borradores deben terminarse antes.':'Comprueba que este celular no tenga borradores ni entregas pendientes. No cierra el inventario.';
  }
  let syncConfirmBusy=false;
  $('workerSyncConfirm').onclick=async()=>{
    if(syncConfirmBusy)return;syncConfirmBusy=true;renderSyncCheck();const runId=selected,user=state.user.id;
    try{
      await syncCounts();await refreshPendingList();await poll(true);while(pulseBusy)await new Promise(resolve=>setTimeout(resolve,25));await pulse();
      if(user!==state.user?.id||selected!==runId)throw new Error('El inventario cambió. Vuelve a abrir Mis espacios.');
      if((await InventoryOffline.list()).some(e=>e.workerId===user&&e.runId===runId))throw new Error('Todavía hay borradores o entregas pendientes en este celular.');
      await api('/api/inventories/'+runId+'/sync-confirm','POST',{deviceId:reportDevice,pending:0,sequence:detail.syncConfirmation?.sequence,restoreEpoch:detail.restoreEpoch??null});
      await poll(true);toast('Envíos verificados: este celular no tiene pendientes.');
    }catch(error){toast(error.message,true);}finally{syncConfirmBusy=false;renderSyncCheck();}
  };
  $('downloadAssignments').onclick=async()=>{
    if(downloading||!needsPreparation())return;preparationError='';downloading=true;$('downloadAssignments').disabled=true;$('offlineWorkStatus').textContent='Descargando y comprobando el guardado...';
    const started=Date.now(),user=state.user.id,requestedRun=selected,requestedSpace=preparationTarget;
    try{
      await refreshState(true);await poll(true);
      if(connectionOffline||!detail||selected!==requestedRun||state.user?.id!==user||lastServerSync<started)throw new Error('No se pudo conectar con la PC. Conserva tu trabajo y vuelve a intentar con señal.');
      await cacheInventory();const snapshot=await InventoryOffline.snapshot();
      if(snapshot?.user?.id!==user||snapshot.savedAt<started)throw new Error('No se confirmó el guardado del catálogo en el celular.');
      if(InventoryOffline.native&&!await InventoryOffline.authorized(user))throw new Error('Falta autorizar la sincronización del celular. Inicia sesión con conexión y vuelve a intentar.');
      const target=selected,key=preparationKey(),missing=new Set(preparationSelection()),previousKeys=preparedKeys(),photos=[...new Set(preparationRows().filter(r=>missing.has(r.locationId)).map(r=>r.productId?state.products.find(p=>p.id===r.productId)?.image:r.evidenceImage).filter(Boolean))];
      for(let index=0;index<photos.length;index++){$('offlineWorkStatus').textContent='Guardando fotos: '+(index+1)+' de '+photos.length;await InventoryOffline.cachePhoto(photos[index]);}
      if(state.user?.id!==user||selected!==target||preparationKey()!==key)throw new Error('El inventario cambió durante la descarga. Vuelve a prepararlo.');
      downloadedGrants=Object.fromEntries(detail.spaces.filter(s=>s.reservation?.status==='reserved'&&s.reservation.worker_id===user).map(s=>[s.locationId,s.reservation.token]));downloadedAt=Date.now();await cacheRun(true,missing);const saved=await InventoryOffline.runSnapshot(user);
      if(saved?.downloadedAt!==downloadedAt||saved?.selected!==selected)throw new Error('No se pudo comprobar la descarga del trabajo.');
      const preparation={key,spaceKeys:{...previousKeys,...Object.fromEntries([...missing].map(id=>[id,spacePreparationKey(id)]))},at:Date.now(),photos:photos.length,spaces:[...new Set([...Object.keys(previousKeys),...missing])],rows:preparationRows().filter(r=>previousKeys[r.locationId]||missing.has(r.locationId))};await InventoryOffline.preparation(user,target,preparation);
      preparedWork=await InventoryOffline.preparation(user,target);if(preparedWork?.key!==key)throw new Error('No se pudo verificar la preparación del inventario.');
      preparationRequested=false;preparationTarget=null;toast('Estructura y fotos guardadas en este celular.');render();
      if(requestedSpace){const place=detail.run.locations.find(p=>p.id===requestedSpace);if(place)await chooseSpace(place);}
    }catch(error){preparationError=error.message;preparedWork=await InventoryOffline.preparation(user,selected).catch(()=>null)||null;$('offlineWorkStatus').textContent=error.message;toast(error.message,true);}finally{downloading=false;$('downloadAssignments').disabled=false;renderOfflineWork();}
  };
  function renderOfflineWork(){
    const guided=isWorker()&&detail?.run.mode==='guided',missing=guided&&needsPreparation(),required=missing&&((assignedPreparation()&&!hasReadySpaces())||preparationRequested);
    offlinePanel.classList.toggle('hidden',!connectionOffline||!isWorker()||!detail||(!guided&&!autoSaved)||(guided&&!hasReadySpaces()));
    const blindReady=isWorker()&&detail?.run.mode==='blind'&&autoSaved&&detail.spaces.some(s=>s.reservation?.worker_id===state.user.id&&['reserved','completed'].includes(s.reservation.status));$('workerSavedBadge').classList.toggle('hidden',!blindReady);$('workerSavedBadge').textContent=blindReady?'✓ Espacios guardados':'';
    renderWorkerTasks();
    if(!isWorker()||!detail){if(preparationDialog.open)preparationDialog.close();return;}
    const mine=detail.spaces.filter(s=>s.reservation?.status==='reserved'&&s.reservation.worker_id===state.user.id),entries=pendingEntries.filter(e=>e.runId===selected);
    $('offlineWorkTitle').textContent=mine.length?mine.length+(mine.length===1?' espacio reservado para ti':' espacios reservados para ti'):'Inventario preparado';
    offlinePanel.querySelector('.prepared-eyebrow').textContent='Guardado en este celular';
    $('offlineReadyStatus').textContent=guided?'Los espacios preparados y sus fotos están guardados.':'Espacios guardados en este celular. Las fotos nuevas se guardan junto al registro.';
    const pending=entries.filter(e=>e.status==='pending').length,conflicts=entries.filter(e=>e.status==='conflict').length;
    $('offlineWorkPending').textContent=pending||conflicts?pending+' entregas pendientes · '+conflicts+' por revisar':'Solo los espacios preparados y reservados para ti se pueden contar sin conexión.';
    if(required){
      preparationDialog.querySelector('.preparation-required').textContent='Preparar para contar';
      const spaces=new Set(preparationSelection()),rows=preparationRows().filter(r=>spaces.has(r.locationId));$('preparationLater').classList.toggle('hidden',assignedPreparation()&&!hasReadySpaces());$('preparationLater').textContent=hasReadySpaces()?'Volver a mis espacios':'Elegir otro andamio';$('preparationSummary').textContent=spaces.size+(spaces.size===1?' espacio':' espacios')+' · '+rows.length+(rows.length===1?' producto':' productos');
      const partial=hasReadySpaces();preparationDialog.querySelector('small').textContent=partial?'Completa la descarga para entrar a estos nuevos espacios. Puedes continuar en los que ya están preparados.':'La ventana se cerrará al completar la descarga. Si cierras la app antes, volverá a aparecer.';$('preparationTitle').textContent=partial?'Prepara tus nuevos espacios':'Tu inventario, listo para contar sin señal';preparationDialog.querySelector('.preparation-intro').textContent=partial?'Descarga lo que falta. Tus otros espacios preparados siguen disponibles.':'Guarda tus espacios, sus productos y fotos en este celular antes de comenzar.';const newNames=detail.spaces.filter(s=>spaces.has(s.locationId)&&noticeRecord?.unread?.[s.locationId]).map(s=>s.label);$('preparationAssignmentNotice').textContent=newNames.length?'Se te asignó: '+newNames.join(' · '):'';$('preparationAssignmentNotice').classList.toggle('hidden',!newNames.length);
      if(preparationTarget){$('preparationTitle').textContent='Prepara este andamio';preparationDialog.querySelector('.preparation-intro').textContent='Descarga solo los productos y fotos de este andamio para empezar a contar.';preparationDialog.querySelector('small').textContent='Los demás andamios no se descargarán.';}else if(!assignedPreparation()){preparationDialog.querySelector('.preparation-required').textContent='Descarga opcional';$('preparationTitle').textContent='Descargar todos los espacios libres';preparationDialog.querySelector('small').textContent='También puedes volver y elegir un solo andamio.';}
      $('preparationSpaceNames').replaceChildren(...detail.spaces.filter(s=>spaces.has(s.locationId)).map(s=>node('li',s.label)));
      if(!downloading)$('offlineWorkStatus').textContent=preparationError||'Necesitas conexión para descargar. Después podrás contar tus espacios reservados sin señal.';
      if(opened&&!preparationDialog.open){if(taskDrawer.open)taskDrawer.close();preparationDialog.showModal();}
    }else{
      if(!downloading)$('offlineWorkStatus').textContent=guided?'Inventario preparado · Fotos guardadas':'Espacios guardados automáticamente';
      if(preparationDialog.open)preparationDialog.close();
    }
  }

  let adminRun=null,adminCompany='',adminWarehouse='',adminSpace='';
  const isApproved=row=>Array.isArray(detail?.incorporated)?detail.incorporated.includes(row.id):Object.prototype.hasOwnProperty.call(detail?.incorporated||{},row.id);
  const isFinding=row=>detail?.run.mode!=='blind'&&!row.retired&&!isApproved(row)&&!row.prepared&&!!(row.foundBy||row.role==='worker');
  function rowStateClass(row){
    if(row.retirement?.status==='pending')return 'run-retirement-pending';
    if(isFinding(row))return row.productId?'run-found-row':'run-uncatalogued-row';
    return '';
  }
  function companyCard(company,{count,selected,onSelect,onConfigure}){
    const card=node('div',undefined,'editor-company-card');card.classList.toggle('is-selected',selected);
    const tab=button('',onSelect,'editor-company-select');tab.setAttribute('aria-label',company.name);tab.setAttribute('aria-pressed',String(selected));
    if(company.image){const photo=node('img',undefined,'editor-company-photo');photo.src=company.image;photo.alt='';tab.append(photo);}else{const icon=cardIcon('box');icon.classList.add('editor-company-icon');tab.append(icon);}
    const caption=node('span',undefined,'editor-company-caption');caption.append(node('strong',company.name),node('small',count+(count===1?' almacén':' almacenes')));tab.append(caption);card.append(tab);
    if(onConfigure){const settings=button('⋮',onConfigure,'editor-company-settings');settings.setAttribute('aria-label','Configurar empresa '+company.name);settings.setAttribute('aria-haspopup','dialog');settings.title='Configurar empresa';card.append(settings);}
    return card;
  }
  function renderAdminPlaces(){
    const companies=detail.run.empresas||[];
    if(adminRun!==detail.run.id){adminRun=detail.run.id;adminCompany='';adminWarehouse='';adminSpace='';}
    if(!companies.some(e=>e.id===adminCompany))adminCompany=companies[0]?.id||'';
    const places=(detail.run.locations||[]).filter(p=>!companies.length||p.empresa_id===adminCompany),warehouses=[...new Set(places.map(p=>p.warehouse))];
    if(!warehouses.includes(adminWarehouse))adminWarehouse=warehouses[0]||'';
    const spaces=places.filter(p=>p.warehouse===adminWarehouse);
    if(!spaces.some(p=>p.id===adminSpace))adminSpace=spaces[0]?.id||'';
    placePanel.append(node('h2','Seguimiento por almacén'),node('p','Elige un almacén y un estante o espacio. Las cantidades y los productos nuevos se actualizan cada 3 segundos.','muted-note'));
    const companyTabs=node('div',undefined,'editor-company-tabs editor-company-bar');companyTabs.id='adminCompanyTabs';companyTabs.setAttribute('role','group');companyTabs.setAttribute('aria-label','Empresas del inventario');
    const companyGrid=node('div',undefined,'editor-company-grid');
    for(const company of companies){
      const count=new Set((detail.run.locations||[]).filter(p=>p.empresa_id===company.id).map(p=>p.warehouse)).size;
      companyGrid.append(companyCard(company,{count,selected:company.id===adminCompany,onSelect:()=>{adminCompany=company.id;adminWarehouse='';adminSpace='';render();}}));
    }
    companyTabs.append(companyGrid);placePanel.append(companyTabs);
    if(!places.length)placePanel.append(node('p','Esta empresa no tiene almacenes en este inventario. Guarda su estructura en el Editor de almacén.','muted-note'));
    const tabs=node('div',undefined,'run-place-grid');tabs.id='adminWarehouseTabs';
    for(const warehouse of warehouses){const b=button(warehouse,()=>{adminWarehouse=warehouse;adminSpace='';render();});b.setAttribute('aria-pressed',String(warehouse===adminWarehouse));tabs.append(b);}placePanel.append(tabs);
    const grid=node('div',undefined,'run-place-grid');grid.id='adminSpaceTabs';
    for(const space of spaces){
      const rows=localRows().filter(r=>r.locationId===space.id&&!r.retired),occupation=detail.spaces?.find(p=>p.locationId===space.id);
      const b=button('',()=>{adminSpace=space.id;render();});b.setAttribute('aria-pressed',String(space.id===adminSpace));
      const pending=occupation?.retirements??rows.filter(r=>r.retirement?.status==='pending').length,unconfirmed=occupation?.unconfirmed??rows.filter(isFinding).length,missing=occupation?.missing??rows.filter(r=>r.quantity===null).length;
      const emptyGuided=detail.run.mode==='guided'&&!rows.length;
      const ready=spaceProgress(occupation).done;
      b.classList.add(ready?'space-ready':'space-pending');b.dataset.spaceId=space.id;b.dataset.workStatus=ready?'done':'pending';
      const stateLabel=ready?'Completo · Recibido en PC':pending||unconfirmed?'Revisión pendiente':occupation?.reserved?'Reservado · '+occupation.workerName:occupation?.occupied?'Contando · '+occupation.workerName:detail.run.mode==='guided'&&occupation?.workerId?'Incompleto':'Disponible';
      b.append(node('strong',space.name),node('span',emptyGuided?'Sin productos en la lista':`${rows.length-missing}/${rows.length} contados`));
      if(pending||unconfirmed)b.append(node('span',[pending?pending+(pending===1?' retiro por resolver':' retiros por resolver'):'',unconfirmed?unconfirmed+(unconfirmed===1?' producto por confirmar':' productos por confirmar'):''].filter(Boolean).join(' · '),'space-pending-detail'));
      b.append(node('span',stateLabel,'space-state-label'));b.setAttribute('aria-label',space.name+' · '+stateLabel);grid.append(b);
    }placePanel.append(grid);
    const rows=localRows().filter(r=>r.locationId===adminSpace&&!r.retired),chosen=spaces.find(p=>p.id===adminSpace);
    const summary=node('p',chosen?`${chosen.label} · ${rows.filter(r=>r.quantity!==null).length}/${rows.length} productos contados${detail.run.mode==='blind'?'':' · '+rows.filter(isFinding).length+' productos por confirmar'}`:'Este inventario no tiene espacios configurados.','runs-picked');summary.id='adminSpaceSummary';placePanel.append(summary);
    if(detail.readiness){const check=detail.readiness;const state=node('p',`${check.readySpaces}/${check.totalSpaces} espacios listos para cerrar en todo el inventario · ${check.structure.updated?'Estructura actualizada':'Estructura pendiente de actualizar'}`,'run-readiness-summary');state.id='runReadinessSummary';placePanel.append(state);}
    return rows;
  }
  function renderPlaces(){
    placePanel.replaceChildren();const enabled=detail.run.scope==='global';placePanel.classList.toggle('hidden',!enabled);if(!enabled)return localRows();
    if(!isWorker()){$('runRows').closest('.table-wrap').classList.remove('hidden');return renderAdminPlaces();}
    if(assignedPreparation()&&needsPreparation()&&!hasReadySpaces()){
      $('runAdd').classList.add('hidden');$('runRows').closest('.table-wrap').classList.add('hidden');
      placePanel.append(node('h2','Prepara este inventario'),node('p','Conéctate a la PC y completa la descarga en la ventana de preparación. Al cerrar y abrir la app, la preparación seguirá guardada en este celular.','runs-help'));return [];
    }
    if(detail.run.mode==='guided'&&!assignedPreparation()&&!workerSpace&&needsPreparation()){const all=button('Descargar todos los espacios libres',()=>{preparationTarget=null;preparationRequested=true;preparationError='';renderOfflineWork();},'ghost-button');all.id='downloadAllFreeSpaces';placePanel.append(node('p','Elige un andamio y descarga solo su estructura. También puedes preparar todos los espacios libres.','muted-note'),all);}
    const allPlaces=detail.run.locations||state.locations||[],companies=detail.run.empresas||[];
    if(!workerCompany&&workerWarehouse)workerCompany=allPlaces.find(l=>l.warehouse===workerWarehouse)?.empresa_id||'';
    if(!companies.some(e=>e.id===workerCompany))workerCompany=companies.length===1?companies[0].id:'';
    const company=companies.find(e=>e.id===workerCompany),choosingCompany=companies.length>1&&!company;
    const places=allPlaces.filter(l=>!companies.length||l.empresa_id===workerCompany),warehouses=[...new Set(places.map(l=>l.warehouse))];
    if(!warehouses.includes(workerWarehouse)){workerWarehouse='';workerSpace='';}
    if(!places.some(l=>l.id===workerSpace&&l.warehouse===workerWarehouse))workerSpace='';
    const chosen=places.find(l=>l.id===workerSpace);
    placePanel.classList.toggle('shelf-overview',!!chosen);

    const warehouseName=places.find(l=>l.warehouse===workerWarehouse)?.warehouseName||workerWarehouse;
    const heading=node('div',undefined,'worker-place-heading');heading.append(node('h2',chosen?chosen.name:workerWarehouse?warehouseName:choosingCompany?'Elige una empresa':'Elige un almacén'));if(workerWarehouse||(workerCompany&&companies.length>1))heading.append($('runsBack'));placePanel.prepend(heading);
    if(chosen)placePanel.append(node('p',[company?.name,warehouseName].filter(Boolean).join(' · '),'shelf-location'));
    else if(company)heading.after(node('p',company.name,'warehouse-company-context'));
    const grid=node('div',undefined,'run-place-grid');
    if(choosingCompany){for(const item of companies){const card=button('',()=>{workerCompany=item.id;workerWarehouse='';workerSpace='';render();cacheRun();page.scrollTop=0;},'worker-company-tile');card.setAttribute('aria-label',item.name);const portrait=node('span',undefined,'worker-company-portrait');portrait.append(node('span',item.name.slice(0,2).toLocaleUpperCase()));if(item.image){const img=node('img');img.src=item.image;img.alt='';img.onerror=()=>img.remove();portrait.append(img);}const copy=node('span');copy.append(node('strong',item.name),node('small',new Set(allPlaces.filter(p=>p.empresa_id===item.id).map(p=>p.warehouse)).size+' almacén(es)'));card.append(portrait,copy,node('span','›','worker-tile-arrow'));grid.append(card);}}

    else if(!workerWarehouse){for(const warehouse of warehouses){const name=places.find(l=>l.warehouse===warehouse)?.warehouseName||warehouse,card=button('',()=>{workerWarehouse=warehouse;render();cacheRun();page.scrollTop=0;},'worker-warehouse-tile');card.setAttribute('aria-label',name);const copy=node('span',undefined,'warehouse-tile-copy');const count=places.filter(p=>p.warehouse===warehouse).length;copy.append(node('strong',name),node('small',count+(count===1?' espacio':' espacios')));card.append(cardIcon('box'),copy,node('span','›','worker-tile-arrow'));grid.append(card);}if(!warehouses.length)placePanel.append(node('p','Esta empresa todavía no tiene almacenes en este inventario.','muted-note'));}
    else if(!chosen){for(const place of places.filter(l=>l.warehouse===workerWarehouse)){
      const occupation=detail.spaces?.find(s=>s.locationId===place.id),r=occupation?.reservation;
      const entry=pendingEntries.find(e=>e.runId===selected&&e.action==='submit-space'&&e.payload.locationId===place.id);
      const progress=spaceProgress(occupation,entry),tone=workerSpaceTone(occupation,entry);
      const label=entry?(entry.status==='draft'?'Borrador en este celular':entry.status==='conflict'?'Conflicto por revisar':entry.waitingForResume?'Esperando reanudación':'Pendiente de enviar'):progress.done?'Completo · Recibido en PC':progress.received?'Completo · Administración revisará los productos':tone==='new'?'Nuevo · Reservado para '+r.worker_name:r?.status==='reserved'?'Pendiente · Reservado para '+r.worker_name:occupation?.occupied?'Contando · '+occupation.workerName:occupation?.status==='finished'?'Completo':detail.run.mode==='guided'&&occupation?.workerId?'Incompleto · Puede continuar otro trabajador':'Disponible';
      const choice=button('',()=>chooseSpace(place));choice.setAttribute('aria-label',place.name);choice.append(node('strong',place.name),node('small',label));choice.dataset.spaceId=place.id;choice.dataset.workStatus=tone;
      choice.disabled=!!r&&r.status!=='available'&&r.worker_id!==state.user.id;grid.append(choice);
    }}
    placePanel.append(grid);
    const bulkDownload=$('downloadAllFreeSpaces');if(bulkDownload){const help=bulkDownload.previousElementSibling;const downloadBox=node('details',undefined,'worker-download-options');downloadBox.append(node('summary','Preparar para trabajar sin internet'));if(help?.classList.contains('muted-note'))downloadBox.append(help);downloadBox.append(bulkDownload);placePanel.append(downloadBox);}
    $('runAdd').classList.toggle('hidden',!chosen);$('runAdd').disabled=detail.run.status!=='open'||!chosen;$('runAdd').textContent='+ Agregar producto';
    $('runRows').closest('.table-wrap').after($('runAdd'));
    if(chosen){
      const entry=shelfEntry(),confirmed=detail.spaces?.find(s=>s.locationId===workerSpace)?.status==='finished';
      const count=localRows().filter(r=>r.locationId===workerSpace&&!r.retired).length;
      const summary=node('div',undefined,'shelf-summary');
      summary.append(node('strong',count+' '+(count===1?'producto':'productos'),'worker-space-count'));
      const status=entry?.status==='draft'?'Borrador en el celular':entry?.status==='conflict'?'Requiere revisión':entry?'Envío pendiente':confirmed?'Recibido en PC':'Listo para contar';
      const badge=node('span',status,'shelf-save-status');badge.dataset.state=entry?.status||(confirmed?'received':'empty');summary.append(badge);placePanel.append(summary);
      const actions=node('div',undefined,'shelf-actions');
      if(!shelfLocked()&&(!confirmed||entry?.status==='draft')){
        const finish=button('Terminar y revisar',finishShelf,'primary-button');finish.id='shelfFinish';finish.disabled=detail.run.status!=='open'||reservationLocked();actions.append(finish);
      }else if(confirmed||shelfLocked())actions.append(button('Ver lista confirmada',openConfirmed,'ghost-button'));
      placePanel.append(actions);
      placePanel.append(node('p',entry?.status==='draft'?'Revisa y confirma para enviar a la PC.':entry?.status==='conflict'?'Tu entrega se conserva. Revisa el motivo en Ver pendientes.':entry?'Se enviará al conectar con la PC.':confirmed?'La PC confirmó la recepción del conteo.':'Agrega los productos que encuentres.','shelf-save-help'));
      if(shelfLocked())$('runAdd').disabled=true;
    }
    $('runRows').closest('.table-wrap').classList.toggle('hidden',!chosen);
    return localRows().filter(r=>r.locationId===workerSpace);
  }
  async function approveFinding(row,control){
    if(!editor.classList.contains('hidden')&&editorIsDirty()){toast('Guarda los cambios de la estructura antes de aprobar.',true);return;}
    const runId=row.runId||detail.run.id,user=state.user;
    if(!await confirmDecision({title:'Aprobar producto encontrado',message:'Se añadirá a la estructura de este espacio con el nivel y la cantidad registrados. El producto quedará confirmado.',label:'Aprobar y añadir',row}))return;
    if(state.user!==user||detail?.run.id!==runId)return;
    control.disabled=true;
    try{
      const data=await api('/api/inventories/'+runId+'/findings');
      await api('/api/inventories/'+runId+'/findings','POST',{items:[{id:row.id,expectedRevision:row.revision,locationId:row.locationId,level:row.level}],expectedRevision:data.revision,runRevision:data.runRevision});
      await poll(true);if(!editor.classList.contains('hidden'))await openEditor();toast('Producto aprobado y añadido a la estructura.');
    }catch(error){toast(error.message,true);}finally{control.disabled=false;}
  }
  async function rejectFinding(row,control){
    const runId=detail.run.id,runRevision=detail.run.revision,user=state.user;
    if(!await confirmDecision({title:'Rechazar producto encontrado',message:'Se quitará de la lista activa y no se añadirá a la estructura. Su registro y cantidad se conservarán en el historial.',label:'Rechazar producto',row,reject:true}))return;
    if(state.user!==user||detail?.run.id!==runId)return;
    control.disabled=true;
    try{await api('/api/inventories/'+runId+'/findings','POST',{decision:'reject',id:row.id,expectedRevision:row.revision,runRevision});await poll(true);toast('Producto encontrado rechazado. Registro conservado en el historial.');}
    catch(error){toast(error.message,true);}finally{control.disabled=false;}
  }
  const retirementWindow=node('section',undefined,'floating-window compact hidden');retirementWindow.id='runRetirementWindow';retirementWindow.tabIndex=-1;
  retirementWindow.setAttribute('role','dialog');retirementWindow.setAttribute('aria-modal','true');retirementWindow.setAttribute('aria-labelledby','runRetirementTitle');
  retirementWindow.innerHTML=`<div class="window-titlebar"><h2 id="runRetirementTitle">Solicitar retiro</h2><button id="runRetirementClose" type="button" class="icon-button" aria-label="Cerrar" data-action-tone="neutral">×</button></div>
    <form id="runRetirementForm"><div class="retirement-product"><span class="eyebrow">PRODUCTO</span><strong id="runRetirementProduct"></strong></div><p id="runRetirementHelp" class="muted-note">El administrador revisará tu solicitud antes de retirar el producto de este espacio. Los conteos registrados se conservarán.</p>
    <label for="runRetirementReason">Motivo del retiro<textarea id="runRetirementReason" rows="3" maxlength="300" required placeholder="Explica por qué debe retirarse de este espacio"></textarea></label>
    <p id="runRetirementError" class="form-error hidden" role="alert"></p><div class="window-actions"><button id="runRetirementCancel" type="button" class="ghost-button" data-action-tone="neutral">Cancelar</button><button id="runRetirementSend" type="submit" class="primary-button" data-action-tone="danger">Enviar solicitud</button></div></form>`;
  document.body.append(retirementWindow);
  let retirementTarget=null,retirementBusy=false;
  $('runRetirementClose').onclick=$('runRetirementCancel').onclick=closeWindows;
  $('runRetirementForm').onsubmit=async event=>{
    event.preventDefault();if(retirementBusy||!retirementTarget)return;
    const reason=$('runRetirementReason').value.trim();
    if(!reason){showError($('runRetirementError'),'Escribe el motivo del retiro.');$('runRetirementReason').focus();return;}
    const target=retirementTarget;retirementBusy=true;$('runRetirementSend').disabled=true;$('runRetirementSend').textContent='Enviando…';$('runRetirementError').classList.add('hidden');
    try{
      const user=state.user;if(!user||user.id!==target.workerId)throw new Error('La cuenta cambió. Vuelve a abrir la solicitud.');
      if(target.decision==='withdraw'){await api('/api/inventories/'+target.runId+'/retirement','POST',{id:target.id,expectedRevision:target.revision,restoreEpoch:target.restoreEpoch,decision:'withdraw',reason,operationId:target.operation});closeWindows({saved:true});await poll(true);toast('Producto retirado del espacio. El catálogo y el historial se conservan.');return;}
      if(staged()){
        await saveShelf(items=>{const item=items.find(p=>(p.id||p.localId)===target.id);if(!item)throw new Error('Producto no encontrado.');item.retirementReason=reason;});
        closeWindows({saved:true});toast('Retiro preparado. Puedes cancelarlo antes de terminar el andamio.');return;
      }
      const entries=await InventoryOffline.list();
      if(entries.some(e=>e.workerId===user.id&&e.runId===target.runId&&e.payload.id===target.id))throw new Error('Este producto tiene un cambio pendiente. Revísalo en Ver pendientes.');
      await InventoryOffline.put({id:target.operation,action:'retirement',runId:target.runId,month:target.month,workerId:user.id,workerName:user.name,name:target.name,sku:target.sku,createdAt:Date.now(),status:'pending',payload:{id:target.id,locationId:target.locationId,expectedRevision:target.revision,restoreEpoch:target.restoreEpoch,decision:'request',reason,operationId:target.operation}});
      await refreshPendingList();
      if(!retirementWindow.classList.contains('hidden'))closeWindows({saved:true});
      toast('Solicitud guardada en este equipo. Se enviará al conectar con la PC.');
      syncCounts().then(()=>poll(true)).catch(()=>{});
    }catch(error){showError($('runRetirementError'),error.message);}
    finally{retirementBusy=false;$('runRetirementSend').disabled=false;$('runRetirementSend').textContent=retirementTarget?.decision==='withdraw'?'Confirmar retiro':staged()?'Guardar retiro':'Enviar solicitud';}
  };
  async function retirement(row,decision){
    let reason='';if(decision==='request'||decision==='withdraw'){
      if(retirementBusy)return;
      retirementTarget={decision,runId:detail.run.id,id:row.id,revision:row.revision,workerId:state.user.id,month:detail.run.month,name:row.name,sku:row.sku||'',locationId:row.locationId,restoreEpoch:detail.restoreEpoch??null,operation:InventoryOffline.id()};$('runRetirementForm').reset();$('runRetirementError').classList.add('hidden');$('runRetirementProduct').textContent=row.name;
      $('runRetirementTitle').textContent=decision==='withdraw'?'Retirar producto del espacio':'Solicitar retiro';$('runRetirementHelp').textContent=decision==='withdraw'?'Se retirará del conteo de este espacio. Su ficha de catálogo, foto y conteos originales se conservarán en el historial.':'El administrador revisará tu solicitud antes de retirar el producto de este espacio. Los conteos registrados se conservarán.';
      $('runRetirementSend').textContent=decision==='withdraw'?'Confirmar retiro':staged()?'Guardar retiro':'Enviar solicitud';openWindow(retirementWindow);return;
    }
    const runId=detail.run.id,restoreEpoch=detail.restoreEpoch??null,user=state.user;
    if(!await confirmDecision({title:decision==='approve'?'Aprobar retiro del producto':'Rechazar solicitud de retiro',message:decision==='approve'?'El producto se retirará de este espacio. Los conteos ya registrados se conservarán en el historial.':'El producto se mantendrá en este espacio y se cancelará la solicitud de retiro.',label:decision==='approve'?'Aprobar retiro':'Rechazar solicitud',row,reject:decision!=='approve'}))return;
    if(state.user!==user||detail?.run.id!==runId)return;
    try{await api('/api/inventories/'+runId+'/retirement','POST',{id:row.id,expectedRevision:row.revision,restoreEpoch,decision,reason});await poll(true);toast('Solicitud resuelta.');}catch(error){toast(error.message,true);}
  }
  function cardIcon(kind){
    const paths={document:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h4 M8 17h7',box:'m12 3 9 5-9 5-9-5z M3 8v9l9 5 9-5V8 M12 13v9',edit:'m16 3 5 5-12 12-6 1 1-6z M14 5l5 5',retire:'M14 3h7v7 M21 3l-11 11 M11 5H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-5',cancel:'m6 6 12 12 M18 6 6 18'};
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('class','card-icon');icon.setAttribute('aria-hidden','true');icon.innerHTML='<path d="'+paths[kind]+'"/>';return icon;
  }
  function render(){return preserveProductPhotos(page,renderContent);}
  function renderContent(){
    if(!detail||!workerSpace||!usesLevelCards())levelControls.classList.add('hidden');
    renderOfflineWork();
    if(shelfGesture)return;
    page.querySelector('.runs-heading').append($('runsBack'));
    page.classList.toggle('worker-location-view',isWorker()&&!!(workerWarehouse||(workerCompany&&detail?.run.empresas?.length>1)));
    $('runsBack').classList.toggle('hidden',isWorker()&&!workerCanGoBack());
    backupPanel.classList.toggle('hidden',isWorker());
    $('workerRunWaiting').classList.toggle('hidden',!isWorker()||!!detail);
    page.querySelector('.management-history-title').classList.toggle('hidden',isWorker());
    $('runsAll').classList.toggle('hidden',isWorker());
    updateCreateMonth();
    $('runsListView').classList.toggle('hidden',!!detail);$('runsDetail').classList.toggle('hidden',!detail);
    const active=listing.runs.find(r=>r.scope==='global'&&['open','paused'].includes(r.status));
    $('runsCreate').classList.toggle('hidden',isWorker()||!!active||!!detail);
    activePanel.classList.toggle('hidden',isWorker()||!active);
    if(active){
      if(!isWorker()&&active.month&&state.month!==active.month){$('inventoryMonth').value=active.month;$('inventoryMonth').dispatchEvent(new Event('change'));}
      $('managementActiveTitle').textContent=active.title;
      $('managementActiveInfo').textContent=[labels[active.status],modeLabel(active.mode),active.month?monthLabel(active.month):'Mes actual',`${active.counted}/${active.total} productos contados`].join(' · ');
      $('managementPause').textContent=active.status==='paused'?'Reanudar':'Pausar';$('managementPause').dataset.actionTone=active.status==='paused'?'confirm':'warning';
      $('managementFollow').classList.toggle('hidden',selected===active.id);
      $('managementFollow').onclick=()=>selectRun(active.id);
      $('managementPause').onclick=()=>askStatus(active,active.status==='paused'?'open':'paused');
      $('managementClose').onclick=()=>askStatus(active,'closed');
      $('managementDelete').onclick=()=>askDelete(active);
    }
    $('runsPeople').replaceChildren();$('runsOffline').replaceChildren();
    const online=listing.workers.filter(w=>w.online).length;
    $('runsOnlineCount').textContent=online+' conectados';
    $('runsOfflineTitle').textContent='Sin conexión reciente ('+(listing.workers.length-online)+')';
    $('runsOfflinePanel').classList.toggle('hidden',listing.workers.length===online);
    if(!online)$('runsPeople').append(node('p','No hay trabajadores conectados en este momento.','runs-help'));
    if(!isWorker())for(const w of listing.workers){
      const card=node('article',undefined,w.online?'online':'offline');card.append(node('strong',w.name),node('span',w.online?'Conectado':'Sin conexión reciente'));
      const names=w.runIds.map(id=>listing.runs.find(r=>r.id===id)?.title).filter(Boolean);
      card.append(node('small',names.length?names.join(' · '):w.online?'Conectado · Sin inventario seleccionado':w.lastSeen?'Última actividad: '+stamp(w.lastSeen*1000):'Sin actividad reciente'));$(w.online?'runsPeople':'runsOffline').append(card);
    }
    historyPanel.classList.toggle('hidden',isWorker()||!!detail);
    const historyKey=JSON.stringify([state.user?.id,active?.id,listing.runs.map(r=>[r.id,r.title,r.month,r.mode,r.scope,r.status,r.locationLabel,r.counted,r.total,r.revision,r.empresas])]);
    if(!isWorker()&&historyRenderKey!==historyKey){
      historyRenderKey=historyKey;
      $('runsList').replaceChildren();
      for(const run of listing.runs){
        if(run.id===active?.id)continue;
        const card=node('article');card.dataset.runId=run.id;card.classList.add('history-report-card');
        card.append(node('span',(run.month?monthLabel(run.month)+' · ':'')+modeLabel(run.mode),'eyebrow'),node('h2',run.title),node('p',run.locationLabel),node('p',`${labels[run.status]} · ${run.counted}/${run.total} productos contados`),button('Consultar inventario',()=>selectRun(run.id),'ghost-button'));
        if(run.scope==='global'&&run.month){
          const reportStatus=node('p','','runs-help');reportStatus.setAttribute('role','status');
          const download=button('Descargar reporte mensual (Excel)',async()=>{
            download.disabled=true;reportStatus.textContent='Generando reporte de '+monthLabel(run.month)+'...';
            try{
              const report=await api('/api/reports/monthly?month='+encodeURIComponent(run.month)+'&format=xlsx');
              if(!report.xlsx)throw new Error('Actualiza el programa de PC para descargar el reporte Excel.');
              const bytes=Uint8Array.from(atob(report.xlsx),c=>c.charCodeAt(0));
              const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
              const link=document.createElement('a');link.href=url;link.download='Inventario-'+report.month+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
              reportStatus.textContent='Reporte de '+monthLabel(report.month)+' descargado.';
            }catch(error){reportStatus.textContent=error.message;}finally{download.disabled=false;}
          },'primary-button');card.append(download,reportStatus);
          const companySection=node('section',undefined,'report-company-section');
          companySection.append(node('h3','Reportes por empresa'));
          const companyGrid=node('div',undefined,'report-company-grid');companySection.append(companyGrid);card.append(companySection);
          const loading=node('p','Cargando empresas...','runs-help');companyGrid.append(loading);
          api('/api/reports/monthly?month='+encodeURIComponent(run.month)).then(info=>{
            companyGrid.replaceChildren();
            for(const company of info.companies||[]){
              const tile=node('div',undefined,'report-company-card');
              const badge=node('span',company.name.trim().slice(0,1).toLocaleUpperCase(),'report-company-badge');badge.setAttribute('aria-hidden','true');
              if(company.image){const logo=node('img');logo.src=company.image;logo.alt='';logo.onerror=()=>logo.remove();badge.append(logo);}
              tile.append(badge,node('strong',company.name));
              const companyDownload=button('Descargar Excel',async()=>{
                companyDownload.disabled=true;reportStatus.textContent='Generando reporte: '+company.name;
                try{
                  const report=await api('/api/reports/monthly?month='+encodeURIComponent(run.month)+'&format=xlsx&companyId='+encodeURIComponent(company.id));
                  if(!report.xlsx)throw new Error('No se pudo generar el reporte.');
                  const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(report.xlsx),c=>c.charCodeAt(0))],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
                  const link=document.createElement('a');link.href=url;link.download='Inventario-'+report.month+'-'+report.companyName.replace(/[^a-zA-Z0-9_-]/g,'_')+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
                  reportStatus.textContent='Reporte descargado: '+report.companyName;
                }catch(error){reportStatus.textContent=error.message;}finally{companyDownload.disabled=false;}
              },'ghost-button');
              companyDownload.setAttribute('aria-label','Descargar Excel de '+company.name);tile.append(companyDownload);companyGrid.append(tile);
            }
            if(!companyGrid.children.length)companyGrid.append(node('p','Este mes no tiene empresas identificadas.','runs-help'));
          }).catch(error=>{loading.textContent=error.message;if(historyRenderKey===historyKey)historyRenderKey=null;});

        }
        const overview=node('div',undefined,'history-report-overview');
        for(const child of [...card.children])if(!child.classList.contains('report-company-section'))overview.append(child);
        card.prepend(overview);
        $('runsList').append(card);
      }
      if(!$('runsList').children.length)$('runsList').append(node('p','No hay inventarios anteriores guardados. Los inventarios cerrados aparecerán aquí para consultarlos.','runs-help'));
      $('runsListView').classList.add('hidden');
    }
    if(!detail)return;
    findingsButton.classList.toggle('hidden',isWorker()||detail.run.scope!=='global'||detail.run.mode==='blind');exportButton.classList.toggle('hidden',isWorker()||!(detail.run.locations||[]).length);
    const run=detail.run,readonly=run.status==='closed'||(isWorker()&&run.status==='paused');
    deleteButton.classList.toggle('hidden',isWorker());
    $('runImport').classList.toggle('hidden',run.scope==='global'||isWorker()||run.mode!=='guided'||run.status!=='draft');
    $('runAdd').classList.toggle('hidden',run.scope==='global'&&!isWorker());
    $('runTitle').textContent=run.title;$('runLocation').textContent=run.locationLabel;$('runModeLabel').textContent=modeLabel(run.mode)+' · '+labels[run.status];
    $('runProgress').textContent=`${localRows().filter(r=>!r.retired&&r.quantity!==null).length}/${localRows().filter(r=>!r.retired).length} productos contados`;
    $('runHelp').textContent=run.mode==='guided'?(run.status==='draft'?'Importa desde Excel los productos de esta ubicación, revisa la lista y ábrela para los trabajadores. También puedes agregar productos manualmente.':'Cuenta los productos de la lista. Si encuentras otro, agrégalo con su nivel y cantidad.'):'Boceto nuevo: registra cada producto que encuentres con su nivel y cantidad, esté o no en el catálogo.';
    if(run.scope==='global')$('runHelp').textContent=run.status==='closed'?'Inventario cerrado. Los registros se conservan para consulta.':run.status==='paused'?'Inventario pausado. Los trabajadores podrán continuar cuando lo reanudes.':run.mode==='guided'?'Cuenta los productos de la lista. Los hallazgos adicionales requieren revisión en Gestión.':'Boceto nuevo: los trabajadores registran los productos encontrados; aquí puedes supervisar y corregir sus conteos.';
    $('runAdd').disabled=readonly;$('runStatus').classList.toggle('hidden',isWorker()||(run.scope==='global'&&run.status!=='closed'));$('runStatus').textContent=run.status==='open'?'Cerrar inventario':run.status==='closed'?'Reabrir inventario':'Abrir para trabajadores';$('runStatus').dataset.actionTone=run.status==='draft'?'confirm':'warning';
    $('runHelp').classList.toggle('hidden',isWorker());
    page.querySelector('.runs-heading h1+p').classList.toggle('hidden',isWorker());
    renderUnconfirmed();
    const visibleRows=renderPlaces().filter(r=>!r.retired),openLevels=prepareLevelHost();
    $('runRows').replaceChildren();$('runEmpty').classList.toggle('hidden',!!visibleRows.length);$('runEmpty').textContent=isWorker()&&!workerSpace&&run.scope==='global'?'Elige un espacio para ver y registrar sus productos.':'Todavía no hay productos. Agrega el primero.';
    createLevelCards(visibleRows,openLevels);
    for(const row of [...visibleRows].sort(staged()?(a,b)=>Number(!!withdrawal(a))-Number(!!withdrawal(b)):(a,b)=>(a.sortOrder??Number.MAX_SAFE_INTEGER)-(b.sortOrder??Number.MAX_SAFE_INTEGER)||a.level.localeCompare(b.level,'es',{numeric:true})||a.name.localeCompare(b.name,'es'))){
      const tr=node('tr',undefined,rowStateClass(row));tr.dataset.rowId=row.id;
      const name=node('td');name.append(node('strong',row.name),node('small',`${row.productId?row.sku:'Fuera del catálogo'} · ${run.mode==='blind'?'Registrado en el conteo':isApproved(row)?'Producto aprobado':row.prepared?'Lista inicial':'Producto encontrado'}`));
      if(isFinding(row))name.append(node('span','Nuevo · Encontrado por '+(row.foundBy||row.workerName),'run-found-badge'));
      if(row.locationLabel)name.append(node('small',row.locationLabel,'run-product-location'));
      const product=state.products.find(p=>p.id===row.productId);
      const productInfo=node('div',undefined,'run-product-info');while(name.firstChild)productInfo.append(name.firstChild);
      const productVisual=node('div',undefined,'run-product-visual');productVisual.append(rowPhoto(row)||node('span','Sin foto','run-no-photo'),productInfo);name.append(productVisual);
      const who=node('td');who.append(node('strong',row.workerName),node('small',(row.role==='admin'?'Administrador · ':'')+stamp(row.updatedAt)));
      const action=node('td');const edit=button(androidVersion>0?(row.quantity===null?'Ingresar cantidad':'Editar cantidad'):'Editar',()=>editRow(row));edit.disabled=readonly||shelfLocked()||!!row.localPending&&!row.localDraft||!!row.retirementReason;action.append(edit);
      if(!isWorker()&&run.scope==='global'&&run.mode==='blind'&&!row.productId&&!row.retired){const create=button('Crear en catálogo',()=>openFindingCatalog(row),'primary-button');create.disabled=readonly||!!row.localPending||row.retirement?.status==='pending';action.append(create);}
      if(row.localPending)name.append(node('span',row.localPending.status==='draft'?'Borrador local · Sin enviar':row.localPending.status==='conflict'?'Guardado local · Requiere revisión en Ver pendientes':'Guardado local · Pendiente de sincronizar','run-local-pending'));
      if(isApproved(row))name.append(node('small','Aprobado \u00b7 A\u00f1adido a la estructura'));
      if(isFinding(row)&&run.scope==='global'){
        if(!isWorker()){
          name.append(node('span','Pendiente de aprobación · Fuera de la estructura','run-found-badge'));
          const approve=button('Aprobar y añadir a estructura',()=>approveFinding(row,approve),'primary-button decision-approve');
          approve.disabled=row.retirement?.status==='pending'||!['open','paused','closed'].includes(run.status);if(row.productId)action.append(approve);
          const reject=button('Rechazar',()=>rejectFinding(row,reject),'ghost-button decision-reject');reject.disabled=approve.disabled;action.append(reject);
        }
      }
      if(row.retirement){name.append(node('small',row.retired?'Retirado · conteo conservado':row.retirement.status==='pending'?'Retiro pendiente · Solicitado por '+row.retirement.workerName+' · '+row.retirement.reason:'Solicitud de retiro rechazada'));}
      if(isWorker()&&!readonly&&!row.retired){const request=button('Solicitar retiro',()=>retirement(row,'request'),'ghost-button','danger');request.disabled=shelfLocked()||row.retirement?.status==='pending'||!!row.localPending&&!row.localDraft;action.append(request);if(row.retirementReason&&!shelfLocked())action.append(button('Cancelar retiro',()=>cancelDraftRetirement(row),'ghost-button','neutral'));}
      if(!isWorker()&&!row.retired&&!isFinding(row)&&['open','paused'].includes(run.status)&&row.retirement?.status!=='pending'){const withdraw=button('Retirar',()=>retirement(row,'withdraw'),'ghost-button','danger');withdraw.disabled=!!row.localPending;action.append(withdraw);}
      if(!isWorker()&&row.retirement?.status==='pending'&&run.status!=='closed')action.append(button('Aprobar retiro',()=>retirement(row,'approve'),'primary-button decision-approve'),button('Rechazar',()=>retirement(row,'reject'),'ghost-button decision-reject'));
      if(row.retired)edit.disabled=true;
      tr.append(node('td',row.level),name,node('td',row.quantity===null?'Por contar':String(row.quantity)),who,action);(adminRowBodies.get(row.id)||levelBodies.get(row.level)||$('runRows')).append(tr);if(staged()&&!readonly&&!shelfLocked()&&!withdrawal(row))enableShelfDrag(tr);
      if(isWorker()){
        const level=tr.children[0],quantity=tr.children[2],pill=node('span',undefined,'run-quantity-pill');
        level.replaceChildren(node('span','Nivel '),node('strong',row.level));
        pill.append(cardIcon('box'),node('span','Cantidad: '),node('strong',row.quantity===null?'Por contar':String(row.quantity)));quantity.replaceChildren(pill);pill.classList.toggle('not-counted',row.quantity===null);
        edit.prepend(cardIcon('edit'));for(const b of action.querySelectorAll('button'))if(b!==edit)b.prepend(cardIcon(b.textContent==='Cancelar retiro'?'cancel':'retire'));
        const pending=name.querySelector('.run-local-pending');if(pending){pending.prepend(cardIcon('document'));productInfo.prepend(pending);}
        tr.classList.toggle('run-sync-conflict',row.localPending?.status==='conflict');
      }
    }
    if(!olderLoaded)auditBefore=detail.nextBefore;
    const events=new Map([...auditEvents,...detail.events].map(e=>[e.sequence,e]));
    auditEvents=[...events.values()].sort((a,b)=>b.sequence-a.sequence);renderAudit(auditEvents,false);
  }
  function describe(value){
    if(!value)return 'Sin registro';
    if('generation' in value)return (value.status==='completed'?'Recibido en PC':value.status==='available'?'Disponible':'Reservado')+(value.worker_name?' · '+value.worker_name:'');
    if('level' in value)return `${value.locationLabel?value.locationLabel+' · ':''}Nivel ${value.level} · ${value.name} · Cantidad: ${value.quantity==null?'pendiente':value.quantity}`+(value.retired?' · Retirado':value.retirement?.status==='pending'?' · Retiro pendiente':'');
    if(value.locationId||value.location_id){const status={finished:'Recibido en PC',counting:'En conteo',pending:'Pendiente'};return (status[value.status]||labels[value.status]||'Estado del espacio')+((value.worker_name||value.name)?' · '+(value.worker_name||value.name):'');}
    if(value.title)return value.title+(labels[value.status]?' · '+labels[value.status]:'');
    if(value.revision!=null)return 'Revisión '+value.revision;
    return labels[value.status]||'Cambio registrado';
  }
  function renderAudit(events,append){
    $('runAdminAudit').replaceChildren();$('runWorkerAudit').replaceChildren();
    $('runAdminAuditTitle').closest('section').classList.toggle('hidden',isWorker());
    $('runAudit').classList.toggle('own-history',isWorker());
    $('runWorkerAuditTitle').textContent=isWorker()?'Mis cambios':'Historial de trabajadores';
    $('runMoreAudit').textContent=isWorker()?'Cargar mis cambios anteriores':'Cargar cambios anteriores de ambos historiales';
    if(isWorker())events=events.filter(e=>e.workerId===state.user.id&&e.role==='worker');
    const actions={space:'Estado del espacio',assignment:'Asignación de espacio',reject_finding:'Rechazo de producto encontrado',submit_space:'Entrega del andamio',arrange_space:'Orden y niveles del andamio',retirement:'Solicitud de retiro',incorporate_findings:'Incorporación de hallazgos a la estructura',remove_row:'Retiro de producto pendiente',layout:'Cambio de estructura',create:'Apertura del inventario',status:'Cambio de estado',add_row:'Registro de producto',edit_row:'Corrección del registro',import_row:'Importación de lista'};
    for(const event of events){
      const admin=event.role==='admin';
      const card=node('article',undefined,admin?'admin-change':'worker-change');card.append(node('strong',`${event.workerName}${admin?' · Administrador':' · Trabajador'}${event.workerId===state.user.id?' · Tú':''}`),node('time',stamp(event.date)),node('small',actions[event.action]||'Cambio registrado'),node('p','Antes: '+describe(event.before)),node('p','Después: '+describe(event.after)));if(event.reason)card.append(node('small','Motivo: '+event.reason));$(admin?'runAdminAudit':'runWorkerAudit').append(card);
    }
    for(const [panel,count] of [['runAdminAudit','runAdminAuditCount'],['runWorkerAudit','runWorkerAuditCount']]){const total=$(panel).children.length;$(count).textContent=total+' cambios cargados';if(!total)$(panel).append(node('p','No hay cambios en el historial cargado.','runs-help'));}
    if(!isWorker())for(const [panel,role] of [['runAdminAudit','admin'],['runWorkerAudit','worker']]){
      const heading=$(panel).previousElementSibling;
      heading.querySelector('.history-open-full')?.remove();
      const run=detail.run;
      heading.append(button(role==='admin'?'Ver historial del administrador':'Ver envíos de trabajadores',()=>window.InventoryHistory?.open({role,runId:run.id,runTitle:run.title}),'text-button history-open-full'));
    }
    $('runMoreAudit').classList.toggle('hidden',!auditBefore);
  }
  async function selectRun(id){if(selected!==id){workerCompany='';workerWarehouse='';workerSpace='';}selected=id;detail=null;auditEvents=[];olderLoaded=false;await poll();pulse();page.scrollTop=0;}
  function chooseProduct(product){picked=product;const box=$('runPicked');box.replaceChildren();const photo=productPhoto(product);if(photo)box.append(photo);box.append(node('strong',product.name),node('small',product.sku+' · '+(product.category||'')));box.classList.remove('hidden');$('runSearchResults').replaceChildren();stopNative();if(androidVersion>0){if($('runCatalog').contains(document.activeElement))document.activeElement.blur();dismissNumericKeyboard();}}
  function search(text,kind='manual',cameraMatches=null){
    if(kind!=='camera')cameraReview.classList.add('hidden');
    picked=null;$('runPicked').classList.add('hidden');$('runSearchResults').replaceChildren();
    if($('runProductKind').value==='free'){if(kind!=='manual')$('runFreeName').value=text.trim();$('runVoiceStatus').textContent='Revisa el nombre, nivel y cantidad antes de guardar.';return;}
    if(!text.trim())return;
    const useNew=()=>{stopNative();$('runProductKind').value='free';kindChanged();$('runFreeName').value=text.trim();$('runFreeName').focus();};
    $('runSearchResults').append(button('Agregar como producto nuevo',useNew,'ghost-button','add'));
    const matches=kind==='voice'?InventoryMatching.voiceRank(state.products,text):kind==='camera'?(cameraMatches||InventoryMatching.rank(state.products,text)).slice(0,3):manualProductMatches(text).slice(0,12).map(product=>({product}));
    if(kind==='voice'){
      $('runVoiceStatus').textContent=!matches.length?'No encontramos ese producto. Prueba con el tipo, marca y medida.':matches[0]?.confidence==='low'?`¿Quisiste decir: ${matches[0].product.name}? Revisa la presentación y elige.`:'Revisa la foto y la presentación. Elige el producto que vas a contar.';
    }
    for(const match of matches.slice(0,8)){
      const item=button('',()=>chooseProduct(match.product),'movement-result');item.append(node('strong',match.product.name),node('span',match.product.sku+' · '+(match.product.category||'')));const photo=productPhoto(match.product);if(photo){item.classList.add('has-product-photo');item.prepend(photo);}if(kind==='voice'||kind==='camera')item.append(node('span',InventoryMatching.voicePresentation(match.product),'voice-presentation'));if(match.label)item.append(node('small',match.label,'match-label'));if(kind==='camera')item.append(node('span','Elegir producto','camera-choice-action'));$('runSearchResults').append(item);
    }
    if(!matches.length)$('runSearchResults').append(node('p','Sin coincidencias. Puedes agregarlo como producto nuevo.','muted-note'));
  }
  function kindChanged(){$('runFreeHelp').textContent=detail?.run.mode==='blind'?'Escribe un nombre provisional y adjunta una foto. Se registrará en el conteo; Administración podrá completar su ficha en el catálogo.':'Si no sabes qué producto es, escribe un nombre provisional y adjunta una foto. Administración lo revisará como No confirmado.';const free=$('runProductKind').value==='free';rowWindow.classList.toggle('free-product',free);stopNative();$('runCatalog').classList.remove('hidden');$('runSearch').closest('label').classList.toggle('hidden',free);$('runSearchResults').replaceChildren();$('runPicked').classList.add('hidden');$('runFreeLabel').classList.toggle('hidden',!free);$('runFreeHelp').classList.toggle('hidden',!free);$('runFreeName').required=free;$('runBackToSearch').classList.toggle('hidden',!free);findingPhoto.box.classList.toggle('hidden',!free&&!rowEdit?.evidenceImage);}
  function editRow(row=null,entryLevel=null){
    if(staged()&&shelfLocked()){toast('Espacio terminado, reservado para otro responsable o con entrega pendiente.',true);return;}
    if(!detail||detail.run.status==='closed')return;
    rowRunChanged=false;
    const quantityOnly=!!row&&((isWorker()&&detail.run.mode==='guided'&&(!row.localDraft||row.prepared))||row.retirement?.status==='pending'||isApproved(row));
    rowWindow.classList.toggle('quantity-only',quantityOnly);
    collapseNumberPad();padTarget='runQuantity';padTitle.textContent='Cantidad encontrada';
    for(const id of ['runLevel','runQuantity'])$(id).classList.remove('pad-selected');quantityPad.querySelector('[data-decimal]').disabled=false;
    rowWindow.classList.toggle('desktop-edit',androidVersion<=0);
    rowWindow.classList.toggle('desktop-finding',androidVersion<=0&&!isWorker()&&!!row&&!isApproved(row)&&!!row.foundBy);
    $('runQuantity').type=androidVersion>0?'text':'number';
    // Android uses the in-app keypad for quantities. Readonly prevents the
    // WebView's native keyboard from opening on top of it on older devices.
    $('runQuantity').readOnly=androidVersion>0;
    $('runLevel').inputMode=androidVersion>0?'none':'text';$('runQuantity').inputMode=androidVersion>0?'none':'decimal';
    $('runLevel').readOnly=entryLevel!==null||(quantityOnly&&androidVersion>0);
    rowEdit=row;findingPhoto.set(row?.evidenceImage);picked=null;operation=InventoryOffline.id();pendingPayload=null;$('runRowForm').reset();$('runRowError').classList.add('hidden');
    $('runRowTitle').textContent=row?'Modificar registro':'Registrar producto';$('runVoiceStatus').textContent='';$('runSearchResults').replaceChildren();$('runPicked').classList.add('hidden');
    $('runProductKind').value=row&&!row.productId?'free':'catalog';kindChanged();
    rowWindow.classList.toggle('free-product',$('runProductKind').value==='free');
    const draft=detail.run.status==='draft';$('runQuantity').required=!draft;$('runDraftHelp').classList.toggle('hidden',!draft);$('runReasonLabel').classList.toggle('hidden',!row);$('runRowReason').required=!!row;
    const general=detail.run.scope==='global';rowLocationLabel.classList.toggle('hidden',!general||isWorker());rowLocation.required=general&&!isWorker();rowLocation.disabled=isWorker();
    rowLocation.replaceChildren(new Option('Selecciona la ubicación…',''),...(detail.run.locations||state.locations||[]).map(l=>new Option(l.label,l.id)));
    rowLocation.value=row?.locationId||(isWorker()?workerSpace:'')||(typeof currentLocation==='function'?currentLocation():'')||'';
    $('runVoice').classList.toggle('hidden',androidVersion<5);$('runMaster').classList.toggle('hidden',androidVersion<5);$('runCamera').classList.toggle('hidden',!liveCameraAvailable());
    if(row){$('runLevel').value=row.level;$('runQuantity').value=row.quantity??'';$('runFreeName').value=row.name;if(row.productId)chooseProduct({id:row.productId,name:row.name,sku:row.sku});}
    else if(entryLevel!==null)$('runLevel').value=entryLevel;
    if(quantityOnly){
      $('runRowTitle').textContent='Ingresar cantidad';
      $('runRowReason').value=row.quantity===null?'Conteo físico inicial':'Corrección de cantidad';
    }
    rowContext.classList.toggle('hidden',!quantityOnly||androidVersion<=0);rowContext.replaceChildren();
    if(quantityOnly){
      const product=state.products.find(p=>p.id===row.productId);
      const photo=productPhoto({name:row.name,image:product?.image||row.evidenceImage},'run-quantity-photo');
      const copy=node('div',undefined,'run-quantity-copy');
      copy.append(node('strong',row.name),node('small','Nivel '+row.level));
      if(photo)rowContext.append(photo);
      rowContext.append(copy);
    }
    $('runRowSave').textContent=quantityOnly?'Guardar cantidad':'Guardar registro';
    if(androidVersion>0&&!$('runEntryFields')){
      const fields=node('div',undefined,'run-entry-fields');fields.id='runEntryFields';
      const form=$('runRowForm');
      for(const child of [...form.children])if(child!==quantityPad&&!child.classList.contains('window-actions'))fields.append(child);
      form.prepend(fields);
    }
    openWindow(rowWindow);
    if(androidVersion>0){dismissNumericKeyboard();if(quantityOnly)showNumberPad('runQuantity');}
  }
  $('runRowForm').onsubmit=async e=>{
    e.preventDefault();if(saving||!detail)return;
    if(rowRunChanged){showError($('runRowError'),'El inventario cambió en la PC. No se guardará esta cantidad en otro inventario. Conserva el dato y cierra el formulario.');return;}
    if((rowWindow.classList.contains('quantity-only')||$('runQuantity').value!=='')&&($('runQuantity').value===''||!Number.isFinite(Number($('runQuantity').value))||Number($('runQuantity').value)<0||Number($('runQuantity').value)>1000000000)){
      showError($('runRowError'),'Ingresa una cantidad entre 0 y 1000000000.');return;
    }
    if($('runProductKind').value==='catalog'&&!picked){showError($('runRowError'),'Selecciona un producto del catálogo.');return;}
    let evidence;try{evidence=findingPhoto.get();}catch(error){showError($('runRowError'),error.message);return;}
    const payload={evidenceImage:evidence,restoreEpoch:detail.restoreEpoch??null,id:rowEdit?.id,expectedRevision:rowEdit?.revision,productId:$('runProductKind').value==='catalog'?picked.id:null,name:$('runFreeName').value,level:$('runLevel').value,quantity:$('runQuantity').value===''?null:Number($('runQuantity').value),reason:$('runRowReason').value};
    if(detail.run.scope==='global')payload.locationId=isWorker()?workerSpace:rowLocation.value;
    const signature=JSON.stringify(payload);if(pendingPayload!==signature){operation=InventoryOffline.id();pendingPayload=signature;}
    saving=true;const done=InventoryFormGuard.beginWork();$('runRowSave').disabled=true;$('runRowForm').inert=true;
    try{
      const runId=selected,user=state.user;
      if(staged()){
        await saveShelf(items=>{
          const found=items.findIndex(p=>(p.id||p.localId)===rowEdit?.id);
          const item={...(found>=0?items[found]:{}),...payload,name:picked?.name||payload.name,sku:picked?.sku||'',locationId:workerSpace};
          if(found>=0){item.id=items[found].id;item.expectedRevision=items[found].expectedRevision;}else{delete item.id;delete item.expectedRevision;item.localId='local-'+InventoryOffline.id();}
          if(items.some((p,i)=>i!==found&&p.level.toLowerCase()===item.level.toLowerCase()&&(item.productId?p.productId===item.productId:!p.productId&&p.name.toLowerCase()===item.name.toLowerCase())))throw new Error('Este producto ya está en ese nivel. Edita su cantidad.');
          if(found>=0)items[found]=item;else items.push(item);
        });closeEditor({saved:true});toast('Guardado en este celular. Puedes editarlo antes de terminar.');return;
      }
      const queued=(await InventoryOffline.list()).filter(e=>e.workerId===user.id&&e.runId===runId);
      if(queued.some(e=>e.id!==operation&&(payload.id?e.payload.id===payload.id:e.payload.locationId===payload.locationId&&e.payload.level===payload.level&&(payload.productId?e.payload.productId===payload.productId:!e.payload.productId&&e.payload.name===payload.name))))throw new Error('Este producto ya tiene un registro pendiente. Revísalo en Ver pendientes.');
      await InventoryOffline.put({id:operation,runId,month:detail.run.month,workerId:user.id,workerName:user.name,name:picked?.name||payload.name,sku:picked?.sku||'',createdAt:Date.now(),status:'pending',payload:{...payload,operationId:operation}});
      await refreshPendingList();closeEditor({saved:true});toast('Registro guardado en este equipo. Se enviará al conectar.');
      syncCounts().then(()=>{pulse();return poll();}).catch(()=>{});
    }
    catch(error){showError($('runRowError'),error.message+(error.status===409?' Cierra y vuelve a abrir el registro actualizado.':''));}
    finally{saving=false;$('runRowSave').disabled=false;$('runRowForm').inert=false;done();}
  };
  let warehouseDraft=[],companyDraft=[],editorCompany=null,layoutRevision=0,editorWarehouse=null,editorSavedDraft=null,editorSaving=false;
  let editorOwner=null,editorRecovery=null,editorStorageError=false,editorQuery='',editorView='cards';
  const editorDeleted=[],editorSelections=new WeakMap();
  const draftKey=()=> 'inventory-structure-draft-v1-'+editorOwner;
  function persistEditorDraft(){
    if(!editorOwner||editorOwner!==state.user?.id||editorSavedDraft===null||editorRecovery)return;
    try{
      if(editorIsDirty())localStorage.setItem(draftKey(),JSON.stringify({version:1,revision:layoutRevision,restoreEpoch:state.restoreEpoch??null,updatedAt:Date.now(),...JSON.parse(editorSnapshot())}));
      else localStorage.removeItem(draftKey());
      editorStorageError=false;
    }catch{editorStorageError=true;}
  }
  function removeEditorSpace(warehouse,space){
    const index=warehouse.spaces.indexOf(space);if(index<0)return;
    warehouse.spaces.splice(index,1);editorDeleted.push({warehouse,space,index});
    showEditorSpace(null);
  }
  function undoEditorSpace(){
    const removed=editorDeleted.pop();if(!removed)return;
    if(warehouseDraft.includes(removed.warehouse))removed.warehouse.spaces.splice(Math.min(removed.index,removed.warehouse.spaces.length),0,removed.space);
    renderEditor();
  }
  function duplicateEditorSpace(warehouse,space){
    const base=(space.name||'Andamio').slice(0,80);let number=1,name;
    do{name=base+' (copia '+number+')';number++;}while(warehouse.spaces.some(s=>normalizeText(s.name)===normalizeText(name)));
    const copy={name,products:space.products.map(p=>({name:p.name,level:String(p.level),productId:p.productId||null,evidenceImage:p.evidenceImage||''}))};
    warehouse.spaces.push(copy);editorQuery='';showEditorSpace(warehouse.spaces.length-1);
    editor.querySelector('.editor-space-identity input')?.focus();
  }
  function checkEditorResponse(saved){
    if(!Array.isArray(saved?.layout)||!Array.isArray(saved?.empresas)||!Number.isInteger(saved.revision))throw new Error('El servidor de PC no es compatible con este editor. Abre el EXE del paquete actualizado. Tu borrador no se ha reemplazado.');
    const ids=new Set(saved.empresas.map(e=>e.id));
    if(saved.layout.some(w=>!ids.has(w.empresa_id)||!Array.isArray(w.spaces)))throw new Error('La respuesta de guardado está incompleta. Se conserva tu borrador; revisa la versión del EXE antes de continuar.');
  }
  const editorSnapshot=()=>JSON.stringify({layout:warehouseDraft,empresas:companyDraft});
  const editor=node('section',undefined,'runs-page hidden warehouse-editor');editor.id='warehouseEditor';editor.tabIndex=-1;editor.setAttribute('aria-labelledby','warehouseEditorTitle');
  editor.innerHTML=`<div class="window-titlebar editor-navigation"><div><p class="eyebrow">EDITOR DE ALMACÉN</p><h2 id="warehouseEditorTitle" tabindex="-1">Almacenes</h2></div><div class="editor-navigation-actions"><button id="warehouseEditorClose" type="button" class="ghost-button editor-back">← Volver a Gestión</button><button id="warehouseEditorSave" type="button" class="primary-button">Guardar estructura</button></div></div><p>Configura tus almacenes, estantes o espacios. Agrega los productos conocidos por nivel; las cantidades quedan por contar.</p><p id="warehouseEditorMonth" class="runs-help"></p><div id="warehouseEditorBody"></div><button id="warehouseEditorAdd" type="button" class="ghost-button" data-action-tone="add">+ Agregar almacén</button><p id="warehouseEditorError" class="form-error hidden" role="alert"></p><p id="warehouseEditorDraftStatus" class="muted-note" role="status"></p><datalist id="warehouseEditorCatalog"></datalist>`;
  $('appShell').append(editor);
  let backupClock=null,backupReceived=0,backupLoading=false,lastBackupPoll=0;
  const backupPanel=node('section',undefined,'management-backups');backupPanel.id='backupsPanel';
  backupPanel.innerHTML='<div class="runs-people-heading"><h2>Copias de seguridad</h2><strong id="backupsCountdown" role="timer">Consultando…</strong></div><p>Se comprueban los cambios cada minuto mientras el programa de PC esté abierto, incluso sin inventario en curso. Cada copia incluye catálogo, fotos adjuntas, empresas, estructura, conteos, solicitudes e historial. Se conservan las 10 copias automáticas más recientes.</p><p id="backupsFolder" class="muted-note"></p><div class="runs-buttons"><button id="backupsCreate" type="button" class="primary-button" disabled>Crear copia ahora</button><button id="backupsRefresh" type="button" class="ghost-button">Actualizar copias</button></div><p id="backupsError" role="alert" class="form-error hidden"></p><details id="backupsHistory"><summary>Copias guardadas · Restaurar</summary><div id="backupsList"></div></details>';
  page.append(backupPanel);
  function renderBackupClock(){
    if(isWorker())return;
    const label=$('backupsCountdown');
    if(!backupClock){label.textContent='Consultando…';return;}
    if(performance.now()-backupReceived>15000){label.textContent='Sin conexión · contador sin actualizar';$('backupsCreate').disabled=true;return;}
    if(backupClock.remainingSeconds==null){label.textContent='Actualiza el programa de PC para respaldar también sin inventario abierto';return;}
    const seconds=Math.max(0,Math.ceil(backupClock.remainingSeconds-(performance.now()-backupReceived)/1000));
    label.textContent=seconds?'Próxima comprobación: '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):'Comprobando cambios…';
  }
  async function loadBackups(){
    if(backupLoading||isWorker())return;backupLoading=true;lastBackupPoll=Date.now();
    try{const result=await api('/api/backups');if(isWorker())return;backupClock=result;backupReceived=performance.now();$('backupsCreate').disabled=!(result.enabled||result.activeRun);renderBackupClock();$('backupsFolder').textContent=result.folder;$('backupsList').replaceChildren();$('backupsError').classList.add('hidden');if(result.error)showError($('backupsError'),'Falló la copia automática: '+result.error);
      for(const copy of result.copies){const card=node('article',undefined,'runs-help');const type=copy.name.startsWith('auto-')?'Automática':copy.name.startsWith('manual-')?'Manual':'Antes de restaurar';card.append(node('strong',type+' · '+new Date(copy.date*1000).toLocaleString('es-PE')),node('small',copy.name),node('p',(copy.bytes/1048576).toFixed(1)+' MB'),button('Restaurar esta copia',()=>askRestore(copy.name),'ghost-button','warning'));$('backupsList').append(card);}if(!result.copies.length)$('backupsList').append(node('p','Todavía no hay copias.'));
    }catch(error){showError($('backupsError'),error.message);backupReceived=0;renderBackupClock();}finally{backupLoading=false;}
  }
  $('backupsRefresh').onclick=loadBackups;
  const restoreWindow=node('section',undefined,'floating-window compact hidden');restoreWindow.id='backupRestoreWindow';restoreWindow.tabIndex=-1;restoreWindow.setAttribute('role','dialog');restoreWindow.setAttribute('aria-modal','true');restoreWindow.setAttribute('aria-label','Restaurar copia');
  restoreWindow.innerHTML='<h2>Restaurar copia</h2><p id="backupRestoreName"></p><p>Se reemplazarán todos los datos actuales por esta copia y se cerrarán las sesiones de PC y celulares. Antes se guardará una copia del estado actual. Coordina con los trabajadores; sus pendientes anteriores deberán revisarse.</p><form id="backupRestoreForm"><label>Escribe RESTAURAR<input id="backupRestoreText" required pattern="RESTAURAR" autocomplete="off" /></label><label class="camera-close-preference"><input id="backupRestoreConfirm" type="checkbox" required /> Confirmo que quiero recuperar esta copia.</label><p id="backupRestoreError" role="alert" class="form-error hidden"></p><div class="window-actions"><button id="backupRestoreCancel" type="button" class="ghost-button" data-action-tone="neutral">Cancelar</button><button type="submit" class="primary-button" data-action-tone="warning">Restaurar y cerrar sesiones</button></div></form>';
  document.body.append(restoreWindow);let restoreName='';function askRestore(name){restoreName=name;$('backupRestoreName').textContent=name;$('backupRestoreForm').reset();$('backupRestoreError').classList.add('hidden');openWindow(restoreWindow);}
  $('backupRestoreCancel').onclick=closeWindows;
  $('backupRestoreForm').onsubmit=async event=>{event.preventDefault();if(!InventoryFormGuard.request(()=>$('backupRestoreForm').requestSubmit(),{all:true}))return;const submit=event.target.querySelector('[type=submit]');submit.disabled=true;try{await api('/api/backups/restore','POST',{name:restoreName,confirmation:$('backupRestoreText').value,confirm:$('backupRestoreConfirm').checked});await InventoryOffline.clearSnapshot();InventoryFormGuard.reset();location.reload();}catch(error){showError($('backupRestoreError'),error.message);}finally{submit.disabled=false;}};
  $('backupsCreate').onclick=async()=>{$('backupsCreate').disabled=true;try{await api('/api/backups','POST',{});await loadBackups();toast('Copia guardada y verificada.');}catch(error){showError($('backupsError'),error.message);}finally{$('backupsCreate').disabled=!(backupClock?.enabled||backupClock?.activeRun)||performance.now()-backupReceived>15000;}};
  const editorLink=$('openRunsAdmin').cloneNode(true);editorLink.id='openWarehouseEditor';editorLink.href='#warehouseEditor';editorLink.querySelector('use').setAttribute('href','#i-warehouse');editorLink.querySelector('span').textContent='Editor de almacén';$('navCatalog').append(editorLink);editorLink.onclick=e=>{e.preventDefault();openEditor();};
  function editorInput(value,label,change){const wrap=node('label',label);const input=node('input');input.value=value;input.maxLength=200;input.oninput=()=>change(input.value);wrap.append(input);return wrap;}
  const editorOpenLevels=new WeakMap();
  let draggedProduct=null;
  function editorProductPicker(product){
    const host=node('div',undefined,'editor-product-picker');
    const selected=node('div',undefined,'editor-product-selected');
    const results=node('div',undefined,'editor-product-results');
    let choosing=!product.name.trim();
    const label=editorInput(product.name,'Buscar producto',v=>{searchProducts();});
    const input=label.querySelector('input');input.autocomplete='off';input.placeholder='Nombre o código del producto…';
    const guidance=node('p','Busca por nombre o código y selecciona un producto de la lista.','editor-picker-help');
    function updatePickerHelp(){guidance.classList.toggle('hidden',!choosing);}
    function preview(){
      const match=state.products.find(p=>p.id===product.productId)||state.products.find(p=>p.name.toLocaleLowerCase()===product.name.trim().toLocaleLowerCase());
      selected.replaceChildren();selected.classList.toggle('hidden',choosing);label.classList.toggle('hidden',!choosing);updatePickerHelp();results.replaceChildren();
      if(!choosing){selected.append(match&&productPhoto(match)||node('span','Sin foto','editor-no-photo'));const text=node('div');text.append(node('strong',match?.name||product.name),node('small',match?.sku||'Producto nuevo'));selected.append(text,button('Cambiar',()=>{choosing=true;preview();input.focus();},'ghost-button editor-product-change'));}
    }
    function searchProducts(){
      updatePickerHelp();results.replaceChildren();const words=normalizeText(input.value).trim().split(/\s+/).filter(Boolean);if(!words.length)return;
      const matches=state.products.filter(p=>words.every(w=>normalizeText(p.name+' '+p.sku).includes(w))).slice(0,8);
      for(const match of matches){const choice=button('',()=>{product.name=match.name;product.productId=match.id;input.value=match.name;choosing=false;preview();},'editor-product-option');choice.append(productPhoto(match)||node('span','Sin foto','editor-no-photo'));const text=node('span');text.append(node('strong',match.name),node('small',match.sku||'Producto del catálogo'));choice.append(text);results.append(choice);}
      if(!matches.length)results.append(node('p','No se encontraron productos. Revisa el nombre o código. Puedes crear productos desde el Gestor de productos.','runs-help'));
    }
    input.onkeydown=e=>{if(e.key==='Escape'){results.replaceChildren();e.stopPropagation();}};
    host.addEventListener('focusout',()=>setTimeout(()=>{if(!host.contains(document.activeElement))results.replaceChildren();},0));
    preview();host.append(selected,label,guidance,results);return host;
  }
  function moveEditorProduct(space,product,target){
    const from=space.products.indexOf(product);if(from<0||target<0||target>=space.products.length||from===target)return;
    space.products.splice(from,1);space.products.splice(target,0,product);renderEditor();
    const moved=[...editor.querySelectorAll('.editor-product')].find(row=>row._product===product);moved?.querySelector('.editor-drag-handle').focus({preventScroll:true});
    toast('Orden actualizado. Pulsa Guardar estructura para aplicarlo.');
  }
  const companyWindow=node('section',undefined,'floating-window compact hidden');companyWindow.id='editorCompanyWindow';companyWindow.tabIndex=-1;
  companyWindow.setAttribute('role','dialog');companyWindow.setAttribute('aria-modal','true');companyWindow.setAttribute('aria-labelledby','editorCompanyTitle');
  companyWindow.innerHTML='<h2 id="editorCompanyTitle">Crear empresa</h2><form id="editorCompanyForm"><label>Nombre de empresa<input id="editorCompanyName" maxlength="100" required /></label><p id="editorCompanyError" class="form-error hidden"></p><div class="window-actions"><button id="editorCompanyCancel" type="button" class="ghost-button" data-action-tone="neutral">Cancelar</button><button type="submit" class="primary-button">Guardar empresa</button></div></form>';
  document.body.append(companyWindow);let editingCompany=null;
  function entityPhotoPicker(form,capture=false){
    let value='',serial=0,loading=false;
    const box=node('div',undefined,'editor-photo-picker'),preview=node('img'),label=node('label','Seleccionar imagen'),input=node('input'),error=node('p',undefined,'form-error');
    input.type='file';input.accept='image/jpeg,image/png,image/webp';if(capture){input.setAttribute('capture','environment');label.firstChild.textContent='Tomar / adjuntar foto';}label.append(input);preview.alt='Vista previa de la imagen';
    const clear=button('Quitar imagen',()=>{serial++;loading=false;value='';input.value='';paint();},'ghost-button','danger');
    function paint(){preview.hidden=!value;if(value)preview.src=value;else preview.removeAttribute('src');clear.hidden=!value;}
    input.onchange=async event=>{const ticket=++serial;const file=event.target.files[0];if(!file)return;const done=InventoryFormGuard.beginWork();loading=true;error.textContent='';let url;
      try{if(file.size>15*1024*1024)throw new Error('Selecciona una imagen de menos de 15 MB.');url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,480/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',0.75);if(data.length>180000)throw new Error('La imagen tiene demasiado detalle. Selecciona una más pequeña.');if(ticket===serial){value=data;paint();}}
      catch(e){if(ticket===serial)error.textContent=e.message||'No se pudo abrir la imagen.';}finally{if(url)URL.revokeObjectURL(url);if(ticket===serial)loading=false;done();}
    };
    box.append(preview,label);
    if(capture){
      const file=node('input');file.type='file';file.accept=input.accept;file.onchange=input.onchange;
      input.hidden=true;file.hidden=true;input.setAttribute('aria-label','Foto de cámara');file.setAttribute('aria-label','Foto de galería');label.hidden=true;
      const actions=node('div',undefined,'finding-photo-actions');
      const take=button('Tomar foto',()=>{input.value='';input.click();},'finding-photo-button'),gallery=button('Elegir de galería',()=>{file.value='';file.click();},'finding-photo-button');
      const icon=path=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=path;return svg;};
      take.prepend(icon('<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>'));
      gallery.prepend(icon('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>'));
      actions.append(take,gallery);box.append(file,actions);
    }
    box.append(clear,error);form.querySelector('.window-actions').before(box);paint();InventoryFormGuard.value(form,box,()=>value);
    return {box,set(v){serial++;loading=false;value=v||'';input.value='';error.textContent='';paint();},get(){if(loading)throw new Error('Espera a que termine de cargar la imagen.');return value;}};
  }
  const companyPhoto=entityPhotoPicker($('editorCompanyForm'));
  const deleteCompany=button('Borrar empresa',()=>{
    if(!editingCompany)return;
    const id=editingCompany.id,warehouses=warehouseDraft.filter(w=>w.empresa_id===id),spaces=warehouses.reduce((n,w)=>n+w.spaces.length,0);
    if(!window.confirm(`¿Borrar la empresa «${editingCompany.name}» y sus ${warehouses.length} almacenes y ${spaces} espacios del Editor? Se aplicará al pulsar Guardar estructura. Los espacios con conteos registrados no se pueden eliminar.`))return;
    companyDraft=companyDraft.filter(c=>c.id!==id);warehouseDraft=warehouseDraft.filter(w=>w.empresa_id!==id);editorCompany=companyDraft[0]?.id||null;editorWarehouse=null;editingCompany=null;closeWindows({saved:true});renderEditor();toast('Empresa quitada del borrador. Pulsa Guardar estructura para aplicar.');
  },'ghost-button editor-company-delete');deleteCompany.id='editorCompanyDelete';$('editorCompanyForm').append(deleteCompany);
  const warehouseWindow=node('section',undefined,'floating-window compact hidden');warehouseWindow.id='editorWarehouseWindow';warehouseWindow.tabIndex=-1;warehouseWindow.setAttribute('role','dialog');warehouseWindow.setAttribute('aria-modal','true');warehouseWindow.setAttribute('aria-labelledby','editorWarehouseDialogTitle');
  warehouseWindow.innerHTML='<h2 id="editorWarehouseDialogTitle">Agregar almacén</h2><form id="editorWarehouseForm"><label>Nombre del almacén<input id="editorWarehouseName" maxlength="100" required /></label><p id="editorWarehouseDialogError" class="form-error hidden"></p><div class="window-actions"><button id="editorWarehouseCancel" type="button" class="ghost-button" data-action-tone="neutral">Cancelar</button><button type="submit" class="primary-button">Guardar almacén</button></div></form>';
  document.body.append(warehouseWindow);const warehousePhoto=entityPhotoPicker($('editorWarehouseForm'));let editingWarehouse=null,warehouseCompany=null;
  function openWarehouseDialog(warehouse){editingWarehouse=warehouse;warehouseCompany=warehouse?.empresa_id||editorCompany;$('editorWarehouseDialogTitle').textContent=warehouse?'Editar almacén':'Agregar almacén';$('editorWarehouseName').value=warehouse?.name||'';warehousePhoto.set(warehouse?.image);$('editorWarehouseDialogError').classList.add('hidden');openWindow(warehouseWindow);$('editorWarehouseName').focus();}
  $('editorWarehouseCancel').onclick=closeWindows;
  const spaceWindow=node('section',undefined,'floating-window compact hidden');spaceWindow.id='editorSpaceWindow';spaceWindow.tabIndex=-1;spaceWindow.setAttribute('role','dialog');spaceWindow.setAttribute('aria-modal','true');spaceWindow.setAttribute('aria-labelledby','editorSpaceTitle');
  spaceWindow.innerHTML='<h2 id="editorSpaceTitle">Agregar estante o espacio</h2><form id="editorSpaceForm"><label>Nombre del estante o espacio<input id="editorSpaceName" maxlength="100" required placeholder="Ej.: Estante 03" /></label><p id="editorSpaceError" class="form-error hidden" role="alert"></p><div class="window-actions"><button id="editorSpaceCancel" type="button" class="ghost-button" data-action-tone="neutral">Cancelar</button><button type="submit" class="primary-button">Crear estante</button></div></form>';
  document.body.append(spaceWindow);let spaceWarehouse=null;
  function openSpaceDialog(warehouse){spaceWarehouse=warehouse;$('editorSpaceForm').reset();$('editorSpaceError').classList.add('hidden');openWindow(spaceWindow);$('editorSpaceName').focus();}
  $('editorSpaceCancel').onclick=closeWindows;
  $('editorSpaceForm').onsubmit=e=>{e.preventDefault();const name=$('editorSpaceName').value.trim();if(!name||spaceWarehouse.spaces.some(s=>s.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){showError($('editorSpaceError'),'Escribe un nombre distinto para el estante o espacio.');return;}spaceWarehouse.spaces.push({name,products:[]});closeWindows({saved:true});showEditorSpace(null);};
  $('editorWarehouseForm').onsubmit=e=>{e.preventDefault();try{const name=$('editorWarehouseName').value.trim(),image=warehousePhoto.get();if(!name||warehouseDraft.some(w=>w!==editingWarehouse&&w.empresa_id===warehouseCompany&&w.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('Escribe un nombre distinto para el almacén.');if(editingWarehouse)Object.assign(editingWarehouse,{name,image});else warehouseDraft.push({empresa_id:warehouseCompany,name,image,spaces:[{name:'Estante 01',products:[]}]});editorWarehouse=null;editorCompany=warehouseCompany;closeWindows({saved:true});renderEditor();}catch(error){showError($('editorWarehouseDialogError'),error.message);}};
  function openCompanyDialog(rename){editingCompany=rename?companyDraft.find(c=>c.id===editorCompany):null;deleteCompany.classList.toggle('hidden',!editingCompany);$('editorCompanyTitle').textContent=rename?'Editar empresa':'Crear empresa';$('editorCompanyName').value=editingCompany?.name||'';companyPhoto.set(editingCompany?.image);$('editorCompanyError').classList.add('hidden');openWindow(companyWindow);$('editorCompanyName').focus();}
  $('editorCompanyCancel').onclick=closeWindows;
  $('editorCompanyForm').onsubmit=e=>{e.preventDefault();let image;try{image=companyPhoto.get();}catch(error){showError($('editorCompanyError'),error.message);return;}const name=$('editorCompanyName').value.trim();if(!name||companyDraft.some(c=>c!==editingCompany&&c.name.toLocaleLowerCase()===name.toLocaleLowerCase())){showError($('editorCompanyError'),'Escribe un nombre distinto para la empresa.');return;}if(editingCompany)Object.assign(editingCompany,{name,image});else{const company={id:InventoryOffline.id(),name,image};companyDraft.push(company);editorCompany=company.id;}editorWarehouse=null;closeWindows({saved:true});renderEditor();};
  function editorIsDirty(){return editorOwner===state.user?.id&&editorSavedDraft!==null&&editorSnapshot()!==editorSavedDraft;}
  InventoryFormGuard.begin(editor, {
    isDirty:editorIsDirty, busy:()=>editorSaving, preserveOnNavigate:true,apply:saveEditorStructure,
    discard:()=>{if(editorSavedDraft!==null){const saved=JSON.parse(editorSavedDraft);warehouseDraft=saved.layout;companyDraft=saved.empresas;editorDeleted.length=0;renderEditor();}}
  });
  InventoryFormGuard.value($('runRowForm'), 'product', () => picked?.id || '');
  function updateEditorDraftStatus(){
    persistEditorDraft();
    $('warehouseEditorDraftStatus').textContent=editorIsDirty()?(editorStorageError?'Cambios sin guardar. No se pudo respaldar el borrador en este equipo; guarda la estructura antes de cerrar.':'Borrador respaldado en este equipo. Pulsa Guardar estructura para aplicar los cambios.'):'Estructura guardada. Selecciona un almacén para editar sus espacios y andamios.';
    const undo=$('editorUndoSpace');if(undo){undo.classList.toggle('hidden',!editorDeleted.length);undo.textContent='Deshacer eliminación'+(editorDeleted.length>1?' ('+editorDeleted.length+')':'');}
  }
  let editorSpace=null;
  function showEditorSpace(index){
    editorSpace=index;renderEditor();editor.scrollTop=0;$('warehouseEditorTitle').focus({preventScroll:true});
  }
  function showEditorWarehouse(index){
    editorQuery='';editorSpace=null;editorWarehouse=index;renderEditor();editor.scrollTop=0;$('warehouseEditorTitle').focus({preventScroll:true});
  }
  editor.addEventListener('input',updateEditorDraftStatus);
  editor.addEventListener('change',updateEditorDraftStatus);
  editor.addEventListener('click',()=>queueMicrotask(updateEditorDraftStatus));
  window.addEventListener('pagehide',persistEditorDraft);
  const undoSpace=button('Deshacer eliminación',undoEditorSpace,'ghost-button hidden');undoSpace.id='editorUndoSpace';$('warehouseEditorSave').before(undoSpace);
  undoSpace.dataset.actionTone='neutral';
  function structureDownloadButton(warehouse){
    const download=button('Descargar estructura (Excel)',async()=>{
      download.disabled=true;
      try{
        const result=await api('/api/inventories/layout-export','POST',{warehouse});
        const bytes=Uint8Array.from(atob(result.xlsx),c=>c.charCodeAt(0));
        const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
        const link=document.createElement('a');link.href=url;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
        toast('Estructura descargada con cantidades en blanco.');
      }catch(error){toast(error.message||'No se pudo descargar la estructura.');}
      finally{download.disabled=false;}
    },'ghost-button');
    download.title='Espacios uno debajo de otro, con ID, nivel, nombre y cantidad en blanco';
    return download;
  }
  function warehouseIconButton(control,label,path){
    control.replaceChildren();control.classList.add('editor-warehouse-icon');
    control.setAttribute('aria-label',label);control.title=label;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=path;
    control.append(svg);return control;
  }
  function editorActionIcon(control,path){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('editor-action-icon');svg.innerHTML=path;control.prepend(svg);return control;
  }
  function editorBulkTools(warehouse,space,section){
    let selected=editorSelections.get(space);if(!selected){selected=new Set();editorSelections.set(space,selected);}
    for(const product of selected)if(!space.products.includes(product))selected.delete(product);
    const bar=node('div',undefined,'editor-bulk-tools');bar.dataset.unsavedIgnore='';
    const count=node('strong'),all=button('Seleccionar todos',()=>{space.products.forEach(p=>selected.add(p));sync();}),clear=button('Limpiar selección',()=>{selected.clear();sync();});
    const destination=node('select');destination.id='editorMoveDestination';
    const targets=[];
    warehouseDraft.filter(w=>w.empresa_id===warehouse.empresa_id).forEach(w=>w.spaces.forEach(s=>{targets.push(s);destination.append(new Option(w.name+' / '+s.name,String(targets.length-1)));if(s===space)destination.value=String(targets.length-1);}));
    destination.value=String(targets.indexOf(space));
    const destLabel=node('label','Espacio de destino');destLabel.append(destination);
    const level=node('input');level.id='editorMoveLevel';level.maxLength=40;level.placeholder='Ej.: 2';level.setAttribute('aria-label','Nivel de destino');
    const levelLabel=node('label','Nivel de destino');levelLabel.append(level);
    const error=node('p',undefined,'form-error hidden');error.setAttribute('role','alert');
    const move=button('Mover seleccionados',()=>{
      error.classList.add('hidden');const target=targets[Number(destination.value)],targetLevel=level.value.trim();
      if(!selected.size||!target||!targetLevel){error.textContent='Selecciona productos, espacio y nivel de destino.';error.classList.remove('hidden');return;}
      const items=space.products.filter(p=>selected.has(p));
      const key=p=>p.productId?'id:'+p.productId:'name:'+normalizeText(p.name).trim();
      const occupied=new Set(target.products.filter(p=>!selected.has(p)&&String(p.level)===targetLevel).map(key));
      for(const p of items){if(!p.name.trim()){error.textContent='Completa el producto vacío antes de moverlo.';error.classList.remove('hidden');return;}if(occupied.has(key(p))){error.textContent='El nivel de destino ya contiene uno de los productos seleccionados. No se movió ningún producto.';error.classList.remove('hidden');return;}occupied.add(key(p));}
      if(target!==space){space.products=space.products.filter(p=>!selected.has(p));target.products.push(...items);}
      items.forEach(p=>p.level=targetLevel);selected.clear();
      let opened=editorOpenLevels.get(target);if(!opened){opened=new Set();editorOpenLevels.set(target,opened);}opened.add(targetLevel);
      renderEditor();toast(items.length+' productos trasladados. Guarda la estructura para aplicar el cambio.');
    },'primary-button');move.id='editorMoveProducts';
    function sync(){count.textContent=selected.size+' seleccionados';move.disabled=!selected.size;clear.disabled=!selected.size;all.disabled=!space.products.length||selected.size===space.products.length;section.querySelectorAll('.editor-product').forEach(row=>{const checked=selected.has(row._product);row.classList.toggle('is-selected',checked);const input=row.querySelector('.editor-product-select');if(input)input.checked=checked;});}
    all.dataset.actionTone='neutral';clear.dataset.actionTone='neutral';
    editorActionIcon(move,'<path d="M4 12h16m-6-6 6 6-6 6"/>');
    const selectionHeader=node('div',undefined,'editor-selection-header');selectionHeader.append(count,all,clear);
    const transferFields=node('div',undefined,'editor-transfer-fields');transferFields.append(destLabel,levelLabel,move);
    bar.append(selectionHeader,transferFields,error);section.append(bar);sync();
    return {selected,sync};
  }
  function renderEditor(){
    if(editorWarehouse!==null&&!warehouseDraft[editorWarehouse])editorWarehouse=null;
    const selectedWarehouse=editorWarehouse===null?null:warehouseDraft[editorWarehouse];
    if(!selectedWarehouse||!selectedWarehouse.spaces[editorSpace])editorSpace=null;
    editor.classList.toggle('editing-space',editorSpace!==null);
    $('warehouseEditorTitle').textContent=selectedWarehouse?.name|| (selectedWarehouse?'Almacén sin nombre':'Almacenes');
    $('warehouseEditorClose').textContent=selectedWarehouse?'← Volver a almacenes':'← Volver a Gestión';
    if(editorSpace!==null)$('warehouseEditorClose').textContent='← Volver a estantes';
    $('warehouseEditorAdd').classList.add('hidden');
    updateEditorDraftStatus();
    const body=$('warehouseEditorBody');body.replaceChildren();
    if(editorRecovery){
      const recovery=node('aside',undefined,'editor-recovery');recovery.setAttribute('role','status');
      const compatible=editorRecovery.revision===layoutRevision&&(editorRecovery.restoreEpoch??null)===(state.restoreEpoch??null);
      recovery.append(node('strong','Hay un borrador de una sesión anterior'),node('p',compatible?'Puedes recuperar tus cambios sin guardar del '+new Date(editorRecovery.updatedAt).toLocaleString('es-PE')+'.':'La estructura del servidor cambió. Descarga tu borrador para conservarlo antes de descartarlo; no se reemplazará la estructura actual.'));
      if(compatible)recovery.append(button('Recuperar borrador',()=>{warehouseDraft=editorRecovery.layout;companyDraft=editorRecovery.empresas;editorRecovery=null;renderEditor();},'primary-button'));
      recovery.append(button('Descargar borrador',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(editorRecovery,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='borrador-estructura.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}),button('Descartar borrador',()=>{try{localStorage.removeItem(draftKey());}catch{}editorRecovery=null;renderEditor();}));
      body.append(recovery);
      // Resolve recovery before editing so the older copy cannot be overwritten.
      $('warehouseEditorSave').disabled=true;return;
    }
    $('warehouseEditorSave').disabled=editorSaving;
    if(!companyDraft.some(c=>c.id===editorCompany))editorCompany=companyDraft[0]?.id||null;
    const tabs=node('div',undefined,'editor-company-tabs editor-company-bar');tabs.setAttribute('aria-label','Empresas');
    const companyGrid=node('div',undefined,'editor-company-grid');
    for(const company of companyDraft){
      companyGrid.append(companyCard(company,{
        count:warehouseDraft.filter(w=>w.empresa_id===company.id).length,selected:company.id===editorCompany,
        onSelect:()=>{editorCompany=company.id;editorWarehouse=null;renderEditor();},
        onConfigure:()=>{editorCompany=company.id;editorWarehouse=null;renderEditor();openCompanyDialog(true);}
      }));
    }
    tabs.append(companyGrid);
    const addCompany=button('+',()=>openCompanyDialog(false),'ghost-button editor-company-add');addCompany.setAttribute('aria-label','Crear empresa');tabs.append(addCompany);
    if(editorSpace===null)body.append(tabs);

    if(editorWarehouse===null){
      const grid=node('div',undefined,'editor-warehouse-grid');
      warehouseDraft.forEach((warehouse,wi)=>{
        if(warehouse.empresa_id!==editorCompany)return;
        const choice=button('',()=>showEditorWarehouse(wi),'editor-warehouse-choice');
        const count=warehouse.spaces.reduce((total,space)=>total+space.products.length,0);
        const spacesLabel=warehouse.spaces.length===1?'1 espacio o andamio':warehouse.spaces.length+' espacios y andamios';
        choice.append(node('span','ALMACÉN','eyebrow'),node('strong',warehouse.name||'Almacén sin nombre'),node('span',spacesLabel+' · '+count+(count===1?' producto':' productos'),'editor-warehouse-count'),node('small',warehouse.spaces.map(space=>space.name||'Espacio sin nombre').join(' · ')||'Sin espacios creados'),node('span','Editar estructura →','editor-warehouse-enter'));
        if(warehouse.image){const photo=node('img',undefined,'editor-warehouse-photo');photo.src=warehouse.image;photo.alt='';choice.prepend(photo);}
        const tile=node('div',undefined,'editor-warehouse-tile');
        const actions=node('div',undefined,'editor-warehouse-actions');
        actions.append(
          warehouseIconButton(button('',()=>openWarehouseDialog(warehouse),'ghost-button'),'Editar nombre e imagen','<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z"/>'),
          warehouseIconButton(structureDownloadButton(warehouse),'Descargar estructura (Excel)','<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>')
        );
        tile.append(choice,actions);grid.append(tile);
      });
      const add=button('',()=>$('warehouseEditorAdd').click(),'editor-warehouse-choice editor-add-warehouse');add.disabled=!editorCompany;add.setAttribute('aria-label','Agregar almacén');
      add.append(node('span','+','editor-add-symbol'),node('strong','Agregar almacén'),node('small','Crear nuevo almacén'));grid.append(add);
      body.append(grid);
      if(!warehouseDraft.length)body.append(node('p','Todavía no hay almacenes creados. Agrega el primero para configurar sus espacios y andamios.','runs-help'));
      return;
    }
    warehouseDraft.forEach((warehouse,wi)=>{
      if(wi!==editorWarehouse)return;
      const card=node('section',undefined,'editor-warehouse');
      const toolbar=node('div',undefined,'editor-structure-toolbar');
      const overview=node('div',undefined,'editor-structure-overview');
      overview.append(node('span','ESTRUCTURA DEL ALMACÉN','eyebrow'),node('h2','Organiza tus espacios'),node('p',warehouse.spaces.length+' espacios · '+warehouse.spaces.reduce((total,space)=>total+space.products.length,0)+' productos en la estructura'));
      toolbar.append(overview,structureDownloadButton(warehouse));if(editorSpace===null)card.append(toolbar);
      const heading=node('div',undefined,'editor-heading');heading.append(editorInput(warehouse.name,'Nombre del almacén',v=>{warehouse.name=v;$('warehouseEditorTitle').textContent=v||'Almacén sin nombre';}),button('Quitar almacén',()=>{if(warehouse.spaces.some(s=>s.products.length)&&!confirm('¿Quitar este almacén y sus productos del boceto?'))return;warehouseDraft.splice(wi,1);showEditorWarehouse(null);},'ghost-button worker-delete'));if(editorSpace===null)card.append(heading);
      if(editorSpace===null){
        card.append(node('h2','Elige un estante o espacio'));
        const controls=node('div',undefined,'editor-space-tools');
        const searchLabel=node('label','Buscar andamio o producto');const search=node('input');search.type='search';search.id='editorSpaceSearch';search.value=editorQuery;search.placeholder='Nombre del espacio, producto o código';
        const searchField=node('span',undefined,'editor-search-field');editorActionIcon(searchField,'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>');searchField.append(search);searchLabel.append(searchField);
        const views=node('div',undefined,'editor-view-switch');views.setAttribute('role','group');views.setAttribute('aria-label','Vista de espacios');
        for(const [value,label] of [['cards','Tarjetas'],['list','Lista']]){const control=button(label,()=>{editorView=value;try{localStorage.setItem('inventory-editor-view',value);}catch{}renderEditor();});control.dataset.actionTone='neutral';control.setAttribute('aria-pressed',String(editorView===value));editorActionIcon(control,value==='cards'?'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>':'<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>');views.append(control);}
        controls.append(searchLabel,views);card.append(controls);
        const grid=node('div',undefined,'editor-warehouse-grid editor-space-grid');
        grid.classList.toggle('editor-space-list',editorView==='list');
        warehouse.spaces.forEach((space,si)=>{
          const choice=button('',()=>showEditorSpace(si),'editor-warehouse-choice');
          choice.append(node('span','ESTANTE / ESPACIO','eyebrow'),node('strong',space.name||'Espacio sin nombre'),node('span',space.products.length+' productos','editor-warehouse-count'),node('span','Editar productos →','editor-warehouse-enter'));
          const tile=node('div',undefined,'editor-warehouse-tile editor-space-tile');
          tile._space=space;
          const actions=node('div',undefined,'editor-warehouse-actions');
          const edit=warehouseIconButton(button('',()=>{
            showEditorSpace(si);
            const input=body.querySelector('.editor-space-identity input');input?.focus();input?.select();
          },'ghost-button'),'Editar '+(space.name||'espacio'),'<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z"/>');
          const remove=warehouseIconButton(button('',()=>removeEditorSpace(warehouse,space),'ghost-button worker-delete'),'Eliminar '+(space.name||'espacio'),'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>');
          const duplicate=warehouseIconButton(button('',()=>duplicateEditorSpace(warehouse,space),'ghost-button'),'Duplicar '+(space.name||'espacio'),'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>');
          actions.append(edit,duplicate,remove);tile.append(choice,actions);grid.append(tile);
        });
        const result=node('p',undefined,'muted-note');result.id='editorSpaceResults';result.setAttribute('role','status');
        const filter=()=>{editorQuery=search.value;const words=normalizeText(editorQuery).trim().split(/\s+/).filter(Boolean);let count=0;
          for(const tile of grid.querySelectorAll('.editor-space-tile')){const space=tile._space;const haystack=normalizeText(space.name+' '+space.products.map(p=>{const catalog=state.products.find(c=>c.id===p.productId);return p.name+' '+(catalog?.sku||'')+' '+(catalog?.barcode||'');}).join(' '));const match=words.every(w=>haystack.includes(w));tile.hidden=!match;if(match)count++;}
          result.textContent=count?'Mostrando '+count+' de '+warehouse.spaces.length+' espacios':'No se encontraron espacios. Prueba con otro nombre o código.';
        };search.oninput=filter;filter();card.append(result);
        const add=button('',()=>openSpaceDialog(warehouse),'editor-warehouse-choice editor-add-warehouse');
        add.append(node('span','+','editor-add-symbol'),node('strong','Agregar estante o espacio'));grid.append(add);card.append(grid);body.append(card);return;
      }
      const navigation=node('div',undefined,'editor-space-navigation');
      navigation.append(node('span','ESPACIOS DEL ALMACÉN','eyebrow'));
      const previous=button('← Anterior',()=>showEditorSpace(editorSpace-1),'ghost-button');previous.disabled=editorSpace===0;
      const next=button('Siguiente →',()=>showEditorSpace(editorSpace+1),'ghost-button');next.disabled=editorSpace===warehouse.spaces.length-1;
      navigation.append(previous,node('span',(editorSpace+1)+' de '+warehouse.spaces.length,'editor-space-position'),next);card.append(navigation);
      warehouse.spaces.forEach((space,si)=>{
        if(si!==editorSpace)return;
        const section=node('section',undefined,'editor-space');
        const top=node('div',undefined,'editor-space-header');
        const identity=node('div',undefined,'editor-space-identity');
        const nameField=editorInput(space.name,'Nombre del andamio o espacio',v=>{space.name=v;});
        nameField.querySelector('input').maxLength=100;
        const levelCount=new Set(space.products.map(p=>String(p.level))).size;
        identity.append(nameField,node('p',space.products.length+(space.products.length===1?' producto':' productos')+' · '+levelCount+(levelCount===1?' nivel':' niveles'),'editor-space-metrics'));
        const remove=button('Eliminar espacio',()=>removeEditorSpace(warehouse,space),'ghost-button worker-delete');
        editorActionIcon(remove,'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>');
        top.append(identity,remove);section.append(top);
        const selection=editorBulkTools(warehouse,space,section);
        let openLevels=editorOpenLevels.get(space);if(!openLevels){openLevels=new Set();editorOpenLevels.set(space,openLevels);}
        const addProduct=level=>{const product={name:'',level};space.products.push(product);openLevels.add(level);renderEditor();const row=[...body.querySelectorAll('.editor-product')].find(row=>row._product===product);row?.querySelector('.editor-product-picker input')?.focus();};
        const levels=[...new Set(space.products.map(product=>String(product.level)))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
        if(!levels.length)levels.push('1');
        section.append(node('p','Abre un nivel para editar sus productos. Arrastra desde ⋮⋮ o usa las flechas para ordenarlos dentro del nivel.','muted-note'));
        const groups=node('div',undefined,'editor-level-groups');section.append(groups);
        for(const level of levels){
          const levelProducts=space.products.filter(product=>String(product.level)===level);
          const group=node('details',undefined,'shelf-level-card editor-level-card');group.dataset.level=level;group.open=openLevels.has(level);
          group.ontoggle=()=>{if(!group.isConnected)return;if(group.open)openLevels.add(level);else openLevels.delete(level);};
          const title=node('summary'),label=node('span');label.append(node('strong','Nivel '+level),node('small',levelProducts.length+' '+(levelProducts.length===1?'producto':'productos')));
          title.append(node('span','≡','shelf-review-icon'),label,node('span','⌄','shelf-level-chevron'));
          const content=node('div',undefined,'shelf-level-content'),productList=node('div',undefined,'editor-product-list');productList.setAttribute('role','list');content.append(productList);group.append(title,content);groups.append(group);
        levelProducts.forEach((product,li)=>{
          const pi=space.products.indexOf(product),previous=space.products.indexOf(levelProducts[li-1]),next=space.products.indexOf(levelProducts[li+1]);
          const row=node('div',undefined,'editor-product');row._product=product;row.setAttribute('role','listitem');
          const selectProduct=node('input');selectProduct.type='checkbox';selectProduct.className='editor-product-select';selectProduct.checked=selection.selected.has(product);selectProduct.setAttribute('aria-label','Seleccionar '+(product.name||'producto'));selectProduct.onchange=()=>{if(selectProduct.checked)selection.selected.add(product);else selection.selected.delete(product);selection.sync();};
          row.classList.toggle('is-selected',selectProduct.checked);
          const handle=button('⋮⋮',()=>{},'ghost-button editor-drag-handle','neutral');handle.draggable=true;handle.title='Arrastrar para ordenar';handle.setAttribute('aria-label','Mover '+(product.name||'producto')+' (Alt + flecha arriba o abajo)');
          handle.onkeydown=e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();moveEditorProduct(space,product,e.key==='ArrowUp'?previous:next);}};
          handle.ondragstart=e=>{draggedProduct={space,product};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(pi));row.classList.add('is-dragging');};
          handle.ondragend=()=>{draggedProduct=null;editor.querySelectorAll('.drop-above,.drop-below,.is-dragging').forEach(el=>el.classList.remove('drop-above','drop-below','is-dragging'));};
          row.ondragover=e=>{if(draggedProduct?.space!==space||draggedProduct.product===product||String(draggedProduct.product.level)!==level)return;e.preventDefault();e.dataTransfer.dropEffect='move';const below=e.clientY>row.getBoundingClientRect().top+row.offsetHeight/2;row.classList.toggle('drop-below',below);row.classList.toggle('drop-above',!below);};
          row.ondragleave=e=>{if(!row.contains(e.relatedTarget))row.classList.remove('drop-above','drop-below');};
          row.ondrop=e=>{e.preventDefault();if(draggedProduct?.space!==space||String(draggedProduct.product.level)!==level)return;const source=draggedProduct.product;const from=space.products.indexOf(source);const below=e.clientY>row.getBoundingClientRect().top+row.offsetHeight/2;let target=pi+(below?1:0);if(from<target)target--;draggedProduct=null;moveEditorProduct(space,source,target);row.classList.remove('drop-above','drop-below');};
          const options=node('div',undefined,'editor-product-actions');const up=button('↑',()=>moveEditorProduct(space,product,previous));up.disabled=li===0;up.setAttribute('aria-label','Subir producto');const down=button('↓',()=>moveEditorProduct(space,product,next));down.disabled=li===levelProducts.length-1;down.setAttribute('aria-label','Bajar producto');options.append(up,down,button('Quitar',()=>{space.products.splice(space.products.indexOf(product),1);renderEditor();},'ghost-button worker-delete'));
          const levelField=editorInput(product.level,'Nivel',v=>product.level=v);
          levelField.querySelector('input').onchange=()=>{product.level=product.level.trim()||level;openLevels.add(String(product.level));renderEditor();};
          const rowTools=node('div',undefined,'editor-row-tools');rowTools.append(selectProduct,handle);
          row.append(rowTools,editorProductPicker(product),levelField,node('span','Por contar','editor-count-status'),options);productList.append(row);
        });
          if(!levelProducts.length)productList.append(node('p','Todavía no hay productos en este nivel.','shelf-level-empty'));
          content.append(button('+ Agregar producto',()=>addProduct(level),'ghost-button','add'));
        }
        section.append(button('+ Agregar nivel',()=>{const numeric=levels.map(Number).filter(Number.isFinite);addProduct(String(Math.max(0,...numeric)+1));},'ghost-button editor-add-level','add'));
        card.append(section);
      });
      body.append(card);
    });
    if(!warehouseDraft.length)body.append(node('p','Agrega un almacén para comenzar.','runs-help'));
  }
  async function openEditor(){
    if(isWorker())return;
    if(editorSaving)return;
    if(editorOwner!==state.user?.id){
      editorOwner=state.user?.id;editorSavedDraft=null;editorRecovery=null;warehouseDraft=[];companyDraft=[];editorDeleted.length=0;editorSpace=null;editorQuery='';
    }
    try{editorView=localStorage.getItem('inventory-editor-view')==='list'?'list':'cards';}catch{}
    close();setSidebar(false);editor.classList.remove('hidden');
    document.querySelectorAll('.side-nav a').forEach(link=>{const active=link.id==='openWarehouseEditor';link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    $('warehouseEditorMonth').textContent='Guarda la estructura aquí. En Gestión podrás usarla al abrir un inventario con Boceto nuevo. Los cambios se reflejan en el inventario abierto y en los celulares conectados.';
    $('warehouseEditorCatalog').replaceChildren(...state.products.map(p=>new Option(p.name,p.name)));
    $('warehouseEditorError').classList.add('hidden');editorWarehouse=null;
    if(editorIsDirty()){renderEditor();return;}
    $('warehouseEditorBody').replaceChildren(node('p','Cargando almacenes…','runs-help'));$('warehouseEditorAdd').disabled=true;$('warehouseEditorSave').disabled=true;
    const requestOwner=editorOwner;
    try{
      const saved=await api('/api/inventories/layout');if(state.user?.id!==requestOwner)return;checkEditorResponse(saved);
      warehouseDraft=saved.layout;companyDraft=saved.empresas;editorSavedDraft=editorSnapshot();layoutRevision=saved.revision;editorDeleted.length=0;editorRecovery=null;
      try{
        const raw=localStorage.getItem(draftKey());
        if(raw){const recovered=JSON.parse(raw);checkEditorResponse(recovered);
          if(recovered.version!==1||!recovered.layout.every(w=>w.spaces.every(s=>typeof s.name==='string'&&Array.isArray(s.products)&&s.products.every(p=>typeof p.name==='string'&&typeof p.level==='string'))))throw new Error('Borrador inválido');
          editorRecovery=recovered;
        }
      }catch{editorStorageError=true;showError($('warehouseEditorError'),'No se pudo leer el borrador local. Se cargó la estructura del servidor.');}
      renderEditor();
    }catch(error){showError($('warehouseEditorError'),error.message);}finally{$('warehouseEditorAdd').disabled=$('warehouseEditorSave').disabled;}
  }
  $('warehouseEditorClose').onclick=()=>{if(editorSpace!==null)showEditorSpace(null);else if(editorWarehouse!==null)showEditorWarehouse(null);else open();};
  $('warehouseEditorAdd').onclick=()=>{if(editorCompany)openWarehouseDialog(null);};
  $('runsMode').onchange=updateCreateMonth;
  async function saveEditorStructure(){
    if(editorSaving||editorRecovery||editorOwner!==state.user?.id)return false;editorSaving=true;
    const b=$('warehouseEditorSave');b.disabled=true;$('warehouseEditorError').classList.add('hidden');
    $('warehouseEditorBody').inert=true;$('warehouseEditorClose').disabled=true;
    try{
      const current=await api('/api/inventories/layout');checkEditorResponse(current);
      if(current.revision!==layoutRevision)throw new Error('La estructura cambió en otra sesión. Se conserva tu borrador; no se ha enviado ningún cambio.');
      const layout=warehouseDraft.map((w,wi)=>{
        const name=w.name.trim();
        if(!name||name.length>100)throw new Error(`Revisa el nombre del almacén ${wi+1}: escribe entre 1 y 100 caracteres.`);
        return {empresa_id:w.empresa_id,name,image:w.image||'',spaces:w.spaces.map((s,si)=>{
          const spaceName=s.name.trim();
          if(!spaceName||spaceName.length>100)throw new Error(`Revisa el nombre del espacio ${si+1} de «${name}»: escribe entre 1 y 100 caracteres.`);
          const products=s.products.filter(p=>p.productId||p.name.trim()).map((p,pi)=>{
            const title=p.name.trim(),level=p.level.trim();
            if(!title||title.length>200)throw new Error(`Revisa el nombre del producto ${pi+1} en «${name} / ${spaceName}»: escribe entre 1 y 200 caracteres.`);
            if(!level||level.length>40)throw new Error(`Completa el nivel de «${title}» en «${name} / ${spaceName}» (máximo 40 caracteres).`);
            return {name:title,level,evidenceImage:p.evidenceImage||'',productId:p.productId||state.products.find(x=>x.name.toLocaleLowerCase()===title.toLocaleLowerCase())?.id||null};
          });
          return {id:s.id,name:spaceName,products};
        })};
      });
      const saved=await api('/api/inventories/layout','POST',{layout,empresas:companyDraft,expectedRevision:layoutRevision});checkEditorResponse(saved);
      saved.layout.forEach((warehouse,wi)=>warehouse.spaces.forEach((space,si)=>{const previous=warehouseDraft[wi]?.spaces[si],open=previous&&editorOpenLevels.get(previous);if(open)editorOpenLevels.set(space,new Set(open));}));
      layoutRevision=saved.revision;warehouseDraft=saved.layout;companyDraft=saved.empresas;editorSavedDraft=editorSnapshot();editorDeleted.length=0;renderEditor();toast('Estructura guardada. Puedes abrir el inventario desde Gestión.');
      return true;
    }catch(error){showError($('warehouseEditorError'),error.message);return false;}finally{editorSaving=false;b.disabled=false;$('warehouseEditorBody').inert=false;$('warehouseEditorClose').disabled=false;}
  }
  $('warehouseEditorSave').onclick=saveEditorStructure;
  $('runsCreate').onsubmit=async e=>{
    e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;const done=InventoryFormGuard.beginWork();e.target.inert=true;
    const existing=listing?.runs.find(r=>r.scope==='global'&&r.month===$('managementMonth').value);
    if(existing){try{await selectRun(existing.id);}finally{b.disabled=false;e.target.inert=false;done();}return;}
    try{let layout;
      {const saved=await api('/api/inventories/layout');if(!saved.layout.length){b.disabled=false;await openEditor();return;}layout=saved.layout;}
      const result=await api('/api/inventories','POST',{title:$('runsTitle').value,mode:$('runsMode').value,month:$('managementMonth').value,scope:'global',layout});$('runsTitle').value='';InventoryFormGuard.clean($('runsCreate'));await refreshState(true);await selectRun(result.run.id);toast('Mes e inventario abiertos para todos los trabajadores.');}catch(error){connection(error.message,true);}finally{b.disabled=false;e.target.inert=false;done();}
  };
  let statusRevision=null,statusTarget=null,statusRun=null,closeReview=null,statusReviewRequest=0,statusNeedsReview=false;
  $('runQuantity').closest('label').append(node('small','Si no hay unidades, escribe 0. El producto conserva su lugar en el estante.'));
  const reviewPanel=node('div');reviewPanel.id='runCloseReview';$('runStatusForm').prepend(reviewPanel);
  async function loadCloseReview(){
    const request=++statusReviewRequest,runId=statusRun,user=state.user;
    closeReview=null;reviewPanel.replaceChildren(node('p','Comprobando conteos y pendientes…'));$('runStatusForm').querySelector('[type=submit]').disabled=true;
    try{const check=await api('/api/inventories/'+runId+'/close-review');if(request!==statusReviewRequest||statusRun!==runId||state.user!==user||statusWindow.classList.contains('hidden'))return;closeReview=check;statusRevision=check.revision;
      const retirements=check.retirements||[];
      reviewPanel.replaceChildren(node('h3',`${check.readySpaces}/${check.totalSpaces} espacios en verde`),node('p',check.canClose?'Todo está terminado, revisado y guardado. Puedes cerrar el inventario.':'El cierre estará disponible cuando todos los espacios estén en verde, la estructura esté actualizada y no haya envíos pendientes reportados.','run-close-state '+(check.canClose?'is-ready':'is-pending')));
      if(retirements.length){const section=node('details');section.open=true;section.append(node('summary','Solicitudes de retiro pendientes'));const list=node('ul');for(const item of retirements)list.append(node('li',item.name+' · '+item.location+' · '+item.worker+' · '+item.reason));section.append(list,node('p','Aprueba o rechaza estas solicitudes en Gestión antes de cerrar.'));reviewPanel.append(section);}
      for(const [title,items] of [['Espacios pendientes',check.spaces.filter(s=>!s.ready).map(s=>s.label+' · '+[s.missing?s.missing+' sin contar':'',s.unconfirmed?s.unconfirmed+' por confirmar':'',s.retirements?s.retirements+' retiros pendientes':'',!s.total&&!s.countComplete?'Falta confirmar que el espacio está vacío':''].filter(Boolean).join(' · '))],['Productos por confirmar',check.found.map(p=>p.name+' · '+p.location+' · '+p.worker)],['Celulares con pendientes',check.devices.map(d=>d.workerName+': '+d.pending+' pendientes'+(d.offline?' · sin conexión reciente':''))]]){if(items.length){const section=node('details');section.append(node('summary',title+' ('+items.length+')'));const list=node('ul');for(const item of items)list.append(node('li',item));section.append(list);reviewPanel.append(section);}}
      const structure=node('section',undefined,'run-close-structure');structure.append(node('strong',check.structure.updated?'Estructura actualizada':'Estructura pendiente de actualizar'));
      if(!check.structure.updated){
        structure.append(node('p','Guarda en la estructura los productos, niveles y orden confirmados de cada espacio. Las cantidades del inventario se conservan.'));
        const affected=node('ul');for(const item of check.structure.differences)affected.append(node('li',item.label+' · '+item.reason));const changes=node('details');changes.append(node('summary','Ver cambios de estructura ('+check.structure.differences.length+')'),affected);structure.append(changes);
        const sync=button('Actualizar estructura con este inventario',async()=>{
          if(editorIsDirty()){showError($('runStatusError'),'Guarda primero tu borrador del Editor de almacén.');return;}
          sync.disabled=true;
          try{await api('/api/inventories/'+runId+'/sync-structure','POST',{reviewToken:check.token});if(state.user!==user)return;editorSavedDraft=null;await poll(true);if(statusRun===runId&&!statusWindow.classList.contains('hidden'))await loadCloseReview();toast('Estructura actualizada; cantidades conservadas.');}
          catch(error){showError($('runStatusError'),error.message);if(statusRun===runId)await loadCloseReview();}
        },'primary-button');sync.id='runSyncStructure';sync.disabled=!check.structure.canSync;structure.append(sync);
        if(!check.structure.canSync)structure.append(node('p','Primero termina y revisa todos los espacios. Si falta un espacio en la estructura, revísalo en el Editor de almacén.','runs-help'));
      }
      reviewPanel.append(structure);const syncCheck=node('section',undefined,'run-close-structure');syncCheck.append(node('strong','Estado de envíos de los celulares'));const devices=check.syncConfirmation?.devices||[];if(!devices.length)syncCheck.append(node('p','No hay celulares participantes registrados para este inventario.'));for(const d of devices)syncCheck.append(node('p',(d.adminResolved?'✓ Revisión administrativa: ':d.pending?'Pendiente: ':d.confirmed?'✓ Verificado: ':'Sin pendientes reportados: ')+d.workerName+(d.pending?' · '+d.pending+' registros sin enviar':''),!d.pending||d.adminResolved?'sync-check-done':'sync-check-pending'));for(const d of devices.filter(d=>(d.unavailable||d.staleReview)&&!d.confirmed)){
        const box=node('div',undefined,'sync-resolution');box.append(node('strong',(d.staleReview?'Revisar aviso antiguo: ':'Revisar cuenta no disponible: ')+d.workerName),node('p',d.staleReview?'Hay un celular actual conectado sin pendientes, pero este identificador conserva un aviso anterior. Verifica que no corresponda a otro celular con entregas antes de resolver.': 'La cuenta fue eliminada o desactivada. Verifica sus espacios y recupera o concilia cualquier pendiente antes de resolver. No se enviarán ni borrarán registros del celular.'));
        const reason=node('textarea');reason.placeholder='Explica cómo verificaste los conteos';reason.setAttribute('aria-label','Motivo de resolución de '+d.workerName);const label=node('label'),accept=node('input');accept.type='checkbox';label.append(accept,document.createTextNode('He conciliado los pendientes y revisado los espacios de esta persona.'));
        const resolve=button('Registrar revisión administrativa',async()=>{resolve.disabled=true;try{await api('/api/inventories/'+runId+'/sync-resolve','POST',{deviceKey:d.deviceKey,reviewToken:check.token,reason:reason.value,confirm:accept.checked,restoreEpoch:detail?.restoreEpoch??null});await loadCloseReview();}catch(e){showError($('runStatusError'),e.message);resolve.disabled=false;}},'ghost-button');resolve.disabled=true;const valid=()=>{resolve.disabled=!accept.checked||reason.value.trim().length<10;};accept.onchange=valid;reason.oninput=valid;box.append(reason,label,resolve);syncCheck.append(box);
      }syncCheck.append(node('p','Verificar envíos en Mis espacios comprueba cada celular. No se exige esa confirmación para cerrar; los envíos pendientes reportados sí requieren revisión.','runs-help'));reviewPanel.append(syncCheck);
      const label=node('label',undefined,'camera-close-preference');const checkbox=node('input');checkbox.type='checkbox';checkbox.id='runCloseAcknowledged';checkbox.dataset.unsavedIgnore='';checkbox.required=true;checkbox.disabled=!check.canClose;label.append(checkbox,document.createTextNode('He revisado el inventario y confirmo su cierre.'));reviewPanel.append(label,button('Actualizar revisión',loadCloseReview,'ghost-button run-close-refresh'));
      const updateCloseButton=()=>{$('runStatusForm').querySelector('[type=submit]').disabled=!check.canClose||!checkbox.checked;};checkbox.onchange=updateCloseButton;updateCloseButton();
    }catch(error){if(request!==statusReviewRequest)return;showError($('runStatusError'),error.message);reviewPanel.replaceChildren(button('Reintentar revisión',loadCloseReview));}
  }

  function askStatus(run,target){if(target==='closed'&&editorIsDirty()){toast('Guarda primero los cambios pendientes del Editor de almacén.',true);return;}statusReviewRequest++;statusRun=run.id;statusRevision=run.revision;statusTarget=target;statusNeedsReview=target==='closed'&&run.scope==='global';statusWindow.classList.toggle('is-close-review',statusNeedsReview);$('runStatusTitle').textContent=target==='paused'?'Pausar inventario':target==='open'?'Reanudar inventario':'Cerrar inventario';$('runStatusReason').value='';$('runStatusError').classList.add('hidden');reviewPanel.replaceChildren();closeReview=null;$('runStatusForm').querySelector('[type=submit]').disabled=statusNeedsReview;$('runStatusForm').querySelector('[type=submit]').dataset.actionTone=target==='paused'?'warning':'confirm';openWindow(statusWindow);if(statusNeedsReview)loadCloseReview();}
  $('runStatus').onclick=()=>askStatus(detail.run,detail.run.status==='open'?'closed':'open');
  $('runStatusForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;e.target.inert=true;try{if(statusTarget==='closed'&&editorIsDirty())throw new Error('Guarda primero los cambios pendientes del Editor de almacén.');if(statusNeedsReview&&(!closeReview?.canClose||!$('runCloseAcknowledged')?.checked))throw new Error('Completa la revisión antes de cerrar el inventario.');await api('/api/inventories/'+statusRun+'/status','POST',{status:statusTarget,expectedRevision:statusRevision,reason:$('runStatusReason').value,reviewToken:closeReview?.token,acknowledge:!!$('runCloseAcknowledged')?.checked});closeWindows({saved:true});await refreshState(true);await poll();}catch(error){showError($('runStatusError'),error.message);if(statusNeedsReview)await loadCloseReview();}finally{e.target.inert=false;b.disabled=statusNeedsReview&&(!closeReview?.canClose||!$('runCloseAcknowledged')?.checked);}};
  $('runMoreAudit').onclick=async()=>{const id=selected;try{const older=await api('/api/inventories/'+id+'?before='+auditBefore);if(id!==selected)return;olderLoaded=true;auditBefore=older.nextBefore;const events=new Map([...auditEvents,...older.events].map(e=>[e.sequence,e]));auditEvents=[...events.values()].sort((a,b)=>b.sequence-a.sequence);renderAudit(auditEvents,false);}catch(error){connection(error.message,true);}};
  const backToSearch=button('Volver a buscar en el catálogo',()=>{$('runSearch').value=$('runFreeName').value;$('runProductKind').value='catalog';kindChanged();search($('runSearch').value);$('runSearch').focus();});backToSearch.id='runBackToSearch';backToSearch.classList.add('hidden');$('runFreeHelp').after(backToSearch);
  for(const id of ['runSearch','runFreeName'])$(id).addEventListener('focus',collapseNumberPad);
  $('runSearch').oninput=()=>{collapseNumberPad();search($('runSearch').value);};
  $('runAdd').onclick=()=>editRow();$('runsBack').onclick=()=>{if(isWorker()){if(!workerCanGoBack())return;if(workerSpace){askLeaveSpace();return;}if(workerWarehouse)workerWarehouse='';else workerCompany='';render();cacheRun();page.scrollTop=0;}else close();};$('runsAll').onclick=()=>{selected=null;detail=null;poll();pulse();};
  $('openRunsAdmin').onclick=e=>{e.preventDefault();open();};
  for(const id of ['runRowClose','runRowCancel'])$(id).onclick=closeEditor;
  $('runStatusCancel').onclick=closeWindows;
  document.querySelector('.side-nav').addEventListener('click',e=>{const id=e.target.closest('a')?.id;if(id!=='openAssignmentsAdmin')assignmentWindow.classList.add('hidden');if(id!=='openWarehouseEditor')editor.classList.add('hidden');if(id!=='openRunsAdmin')close();});
  document.querySelectorAll('[data-worker-tab]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.workerTab==='register')open();}));
  new MutationObserver(()=>{if(rowWindow.classList.contains('hidden'))stopNative();}).observe(rowWindow,{attributes:true,attributeFilter:['class']});
  function startVoice(master){stopNative();voice={request:'run-'+InventoryOffline.id(),master,user:state.user.id};$('runVoiceStatus').textContent=master?'Di producto y cantidad al final.':'Di el nombre del producto.';collapseNumberPad();InventoryOffline.startVoice(voice.request,master).catch(e=>toast(e.message,true));}
  $('runWrite').onclick=()=>{stopNative();($('runProductKind').value==='free'?$('runFreeName'):$('runSearch')).focus();};
  $('runVoice').onclick=()=>startVoice(false);$('runMaster').onclick=()=>startVoice(true);
  $('runCamera').onclick=()=>{stopNative();picked=null;$('runPicked').classList.add('hidden');$('runSearchResults').replaceChildren();$('runVoiceStatus').textContent='Enfoca una sola etiqueta y mantén el celular quieto.';camera='run-'+InventoryOffline.id();$('runStopCamera').classList.remove('hidden');collapseNumberPad();InventoryOffline.startScan(camera).catch(e=>toast(e.message,true));};$('runStopCamera').onclick=stopNative;
  const toolsPanel=$('runWrite').parentElement;toolsPanel.className='run-search-bar';
  for(const [id,icon] of [['runWrite','i-search'],['runVoice','i-mic'],['runCamera','i-camera']]){
    const label=$(id).textContent;$(id).setAttribute('aria-label',label);$(id).title=label;
    $(id).innerHTML=`<svg class="icon" aria-hidden="true"><use href="#${icon}"></use></svg>`;
  }
  $('runVoice').querySelector('svg').setAttribute('viewBox','0 0 24 24');$('runVoice').querySelector('svg').innerHTML='<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>';
  $('runCamera').querySelector('svg').setAttribute('viewBox','0 0 24 24');$('runCamera').querySelector('svg').innerHTML='<path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="13" r="4"/>';
  const searchLabel=$('runSearch').closest('label');searchLabel.firstChild.textContent='';
  $('runSearch').setAttribute('aria-label','Buscar nombre o código');$('runSearch').placeholder='Buscar producto';
  toolsPanel.replaceChildren($('runWrite'),searchLabel,$('runVoice'),$('runCamera'),$('runMaster'),$('runStopCamera'));
  $('runMaster').textContent='Maestro';$('runMaster').title='Voz Maestro: producto y cantidad';$('runMaster').setAttribute('aria-label','Voz Maestro: producto y cantidad');
  $('runCatalog').prepend(toolsPanel);
  const oldVoice=window.inventoryVoiceResult,oldComplete=window.inventoryVoiceComplete,oldScan=window.inventoryScanResult;
  window.inventoryVoiceComplete=(request,text)=>request===voice?.request?InventoryMatching.parseMaster(text).quantity!==null&&!!InventoryMatching.parseMaster(text).countUnit:oldComplete(request,text);
  window.inventoryVoiceResult=result=>{
    if(!String(result.request).startsWith('run-'))return oldVoice(result);
    if(!voice||voice.request!==result.request||voice.user!==state.user?.id||rowWindow.classList.contains('hidden'))return;
    const master=voice.master;voice=null;if(result.error){$('runVoiceStatus').textContent=result.error;return;}
    const parsed=master?InventoryMatching.parseMaster(result.text):{productText:result.text};
    if(master)$('runQuantity').value=parsed.quantity??'';$('runSearch').value=parsed.productText;search(parsed.productText,'voice');
  };
  window.inventoryScanResult=result=>{
    if(!String(result.request).startsWith('run-'))return oldScan(result);
    if(!camera||result.request!==camera||!state.user||rowWindow.classList.contains('hidden'))return;
    if(result.error){$('runVoiceStatus').textContent=result.error;stopNative();return;}
    if(typeof result.text==='string'){
      const text=InventoryMatching.cleanCameraText(result.text),reading=cameraReadings.observe(InventoryMatching.rank(state.products,text));
      if(reading.stable){
        stopNative();$('runSearch').value=text;search(text,'camera',reading.matches);cameraReview.classList.remove('hidden');
        $('runVoiceStatus').textContent='Lectura estable. Revisa las opciones y elige el producto.';
      }else{
        const top=reading.matches[0],message=reading.reads?'Mantén quieto · Confirmando '+reading.reads+'/3':'Enfoca el nombre, la marca y la medida de una sola etiqueta.';
        $('runVoiceStatus').textContent=message;
        location.href='inventory://scan-feedback?request='+encodeURIComponent(camera)+'&name='+encodeURIComponent(top?.product.name||'Sin coincidencia clara')+'&detail='+encodeURIComponent(message);
      }
    }
  };
  setInterval(()=>{
    if(owner!==state.user?.id){connectionOffline=false;downloadedAt=0;downloadedGrants={};lastServerSync=0;owner=state.user?.id;historyRenderKey=null;close();listing=null;rowEdit=null;picked=null;lastPulse=0;if(state.user&&isWorker())open();}
    if(!state.user||document.hidden)return;
    if(Date.now()-lastAssignmentPoll>3000)refreshAssignments();
    if(Date.now()-lastPulse>10000)pulse();
    if(opened&&!isWorker()){renderBackupClock();if(Date.now()-lastBackupPoll>3000)loadBackups();}
    if(opened&&Date.now()-lastPoll>3000)poll();
  },1000);
  async function refreshAfterUndo(){
    await poll(true);
    if(!editor.classList.contains('hidden')){
      if(editorIsDirty()){showError($('warehouseEditorError'),'Se deshizo el último guardado. Tu borrador posterior se conserva; vuelve a abrir el editor antes de guardarlo.');return;}
      await openEditor();
    }
  }
  return {open,close,handleBack:()=>{if(!rowWindow.classList.contains('hidden')&&(rowWindow.classList.contains('number-pad-open')||rowWindow.classList.contains('quantity-only')&&!rowWindow.classList.contains('number-pad-collapsed'))){collapseNumberPad();return true;}return false;},back:()=>{if(!opened)return false;if(isWorker()&&!workerCanGoBack())return true;$('runsBack').click();return true;},refreshAfterUndo,refreshRemote:()=>poll(true),refreshLocal:()=>{if(opened&&detail&&listing)render();},show:async id=>{await open();await selectRun(id);}};
})();
