const PAGE_SIZE = 8;
const state = { products: [], history: [], counts: [], month: '', currentMonth: '', user: null, version: -1, filter: "all", search: "", categoryFilter: "all", page: 1 };
let editExpectedStock = null;
let toastTimer;
let refreshPending = null;
let returnFocus = null;
let submitting = false;
let editingMovement = null;
let movementMode = "manual";
let voiceSearchText = null;
let voiceMasterResult = null;
let scanRequest = null;
let scanFrozenMatches=null;
let scanCandidate=null, scanCandidateReads=0, scanCandidateTime=0;
let workerTab = 'register';
let workerHistoryFilter = 'all';
let workerHistoryLimit = 20;
const isWorker = () => state.user?.role === 'worker';
const androidVersion = Number(navigator.userAgent.match(/InventoryAndroid\/(\d+)/)?.[1] || 0);
const liveCameraAvailable = () => androidVersion >= 3;
document.body.classList.toggle('android-app', androidVersion > 0);
let monthlyPage = 1;
document.getElementById('downloadMonthlyReport').addEventListener('click', async (event) => {
  const button = event.currentTarget, status = document.getElementById('monthlyReportStatus');
  button.disabled = true;
  const month = state.month;
  status.textContent = 'Generando reporte con los registros del servidor…';
  try {
    const report = await api(`/api/reports/monthly?month=${encodeURIComponent(month)}&format=xlsx`);
    if (!report.xlsx) throw new Error('Actualiza el programa de PC para descargar el reporte Excel.');
    const bytes = Uint8Array.from(atob(report.xlsx), character => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link = document.createElement('a'); link.href = url; link.download = `Inventario-${report.month}.xlsx`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    const variation = report.summary.variationPercent;
    status.textContent = `${report.month} frente a ${report.previousMonth} · ${report.provisional ? 'Provisional' : 'Cerrado'} · ${report.summary.comparable} productos comparables · Variación: ${variation === null ? 'sin base comparable' : variation.toLocaleString('es-PE', {maximumFractionDigits: 2}) + '%'}. Incluye todos los productos, sin aplicar el filtro de búsqueda.`;
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
let selectedCountRevision = null;
let selectedCountKey = '';
let countsByKey = new Map();
let frozenComparisons = new Map();
const movementHome = document.createComment('movement-form-home');
document.getElementById('movementWindow').before(movementHome);

const els = {
  ...Object.fromEntries([
    "movementModes", "quickMode", "cameraPanel", "scanLabel", "scanStatus", "recognizedText", "correctionReasonLabel", "correctionReason",
    "categoryFilter", "navProductCount", "catalogCount", "allFilterCount", "lowFilterCount",
    "outFilterCount", "bannerTitle", "bannerDescription", "showPending", "showPendingFromSidebar",
    "clearFilters", "togglePassword", "toggleSidebar", "closeSidebar", "sidebarOverlay", "sideRail",
    "openMovementFromNav", "todayDate", "previousPage", "nextPage", "tableResults", "pageInfo",
    "inventoryValueLabel", "inventoryValueHint", "categoryChartHint",
    "movementSearch", "movementResults", "movementSelected", "changeMovementProduct",
    "movementPreview", "movementError", "historySearch", "historyFrom", "historyTo", "toast", "sessionWorkerName",
    "openWorkers", "workersWindow", "closeWorkers", "workerForm", "workerName", "workerUsername", "workerPassword", "workerError", "workersList",
    "openPassword", "passwordWindow", "closePassword", "passwordForm", "currentPassword", "newPassword", "passwordError",
  ].map((id) => [id, document.getElementById(id)])),
  loginScreen: document.querySelector("#loginScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginUser: document.querySelector("#loginUser"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  logoutButton: document.querySelector("#logoutButton"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  productWindow: document.querySelector("#productWindow"),
  movementWindow: document.querySelector("#movementWindow"),
  openProductModal: document.querySelector("#openProductModal"),
  openMovementModal: document.querySelector("#openMovementModal"),
  openHistoryModal: document.querySelector("#openHistoryModal"),
  openHistoryFromPanel: document.querySelector("#openHistoryFromPanel"),
  openHistoryFromNav: document.querySelector("#openHistoryFromNav"),
  closeProductModal: document.querySelector("#closeProductModal"),
  closeMovementModal: document.querySelector("#closeMovementModal"),
  closeHistoryModal: document.querySelector("#closeHistoryModal"),
  cancelMovement: document.querySelector("#cancelMovement"),
  productForm: document.querySelector("#productForm"),
  movementForm: document.querySelector("#movementForm"),
  productId: document.querySelector("#productId"),
  name: document.querySelector("#name"),
  category: document.querySelector("#category"),
  stock: document.querySelector("#stock"),
  minStock: document.querySelector("#minStock"),
  price: document.querySelector("#price"),
  sku: document.querySelector("#sku"),
  saveProduct: document.querySelector("#saveProduct"),
  formTitle: document.querySelector("#formTitle"),
  cancelEdit: document.querySelector("#cancelEdit"),
  search: document.querySelector("#search"),
  filters: document.querySelectorAll(".filter-button"),
  inventoryBody: document.querySelector("#inventoryBody"),
  rowTemplate: document.querySelector("#rowTemplate"),
  emptyState: document.querySelector("#emptyState"),
  totalProducts: document.querySelector("#totalProducts"),
  inventoryValue: document.querySelector("#inventoryValue"),
  lowStockCount: document.querySelector("#lowStockCount"),
  outStockCount: document.querySelector("#outStockCount"),
  avgErrorRate: document.querySelector("#avgErrorRate"),
  movementProduct: document.querySelector("#movementProduct"),
  movementType: document.querySelector("#movementType"),
  movementQty: document.querySelector("#movementQty"),
  stockChart: document.querySelector("#stockChart"),
  categoryChart: document.querySelector("#categoryChart"),
  historyWindow: document.querySelector("#historyWindow"),
  productDetailWindow: document.querySelector("#productDetailWindow"),
  historyBody: document.querySelector("#historyBody"),
  historyEmpty: document.querySelector("#historyEmpty"),
  historyTotal: document.querySelector("#historyTotal"),
  historyAverage: document.querySelector("#historyAverage"),
  clearHistory: document.querySelector("#clearHistory"),
  auditList: document.querySelector("#auditList"),
  closeProductDetail: document.querySelector("#closeProductDetail"),
  detailName: document.querySelector("#detailName"),
  detailSku: document.querySelector("#detailSku"),
  detailStatus: document.querySelector("#detailStatus"),
  detailCategory: document.querySelector("#detailCategory"),
  detailStock: document.querySelector("#detailStock"),
  detailMinStock: document.querySelector("#detailMinStock"),
  detailPrice: document.querySelector("#detailPrice"),
  detailValue: document.querySelector("#detailValue"),
  detailErrorRate: document.querySelector("#detailErrorRate"),
  detailErrorAlert: document.querySelector("#detailErrorAlert"),
  detailHistoryBody: document.querySelector("#detailHistoryBody"),
  detailHistoryEmpty: document.querySelector("#detailHistoryEmpty"),
};

function currency(value) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(value);
}

// Reuse decoded images during synchronous redraws, before the browser paints.
// Match the source, not the product ID: a newly assigned photo must still load.
function preserveProductPhotos(root, paint) {
  const images = new Map();
  for (const image of root.querySelectorAll('img[data-product-image]')) {
    if (!image.complete || !image.naturalWidth) continue;
    const source = image.dataset.productImage;
    if (!images.has(source)) images.set(source, []);
    images.get(source).push(image);
  }
  const result = paint();
  for (const image of root.querySelectorAll('img[data-product-image]')) {
    const candidates = images.get(image.dataset.productImage);
    if (!candidates || candidates.includes(image)) continue;
    const previous = candidates.find(candidate => !root.contains(candidate));
    if (!previous) continue;
    candidates.splice(candidates.indexOf(previous), 1);
    previous.alt = image.alt;
    image.replaceWith(previous);
  }
  return result;
}

function productPhoto(product, className = 'product-photo') {
  const frame = document.createElement('span');
  frame.className = className;
  if (!product.image || !( /^\/assets\/products\/[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/.test(product.image) || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(product.image))) return null;
  const image = document.createElement('img');
  image.alt = `Foto de ${product.name}`;
  image.dataset.productImage = product.image;
  InventoryOffline.photoSource(product.image).then(source=>{if(image.parentNode)image.src=source;}).catch(()=>{if(image.parentNode)image.src=product.image;});
  image.addEventListener('load',()=>{if(image.src.startsWith(location.origin+'/assets/products/'))InventoryOffline.cachePhoto(product.image).catch(()=>{});},{once:true});
  image.loading = 'lazy'; image.decoding = 'async';
  image.addEventListener('error', () => { image.remove(); frame.classList.add('photo-unavailable'); frame.textContent = 'Sin foto'; });
  frame.append(image);
  return frame;
}

function percent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function productErrorLabel(product) {
  return comparisonLabel(monthlyComparison(product.id));
}

function previousMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return `${String(number === 1 ? year - 1 : year).padStart(4, '0')}-${String(number === 1 ? 12 : number - 1).padStart(2, '0')}`;
}
function monthLabel(month) {
  return new Intl.DateTimeFormat('es-PE', {month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(`${month}-01T12:00:00Z`));
}
function countFor(productId, month) {
  return countsByKey.get(`${month}/${productId}`);
}
function monthlyProducts() {
  const inventory=state.inventoryMonths?.[state.month];
  if(inventory){const products=new Map(state.products.map(p=>[p.id,p]));for(const p of inventory.products)products.set(p.id,p);return [...products.values()];}
  if(state.inventoryMonths&&!state.counts.some(count=>count.month===state.month))return [];
  const products = new Map(state.products.map(product => [product.id, product]));
  state.counts.filter(count => [state.month, previousMonth(state.month)].includes(count.month)).forEach(count => {
    if (!products.has(count.productId)) products.set(count.productId, {id:count.productId, name:count.name, sku:count.sku, archived:true});
  });
  return [...products.values()];
}
function monthlyComparison(productId) {
  const frozen = frozenComparisons.get(`${state.month}/${productId}`);
  const current = frozen ? (frozen.quantity === null ? null : {quantity:frozen.quantity}) : countFor(productId, state.month), previous = frozen ? (frozen.previous === null ? null : {quantity:frozen.previous}) : countFor(productId, previousMonth(state.month));
  const difference = current && previous ? Math.round((current.quantity - previous.quantity) * 1e8) / 1e8 : null;
  return {current, previous, difference, rate: difference !== null && previous.quantity > 0 ? Math.abs(difference) / previous.quantity * 100 : null};
}
function comparisonLabel(comparison) {
  if (!comparison.current && !comparison.previous) return 'Sin actividad';
  if (!comparison.current) return 'Pendiente';
  if (!comparison.previous) return 'Sin mes anterior';
  if (comparison.previous.quantity === 0) return 'Base anterior 0';
  return percent(comparison.rate);
}
function applyMarginHeat(element, rate) {
  element.classList.add('margin-heat');
  element.classList.toggle('margin-empty', rate === null);
  const stops = [[198, 239, 206], [255, 235, 156], [244, 166, 166]];
  const value = rate === null ? null : Math.max(0, Math.min(rate, 100)) / 50;
  if (value === null) {
    element.style.removeProperty('background-color');
    element.style.removeProperty('--margin-color');
    element.title = 'Sin comparación: falta un conteo o la base anterior es cero.';
    return;
  }
  const index = Math.min(1, Math.floor(value)), fraction = value - index;
  const rgb = stops[index].map((channel, i) => Math.round(channel + (stops[index + 1][i] - channel) * fraction));
  element.style.backgroundColor = `rgb(${rgb.join(',')})`;
  element.style.setProperty('--margin-color', `rgb(${rgb.join(',')})`);
  element.title = 'Margen absoluto: verde 0%, amarillo 50%, rojo 100% o más.';
}
function renderMonthly() {
  const monthInput = document.getElementById('inventoryMonth');
  monthInput.value = state.month; monthInput.max = state.currentMonth;
  const rows = monthlyProducts().map(product => ({product, ...monthlyComparison(product.id)}));
  const counted = rows.filter(row => row.current);
  const rates = rows.filter(row => row.rate !== null).map(row => row.rate);
  document.getElementById('monthlyComparison').textContent = `${monthLabel(state.month)} frente a ${monthLabel(previousMonth(state.month))}. Los conteos se guardan por separado de las entradas y salidas.`;
  const inventory=state.inventoryMonths?.[state.month];
  if(inventory)document.getElementById('monthlyComparison').textContent=`${inventory.title} · ${monthLabel(state.month)} · ${inventory.status==='closed'?'Finalizado':inventory.status==='paused'?'Pausado':'En vivo'}. Cantidades sumadas por producto entre ubicaciones y niveles.`;
  else if(!rows.length)document.getElementById('monthlyComparison').textContent=`No hay inventario registrado para ${monthLabel(state.month)}. Puedes abrirlo desde Gestión.`;
  document.getElementById('monthlyProgress').textContent = `${counted.length} / ${rows.length}`;
  document.getElementById('monthlyUnits').textContent = new Intl.NumberFormat('es-PE', {maximumFractionDigits:8}).format(counted.reduce((sum, row) => sum + row.current.quantity, 0));
  document.getElementById('monthlyMargin').textContent = rates.length ? percent(rates.reduce((sum, value) => sum + value, 0) / rates.length) : 'Sin comparación';
  applyMarginHeat(document.getElementById('monthlyMargin'), rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : null);
  const filtered = counted.filter(row => matchesProduct(row.product, document.getElementById('monthlySearch').value))
    .sort((a, b) => a.product.name.localeCompare(b.product.name, 'es', {sensitivity:'base', numeric:true})
      || (a.product.sku || '').localeCompare(b.product.sku || '', 'es', {numeric:true})
      || a.product.id.localeCompare(b.product.id));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  monthlyPage = Math.min(monthlyPage, pages);
  document.getElementById('monthlyResults').textContent = `${filtered.length} productos · Página ${monthlyPage} de ${pages} · ${rates.length} comparables`;
  document.getElementById('monthlyPrevious').disabled = monthlyPage === 1;
  document.getElementById('monthlyNext').disabled = monthlyPage === pages;
  const body = document.getElementById('monthlyBody'); body.replaceChildren();
  const catalogPhotos = new Map(state.products.map(product => [product.id, product]));
  filtered.slice((monthlyPage-1)*PAGE_SIZE, monthlyPage*PAGE_SIZE).forEach(row => {
    const tr = document.createElement('tr');
    if(!row.current&&!row.previous){tr.style.color='#78858f';tr.title='Sin conteo en ambos meses. Excluido de la comparación de este período.';}
    [row.product.name, row.previous?.quantity ?? 'Sin conteo', row.current?.quantity ?? 'Pendiente', row.difference === null ? '—' : signedQuantity(row.difference), comparisonLabel(row)].forEach((value, index) => {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
      if (index === 0) {
        const visual = document.createElement('div'); visual.className = 'monthly-product';
        const photo = productPhoto({...row.product, image:row.product.image || catalogPhotos.get(row.product.id)?.image}) || document.createElement('span');
        if (!photo.className) { photo.className = 'product-photo photo-unavailable'; photo.textContent = 'Sin foto'; }
        const name = document.createElement('span'); name.textContent = row.product.name;
        visual.append(photo, name); td.replaceChildren(visual);
      }
      if (index === 4) applyMarginHeat(td, row.rate);
    });
    const td = document.createElement('td'), button = document.createElement('button');
    button.type = 'button'; button.className = 'text-button'; button.textContent = row.current ? 'Corregir' : 'Contar';
    if (row.product.archived) { button.textContent = 'Archivado'; button.disabled = true; }
    if(inventory){button.textContent=inventory.status==='closed'?'Ver inventario':'Ver conteos';button.disabled=false;}
    button.addEventListener('click', () => {if(inventory){window.InventoryRuns.show(inventory.id);return;} openMovement(row.product.id); document.getElementById('countMonth').value = state.month; selectedCountKey = ''; syncCountForm(); });
    td.append(button); tr.append(td); body.append(tr);
  });
  if (!filtered.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 6; td.textContent = counted.length ? 'No hay productos contados para esta búsqueda.' : 'Todavía no hay productos contados en este inventario.'; tr.append(td); body.append(tr); }
}
function syncCountForm() {
  if(isWorker()){els.movementType.value='count';document.getElementById('countMonth').value=state.workingMonth||'';}
  document.getElementById('movementTypeLabel').classList.toggle('hidden',isWorker());
  const counting = !editingMovement && els.movementType.value === 'count';
  els.movementForm.querySelector('button[type=submit]').dataset.actionTone=els.movementType.value==='out'?'danger':'confirm';
  const monthInput = document.getElementById('countMonth');
  document.getElementById('countMonthLabel').classList.toggle('hidden', !counting||isWorker());
  document.getElementById('countLocation').value=currentLocation();
  document.getElementById('countLocationLabel').classList.toggle('hidden',isWorker()||!counting);
  monthInput.required = counting; monthInput.max = state.currentMonth;
  els.movementType.querySelector('[value="count"]').disabled = Boolean(editingMovement);
  els.movementQty.min = counting ? '0' : '0.01';
  const existing = counting ? locationCount(els.movementProduct.value, monthInput.value) : null;
  const key = `${currentLocation()}/${els.movementType.value}/${monthInput.value}/${els.movementProduct.value}`;
  if (key !== selectedCountKey) {
    selectedCountKey = key; selectedCountRevision = existing?.revision ?? null;
    els.movementQty.value = '';
    els.correctionReason.value = '';
  }
  els.correctionReasonLabel.classList.toggle('hidden', !existing && !editingMovement);
  els.correctionReason.required = Boolean(existing || editingMovement);
  els.movementForm.querySelector('[type="submit"]').textContent = editingMovement ? 'Guardar corrección' : existing ? 'Corregir conteo' : counting ? 'Guardar conteo mensual' : 'Registrar movimiento';
  updateMovementPreview();
}
document.getElementById('inventoryMonth').addEventListener('change', event => {
  if (!event.target.value || event.target.value > state.currentMonth) { event.target.value = state.month; return; }
  state.month = event.target.value; monthlyPage = 1; render();
});
document.getElementById('monthlySearch').addEventListener('input', () => { monthlyPage = 1; renderMonthly(); });
document.getElementById('monthlyPrevious').addEventListener('click', () => { monthlyPage--; renderMonthly(); });
document.getElementById('monthlyNext').addEventListener('click', () => { monthlyPage++; renderMonthly(); });
document.getElementById('countMonth').addEventListener('change', syncCountForm);

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

function getStatus(product) {
  if (product.stock === 0) return { label: "Sin existencias", className: "status-pending" };
  if (product.stock <= product.minStock) {
    return { label: "Stock bajo", className: "status-low" };
  }
  return { label: "Disponible", className: "status-ok" };
}

function getLastProductHistory(product) {
  return state.history.find((item) => item.sku === product.sku || item.productId === product.id);
}

function getProductHistory(product) {
  return state.history.filter((item) => item.sku === product.sku || item.productId === product.id);
}

function getFilteredProducts() {
  return state.products.filter((product) => matchesProduct(product, state.search) &&
    (state.categoryFilter === "all" || product.category === state.categoryFilter) &&
    (state.filter === "all" || (state.filter === "low" && product.stock > 0 && product.stock <= product.minStock) || (state.filter === "out" && product.stock === 0)));
}

function getSummary() {
  const stockValue = state.products.reduce(
    (sum, product) => sum + Math.max(product.stock, 0) * product.price,
    0,
  );
  const catalogValue = state.products.reduce((sum, product) => sum + product.price, 0);
  const totalValue = stockValue > 0 ? stockValue : catalogValue;
  const positiveStock = state.products.filter((product) => product.stock > 0).length;
  const lowStock = state.products.filter(
    (product) => product.stock > 0 && product.stock <= product.minStock,
  ).length;
  const zeroStock = state.products.filter((product) => product.stock === 0).length;
  const outStock = zeroStock;
  const available = positiveStock - lowStock;
  const validErrorRates = monthlyProducts()
    .map((item) => monthlyComparison(item.id).rate)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const avgErrorRate = validErrorRates.length
    ? validErrorRates.reduce((sum, value) => sum + value, 0) / validErrorRates.length
    : 0;

  return {
    totalValue,
    stockValue,
    catalogValue,
    positiveStock,
    lowStock,
    zeroStock,
    outStock,
    available,
    avgErrorRate,
    errorSamples: validErrorRates.length,
  };
}

function renderSummary() {
  const summary = getSummary();
  els.totalProducts.textContent = state.products.length;
  els.navProductCount.textContent = state.products.length;
  els.allFilterCount.textContent = state.products.length;
  els.lowFilterCount.textContent = summary.lowStock;
  els.outFilterCount.textContent = summary.zeroStock;
  els.inventoryValueLabel.textContent = summary.stockValue > 0 ? "Valor del inventario" : "Valor de lista";
  els.inventoryValueHint.textContent = summary.stockValue > 0 ? "Valor de las existencias actuales" : "Suma de precios del catálogo";
  els.categoryChartHint.textContent = summary.stockValue > 0
    ? "Las 6 categorías con mayor valor en stock"
    : "Las 6 categorías con mayor valor de lista";
  const pending = state.products.filter(product => !countFor(product.id, state.month)).length;
  els.bannerTitle.textContent = pending
    ? `${pending} ${pending === 1 ? "producto por contar" : "productos por contar"}`
    : "Tu conteo está al día";
  els.bannerDescription.textContent = pending
    ? `Pendientes de ${monthLabel(state.month)}.`
    : "Revisa tus productos y mantén el orden.";
  els.inventoryValue.textContent = currency(summary.totalValue);
  els.lowStockCount.textContent = summary.positiveStock;
  els.outStockCount.textContent = summary.zeroStock;
  els.avgErrorRate.textContent = summary.errorSamples
    ? `${summary.avgErrorRate.toFixed(2)}%`
    : "Sin registro";
}

function renderTable() { return preserveProductPhotos(els.inventoryBody.parentElement, renderTableContent); }
function renderTableContent() {
  renderProductManager();
  const products = getFilteredProducts();
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  state.page = Math.min(Math.max(state.page, 1), totalPages);
  const start = (state.page - 1) * PAGE_SIZE;
  const pageProducts = products.slice(start, start + PAGE_SIZE);
  els.catalogCount.textContent = products.length;
  els.tableResults.textContent = products.length
    ? `Mostrando ${start + 1}–${start + pageProducts.length} de ${products.length} productos`
    : "0 productos";
  els.pageInfo.textContent = `${state.page} / ${totalPages}`;
  els.previousPage.disabled = state.page === 1;
  els.nextPage.disabled = state.page === totalPages;
  els.filters.forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  els.inventoryBody.replaceChildren();
  els.emptyState.classList.toggle("hidden", products.length > 0);

  pageProducts.forEach((product) => {
    const row = els.rowTemplate.content.firstElementChild.cloneNode(true);
    const status = getStatus(product);

    row.querySelector(".product-name").textContent = product.name;
    const photo = productPhoto(product);
    if (photo) row.querySelector('.product-avatar').replaceWith(photo);
    row.querySelector(".product-sku").textContent = product.sku;
    row.querySelector(".product-category").textContent = product.category;
    row.querySelector(".product-stock").textContent = product.stock;
    row.querySelector(".product-price").textContent = currency(product.price);
    row.querySelector(".product-value").textContent = currency(Math.max(product.stock, 0) * product.price);
    row.querySelector(".product-error-rate").textContent = productErrorLabel(product);

    const statusPill = row.querySelector(".status-pill");
    statusPill.textContent = status.label;
    statusPill.classList.add(status.className);

    row.addEventListener("click", () => openProductDetail(product.id));
    row.tabIndex = 0;
    row.setAttribute("aria-label", `Ver ficha de ${product.name}`);
    row.addEventListener("keydown", (event) => {
      if (event.target === row && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openProductDetail(product.id);
      }
    });
    row.querySelector(".edit-button").addEventListener("click", (event) => {
      event.stopPropagation();
      startEdit(product.id);
    });
    row.querySelector(".add-stock-button").addEventListener("click", (event) => {
      event.stopPropagation();
      openMovement(product.id);
    });
    row.querySelector(".delete-button").classList.toggle("hidden", state.user?.role !== "admin");
    row.querySelector(".edit-button").classList.toggle("hidden", state.user?.role !== "admin");
    row.querySelector(".delete-button").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteProduct(product.id);
    });

    els.inventoryBody.append(row);
  });
}

function renderMovementOptions() {
  const selected = state.products.find((p) => p.id === els.movementProduct.value);
  if (selected) { showSelectedProduct(selected); return; }
  els.movementProduct.value = "";
  els.movementSelected.classList.add("hidden");
  els.changeMovementProduct.classList.add("hidden");
  els.movementResults.classList.remove("hidden");
  els.movementSearch.classList.remove("hidden");

  const ranked = movementMode === 'quick' ? (scanFrozenMatches || InventoryMatching.rank(state.products, els.recognizedText.value).slice(0,3)) : [];
  const voiceMatches = movementMode === 'manual' && voiceSearchText !== null && voiceSearchText === els.movementSearch.value ? (voiceMasterResult ? voiceMasterResult.matches : InventoryMatching.voiceRank(state.products, voiceSearchText)) : null;
  const matches = (movementMode === "quick" ? ranked.map(m => m.product) : voiceMatches ? voiceMatches.map(m => m.product) : (els.movementSearch.value.trim() ? manualProductMatches(els.movementSearch.value) : []));
  els.movementResults.replaceChildren();
  matches.slice(0, 12).forEach((product) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "movement-result";
    if(movementMode==='quick'&&product.id===ranked[0]?.product.id)button.classList.add('best-match');
    const name = document.createElement("strong");
    name.textContent = product.name;
    const detail = document.createElement("span");
    detail.textContent = (isWorker() ? `${product.sku} · ${product.category}` : `${product.sku} · Stock: ${product.stock} · ${product.category}`) + (product.location ? ` · ${product.location}` : '');
    button.append(name, detail);
    if (voiceMatches || movementMode==='quick') { const presentation=document.createElement('span');presentation.className='voice-presentation';presentation.textContent=InventoryMatching.voicePresentation(product);button.append(presentation); }
    if (voiceMatches) { const badge=document.createElement('small'); badge.className='match-label'; badge.textContent=voiceMatches.find(m=>m.product.id===product.id).label; button.append(badge); }
    const photo = productPhoto(product);
    if (photo) { button.classList.add('has-product-photo'); button.prepend(photo); }
    if (movementMode === 'quick') { const badge = document.createElement('small'); badge.className = 'match-label'; badge.textContent = (product.id===ranked[0]?.product.id?'Principal · ':'Alternativa · ')+ranked.find(m => m.product.id === product.id)?.label; button.append(badge); }
    button.addEventListener("click", () => { els.movementProduct.value = product.id; showSelectedProduct(product); applyMasterQuantity(); els.movementQty.focus(); els.movementQty.select(); });
    els.movementResults.append(button);
  });
  const hint = document.createElement("p");
  hint.className = "muted-note";
  hint.textContent = matches.length ? `${matches.length} coincidencias${matches.length>12?' · Mostrando 12':''}` : !(movementMode === 'quick' ? els.recognizedText.value : els.movementSearch.value).trim() ? '' : 'No encontramos ese producto. Prueba con su nombre o código.';
  els.movementResults.append(hint);
  syncCountForm();
}

function renderCategoryOptions(selected = els.category.value) {
  const categories = [...new Set(state.products.map((p) => p.category).filter(Boolean))].sort((a,b) => a.localeCompare(b,"es"));
  const choices = [...new Set([...categories, ...(selected && selected !== '__new_category__' ? [selected] : [])])].sort((a,b) => a.localeCompare(b,"es"));
  const signature = JSON.stringify(choices);
  if (els.category.dataset.choices !== signature) {
    els.category.replaceChildren(new Option('Selecciona una categoría', ''), ...choices.map(c => new Option(c,c)), new Option('+ Crear nueva categoría', '__new_category__'));
    els.category.dataset.choices = signature;
  }
  els.category.value = selected;
  syncNewCategory();
  if (!categories.includes(state.categoryFilter)) state.categoryFilter = "all";
  els.categoryFilter.replaceChildren(new Option("Todas las categorías", "all"), ...categories.map((c) => new Option(c,c)));
  els.categoryFilter.value = state.categoryFilter;
}

function syncNewCategory() {
  const creating = els.category.value === '__new_category__';
  document.getElementById('newCategoryLabel').classList.toggle('hidden', !creating);
  document.getElementById('newCategory').disabled = !creating;
  document.getElementById('newCategory').required = creating;
}
els.category.addEventListener('change', () => {
  syncNewCategory();
  if (els.category.value === '__new_category__') document.getElementById('newCategory').focus();
});

function clearCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(Math.round(rect.width * ratio), 1);
  canvas.height = Math.max(Math.round(rect.height * ratio), 1);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function drawStockChart() {
  const ctx = clearCanvas(els.stockChart);
  const width = els.stockChart.clientWidth;
  const height = els.stockChart.clientHeight;
  const summary = getSummary();
  const data = [
    { label: "Disponible", value: summary.available, color: "#25b7ac" },
    { label: "Stock bajo", value: summary.lowStock, color: "#4c83f1" },
    { label: "Stock base cero", value: summary.zeroStock, color: "#dce5f2" },
  ];
  const total = Math.max(data.reduce((sum, item) => sum + item.value, 0), 1);
  const cx = width / 2;
  const cy = (height - 62) / 2;
  const radius = Math.min(cy - 5, width * 0.25, 70);
  let start = -Math.PI / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#edf1f7";
  ctx.fill();

  data.forEach((item) => {
    const angle = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    start += angle;
  });

  ctx.beginPath();
  ctx.fillStyle = "#ffffff";
  ctx.arc(cx, cy, radius * 0.77, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#15191f";
  ctx.font = "700 28px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText(String(state.products.length), cx, cy + 3);
  ctx.fillStyle = "#8993a4";
  ctx.font = "11px Segoe UI";
  ctx.fillText("productos", cx, cy + 21);

  ctx.font = "11px Segoe UI";
  data.forEach((item, index) => {
    const legendX = width * (index + 0.5) / data.length;
    const y = height - 39;
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(legendX, y - 16, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#667085";
    ctx.font = "11px Segoe UI";
    ctx.fillText(item.label, legendX, y);
    ctx.fillStyle = "#23334b";
    ctx.font = "700 14px Segoe UI";
    ctx.fillText(String(item.value), legendX, y + 21);
  });
  els.stockChart.setAttribute("aria-label", data.map((item) => `${item.label}: ${item.value}`).join(", "));
}

function drawCategoryChart() {
  const ctx = clearCanvas(els.categoryChart);
  const width = els.categoryChart.clientWidth;
  const height = els.categoryChart.clientHeight;
  const categoryTotals = new Map();
  const useStockValue = state.products.some((product) => product.stock > 0);

  state.products.forEach((product) => {
    const value = useStockValue ? Math.max(product.stock, 0) * product.price : product.price;
    categoryTotals.set(product.category, (categoryTotals.get(product.category) || 0) + value);
  });

  const data = [...categoryTotals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const chartTop = 19;
  const rowGap = Math.min((height - 16) / Math.max(data.length, 1), 40);
  const barX = 2;
  const barMax = width - 4;

  ctx.font = "11px Segoe UI";
  data.forEach((item, index) => {
    const y = chartTop + index * rowGap;
    const barWidth = (item.value / maxValue) * barMax;
    const valueLabel = currency(item.value);
    const labelMax = Math.max(0, width - ctx.measureText(valueLabel).width - 18);
    let label = item.label;
    while (label.length && ctx.measureText(label).width > labelMax) {
      label = label.slice(0, -1);
    }
    if (label !== item.label && label.length > 1) label = `${label.slice(0, -1)}…`;

    ctx.fillStyle = "#667085";
    ctx.fillText(label, barX, y);
    ctx.fillStyle = "#edf1f7";
    ctx.fillRect(barX, y + 8, barMax, 6);
    ctx.fillStyle = index % 2 === 0 ? "#4c83f1" : "#25b7ac";
    ctx.fillRect(barX, y + 8, barWidth, 6);
    ctx.fillStyle = "#23334b";
    ctx.textAlign = "right";
    ctx.fillText(valueLabel, width - 2, y);
    ctx.textAlign = "left";
  });
  if (!data.length) {
    ctx.fillStyle = "#8993a4";
    ctx.textAlign = "center";
    ctx.fillText("Agrega productos para ver su valor", width / 2, height / 2);
  }
  els.categoryChart.setAttribute("aria-label", `Valor por categoría. ${data.map((item) => `${item.label}: ${currency(item.value)}`).join(", ")}`);
}

function renderCharts() {
  drawStockChart();
  drawCategoryChart();
}

// Operational analytics use the selected inventory's own locations and counts.
(() => {
  const el=id=>document.getElementById(id), root=el('runAnalytics');
  if(!root)return;
  let detail=null,request=0,loadedUser=null;
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  function options(select,items,placeholder){const old=select.value;select.replaceChildren();if(placeholder)select.append(new Option(placeholder,''));for(const [id,name] of items)select.append(new Option(name,id));if(items.some(([id])=>id===old))select.value=old;}
  function warehouses(){
    const company=el('analyticsCompany').value;
    const places=detail.run.locations.filter(p=>!company||p.empresa_id===company);
    options(el('analyticsWarehouse'),[...new Map(places.map(p=>[p.warehouse,p.warehouseName||p.warehouse])).entries()],'Todos los almacenes');
  }
  function render(){
    if(!detail)return;
    const company=el('analyticsCompany').value,warehouse=el('analyticsWarehouse').value;
    const places=detail.run.locations.filter(p=>(!company||p.empresa_id===company)&&(!warehouse||p.warehouse===warehouse));
    const ids=new Set(places.map(p=>p.id)),spaces=(detail.spaces||[]).filter(s=>ids.has(s.locationId));
    const rows=detail.rows.filter(r=>ids.has(r.locationId)&&!r.retired);
    const counted=rows.filter(r=>r.quantity!=null),zero=counted.filter(r=>Number(r.quantity)===0).length;
    const ready=spaces.filter(s=>s.ready).length,percent=spaces.length?Math.round(ready/spaces.length*100):0;
    const missing=rows.length-counted.length,findings=spaces.reduce((n,s)=>n+(s.unconfirmed||0),0),retirements=spaces.reduce((n,s)=>n+(s.retirements||0),0);
    const metrics=el('analyticsMetrics');metrics.replaceChildren();
    for(const [label,value,hint] of [['Avance',percent+'%',ready+' de '+spaces.length+' espacios revisados'],['Registros contados',counted.length,'de '+rows.length+' registros activos'],['Sin contar',missing,'Cantidad todavía no registrada'],['Conteos en cero',zero,'Cero registrado explícitamente']]){
      const card=make('article',null,'analytics-metric');card.append(make('span',label),make('strong',String(value)),make('small',hint));metrics.append(card);
    }
    const bars=el('analyticsBars');bars.replaceChildren();
    const groups=[...new Set(places.map(p=>p.warehouse))].map(key=>{
      const loc=places.filter(p=>p.warehouse===key),keys=new Set(loc.map(p=>p.id)),ss=spaces.filter(s=>keys.has(s.locationId));
      return {key,label:loc[0].warehouseName||key,company:(detail.run.empresas||[]).find(c=>c.id===loc[0].empresa_id)?.name||'',done:ss.filter(s=>s.ready).length,total:ss.length};
    }).sort((a,b)=>(a.total?a.done/a.total:0)-(b.total?b.done/b.total:0)||a.label.localeCompare(b.label));
    if(!groups.length)bars.append(make('p','No hay espacios para esta selección.'));
    for(const g of groups){
      const item=make('div',null,'analytics-bar'),line=make('div'),copy=make('div');copy.append(make('strong',g.label),make('small',g.company));line.append(copy,make('span',g.done+' / '+g.total));
      const progress=document.createElement('progress');progress.max=Math.max(g.total,1);progress.value=g.done;progress.setAttribute('aria-label',g.label+': '+g.done+' de '+g.total+' espacios revisados');item.append(line,progress);bars.append(item);
    }
    const alerts=el('analyticsAlerts');alerts.replaceChildren();
    for(const [n,label] of [[spaces.length-ready,'espacios por terminar o revisar'],[findings,'productos por confirmar'],[retirements,'solicitudes de retiro pendientes']]){
      const item=make('div',null,'analytics-alert'+(n?' needs-review':''));item.append(make('strong',String(n)),make('span',label));alerts.append(item);
    }
    const devices=detail.syncConfirmation?.devices||[],pending=devices.filter(d=>d.pending&&!d.adminResolved).reduce((n,d)=>n+d.pending,0);
    alerts.append(make('p',pending?pending+' envíos pendientes reportados en todo el inventario.':'Sin envíos pendientes reportados en todo el inventario.','analytics-note'));
    el('analyticsScopeNote').textContent='Pendientes de la empresa y el almacén seleccionados.';
    el('analyticsContent').hidden=false;
  }
  async function load(refreshList=false){
    if(state.user?.role!=='admin')return;
    const token=++request,user=state.user.id;
    el('analyticsStatus').textContent='Consultando inventario…';el('analyticsContent').hidden=true;
    try{
      if(refreshList||loadedUser!==user){
        const result=await api('/api/inventories');if(token!==request||state.user?.id!==user)return;
        const runs=result.runs.filter(r=>r.scope==='global');
        if(loadedUser!==user)el('analyticsRun').replaceChildren();
        options(el('analyticsRun'),runs.map(r=>[r.id,(r.month||'Sin mes')+' · '+r.title+' · '+({open:'Abierto',paused:'Pausado',closed:'Cerrado',draft:'Borrador'}[r.status]||r.status)]));
        if(!loadedUser){const active=runs.find(r=>['open','paused'].includes(r.status));if(active)el('analyticsRun').value=active.id;}
        loadedUser=user;
      }
      const id=el('analyticsRun').value;
      if(!id){detail=null;el('analyticsStatus').textContent='Todavía no hay inventarios. Crea uno en Gestión para ver su avance.';return;}
      const result=await api('/api/inventories/'+encodeURIComponent(id));
      if(token!==request||state.user?.id!==user)return;
      detail=result;
      options(el('analyticsCompany'),(detail.run.empresas||[]).map(c=>[c.id,c.name]),'Todas las empresas');warehouses();render();
      el('analyticsStatus').textContent=(detail.run.status==='closed'?'Inventario cerrado · ':'')+'Actualizado a las '+new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})+' · '+(detail.run.mode==='blind'?'Boceto nuevo':'Con lista');
    }catch(error){if(token===request){detail=null;el('analyticsContent').hidden=true;el('analyticsStatus').textContent='No se pudo actualizar: '+error.message;}}
  }
  el('analyticsRefresh').onclick=()=>load(true);
  el('analyticsRun').onchange=()=>{el('analyticsCompany').value='';el('analyticsWarehouse').value='';load();};
  el('analyticsCompany').onchange=()=>{el('analyticsWarehouse').value='';warehouses();render();};
  el('analyticsWarehouse').onchange=render;
  el('analyticsOpen').onclick=()=>{if(detail)window.InventoryRuns?.show(detail.run.id);};
  document.querySelector('a[href="#analyticsPanel"]')?.addEventListener('click',()=>load(true));
  new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&loadedUser!==state.user?.id)load(true);},{threshold:0.1}).observe(root);
})();

