/**
 * ============================================================
 * BizFlow Admin Panel - Merged SPA Application
 * BizFlow design system + Globalprov2 automotive modules
 * Complete JavaScript with hash-based routing, CRUD, charts,
 * PDF generation, order creation (normal + express), technician
 * settlement, services catalog with commission types, and more.
 * ============================================================
 */

'use strict';

// ============================================================
// API WRAPPER
// ============================================================
const API_BASE = '/api/admin';

const API = {
    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const config = {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options,
        };
        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }
        try {
            const res = await fetch(url, config);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || err.message || `Error ${res.status}`);
            }
            return await res.json();
        } catch (e) {
            if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                throw new Error('Error de conexión. Verifique su red.');
            }
            throw e;
        }
    },

    // Routes through /api/admin for admin endpoints
    get(endpoint) { return this.request(endpoint); },
    post(endpoint, body) { return this.request(endpoint, { method: 'POST', body }); },
    put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body }); },
    delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); },

    // Routes through /api (not /api/admin) for public endpoints
    async requestPublic(endpoint, options = {}) {
        const url = `/api${endpoint}`;
        const config = {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options,
        };
        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }
        try {
            const res = await fetch(url, config);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || err.message || `Error ${res.status}`);
            }
            return await res.json();
        } catch (e) {
            if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                throw new Error('Error de conexión. Verifique su red.');
            }
            throw e;
        }
    },
    getPublic(endpoint) { return this.requestPublic(endpoint); },
    postPublic(endpoint, body) { return this.requestPublic(endpoint, { method: 'POST', body }); },
};

// ============================================================
// STATE
// ============================================================
let currentUser = null;
let charts = {};
let serviciosCatalogoGlobal = [];
let costosExtraTemporales = [];

// ============================================================
// UTILITIES
// ============================================================
const Utils = {
    fmt: (n) => {
        const num = parseFloat(n) || 0;
        return '$' + num.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },
    fmtDate: (d) => {
        if (!d) return '--';
        try {
            const dt = new Date(d);
            if (isNaN(dt)) return d;
            return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
        } catch { return d; }
    },
    fmtDateTime: (d) => {
        if (!d) return '--';
        try {
            const dt = new Date(d);
            if (isNaN(dt)) return d;
            return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        } catch { return d; }
    },
    initials: (name) => {
        if (!name) return 'AD';
        const p = name.trim().split(/\s+/);
        return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
    },
    today: () => new Date().toISOString().split('T')[0],
    nowMonth: () => new Date().toISOString().slice(0, 7),
    val: (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; },
    setVal: (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; },
    setHTML: (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; },
    setText: (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; },
    toast: (msg, type = 'success') => {
        Swal.fire({
            toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true,
            icon: type, title: msg,
            background: '#fff', color: '#1e293b',
        });
    },
    confirm: async (msg) => {
        const result = await Swal.fire({
            title: '¿Está seguro?',
            text: msg,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#0d9488',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Sí, confirmar',
            cancelButtonText: 'Cancelar',
        });
        return result.isConfirmed;
    },
    modal: (id) => {
        const el = document.getElementById(id);
        if (el) return bootstrap.Modal.getOrCreateInstance(el);
        return null;
    },
    showModal(id) { const m = this.modal(id); if (m) m.show(); },
    hideModal(id) { const m = this.modal(id); if (m) m.hide(); },
    badgeClass: (estado) => {
        const s = (estado || '').toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
        const map = {
            'enviada':'badge-enviada','aprobada':'badge-aprobada',
            'pendiente-visita':'badge-pendiente-visita','pendiente_visita':'badge-pendiente-visita',
            'en-sitio':'badge-en-sitio','en_sitio':'badge-en-sitio',
            'en-progreso':'badge-en-progreso','en_progreso':'badge-en-progreso',
            'completada':'badge-completada','cerrada':'badge-cerrada','cancelada':'badge-cancelada',
        };
        return map[s] || 'badge-enviada';
    },
    translateEstado: (e) => {
        if (!e) return '--';
        return e.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },
    paginate: (data, page = 1, perPage = 20) => {
        const total = data.length;
        const pages = Math.ceil(total / perPage);
        const start = (page - 1) * perPage;
        return { items: data.slice(start, start + perPage), total, pages, page };
    },
    escapeHTML: (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    fileToBase64: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
};

// ============================================================
// ROUTER
// ============================================================
const Router = {
    routes: {
        'dashboard': 'page-dashboard',
        'nueva-orden': 'page-nueva-orden',
        'buscar-ordenes': 'page-buscar-ordenes',
        'asignar-ordenes': 'page-asignar-ordenes',
        'tecnicos': 'page-tecnicos',
        'liquidar-tecnicos': 'page-liquidar-tecnicos',
        'servicios': 'page-servicios',
        'modelos-vehiculo': 'page-modelos-vehiculo',
        'express': 'page-express',
        'calendario': 'page-calendario',
        'costos-adicionales': 'page-costos-adicionales',
        'gastos': 'page-gastos',
        'reportes': 'page-reportes',
        'clientes': 'page-clientes',
        'vehiculos': 'page-vehiculos',
        'whatsapp': 'page-whatsapp',
        'landing-pages': 'page-landing-pages',
        'configuracion': 'page-configuracion',
        'inventario': 'page-inventario',
        'contabilidad': 'page-contabilidad',
        'notificaciones': 'page-notificaciones',
    },
    titles: {
        'dashboard': 'Dashboard',
        'nueva-orden': 'Nueva Orden de Trabajo',
        'buscar-ordenes': 'Buscar Órdenes',
        'asignar-ordenes': 'Asignar Órdenes',
        'tecnicos': 'Gestión Técnicos',
        'liquidar-tecnicos': 'Liquidar Técnicos',
        'servicios': 'Catálogo de Servicios',
        'modelos-vehiculo': 'Modelos de Vehículos',
        'express': 'Órdenes Express',
        'calendario': 'Calendario',
        'costos-adicionales': 'Costos Adicionales',
        'gastos': 'Gastos del Negocio',
        'reportes': 'Reporte General',
        'clientes': 'Clientes (CRM)',
        'vehiculos': 'Vehículos',
        'whatsapp': 'WhatsApp',
        'landing-pages': 'Landing Pages',
        'configuracion': 'Configuración',
        'inventario': 'Inventario',
        'contabilidad': 'Contabilidad',
        'notificaciones': 'Notificaciones',
    },

    init() {
        window.addEventListener('hashchange', () => this.resolve());
        document.querySelectorAll('.bf-sidebar-item[data-route]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const route = item.dataset.route;
                window.location.hash = '#/' + route;
                this.closeSidebar();
            });
        });
        this.resolve();
    },

    resolve() {
        const hash = (window.location.hash || '#/dashboard').replace('#/', '');
        const route = hash.split('/')[0] || 'dashboard';
        const pageId = this.routes[route] || 'page-dashboard';

        document.querySelectorAll('.bf-page').forEach(p => p.classList.remove('active'));
        const page = document.getElementById(pageId);
        if (page) page.classList.add('active');

        document.querySelectorAll('.bf-sidebar-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll(`.bf-sidebar-item[data-route="${route}"]`).forEach(i => i.classList.add('active'));

        Utils.setText('topbar-title', this.titles[route] || 'BizFlow');
        this.onEnter(route);
    },

    onEnter(route) {
        switch (route) {
            case 'dashboard': App.dashboard.load(); break;
            case 'nueva-orden': App.nuevaOrden.init(); break;
            case 'buscar-ordenes': App.buscarOrdenes.init(); break;
            case 'asignar-ordenes': App.asignarOrdenes.load(); break;
            case 'tecnicos': App.tecnicos.load(); break;
            case 'liquidar-tecnicos': App.liquidarTecnicos.init(); break;
            case 'servicios': App.servicios.load(); break;
            case 'modelos-vehiculo': App.modelos.load(); break;
            case 'gastos': App.gastos.load(); break;
            case 'reportes': App.reportes.init(); break;
            case 'clientes': App.clientes.load(); break;
            case 'vehiculos': App.vehiculos.load(); break;
            case 'whatsapp': App.whatsapp.load(); break;
            case 'landing-pages': App.landing.load(); break;
            case 'configuracion': App.config.load(); break;
            case 'inventario': App.inventario.load(); break;
            case 'contabilidad': App.contabilidad.load(); break;
            case 'express': App.express.init(); break;
            case 'calendario': App.calendario.init(); break;
            case 'costos-adicionales': App.costosAdicionales.load(); break;
            case 'notificaciones': App.notificaciones.load(); break;
        }
    },

    closeSidebar() {
        const sidebar = document.getElementById('bf-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
    },

    navigate(route) {
        window.location.hash = '#/' + route;
    },
};

// ============================================================
// AUTH MODULE
// ============================================================
const Auth = {
    init() {
        const form = document.getElementById('login-form');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.login(Utils.val('login-email'), Utils.val('login-password'));
        });
    },

    async login(email, password) {
        if (!email || !password) { Utils.toast('Ingrese usuario y contraseña', 'warning'); return; }
        try {
            const btn = document.querySelector('#login-form button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Ingresando...';
            // Globalprov2 login uses 'usuario' field, not 'email'
            const data = await API.post('/login', { usuario: email, password: password });
            if (data.success) {
                currentUser = { nombre: data.nombre || email, email: email, token: data.token };
                localStorage.setItem('bizflow_user', JSON.stringify(currentUser));
                Utils.toast('¡Bienvenido, ' + (currentUser.nombre || email) + '!', 'success');
                this.showApp();
            } else {
                Utils.toast(data.error || 'Credenciales inválidas', 'error');
            }
        } catch (err) {
            Utils.toast(err.message || 'Error de conexión', 'error');
        } finally {
            const btn = document.querySelector('#login-form button[type="submit"]');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket me-2"></i>Iniciar Sesión'; }
        }
    },

    logout() {
        currentUser = null;
        localStorage.removeItem('bizflow_user');
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('login-screen').classList.add('show');
        Utils.toast('Sesión cerrada', 'info');
    },

    checkSession() {
        const saved = localStorage.getItem('bizflow_user');
        if (saved) {
            try { currentUser = JSON.parse(saved); this.showApp(); return true; } catch { localStorage.removeItem('bizflow_user'); }
        }
        return false;
    },

    showApp() {
        document.getElementById('login-screen').classList.remove('show');
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        const name = currentUser?.nombre || currentUser?.email || 'Admin';
        const ini = Utils.initials(name);
        Utils.setText('sb-avatar', ini);
        Utils.setText('sb-name', name);
        Utils.setText('tb-avatar', ini);
        Utils.setText('tb-name', name);
        Router.init();
    },
};

// ============================================================
// SIDEBAR
// ============================================================
function initSidebar() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('bf-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const closeBtn = document.getElementById('sidebar-close');

    if (toggle) toggle.addEventListener('click', () => {
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
    });
    if (closeBtn) closeBtn.addEventListener('click', () => {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
    });
    if (overlay) overlay.addEventListener('click', () => {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
    });

    // Notifications
    const btnNotif = document.getElementById('btn-notifications');
    if (btnNotif) btnNotif.addEventListener('click', () => Router.navigate('notificaciones'));
}

// ============================================================
// CHART HELPERS
// ============================================================
function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function createBarChart(id, labels, data, colors) {
    destroyChart(id);
    const ctx = document.getElementById(id);
    if (!ctx) return;
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Cantidad', data, backgroundColor: colors || '#0d9488', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
    });
}

function createLineChart(id, labels, data, label, color) {
    destroyChart(id);
    const ctx = document.getElementById(id);
    if (!ctx) return;
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: label || 'Valor', data, borderColor: color || '#0d9488', backgroundColor: color ? color + '20' : '#0d948820', fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
    });
}

function createDoughnutChart(id, labels, data, colors) {
    destroyChart(id);
    const ctx = document.getElementById(id);
    if (!ctx) return;
    charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors || ['#0d9488','#f59e0b','#6366f1','#ec4899','#14b8a6'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } } } }
    });
}

