/* Keep entry forms intact until the user saves or explicitly discards them. */
window.InventoryFormGuard = (() => {
  const records = new Map(), values = new Map();
  let prompt = null, pending = 0;
  const enabled = () => !document.getElementById('appShell')?.classList.contains('hidden') &&
    (!document.body.classList.contains('worker-mode') || !!document.querySelector('#runRowWindow:not(.hidden)'));
  const visible = root => root.isConnected && root.getClientRects().length > 0 && !root.closest('.hidden,[hidden]');
  const active = () => document.querySelector('.floating-window:not(.hidden)');
  const disposable = new Set(['historyWindow','syncWindow','productDetailWindow','findingPhotoWindow','warehouseExportWindow','productDeleteWindow','runDeleteWindow','runDecisionWindow','backupRestoreWindow','shelfConfirmedWindow']);
  const ignored = root => root?.matches('[data-unsaved-ignore]') || disposable.has(root?.id);
  const controls = root => [...root.querySelectorAll('input,select,textarea,[contenteditable="true"]')].filter(el => !el.closest('[data-unsaved-ignore]') && !['button','submit','reset'].includes(el.type));
  const read = el => el.type === 'file' ? [...el.files].map(f => [f.name,f.size,f.lastModified]) : ['checkbox','radio'].includes(el.type) ? el.checked : el.isContentEditable ? el.textContent : el.multiple ? [...el.selectedOptions].map(o => o.value) : el.value;
  function snapshot(root) {
    return {
      fields: controls(root).map(el => ({el, value:read(el)})),
      extra: [...values].filter(([el]) => root === el || root.contains(el)).flatMap(([,getters]) => [...getters.values()].map(get => get()))
    };
  }
  const signature = data => JSON.stringify([data.fields.map(f => [f.el.id || f.el.name || f.el.tagName, f.value]), data.extra]);
  function begin(root, options = {}) {
    if (!root || ignored(root)) return;
    const record = records.get(root) || {root};
    Object.assign(record, options, {baseline:snapshot(root)});
    records.set(root, record);
    return record;
  }
  function clean(root) { if (root && !ignored(root)) begin(root); }
  function value(root, key, get) {
    if (!values.has(root)) values.set(root, new Map());
    values.get(root).set(key, get);
  }
  function dirty(record) {
    return !!record && (record.isDirty ? record.isDirty() : signature(snapshot(record.root)) !== signature(record.baseline));
  }
  function discard(record) {
    if (record.discard) record.discard();
    else for (const {el, value} of record.baseline.fields) {
      if (el.type === 'file') el.value = '';
      else if (['checkbox','radio'].includes(el.type)) el.checked = value;
      else if (el.isContentEditable) el.textContent = value;
      else if (el.multiple) [...el.options].forEach(o => o.selected = value.includes(o.value));
      else el.value = value;
    }
    clean(record.root);
  }
  function busy() { return pending > 0 || [...records.values()].some(r => r.busy?.()); }
  function beginWork() {
    if (!enabled()) return () => {};
    pending++;
    let done = false;
    return () => { if (!done) { done = true; pending--; } };
  }
  function beginRequest() {
    // Heartbeats and the offline queue must not lock unrelated screens.
    const root = active() || document.activeElement?.closest('form');
    return root?.querySelector('form[inert],.primary-button:disabled,button[type="submit"]:disabled') || root?.inert ? beginWork() : () => {};
  }
  function notice() {
    if (typeof toast === 'function') toast('Espera a que termine la operación. Tus datos siguen en la ventana.');
  }
  function ask(action, changes) {
    if (prompt) return;
    const focus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'unsavedChangesDialog';dialog.className = 'unsaved-dialog';
    dialog.setAttribute('aria-labelledby','unsavedChangesTitle');
    dialog.setAttribute('aria-describedby','unsavedChangesMessage');
    const canApply = changes.length > 0 && changes.every(record => typeof record.apply === 'function');
    dialog.innerHTML = `<span class="unsaved-symbol" aria-hidden="true">!</span><h2 id="unsavedChangesTitle">Tienes cambios sin guardar</h2><p id="unsavedChangesMessage">Lo que escribiste todavía no se ha guardado. Puedes aplicar los cambios antes de salir, descartarlos o seguir editando.</p><div class="unsaved-actions"><button id="unsavedDiscard" type="button" class="ghost-button" data-action-tone="danger">Descartar cambios</button>${canApply?'<button id="unsavedApply" type="button" class="primary-button" data-action-tone="confirm">Aplicar cambios</button>':''}<button id="unsavedContinue" type="button" class="primary-button" autofocus>Seguir editando</button></div>`;
    document.body.append(dialog);
    const finish = leave => {
      if (prompt !== dialog) return;
      prompt = null;dialog.close();dialog.remove();
      if (leave) { changes.forEach(discard);action(); }
      else if (focus?.isConnected) focus.focus({preventScroll:true});
    };
    prompt = dialog;
    dialog.querySelector('#unsavedContinue').onclick = () => finish(false);
    dialog.querySelector('#unsavedDiscard').onclick = () => finish(true);
    if(canApply)dialog.querySelector('#unsavedApply').onclick=async()=>{
      const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);
      try{
        for(const record of changes){if(await record.apply()===false){const error=record.root.querySelector('.form-error:not(.hidden)')?.textContent;dialog.querySelector('#unsavedChangesMessage').textContent=error||'No se pudo aplicar. Revisa los datos y vuelve a intentarlo.';buttons.forEach(button=>button.disabled=false);return;}}
        changes.forEach(record=>clean(record.root));
        if(prompt!==dialog)return;
        prompt=null;dialog.close();dialog.remove();action();
      }catch(error){dialog.querySelector('#unsavedChangesMessage').textContent=error.message||'No se pudo aplicar. Revisa los datos y vuelve a intentarlo.';buttons.forEach(button=>button.disabled=false);}
    };
    dialog.addEventListener('cancel', event => { event.preventDefault();finish(false); });
    dialog.addEventListener('keydown', event => {
      // The application's Escape/Tab handlers must not close the underlying form.
      if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();finish(false); }
      else if (event.key === 'Tab') event.stopPropagation();
    });
    dialog.showModal();dialog.querySelector('#unsavedContinue').focus();
  }
  function request(action, {roots, all = false} = {}) {
    if (!enabled()) return true;
    if (prompt) return false;
    if (busy()) { notice();return false; }
    const candidates = roots ? roots.map(root => records.get(root)).filter(Boolean) : [...records.values()].filter(r => all || (visible(r.root) && !r.preserveOnNavigate));
    const changes = candidates.filter(dirty);
    if (!changes.length) return true;
    ask(action, changes);return false;
  }
  function close(options, action) {
    if (!enabled() || options.saved || options.force) return true;
    const root = active();
    if (!root) return true;
    // Outside clicks never dismiss a data-entry window, even before typing.
    if (options.reason === 'backdrop' && !ignored(root) && controls(root).length) return false;
    return request(action, {roots:[root]});
  }
  function forget(root) { if (root && !records.get(root)?.isDirty) records.delete(root); }
  function reset() {
    if (prompt) { prompt.close();prompt.remove();prompt = null; }
    for (const record of records.values()) discard(record);
  }
  function hasUnsaved() { return enabled() && (busy() || [...records.values()].some(dirty)); }
  function trackInline(event) {
    if (!enabled()) return;
    const form = event.target.closest?.('form');
    if (form && form.id !== 'loginForm' && !form.closest('.floating-window,[data-unsaved-ignore]') && !records.has(form)) begin(form);
  }
  document.addEventListener('focusin', trackInline, true);
  document.addEventListener('pointerdown', trackInline, true);
  document.addEventListener('click', event => {
    trackInline(event);
    if (!enabled() || prompt || event.defaultPrevented) return;
    const target = event.target.closest('a,button');
    if (!target || target.disabled || target.matches('#logoutButton,#workerLogoutButton')) return;
    const modal = active();
    if (modal && !modal.contains(target) && !target.closest('#adminUndoNotice')) {
      if (!request(() => { closeWindows({force:true});target.click(); }, {roots:[modal]})) { event.preventDefault();event.stopImmediatePropagation(); }
      return;
    }
    const navigation = target.closest('.side-nav') || target.matches('#runsBack,#runsAll,#managerBack,#warehouseEditorClose,.workspace-switch');
    if (!modal && navigation && !request(() => target.click())) { event.preventDefault();event.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('beforeunload', event => {
    if (hasUnsaved()) { event.preventDefault();event.returnValue = ''; }
  });
  return {begin, clean, value, request, close, forget, reset, beginWork, beginRequest, hasUnsaved, isDirty:root => dirty(records.get(root))};
})();