function renderAuditList() {
  els.auditList.replaceChildren();

  state.history.slice(0, 5).forEach((item) => {
    const row = document.createElement("article");
    const title = document.createElement("strong");
    const detail = document.createElement("span");

    row.className = "audit-item";
    title.textContent = `${item.workerName || "Sin responsable registrado"} · ${item.locationLabel || ""} · ${item.type} ${item.month ? item.countQuantity : signedQuantity(item.difference)}`;
    detail.textContent = `${item.name} · ${formatDateTime(item.date)}`;

    row.append(title, detail);
    els.auditList.append(row);
  });

  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "audit-empty";
    empty.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-history"></use></svg><strong>Todo empieza con un movimiento</strong><p>Los cambios de tu inventario aparecerán aquí.</p>';
    els.auditList.append(empty);
  }
}

function renderHistory() { window.InventoryHistory?.refresh(); }

function render() { return preserveProductPhotos(document.body, renderContent); }
function renderContent() {
  renderRelease();
  if (isWorker()) { renderMovementOptions(); renderWorkerHistory(); return; }
  renderMonthly();
  renderCategoryOptions();
  renderSummary();
  renderTable();
  renderMovementOptions();
  renderCharts();
  renderAuditList();
  renderHistory();
}

function openWindow(target) {
  const previous = document.querySelector('.floating-window:not(.hidden)');
  if (previous && previous !== target && !InventoryFormGuard.request(() => openWindow(target), {roots:[previous]})) return;
  if (isWorker() && target === els.movementWindow) { closeWindows(); openWorkerTab('register'); target.classList.remove('hidden'); return; }
  stopLabelScan();
  returnFocus = document.activeElement;
  setSidebar(false);
  document.querySelectorAll(".floating-window").forEach((el) => { el.classList.add("hidden");InventoryFormGuard.forget(el); });
  document.body.classList.add("modal-open");
  els.modalBackdrop.classList.remove("hidden");
  target.classList.remove("hidden");
  InventoryFormGuard.begin(target);
  document.querySelectorAll("[data-current-worker]").forEach((el) => el.textContent = state.user?.name || "");
  target.focus();
}

