/**
 * ============================================================
 * BizFlow - Panel de Administración
 * JavaScript Principal - Lógica completa de la aplicación
 * ============================================================
 * Módulos: Login, Navegación, Dashboard, Órdenes, Técnicos,
 *           Servicios, Modelos, Costos, Gastos, Liquidaciones,
 *           Pagos, Notificaciones, Exportar, Config, Landing
 * ============================================================
 */

'use strict';

// ============================================================
// ESTADO GLOBAL
// ============================================================
const API = ''; // URL base (misma origen, Cloudflare Pages Functions)
let currentUser = null;
let currentNegocioId = 'default';
let dashboardInterval = null;
let serviciosCatalogoCache = [];
let tecnicosCache = [];
let ordenesCache = [];
let currentDashboardPeriod = 'dia';

// ============================================================
// UTILIDADES GENERALES
// ============================================================

/** Formatea un monto como moneda $XX.XXX */
function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return '$' + num.toLocaleString('es-MX', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

/** Formatea una fecha ISO a DD/MM/YYYY */
function formatDate(dateStr) {
    if (!dateStr) return '--';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    } catch {
        return dateStr;
    }
}

/** Formatea fecha y hora DD/MM/YYYY HH:mm */
function formatDateTime(dateStr) {
    if (!dateStr) return '--';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    } catch {
        return dateStr;
    }
}

/** Obtiene la fecha de hoy en formato YYYY-MM-DD */
function getTodayISO() {
    const d = new Date();
    return d.toISOString().split('T')[0];
}

/** Genera initials a partir de un nombre */
function getInitials(name) {
    if (!name) return 'AD';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

/** Normaliza una patente (mayúsculas, sin espacios) */
function normalizePatente(p) {
    return (p || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Traduce categoría de gasto a español */
function translateCategoria(cat) {
    const map = {
        'alquiler': 'Alquiler / Local',
        'servicios': 'Servicios',
        'transporte': 'Transporte',
        'insumos': 'Insumos',
        'salarios': 'Salarios',
        'marketing': 'Marketing',
        'otros': 'Otros',
        'otro': 'Otros',
    };
    return map[cat] || cat || 'Otros';
}

/** Traduce método de pago a español */
function translateMetodoPago(metodo) {
    const map = {
        'efectivo': 'Efectivo',
        'tarjeta': 'Tarjeta',
        'transferencia': 'Transferencia',
        'mercado_pago': 'MercadoPago',
        'deposito': 'Depósito',
        'cta_cte': 'Cta. Cte.',
    };
    return map[metodo] || metodo || '--';
}

/** Traduce categoría de servicio a español */
function translateServicioCategoria(cat) {
    const map = {
        'mecanica': 'Mecánica',
        'electrica': 'Eléctrica',
        'carroceria': 'Carrocería',
        'pintura': 'Pintura',
        'lavado': 'Lavado / Detailing',
        'neumaticos': 'Neumáticos',
        'diagnostico': 'Diagnóstico',
        'otro': 'Otro',
    };
    return map[cat] || cat || '--';
}

/** Retorna la clase CSS para un badge de estado */
function getEstadoBadgeClass(estado) {
    const s = (estado || '').toLowerCase().replace(/\s+/g, '-');
    const map = {
        'enviada': 'badge-enviada',
        'aprobada': 'badge-aprobada',
        'pendiente-visita': 'badge-pendiente-visita',
        'pendiente_visita': 'badge-pendiente-visita',
        'en-sitio': 'badge-en-sitio',
        'en_sitio': 'badge-en-sitio',
        'en-progreso': 'badge-en-progreso',
        'en_progreso': 'badge-en-progreso',
        'completada': 'badge-completada',
        'cerrada': 'badge-cerrada',
        'cancelada': 'badge-cancelada',
    };
    return map[s] || 'badge-enviada';
}

/** Traduce estado a formato legible */
function translateEstado(estado) {
    const s = (estado || '').replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Muestra un toast de Bootstrap */
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }

    const iconMap = {
        success: 'fa-circle-check text-success',
        error: 'fa-circle-xmark text-danger',
        warning: 'fa-triangle-exclamation text-warning',
        info: 'fa-circle-info text-info',
    };

    const toastEl = document.createElement('div');
    toastEl.className = 'toast align-items-center border-0 shadow';
    toastEl.setAttribute('role', 'alert');
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body d-flex align-items-center gap-2">
                <i class="fa-solid ${iconMap[type] || iconMap.info}"></i>
                <span>${message}</span>
            </div>
            <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;

    container.appendChild(toastEl);
    const bsToast = new bootstrap.Toast(toastEl, { delay: 4000 });
    bsToast.show();

    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

/** Muestra un modal de Bootstrap por ID */
function showModal(id) {
    const modalEl = document.getElementById(id);
    if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
}

/** Oculta un modal de Bootstrap por ID */
function hideModal(id) {
    const modalEl = document.getElementById(id);
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }
}

/** Wrapper para fetch con manejo de errores y auth */
async function apiFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Incluir token si existe
    if (currentUser?.token) {
        headers['Authorization'] = `Bearer ${currentUser.token}`;
    }

    try {
        const response = await fetch(`${API}${url}`, { ...options, headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error || errorData.message || `Error ${response.status}`;
            throw new Error(errorMsg);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Error de conexión. Verifique su conexión a internet.');
        }
        throw error;
    }
}

/** Obtiene el valor de un campo del DOM */
function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

/** Establece el valor de un campo del DOM */
function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
}

/** Establece el HTML de un elemento */
function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

/** Establece el texto de un elemento */
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/** Confirma una acción con SweetAlert-style modal */
function confirmAction(message, onConfirm) {
    // Crear modal de confirmación dinámico
    let confirmModal = document.getElementById('confirm-action-modal');
    if (!confirmModal) {
        confirmModal = document.createElement('div');
        confirmModal.id = 'confirm-action-modal';
        confirmModal.className = 'modal fade';
        confirmModal.setAttribute('tabindex', '-1');
        confirmModal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-sm">
                <div class="modal-content" style="border:none;border-radius:1rem;box-shadow:0 25px 50px -12px rgba(0,0,0,0.2);">
                    <div class="modal-body text-center py-4">
                        <div style="width:56px;height:56px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;">
                            <i class="fa-solid fa-triangle-exclamation" style="font-size:1.4rem;color:#dc2626;"></i>
                        </div>
                        <p class="fw-600 text-gray-700 mb-4" id="confirm-action-message">¿Está seguro?</p>
                        <div class="d-flex gap-2 justify-content-center">
                            <button class="btn btn-sm btn-outline-secondary px-4" data-bs-dismiss="modal" style="border-radius:0.5rem;">Cancelar</button>
                            <button class="btn btn-sm px-4" id="confirm-action-btn" style="background:#dc2626;color:#fff;border:none;border-radius:0.5rem;">Confirmar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(confirmModal);
    }

    setHTML('confirm-action-message', message);
    const modal = bootstrap.Modal.getOrCreateInstance(confirmModal);
    const btnConfirm = document.getElementById('confirm-action-btn');

    const handler = () => {
        modal.hide();
        btnConfirm.removeEventListener('click', handler);
        if (onConfirm) onConfirm();
    };
    btnConfirm.addEventListener('click', handler);

    modal.show();
}


// ============================================================
// MÓDULO DE LOGIN
// ============================================================

/** Inicializa el formulario de login */
function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = getVal('login-email');
        const password = getVal('login-password');

        if (!email || !password) {
            showToast('Ingrese correo y contraseña', 'warning');
            return;
        }

        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Ingresando...';

        try {
            await doLogin(email, password);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

/** Realiza el login contra la API */
async function doLogin(email, password) {
    const data = await apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });

    if (data.success && data.data?.usuario) {
        currentUser = data.data.usuario;
        currentNegocioId = currentUser.negocio_id || 'default';

        // Guardar sesión en localStorage
        localStorage.setItem('bizflow_session', JSON.stringify({
            usuario: currentUser,
            negocio_id: currentNegocioId,
        }));

        showToast('¡Bienvenido, ' + (currentUser.nombre || currentUser.email || 'Admin') + '!', 'success');
        showApp();
        loadDashboard();
    } else {
        throw new Error(data.error || 'Credenciales inválidas');
    }
}

/** Cierra la sesión y muestra login */
function logout() {
    currentUser = null;
    currentNegocioId = 'default';
    localStorage.removeItem('bizflow_session');

    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    document.getElementById('main-app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    showToast('Sesión cerrada', 'info');
}

/** Verifica si hay sesión guardada en localStorage */
function checkSession() {
    const saved = localStorage.getItem('bizflow_session');
    if (saved) {
        try {
            const session = JSON.parse(saved);
            if (session.usuario) {
                currentUser = session.usuario;
                currentNegocioId = session.negocio_id || 'default';
                showApp();
                loadDashboard();
                return true;
            }
        } catch {
            localStorage.removeItem('bizflow_session');
        }
    }
    return false;
}

/** Muestra la interfaz principal y oculta login */
function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';

    // Actualizar avatar y nombre
    const initials = getInitials(currentUser?.nombre || currentUser?.email || 'Admin');
    const nombre = currentUser?.nombre || currentUser?.email || 'Admin';

    setText('sidebar-avatar', initials);
    setText('sidebar-username', nombre);
    setText('topbar-avatar', initials);
    setText('topbar-username', nombre);
}


// ============================================================
// MÓDULO DE NAVEGACIÓN
// ============================================================

/** Navega a una sección (función global llamada desde HTML) */
function navigateTo(sectionId) {
    switchSection(sectionId);

    // Cerrar sidebar en mobile
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && sidebar.classList.contains('show')) {
        sidebar.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
    }
}

/** Cambia la sección visible y actualiza la navegación */
function switchSection(sectionId) {
    // Ocultar todas las secciones
    document.querySelectorAll('.section-container').forEach(sec => {
        sec.classList.remove('active');
    });

    // Mostrar la sección seleccionada
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
    }

    // Actualizar sidebar activo
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.section === sectionId) {
            item.classList.add('active');
        }
    });

    // Actualizar título del topbar
    const titleMap = {
        'dashboard-section': 'Dashboard',
        'ordenes-section': 'Órdenes de Trabajo',
        'tecnicos-section': 'Técnicos / Operarios',
        'servicios-section': 'Catálogo de Servicios',
        'modelos-section': 'Modelos de Vehículos',
        'costos-section': 'Costos Adicionales',
        'gastos-section': 'Gastos del Negocio',
        'liquidaciones-section': 'Liquidaciones',
        'pagos-section': 'Resumen de Pagos',
        'notificaciones-section': 'Notificaciones WhatsApp',
        'exportar-section': 'Exportar Datos',
        'config-section': 'Configuración',
        'landing-section': 'Landing Pages',
    };
    setText('topbar-title', titleMap[sectionId] || 'BizFlow');

    // Cargar datos según la sección
    loadSectionData(sectionId);
}

/** Carga los datos necesarios al entrar a una sección */
function loadSectionData(sectionId) {
    switch (sectionId) {
        case 'dashboard-section':
            loadDashboard();
            break;
        case 'ordenes-section':
            loadOrdenes();
            break;
        case 'tecnicos-section':
            loadTecnicos();
            loadOrdenesDisponibles();
            break;
        case 'servicios-section':
            loadServicios();
            break;
        case 'modelos-section':
            loadModelos();
            break;
        case 'costos-section':
            loadCostosSection();
            break;
        case 'gastos-section':
            loadGastos();
            break;
        case 'liquidaciones-section':
            calcularLiquidaciones();
            break;
        case 'pagos-section':
            loadResumenPagos();
            break;
        case 'notificaciones-section':
            loadNotificaciones();
            checkUltraMsgStatus();
            break;
        case 'config-section':
            loadConfig();
            break;
        case 'landing-section':
            loadLandingPages();
            break;
    }
}

