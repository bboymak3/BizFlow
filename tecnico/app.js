// ============================================================
// BizFlow Técnico – App JavaScript
// Complete PWA for field technicians
// ============================================================

'use strict';

// ── STATE ───────────────────────────────────────────────────
let session = null;
let ordenes = { pendientes: [], en_curso: [], completadas: [] };
let currentOrden = null;
let currentTab = 'pendientes';
let currentPhotoType = 'antes';
let currentPhotoOrdenId = null;
let selectedReason = null;
let refreshTimer = null;

// ── API BASE ────────────────────────────────────────────────
const API = '/api/tecnico';

// ── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  restoreSession();
  setupOnlineOffline();
  setupPullToRefresh();
  setupEnterKeyLogin();
});

// ── SERVICE WORKER ──────────────────────────────────────────
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/tecnico/sw.js')
      .then((reg) => console.log('[SW] Registrado:', reg.scope))
      .catch((err) => console.warn('[SW] Error:', err));
  }
}

// ── ONLINE / OFFLINE ────────────────────────────────────────
function setupOnlineOffline() {
  const banner = document.getElementById('offlineBanner');
  function update() {
    if (navigator.onLine) {
      banner.classList.remove('active');
    } else {
      banner.classList.add('active');
      showToast('Sin conexión – Modo offline activo', 'warning');
    }
  }
  window.addEventListener('online', () => { update(); loadOrdenes(); });
  window.addEventListener('offline', update);
  update();
}

// ── PULL TO REFRESH ─────────────────────────────────────────
function setupPullToRefresh() {
  let startY = 0;
  let pulling = false;
  const indicator = document.getElementById('pullIndicator');
  const container = document.querySelector('.orders-container');

  container.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const diff = e.touches[0].clientY - startY;
    if (diff > 80) {
      indicator.classList.add('active');
    }
  }, { passive: true });

  container.addEventListener('touchend', () => {
    if (indicator.classList.contains('active')) {
      indicator.classList.remove('active');
      loadOrdenes();
    }
    pulling = false;
  }, { passive: true });
}

// ── ENTER KEY LOGIN ─────────────────────────────────────────
function setupEnterKeyLogin() {
  document.getElementById('pinInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });
  document.getElementById('phoneInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('pinInput').focus();
  });
}

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════

async function login() {
  const phone = document.getElementById('phoneInput').value.trim();
  const pin = document.getElementById('pinInput').value.trim();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  if (!phone || !pin) {
    errorEl.textContent = 'Ingresa teléfono y PIN';
    return;
  }

  showLoading();
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono: phone, pin }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      errorEl.textContent = data.error || 'Credenciales incorrectas';
      hideLoading();
      return;
    }

    session = {
      tecnico_id: data.tecnico_id,
      nombre: data.nombre,
      comision: data.comision || 0,
    };
    localStorage.setItem('bizflow_session', JSON.stringify(session));
    hideLoading();
    enterApp();
  } catch (err) {
    errorEl.textContent = 'Error de conexión. Intenta de nuevo.';
    hideLoading();
  }
}

function logout() {
  session = null;
  localStorage.removeItem('bizflow_session');
  if (refreshTimer) clearInterval(refreshTimer);
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('phoneInput').value = '';
  document.getElementById('pinInput').value = '';
  document.getElementById('loginError').textContent = '';
}

function restoreSession() {
  try {
    const saved = localStorage.getItem('bizflow_session');
    if (saved) {
      session = JSON.parse(saved);
      if (session && session.tecnico_id) {
        enterApp();
        return;
      }
    }
  } catch (_) { /* ignore */ }
  // Show login
  document.getElementById('loginScreen').style.display = 'flex';
}

function enterApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  document.getElementById('tecnicoName').textContent = session.nombre;
  loadOrdenes();
  // Auto-refresh every 30 seconds
  refreshTimer = setInterval(loadOrdenes, 30000);
}

// ═══════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════

