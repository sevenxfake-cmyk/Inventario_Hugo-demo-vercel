/* Compact desktop navigation. Existing controls remain the single action targets. */
function installWorkspace(){
  panelDoc.body.classList.add('workspace-organized');
  const nav=panelDoc.querySelector('.side-nav');
  nav.querySelectorAll('a,button').forEach(el=>el.classList.add('legacy-task'));
  const roots=[
    ['home','Inicio','i-grid','#4b63cd','all'],
    ['products','Productos','i-box','#008b83','catalog'],
    ['inventory','Inventario','i-warehouse','#228ce4','all'],
    ['warehouses','Almacenes','i-warehouse','#397ab0','admin'],
    ['management','Gestión','i-management','#8060b8','management'],
    ['analytics','Analítica','i-chart','#137f88','reports'],
    ['reports','Reportes','i-chart','#83ad37','reports'],
    ['admin','Administración','i-management','#99a080','admin'],
    ['settings','Configuración','i-connection','#2ec7b0','admin'],
    ['support','Ayuda','i-eye','#dc0c66','all']
  ];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=(name)=>`<svg class="icon" aria-hidden="true"><use href="#${name}"></use></svg>`;
  let user=null,scopes=[],selectedScope='',generation=0,activeOwner='home',ownedPage=null,reportRows=[],reportHeaders=[];
  const allowed=permission=>permission==='all'||user?.accessRole==='administrator'||(permission!=='admin'&&(user?.permissions||[]).includes(permission));
  const links=new Map();
  roots.forEach(([key,label,symbol,color,permission])=>{const a=panelDoc.createElement('a');a.hidden=permission!=='all';a.href='#'+key;a.dataset.desktopPage='hub-'+key;a.dataset.workspace=key;a.style.setProperty('--module-color',color);a.innerHTML=icon(symbol)+`<span>${esc(label)}</span>`;nav.append(a);links.set(key,a);});
  const context=panelDoc.createElement('div');context.className='workspace-company';context.innerHTML='<div><small>EMPRESA</small><strong id="workspaceCompany">Mi empresa</strong></div><div><small>CARGO</small><strong id="workspaceRole">Cuenta de oficina</strong></div><label><small>ALMACÉN</small><select id="workspaceBranch" aria-label="Almacén de trabajo"><option>Sin selección</option></select></label>';
  panelDoc.querySelector('.workspace-switch').replaceWith(context);context.querySelector('label').remove();
  const section=panelDoc.createElement('section');section.id='workspacePage';section.hidden=true;
  section.innerHTML='<div class="workspace-path"><strong id="workspaceTitle" tabindex="-1"></strong><span id="workspaceSubtitle"></span></div><div id="workspaceContent"></div><p id="workspaceStatus" role="status"></p>';
  $('desktopSettings').append(section);
  const style=panelDoc.createElement('style');style.textContent=`
    .workspace-organized .side-nav .legacy-task{display:none!important}.workspace-organized .side-nav [data-workspace][hidden]{display:none!important}
    html[data-desktop-theme] body.workspace-organized #sideRail{width:220px;padding:16px 7px 0;background:#344fb5}
    html[data-desktop-theme] body.workspace-organized .main-column{margin-left:220px}
    html[data-desktop-theme] body.workspace-organized #sideRail .side-brand{margin-bottom:18px;padding:0 10px;font-size:21px}
    .workspace-company{display:grid;gap:4px;margin:0 1px 18px;color:#fff}.workspace-company>div,.workspace-company>label{display:grid;gap:4px;margin:0;padding:8px 10px;background:#4964c9;border-radius:6px}.workspace-company small{font-size:10px;font-weight:700}.workspace-company strong{font-size:11px;line-height:1.35;font-weight:500}.workspace-company select{background:transparent;color:white;border:0;min-width:0;width:100%;font:11px 'Segoe UI';padding:0}.workspace-company option{background:#344fb5;color:#fff}
    html[data-desktop-theme] body.workspace-organized #sideRail .side-nav{gap:5px;padding:2px 2px 8px}
    html[data-desktop-theme] body.workspace-organized #sideRail .side-nav [data-workspace]{min-height:62px;padding:8px 4px;gap:4px;border-radius:6px;background:var(--module-color);font-size:10px;line-height:1.1;text-transform:uppercase}
    html[data-desktop-theme] body.workspace-organized #sideRail .side-nav [data-workspace] .icon{width:21px;height:21px;flex-basis:21px}
    html[data-desktop-theme] body.workspace-organized #sideRail .sidebar-bottom{padding:4px 4px 6px}.workspace-organized .side-footer{padding-top:8px}.workspace-organized .topbar{min-height:52px}
    html[data-desktop-theme] body.workspace-organized #desktopSettings{max-width:none;padding:24px;background:var(--bg)}
    .workspace-path{display:flex;align-items:center;gap:22px;color:var(--muted);font-size:12px;margin:0 0 24px}.workspace-path strong{font-weight:600;color:var(--ink)}.workspace-path span{border-left:1px solid var(--line);padding-left:22px}
    .workspace-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px 30px}.workspace-tile{position:relative;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:13px;min-height:104px;padding:20px 14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:8px;cursor:pointer;text-align:center}.workspace-tile .icon{width:28px;height:28px;color:var(--tile-color,#4265c8)}.workspace-tile strong{font-size:13px;line-height:1.35}.workspace-tile small{font-size:10px;color:var(--muted);line-height:1.4}.workspace-tile:hover{border-color:#607ad0;background:var(--surface-soft)}.workspace-tile:focus-visible{outline:3px solid #7d98f0;outline-offset:2px}.workspace-tile .tile-number{position:absolute;left:10px;top:9px;font-size:10px;color:var(--muted)}.workspace-cards.two-columns{grid-template-columns:repeat(2,minmax(0,1fr))}.two-columns .workspace-tile{min-height:155px}.two-columns .workspace-tile .icon{width:52px;height:52px}
    .workspace-panel{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}.workspace-panel-header{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;padding:14px 20px;border-bottom:1px solid var(--line)}.workspace-panel-header h2{margin:0!important;font-size:15px!important}.workspace-panel-body{padding:20px}.workspace-buttons{display:flex;flex-wrap:wrap;gap:6px}.workspace-buttons button{min-height:34px;padding:8px 16px;font-size:12px;border-radius:4px}.workspace-filters{display:flex;gap:20px;flex-wrap:wrap;margin:6px 0 24px;align-items:end}.workspace-filters label{display:grid;gap:6px;min-width:180px;flex:1;font-size:11px;color:var(--muted)}.workspace-filters input,.workspace-filters select{padding:10px 12px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);min-width:0;width:100%;box-sizing:border-box;font:12px 'Segoe UI'}
    .workspace-table-wrap{overflow:auto}.workspace-table{width:100%;border-collapse:collapse;min-width:650px;font-size:12px}.workspace-table td,.workspace-table th{padding:13px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle;font-size:12px!important}.workspace-table th{font-size:10px!important;text-transform:uppercase;background:var(--surface);color:var(--muted)}.workspace-table .empty{text-align:center;padding:28px;color:var(--muted)}.workspace-note{color:var(--muted);font-size:12px;line-height:1.6}.workspace-notice{padding:14px;border-left:3px solid #b9892f;background:var(--surface-soft);color:var(--ink);margin:18px 0;font-size:13px}.workspace-help{display:grid;gap:12px}.workspace-help details{padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:8px}.workspace-help summary{cursor:pointer;font-weight:600}.workspace-help p{line-height:1.7;color:var(--muted)}
    .workspace-pagination{display:flex;gap:12px;justify-content:flex-end;align-items:center;flex-wrap:wrap;padding:14px;color:var(--muted);font-size:11px}.workspace-pagination button{padding:4px 10px;min-height:28px;border:1px solid var(--line);border-radius:4px;background:var(--surface);color:var(--ink)}.workspace-pagination select{width:auto!important;padding:5px!important;font-size:11px!important}
    html[data-desktop-theme] body.workspace-organized #erpPage{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:0 20px 20px;overflow:hidden}
    html[data-desktop-theme] body.workspace-organized #erpPage .erp-heading{margin:0 -20px;padding:14px 20px;border-bottom:1px solid var(--line)}
    html[data-desktop-theme] body.workspace-organized #erpPage .erp-heading h1{font-size:16px;margin:0}.workspace-organized #erpPage .erp-heading .eyebrow,.workspace-organized #erpDescription{display:none}
    .workspace-organized #erpPage .erp-context{border:0;padding:12px 0;margin:8px 0;justify-content:flex-start}.workspace-organized #erpPage .erp-context label{min-width:260px;max-width:420px}.workspace-organized #erpPage .erp-internal{margin-left:auto}
    .workspace-organized #erpPage .erp-toolbar{margin:12px 0}.workspace-organized #erpPage .erp-actions{margin:0}.workspace-organized #erpPage .erp-tabs{padding-bottom:0;margin-bottom:12px;gap:0}.workspace-organized #erpPage .erp-tabs button{background:transparent;color:var(--muted);border:1px solid transparent;border-radius:6px 6px 0 0;font-size:12px}.workspace-organized #erpPage .erp-tabs button[aria-current=page]{border-color:var(--line);border-bottom-color:var(--surface);color:var(--ink);margin-bottom:-1px}
    html[data-desktop-theme] body.workspace-organized #erpPage .erp-table :is(td,th){font-size:12px;padding:13px 10px}.workspace-organized #erpPage .erp-table th{background:var(--surface);text-transform:uppercase;font-size:10px!important}.workspace-organized #erpPage .erp-table-wrap{border-radius:5px}.workspace-organized #erpPage :is(input,select){padding:9px 11px;font-size:12px}.workspace-organized #erpPage .erp-card{padding:18px}.workspace-organized #erpPage .erp-warning{font-size:12px}
    html[data-desktop-theme] body.workspace-organized .workspace-company :is(label,small){color:white!important}html[data-desktop-theme] body.workspace-organized .workspace-company select{background:#4964c9!important;color:white!important;border:0!important;padding:0!important;border-radius:0!important;min-height:20px!important;font-size:11px!important}
    @media(max-height:820px){html[data-desktop-theme] body.workspace-organized #sideRail .side-nav [data-workspace]{min-height:50px;padding:5px 3px;font-size:9px}.workspace-company{margin-bottom:10px}.workspace-company>div,.workspace-company>label{padding:6px 9px}html[data-desktop-theme] body.workspace-organized #sideRail .side-brand{margin-bottom:10px}}
    @media(max-width:1200px){.workspace-cards{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}}
    @media(max-width:900px){.workspace-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:760px){html[data-desktop-theme] body.workspace-organized .main-column{margin-left:0}html[data-desktop-theme] body.workspace-organized #desktopSettings{padding:16px}.workspace-cards{gap:10px}.workspace-cards.two-columns{grid-template-columns:1fr}.workspace-panel-body{padding:14px}}
  `;panelDoc.head.append(style);
  const title=key=>roots.find(r=>r[0]===key)?.[1]||key;
  function closeHome(){if($('desktopHome'))$('desktopHome').hidden=true;panelDoc.body.classList.remove('desktop-home-open');}
  function legacy(id,owner){activeOwner=owner;ownedPage=null;closeHome();showPage(null);const target=$(id)||panelDoc.querySelector(id);if(target)target.click();syncWorkspaceNavigation();}
  function go(key){closeHome();showPage('hub-'+key);}
  window.syncWorkspaceNavigation=()=>{
    let owner=currentPage?.startsWith('hub-')?currentPage.slice(4).split('/')[0]:currentPage===ownedPage?activeOwner:currentPage==='sales'?'sales':currentPage==='movements'?'inventory':currentPage?.startsWith('erp-')?({overview:'home',contacts:'contacts',purchases:'purchases',orders:'sales',stock:'inventory',finance:'finance',accounting:'finance',sunat:'settings'}[currentPage.slice(4)]||activeOwner):currentPage?'settings':activeOwner;
    links.forEach((link,key)=>{link.classList.toggle('active',key===owner);if(key===owner)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    const crumb=panelDoc.querySelector('.breadcrumb strong');if(currentPage?.startsWith('hub-')&&crumb)crumb.textContent=title(owner);
  };
  const tile=(label,symbol,action,note='',disabled=false)=>({label,symbol,action,note,disabled});
  function cards(items,two=false,numbered=false){$('workspaceContent').innerHTML=`<div class="workspace-cards ${two?'two-columns':''}">${items.map((item,i)=>`<button type="button" class="workspace-tile" data-tile="${i}" style="--tile-color:${['#d09b19','#4b6ccb','#13a38b','#c55e76'][i%4]}" ${item.disabled?'data-unavailable="true" title="Ver requisitos pendientes"':''}>${numbered?`<span class="tile-number">${i+1}</span>`:''}${icon(item.symbol)}<strong>${esc(item.label)}</strong>${item.note?`<small>${esc(item.note)}</small>`:''}</button>`).join('')}</div>`;$('workspaceContent').querySelectorAll('[data-tile]').forEach(b=>b.onclick=()=>items[Number(b.dataset.tile)].action());}
  function unavailable(name,message){$('workspaceContent').innerHTML=`<div class="workspace-panel"><header class="workspace-panel-header"><h2>${esc(name)}</h2><button id="workspaceBack" class="ghost-button">Volver</button></header><div class="workspace-panel-body"><p class="workspace-notice">${esc(message)}</p><button class="ghost-button" disabled>No disponible</button></div></div>`;$('workspaceBack').onclick=()=>go(activeOwner);}
  function table(headers,rows){return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>'<tr>'+row.map(v=>`<td>${esc(v)}</td>`).join('')+'</tr>').join(''):`<tr data-empty><td class="empty" colspan="${headers.length}">No hay información registrada</td></tr>`}</tbody></table></div>`;}
  function exportCSV(name,headers,rows){const csv=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';const url=URL.createObjectURL(new Blob(['\ufeff'+[headers,...rows].map(r=>r.map(csv).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=panelDoc.createElement('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const paginated=new WeakSet();
  function paginate(container){container.querySelectorAll('table').forEach(table=>{if(paginated.has(table))return;paginated.add(table);let rows=[...table.querySelectorAll('tbody tr:not([data-empty])')],page=0,size=15;const bar=panelDoc.createElement('div');bar.className='workspace-pagination';bar.innerHTML='<label>Registros por página <select aria-label="Registros por página"><option>15</option><option>25</option><option>50</option></select></label><span></span><button aria-label="Primera página">|‹</button><button aria-label="Página anterior">‹</button><button aria-label="Página siguiente">›</button><button aria-label="Última página">›|</button>';table.parentElement.after(bar);const buttons=[...bar.querySelectorAll('button')];function draw(){const pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,pages-1);rows.forEach((r,i)=>r.hidden=i<page*size||i>=(page+1)*size);bar.querySelector('span').textContent=`${rows.length} registros · Página ${page+1} de ${pages}`;buttons[0].disabled=buttons[1].disabled=page===0;buttons[2].disabled=buttons[3].disabled=page===pages-1;}bar.querySelector('select').onchange=e=>{size=Number(e.target.value);page=0;draw();};buttons.forEach((b,i)=>b.onclick=()=>{page=i===0?0:i===1?page-1:i===2?page+1:Math.max(0,Math.ceil(rows.length/size)-1);draw();});table.querySelectorAll('th').forEach((th,index)=>{if(th.textContent==='Acciones')return;th.tabIndex=0;th.title='Ordenar por '+th.textContent;let ascending=true;const sort=()=>{rows.sort((a,b)=>a.children[index].textContent.localeCompare(b.children[index].textContent,'es',{numeric:true})*(ascending?1:-1));table.querySelectorAll('th').forEach(h=>h.removeAttribute('aria-sort'));th.setAttribute('aria-sort',ascending?'ascending':'descending');ascending=!ascending;rows.forEach(r=>table.tBodies[0].append(r));page=0;draw();};th.onclick=sort;th.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();sort();}};});draw();});}
  // Keep the original account actions and permission checks; only group their presentation.
  const personnel=$('workersWindow'),personnelHeader=personnel.querySelector('.window-titlebar');
  const personnelActions=panelDoc.createElement('div');personnelActions.className='workspace-buttons';
  personnelActions.innerHTML='<button type="button" id="workspaceWorkersExport" class="ghost-button">Exportar</button><button type="button" id="workspaceWorkerNew" class="primary-button">+ Nuevo</button>';
  personnelHeader.insertBefore(personnelActions,$('closeWorkers'));
  const personnelSearch=panelDoc.createElement('input');personnelSearch.type='search';personnelSearch.id='workspaceWorkerSearch';personnelSearch.placeholder='Buscar personal';personnelSearch.setAttribute('aria-label','Buscar personal');
  personnel.querySelector('.team-directory-heading').after(personnelSearch);
  $('workspaceWorkerNew').onclick=()=>{personnel.classList.add('workspace-create-worker');$('workerName').focus();};
  const filterWorkers=()=>{const q=personnelSearch.value.toLowerCase();$('workersList').querySelectorAll('.worker-item').forEach(r=>r.hidden=!r.querySelector('.team-identity').textContent.toLowerCase().includes(q));};personnelSearch.oninput=filterWorkers;
  $('workspaceWorkersExport').onclick=()=>exportCSV('Personal',['Nombre','Usuario / rol','Estado'],[...$('workersList').querySelectorAll('.worker-item')].filter(r=>!r.hidden).map(r=>[r.querySelector('.team-identity strong')?.textContent,r.querySelector('.team-identity small')?.textContent,r.querySelector('.team-status')?.textContent]));
  const personnelStyle=panelDoc.createElement('style');personnelStyle.textContent=`
    html[data-desktop-theme] body.workspace-organized #workersWindow.personnel-page{margin:24px;width:calc(100% - 48px);padding:0 20px 20px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
    .workspace-organized #workersWindow .window-titlebar{padding:14px 0;border-bottom:1px solid var(--line);gap:12px}.workspace-organized #workersWindow .window-titlebar h2{margin-right:auto;font-size:16px!important}.workspace-organized #workersWindow .workers-intro{display:none}
    .workspace-organized #workersWindow .team-layout{display:block}.workspace-organized #workersWindow:not(.workspace-create-worker) #workerForm{display:none}.workspace-organized #workersWindow.workspace-create-worker #workerForm{max-width:640px;margin:20px 0;padding:20px;border:1px solid var(--line);border-radius:8px}
    .workspace-organized #workersWindow .team-directory{border:0;padding:10px 0;box-shadow:none;background:transparent}.workspace-organized #workspaceWorkerSearch{max-width:350px;margin:8px 0 24px;padding:10px;border:1px solid var(--line);border-radius:6px;color:var(--ink);background:var(--surface)}
    html[data-desktop-theme] body.workspace-organized #workersList{display:block;overflow:visible}.workspace-organized #workersList .worker-item{display:grid;grid-template-columns:32px minmax(140px,1fr) 100px 48px;gap:12px;align-items:center;padding:15px 8px;margin:0;border:0;border-bottom:1px solid var(--line);border-radius:0;box-shadow:none;background:transparent}.workspace-organized #workersList .worker-item[hidden]{display:none!important}.workspace-organized #workersList .team-avatar{width:30px;height:30px;font-size:10px}.workspace-organized #workersList .team-identity strong{font-size:12px}.workspace-organized #workersList .team-identity small{font-size:10px}.workspace-organized #workersList .team-status{font-size:10px;padding:3px 7px;justify-self:start}.workspace-row-menu{position:relative;justify-self:end}.workspace-row-menu summary{list-style:none;cursor:pointer;padding:6px 12px;font-size:22px}.workspace-row-menu summary::-webkit-details-marker{display:none}.workspace-row-menu[open] .team-account-actions{position:absolute;right:0;top:36px;z-index:40;display:grid!important;gap:4px;min-width:205px;background:var(--surface);padding:10px;border:1px solid var(--line);border-radius:5px;box-shadow:0 4px 18px #0002}.workspace-row-menu .team-account-actions button{text-align:left;justify-content:start;width:100%;font-size:12px}.workspace-organized #workersList :is(.team-access-editor,.worker-delete-confirm){grid-column:1/-1}
  `;panelDoc.head.append(personnelStyle);
  new MutationObserver(()=>{$('workersList').querySelectorAll('.worker-item>.team-account-actions').forEach(actions=>{const menu=panelDoc.createElement('details');menu.className='workspace-row-menu';const summary=panelDoc.createElement('summary');summary.textContent='⋮';summary.setAttribute('aria-label','Acciones del personal');actions.before(menu);menu.append(summary,actions);menu.addEventListener('click',e=>{if(e.target.closest('button'))menu.open=false;});});filterWorkers();}).observe($('workersList'),{childList:true,subtree:true});
  // Desktop-only reporting: reads each inventory independently of the working month.
  const analysisStyle=panelDoc.createElement('style');
  analysisStyle.textContent=`
    .workspace-organized #managementHistory{display:none!important}
    .inventory-analysis{display:grid;gap:18px}
    .analysis-intro{display:flex;justify-content:space-between;gap:16px;align-items:start;flex-wrap:wrap}
    .analysis-intro h2{margin:0 0 8px;font-size:23px}.analysis-intro p{margin:0;max-width:760px;color:var(--muted);line-height:1.6}
    .analysis-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .analysis-metric{padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:9px}
    .analysis-metric strong{display:block;font-size:29px;margin:7px 0;color:var(--ink)}.analysis-metric span,.analysis-metric small{color:var(--muted);font-size:12px}
    .analysis-tabs{display:flex;gap:8px;flex-wrap:wrap}.analysis-tabs button{padding:10px 18px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink)}.analysis-tabs [aria-selected=true]{background:#137f88;color:white;border-color:#137f88}
    .analysis-chart{display:grid;gap:12px}.analysis-bar{display:grid;grid-template-columns:90px 1fr 145px;align-items:center;gap:14px;font-size:12px}.analysis-track{height:12px;border-radius:10px;background:var(--surface-soft);overflow:hidden}.analysis-fill{height:100%;background:#168b92;border-radius:10px}
    .analysis-empty{padding:30px;border:1px dashed var(--line);border-radius:9px;background:var(--surface);line-height:1.7}.analysis-empty h3{margin:0 0 8px}.analysis-empty p{color:var(--muted);margin:0}
    .analysis-filters{margin:0}.analysis-filters label{min-width:160px}.analysis-filters button{min-height:39px}
    @media(max-width:1000px){.analysis-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.analysis-bar{grid-template-columns:75px 1fr 110px}}
    @media(max-width:600px){.analysis-metrics{grid-template-columns:1fr}.analysis-bar{grid-template-columns:65px 1fr}.analysis-bar>span:last-child{grid-column:2}}
  `;panelDoc.head.append(analysisStyle);

  async function inventoryAnalysis(token,archive=false){
    const host=$('workspaceContent');
    $('workspaceSubtitle').textContent=archive?'Archivo de inventarios cerrados':'Informe mensual y analítica';
    $('workspaceStatus').textContent='Consultando inventarios…';
    const labels={open:'Abierto',paused:'Pausado',draft:'En preparación',closed:'Cerrado'};
    const number=n=>Number(n).toLocaleString('es-PE',{maximumFractionDigits:3});
    const valid=()=>token===generation&&!!user&&!$('appShell').classList.contains('hidden');
    let all=[],cache=new Map(),loadVersion=0,tab=archive?'inventories':'summary',exportRows=[],exportHeaders=[];
    const option=(id,label)=>`<option value="${esc(id)}">${esc(label)}</option>`;
    try{
      const listing=await desktopApi('/api/inventories');if(!valid())return;
      all=listing.runs.filter(r=>!archive||r.status==='closed');
      host.innerHTML=`<section class="inventory-analysis" aria-label="${archive?'Inventarios anteriores':'Analítica de inventarios'}">
        <header class="analysis-intro"><div><h2>${archive?'Inventarios anteriores':'Informe mensual y analítica'}</h2><p>${archive?'Consulta los inventarios cerrados, sus ubicaciones y los productos registrados. Los datos se conservan para consulta.':'Analiza uno o varios inventarios, compara el avance entre meses y consulta los productos por empresa, almacén y andamio.'}</p></div><div class="workspace-buttons"><button id="analysisReload" class="ghost-button">Actualizar</button><button id="analysisExport" class="primary-button" disabled>Exportar CSV</button></div></header>
        <div class="workspace-panel"><div class="workspace-panel-body"><form id="analysisFilters" data-unsaved-ignore class="workspace-filters analysis-filters">
          <label>Desde el mes<input id="analysisFrom" type="month"></label><label>Hasta el mes<input id="analysisTo" type="month"></label>
          <label>Inventario<select id="analysisRun"><option value="">Todos los inventarios</option>${all.map(r=>option(r.id,(r.month||'Sin mes')+' · '+r.title)).join('')}</select></label>
          <label>Estado<select id="analysisStatus">${archive?option('closed','Cerrado'):'<option value="">Todos los estados</option>'+Object.entries(labels).map(([id,name])=>option(id,name)).join('')}</select></label>
          <label>Empresa<select id="analysisCompany"><option value="">Todas las empresas</option></select></label><label>Almacén<select id="analysisWarehouse"><option value="">Todos los almacenes</option></select></label>
          <label>Producto o código<input id="analysisSearch" type="search" placeholder="Buscar en el detalle"></label>
          <button class="primary-button" type="submit">Aplicar filtros</button><button id="analysisClear" class="ghost-button" type="button">Limpiar</button>
        </form></div></div>
        <p id="analysisMessage" role="status" class="workspace-note"></p><div id="analysisMetrics" class="analysis-metrics"></div>
        <div class="analysis-tabs" role="tablist" aria-label="Vistas del informe">${[['summary','Resumen mensual'],['inventories','Inventarios'],['products','Detalle de productos']].map(([id,label])=>`<button type="button" role="tab" id="analysis-tab-${id}" aria-controls="analysisResults" data-analysis-tab="${id}" aria-selected="${tab===id}">${label}</button>`).join('')}</div>
        <div id="analysisResults" role="tabpanel"></div><p class="workspace-note">El avance mide registros contados sobre registros preparados; un cero registrado sí cuenta como completado. Los pendientes no se convierten en cero. Las cantidades de distintos meses se presentan por separado y no representan el stock actual. Los productos retirados se excluyen.</p>
      </section>`;
      const companyNames=new Map();
      for(const run of all)for(const company of run.empresas||[])companyNames.set(company.id,company.name);
      for(const run of all)for(const loc of run.locations||[])if(loc.empresa_id&&!companyNames.has(loc.empresa_id))companyNames.set(loc.empresa_id,'Empresa '+loc.empresa_id);
      $('analysisCompany').innerHTML=option('','Todas las empresas')+[...companyNames].map(([id,name])=>option(id,name)).join('');
      const warehouseKey=loc=>JSON.stringify([loc.empresa_id||'',loc.warehouseName||loc.warehouse||'']);
      function warehouses(){
        const selected=$('analysisWarehouse').value,company=$('analysisCompany').value,items=new Map();
        for(const run of all)for(const loc of run.locations||[])if(!company||loc.empresa_id===company)items.set(warehouseKey(loc),loc.warehouse||loc.warehouseName||'Sin almacén');
        $('analysisWarehouse').innerHTML=option('','Todos los almacenes')+[...items].map(([id,name])=>option(id,name)).join('');
        if(items.has(selected))$('analysisWarehouse').value=selected;
      }
      warehouses();$('analysisCompany').onchange=warehouses;
      $('analysisReload').onclick=()=>inventoryAnalysis(++generation,archive);
      $('analysisClear').onclick=()=>{$('analysisFilters').reset();warehouses();render();};
      $('analysisFilters').onsubmit=e=>{e.preventDefault();render();};
      host.querySelectorAll('[data-analysis-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.analysisTab;render();});
      $('analysisExport').onclick=()=>exportCSV(archive?'inventarios-anteriores':'analitica-'+tab,exportHeaders,exportRows);
      async function render(){
        const version=++loadVersion;
        const fresh=()=>valid()&&version===loadVersion;
        const from=$('analysisFrom').value,to=$('analysisTo').value,runId=$('analysisRun').value,status=$('analysisStatus').value,company=$('analysisCompany').value,warehouse=$('analysisWarehouse').value,search=$('analysisSearch').value.trim().toLocaleLowerCase('es');
        $('analysisExport').disabled=true;
        if(from&&to&&from>to){$('analysisMessage').textContent='El mes inicial debe ser anterior o igual al mes final.';$('analysisResults').replaceChildren();$('analysisMetrics').replaceChildren();return;}
        const runs=all.filter(r=>(!runId||r.id===runId)&&(!status||r.status===status)&&(!from||r.month&&r.month>=from)&&(!to||r.month&&r.month<=to));
        $('analysisMessage').textContent='Cargando los registros de '+runs.length+' inventarios…';
        try{
          for(let offset=0;offset<runs.length;offset+=4){
            await Promise.all(runs.slice(offset,offset+4).map(async run=>{if(!cache.has(run.id))cache.set(run.id,await desktopApi('/api/inventories/'+encodeURIComponent(run.id)));}));
            if(!fresh())return;
          }
          const groups=[],records=[];
          for(const listed of runs){
            const data=cache.get(listed.id),run=data.run;
            const locations=new Map((run.locations||[]).map(l=>[l.id,l]));
            const rows=data.rows.filter(row=>!row.retired).map(row=>{const loc=locations.get(row.locationId)||{id:row.locationId,label:row.locationLabel};return {run,row,loc,company:(run.empresas||[]).find(e=>e.id===loc.empresa_id)?.name||companyNames.get(loc.empresa_id)||'Sin empresa asignada'};}).filter(item=>(!company||item.loc.empresa_id===company)&&(!warehouse||warehouseKey(item.loc)===warehouse)&&(!search||(item.row.name+' '+(item.row.sku||'')).toLocaleLowerCase('es').includes(search)));
            if((company||warehouse||search)&&!rows.length)continue;
            records.push(...rows);groups.push({run,rows,total:rows.length,counted:rows.filter(item=>item.row.quantity!==null&&item.row.quantity!==undefined).length});
          }
          const counted=records.filter(item=>item.row.quantity!==null&&item.row.quantity!==undefined).length;
          const metrics=[['Inventarios consultados',groups.length,'Según los filtros aplicados'],['Registros contados',counted,'De '+number(records.length)+' registros'],['Pendientes de conteo',records.length-counted,'Cantidades aún sin registrar'],['Avance',records.length?Math.round(counted/records.length*100)+'%':'—','No equivale a cobertura del almacén']];
          $('analysisMetrics').innerHTML=metrics.map(([label,value,note])=>`<article class="analysis-metric"><span>${label}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
          host.querySelectorAll('[data-analysis-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.analysisTab===tab)));
          $('analysisResults').setAttribute('aria-labelledby','analysis-tab-'+tab);
          const pct=(count,total)=>total?Math.round(count/total*100)+'%':'Sin registros';
          let content='';
          if(tab==='summary'){
            const months=new Map();for(const group of groups){const month=group.run.month||'Sin mes';const value=months.get(month)||{runs:0,total:0,counted:0};value.runs++;value.total+=group.total;value.counted+=group.counted;months.set(month,value);}
            const ordered=[...months].sort(([a],[b])=>a.localeCompare(b));
            exportHeaders=['Mes','Inventarios','Registros','Contados','Pendientes','Avance'];exportRows=ordered.map(([month,m])=>[month,m.runs,m.total,m.counted,m.total-m.counted,pct(m.counted,m.total)]);
            content=`<div class="workspace-panel"><header class="workspace-panel-header"><h2>Evolución mensual del conteo</h2></header><div class="workspace-panel-body analysis-chart">${ordered.map(([month,m])=>`<div class="analysis-bar"><span>${esc(month)}</span><div class="analysis-track"><div class="analysis-fill" style="width:${m.total?Math.round(m.counted/m.total*100):0}%"></div></div><span>${number(m.counted)} / ${number(m.total)} · ${pct(m.counted,m.total)}</span></div>`).join('')}</div>${table(exportHeaders,exportRows)}</div>`;
          }else if(tab==='inventories'){
            exportHeaders=['Mes','Inventario','Estado','Registros','Contados','Pendientes','Avance'];exportRows=groups.map(g=>[g.run.month||'Sin mes',g.run.title,labels[g.run.status]||g.run.status,g.total,g.counted,g.total-g.counted,pct(g.counted,g.total)]);
            content=table(exportHeaders,exportRows);
          }else{
            exportHeaders=['Mes','Inventario','Empresa','Almacén','Andamio','Nivel','Código','Producto','Cantidad contada','Estado del conteo','Responsable'];
            exportRows=records.map(({run,row,loc,company})=>[run.month||'Sin mes',run.title,company,loc.warehouseName||loc.warehouse||'Sin almacén',loc.name||row.locationLabel||'Sin ubicación',row.level||'',row.sku||'',row.name,row.quantity??'',row.quantity==null?'Pendiente':'Contado',row.workerName||'']);
            content=table(exportHeaders,exportRows);
          }
          $('analysisResults').innerHTML=groups.length?content:`<div class="analysis-empty"><h3>${all.length?'No hay resultados con estos filtros':archive?'Aún no hay inventarios cerrados':'Aún no hay inventarios para analizar'}</h3><p>${all.length?'Prueba otro período, empresa, almacén o producto.':archive?'Al cerrar un inventario aparecerá aquí, con su información conservada.':'Los productos ubicados en andamios son la preparación. Inicia un inventario desde Gestión para registrar conteos y obtener informes.'}</p></div>`;
          if(tab==='inventories'&&groups.length){
            const th=panelDoc.createElement('th');th.textContent='Acciones';$('analysisResults').querySelector('thead tr').append(th);
            $('analysisResults').querySelectorAll('tbody tr').forEach((row,index)=>{
              const group=groups[index],cell=panelDoc.createElement('td'),view=panelDoc.createElement('button');view.className='ghost-button';view.textContent='Ver productos';
              view.onclick=()=>{$('analysisRun').value=group.run.id;tab='products';render();};cell.append(view);row.append(cell);
              if(group.run.scope==='global'&&group.run.month&&!warehouse&&!search){
                const excel=panelDoc.createElement('button');excel.className='ghost-button';excel.textContent=company?'Excel de empresa':'Excel mensual';cell.append(excel);
                excel.onclick=async()=>{excel.disabled=true;try{
                  const report=await desktopApi('/api/reports/monthly?month='+encodeURIComponent(group.run.month)+'&format=xlsx'+(company?'&companyId='+encodeURIComponent(company):''));
                  if(!valid())return;
                  if(!report.xlsx)throw new Error('El servidor no devolvió el archivo Excel.');
                  const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(report.xlsx),c=>c.charCodeAt(0))],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
                  const link=panelDoc.createElement('a');link.href=url;link.download='Inventario-'+group.run.month+(company?'-empresa':'')+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
                }catch(error){if(valid())$('analysisMessage').textContent='No se pudo descargar el Excel: '+error.message;}finally{excel.disabled=false;}};
              }
            });
          }
          paginate($('analysisResults'));
          $('analysisMessage').textContent=`${groups.length} inventarios · ${records.length} registros · Consulta actualizada a las ${new Date().toLocaleTimeString('es-PE')}`;
          $('analysisExport').disabled=!exportRows.length;
          $('workspaceStatus').textContent='';
        }catch(error){if(fresh()){$('analysisResults').replaceChildren();$('analysisMetrics').replaceChildren();$('analysisMessage').textContent='No se pudo completar el informe: '+error.message;}}
      }
      await render();
    }catch(error){if(valid()){$('workspaceStatus').textContent='No se pudo cargar el informe: '+error.message;host.innerHTML='<button id="analysisRetry" class="primary-button">Reintentar</button>';$('analysisRetry').onclick=()=>inventoryAnalysis(++generation,archive);}}
  }
  window.loadWorkspace=async route=>{
    const [key,subpage]=route.split('/');activeOwner=key;ownedPage='hub-'+key;closeHome();
    const request=++generation;
    $('workspaceStatus').textContent='';$('workspaceContent').replaceChildren();
    $('workspaceTitle').textContent=title(key);$('workspaceSubtitle').textContent='Solo inventario';syncWorkspaceNavigation();
    const root=roots.find(r=>r[0]===key);
    if(!root||!allowed(root[4])){$('workspaceStatus').textContent='Apartado no disponible para esta cuenta.';return;}
    const task=(label,symbol,id,permission='all')=>allowed(permission)?tile(label,symbol,()=>legacy(id,key)):null;
    const show=items=>cards(items.filter(Boolean),true);
    if(key==='analytics'||key==='reports'&&subpage==='archive'){await inventoryAnalysis(request,key==='reports');return;}
    if(key==='warehouses'){show([task('Empresas, almacenes y andamios','i-warehouse','openWarehouseEditor','admin'),task('Productos por ubicación','i-box','a[href="#inventoryArea"]'),task('Asignar espacios','i-user','openAssignmentsAdmin','management')]);return;}
    if(key==='management'){show([task('Inventario actual y seguimiento','i-management','openRunsAdmin','management'),task('Asignar espacios','i-user','openAssignmentsAdmin','management'),task('Revisar pendientes','i-target','showPendingFromSidebar','management'),task('Entradas y salidas durante el conteo','i-arrows','openMovementFromNav','management')]);return;}
    if(key==='home'){cards(roots.filter(r=>r[0]!=='home'&&allowed(r[4])).map(r=>tile(r[1],r[2],()=>go(r[0]))));return;}
    if(key==='products'){show([task('Gestor de productos','i-box','openProductManager','catalog'),task('Catálogo y existencias','i-grid','a[href="#inventoryArea"]')]);return;}
    if(key==='inventory'){show([
      task('Empresas, almacenes y andamios','i-warehouse','openWarehouseEditor','admin'),
      task('Productos y categorías','i-box','openProductManager','catalog'),
      task('Catálogo y conteos','i-box','a[href="#inventoryArea"]'),
      task('Inventarios físicos / gestión','i-management','openRunsAdmin','management'),
      task('Asignar espacios','i-user','openAssignmentsAdmin','management'),
      task('Entradas y salidas durante el conteo','i-arrows','openMovementFromNav','management'),
      task('Historial de cambios','i-history','openHistoryFromNav','history'),
      task('Revisar pendientes','i-target','showPendingFromSidebar','management'),
      task('Personal y permisos','i-user','openWorkers','admin'),
      allowed('reports')?tile('Informe mensual y analítica','i-chart',()=>go('analytics')):null
    ]);return;}
    if(key==='reports'){show([tile('Inventarios anteriores','i-calendar',()=>go('reports/archive'),'Consulta por período, empresa y almacén'),tile('Informe mensual y analítica','i-chart',()=>go('analytics'),'Comparación entre períodos y detalle exportable'),task('Historial de cambios','i-history','openHistoryFromNav','history'),allowed('movements')?tile('Movimientos del inventario','i-arrows',()=>showPage('movements')):null]);return;}
    if(key==='admin'){show([task('Empresas, almacenes y espacios','i-warehouse','openWarehouseEditor','admin'),task('Personal y permisos','i-user','openWorkers','admin'),task('Productos y categorías','i-box','openProductManager','catalog')]);return;}
    if(key==='settings'){show([tile('Conexiones y APK','i-connection',()=>showPage('connections')),tile('Verificación de la PC','i-target',()=>showPage('verification')),tile('Actualizaciones','i-history',()=>showPage('updates'))]);return;}
    if(key==='support')$('workspaceContent').innerHTML='<div class="workspace-help"><details open><summary>Preparar el inventario</summary><p>En Administración configura empresas, almacenes, espacios y personal. En Productos organiza el catálogo. En Inventario crea el inventario físico y asigna los espacios.</p></details><details><summary>Conteo desde el celular</summary><p>Instala la APK incluida y configura la dirección de esta PC. Descarga el catálogo y el inventario antes de trabajar sin conexión. Revisa y confirma la entrega para enviarla a la PC.</p></details><details><summary>Consultar resultados</summary><p>En Inventario revisa los pendientes y el historial. Reportes conserva el informe mensual, la analítica y los movimientos del inventario.</p></details></div>';
  };
  async function session(){try{
    const result=await desktopApi('/api/session');user=result.user;
    links.forEach((a,key)=>a.hidden=!allowed(roots.find(r=>r[0]===key)[4]));
    $('workspaceCompany').textContent='Inventario';$('workspaceRole').textContent=user?.roleLabel||'Cuenta de oficina';
    if((!currentPage||currentPage==='hub-home')&&!panelDoc.body.classList.contains('worker-mode'))go('home');
  }catch{}}
  new MutationObserver(()=>{if($('appShell').classList.contains('hidden')){user=null;generation++;$('workspaceContent').replaceChildren();}else session();}).observe($('appShell'),{attributes:true,attributeFilter:['class']});
  session();
}
