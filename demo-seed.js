/* Only the catalog is copied. Locations, dates and all counts are fictional. */
window.DemoSeed=(()=>{
  const months=['2026-09','2026-10'];
  function create(){
    const empresas=[{id:'demo-andina',name:'Comercial Andina · Demo',image:''},{id:'demo-pacifico',name:'Distribuidora Pacífico · Demo',image:''}];
    const products=structuredClone(window.DEMO_CATALOG);
    const layout=['Almacén Central','Almacén de Reposición','Almacén Principal','Almacén de Despacho'].map((name,w)=>({name,empresa_id:empresas[Math.floor(w/2)].id,image:'',spaces:Array.from({length:3},(_,s)=>({id:`demo-space-${w}-${s}`,name:`Andamio ${String(s+1).padStart(2,'0')}`,products:products.filter((p,i)=>i%12===w*3+s).map((p,i)=>({productId:p.id,name:p.name,sku:p.sku,level:String(i%3+1),evidenceImage:''}))}))}));
    return {version:2,revision:1,empresas,layout,products,history:[],counts:[]};
  }
  const original=create(),byId=new Map(original.products.map(p=>[p.id,p]));
  const locations=layout=>layout.flatMap(w=>w.spaces.map(s=>({id:s.id,name:s.name,warehouse:w.name,warehouseName:w.name,empresa_id:w.empresa_id,zone:'General',label:w.name+' / '+s.name})));
  const details=months.map((month,m)=>{
    const places=locations(original.layout),end=month+(m?'-31':'-30')+'T17:00:00-05:00';
    const run={id:'demo-inventory-'+month,title:(m?'Octubre':'Septiembre')+' 2026 · Inventario ficticio',month,status:'closed',mode:'guided',scope:'global',revision:1,createdAt:month+'-01T08:00:00-05:00',closedAt:end,updatedAt:end,empresas:original.empresas,locations:places,locationLabel:'Todos los almacenes · Datos ficticios',total:original.products.length,counted:original.products.length};
    let index=0;
    const rows=original.layout.flatMap(w=>w.spaces.flatMap(s=>s.products.map(p=>{
      const i=index++,product=byId.get(p.productId),base=18+(i*11)%97,quantity=i%29===0?0:Math.max(0,base+(m?((i%9)-4)*3:0));
      return {id:run.id+'-row-'+i,runId:run.id,locationId:s.id,locationLabel:w.name+' / '+s.name,productId:p.productId,name:p.name,sku:p.sku,level:p.level,image:product.image,quantity,expected:base,revision:1,prepared:true,retired:false,sortOrder:i,workerId:'demo-worker-'+(i%3+1),workerName:['Ana · Demo','Luis · Demo','María · Demo'][i%3],role:'worker',updatedAt:month+'-28T10:00:00-05:00'};
    })));
    const spaces=places.map(l=>({locationId:l.id,label:l.label,status:'finished',countComplete:true,ready:true,total:rows.filter(r=>r.locationId===l.id).length,counted:rows.filter(r=>r.locationId===l.id).length,missing:0,unconfirmed:0,retirements:0,levelCount:3,reservation:null}));
    return {run,rows,spaces,incorporated:[],audit:[],events:[],hasMore:false,restoreEpoch:'demo-v2',readiness:{readySpaces:spaces.length,totalSpaces:spaces.length,structure:{updated:true}},syncConfirmation:{devices:[]}};
  });
  function state(db,currentMonth){
    const counts=details.flatMap(d=>d.rows.map(r=>({productId:r.productId,locationId:r.locationId,month:d.run.month,quantity:r.quantity,revision:1,workerName:r.workerName,date:r.updatedAt})));
    return {...db,counts,locationCounts:counts,currentMonth,restoreEpoch:'demo-v2',locations:locations(db.layout),workingMonth:'',periods:months.map(month=>({month,status:'closed',revision:1})),inventoryMonths:Object.fromEntries(months.map(month=>[month,{products:original.products}]))};
  }
  return {create,months,details,locations,state};
})();