async function loadOrdenes() {
  if (!session) return;
  try {
    const res = await fetch(`${API}/ordenes?tecnico_id=${session.tecnico_id}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || 'Error al cargar órdenes', 'error');
      return;
    }

    const all = Array.isArray(data) ? data : (data.ordenes || []);
    categorizeOrdenes(all);
    renderOrdenes();
  } catch (err) {
    // Silent fail for background refresh
    console.warn('[ORDENES] Error:', err.message);
  }
}

function categorizeOrdenes(all) {
  ordenes.pendientes = all.filter((o) =>
    ['pendiente', 'asignada'].includes(o.estado)
  );
  ordenes.en_curso = all.filter((o) =>
    ['en_sitio', 'en_progreso', 'pedido_piezas', 'firma_pendiente'].includes(o.estado)
  );
  ordenes.completadas = all.filter((o) =>
    ['completada', 'no_completada', 'cerrada'].includes(o.estado)
  );
}

function renderOrdenes() {
  // Update badges
  document.getElementById('badgePendientes').textContent = ordenes.pendientes.length;
  document.getElementById('badgeEnCurso').textContent = ordenes.en_curso.length;
  document.getElementById('badgeCompletadas').textContent = ordenes.completadas.length;

  // Render each tab
  renderTabContent('pendientes', ordenes.pendientes);
  renderTabContent('en_curso', ordenes.en_curso);
  renderTabContent('completadas', ordenes.completadas);
}

function renderTabContent(tab, items) {
  const container = document.getElementById(`tab${capitalizeTab(tab)}Content`);

  if (items.length === 0) {
    const icons = {
      pendientes: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
      en_curso: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17l-5.1 3.026a.75.75 0 01-1.07-.82l1.68-5.68-4.33-3.68a.75.75 0 01.42-1.32l5.7-.33 2.22-5.3a.75.75 0 011.39 0l2.22 5.3 5.7.33a.75.75 0 01.42 1.32l-4.33 3.68 1.68 5.68a.75.75 0 01-1.07.82L12 15.17z"/></svg>`,
      completadas: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    };
    const msgs = {
      pendientes: 'No hay órdenes pendientes',
      en_curso: 'No hay órdenes en curso',
      completadas: 'No hay órdenes completadas',
    };
    container.innerHTML = `<div class="empty-state">${icons[tab]}<p>${msgs[tab]}</p></div>`;
    return;
  }

  container.innerHTML = items.map(renderOrdenCard).join('');
}

function renderOrdenCard(orden) {
  const estadoLabel = formatEstado(orden.estado);
  const statusClass = `status-${orden.estado}`;
  const direccion = orden.direccion || orden.direccion_cliente || '';
  const patente = orden.patente || '';
  const marca = orden.marca || '';
  const modelo = orden.modelo || '';
  const cliente = orden.nombre_cliente || orden.cliente || '';
  const domicilio = orden.es_domicilio || orden.domicilio;

  let domicilioHTML = '';
  if (domicilio && (domicilio.distancia || domicilio.cargo)) {
    domicilioHTML = `
      <div class="order-domicilio">
        🏠 Domicilio${domicilio.distancia ? ` · ${domicilio.distancia} km` : ''}${domicilio.cargo ? ` · $${Number(domicilio.cargo).toLocaleString('es-CL')}` : ''}
      </div>`;
  }

  return `
    <div class="order-card" onclick="showOrdenDetail('${orden.id}')">
      <div class="order-header">
        <span class="order-number">#${orden.numero || orden.id}</span>
        <span class="status-badge ${statusClass}">${estadoLabel}</span>
      </div>
      <div class="order-info">
        <div class="row"><span class="label">Cliente:</span> <span>${cliente}</span></div>
        ${orden.telefono_cliente ? `<div class="row"><span class="label">Tel:</span> <span><a href="tel:${orden.telefono_cliente}" style="color:#93c5fd;" onclick="event.stopPropagation()">${orden.telefono_cliente}</a></span></div>` : ''}
        ${direccion ? `<div class="row"><span class="label">Dir:</span> <span>${direccion}</span></div>` : ''}
      </div>
      ${patente || marca || modelo ? `
        <div class="order-vehicle">
          ${patente ? `<span class="patente">${patente}</span>` : ''}
          <span class="vehiculo-info">${[marca, modelo].filter(Boolean).join(' ') || '—'}</span>
        </div>` : ''}
      ${domicilioHTML}
    </div>`;
}

