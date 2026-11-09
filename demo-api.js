/* Public, fictional demo. No production database or credentials are used. */
(() => {
  'use strict';
  const KEY = 'inventario-hugo-demo-v1';
  const user = {id:'demo-admin', name:'Hugo Demo', username:'demo', role:'admin', accessRole:'administrator', roleLabel:'Administrador demo'};
  const month = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima',year:'numeric',month:'2-digit'}).format(new Date());
  function seed() {
    const empresas = [{id:'demo-andina',name:'Comercial Andina · Demo',image:''},{id:'demo-pacifico',name:'Distribuidora Pacífico · Demo',image:''}];
    const names = ['Detergente líquido 1 L','Lejía 1 L','Desinfectante 900 ml','Limpiavidrios 500 ml','Jabón líquido 1 L','Esponja multiuso','Escoba de interior','Paño de microfibra','Guantes de limpieza','Pintura blanca 1 gal','Brocha de 2 pulgadas','Rodillo de pintura','Cinta de embalaje','Silicona transparente','Pegamento universal','Lija para madera','Espátula metálica','Sellador acrílico','Aceite de motor 1 L','Refrigerante 1 gal','Limpiaparabrisas 1 L','Cera para autos','Champú para autos','Franela de pulido','Grasa lubricante','Embudo plástico','Cepillo de lavado','Caja organizadora','Bolsa industrial','Precintos plásticos','Cuerda de nylon','Cinta aislante','Candado de acero','Linterna LED','Pilas AA','Cutter de seguridad'];
    const products = names.map((name,i)=>({id:`demo-p${i+1}`,name,sku:`DEMO-${String(i+1).padStart(3,'0')}`,category:['LIMPIEZA','FERRETERÍA','AUTOMOTRIZ','VARIOS'][Math.floor(i/9)],stock:24+i*3,minStock:10,price:5+i*1.5,image:'',unit:'unidad',revision:1}));
    const layout = ['Almacén Central','Almacén de Reposición','Almacén Principal','Almacén de Despacho'].map((name,w)=>({name,empresa_id:empresas[Math.floor(w/2)].id,image:'',spaces:Array.from({length:3},(_,s)=>({id:`demo-space-${w}-${s}`,name:`Andamio ${String(s+1).padStart(2,'0')}`,products:products.slice(w*9+s*3,w*9+s*3+3).map((p,l)=>({productId:p.id,name:p.name,sku:p.sku,level:`${l+1}`,evidenceImage:''}))}))}));
    return {version:1,revision:1,empresas,layout,products,history:[],counts:[]};
  }
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
    if(path==='/api/state')return reply({...db,currentMonth:month,locations:db.layout.flatMap(w=>w.spaces.map(s=>({id:s.id,name:s.name,warehouse:w.name,warehouseName:w.name,empresa_id:w.empresa_id}))),inventoryMonths:{[month]:{products:db.products}},workingMonth:month});
    if(path==='/api/inventories/layout'){
      if(method==='POST'){
        if(body.expectedRevision!==db.revision)return reply({error:'La estructura cambió en otra pestaña. Vuelve a abrir el editor.'},409);
        if(!Array.isArray(body.layout)||!Array.isArray(body.empresas))return reply({error:'Estructura inválida.'},400);
        db.layout=body.layout;db.empresas=body.empresas;db.revision++;
        db.layout.forEach(w=>w.spaces.forEach(s=>{s.id ||= 'demo-'+crypto.randomUUID();}));save(db);
      }
      return reply({layout:db.layout,empresas:db.empresas,revision:db.revision});
    }
    if(path==='/api/inventories'&&method==='GET')return reply({runs:[],workers:[],empresas:db.empresas});
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
    const label=document.createElement('span');label.textContent='DEMO · 2 empresas, 4 almacenes, 12 andamios y 36 productos · Cambios solo en este navegador';
    const reset=document.createElement('button');reset.textContent='Restablecer demo';reset.onclick=()=>{if(!confirm('¿Restablecer los datos ficticios y descartar tus cambios de esta demo?'))return;localStorage.removeItem(KEY);for(const key of Object.keys(localStorage))if(key.startsWith('inventory-structure-draft-'))localStorage.removeItem(key);sessionStorage.removeItem('demo-logged-out');location.reload();};
    banner.append(label,reset);document.body.prepend(banner);
    document.querySelector('.login-copy').textContent='Acceso de demostración: usuario demo · contraseña demo.';
    document.getElementById('loginUser').value='demo';
  });
})();