function closeWindows(options = {}) {
  if(document.body.classList.contains("personnel-open") && !options.force && !InventoryFormGuard.request(()=>closeWindows({force:true}),{all:true}))return false;
  if (options instanceof Event) options = {reason:options.currentTarget === els.modalBackdrop ? 'backdrop' : 'close'};
  if (!InventoryFormGuard.close(options, () => closeWindows({force:true}))) return false;
  if (!isWorker()) stopLabelScan();
  document.body.classList.remove("personnel-open");
  if(els.workersWindow.classList.contains("personnel-page"))els.workersWindow.classList.add("hidden");
  document.body.classList.remove("modal-open");
  els.modalBackdrop.classList.add("hidden");
  document.querySelectorAll(".floating-window").forEach((el) => { el.classList.add("hidden");InventoryFormGuard.forget(el); });
  if(isWorker() && els.movementWindow.classList.contains('worker-entry')){els.movementWindow.classList.remove('hidden');renderWarehouses();renderWork();}
  if (returnFocus?.isConnected) returnFocus.focus();
  return true;
}

function openProductDetail(id) {
  if (isWorker()) return;
  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  const status = getStatus(product);
  const history = getProductHistory(product).slice(0, 5);
  const latest = {errorRate: monthlyComparison(product.id).rate};
  const hasHighError =
    latest && typeof latest.errorRate === "number" && latest.errorRate > 6;

  els.detailName.textContent = product.name;
  const photo = productPhoto(product, 'product-photo product-photo-large');
  const photoHost = document.getElementById('detailProductImage');
  photoHost.replaceChildren(...(photo ? [photo] : []));
  photoHost.classList.toggle('hidden', !photo);
  els.detailSku.textContent = product.sku;
  els.detailCategory.textContent = product.category;
  els.detailStock.textContent = product.stock;
  els.detailMinStock.textContent = product.minStock;
  els.detailPrice.textContent = currency(product.price);
  els.detailValue.textContent = currency(product.stock * product.price);
  els.detailErrorRate.textContent = productErrorLabel(product);
  els.detailErrorAlert.classList.toggle("hidden", !hasHighError);

  els.detailStatus.className = `status-pill ${status.className}`;
  els.detailStatus.textContent = status.label;

  els.detailHistoryBody.replaceChildren();
  els.detailHistoryEmpty.classList.toggle("hidden", history.length > 0);

  history.forEach((item) => {
    const row = document.createElement("tr");
    [
      formatDateTime(item.date),
      item.workerName || "Sin responsable registrado",
      item.month ? `${item.type} · ${monthLabel(item.month)} · ${item.locationLabel||'Conteo general'}` : item.type,
      item.month ? item.countQuantity : signedQuantity(item.difference),
      item.month ? '—' : item.previousStock,
      item.month ? '—' : item.currentStock,
      item.month ? '—' : signedQuantity(item.difference),
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });


    els.detailHistoryBody.append(row);
  });

  openWindow(els.productDetailWindow);
}

