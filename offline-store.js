/* Durable, origin-scoped storage. No passwords are stored here. */
window.InventoryOffline = (() => {
  let opening;
  function database() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('inventory-offline-v2', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('pending', {keyPath:'id'});
        request.result.createObjectStore('snapshot');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = null; };
        db.onclose = () => { opening = null; };
        resolve(db);
      };
      request.onerror = () => {
        opening = null;
        reject(new Error('No se pudo abrir el almacenamiento de este equipo. Inténtalo nuevamente.'));
      };
    });
    return opening;
  }
  async function run(store, mode, action) {
    const db = await database();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,mode);
      const request = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(new Error('No se guardó en este equipo. Revisa el espacio disponible e inténtalo nuevamente.'));
    });
  }
  function clearRunCache(){for(const key of Object.keys(localStorage))if(key.startsWith('inventory-run-cache-'))localStorage.removeItem(key);}
  const photoJobs=new Map();
  async function cachePhoto(source){
    if(!source||source.startsWith('data:'))return source;
    if(!/^\/assets\/products\/[A-Za-z0-9_-]+\.(webp|png|jpe?g)$/.test(source))throw new Error('Imagen no válida.');
    if(photoJobs.has(source))return photoJobs.get(source);
    const task=(async()=>{
      const saved=await run('snapshot','readonly',store=>store.get('photo:'+source));if(saved)return saved;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
      try{
        const response=await fetch(source,{signal:controller.signal});if(!response.ok)throw new Error('No se pudo descargar una foto del inventario.');
        const bitmap=await createImageBitmap(await response.blob()),canvas=document.createElement('canvas'),scale=Math.min(1,320/Math.max(bitmap.width,bitmap.height));
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
        const value=canvas.toDataURL('image/jpeg',.8);await run('snapshot','readwrite',store=>store.put(value,'photo:'+source));
        if(await run('snapshot','readonly',store=>store.get('photo:'+source))!==value)throw new Error('No se pudo comprobar el guardado de las fotos.');return value;
      }finally{clearTimeout(timer);}
    })();photoJobs.set(source,task);try{return await task;}finally{photoJobs.delete(source);}
  }
  const local = {
    cachePhoto,
    assignmentNotice:(owner,id,value)=>value===undefined?run('snapshot','readonly',store=>store.get('assignment-notice:'+owner+':'+id)):run('snapshot','readwrite',store=>store.put(value,'assignment-notice:'+owner+':'+id)),
    photoSource:async source=>source?.startsWith('data:')?source:await run('snapshot','readonly',store=>store.get('photo:'+source))||source,
    preparation:(owner,id,value)=>value===undefined?run('snapshot','readonly',store=>store.get('prepared:'+owner+':'+id)):run('snapshot','readwrite',store=>store.put(value,'prepared:'+owner+':'+id)),
    list: () => run('pending','readonly',store => store.getAll()),
    put: value => run('pending','readwrite',store => store.put(value)),
    updatePending: value => run('pending','readwrite',store => {const request=store.get(value.id);request.onsuccess=()=>{if(request.result?.status==='pending')store.put(value);};return request;}),
    remove: id => run('pending','readwrite',store => store.delete(id)),
    replace: (id,entry) => run('pending','readwrite',store => {store.delete(id);return store.put(entry);}),
    snapshot: value => value === undefined ? run('snapshot','readonly',store => store.get('last')) : run('snapshot','readwrite',store => store.put(value,'last')),
    runSnapshot: (owner,value) => value === undefined ? run('snapshot','readonly',store => store.get('run-'+owner)) : run('snapshot','readwrite',store => store.put(value,'run-'+owner)),
    forget: () => {clearRunCache();return run('snapshot','readwrite',store => store.clear());},
    clearSnapshot: () => {clearRunCache();return run('snapshot','readwrite',store => store.clear());},
    id: () => [...crypto.getRandomValues(new Uint32Array(4))].map(n=>n.toString(16).padStart(8,'0')).join('-'),
  };
  if (!/InventoryAndroid\/(1[3-9]|[2-9][0-9])\b/.test(navigator.userAgent)) return local;
  let sequence=0, chain=Promise.resolve(), migrating;
  const calls=new Map();
  const messageTransport=Number(navigator.userAgent.match(/InventoryAndroid\/(\d+)/)?.[1])>=24;
  let outboxPort=null;
  const waitingForPort=[];
  if(messageTransport)window.addEventListener('message',event=>{
    if(event.data!=='inventory-outbox-port'||event.ports.length!==1||outboxPort)return;
    // Native postWebMessage delivers to this main frame at the configured origin.
    // Reject messages coming from other web frames or external origins.
    if(event.source!==null || (event.origin && event.origin!=='null' && event.origin!==location.origin))return;
    outboxPort=event.ports[0];
    for(const send of waitingForPort.splice(0))send();
  });
  window.inventoryOutboxResult=response=>{
    const call=calls.get(response.id);if(!call)return;
    calls.delete(response.id);clearTimeout(call.timer);
    response.error?call.reject(new Error(response.error)):call.resolve(response.result);
  };
  window.inventoryOutboxChunk=(id,index,total,part)=>{
    const call=calls.get(id);if(!call||total<1||total>2048||index<0||index>=total)return;
    if(index===0)call.parts=[];
    if(!call.parts||call.parts.length!==index)return;
    call.parts.push(part);
    if(index===total-1){try{window.inventoryOutboxResult(JSON.parse(call.parts.join('')));}catch{calls.delete(id);clearTimeout(call.timer);call.reject(new Error('No se pudo leer la cola de fotos. Vuelve a intentarlo.'));}}
  };
  function native(op,data={}) {
    const send=(operation,payload)=>new Promise((resolve,reject)=>{
      const id=`outbox-${Date.now()}-${++sequence}`;
      const timer=setTimeout(()=>{calls.delete(id);reject(new Error('La cola del celular está ocupada. Revisa los pendientes antes de volver a guardar.'));},180000);
      calls.set(id,{resolve,reject,timer});
      const message=JSON.stringify({id,op:operation,...payload});
      if(message.length>48000&&operation!=='chunk'){
        if(!/InventoryAndroid\/(2[3-9]|[3-9][0-9])\b/.test(navigator.userAgent)){calls.delete(id);clearTimeout(timer);reject(new Error('Actualiza la APK para guardar fotos en el borrador.'));return;}
        (async()=>{for(let offset=0,index=0;offset<message.length;offset+=48000,index++)await send('chunk',{transfer:id,index,total:Math.ceil(message.length/48000),part:message.slice(offset,offset+48000)});})().catch(error=>{calls.delete(id);clearTimeout(timer);reject(error);});
      }else if(messageTransport){
        const deliver=()=>{
          if(!calls.has(id))return;
          try{outboxPort.postMessage(message);}
          catch(error){calls.delete(id);clearTimeout(timer);reject(new Error('No se pudo comunicar con el almacenamiento del celular. Vuelve a abrir la app.'));}
        };
        if(outboxPort)deliver();else waitingForPort.push(deliver);
      }else location.href='inventory://outbox?data='+encodeURIComponent(message);
    });
    const work=()=>send(op,data);
    // Network retries must never hold up local reads or durable writes.
    if(op==='sync'||op==='bind')return work();
    const result=chain.then(work,work);chain=result.catch(()=>{});return result;
  }
  async function migrate() {
    if(!migrating)migrating=(async()=>{
      for(const entry of await local.list()) {await native('import',{entry});await local.remove(entry.id);}
    })().catch(error=>{migrating=null;throw error;});
    return migrating;
  }
  return {...local,native:true,
    startVoice:(request,master)=>native('startVoice',{request,master}),
    startScan:request=>native('startScan',{request}),
    stopScan:request=>native('stopScan',{request}),
    dismissKeyboard:()=>native('hideKeyboard'),
    networkAvailable:()=>native('networkAvailable'),
    reportDevice:fallback=>native('reportDevice',{fallback}),
    list:async()=>{await migrate();return native('list');},
    put:async entry=>{await migrate();return native('put',{entry});},
    updatePending:entry=>native('updatePending',{entry}),
    remove:entryId=>native('remove',{entryId}),
    replace:(entryId,entry)=>native('replace',{entryId,entry}),
    bind:owner=>native('bind',{owner}),
    authorized:owner=>native('status',{owner}),
    sync:owner=>native('sync',{owner}),
    forget:async()=>{await native('forget');return local.forget();}
  };
})();