/** Inicializa eventos del sidebar */
function initSidebar() {
    // Toggle sidebar en mobile
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleSidebar);
    }

    // Cerrar sidebar en mobile
    const closeBtn = document.getElementById('sidebar-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (sidebar) sidebar.classList.remove('show');
            if (overlay) overlay.classList.remove('show');
        });
    }

    // Cerrar al hacer click en overlay
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('show');
            overlay.classList.remove('show');
        });
    }
}

/** Abre/cierra el sidebar en mobile */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;

    sidebar.classList.toggle('show');
    if (overlay) overlay.classList.toggle('show');
}


// ============================================================
// MÓDULO DE DASHBOARD
// ============================================================

/** Carga datos del dashboard */
async function loadDashboard() {
    try {
        const data = await apiFetch(`/api/admin/dashboard?periodo=${currentDashboardPeriod}`);
        if (data.success && data.data) {
            renderKPICards(data.data.kpis);
            renderDashboardFinanzas(data.data.finanzas);
            renderTopServices(data.data.servicios_mas_solicitados || []);
            renderTecnicoPerformance(data.data.rendimiento_por_tecnico || []);
            renderGastosPorCategoria(data.data.gastos_por_categoria || []);
            renderOrdenesTrend(data.data);
        }
    } catch (err) {
        console.error('Error cargando dashboard:', err);
        showToast('Error cargando dashboard: ' + err.message, 'error');
    }
}

/** Renderiza las 6 tarjetas KPI */
function renderKPICards(kpis) {
    setText('kpi-total-ordenes', kpis?.total_ordenes || 0);
    setText('kpi-aprobadas', kpis?.ordenes_aprobadas || 0);
    setText('kpi-en-proceso', kpis?.en_proceso || 0);
    setText('kpi-cerradas', kpis?.cerradas || 0);
    setText('kpi-ingresos', formatCurrency(kpis?.total_ordenes || 0));
    setText('kpi-pendientes', kpis?.pendientes || 0);
}

/** Renderiza datos financieros en los KPI relevantes */
function renderDashboardFinanzas(finanzas) {
    if (!finanzas) return;
    setText('kpi-ingresos', formatCurrency(finanzas.total_generado || 0));
}

/** Renderiza los top servicios como lista */
function renderTopServices(servicios) {
    const container = document.getElementById('chart-top-servicios');
    if (!container) return;

    if (!servicios || servicios.length === 0) {
        container.innerHTML = `
            <div class="text-center w-100">
                <i class="fa-solid fa-chart-bar d-block mb-2" style="font-size:1.5rem;color:#cbd5e1;"></i>
                <span class="text-gray-400" style="font-size:0.8rem;">Sin datos</span>
            </div>`;
        return;
    }

    const maxCantidad = Math.max(...servicios.map(s => s.cantidad || 0), 1);

    let html = '<div class="w-100 p-2">';
    servicios.forEach((s, i) => {
        const pct = Math.round(((s.cantidad || 0) / maxCantidad) * 100);
        const colors = ['bg-teal-500', 'bg-emerald-400', 'bg-cyan-400', 'bg-teal-300', 'bg-cyan-300'];
        const color = colors[i] || 'bg-teal-500';
        html += `
            <div class="mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span style="font-size:0.8rem;font-weight:600;color:#334155;" class="text-truncate me-2">${s.servicio || 'Servicio'}</span>
                    <span style="font-size:0.72rem;color:#64748b;white-space:nowrap;">${s.cantidad || 0} OT</span>
                </div>
                <div style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
                    <div class="${color}" style="height:100%;width:${pct}%;border-radius:3px;transition:width 0.5s;"></div>
                </div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

/** Renderiza la tabla de rendimiento de técnicos */
function renderTecnicoPerformance(tecnicos) {
    const tbody = document.querySelector('#dashboard-tecnicos-table tbody');
    if (!tbody) return;

    if (!tecnicos || tecnicos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4" style="color:#94a3b8;">
                    <i class="fa-solid fa-users mb-2 d-block" style="font-size:1.5rem;"></i>
                    Sin datos de técnicos
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = tecnicos.map(t => {
        const total = t.ordenes || 0;
        const cerradas = t.cerradas || 0;
        const eficiencia = total > 0 ? Math.round((cerradas / total) * 100) : 0;
        const effColor = eficiencia >= 80 ? '#16a34a' : eficiencia >= 50 ? '#d97706' : '#dc2626';

        return `
            <tr>
                <td class="fw-600">${t.nombre || '--'}</td>
                <td>${total}</td>
                <td>${cerradas}</td>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <div style="height:6px;width:60px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
                            <div style="height:100%;width:${eficiencia}%;background:${effColor};border-radius:3px;"></div>
                        </div>
                        <span style="font-size:0.8rem;font-weight:600;color:${effColor};">${eficiencia}%</span>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

/** Renderiza gastos por categoría como visualización */
function renderGastosPorCategoria(gastos) {
    const container = document.getElementById('chart-gastos-categoria');
    if (!container) return;

    if (!gastos || gastos.length === 0) {
        container.innerHTML = `
            <div class="text-center w-100">
                <i class="fa-solid fa-chart-pie d-block mb-2" style="font-size:1.5rem;color:#cbd5e1;"></i>
                <span class="text-gray-400" style="font-size:0.8rem;">Sin gastos en este período</span>
            </div>`;
        return;
    }

    const totalGasto = gastos.reduce((sum, g) => sum + (g.total || 0), 0);
    const catColors = ['#0d9488', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316'];

    let html = '<div class="w-100 p-2">';
    gastos.forEach((g, i) => {
        const pct = totalGasto > 0 ? Math.round(((g.total || 0) / totalGasto) * 100) : 0;
        const color = catColors[i % catColors.length];
        html += `
            <div class="d-flex align-items-center gap-2 mb-2">
                <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></div>
                <span style="font-size:0.8rem;color:#334155;flex:1;" class="text-truncate">${translateCategoria(g.categoria)}</span>
                <span style="font-size:0.75rem;color:#64748b;font-weight:600;">${formatCurrency(g.total)}</span>
                <span style="font-size:0.68rem;color:#94a3b8;">${pct}%</span>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

/** Renderiza tendencia de órdenes como visualización simplificada */
function renderOrdenesTrend(data) {
    const container = document.getElementById('chart-ordenes-trend');
    if (!container) return;

    // Mostrar un resumen visual de datos generales
    const kpis = data?.kpis || {};
    const finanzas = data?.finanzas || {};

    container.innerHTML = `
        <div class="w-100 p-3 text-center">
            <div class="row g-3 text-center">
                <div class="col-6 col-md-3">
                    <div style="font-size:1.5rem;font-weight:800;color:#0d9488;">${formatCurrency(finanzas.total_generado || 0)}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;margin-top:0.2rem;">Total Facturado</div>
                </div>
                <div class="col-6 col-md-3">
                    <div style="font-size:1.5rem;font-weight:800;color:#16a34a;">${formatCurrency(finanzas.total_abonos || 0)}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;margin-top:0.2rem;">Cobrado</div>
                </div>
                <div class="col-6 col-md-3">
                    <div style="font-size:1.5rem;font-weight:800;color:#dc2626;">${formatCurrency(finanzas.total_gastos || 0)}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;margin-top:0.2rem;">Gastos</div>
                </div>
                <div class="col-6 col-md-3">
                    <div style="font-size:1.5rem;font-weight:800;color:#6366f1;">${formatCurrency(finanzas.balance_neto || 0)}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;margin-top:0.2rem;">Balance Neto</div>
                </div>
            </div>
            <div class="mt-3" style="font-size:0.72rem;color:#94a3b8;">
                <i class="fa-solid fa-info-circle me-1"></i>Período: ${(data?.periodo?.tipo || 'dia').charAt(0).toUpperCase() + (data?.periodo?.tipo || 'dia').slice(1)} —
                Comisión estimada: ${formatCurrency(finanzas.comisiones_estimadas || 0)}
            </div>
        </div>`;
}

/** Configura el selector de período del dashboard */
function setupPeriodSelector() {
    const btns = document.querySelectorAll('.period-btn[data-period]');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDashboardPeriod = btn.dataset.period;
            loadDashboard();
        });
    });
}


// ============================================================
// MÓDULO DE ÓRDENES DE TRABAJO
// ============================================================

/** Carga la lista de órdenes */
async function loadOrdenes(filters = {}) {
    try {
        let url = '/api/admin/todas-ordenes?';
        const params = new URLSearchParams();

        if (filters.estado) params.set('estado', filters.estado);
        if (filters.patente) params.set('patente', filters.patente);
        if (filters.periodo) params.set('periodo', filters.periodo);
        if (filters.negocio_id) params.set('negocio_id', filters.negocio_id);
        else params.set('negocio_id', currentNegocioId);

        url += params.toString();

        const data = await apiFetch(url);
        if (data.success && data.data) {
            ordenesCache = data.data.ordenes || [];
            renderOrdenesTable(ordenesCache);
        }
    } catch (err) {
        console.error('Error cargando órdenes:', err);
        showToast('Error cargando órdenes', 'error');
    }
}

/** Renderiza la tabla de órdenes */
function renderOrdenesTable(ordenes) {
    const tbody = document.querySelector('#ordenes-table tbody');
    if (!tbody) return;

    if (!ordenes || ordenes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fa-solid fa-clipboard-list"></i>
                        <p>No hay órdenes de trabajo registradas</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = ordenes.map(o => {
        const estado = o.estado || 'enviada';
        const badgeClass = getEstadoBadgeClass(estado);
        const monto = o.monto_final || o.monto_base || o.monto_total || 0;
        const numero = o.numero_orden || o.id || '--';
        const fecha = formatDateTime(o.fecha_creacion || o.created_at || o.fecha);

        return `
            <tr>
                <td class="fw-600">#${numero}</td>
                <td><span class="fw-600" style="font-size:0.85rem;">${normalizePatente(o.patente || o.patente_placa || '')}</span></td>
                <td>${o.cliente_nombre || o.cliente_nombre_completo || '--'}</td>
                <td><span class="badge-estado ${badgeClass}">${translateEstado(estado)}</span></td>
                <td>${o.tecnico_nombre || 'Sin asignar'}</td>
                <td class="fw-600">${formatCurrency(monto)}</td>
                <td style="font-size:0.8rem;color:#64748b;">${fecha}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-icon-bf" title="Ver" onclick="verOrden(${o.id})">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="btn-icon-bf" title="Editar" onclick="editarOrden(${o.id})">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-icon-bf" title="PDF" onclick="generatePDF(${o.id})">
                            <i class="fa-solid fa-file-pdf"></i>
                        </button>
                        <button class="btn-icon-bf danger" title="Eliminar" onclick="eliminarOrden(${o.id})">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

/** Busca órdenes por patente */
function buscarPorPatente() {
    const patente = getVal('search-orden-patente');
    if (patente.length >= 2) {
        loadOrdenes({ patente });
    } else if (patente.length === 0) {
        loadOrdenes();
    }
}

/** Configura el modal para crear orden completa */
function setupCrearOrdenModal() {
    // Autocomplete de patente
    const patenteInput = document.getElementById('co-patente');
    const autocompleteDiv = document.getElementById('patente-autocomplete');

    if (patenteInput && autocompleteDiv) {
        let debounceTimer;

        patenteInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const val = normalizePatente(patenteInput.value);

            if (val.length < 2) {
                autocompleteDiv.style.display = 'none';
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const data = await apiFetch(`/api/admin/buscar-patente?patente=${encodeURIComponent(val)}&negocio_id=${currentNegocioId}`);
                    if (data.success && data.data) {
                        const results = [
                            ...(data.data.vehiculos || []),
                            ...(data.data.from_orders || []),
                        ];

                        if (results.length === 0) {
                            autocompleteDiv.style.display = 'none';
                            return;
                        }

                        autocompleteDiv.innerHTML = results.map(v => `
                            <div class="px-3 py-2" style="cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:0.85rem;"
                                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
                                <div class="fw-600">${normalizePatente(v.patente || v.patente_placa || '')}</div>
                                <div style="font-size:0.72rem;color:#64748b;">
                                    ${v.cliente_nombre || ''} ${v.marca ? '· ' + v.marca + ' ' + (v.modelo || '') : ''} ${v.total_ordenes ? '(' + v.total_ordenes + ' OT)' : ''}
                                </div>
                            </div>
                        `).join('');

                        autocompleteDiv.style.display = 'block';

                        // Evento click en resultados
                        autocompleteDiv.querySelectorAll('[onmouseover]').forEach(item => {
                            item.addEventListener('click', () => {
                                const pat = item.querySelector('.fw-600').textContent;
                                setVal('co-patente', pat);
                                autocompleteDiv.style.display = 'none';

                                // Llenar datos del vehículo si están disponibles
                                const result = results.find(r => normalizePatente(r.patente || r.patente_placa) === pat);
                                if (result) {
                                    if (result.cliente_nombre) setVal('co-cliente-nombre', result.cliente_nombre);
                                    if (result.cliente_telefono) setVal('co-cliente-tel', result.cliente_telefono);
                                    if (result.cliente_email) setVal('co-cliente-email', result.cliente_email);
                                    if (result.marca) setVal('co-vehiculo-marca', result.marca);
                                    if (result.modelo) setVal('co-vehiculo-modelo', result.modelo);
                                }
                            });
                        });
                    }
                } catch (err) {
                    console.error('Error autocomplete patente:', err);
                }
            }, 300);
        });

        // Cerrar autocomplete al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!patenteInput.contains(e.target) && !autocompleteDiv.contains(e.target)) {
                autocompleteDiv.style.display = 'none';
            }
        });

        // Enter para cerrar autocomplete
        patenteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                autocompleteDiv.style.display = 'none';
            }
        });
    }

    // Cargar catálogo de servicios al abrir modal
    const modalEl = document.getElementById('create-orden-modal');
    if (modalEl) {
        modalEl.addEventListener('show.bs.modal', async () => {
            await loadServiciosCatalogo();
            await loadTecnicosSelect('co-tecnico');

            // Establecer fecha por defecto
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            setVal('co-fecha', now.toISOString().slice(0, 16));
        });
    }
}