function openProductForm() {
  resetForm();
  openWindow(els.productWindow);
  els.name.focus();
}

function getFormData() {
  const chosenCategory = els.category.value === '__new_category__' ? document.getElementById('newCategory').value.trim() : els.category.value;
  const category = state.products.find(p => p.category?.toLocaleLowerCase('es') === chosenCategory.toLocaleLowerCase('es'))?.category || chosenCategory;
  return { image: productImageDraft, name: els.name.value.trim(), category, stock: Number(els.stock.value),
    minStock: Number(els.minStock.value), price: Number(els.price.value), sku: els.sku.value.trim().toUpperCase(), expectedStock: editExpectedStock };
}

function resetForm() {
  els.productForm.reset();
  productImageDraft="";renderProductImage();
  els.productId.value = "";
  els.stock.value = 0;
  els.minStock.value = 2;
  els.price.value = 0;
  els.category.value = "";
  editExpectedStock = null;
  els.formTitle.textContent = "Nuevo producto";
  els.saveProduct.textContent = "Guardar producto";
  renderCategoryOptions();
}

async function saveProduct(event) {
  event.preventDefault();
  if (submitting) return;
  submitting = true;
  els.saveProduct.disabled = true;
  els.productForm.inert = true;
  try {
    const id = els.productId.value;
    const result = await api(id ? `/api/products/${encodeURIComponent(id)}` : "/api/products", id ? "PUT" : "POST", getFormData());
    closeWindows({saved:true});
    await refreshState(true).catch(() => {});
    state.search = result.product.sku;
    state.filter = "all";
    state.categoryFilter = "all";
    state.page = 1;
    els.search.value = state.search;
    els.categoryFilter.value = "all";
    renderTable();
    toast("Producto guardado. El cambio quedó registrado a tu nombre.");
  } catch (error) { toast(error.message, true); }
  finally { submitting = false; els.saveProduct.disabled = false; els.productForm.inert = false; }
}

function startEdit(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  renderCategoryOptions(product.category);
  productImageDraft=product.image||"";document.getElementById("productImageFile").value="";renderProductImage();
  editExpectedStock = product.stock;
  els.productId.value = product.id;
  els.name.value = product.name;
  els.category.value = product.category;
  els.stock.value = product.stock;
  els.minStock.value = product.minStock;
  els.price.value = product.price;
  els.sku.value = product.sku;
  els.formTitle.textContent = "Editar producto";
  els.saveProduct.textContent = "Actualizar producto";
  openWindow(els.productWindow);
  els.name.focus();
}

async function deleteProduct(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product || state.user?.role !== 'admin') return;
  productRemoval = {id, step:1, token:null};
  const request = productRemoval;
  const summary = document.getElementById('productDeleteSummary');
  const title = document.createElement('strong');title.textContent=product.name;
  const code = document.createElement('p');code.textContent=product.sku+' · '+product.category;
  const info = document.createElement('div');info.append(title,code);
  const photo=productPhoto(product);summary.replaceChildren(...(photo?[photo]:[]),info);
  document.getElementById('productDeleteCode').textContent='…';
  document.getElementById('productDeleteInput').value='';
  document.getElementById('productDeleteInput').disabled=false;
  document.getElementById('productDeleteFirst').classList.remove('hidden');
  document.getElementById('productDeleteSecond').classList.add('hidden');
  document.getElementById('productDeleteError').classList.add('hidden');
  const submit=document.getElementById('productDeleteSubmit');
  submit.textContent='Verificar código';submit.dataset.actionTone='info';submit.disabled=true;
  openWindow(productDeleteWindow);
  try {
    const result=await api(`/api/products/${encodeURIComponent(id)}/delete-challenge`,'POST',{});
    if(productRemoval!==request)return;
    request.token=result.token;document.getElementById('productDeleteCode').textContent=result.code;submit.disabled=false;
    if(!productDeleteWindow.classList.contains('hidden'))document.getElementById('productDeleteInput').focus();
  } catch(error) { if(productRemoval===request)showError(document.getElementById('productDeleteError'),error.message); }
}

async function applyMovement(event) {
  event.preventDefault();
  if (submitting) return;
  const productId = els.movementProduct.value;
  const quantity = Number(els.movementQty.value);
  const counting = !editingMovement && els.movementType.value === 'count';
  els.movementForm.querySelector('button[type=submit]').dataset.actionTone=els.movementType.value==='out'?'danger':'confirm';
  if (!productId || els.movementQty.value === '' || !Number.isFinite(quantity) || (counting ? quantity < 0 : quantity <= 0)) { showError(els.movementError, counting ? 'Selecciona un producto e ingresa el conteo, incluido cero si no hay unidades.' : "Selecciona un producto e ingresa una cantidad mayor que cero."); return; }
  submitting = true;
  const button = els.movementForm.querySelector('button[type="submit"]');
  button.disabled = true;
  els.movementForm.inert = true;
  els.movementError.classList.add("hidden");
  try {
    const type = els.movementType.value;
    const result = counting ? await saveDurableCount({productId, quantity, locationId:currentLocation() || undefined, month: document.getElementById('countMonth').value, expectedRevision: selectedCountRevision, reason: els.correctionReason.value.trim()}) : editingMovement
      ? await api(`/api/movements/${encodeURIComponent(editingMovement.id)}`, "PATCH", { quantity, type, reason: els.correctionReason.value.trim(), expectedRevision: editingMovement.revision || 0 })
      : await api("/api/movements", "POST", { productId, quantity, type });
    const wasCorrection = Boolean(editingMovement);
    if (isWorker()) {
      if (wasCorrection) { openMovement(); openWorkerTab('history'); }
      else resetWorkerEntry();
    } else closeWindows({saved:true});
    if (!result.pending) await refreshState(true).catch(() => {});
    toast(counting ? (result.pending ? `Guardado en este equipo: ${quantity} de ${result.product.name}. Pendiente de sincronizar.` : `Conteo mensual guardado: ${quantity} de ${result.product.name}.`) : `${wasCorrection ? "Corrección guardada" : "Movimiento registrado"}: ${type === "in" ? "+" : "−"}${quantity} de ${result.product.name}.${isWorker() ? '' : ` Stock: ${result.product.stock}.`}`);
  } catch (error) { showError(els.movementError, error.message); }
  finally { submitting = false; button.disabled = false; els.movementForm.inert = false; }
}

async function login(event) {
  event.preventDefault();
  const button = els.loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  els.loginError.classList.add("hidden");
  try {
    const result = await api("/api/login", "POST", { username: els.loginUser.value.trim(), password: els.loginPassword.value });
    state.user = result.user;
    state.version = -1;
    await refreshState(true);
    showApp();
    syncCounts().catch(error=>toast(error.message,true));
    els.loginPassword.value = "";
  } catch (error) { showError(els.loginError, error.message); }
  finally { button.disabled = false; }
}

function showApp() {
  els.loginScreen.classList.add("hidden");
  els.appShell.classList.remove("hidden");
  els.sessionWorkerName.textContent = state.user.name;
  const initials = state.user.name.split(/\s+/).slice(0,2).map((word) => word[0]).join("").toUpperCase();
  document.querySelectorAll("[data-worker-avatar]").forEach((el) => el.textContent = initials);
  els.openWorkers.classList.toggle("hidden", state.user.role !== "admin");
  els.openProductModal.classList.toggle("hidden", state.user.role !== "admin");
  document.getElementById("historyTitle").textContent = state.user.role === "admin" ? "Historial de cambios" : "Mis movimientos";
  const roleLabel = state.user.roleLabel || (state.user.role === "admin" ? "Administrador" : "Trabajador");
  els.sessionWorkerName.textContent = normalizeText(state.user.name) === normalizeText(roleLabel) ? state.user.name : `${state.user.name} · ${roleLabel}`;
  document.body.classList.toggle('worker-mode', isWorker());
  document.getElementById('workerShell').classList.toggle('hidden', !isWorker());
  if (isWorker()) {
    document.getElementById('workerRegister').append(els.movementWindow);
    els.movementWindow.classList.remove('floating-window', 'compact');
    els.movementWindow.classList.add('worker-entry');
    els.movementWindow.setAttribute('role', 'region');
    els.movementWindow.removeAttribute('aria-modal');
    document.getElementById('workerAccountName').textContent = state.user.name;
    document.getElementById('workerAccountUsername').textContent = '@' + state.user.username;
    openMovement();
    setMovementMode('manual');
  } else {
    movementHome.after(els.movementWindow);
    els.movementWindow.classList.remove('worker-entry');
    els.movementWindow.classList.add('floating-window', 'compact', 'hidden');
    els.movementWindow.setAttribute('role', 'dialog');
    els.movementWindow.setAttribute('aria-modal', 'true');
  }
  document.querySelectorAll('[data-current-worker]').forEach(el => el.textContent = state.user.name);
  render();
  applyAccountPermissions();
}

async function logout() {
  if (!InventoryFormGuard.request(() => logout(), {all:true})) return;
  await refreshPendingList();
  if (pendingEntries.length) { toast('Primero sincroniza o revisa los conteos pendientes de esta cuenta.',true); openWindow(document.getElementById('syncWindow')); return; }
  try { await api("/api/logout", "POST"); }
  catch (error) { toast(error.message, true); return; }
  await InventoryOffline.forget(); showLogin();
}


