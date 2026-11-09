const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const check=async function(){
  const wait=ms=>new Promise(r=>setTimeout(r,ms));const passed=[];
  const assert=(ok,name)=>{if(!ok)throw Error(name);passed.push(name);};
  try{
    await wait(1800);
    const frame=document.getElementById('inventoryFrame'),win=frame.contentWindow,doc=frame.contentDocument;
    assert(!doc.getElementById('appShell').classList.contains('hidden'),'Inicio automático y panel de escritorio');
    assert(!!doc.getElementById('workspaceContent'),'Navegación de escritorio instalada');
    const data=await win.api('/api/state'),layout=await win.api('/api/inventories/layout');
    assert(data.products.length===36&&layout.empresas.length===2&&layout.layout.length===4,'36 productos / 2 empresas / 4 almacenes');
    assert(layout.layout.every(w=>w.spaces.length===3&&w.spaces.every(s=>s.products.length===3)),'12 andamios con 3 productos cada uno');
    doc.getElementById('openWarehouseEditor').click();await wait(100);
    assert(!doc.getElementById('warehouseEditor').classList.contains('hidden'),'Editor visible');
    const warehouse=doc.querySelector('.editor-warehouse-choice');assert(!!warehouse,'Almacén seleccionable');warehouse.click();await wait(100);
    const space=doc.querySelector('.editor-space-tile .editor-warehouse-choice');assert(!!space,'Andamio seleccionable');space.click();await wait(100);
    const input=doc.querySelector('.editor-space-identity input');assert(!!input,'Detalle de andamio');input.value='Andamio verificado';input.dispatchEvent(new win.Event('input',{bubbles:true}));
    await doc.getElementById('warehouseEditorSave').onclick();
    const saved=await win.api('/api/inventories/layout');assert(saved.layout.some(w=>w.spaces.some(s=>s.name==='Andamio verificado')),'Guardado desde interfaz');
    frame.src='/panel.html';await wait(1500);
    const persisted=await frame.contentWindow.api('/api/inventories/layout');assert(persisted.layout.some(w=>w.spaces.some(s=>s.name==='Andamio verificado')),'Persistencia después de recargar');
    document.body.dataset.qa=JSON.stringify({ok:true,passed});
  }catch(e){document.body.dataset.qa=JSON.stringify({ok:false,error:e.stack,passed});}
};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{let body=fs.readFileSync(file);if(pathname==='/panel.html')body=body.toString().replace('<head>','<head><script>window.qaErrors=[];addEventListener("error",e=>qaErrors.push(e.message));addEventListener("unhandledrejection",e=>qaErrors.push(String(e.reason)));</script>');if(pathname==='/')body=body.toString().replace('</body>',`<script>addEventListener('load',${check.toString()});</script></body>`);res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1',async()=>{
  const {chromium}=require('playwright');let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',e=>console.log('Browser error:',e.message));
    await page.goto(process.env.VERIFY_URL||`http://127.0.0.1:${server.address().port}/`);
    if(process.env.VERIFY_URL)await page.evaluate(check);
    await page.waitForFunction(()=>!!document.body.dataset.qa,{},{timeout:30000});
    const result=await page.evaluate(()=>JSON.parse(document.body.dataset.qa));console.log(JSON.stringify(result));
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results','demo.png')});
    if(!result.ok)process.exitCode=1;
  }catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();server.close();}
});