/** Carga el catálogo de servicios para el modal de crear orden */
async function loadServiciosCatalogo() {
    const container = document.getElementById('co-servicios-container');
    if (!container) return;

    try {
        const data = await apiFetch(`/api/admin/servicios-catalogo?negocio_id=${currentNegocioId}&incluir_inactivos=true`);
        if (data.success && data.data) {
            serviciosCatalogoCache = data.data;
            renderServiciosChecklist(container);
        } else {
            container.innerHTML = '<div class="text-center text-gray-400 py-3"><small>No hay servicios en el catálogo</small></div>';
        }
    } catch (err) {
        container.innerHTML = '<div class="text-center text-gray-400 py-3"><small>Error cargando servicios</small></div>';
    }
}

/** Renderiza el checklist de servicios en el modal */
function renderServiciosChecklist(container) {
    if (!serviciosCatalogoCache || serviciosCatalogoCache.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-3"><small>No hay servicios en el catálogo</small></div>';
        return;
    }

    container.innerHTML = serviciosCatalogoCache.map(s => `
        <div class="service-check-item" id="svc-item-${s.id}">
            <div class="d-flex align-items-center gap-2">
                <input class="form-check-input" type="checkbox" value="${s.id}"
                       data-nombre="${s.nombre || ''}" data-precio="${s.precio_sugerido || s.precio || 0}"
                       onchange="recalcularTotalOrden()">
                <label class="form-check-label" style="font-size:0.85rem;cursor:pointer;">
                    ${s.nombre || 'Servicio'}
                </label>
            </div>
            <span style="font-size:0.8rem;font-weight:600;color:#0d9488;">${formatCurrency(s.precio_sugerido || s.precio || 0)}</span>
        </div>
    `).join('');
}

/** Recalcula el total al seleccionar servicios */
function recalcularTotalOrden() {
    const checks = document.querySelectorAll('#co-servicios-container input[type="checkbox"]:checked');
    let total = 0;
    checks.forEach(chk => {
        total += parseFloat(chk.dataset.precio) || 0;
    });
    setVal('co-monto', total > 0 ? total.toFixed(2) : '');
}