function normalizeText(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function manualProductMatches(query) {
  const term=normalizeText(query).trim();
  const priority=p=>normalizeText(p.sku)===term?100:normalizeText(p.sku).startsWith(term)?70:normalizeText(p.name).startsWith(term)?50:normalizeText(p.name).includes(term)?30:10;
  return state.products.filter(p=>matchesProduct(p,query)).sort((a,b)=>priority(b)-priority(a)||a.name.localeCompare(b.name,'es'));
}
function matchesProduct(product, query) {
  const haystack = normalizeText([product.name, product.sku, product.barcode, product.category, product.brand, product.location].join(" "));
  return normalizeText(query).split(/\s+/).filter(Boolean).every((part) => haystack.includes(part));
}
function signedQuantity(value) { return `${value > 0 ? "+" : ""}${Number(value) || 0}`; }
function limaDate(value) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function showError(element, message) { element.textContent = message; element.classList.remove("hidden"); }
let lastToastMessage='',lastToastTime=0;
function toast(message, error = false) {
  if(message===lastToastMessage && Date.now()-lastToastTime<12000)return;
  lastToastMessage=message;lastToastTime=Date.now();
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  els.toast.classList.toggle("toast-error", error);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), error ? 6500 : 2500);
}
let adminUndoNotice=null,adminUndoTimer=null;
function clearAdminUndo() {
  clearTimeout(adminUndoTimer);adminUndoNotice?.remove();adminUndoNotice=null;
}
function showAdminUndo(offer, owner) {
  clearAdminUndo();
  const duration=10000;
  const notice=document.createElement('aside');notice.id='adminUndoNotice';notice.className='admin-undo-notice';
  notice.setAttribute('aria-label','Deshacer último cambio');
  const message=document.createElement('div');message.setAttribute('role','status');
  const title=document.createElement('strong');title.textContent=offer.label||'Cambios guardados';
  const hint=document.createElement('small');hint.textContent='Puedes deshacer durante 10 segundos';message.append(title,hint);
  const button=document.createElement('button');button.type='button';button.className='admin-undo-button';button.textContent='↶ Deshacer';
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='admin-undo-dismiss';dismiss.textContent='×';dismiss.setAttribute('aria-label','Cerrar aviso');
  dismiss.onclick=()=>{if(adminUndoNotice===notice)clearAdminUndo();};
  notice.style.setProperty('--undo-duration',duration+'ms');
  notice.append(message,button,dismiss);document.body.append(notice);adminUndoNotice=notice;
  const expires=Date.now()+duration;
  adminUndoTimer=setTimeout(()=>{if(adminUndoNotice===notice)clearAdminUndo();},duration);
  button.onclick=async()=>{
    if(state.user!==owner||Date.now()>=expires){if(adminUndoNotice===notice)clearAdminUndo();return;}
    button.disabled=true;button.textContent='Deshaciendo…';clearTimeout(adminUndoTimer);
    try{
      await api('/api/admin/undo','POST',{token:offer.token});
      if(adminUndoNotice===notice)clearAdminUndo();
      if(state.user!==owner)return;
      toast('Cambio deshecho.');
      try{await refreshState(true);await window.InventoryRuns?.refreshAfterUndo?.();if(document.getElementById('reviewWindow')?.classList.contains('hidden')===false)await loadReview();}
      catch{toast('Cambio deshecho. Actualiza la vista para ver los datos.',true);}
    }catch(error){
      if(adminUndoNotice===notice)clearAdminUndo();
      toast(error.message,true);
    }
  };
}
async function api(path, method = "GET", body) {
  const done = method === 'GET' || path === '/api/inventories/pulse' ? () => {} : InventoryFormGuard.beginRequest();
  try { return await requestApi(path, method, body); }
  finally { done(); }
}
async function requestApi(path, method = "GET", body) {
  const requestUser=state.user;
  if (location.protocol === "file:") throw new Error("Abre el inventario compartido desde http://localhost:8081 o la dirección del servidor.");
  let response;
  try {
    const headers=body ? { "Content-Type": "application/json" } : {};
    if(requestUser?.role==='admin'&&method!=='GET')headers['X-Inventory-Undo']='1';
    response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  } catch { releaseOnline=false; renderReleaseStatus(); const error=new Error("No se pudo conectar con el servidor. Tus conteos locales permanecen en este equipo."); error.network=true; throw error; }
  if (!(response.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    if (response.status === 404 || response.status === 405 || response.ok) {
      const serverUrl = new URL(location.href);
      serverUrl.port = "8081";
      serverUrl.pathname = "/";
      serverUrl.search = "";
      serverUrl.hash = "";
      throw new Error(`Esta dirección no tiene conexión con el inventario. Abre ${serverUrl.origin} e inicia sesión allí. El servidor debe estar encendido.`);
    }
    throw new Error(`El servidor no pudo responder (HTTP ${response.status}). Intenta nuevamente.`);
  }
  let data;
  try { data = await response.json(); }
  catch (cause) {
    const error=new Error("El servidor envió una respuesta incompleta o inválida. Tus conteos locales se conservan; intenta nuevamente.");
    if(cause instanceof TypeError || cause.name==='AbortError' || cause.name==='TimeoutError'){
      error.network=true;releaseOnline=false;renderReleaseStatus();
    }
    throw error;
  }
  if (!response.ok) {
    if (response.status === 401 && state.user && state.user===requestUser) { InventoryOffline.clearSnapshot().catch(()=>{}); showLogin(); }
    const error = new Error(data.error || "No se pudo completar la operación.");
    error.status = response.status;
    throw error;
  }
  if(data._undo && requestUser?.role==='admin' && state.user===requestUser)showAdminUndo(data._undo,requestUser);
  return data;
}
async function refreshState(force = false) {
  if (refreshPending) { await refreshPending; if (!force) return; }
  refreshPending = (async () => {
    const userId = state.user?.id;
    const data = await api("/api/state");
    if (state.user?.id !== userId) return;
    releaseOnline=true; renderReleaseStatus();
    document.querySelector(".table-live").textContent = "● Inventario sincronizado";
    const nextMonth = data.currentMonth || limaDate(new Date()).slice(0, 7);
    const monthChanged = nextMonth !== state.currentMonth;
    if (data.version < state.version || (!force && data.version === state.version && !monthChanged)) return;
    state.products = data.products;
    state.restoreEpoch=data.restoreEpoch??null;state.periods = data.periods || [];state.workingMonth=data.workingMonth||'';
    state.closedComparisons = data.closedComparisons || {};
    frozenComparisons = new Map(Object.entries(state.closedComparisons).flatMap(([month,rows])=>rows.map(row=>[`${month}/${row.productId}`,row])));
    state.history = data.history;
    state.counts = data.counts || [];
    state.inventoryMonths=data.inventoryMonths||{};
    state.locationWork=data.locationWork||[];state.recounts=data.recounts||[];state.locations=data.locations||[];state.locationCounts=data.locationCounts||[];state.locationActivity=data.locationActivity||[];
    countsByKey = new Map(state.counts.map(count => [`${count.month}/${count.productId}`, count]));
    if (!state.month) {
      const availableMonths = [...new Set([...Object.keys(state.inventoryMonths), ...state.counts.map(count => count.month)])]
        .filter(month => month && month <= nextMonth).sort();
      state.month = availableMonths.includes(nextMonth) ? nextMonth : availableMonths.at(-1) || nextMonth;
    } else if (monthChanged && state.month === state.currentMonth) state.month = nextMonth;
    state.currentMonth = nextMonth;
    if(isWorker())state.month=state.workingMonth||nextMonth;
    state.version = data.version;
    await cacheInventory();
    if (!els.appShell.classList.contains("hidden")) render();
  })();
  try { await refreshPending; }
  catch (error) { document.querySelector(".table-live").textContent = "Sin conexión · Datos sin actualizar"; throw error; }
  finally { refreshPending = null; }
}
function showLogin() {
  InventoryFormGuard.reset();
  clearAdminUndo();
  backgroundReady=false; backgroundOwner=null;
  pendingEntries=[]; voiceToken=null; replacingPendingId=null;
  frozenComparisons.clear();
  stopLabelScan();
  state.user = null;
  state.products = [];
  state.history = [];
  state.workingMonth='';state.counts = []; state.locationCounts=[]; state.locationActivity=[]; locationOwner=''; activeLocation=''; choosingLocation=true; state.month = ''; countsByKey.clear();
  state.version = -1;
  closeWindows({force:true});
  setSidebar(false);
  els.appShell.classList.add("hidden");
  els.loginScreen.classList.remove("hidden");
  document.body.classList.remove('worker-mode');
  document.getElementById('workerShell').classList.add('hidden');
  els.loginPassword.value = "";
  els.loginPassword.focus();
}
function openMovement(id = "") {
  clearVoiceMaster();
  replacingPendingId=null;
  stopLabelScan();
  editingMovement = null;
  scanRequest = null;
  movementMode = "manual";
  els.movementForm.reset();
  document.getElementById('countMonth').value = state.month || state.currentMonth;
  selectedCountKey = ''; selectedCountRevision = null;
  els.scanLabel.disabled = false;
  els.scanStatus.textContent = "";
  els.movementModes.classList.remove("hidden");
  els.cameraPanel.classList.add("hidden");

  els.quickMode.setAttribute("aria-pressed", "false");
  els.correctionReasonLabel.classList.add("hidden");
  els.correctionReason.required = false;
  document.getElementById("movementTitle").textContent = "Registrar inventario";
  els.movementForm.querySelector('[type="submit"]').textContent = "Registrar movimiento";
  els.movementProduct.value = id;
  els.movementQty.value = "";
  els.movementError.classList.add("hidden");
  renderMovementOptions();
  syncCountForm();
  openWindow(els.movementWindow);
  if (!isWorker()) (id ? els.movementQty : els.movementSearch).focus();
  if (id) els.movementQty.select();
}
function showSelectedProduct(product) {
  els.movementSelected.replaceChildren();
  const title = document.createElement("strong"); title.textContent = product.name;
  const detail = document.createElement("span"); detail.textContent = (isWorker() ? `${product.sku} · Producto seleccionado` : `${product.sku} · Stock actual: ${product.stock}`) + (product.location ? ` · ${product.location}` : '');
  els.movementSelected.append(title, detail);
  const photo = productPhoto(product, 'product-photo product-photo-selected');
  els.movementSelected.classList.toggle('has-product-photo', Boolean(photo));
  if (photo) els.movementSelected.prepend(photo);
  els.movementSelected.classList.remove("hidden");
  els.changeMovementProduct.classList.toggle("hidden", Boolean(editingMovement));
  els.movementResults.classList.add("hidden");
  els.movementSearch.classList.add("hidden");
  syncCountForm();
}
function updateMovementPreview() {
  const product = state.products.find((p) => p.id === els.movementProduct.value);
  const quantity = Number(els.movementQty.value);
  if (!product) { els.movementPreview.textContent = "Primero elige el producto que vas a registrar."; return; }
  if (els.movementType.value === 'count' && !editingMovement) {
    const month = document.getElementById('countMonth').value;
    els.movementPreview.textContent = month && els.movementQty.value !== '' && Number.isFinite(quantity) && quantity >= 0 ? `${quantity} unidades en ${locationName(currentLocation())} · ${monthLabel(month)}. Registra el total de esta ubicación; una corrección reemplaza su conteo anterior.` : 'Elige el mes e ingresa la cantidad contada (puede ser cero).';
    return;
  }
  if (isWorker()) { els.movementPreview.textContent = Number.isFinite(quantity) && quantity > 0 ? `${els.movementType.value === 'in' ? 'Entrada' : 'Salida'} de ${quantity} unidades de ${product.name}. Revisa los datos antes de confirmar.` : 'Ingresa una cantidad mayor que cero.'; return; }
  const previousDifference = editingMovement ? (editingMovement.effectiveDifference ?? editingMovement.difference) : 0;
  const next = Math.round((product.stock - previousDifference + (els.movementType.value === "in" ? quantity : -quantity)) * 1e8) / 1e8;
  els.movementPreview.textContent = Number.isFinite(quantity) && quantity > 0 ? `Stock actual: ${product.stock} → Stock estimado: ${next}. Responsable: ${state.user?.name || ""}.` : "Ingresa una cantidad mayor que cero.";
}
function setSidebar(open) {
  els.sideRail.classList.toggle("is-open", open);
  els.sidebarOverlay.classList.toggle("hidden", !open);
  els.toggleSidebar.setAttribute("aria-expanded", String(open));
}

function openMovementCorrection(item) {
  openMovement(item.productId);
  editingMovement = { ...item };
  const difference = item.effectiveDifference ?? item.difference;
  els.movementType.value = difference > 0 ? "in" : "out";
  els.movementQty.value = Math.abs(difference);
  els.movementModes.classList.add("hidden");
  els.changeMovementProduct.classList.add("hidden");
  els.correctionReasonLabel.classList.remove("hidden");
  els.correctionReason.required = true;
  document.getElementById("movementTitle").textContent = "Corregir movimiento";
  els.movementForm.querySelector('[type="submit"]').textContent = "Guardar corrección";
  syncCountForm();
}

function cameraMatches(text) {
  return InventoryMatching.rank(state.products, text).map(match => match.product);
}

function setMovementMode(mode) {
  if (editingMovement) return;
  clearVoiceMaster();
  stopLabelScan();
  movementMode = mode;scanFrozenMatches=null;
  document.getElementById('voiceSearch').setAttribute('aria-pressed','false');
  document.getElementById('voiceStatus').textContent='';

  els.quickMode.setAttribute("aria-pressed", String(mode === "quick"));
  els.cameraPanel.classList.toggle("hidden", mode !== "quick");
  els.movementProduct.value = "";
  els.scanLabel.disabled = false;
  els.scanLabel.classList.toggle('hidden', !liveCameraAvailable());
  els.scanStatus.textContent = liveCameraAvailable() ? 'Activa la cámara y acerca el nombre o código impreso.' : androidVersion ? 'Esta versión no incluye lectura continua. Puedes buscar por nombre o código.' : 'La lectura de etiquetas está disponible en la app Android. Aquí puedes buscar por nombre o código.';
  renderMovementOptions();
}

els.movementSearch.addEventListener("focus", () => { if (movementMode !== "manual") setMovementMode("manual"); });
els.quickMode.addEventListener("click", () => { setMovementMode("quick"); if (liveCameraAvailable()) startLabelScan(); });
els.recognizedText.addEventListener("input", () => { scanFrozenMatches=null;els.movementProduct.value = ""; renderMovementOptions(); });
els.scanLabel.addEventListener("click", startLabelScan);
function startLabelScan() {
  if (!state.user || editingMovement) return;
  if (scanRequest) { stopLabelScan(); els.scanStatus.textContent = 'Cámara pausada. Puedes seguir con el producto elegido.'; return; }
  if (!liveCameraAvailable()) return;
  scanFrozenMatches=null;scanCandidate=null;scanCandidateReads=0;scanCandidateTime=0;
  els.movementProduct.value="";els.recognizedText.value="";
  scanRequest = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  els.scanLabel.textContent = 'Pausar cámara';
  els.scanStatus.textContent = "Iniciando cámara…";
  location.href = `inventory://scan?request=${encodeURIComponent(scanRequest)}`;
}
window.inventoryScanResult = (result) => {
  if (!state.user || result.request !== scanRequest || els.movementWindow.classList.contains("hidden")) return;
  if (result.error) { stopLabelScan(); els.scanStatus.textContent = result.error; return; }
  if (result.ready) { document.body.classList.add('camera-active'); els.scanStatus.textContent = 'Cámara activa · Enfoca una etiqueta. La lectura es automática.'; return; }
  if (els.movementProduct.value || document.activeElement === els.recognizedText) return;
  els.recognizedText.value = String(result.text || "").slice(0, 4000);
  els.movementProduct.value = "";
  const associations=InventoryMatching.rank(state.products,els.recognizedText.value);
  const candidate=InventoryMatching.confident(associations);
  const now=Date.now();
  scanCandidateReads=candidate && candidate.id===scanCandidate && now-scanCandidateTime<3500 ? scanCandidateReads+1 : candidate?1:0;
  scanCandidate=candidate?.id||null;scanCandidateTime=now;
  if(candidate && scanCandidateReads>=3 && autoCloseCamera()){
    const generic=new Set(['unidad','unidades','producto','productos','caja','bolsa','botella','pack','marca']);
    const terms=(normalizeText(candidate.name).match(/[a-z]{4,}/g)||[]).filter(t=>!generic.has(t));
    const related=m=>m.product.id===candidate.id||terms.some(t=>(normalizeText(m.product.name).match(/[a-z]{4,}/g)||[]).includes(t));
    const combined=[...associations,...InventoryMatching.rank(state.products.filter(product=>related({product})),candidate.name).map(m=>({...m,label:'Nombre relacionado'}))].filter(related);
    const seen=new Set();scanFrozenMatches=combined.filter(m=>{if(seen.has(m.product.id))return false;seen.add(m.product.id);return true;}).slice(0,3);
    stopLabelScan();renderMovementOptions();
    els.scanStatus.textContent='Coincidencia estable: '+candidate.name+'. Elige la principal o revisa las alternativas.';
    els.movementResults.scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }
  if(androidVersion>=9){
    const top=associations[0];
    const name=top ? top.product.name : 'Sin asociación clara';
    const detail=top ? top.product.sku+' · '+(candidate?(autoCloseCamera()?'Confirmando '+scanCandidateReads+'/3':'Asociación activa · Cierre manual'):'Posible coincidencia · Sigue enfocando') : 'Enfoca el nombre o código de un solo producto.';
    location.href='inventory://scan-feedback?request='+encodeURIComponent(scanRequest)+'&name='+encodeURIComponent(name)+'&detail='+encodeURIComponent(detail);
  }
  renderMovementOptions();
  els.scanStatus.textContent = els.recognizedText.value.trim() ? "Etiqueta leída · Elige una coincidencia para continuar." : "Enfoca el nombre o código con buena luz.";
};
function stopLabelScan() {
  document.body.classList.remove('camera-active');
  if (scanRequest && liveCameraAvailable()) location.href = `inventory://stop?request=${encodeURIComponent(scanRequest)}`;
  scanRequest = null;
  els.scanLabel.disabled = false;
  els.scanLabel.textContent = 'Activar cámara';
}

function openWorkerTab(tab) {
  if (!isWorker()) return;
  if (tab !== 'register') window.InventoryRuns?.close();
  if (tab !== 'register') stopLabelScan();
  workerTab = tab;
  for (const [name, id] of Object.entries({ register: 'workerRegister', history: 'workerHistory', account: 'workerAccount' })) {
    document.getElementById(id).classList.toggle('hidden', name !== tab);
  }
  document.querySelectorAll('[data-worker-tab]').forEach(button => {
    if (button.dataset.workerTab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (tab === 'history') renderWorkerHistory();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function resetWorkerEntry() {
  clearVoiceMaster();
  els.movementProduct.value = '';
  els.movementSearch.value = '';
  els.recognizedText.value = '';
  els.movementQty.value = '';
  selectedCountKey = ''; selectedCountRevision = null;
  els.movementError.classList.add('hidden');
  renderMovementOptions();
  syncCountForm();
  if (scanRequest) els.scanStatus.textContent = 'Registrado · Enfoca la siguiente etiqueta.';
  document.activeElement?.blur();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderWorkerHistory() {
  if (!isWorker()) return;
  const query = normalizeText(document.getElementById('workerHistorySearch').value).split(/\s+/).filter(Boolean);
  const from = document.getElementById('workerHistoryFrom').value;
  const to = document.getElementById('workerHistoryTo').value;
  const records = state.history.filter(item => {
    const text = normalizeText(`${item.name} ${item.sku} ${item.reason || ''}`);
    const date = limaDate(item.date);
    const effectiveType = item.month ? 'Conteo' : item.type === 'Corrección' ? 'Corrección' : (item.effectiveDifference ?? item.difference) > 0 ? 'Entrada' : 'Salida';
    return (item.workerId === state.user.id || item.ownerWorkerId === state.user.id) &&
      ['Entrada', 'Salida', 'Corrección', 'Conteo mensual', 'Corrección de conteo', 'Entrega de inventario'].includes(item.type) &&
      (workerHistoryFilter === 'all' || effectiveType === workerHistoryFilter) &&
      (!from || date >= from) && (!to || date <= to) && query.every(word => text.includes(word));
  });
  const container = document.getElementById('workerMovementCards');
  container.replaceChildren();
  const make = (tag, className, text) => { const el = document.createElement(tag); el.className = className; el.textContent = text; return el; };
  document.getElementById('workerHistoryCount').textContent = `${records.length} ${records.length === 1 ? 'registro' : 'registros'} · Hora de Lima`;
  if (!records.length) {
    const empty = make('div', 'worker-empty', '');
    empty.append(make('span', 'worker-empty-icon', '↕'), make('h2', '', from && to && from > to ? 'Revisa las fechas' : 'Sin movimientos aquí'), make('p', '', from && to && from > to ? 'La fecha Desde debe ser anterior a Hasta.' : 'Tus registros aparecerán aquí. Si usaste filtros, prueba cambiarlos.'));
    container.append(empty);
  }
  records.slice(0, workerHistoryLimit).forEach(item => {
    const correction = item.type === 'Corrección';
    const difference = item.effectiveDifference ?? item.difference;
    const type = item.runId ? item.retirementRequested ? 'Retiro solicitado' : 'Conteo recibido' : item.month ? item.type : correction ? 'Corrección' : difference > 0 ? 'Entrada' : 'Salida';
    const card = make('article', 'worker-movement-card', '');
    const top = make('div', 'worker-card-top', '');
    top.append(make('span', `worker-type ${correction ? 'correction' : (item.runId ? !item.retirementRequested : difference > 0) ? 'entry' : 'exit'}`, type), make('time', '', formatDateTime(item.date)));
    const main = make('div', 'worker-card-main', '');
    const product = make('div', '', ''); product.append(make('h2', '', item.name), make('p', '', item.sku));
    const amount = make('div', 'worker-card-amount', ''); amount.append(make('strong', '', item.month ? item.countQuantity ?? '—' : signedQuantity(difference)), make('span', '', correction ? 'ajuste' : 'unidades'));
    main.append(product, amount); card.append(top, main);
    if (item.month) card.append(make('p', 'worker-correction-note', `${monthLabel(item.month)} · ${item.locationLabel||'Conteo general'}${item.countReason ? ' · ' + item.countReason : ''}`));
    if (correction) card.append(make('p', 'worker-correction-note', `${signedQuantity(item.oldDifference)} → ${signedQuantity(item.newDifference)} · ${item.reason}. Corregido por ${item.workerName}.`));
    else if (item.revision) card.append(make('p', 'worker-correction-note', `Corregido · Original: ${signedQuantity(item.difference)} unidades. ${formatDateTime(item.updatedAt)}.`));
    if (!item.runId && item.month && item.month===state.workingMonth && periodFor(item.month).status==='open' && !correction && item.workerId === state.user.id && state.products.some(p => p.id === item.productId)) {
      const edit = make('button', 'worker-edit-button', item.month ? 'Revisar conteo del mes' : 'Editar movimiento'); edit.type = 'button';
      edit.addEventListener('click', () => {
        if (item.month) { selectCountLocation(item.locationId||''); openMovement(item.productId); document.getElementById('countMonth').value = item.month; selectedCountKey = ''; syncCountForm(); }
        else openMovementCorrection(item);
      }); card.append(edit);
    }
    container.append(card);
  });
  document.getElementById('workerLoadMore').classList.toggle('hidden', records.length <= workerHistoryLimit);
}

document.querySelectorAll('[data-worker-tab]').forEach(button => button.addEventListener('click', () => openWorkerTab(button.dataset.workerTab)));
document.getElementById('workerProfile').addEventListener('click', () => openWorkerTab('account'));
document.getElementById('workerLogoutButton').addEventListener('click', logout);
document.getElementById('workerPasswordButton').addEventListener('click', () => { els.passwordForm.reset(); els.passwordError.classList.add('hidden'); openWindow(els.passwordWindow); });
document.querySelectorAll('[data-worker-filter]').forEach(button => button.addEventListener('click', () => {
  workerHistoryFilter = button.dataset.workerFilter; workerHistoryLimit = 20;
  document.querySelectorAll('[data-worker-filter]').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
  renderWorkerHistory();
}));
['workerHistorySearch', 'workerHistoryFrom', 'workerHistoryTo'].forEach(id => document.getElementById(id).addEventListener('input', () => { workerHistoryLimit = 20; renderWorkerHistory(); }));
document.getElementById('workerLoadMore').addEventListener('click', () => { workerHistoryLimit += 20; renderWorkerHistory(); });
els.cancelMovement.addEventListener('click', () => { if (isWorker()) { const correction = Boolean(editingMovement); if (correction) { openMovement(); openWorkerTab('history'); } else resetWorkerEntry(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopLabelScan(); });
function resetFilters(filter = "all") {
  state.search = ""; state.categoryFilter = "all"; state.filter = filter; state.page = 1;
  els.search.value = ""; els.categoryFilter.value = "all"; renderTable();
}
const accountCan = permission => state.user?.accessRole === 'administrator' || (!state.user?.accessRole && state.user?.role === 'admin') || (state.user?.permissions || []).includes(permission);
window.accountCan = accountCan;
function applyAccountPermissions() {
  let style=document.getElementById('accountAccessStyles');
  if(!style){style=document.createElement('style');style.id='accountAccessStyles';document.head.append(style);}
  if(!state.user || isWorker()){style.textContent='';return;}
  const restricted={
    catalog:'#openProductManager,#openProductModal,[data-edit],[data-delete]',
    management:'#openRunsAdmin,#openAssignmentsAdmin,#openReview,#enableWorkingMonth,#pauseWorkingMonth,#openMovementModal,#runsPeoplePanel',
    structure:'#openWarehouseEditor',
    movements:'#openMovementFromNav',
    reports:'.side-nav a[href="#analyticsPanel"],#analyticsPanel,#downloadMonthlyReport',
    history:'#openHistoryFromNav,#openHistoryFromPanel,#openHistoryModal'
  };
  const hidden=Object.entries(restricted).filter(([permission])=>!accountCan(permission)).map(([,selectors])=>selectors);
  if(state.user.accessRole && state.user.accessRole!=='administrator')hidden.push('#openWorkers,#backupsPanel,.side-nav [data-desktop-page="connections"],.side-nav [data-desktop-page="verification"],.side-nav [data-desktop-page="updates"]');
  style.textContent=hidden.length?hidden.join(',')+'{display:none!important}':'';
}
let teamRoles=null;
function permissionFields(role, values, prefix) {
  const box=document.createElement('fieldset');box.className='team-permissions';
  const legend=document.createElement('legend');legend.textContent='Permisos de la cuenta';box.append(legend);
  const note=document.createElement('p');note.textContent=role==='worker'?'Accede al conteo y a sus espacios asignados, con las restricciones de trabajador.':'Puede consultar el inventario. Habilita las acciones adicionales que podrá utilizar.';box.append(note);
  if(role==='worker')return box;
  for(const [key,label] of Object.entries(teamRoles.permissionLabels)){
    const item=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=key;input.name=prefix+'Permission';input.checked=role==='administrator'||values.includes(key);input.disabled=role==='administrator';item.append(input,document.createTextNode(label));box.append(item);
  }
  if(role==='administrator'){const p=document.createElement('p');p.textContent='Acceso completo, incluida la administración de personal, conexiones y copias de seguridad.';box.append(p);}
  return box;
}
function accessEditor(role, values, prefix){
  const box=document.createElement('div');box.className='team-access-editor';
  const label=document.createElement('label');label.textContent='Rol';
  const select=document.createElement('select');select.name=prefix+'Role';select.setAttribute('aria-label','Rol de la cuenta');
  for(const [key,name] of Object.entries(teamRoles.roles)){const option=document.createElement('option');option.value=key;option.textContent=name;select.append(option);}select.value=role;
  label.append(select);box.append(label,permissionFields(role,values,prefix));
  select.onchange=()=>box.querySelector('fieldset').replaceWith(permissionFields(select.value,teamRoles.roleDefaults[select.value],prefix));
  return box;
}
function accessValue(box){return {accessRole:box.querySelector('select').value,permissions:[...box.querySelectorAll('input:checked')].map(input=>input.value)};}
function openPersonnelPage(){
  if(!accountCan('personnel'))return;
  if(!InventoryFormGuard.request(()=>openPersonnelPage(),{all:true}))return;
  closeWindows({force:true});
  document.querySelector('.main-column').append(els.workersWindow);
  els.workersWindow.classList.remove('floating-window','hidden');els.workersWindow.classList.add('personnel-page');
  els.workersWindow.setAttribute('role','region');els.workersWindow.removeAttribute('aria-modal');
  document.body.classList.add('personnel-open');
  document.querySelector('.breadcrumb strong').textContent='Personal';setSidebar(false);InventoryFormGuard.forget(els.workersWindow);
}
window.addEventListener('load',()=>{
  document.querySelector('.side-nav').addEventListener('click',event=>{
    if(event.target.closest('#openWorkers')||!event.target.closest('a,button')||!document.body.classList.contains('personnel-open'))return;
    if(!InventoryFormGuard.request(()=>event.target.closest('a,button')?.click(),{all:true})){event.preventDefault();event.stopImmediatePropagation();return;}
    document.body.classList.remove('personnel-open');els.workersWindow.classList.add('hidden');
  },true);
});
async function renderWorkers() {
  const result = await api("/api/workers"), {workers} = result;teamRoles=result;
  if(!document.getElementById('newAccountAccess')){const editor=accessEditor('worker',[],'new');editor.id='newAccountAccess';els.workerForm.querySelector('.window-actions').before(editor);InventoryFormGuard.begin(els.workerForm);}

  els.workersList.querySelectorAll('.team-access-editor').forEach(editor=>InventoryFormGuard.forget(editor));
  els.workersList.replaceChildren();
  document.getElementById('teamCount').textContent=workers.length+' integrantes';
  workers.forEach((worker) => {
    const row = document.createElement("article"); row.className = "worker-item";
    const avatar=document.createElement('span');avatar.className='team-avatar';avatar.textContent=worker.name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toLocaleUpperCase();avatar.setAttribute('aria-hidden','true');
    const identity=document.createElement('div');identity.className='team-identity';
    const name=document.createElement('strong');name.textContent=worker.name;
    const username=document.createElement('small');username.textContent='@'+worker.username+' - '+(worker.roleLabel||(worker.role==='admin'?'Administrador':'Trabajador'));
    const status=document.createElement('span');status.className='team-status '+(worker.active?'is-active':'is-inactive');status.textContent=worker.active?'Activo':'Inactivo';
    identity.append(name,username);row.append(avatar,identity,status);
    if (worker.id !== state.user.id) {
      const edit=document.createElement('button');edit.type='button';edit.className='ghost-button';edit.textContent='Editar rol y permisos';
      edit.onclick=()=>{
        if(row.querySelector('.team-access-editor'))return;
        const editor=accessEditor(worker.accessRole,worker.permissions,'edit');
        const save=document.createElement('button');save.type='button';save.className='primary-button';save.textContent='Guardar permisos';
        const cancel=document.createElement('button');cancel.type='button';cancel.className='ghost-button';cancel.textContent='Cancelar';
        const error=document.createElement('p');error.setAttribute('role','alert');
        cancel.onclick=()=>{InventoryFormGuard.forget(editor);editor.remove();};
        save.onclick=async()=>{save.disabled=true;try{await api('/api/workers/'+encodeURIComponent(worker.id),'PATCH',accessValue(editor));await renderWorkers();toast('Permisos guardados. La cuenta deberá iniciar sesión de nuevo.');}catch(e){error.textContent=e.message;save.disabled=false;}};
        editor.append(save,cancel,error);row.append(editor);InventoryFormGuard.begin(editor,{discard:()=>{InventoryFormGuard.forget(editor);editor.remove();}});
      };row.append(edit);
    }
    if (worker.accessRole !== "administrator" && worker.id !== state.user.id) {
      const button = document.createElement("button"); button.type = "button"; button.className = "text-button";
      button.textContent = worker.active ? "Desactivar" : "Activar";
      button.dataset.actionTone=worker.active?'warning':'confirm';
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await api(`/api/workers/${encodeURIComponent(worker.id)}`, "PATCH", { active: !worker.active }); await renderWorkers(); }
        catch (error) { showError(els.workerError, error.message); button.disabled = false; }
      }); row.append(button);
      const remove=document.createElement('button');remove.type='button';remove.className='text-button worker-delete';remove.textContent='Eliminar';
      remove.onclick=()=>{
        remove.disabled=true;
        const confirmation=document.createElement('div');confirmation.className='worker-delete-confirm';
        const message=document.createElement('p');message.textContent=`¿Eliminar a ${worker.name}? Perderá el acceso. Sus conteos e historial se conservarán.`;
        const confirm=document.createElement('button');confirm.type='button';confirm.className='primary-button';confirm.dataset.actionTone='danger';confirm.textContent='Confirmar eliminación';
        const cancel=document.createElement('button');cancel.type='button';cancel.className='text-button';cancel.dataset.actionTone='neutral';cancel.textContent='Cancelar';
        cancel.onclick=()=>{confirmation.remove();remove.disabled=false;};
        confirm.onclick=async()=>{confirm.disabled=true;cancel.disabled=true;try{await api(`/api/workers/${encodeURIComponent(worker.id)}`,'DELETE');await renderWorkers();toast('Trabajador eliminado. Sus registros se conservaron.');}catch(error){showError(els.workerError,error.message);confirm.disabled=false;cancel.disabled=false;}};
        confirmation.append(message,confirm,cancel);row.append(confirmation);
      };row.append(remove);
    }
    const actions=document.createElement('div');actions.className='team-account-actions';
    actions.append(...row.querySelectorAll(':scope>button'));if(actions.childElementCount)row.append(actions);
    els.workersList.append(row);
  });
}

els.loginForm.addEventListener("submit", login);
els.logoutButton.addEventListener("click", logout);
els.openProductModal.addEventListener("click", openProductForm);
els.openMovementModal.addEventListener("click", () => openMovement());
els.openMovementFromNav.addEventListener("click", (e) => { e.preventDefault(); openMovement(); });
[els.openHistoryModal, els.openHistoryFromPanel, els.openHistoryFromNav].forEach((button) => button.addEventListener("click", (e) => { e.preventDefault(); window.InventoryHistory?.open(); }));
[els.closeProductModal, els.closeMovementModal, els.closeHistoryModal, els.closeProductDetail, els.closeWorkers, els.closePassword, els.cancelEdit, els.cancelMovement, els.modalBackdrop].forEach((button) => button.addEventListener("click", closeWindows));
els.productForm.addEventListener("submit", saveProduct);
els.movementForm.addEventListener("submit", applyMovement);
els.movementSearch.addEventListener("input", () => { clearVoiceMaster(); els.movementProduct.value=""; renderMovementOptions(); });
els.movementSearch.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const term = normalizeText(els.movementSearch.value);
  if (!term) return;
  const exact = state.products.filter((p) => [p.sku, p.barcode].some((v) => v && normalizeText(v) === term));
  const matches = exact.length ? exact : state.products.filter((p) => matchesProduct(p, term));
  if (matches.length === 1) { els.movementProduct.value = matches[0].id; showSelectedProduct(matches[0]); els.movementQty.focus(); els.movementQty.select(); }
});
els.changeMovementProduct.addEventListener("click", () => { clearVoiceMaster(); els.movementProduct.value = ""; els.movementSearch.value = ""; renderMovementOptions(); els.movementSearch.focus(); });
els.movementQty.addEventListener("input", updateMovementPreview);
els.movementType.addEventListener("change", syncCountForm);
els.filters.forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; state.page = 1; renderTable(); }));
els.categoryFilter.addEventListener("change", () => { state.categoryFilter = els.categoryFilter.value; state.page = 1; renderTable(); });
els.previousPage.addEventListener("click", () => { state.page--; renderTable(); });
els.nextPage.addEventListener("click", () => { state.page++; renderTable(); });
els.clearFilters.addEventListener("click", () => resetFilters());
[els.showPending, els.showPendingFromSidebar].forEach((button) => button.addEventListener("click", () => {
  setSidebar(false); requestAnimationFrame(()=>document.querySelector('.monthly-panel').scrollIntoView({block:'start'}));
}));
els.togglePassword.addEventListener("click", () => {
  const visible = els.loginPassword.type === "password";
  els.loginPassword.type = visible ? "text" : "password";
  els.togglePassword.setAttribute("aria-pressed", String(visible));
  els.togglePassword.setAttribute("aria-label", visible ? "Ocultar contraseña" : "Mostrar contraseña");
});
els.toggleSidebar.addEventListener("click", () => setSidebar(!els.sideRail.classList.contains("is-open")));
els.closeSidebar.addEventListener("click", () => setSidebar(false));
els.sidebarOverlay.addEventListener("click", () => setSidebar(false));
els.sideRail.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setSidebar(false)));
els.openWorkers.addEventListener("click", async () => {
  els.workerError.classList.add("hidden"); openPersonnelPage();
  try { await renderWorkers(); } catch (error) { showError(els.workerError, error.message); }
});
els.workerForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const button = els.workerForm.querySelector('button[type="submit"]'); button.disabled = true;
  els.workerForm.inert = true;
  els.workerError.classList.add("hidden");
  try {
    await api("/api/workers", "POST", { name: els.workerName.value.trim(), username: els.workerUsername.value.trim(), password: els.workerPassword.value, ...accessValue(document.getElementById("newAccountAccess")) });
    els.workerForm.reset(); document.getElementById("newAccountAccess")?.remove(); await renderWorkers(); InventoryFormGuard.clean(els.workerForm); toast("Cuenta creada. El trabajador ya puede iniciar sesión desde otro equipo.");
  } catch (error) { showError(els.workerError, error.message); }
  finally { button.disabled = false; els.workerForm.inert = false; }
});
els.openPassword.addEventListener("click", () => { els.passwordForm.reset(); els.passwordError.classList.add("hidden"); openWindow(els.passwordWindow); });
els.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const button = els.passwordForm.querySelector('button[type="submit"]'); button.disabled = true;
  els.passwordForm.inert = true;
  try { await api("/api/password", "POST", { currentPassword: els.currentPassword.value, newPassword: els.newPassword.value }); closeWindows({saved:true}); toast("Contraseña actualizada."); }
  catch (error) { showError(els.passwordError, error.message); }
  finally { button.disabled = false; els.passwordForm.inert = false; }
});
// Android Back must follow the same dialogs and guards as the visible controls.
window.inventoryHandleBack = () => {
  const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (dialog) {
    if (dialog.dispatchEvent(new Event('cancel', {cancelable:true}))) dialog.close();
    return true;
  }
  if (window.InventoryRuns?.handleBack?.()) return true;
  if (submitting) return true;
  const modal = document.querySelector('.floating-window:not(.hidden)');
  if (modal) {
    const close = modal.querySelector('.window-titlebar button');
    if (close) close.click(); else closeWindows();
    return true;
  }
  if (els.sideRail.classList.contains('is-open')) { setSidebar(false);return true; }
  if (window.InventoryRuns?.back?.()) return true;
  if (isWorker() && workerTab !== 'register') {
    document.querySelector('[data-worker-tab="register"]').click();return true;
  }
  return false;
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !submitting) { event.preventDefault();closeWindows();setSidebar(false); }
  if (event.key === "/" && state.user && els.modalBackdrop.classList.contains("hidden") && !event.target.matches("input,select,textarea,[contenteditable]")) { event.preventDefault(); els.search.focus(); }
  if (event.key === "Tab" && !els.modalBackdrop.classList.contains("hidden")) {
    const dialog = document.querySelector(".floating-window:not(.hidden)");
    const focusable = [...dialog.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter((el) => !el.disabled && el.offsetParent !== null && el.type !== "hidden");
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
els.todayDate.textContent = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day:"numeric", month:"long", year:"numeric" }).format(new Date());
window.addEventListener("resize", () => { if (state.user?.role === 'admin' && !els.appShell.classList.contains("hidden")) renderCharts(); });
setInterval(() => { if (state.user && !document.hidden && !submitting) refreshState().catch(() => {}); }, 5000);
window.addEventListener("focus", () => { if (state.user) refreshState().catch(() => {}); });
bootInventory();