function capitalizeTab(tab) {
  const map = { pendientes: 'Pendientes', en_curso: 'EnCurso', completadas: 'Completadas' };
  return map[tab] || tab;
}

function formatEstado(estado) {
  const map = {
    pendiente: 'Pendiente',
    asignada: 'Asignada',
    en_sitio: 'En Sitio',
    en_progreso: 'En Progreso',
    pedido_piezas: 'Pedido Piezas',
    completada: 'Completada',
    no_completada: 'No Completada',
    cerrada: 'Cerrada',
    firma_pendiente: 'Firma Pendiente',
  };
  return map[estado] || estado;
}

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════

function switchTab(tab) {
  currentTab = tab;

  // Update tab pills
  document.querySelectorAll('.tab-pill').forEach((el) => el.classList.remove('active'));
  document.getElementById(`tab${capitalizeTab(tab)}`).classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
  document.getElementById(`tab${capitalizeTab(tab)}Content`).classList.add('active');

  // Update bottom nav
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
  document.getElementById(`nav${capitalizeTab(tab)}`).classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// DETAIL MODAL
// ═══════════════════════════════════════════════════════════

async function showOrdenDetail(ordenId) {
  showLoading();
  try {
    const res = await fetch(`${API}/orden?id=${ordenId}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || 'Error al cargar orden', 'error');
      hideLoading();
      return;
    }

    currentOrden = data;
    populateDetailModal(data);
    document.getElementById('detailModal').classList.add('active');
    hideLoading();
  } catch (err) {
    showToast('Error de conexión', 'error');
    hideLoading();
  }
}

function populateDetailModal(o) {
  // Title
  document.getElementById('detailTitle').textContent = `Orden #${o.numero || o.id}`;
  document.getElementById('detailSubtitle').textContent = formatEstado(o.estado);

  // Client
  const clienteHTML = [
    row('Nombre', o.nombre_cliente || o.cliente || '—'),
    o.telefono_cliente ? row('Teléfono', `<a href="tel:${o.telefono_cliente}" style="color:#93c5fd;">${o.telefono_cliente}</a>`) : '',
    row('Email', o.email_cliente || '—'),
    row('Dirección', o.direccion || '—'),
  ].filter(Boolean).join('');
  document.getElementById('detailCliente').innerHTML = clienteHTML;

  // Vehicle
  const vehiculoHTML = [
    row('Patente', o.patente || '—'),
    row('Marca', o.marca || '—'),
    row('Modelo', o.modelo || ''),
    row('Año', o.anio || ''),
    row('Color', o.color || ''),
    row('VIN / Chasis', o.vin || o.chasis || ''),
    row('Kilometraje', o.km ? `${Number(o.km).toLocaleString('es-CL')} km` : ''),
    row('Combustible', o.combustible || ''),
  ].filter(Boolean).join('');
  document.getElementById('detailVehiculo').innerHTML = vehiculoHTML;

  // Services
  const servicios = o.servicios || o.diagnostico || [];
  let serviciosHTML = '';
  if (Array.isArray(servicios) && servicios.length > 0) {
    serviciosHTML = servicios.map((s) => {
      const nombre = s.nombre || s.servicio || s.descripcion || 'Servicio';
      const precio = s.precio || s.valor || 0;
      return `<div class="service-item"><span>${nombre}</span><span class="price">$${Number(precio).toLocaleString('es-CL')}</span></div>`;
    }).join('');
  } else if (typeof servicios === 'string') {
    serviciosHTML = `<div class="service-item"><span>${servicios}</span></div>`;
  } else {
    serviciosHTML = '<p style="font-size:0.85rem;color:#64748b;text-align:center;">Sin servicios registrados</p>';
  }
  document.getElementById('detailServicios').innerHTML = serviciosHTML;

  // Checklist
  const checklist = o.checklist || o.checklist_vehiculo;
  if (checklist && Array.isArray(checklist) && checklist.length > 0) {
    document.getElementById('checklistSection').style.display = 'block';
    document.getElementById('detailChecklist').innerHTML = checklist.map((c) => {
      const icon = c.estado === 'ok' ? '✅' : c.estado === 'no' ? '❌' : '➖';
      const cls = c.estado === 'ok' ? 'check-ok' : c.estado === 'no' ? 'check-no' : 'check-na';
      return `<div class="checklist-item"><span class="check-icon ${cls}">${icon}</span><span>${c.item || c.nombre || '—'}</span></div>`;
    }).join('');
  } else {
    document.getElementById('checklistSection').style.display = 'none';
  }

  // Domicilio
  const domicilio = o.domicilio || o.es_domicilio;
  if (domicilio && (domicilio.distancia || domicilio.cargo || domicilio.modo_pago)) {
    document.getElementById('domicilioSection').style.display = 'block';
    document.getElementById('detailDomicilio').innerHTML = [
      row('Distancia', domicilio.distancia ? `${domicilio.distancia} km` : '—'),
      row('Cargo', domicilio.cargo ? `$${Number(domicilio.cargo).toLocaleString('es-CL')}` : '—'),
      row('Modo de Pago', domicilio.modo_pago || '—'),
    ].join('');
  } else {
    document.getElementById('domicilioSection').style.display = 'none';
  }

  // Photos (load async)
  loadFotos(o.id);

  // Notes (load async)
  loadNotas(o.id);

  // History (load async)
  loadHistorial(o.id);
}

function row(label, value) {
  return `<div class="detail-row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
}

async function loadFotos(ordenId) {
  const grid = document.getElementById('detailFotos');
  const empty = document.getElementById('detailFotosEmpty');
  try {
    const res = await fetch(`${API}/fotos?orden_id=${ordenId}`);
    const data = await res.json();
    const fotos = Array.isArray(data) ? data : (data.fotos || []);

    if (fotos.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    grid.innerHTML = fotos.map((f) => {
      const tipoLabel = { antes: 'Antes', durante: 'Durante', despues: 'Después' }[f.tipo] || '';
      return `
        <div>
          <img class="photo-thumb" src="${f.url || f.ruta || ''}" alt="Foto ${tipoLabel}" 
               onclick="event.stopPropagation();openFullscreen('${f.url || f.ruta || ''}')" loading="lazy" />
          <div class="photo-label">${tipoLabel}</div>
        </div>`;
    }).join('');
  } catch (_) {
    grid.innerHTML = '';
    empty.style.display = 'block';
  }
}

async function loadNotas(ordenId) {
  const container = document.getElementById('detailNotas');
  const empty = document.getElementById('detailNotasEmpty');
  try {
    const res = await fetch(`${API}/notas?orden_id=${ordenId}`);
    const data = await res.json();
    const notas = Array.isArray(data) ? data : (data.notas || []);

    if (notas.length === 0) {
      container.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    container.innerHTML = notas.map((n) => `
      <div class="note-item">
        <div class="note-text">${escapeHtml(n.texto || n.nota || '')}</div>
        <div class="note-meta">${n.fecha || n.created_at || ''} · ${n.autor || n.tecnico || ''}</div>
      </div>`).join('');
  } catch (_) {
    container.innerHTML = '';
    empty.style.display = 'block';
  }
}

async function loadHistorial(ordenId) {
  const container = document.getElementById('detailHistorial');
  try {
    const res = await fetch(`${API}/historial?orden_id=${ordenId}`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.historial || []);

    if (items.length === 0) {
      container.innerHTML = '<p style="font-size:0.85rem;color:#64748b;text-align:center;">Sin historial</p>';
      return;
    }

    container.innerHTML = items.map((h) => {
      const lat = h.latitud ? ` (${h.latitud}, ${h.longitud})` : '';
      return `
        <div class="timeline-item">
          <div class="timeline-dot">${h.emoji || '📍'}</div>
          <div class="timeline-content">
            <div class="timeline-status">${formatEstado(h.estado || h.nuevo_estado || '')}</div>
            <div class="timeline-meta">${h.fecha || h.created_at || ''}${lat}</div>
          </div>
        </div>`;
    }).join('');
  } catch (_) {
    container.innerHTML = '<p style="font-size:0.85rem;color:#64748b;text-align:center;">Sin historial</p>';
  }
}

function closeDetailModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('detailModal').classList.remove('active');
  currentOrden = null;
}

// ── ACTION BUTTONS SHEET ────────────────────────────────────

function showActionButtons() {
  if (!currentOrden) return;
  const o = currentOrden;
  const estado = o.estado;
  let buttons = '';

  // GPS (always if address exists)
  if (o.direccion) {
    buttons += `<button class="action-btn btn-gps" onclick="navegarGPS()">🧭 Navegar GPS</button>`;
  }

  // State-based actions
  switch (estado) {
    case 'pendiente':
    case 'asignada':
      buttons += `<button class="action-btn btn-primary" onclick="llegarAlSitio()">📍 Llegar al Sitio</button>`;
      break;

    case 'en_sitio':
      buttons += `<button class="action-btn btn-primary" onclick="iniciarTrabajo()">▶ Iniciar Trabajo</button>`;
      buttons += `<button class="action-btn btn-note" onclick="openNoteModal()">📝 Agregar Nota</button>`;
      break;

    case 'en_progreso':
      buttons += `<button class="action-btn btn-primary" onclick="subirFotoAction()">📸 Subir Fotos</button>`;
      buttons += `<button class="action-btn btn-note" onclick="openNoteModal()">📝 Agregar Nota</button>`;
      buttons += `<button class="action-btn btn-complete" onclick="completarOrden()">✅ Completar</button>`;
      break;

    case 'pedido_piezas':
      buttons += `<button class="action-btn btn-primary" onclick="retomarTrabajo()">▶ Retomar Trabajo</button>`;
      buttons += `<button class="action-btn btn-note" onclick="openNoteModal()">📝 Agregar Nota</button>`;
      break;

    case 'completada':
      buttons += `<button class="action-btn btn-primary" onclick="solicitarFirma()">✍️ Solicitar Firma</button>`;
      buttons += `<button class="action-btn btn-green" onclick="clienteSatisfecho()">👍 Cliente Satisfecho</button>`;
      buttons += `<button class="action-btn btn-red" onclick="openNoCompletadaModal()">❌ No Completada</button>`;
      buttons += `<button class="action-btn btn-dark" onclick="openCloseModal()">🔒 Cerrar Orden</button>`;
      break;

    case 'firma_pendiente':
      buttons += `<button class="action-btn btn-primary" onclick="solicitarFirma()">✍️ Reenviar Firma</button>`;
      buttons += `<button class="action-btn btn-dark" onclick="openCloseModal()">🔒 Cerrar Orden</button>`;
      break;

    case 'no_completada':
      buttons += `<button class="action-btn btn-dark" onclick="openCloseModal()">🔒 Cerrar Orden</button>`;
      break;
  }

  // Always allow notes and photos for active orders
  if (['en_sitio', 'en_progreso', 'pedido_piezas'].includes(estado) && !buttons.includes('Subir Fotos')) {
    buttons += `<button class="action-btn btn-primary" onclick="subirFotoAction()">📸 Subir Fotos</button>`;
  }

  if (buttons) {
    document.getElementById('actionButtonsContent').innerHTML = buttons;
    // Insert action buttons after detail modal
    document.getElementById('detailModal').classList.remove('active');
    document.getElementById('actionButtons').classList.add('active');
  }
}

function closeActions(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('actionButtons').classList.remove('active');
}

// ═══════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════

function navegarGPS() {
  if (!currentOrden || !currentOrden.direccion) return;
  const addr = encodeURIComponent(currentOrden.direccion);
  window.open(`https://maps.google.com/?q=${addr}`, '_blank');
  document.getElementById('actionButtons').classList.remove('active');
}

async function llegarAlSitio() {
  if (!currentOrden) return;
  showLoading();
  try {
    const coords = await getCurrentPosition();
    const res = await fetch(`${API}/cambiar-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orden_id: currentOrden.id,
        nuevo_estado: 'en_sitio',
        latitud: coords.lat,
        longitud: coords.lng,
      }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      hideLoading();
      return;
    }

    hideLoading();
    document.getElementById('actionButtons').classList.remove('active');
    showToast('📍 Has llegado al sitio', 'success');
    loadOrdenes();
    showOrdenDetail(currentOrden.id);
  } catch (err) {
    showToast('No se pudo obtener la ubicación GPS', 'error');
    hideLoading();
  }
}

async function iniciarTrabajo() {
  if (!currentOrden) return;
  showLoading();
  try {
    const coords = await getCurrentPosition();
    const res = await fetch(`${API}/cambiar-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orden_id: currentOrden.id,
        nuevo_estado: 'en_progreso',
        latitud: coords.lat,
        longitud: coords.lng,
      }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      hideLoading();
      return;
    }

    hideLoading();
    document.getElementById('actionButtons').classList.remove('active');
    showToast('▶ Trabajo iniciado', 'success');
    loadOrdenes();
    showOrdenDetail(currentOrden.id);
  } catch (err) {
    showToast('No se pudo obtener la ubicación GPS', 'error');
    hideLoading();
  }
}

async function completarOrden() {
  if (!currentOrden) return;
  showLoading();
  try {
    const res = await fetch(`${API}/cambiar-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orden_id: currentOrden.id,
        nuevo_estado: 'completada',
      }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      hideLoading();
      return;
    }

    hideLoading();
    document.getElementById('actionButtons').classList.remove('active');
    showToast('✅ Orden completada', 'success');
    loadOrdenes();
    showOrdenDetail(currentOrden.id);
  } catch (err) {
    showToast('Error de conexión', 'error');
    hideLoading();
  }
}

async function retomarTrabajo() {
  if (!currentOrden) return;
  showLoading();
  try {
    const res = await fetch(`${API}/cambiar-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orden_id: currentOrden.id,
        nuevo_estado: 'en_progreso',
      }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      hideLoading();
      return;
    }

    hideLoading();
    document.getElementById('actionButtons').classList.remove('active');
    showToast('▶ Trabajo retomado', 'success');
    loadOrdenes();
    showOrdenDetail(currentOrden.id);
  } catch (err) {
    showToast('Error de conexión', 'error');
    hideLoading();
  }
}

async function solicitarFirma() {
  if (!currentOrden) return;
  showLoading();
  try {
    const res = await fetch(`${API}/generar-token-firma`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orden_id: currentOrden.id,
        tecnico_id: session.tecnico_id,
      }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      hideLoading();
      return;
    }

    const token = data.token || data.firma_token;
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/firma/${token}`;
    document.getElementById('signatureLink').value = link;

    hideLoading();
    document.getElementById('actionButtons').classList.remove('active');
    document.getElementById('signatureModal').classList.add('active');
  } catch (err) {
    showToast('Error de conexión', 'error');
    hideLoading();
  }
}

function shareWhatsApp() {
  const link = document.getElementById('signatureLink').value;
  if (!link) return;
  const msg = encodeURIComponent(`Hola, por favor firma la conformidad de su orden en el siguiente enlace:\n${link}`);
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}

function shareLinkGeneric() {
  const link = document.getElementById('signatureLink').value;
  if (!link) return;
  if (navigator.share) {
    navigator.share({
      title: 'Firma BizFlow',
      text: 'Firma la conformidad de tu orden',
      url: link,
    }).catch(() => {});
  } else {
    copySignatureLink();
  }
}

function copySignatureLink() {
  const input = document.getElementById('signatureLink');
  input.select();
  input.setSelectionRange(0, 99999);
  try {
    navigator.clipboard.writeText(input.value);
    showToast('🔗 Link copiado', 'success');
  } catch (_) {
    document.execCommand('copy');
    showToast('🔗 Link copiado', 'success');
  }
}

async function cerrarOrdenDesdeFirma() {
  if (!currentOrden) return;
  const notes = document.getElementById('signatureNotes').value.trim();
  const pagoEstado = getRadioValue('sigPagoEstado');
  const pagoMetodo = getRadioValue('sigPagoMetodo');

  await doCerrarOrden(currentOrden.id, notes, pagoEstado, pagoMetodo);
  document.getElementById('signatureModal').classList.remove('active');
}

function openCloseModal() {
  document.getElementById('actionButtons').classList.remove('active');
  document.getElementById('closeNotes').value = '';
  // Reset radios
  document.querySelectorAll('#closePagoEstado .radio-option').forEach((el, i) => {
    el.classList.toggle('selected', i === 2); // Pendiente default
  });
  document.querySelectorAll('#closePagoMetodo .radio-option').forEach((el, i) => {
    el.classList.toggle('selected', i === 0); // Efectivo default
  });
  document.getElementById('closeModal').classList.add('active');
}

function closeCloseModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('closeModal').classList.remove('active');
}

async function confirmCloseOrder() {
  if (!currentOrden) return;
  const notes = document.getElementById('closeNotes').value.trim();
  const pagoEstado = getRadioValue('closePagoEstado');
  const pagoMetodo = getRadioValue('closePagoMetodo');

  await doCerrarOrden(currentOrden.id, notes, pagoEstado, pagoMetodo);
  document.getElementById('closeModal').classList.remove('active');
}

async function doCerrarOrden(ordenId, notes, pagoEstado, pagoMetodo) {
  showLoading();
  try {
    const res = await fetch(`${API}/cerrar-orden`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orden_id: ordenId,
        tecnico_id: session.tecnico_id,
        notas: notes,
        estado_pago: pagoEstado,
        metodo_pago: pagoMetodo,
      }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      hideLoading();
      return;
    }

    hideLoading();
    showToast('🔒 Orden cerrada', 'success');
    loadOrdenes();
    if (currentOrden) showOrdenDetail(currentOrden.id);
  } catch (err) {
    showToast('Error de conexión', 'error');
    hideLoading();
  }
}

async function clienteSatisfecho() {
  if (!currentOrden) return;
  showLoading();
  try {
    const res = await fetch(`${API}/cambiar-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orden_id: currentOrden.id,
        nuevo_estado: 'completada',
        cliente_satisfecho: true,
      }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      hideLoading();
      return;
    }

    hideLoading();
    document.getElementById('actionButtons').classList.remove('active');
    showToast('👍 Cliente satisfecho registrado', 'success');
    loadOrdenes();
    showOrdenDetail(currentOrden.id);
  } catch (err) {
    showToast('Error de conexión', 'error');
    hideLoading();
  }
}