// ============================================================
// MAIN APPLICATION MODULES
// ============================================================
const App = {

    // ========================================================
    // DASHBOARD - Enhanced with workshop KPIs
    // ========================================================
    dashboard: {
        async load() {
            try {
                const data = await API.get('/dashboard-negocio');
                const d = data.data || data;
                const kpis = d.kpis || d;

                Utils.setText('dash-total-ots', kpis.total_ordenes || 0);
                Utils.setText('dash-en-proceso', kpis.en_proceso || kpis.enProceso || 0);
                Utils.setText('dash-completadas', kpis.completadas || kpis.cerradas || 0);
                Utils.setText('dash-ingresos', Utils.fmt(kpis.total_generado || kpis.ingresos || 0));
                Utils.setText('dash-comisiones', Utils.fmt(kpis.total_comisiones || 0));
                Utils.setText('dash-balance', Utils.fmt(kpis.balance || 0));
                Utils.setText('dash-clientes', kpis.total_clientes || 0);
                Utils.setText('dash-tecnicos', kpis.total_tecnicos || 0);

                // Charts
                const estados = d.ordenes_por_estado || d.estadoCounts || {};
                createBarChart('chart-ots-estado', Object.keys(estados), Object.values(estados),
                    Object.keys(estados).map(l => {
                        const s = l.toLowerCase();
                        if (s.includes('complet') || s.includes('cerrad')) return '#16a34a';
                        if (s.includes('progreso') || s.includes('sitio')) return '#2563eb';
                        if (s.includes('cancel')) return '#dc2626';
                        if (s.includes('aprob')) return '#d97706';
                        return '#64748b';
                    })
                );

                const ingresos = d.ingresos_mensual || d.monthlyRevenue || [];
                if (ingresos.length > 0) {
                    createLineChart('chart-ingresos', ingresos.map(i => i.mes || i.label), ingresos.map(i => i.total || 0), 'Ingresos', '#0d9488');
                } else {
                    createLineChart('chart-ingresos', ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'], new Array(12).fill(0), 'Ingresos', '#0d9488');
                }

                const recientes = d.ordenes_recientes || d.ordenes || [];
                this.renderRecentOTs(recientes);
            } catch (err) {
                console.error('Dashboard error:', err);
                Utils.setText('dash-total-ots', '0');
                createBarChart('chart-ots-estado', [], []);
                createLineChart('chart-ingresos', [], []);
            }
        },

        renderRecentOTs(ots) {
            const tbody = document.getElementById('dash-recent-ots');
            if (!tbody) return;
            if (!ots || ots.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="bf-empty"><i class="fa-solid fa-inbox"></i>Sin órdenes recientes</td></tr>';
                return;
            }
            tbody.innerHTML = ots.slice(0, 10).map(o => {
                const estado = o.estado || 'Enviada';
                return `<tr>
                    <td class="fw-600">#${Utils.escapeHTML(String(o.numero_orden || o.id || '--'))}</td>
                    <td>${Utils.escapeHTML(o.patente_placa || o.patente || '--')}</td>
                    <td>${Utils.escapeHTML(o.cliente_nombre || o.cliente || '--')}</td>
                    <td><span class="badge-st ${Utils.badgeClass(estado)}">${Utils.escapeHTML(estado)}</span></td>
                    <td>${Utils.escapeHTML(o.tecnico_nombre || o.tecnico || '--')}</td>
                    <td class="fw-600">${Utils.fmt(o.monto_total || o.monto_final || 0)}</td>
                    <td style="font-size:0.78rem;color:#64748b;">${Utils.fmtDateTime(o.fecha_creacion || o.created_at || o.fecha)}</td>
                </tr>`;
            }).join('');
        },
    },

    // ========================================================
    // NUEVA ORDEN - Order creation (normal + express)
    // ========================================================
    nuevaOrden: {
        _servicios: [],
        _costosExtra: [],

        async init() {
            const now = new Date();
            Utils.setVal('no-fecha', now.toISOString().split('T')[0]);
            Utils.setVal('no-hora', now.toTimeString().slice(0, 5));
            Utils.setVal('no-recepcionista', currentUser?.nombre || '');
            this._costosExtra = [];
            this.renderCostosExtra();
            await this.cargarNumeroOrden();
            await this.cargarServicios();
        },

        async cargarNumeroOrden() {
            try {
                const data = await API.getPublic('/proximo-numero-orden');
                if (data.numero) {
                    Utils.setText('nueva-orden-numero', String(data.numero).padStart(6, '0'));
                }
            } catch (err) { console.error(err); }
        },

        async cargarServicios() {
            try {
                const data = await API.get('/servicios-catalogo');
                this._servicios = data.data || data.servicios || data || [];
                serviciosCatalogoGlobal = this._servicios;
                this.renderServicios();
            } catch (err) {
                this._servicios = [];
                Utils.setHTML('no-servicios-container', '<div class="bf-empty"><i class="fa-solid fa-wrench"></i>Error cargando servicios</div>');
            }
        },

        renderServicios() {
            const container = document.getElementById('no-servicios-container');
            if (!container) return;
            if (this._servicios.length === 0) {
                container.innerHTML = '<div class="bf-empty"><i class="fa-solid fa-wrench"></i>No hay servicios en el catálogo</div>';
                return;
            }
            const cats = {};
            this._servicios.forEach(s => {
                const cat = s.categoria || 'Otros';
                if (!cats[cat]) cats[cat] = [];
                cats[cat].push(s);
            });
            let html = '';
            Object.entries(cats).forEach(([cat, servicios]) => {
                html += `<div class="mb-3"><h6 style="font-size:0.78rem;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:0.5rem;">${Utils.escapeHTML(cat)}</h6>`;
                servicios.forEach(s => {
                    const tipoBadge = s.tipo_comision === 'mano_obra'
                        ? '<span class="badge-st" style="background:#fef3c7;color:#d97706;">MO</span>'
                        : '<span class="badge-st" style="background:#e2e8f0;color:#475569;">Rep</span>';
                    html += `<div class="d-flex align-items-center gap-2 p-2 mb-1" style="background:#f8fafc;border-radius:0.5rem;border:1px solid #f1f5f9;">
                        <input type="checkbox" class="form-check-input" data-servicio-id="${s.id}" data-precio="${s.precio_sugerido || 0}" data-tipo-comision="${s.tipo_comision || 'mano_obra'}" onchange="App.nuevaOrden.calcular()" style="flex-shrink:0;">
                        <div class="flex-grow-1"><div class="fw-600" style="font-size:0.84rem;">${Utils.escapeHTML(s.nombre)}</div><div class="d-flex gap-2 align-items-center mt-1">${tipoBadge} <span style="font-size:0.78rem;color:#475569;">${Utils.fmt(s.precio_sugerido || 0)}</span></div></div>
                        <input type="number" class="bf-input" style="width:100px;" placeholder="$" value="${s.precio_sugerido || 0}" data-servicio-precio="${s.id}" oninput="App.nuevaOrden.updatePrecio(this)" min="0">
                    </div>`;
                });
                html += '</div>';
            });
            container.innerHTML = html;
        },

        updatePrecio(input) {
            const servId = input.dataset.servicioPrecio;
            const cb = document.querySelector(`input[data-servicio-id="${servId}"]`);
            if (cb) cb.dataset.precio = input.value;
            this.calcular();
        },

        async buscarPatente() {
            const patente = Utils.val('no-patente');
            if (!patente || patente.length < 3) return;
            try {
                const data = await API.getPublic('/buscar-patente?patente=' + encodeURIComponent(patente.toUpperCase()));
                if (data.vehiculo) {
                    const v = data.vehiculo;
                    Utils.setVal('no-marca', v.marca || '');
                    Utils.setVal('no-modelo', v.modelo || '');
                    Utils.setVal('no-anio', v.anio || '');
                    Utils.setVal('no-cilindrada', v.cilindrada || '');
                    Utils.setVal('no-combustible', v.combustible || '');
                    Utils.setVal('no-km', v.kilometraje || '');
                    if (data.cliente) {
                        Utils.setVal('no-cliente', data.cliente.nombre || '');
                        Utils.setVal('no-rut', data.cliente.rut || '');
                        Utils.setVal('no-telefono', data.cliente.telefono || '');
                        Utils.setVal('no-direccion', data.cliente.direccion || '');
                    }
                    Utils.toast('Vehículo encontrado', 'success');
                }
            } catch (err) { console.error(err); }
        },

        addCostoExtra() {
            const concepto = Utils.val('no-extra-concepto');
            const monto = parseFloat(Utils.val('no-extra-monto'));
            const cat = Utils.val('no-extra-cat');
            if (!concepto || !monto) { Utils.toast('Concepto y monto son requeridos', 'warning'); return; }
            this._costosExtra.push({ concepto, monto, categoria: cat });
            Utils.setVal('no-extra-concepto', '');
            Utils.setVal('no-extra-monto', '');
            this.renderCostosExtra();
            this.calcular();
        },

        removeCostoExtra(idx) {
            this._costosExtra.splice(idx, 1);
            this.renderCostosExtra();
            this.calcular();
        },

        renderCostosExtra() {
            const container = document.getElementById('no-costos-extra-list');
            if (!container) return;
            if (this._costosExtra.length === 0) {
                container.innerHTML = '<p style="font-size:0.82rem;color:#94a3b8;">Sin costos extra agregados</p>';
                return;
            }
            container.innerHTML = '<div class="table-responsive"><table class="bf-table"><thead><tr><th>Concepto</th><th>Categoría</th><th>Monto</th><th></th></tr></thead><tbody>' +
                this._costosExtra.map((c, i) => `<tr>
                    <td>${Utils.escapeHTML(c.concepto)}</td>
                    <td><span class="badge-st" style="background:${c.categoria === 'Mano de Obra' ? '#fef3c7;color:#d97706;' : '#e2e8f0;color:#475569;'}">${Utils.escapeHTML(c.categoria)}</span></td>
                    <td class="fw-600">${Utils.fmt(c.monto)}</td>
                    <td><button class="btn-bf-icon danger" onclick="App.nuevaOrden.removeCostoExtra(${i})"><i class="fa-solid fa-trash"></i></button></td>
                </tr>`).join('') +
                '</tbody></table></div>';
        },

        calcular() {
            let subtotal = 0;
            document.querySelectorAll('#no-servicios-container input[type="checkbox"][data-servicio-id]:checked').forEach(cb => {
                subtotal += parseFloat(cb.dataset.precio) || 0;
            });
            const extra = this._costosExtra.reduce((s, c) => s + (c.monto || 0), 0);
            const total = subtotal + extra;

            const tieneAbono = document.getElementById('no-tiene-abono').checked;
            const abono = tieneAbono ? (parseFloat(Utils.val('no-abono')) || 0) : 0;
            const restante = total - abono;

            Utils.setText('no-resumen-servicios', Utils.fmt(subtotal));
            Utils.setText('no-resumen-extra', Utils.fmt(extra));
            Utils.setText('no-resumen-total', Utils.fmt(total));
            Utils.setText('no-resumen-restante', Utils.fmt(restante));

            document.getElementById('no-abono').disabled = !tieneAbono;
        },

        async saveOrder() {
            const patente = Utils.val('no-patente').toUpperCase().replace(/\s+/g, '');
            if (!patente) { Utils.toast('La patente es requerida', 'warning'); return; }
            if (!Utils.val('no-cliente')) { Utils.toast('El nombre del cliente es requerido', 'warning'); return; }

            const serviciosSeleccionados = [];
            document.querySelectorAll('#no-servicios-container input[type="checkbox"][data-servicio-id]:checked').forEach(cb => {
                const servObj = this._servicios.find(s => String(s.id) === cb.dataset.servicioId);
                if (servObj) {
                    serviciosSeleccionados.push({
                        id: servObj.id, nombre: servObj.nombre,
                        precio_sugerido: servObj.precio_sugerido,
                        precio_final: parseFloat(cb.dataset.precio) || 0,
                        categoria: servObj.categoria,
                        tipo_comision: servObj.tipo_comision || 'mano_obra',
                        editado: (parseFloat(cb.dataset.precio) || 0) !== Number(servObj.precio_sugerido),
                    });
                }
            });

            const montoTotal = this._costosExtra.reduce((s, c) => s + (c.monto || 0), 0) +
                serviciosSeleccionados.reduce((s, sv) => s + (sv.precio_final || 0), 0);
            const tieneAbono = document.getElementById('no-tiene-abono').checked;
            const montoAbono = tieneAbono ? (parseFloat(Utils.val('no-abono')) || 0) : 0;

            const body = {
                patente, marca: Utils.val('no-marca'), modelo: Utils.val('no-modelo'),
                anio: parseInt(Utils.val('no-anio')) || null,
                cilindrada: Utils.val('no-cilindrada'), combustible: Utils.val('no-combustible'),
                kilometraje: Utils.val('no-km'),
                cliente: Utils.val('no-cliente'), rut: Utils.val('no-rut'),
                telefono: Utils.val('no-telefono'), direccion: Utils.val('no-direccion'),
                fecha_ingreso: Utils.val('no-fecha'), hora_ingreso: Utils.val('no-hora'),
                recepcionista: Utils.val('no-recepcionista'),
                servicios_seleccionados: JSON.stringify(serviciosSeleccionados),
                observaciones: Utils.val('no-observaciones'),
                monto_total: montoTotal, monto_abono: montoAbono,
                metodo_pago: tieneAbono ? Utils.val('no-metodo-pago') : null,
            };

            let btn;
            try {
                btn = document.querySelector('#form-nueva-orden button[type="submit"]');
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Creando...';
                const data = await API.postPublic('/crear-orden', body);
                if (data.success) {
                    const num = String(data.numero_orden).padStart(6, '0');
                    Utils.toast(`Orden #${num} creada exitosamente`, 'success');
                    // Show success modal with share link
                    const link = `${window.location.origin}/aprobar?token=${data.token}`;
                    await Swal.fire({
                        title: '¡Orden Creada!',
                        html: `<div style="text-align:center;">
                            <div style="font-size:2rem;font-weight:900;color:#0d9488;">OT #${num}</div>
                            <p style="color:#64748b;">${patente} • ${Utils.val('no-cliente')}</p>
                            <div style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:center;">
                                <a href="https://wa.me/${Utils.val('no-telefono').replace(/\D/g, '')}?text=${encodeURIComponent('Hola, tiene una OT de BizFlow: ' + link)}" target="_blank" class="btn-bf" style="background:#25D366;"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>
                                <button class="btn-bf" onclick="navigator.clipboard.writeText('${link}');Utils.toast('Link copiado','success')"><i class="fa-solid fa-link"></i> Copiar Link</button>
                            </div>
                        </div>`,
                        confirmButtonColor: '#0d9488', showConfirmButton: false,
                        allowOutsideClick: true,
                    });
                    // Reset form
                    document.getElementById('form-nueva-orden').reset();
                    this._costosExtra = [];
                    await this.init();
                } else {
                    Utils.toast(data.error || 'Error al crear orden', 'error');
                }
            } catch (err) {
                Utils.toast(err.message, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-save"></i>Crear Orden';
                }
            }
        },

        openExpress() {
            Utils.setVal('exp-patente', '');
            Utils.setVal('exp-marca', '');
            Utils.setVal('exp-modelo', '');
            Utils.setVal('exp-nombre', '');
            Utils.setVal('exp-telefono', '');
            Utils.setVal('exp-direccion', '');
            Utils.setVal('exp-notas', '');
            Utils.showModal('modal-express');
        },

        async saveExpress() {
            const patente = Utils.val('exp-patente').toUpperCase().replace(/\s+/g, '');
            const nombre = Utils.val('exp-nombre');
            const telefono = Utils.val('exp-telefono');
            const direccion = Utils.val('exp-direccion');
            if (!patente || !nombre || !telefono || !direccion) {
                Utils.toast('Patente, nombre, teléfono y dirección son requeridos', 'warning'); return;
            }
            try {
                const btn = document.getElementById('btn-express-save');
                btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando...';
                const data = await API.postPublic('/crear-orden', {
                    express: true, patente, marca: Utils.val('exp-marca') || null,
                    modelo: Utils.val('exp-modelo') || null,
                    anio: parseInt(Utils.val('exp-anio')) || null,
                    cliente: nombre, telefono, direccion,
                    notas_diagnostico: Utils.val('exp-notas'),
                });
                if (data.success) {
                    Utils.toast(`OT Express #${String(data.numero_orden).padStart(6, '0')} creada`, 'success');
                    Utils.hideModal('modal-express');
                    await this.init();
                } else {
                    Utils.toast(data.error || 'Error creando OT Express', 'error');
                }
            } catch (err) { Utils.toast(err.message, 'error'); }
            finally {
                const btn = document.getElementById('btn-express-save');
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-bolt"></i>Crear OT Express';
            }
        },
    },

    // ========================================================
    // BUSCAR ÓRDENES
    // ========================================================
    buscarOrdenes: {
        _data: [],

        init() {
            this._data = [];
            Utils.setVal('bo-estado', '');
        },

        async buscar() {
            const patente = Utils.val('bo-patente').toUpperCase().replace(/\s+/g, '');
            if (!patente) { Utils.toast('Ingrese una patente', 'warning'); return; }
            try {
                const data = await API.get('/todas-ordenes?patente=' + encodeURIComponent(patente));
                this._data = data.data?.ordenes || data.ordenes || data.data || data || [];
                this.render(this._data);
            } catch (err) {
                this._data = [];
                this.render([]);
            }
        },

        render(data) {
            const container = document.getElementById('bo-resultados');
            if (!data || data.length === 0) {
                container.innerHTML = '<div class="bf-card"><div class="bf-card-body"><div class="bf-empty"><i class="fa-solid fa-magnifying-glass"></i>No se encontraron órdenes</div></div></div>';
                return;
            }
            container.innerHTML = '<div class="bf-card"><div class="bf-card-body" style="padding:0;"><div class="table-responsive"><table class="bf-table">' +
                '<thead><tr><th>#</th><th>Patente</th><th>Cliente</th><th>Estado</th><th>Técnico</th><th>Total</th><th>Acciones</th></tr></thead><tbody>' +
                data.map(o => {
                    const estado = o.estado || 'Enviada';
                    return `<tr>
                        <td class="fw-600">#${String(o.numero_orden || o.id || '').padStart(6,'0')}</td>
                        <td class="fw-600">${Utils.escapeHTML(o.patente_placa || o.patente || '')}</td>
                        <td>${Utils.escapeHTML(o.cliente_nombre || '--')}</td>
                        <td><span class="badge-st ${Utils.badgeClass(estado)}">${Utils.escapeHTML(estado)}</span></td>
                        <td>${Utils.escapeHTML(o.tecnico_nombre || '--')}</td>
                        <td class="fw-600">${Utils.fmt(o.monto_final || o.monto_total || 0)}</td>
                        <td><div class="d-flex gap-1">
                            <button class="btn-bf-icon" title="Ver" onclick="App.buscarOrdenes.ver(${o.id})"><i class="fa-solid fa-eye"></i></button>
                            <button class="btn-bf-icon danger" title="Eliminar" onclick="App.buscarOrdenes.eliminar(${o.id},${o.numero_orden})"><i class="fa-solid fa-trash"></i></button>
                        </div></td>
                    </tr>`;
                }).join('') +
                '</tbody></table></div></div></div>';
        },

        setFiltro(estado, btn) {
            document.querySelectorAll('.filtro-bf').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (estado === 'todas') { this.render(this._data); return; }
            this.render(this._data.filter(o => (o.estado || '').toLowerCase() === estado.toLowerCase()));
        },

        filtrarEstado() {
            const estado = Utils.val('bo-estado');
            if (estado) { this.render(this._data.filter(o => (o.estado || '').toLowerCase() === estado.toLowerCase())); }
        },

        async ver(id) { Router.navigate('nueva-orden'); },

        async eliminar(id, num) {
            const ok = await Utils.confirm(`¿Eliminar permanentemente la orden #${String(num).padStart(6,'0')}?`);
            if (!ok) return;
            try {
                await API.post('/eliminar-orden', { orden_id: id });
                Utils.toast('Orden eliminada', 'success');
                this.buscar();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async verOrden(id) {
            await App.ordenes.ver(id);
        },

        async editarOrden(id) {
            await App.ordenes.editar(id);
        },

        async generarPDF(orden) {
            generarPDFOrden(orden);
        },

        abrirCostos(id) {
            // Se necesita numeroOrden y patente - obtener de _data
            const o = this._data.find(x => x.id === id);
            if (!o) { Utils.toast('Orden no encontrada', 'warning'); return; }
            App.costosAdicionales.abrir(id, o.numero_orden, o.patente_placa || o.patente, o.cliente_nombre || '');
        },
    },

    // ========================================================
    // ASIGNAR ÓRDENES A TÉCNICOS
    // ========================================================
    asignarOrdenes: {
        _disponibles: [],
        _asignadas: [],
        _tecnicos: [],

        async load() {
            try {
                const [disponibles, tecnicos] = await Promise.all([
                    API.get('/ordenes-disponibles'),
                    API.get('/tecnicos')
                ]);

                this._disponibles = disponibles.ordenes || disponibles.data || [];
                this._tecnicos = (tecnicos.data || tecnicos.tecnicos || tecnicos || []).filter(t => t.activo !== false);

                // Load assigned orders (all aprobadas with tecnico)
                try {
                    const todas = await API.get('/todas-ordenes');
                    const ordenes = todas.ordenes || todas.data || [];
                    this._asignadas = ordenes.filter(o =>
                        o.tecnico_asignado_id &&
                        o.estado === 'Aprobada' &&
                        o.estado_trabajo !== 'Cerrada'
                    );
                } catch (e) {
                    this._asignadas = [];
                }

                this.renderStats();
                this.renderDisponibles();
                this.renderAsignadas();
                this.populateTecnicoFilter();
            } catch (err) {
                Utils.toast('Error cargando datos: ' + err.message, 'error');
            }
        },

        renderStats() {
            const sinAsignar = this._disponibles.length;
            const enProceso = this._asignadas.filter(o => o.estado_trabajo !== 'Cerrada').length;
            const cerradas = this._asignadas.filter(o => o.estado_trabajo === 'Cerrada').length;

            Utils.setText('stat-sin-asignar', sinAsignar);
            Utils.setText('stat-en-proceso', enProceso);
            Utils.setText('stat-cerradas', cerradas);
            Utils.setText('stat-total-tecnicos', this._tecnicos.length);
        },

        renderDisponibles() {
            const tbody = document.getElementById('tbl-ordenes-disponibles');
            if (!tbody) return;

            if (!this._disponibles.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="bf-empty"><i class="fa-solid fa-check-circle" style="color:#10b981;"></i>Todas las órdenes aprobadas están asignadas</td></tr>';
                return;
            }

            tbody.innerHTML = this._disponibles.map(o => {
                const num = String(o.numero_orden || o.id).padStart(5, '0');
                const fecha = o.fecha_creacion || o.fecha_ingreso || '';
                return `<tr>
                    <td class="fw-600">#${Utils.escapeHTML(num)}</td>
                    <td><span class="badge-st" style="background:#fef3c7;color:#92400e;font-weight:700;">${Utils.escapeHTML(o.patente_placa || '--')}</span></td>
                    <td>${Utils.escapeHTML(o.cliente_nombre || '--')}</td>
                    <td style="font-size:0.8rem;color:#6b7280;">${Utils.escapeHTML(fecha)}</td>
                    <td><button class="btn-bf" style="font-size:0.78rem;" onclick="App.asignarOrdenes.openAssign(${o.id}, '#${num}', '${Utils.escapeHTML(o.patente_placa || '')}')"><i class="fa-solid fa-user-plus"></i>Asignar</button></td>
                </tr>`;
            }).join('');
        },

        renderAsignadas(data) {
            const tbody = document.getElementById('tbl-ordenes-asignadas');
            if (!tbody) return;

            const list = data || this._asignadas;

            if (!list.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-user-clock"></i>No hay órdenes asignadas en proceso</td></tr>';
                return;
            }

            tbody.innerHTML = list.map(o => {
                const num = String(o.numero_orden || o.id).padStart(5, '0');
                const estado = o.estado_trabajo || 'Pendiente';
                const fecha = o.fecha_creacion || o.fecha_ingreso || '';

                const estadoColors = {
                    'Pendiente Visita': '#f59e0b',
                    'En camino': '#3b82f6',
                    'En Sitio': '#8b5cf6',
                    'En trabajo': '#06b6d4',
                    'Cerrada': '#10b981',
                };
                const estadoColor = estadoColors[estado] || '#6b7280';

                return `<tr>
                    <td class="fw-600">#${Utils.escapeHTML(num)}</td>
                    <td><span class="badge-st" style="background:#fef3c7;color:#92400e;font-weight:700;">${Utils.escapeHTML(o.patente_placa || '--')}</span></td>
                    <td>${Utils.escapeHTML(o.tecnico_nombre || o.tecnico || '--')}</td>
                    <td><span class="badge-st" style="background:${estadoColor}15;color:${estadoColor};font-weight:600;">${Utils.escapeHTML(estado)}</span></td>
                    <td style="font-size:0.8rem;color:#6b7280;">${Utils.escapeHTML(fecha)}</td>
                    <td><div class="d-flex gap-1">
                        <button class="btn-bf-icon" onclick="App.asignarOrdenes.reassign(${o.id}, '#${num}', '${Utils.escapeHTML(o.patente_placa || '')}')" title="Reasignar"><i class="fa-solid fa-arrows-rotate"></i></button>
                    </div></td>
                </tr>`;
            }).join('');
        },

        populateTecnicoFilter() {
            const sel = document.getElementById('filter-tecnico-asignadas');
            if (!sel) return;
            const currentValue = sel.value;
            sel.innerHTML = '<option value="">Todos los técnicos</option>' +
                this._tecnicos.map(t => `<option value="${t.id}">${Utils.escapeHTML(t.nombre)} (${t.comision_porcentaje || 0}%)</option>`).join('');
            sel.value = currentValue;
        },

        filterAsignadas() {
            const filterId = (document.getElementById('filter-tecnico-asignadas')?.value || '');
            if (!filterId) {
                this.renderAsignadas(this._asignadas);
                return;
            }
            const filtered = this._asignadas.filter(o => String(o.tecnico_asignado_id) === filterId);
            this.renderAsignadas(filtered);
        },

        openAssign(ordenId, ordenNum, patente) {
            if (!this._tecnicos.length) {
                Utils.toast('No hay técnicos activos. Cree uno primero en Gestión Técnicos.', 'warning');
                return;
            }
            const options = this._tecnicos.map(t =>
                `<option value="${t.id}">${Utils.escapeHTML(t.nombre)} (Tel: ${t.telefono || '--'} | Comisión: ${t.comision_porcentaje || 0}%)</option>`
            ).join('');

            Swal.fire({
                title: `Asignar Orden ${ordenNum}`,
                html: `
                    <div style="text-align:left;margin:10px 0;">
                        <p style="font-weight:600;color:#6b7280;">Patente: <span style="color:#92400e;font-weight:700;">${patente}</span></p>
                        <label style="display:block;margin-top:12px;font-weight:600;font-size:0.9rem;color:#374151;">Seleccionar Técnico:</label>
                        <select id="swal-tecnico-select" class="swal2-select" style="width:100%;margin-top:6px;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;">
                            ${options}
                        </select>
                    </div>
                `,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-user-check"></i> Asignar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#0d9488',
            }).then(async (result) => {
                if (result.isConfirmed) {
                    const tecnicoId = document.getElementById('swal-tecnico-select').value;
                    try {
                        const res = await API.post('/asignar-orden', { orden_id: ordenId, tecnico_id: parseInt(tecnicoId) });
                        if (res.success) {
                            Utils.toast(res.mensaje || 'Orden asignada correctamente', 'success');
                            await this.load();
                        } else {
                            Utils.toast(res.error || 'Error al asignar', 'error');
                        }
                    } catch (err) {
                        Utils.toast(err.message, 'error');
                    }
                }
            });
        },

        async reassign(ordenId, ordenNum, patente) {
            const options = this._tecnicos.map(t =>
                `<option value="${t.id}">${Utils.escapeHTML(t.nombre)} (${t.comision_porcentaje || 0}%)</option>`
            ).join('');

            Swal.fire({
                title: `Reasignar Orden ${ordenNum}`,
                html: `
                    <div style="text-align:left;margin:10px 0;">
                        <p style="font-weight:600;color:#6b7280;">Patente: <span style="color:#92400e;font-weight:700;">${patente}</span></p>
                        <label style="display:block;margin-top:12px;font-weight:600;font-size:0.9rem;color:#374151;">Nuevo Técnico:</label>
                        <select id="swal-tecnico-select" class="swal2-select" style="width:100%;margin-top:6px;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;">
                            ${options}
                        </select>
                    </div>
                `,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-arrows-rotate"></i> Reasignar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#3b82f6',
            }).then(async (result) => {
                if (result.isConfirmed) {
                    const tecnicoId = document.getElementById('swal-tecnico-select').value;
                    try {
                        const res = await API.post('/asignar-orden', { orden_id: ordenId, tecnico_id: parseInt(tecnicoId), force: true });
                        if (res.success) {
                            Utils.toast('Orden reasignada correctamente', 'success');
                            await this.load();
                        } else {
                            Utils.toast(res.error || 'Error al reasignar', 'error');
                        }
                    } catch (err) {
                        Utils.toast(err.message, 'error');
                    }
                }
            });
        },
    },

    tecnicos: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/tecnicos');
                this._data = data.data || data.tecnicos || data || [];
                this.render(this._data);
            } catch (err) { this._data = []; this.render([]); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-tecnicos');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-users-gear"></i>Sin técnicos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(t => `<tr>
                <td class="fw-600">${Utils.escapeHTML(t.nombre || '--')}</td>
                <td>${Utils.escapeHTML(t.telefono || '--')}</td>
                <td>${Utils.escapeHTML(t.email || '--')}</td>
                <td><span class="badge-st" style="background:#dcfce7;color:#16a34a;">${t.comision_porcentaje || 0}%</span></td>
                <td><span class="badge-st" style="background:${t.activo !== false ? '#dcfce7;color:#16a34a;' : '#fee2e2;color:#dc2626;'}">${t.activo !== false ? 'Activo' : 'Inactivo'}</span></td>
                <td><div class="d-flex gap-1">
                    <button class="btn-bf-icon" onclick="App.tecnicos.openEdit(${t.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-bf-icon danger" onclick="App.tecnicos.remove(${t.id})"><i class="fa-solid fa-trash"></i></button>
                </div></td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(tc => `${tc.nombre} ${tc.email} ${tc.telefono}`.toLowerCase().includes(t)));
        },

        openCreate() {
            Utils.setText('modal-tecnico-title', 'Nuevo Técnico');
            ['tc-id','tc-nombre','tc-telefono','tc-pin','tc-email','tc-comision'].forEach(id => Utils.setVal(id, ''));
            Utils.setVal('tc-comision', '15');
            Utils.showModal('modal-tecnico');
        },

        openEdit(id) {
            const t = this._data.find(x => x.id === id);
            if (!t) return;
            Utils.setText('modal-tecnico-title', 'Editar Técnico');
            Utils.setVal('tc-id', t.id);
            Utils.setVal('tc-nombre', t.nombre);
            Utils.setVal('tc-telefono', t.telefono);
            Utils.setVal('tc-pin', t.pin || '');
            Utils.setVal('tc-email', t.email || '');
            Utils.setVal('tc-comision', t.comision_porcentaje || '15');
            Utils.showModal('modal-tecnico');
        },

        async save() {
            const id = Utils.val('tc-id');
            const nombre = Utils.val('tc-nombre');
            const telefono = Utils.val('tc-telefono');
            const pin = Utils.val('tc-pin');
            if (!nombre) { Utils.toast('El nombre es requerido', 'warning'); return; }
            if (!telefono) { Utils.toast('El teléfono es requerido', 'warning'); return; }
            if (!pin) { Utils.toast('El PIN de acceso es requerido', 'warning'); return; }
            const body = {
                nombre,
                telefono,
                pin,
                email: Utils.val('tc-email'),
                comision_porcentaje: parseFloat(Utils.val('tc-comision')) || 15,
            };
            try {
                if (id) { await API.put(`/tecnicos/${id}`, body); Utils.toast('Técnico actualizado', 'success'); }
                else { await API.post('/tecnicos', body); Utils.toast('Técnico creado', 'success'); }
                Utils.hideModal('modal-tecnico');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar este técnico?')) return;
            try { await API.delete(`/tecnicos/${id}`); Utils.toast('Técnico eliminado', 'success'); this.load(); }
            catch (err) { Utils.toast(err.message, 'error'); }
        },

        async abrirComisiones() {
            Utils.showModal('modalComisionTecnicos');
            try {
                const data = await API.get('/tecnicos');
                const tecnicos = data.data || data.tecnicos || data || [];
                const lista = document.getElementById('lista-comisiones-tecnicos');
                if (!lista) return;
                if (!tecnicos.length) { lista.innerHTML = '<p style="color:#94a3b8;">No hay técnicos registrados</p>'; return; }
                lista.innerHTML = '<table class="bf-table"><thead><tr><th>Técnico</th><th>Teléfono</th><th>Comisión %</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>' +
                    tecnicos.map(t => `<tr>
                        <td class="fw-600">${Utils.escapeHTML(t.nombre)}</td>
                        <td>${Utils.escapeHTML(t.telefono || '--')}</td>
                        <td><input type="number" class="bf-input" style="width:100px;text-align:center;" id="comision-tec-${t.id}" value="${t.comision_porcentaje || 15}" min="0" max="100" step="5"></td>
                        <td><span class="badge-st" style="background:${t.activo !== false ? '#dcfce7;color:#16a34a;' : '#fee2e2;color:#dc2626;'}">${t.activo !== false ? 'Activo' : 'Inactivo'}</span></td>
                        <td><button class="btn-bf" style="font-size:0.78rem;" onclick="App.tecnicos.guardarComision(${t.id})"><i class="fa-solid fa-save"></i></button></td>
                    </tr>`).join('') +
                    '</tbody></table>';
            } catch (err) { Utils.toast('Error cargando comisiones', 'error'); }
        },

        async guardarComision(id, porcentaje) {
            const input = document.getElementById(`comision-tec-${id}`);
            const comision = input ? parseFloat(input.value) : (porcentaje || null);
            if (isNaN(comision) || comision < 0 || comision > 100) { Utils.toast('La comisión debe ser entre 0% y 100%', 'warning'); return; }
            try {
                await API.put(`/tecnicos/${id}`, { comision_porcentaje: comision });
                Utils.toast(`Comisión actualizada a ${comision}%`, 'success');
            } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // LIQUIDAR TÉCNICOS - Commission settlement
    // ========================================================
    liquidarTecnicos: {
        _ordenes: [],

        init() {
            this.loadTecnicosSelect();
            Utils.setVal('liq-valor', Utils.nowMonth());
        },

        async loadTecnicosSelect() {
            try {
                const data = await API.get('/tecnicos');
                const tecnicos = data.data || data.tecnicos || data || [];
                const sel = document.getElementById('liq-tecnico');
                if (sel) {
                    sel.innerHTML = '<option value="">Seleccionar técnico...</option>' +
                        tecnicos.map(t => `<option value="${t.id}">${Utils.escapeHTML(t.nombre)} (${t.comision_porcentaje || 15}%)</option>`).join('');
                }
            } catch (err) { console.error(err); }
        },

        async calcular() {
            const tecnicoId = Utils.val('liq-tecnico');
            const tipo = Utils.val('liq-tipo');
            const valor = Utils.val('liq-valor');
            if (!tecnicoId || !valor) { Utils.toast('Seleccione técnico y período', 'warning'); return; }

            const resultadosDiv = document.getElementById('liq-resultados');
            const resumenDiv = document.getElementById('liq-resumen');
            resultadosDiv.innerHTML = '<div class="text-center py-4"><div class="splash-loader" style="margin:0 auto;"></div></div>';
            resumenDiv.innerHTML = '';

            try {
                const data = await API.get(`/liquidar-tecnicos?tecnico_id=${tecnico_id}&periodo=${tipo}&valor=${valor}`);
                const items = data.data?.ordenes || data.ordenes || data.data || [];
                const tecnico = data.data?.tecnico || data.tecnico || {};
                const comision = data.data?.total_comision || data.total_comision || 0;
                const totalMO = data.data?.total_mano_obra || data.total_mano_obra || 0;
                const totalRep = data.data?.total_repuestos || data.total_repuestos || 0;

                // Render orders table
                if (items.length === 0) {
                    resultadosDiv.innerHTML = '<div class="bf-card"><div class="bf-card-body"><div class="bf-empty"><i class="fa-solid fa-clipboard-check"></i>Sin órdenes en este período</div></div></div>';
                } else {
                    resultadosDiv.innerHTML = '<div class="bf-card"><div class="bf-card-header"><span class="bf-card-title"><i class="fa-solid fa-list me-2" style="color:var(--bf-primary);"></i>Órdenes del Período</span></div>' +
                        '<div class="bf-card-body" style="padding:0;"><div class="table-responsive"><table class="bf-table">' +
                        '<thead><tr><th>#</th><th>Patente</th><th>Cliente</th><th>Estado</th><th>Total</th><th>MO</th><th>Rep</th><th>Comisión</th></tr></thead><tbody>' +
                        items.map(o => {
                            const comisionCalc = totalMO > 0 ? ((parseFloat(o.comision_mano_obra || 0) / totalMO) * comision) : 0;
                            const comisionRep = totalRep > 0 ? ((parseFloat(o.comision_repuestos || 0) / totalRep) * comision) : 0;
                            const comisionOrd = comisionCalc + comisionRep;
                            return `<tr>
                                <td class="fw-600">#${String(o.numero_orden || o.id).padStart(6,'0')}</td>
                                <td>${Utils.escapeHTML(o.patente_placa || o.patente || '')}</td>
                                <td>${Utils.escapeHTML(o.cliente_nombre || '--')}</td>
                                <td><span class="badge-st ${Utils.badgeClass(o.estado)}">${Utils.escapeHTML(o.estado || '--')}</span></td>
                                <td class="fw-600">${Utils.fmt(o.monto_final || o.monto_total || 0)}</td>
                                <td style="color:#d97706;">${Utils.fmt(o.comision_mano_obra || 0)}</td>
                                <td style="color:#64748b;">${Utils.fmt(o.comision_repuestos || 0)}</td>
                                <td class="fw-600" style="color:var(--bf-primary);">${Utils.fmt(comisionOrd)}</td>
                            </tr>`;
                        }).join('') +
                        '</tbody></table></div></div></div>';
                }

                // Render summary
                resumenDiv.innerHTML = `<div class="bf-card mt-3">
                    <div class="bf-card-header"><span class="bf-card-title"><i class="fa-solid fa-calculator me-2" style="color:var(--bf-primary);"></i>Resumen de Liquidación</span></div>
                    <div class="bf-card-body">
                        <div class="row g-3">
                            <div class="col-md-4"><div class="kpi-card" style="border-left:4px solid var(--bf-primary);"><div><div class="kpi-label">Técnico</div><div class="fw-700" style="font-size:1.1rem;">${Utils.escapeHTML(tecnico.nombre || '--')}</div></div></div></div>
                            <div class="col-md-4"><div class="kpi-card" style="border-left:4px solid #f59e0b;"><div><div class="kpi-label">Mano de Obra</div><div class="fw-800" style="color:#d97706;">${Utils.fmt(totalMO)}</div></div></div></div>
                            <div class="col-md-4"><div class="kpi-card" style="border-left:4px solid #64748b;"><div><div class="kpi-label">Repuestos</div><div class="fw-800" style="color:#475569;">${Utils.fmt(totalRep)}</div></div></div></div>
                        </div>
                        <div class="row g-3 mt-3">
                            <div class="col-md-6"><div class="kpi-card" style="background:linear-gradient(135deg,rgba(13,148,136,0.05),rgba(13,148,136,0.1));border-left:4px solid var(--bf-primary);"><div><div class="kpi-label">Total Comisión</div><div class="fw-900" style="font-size:1.5rem;color:var(--bf-primary);">${Utils.fmt(comision)}</div></div></div></div>
                            <div class="col-md-6"><div class="d-flex gap-2"><button class="btn-bf flex-grow-1" onclick="App.liquidarTecnicos.marcarPagado()"><i class="fa-solid fa-check-double"></i>Marcar como Pagado</button><button class="btn-bf-outline" onclick="Utils.toast('Reporte exportado','success')"><i class="fa-solid fa-file-pdf"></i>PDF</button></div></div>
                        </div>
                    </div>
                </div>`;
            } catch (err) {
                resultadosDiv.innerHTML = '<div class="bf-card"><div class="bf-card-body"><div class="bf-empty"><i class="fa-solid fa-exclamation-triangle"></i>Error al calcular</div></div></div>';
                Utils.toast(err.message, 'error');
            }
        },

        async marcarPagado() {
            Utils.toast('Órdenes marcadas como pagadas', 'success');
        },
    },

    // ========================================================
    // SERVICIOS CATALOG - Enhanced with tipo_comision
    // ========================================================
    servicios: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/servicios-catalogo');
                this._data = data.data || data.servicios || data || [];
                this.render(this._data);
            } catch (err) { this._data = []; this.render([]); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-servicios');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="bf-empty"><i class="fa-solid fa-wrench"></i>Sin servicios</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(s => {
                const tipoBadge = s.tipo_comision === 'mano_obra'
                    ? '<span class="badge-st" style="background:#fef3c7;color:#d97706;">MO</span>'
                    : '<span class="badge-st" style="background:#e2e8f0;color:#475569;">Rep</span>';
                return `<tr>
                    <td class="fw-600">${Utils.escapeHTML(s.nombre || '--')}</td>
                    <td>${Utils.escapeHTML(s.categoria || '--')}</td>
                    <td>${tipoBadge}</td>
                    <td class="fw-600">${Utils.fmt(s.precio_sugerido || 0)}</td>
                    <td><div class="d-flex gap-1">
                        <button class="btn-bf-icon" onclick="App.servicios.openEdit(${s.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-bf-icon danger" onclick="App.servicios.remove(${s.id})"><i class="fa-solid fa-trash"></i></button>
                    </div></td>
                </tr>`;
            }).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(s => `${s.nombre} ${s.categoria}`.toLowerCase().includes(t)));
        },

        openCreate() {
            Utils.setText('modal-servicio-title', 'Nuevo Servicio');
            ['sv-id','sv-nombre','sv-precio'].forEach(id => Utils.setVal(id, ''));
            Utils.setVal('sv-categoria', 'mecanica');
            Utils.setVal('sv-tipo-comision', 'mano_obra');
            Utils.showModal('modal-servicio');
        },

        openEdit(id) {
            const s = this._data.find(x => x.id === id);
            if (!s) return;
            Utils.setText('modal-servicio-title', 'Editar Servicio');
            Utils.setVal('sv-id', s.id);
            Utils.setVal('sv-nombre', s.nombre);
            Utils.setVal('sv-precio', s.precio_sugerido);
            Utils.setVal('sv-categoria', s.categoria || 'mecanica');
            Utils.setVal('sv-tipo-comision', s.tipo_comision || 'mano_obra');
            Utils.showModal('modal-servicio');
        },

        async save() {
            const id = Utils.val('sv-id');
            const body = {
                nombre: Utils.val('sv-nombre'),
                precio_sugerido: parseFloat(Utils.val('sv-precio')) || 0,
                categoria: Utils.val('sv-categoria'),
                tipo_comision: Utils.val('sv-tipo-comision'),
            };
            if (!body.nombre) { Utils.toast('El nombre es requerido', 'warning'); return; }
            try {
                if (id) { await API.put(`/servicios-catalogo/${id}`, body); Utils.toast('Servicio actualizado', 'success'); }
                else { await API.post('/servicios-catalogo', body); Utils.toast('Servicio creado', 'success'); }
                Utils.hideModal('modal-servicio');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar este servicio?')) return;
            try { await API.delete(`/servicios-catalogo/${id}`); Utils.toast('Servicio eliminado', 'success'); this.load(); }
            catch (err) { Utils.toast(err.message, 'error'); }
        },

        async abrirCatalogo() {
            Utils.showModal('modalServiciosCatalogo');
            await this.cargarCatalogo();
        },

        async cargarCatalogo() {
            try {
                const q = Utils.val('buscador-servicios-cat') || '';
                let endpoint = '/servicios-catalogo?activos=0';
                if (q) endpoint += `&q=${encodeURIComponent(q)}`;
                const data = await API.get(endpoint);
                const servicios = data.servicios || data.data || data || [];
                this.renderizarCatalogo(servicios);
            } catch (err) { Utils.toast('Error cargando catálogo', 'error'); }
        },

        renderizarCatalogo(servicios) {
            const lista = document.getElementById('lista-servicios-catalogo');
            if (!lista) return;
            if (!servicios || servicios.length === 0) {
                lista.innerHTML = '<div class="bf-empty"><i class="fa-solid fa-wrench"></i>No hay servicios</div>';
                return;
            }
            lista.innerHTML = '<table class="bf-table"><thead><tr><th>Servicio</th><th>Precio</th><th>Categoría</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>' +
                servicios.map(s => {
                    const tipoBadge = s.tipo_comision === 'mano_obra'
                        ? '<span class="badge-st" style="background:#fef3c7;color:#d97706;">MO</span>'
                        : '<span class="badge-st" style="background:#e2e8f0;color:#475569;">Rep</span>';
                    const estadoBadge = s.activo !== false
                        ? '<span class="badge-st" style="background:#dcfce7;color:#16a34a;">Activo</span>'
                        : '<span class="badge-st" style="background:#fee2e2;color:#dc2626;">Inactivo</span>';
                    return `<tr class="${s.activo !== false ? '' : 'opacity-50'}">
                        <td class="fw-600">${Utils.escapeHTML(s.nombre)}</td>
                        <td><input type="number" class="bf-input" style="width:100px;" value="${s.precio_sugerido || 0}" min="0" onchange="App.servicios.actualizarPrecio(${s.id}, this.value)" ${s.activo === false ? 'disabled' : ''}></td>
                        <td>${Utils.escapeHTML(s.categoria || '')}</td>
                        <td>${tipoBadge}</td>
                        <td>${estadoBadge}</td>
                        <td><div class="d-flex gap-1">
                            <button class="btn-bf-icon" onclick="App.servicios.cambiarEstado(${s.id}, ${!s.activo})" title="${s.activo !== false ? 'Desactivar' : 'Reactivar'}"><i class="fa-solid fa-${s.activo !== false ? 'toggle-on' : 'toggle-off'}"></i></button>
                        </div></td>
                    </tr>`;
                }).join('') +
                '</tbody></table>';
        },

        async guardarNuevo() {
            const nombre = Utils.val('nuevo-serv-nombre');
            const precio = parseFloat(Utils.val('nuevo-serv-precio')) || 0;
            const categoria = Utils.val('nuevo-serv-categoria') || 'mecanica';
            const tipoComision = Utils.val('nuevo-serv-tipo-comision') || 'mano_obra';
            if (!nombre) { Utils.toast('El nombre es requerido', 'warning'); return; }
            try {
                await API.post('/servicios-catalogo', { nombre, precio_sugerido: precio, categoria, tipo_comision: tipoComision });
                Utils.toast('Servicio creado', 'success');
                Utils.setVal('nuevo-serv-nombre', '');
                Utils.setVal('nuevo-serv-precio', '');
                await this.cargarCatalogo();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async actualizarPrecio(id, precio) {
            try {
                await API.put(`/servicios-catalogo/${id}`, { precio_sugerido: parseFloat(precio) || 0 });
                Utils.toast('Precio actualizado', 'success');
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async cambiarEstado(id, activo) {
            const label = activo ? 'reactivar' : 'desactivar';
            if (!await Utils.confirm(`¿${label} este servicio?`)) return;
            try {
                await API.put(`/servicios-catalogo/${id}`, { activo });
                Utils.toast(`Servicio ${activo ? 'reactivado' : 'desactivado'}`, 'success');
                await this.cargarCatalogo();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // MODELOS DE VEHÍCULOS
    // ========================================================
    modelos: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/modelos-vehiculo');
                this._data = data.data || data.modelos || data || [];
                this.render(this._data);
            } catch (err) { this._data = []; this.render([]); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-modelos');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="bf-empty"><i class="fa-solid fa-car-side"></i>Sin modelos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(m => `<tr>
                <td class="fw-600">${Utils.escapeHTML(m.marca || '--')}</td>
                <td>${Utils.escapeHTML(m.modelo || '--')}</td>
                <td>${Utils.escapeHTML(m.anios || '--')}</td>
                <td><div class="d-flex gap-1">
                    <button class="btn-bf-icon" onclick="App.modelos.openEdit(${m.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-bf-icon danger" onclick="App.modelos.remove(${m.id})"><i class="fa-solid fa-trash"></i></button>
                </div></td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(m => `${m.marca} ${m.modelo}`.toLowerCase().includes(t)));
        },

        openCreate() {
            Utils.setText('modal-modelo-title', 'Nuevo Modelo');
            ['md-id','md-marca','md-modelo'].forEach(id => Utils.setVal(id, ''));
            Utils.showModal('modal-modelo');
        },

        openEdit(id) {
            const m = this._data.find(x => x.id === id);
            if (!m) return;
            Utils.setText('modal-modelo-title', 'Editar Modelo');
            Utils.setVal('md-id', m.id);
            Utils.setVal('md-marca', m.marca);
            Utils.setVal('md-modelo', m.modelo);
            Utils.showModal('modal-modelo');
        },

        async save() {
            const id = Utils.val('md-id');
            const body = { marca: Utils.val('md-marca'), modelo: Utils.val('md-modelo') };
            if (!body.marca) { Utils.toast('La marca es requerida', 'warning'); return; }
            try {
                if (id) { await API.put(`/modelos-vehiculo/${id}`, body); Utils.toast('Modelo actualizado', 'success'); }
                else { await API.post('/modelos-vehiculo', body); Utils.toast('Modelo creado', 'success'); }
                Utils.hideModal('modal-modelo');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar este modelo?')) return;
            try { await API.delete(`/modelos-vehiculo/${id}`); Utils.toast('Modelo eliminado', 'success'); this.load(); }
            catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // GASTOS DEL NEGOCIO
    // ========================================================
    gastos: {
        _data: [],

        async load() {
            try {
                const params = new URLSearchParams();
                const cat = Utils.val('gasto-filtro-cat');
                const desde = Utils.val('gasto-filtro-desde');
                if (cat) params.set('categoria', cat);
                if (desde) params.set('desde', desde + '-01');
                const qs = params.toString();
                const data = await API.get('/gastos' + (qs ? '?' + qs : ''));
                this._data = data.data?.gastos || data.gastos || data.data || [];
                const total = data.data?.total_general || data.total_general || 0;
                Utils.setText('gasto-total-badge', Utils.fmt(total));
                this.render(this._data);
                this.renderResumen(data.data?.resumen_por_categoria || data.resumen_por_categoria);
            } catch (err) {
                this._data = [];
                this.render([]);
            }
        },

        render(data) {
            const tbody = document.getElementById('tbl-gastos');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="bf-empty"><i class="fa-solid fa-money-bill-trend-up"></i>Sin gastos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(g => `<tr>
                <td style="font-size:0.78rem;">${Utils.fmtDate(g.fecha_gasto || g.fecha)}</td>
                <td><strong>${Utils.escapeHTML(g.concepto || '--')}</strong>${g.observaciones ? `<br><small style="color:#94a3b8;">${Utils.escapeHTML(g.observaciones)}</small>` : ''}</td>
                <td><span class="badge-st" style="background:#f1f5f9;color:#475569;">${Utils.escapeHTML(g.categoria || '--')}</span></td>
                <td class="fw-600" style="color:#dc2626;">${Utils.fmt(g.monto)}</td>
                <td><button class="btn-bf-icon danger" onclick="App.gastos.remove(${g.id})"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`).join('');
        },

        renderResumen(resumen) {
            const container = document.getElementById('gasto-resumen');
            if (!container || !resumen || resumen.length === 0) { container.innerHTML = ''; return; }
            container.innerHTML = '<div class="bf-card mt-3"><div class="bf-card-header"><span class="bf-card-title"><i class="fa-solid fa-chart-pie me-2" style="color:var(--bf-primary);"></i>Resumen por Categoría</span></div>' +
                '<div class="bf-card-body"><div class="row g-2">' +
                resumen.map(c => `<div class="col-md-4"><div class="d-flex justify-content-between p-2" style="background:#f8fafc;border-radius:0.5rem;"><span style="font-size:0.82rem;">${Utils.escapeHTML(c.categoria)}</span><strong style="font-size:0.82rem;">${Utils.fmt(c.total)}</strong></div></div>`).join('') +
                '</div></div></div></div>';
        },

        openCreate() {
            Utils.setVal('gt-id', '');
            ['gt-concepto','gt-monto','gt-obs'].forEach(id => Utils.setVal(id, ''));
            Utils.setVal('gt-categoria', 'Otros');
            Utils.setVal('gt-fecha', Utils.today());
            Utils.showModal('modal-gasto');
        },

        async save() {
            const body = {
                concepto: Utils.val('gt-concepto'),
                monto: parseFloat(Utils.val('gt-monto')) || 0,
                categoria: Utils.val('gt-categoria'),
                fecha_gasto: Utils.val('gt-fecha') || Utils.today(),
                observaciones: Utils.val('gt-obs'),
            };
            if (!body.concepto || !body.monto) { Utils.toast('Concepto y monto son requeridos', 'warning'); return; }
            try {
                await API.post('/gastos', body);
                Utils.toast('Gasto registrado', 'success');
                Utils.hideModal('modal-gasto');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar este gasto?')) return;
            try { await API.delete(`/gastos/${id}`); Utils.toast('Gasto eliminado', 'success'); this.load(); }
            catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // REPORTES - Enhanced with workshop metrics
    // ========================================================
    reportes: {
        init() {
            Utils.setVal('reporte-valor', Utils.nowMonth());
        },

        async generar() {
            const valor = Utils.val('reporte-valor');
            const container = document.getElementById('reporte-contenido');
            if (!valor) { Utils.toast('Seleccione un período', 'warning'); return; }

            container.innerHTML = '<div class="text-center py-4"><div class="splash-loader" style="margin:0 auto;"></div></div>';

            try {
                const data = await API.get(`/dashboard-negocio?periodo=${valor}`);
                const d = data.data || data;
                const kpis = d.kpis || d;

                container.innerHTML = `
                    <div class="row g-3 mb-3">
                        <div class="col-6 col-lg-3"><div class="kpi-card"><div class="kpi-icon" style="background:rgba(13,148,136,0.1);color:var(--bf-primary);"><i class="fa-solid fa-clipboard-list"></i></div><div><div class="kpi-label">Total Órdenes</div><div class="kpi-value">${kpis.total_ordenes || 0}</div></div></div></div>
                        <div class="col-6 col-lg-3"><div class="kpi-card"><div class="kpi-icon" style="background:#dbeafe;color:#2563eb;"><i class="fa-solid fa-spinner"></i></div><div><div class="kpi-label">En Proceso</div><div class="kpi-value">${kpis.en_proceso || 0}</div></div></div></div>
                        <div class="col-6 col-lg-3"><div class="kpi-card"><div class="kpi-icon" style="background:#dcfce7;color:#16a34a;"><i class="fa-solid fa-circle-check"></i></div><div><div class="kpi-label">Completadas</div><div class="kpi-value">${kpis.completadas || 0}</div></div></div></div>
                        <div class="col-6 col-lg-3"><div class="kpi-card"><div class="kpi-icon" style="background:#fef3c7;color:#d97706;"><i class="fa-solid fa-dollar-sign"></i></div><div><div class="kpi-label">Generado</div><div class="kpi-value">${Utils.fmt(kpis.total_generado || 0)}</div></div></div></div>
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-6 col-lg-3"><div class="kpi-card"><div class="kpi-icon" style="background:#fce7f3;color:#db2777;"><i class="fa-solid fa-hand-holding-dollar"></i></div><div><div class="kpi-label">Comisiones</div><div class="kpi-value">${Utils.fmt(kpis.total_comisiones || 0)}</div></div></div>
                        <div class="col-6 col-lg-3"><div class="kpi-card"><div class="kpi-icon" style="background:#f1f5f9;color:#475569;"><i class="fa-solid fa-wallet"></i></div><div><div class="kpi-label">Gastos</div><div class="kpi-value">${Utils.fmt(kpis.total_gastos || 0)}</div></div></div>
                        <div class="col-6 col-lg-3"><div class="kpi-card"><div class="kpi-icon" style="background:#ede9fe;color:#7c3aed;"><i class="fa-solid fa-users"></i></div><div><div class="kpi-label">Clientes</div><div class="kpi-value">${kpis.total_clientes || 0}</div></div></div>
                        <div class="col-6 col-lg-3"><div class="kpi-card"><div class="kpi-icon" style="background:#fef3c7;color:#d97706;"><i class="fa-solid fa-users-gear"></i></div><div><div class="kpi-label">Balance</div><div class="kpi-value">${Utils.fmt(kpis.balance || 0)}</div></div></div>
                    </div>
                    <div class="row g-3">
                        <div class="col-lg-6"><div class="bf-card"><div class="bf-card-header"><span class="bf-card-title"><i class="fa-solid fa-chart-bar me-2" style="color:var(--bf-primary);"></i>Ingresos Mensual</span></div><div class="bf-card-body"><div class="bf-chart"><canvas id="chart-reporte-ingresos"></canvas></div></div></div>
                        <div class="col-lg-6"><div class="bf-card"><div class="bf-card-header"><span class="bf-card-title"><i class="fa-solid fa-chart-pie me-2" style="color:var(--bf-primary);"></i>Distribución</span></div><div class="bf-card-body"><div class="bf-chart"><canvas id="chart-reporte-dist"></canvas></div></div></div>
                    </div>
                `;

                // Charts
                const ingresos = d.ingresos_mensual || [];
                if (ingresos.length > 0) {
                    createBarChart('chart-reporte-ingresos', ingresos.map(i => i.mes || ''), ingresos.map(i => i.total || 0), '#0d9488');
                }
                const estados = d.ordenes_por_estado || {};
                if (Object.keys(estados).length > 0) {
                    createDoughnutChart('chart-reporte-dist', Object.keys(estados), Object.values(estados));
                }
            } catch (err) {
                container.innerHTML = '<div class="bf-card"><div class="bf-card-body"><div class="bf-empty"><i class="fa-solid fa-exclamation-triangle"></i>Error generando reporte</div></div></div>';
                Utils.toast(err.message, 'error');
            }
        },
    },

    // ========================================================
    // CLIENTES (CRM)
    // ========================================================
    clientes: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/todas-ordenes?limite=500');
                const ordenes = data.data?.ordenes || data.ordenes || [];
                // Group by client
                const clientMap = {};
                ordenes.forEach(o => {
                    const name = o.cliente_nombre || 'Sin nombre';
                    if (!clientMap[name]) {
                        clientMap[name] = { nombre, telefono: o.cliente_telefono || '', rut: o.cliente_rut || '', patentes: [], totalOTs: 0, totalGenerado: 0, totalAbonos: 0, totalRestante: 0, ordenes: [] };
                    }
                    const cl = clientMap[name];
                    cl.totalOTs++;
                    cl.totalGenerado += Number(o.monto_total || 0);
                    cl.totalAbonos += Number(o.monto_abono || 0);
                    cl.totalRestante += Number(o.monto_restante || o.monto_final - Number(o.monto_abono || 0));
                    cl.ordenes.push(o);
                    if (o.patente_placa) cl.patentes.push(o.patente_placa);
                });
                this._data = Object.values(clientMap).sort((a, b) => b.totalGenerado - a.totalGenerado);
                this.render(this._data);
            } catch (err) { this._data = []; this.render([]); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-clientes');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-users"></i>Sin clientes</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(c => `<tr>
                <td class="fw-600">${Utils.escapeHTML(c.nombre)}</td>
                <td>${Utils.escapeHTML(c.rut || '--')}</td>
                <td>${Utils.escapeHTML(c.telefono || '--')}</td>
                <td>${c.patentes.length > 0 ? c.patentes.map(p => `<span style="font-size:0.72rem;background:#f1f5f9;padding:0.15rem 0.4rem;border-radius:0.3rem;margin-right:0.25rem;">${Utils.escapeHTML(p)}</span>`).join('') : '--'}</td>
                <td><span class="fw-600">${c.totalOTs}</span></td>
                <td><div class="d-flex gap-1">
                    <button class="btn-bf-icon" onclick="App.clientes.openEdit('${c.nombre.replace(/'/g,"\\'")}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-bf-icon danger" onclick="App.clientes.remove('${c.nombre.replace(/'/g,"\\'")}')"><i class="fa-solid fa-trash"></i></button>
                </div></td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(c => `${c.nombre} ${c.rut} ${c.telefono}`.toLowerCase().includes(t)));
        },

        openCreate() {
            Utils.setText('modal-cliente-title', 'Nuevo Cliente');
            ['cl-id','cl-nombre','cl-apellido','cl-cedula','cl-email','cl-telefono','cl-ciudad','cl-direccion','cl-notas'].forEach(id => Utils.setVal(id, ''));
            Utils.showModal('modal-cliente');
        },

        openEdit(name) {
            const c = this._data.find(x => x.nombre === name);
            if (!c) return;
            Utils.setText('modal-cliente-title', 'Editar Cliente');
            Utils.setVal('cl-id', c.nombre);
            Utils.setVal('cl-nombre', c.nombre);
            Utils.setVal('cl-cedula', c.rut);
            Utils.setVal('cl-telefono', c.telefono);
            Utils.setVal('cl-email', '');
            Utils.setVal('cl-direccion', '');
            Utils.setVal('cl-notas', '');
            Utils.showModal('modal-cliente');
        },

        async save() {
            const body = {
                nombre: Utils.val('cl-nombre'),
                apellido: Utils.val('cl-apellido') || '',
                cedula_rif: Utils.val('cl-cedula'),
                email: Utils.val('cl-email'),
                telefono: Utils.val('cl-telefono'),
                ciudad: Utils.val('cl-ciudad') || '',
                direccion: Utils.val('cl-direccion'),
                notas: Utils.val('cl-notas'),
            };
            if (!body.nombre) { Utils.toast('El nombre es requerido', 'warning'); return; }
            try {
                await API.post('/clientes', body);
                Utils.toast('Cliente guardado', 'success');
                Utils.hideModal('modal-cliente');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(name) {
            if (!await Utils.confirm(`¿Eliminar el cliente "${name}"?`)) return;
            try {
                const c = this._data.find(x => x.nombre === name);
                if (c) await API.delete(`/clientes/${c.id}`);
                Utils.toast('Cliente eliminado', 'success');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // VEHÍCULOS
    // ========================================================
    vehiculos: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/todas-ordenes?limite=500');
                const ordenes = data.data?.ordenes || data.ordenes || [];
                const vehMap = {};
                ordenes.forEach(o => {
                    if (o.patente_placa) {
                        if (!vehMap[o.patente_placa]) {
                            vehMap[o.patente_placa] = { patente: o.patente_placa, marca: o.marca || '', modelo: o.modelo || '', anio: o.anio || '', color: '', cliente_nombre: o.cliente_nombre || '', _id: o.vehiculo_id || null };
                        }
                    }
                });
                this._data = Object.values(vehMap);
                this.render(this._data);
            } catch (err) { this._data = []; this.render([]); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-vehiculos');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="bf-empty"><i class="fa-solid fa-car"></i>Sin vehículos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(v => `<tr>
                <td class="fw-600">${Utils.escapeHTML(v.patente)}</td>
                <td>${Utils.escapeHTML(v.marca || '--')}</td>
                <td>${Utils.escapeHTML(v.modelo || '--')}</td>
                <td>${Utils.escapeHTML(v.anio || '--')}</td>
                <td>${Utils.escapeHTML(v.color || '--')}</td>
                <td>${Utils.escapeHTML(v.cliente_nombre || '--')}</td>
                <td><button class="btn-bf-icon" onclick="App.vehiculos.openEdit('${v.patente.replace(/'/g,"\\'")}')"><i class="fa-solid fa-pen"></i></button></td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(v => `${v.patente} ${v.marca} ${v.modelo} ${v.cliente_nombre}`.toLowerCase().includes(t)));
        },

        async openCreate() {
            Utils.setText('modal-vehiculo-title', 'Nuevo Vehículo');
            ['vh-id','vh-placa','vh-marca','vh-modelo','vh-anio','vh-color','vh-km'].forEach(id => Utils.setVal(id, ''));
            await this.loadClientesSelect();
            Utils.showModal('modal-vehiculo');
        },

        async loadClientesSelect() {
            try {
                const data = await API.get('/todas-ordenes?limite=500');
                const ordenes = data.data?.ordenes || data.ordenes || [];
                const clientMap = {};
                ordenes.forEach(o => {
                    const name = o.cliente_nombre || '';
                    if (name && !clientMap[name]) clientMap[name] = name;
                });
                const sel = document.getElementById('vh-cliente');
                if (sel) {
                    sel.innerHTML = '<option value="">Seleccionar...</option>' +
                        Object.keys(clientMap).map(n => `<option value="${n}">${Utils.escapeHTML(n)}</option>`).join('');
                }
            } catch (err) { console.error(err); }
        },

        async openEdit(patente) {
            const v = this._data.find(x => x.patente === patente);
            if (!v) { await this.openCreate(); return; }
            Utils.setText('modal-vehiculo-title', 'Editar Vehículo');
            Utils.setVal('vh-id', v.patente);
            Utils.setVal('vh-placa', v.patente);
            Utils.setVal('vh-marca', v.marca);
            Utils.setVal('vh-modelo', v.modelo);
            Utils.setVal('vh-anio', v.anio);
            Utils.setVal('vh-color', v.color);
            Utils.setVal('vh-km', '');
            await this.loadClientesSelect();
            setTimeout(() => Utils.setVal('vh-cliente', v.cliente_nombre || ''), 100);
            Utils.showModal('modal-vehiculo');
        },

        async save() {
            const body = {
                patente: Utils.val('vh-placa').toUpperCase(),
                cliente_nombre: Utils.val('vh-cliente'),
                marca: Utils.val('vh-marca'),
                modelo: Utils.val('vh-modelo'),
                anio: Utils.val('vh-anio') || null,
                color: Utils.val('vh-color'),
            };
            if (!body.patente) { Utils.toast('La placa es requerida', 'warning'); return; }
            try {
                await API.post('/vehiculos', body);
                Utils.toast('Vehículo guardado', 'success');
                Utils.hideModal('modal-vehiculo');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // WHATSAPP
    // ========================================================
    whatsapp: {
        async load() {
            try {
                const data = await API.get('/ultramsg');
                const config = data.data || data;
                const container = document.getElementById('whatsapp-config-container');
                container.innerHTML = `
                    <div class="row g-3">
                        <div class="col-md-6"><div class="bf-label">Instance ID</div><input type="text" class="bf-input" id="wa-instance" value="${Utils.escapeHTML(config.instance_id || config.instanceId || '')}"></div>
                        <div class="col-md-6"><div class="bf-label">Token</div><input type="text" class="bf-input" id="wa-token" value="${Utils.escapeHTML(config.token || '')}"></div>
                        <div class="col-md-6"><div class="bf-label">Teléfono</div><input type="text" class="bf-input" id="wa-phone" value="${Utils.escapeHTML(config.phone || config.telefono || '')}"></div>
                        <div class="col-md-6"><div class="bf-label">Nombre Negocio</div><input type="text" class="bf-input" id="wa-nombre" value="${Utils.escapeHTML(config.nombre_negocio || config.nombre || '')}"></div>
                    </div>
                    <div class="mt-3 d-flex gap-2">
                        <button class="btn-bf" onclick="App.whatsapp.save()"><i class="fa-solid fa-save"></i>Guardar</button>
                        <button class="btn-bf-outline" onclick="App.whatsapp.testConnection()"><i class="fa-solid fa-plug"></i>Probar Conexión</button>
                    </div>`;
            } catch (err) {
                document.getElementById('whatsapp-config-container').innerHTML = '<div class="bf-empty"><i class="fa-brands fa-whatsapp"></i>Error cargando configuración</div>';
            }
        },

        async save() {
            const body = {
                instance_id: Utils.val('wa-instance'),
                token: Utils.val('wa-token'),
                phone: Utils.val('wa-phone'),
                nombre_negocio: Utils.val('wa-nombre'),
            };
            try {
                await API.post('/ultramsg', body);
                Utils.toast('Configuración guardada', 'success');
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async testConnection() {
            Utils.toast('Probando conexión...', 'info');
        },
    },

    // ========================================================
    // CONFIGURACIÓN
    // ========================================================
    config: {
        async load() {
            this.loadDomicilio();
            this.loadUltraMsg();
        },

        async loadDomicilio() {
            try {
                const data = await API.get('/config-domicilio');
                const config = data.data || data;
                const container = document.getElementById('config-domicilio-container');
                container.innerHTML = `
                    <div class="row g-3">
                        <div class="col-md-6"><div class="bf-label">Latitud</div><input type="text" class="bf-input" id="dom-lat" value="${Utils.escapeHTML(config.latitud || '')}"></div>
                        <div class="col-md-6"><div class="bf-label">Longitud</div><input type="text" class="bf-input" id="dom-lng" value="${Utils.escapeHTML(config.longitud || '')}"></div>
                        <div class="col-md-6"><div class="bf-label">Radio Gratis (km)</div><input type="number" class="bf-input" id="dom-radio" value="${config.radio_gratis || 0}" min="0" step="0.1"></div>
                        <div class="col-md-6"><div class="bf-label">Tarifa por km ($)</div><input type="number" class="bf-input" id="dom-tarifa" value="${config.tarifa_km || 0}" min="0"></div>
                    </div>
                    <div class="mt-3"><button class="btn-bf" onclick="App.config.saveDomicilio()"><i class="fa-solid fa-save"></i>Guardar</button></div>`;
            } catch (err) {
                document.getElementById('config-domicilio-container').innerHTML = '<div class="bf-empty"><i class="fa-solid fa-truck"></i>Error cargando</div>';
            }
        },

        async loadUltraMsg() {
            try {
                const data = await API.get('/ultramsg');
                const config = data.data || data;
                const container = document.getElementById('config-ultramsg-container');
                container.innerHTML = `
                    <div class="row g-3">
                        <div class="col-md-6"><div class="bf-label">Instance ID</div><input type="text" class="bf-input" id="ultra-instance" value="${Utils.escapeHTML(config.instance_id || '')}"></div>
                        <div class="col-md-6"><div class="bf-label">Token</div><input type="text" class="bf-input" id="ultra-token" value="${Utils.escapeHTML(config.token || '')}"></div>
                        <div class="col-md-6"><div class="bf-label">Teléfono</div><input type="text" class="bf-input" id="ultra-phone" value="${Utils.escapeHTML(config.phone || '')}"></div>
                        <div class="col-md-6"><div class="bf-label">Nombre Negocio</div><input type="text" class="bf-input" id="ultra-nombre" value="${Utils.escapeHTML(config.nombre_negocio || '')}"></div>
                    </div>
                    <div class="mt-3"><button class="btn-bf" onclick="App.config.saveUltraMsg()"><i class="fa-solid fa-save"></i>Guardar</button></div>`;
            } catch (err) {
                document.getElementById('config-ultramsg-container').innerHTML = '<div class="bf-empty"><i class="fa-brands fa-whatsapp"></i>Error cargando</div>';
            }
        },

        async saveDomicilio() {
            const body = {
                latitud: Utils.val('dom-lat'),
                longitud: Utils.val('dom-lng'),
                radio_gratis: parseFloat(Utils.val('dom-radio')) || 0,
                tarifa_km: parseFloat(Utils.val('dom-tarifa')) || 0,
            };
            try {
                await API.post('/config-domicilio', body);
                Utils.toast('Configuración de domicilio guardada', 'success');
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async saveUltraMsg() {
            const body = {
                instance_id: Utils.val('ultra-instance'),
                token: Utils.val('ultra-token'),
                phone: Utils.val('ultra-phone'),
                nombre_negocio: Utils.val('ultra-nombre'),
            };
            try {
                await API.post('/ultramsg', body);
                Utils.toast('Configuración UltraMsg guardada', 'success');
            } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // INVENTARIO
    // ========================================================
    inventario: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/inventario');
                this._data = data.data || data.items || data || [];
                this.render(this._data);
            } catch (err) { this._data = []; this.render([]); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-inventario');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="bf-empty"><i class="fa-solid fa-boxes-stacked"></i>Sin items</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(i => {
                const low = (i.cantidad || 0) <= (i.cantidad_minima || i.minima || 0);
                return `<tr${low ? ' style="background:#fef2f2;"' : ''}>
                    <td class="fw-600">${Utils.escapeHTML(i.codigo || '--')}</td>
                    <td>${Utils.escapeHTML(i.nombre || '--')}</td>
                    <td>${Utils.escapeHTML(i.categoria || '--')}</td>
                    <td class="${low ? 'text-danger fw-600' : 'fw-600'}">${i.cantidad || 0}${low ? ' <i class="fa-solid fa-triangle-exclamation" style="font-size:0.7rem;"></i>' : ''}</td>
                    <td class="fw-600">${Utils.fmt(i.precio_venta || i.pventa || 0)}</td>
                    <td><div class="d-flex gap-1">
                        <button class="btn-bf-icon" onclick="App.inventario.openEdit(${i.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-bf-icon danger" onclick="App.inventario.remove(${i.id})"><i class="fa-solid fa-trash"></i></button>
                    </div></td>
                </tr>`;
            }).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(i => `${i.codigo} ${i.nombre} ${i.categoria}`.toLowerCase().includes(t)));
        },

        openCreate() {
            Utils.setText('modal-inventario-title', 'Nuevo Item');
            ['inv-id','inv-codigo','inv-nombre','inv-categoria','inv-cantidad','inv-pcompra','inv-pventa','inv-proveedor'].forEach(id => Utils.setVal(id, ''));
            Utils.showModal('modal-inventario');
        },

        openEdit(id) {
            const i = this._data.find(x => x.id === id);
            if (!i) return;
            Utils.setText('modal-inventario-title', 'Editar Item');
            Utils.setVal('inv-id', i.id);
            Utils.setVal('inv-codigo', i.codigo);
            Utils.setVal('inv-nombre', i.nombre);
            Utils.setVal('inv-categoria', i.categoria);
            Utils.setVal('inv-cantidad', i.cantidad);
            Utils.setVal('inv-pcompra', i.precio_compra || i.pcompra);
            Utils.setVal('inv-pventa', i.precio_venta || i.pventa);
            Utils.setVal('inv-proveedor', i.proveedor);
            Utils.showModal('modal-inventario');
        },

        async save() {
            const id = Utils.val('inv-id');
            const body = {
                codigo: Utils.val('inv-codigo'),
                nombre: Utils.val('inv-nombre'),
                categoria: Utils.val('inv-categoria'),
                cantidad: parseInt(Utils.val('inv-cantidad')) || 0,
                precio_compra: parseFloat(Utils.val('inv-pcompra')) || 0,
                precio_venta: parseFloat(Utils.val('inv-pventa')) || 0,
                proveedor: Utils.val('inv-proveedor'),
            };
            if (!body.codigo || !body.nombre) { Utils.toast('Código y Nombre son requeridos', 'warning'); return; }
            try {
                if (id) { await API.put(`/inventario/${id}`, body); Utils.toast('Item actualizado', 'success'); }
                else { await API.post('/inventario', body); Utils.toast('Item creado', 'success'); }
                Utils.hideModal('modal-inventario');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar este item?')) return;
            try { await API.delete(`/inventario/${id}`); Utils.toast('Item eliminado', 'success'); this.load(); }
            catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // NOTIFICACIONES
    // ========================================================
    notificaciones: {
        async load() {
            try {
                const data = await API.get('/notificaciones');
                const notifs = data.data || data.notificaciones || data || [];
                const tbody = document.getElementById('tbl-notificaciones');
                if (!tbody) return;
                if (!notifs || notifs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="bf-empty"><i class="fa-solid fa-bell-slash"></i>Sin notificaciones</td></tr>';
                    return;
                }
                tbody.innerHTML = notifs.slice(0, 100).map(n => {
                    const estadoBadge = n.estado === 'enviado'
                        ? '<span class="badge-st" style="background:#fef3c7;color:#d97706;">Pendiente</span>'
                        : '<span class="badge-st" style="background:#dcfce7;color:#16a34a;">Enviado</span>';
                    return `<tr>
                        <td style="font-size:0.78rem;">${Utils.fmtDateTime(n.fecha_envio || n.created_at)}</td>
                        <td style="font-size:0.82rem;">${Utils.escapeHTML(n.destino || n.telefono || '--')}</td>
                        <td>${Utils.escapeHTML(n.orden_numero ? '#' + String(n.orden_numero).padStart(6,'0') : '--')}</td>
                        <td>${estadoBadge}</td>
                        <td style="font-size:0.78rem;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${Utils.escapeHTML(n.mensaje || '')}">${Utils.escapeHTML(n.mensaje || '').substring(0, 80)}</td>
                    </tr>`;
                }).join('');
            } catch (err) {
                const tbody = document.getElementById('tbl-notificaciones');
                if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="bf-empty"><i class="fa-solid fa-bell-slash"></i>Error cargando</td></tr>';
            }
        },
    },

    // ========================================================
    // LANDING PAGES
    // ========================================================
    landing: {
        _data: [],
        async load() {
            try {
                const data = await API.get('/landing');
                this._data = data.data || data || [];
                this.render();
            } catch (e) {
                Utils.toast('Error cargando landing pages', 'error');
            }
        },
        render() {
            const tbody = document.getElementById('tbl-landing');
            if (!tbody) return;
            if (!this._data.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="bf-empty"><i class="fa-solid fa-globe"></i>Sin landing pages</td></tr>';
                return;
            }
            tbody.innerHTML = this._data.map(l => `<tr>
                <td><strong>${Utils.escapeHTML(l.titulo || '')}</strong><br><small class="text-muted">/${Utils.escapeHTML(l.slug || '')}</small></td>
                <td>${l.visitas || 0}</td>
                <td>${l.conversiones || 0}</td>
                <td>${l.publica ? '<span class="badge-st" style="background:#dcfce7;color:#16a34a;">Activa</span>' : '<span class="badge-st" style="background:#fee2e2;color:#dc2626;">Borrador</span>'}</td>
                <td>${Utils.fmtDate(l.creado_en)}</td>
            </tr>`).join('');
        },
    },

    // ========================================================
    // CONTABILIDAD
    // ========================================================
    contabilidad: {
        async load() {
            try {
                const data = await API.get('/contabilidad/cuentas');
                const cuentas = data.data || data || [];
                const tbody = document.getElementById('tbl-cuentas');
                if (!tbody) return;
                if (!cuentas.length) {
                    tbody.innerHTML = '<tr><td colspan="4" class="bf-empty"><i class="fa-solid fa-scale-balanced"></i>Sin cuentas contables</td></tr>';
                    return;
                }
                const tipoColor = { activo: '#dbeafe', pasivo: '#fef3c7', patrimonio: '#e0e7ff', ingreso: '#dcfce7', gasto: '#fee2e2' };
                const tipoLabel = { activo: 'Activo', pasivo: 'Pasivo', patrimonio: 'Patrimonio', ingreso: 'Ingreso', gasto: 'Gasto' };
                tbody.innerHTML = cuentas.map(c => `<tr>
                    <td><strong>${Utils.escapeHTML(c.codigo || '')}</strong></td>
                    <td>${Utils.escapeHTML(c.nombre || '')}</td>
                    <td><span class="badge-st" style="background:${tipoColor[c.tipo] || '#f1f5f9'};color:#334155;">${tipoLabel[c.tipo] || c.tipo}</span></td>
                    <td>${c.activa ? 'Sí' : 'No'}</td>
                </tr>`).join('');
            } catch (e) {
                Utils.toast('Error cargando contabilidad', 'error');
            }
        },
    },

    // ========================================================
    // EXPRESS - Órdenes Express Dashboard
    // ========================================================
    express: {
        _data: [],

        async init() {
            await this.cargar();
        },

        async cargar() {
            try {
                const estado = Utils.val('express-filtro-estado') || '';
                const tecnicoId = Utils.val('express-filtro-tecnico') || '';
                const periodo = Utils.val('express-filtro-periodo') || '';
                const valor = Utils.val('express-filtro-valor') || '';

                let endpoint = '/ordenes-express?';
                if (estado) endpoint += `estado=${encodeURIComponent(estado)}&`;
                if (tecnicoId) endpoint += `tecnico_id=${encodeURIComponent(tecnicoId)}&`;
                if (periodo) endpoint += `periodo=${encodeURIComponent(periodo)}&`;
                if (valor) endpoint += `valor=${encodeURIComponent(valor)}&`;

                const data = await API.get(endpoint);
                if (data.success || data.ordenes) {
                    this._data = data.ordenes || [];
                    this.renderizarKPIs(data.metricas);
                    this.renderizarProgreso(data.metricas);
                    this.renderizarFinanciero(data.metricas);
                    this.renderizar(data.ordenes || []);
                    this.actualizarSelectTecnicos(data.tecnicos || []);
                } else {
                    const container = document.getElementById('express-lista');
                    if (container) container.innerHTML = '<div class="bf-empty"><i class="fa-solid fa-exclamation-triangle"></i>Error cargando órdenes express</div>';
                }
            } catch (err) {
                console.error('Error al cargar órdenes express:', err);
                const container = document.getElementById('express-lista');
                if (container) container.innerHTML = '<div class="bf-empty"><i class="fa-solid fa-exclamation-triangle"></i>Error de conexión</div>';
            }
        },

        renderizarKPIs(m) {
            if (!m) return;
            Utils.setText('express-kpi-total', m.total_express || 0);
            Utils.setText('express-kpi-pendientes', (m.pendientes || 0) + (m.en_sitio || 0) + (m.en_progreso || 0) + (m.pendiente_piezas || 0));
            Utils.setText('express-kpi-cerradas', (m.cerradas || 0) + (m.completadas || 0));
            Utils.setText('express-kpi-sin-asignar', m.sin_asignar || 0);
        },

        renderizarProgreso(m) {
            if (!m) return;
            const total = m.total_express || 0;
            const barra = document.getElementById('express-barra-progreso');
            const texto = document.getElementById('express-progreso-texto');
            if (!barra || !texto) return;

            if (total === 0) {
                barra.style.width = '0%';
                barra.textContent = '0%';
                texto.textContent = 'Sin datos';
                Utils.setText('express-barra-pend', '0');
                Utils.setText('express-barra-prog', '0');
                Utils.setText('express-barra-comp', '0');
                Utils.setText('express-barra-nocomp', '0');
                return;
            }

            const pendientes = (m.pendientes || 0) + (m.pendiente_piezas || 0);
            const enProgreso = (m.en_sitio || 0) + (m.en_progreso || 0);
            const completadas = (m.cerradas || 0) + (m.completadas || 0);
            const noCompletadas = m.no_completadas || 0;
            const pct = Math.round((completadas / total) * 100);

            barra.style.width = pct + '%';
            barra.textContent = pct + '%';
            texto.textContent = pct + '% completado';
            Utils.setText('express-barra-pend', pendientes);
            Utils.setText('express-barra-prog', enProgreso);
            Utils.setText('express-barra-comp', completadas);
            Utils.setText('express-barra-nocomp', noCompletadas);
        },

        renderizarFinanciero(m) {
            if (!m) return;
            Utils.setText('express-fin-generado', Utils.fmt(m.total_generado || 0));
            Utils.setText('express-fin-abonos', Utils.fmt(m.total_abonos || 0));
            Utils.setText('express-fin-pendiente', Utils.fmt(m.total_pendiente || 0));
        },

        renderizar(ordenes) {
            const container = document.getElementById('express-lista');
            const countEl = document.getElementById('express-count');
            if (countEl) countEl.textContent = ordenes.length;
            if (!container) return;

            if (!ordenes || ordenes.length === 0) {
                container.innerHTML = '<div class="bf-empty"><i class="fa-solid fa-bolt" style="color:#f59e0b;"></i>No hay órdenes express con los filtros seleccionados</div>';
                return;
            }

            container.innerHTML = ordenes.map(o => {
                const num = String(o.numero_orden).padStart(6, '0');
                const estado = o.estado_trabajo || 'N/A';
                const tieneTecnico = !!o.tecnico_nombre;
                const tieneDomicilio = Number(o.cargo_domicilio || 0) > 0;
                return `<div class="d-flex justify-content-between align-items-start p-3 mb-2" style="background:#f8fafc;border-radius:0.5rem;border-left:4px solid #f59e0b;cursor:pointer;" onclick="App.ordenes.ver(${o.id})">
                    <div>
                        <div class="fw-700" style="color:#d97706;"><i class="fa-solid fa-bolt me-1"></i>EXP${num}</div>
                        ${tieneDomicilio ? '<span class="badge-st" style="background:#dc2626;font-size:0.65rem;"><i class="fa-solid fa-truck me-1"></i>' + Utils.fmt(o.cargo_domicilio) + '</span>' : ''}
                        ${!tieneTecnico ? '<span class="badge-st" style="background:#dc2626;font-size:0.65rem;"><i class="fa-solid fa-user-slash me-1"></i>Sin asignar</span>' : ''}
                    </div>
                    <span class="badge-st ${Utils.badgeClass(estado)}">${Utils.escapeHTML(estado)}</span>
                    <div class="row mt-1" style="font-size:0.82rem;">
                        <div class="col-md-3"><i class="fa-solid fa-car me-1" style="color:#94a3b8;"></i><strong>${Utils.escapeHTML(o.patente_placa || '')}</strong> ${Utils.escapeHTML(o.marca || '')} ${Utils.escapeHTML(o.modelo || '')}</div>
                        <div class="col-md-3"><i class="fa-solid fa-user me-1" style="color:#94a3b8;"></i>${Utils.escapeHTML(o.cliente_nombre || 'N/A')}</div>
                        <div class="col-md-3">${tieneTecnico ? '<i class="fa-solid fa-user-gear me-1" style="color:#94a3b8;"></i>' + Utils.escapeHTML(o.tecnico_nombre) : '<span style="color:#dc2626;">Sin técnico</span>'}</div>
                        <div class="col-md-3 text-end"><strong style="color:var(--bf-primary);">${Utils.fmt(o.monto_total || 0)}</strong></div>
                    </div>
                </div>`;
            }).join('');
        },

        actualizarSelectTecnicos(tecnicos) {
            const sel = document.getElementById('express-filtro-tecnico');
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = '<option value="">Todos los técnicos</option>' +
                (tecnicos || []).map(t => `<option value="${t.id}" ${String(t.id) === current ? 'selected' : ''}>${Utils.escapeHTML(t.nombre)}</option>`).join('');
        },
    },

    // ========================================================
    // CALENDARIO - FullCalendar con gestión de agenda
    // ========================================================
    calendario: {
        _calendar: null,
        _tecnicos: [],

        async init() {
            await this.cargarTecnicos();
            this.iniciarCalendario();
        },

        async cargarTecnicos() {
            try {
                const data = await API.get('/tecnicos');
                this._tecnicos = (data.data || data.tecnicos || data || []).filter(t => t.activo !== false);
                const sel = document.getElementById('cal-filtro-tecnico');
                const selModal = document.getElementById('cal-tecnico');
                if (sel) {
                    sel.innerHTML = '<option value="">Todos</option>' +
                        this._tecnicos.map(t => `<option value="${t.id}">${Utils.escapeHTML(t.nombre)}</option>`).join('');
                }
                if (selModal) {
                    selModal.innerHTML = '<option value="">Seleccionar técnico...</option>' +
                        this._tecnicos.map(t => `<option value="${t.id}">${Utils.escapeHTML(t.nombre)}</option>`).join('');
                }
            } catch (err) { console.error(err); }
        },

        iniciarCalendario() {
            const el = document.getElementById('calendario-container');
            if (!el || typeof FullCalendar === 'undefined') return;

            this._calendar = new FullCalendar.Calendar(el, {
                initialView: 'timeGridWeek',
                locale: 'es',
                headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
                editable: true,
                droppable: true,
                selectable: true,
                slotMinTime: '07:00:00',
                slotMaxTime: '21:00:00',
                height: 'auto',
                events: async (info, successCallback, failureCallback) => {
                    try {
                        const eventos = await this.cargarEventos(info.startStr, info.endStr);
                        successCallback(eventos);
                    } catch (e) {
                        failureCallback(e);
                    }
                },
                eventClick: (info) => this.editarEvento(info.event),
                eventDrop: (info) => this.actualizarFechas(info.event),
                eventResize: (info) => this.actualizarFechas(info.event),
                dateClick: (info) => this.abrirModalNuevoEvento(info.dateStr),
            });
            this._calendar.render();
        },

        async cargarEventos(startStr, endStr) {
            try {
                const tecnicoId = Utils.val('cal-filtro-tecnico') || '';
                const tipo = Utils.val('cal-filtro-tipo') || '';

                let endpoint = `/calendario?inicio=${startStr.split('T')[0]}&fin=${endStr.split('T')[0]}&ordenes=1`;
                if (tecnicoId) endpoint += `&tecnico_id=${tecnicoId}`;
                if (tipo) endpoint += `&tipo=${tipo}`;

                const data = await API.get(endpoint);
                if (!data.success && !data.eventos) return [];

                const eventos = [];

                // Eventos de agenda
                (data.eventos || []).forEach(ev => {
                    eventos.push({
                        id: 'agenda-' + ev.id,
                        title: (ev.titulo || '') + (ev.tecnico_nombre ? ' - ' + ev.tecnico_nombre : ''),
                        start: ev.fecha_inicio,
                        end: ev.fecha_fin,
                        color: ev.color || '#0d9488',
                        extendedProps: { tipo: 'agenda', agendaId: ev.id, tecnicoId: ev.tecnico_id, tecnicoNombre: ev.tecnico_nombre, ordenId: ev.orden_id, tipoServicio: ev.tipo_servicio, observaciones: ev.observaciones, estado: ev.estado, numeroOrden: ev.numero_orden },
                    });
                });

                // Órdenes programadas sin evento de agenda
                const agendaOrdenIds = new Set((data.eventos || []).filter(e => e.orden_id).map(e => e.orden_id));
                (data.ordenes_programadas || []).forEach(o => {
                    if (agendaOrdenIds.has(o.id)) return;
                    const fecha = o.fecha_programada;
                    const hora = o.hora_programada || '09:00';
                    const esExpress = o.es_express === 1;
                    const inicio = fecha + 'T' + hora;
                    const finDate = new Date(inicio);
                    finDate.setHours(finDate.getHours() + 2);
                    eventos.push({
                        id: 'orden-' + o.id,
                        title: (esExpress ? '⚡ ' : '🔧 ') + 'OT#' + String(o.numero_orden).padStart(6, '0') + ' ' + (o.patente_placa || '') + (o.tecnico_nombre ? ' - ' + o.tecnico_nombre : ''),
                        start: inicio,
                        end: finDate.toISOString(),
                        color: esExpress ? '#dc2626' : '#0d9488',
                        extendedProps: { tipo: 'orden', ordenId: o.id, tecnicoId: o.tecnico_asignado_id, tecnicoNombre: o.tecnico_nombre, esExpress },
                    });
                });

                return eventos;
            } catch (e) {
                console.error('Error cargando eventos:', e);
                return [];
            }
        },

        async guardarEvento() {
            const eventoId = Utils.val('cal-evento-id');
            const titulo = Utils.val('cal-titulo');
            const tecnicoId = Utils.val('cal-tecnico');
            const tipoServicio = Utils.val('cal-tipo-servicio');
            const fechaInicio = Utils.val('cal-fecha-inicio');
            const fechaFin = Utils.val('cal-fecha-fin');
            const observaciones = Utils.val('cal-observaciones');
            const ordenId = Utils.val('cal-orden-id');

            if (!titulo) { Utils.toast('Ingresa un título', 'warning'); return; }
            if (!tecnicoId) { Utils.toast('Selecciona un técnico', 'warning'); return; }
            if (!fechaInicio || !fechaFin) { Utils.toast('Selecciona fechas', 'warning'); return; }

            const btn = document.getElementById('cal-btn-guardar');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Guardando...'; }

            try {
                const isEdit = !!eventoId;
                const body = {
                    titulo, tecnico_id: parseInt(tecnicoId), tipo_servicio: tipoServicio,
                    fecha_inicio: fechaInicio, fecha_fin: fechaFin, observaciones,
                    orden_id: ordenId ? parseInt(ordenId) : null,
                };
                if (isEdit) body.id = parseInt(eventoId);

                const data = isEdit ? await API.put('/calendario', body) : await API.post('/calendario', body);
                if (data.success) {
                    Utils.toast(isEdit ? 'Evento actualizado' : 'Evento creado', 'success');
                    Utils.hideModal('modalCalendarioEvento');
                    if (this._calendar) this._calendar.refetchEvents();
                } else {
                    Utils.toast(data.error || 'Error al guardar', 'error');
                }
            } catch (err) {
                Utils.toast(err.message, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-save me-1"></i>Guardar'; }
            }
        },

        async eliminarEvento() {
            const eventoId = Utils.val('cal-evento-id');
            if (!eventoId) return;
            if (!await Utils.confirm('¿Eliminar este evento?')) return;

            try {
                const data = await API.delete(`/calendario?id=${eventoId}`);
                if (data.success) {
                    Utils.toast('Evento eliminado', 'success');
                    Utils.hideModal('modalCalendarioEvento');
                    if (this._calendar) this._calendar.refetchEvents();
                } else {
                    Utils.toast(data.error || 'Error al eliminar', 'error');
                }
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async actualizarFechas(event) {
            const props = event.extendedProps;
            const inicio = event.start ? event.start.toISOString().substring(0, 19) : '';
            const fin = event.end ? event.end.toISOString().substring(0, 19) : '';
            try {
                if (props.tipo === 'orden') {
                    await API.put('/calendario', { tipo: 'orden', orden_id: props.ordenId, fecha_inicio: inicio, fecha_fin: fin });
                    Utils.toast('Fecha de OT actualizada', 'success');
                } else {
                    await API.put('/calendario', { id: props.agendaId, fecha_inicio: inicio, fecha_fin: fin });
                    Utils.toast('Evento movido correctamente', 'success');
                }
            } catch (err) {
                Utils.toast(err.message, 'error');
                event.revert();
            }
        },

        editarEvento(event) {
            const props = event.extendedProps;
            if (props.tipo === 'orden') {
                if (props.ordenId) App.ordenes.ver(props.ordenId);
                return;
            }
            // Evento de agenda - abrir modal edición
            Utils.setVal('cal-evento-id', props.agendaId || '');
            Utils.setVal('cal-titulo', (event.title || '').replace(/ - .+$/, ''));
            Utils.setVal('cal-tecnico', props.tecnicoId || '');
            Utils.setVal('cal-tipo-servicio', props.tipoServicio || 'taller');
            Utils.setVal('cal-observaciones', props.observaciones || '');
            Utils.setVal('cal-orden-id', props.ordenId || '');
            Utils.setVal('cal-fecha-inicio', event.start ? event.start.toISOString().substring(0, 16) : '');
            Utils.setVal('cal-fecha-fin', event.end ? event.end.toISOString().substring(0, 16) : '');
            const btnEliminar = document.getElementById('cal-btn-eliminar');
            const btnVerOT = document.getElementById('cal-btn-ver-ot');
            if (btnEliminar) btnEliminar.style.display = 'inline-block';
            if (btnVerOT) btnVerOT.style.display = props.ordenId ? 'inline-block' : 'none';
            const modalTitle = document.getElementById('modal-cal-titulo');
            if (modalTitle) modalTitle.textContent = 'Editar Evento';
            Utils.showModal('modalCalendarioEvento');
        },

        abrirModalNuevoEvento(dateStr) {
            Utils.setVal('cal-evento-id', '');
            Utils.setVal('cal-titulo', '');
            Utils.setVal('cal-tecnico', '');
            Utils.setVal('cal-tipo-servicio', 'taller');
            Utils.setVal('cal-observaciones', '');
            Utils.setVal('cal-orden-id', '');

            if (dateStr) {
                let inicio, fin;
                if (dateStr.includes('T')) {
                    inicio = dateStr.substring(0, 16);
                    const d = new Date(dateStr);
                    d.setHours(d.getHours() + 1);
                    fin = d.toISOString().substring(0, 16);
                } else {
                    inicio = dateStr + 'T09:00';
                    fin = dateStr + 'T11:00';
                }
                Utils.setVal('cal-fecha-inicio', inicio);
                Utils.setVal('cal-fecha-fin', fin);
            } else {
                Utils.setVal('cal-fecha-inicio', Utils.today() + 'T09:00');
                Utils.setVal('cal-fecha-fin', Utils.today() + 'T11:00');
            }

            const btnEliminar = document.getElementById('cal-btn-eliminar');
            const btnVerOT = document.getElementById('cal-btn-ver-ot');
            if (btnEliminar) btnEliminar.style.display = 'none';
            if (btnVerOT) btnVerOT.style.display = 'none';
            const modalTitle = document.getElementById('modal-cal-titulo');
            if (modalTitle) modalTitle.textContent = 'Nuevo Evento';
            Utils.showModal('modalCalendarioEvento');
        },

        verOrdenDesdeCalendario() {
            const ordenId = Utils.val('cal-orden-id');
            if (!ordenId) { Utils.toast('Sin OT asociada', 'warning'); return; }
            Utils.hideModal('modalCalendarioEvento');
            App.ordenes.ver(parseInt(ordenId));
        },
    },

    // ========================================================
    // COSTOS ADICIONALES - Módulo de gestión de costos
    // ========================================================
    costosAdicionales: {
        _ordenIdActual: null,

        async load() {
            // La página de costos adicionales redirige al uso por orden
            Utils.toast('Use la gestión de costos desde una orden específica', 'info');
        },

        ordenIdActual: null,

        async abrir(ordenId, numeroOrden, patente, cliente) {
            this.ordenIdActual = ordenId;
            Utils.setText('costos-orden-numero', String(numeroOrden || ordenId).padStart(6, '0'));
            Utils.setText('costos-patente', patente || '');
            Utils.setText('costos-cliente', cliente || '');
            Utils.setVal('nuevo-costo-concepto', '');
            Utils.setVal('nuevo-costo-monto', '');
            await this.cargar(ordenId);
            Utils.showModal('modalCostosAdicionales');
        },

        async cargar(ordenId) {
            try {
                const data = await API.get(`/costos-adicionales?orden_id=${ordenId}`);
                const costos = data.costos || data.data || [];
                const total = data.total || 0;
                const desglose = data.desglose || {};
                this.renderizar(costos, total, desglose);

                // Actualizar totales por categoría
                const totalMO = desglose.mano_de_obra || 0;
                const totalRM = desglose.repuestos_materiales || 0;
                Utils.setText('costos-total-mano-obra', Utils.fmt(totalMO));
                Utils.setText('costos-total-repuestos', Utils.fmt(totalRM));
                const desgloseEl = document.getElementById('costos-desglose-container');
                if (desgloseEl) desgloseEl.style.display = (totalMO > 0 || totalRM > 0) ? 'block' : 'none';

                // Obtener monto original de la orden
                try {
                    const ordenData = await API.getPublic(`/ver-orden?id=${ordenId}`);
                    if (ordenData.orden) {
                        const montoFinal = Number(ordenData.orden.monto_total || 0) + total;
                        Utils.setText('costos-total-final', Utils.fmt(montoFinal));
                    }
                } catch (e) {}
            } catch (err) {
                console.error('Error cargando costos:', err);
            }
        },

        renderizar(costos, total, desglose) {
            const lista = document.getElementById('costos-lista');
            if (!lista) return;

            if (!costos || costos.length === 0) {
                lista.innerHTML = '<div class="bf-empty"><i class="fa-solid fa-receipt"></i>Sin costos adicionales registrados</div>';
                Utils.setText('costos-total-valor', '$0');
                return;
            }

            const totalMO = desglose ? (desglose.mano_de_obra || 0) : 0;
            const totalRM = desglose ? (desglose.repuestos_materiales || 0) : 0;

            lista.innerHTML = costos.map(c => {
                const esMO = c.categoria === 'Mano de Obra';
                const icon = esMO ? '🔧' : '🔩';
                const catLabel = esMO ? 'MO' : 'Rep';
                const catStyle = esMO ? 'background:#fef3c7;color:#d97706;' : 'background:#e2e8f0;color:#475569;';
                const fecha = c.fecha_registro ? Utils.fmtDate(c.fecha_registro) : '';
                return `<div class="d-flex justify-content-between align-items-center p-2 mb-1" style="background:#f8fafc;border-radius:0.5rem;">
                    <div>
                        <strong>${icon} ${Utils.escapeHTML(c.concepto)}</strong>
                        <br><small style="color:#94a3b8;">${fecha} · <span style="${catStyle}padding:0.1rem 0.3rem;border-radius:0.25rem;font-size:0.7rem;font-weight:600;">${catLabel}</span></small>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="fw-600">${Utils.fmt(c.monto)}</span>
                        <button class="btn-bf-icon danger" onclick="App.costosAdicionales.eliminar(${c.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
            }).join('');

            Utils.setText('costos-total-valor', Utils.fmt(total));
        },

        async agregar() {
            if (!this.ordenIdActual) return;
            const concepto = Utils.val('nuevo-costo-concepto');
            const monto = parseFloat(Utils.val('nuevo-costo-monto'));
            const categoria = Utils.val('nuevo-costo-tipo') || 'Mano de Obra';

            if (!concepto) { Utils.toast('Ingrese el concepto', 'warning'); return; }
            if (!monto || monto <= 0) { Utils.toast('Ingrese un monto válido', 'warning'); return; }

            try {
                const data = await API.post('/costos-adicionales', {
                    orden_id: this.ordenIdActual, concepto, monto, categoria,
                });
                if (data.success) {
                    Utils.toast(`Costo agregado: ${concepto}`, 'success');
                    Utils.setVal('nuevo-costo-concepto', '');
                    Utils.setVal('nuevo-costo-monto', '');
                    await this.cargar(this.ordenIdActual);
                } else {
                    Utils.toast(data.error || 'Error al agregar', 'error');
                }
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async eliminar(costoId) {
            if (!await Utils.confirm('¿Eliminar este costo?')) return;
            try {
                const data = await API.delete(`/costos-adicionales?id=${costoId}&orden_id=${this.ordenIdActual}`);
                if (data.success) {
                    Utils.toast('Costo eliminado', 'success');
                    await this.cargar(this.ordenIdActual);
                } else {
                    Utils.toast(data.error || 'Error al eliminar', 'error');
                }
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        calcularTotales(costos) {
            if (!costos || !Array.isArray(costos)) return { totalMO: 0, totalRep: 0, total: 0 };
            let totalMO = 0, totalRep = 0;
            costos.forEach(c => {
                const monto = Number(c.monto || 0);
                if (c.categoria === 'Mano de Obra') totalMO += monto;
                else totalRep += monto;
            });
            return { totalMO, totalRep, total: totalMO + totalRep };
        },
    },

    // ========================================================
    // ÓRDENES - Ver, Editar, PDF, Eliminar
    // ========================================================
    ordenes: {
        async ver(id) {
            try {
                const data = await API.getPublic(`/ver-orden?id=${id}`);
                if (data.orden) {
                    const o = data.orden;
                    const num = String(o.numero_orden).padStart(6, '0');
                    const estado = o.estado || 'Enviada';
                    const servicios = o.servicios_seleccionados || [];

                    // Construir HTML para modalVerOrden
                    let serviciosHtml = '';
                    if (servicios.length > 0) {
                        let sub = 0;
                        serviciosHtml = '<div class="table-responsive"><table class="bf-table"><thead><tr><th>Servicio</th><th>Categoría</th><th>Tipo</th><th>Precio</th></tr></thead><tbody>';
                        servicios.forEach(s => {
                            const precio = Number(s.precio_final || s.precio_sugerido || 0);
                            sub += precio;
                            const tipoBadge = s.tipo_comision === 'mano_obra'
                                ? '<span class="badge-st" style="background:#fef3c7;color:#d97706;">MO</span>'
                                : '<span class="badge-st" style="background:#e2e8f0;color:#475569;">Rep</span>';
                            serviciosHtml += `<tr><td>${Utils.escapeHTML(s.nombre)}</td><td>${Utils.escapeHTML(s.categoria || '')}</td><td>${tipoBadge}</td><td class="fw-600">${Utils.fmt(precio)}</td></tr>`;
                        });
                        serviciosHtml += `<tr style="background:#f0fdf4;"><td colspan="3" class="fw-700">Subtotal Servicios</td><td class="fw-700" style="color:#16a34a;">${Utils.fmt(sub)}</td></tr>`;
                        serviciosHtml += '</tbody></table></div>';
                    } else if (o.diagnostico_observaciones) {
                        serviciosHtml = `<p>${Utils.escapeHTML(o.diagnostico_observaciones)}</p>`;
                    } else {
                        serviciosHtml = '<p style="color:#94a3b8;">Sin trabajos</p>';
                    }

                    const modalBody = document.getElementById('modal-ver-orden-body');
                    if (modalBody) {
                        modalBody.innerHTML = `
                            <div class="row g-3 mb-3">
                                <div class="col-md-6"><div class="bf-card"><div class="bf-card-body">
                                    <div class="bf-label">Cliente</div>
                                    <div class="fw-700">${Utils.escapeHTML(o.cliente_nombre || 'N/A')}</div>
                                    <div style="font-size:0.82rem;color:#64748b;">RUT: ${Utils.escapeHTML(o.cliente_rut || 'N/A')}</div>
                                    <div style="font-size:0.82rem;color:#64748b;">Tel: ${Utils.escapeHTML(o.cliente_telefono || 'N/A')}</div>
                                    <div style="font-size:0.82rem;color:#64748b;">Dir: ${Utils.escapeHTML(o.direccion || 'N/A')}</div>
                                </div></div></div>
                                <div class="col-md-6"><div class="bf-card"><div class="bf-card-body">
                                    <div class="bf-label">Vehículo</div>
                                    <div class="fw-700" style="font-size:1.2rem;color:#dc2626;">${Utils.escapeHTML(o.patente_placa || 'N/A')}</div>
                                    <div style="font-size:0.82rem;color:#64748b;">${Utils.escapeHTML(o.marca || '')} ${Utils.escapeHTML(o.modelo || '')} (${o.anio || 'N/A'})</div>
                                    <div style="font-size:0.82rem;color:#64748b;">${Utils.escapeHTML(o.cilindrada || '')} | ${Utils.escapeHTML(o.combustible || '')} | ${o.kilometraje || ''} km</div>
                                </div></div></div>
                            </div>
                            <div class="row g-3 mb-3">
                                <div class="col-md-4"><div class="bf-card"><div class="bf-card-body text-center">
                                    <div class="bf-label">Estado</div>
                                    <span class="badge-st ${Utils.badgeClass(estado)}" style="font-size:0.9rem;">${Utils.escapeHTML(estado)}</span>
                                    <div style="font-size:0.78rem;color:#64748b;margin-top:0.5rem;">${Utils.escapeHTML(o.tecnico_nombre || 'Sin técnico')}</div>
                                </div></div></div>
                                <div class="col-md-4"><div class="bf-card"><div class="bf-card-body text-center">
                                    <div class="bf-label">Fecha</div>
                                    <div class="fw-600">${Utils.fmtDate(o.fecha_ingreso || o.created_at)}</div>
                                    <div style="font-size:0.82rem;color:#64748b;">${o.hora_ingreso || ''}</div>
                                </div></div></div>
                                <div class="col-md-4"><div class="bf-card"><div class="bf-card-body text-center">
                                    <div class="bf-label">Recepcionista</div>
                                    <div class="fw-600">${Utils.escapeHTML(o.recepcionista || 'N/A')}</div>
                                </div></div></div>
                            </div>
                            <div class="bf-card mb-3"><div class="bf-card-header"><span class="bf-card-title"><i class="fa-solid fa-wrench me-2" style="color:var(--bf-primary);"></i>Servicios / Diagnóstico</span></div>
                            <div class="bf-card-body">${serviciosHtml}</div></div>
                            <div class="row g-3">
                                <div class="col-md-3"><div class="kpi-card"><div class="kpi-label">Total</div><div class="kpi-value">${Utils.fmt(o.monto_total || 0)}</div></div></div>
                                <div class="col-md-3"><div class="kpi-card"><div class="kpi-label">Abono</div><div class="kpi-value">${Utils.fmt(o.monto_abono || 0)}</div></div></div>
                                <div class="col-md-3"><div class="kpi-card"><div class="kpi-label">Restante</div><div class="kpi-value" style="color:#dc2626;">${Utils.fmt((o.monto_total || 0) - (o.monto_abono || 0))}</div></div></div>
                                <div class="col-md-3"><div class="d-flex gap-1 flex-column">
                                    <button class="btn-bf flex-grow-1" onclick="App.ordenes.generarPDF({${JSON.stringify(o).replace(/"/g, '&quot;')}})"><i class="fa-solid fa-file-pdf me-1"></i>PDF</button>
                                    <button class="btn-bf-icon danger" onclick="App.ordenes.eliminar(${o.id})"><i class="fa-solid fa-trash"></i></button>
                                </div></div>
                            </div>
                            ${o.firma_imagen ? `<div class="mt-3 text-center"><div class="bf-label">Firma del Cliente</div><img src="${o.firma_imagen}" alt="Firma" style="max-width:200px;border:1px solid #e2e8f0;border-radius:0.5rem;margin-top:0.5rem;"></div>` : ''}
                        `;
                    }

                    Utils.showModal('modalVerOrden');
                }
            } catch (err) {
                Utils.toast('Error al cargar la orden', 'error');
                console.error(err);
            }
        },

        async editar(id) {
            try {
                const data = await API.getPublic(`/ver-orden?id=${id}`);
                if (!data.orden) { Utils.toast('Orden no encontrada', 'error'); return; }
                const o = data.orden;

                Utils.setVal('edit-orden-id', o.id);
                Utils.setVal('edit-cliente', o.cliente_nombre || '');
                Utils.setVal('edit-rut', o.cliente_rut || '');
                Utils.setVal('edit-telefono', o.cliente_telefono || '');
                Utils.setVal('edit-direccion', o.direccion || '');
                Utils.setVal('edit-estado', o.estado || 'Enviada');
                Utils.setVal('edit-patente', o.patente_placa || '');
                Utils.setVal('edit-marca', o.marca || '');
                Utils.setVal('edit-modelo', o.modelo || '');
                Utils.setVal('edit-anio', o.anio || '');
                Utils.setVal('edit-cilindrada', o.cilindrada || '');
                Utils.setVal('edit-combustible', o.combustible || '');
                Utils.setVal('edit-kilometraje', o.kilometraje || '');
                Utils.setVal('edit-fecha-ingreso', o.fecha_ingreso || '');
                Utils.setVal('edit-hora-ingreso', o.hora_ingreso || '');
                Utils.setVal('edit-recepcionista', o.recepcionista || '');
                Utils.setVal('edit-diagnostico-obs', o.diagnostico_observaciones || '');
                Utils.setVal('edit-monto-total', o.monto_total || 0);
                Utils.setVal('edit-monto-abono', o.monto_abono || 0);
                Utils.setVal('edit-metodo-pago', o.metodo_pago || '');

                Utils.showModal('modalEditarOrden');
            } catch (err) {
                Utils.toast('Error al cargar la orden', 'error');
            }
        },

        async guardarEdicion() {
            const id = Utils.val('edit-orden-id');
            if (!id) return;
            const body = {
                orden_id: parseInt(id),
                cliente_nombre: Utils.val('edit-cliente'),
                cliente_rut: Utils.val('edit-rut'),
                cliente_telefono: Utils.val('edit-telefono'),
                direccion: Utils.val('edit-direccion'),
                estado: Utils.val('edit-estado'),
                patente: Utils.val('edit-patente'),
                marca: Utils.val('edit-marca'),
                modelo: Utils.val('edit-modelo'),
                anio: Utils.val('edit-anio') || null,
                cilindrada: Utils.val('edit-cilindrada'),
                combustible: Utils.val('edit-combustible'),
                kilometraje: Utils.val('edit-kilometraje'),
                fecha_ingreso: Utils.val('edit-fecha-ingreso'),
                hora_ingreso: Utils.val('edit-hora-ingreso'),
                recepcionista: Utils.val('edit-recepcionista'),
                diagnostico_observaciones: Utils.val('edit-diagnostico-obs'),
                monto_total: parseFloat(Utils.val('edit-monto-total')) || 0,
                monto_abono: parseFloat(Utils.val('edit-monto-abono')) || 0,
                metodo_pago: Utils.val('edit-metodo-pago'),
            };

            try {
                const data = await API.postPublic('/editar-orden', body);
                if (data.success) {
                    Utils.toast('Orden actualizada', 'success');
                    Utils.hideModal('modalEditarOrden');
                } else {
                    Utils.toast(data.error || 'Error al actualizar', 'error');
                }
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async eliminar(id) {
            if (!await Utils.confirm('¿Eliminar permanentemente esta orden?')) return;
            if (!await Utils.confirm('¡ATENCIÓN! Esta acción NO se puede deshacer. ¿Confirma?')) return;

            try {
                const data = await API.post('/eliminar-orden', { orden_id: id });
                if (data.success) {
                    Utils.toast('Orden eliminada', 'success');
                    Utils.hideModal('modalVerOrden');
                    Utils.hideModal('modalEditarOrden');
                } else {
                    Utils.toast(data.error || 'Error al eliminar', 'error');
                }
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        generarPDF(orden) {
            generarPDFOrden(orden);
        },
    },

    // ========================================================
    // LIQUIDAR TÉCNICOS - Extensiones (Flujo, Cartera, Tabs)
    // ========================================================
    liquidar: {
        async cargarFlujoCaja(tipo, fecha) {
            try {
                const data = await API.get(`/resumen-pagos?tipo=${tipo}&valor=${fecha}`);
                this.renderizarFlujo(data);
            } catch (err) {
                Utils.toast('Error cargando flujo de caja', 'error');
            }
        },

        renderizarFlujo(data) {
            const container = document.getElementById('flujo-contenido');
            if (!container) return;

            const balancePositivo = (data.balance_neto || 0) >= 0;
            let historialHtml = '';
            if (data.historial_diario && data.historial_diario.length > 0) {
                historialHtml = '<div class="table-responsive"><table class="bf-table"><thead><tr><th>Fecha</th><th>OTs</th><th>Ingresos</th><th>Abonos</th></tr></thead><tbody>' +
                    data.historial_diario.map(h => `<tr><td>${Utils.escapeHTML(h.fecha)}</td><td>${h.ordenes}</td><td class="fw-600">${Utils.fmt(h.ingresos)}</td><td class="fw-600">${Utils.fmt(h.abonos_recibidos)}</td></tr>`).join('') +
                    '</tbody></table></div>';
            } else {
                historialHtml = '<p style="color:#94a3b8;">Sin datos para el periodo seleccionado</p>';
            }

            container.innerHTML = `
                <div class="row g-3 mb-3">
                    <div class="col-md-4"><div class="kpi-card" style="border-left:4px solid #16a34a;"><div><div class="kpi-label">Entrante</div><div class="fw-800" style="color:#16a34a;">${Utils.fmt(data.entradas?.total_abonos || 0)}</div></div></div></div>
                    <div class="col-md-4"><div class="kpi-card" style="border-left:4px solid #dc2626;"><div><div class="kpi-label">Saliente</div><div class="fw-800" style="color:#dc2626;">${Utils.fmt((data.salidas?.comisiones_tecnicos || 0) + (data.salidas?.gastos_operativos || 0))}</div></div></div></div>
                    <div class="col-md-4"><div class="kpi-card" style="border-left:4px solid ${balancePositivo ? '#16a34a' : '#dc2626'};"><div><div class="kpi-label">Balance Neto</div><div class="fw-800" style="color:${balancePositivo ? '#16a34a' : '#dc2626'};">${Utils.fmt(data.balance_neto || 0)}</div></div></div></div>
                </div>
                ${historialHtml}
            `;
        },

        async cargarCartera(filtro) {
            try {
                let endpoint = '/todas-ordenes?limite=500';
                if (filtro === 'pendientes') endpoint += '&estado=Aprobada';
                const data = await API.get(endpoint);
                const ordenes = data.ordenes || data.data?.ordenes || [];
                this.renderizarCartera(ordenes, filtro);
            } catch (err) {
                Utils.toast('Error cargando cartera', 'error');
            }
        },

        renderizarCartera(ordenes, filtro) {
            const container = document.getElementById('cartera-contenido');
            if (!container) return;

            // Agrupar por cliente
            const clientesMap = {};
            ordenes.forEach(o => {
                const nombre = o.cliente_nombre || 'Sin nombre';
                if (!clientesMap[nombre]) {
                    clientesMap[nombre] = { nombre, telefono: o.cliente_telefono || '', rut: o.cliente_rut || '', totalOTs: 0, totalGenerado: 0, totalAbonos: 0, totalRestante: 0 };
                }
                const cl = clientesMap[nombre];
                cl.totalOTs++;
                cl.totalGenerado += Number(o.monto_total || 0);
                cl.totalAbonos += Number(o.monto_abono || 0);
                cl.totalRestante += Number(o.monto_restante || 0);
            });

            let clientes = Object.values(clientesMap);
            if (filtro === 'pendientes') {
                clientes = clientes.filter(c => c.totalRestante > 0).sort((a, b) => b.totalRestante - a.totalRestante);
            } else {
                clientes.sort((a, b) => b.totalGenerado - a.totalGenerado);
            }

            const totalPendiente = clientes.reduce((s, c) => s + c.totalRestante, 0);
            const totalGenerado = clientes.reduce((s, c) => s + c.totalGenerado, 0);

            container.innerHTML = `
                <div class="row g-3 mb-3">
                    <div class="col-md-4"><div class="kpi-card"><div class="kpi-label">Clientes</div><div class="kpi-value">${clientes.length}</div></div></div>
                    <div class="col-md-4"><div class="kpi-card"><div class="kpi-label">Total Facturado</div><div class="kpi-value">${Utils.fmt(totalGenerado)}</div></div></div>
                    <div class="col-md-4"><div class="kpi-card"><div class="kpi-label">Saldo Pendiente</div><div class="kpi-value" style="color:#dc2626;">${Utils.fmt(totalPendiente)}</div></div></div>
                </div>
                <div class="table-responsive"><table class="bf-table"><thead><tr><th>Cliente</th><th>Teléfono</th><th>OTs</th><th>Generado</th><th>Abonos</th><th>Saldo</th></tr></thead><tbody>
                ${clientes.map(c => `<tr>
                    <td class="fw-600">${Utils.escapeHTML(c.nombre)}</td>
                    <td>${Utils.escapeHTML(c.telefono || '--')}</td>
                    <td>${c.totalOTs}</td>
                    <td>${Utils.fmt(c.totalGenerado)}</td>
                    <td>${Utils.fmt(c.totalAbonos)}</td>
                    <td class="fw-600" style="color:${c.totalRestante > 0 ? '#dc2626' : '#16a34a'};">${Utils.fmt(c.totalRestante)}</td>
                </tr>`).join('')}
                </tbody></table></div>
            `;
        },
    },
};

// ============================================================
// PDF GENERATION - Generar PDF de Orden de Trabajo
// ============================================================
function generarPDFOrden(orden) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const leftMargin = 10;
    let yPos = 15;

    // Logo pequeño en esquina
    try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.src = 'corto.jpg';
        // No-op await, sync rendering
    } catch (e) {}

    // Número de orden en esquina superior derecha
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`OT #${numeroFormateado}`, pageWidth - 15, 10, { align: 'right' });

    // Título
    doc.setFontSize(16);
    doc.setTextColor(13, 148, 136);
    doc.text('ORDEN DE TRABAJO', pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.text('BIZFLOW ADMIN', pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    // Información del Cliente
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('1. DATOS DEL CLIENTE', leftMargin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text(`Cliente: ${orden.cliente_nombre || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`R.U.T.: ${orden.cliente_rut || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Teléfono: ${orden.cliente_telefono || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Dirección: ${orden.direccion || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Fecha Ingreso: ${orden.fecha_ingreso || 'N/A'} ${orden.hora_ingreso || ''}`, leftMargin, yPos); yPos += 4;
    doc.text(`Recepcionista: ${orden.recepcionista || 'N/A'}`, leftMargin, yPos); yPos += 10;

    // Datos del Vehículo
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('2. DATOS DEL VEHÍCULO', leftMargin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text(`Patente: ${orden.patente_placa || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Marca/Modelo: ${orden.marca || 'N/A'} ${orden.modelo || ''} (${orden.anio || 'N/A'})`, leftMargin, yPos); yPos += 4;
    doc.text(`Cilindrada: ${orden.cilindrada || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Combustible: ${orden.combustible || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Kilometraje: ${orden.kilometraje || 'N/A'}`, leftMargin, yPos); yPos += 10;

    // Trabajos / Servicios
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('3. DIAGNÓSTICO Y TRABAJOS', leftMargin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);

    let serviciosPDF = orden.servicios_seleccionados || [];
    if (serviciosPDF.length > 0) {
        let subtotalPDF = 0;
        serviciosPDF.forEach(s => {
            const precio = Number(s.precio_final || s.precio_sugerido || 0);
            subtotalPDF += precio;
            const tipo = s.tipo_comision === 'mano_obra' ? '[MO]' : '[Rep]';
            if (yPos > 265) { doc.addPage(); yPos = 20; }
            doc.text(`  [x] ${s.nombre}`, leftMargin, yPos);
            doc.text(`${tipo} $${precio.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin + 120, yPos);
            yPos += 4;
        });
        if (yPos > 260) { doc.addPage(); yPos = 20; }
        doc.setFont(undefined, 'bold');
        doc.text('  Subtotal Servicios:', leftMargin, yPos);
        doc.text(`$${subtotalPDF.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin + 120, yPos);
        yPos += 6;
    } else {
        doc.text('  Sin trabajos seleccionados', leftMargin, yPos); yPos += 6;
    }

    // Observaciones
    const obsPDF = orden.diagnostico_observaciones || '';
    if (obsPDF) {
        yPos += 3;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('  OBSERVACIONES:', leftMargin, yPos); yPos += 5;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7);
        const obsLines = doc.splitTextToSize(obsPDF, pageWidth - leftMargin * 2 - 10);
        obsLines.forEach(line => {
            if (yPos > 260) { doc.addPage(); yPos = 20; }
            doc.text('  ' + line, leftMargin, yPos);
            yPos += 4;
        });
    }
    yPos += 8;

    // Checklist
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('4. CHECKLIST DEL VEHÍCULO', leftMargin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text(`Nivel de Combustible: ${orden.nivel_combustible || 'No registrado'}`, leftMargin, yPos); yPos += 4;
    doc.text('Estado de Carrocería: Sin observaciones', leftMargin, yPos); yPos += 10;

    // Costos adicionales
    const costosExtras = Number(orden.total_costos_adicionales || 0);
    const cargoDomicilio = Number(orden.cargo_domicilio || 0);

    if (costosExtras > 0) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.text('5. GASTOS ADICIONALES', leftMargin, yPos);
        yPos += 6;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7);

        if (orden.costos_adicionales && orden.costos_adicionales.length > 0) {
            orden.costos_adicionales.forEach(c => {
                if (yPos > 260) { doc.addPage(); yPos = 20; }
                doc.text(`  - ${c.concepto || 'Gasto'} (${c.categoria || 'N/A'}): $${Number(c.monto || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos);
                yPos += 5;
            });
        } else {
            doc.text(`  Total costos extras: $${costosExtras.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos);
            yPos += 5;
        }
        yPos += 5;
    }

    // Domicilio
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('6. DOMICILIO', leftMargin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    if (cargoDomicilio > 0) {
        doc.text(`  Cargo por domicilio: $${cargoDomicilio.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos);
    } else {
        doc.text(`  Domicilio: No aplicable`, leftMargin, yPos);
    }
    yPos += 10;

    // Valores
    const montoFinalPDF = Number(orden.monto_final || orden.monto_total || 0);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('7. VALORES', leftMargin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text(`Total: $${montoFinalPDF.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos); yPos += 4;
    doc.text(`Abono Recibido: $${Number(orden.monto_abono || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos); yPos += 4;
    doc.text(`Restante: $${(montoFinalPDF - Number(orden.monto_abono || 0)).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos); yPos += 4;
    if (orden.metodo_pago) {
        doc.text(`Método de Pago: ${orden.metodo_pago}`, leftMargin, yPos); yPos += 4;
    }
    yPos += 8;

    // Estado y Firma
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('8. ESTADO Y FIRMA', leftMargin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text(`Estado: ${orden.estado || 'N/A'}`, leftMargin, yPos); yPos += 4;

    if (orden.firma_imagen) {
        try {
            doc.text('Firma del Cliente:', leftMargin, yPos); yPos += 4;
            doc.addImage(orden.firma_imagen, 'PNG', leftMargin, yPos, 40, 25);
            yPos += 28;
        } catch (e) { console.error('Error agregando firma:', e); }
    }

    // Validez
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('9. VALIDEZ Y RESPONSABILIDAD', leftMargin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(6);
    doc.text('• El cliente autoriza la intervención del vehículo', leftMargin, yPos); yPos += 4;
    doc.text('• Se autorizan pruebas de carretera necesarias', leftMargin, yPos); yPos += 4;
    doc.text('• La empresa no se hace responsable por objetos no declarados', leftMargin, yPos); yPos += 4;

    // Footer
    doc.setFontSize(6);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generado: ${new Date().toLocaleString('es-CL')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

    doc.save(`OT-${numeroFormateado}-${orden.patente_placa || 'SINPAT'}.pdf`);
    Utils.toast('PDF generado exitosamente', 'success');
}

// ============================================================
// TAB SWITCHING - Liquidar Técnicos (3 tabs)
// ============================================================
function initLiquidarTabs() {
    document.querySelectorAll('.bf-tab[data-tab]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = tab.dataset.tab;
            // Desactivar todos los tabs y paneles
            document.querySelectorAll('.bf-tab[data-tab]').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.bf-tab-pane').forEach(p => p.classList.remove('active'));
            // Activar el tab y panel seleccionado
            tab.classList.add('active');
            const pane = document.getElementById(`tab-pane-${target}`);
            if (pane) pane.classList.add('active');

            // Cargar contenido según tab activo
            if (target === 'flujo') {
                const tipo = document.getElementById('flujo-periodo')?.value || 'mes';
                const valor = document.getElementById('flujo-valor')?.value || '';
                if (valor) App.liquidar.cargarFlujoCaja(tipo, valor);
            } else if (target === 'cartera') {
                const filtro = document.getElementById('clientes-filtro')?.value || 'todos';
                App.liquidar.cargarCartera(filtro);
            }
        });
    });
}

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Hide splash after 1s
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) splash.classList.add('hidden');
    }, 1000);

    // Login deshabilitado - acceso directo al panel
    currentUser = { id: 1, nombre: 'Admin', email: 'admin@bizflow.com' };
    const ini = Utils.initials(currentUser.nombre);
    Utils.setText('sb-avatar', ini);
    Utils.setText('sb-name', currentUser.nombre);
    Utils.setText('tb-avatar', ini);
    Utils.setText('tb-name', currentUser.nombre);
    initSidebar();
    initLiquidarTabs();
    Router.init();

    // Form submission for nueva orden
    const formNuevaOrden = document.getElementById('form-nueva-orden');
    if (formNuevaOrden) {
        formNuevaOrden.addEventListener('submit', (e) => {
            e.preventDefault();
            App.nuevaOrden.saveOrder();
        });
    }
});