let productImageDraft='';
InventoryFormGuard.value(els.productForm, 'image', () => productImageDraft);
function renderProductImage(){const box=document.getElementById('productImagePreview');box.replaceChildren();const image=productPhoto({image:productImageDraft,name:'Vista previa'});if(image)box.append(image);else box.textContent='Sin imagen';document.getElementById('productImageRemove').disabled=!productImageDraft;}
document.getElementById('productImageRemove').onclick=()=>{productImageDraft='';document.getElementById('productImageFile').value='';renderProductImage();};
document.getElementById('productImageFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;const done=InventoryFormGuard.beginWork();els.saveProduct.disabled=true;
 try{if(file.size>10000000)throw new Error('Usa una imagen de hasta 10 MB.');const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const image=canvas.toDataURL('image/jpeg',0.75);if(image.length>350000)throw new Error('La imagen es demasiado detallada. Usa una más pequeña.');productImageDraft=image;renderProductImage();}catch(error){toast(error.message||'No se pudo abrir la imagen.',true);}finally{els.saveProduct.disabled=false;done();}
};
// Catalogue convention: the brand precedes the final selling unit. Match full
// known suffixes, longest first, so compound brands and sizes stay distinct.
function createManagerBrandResolver(products){
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const empty=value=>!value||['SIN MARCA','S/M','SIN ESPECIFICAR'].includes(value);
  const catalogueBrands=`MR CLEANER|MR BRILLO|MR WHITE|MR MUSCULO|MR. WAX|FLORE CAR|MASTER CAR|3 EN 1|SCOTCH BRITE|DOÑA MARY|GOLDEN STAR|AMERICAN VULCANO|LIMPIA MAX|STRONGER PLUS|FRISS LINE|KIMBERLY CLARK|EDITH PLAST|ARTE PAINT|TOTAL FRESH|FAMILY GUARD|FAMILY DOCTOR|KNOCK DOWN|OCEAN BLUE|MASTER CLEAN|DR. BECKMANN|MASTER PLUS|ROYAL PLUS-32|SEG PRO|ANA PLUS|FAMILIA INSTITUCIONAL|WESTERN CLEAN|FABER CASTELL|GASKET SEAL|MEGA GREY|JIRPRIX|KAZ|YETICAR|NACIONAL|PREMIO|DARYZA|MARTELL|CLEER|SAPOLIO|PANTENE|PATO|TEKBOND|LOCTITE|TRUPER|AMBROSOL|VISTONY|WD-40|WURTH|ALKOFARMA|MILSA|ABRO|CRC|LIMPITO|FIORUCCI|MAFA|AVAL|EBRIEL|SOLARIS|BRISOL|EDISEL|SCOTT|GLADE|PROSERLIM|POETT|SPARTAN|REY|TRAC|DAYR|HUDE|FABARLI|PROLIMSO|ARDILLA|FINEX|ANYPSA|TEKNO|DURACELL|TOSHIBA|PILOT|TRILUX|IMPORTADO|MEBA|DOC|ARTESCO|TOLBRIN|AGUILA|C&A|LION|TUMI|KAYSER|RUBBERMAID|FBK|JOGRANSA|VIBALCA|SIMONIZ|KLARA|PRINCIPE|3M|SHURTAPE|PROMASTER|MASTER|LAVA|R&G|DESF-FOG|GARRETT|PATITO|PQP|MARSELLA|BRAVO|DOFFI|TROME|DEWALT|DWALD|BOSCH|GONTI|NORTON|KAMASA|PRETUL|ELITE|EXORIAM|FRATELLI|YOFUPSA|LEVITON|LORITO|MAYA|MDTECH|EUROTOOLS|MERLEX|VIRUTEX|LIAO|LIVAL|GE&MOR|DKASA|SONAX|SOUDAL|SHARK|PERMATEX|TORITO|NIVEA|TECSEG|ETERNA|GLOVES|LEON|INDULATEX|PROTEX|TITOS|LATEXPORT|DKPRO|NITRIMAX|CLUTE|ZEUS|GOICOCHEA|SANDFLEX|CHAMEX|FUMITRIN|QKGEL|QK|DICLOTRIN|SUPERFLY|NEKO|ARO|BOLIVAR|KLEENEX|ORION|TOPBEL|BIOCLEAN|GALU|AYUDIN|CLOROX|ABRALIT|FANDELI|PORFIN|CIF|BINNER|SCOTCHGARD|KNAUFF|KNAUF|HARPIC|CHEMA|STRONGER|PLEDGE|SOLDIMIX|PLOP|BAYGON|RAID|MEDELLIN|FREGONA|KENNY|HUGGIES|PARACAS|BALANZE|SANIT|LIZ|SUAVE|PETALO|DICALI|COPITO|NOVA|SUPER|GALIA|SUPREMO|ARIES|SFOLL|SUMAC|KARINA|AFRICANO|LYNO|PANASONIC|PINESOL|FERREQUIM|FUMIRAT|CAMPEON|CASTOR|NAZCA|UNGER|TARWEX|ATLAS|PINTOR|TORO|INDECO|HYS|SAVITAL|SIKA|GALEAZZI|HARDMAN|PEGATANKE|DOWNY|CHEMMER|SAMSON|VISION|BASA|POLINPLAST|ZION|ECOBASA|ISSA|EPSON|SEGPRO|ANYBOND|FUMITRAP|FERREQUIN`;
  const names=new Map();
  for(const value of [...catalogueBrands.split('|'),...products.map(p=>p.brand)]){const key=normalize(value);if(!empty(key))names.set(key,String(value).trim().toUpperCase());}
  const suffixes=[...names.keys()].sort((a,b)=>b.length-a.length);
  const unit=/\s+(?:UND\.?|UNID\.?|UNIDAD(?:ES)?|GLN\.?|GALON(?:ES)?|CAJAS?|CJA\.?|CJ\.?|PAQUETES?|PQT\.?|PQTE\.?|BOLSAS?|ROLLOS?|DOCENAS?|DOC\.?|PARES?|KG|GR|G|LT|LTS|LITROS?|ML|MT|MTS|METROS?)$/;
  return product=>{
    const name=normalize(product.name), stem=name.replace(unit,'');
    if(stem!==name){
      const match=suffixes.find(brand=>stem.endsWith(' '+brand));
      if(match)return names.get(match);
    }
    const explicit=normalize(product.brand);
    return empty(explicit)?'SIN MARCA':names.get(explicit)||explicit;
  };
}
const productManager=document.createElement('section');productManager.id='productManager';productManager.className='runs-page hidden';
productManager.innerHTML=`<div class="window-titlebar"><h1>Listado de Productos</h1><div class="manager-heading-actions"><button id="managerNew" class="primary-button" type="button">+ Nuevo</button><button id="managerFind" class="primary-button" type="button">⌕ Buscar</button><button id="managerBack" class="ghost-button prominent-back" type="button">← Volver</button></div></div>
  <div class="manager-toolbar">
    <label>Categoría<select id="managerCategory"><option value="">Todas las categorías</option></select></label>
    <label>Marca<select id="managerBrand"><option value="">Todas</option></select></label>
    <label>Existencias<select id="managerStock"><option value="">Todos</option><option value="available">Con existencias</option><option value="empty">Sin existencias</option></select></label>
    <label>Buscar producto<input id="managerSearch" type="search" placeholder="Nombre o código" /></label>
  </div>
  <div class="manager-results-heading"><p id="managerCount" role="status"></p><button id="managerClear" class="text-button hidden" type="button" data-action-tone="neutral">Limpiar filtros</button></div>
  <div id="managerRows" class="manager-grid"></div>
  <p id="managerEmpty" class="manager-empty hidden">No hay productos con estos filtros. Prueba otra categoría o cambia la búsqueda.</p>
  <nav class="manager-pagination" aria-label="Páginas de productos"><span id="managerRange"></span><div id="managerPages"></div><button id="managerPrev" class="ghost-button" type="button">Anterior</button><button id="managerNext" class="ghost-button" type="button">Siguiente →</button></nav>`;