/** Crea una nueva orden completa */
async function crearOrden() {
    const patente = getVal('co-patente');
    const clienteNombre = getVal('co-cliente-nombre');
    const clienteTel = getVal('co-cliente-tel');
    const clienteEmail = getVal('co-cliente-email');
    const marca = getVal('co-vehiculo-marca');
    const modelo = getVal('co-vehiculo-modelo');
    const anio = getVal('co-vehiculo-anio');
    const color = getVal('co-vehiculo-color');
    const monto = parseFloat(getVal('co-monto')) || 0;
    const abono = parseFloat(getVal('co-abono')) || 0;
    const metodoPago = getVal('co-metodo-pago');
    const tecnicoId = getVal('co-tecnico');
    const estado = getVal('co-estado');
    const notas = getVal('co-notas');

    if (!patente) {
        showToast('La patente es requerida', 'warning');
        return;
    }
    if (!clienteNombre) {
        showToast('El nombre del cliente es requerido', 'warning');
        return;
    }

    // Recopilar servicios seleccionados
    const servicios = [];
    const checks = document.querySelectorAll('#co-servicios-container input[type="checkbox"]:checked');
    checks.forEach(chk => {
        servicios.push({
            nombre: chk.dataset.nombre,
            precio: parseFloat(chk.dataset.precio) || 0,
        });
    });

    // Recopilar checklist
    const checklist = {};
    document.querySelectorAll('#create-orden-form .checklist-item input[type="checkbox"]').forEach(chk => {
        const key = chk.id.replace('co-chk-', '');
        checklist[key] = chk.checked;
    });

    try {
        const body = {
            patente,
            cliente_nombre: clienteNombre,
            cliente_telefono: clienteTel,
            cliente_email: clienteEmail,
            marca,
            modelo,
            anio: anio || null,
            color,
            monto_base: monto,
            abono,
            metodo_pago: metodoPago,
            notas,
            servicios,
            negocio_id: currentNegocioId,
            estado: estado || 'enviada',
            express: false,
            checklist,
        };

        if (tecnicoId) {
            body.tecnico_asignado_id = parseInt(tecnicoId);
        }

        const data = await apiFetch('/api/admin/crear-orden', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        if (data.success) {
            showToast('Orden creada exitosamente', 'success');
            hideModal('create-orden-modal');
            // Limpiar formulario
            document.getElementById('create-orden-form').reset();
            recalcularTotalOrden();
            loadOrdenes();
        } else {
            showToast(data.error || 'Error creando orden', 'error');
        }
    } catch (err) {
        showToast('Error creando orden: ' + err.message, 'error');
    }
}

/** Configura el modal OT Express */
function setupExpressOrdenModal() {
    // Establecer fecha por defecto al abrir
    const modalEl = document.getElementById('express-orden-modal');
    if (modalEl) {
        modalEl.addEventListener('show.bs.modal', () => {
            document.getElementById('express-orden-form').reset();
        });
    }
}

/** Crea una orden express (rápida) */
async function crearOrdenExpress() {
    const patente = getVal('eo-patente');
    const cliente = getVal('eo-cliente');
    const telefono = getVal('eo-telefono');
    const servicio = getVal('eo-servicio');
    const monto = parseFloat(getVal('eo-monto')) || 0;
    const metodoPago = getVal('eo-metodo-pago');

    if (!patente || !cliente || !servicio) {
        showToast('Patente, cliente y servicio son requeridos', 'warning');
        return;
    }

    try {
        const body = {
            patente,
            cliente_nombre: cliente,
            cliente_telefono: telefono,
            monto_base: monto,
            metodo_pago,
            servicios: [{ nombre: servicio, precio: monto }],
            negocio_id: currentNegocioId,
            express: true,
        };

        const data = await apiFetch('/api/admin/crear-orden', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        if (data.success) {
            showToast('OT Express creada exitosamente', 'success');
            hideModal('express-orden-modal');
            document.getElementById('express-orden-form').reset();
            loadOrdenes();
        } else {
            showToast(data.error || 'Error creando orden', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Muestra el detalle de una orden en el modal */
async function verOrden(ordenId) {
    try {
        // Buscar en caché primero
        let orden = ordenesCache.find(o => o.id === ordenId);

        if (!orden) {
            const data = await apiFetch(`/api/admin/todas-ordenes?negocio_id=${currentNegocioId}`);
            if (data.success && data.data) {
                ordenesCache = data.data.ordenes || [];
                orden = ordenesCache.find(o => o.id === ordenId);
            }
        }

        if (!orden) {
            showToast('Orden no encontrada', 'error');
            return;
        }

        // Llenar datos en el modal
        const estado = orden.estado || 'enviada';
        const badgeClass = getEstadoBadgeClass(estado);
        const monto = orden.monto_final || orden.monto_base || orden.monto_total || 0;

        setText('vo-numero', '#' + (orden.numero_orden || orden.id));
        document.getElementById('vo-estado').textContent = translateEstado(estado);
        document.getElementById('vo-estado').className = 'badge-estado ' + badgeClass;
        setText('vo-fecha', formatDateTime(orden.fecha_creacion || orden.created_at));
        setText('vo-monto', formatCurrency(monto));
        setText('vo-cliente-nombre', orden.cliente_nombre || orden.cliente_nombre_completo || '--');
        setText('vo-cliente-tel', orden.cliente_telefono || '--');
        setText('vo-cliente-email', orden.cliente_email || '--');
        setText('vo-patente', normalizePatente(orden.patente || orden.patente_placa || ''));
        setText('vo-vehiculo', (orden.marca || '') + ' ' + (orden.modelo || '--'));
        setText('vo-anio', orden.anio || '--');
        setText('vo-color', orden.color || '--');
        setText('vo-tecnico', orden.tecnico_nombre || 'Sin asignar');
        setText('vo-notas', orden.notas || 'Sin notas adicionales');

        // Servicios
        const servicios = orden.servicios || [];
        if (servicios.length > 0) {
            setHTML('vo-servicios', servicios.map(s => `
                <div class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid #f1f5f9;">
                    <span style="font-size:0.85rem;">${s.nombre_servicio || s.nombre || 'Servicio'}</span>
                    <span class="fw-600" style="font-size:0.85rem;color:#0d9488;">${formatCurrency(s.precio)}</span>
                </div>
            `).join(''));
        } else {
            setHTML('vo-servicios', '<p class="text-gray-400 mb-0" style="font-size:0.85rem;">Sin servicios registrados</p>');
        }

        // Checklist
        const checkItems = [
            { key: 'combustible', label: 'Combustible' },
            { key: 'carroceria', label: 'Carrocería' },
            { key: 'neumaticos', label: 'Neumáticos' },
            { key: 'tablero', label: 'Tablero / Luces' },
            { key: 'interior', label: 'Interior' },
            { key: 'aceite', label: 'Aceite' },
        ];
        const checklist = orden.checklist || orden.diagnostico_checks || {};
        setHTML('vo-checklist', checkItems.map(item => {
            const checked = checklist[item.key];
            return `
                <div class="checklist-item">
                    <i class="fa-solid ${checked ? 'fa-square-check text-success' : 'fa-square text-gray-300'}" style="font-size:1rem;"></i>
                    <span style="font-size:0.85rem;">${item.label}</span>
                </div>`;
        }).join(''));

        // Costos adicionales
        setHTML('vo-costos', '<p class="text-gray-400 mb-0" style="font-size:0.85rem;">Sin costos adicionales</p>');

        // Firma
        const firma = orden.firma_imagen;
        if (firma) {
            setHTML('vo-firma', `<img src="${firma}" alt="Firma" style="max-height:100px;object-fit:contain;">`);
        } else {
            setHTML('vo-firma', '<i class="fa-solid fa-signature" style="font-size:1.5rem;color:#cbd5e1;"></i>');
        }

        showModal('view-orden-modal');
    } catch (err) {
        showToast('Error cargando orden: ' + err.message, 'error');
    }
}

/** Abre el modal para editar una orden */
async function editarOrden(ordenId) {
    try {
        // Buscar en caché
        let orden = ordenesCache.find(o => o.id === ordenId);
        if (!orden) {
            const data = await apiFetch(`/api/admin/todas-ordenes?negocio_id=${currentNegocioId}`);
            if (data.success && data.data) {
                ordenesCache = data.data.ordenes || [];
                orden = ordenesCache.find(o => o.id === ordenId);
            }
        }

        if (!orden) {
            showToast('Orden no encontrada', 'error');
            return;
        }

        // Cargar técnicos para el select
        await loadTecnicosSelect('eo2-tecnico');

        // Llenar formulario
        setVal('eo2-id', orden.id);
        setText('eo2-numero', '#' + (orden.numero_orden || orden.id));
        setVal('eo2-patente', normalizePatente(orden.patente || orden.patente_placa || ''));
        setVal('eo2-estado', orden.estado || 'enviada');
        setVal('eo2-tecnico', orden.tecnico_asignado_id || '');
        setVal('eo2-metodo-pago', orden.metodo_pago || 'efectivo');
        setVal('eo2-cliente', orden.cliente_nombre || orden.cliente_nombre_completo || '');
        setVal('eo2-telefono', orden.cliente_telefono || '');
        setVal('eo2-email', orden.cliente_email || '');
        setVal('eo2-marca', orden.marca || '');
        setVal('eo2-modelo', orden.modelo || '');
        setVal('eo2-anio', orden.anio || '');
        setVal('eo2-color', orden.color || '');
        setVal('eo2-monto', orden.monto_final || orden.monto_base || orden.monto_total || '');
        setVal('eo2-abono', orden.abono || orden.monto_abono || 0);
        setVal('eo2-notas', orden.notas || '');

        showModal('edit-orden-modal');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Guarda la edición de una orden */
async function guardarEdicionOrden() {
    const id = parseInt(getVal('eo2-id'));
    if (!id) {
        showToast('ID de orden no válido', 'error');
        return;
    }

    try {
        const body = {
            id,
            patente: getVal('eo2-patente'),
            estado: getVal('eo2-estado'),
            tecnico_asignado_id: getVal('eo2-tecnico') ? parseInt(getVal('eo2-tecnico')) : null,
            metodo_pago: getVal('eo2-metodo-pago'),
            cliente_nombre: getVal('eo2-cliente'),
            cliente_telefono: getVal('eo2-telefono'),
            cliente_email: getVal('eo2-email'),
            marca: getVal('eo2-marca'),
            modelo: getVal('eo2-modelo'),
            anio: getVal('eo2-anio') ? parseInt(getVal('eo2-anio')) : null,
            color: getVal('eo2-color'),
            monto_final: parseFloat(getVal('eo2-monto')) || 0,
            abono: parseFloat(getVal('eo2-abono')) || 0,
            notas: getVal('eo2-notas'),
        };

        const data = await apiFetch('/api/admin/editar-orden', {
            method: 'PUT',
            body: JSON.stringify(body),
        });

        if (data.success) {
            showToast('Orden actualizada exitosamente', 'success');
            hideModal('edit-orden-modal');
            loadOrdenes();
        } else {
            showToast(data.error || 'Error actualizando orden', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Elimina una orden con confirmación */
function eliminarOrden(ordenId) {
    confirmAction('¿Está seguro de que desea eliminar esta orden? Esta acción no se puede deshacer.', async () => {
        try {
            const data = await apiFetch(`/api/admin/eliminar-orden?id=${ordenId}`, {
                method: 'DELETE',
            });

            if (data.success) {
                showToast('Orden eliminada', 'success');
                loadOrdenes();
            } else {
                showToast(data.error || 'Error eliminando orden', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });
}

/** Filtra órdenes por estado */
function filtrarOrdenes(estado) {
    loadOrdenes({ estado: estado || '' });
}

/** Configura la búsqueda de patente */
function setupSearchOrden() {
    const input = document.getElementById('search-orden-patente');
    if (!input) return;

    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => buscarPorPatente(), 400);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscarPorPatente();
        }
    });
}


// ============================================================
// MÓDULO DE TÉCNICOS
// ============================================================

/** Carga la lista de técnicos */
async function loadTecnicos() {
    try {
        const data = await apiFetch(`/api/admin/tecnicos?negocio_id=${currentNegocioId}&incluir_inactivos=true`);
        if (data.success && data.data) {
            tecnicosCache = data.data;
            renderTecnicosTable(tecnicosCache);
        }
    } catch (err) {
        console.error('Error cargando técnicos:', err);
        showToast('Error cargando técnicos', 'error');
    }
}

/** Renderiza la tabla de técnicos */
function renderTecnicosTable(tecnicos) {
    const tbody = document.querySelector('#tecnicos-table tbody');
    if (!tbody) return;

    if (!tecnicos || tecnicos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <i class="fa-solid fa-users-gear"></i>
                        <p>No hay técnicos registrados</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = tecnicos.map(t => {
        const activo = t.activo !== 0 && t.activo !== false;
        const estadoBadge = activo
            ? '<span class="badge-estado badge-aprobada">Activo</span>'
            : '<span class="badge-estado badge-cancelada">Inactivo</span>';

        return `
            <tr>
                <td class="fw-600">${t.nombre || '--'}</td>
                <td>${t.telefono || '--'}</td>
                <td>${t.email || '--'}</td>
                <td>${t.pin ? '••••' : '--'}</td>
                <td>${t.comision_porcentaje || 10}%</td>
                <td>${estadoBadge}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-icon-bf" title="Editar" onclick="editarTecnico(${t.id})">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-icon-bf" title="${activo ? 'Desactivar' : 'Activar'}" onclick="toggleTecnico(${t.id}, ${!activo})">
                            <i class="fa-solid ${activo ? 'fa-user-slash' : 'fa-user-check'}"></i>
                        </button>
                        <button class="btn-icon-bf danger" title="Eliminar" onclick="eliminarTecnico(${t.id})">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

/** Crea un nuevo técnico */
async function crearTecnico() {
    const nombre = getVal('ct-nombre');
    const telefono = getVal('ct-telefono');
    const email = getVal('ct-email');
    const pin = getVal('ct-pin');
    const comision = parseFloat(getVal('ct-comision')) || 10;
    const especialidad = getVal('ct-especialidad');

    if (!nombre) {
        showToast('El nombre es requerido', 'warning');
        return;
    }
    if (!telefono) {
        showToast('El teléfono es requerido', 'warning');
        return;
    }

    try {
        const data = await apiFetch('/api/admin/tecnicos', {
            method: 'POST',
            body: JSON.stringify({
                nombre,
                telefono,
                email,
                pin,
                comision_porcentaje: comision,
                especialidad,
                negocio_id: currentNegocioId,
            }),
        });

        if (data.success) {
            showToast('Técnico creado exitosamente', 'success');
            hideModal('create-tecnico-modal');
            document.getElementById('ct-nombre').value = '';
            document.getElementById('ct-telefono').value = '';
            document.getElementById('ct-email').value = '';
            document.getElementById('ct-pin').value = '';
            document.getElementById('ct-comision').value = '10';
            document.getElementById('ct-especialidad').value = '';
            loadTecnicos();
        } else {
            showToast(data.error || 'Error creando técnico', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Abre el modal para editar un técnico */
function editarTecnico(id) {
    const tecnico = tecnicosCache.find(t => t.id === id);
    if (!tecnico) {
        showToast('Técnico no encontrado', 'error');
        return;
    }

    setVal('et-id', tecnico.id);
    setVal('et-nombre', tecnico.nombre || '');
    setVal('et-telefono', tecnico.telefono || '');
    setVal('et-email', tecnico.email || '');
    setVal('et-pin', ''); // No mostrar PIN por seguridad
    setVal('et-comision', tecnico.comision_porcentaje || 10);
    setVal('et-especialidad', tecnico.especialidad || '');
    setVal('et-estado', (tecnico.activo !== 0 && tecnico.activo !== false) ? 'activo' : 'inactivo');

    showModal('edit-tecnico-modal');
}

/** Guarda la edición de un técnico */
async function guardarEdicionTecnico() {
    const id = parseInt(getVal('et-id'));
    if (!id) return;

    try {
        const body = {
            id,
            nombre: getVal('et-nombre'),
            telefono: getVal('et-telefono'),
            email: getVal('et-email'),
            comision_porcentaje: parseFloat(getVal('et-comision')) || 10,
            especialidad: getVal('et-especialidad'),
            activo: getVal('et-estado') !== 'inactivo',
        };

        const pin = getVal('et-pin');
        if (pin) body.pin = pin;

        const data = await apiFetch('/api/admin/tecnicos', {
            method: 'PUT',
            body: JSON.stringify(body),
        });

        if (data.success) {
            showToast('Técnico actualizado', 'success');
            hideModal('edit-tecnico-modal');
            loadTecnicos();
        } else {
            showToast(data.error || 'Error actualizando técnico', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Elimina un técnico */
function eliminarTecnico(id) {
    confirmAction('¿Está seguro de eliminar este técnico?', async () => {
        try {
            const data = await apiFetch(`/api/admin/tecnicos?id=${id}`, {
                method: 'DELETE',
            });

            if (data.success) {
                showToast('Técnico eliminado', 'success');
                loadTecnicos();
            } else {
                showToast(data.error || 'Error eliminando técnico', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });
}

/** Activa/desactiva un técnico */
async function toggleTecnico(id, activo) {
    try {
        const data = await apiFetch('/api/admin/tecnicos', {
            method: 'PUT',
            body: JSON.stringify({ id, activo }),
        });

        if (data.success) {
            showToast(activo ? 'Técnico activado' : 'Técnico desactivado', 'success');
            loadTecnicos();
        } else {
            showToast(data.error || 'Error cambiando estado', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Carga órdenes disponibles para asignar */
async function loadOrdenesDisponibles() {
    try {
        const data = await apiFetch(`/api/admin/ordenes-disponibles?negocio_id=${currentNegocioId}`);
        if (data.success && data.data) {
            const select = document.getElementById('assign-orden-select');
            if (select) {
                select.innerHTML = '<option value="">-- Seleccionar --</option>' +
                    (data.data || []).map(o => `
                        <option value="${o.id}">#${o.numero_orden || o.id} - ${normalizePatente(o.patente || o.patente_placa || '')} - ${o.cliente_nombre || ''}</option>
                    `).join('');
            }
        }

        // Cargar técnicos para asignar
        await loadTecnicosSelect('assign-tecnico-select');
    } catch (err) {
        console.error('Error cargando órdenes disponibles:', err);
    }
}

/** Carga técnicos en un select dado */
async function loadTecnicosSelect(selectId) {
    try {
        if (tecnicosCache.length === 0) {
            const data = await apiFetch(`/api/admin/tecnicos?negocio_id=${currentNegocioId}`);
            if (data.success && data.data) {
                tecnicosCache = data.data;
            }
        }

        const select = document.getElementById(selectId);
        if (!select) return;

        const currentValue = select.value;
        const activeTecnicos = tecnicosCache.filter(t => t.activo !== 0 && t.activo !== false);

        select.innerHTML = '<option value="">Sin asignar</option>' +
            activeTecnicos.map(t => `
                <option value="${t.id}">${t.nombre}</option>
            `).join('');

        // Restaurar valor previo si existe
        if (currentValue) select.value = currentValue;
    } catch (err) {
        console.error('Error cargando técnicos:', err);
    }
}

/** Asigna una orden a un técnico (desde la sección inline) */
async function assignOrden() {
    const tecnicoId = getVal('assign-tecnico-select');
    const ordenId = getVal('assign-orden-select');

    if (!tecnicoId || !ordenId) {
        showToast('Seleccione técnico y orden', 'warning');
        return;
    }

    try {
        const data = await apiFetch('/api/admin/asignar-orden', {
            method: 'POST',
            body: JSON.stringify({
                orden_id: parseInt(ordenId),
                tecnico_id: parseInt(tecnicoId),
                negocio_id: currentNegocioId,
            }),
        });

        if (data.success) {
            showToast('Orden asignada al técnico', 'success');
            setVal('assign-tecnico-select', '');
            setVal('assign-orden-select', '');
            loadOrdenes();
        } else {
            showToast(data.error || 'Error asignando orden', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Confirma asignación desde modal */
async function confirmarAsignacion() {
    const ordenId = getVal('ao-orden-id');
    const tecnicoId = getVal('ao-tecnico');

    if (!ordenId || !tecnicoId) {
        showToast('Seleccione un técnico', 'warning');
        return;
    }

    try {
        const data = await apiFetch('/api/admin/asignar-orden', {
            method: 'POST',
            body: JSON.stringify({
                orden_id: parseInt(ordenId),
                tecnico_id: parseInt(tecnicoId),
                negocio_id: currentNegocioId,
            }),
        });

        if (data.success) {
            showToast('Orden asignada exitosamente', 'success');
            hideModal('assign-orden-modal');
            loadOrdenes();
        } else {
            showToast(data.error || 'Error asignando orden', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}


// ============================================================
// MÓDULO DE SERVICIOS
// ============================================================

/** Carga el catálogo de servicios */
async function loadServicios() {
    try {
        const data = await apiFetch(`/api/admin/servicios-catalogo?negocio_id=${currentNegocioId}&incluir_inactivos=true`);
        if (data.success && data.data) {
            serviciosCatalogoCache = data.data;
            renderServiciosTable(serviciosCatalogoCache);
        }
    } catch (err) {
        console.error('Error cargando servicios:', err);
        showToast('Error cargando servicios', 'error');
    }
}

/** Renderiza la tabla de servicios */
function renderServiciosTable(servicios) {
    const tbody = document.querySelector('#servicios-table tbody');
    if (!tbody) return;

    if (!servicios || servicios.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fa-solid fa-wrench"></i>
                        <p>No hay servicios registrados</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = servicios.map(s => {
        const activo = s.activo !== 0 && s.activo !== false;
        return `
            <tr>
                <td class="fw-600">${s.nombre || '--'}</td>
                <td>${translateServicioCategoria(s.categoria)}</td>
                <td class="fw-600">${formatCurrency(s.precio_sugerido || s.precio || 0)}</td>
                <td>${s.duracion || s.tipo_comision || '--'}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${s.descripcion || ''}">${s.descripcion || '--'}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-icon-bf" title="${activo ? 'Desactivar' : 'Activar'}" onclick="toggleServicio(${s.id}, ${!activo})">
                            <i class="fa-solid ${activo ? 'fa-toggle-on text-success' : 'fa-toggle-off text-gray-400'}"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

/** Crea un nuevo servicio */
async function crearServicio() {
    const nombre = getVal('cs-nombre');
    const categoria = getVal('cs-categoria');
    const precio = parseFloat(getVal('cs-precio')) || 0;
    const duracion = getVal('cs-duracion');
    const descripcion = getVal('cs-descripcion');

    if (!nombre) {
        showToast('El nombre del servicio es requerido', 'warning');
        return;
    }

    try {
        const data = await apiFetch('/api/admin/servicios-catalogo', {
            method: 'POST',
            body: JSON.stringify({
                nombre,
                categoria,
                precio_sugerido: precio,
                duracion,
                descripcion,
                negocio_id: currentNegocioId,
            }),
        });

        if (data.success) {
            showToast('Servicio creado exitosamente', 'success');
            hideModal('create-servicio-modal');
            document.getElementById('cs-nombre').value = '';
            document.getElementById('cs-precio').value = '';
            document.getElementById('cs-duracion').value = '';
            document.getElementById('cs-descripcion').value = '';
            loadServicios();
        } else {
            showToast(data.error || 'Error creando servicio', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Activa/desactiva un servicio */
async function toggleServicio(id, activo) {
    try {
        const data = await apiFetch('/api/admin/servicios-catalogo', {
            method: 'PUT',
            body: JSON.stringify({ id, activo }),
        });

        if (data.success) {
            showToast(activo ? 'Servicio activado' : 'Servicio desactivado', 'success');
            loadServicios();
        } else {
            showToast(data.error || 'Error actualizando servicio', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}


// ============================================================
// MÓDULO DE MODELOS DE VEHÍCULOS
// ============================================================

/** Carga los modelos de vehículos */
async function loadModelos() {
    try {
        const data = await apiFetch(`/api/admin/modelos-vehiculo?negocio_id=${currentNegocioId}`);
        if (data.success && data.data) {
            renderModelosTable(data.data);
        }
    } catch (err) {
        console.error('Error cargando modelos:', err);
        showToast('Error cargando modelos', 'error');
    }
}

/** Renderiza la tabla de modelos */
function renderModelosTable(modelos) {
    const tbody = document.querySelector('#modelos-table tbody');
    if (!tbody) return;

    if (!modelos || modelos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <i class="fa-solid fa-car"></i>
                        <p>No hay modelos de vehículos registrados</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = modelos.map(m => `
        <tr>
            <td class="fw-600">${m.marca || m.nombre || '--'}</td>
            <td>${m.modelo || '--'}</td>
            <td>${m.anio || '--'}</td>
            <td>${translateTipoVehiculo(m.tipo)}</td>
            <td>
                <button class="btn-icon-bf danger" title="Eliminar" onclick="eliminarModelo(${m.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

/** Traduce tipo de vehículo */
function translateTipoVehiculo(tipo) {
    const map = {
        'auto': 'Automóvil',
        'suv': 'SUV',
        'camioneta': 'Camioneta',
        'camion': 'Camión',
        'moto': 'Motocicleta',
        'van': 'Van / Minivan',
    };
    return map[tipo] || tipo || '--';
}

/** Crea un nuevo modelo */
async function crearModelo() {
    const marca = getVal('cm-marca');
    const modelo = getVal('cm-modelo');
    const anio = getVal('cm-anio');
    const tipo = getVal('cm-tipo');

    if (!marca || !modelo) {
        showToast('Marca y modelo son requeridos', 'warning');
        return;
    }

    try {
        const data = await apiFetch('/api/admin/modelos-vehiculo', {
            method: 'POST',
            body: JSON.stringify({
                nombre: `${marca} ${modelo}`,
                marca,
                modelo,
                anio: anio ? parseInt(anio) : null,
                tipo,
                negocio_id: currentNegocioId,
            }),
        });

        if (data.success) {
            showToast('Modelo creado exitosamente', 'success');
            hideModal('create-modelo-modal');
            document.getElementById('cm-marca').value = '';
            document.getElementById('cm-modelo').value = '';
            document.getElementById('cm-anio').value = '';
            loadModelos();
        } else {
            showToast(data.error || 'Error creando modelo', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Elimina un modelo */
function eliminarModelo(id) {
    confirmAction('¿Eliminar este modelo de vehículo?', async () => {
        try {
            const data = await apiFetch(`/api/admin/modelos-vehiculo?id=${id}`, {
                method: 'DELETE',
            });

            if (data.success) {
                showToast('Modelo eliminado', 'success');
                loadModelos();
            } else {
                showToast(data.error || 'Error eliminando modelo', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });
}


// ============================================================
// MÓDULO DE COSTOS ADICIONALES
// ============================================================

/** Inicializa la sección de costos */
async function loadCostosSection() {
    // Cargar órdenes en el select
    try {
        const data = await apiFetch(`/api/admin/todas-ordenes?negocio_id=${currentNegocioId}`);
        if (data.success && data.data) {
            const select = document.getElementById('costo-orden-select');
            if (select) {
                select.innerHTML = '<option value="">-- Seleccionar Orden --</option>' +
                    (data.data.ordenes || []).map(o => `
                        <option value="${o.id}">#${o.numero_orden || o.id} - ${normalizePatente(o.patente || o.patente_placa || '')}</option>
                    `).join('');
            }
        }
    } catch (err) {
        console.error('Error cargando órdenes para costos:', err);
    }

    // Cargar costos si ya hay orden seleccionada
    const selectedOrden = getVal('costo-orden-select');
    if (selectedOrden) {
        await loadCostosPorOrden(selectedOrden);
    }
}

/** Carga costos adicionales de una orden */
async function loadCostosPorOrden(ordenId) {
    if (!ordenId) return;

    try {
        const data = await apiFetch(`/api/admin/costos-adicionales?orden_id=${ordenId}&negocio_id=${currentNegocioId}`);
        if (data.success && data.data) {
            renderCostosTable(data.data);
        }
    } catch (err) {
        console.error('Error cargando costos:', err);
    }
}

/** Renderiza la tabla de costos */
function renderCostosTable(costos) {
    const tbody = document.querySelector('#costos-table tbody');
    if (!tbody) return;

    if (!costos || costos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fa-solid fa-calculator"></i>
                        <p>No hay costos registrados</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = costos.map(c => `
        <tr>
            <td>#${c.orden_id || '--'}</td>
            <td>${c.tipo || c.categoria || '--'}</td>
            <td>${c.descripcion || c.concepto || '--'}</td>
            <td class="fw-600">${formatCurrency(c.monto)}</td>
            <td style="font-size:0.8rem;color:#64748b;">${formatDate(c.fecha_registro || c.created_at)}</td>
            <td>
                <button class="btn-icon-bf danger" title="Eliminar" onclick="eliminarCosto(${c.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

/** Agrega un costo adicional */
async function agregarCosto() {
    const ordenId = getVal('costo-orden-select');
    const tipo = getVal('costo-tipo');
    const descripcion = getVal('costo-descripcion');
    const monto = parseFloat(getVal('costo-monto')) || 0;

    if (!ordenId) {
        showToast('Seleccione una orden', 'warning');
        return;
    }
    if (!descripcion) {
        showToast('La descripción es requerida', 'warning');
        return;
    }
    if (monto <= 0) {
        showToast('El monto debe ser mayor a 0', 'warning');
        return;
    }

    try {
        const data = await apiFetch('/api/admin/costos-adicionales', {
            method: 'POST',
            body: JSON.stringify({
                orden_id: parseInt(ordenId),
                tipo,
                descripcion,
                monto,
                negocio_id: currentNegocioId,
            }),
        });

        if (data.success) {
            showToast('Costo agregado exitosamente', 'success');
            setVal('costo-descripcion', '');
            setVal('costo-monto', '');
            loadCostosPorOrden(ordenId);
        } else {
            showToast(data.error || 'Error agregando costo', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Elimina un costo adicional */
function eliminarCosto(id) {
    confirmAction('¿Eliminar este costo?', async () => {
        try {
            const data = await apiFetch(`/api/admin/costos-adicionales?id=${id}`, {
                method: 'DELETE',
            });

            if (data.success) {
                showToast('Costo eliminado', 'success');
                const ordenId = getVal('costo-orden-select');
                if (ordenId) loadCostosPorOrden(ordenId);
            } else {
                showToast(data.error || 'Error eliminando costo', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });
}


// ============================================================
// MÓDULO DE GASTOS
// ============================================================

/** Carga los gastos del negocio */
async function loadGastos() {
    try {
        const data = await apiFetch(`/api/admin/gastos?negocio_id=${currentNegocioId}`);
        if (data.success && data.data) {
            const gastos = Array.isArray(data.data) ? data.data : [];
            renderGastosTable(gastos);
            renderGastosSummary(gastos);
        }
    } catch (err) {
        console.error('Error cargando gastos:', err);
        showToast('Error cargando gastos', 'error');
    }
}

/** Renderiza la tabla de gastos */
function renderGastosTable(gastos) {
    const tbody = document.querySelector('#gastos-table tbody');
    if (!tbody) return;

    if (!gastos || gastos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fa-solid fa-money-bill-trend-up"></i>
                        <p>No hay gastos registrados</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = gastos.map(g => `
        <tr>
            <td style="font-size:0.8rem;">${formatDate(g.fecha_gasto || g.fecha)}</td>
            <td>${translateCategoria(g.categoria)}</td>
            <td>${g.descripcion || g.concepto || '--'}</td>
            <td class="fw-600">${formatCurrency(g.monto)}</td>
            <td style="font-size:0.75rem;color:#94a3b8;">${g.comprobante || '--'}</td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn-icon-bf danger" title="Eliminar" onclick="eliminarGasto(${g.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

/** Renderiza el resumen de gastos en las tarjetas KPI */
function renderGastosSummary(gastos) {
    const now = new Date();
    const mesActual = now.getMonth();
    const anioActual = now.getFullYear();

    let totalMes = 0, alquiler = 0, servicios = 0, transporte = 0;

    (gastos || []).forEach(g => {
        const fecha = new Date(g.fecha_gasto || g.fecha_registro || g.fecha);
        if (fecha.getMonth() === mesActual && fecha.getFullYear() === anioActual) {
            totalMes += g.monto || 0;
        }

        const cat = (g.categoria || '').toLowerCase();
        if (cat === 'alquiler') alquiler += g.monto || 0;
        else if (cat === 'servicios') servicios += g.monto || 0;
        else if (cat === 'transporte') transporte += g.monto || 0;
    });

    setText('gastos-total-mes', formatCurrency(totalMes));
    setText('gastos-alquiler', formatCurrency(alquiler));
    setText('gastos-servicios', formatCurrency(servicios));
    setText('gastos-transporte', formatCurrency(transporte));
}

/** Crea un nuevo gasto */
async function crearGasto() {
    const fecha = getVal('cg-fecha') || getTodayISO();
    const categoria = getVal('cg-categoria');
    const descripcion = getVal('cg-descripcion');
    const monto = parseFloat(getVal('cg-monto')) || 0;

    if (!descripcion) {
        showToast('La descripción es requerida', 'warning');
        return;
    }
    if (monto <= 0) {
        showToast('El monto debe ser mayor a 0', 'warning');
        return;
    }

    try {
        const data = await apiFetch('/api/admin/gastos', {
            method: 'POST',
            body: JSON.stringify({
                fecha_gasto: fecha,
                categoria,
                descripcion,
                monto,
                negocio_id: currentNegocioId,
            }),
        });

        if (data.success) {
            showToast('Gasto registrado exitosamente', 'success');
            hideModal('create-gasto-modal');
            setVal('cg-descripcion', '');
            setVal('cg-monto', '');
            loadGastos();
        } else {
            showToast(data.error || 'Error registrando gasto', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Elimina un gasto */
function eliminarGasto(id) {
    confirmAction('¿Eliminar este gasto?', async () => {
        try {
            const data = await apiFetch(`/api/admin/gastos?id=${id}`, {
                method: 'DELETE',
            });

            if (data.success) {
                showToast('Gasto eliminado', 'success');
                loadGastos();
            } else {
                showToast(data.error || 'Error eliminando gasto', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });
}


// ============================================================
// MÓDULO DE LIQUIDACIONES
// ============================================================

/** Calcula y carga liquidaciones */
async function calcularLiquidaciones() {
    const periodo = getVal('liq-periodo') || 'mes';

    try {
        const data = await apiFetch(`/api/admin/liquidar-tecnicos?periodo=${periodo}&negocio_id=${currentNegocioId}`);
        if (data.success && data.data) {
            renderLiquidacionTable(data.data);
        }
    } catch (err) {
        console.error('Error cargando liquidaciones:', err);
        showToast('Error calculando liquidaciones', 'error');
    }
}

/** Renderiza la tabla de liquidaciones */
function renderLiquidacionTable(liquidaciones) {
    const tbody = document.querySelector('#liquidaciones-table tbody');
    if (!tbody) return;

    if (!liquidaciones || (Array.isArray(liquidaciones) && liquidaciones.length === 0)) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <i class="fa-solid fa-file-invoice-dollar"></i>
                        <p>Seleccione un período y calcule liquidaciones</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    // Puede ser un array o un objeto con propiedades
    const items = Array.isArray(liquidaciones) ? liquidaciones : Object.values(liquidaciones);

    tbody.innerHTML = items.map(l => {
        const completadas = l.ordenes_completadas || l.ordenes_cerradas || 0;
        const totalFacturado = l.total_facturado || l.facturado || 0;
        const comisionPct = l.comision_porcentaje || l.comision || 10;
        const montoComision = l.monto_comision || (totalFacturado * comisionPct / 100);

        return `
            <tr>
                <td class="fw-600">${l.nombre || '--'}</td>
                <td>${completadas}</td>
                <td class="fw-600">${formatCurrency(totalFacturado)}</td>
                <td>${comisionPct}%</td>
                <td class="fw-600" style="color:#0d9488;">${formatCurrency(montoComision)}</td>
                <td><span class="badge-estado badge-aprobada">Pendiente</span></td>
                <td>
                    <button class="btn-icon-bf" title="Ver detalle" onclick="showToast('Detalle de liquidación: ${l.nombre}', 'info')">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
}


// ============================================================
// MÓDULO DE RESUMEN DE PAGOS
// ============================================================

/** Carga el resumen de pagos */
async function loadResumenPagos() {
    const periodo = getVal('pago-periodo') || 'mes';

    try {
        const data = await apiFetch(`/api/admin/resumen-pagos?periodo=${periodo}&negocio_id=${currentNegocioId}`);
        if (data.success && data.data) {
            renderPaymentCards(data.data);
        }
    } catch (err) {
        console.error('Error cargando resumen de pagos:', err);
        showToast('Error cargando resumen de pagos', 'error');
    }
}

/** Renderiza las tarjetas de métodos de pago */
function renderPaymentCards(pagos) {
    const metodos = pagos.distribucion_metodo_pago || pagos.metodos || [];

    // Inicializar totales en 0
    const totales = {
        efectivo: 0,
        tarjeta: 0,
        transferencia: 0,
        mercado_pago: 0,
        deposito: 0,
        cta_cte: 0,
    };

    // Acumular por método
    (metodos || []).forEach(m => {
        const metodo = (m.metodo || '').toLowerCase();
        totales[metodo] = (totales[metodo] || 0) + (m.total || 0);
    });

    setText('pago-efectivo', formatCurrency(totales.efectivo));
    setText('pago-tarjeta', formatCurrency(totales.tarjeta));
    setText('pago-transferencia', formatCurrency(totales.transferencia));
    setText('pago-mercado-pago', formatCurrency(totales.mercado_pago));
    setText('pago-deposito', formatCurrency(totales.deposito));
    setText('pago-cta-cte', formatCurrency(totales.cta_cte));

    // Renderizar distribución en el chart placeholder
    const container = document.getElementById('chart-pagos-dist');
    if (container) {
        const total = Object.values(totales).reduce((s, v) => s + v, 0);
        if (total === 0) {
            container.innerHTML = `
                <div class="text-center w-100">
                    <i class="fa-solid fa-chart-pie d-block mb-2" style="font-size:1.5rem;color:#cbd5e1;"></i>
                    <span class="text-gray-400" style="font-size:0.8rem;">Sin pagos en este período</span>
                </div>`;
        } else {
            const colors = ['#16a34a', '#2563eb', '#d97706', '#9333ea', '#0d9488', '#dc2626'];
            const labels = ['Efectivo', 'Tarjeta', 'Transferencia', 'MercadoPago', 'Depósito', 'Cta. Cte.'];
            const keys = ['efectivo', 'tarjeta', 'transferencia', 'mercado_pago', 'deposito', 'cta_cte'];

            container.innerHTML = '<div class="w-100 p-3">' +
                keys.map((key, i) => {
                    const pct = total > 0 ? Math.round((totales[key] / total) * 100) : 0;
                    if (pct === 0) return '';
                    return `
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <div style="width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0;"></div>
                            <span style="font-size:0.8rem;color:#334155;flex:1;">${labels[i]}</span>
                            <span style="font-size:0.75rem;font-weight:600;color:#475569;">${formatCurrency(totales[key])}</span>
                            <span style="font-size:0.68rem;color:#94a3b8;">${pct}%</span>
                        </div>`;
                }).join('') + '</div>';
        }
    }
}


// ============================================================
// MÓDULO DE NOTIFICACIONES WHATSAPP
// ============================================================

/** Carga las notificaciones */
async function loadNotificaciones() {
    try {
        const data = await apiFetch(`/api/admin/notificaciones?negocio_id=${currentNegocioId}`);
        if (data.success && data.data) {
            renderNotificacionesTable(Array.isArray(data.data) ? data.data : []);
        }
    } catch (err) {
        console.error('Error cargando notificaciones:', err);
    }
}

/** Renderiza la tabla de notificaciones */
function renderNotificacionesTable(notificaciones) {
    const tbody = document.querySelector('#notificaciones-table tbody');
    if (!tbody) return;

    if (!notificaciones || notificaciones.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <i class="fa-brands fa-whatsapp"></i>
                        <p>No hay notificaciones enviadas</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = notificaciones.map(n => {
        const enviada = n.enviada !== 0 && n.enviada !== false;
        const statusBadge = enviada
            ? '<span class="badge-estado badge-aprobada"><i class="fa-solid fa-check me-1"></i>Enviada</span>'
            : '<span class="badge-estado badge-cancelada"><i class="fa-solid fa-xmark me-1"></i>Error</span>';

        return `
            <tr>
                <td style="font-size:0.8rem;">${formatDateTime(n.fecha_creacion || n.created_at)}</td>
                <td>${n.telefono || '--'}</td>
                <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${n.mensaje || ''}">${n.mensaje || '--'}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-icon-bf" title="Reenviar" onclick="reenviarNotificacion(${n.id})">
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
}

/** Reenvía una notificación */
async function reenviarNotificacion(id) {
    showToast('Reenviando notificación...', 'info');
    try {
        const data = await apiFetch('/api/admin/notificaciones/reenviar', {
            method: 'POST',
            body: JSON.stringify({ id, negocio_id: currentNegocioId }),
        });

        if (data.success) {
            showToast('Notificación reenviada', 'success');
            loadNotificaciones();
        } else {
            showToast(data.error || 'Error reenviando', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Verifica el estado de UltraMsg */
async function checkUltraMsgStatus() {
    try {
        const data = await apiFetch('/api/admin/ultramsg/status');
        const dot = document.getElementById('ultramsg-status-dot');
        const text = document.getElementById('ultramsg-status-text');

        if (data.success && data.data?.connected) {
            if (dot) dot.style.background = '#16a34a';
            if (text) text.textContent = 'Conectado';
        } else {
            if (dot) dot.style.background = '#cbd5e1';
            if (text) text.textContent = 'Desconectado';
        }
    } catch {
        const dot = document.getElementById('ultramsg-status-dot');
        const text = document.getElementById('ultramsg-status-text');
        if (dot) dot.style.background = '#cbd5e1';
        if (text) text.textContent = 'Desconectado';
    }
}

/** Guarda la configuración de UltraMsg */
async function guardarUltraMsgConfig() {
    const instance = getVal('um-instance');
    const token = getVal('um-token');
    const url = getVal('um-url');

    try {
        const data = await apiFetch('/api/admin/ultramsg', {
            method: 'POST',
            body: JSON.stringify({
                instance_id: instance,
                token,
                url: url || 'https://api.ultramsg.com/',
                negocio_id: currentNegocioId,
            }),
        });

        if (data.success) {
            showToast('Configuración UltraMsg guardada', 'success');
            hideModal('config-ultramsg-modal');
            checkUltraMsgStatus();
        } else {
            showToast(data.error || 'Error guardando configuración', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}


// ============================================================
// MÓDULO DE EXPORTAR DATOS
// ============================================================

/** Exporta datos en formato JSON */
async function exportData(tipo) {
    showToast('Preparando exportación...', 'info');

    try {
        const data = await apiFetch(`/api/admin/exportar-datos?tipo=${tipo}&negocio_id=${currentNegocioId}`);

        if (data.success && data.data) {
            const jsonData = JSON.stringify(data.data, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bizflow_${tipo}_${getTodayISO()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Exportación descargada', 'success');
        } else {
            showToast(data.error || 'Error exportando datos', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}


// ============================================================
// MÓDULO DE CONFIGURACIÓN
// ============================================================

/** Carga la configuración */
async function loadConfig() {
    try {
        const data = await apiFetch(`/api/admin/config?negocio_id=${currentNegocioId}`);
        if (data.success && data.data) {
            const config = data.data;

            setVal('config-nombre', config.negocio_nombre || config.nombre || '');
            setVal('config-direccion', config.negocio_direccion || config.direccion || '');
            setVal('config-telefono', config.negocio_telefono || config.telefono || '');
            setVal('config-email', config.negocio_email || config.email || '');

            // UltraMsg
            setVal('config-ultramsg-instance', config.whatsapp_ultramsg_instance || '');
            setVal('config-ultramsg-token', config.whatsapp_ultramsg_token || '');
            setVal('config-whatsapp-num', config.whatsapp_numero || '');
            setVal('config-ultramsg-url', config.whatsapp_ultramsg_url || 'https://api.ultramsg.com/');

            // Domicilio
            setVal('config-radio-cobertura', config.domicilio_cobertura_maxima_km || config.domicilio_radio_gratis_km || 10);
            setVal('config-costo-km', config.domicilio_tarifa_por_km || 0);
            setVal('config-costo-base-dom', config.domicilio_cargo_minimo || 0);
            setVal('config-gps-lat', config.domicilio_taller_lat || '');
            setVal('config-gps-lng', config.domicilio_taller_lng || '');

            // Colores y apariencia
            const primaryColor = config.color_primario || '#0d9488';
            setVal('config-color-primary', primaryColor);
            setVal('config-color-primary-text', primaryColor);

            // Logo
            if (config.negocio_logo || config.logo) {
                const preview = document.getElementById('config-logo-preview');
                if (preview) {
                    preview.innerHTML = `<img src="${config.negocio_logo || config.logo}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:0.5rem;">`;
                }
            }
        }
    } catch (err) {
        console.error('Error cargando configuración:', err);
    }
}

/** Guarda la configuración */
async function guardarConfiguracion() {
    showToast('Guardando configuración...', 'info');

    try {
        const config = {
            negocio_id: currentNegocioId,
            negocio_nombre: getVal('config-nombre'),
            negocio_direccion: getVal('config-direccion'),
            negocio_telefono: getVal('config-telefono'),
            negocio_email: getVal('config-email'),
            moneda: getVal('config-moneda'),
            whatsapp_ultramsg_instance: getVal('config-ultramsg-instance'),
            whatsapp_ultramsg_token: getVal('config-ultramsg-token'),
            whatsapp_numero: getVal('config-whatsapp-num'),
            whatsapp_ultramsg_url: getVal('config-ultramsg-url'),
            domicilio_cobertura_maxima_km: parseFloat(getVal('config-radio-cobertura')) || 10,
            domicilio_tarifa_por_km: parseFloat(getVal('config-costo-km')) || 0,
            domicilio_cargo_minimo: parseFloat(getVal('config-costo-base-dom')) || 0,
            domicilio_taller_lat: parseFloat(getVal('config-gps-lat')) || null,
            domicilio_taller_lng: parseFloat(getVal('config-gps-lng')) || null,
            color_primario: getVal('config-color-primary-text') || getVal('config-color-primary'),
        };

        const data = await apiFetch('/api/admin/config', {
            method: 'POST',
            body: JSON.stringify(config),
        });

        if (data.success) {
            showToast('Configuración guardada exitosamente', 'success');
        } else {
            showToast(data.error || 'Error guardando configuración', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Detecta ubicación GPS del navegador */
function detectarGPS() {
    if (!navigator.geolocation) {
        showToast('Geolocalización no soportada por su navegador', 'warning');
        return;
    }

    showToast('Obteniendo ubicación GPS...', 'info');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            setVal('config-gps-lat', position.coords.latitude.toFixed(6));
            setVal('config-gps-lng', position.coords.longitude.toFixed(6));
            showToast('Ubicación GPS detectada', 'success');
        },
        (error) => {
            showToast('No se pudo obtener la ubicación GPS', 'error');
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

/** Captura firma digital (placeholder) */
function captureFirma() {
    showToast('La firma digital se captura desde la app del técnico al cerrar la orden', 'info');
}

/** Sincroniza el color picker con el campo de texto */
function setupColorPickers() {
    const colorInput = document.getElementById('config-color-primary');
    const colorText = document.getElementById('config-color-primary-text');

    if (colorInput && colorText) {
        colorInput.addEventListener('input', () => {
            colorText.value = colorInput.value;
        });
        colorText.addEventListener('input', () => {
            if (/^#[0-9A-Fa-f]{6}$/.test(colorText.value)) {
                colorInput.value = colorText.value;
            }
        });
    }

    // Color pickers de landing
    setupLandingColorPicker('cl-color-primary', 'cl-color-primary-text');
    setupLandingColorPicker('cl-color-secondary', 'cl-color-secondary-text');
}

/** Sincroniza un par de color picker con texto */
function setupLandingColorPicker(inputId, textId) {
    const input = document.getElementById(inputId);
    const text = document.getElementById(textId);
    if (!input || !text) return;

    input.addEventListener('input', () => { text.value = input.value; });
    text.addEventListener('input', () => {
        if (/^#[0-9A-Fa-f]{6}$/.test(text.value)) input.value = text.value;
    });
}

/** Sube el logo del negocio */
function setupLogoUpload() {
    const fileInput = document.getElementById('config-logo-upload');
    const preview = document.getElementById('config-logo-preview');

    if (!fileInput || !preview) return;

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Seleccione un archivo de imagen válido', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            preview.innerHTML = `<img src="${ev.target.result}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:0.5rem;">`;
            showToast('Logo cargado (se guardará al guardar la configuración)', 'success');
        };
        reader.readAsDataURL(file);
    });
}


// ============================================================
// MÓDULO DE LANDING PAGES
// ============================================================

/** Carga las landing pages */
async function loadLandingPages() {
    try {
        const data = await apiFetch(`/api/admin/landing?negocio_id=${currentNegocioId}`);
        if (data.success && data.data) {
            renderLandingPagesList(Array.isArray(data.data) ? data.data : []);
        }
    } catch (err) {
        console.error('Error cargando landing pages:', err);
        showToast('Error cargando landing pages', 'error');
    }
}

/** Renderiza la lista de landing pages */
function renderLandingPagesList(landings) {
    const container = document.getElementById('landing-pages-list');
    if (!container) return;

    if (!landings || landings.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="empty-state" style="background:#fff;border-radius:0.875rem;box-shadow:var(--card-shadow);">
                    <i class="fa-solid fa-globe"></i>
                    <p>No hay landing pages creadas</p>
                </div>
            </div>`;
        return;
    }

    container.innerHTML = landings.map(l => {
        const publicada = l.publicado !== 0 && l.publicado !== false;
        const visitas = l.visitas || 0;
        const fecha = formatDate(l.fecha_creacion || l.created_at);

        return `
            <div class="col-md-6 col-lg-4">
                <div class="bf-card h-100">
                    <div style="height:120px;background:linear-gradient(135deg,#0d9488,#0f766e);display:flex;align-items:center;justify-content:center;">
                        <div class="text-center text-white">
                            <i class="fa-solid fa-globe d-block mb-1" style="font-size:1.5rem;"></i>
                            <span class="fw-700" style="font-size:0.9rem;">${l.titulo || 'Landing'}</span>
                        </div>
                    </div>
                    <div class="bf-card-body">
                        <h6 class="fw-700 text-gray-800 mb-1">${l.titulo || 'Sin título'}</h6>
                        <p style="font-size:0.78rem;color:#64748b;margin-bottom:0.5rem;">/${l.slug || ''}</p>
                        <div class="d-flex gap-2 mb-3" style="font-size:0.72rem;color:#94a3b8;">
                            <span><i class="fa-solid fa-eye me-1"></i>${visitas} visitas</span>
                            <span><i class="fa-solid fa-calendar me-1"></i>${fecha}</span>
                        </div>
                        <div class="d-flex gap-1">
                            <button class="btn-icon-bf" title="Vista previa" onclick="previewLanding('${l.slug}')">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                            <button class="btn-icon-bf" title="${publicada ? 'Despublicar' : 'Publicar'}" onclick="togglePublicar(${l.id}, ${!publicada})">
                                <i class="fa-solid ${publicada ? 'fa-eye' : 'fa-eye-slash'}"></i>
                            </button>
                            <button class="btn-icon-bf danger" title="Eliminar" onclick="eliminarLanding(${l.id})">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
    }).join('');
}

/** Crea una nueva landing page */
async function crearLanding() {
    const titulo = getVal('cl-titulo');
    const slug = getVal('cl-slug');
    const descripcion = getVal('cl-descripcion');
    const colorPrimary = getVal('cl-color-primary-text') || getVal('cl-color-primary');
    const colorSecondary = getVal('cl-color-secondary-text') || getVal('cl-color-secondary');
    const fuente = getVal('cl-fuente');
    const publicada = document.getElementById('cl-publicada')?.checked ? 1 : 0;

    if (!titulo) {
        showToast('El título es requerido', 'warning');
        return;
    }
    if (!slug) {
        showToast('El slug es requerido', 'warning');
        return;
    }

    try {
        const body = {
            titulo,
            slug: slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            descripcion,
            colores: JSON.stringify({ primario: colorPrimary, secundario: colorSecondary }),
            fuente,
            publicado: publicada,
            negocio_id: currentNegocioId,
            secciones: JSON.stringify([
                { tipo: 'hero', activa: true },
                { tipo: 'servicios', activa: true },
                { tipo: 'contacto', activa: true },
            ]),
        };

        const data = await apiFetch('/api/admin/landing', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        if (data.success) {
            showToast('Landing page creada exitosamente', 'success');
            hideModal('create-landing-modal');
            loadLandingPages();
        } else {
            showToast(data.error || 'Error creando landing', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Vista previa de una landing page */
function previewLanding(slug) {
    if (!slug) {
        // Preview desde el modal de creación
        const titulo = getVal('cl-titulo') || 'Vista Previa';
        const descripcion = getVal('cl-descripcion') || '';

        setText('lp-titulo', titulo);
        setText('lp-descripcion', descripcion);
        setHTML('lp-sections', `
            <div class="text-center py-5">
                <div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.2);margin:0 auto 1rem;display:flex;align-items:center;justify-content:center;">
                    <i class="fa-solid fa-bolt" style="font-size:2rem;"></i>
                </div>
                <p class="text-white opacity-75">Contenido de la landing page</p>
            </div>`);

        showModal('preview-landing-modal');
        return;
    }

    // Abrir en nueva pestaña
    window.open(`/l/${slug}`, '_blank');
}

/** Publica/despublica una landing page */
async function togglePublicar(id, publicar) {
    try {
        const data = await apiFetch('/api/admin/landing', {
            method: 'PUT',
            body: JSON.stringify({ id, publicado: publicar ? 1 : 0 }),
        });

        if (data.success) {
            showToast(publicar ? 'Landing publicada' : 'Landing despublicada', 'success');
            loadLandingPages();
        } else {
            showToast(data.error || 'Error actualizando landing', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/** Elimina una landing page */
function eliminarLanding(id) {
    confirmAction('¿Eliminar esta landing page?', async () => {
        try {
            const data = await apiFetch(`/api/admin/landing?id=${id}`, {
                method: 'DELETE',
            });

            if (data.success) {
                showToast('Landing eliminada', 'success');
                loadLandingPages();
            } else {
                showToast(data.error || 'Error eliminando landing', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });
}

/** Agrega una sección al editor de landing */
function addLandingSection() {
    const container = document.getElementById('cl-sections-container');
    if (!container) return;

    const sectionTypes = [
        { tipo: 'servicios', label: 'Servicios', desc: 'Lista de servicios ofrecidos' },
        { tipo: 'testimonios', label: 'Testimonios', desc: 'Opiniones de clientes' },
        { tipo: 'galeria', label: 'Galería', desc: 'Galería de imágenes' },
        { tipo: 'contacto', label: 'Contacto', desc: 'Formulario de contacto' },
        { tipo: 'faq', label: 'FAQ', desc: 'Preguntas frecuentes' },
        { tipo: 'mapa', label: 'Mapa', desc: 'Ubicación en mapa' },
    ];

    // Seleccionar la primera sección que no esté ya agregada
    const existingTypes = [...container.querySelectorAll('.landing-section-block strong')].map(el => el.textContent.toLowerCase());
    const available = sectionTypes.find(s => !existingTypes.includes(s.tipo.toLowerCase()));

    if (!available) {
        showToast('No hay más secciones disponibles', 'info');
        return;
    }

    const sectionEl = document.createElement('div');
    sectionEl.className = 'landing-section-block d-flex align-items-center justify-content-between';
    sectionEl.innerHTML = `
        <div>
            <strong style="font-size:0.85rem;">${available.label}</strong>
            <p class="text-gray-500 text-xs mb-0">${available.desc}</p>
        </div>
        <div class="d-flex gap-2">
            <button type="button" class="btn-icon-bf" onclick="editLandingSection(this)"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="btn-icon-bf danger" onclick="removeLandingSection(this)"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;
    container.appendChild(sectionEl);
}

/** Edita una sección de landing (placeholder) */
function editLandingSection(el) {
    showToast('Editor de secciones en desarrollo', 'info');
}

/** Elimina una sección de landing del editor */
function removeLandingSection(el) {
    const section = el.closest('.landing-section-block');
    if (section) {
        section.remove();
    }
}


// ============================================================
// MÓDULO DE GENERACIÓN DE PDF
// ============================================================

/** Genera un PDF de una orden de trabajo */
async function generatePDF(ordenId) {
    showToast('Generando PDF...', 'info');

    try {
        // Buscar la orden
        let orden = ordenesCache.find(o => o.id === ordenId);
        if (!orden) {
            const data = await apiFetch(`/api/admin/todas-ordenes?negocio_id=${currentNegocioId}`);
            if (data.success && data.data) {
                ordenesCache = data.data.ordenes || [];
                orden = ordenesCache.find(o => o.id === ordenId);
            }
        }

        if (!orden) {
            showToast('Orden no encontrada', 'error');
            return;
        }

        // Generar PDF con jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;

        // Encabezado
        doc.setFillColor(13, 148, 136);
        doc.rect(0, 0, pageWidth, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('BizFlow', margin, 18);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text('Orden de Trabajo', margin, 26);
        doc.text('#' + (orden.numero_orden || orden.id), pageWidth - margin, 18, { align: 'right' });
        doc.text(formatDate(orden.fecha_creacion || orden.created_at), pageWidth - margin, 26, { align: 'right' });

        // Restaurar color
        doc.setTextColor(0, 0, 0);

        let y = 45;

        // Estado y monto
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Estado:', margin, y);
        doc.setFont(undefined, 'normal');
        doc.text(translateEstado(orden.estado || 'enviada'), margin + 20, y);
        doc.setFont(undefined, 'bold');
        doc.text('Monto Total:', pageWidth / 2, y);
        doc.setFont(undefined, 'normal');
        doc.text(formatCurrency(orden.monto_final || orden.monto_base || orden.monto_total || 0), pageWidth / 2 + 25, y);

        y += 12;

        // Línea separadora
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        // Datos del cliente
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text('DATOS DEL CLIENTE', margin, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text(`Nombre: ${orden.cliente_nombre || orden.cliente_nombre_completo || '--'}`, margin, y); y += 5;
        doc.text(`Teléfono: ${orden.cliente_telefono || '--'}`, margin, y); y += 5;
        doc.text(`Email: ${orden.cliente_email || '--'}`, margin, y); y += 10;

        // Datos del vehículo
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text('DATOS DEL VEHÍCULO', margin, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text(`Patente: ${normalizePatente(orden.patente || orden.patente_placa || '')}`, margin, y); y += 5;
        doc.text(`Marca/Modelo: ${(orden.marca || '') + ' ' + (orden.modelo || '--')}`, margin, y); y += 5;
        doc.text(`Año: ${orden.anio || '--'}    Color: ${orden.color || '--'}`, margin, y); y += 10;

        // Servicios
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text('SERVICIOS', margin, y);
        y += 8;

        const servicios = orden.servicios || [];
        if (servicios.length > 0) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            servicios.forEach(s => {
                const nombre = s.nombre_servicio || s.nombre || 'Servicio';
                const precio = formatCurrency(s.precio || 0);
                doc.text(`${nombre} - ${precio}`, margin + 5, y);
                y += 5;
            });
        } else {
            doc.setFontSize(9);
            doc.text('Sin servicios registrados', margin + 5, y);
            y += 5;
        }
        y += 5;

        // Técnico
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(`Técnico: `, margin, y);
        doc.setFont(undefined, 'normal');
        doc.text(orden.tecnico_nombre || 'Sin asignar', margin + 20, y);
        y += 10;

        // Notas
        if (orden.notas) {
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text('NOTAS', margin, y);
            y += 7;

            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            const lines = doc.splitTextToSize(orden.notas, pageWidth - margin * 2);
            doc.text(lines, margin, y);
            y += lines.length * 4 + 5;
        }

        // Pie de página
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, 280, pageWidth - margin, 280);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('Generado por BizFlow - ' + new Date().toLocaleString('es-MX'), margin, 287);
        doc.text('https://bizflow.app', pageWidth - margin, 287, { align: 'right' });

        // Descargar
        doc.save(`OT_${orden.numero_orden || orden.id}.pdf`);
        showToast('PDF generado exitosamente', 'success');
    } catch (err) {
        showToast('Error generando PDF: ' + err.message, 'error');
    }
}

/** Imprimir la orden actual (usa el PDF) */
function imprimirOrden() {
    const numeroMatch = (document.getElementById('vo-numero')?.textContent || '').match(/\d+/);
    if (numeroMatch) {
        // Buscar la orden por número
        const orden = ordenesCache.find(o => String(o.numero_orden) === numeroMatch[0] || String(o.id) === numeroMatch[0]);
        if (orden) {
            generatePDF(orden.id);
            return;
        }
    }
    showToast('No se pudo identificar la orden para imprimir', 'warning');
}


// ============================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================================

/** Función principal de inicialización */
function initApp() {
    // Intentar restaurar sesión
    const hasSession = checkSession();

    if (hasSession) {
        // La sesión se restauró en checkSession()
    }

    // Inicializar módulos
    initLogin();
    initSidebar();
    setupPeriodSelector();
    setupCrearOrdenModal();
    setupExpressOrdenModal();
    setupSearchOrden();
    setupColorPickers();
    setupLogoUpload();

    // Configurar listeners adicionales

    // Selector de período de liquidaciones
    const liqPeriodo = document.getElementById('liq-periodo');
    if (liqPeriodo) {
        liqPeriodo.addEventListener('change', () => calcularLiquidaciones());
    }

    // Selector de período de pagos
    const pagoPeriodo = document.getElementById('pago-periodo');
    if (pagoPeriodo) {
        pagoPeriodo.addEventListener('change', () => loadResumenPagos());
    }

    // Selector de orden para costos
    const costoOrdenSelect = document.getElementById('costo-orden-select');
    if (costoOrdenSelect) {
        costoOrdenSelect.addEventListener('change', () => {
            const val = costoOrdenSelect.value;
            if (val) loadCostosPorOrden(val);
        });
    }

    // Fecha por defecto para gasto nuevo
    const createGastoModal = document.getElementById('create-gasto-modal');
    if (createGastoModal) {
        createGastoModal.addEventListener('show.bs.modal', () => {
            setVal('cg-fecha', getTodayISO());
        });
    }

    // Limpiar formularios al abrir modales
    document.getElementById('create-tecnico-modal')?.addEventListener('show.bs.modal', () => {
        // Resetear campos excepto comisión por defecto
        ['ct-nombre', 'ct-telefono', 'ct-email', 'ct-pin', 'ct-especialidad'].forEach(id => setVal(id, ''));
        setVal('ct-comision', '10');
    });

    document.getElementById('create-servicio-modal')?.addEventListener('show.bs.modal', () => {
        ['cs-nombre', 'cs-precio', 'cs-duracion', 'cs-descripcion'].forEach(id => setVal(id, ''));
    });

    document.getElementById('create-modelo-modal')?.addEventListener('show.bs.modal', () => {
        ['cm-marca', 'cm-modelo', 'cm-anio'].forEach(id => setVal(id, ''));
    });

    document.getElementById('create-landing-modal')?.addEventListener('show.bs.modal', () => {
        ['cl-titulo', 'cl-slug', 'cl-descripcion'].forEach(id => setVal(id, ''));
    });

    // Teclado: Enter para buscar patente
    document.getElementById('search-orden-patente')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscarPorPatente();
        }
    });

    // Auto-refresh del dashboard cada 60 segundos
    if (hasSession) {
        dashboardInterval = setInterval(() => {
            const dashSection = document.getElementById('dashboard-section');
            if (dashSection && dashSection.classList.contains('active')) {
                loadDashboard();
            }
        }, 60000);
    }

    console.log('BizFlow v1.0 - Inicializado correctamente');
}


// ============================================================
// EVENTO DOMContentLoaded
// ============================================================
document.addEventListener('DOMContentLoaded', initApp);
