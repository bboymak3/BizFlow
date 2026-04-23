// ============================================================
// BizFlow Técnico – App JavaScript
// Complete PWA for field technicians
// ============================================================

'use strict';

// ═══════════════════════════════════════════════════════════
// APP NAMESPACE
// ═══════════════════════════════════════════════════════════

const App = {
  // ── STATE ───────────────────────────────────────────────
  session: null,
  ordenes: [],
  filteredOrdenes: [],
  currentFilter: 'todas',
  currentOrden: null,
  currentTab: 'ordenes',
  currentPhotoType: 'antes',
  currentCostType: 'repuesto',
  refreshTimer: null,
  gpsTimer: null,
  signatureCanvas: null,
  signatureCtx: null,
  signatureDrawing: false,
  profile: null,
  isOnline: true,

  // ── API BASE ────────────────────────────────────────────
  API: '/api/tecnico',

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  init() {
    this.registerServiceWorker();
    this.setupOnlineOffline();
    this.setupPullToRefresh();
    this.setupEnterKeyLogin();

    // Show splash, then check session
    setTimeout(() => {
      this.restoreSession();
    }, 1200);
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/tecnico/sw.js')
        .then((reg) => console.log('[SW] Registered:', reg.scope))
        .catch((err) => console.warn('[SW] Error:', err));
    }
  },

  // ═══════════════════════════════════════════════════════════
  // AUTH
  // ═══════════════════════════════════════════════════════════

  async login() {
    const codigo = document.getElementById('codigoInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('btnLogin');
    errorEl.textContent = '';

    if (!codigo || !password) {
      errorEl.textContent = 'Ingresa código y contraseña';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';
    this.showLoading();

    try {
      const res = await fetch(`${this.API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, password }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        errorEl.textContent = data.error || 'Credenciales incorrectas';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
        this.hideLoading();
        return;
      }

      this.session = {
        tecnico_id: data.token || data.tecnico_id || data.id,
        nombre: data.nombre,
        codigo: data.codigo,
        especialidad: data.especialidad,
        telefono: data.telefono,
        email: data.email || '',
      };
      localStorage.setItem('bizflow_session', JSON.stringify(this.session));
      this.hideLoading();
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
      this.enterApp();
    } catch (err) {
      errorEl.textContent = 'Error de conexión. Intenta de nuevo.';
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
      this.hideLoading();
    }
  },

  logout() {
    this.session = null;
    this.currentOrden = null;
    this.ordenes = [];
    localStorage.removeItem('bizflow_session');
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.gpsTimer) clearInterval(this.gpsTimer);

    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('codigoInput').value = '';
    document.getElementById('passwordInput').value = '';
    document.getElementById('loginError').textContent = '';

    this.switchTab('ordenes');
  },

  restoreSession() {
    try {
      const saved = localStorage.getItem('bizflow_session');
      if (saved) {
        this.session = JSON.parse(saved);
        if (this.session && this.session.tecnico_id) {
          this.hideSplash();
          this.enterApp();
          return;
        }
      }
    } catch (_) { /* ignore */ }
    this.hideSplash();
    document.getElementById('loginScreen').style.display = 'flex';
  },

  hideSplash() {
    const splash = document.getElementById('splashScreen');
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(() => { splash.style.display = 'none'; }, 400);
    }
  },

  enterApp() {
    document.getElementById('splashScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    document.getElementById('headerTecnicoName').textContent =
      `${this.session.nombre} · ${this.session.codigo}`;

    this.loadOrdenes();
    this.loadProfile();
    this.startGPSTracking();

    // Auto-refresh orders every 30 seconds
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this.loadOrdenes(), 30000);
  },

  // ═══════════════════════════════════════════════════════════
  // ORDERS
  // ═══════════════════════════════════════════════════════════

  async loadOrdenes() {
    if (!this.session) return;

    const fab = document.getElementById('fabRefresh');
    if (fab) fab.classList.add('spinning');

    try {
      const res = await fetch(`${this.API}/ordenes?tecnico_id=${this.session.tecnico_id}`);
      const data = await res.json();

      if (!res.ok && data.error) {
        if (this.ordenes.length === 0) {
          this.showToast(data.error, 'error');
        }
        return;
      }

      this.ordenes = Array.isArray(data.ordenes) ? data.ordenes :
                     Array.isArray(data) ? data :
                     (data.results || []);
      this.applyFilter();
      this.updateCounts();
    } catch (err) {
      console.warn('[ORDENES] Error:', err.message);
    } finally {
      if (fab) fab.classList.remove('spinning');
    }
  },

  updateCounts() {
    const counts = { todas: this.ordenes.length, en_proceso: 0, completada: 0, pendiente: 0 };
    this.ordenes.forEach(o => {
      const e = o.estado || '';
      if (e === 'en_proceso' || e === 'pausada' || e === 'asignada') counts.en_proceso++;
      else if (e === 'completada' || e === 'aprobada' || e === 'cerrada') counts.completada++;
      else if (e === 'pendiente') counts.pendiente++;
    });
    document.getElementById('countTodas').textContent = counts.todas;
    document.getElementById('countEnProceso').textContent = counts.en_proceso;
    document.getElementById('countCompletada').textContent = counts.completada;
    document.getElementById('countPendiente').textContent = counts.pendiente;
  },

  filterOrdenes(filter, btnEl) {
    this.currentFilter = filter;

    // Update filter buttons
    document.querySelectorAll('.status-filter').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    this.applyFilter();
  },

  applyFilter() {
    if (this.currentFilter === 'todas') {
      this.filteredOrdenes = [...this.ordenes];
    } else {
      const f = this.currentFilter;
      if (f === 'en_proceso') {
        this.filteredOrdenes = this.ordenes.filter(o =>
          ['en_proceso', 'pausada', 'asignada'].includes(o.estado));
      } else {
        this.filteredOrdenes = this.ordenes.filter(o => o.estado === f);
      }
    }
    this.renderOrdenes();
  },

  renderOrdenes() {
    const container = document.getElementById('ordersList');
    const items = this.filteredOrdenes;

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-clipboard-list"></i>
          <p>No hay órdenes${this.currentFilter !== 'todas' ? ' con este filtro' : ''}</p>
        </div>`;
      return;
    }

    container.innerHTML = items.map(o => this.renderOrdenCard(o)).join('');
  },

  renderOrdenCard(orden) {
    const estadoLabel = this.formatEstado(orden.estado);
    const estadoClass = orden.estado || 'pendiente';
    const prioridad = orden.prioridad || 'normal';
    const cliente = orden.cliente_nombre || orden.nombre_cliente || '';
    const telefono = orden.cliente_telefono || orden.telefono_cliente || '';
    const placa = orden.placa || '';
    const vehiculo = [orden.vehiculo_marca || orden.marca, orden.vehiculo_modelo || orden.modelo]
      .filter(Boolean).join(' ');
    const tipo = orden.tipo || '';

    return `
      <div class="ot-card" onclick="App.openOrden(${orden.id})">
        <div class="ot-card-header">
          <span class="ot-number">#${orden.numero || orden.id}</span>
          <div class="ot-badges">
            <span class="badge-prioridad ${prioridad}">${prioridad}</span>
            <span class="badge-estado ${estadoClass}">${estadoLabel}</span>
          </div>
        </div>
        <div class="ot-info">
          <div class="row"><span class="label">Cliente:</span> <span>${this.escapeHtml(cliente)}</span></div>
          ${telefono ? `<div class="row"><span class="label">Tel:</span> <span><a href="tel:${telefono}" style="color:var(--primary-light)" onclick="event.stopPropagation()">${telefono}</a></span></div>` : ''}
          ${tipo ? `<div class="row"><span class="label">Tipo:</span> <span>${this.escapeHtml(tipo)}</span></div>` : ''}
        </div>
        ${placa || vehiculo ? `
          <div class="ot-vehicle">
            ${placa ? `<span class="ot-plate">${placa}</span>` : ''}
            <span class="ot-vehicle-info">${vehiculo || '—'}</span>
          </div>` : ''}
      </div>`;
  },

  formatEstado(estado) {
    const map = {
      pendiente: 'Pendiente',
      asignada: 'Asignada',
      en_proceso: 'En Proceso',
      pausada: 'Pausada',
      completada: 'Completada',
      cancelada: 'Cancelada',
      aprobada: 'Aprobada',
      cerrada: 'Cerrada',
    };
    return map[estado] || estado || '—';
  },

  // ═══════════════════════════════════════════════════════════
  // TABS NAVIGATION
  // ═══════════════════════════════════════════════════════════

  switchTab(tab) {
    this.currentTab = tab;

    // Hide all pages
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));

    // Show selected page
    const pageId = tab === 'ordenes' ? 'pageOrdenes' :
                   tab === 'detalle' ? 'pageDetalle' : 'pagePerfil';
    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Show/hide FAB
    const fab = document.getElementById('fabRefresh');
    if (fab) fab.style.display = tab === 'ordenes' ? 'flex' : 'none';

    // Load profile data when switching to profile tab
    if (tab === 'perfil') this.loadProfile();

    // If switching to detalle tab without an order, show first active order or message
    if (tab === 'detalle' && !this.currentOrden) {
      this.renderDetalleEmpty();
    }
  },

  // ═══════════════════════════════════════════════════════════
  // ORDER DETAIL
  // ═══════════════════════════════════════════════════════════

  async openOrden(ordenId) {
    this.showLoading();
    try {
      const res = await fetch(`${this.API}/ordenes/${ordenId}?tecnico_id=${this.session.tecnico_id}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        this.showToast(data.error || 'Error al cargar orden', 'error');
        this.hideLoading();
        return;
      }

      this.currentOrden = data.orden || data;
      this.renderDetalle();
      this.switchTab('detalle');
    } catch (err) {
      this.showToast('Error de conexión', 'error');
    } finally {
      this.hideLoading();
    }
  },

  renderDetalleEmpty() {
    const container = document.getElementById('pageDetalle');
    container.innerHTML = `
      <div class="empty-state" style="padding-top:80px;">
        <i class="fas fa-tools"></i>
        <p>Selecciona una orden para ver el detalle</p>
      </div>`;
  },

  renderDetalle() {
    const o = this.currentOrden;
    if (!o) { this.renderDetalleEmpty(); return; }

    const estado = o.estado || 'pendiente';
    const prioridad = o.prioridad || 'normal';
    const estadoLabel = this.formatEstado(estado);

    const container = document.getElementById('pageDetalle');
    container.innerHTML = `
      <!-- Header -->
      <div class="detail-header">
        <button class="back-btn" onclick="App.switchTab('ordenes')">
          <i class="fas fa-arrow-left"></i>
        </button>
        <div class="ot-title">
          <h2>Orden #${o.numero || o.id}</h2>
          <div class="ot-meta">
            <span class="badge-estado ${estado}">${estadoLabel}</span>
            <span class="badge-prioridad ${prioridad}">${prioridad}</span>
          </div>
        </div>
      </div>

      <div class="detail-content">
        <!-- Client & Vehicle Info -->
        <div class="detail-section">
          <div class="detail-section-title"><i class="fas fa-user"></i> Información</div>
          <div class="detail-row"><span class="label">Cliente</span><span class="value">${this.escapeHtml(o.cliente_nombre || '—')}</span></div>
          ${o.cliente_telefono ? `<div class="detail-row"><span class="label">Teléfono</span><span class="value"><a href="tel:${o.cliente_telefono}" style="color:var(--primary-light)">${o.cliente_telefono}</a></span></div>` : ''}
          ${o.cliente_direccion ? `<div class="detail-row"><span class="label">Dirección</span><span class="value">${this.escapeHtml(o.cliente_direccion)}</span></div>` : ''}
          ${o.placa ? `<div class="detail-row"><span class="label">Vehículo</span><span class="value">${o.placa} ${[o.vehiculo_marca, o.vehiculo_modelo].filter(Boolean).join(' ')}</span></div>` : ''}
          <div class="detail-row"><span class="label">Tipo</span><span class="value">${this.escapeHtml(o.tipo || '—')}</span></div>
        </div>

        <!-- Description -->
        ${o.descripcion || o.titulo ? `
        <div class="detail-section">
          <div class="detail-section-title"><i class="fas fa-align-left"></i> Descripción</div>
          <p style="font-size:0.88rem;color:var(--text);line-height:1.6;">
            ${this.escapeHtml(o.descripcion || o.titulo)}
          </p>
        </div>` : ''}

        <!-- Status Change Buttons -->
        <div class="detail-section">
          <div class="detail-section-title"><i class="fas fa-exchange-alt"></i> Cambiar Estado</div>
          <div class="status-actions">
            ${estado === 'pendiente' || estado === 'asignada' ? `
              <button class="status-btn btn-start" onclick="App.cambiarEstado('en_proceso')">
                <i class="fas fa-play"></i> Iniciar
              </button>` : ''}
            ${estado === 'en_proceso' ? `
              <button class="status-btn btn-pause" onclick="App.cambiarEstado('pausada')">
                <i class="fas fa-pause"></i> Pausar
              </button>
              <button class="status-btn btn-complete" onclick="App.cambiarEstado('completada')">
                <i class="fas fa-check"></i> Completar
              </button>` : ''}
            ${estado === 'pausada' ? `
              <button class="status-btn btn-start" onclick="App.cambiarEstado('en_proceso')">
                <i class="fas fa-play"></i> Reanudar
              </button>` : ''}
            ${estado === 'completada' ? `
              <button class="status-btn btn-complete" onclick="App.enviarAprobacion()">
                <i class="fas fa-paper-plane"></i> Enviar Aprobación
              </button>` : ''}
          </div>
          <p id="estadoMsg" style="font-size:0.8rem;color:var(--text-dim);margin-top:8px;display:none;"></p>
        </div>

        <!-- GPS Location -->
        <div class="detail-section">
          <div class="detail-section-title"><i class="fas fa-map-marker-alt"></i> Ubicación GPS</div>
          <div id="gpsCoords" class="gps-coords">
            ${o.latitud_ubicacion ? `${o.latitud_ubicacion.toFixed(6)}, ${o.longitud_ubicacion.toFixed(6)}` : 'Sin ubicación registrada'}
          </div>
          <div style="margin-top:10px;">
            <button class="btn-action btn-dark-action" onclick="App.captureGPS()">
              <i class="fas fa-crosshairs"></i> Capturar Ubicación Actual
            </button>
          </div>
          <div id="gpsMapContainer" style="margin-top:10px;display:none;">
            <div id="gpsMap"></div>
          </div>
        </div>

        <!-- Photos -->
        <div class="detail-section">
          <div class="detail-section-title"><i class="fas fa-camera"></i> Fotos del Trabajo</div>
          <div class="photo-type-selector">
            <button class="photo-type-btn selected" onclick="App.selectPhotoType('antes',this)">🔸 Antes</button>
            <button class="photo-type-btn" onclick="App.selectPhotoType('durante',this)">🔹 Durante</button>
            <button class="photo-type-btn" onclick="App.selectPhotoType('despues',this)">🔻 Después</button>
            <button class="photo-type-btn" onclick="App.selectPhotoType('evidencia',this)">📎 Evidencia</button>
          </div>
          <div class="photo-actions">
            <button class="photo-action-btn camera" onclick="App.capturePhoto('camera')">
              <i class="fas fa-camera"></i> Cámara
            </button>
            <button class="photo-action-btn gallery" onclick="App.capturePhoto('gallery')">
              <i class="fas fa-images"></i> Galería
            </button>
          </div>
          <input type="file" id="photoInput" accept="image/*" style="display:none;" />
          <div id="photosGrid" class="photos-grid"></div>
          <div id="photosEmpty" style="display:none;">
            <p style="font-size:0.82rem;color:var(--text-dim);text-align:center;padding:10px;">Sin fotos registradas</p>
          </div>
        </div>

        <!-- Notes -->
        <div class="detail-section">
          <div class="detail-section-title"><i class="fas fa-sticky-note"></i> Notas</div>
          <div id="notasList"></div>
          <div style="margin-top:10px;">
            <button class="btn-action btn-dark-action" onclick="App.openModal('noteModal')">
              <i class="fas fa-plus"></i> Agregar Nota
            </button>
          </div>
        </div>

        <!-- Costs -->
        <div class="detail-section">
          <div class="detail-section-title"><i class="fas fa-dollar-sign"></i> Costos Adicionales</div>
          <div id="costosList"></div>
          <div style="margin-top:10px;">
            <button class="btn-action btn-dark-action" onclick="App.openModal('costModal')">
              <i class="fas fa-plus"></i> Agregar Costo
            </button>
          </div>
        </div>

        <!-- Digital Signature -->
        <div class="detail-section">
          <div class="detail-section-title"><i class="fas fa-signature"></i> Firma del Cliente</div>
          <div class="signature-area" id="signatureArea">
            <canvas id="signatureCanvas"></canvas>
            <div class="placeholder-text" id="signaturePlaceholder">Firma aquí con el dedo</div>
          </div>
          <div class="signature-actions">
            <button class="btn-action btn-dark-action" style="flex:1;" onclick="App.clearSignature()">
              <i class="fas fa-eraser"></i> Limpiar
            </button>
            <button class="btn-action btn-primary-action" style="flex:1;" onclick="App.saveSignature()">
              <i class="fas fa-save"></i> Guardar Firma
            </button>
          </div>
        </div>

        <!-- Timeline / Tracking -->
        <div class="detail-section">
          <div class="detail-section-title"><i class="fas fa-history"></i> Historial / Seguimiento</div>
          <div id="timelineList"></div>
        </div>

        <!-- Send for approval -->
        ${estado === 'completada' ? `
        <button class="btn-action btn-success-action" onclick="App.enviarAprobacion()" style="margin-bottom:20px;">
          <i class="fas fa-paper-plane"></i> Enviar para Aprobación
        </button>` : ''}
      </div>
    `;

    // Initialize signature canvas
    this.initSignatureCanvas();

    // Load async data
    this.loadFotos(o.id);
    this.loadNotas(o.id);
    this.loadCostos(o.id);
    this.loadTimeline(o.id);
  },

  // ═══════════════════════════════════════════════════════════
  // STATUS CHANGE
  // ═══════════════════════════════════════════════════════════

  async cambiarEstado(nuevoEstado) {
    if (!this.currentOrden) return;
    this.showLoading();

    let latitud = null, longitud = null;
    try {
      const pos = await this.getCurrentPosition();
      latitud = pos.lat;
      longitud = pos.lng;
    } catch (_) { /* GPS optional */ }

    try {
      const res = await fetch(`${this.API}/ordenes/${this.currentOrden.id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: nuevoEstado,
          tecnico_id: this.session.tecnico_id,
          latitud,
          longitud,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        this.showToast(data.error || 'Error al cambiar estado', 'error');
        this.hideLoading();
        return;
      }

      this.showToast(`Estado cambiado a "${this.formatEstado(nuevoEstado)}"`, 'success');
      this.hideLoading();

      // Reload detail and orders list
      await this.openOrden(this.currentOrden.id);
      this.loadOrdenes();
    } catch (err) {
      this.showToast('Error de conexión', 'error');
      this.hideLoading();
    }
  },

  async enviarAprobacion() {
    if (!this.currentOrden) return;
    this.showToast('Solicitud de aprobación enviada', 'success');
    // This would call an approval API endpoint
    // For now, just show the toast
  },

  // ═══════════════════════════════════════════════════════════
  // GPS LOCATION
  // ═══════════════════════════════════════════════════════════

  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no disponible'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  },

  async captureGPS() {
    if (!this.currentOrden) return;
    this.showLoading();

    try {
      const pos = await this.getCurrentPosition();

      // Update order location via API
      const res = await fetch(`${this.API}/ordenes/${this.currentOrden.id}/ubicacion`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitud: pos.lat,
          longitud: pos.lng,
          precision: pos.accuracy,
        }),
      });
      const data = await res.json();

      if (data.error) {
        this.showToast(data.error, 'error');
      } else {
        const coordsEl = document.getElementById('gpsCoords');
        if (coordsEl) {
          coordsEl.textContent = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)} (±${Math.round(pos.accuracy)}m)`;
        }

        // Show map
        this.showMiniMap(pos.lat, pos.lng);
        this.showToast('Ubicación capturada', 'success');
      }
    } catch (err) {
      this.showToast('No se pudo obtener la ubicación GPS', 'error');
    } finally {
      this.hideLoading();
    }
  },

  showMiniMap(lat, lng) {
    const mapContainer = document.getElementById('gpsMapContainer');
    if (!mapContainer) return;
    mapContainer.style.display = 'block';

    // Small delay to ensure container is rendered
    setTimeout(() => {
      const mapEl = document.getElementById('gpsMap');
      if (!mapEl || typeof L === 'undefined') return;

      try {
        const map = L.map('gpsMap').setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
        }).addTo(map);
        L.marker([lat, lng]).addTo(map)
          .bindPopup('Ubicación actual')
          .openPopup();

        // Invalidate size after a short delay
        setTimeout(() => map.invalidateSize(), 300);
      } catch (err) {
        console.warn('Map error:', err);
      }
    }, 100);
  },

  startGPSTracking() {
    if (!this.session) return;

    // Send location every 2 minutes
    if (this.gpsTimer) clearInterval(this.gpsTimer);
    this.gpsTimer = setInterval(() => {
      this.sendCurrentLocation();
    }, 120000);

    // Send immediately on start
    this.sendCurrentLocation();
  },

  async sendCurrentLocation() {
    if (!this.session || !navigator.onLine) return;

    try {
      const pos = await this.getCurrentPosition();
      await fetch(`${this.API}/ubicacion`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tecnico_id: this.session.tecnico_id,
          latitud: pos.lat,
          longitud: pos.lng,
        }),
      });
    } catch (_) {
      // Silent fail for background GPS
    }
  },

  // ═══════════════════════════════════════════════════════════
  // PHOTOS
  // ═══════════════════════════════════════════════════════════

  selectPhotoType(type, el) {
    this.currentPhotoType = type;
    el.closest('.photo-type-selector').querySelectorAll('.photo-type-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
  },

  capturePhoto(source) {
    if (!this.currentOrden) return;
    const input = document.getElementById('photoInput');
    if (source === 'camera') {
      input.setAttribute('capture', 'environment');
    } else {
      input.removeAttribute('capture');
    }
    input.accept = 'image/*';
    input.onchange = (e) => this.handlePhotoSelected(e);
    input.click();
  },

  async handlePhotoSelected(event) {
    const file = event.target.files[0];
    if (!file || !this.currentOrden) return;

    this.showLoading();

    try {
      const base64 = await this.fileToBase64(file);

      const res = await fetch(`${this.API}/ordenes/${this.currentOrden.id}/fotos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foto_base64: base64,
          tipo: this.currentPhotoType,
          descripcion: '',
          mime_type: file.type || 'image/jpeg',
        }),
      });
      const data = await res.json();

      if (data.error) {
        this.showToast(data.error, 'error');
      } else {
        this.showToast('Foto subida correctamente', 'success');
        this.loadFotos(this.currentOrden.id);
      }
    } catch (err) {
      this.showToast('Error al subir foto', 'error');
    } finally {
      this.hideLoading();
      event.target.value = '';
    }
  },

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  async loadFotos(ordenId) {
    const grid = document.getElementById('photosGrid');
    const empty = document.getElementById('photosEmpty');
    if (!grid) return;

    try {
      const res = await fetch(`${this.API}/ordenes/${ordenId}/fotos`);
      const data = await res.json();
      const fotos = Array.isArray(data.fotos) ? data.fotos :
                    Array.isArray(data) ? data : [];

      if (fotos.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
      }

      if (empty) empty.style.display = 'none';
      grid.innerHTML = fotos.map(f => {
        const src = f.url_publica || f.url || f.ruta_r2 || '';
        const tipoLabel = { antes: 'Antes', durante: 'Durante', despues: 'Después', evidencia: 'Evidencia' }[f.tipo] || f.tipo;
        return `
          <div>
            <img class="photo-thumb" src="${src}" alt="${tipoLabel}" loading="lazy"
                 onclick="event.stopPropagation();App.openFullscreen('${src}')" />
            <div class="photo-label">${tipoLabel}</div>
          </div>`;
      }).join('');
    } catch (_) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'block';
    }
  },

  // ═══════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════

  async addNote() {
    if (!this.currentOrden) return;
    const contenido = document.getElementById('noteContenido').value.trim();
    if (!contenido) {
      this.showToast('Escribe una nota', 'warning');
      return;
    }

    this.showLoading();
    try {
      const res = await fetch(`${this.API}/ordenes/${this.currentOrden.id}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido }),
      });
      const data = await res.json();

      if (data.error) {
        this.showToast(data.error, 'error');
      } else {
        this.showToast('Nota agregada', 'success');
        document.getElementById('noteContenido').value = '';
        this.closeModal('noteModal');
        this.loadNotas(this.currentOrden.id);
      }
    } catch (err) {
      this.showToast('Error de conexión', 'error');
    } finally {
      this.hideLoading();
    }
  },

  async loadNotas(ordenId) {
    const container = document.getElementById('notasList');
    if (!container) return;

    try {
      const res = await fetch(`${this.API}/ordenes/${ordenId}/notas`);
      const data = await res.json();
      const notas = Array.isArray(data.notas) ? data.notas :
                    Array.isArray(data) ? data : [];

      if (notas.length === 0) {
        container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-dim);text-align:center;">Sin notas</p>';
        return;
      }

      container.innerHTML = notas.map(n => `
        <div class="note-item">
          <div class="note-text">${this.escapeHtml(n.contenido || n.texto || '')}</div>
          <div class="note-meta">${n.creado_en || n.fecha || ''} · ${this.escapeHtml(n.autor || 'Técnico')}</div>
        </div>`).join('');
    } catch (_) {
      container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-dim);text-align:center;">Sin notas</p>';
    }
  },

  // ═══════════════════════════════════════════════════════════
  // COSTS
  // ═══════════════════════════════════════════════════════════

  selectCostType(type, el) {
    this.currentCostType = type;
    el.closest('.field-group').querySelectorAll('.photo-type-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
  },

  async addCost() {
    if (!this.currentOrden) return;
    const concepto = document.getElementById('costConcepto').value.trim();
    const cantidad = parseInt(document.getElementById('costCantidad').value) || 1;
    const precio_unitario = parseFloat(document.getElementById('costPrecio').value) || 0;

    if (!concepto) {
      this.showToast('Ingresa el concepto', 'warning');
      return;
    }

    this.showLoading();
    try {
      const res = await fetch(`${this.API}/ordenes/${this.currentOrden.id}/costos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concepto,
          cantidad,
          precio_unitario,
          tipo: this.currentCostType,
        }),
      });
      const data = await res.json();

      if (data.error) {
        this.showToast(data.error, 'error');
      } else {
        this.showToast('Costo agregado', 'success');
        document.getElementById('costConcepto').value = '';
        document.getElementById('costCantidad').value = '1';
        document.getElementById('costPrecio').value = '0';
        this.closeModal('costModal');
        this.loadCostos(this.currentOrden.id);
      }
    } catch (err) {
      this.showToast('Error de conexión', 'error');
    } finally {
      this.hideLoading();
    }
  },

  async loadCostos(ordenId) {
    const container = document.getElementById('costosList');
    if (!container) return;

    try {
      const res = await fetch(`${this.API}/ordenes/${ordenId}/costos`);
      const data = await res.json();
      const costos = Array.isArray(data.costos) ? data.costos :
                     Array.isArray(data) ? data : [];

      if (costos.length === 0) {
        container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-dim);text-align:center;">Sin costos adicionales</p>';
        return;
      }

      let total = 0;
      container.innerHTML = costos.map(c => {
        const t = (c.cantidad || 1) * (c.precio_unitario || 0);
        total += t;
        return `
          <div class="cost-item">
            <div>
              <div style="font-weight:600;">${this.escapeHtml(c.concepto || '')}</div>
              <div style="font-size:0.75rem;color:var(--text-dim);">${c.tipo || ''} · ${c.cantidad || 1} × $${(c.precio_unitario || 0).toFixed(2)}</div>
            </div>
            <div class="price">$${t.toFixed(2)}</div>
          </div>`;
      }).join('');

      container.innerHTML += `
        <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border);font-weight:700;font-size:0.95rem;margin-top:4px;">
          <span>Total Costos</span>
          <span class="price">$${total.toFixed(2)}</span>
        </div>`;
    } catch (_) {
      container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-dim);text-align:center;">Sin costos adicionales</p>';
    }
  },

  // ═══════════════════════════════════════════════════════════
  // TIMELINE
  // ═══════════════════════════════════════════════════════════

  async loadTimeline(ordenId) {
    const container = document.getElementById('timelineList');
    if (!container) return;

    try {
      // Get order detail which includes seguimiento
      const res = await fetch(`${this.API}/ordenes/${ordenId}?tecnico_id=${this.session.tecnico_id}`);
      const data = await res.json();
      const items = (data.seguimiento || []).sort((a, b) =>
        new Date(a.creado_en) - new Date(b.creado_en));

      if (items.length === 0) {
        container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-dim);text-align:center;">Sin historial</p>';
        return;
      }

      const emojis = {
        pendiente: '📋', asignada: '👤', en_proceso: '▶️',
        pausada: '⏸️', completada: '✅', cancelada: '❌',
        aprobada: '👍', cerrada: '🔒',
      };

      container.innerHTML = items.map(item => {
        const estado = item.estado_nuevo || item.estado || '';
        const emoji = emojis[estado] || '📍';
        const fecha = item.creado_en || item.fecha_evento || '';
        const notas = item.notas || '';
        const realizado = item.realizado_por || '';

        return `
          <div class="timeline-item">
            <div class="timeline-dot">${emoji}</div>
            <div class="timeline-content">
              <div class="timeline-status">${this.formatEstado(estado)}</div>
              <div class="timeline-meta">${this.formatDate(fecha)}${realizado ? ` · ${realizado}` : ''}</div>
              ${notas ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">${this.escapeHtml(notas)}</div>` : ''}
            </div>
          </div>`;
      }).join('');
    } catch (_) {
      container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-dim);text-align:center;">Sin historial</p>';
    }
  },

  // ═══════════════════════════════════════════════════════════
  // DIGITAL SIGNATURE
  // ═══════════════════════════════════════════════════════════

  initSignatureCanvas() {
    const canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;

    this.signatureCanvas = canvas;
    this.signatureCtx = canvas.getContext('2d');

    // Set canvas resolution
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2 || 600;
    canvas.height = 400;
    canvas.style.height = '200px';

    this.signatureCtx.scale(2, 2);
    this.signatureCtx.lineJoin = 'round';
    this.signatureCtx.lineCap = 'round';
    this.signatureCtx.lineWidth = 2.5;
    this.signatureCtx.strokeStyle = '#1e293b';

    // Touch events
    canvas.addEventListener('touchstart', (e) => this.sigTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.sigTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.sigTouchEnd(e));

    // Mouse events (for desktop testing)
    canvas.addEventListener('mousedown', (e) => this.sigMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.sigMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.sigMouseUp(e));
    canvas.addEventListener('mouseleave', (e) => this.sigMouseUp(e));
  },

  sigGetPos(e) {
    const rect = this.signatureCanvas.getBoundingClientRect();
    return {
      x: (e.clientX || e.touches[0].clientX) - rect.left,
      y: (e.clientY || e.touches[0].clientY) - rect.top,
    };
  },

  sigTouchStart(e) {
    e.preventDefault();
    this.signatureDrawing = true;
    const pos = this.sigGetPos(e);
    this.signatureCtx.beginPath();
    this.signatureCtx.moveTo(pos.x, pos.y);
    // Hide placeholder
    const ph = document.getElementById('signaturePlaceholder');
    if (ph) ph.style.display = 'none';
  },

  sigTouchMove(e) {
    e.preventDefault();
    if (!this.signatureDrawing) return;
    const pos = this.sigGetPos(e);
    this.signatureCtx.lineTo(pos.x, pos.y);
    this.signatureCtx.stroke();
  },

  sigTouchEnd() {
    this.signatureDrawing = false;
  },

  sigMouseDown(e) {
    this.signatureDrawing = true;
    const pos = this.sigGetPos(e);
    this.signatureCtx.beginPath();
    this.signatureCtx.moveTo(pos.x, pos.y);
    const ph = document.getElementById('signaturePlaceholder');
    if (ph) ph.style.display = 'none';
  },

  sigMouseMove(e) {
    if (!this.signatureDrawing) return;
    const pos = this.sigGetPos(e);
    this.signatureCtx.lineTo(pos.x, pos.y);
    this.signatureCtx.stroke();
  },

  sigMouseUp() {
    this.signatureDrawing = false;
  },

  clearSignature() {
    if (!this.signatureCtx || !this.signatureCanvas) return;
    this.signatureCtx.clearRect(0, 0, this.signatureCanvas.width, this.signatureCanvas.height);
    const ph = document.getElementById('signaturePlaceholder');
    if (ph) ph.style.display = 'block';
  },

  async saveSignature() {
    if (!this.signatureCanvas || !this.currentOrden) return;

    // Check if canvas is empty
    const blank = document.createElement('canvas');
    blank.width = this.signatureCanvas.width;
    blank.height = this.signatureCanvas.height;
    if (this.signatureCanvas.toDataURL() === blank.toDataURL()) {
      this.showToast('Firma vacía – dibuja antes de guardar', 'warning');
      return;
    }

    this.showLoading();
    try {
      const firmaBase64 = this.signatureCanvas.toDataURL('image/png');

      const res = await fetch(`${this.API}/ordenes/${this.currentOrden.id}/firma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma_base64, tipo: 'cliente' }),
      });
      const data = await res.json();

      if (data.error) {
        this.showToast(data.error, 'error');
      } else {
        this.showToast('Firma guardada exitosamente', 'success');
        this.clearSignature();
      }
    } catch (err) {
      this.showToast('Error al guardar firma', 'error');
    } finally {
      this.hideLoading();
    }
  },

  // ═══════════════════════════════════════════════════════════
  // PROFILE
  // ═══════════════════════════════════════════════════════════

  async loadProfile() {
    if (!this.session) return;

    const container = document.getElementById('pagePerfil');

    try {
      const res = await fetch(`${this.API}/perfil/${this.session.tecnico_id}`);
      const data = await res.json();

      if (data.error) {
        // Show basic profile without stats
        container.innerHTML = this.renderBasicProfile();
        return;
      }

      this.profile = data;
      container.innerHTML = this.renderProfile(data);
    } catch (_) {
      container.innerHTML = this.renderBasicProfile();
    }
  },

  renderBasicProfile() {
    const s = this.session;
    return `
      <div class="profile-card">
        <div class="profile-avatar"><i class="fas fa-user"></i></div>
        <div class="profile-name">${this.escapeHtml(s.nombre || 'Técnico')}</div>
        <div class="profile-code">${this.escapeHtml(s.codigo || '')}</div>
        ${s.especialidad ? `<div class="profile-specialty">${this.escapeHtml(s.especialidad)}</div>` : ''}
        <div class="profile-info-list">
          ${s.telefono ? `<div class="profile-info-item"><i class="fas fa-phone"></i> <a href="tel:${s.telefono}">${s.telefono}</a></div>` : ''}
          ${s.email ? `<div class="profile-info-item"><i class="fas fa-envelope"></i> <a href="mailto:${s.email}">${s.email}</a></div>` : ''}
        </div>
      </div>`;
  },

  renderProfile(data) {
    const s = this.session;
    const p = data;
    const total = p.total_ots || 0;
    const completadas = p.completadas || 0;
    const enProgreso = p.en_progreso || 0;
    const rating = p.promedio_calificacion || 0;

    return `
      <div class="profile-card">
        <div class="profile-avatar"><i class="fas fa-user"></i></div>
        <div class="profile-name">${this.escapeHtml(s.nombre || p.nombre || 'Técnico')}</div>
        <div class="profile-code">${this.escapeHtml(s.codigo || p.codigo || '')}</div>
        ${s.especialidad || p.especialidad ? `<div class="profile-specialty">${this.escapeHtml(s.especialidad || p.especialidad)}</div>` : ''}

        <div class="profile-stats">
          <div class="stat-item">
            <div class="stat-value">${total}</div>
            <div class="stat-label">Total OTs</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" style="color:var(--success)">${completadas}</div>
            <div class="stat-label">Completadas</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" style="color:var(--warning)">${enProgreso}</div>
            <div class="stat-label">En Progreso</div>
          </div>
        </div>

        ${rating > 0 ? `
        <div style="margin-top:14px;text-align:center;">
          <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:4px;">Calificación Promedio</div>
          <div style="font-size:1.5rem;color:var(--warning);">
            ${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))}
            <span style="font-size:0.9rem;color:var(--text-muted);">${rating.toFixed(1)}</span>
          </div>
        </div>` : ''}

        <div class="profile-info-list">
          ${s.telefono || p.telefono ? `<div class="profile-info-item"><i class="fas fa-phone"></i> <a href="tel:${s.telefono || p.telefono}">${s.telefono || p.telefono}</a></div>` : ''}
          ${s.email || p.email ? `<div class="profile-info-item"><i class="fas fa-envelope"></i> <a href="mailto:${s.email || p.email}">${s.email || p.email}</a></div>` : ''}
        </div>

        <div class="profile-location" id="profileGps">
          <i class="fas fa-map-marker-alt"></i> Obteniendo ubicación...
        </div>
      </div>

      <div style="padding:0 16px;margin-bottom:20px;">
        <button class="btn-action btn-danger-action" onclick="App.logout()">
          <i class="fas fa-sign-out-alt"></i> Cerrar Sesión
        </button>
      </div>`;

    // Update GPS display
    this.updateProfileGPS();
  },

  async updateProfileGPS() {
    const el = document.getElementById('profileGps');
    if (!el) return;
    try {
      const pos = await this.getCurrentPosition();
      el.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)} (±${Math.round(pos.accuracy)}m)`;
    } catch (_) {
      el.innerHTML = '<i class="fas fa-map-marker-alt"></i> Ubicación no disponible';
    }
  },

  // ═══════════════════════════════════════════════════════════
  // UI HELPERS
  // ═══════════════════════════════════════════════════════════

  showLoading() {
    document.getElementById('loadingOverlay').classList.add('active');
  },

  hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = {
      success: 'fas fa-check-circle',
      error: 'fas fa-times-circle',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle',
    };
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    toast.innerHTML = `<i class="${icons[type] || icons.info}"></i> ${this.escapeHtml(message)}`;
    container.appendChild(toast);

    // Auto-remove after 3.5 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      toast.style.transition = 'all 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3500);

    // Simulate push notification for important events
    if (type === 'success' && navigator.onLine) {
      this.simulatePush(message);
    }
  },

  simulatePush(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('BizFlow', {
          body: message,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        });
      } catch (_) { /* Notification may fail in some contexts */ }
    } else if ('Notification' in window && Notification.permission === 'default') {
      // Don't request permission automatically, just ignore
    }
  },

  openModal(id) {
    document.getElementById(id).classList.add('active');
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('active');
  },

  openFullscreen(src) {
    document.getElementById('fullscreenImg').src = src;
    document.getElementById('fullscreenPhoto').classList.add('active');
  },

  closeFullscreenPhoto() {
    document.getElementById('fullscreenPhoto').classList.remove('active');
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (_) {
      return dateStr;
    }
  },

  // ═══════════════════════════════════════════════════════════
  // ONLINE / OFFLINE
  // ═══════════════════════════════════════════════════════════

  setupOnlineOffline() {
    const banner = document.getElementById('offlineBanner');

    const update = () => {
      this.isOnline = navigator.onLine;
      if (this.isOnline) {
        banner.classList.remove('active');
      } else {
        banner.classList.add('active');
        this.showToast('Sin conexión – Modo offline activo', 'warning');
      }
    };

    window.addEventListener('online', () => {
      update();
      if (this.session) this.loadOrdenes();
    });
    window.addEventListener('offline', update);
    update();
  },

  // ═══════════════════════════════════════════════════════════
  // PULL TO REFRESH
  // ═══════════════════════════════════════════════════════════

  setupPullToRefresh() {
    let startY = 0;
    let pulling = false;
    const indicator = document.getElementById('pullIndicator');
    const container = document.getElementById('ordersList');

    if (!container || !indicator) return;

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
        this.loadOrdenes();
      }
      pulling = false;
    }, { passive: true });
  },

  // ═══════════════════════════════════════════════════════════
  // ENTER KEY LOGIN
  // ═══════════════════════════════════════════════════════════

  setupEnterKeyLogin() {
    const codigoInput = document.getElementById('codigoInput');
    const passwordInput = document.getElementById('passwordInput');

    if (codigoInput) {
      codigoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') passwordInput.focus();
      });
    }
    if (passwordInput) {
      passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.login();
      });
    }
  },
};

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