document.getElementById('appShell').append(productManager);let managerPage=0;
function renderProductManager(){return preserveProductPhotos(document.body,renderProductManagerContent);}
function renderProductManagerContent(){
  const host=document.getElementById('managerRows');
  if(!host||productManager.classList.contains('hidden'))return;
  if(state.user?.role!=='admin'){productManager.classList.add('hidden');return;}
  const categorySelect=document.getElementById('managerCategory');
  const categories=[...new Set(state.products.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const signature=JSON.stringify(categories);
  if(categorySelect.dataset.choices!==signature){
    const selected=categorySelect.value;
    categorySelect.replaceChildren(new Option('Todas las categorías',''),...categories.map(c=>new Option(c,c)));
    categorySelect.value=categories.includes(selected)?selected:'';categorySelect.dataset.choices=signature;
  }
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
  const brandSelect=document.getElementById('managerBrand');
  const resolveBrand=createManagerBrandResolver(state.products);
  const productBrands=new Map(state.products.map(p=>[p.id,resolveBrand(p)]));
  const brands=[...new Set(productBrands.values())].sort((a,b)=>a.localeCompare(b,'es'));
  if(brandSelect.dataset.choices!==JSON.stringify(brands)){const selected=brandSelect.value;brandSelect.replaceChildren(new Option('Todas',''),...brands.map(b=>new Option(b,b)));brandSelect.value=brands.includes(selected)?selected:'';brandSelect.dataset.choices=JSON.stringify(brands);}
  const stockFilter=document.getElementById('managerStock').value;
  const query=normalize(document.getElementById('managerSearch').value.trim());
  const matches=state.products.filter(p=>(!categorySelect.value||p.category===categorySelect.value)&&(!brandSelect.value||productBrands.get(p.id)===brandSelect.value)&&(!stockFilter||(stockFilter==='available'?p.stock>0:p.stock<=0))&&normalize(p.name+' '+p.sku).includes(query));
  managerPage=Math.min(managerPage,Math.max(0,Math.ceil(matches.length/24)-1));host.replaceChildren();
  for(const p of matches.slice(managerPage*24,managerPage*24+24)){
    const card=document.createElement('article');
    const image=productPhoto(p)||document.createElement('span');
    if(!image.className){image.className='product-photo manager-no-photo';image.textContent='Sin foto';}
    const info=document.createElement('div');info.className='manager-product-info';
    const title=document.createElement('strong');title.textContent=p.name;
    const code=document.createElement('p');code.className='manager-product-code';code.textContent=p.sku;
    const category=document.createElement('span');category.className='manager-category';category.textContent=p.category||'Sin categoría';
    const price=document.createElement('p');price.className='manager-product-price';price.textContent=p.pricePending?'Precio pendiente':currency(Number(p.price||0));
    code.textContent='Código: '+p.sku;
    price.textContent='Precio venta: '+price.textContent;
    const metadata=document.createElement('div');metadata.className='manager-metadata';
    const categoryLine=document.createElement('p');categoryLine.append('Categoría: ',category);
    const brand=document.createElement('p');brand.textContent='Marca: '+productBrands.get(p.id);
    const stock=document.createElement('p');stock.textContent='Existencias: '+(p.stock??'Sin registro');
    const status=document.createElement('span');status.className='manager-status '+(p.stock>0?'is-available':'is-empty');status.textContent=p.stock>0?'Con existencias':'Sin existencias';
    metadata.append(code,price,stock,categoryLine,brand,status);info.append(title,metadata);
    const actions=document.createElement('div');actions.className='manager-product-actions';
    const edit=document.createElement('button');edit.type='button';edit.className='ghost-button';edit.dataset.actionTone='info';edit.textContent='Editar producto';edit.onclick=()=>{edit.closest('details').open=false;startEdit(p.id);};
    const remove=document.createElement('button');remove.type='button';remove.className='ghost-button';remove.dataset.actionTone='danger';remove.textContent='Retirar';remove.setAttribute('aria-label','Retirar '+p.name);remove.onclick=()=>{remove.closest('details').open=false;deleteProduct(p.id);};
    const menu=document.createElement('details');menu.className='manager-menu';
    const toggle=document.createElement('summary');toggle.textContent='•••';toggle.setAttribute('aria-label','Acciones de '+p.name);
    menu.addEventListener('toggle',()=>{if(menu.open)host.querySelectorAll('.manager-menu[open]').forEach(other=>{if(other!==menu)other.open=false;});});
    menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;toggle.focus();}});
    actions.append(edit,remove);menu.append(toggle,actions);card.append(image,info,menu);host.append(card);
  }
  document.getElementById('managerCount').textContent=`${matches.length} ${matches.length===1?'producto':'productos'}${categorySelect.value?' · '+categorySelect.value:''}`;
  document.getElementById('managerClear').classList.toggle('hidden',!query&&!categorySelect.value&&!brandSelect.value&&!stockFilter);
  document.getElementById('managerEmpty').classList.toggle('hidden',matches.length>0);
  const totalPages=Math.max(1,Math.ceil(matches.length/24));
  document.getElementById('managerRange').textContent=matches.length?`${managerPage*24+1}–${Math.min(matches.length,(managerPage+1)*24)} de ${matches.length}`:'Sin resultados';
  const pages=document.getElementById('managerPages');pages.replaceChildren();
  const indices=[...new Set([0,...Array.from({length:5},(_,i)=>managerPage+i-2).filter(i=>i>=0&&i<totalPages),totalPages-1])].sort((a,b)=>a-b);
  let last=-1;for(const index of indices){
    if(index>last+1){const dots=document.createElement('span');dots.textContent='…';pages.append(dots);}
    const b=document.createElement('button');b.type='button';b.className='ghost-button';b.textContent=String(index+1);b.setAttribute('aria-label','Página '+(index+1));
    if(index===managerPage)b.setAttribute('aria-current','page');
    b.onclick=()=>{managerPage=index;renderProductManager();productManager.scrollTop=0;};pages.append(b);last=index;
  }
  document.getElementById('managerPrev').disabled=managerPage===0;
  document.getElementById('managerNext').disabled=(managerPage+1)*24>=matches.length;
}
document.getElementById('openProductManager').onclick=e=>{e.preventDefault();if(state.user?.role!=='admin')return;productManager.classList.remove('hidden');managerPage=0;renderProductManager();};
document.getElementById('managerBack').onclick=()=>productManager.classList.add('hidden');
document.getElementById('managerNew').onclick=openProductForm;
document.getElementById('managerFind').onclick=()=>{managerPage=0;renderProductManager();document.getElementById('managerSearch').focus();};
for(const id of ['managerBrand','managerStock'])document.getElementById(id).onchange=()=>{managerPage=0;renderProductManager();};
document.getElementById('managerSearch').oninput=()=>{managerPage=0;renderProductManager();};
document.getElementById('managerCategory').onchange=()=>{managerPage=0;renderProductManager();};
document.getElementById('managerClear').onclick=()=>{for(const id of ['managerSearch','managerCategory','managerBrand','managerStock'])document.getElementById(id).value='';managerPage=0;renderProductManager();};
document.getElementById('managerPrev').onclick=()=>{managerPage--;renderProductManager();productManager.scrollTop=0;};document.getElementById('managerNext').onclick=()=>{managerPage++;renderProductManager();productManager.scrollTop=0;};
document.querySelector('.side-nav').addEventListener('click',e=>{if(e.target.closest('a')?.id!=='openProductManager')productManager.classList.add('hidden');});

