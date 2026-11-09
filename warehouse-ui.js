/* Physical counting route: warehouse -> zone -> shelf. */
let chosenWarehouse = '';
let chosenZone = '';
let locationOwner = '';
let activeLocation = '';
let choosingLocation = true;
function currentLocation() { return activeLocation; }
function locationName(id) { return (state.locations||[]).find(l=>l.id===id)?.label || 'Conteo general anterior'; }
function locationCount(productId,month) { return activeLocation ? (state.locationCounts||[]).find(c=>c.productId===productId&&c.month===month&&c.locationId===activeLocation) : countFor(productId,month); }
function selectCountLocation(id) {
  if(id && !(state.locations||[]).some(l=>l.id===id))return;
  activeLocation=id;choosingLocation=!id;
  try{localStorage.setItem('inventory-location-'+state.user.id,id);}catch(_){}
  els.movementProduct.value='';els.movementSearch.value='';selectedCountKey='';
  els.movementQty.value='';replacingPendingId=null;
  renderMovementOptions();syncCountForm();renderWarehouses();renderReleaseStatus();
}
function renderWarehouses() {
  if(!state.user)return;
  if(locationOwner!==state.user.id){
    locationOwner=state.user.id;activeLocation='';chosenWarehouse='';
    try{activeLocation=localStorage.getItem('inventory-location-'+state.user.id)||'';}catch(_){}
    choosingLocation=!activeLocation;
  }
  const locations=state.locations||[];
  if(!locations.some(l=>l.id===activeLocation)){activeLocation='';choosingLocation=true;}
  const picker=document.getElementById('countLocation');
  picker.replaceChildren(new Option('Selecciona una ubicación',''),...locations.map(l=>new Option(l.label,l.id)));
  picker.value=activeLocation;
  document.getElementById('countLocationLabel').classList.toggle('hidden',isWorker());
  const panel=document.getElementById('warehouseRoute');panel.replaceChildren();panel.classList.toggle('route-selected',!choosingLocation);
  if(!isWorker())return;
  if(!state.workingMonth || periodFor(state.workingMonth).status!=='open'){
    panel.classList.remove('route-selected');els.movementWindow.classList.add('location-waiting');
    panel.append(makeNode('h2','Inventario no habilitado'),makeNode('p','El administrador debe habilitar un mes abierto para comenzar o continuar el conteo.','route-help'));return;
  }
  els.movementWindow.classList.toggle('location-waiting',choosingLocation);
  const month=state.workingMonth||state.month;
  const title=makeNode('h2',choosingLocation?'¿Dónde vas a contar?':'Tu ubicación de conteo');
  panel.append(makeNode('p','INVENTARIO MENSUAL · ELIGE TU UBICACIÓN','eyebrow'),title);
  if(activeLocation){
    const banner=makeNode('div','','location-current');
    banner.append(makeNode('strong',locationName(activeLocation)));
    const change=makeNode('button',choosingLocation?'Continuar aquí':'Cambiar ubicación','ghost-button');change.type='button';
    change.onclick=()=>{choosingLocation=!choosingLocation;renderWarehouses();renderWork();};banner.append(change);panel.append(banner);
  }
  if(!choosingLocation)return;

  const warehouses=makeNode('div','','warehouse-grid');
  const warehouseNames=[...new Set(locations.map(l=>l.warehouse))];
  if(!warehouseNames.includes(chosenWarehouse)){chosenWarehouse=warehouseNames[0]||'';chosenZone='';}
  if(!warehouseNames.length)panel.append(makeNode('p','No hay espacios configurados para este inventario. Solicita al administrador que los prepare en el Editor de almacén.','route-help'));
  warehouseNames.forEach((name,i)=>{
    const b=makeNode('button','','warehouse-choice');b.type='button';b.classList.toggle('selected',chosenWarehouse===name);b.setAttribute('aria-pressed',String(chosenWarehouse===name));
    b.append(makeNode('span',`0${i+1}`,'warehouse-number'),makeNode('strong',name),makeNode('span',`${locations.filter(l=>l.warehouse===name).length} espacios configurados`));
    b.onclick=()=>{chosenWarehouse=name;renderWarehouses();};warehouses.append(b);
  });panel.append(warehouses);
  if(!chosenWarehouse)return;
  const zones=locations.filter(l=>l.warehouse===chosenWarehouse).map(l=>l.zone).filter((z,i,a)=>a.indexOf(z)===i);
  if(!zones.includes(chosenZone))chosenZone=zones[0];
  const tabs=makeNode('div','','zone-tabs');
  zones.forEach(zone=>{const button=makeNode('button',`${zone} (${locations.filter(l=>l.warehouse===chosenWarehouse&&l.zone===zone).length})`,'ghost-button');button.type='button';button.setAttribute('aria-pressed',String(chosenZone===zone));button.onclick=()=>{chosenZone=zone;renderWarehouses();};tabs.append(button);});panel.append(tabs);
  zones.forEach(zone=>{
    const section=makeNode('section','','location-zone');section.classList.toggle('hidden',zone!==chosenZone);section.append(makeNode('h3',zone));
    const grid=makeNode('div','','shelf-grid');
    locations.filter(l=>l.warehouse===chosenWarehouse&&l.zone===zone).forEach(l=>{
      const total=(state.locationActivity||[]).find(a=>a.month===month&&a.locationId===l.id)?.counted||0;
      const pending=pendingEntries.filter(e=>e.payload.month===month&&e.payload.locationId===l.id).length;
      const b=makeNode('button','','shelf-choice');b.type='button';b.dataset.locationId=l.id;
      b.setAttribute('aria-label',l.label);b.classList.toggle('has-counts',total>0);b.classList.toggle('selected',l.id===activeLocation);
      b.append(makeNode('strong',l.name),makeNode('span',workLabels[locationWork(l.id,month).status]+(locationWork(l.id,month).workerName?' · '+locationWork(l.id,month).workerName:'')),makeNode('span',total?`${total} productos registrados`:'Sin registros este mes'),makeNode('small',pending?`${pending} pendientes en este equipo`:'Entrar a contar →'));
      b.onclick=()=>chooseWorkLocation(l.id);grid.append(b);
    });section.append(grid);panel.append(section);
  });
  panel.append(makeNode('p','Marca cada ubicación terminada sólo después de revisar todos sus productos y sincronizar los pendientes.','route-help'));
}
document.getElementById('countLocation').onchange=event=>selectCountLocation(event.target.value);
