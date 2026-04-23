/**
 * ============================================================
 * BizFlow Admin Panel - SPA Application
 * Complete JavaScript with hash-based routing, CRUD, charts,
 * PDF generation, and all module logic.
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

    get(endpoint) { return this.request(endpoint); },
    post(endpoint, body) { return this.request(endpoint, { method: 'POST', body }); },
    put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body }); },
    delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); },
};

// ============================================================
// STATE
// ============================================================
let currentUser = null;
let charts = {};

// ============================================================
// UTILITIES
// ============================================================
const Utils = {
    fmt: (n) => {
        const num = parseFloat(n) || 0;
        return '$' + num.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
    val: (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; },
    setVal: (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; },
    setHTML: (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; },
    setText: (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; },
    toast: (msg, type = 'success') => {
        const iconMap = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
        const colorMap = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#2563eb' };
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
        const map = { 'enviada':'badge-enviada','aprobada':'badge-aprobada','pendiente-visita':'badge-pendiente-visita','en-sitio':'badge-en-sitio','en-progreso':'badge-en-progreso','completada':'badge-completada','cerrada':'badge-cerrada','cancelada':'badge-cancelada' };
        return map[s] || 'badge-enviada';
    },
    translateEstado: (e) => {
        if (!e) return '--';
        return e.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },
    translateMetodo: (m) => {
        const map = { efectivo:'Efectivo', transferencia:'Transferencia', tarjeta:'Tarjeta', deposito:'Depósito', mercado_pago:'MercadoPago' };
        return map[m] || m || '--';
    },
    translateCategoria: (c) => {
        const map = { alquiler:'Alquiler', servicios:'Servicios', transporte:'Transporte', insumos:'Insumos', salarios:'Salarios', marketing:'Marketing', otros:'Otros', otro:'Otros' };
        return map[c] || c || '--';
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
        'clientes': 'page-clientes',
        'vehiculos': 'page-vehiculos',
        'ordenes': 'page-ordenes',
        'tecnicos': 'page-tecnicos',
        'servicios': 'page-servicios',
        'inventario': 'page-inventario',
        'facturacion': 'page-facturacion',
        'contabilidad': 'page-contabilidad',
        'gastos': 'page-gastos',
        'whatsapp': 'page-whatsapp',
        'landing-pages': 'page-landing-pages',
        'configuracion': 'page-configuracion',
        'reportes': 'page-reportes',
    },
    titles: {
        'dashboard': 'Dashboard',
        'clientes': 'Clientes (CRM)',
        'vehiculos': 'Vehículos',
        'ordenes': 'Órdenes de Trabajo',
        'tecnicos': 'Técnicos',
        'servicios': 'Catálogo de Servicios',
        'inventario': 'Inventario',
        'facturacion': 'Facturación y Pagos',
        'contabilidad': 'Contabilidad (Partida Doble)',
        'gastos': 'Gastos del Negocio',
        'whatsapp': 'WhatsApp',
        'landing-pages': 'Landing Pages',
        'configuracion': 'Configuración',
        'reportes': 'Reportes',
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

        // Hide all pages
        document.querySelectorAll('.bf-page').forEach(p => p.classList.remove('active'));
        // Show active page
        const page = document.getElementById(pageId);
        if (page) page.classList.add('active');

        // Update sidebar
        document.querySelectorAll('.bf-sidebar-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll(`.bf-sidebar-item[data-route="${route}"]`).forEach(i => i.classList.add('active'));

        // Update title
        Utils.setText('topbar-title', this.titles[route] || 'BizFlow');

        // Load data for route
        this.onEnter(route);
    },

    onEnter(route) {
        switch (route) {
            case 'dashboard': App.dashboard.load(); break;
            case 'clientes': App.clientes.load(); break;
            case 'vehiculos': App.vehiculos.load(); break;
            case 'ordenes': App.ordenes.load(); break;
            case 'tecnicos': App.tecnicos.load(); break;
            case 'servicios': App.servicios.load(); break;
            case 'inventario': App.inventario.load(); break;
            case 'facturacion': App.facturacion.load(); break;
            case 'contabilidad': App.contabilidad.load(); break;
            case 'gastos': App.gastos.load(); break;
            case 'whatsapp': App.whatsapp.load(); break;
            case 'landing-pages': App.landing.load(); break;
            case 'configuracion': App.config.load(); break;
            case 'reportes': App.reportes.load(); break;
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
        if (!email || !password) { Utils.toast('Ingrese correo y contraseña', 'warning'); return; }
        try {
            const btn = document.querySelector('#login-form button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Ingresando...';
            const data = await API.post('/login', { email, password });
            if (data.success && data.data) {
                currentUser = data.data.usuario || data.data;
                localStorage.setItem('bizflow_user', JSON.stringify(currentUser));
                Utils.toast('¡Bienvenido, ' + (currentUser.nombre || email) + '!', 'success');
                this.showApp();
            } else {
                Utils.toast(data.error || 'Credenciales inválidas', 'error');
            }
        } catch (err) {
            Utils.toast(err.message, 'error');
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
    // DASHBOARD
    // ========================================================
    dashboard: {
        async load() {
            try {
                const data = await API.get('/dashboard');
                const d = data.data || data;
                const kpis = d.kpis || d;
                Utils.setText('dash-total-ots', kpis.total_ordenes || kpis.total || 0);
                Utils.setText('dash-en-proceso', kpis.en_proceso || kpis.enProceso || 0);
                Utils.setText('dash-completadas', kpis.completadas || kpis.cerradas || 0);
                Utils.setText('dash-ingresos', Utils.fmt(kpis.ingresos || kpis.total_generado || 0));

                // OTs por estado chart
                const estados = d.ordenes_por_estado || d.estadoCounts || {};
                const stateLabels = Object.keys(estados);
                const stateData = Object.values(estados);
                const stateColors = stateLabels.map(l => {
                    const s = l.toLowerCase();
                    if (s.includes('complet') || s.includes('cerrad')) return '#16a34a';
                    if (s.includes('progreso') || s.includes('sitio')) return '#2563eb';
                    if (s.includes('cancel')) return '#dc2626';
                    if (s.includes('aprob')) return '#d97706';
                    return '#64748b';
                });
                createBarChart('chart-ots-estado', stateLabels, stateData, stateColors);

                // Ingresos mensual chart
                const ingresos = d.ingresos_mensual || d.monthlyRevenue || [];
                if (ingresos.length > 0) {
                    createLineChart('chart-ingresos', ingresos.map(i => i.mes || i.label || ''), ingresos.map(i => i.total || i.value || 0), 'Ingresos', '#0d9488');
                } else {
                    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                    createLineChart('chart-ingresos', months, new Array(12).fill(0), 'Ingresos', '#0d9488');
                }

                // Recent OTs table
                const recientes = d.ordenes_recientes || d.recentOrders || d.ordenes || [];
                this.renderRecentOTs(recientes);
            } catch (err) {
                console.error('Dashboard error:', err);
                // Show demo data
                Utils.setText('dash-total-ots', '0');
                createBarChart('chart-ots-estado', [], []);
                createLineChart('chart-ingresos', [], []);
            }
        },

        renderRecentOTs(ots) {
            const tbody = document.getElementById('dash-recent-ots');
            if (!tbody) return;
            if (!ots || ots.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-inbox"></i>Sin órdenes recientes</td></tr>';
                return;
            }
            tbody.innerHTML = ots.slice(0, 10).map(o => {
                const num = o.numero_orden || o.id || '--';
                const estado = o.estado || 'enviada';
                return `<tr>
                    <td class="fw-600">#${Utils.escapeHTML(String(num))}</td>
                    <td>${Utils.escapeHTML(o.cliente_nombre || o.cliente || '--')}</td>
                    <td>${Utils.escapeHTML(o.patente || o.vehiculo || '--')}</td>
                    <td><span class="badge-st ${Utils.badgeClass(estado)}">${Utils.translateEstado(estado)}</span></td>
                    <td>${Utils.escapeHTML(o.tecnico_nombre || o.tecnico || '--')}</td>
                    <td style="font-size:0.78rem;color:#64748b;">${Utils.fmtDateTime(o.fecha_creacion || o.created_at || o.fecha)}</td>
                </tr>`;
            }).join('');
        },
    },

    // ========================================================
    // CLIENTES (CRM)
    // ========================================================
    clientes: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/clientes');
                this._data = data.data || data.clientes || data || [];
                this.render(this._data);
            } catch (err) {
                console.error('Clientes load error:', err);
                this._data = [];
                this.render([]);
            }
        },

        render(data) {
            const tbody = document.getElementById('tbl-clientes');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="bf-empty"><i class="fa-solid fa-users"></i>Sin clientes</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(c => `<tr>
                <td class="fw-600">${Utils.escapeHTML((c.nombre || '') + ' ' + (c.apellido || ''))}</td>
                <td>${Utils.escapeHTML(c.cedula || c.rif || c.cedula_rif || '--')}</td>
                <td>${Utils.escapeHTML(c.email || '--')}</td>
                <td>${Utils.escapeHTML(c.telefono || '--')}</td>
                <td>${Utils.escapeHTML(c.ciudad || '--')}</td>
                <td>${Utils.escapeHTML(c.origen || '--')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-bf-icon" title="Editar" onclick="App.clientes.openEdit(${c.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-bf-icon danger" title="Eliminar" onclick="App.clientes.remove(${c.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            const filtered = this._data.filter(c => {
                return `${c.nombre} ${c.apellido} ${c.cedula} ${c.email} ${c.telefono} ${c.ciudad}`.toLowerCase().includes(t);
            });
            this.render(filtered);
        },

        openCreate() {
            Utils.setText('modal-cliente-title', 'Nuevo Cliente');
            ['cl-id','cl-nombre','cl-apellido','cl-cedula','cl-email','cl-telefono','cl-ciudad','cl-estado','cl-direccion','cl-notas'].forEach(id => Utils.setVal(id, ''));
            Utils.setVal('cl-origen', 'web');
            Utils.showModal('modal-cliente');
        },

        openEdit(id) {
            const c = this._data.find(x => x.id === id);
            if (!c) return;
            Utils.setText('modal-cliente-title', 'Editar Cliente');
            Utils.setVal('cl-id', c.id);
            Utils.setVal('cl-nombre', c.nombre);
            Utils.setVal('cl-apellido', c.apellido);
            Utils.setVal('cl-cedula', c.cedula || c.cedula_rif);
            Utils.setVal('cl-email', c.email);
            Utils.setVal('cl-telefono', c.telefono);
            Utils.setVal('cl-ciudad', c.ciudad);
            Utils.setVal('cl-estado', c.estado);
            Utils.setVal('cl-direccion', c.direccion);
            Utils.setVal('cl-notas', c.notas);
            Utils.setVal('cl-origen', c.origen || 'web');
            Utils.showModal('modal-cliente');
        },

        async save() {
            const id = Utils.val('cl-id');
            const body = {
                nombre: Utils.val('cl-nombre'),
                apellido: Utils.val('cl-apellido'),
                cedula_rif: Utils.val('cl-cedula'),
                email: Utils.val('cl-email'),
                telefono: Utils.val('cl-telefono'),
                ciudad: Utils.val('cl-ciudad'),
                estado: Utils.val('cl-estado'),
                direccion: Utils.val('cl-direccion'),
                notas: Utils.val('cl-notas'),
                origen: Utils.val('cl-origen'),
            };
            if (!body.nombre) { Utils.toast('El nombre es requerido', 'warning'); return; }

            try {
                if (id) {
                    await API.put(`/clientes/${id}`, body);
                    Utils.toast('Cliente actualizado', 'success');
                } else {
                    await API.post('/clientes', body);
                    Utils.toast('Cliente creado', 'success');
                }
                Utils.hideModal('modal-cliente');
                this.load();
            } catch (err) {
                Utils.toast(err.message, 'error');
            }
        },

        async remove(id) {
            const ok = await Utils.confirm('¿Eliminar este cliente?');
            if (!ok) return;
            try {
                await API.delete(`/clientes/${id}`);
                Utils.toast('Cliente eliminado', 'success');
                this.load();
            } catch (err) {
                Utils.toast(err.message, 'error');
            }
        },
    },

    // ========================================================
    // VEHÍCULOS
    // ========================================================
    vehiculos: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/vehiculos');
                this._data = data.data || data.vehiculos || data || [];
                this.render(this._data);
            } catch (err) {
                this._data = [];
                this.render([]);
            }
        },

        async loadClientesSelect() {
            try {
                const data = await API.get('/clientes');
                const clientes = data.data || data.clientes || data || [];
                const sel = document.getElementById('vh-cliente');
                if (sel) {
                    sel.innerHTML = '<option value="">Seleccionar...</option>' + clientes.map(c => `<option value="${c.id}">${Utils.escapeHTML(c.nombre || '')} ${Utils.escapeHTML(c.apellido || '')} - ${Utils.escapeHTML(c.cedula || c.cedula_rif || '')}</option>`).join('');
                }
            } catch (err) { console.error('Error loading clientes select:', err); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-vehiculos');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="bf-empty"><i class="fa-solid fa-car"></i>Sin vehículos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(v => `<tr>
                <td class="fw-600">${Utils.escapeHTML(v.placa || '--')}</td>
                <td>${Utils.escapeHTML(v.marca || '--')}</td>
                <td>${Utils.escapeHTML(v.modelo || '--')}</td>
                <td>${Utils.escapeHTML(v.anio || '--')}</td>
                <td>${Utils.escapeHTML(v.color || '--')}</td>
                <td>${Utils.escapeHTML(v.vin || '--')}</td>
                <td>${Utils.escapeHTML(v.cliente_nombre || v.cliente || '--')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-bf-icon" onclick="App.vehiculos.openEdit(${v.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-bf-icon danger" onclick="App.vehiculos.remove(${v.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(v => `${v.placa} ${v.marca} ${v.modelo} ${v.vin} ${v.cliente_nombre}`.toLowerCase().includes(t)));
        },

        async openCreate() {
            Utils.setText('modal-vehiculo-title', 'Nuevo Vehículo');
            ['vh-id','vh-placa','vh-marca','vh-modelo','vh-anio','vh-color','vh-vin','vh-km'].forEach(id => Utils.setVal(id, ''));
            await this.loadClientesSelect();
            Utils.showModal('modal-vehiculo');
        },

        async openEdit(id) {
            const v = this._data.find(x => x.id === id);
            if (!v) return;
            Utils.setText('modal-vehiculo-title', 'Editar Vehículo');
            Utils.setVal('vh-id', v.id);
            Utils.setVal('vh-placa', v.placa);
            Utils.setVal('vh-marca', v.marca);
            Utils.setVal('vh-modelo', v.modelo);
            Utils.setVal('vh-anio', v.anio);
            Utils.setVal('vh-color', v.color);
            Utils.setVal('vh-vin', v.vin);
            Utils.setVal('vh-km', v.kilometraje || v.km);
            await this.loadClientesSelect();
            setTimeout(() => Utils.setVal('vh-cliente', v.cliente_id || v.cliente || ''), 100);
            Utils.showModal('modal-vehiculo');
        },

        async save() {
            const id = Utils.val('vh-id');
            const body = {
                placa: Utils.val('vh-placa'),
                cliente_id: Utils.val('vh-cliente'),
                marca: Utils.val('vh-marca'),
                modelo: Utils.val('vh-modelo'),
                anio: Utils.val('vh-anio'),
                color: Utils.val('vh-color'),
                vin: Utils.val('vh-vin'),
                kilometraje: Utils.val('vh-km'),
            };
            if (!body.placa || !body.cliente_id) { Utils.toast('Placa y Cliente son requeridos', 'warning'); return; }
            try {
                if (id) { await API.put(`/vehiculos/${id}`, body); Utils.toast('Vehículo actualizado', 'success'); }
                else { await API.post('/vehiculos', body); Utils.toast('Vehículo creado', 'success'); }
                Utils.hideModal('modal-vehiculo');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar este vehículo?')) return;
            try { await API.delete(`/vehiculos/${id}`); Utils.toast('Vehículo eliminado', 'success'); this.load(); } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // ÓRDENES DE TRABAJO
    // ========================================================
    ordenes: {
        _data: [],
        _currentId: null,
        _currentPage: 1,

        async load() {
            document.getElementById('ordenes-list-view').style.display = '';
            document.getElementById('orden-detail-view').style.display = 'none';
            try {
                const params = new URLSearchParams();
                const estado = Utils.val('filter-ot-estado');
                const fecha = Utils.val('filter-ot-fecha');
                const prioridad = Utils.val('filter-ot-prioridad');
                if (estado) params.set('estado', estado);
                if (fecha) params.set('fecha', fecha);
                if (prioridad) params.set('prioridad', prioridad);
                const qs = params.toString();
                const data = await API.get('/todas-ordenes' + (qs ? '?' + qs : ''));
                this._data = data.data?.ordenes || data.ordenes || data.data || data || [];
                this.render(this._data);
                // Load tecnico filter
                this.loadTecnicosFilter();
            } catch (err) {
                this._data = [];
                this.render([]);
            }
        },

        async loadTecnicosFilter() {
            try {
                const data = await API.get('/tecnicos');
                const tecnicos = data.data || data.tecnicos || data || [];
                const sel = document.getElementById('filter-ot-tecnico');
                if (sel) {
                    sel.innerHTML = '<option value="">Todos los técnicos</option>' + tecnicos.map(t => `<option value="${t.id}">${Utils.escapeHTML(t.nombre)}</option>`).join('');
                }
            } catch (err) { console.error(err); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-ordenes');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="bf-empty"><i class="fa-solid fa-clipboard-list"></i>Sin órdenes de trabajo</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(o => {
                const estado = o.estado || 'enviada';
                return `<tr>
                    <td class="fw-600">#${o.numero_orden || o.id || '--'}</td>
                    <td>${Utils.escapeHTML(o.cliente_nombre || o.cliente || '--')}</td>
                    <td>${Utils.escapeHTML(o.patente || o.vehiculo || '--')}</td>
                    <td>${Utils.escapeHTML(o.tipo || '--')}</td>
                    <td>${Utils.escapeHTML(o.prioridad || '--')}</td>
                    <td><span class="badge-st ${Utils.badgeClass(estado)}">${Utils.translateEstado(estado)}</span></td>
                    <td>${Utils.escapeHTML(o.tecnico_nombre || o.tecnico || 'Sin asignar')}</td>
                    <td class="fw-600">${Utils.fmt(o.monto_total || o.monto || o.total || 0)}</td>
                    <td style="font-size:0.78rem;color:#64748b;">${Utils.fmtDateTime(o.fecha_creacion || o.created_at || o.fecha)}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn-bf-icon" title="Ver" onclick="App.ordenes.view(${o.id})"><i class="fa-solid fa-eye"></i></button>
                            <button class="btn-bf-icon" title="Editar" onclick="App.ordenes.openEdit(${o.id})"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-bf-icon" title="PDF" onclick="App.ordenes.generatePDF(${o.id})"><i class="fa-solid fa-file-pdf"></i></button>
                            <button class="btn-bf-icon danger" title="Eliminar" onclick="App.ordenes.remove(${o.id})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(o => `${o.numero_orden} ${o.cliente_nombre} ${o.patente} ${o.tecnico_nombre} ${o.estado}`.toLowerCase().includes(t)));
        },

        async openCreate() {
            Utils.setText('modal-orden-title', 'Nueva Orden de Trabajo');
            ['ot-id','ot-titulo','ot-descripcion'].forEach(id => Utils.setVal(id, ''));
            Utils.setVal('ot-tipo', 'correctivo');
            Utils.setVal('ot-prioridad', 'media');
            Utils.setVal('ot-tecnico', '');
            try {
                const [clientes, vehiculos, tecnicos] = await Promise.all([
                    API.get('/clientes'), API.get('/vehiculos'), API.get('/tecnicos')
                ]);
                const cl = clientes.data || clientes.clientes || clientes || [];
                const vh = vehiculos.data || vehiculos.vehiculos || vehiculos || [];
                const tc = tecnicos.data || tecnicos.tecnicos || tecnicos || [];
                const selC = document.getElementById('ot-cliente');
                const selV = document.getElementById('ot-vehiculo');
                const selT = document.getElementById('ot-tecnico');
                if (selC) selC.innerHTML = '<option value="">Seleccionar...</option>' + cl.map(c => `<option value="${c.id}">${Utils.escapeHTML((c.nombre||'') + ' ' + (c.apellido||''))}</option>`).join('');
                if (selV) selV.innerHTML = '<option value="">Seleccionar...</option>' + vh.map(v => `<option value="${v.id}">${Utils.escapeHTML(v.placa)} - ${Utils.escapeHTML(v.marca)} ${Utils.escapeHTML(v.modelo)}</option>`).join('');
                if (selT) selT.innerHTML = '<option value="">Sin asignar</option>' + tc.map(t => `<option value="${t.id}">${Utils.escapeHTML(t.nombre)}</option>`).join('');
            } catch (err) { console.error(err); }
            Utils.showModal('modal-orden');
        },

        async openEdit(id) {
            const o = this._data.find(x => x.id === id);
            if (!o) { await this.openCreate(); return; }
            Utils.setText('modal-orden-title', `Editar OT #${o.numero_orden || o.id}`);
            Utils.setVal('ot-id', o.id);
            Utils.setVal('ot-titulo', o.titulo);
            Utils.setVal('ot-descripcion', o.descripcion);
            await this.openCreate();
            setTimeout(() => {
                Utils.setVal('ot-cliente', o.cliente_id || o.cliente);
                Utils.setVal('ot-vehiculo', o.vehiculo_id || o.vehiculo);
                Utils.setVal('ot-tipo', o.tipo || 'correctivo');
                Utils.setVal('ot-prioridad', o.prioridad || 'media');
                Utils.setVal('ot-tecnico', o.tecnico_id || o.tecnico || '');
            }, 200);
        },

        async save() {
            const id = Utils.val('ot-id');
            const body = {
                cliente_id: Utils.val('ot-cliente'),
                vehiculo_id: Utils.val('ot-vehiculo'),
                tipo: Utils.val('ot-tipo'),
                prioridad: Utils.val('ot-prioridad'),
                tecnico_id: Utils.val('ot-tecnico'),
                titulo: Utils.val('ot-titulo'),
                descripcion: Utils.val('ot-descripcion'),
            };
            if (!body.cliente_id || !body.vehiculo_id || !body.titulo) { Utils.toast('Cliente, Vehículo y Título son requeridos', 'warning'); return; }
            try {
                if (id) { await API.put(`/ordenes/${id}`, body); Utils.toast('OT actualizada', 'success'); }
                else { await API.post('/ordenes', body); Utils.toast('OT creada', 'success'); }
                Utils.hideModal('modal-orden');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar esta orden de trabajo?')) return;
            try { await API.delete(`/ordenes/${id}`); Utils.toast('OT eliminada', 'success'); this.load(); } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async view(id) {
            this._currentId = id;
            document.getElementById('ordenes-list-view').style.display = 'none';
            document.getElementById('orden-detail-view').style.display = '';
            try {
                const data = await API.get(`/ordenes/${id}`);
                const o = data.data || data.orden || data;
                this._currentOrden = o;
                Utils.setText('orden-detail-title', `OT #${o.numero_orden || o.id || id}`);

                // Info
                Utils.setHTML('orden-detail-info', `
                    <div class="row g-2">
                        <div class="col-md-6"><small class="text-muted">Cliente</small><div class="fw-600">${Utils.escapeHTML(o.cliente_nombre || '--')}</div></div>
                        <div class="col-md-6"><small class="text-muted">Vehículo</small><div class="fw-600">${Utils.escapeHTML(o.patente || o.vehiculo || '--')}</div></div>
                        <div class="col-md-6"><small class="text-muted">Tipo</small><div>${Utils.escapeHTML(o.tipo || '--')}</div></div>
                        <div class="col-md-6"><small class="text-muted">Prioridad</small><div>${Utils.escapeHTML(o.prioridad || '--')}</div></div>
                        <div class="col-md-6"><small class="text-muted">Creada</small><div>${Utils.fmtDateTime(o.fecha_creacion || o.created_at)}</div></div>
                        <div class="col-md-6"><small class="text-muted">Monto Total</small><div class="fw-800" style="color:var(--bf-primary);">${Utils.fmt(o.monto_total || o.monto || 0)}</div></div>
                        <div class="col-12"><small class="text-muted">Descripción</small><div>${Utils.escapeHTML(o.descripcion || 'Sin descripción')}</div></div>
                    </div>
                `);

                // Status
                Utils.setHTML('orden-detail-status', `
                    <div class="mb-3">
                        <small class="text-muted">Estado Actual</small>
                        <div class="mt-1"><span class="badge-st ${Utils.badgeClass(o.estado)}" style="font-size:0.9rem;padding:0.4rem 0.8rem;">${Utils.translateEstado(o.estado)}</span></div>
                    </div>
                    <div class="mb-3">
                        <small class="text-muted">Técnico Asignado</small>
                        <div class="fw-600">${Utils.escapeHTML(o.tecnico_nombre || 'Sin asignar')}</div>
                    </div>
                    <div class="d-flex gap-2 mt-3">
                        <button class="btn-bf btn-bf-sm" onclick="App.ordenes.openAssign(${id})"><i class="fa-solid fa-user-check"></i>Asignar Técnico</button>
                        <button class="btn-bf-outline btn-bf-sm" onclick="App.ordenes.openChangeStatus(${id}, '${o.estado || ''}')"><i class="fa-solid fa-arrows-rotate"></i>Cambiar Estado</button>
                    </div>
                `);

                // Notes
                const notas = o.notas || [];
                Utils.setHTML('orden-detail-notas', notas.length > 0 ? notas.map(n => `
                    <div class="mb-2 p-2" style="background:#f8fafc;border-radius:0.4rem;border:1px solid #f1f5f9;">
                        <div style="font-size:0.72rem;color:#94a3b8;">${Utils.fmtDateTime(n.fecha || n.created_at)}</div>
                        <div style="font-size:0.84rem;">${Utils.escapeHTML(n.texto || n.nota)}</div>
                    </div>
                `).join('') : '<p class="text-muted small mb-0">Sin notas</p>');

                // Costs
                const costos = o.costos_adicionales || o.costos || [];
                Utils.setHTML('orden-detail-costos', costos.length > 0 ? `
                    <table class="bf-table"><thead><tr><th>Concepto</th><th>Monto</th></tr></thead>
                    <tbody>${costos.map(c => `<tr><td>${Utils.escapeHTML(c.concepto)}</td><td class="fw-600">${Utils.fmt(c.monto)}</td></tr>`).join('')}</tbody></table>
                ` : '<p class="text-muted small mb-0">Sin costos adicionales</p>');

                // Photos
                const fotos = o.fotos || [];
                Utils.setHTML('orden-detail-fotos', fotos.length > 0 ? fotos.map(f => `
                    <img src="${f.url || f}" alt="Foto" style="width:100px;height:100px;object-fit:cover;border-radius:0.5rem;cursor:pointer;border:1px solid #e2e8f0;" onclick="App.ordenes.showPhoto('${f.url || f}')">
                `).join('') : '<p class="text-muted small mb-0">Sin fotos</p>');

                // Seguimiento
                const seguimiento = o.seguimiento || o.historial || [];
                Utils.setHTML('orden-detail-seguimiento', seguimiento.length > 0 ? seguimiento.map(s => `
                    <div class="mb-2" style="padding-left:1rem;border-left:3px solid var(--bf-primary);">
                        <div style="font-size:0.72rem;color:#94a3b8;">${Utils.fmtDateTime(s.fecha || s.created_at)}</div>
                        <div style="font-size:0.84rem;"><span class="badge-st ${Utils.badgeClass(s.estado)}" style="font-size:0.65rem;">${Utils.translateEstado(s.estado)}</span> ${Utils.escapeHTML(s.nota || s.descripcion || '')}</div>
                    </div>
                `).join('') : '<p class="text-muted small mb-0">Sin seguimiento</p>');

                // Firma
                if (o.firma) {
                    Utils.setHTML('orden-detail-firma', `<img src="${o.firma}" alt="Firma" style="max-width:300px;max-height:200px;border:1px solid #e2e8f0;border-radius:0.5rem;">`);
                } else {
                    Utils.setHTML('orden-detail-firma', '<p class="text-muted small mb-0">Sin firma registrada</p>');
                }
            } catch (err) {
                Utils.toast('Error cargando detalle: ' + err.message, 'error');
            }
        },

        showList() {
            document.getElementById('ordenes-list-view').style.display = '';
            document.getElementById('orden-detail-view').style.display = 'none';
        },

        showPhoto(url) {
            document.getElementById('photo-preview-img').src = url;
            Utils.showModal('modal-photo-preview');
        },

        async openAssign(otId) {
            Utils.setVal('asignar-ot-id', otId);
            try {
                const data = await API.get('/tecnicos');
                const tecnicos = data.data || data.tecnicos || data || [];
                const sel = document.getElementById('asignar-tecnico');
                sel.innerHTML = '<option value="">Seleccionar...</option>' + tecnicos.map(t => `<option value="${t.id}">${Utils.escapeHTML(t.nombre)}</option>`).join('');
            } catch (err) { console.error(err); }
            Utils.showModal('modal-asignar');
        },

        async assign() {
            const otId = Utils.val('asignar-ot-id');
            const tecnicoId = Utils.val('asignar-tecnico');
            if (!tecnicoId) { Utils.toast('Seleccione un técnico', 'warning'); return; }
            try {
                await API.post(`/ordenes/${otId}/asignar`, { tecnico_id: tecnicoId });
                Utils.toast('Técnico asignado', 'success');
                Utils.hideModal('modal-asignar');
                this.view(parseInt(otId));
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async openChangeStatus(otId, currentEstado) {
            Utils.setVal('estado-ot-id', otId);
            Utils.setVal('cambiar-estado', currentEstado);
            Utils.showModal('modal-cambiar-estado');
        },

        async changeStatus() {
            const otId = Utils.val('estado-ot-id');
            const estado = Utils.val('cambiar-estado');
            try {
                await API.put(`/ordenes/${otId}/estado`, { estado });
                Utils.toast('Estado actualizado', 'success');
                Utils.hideModal('modal-cambiar-estado');
                this.view(parseInt(otId));
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        openAddCost() {
            Utils.setVal('costo-ot-id', this._currentId);
            Utils.setVal('costo-concepto', '');
            Utils.setVal('costo-monto', '');
            Utils.showModal('modal-costo');
        },

        async addCost() {
            const concepto = Utils.val('costo-concepto');
            const monto = parseFloat(Utils.val('costo-monto'));
            if (!concepto || !monto) { Utils.toast('Concepto y monto son requeridos', 'warning'); return; }
            try {
                await API.post(`/ordenes/${this._currentId}/costos`, { concepto, monto });
                Utils.toast('Costo agregado', 'success');
                Utils.hideModal('modal-costo');
                this.view(this._currentId);
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        openAddNote() {
            Utils.setVal('nota-ot-id', this._currentId);
            Utils.setVal('nota-texto', '');
            Utils.showModal('modal-nota');
        },

        async addNote() {
            const texto = Utils.val('nota-texto');
            if (!texto) { Utils.toast('Escriba una nota', 'warning'); return; }
            try {
                await API.post(`/ordenes/${this._currentId}/notas`, { texto });
                Utils.toast('Nota agregada', 'success');
                Utils.hideModal('modal-nota');
                this.view(this._currentId);
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async uploadPhotos(files) {
            if (!files || files.length === 0) return;
            try {
                for (const file of files) {
                    const base64 = await Utils.fileToBase64(file);
                    await API.post(`/ordenes/${this._currentId}/fotos`, { foto: base64, nombre: file.name });
                }
                Utils.toast('Foto(s) subida(s)', 'success');
                this.view(this._currentId);
            } catch (err) { Utils.toast('Error subiendo fotos: ' + err.message, 'error'); }
        },

        async sendApproval() {
            if (!this._currentId) return;
            try {
                await API.post(`/ordenes/${this._currentId}/enviar-aprobacion`, {});
                Utils.toast('Link de aprobación enviado', 'success');
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        generatePDF(id) {
            const otId = id || this._currentId;
            const o = this._currentOrden || this._data.find(x => x.id === otId) || { numero_orden: otId, cliente_nombre: '--', patente: '--', tipo: '--', estado: '--', tecnico_nombre: '--', descripcion: '--', monto_total: 0 };
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                doc.setFontSize(20);
                doc.setTextColor(13, 148, 136);
                doc.text('BizFlow', 14, 20);
                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.text('Orden de Trabajo', 14, 27);
                doc.line(14, 30, 196, 30);
                doc.setFontSize(12);
                doc.setTextColor(30);
                doc.text(`OT #${o.numero_orden || o.id || otId}`, 14, 40);

                doc.setFontSize(10);
                let y = 52;
                const addField = (label, val) => { doc.setTextColor(100); doc.text(label + ':', 14, y); doc.setTextColor(30); doc.text(String(val || '--'), 70, y); y += 8; };
                addField('Cliente', o.cliente_nombre);
                addField('Vehiculo/Placa', o.patente || o.vehiculo);
                addField('Tipo', o.tipo);
                addField('Estado', Utils.translateEstado(o.estado));
                addField('Tecnico', o.tecnico_nombre || 'Sin asignar');
                addField('Monto Total', Utils.fmt(o.monto_total || o.monto || 0));
                addField('Fecha', Utils.fmtDateTime(o.fecha_creacion || o.created_at));

                y += 5;
                doc.setTextColor(100); doc.text('Descripcion:', 14, y); y += 7;
                doc.setTextColor(30);
                const descLines = doc.splitTextToSize(o.descripcion || 'Sin descripcion', 170);
                doc.text(descLines, 14, y);
                y += descLines.length * 6;

                // Costos adicionales
                const costos = o.costos_adicionales || o.costos || [];
                if (costos.length > 0) {
                    y += 8;
                    doc.setTextColor(100); doc.text('Costos Adicionales:', 14, y); y += 7;
                    costos.forEach(c => {
                        doc.setTextColor(30);
                        doc.text(`${c.concepto}: ${Utils.fmt(c.monto)}`, 20, y);
                        y += 6;
                    });
                }

                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text('Generado por BizFlow - ' + new Date().toLocaleString('es-MX'), 14, 285);
                doc.save(`OT_${o.numero_orden || o.id || otId}.pdf`);
                Utils.toast('PDF generado', 'success');
            } catch (err) {
                Utils.toast('Error generando PDF: ' + err.message, 'error');
            }
        },
    },

    // ========================================================
    // TÉCNICOS
    // ========================================================
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
                tbody.innerHTML = '<tr><td colspan="7" class="bf-empty"><i class="fa-solid fa-users-gear"></i>Sin técnicos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(t => `<tr>
                <td class="fw-600">${Utils.escapeHTML(t.nombre || '--')}</td>
                <td>${Utils.escapeHTML(t.especialidad || '--')}</td>
                <td>${Utils.escapeHTML(t.telefono || '--')}</td>
                <td>${Utils.escapeHTML(t.email || '--')}</td>
                <td>${Utils.escapeHTML(t.codigo || '--')}</td>
                <td>
                    ${t.latitud ? `<span style="font-size:0.75rem;color:#64748b;"><i class="fa-solid fa-location-dot" style="color:#16a34a;"></i> ${parseFloat(t.latitud).toFixed(4)}, ${parseFloat(t.longitud).toFixed(4)}</span>` : '<span style="font-size:0.75rem;color:#94a3b8;">Sin ubicación</span>'}
                </td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-bf-icon" onclick="App.tecnicos.openEdit(${t.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-bf-icon danger" onclick="App.tecnicos.remove(${t.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(tc => `${tc.nombre} ${tc.especialidad} ${tc.email} ${tc.telefono}`.toLowerCase().includes(t)));
        },

        openCreate() {
            Utils.setText('modal-tecnico-title', 'Nuevo Técnico');
            ['tc-id','tc-nombre','tc-especialidad','tc-telefono','tc-email','tc-codigo'].forEach(id => Utils.setVal(id, ''));
            Utils.showModal('modal-tecnico');
        },

        openEdit(id) {
            const t = this._data.find(x => x.id === id);
            if (!t) return;
            Utils.setText('modal-tecnico-title', 'Editar Técnico');
            Utils.setVal('tc-id', t.id);
            Utils.setVal('tc-nombre', t.nombre);
            Utils.setVal('tc-especialidad', t.especialidad);
            Utils.setVal('tc-telefono', t.telefono);
            Utils.setVal('tc-email', t.email);
            Utils.setVal('tc-codigo', t.codigo);
            Utils.showModal('modal-tecnico');
        },

        async save() {
            const id = Utils.val('tc-id');
            const body = {
                nombre: Utils.val('tc-nombre'),
                especialidad: Utils.val('tc-especialidad'),
                telefono: Utils.val('tc-telefono'),
                email: Utils.val('tc-email'),
                codigo: Utils.val('tc-codigo'),
            };
            if (!body.nombre) { Utils.toast('El nombre es requerido', 'warning'); return; }
            try {
                if (id) { await API.put(`/tecnicos/${id}`, body); Utils.toast('Técnico actualizado', 'success'); }
                else { await API.post('/tecnicos', body); Utils.toast('Técnico creado', 'success'); }
                Utils.hideModal('modal-tecnico');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar este técnico?')) return;
            try { await API.delete(`/tecnicos/${id}`); Utils.toast('Técnico eliminado', 'success'); this.load(); } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // SERVICIOS (CATÁLOGO)
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
                tbody.innerHTML = '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-wrench"></i>Sin servicios</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(s => `<tr>
                <td class="fw-600">${Utils.escapeHTML(s.nombre || '--')}</td>
                <td>${Utils.escapeHTML(s.descripcion || '--')}</td>
                <td class="fw-600">${Utils.fmt(s.precio || s.precio_sugerido || 0)}</td>
                <td>${s.duracion ? s.duracion + ' min' : '--'}</td>
                <td>${Utils.escapeHTML(s.categoria || '--')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-bf-icon" onclick="App.servicios.openEdit(${s.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-bf-icon danger" onclick="App.servicios.remove(${s.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(s => `${s.nombre} ${s.descripcion} ${s.categoria}`.toLowerCase().includes(t)));
        },

        openCreate() {
            Utils.setText('modal-servicio-title', 'Nuevo Servicio');
            ['sv-id','sv-nombre','sv-descripcion','sv-precio','sv-duracion'].forEach(id => Utils.setVal(id, ''));
            Utils.setVal('sv-categoria', 'mecanica');
            Utils.showModal('modal-servicio');
        },

        openEdit(id) {
            const s = this._data.find(x => x.id === id);
            if (!s) return;
            Utils.setText('modal-servicio-title', 'Editar Servicio');
            Utils.setVal('sv-id', s.id);
            Utils.setVal('sv-nombre', s.nombre);
            Utils.setVal('sv-descripcion', s.descripcion);
            Utils.setVal('sv-precio', s.precio || s.precio_sugerido);
            Utils.setVal('sv-duracion', s.duracion);
            Utils.setVal('sv-categoria', s.categoria || 'mecanica');
            Utils.showModal('modal-servicio');
        },

        async save() {
            const id = Utils.val('sv-id');
            const body = {
                nombre: Utils.val('sv-nombre'),
                descripcion: Utils.val('sv-descripcion'),
                precio: parseFloat(Utils.val('sv-precio')) || 0,
                duracion: parseInt(Utils.val('sv-duracion')) || 0,
                categoria: Utils.val('sv-categoria'),
            };
            if (!body.nombre) { Utils.toast('El nombre es requerido', 'warning'); return; }
            try {
                if (id) { await API.put(`/servicios/${id}`, body); Utils.toast('Servicio actualizado', 'success'); }
                else { await API.post('/servicios', body); Utils.toast('Servicio creado', 'success'); }
                Utils.hideModal('modal-servicio');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar este servicio?')) return;
            try { await API.delete(`/servicios/${id}`); Utils.toast('Servicio eliminado', 'success'); this.load(); } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // INVENTARIO
    // ========================================================
    inventario: {
        _data: [],
        _movimientos: [],

        async load() {
            try {
                const data = await API.get('/inventario');
                this._data = data.data || data.items || data || [];
                this.render(this._data);
                this.loadMovimientos();
            } catch (err) { this._data = []; this.render([]); }
        },

        async loadMovimientos() {
            try {
                const data = await API.get('/inventario/movimientos');
                this._movimientos = data.data || data.movimientos || data || [];
                this.renderMovimientos(this._movimientos);
            } catch (err) { this._movimientos = []; }
        },

        render(data) {
            const tbody = document.getElementById('tbl-inventario');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="bf-empty"><i class="fa-solid fa-boxes-stacked"></i>Sin items</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(i => {
                const lowStock = (i.cantidad || 0) <= (i.cantidad_minima || i.minima || 0);
                return `<tr${lowStock ? ' style="background:#fef2f2;"' : ''}>
                    <td class="fw-600">${Utils.escapeHTML(i.codigo || '--')}</td>
                    <td>${Utils.escapeHTML(i.nombre || '--')}</td>
                    <td>${Utils.escapeHTML(i.categoria || '--')}</td>
                    <td class="fw-600" style="${lowStock ? 'color:#dc2626;' : ''}">${i.cantidad || 0} ${lowStock ? '<i class="fa-solid fa-triangle-exclamation" style="font-size:0.7rem;"></i>' : ''}</td>
                    <td>${i.cantidad_minima || i.minima || 0}</td>
                    <td>${Utils.fmt(i.precio_compra || i.pcompra || 0)}</td>
                    <td>${Utils.fmt(i.precio_venta || i.pventa || 0)}</td>
                    <td>${Utils.escapeHTML(i.proveedor || '--')}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn-bf-icon" onclick="App.inventario.openEdit(${i.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-bf-icon" onclick="App.inventario.openMovement(${i.id})" title="Movimiento"><i class="fa-solid fa-arrow-right-arrow-left"></i></button>
                            <button class="btn-bf-icon danger" onclick="App.inventario.remove(${i.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        },

        renderMovimientos(data) {
            const tbody = document.getElementById('tbl-movimientos');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="bf-empty"><i class="fa-solid fa-clock-rotate-left"></i>Sin movimientos</td></tr>';
                return;
            }
            tbody.innerHTML = data.slice(0, 50).map(m => `<tr>
                <td style="font-size:0.78rem;">${Utils.fmtDateTime(m.fecha || m.created_at)}</td>
                <td>${Utils.escapeHTML(m.producto_nombre || m.nombre || '--')}</td>
                <td><span class="badge-st" style="background:${m.tipo === 'entrada' ? '#dcfce7;color:#16a34a;' : m.tipo === 'salida' ? '#fee2e2;color:#dc2626;' : '#fef3c7;color:#d97706;'}">${Utils.escapeHTML(m.tipo || '--')}</span></td>
                <td>${m.cantidad || 0}</td>
                <td style="font-size:0.8rem;color:#64748b;">${Utils.escapeHTML(m.nota || '--')}</td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(i => `${i.codigo} ${i.nombre} ${i.categoria} ${i.proveedor}`.toLowerCase().includes(t)));
        },

        openCreate() {
            Utils.setText('modal-inventario-title', 'Nuevo Item');
            ['inv-id','inv-codigo','inv-nombre','inv-categoria','inv-cantidad','inv-minima','inv-pcompra','inv-pventa','inv-proveedor'].forEach(id => Utils.setVal(id, ''));
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
            Utils.setVal('inv-minima', i.cantidad_minima || i.minima);
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
                cantidad_minima: parseInt(Utils.val('inv-minima')) || 0,
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
            try { await API.delete(`/inventario/${id}`); Utils.toast('Item eliminado', 'success'); this.load(); } catch (err) { Utils.toast(err.message, 'error'); }
        },

        openMovement(id) {
            Utils.setVal('mov-inv-id', id);
            Utils.setVal('mov-tipo', 'entrada');
            Utils.setVal('mov-cantidad', '');
            Utils.setVal('mov-nota', '');
            Utils.showModal('modal-movimiento');
        },

        async addMovement() {
            const itemId = Utils.val('mov-inv-id');
            const body = {
                tipo: Utils.val('mov-tipo'),
                cantidad: parseInt(Utils.val('mov-cantidad')) || 0,
                nota: Utils.val('mov-nota'),
            };
            if (!body.cantidad) { Utils.toast('La cantidad es requerida', 'warning'); return; }
            try {
                await API.post(`/inventario/${itemId}/movimientos`, body);
                Utils.toast('Movimiento registrado', 'success');
                Utils.hideModal('modal-movimiento');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // FACTURACIÓN Y PAGOS
    // ========================================================
    facturacion: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/facturacion');
                this._data = data.data || data.pagos || data || [];
                this.render(this._data);
            } catch (err) { this._data = []; this.render([]); }
        },

        async loadOrdenesSelect() {
            try {
                const data = await API.get('/todas-ordenes');
                const ordenes = data.data?.ordenes || data.ordenes || data.data || data || [];
                const sel = document.getElementById('pg-orden');
                if (sel) {
                    sel.innerHTML = '<option value="">Seleccionar OT...</option>' + ordenes.map(o => `<option value="${o.id}">#${o.numero_orden || o.id} - ${Utils.escapeHTML(o.cliente_nombre || '--')} (${Utils.fmt(o.monto_total || o.monto || 0)})</option>`).join('');
                }
            } catch (err) { console.error(err); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-facturacion');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="bf-empty"><i class="fa-solid fa-credit-card"></i>Sin pagos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(p => `<tr>
                <td>#${p.id || '--'}</td>
                <td>${Utils.escapeHTML(p.orden_numero || p.orden_id || '--')}</td>
                <td>${Utils.escapeHTML(p.cliente_nombre || p.cliente || '--')}</td>
                <td class="fw-600">${Utils.fmt(p.monto)}</td>
                <td>${Utils.translateMetodo(p.metodo)}</td>
                <td style="font-size:0.78rem;">${Utils.escapeHTML(p.referencia || '--')}</td>
                <td style="font-size:0.78rem;">${Utils.fmtDate(p.fecha || p.created_at)}</td>
                <td>
                    <button class="btn-bf-icon danger" onclick="App.facturacion.remove(${p.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(p => `${p.cliente_nombre} ${p.referencia} ${p.metodo}`.toLowerCase().includes(t)));
        },

        async openCreate() {
            Utils.setText('modal-pago-title', 'Registrar Pago');
            ['pg-id','pg-monto','pg-referencia','pg-notas'].forEach(id => Utils.setVal(id, ''));
            Utils.setVal('pg-metodo', 'efectivo');
            Utils.setVal('pg-fecha', Utils.today());
            await this.loadOrdenesSelect();
            Utils.showModal('modal-pago');
        },

        async save() {
            const body = {
                orden_id: Utils.val('pg-orden'),
                monto: parseFloat(Utils.val('pg-monto')) || 0,
                metodo: Utils.val('pg-metodo'),
                referencia: Utils.val('pg-referencia'),
                fecha: Utils.val('pg-fecha'),
                notas: Utils.val('pg-notas'),
            };
            if (!body.orden_id || !body.monto) { Utils.toast('OT y Monto son requeridos', 'warning'); return; }
            try {
                await API.post('/facturacion', body);
                Utils.toast('Pago registrado', 'success');
                Utils.hideModal('modal-pago');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar este pago?')) return;
            try { await API.delete(`/facturacion/${id}`); Utils.toast('Pago eliminado', 'success'); this.load(); } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // CONTABILIDAD (PARTIDA DOBLE)
    // ========================================================
    contabilidad: {
        _cuentas: [],
        _asientos: [],
        _currentCuentaId: null,

        async load() {
            try {
                const [cuentasData, asientosData] = await Promise.all([API.get('/contabilidad/cuentas'), API.get('/contabilidad/asientos')]);
                this._cuentas = cuentasData.data || cuentasData.cuentas || cuentasData || [];
                this._asientos = asientosData.data || asientosData.asientos || asientosData || [];
                this.renderCuentas(this._cuentas);
                this.renderAsientos(this._asientos);
                this.populateCuentaSelect();
            } catch (err) {
                console.error('Contabilidad load error:', err);
                this._cuentas = [];
                this._asientos = [];
            }
        },

        renderCuentas(data) {
            const tbody = document.getElementById('tbl-cuentas');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-scale-balanced"></i>Sin cuentas</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(c => `<tr>
                <td class="fw-600">${Utils.escapeHTML(c.codigo || '--')}</td>
                <td>${Utils.escapeHTML(c.nombre || '--')}</td>
                <td>${Utils.escapeHTML(c.tipo || '--')}</td>
                <td>${Utils.escapeHTML(c.naturaleza || '--')}</td>
                <td class="fw-600">${Utils.fmt(c.saldo || 0)}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-bf-icon" onclick="App.contabilidad.openEditCuenta(${c.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-bf-icon danger" onclick="App.contabilidad.removeCuenta(${c.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
        },

        renderAsientos(data) {
            const tbody = document.getElementById('tbl-asientos');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-file-invoice"></i>Sin asientos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(a => `<tr>
                <td class="fw-600">#${a.id || a.numero || '--'}</td>
                <td style="font-size:0.78rem;">${Utils.fmtDate(a.fecha)}</td>
                <td>${Utils.escapeHTML(a.concepto || '--')}</td>
                <td>${Utils.fmt(a.total_debe || 0)}</td>
                <td>${Utils.fmt(a.total_haber || 0)}</td>
                <td>
                    <button class="btn-bf-icon danger" onclick="App.contabilidad.removeAsiento(${a.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`).join('');
        },

        populateCuentaSelect() {
            const opts = '<option value="">Seleccionar...</option>' + this._cuentas.map(c => `<option value="${c.id}">${Utils.escapeHTML(c.codigo)} - ${Utils.escapeHTML(c.nombre)}</option>`).join('');
            // Mayor select
            const sel = document.getElementById('mayor-cuenta-select');
            if (sel) sel.innerHTML = '<option value="">Seleccionar cuenta...</option>' + this._cuentas.map(c => `<option value="${c.id}">${Utils.escapeHTML(c.codigo)} - ${Utils.escapeHTML(c.nombre)}</option>`).join('');
            // Asiento lines
            document.querySelectorAll('.as-cuenta').forEach(s => { const val = s.value; s.innerHTML = opts; s.value = val; });
        },

        openCreateCuenta() {
            Utils.setText('modal-cuenta-title', 'Nueva Cuenta');
            ['cta-id','cta-codigo','cta-nombre'].forEach(id => Utils.setVal(id, ''));
            Utils.setVal('cta-tipo', 'activo');
            Utils.setVal('cta-naturaleza', 'deudora');
            Utils.showModal('modal-cuenta');
        },

        openEditCuenta(id) {
            const c = this._cuentas.find(x => x.id === id);
            if (!c) return;
            Utils.setText('modal-cuenta-title', 'Editar Cuenta');
            Utils.setVal('cta-id', c.id);
            Utils.setVal('cta-codigo', c.codigo);
            Utils.setVal('cta-nombre', c.nombre);
            Utils.setVal('cta-tipo', c.tipo);
            Utils.setVal('cta-naturaleza', c.naturaleza);
            Utils.showModal('modal-cuenta');
        },

        async saveCuenta() {
            const id = Utils.val('cta-id');
            const body = { codigo: Utils.val('cta-codigo'), nombre: Utils.val('cta-nombre'), tipo: Utils.val('cta-tipo'), naturaleza: Utils.val('cta-naturaleza') };
            if (!body.codigo || !body.nombre) { Utils.toast('Código y Nombre son requeridos', 'warning'); return; }
            try {
                if (id) { await API.put(`/contabilidad/cuentas/${id}`, body); Utils.toast('Cuenta actualizada', 'success'); }
                else { await API.post('/contabilidad/cuentas', body); Utils.toast('Cuenta creada', 'success'); }
                Utils.hideModal('modal-cuenta');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async removeCuenta(id) {
            if (!await Utils.confirm('¿Eliminar esta cuenta?')) return;
            try { await API.delete(`/contabilidad/cuentas/${id}`); Utils.toast('Cuenta eliminada', 'success'); this.load(); } catch (err) { Utils.toast(err.message, 'error'); }
        },

        openCreateAsiento() {
            Utils.setText('modal-asiento-title', 'Nuevo Asiento');
            Utils.setVal('as-id', '');
            Utils.setVal('as-fecha', Utils.today());
            Utils.setVal('as-concepto', '');
            document.getElementById('as-lineas').innerHTML = `
                <div class="row g-2 mb-1 as-linea">
                    <div class="col-md-4"><select class="bf-input bf-select as-cuenta"><option value="">Cuenta...</option>${this._cuentas.map(c => `<option value="${c.id}">${Utils.escapeHTML(c.codigo)} - ${Utils.escapeHTML(c.nombre)}</option>`).join('')}</select></div>
                    <div class="col-md-3"><input type="number" class="bf-input" placeholder="Debe" step="0.01" data-field="debe"></div>
                    <div class="col-md-3"><input type="number" class="bf-input" placeholder="Haber" step="0.01" data-field="haber"></div>
                    <div class="col-md-2 d-flex align-items-center"><button type="button" class="btn-bf-icon danger" onclick="this.closest('.as-linea').remove()"><i class="fa-solid fa-trash"></i></button></div>
                </div>`;
            Utils.showModal('modal-asiento');
        },

        addAsientoLine() {
            const container = document.getElementById('as-lineas');
            const div = document.createElement('div');
            div.className = 'row g-2 mb-1 as-linea';
            div.innerHTML = `
                <div class="col-md-4"><select class="bf-input bf-select as-cuenta"><option value="">Cuenta...</option>${this._cuentas.map(c => `<option value="${c.id}">${Utils.escapeHTML(c.codigo)} - ${Utils.escapeHTML(c.nombre)}</option>`).join('')}</select></div>
                <div class="col-md-3"><input type="number" class="bf-input" placeholder="Debe" step="0.01" data-field="debe"></div>
                <div class="col-md-3"><input type="number" class="bf-input" placeholder="Haber" step="0.01" data-field="haber"></div>
                <div class="col-md-2 d-flex align-items-center"><button type="button" class="btn-bf-icon danger" onclick="this.closest('.as-linea').remove()"><i class="fa-solid fa-trash"></i></button></div>`;
            container.appendChild(div);
        },

        async saveAsiento() {
            const lineas = [];
            document.querySelectorAll('.as-linea').forEach(row => {
                const cuentaId = row.querySelector('.as-cuenta').value;
                const debe = parseFloat(row.querySelector('[data-field="debe"]').value) || 0;
                const haber = parseFloat(row.querySelector('[data-field="haber"]').value) || 0;
                if (cuentaId && (debe > 0 || haber > 0)) lineas.push({ cuenta_id: cuentaId, debe, haber });
            });
            if (lineas.length < 2) { Utils.toast('Mínimo 2 líneas por asiento', 'warning'); return; }
            const totalDebe = lineas.reduce((s, l) => s + l.debe, 0);
            const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);
            if (Math.abs(totalDebe - totalHaber) > 0.01) { Utils.toast(`Débe ${Utils.fmt(totalDebe)} ≠ Haber ${Utils.fmt(totalHaber)}`, 'error'); return; }
            const body = { fecha: Utils.val('as-fecha'), concepto: Utils.val('as-concepto'), lineas };
            if (!body.concepto) { Utils.toast('El concepto es requerido', 'warning'); return; }
            try {
                await API.post('/contabilidad/asientos', body);
                Utils.toast('Asiento registrado', 'success');
                Utils.hideModal('modal-asiento');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async removeAsiento(id) {
            if (!await Utils.confirm('¿Eliminar este asiento?')) return;
            try { await API.delete(`/contabilidad/asientos/${id}`); Utils.toast('Asiento eliminado', 'success'); this.load(); } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async loadMayor() {
            const cuentaId = Utils.val('mayor-cuenta-select');
            if (!cuentaId) { Utils.setHTML('tbl-mayor', '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-book"></i>Seleccione una cuenta</td></tr>'); return; }
            try {
                const data = await API.get(`/contabilidad/cuentas/${cuentaId}/mayor`);
                const movimientos = data.data || data.movimientos || data || [];
                const tbody = document.getElementById('tbl-mayor');
                if (!movimientos || movimientos.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-book"></i>Sin movimientos</td></tr>';
                    return;
                }
                let saldo = 0;
                tbody.innerHTML = movimientos.map(m => {
                    const debe = m.debe || 0;
                    const haber = m.haber || 0;
                    saldo += debe - haber;
                    return `<tr>
                        <td style="font-size:0.78rem;">${Utils.fmtDate(m.fecha)}</td>
                        <td>${Utils.escapeHTML(m.concepto || '--')}</td>
                        <td style="font-size:0.78rem;">#${m.asiento_id || '--'}</td>
                        <td>${debe > 0 ? Utils.fmt(debe) : ''}</td>
                        <td>${haber > 0 ? Utils.fmt(haber) : ''}</td>
                        <td class="fw-600" style="color:${saldo >= 0 ? '#16a34a' : '#dc2626'};">${Utils.fmt(Math.abs(saldo))}</td>
                    </tr>`;
                }).join('');
            } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // GASTOS DEL NEGOCIO
    // ========================================================
    gastos: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/gastos');
                this._data = data.data || data.gastos || data || [];
                this.render(this._data);
            } catch (err) { this._data = []; this.render([]); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-gastos');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-money-bill-trend-up"></i>Sin gastos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(g => `<tr>
                <td>${Utils.escapeHTML(g.concepto || '--')}</td>
                <td class="fw-600">${Utils.fmt(g.monto)}</td>
                <td>${Utils.translateCategoria(g.categoria)}</td>
                <td style="font-size:0.78rem;">${Utils.fmtDate(g.fecha)}</td>
                <td>${g.comprobante ? '<i class="fa-solid fa-file" style="color:var(--bf-primary);cursor:pointer;"></i>' : '--'}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-bf-icon" onclick="App.gastos.openEdit(${g.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-bf-icon danger" onclick="App.gastos.remove(${g.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
        },

        filter(term) {
            const t = term.toLowerCase();
            this.render(this._data.filter(g => `${g.concepto} ${g.categoria} ${g.monto}`.toLowerCase().includes(t)));
        },

        openCreate() {
            Utils.setText('modal-gasto-title', 'Nuevo Gasto');
            ['gt-id','gt-concepto','gt-monto'].forEach(id => Utils.setVal(id, ''));
            Utils.setVal('gt-categoria', 'otros');
            Utils.setVal('gt-fecha', Utils.today());
            const fileInput = document.getElementById('gt-comprobante');
            if (fileInput) fileInput.value = '';
            Utils.showModal('modal-gasto');
        },

        openEdit(id) {
            const g = this._data.find(x => x.id === id);
            if (!g) return;
            Utils.setText('modal-gasto-title', 'Editar Gasto');
            Utils.setVal('gt-id', g.id);
            Utils.setVal('gt-concepto', g.concepto);
            Utils.setVal('gt-monto', g.monto);
            Utils.setVal('gt-categoria', g.categoria || 'otros');
            Utils.setVal('gt-fecha', g.fecha ? g.fecha.split('T')[0] : Utils.today());
            Utils.showModal('modal-gasto');
        },

        async save() {
            const id = Utils.val('gt-id');
            const body = {
                concepto: Utils.val('gt-concepto'),
                monto: parseFloat(Utils.val('gt-monto')) || 0,
                categoria: Utils.val('gt-categoria'),
                fecha: Utils.val('gt-fecha'),
            };
            if (!body.concepto || !body.monto) { Utils.toast('Concepto y Monto son requeridos', 'warning'); return; }
            // Handle file upload
            const fileInput = document.getElementById('gt-comprobante');
            if (fileInput && fileInput.files.length > 0) {
                body.comprobante = await Utils.fileToBase64(fileInput.files[0]);
            }
            try {
                if (id) { await API.put(`/gastos/${id}`, body); Utils.toast('Gasto actualizado', 'success'); }
                else { await API.post('/gastos', body); Utils.toast('Gasto registrado', 'success'); }
                Utils.hideModal('modal-gasto');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar este gasto?')) return;
            try { await API.delete(`/gastos/${id}`); Utils.toast('Gasto eliminado', 'success'); this.load(); } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // WHATSAPP
    // ========================================================
    whatsapp: {
        _data: [],

        async load() {
            try {
                const data = await API.get('/notificaciones');
                this._data = data.data || data.notificaciones || data || [];
                this.render(this._data);
            } catch (err) { this._data = []; this.render([]); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-whatsapp');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="bf-empty"><i class="fa-brands fa-whatsapp"></i>Sin notificaciones</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(n => `<tr>
                <td style="font-size:0.78rem;">${Utils.fmtDateTime(n.fecha || n.created_at)}</td>
                <td>${Utils.escapeHTML(n.destino || n.telefono || '--')}</td>
                <td style="font-size:0.8rem;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.escapeHTML(n.mensaje || '--')}</td>
                <td><span class="badge-st" style="background:${n.estado === 'enviado' || n.status === 'sent' ? '#dcfce7;color:#16a34a;' : n.estado === 'error' || n.status === 'error' ? '#fee2e2;color:#dc2626;' : '#fef3c7;color:#d97706;'}">${Utils.escapeHTML(n.estado || n.status || '--')}</span></td>
                <td style="font-size:0.78rem;color:#dc2626;">${Utils.escapeHTML(n.error || n.error_message || '')}</td>
            </tr>`).join('');
        },

        testSend() { Utils.showModal('modal-whatsapp-test'); },

        async send() {
            const numero = Utils.val('wa-numero');
            const mensaje = Utils.val('wa-mensaje');
            if (!numero || !mensaje) { Utils.toast('Número y mensaje son requeridos', 'warning'); return; }
            try {
                await API.post('/notificaciones/test', { numero, mensaje });
                Utils.toast('Mensaje de prueba enviado', 'success');
                Utils.hideModal('modal-whatsapp-test');
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // LANDING PAGES
    // ========================================================
    landing: {
        _data: [],
        _fields: [],
        _editingId: null,

        async load() {
            this.showList();
            try {
                const data = await API.get('/landing');
                this._data = data.data || data.landings || data || [];
                this.render(this._data);
            } catch (err) { this._data = []; this.render([]); }
        },

        render(data) {
            const tbody = document.getElementById('tbl-landing');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="bf-empty"><i class="fa-solid fa-globe"></i>Sin landing pages</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(l => `<tr>
                <td class="fw-600">${Utils.escapeHTML(l.titulo || '--')}</td>
                <td style="font-size:0.78rem;color:#64748b;">${Utils.escapeHTML(l.slug || '--')}</td>
                <td>${l.visitas || 0}</td>
                <td>${l.conversiones || 0}</td>
                <td><span class="badge-st" style="background:${l.activo ? '#dcfce7;color:#16a34a;' : '#f1f5f9;color:#64748b;'}">${l.activo ? 'Activa' : 'Inactiva'}</span></td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-bf-icon" onclick="App.landing.openEdit(${l.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-bf-icon" onclick="App.landing.viewConversions(${l.id})" title="Conversiones"><i class="fa-solid fa-chart-line"></i></button>
                        <button class="btn-bf-icon danger" onclick="App.landing.remove(${l.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
        },

        showList() {
            document.getElementById('landing-list-view').style.display = '';
            document.getElementById('landing-form-view').style.display = 'none';
        },

        openCreate() {
            this._editingId = null;
            this._fields = [];
            Utils.setText('landing-form-title', 'Nueva Landing Page');
            ['lp-titulo','lp-slug','lp-descripcion','lp-cta-texto','lp-cta-url','lp-seo-title','lp-seo-desc'].forEach(id => Utils.setVal(id, ''));
            Utils.setVal('lp-cta-texto', 'Solicitar Cotización');
            Utils.setVal('lp-color', '#0d9488');
            Utils.setVal('lp-fuente', 'Inter');
            Utils.setHTML('lp-fields-list', '');
            document.getElementById('landing-list-view').style.display = 'none';
            document.getElementById('landing-form-view').style.display = '';
        },

        async openEdit(id) {
            const l = this._data.find(x => x.id === id);
            if (!l) return;
            this._editingId = id;
            this.openCreate();
            Utils.setText('landing-form-title', `Editar: ${l.titulo || ''}`);
            Utils.setVal('lp-titulo', l.titulo);
            Utils.setVal('lp-slug', l.slug);
            Utils.setVal('lp-descripcion', l.descripcion);
            Utils.setVal('lp-cta-texto', l.cta_texto || l.ctaTexto || 'Solicitar Cotización');
            Utils.setVal('lp-cta-url', l.cta_url || l.ctaUrl || '');
            Utils.setVal('lp-color', l.color || '#0d9488');
            Utils.setVal('lp-fuente', l.fuente || 'Inter');
            Utils.setVal('lp-seo-title', l.seo_title || '');
            Utils.setVal('lp-seo-desc', l.seo_description || '');
            this._fields = l.form_fields || l.campos || [];
            this.renderFields();
        },

        addFormField(type) {
            const fieldNames = { nombre: 'Nombre', email: 'Email', telefono: 'Teléfono', mensaje: 'Mensaje' };
            this._fields.push({ tipo: type, label: fieldNames[type] || type, requerido: true });
            this.renderFields();
        },

        renderFields() {
            const container = document.getElementById('lp-fields-list');
            if (!container) return;
            container.innerHTML = this._fields.map((f, i) => `
                <div class="d-flex align-items-center gap-2 mb-2 p-2" style="background:#f8fafc;border-radius:0.4rem;border:1px solid #f1f5f9;">
                    <span class="badge-st" style="background:var(--bf-primary);color:#fff;">${Utils.escapeHTML(f.tipo)}</span>
                    <input class="bf-input" value="${Utils.escapeHTML(f.label)}" style="max-width:200px;" onchange="App.landing._fields[${i}].label=this.value">
                    <label style="font-size:0.78rem;display:flex;align-items:center;gap:0.3rem;cursor:pointer;">
                        <input type="checkbox" ${f.requerido ? 'checked' : ''} onchange="App.landing._fields[${i}].requerido=this.checked"> Req.
                    </label>
                    <button class="btn-bf-icon danger ms-auto" onclick="App.landing._fields.splice(${i},1);App.landing.renderFields();"><i class="fa-solid fa-trash"></i></button>
                </div>
            `).join('');
        },

        async save() {
            const body = {
                titulo: Utils.val('lp-titulo'),
                slug: Utils.val('lp-slug'),
                descripcion: Utils.val('lp-descripcion'),
                cta_texto: Utils.val('lp-cta-texto'),
                cta_url: Utils.val('lp-cta-url'),
                color: Utils.val('lp-color'),
                fuente: Utils.val('lp-fuente'),
                seo_title: Utils.val('lp-seo-title'),
                seo_description: Utils.val('lp-seo-desc'),
                form_fields: this._fields,
            };
            if (!body.titulo) { Utils.toast('El título es requerido', 'warning'); return; }
            // Handle logo upload
            const logoFile = document.getElementById('lp-logo').files[0];
            if (logoFile) body.logo = await Utils.fileToBase64(logoFile);
            const bgFile = document.getElementById('lp-bg-image').files[0];
            if (bgFile) body.bg_image = await Utils.fileToBase64(bgFile);

            try {
                if (this._editingId) { await API.put(`/landing/${this._editingId}`, body); Utils.toast('Landing page actualizada', 'success'); }
                else { await API.post('/landing', body); Utils.toast('Landing page creada', 'success'); }
                this.load();
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        preview() {
            const titulo = Utils.val('lp-titulo') || 'Preview';
            const color = Utils.val('lp-color') || '#0d9488';
            const descripcion = Utils.val('lp-descripcion') || '';
            const cta = Utils.val('lp-cta-texto') || 'CTA';
            const fields = this._fields || [];
            const formFieldsHTML = fields.map(f => `<div class="mb-2"><input type="${f.tipo === 'mensaje' ? 'textarea' : f.tipo === 'email' ? 'email' : 'text'}" class="bf-input" placeholder="${Utils.escapeHTML(f.label)}" ${f.requerido ? 'required' : ''}></div>`).join('');

            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Inter',sans-serif;}</style></head><body>
                <div style="min-height:100vh;background:${color};display:flex;align-items:center;justify-content:center;padding:2rem;">
                    <div style="background:#fff;border-radius:1rem;padding:2.5rem;max-width:500px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);text-align:center;">
                        <h1 style="font-size:1.8rem;font-weight:800;color:#1e293b;margin-bottom:0.5rem;">${Utils.escapeHTML(titulo)}</h1>
                        <p style="color:#64748b;font-size:0.9rem;margin-bottom:1.5rem;">${Utils.escapeHTML(descripcion)}</p>
                        ${formFieldsHTML}
                        <button style="background:${color};color:#fff;border:none;padding:0.75rem 2rem;border-radius:0.5rem;font-weight:600;font-size:1rem;cursor:pointer;width:100%;">${Utils.escapeHTML(cta)}</button>
                    </div>
                </div>
            </body></html>`;

            const win = window.open('', '_blank', 'width=800,height=600');
            if (win) { win.document.write(html); win.document.close(); }
            else { Utils.toast('No se pudo abrir la ventana de vista previa', 'warning'); }
        },

        async viewConversions(id) {
            try {
                const data = await API.get(`/landing/${id}/conversiones`);
                const conv = data.data || data.conversiones || data || [];
                await Swal.fire({
                    title: 'Conversiones',
                    html: conv.length > 0 ? `<table style="width:100%;font-size:0.85rem;border-collapse:collapse;"><tr style="background:#f8fafc;"><th style="padding:0.5rem;text-align:left;border-bottom:1px solid #e2e8f0;">Fecha</th><th style="padding:0.5rem;text-align:left;border-bottom:1px solid #e2e8f0;">Datos</th></tr>${conv.map(c => `<tr><td style="padding:0.5rem;border-bottom:1px solid #f1f5f9;">${Utils.fmtDateTime(c.fecha)}</td><td style="padding:0.5rem;border-bottom:1px solid #f1f5f9;">${Utils.escapeHTML(c.datos || JSON.stringify(c))}</td></tr>`).join('')}</table>` : '<p style="color:#94a3b8;">Sin conversiones aún</p>',
                    width: 600,
                });
            } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async remove(id) {
            if (!await Utils.confirm('¿Eliminar esta landing page?')) return;
            try { await API.delete(`/landing/${id}`); Utils.toast('Landing page eliminada', 'success'); this.load(); } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // CONFIGURACIÓN
    // ========================================================
    config: {
        async load() {
            try {
                const data = await API.get('/config');
                const cfg = data.data || data.config || data || {};
                Utils.setVal('cfg-empresa', cfg.empresa_nombre || cfg.nombre || '');
                Utils.setVal('cfg-rif', cfg.rif || cfg.nit || '');
                Utils.setVal('cfg-direccion', cfg.direccion || '');
                Utils.setVal('cfg-telefono', cfg.telefono || '');
                Utils.setVal('cfg-email', cfg.email || '');
                Utils.setVal('cfg-wm-instance', cfg.ultramsg_instance || cfg.wm_instance || '');
                Utils.setVal('cfg-wm-token', cfg.ultramsg_token || cfg.wm_token || '');
                if (currentUser) {
                    Utils.setVal('cfg-user-name', currentUser.nombre || '');
                    Utils.setVal('cfg-user-email', currentUser.email || '');
                }
            } catch (err) { console.error('Config load error:', err); }
        },

        async saveEmpresa() {
            const body = {
                empresa_nombre: Utils.val('cfg-empresa'),
                rif: Utils.val('cfg-rif'),
                direccion: Utils.val('cfg-direccion'),
                telefono: Utils.val('cfg-telefono'),
                email: Utils.val('cfg-email'),
            };
            try { await API.put('/config/empresa', body); Utils.toast('Configuración guardada', 'success'); } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async saveWhatsApp() {
            const body = { ultramsg_instance: Utils.val('cfg-wm-instance'), ultramsg_token: Utils.val('cfg-wm-token') };
            try { await API.put('/config/whatsapp', body); Utils.toast('Configuración WhatsApp guardada', 'success'); } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async saveProfile() {
            const body = { nombre: Utils.val('cfg-user-name'), email: Utils.val('cfg-user-email') };
            const pass = Utils.val('cfg-user-pass');
            if (pass) body.password = pass;
            try { await API.put('/config/profile', body); Utils.toast('Perfil actualizado', 'success'); } catch (err) { Utils.toast(err.message, 'error'); }
        },

        async backup() {
            try {
                const data = await API.get('/exportar');
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `bizflow_backup_${Utils.today()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                Utils.toast('Backup descargado', 'success');
            } catch (err) { Utils.toast(err.message, 'error'); }
        },
    },

    // ========================================================
    // REPORTES
    // ========================================================
    reportes: {
        _data: [],

        load() {
            const today = Utils.today();
            const firstDay = today.substring(0, 8) + '01';
            Utils.setVal('rpt-fecha-from', firstDay);
            Utils.setVal('rpt-fecha-to', today);
        },

        async generate() {
            const tipo = Utils.val('rpt-tipo');
            const from = Utils.val('rpt-fecha-from');
            const to = Utils.val('rpt-fecha-to');
            try {
                const params = new URLSearchParams({ tipo, desde: from, hasta: to });
                const data = await API.get(`/reportes?${params.toString()}`);
                const result = data.data || data;
                this._data = result.items || result.filas || result || [];
                this.renderChart(result, tipo);
                this.renderTable(this._data);
            } catch (err) {
                Utils.toast(err.message, 'error');
                this._data = [];
            }
        },

        renderChart(data, tipo) {
            const items = data.items || data.filas || data || [];
            const labels = items.map(i => i.label || i.nombre || i.concepto || i.mes || '');
            const values = items.map(i => i.total || i.cantidad || i.value || 0);
            const colors = ['#0d9488','#f59e0b','#6366f1','#ec4899','#14b8a6','#8b5cf6','#f97316','#06b6d4','#10b981','#ef4444'];
            if (tipo === 'ingresos' || tipo === 'gastos') {
                createBarChart('chart-reportes', labels, values, colors);
            } else {
                createDoughnutChart('chart-reportes', labels, values, colors);
            }
        },

        renderTable(data) {
            const tbody = document.getElementById('tbl-reportes');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="bf-empty"><i class="fa-solid fa-chart-bar"></i>Sin datos para el período</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(r => `<tr>
                <td>${Utils.escapeHTML(r.label || r.nombre || r.concepto || r.mes || '--')}</td>
                <td>${r.cantidad || r.count || 0}</td>
                <td class="fw-600">${Utils.fmt(r.total || r.value || 0)}</td>
            </tr>`).join('');
        },

        exportPDF() {
            if (!this._data || this._data.length === 0) { Utils.toast('Genere un reporte primero', 'warning'); return; }
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                const tipo = Utils.val('rpt-tipo');
                const from = Utils.val('rpt-fecha-from');
                const to = Utils.val('rpt-fecha-to');
                doc.setFontSize(18);
                doc.setTextColor(13, 148, 136);
                doc.text('BizFlow - Reporte', 14, 20);
                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.text(`Tipo: ${tipo} | Desde: ${from} | Hasta: ${to}`, 14, 28);

                const tableData = this._data.map(r => [
                    r.label || r.nombre || r.concepto || r.mes || '--',
                    String(r.cantidad || r.count || 0),
                    Utils.fmt(r.total || r.value || 0),
                ]);
                doc.autoTable({
                    startY: 35,
                    head: [['Concepto', 'Cantidad', 'Total']],
                    body: tableData,
                    theme: 'grid',
                    headStyles: { fillColor: [13, 148, 136] },
                });
                doc.save(`reporte_${tipo}_${from}_${to}.pdf`);
                Utils.toast('PDF exportado', 'success');
            } catch (err) { Utils.toast('Error exportando PDF: ' + err.message, 'error'); }
        },
    },
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Show splash screen, then transition directly to app (no login)
    setTimeout(() => {
        document.getElementById('splash-screen').classList.add('hidden');

        // Skip login - go directly to app
        currentUser = {
            id: 1,
            email: 'admin@bizflow.com',
            nombre: 'Administrador',
            rol: 'admin',
            empresa: 'BizFlow',
        };
        localStorage.setItem('bizflow_user', JSON.stringify(currentUser));
        Auth.showApp();

        // Init sidebar
        initSidebar();

        // Logout button
        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());

        // Notifications button (placeholder)
        const notifBtn = document.getElementById('btn-notifications');
        if (notifBtn) notifBtn.addEventListener('click', () => {
            Utils.toast('Sin notificaciones nuevas', 'info');
        });
    }, 1200);
});