function openNoCompletadaModal() {
  selectedReason = null;
  document.getElementById('actionButtons').classList.remove('active');
  document.getElementById('noCompletadaNotes').value = '';
  document.getElementById('noCompletadaNotesField').style.display = 'none';
  document.querySelectorAll('.reason-option').forEach((el) => el.classList.remove('selected'));
  document.getElementById('noCompletadaModal').classList.add('active');
}

function closeNoCompletadaModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('noCompletadaModal').classList.remove('active');
}

function selectReason(el, reason) {
  selectedReason = reason;
  document.querySelectorAll('.reason-option').forEach((opt) => opt.classList.remove('selected'));
  el.classList.add('selected');

  const notesField = document.getElementById('noCompletadaNotesField');
  notesField.style.display = reason === 'otro' ? 'block' : 'none';
}

async function confirmNoCompletada() {
  if (!currentOrden || !selectedReason) {
    showToast('Selecciona un motivo', 'warning');
    return;
  }

  const notes = document.getElementById('noCompletadaNotes').value.trim();
  showLoading();
  try {
    const res = await fetch(`${API}/cambiar-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orden_id: currentOrden.id,
        nuevo_estado: 'no_completada',
        motivo: selectedReason,
        notas: notes,
      }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      hideLoading();
      return;
    }

    hideLoading();
    document.getElementById('noCompletadaModal').classList.remove('active');
    showToast('❌ Orden marcada como no completada', 'warning');
    loadOrdenes();
    showOrdenDetail(currentOrden.id);
  } catch (err) {
    showToast('Error de conexión', 'error');
    hideLoading();
  }
}

// ═══════════════════════════════════════════════════════════
// PHOTOS
// ═══════════════════════════════════════════════════════════

function subirFotoAction() {
  if (!currentOrden) return;
  currentPhotoOrdenId = currentOrden.id;
  currentPhotoType = 'antes';
  document.getElementById('actionButtons').classList.remove('active');
  document.getElementById('photoPreviewGrid').innerHTML = '';
  document.querySelectorAll('.photo-type-btn').forEach((el, i) => {
    el.classList.toggle('selected', i === 0);
  });
  document.getElementById('photoModalSubtitle').textContent = `Orden #${currentOrden.numero || currentOrden.id}`;
  document.getElementById('photoModal').classList.add('active');
}

function selectPhotoType(type, el) {
  currentPhotoType = type;
  document.querySelectorAll('.photo-type-btn').forEach((b) => b.classList.remove('selected'));
  el.classList.add('selected');
}

function capturePhoto(source) {
  const input = document.getElementById('photoInput');
  if (source === 'camera') {
    input.setAttribute('capture', 'environment');
  } else {
    input.removeAttribute('capture');
  }
  input.accept = 'image/*';
  input.onchange = handlePhotoSelected;
  input.click();
}

async function handlePhotoSelected(event) {
  const file = event.target.files[0];
  if (!file || !currentPhotoOrdenId) return;

  showLoading();
  try {
    const formData = new FormData();
    formData.append('foto', file);
    formData.append('orden_id', currentPhotoOrdenId);
    formData.append('tipo', currentPhotoType);
    formData.append('tecnico_id', session.tecnico_id);

    const res = await fetch(`${API}/subir-foto`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
    } else {
      showToast('📸 Foto subida correctamente', 'success');
      // Add preview
      const grid = document.getElementById('photoPreviewGrid');
      const url = URL.createObjectURL(file);
      const tipoLabel = { antes: 'Antes', durante: 'Durante', despues: 'Después' }[currentPhotoType] || '';
      const div = document.createElement('div');
      div.innerHTML = `<img class="photo-thumb" src="${url}" alt="Preview" onclick="openFullscreen('${url}')" /><div class="photo-label">${tipoLabel}</div>`;
      grid.prepend(div);
    }
  } catch (err) {
    showToast('Error al subir foto', 'error');
  }

  hideLoading();
  // Reset input
  event.target.value = '';
}

function closePhotoModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('photoModal').classList.remove('active');
  // Refresh photos in detail
  if (currentOrden) {
    document.getElementById('detailModal').classList.add('active');
    loadFotos(currentOrden.id);
  }
}

function closeSignatureModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('signatureModal').classList.remove('active');
}