let productRemoval=null;
const productDeleteWindow=document.createElement('section');
productDeleteWindow.id='productDeleteWindow';productDeleteWindow.className='floating-window compact hidden';productDeleteWindow.tabIndex=-1;
productDeleteWindow.setAttribute('role','dialog');productDeleteWindow.setAttribute('aria-modal','true');productDeleteWindow.setAttribute('aria-labelledby','productDeleteTitle');
productDeleteWindow.innerHTML=`<div class="window-titlebar"><h2 id="productDeleteTitle">Retirar producto</h2><button id="productDeleteClose" class="icon-button" type="button" aria-label="Cerrar" data-action-tone="neutral">×</button></div>
  <div id="productDeleteSummary" class="product-delete-summary"></div>
  <form id="productDeleteForm">
    <div id="productDeleteFirst"><p><strong>Paso 1 de 2</strong> · Escribe el código de 6 dígitos:</p><strong id="productDeleteCode" class="run-delete-code"></strong><label>Código de confirmación<input id="productDeleteInput" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off" required /></label></div>
    <div id="productDeleteSecond" class="hidden"><p><strong>Paso 2 de 2</strong> · Confirma el retiro</p><p>El producto dejará de aparecer en el catálogo y en las búsquedas para nuevos registros. Los conteos y movimientos anteriores se conservarán.</p></div>
    <p id="productDeleteError" class="form-error hidden" role="alert"></p>
    <div class="window-actions"><button id="productDeleteCancel" class="ghost-button" type="button" data-action-tone="neutral">Cancelar</button><button id="productDeleteSubmit" class="primary-button" type="submit" data-action-tone="info">Verificar código</button></div>
  </form>`;
document.body.append(productDeleteWindow);
document.getElementById('productDeleteCancel').onclick=closeWindows;
document.getElementById('productDeleteClose').onclick=closeWindows;
document.getElementById('productDeleteForm').onsubmit=async event=>{
  event.preventDefault();if(!productRemoval?.token)return;
  const request=productRemoval, submit=document.getElementById('productDeleteSubmit');
  const cancel=document.getElementById('productDeleteCancel'), close=document.getElementById('productDeleteClose');
  submit.disabled=true;cancel.disabled=true;close.disabled=true;
  document.getElementById('productDeleteError').classList.add('hidden');
  try {
    const path='/api/products/'+encodeURIComponent(request.id);
    if(request.step===1){
      await api(path+'/delete-verify','POST',{token:request.token,code:document.getElementById('productDeleteInput').value});
      if(productRemoval!==request)return;
      request.step=2;document.getElementById('productDeleteFirst').classList.add('hidden');
      document.getElementById('productDeleteInput').disabled=true;
      document.getElementById('productDeleteSecond').classList.remove('hidden');
      submit.textContent='Sí, retirar producto';submit.dataset.actionTone='danger';cancel.focus();
    }else{
      await api(path,'DELETE',{token:request.token,confirm:true});
      closeWindows({saved:true});productRemoval=null;await refreshState(true);toast('Producto retirado del catálogo. Historial conservado.');
    }
  }catch(error){if(productRemoval===request)showError(document.getElementById('productDeleteError'),error.message);}
  finally{submit.disabled=false;cancel.disabled=false;close.disabled=false;}
};
