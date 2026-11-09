/* Public, fictional demo. No production database or credentials are used. */
(() => {
  'use strict';
  const KEY = 'inventario-hugo-demo-v2';
  const user = {id:'demo-admin', name:'Hugo Demo', username:'demo', role:'admin', accessRole:'administrator', roleLabel:'Administrador demo'};
  const month = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima',year:'numeric',month:'2-digit'}).format(new Date());
  function seed() { return window.DemoSeed.create(); }
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY))||seed();}catch{return seed();}};
  const save=db=>{db.version++;localStorage.setItem(KEY,JSON.stringify(db));};
  const nativeFetch=window.fetch.bind(window);
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  window.fetch=async (input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
    const path=url.pathname, method=options.method||'GET', body=options.body?JSON.parse(options.body):{}, db=read();
    if(path==='/api/health')return reply({ok:true,version:db.version});
    if(path==='/api/logout'){sessionStorage.setItem('demo-logged-out','1');return reply({ok:true});}
    if(path==='/api/login'){if(body.username!=='demo'||body.password!=='demo')return reply({error:'Acceso demo: usuario demo y contraseña demo.'},401);sessionStorage.removeItem('demo-logged-out');return reply({user});}
    if(sessionStorage.getItem('demo-logged-out'))return reply({error:'Inicia sesión con demo / demo.'},401);
    if(path==='/api/session')return reply({user});
    if(path==='/api/state')return reply(window.DemoSeed.state(db,month));
    if(path==='/api/inventories/layout'){
      if(method==='POST'){
        if(body.expectedRevision!==db.revision)return reply({error:'La estructura cambió en otra pestaña. Vuelve a abrir el editor.'},409);
        if(!Array.isArray(body.layout)||!Array.isArray(body.empresas))return reply({error:'Estructura inválida.'},400);
        db.layout=body.layout;db.empresas=body.empresas;db.revision++;
        db.layout.forEach(w=>w.spaces.forEach(s=>{s.id ||= 'demo-'+crypto.randomUUID();}));save(db);
      }
      return reply({layout:db.layout,empresas:db.empresas,revision:db.revision});
    }
    if(path==='/api/inventories'&&method==='GET')return reply({runs:window.DemoSeed.details.map(d=>d.run).reverse(),workers:[],empresas:db.empresas});
    const historyMatch=path.match(/^\/api\/inventories\/(demo-inventory-2026-(?:09|10))(?:\/(.*))?$/);
    if(historyMatch&&method==='GET'){
      const detail=window.DemoSeed.details.find(d=>d.run.id===historyMatch[1]);
      if(!historyMatch[2])return reply(detail);
      if(historyMatch[2]==='findings')return reply({rows:[],incorporated:[],layout:db.layout,revision:db.revision,runRevision:1});
      if(historyMatch[2]==='movements')return reply({movements:[],balances:[]});
    }
    if(path==='/api/reports/monthly'&&method==='GET'){
      const detail=window.DemoSeed.details.find(d=>d.run.month===url.searchParams.get('month'));
      if(!detail)return reply({error:'La demo incluye septiembre y octubre de 2026.'},404);
      if(url.searchParams.get('format')==='xlsx')return reply({error:'En esta demo descarga los datos desde Reportes → Analítica → Exportar CSV.'},422);
      return reply({month:detail.run.month,companies:detail.run.empresas,rows:detail.rows,provisional:false});
    }
    if(path==='/api/inventories/pulse')return reply({ok:true});
    if(path==='/api/backups'&&method==='GET')return reply({enabled:false,activeRun:false,copies:[],folder:'Demo: los cambios se guardan únicamente en este navegador.'});
    if(path==='/api/workers'&&method==='GET')return reply({workers:[],roles:[],permissions:[]});
    if(path==='/api/activity'&&method==='GET')return reply({events:[],records:[],hasMore:false});
    if(path==='/api/products'&&method==='POST'){
      const product={...body,id:'demo-'+crypto.randomUUID(),revision:1};db.products.push(product);save(db);return reply({product});
    }
    if(path.startsWith('/api/products/')&&method==='PUT'){
      const product=db.products.find(p=>p.id===decodeURIComponent(path.split('/')[3]));
      if(!product)return reply({error:'Producto no encontrado.'},404);
      Object.assign(product,body,{id:product.id,revision:product.revision+1});save(db);return reply({product});
    }
    return reply({error:'Esta función requiere el servidor de escritorio. En esta demo puedes explorar y editar empresas, almacenes, andamios y el catálogo.'},422);
  };
  addEventListener('DOMContentLoaded',()=>{
    const style=document.createElement('style');style.textContent='.demo-banner{position:sticky;top:0;z-index:9999;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:8px 12px;background:#fff4ce;color:#604300;font:12px Segoe UI,sans-serif}.demo-banner button{font:inherit;padding:4px 8px;border:1px solid #b99b4b;border-radius:5px;background:white;color:#604300;cursor:pointer}';document.head.append(style);
    const banner=document.createElement('aside');banner.className='demo-banner';banner.setAttribute('aria-label','Información de la demo');
    const label=document.createElement('span');label.textContent='DEMO · '+window.DEMO_CATALOG.length+' productos con fotos · Septiembre y octubre 2026: conteos ficticios · Cambios solo en este navegador';
    const reset=document.createElement('button');reset.textContent='Restablecer demo';reset.onclick=()=>{if(!confirm('¿Restablecer los datos ficticios y descartar tus cambios de esta demo?'))return;localStorage.removeItem(KEY);for(const key of Object.keys(localStorage))if(key.startsWith('inventory-structure-draft-'))localStorage.removeItem(key);sessionStorage.removeItem('demo-logged-out');location.reload();};
    banner.append(label,reset);document.body.prepend(banner);
    document.querySelector('.login-copy').textContent='Acceso de demostración: usuario demo · contraseña demo.';
    document.getElementById('loginUser').value='demo';
  });
})();