// ═══════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════

function openNoteModal() {
  document.getElementById('noteText').value = '';
  document.getElementById('noteModal').classList.add('active');
}

function closeNoteModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('noteModal').classList.remove('active');
}

async function confirmAddNote() {
  if (!currentOrden) return;
  const texto = document.getElementById('noteText').value.trim();
  if (!texto) {
    showToast('Escribe una nota', 'warning');
    return;
  }

  showLoading();
  try {
    const res = await fetch(`${API}/agregar-nota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orden_id: currentOrden.id,
        tecnico_id: session.tecnico_id,
        texto,
      }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      hideLoading();
      return;
    }

    hideLoading();
    document.getElementById('noteModal').classList.remove('active');
    showToast('📝 Nota agregada', 'success');
    loadNotas(currentOrden.id);
  } catch (err) {
    showToast('Error de conexión', 'error');
    hideLoading();
  }
}

// ═══════════════════════════════════════════════════════════
// GPS
// ═══════════════════════════════════════════════════════════

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalización no disponible'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // km with 1 decimal
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

// ═══════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════

function showLoading() {
  document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('active');
}

function showToast(message, type) {
  type = type || 'info';
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all .3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function openFullscreen(url) {
  document.getElementById('fullscreenImg').src = url;
  document.getElementById('fullscreenPhoto').classList.add('active');
}

function closeFullscreenPhoto() {
  document.getElementById('fullscreenPhoto').classList.remove('active');
}

function selectRadio(el, groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.radio-option').forEach((opt) => opt.classList.remove('selected'));
  el.classList.add('selected');
}

function getRadioValue(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return null;
  const selected = group.querySelector('.radio-option.selected');
  return selected ? selected.textContent.trim().toLowerCase() : null;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
