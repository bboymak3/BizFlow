// ============================================
// APP.JS - Aplicación Móvil para Técnicos
// Global Pro Automotriz
// ============================================

const API_BASE = '/api/tecnico';
let tecnicoActual = null;
let ordenActual = null;
let ordenes = [];
let fotoTipoActual = null;

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    // Verificar si hay sesión activa
    const sesionGuardada = localStorage.getItem('tecnico_sesion');
    if (sesionGuardada) {
        tecnicoActual = JSON.parse(sesionGuardada);
        mostrarApp();
    }

    // Configurar input de foto
    document.getElementById('foto-input').addEventListener('change', handleFotoSeleccionada);
});

// ============================================
// AUTENTICACIÓN
// ============================================

async function login() {
    const telefono = document.getElementById('telefono-login').value.trim();
    const pin = document.getElementById('pin-login').value.trim();
    const errorMsg = document.getElementById('login-error');

    if (!telefono || !pin) {
        mostrarErrorLogin('Ingrese teléfono y PIN');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefono, pin })
        });

        const data = await response.json();

        if (data.success) {
            tecnicoActual = data.tecnico;
            localStorage.setItem('tecnico_sesion', JSON.stringify(tecnicoActual));
            mostrarApp();
        } else {
            mostrarErrorLogin(data.error || 'Credenciales incorrectas');
        }
    } catch (error) {
        console.error('Error en login:', error);
        mostrarErrorLogin('Error de conexión');
    }
}

function mostrarErrorLogin(mensaje) {
    const errorMsg = document.getElementById('login-error');
    errorMsg.textContent = mensaje;
    errorMsg.style.display = 'block';
}

function logout() {
    tecnicoActual = null;
    ordenActual = null;
    localStorage.removeItem('tecnico_sesion');
    document.getElementById('login-screen').style.display = 'block';
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('telefono-login').value = '';
    document.getElementById('pin-login').value = '';
}

function mostrarApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    document.getElementById('tecnico-nombre').textContent = tecnicoActual.nombre;
    cargarOrdenes();
}

// ============================================
// NAVEGACIÓN Y TABS
// ============================================

function showTab(tabName) {
    // Ocultar todos los tabs
    document.getElementById('tab-pendientes').style.display = 'none';
    document.getElementById('tab-en-curso').style.display = 'none';
    document.getElementById('tab-completadas').style.display = 'none';

    // Mostrar el tab seleccionado
    document.getElementById(`tab-${tabName}`).style.display = 'block';

    // Actualizar tabs superiores
    document.querySelectorAll('#main-tabs .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    event.target.classList.add('active');

    // Actualizar navegación inferior
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.classList.add('active');
}

// ============================================
// CARGAR ÓRDENES
// ============================================

async function cargarOrdenes() {
    if (!tecnicoActual) return;

    try {
        const response = await fetch(`${API_BASE}/ordenes?tecnico_id=${tecnicoActual.id}`);
        const data = await response.json();

        if (data.success) {
            ordenes = data.ordenes;
            renderizarOrdenes();
        }
    } catch (error) {
        console.error('Error al cargar órdenes:', error);
        mostrarNotificacion('error', 'Error', 'No se pudieron cargar las órdenes');
    }
}

function renderizarOrdenes() {
    const pendientes = ordenes.filter(o =>
        ['Pendiente Visita', 'Pendiente Piezas'].includes(o.estado_trabajo)
    );

    const enCurso = ordenes.filter(o =>
        ['En Sitio', 'En Progreso'].includes(o.estado_trabajo)
    );

    const completadas = ordenes.filter(o =>
        ['Completada', 'Aprobada', 'Usuario Satisfecho', 'No Completada', 'Cerrada'].includes(o.estado_trabajo)
    );

    renderizarListaOrdenes('ordenes-pendientes', pendientes);
    renderizarListaOrdenes('ordenes-en-curso', enCurso);
    renderizarListaOrdenes('ordenes-completadas', completadas);
}

function renderizarListaOrdenes(containerId, ordenesLista) {
    const container = document.getElementById(containerId);

    if (ordenesLista.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-white">
                <i class="fas fa-inbox fa-3x mb-3"></i>
                <p>No hay órdenes en esta categoría</p>
            </div>
        `;
        return;
    }

    let html = '';
    ordenesLista.forEach(orden => {
        const estadoClass = obtenerClaseEstado(orden.estado_trabajo);
        const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
        const distKmLista = Number(orden.distancia_km || 0);
        const cargoDomLista = Number(orden.cargo_domicilio || 0);
        const tieneDomicilioLista = distKmLista > 0;
        const domicilioBadge = tieneDomicilioLista
            ? (cargoDomLista > 0
                ? `<span class="badge" style="background:#d90429; font-size:0.65rem; margin-left:6px;"><i class="fas fa-truck me-1"></i>$${cargoDomLista.toLocaleString('es-CL')}</span>`
                : `<span class="badge" style="background:#28a745; font-size:0.65rem; margin-left:6px;"><i class="fas fa-truck me-1"></i>Gratis</span>`)
            : '';

        html += `
            <div class="orden-card" onclick="verOrden(${orden.id})">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="mb-1 fw-bold">#${numeroFormateado}${domicilioBadge}</h6>
                        <span class="estado-badge ${estadoClass}">${orden.estado_trabajo}</span>
                    </div>
                    <i class="fas fa-chevron-right text-muted"></i>
                </div>
                <div class="detail-row mb-0">
                    <i class="fas fa-car"></i>
                    <span>${orden.marca} ${orden.modelo} <strong>${orden.patente_placa}</strong></span>
                </div>
                <div class="detail-row mb-0">
                    <i class="fas fa-user"></i>
                    <span>${orden.cliente_nombre}</span>
                </div>
                <div class="detail-row mb-0">
                    <i class="fas fa-map-marker-alt"></i>
                    <span class="text-truncate" style="max-width: 200px;">${orden.direccion || 'Sin dirección'}</span>
                </div>
                ${tieneDomicilioLista ? `
                <div class="detail-row mb-0">
                    <i class="fas fa-route" style="color:#6c757d;"></i>
                    <span class="text-muted" style="font-size:0.8rem;">${distKmLista} km — ${cargoDomLista > 0 ? '$' + cargoDomLista.toLocaleString('es-CL') : 'Sin cargo'}</span>
                </div>` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================
// VER DETALLE DE ORDEN
// ============================================

async function verOrden(ordenId) {
    try {
        const response = await fetch(`${API_BASE}/orden?id=${ordenId}&tecnico_id=${tecnicoActual.id}`);
        const data = await response.json();

        if (data.success) {
            ordenActual = data.orden;
            mostrarOrdenEnModal(ordenActual);
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo cargar la orden');
        }
    } catch (error) {
        console.error('Error al ver orden:', error);
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

function mostrarOrdenEnModal(orden) {
    const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
    const estadoClass = obtenerClaseEstado(orden.estado_trabajo);

    // Información básica
    document.getElementById('modal-numero-orden').textContent = numeroFormateado;
    document.getElementById('modal-cliente').textContent = orden.cliente_nombre || 'N/A';
    document.getElementById('modal-direccion').textContent = orden.direccion || orden.referencia_direccion || 'Sin dirección';
    document.getElementById('modal-vehiculo').textContent = `${orden.marca || ''} ${orden.modelo || ''} ${orden.anio || ''}`;
    document.getElementById('modal-patente').textContent = orden.patente_placa || 'N/A';
    document.getElementById('modal-estado').textContent = orden.estado_trabajo;
    document.getElementById('modal-estado').className = `estado-badge ${estadoClass}`;

    // Mapa oculto (API key no configurada)
    document.getElementById('map-container').style.display = 'none';

    // =============================================
    // RENDERIZAR DIAGNÓSTICOS / TRABAJOS (sin precios)
    // =============================================
    let serviciosSeleccionados = [];
    try {
        serviciosSeleccionados = orden.servicios_seleccionados
            ? (typeof orden.servicios_seleccionados === 'string' ? JSON.parse(orden.servicios_seleccionados) : orden.servicios_seleccionados)
            : [];
    } catch(e) { serviciosSeleccionados = []; }

    // También intentar con diagnostico_checks como fallback
    let diagnosticoChecks = [];
    try {
        diagnosticoChecks = orden.diagnostico_checks
            ? (typeof orden.diagnostico_checks === 'string' ? JSON.parse(orden.diagnostico_checks) : orden.diagnostico_checks)
            : [];
    } catch(e) { diagnosticoChecks = []; }

    const cardDiagnosticos = document.getElementById('card-diagnosticos');
    const cardTrabajosFallback = document.getElementById('card-trabajos-fallback');

    if (serviciosSeleccionados.length > 0) {
        // Mostrar servicios del catálogo SIN precios
        let diagnosticosHtml = '<div class="list-group list-group-flush">';
        serviciosSeleccionados.forEach((serv, idx) => {
            const nombre = serv.nombre || serv.servicio || 'Servicio';
            const categoria = serv.categoria || '';
            const tipo = serv.tipo_comision || serv.tipo || '';
            diagnosticosHtml += `
                <div class="list-group-item d-flex justify-content-between align-items-center px-0 border-bottom" style="background:transparent;">
                    <div>
                        <i class="fas fa-wrench me-2" style="color:#d90429;"></i>
                        <strong>${nombre}</strong>
                        ${categoria ? `<span class="badge bg-secondary ms-2" style="font-size:0.7rem;">${categoria}</span>` : ''}
                    </div>
                    ${tipo ? `<span class="text-muted" style="font-size:0.8rem;">${tipo}</span>` : ''}
                </div>
            `;
        });
        diagnosticosHtml += '</div>';
        document.getElementById('modal-diagnosticos').innerHTML = diagnosticosHtml;
        cardDiagnosticos.style.display = 'block';
        cardTrabajosFallback.style.display = 'none';
    } else if (diagnosticoChecks.length > 0) {
        // Fallback: mostrar checks de diagnóstico sin precios
        let diagnosticosHtml = '<div class="list-group list-group-flush">';
        diagnosticoChecks.forEach(check => {
            const nombre = typeof check === 'string' ? check : (check.nombre || check.servicio || 'Check');
            diagnosticosHtml += `
                <div class="list-group-item d-flex align-items-center px-0 border-bottom" style="background:transparent;">
                    <i class="fas fa-check-circle me-2" style="color:#28a745;"></i>
                    <span>${nombre}</span>
                </div>
            `;
        });
        diagnosticosHtml += '</div>';
        document.getElementById('modal-diagnosticos').innerHTML = diagnosticosHtml;
        cardDiagnosticos.style.display = 'block';
        cardTrabajosFallback.style.display = 'none';
    } else {
        // Fallback final: campos booleanos viejos
        let trabajosHtml = '';
        if (orden.trabajo_frenos) trabajosHtml += `<p>✓ Frenos: ${orden.detalle_frenos || 'Sin detalle'}</p>`;
        if (orden.trabajo_luces) trabajosHtml += `<p>✓ Luces: ${orden.detalle_luces || 'Sin detalle'}</p>`;
        if (orden.trabajo_tren_delantero) trabajosHtml += `<p>✓ Tren Delantero: ${orden.detalle_tren_delantero || 'Sin detalle'}</p>`;
        if (orden.trabajo_correas) trabajosHtml += `<p>✓ Correas: ${orden.detalle_correas || 'Sin detalle'}</p>`;
        if (orden.trabajo_componentes) trabajosHtml += `<p>✓ Componentes: ${orden.detalle_componentes || 'Sin detalle'}</p>`;
        if (trabajosHtml) {
            document.getElementById('modal-trabajos').innerHTML = trabajosHtml;
            cardTrabajosFallback.style.display = 'block';
        } else {
            cardDiagnosticos.style.display = 'none';
            cardTrabajosFallback.style.display = 'none';
        }
    }

    // =============================================
    // RENDERIZAR CHECKLIST DEL VEHÍCULO
    // =============================================
    const cardChecklist = document.getElementById('card-checklist');
    const tieneChecklist = orden.nivel_combustible
        || orden.check_paragolfe_delantero_der
        || orden.check_puerta_delantera_der
        || orden.check_puerta_trasera_der
        || orden.check_paragolfe_trasero_izq
        || orden.check_otros_carroceria;

    if (tieneChecklist) {
        let checklistHtml = '';

        // Nivel de combustible
        if (orden.nivel_combustible) {
            checklistHtml += `
                <div class="d-flex align-items-center mb-2">
                    <i class="fas fa-gas-pump me-2" style="color:#ffc800; width:20px;"></i>
                    <div>
                        <strong>Combustible:</strong> ${orden.nivel_combustible}
                    </div>
                </div>
            `;
        }

        // Estado de carrocería
        const danios = [];
        if (orden.check_paragolfe_delantero_der) danios.push('Parachoques delantero derecho');
        if (orden.check_puerta_delantera_der) danios.push('Puerta delantera derecha');
        if (orden.check_puerta_trasera_der) danios.push('Puerta trasera derecha');
        if (orden.check_paragolfe_trasero_izq) danios.push('Parachoques trasero izquierdo');
        if (orden.check_otros_carroceria) danios.push(orden.check_otros_carroceria);

        if (danios.length > 0) {
            checklistHtml += `
                <div class="mb-2">
                    <div class="d-flex align-items-center mb-1">
                        <i class="fas fa-car-crash me-2" style="color:#d90429; width:20px;"></i>
                        <strong>Estado de Carrocería:</strong>
                    </div>
                    <div class="ms-4">
                        ${danios.map(d => `
                            <div class="d-flex align-items-center mb-1">
                                <i class="fas fa-exclamation-triangle me-2" style="color:#ffc800; font-size:0.8rem;"></i>
                                <span>${d}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (!orden.nivel_combustible) {
            // Si no hay nada que mostrar
            cardChecklist.style.display = 'none';
        }

        if (checklistHtml) {
            document.getElementById('modal-checklist').innerHTML = checklistHtml;
            cardChecklist.style.display = 'block';
        }
    } else {
        cardChecklist.style.display = 'none';
    }

    // =============================================
    // RENDERIZAR OBSERVACIONES DEL DIAGNÓSTICO
    // =============================================
    const cardObservaciones = document.getElementById('card-observaciones');
    if (orden.diagnostico_observaciones) {
        document.getElementById('modal-observaciones').innerHTML = `<p>${orden.diagnostico_observaciones.replace(/\n/g, '<br>')}</p>`;
        cardObservaciones.style.display = 'block';
    } else {
        cardObservaciones.style.display = 'none';
    }

    // Mostrar notas de cierre si existen
    document.getElementById('modal-notas').innerHTML = orden.notas ? `<p>${orden.notas.replace(/\n/g, '<br>')}</p>` : '<p class="text-muted">Sin notas de cierre</p>';

    // Mostrar info de domicilio SIEMPRE (incluso si es $0 o no calculado)
    const cardDomicilio = document.getElementById('card-domicilio');
    const estadosConDomicilio = ['En Sitio', 'En Progreso', 'Completada', 'Aprobada', 'Usuario Satisfecho', 'No Completada', 'Cerrada'];
    const mostrarDomicilio = estadosConDomicilio.includes(orden.estado_trabajo);
    if (mostrarDomicilio) {
        const distKm = Number(orden.distancia_km || 0);
        const cargo = Number(orden.cargo_domicilio || 0);
        const modo = orden.domicilio_modo_cobro || 'no_cobrar';

        let modoTexto = '';
        let modoClase = 'text-muted';
        if (modo === 'sumar_factura') { modoTexto = 'Incluido en la factura'; modoClase = 'text-success'; }
        else if (modo === 'pago_directo_tecnico') { modoTexto = 'Pago directo al tecnico'; modoClase = 'text-warning'; }
        else { modoTexto = 'Solo informativo (no se cobra)'; }

        let distanciaTexto = distKm > 0 ? distKm + ' km' : 'N/A';
        let cargoTexto = distKm > 0 ? (cargo > 0 ? '$' + cargo.toLocaleString('es-CL') : 'Gratis') : 'No calculado';
        let cargoColor = cargo > 0 ? 'color:#d90429;' : (distKm > 0 ? 'color:#28a745;' : 'color:#6c757d;');

        document.getElementById('modal-domicilio').innerHTML = `
            <div class="row text-center mb-2">
                <div class="col-4">
                    <div class="text-muted" style="font-size:0.75rem;">Distancia</div>
                    <div class="fw-bold" style="font-size:1.1rem;">${distanciaTexto}</div>
                </div>
                <div class="col-4">
                    <div class="text-muted" style="font-size:0.75rem;">Cargo</div>
                    <div class="fw-bold" style="font-size:1.1rem; ${cargoColor}">${cargoTexto}</div>
                </div>
                <div class="col-4">
                    <div class="text-muted" style="font-size:0.75rem;">Metodo</div>
                    <div class="fw-bold ${modoClase}" style="font-size:0.75rem;">${modoTexto}</div>
                </div>
            </div>
        `;
        cardDomicilio.style.display = 'block';
    } else {
        cardDomicilio.style.display = 'none';
    }

    // Mostrar flag de orden cerrada según estado_trabajo
    const estaCerrada = orden.estado_trabajo === 'Cerrada';
    const checkboxCerrada = document.getElementById('modal-orden-cerrada');
    if (checkboxCerrada) {
        checkboxCerrada.checked = estaCerrada;
    }

    // Renderizar acciones según estado
    renderizarAcciones(orden);

    // Cargar fotos, notas y historial
    cargarFotos(orden.id);
    cargarNotas(orden.id);
    cargarHistorial(orden.id);

    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalOrden'));
    modal.show();
}

function renderizarAcciones(orden) {
    const container = document.getElementById('acciones-container');
    let html = '';

    switch (orden.estado_trabajo) {
        case 'Pendiente Visita':
            html = `
                <button class="btn btn-gps action-btn" onclick="navegarGPS()">
                    <i class="fas fa-map-marked-alt me-2"></i>Navegar al Lugar
                </button>
                <button class="btn btn-iniciar action-btn" onclick="llegarAlSitio()">
                    <i class="fas fa-map-pin me-2"></i>Llegué al Sitio
                </button>
            `;
            break;
        case 'En Sitio':
            html = `
                <button class="btn btn-iniciar action-btn" onclick="iniciarTrabajo()">
                    <i class="fas fa-play me-2"></i>Iniciar Trabajo
                </button>
            `;
            break;
        case 'En Progreso':
            html = `
                <button class="btn btn-completar action-btn" onclick="mostrarConfirmacionCompletar()">
                    <i class="fas fa-check me-2"></i>Completar Trabajo
                </button>
                <button class="btn btn-no-completar action-btn" onclick="abrirModalNoCompletada()">
                    <i class="fas fa-times me-2"></i>No Completado
                </button>
            `;
            break;
        case 'Pendiente Piezas':
            html = `
                <button class="btn btn-iniciar action-btn" onclick="retomarTrabajo()">
                    <i class="fas fa-play me-2"></i>Retomar Trabajo
                </button>
            `;
            break;
        case 'Completada':
            html = `
                <div id="cierre-panel" class="orden-card mb-3">
                    <h6 class="fw-bold mb-3"><i class="fas fa-check-circle me-2"></i>Completar Cierre de Orden</h6>
                    <div class="mb-3">
                        <label class="form-label">Notas de cierre <span class="text-danger">*</span></label>
                        <textarea id="notas-cierre" class="form-control" rows="3" placeholder="Describe lo que se hizo..." required></textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">¿El cliente pagó?</label>
                        <div class="btn-radio-group">
                            <input type="radio" class="btn-check" name="pago-cerrado" id="pago-cerrado-si" value="si" onclick="actualizarPanelPagoCierre()">
                            <label class="btn btn-outline-dark" for="pago-cerrado-si">Sí</label>
                            <input type="radio" class="btn-check" name="pago-cerrado" id="pago-cerrado-no" value="no" onclick="actualizarPanelPagoCierre()">
                            <label class="btn btn-outline-dark" for="pago-cerrado-no">No</label>
                        </div>
                    </div>
                    <div id="pago-metodo-panel" class="mb-3" style="display:none;">
                        <label class="form-label">Método de pago</label>
                        <div class="btn-option-group">
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Efectivo')">Efectivo</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Transferencia')">Transferencia</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Mercado Pago')">Mercado Pago</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Cheque')">Cheque</button>
                        </div>
                        <select id="metodo-pago-cierre" class="form-select" style="display:none;">
                            <option value="">Seleccione método...</option>
                            <option value="Efectivo">Efectivo</option>
                            <option value="Transferencia">Transferencia</option>
                            <option value="Mercado Pago">Mercado Pago</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                    </div>
                    <div id="pago-motivo-panel" class="mb-3" style="display:none;">
                        <label class="form-label">Motivo de pago pendiente</label>
                        <div class="btn-option-group">
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Cliente no tenía efectivo')">Sin efectivo</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Pago pendiente por transferencia')">Transferencia</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Cliente no se encontraba')">No estaba</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Otro')">Otro</button>
                        </div>
                        <select id="motivo-no-pago-cierre" class="form-select" style="display:none;">
                            <option value="">Seleccione motivo...</option>
                            <option value="Cliente no tenía efectivo">Cliente no tenía efectivo</option>
                            <option value="Pago pendiente por transferencia">Pago pendiente por transferencia</option>
                            <option value="Cliente no se encontraba">Cliente no se encontraba</option>
                            <option value="Otro">Otro</option>
                        </select>
                    </div>
                    <button class="btn btn-completar action-btn" onclick="aceptarYCerrarOrden()">
                        <i class="fas fa-check me-2"></i>Cerrar Orden
                    </button>
                </div>
            `;
            break;
        case 'Usuario Satisfecho':
            html = `
                <div id="cierre-panel" class="orden-card mb-3">
                    <h6 class="fw-bold mb-3"><i class="fas fa-check-double me-2"></i>Completar Cierre de Orden</h6>
                    <div class="mb-3">
                        <label class="form-label">Notas de cierre <span class="text-danger">*</span></label>
                        <textarea id="notas-cierre" class="form-control" rows="3" placeholder="Describe lo que se hizo..." required></textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">¿El cliente pagó?</label>
                        <div class="btn-radio-group">
                            <input type="radio" class="btn-check" name="pago-cerrado" id="pago-cerrado-si" value="si" onclick="actualizarPanelPagoCierre()">
                            <label class="btn btn-outline-dark" for="pago-cerrado-si">Sí</label>
                            <input type="radio" class="btn-check" name="pago-cerrado" id="pago-cerrado-no" value="no" onclick="actualizarPanelPagoCierre()">
                            <label class="btn btn-outline-dark" for="pago-cerrado-no">No</label>
                        </div>
                    </div>
                    <div id="pago-metodo-panel" class="mb-3" style="display:none;">
                        <label class="form-label">Método de pago</label>
                        <div class="btn-option-group">
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Efectivo')">Efectivo</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Transferencia')">Transferencia</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Mercado Pago')">Mercado Pago</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Cheque')">Cheque</button>
                        </div>
                        <select id="metodo-pago-cierre" class="form-select" style="display:none;">
                            <option value="">Seleccione método...</option>
                            <option value="Efectivo">Efectivo</option>
                            <option value="Transferencia">Transferencia</option>
                            <option value="Mercado Pago">Mercado Pago</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                    </div>
                    <div id="pago-motivo-panel" class="mb-3" style="display:none;">
                        <label class="form-label">Motivo de pago pendiente</label>
                        <div class="btn-option-group">
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Cliente no tenía efectivo')">Sin efectivo</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Pago pendiente por transferencia')">Transferencia</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Cliente no se encontraba')">No estaba</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Otro')">Otro</button>
                        </div>
                        <select id="motivo-no-pago-cierre" class="form-select" style="display:none;">
                            <option value="">Seleccione motivo...</option>
                            <option value="Cliente no tenía efectivo">Cliente no tenía efectivo</option>
                            <option value="Pago pendiente por transferencia">Pago pendiente por transferencia</option>
                            <option value="Cliente no se encontraba">Cliente no se encontraba</option>
                            <option value="Otro">Otro</option>
                        </select>
                    </div>
                    <button class="btn btn-completar action-btn" onclick="aceptarYCerrarOrden()">
                        <i class="fas fa-check me-2"></i>Cerrar Orden
                    </button>
                </div>
            `;
            break;
        case 'Cerrada':
            html = `
                <div class="text-center">
                    <p class="text-success"><i class="fas fa-check-circle me-2"></i>Orden ya cerrada</p>
                    <button class="btn btn-secondary action-btn" disabled>
                        <i class="fas fa-lock me-2"></i>Ya cerrada
                    </button>
                </div>
            `;
            break;
        case 'No Completada':
            html = `<p class="text-center text-warning"><i class="fas fa-exclamation-triangle me-2"></i>Orden No Completada</p>`;
            break;
    }

    container.innerHTML = html;
}

// ============================================
// ACCIONES DE TRABAJO
// ============================================

function navegarGPS() {
    if (!ordenActual || !ordenActual.direccion) {
        mostrarNotificacion('warning', 'Sin Dirección', 'Esta orden no tiene dirección registrada');
        return;
    }

    const query = encodeURIComponent(ordenActual.direccion);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
}

async function llegarAlSitio() {
    try {
        const posicion = await obtenerPosicionGPS();

        const response = await fetch(`${API_BASE}/cambiar-estado`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id,
                nuevo_estado: 'En Sitio',
                latitud: posicion.lat,
                longitud: posicion.lng
            })
        });

        const data = await response.json();

        if (data.success) {
            ordenActual.estado_trabajo = 'En Sitio';

            // Actualizar datos de domicilio si se calcularon
            if (data.domicilio && data.domicilio.calculado) {
                ordenActual.distancia_km = data.domicilio.distancia_km;
                ordenActual.cargo_domicilio = data.domicilio.cargo;
                ordenActual.domicilio_modo_cobro = data.domicilio.modo_cobro;

                if (data.domicilio.cargo > 0) {
                    mostrarNotificacion('success', 'Llegada registrada',
                        'Distancia: ' + data.domicilio.distancia_km + ' km — Cargo: $' + data.domicilio.cargo.toLocaleString('es-CL'));
                } else {
                    mostrarNotificacion('success', 'Llegada registrada',
                        'Distancia: ' + data.domicilio.distancia_km + ' km — Dentro del radio gratis');
                }
            } else {
                mostrarNotificacion('success', '¡Bien!', 'Has marcado que llegaste al sitio');
            }

            mostrarOrdenEnModal(ordenActual);
            cargarOrdenes();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al actualizar estado');
        }
    } catch (error) {
        console.error('Error al llegar al sitio:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo actualizar el estado');
    }
}

async function iniciarTrabajo() {
    try {
        const posicion = await obtenerPosicionGPS();

        const response = await fetch(`${API_BASE}/cambiar-estado`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id,
                nuevo_estado: 'En Progreso',
                latitud: posicion.lat,
                longitud: posicion.lng
            })
        });

        const data = await response.json();

        if (data.success) {
            ordenActual.estado_trabajo = 'En Progreso';
            mostrarNotificacion('success', '¡Excelente!', 'Trabajo iniciado');
            mostrarOrdenEnModal(ordenActual);
            cargarOrdenes();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al actualizar estado');
        }
    } catch (error) {
        console.error('Error al iniciar trabajo:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo iniciar el trabajo');
    }
}

function retomarTrabajo() {
    cambiarEstadoSimple('En Progreso', 'Trabajo retomado');
}

function mostrarConfirmacionCompletar() {
    if (confirm('¿Estás seguro de que has completado el trabajo?')) {
        cambiarEstadoSimple('Completada', 'Trabajo completado exitosamente');
    }
}

function cambiarEstadoSimple(nuevoEstado, mensaje) {
    fetch(`${API_BASE}/cambiar-estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            orden_id: ordenActual.id,
            tecnico_id: tecnicoActual.id,
            nuevo_estado: nuevoEstado
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            ordenActual.estado_trabajo = nuevoEstado;
            mostrarNotificacion('success', '¡Listo!', mensaje);
            mostrarOrdenEnModal(ordenActual);
            cargarOrdenes();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al actualizar');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo actualizar el estado');
    });
}

// ============================================
// FOTOS
// ============================================

function tomarFoto(tipo) {
    fotoTipoActual = tipo;
    document.getElementById('foto-input').click();
}

function handleFotoSeleccionada(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64 = e.target.result;

        try {
            const response = await fetch(`${API_BASE}/subir-foto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orden_id: ordenActual.id,
                    tecnico_id: tecnicoActual.id,
                    tipo_foto: fotoTipoActual,
                    imagen: base64
                })
            });

            const data = await response.json();

            if (data.success) {
                mostrarNotificacion('success', '¡Foto Guardada!', 'La foto se ha subido exitosamente');
                cargarFotos(ordenActual.id);
            } else {
                mostrarNotificacion('error', 'Error', data.error || 'Error al subir foto');
            }
        } catch (error) {
            console.error('Error al subir foto:', error);
            mostrarNotificacion('error', 'Error', 'No se pudo subir la foto');
        }
    };

    reader.readAsDataURL(file);
    event.target.value = ''; // Reset input
}

async function cargarFotos(ordenId) {
    try {
        const response = await fetch(`${API_BASE}/fotos?orden_id=${ordenId}`);
        const data = await response.json();

        if (data.success && data.fotos.length > 0) {
            let html = '';
            data.fotos.forEach(foto => {
                html += `
                    <div class="photo-item">
                        <img src="${foto.url_imagen}" alt="${foto.tipo_foto}">
                        <div class="position-absolute top-0 start-0 m-1">
                            <span class="badge bg-dark">${foto.tipo_foto}</span>
                        </div>
                    </div>
                `;
            });
            document.getElementById('fotos-grid').innerHTML = html;
        } else {
            document.getElementById('fotos-grid').innerHTML = '<p class="text-muted text-center">Sin fotos</p>';
        }
    } catch (error) {
        console.error('Error al cargar fotos:', error);
    }
}

// ============================================
// NOTAS
// ============================================

async function agregarNota() {
    const notaInput = document.getElementById('nueva-nota');
    const nota = notaInput.value.trim();

    if (!nota) return;

    try {
        const response = await fetch(`${API_BASE}/agregar-nota`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id,
                nota: nota
            })
        });

        const data = await response.json();

        if (data.success) {
            notaInput.value = '';
            cargarNotas(ordenActual.id);
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al agregar nota');
        }
    } catch (error) {
        console.error('Error al agregar nota:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo agregar la nota');
    }
}

async function cargarNotas(ordenId) {
    try {
        const response = await fetch(`${API_BASE}/notas?orden_id=${ordenId}`);
        const data = await response.json();

        if (data.success && data.notas.length > 0) {
            let html = '';
            data.notas.forEach(nota => {
                const fecha = new Date(nota.fecha_nota);
                const hora = fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                html += `
                    <div class="note-item">
                        <div class="note-time">${hora}</div>
                        <div>${nota.nota}</div>
                    </div>
                `;
            });
            document.getElementById('notas-lista').innerHTML = html;
        } else {
            document.getElementById('notas-lista').innerHTML = '<p class="text-muted text-center">Sin notas</p>';
        }
    } catch (error) {
        console.error('Error al cargar notas:', error);
    }
}

// ============================================
// HISTORIAL
// ============================================

async function cargarHistorial(ordenId) {
    try {
        const response = await fetch(`${API_BASE}/historial?orden_id=${ordenId}`);
        const data = await response.json();

        if (data.success && data.historial.length > 0) {
            let html = '';
            data.historial.forEach(item => {
                const fecha = new Date(item.fecha_hora);
                const fechaFormateada = fecha.toLocaleString('es-CL');
                html += `
                    <div class="d-flex mb-2">
                        <div class="me-2">
                            <i class="fas fa-circle text-success" style="font-size: 8px;"></i>
                        </div>
                        <div>
                            <div class="fw-bold">${item.estado_nuevo}</div>
                            <div class="small text-muted">${fechaFormateada}</div>
                            ${item.observaciones ? `<div class="small text-info">${item.observaciones}</div>` : ''}
                        </div>
                    </div>
                `;
            });
            document.getElementById('historial-lista').innerHTML = html;
        } else {
            document.getElementById('historial-lista').innerHTML = '<p class="text-muted text-center">Sin historial</p>';
        }
    } catch (error) {
        console.error('Error al cargar historial:', error);
    }
}

// ============================================
// ENVIAR LINK DE FIRMA AL CLIENTE
// ============================================

async function generarTokenFirma() {
    try {
        const response = await fetch(`${API_BASE}/generar-token-firma`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id
            })
        });

        const data = await response.json();

        if (data.success) {
            return data.token;
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al generar token');
            return null;
        }
    } catch (error) {
        console.error('Error al generar token:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo generar el link');
        return null;
    }
}

function enviarLinkFirma(notasCierre = null, pagoCompletado = null, metodoPago = null) {
    generarTokenFirma().then(token => {
        if (!token) return;

        let linkFirma = `${window.location.origin}/aprobar-tecnico?token=${token}`;
        if (notasCierre) linkFirma += `&notas=${encodeURIComponent(notasCierre)}`;
        if (pagoCompletado !== null) linkFirma += `&pago_completado=${pagoCompletado}`;
        if (metodoPago) linkFirma += `&metodo_pago=${encodeURIComponent(metodoPago)}`;

        let mensajeCompleto = `Hola, su orden de trabajo #${String(ordenActual.numero_orden).padStart(6,'0')} está lista para su aceptación final.\n` +
            `Resumen:\n` +
            `Cliente: ${ordenActual.cliente_nombre || 'N/A'}\n` +
            `Patente: ${ordenActual.patente_placa || 'N/A'}\n` +
            `Trabajo: ${ordenActual.trabajo_frenos ? 'Frenos ' : ''}${ordenActual.trabajo_luces ? 'Luces ' : ''}${ordenActual.trabajo_tren_delantero ? 'Tren delantero ' : ''}${ordenActual.trabajo_correas ? 'Correas ' : ''}${ordenActual.trabajo_componentes ? 'Componentes ' : ''}\n` +
            `Monto total: $${Number(ordenActual.monto_total || 0).toFixed(2)}\n` +
            `Restante: $${Number(ordenActual.monto_restante || 0).toFixed(2)}\n`;

        if (notasCierre) {
            mensajeCompleto += `Notas del técnico: ${notasCierre}\n`;
        }

        mensajeCompleto += `Por favor ingrese al siguiente link para revisar y firmar la aceptación:\n${linkFirma}`;

        // Abrir WhatsApp si teléfono cliente existe
        if (ordenActual && ordenActual.cliente_telefono) {
            const telefonoLimpio = normalizarTelefonoWhatsApp(ordenActual.cliente_telefono);
            if (telefonoLimpio) {
                const whatsappUrl = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensajeCompleto)}`;
                window.open(whatsappUrl, '_blank');
            }
        }

        // Mostrar modal con link + opción para abrir la página de firma directamente
        mostrarModalLinkFirma(linkFirma, mensajeCompleto);
    });
}

function copiarLinkFirma(url) {
    navigator.clipboard.writeText(url).then(() => {
        mostrarNotificacion('success', 'Link Copiado', 'El link ha sido copiado al portapapeles');
    }).catch(err => {
        console.error('Error al copiar:', err);
        mostrarNotificacion('error', 'Error', 'No se pudo copiar el link');
    });
}

function mostrarModalLinkFirma(link, mensaje = null) {
    const modalHtml = `
        <div class="modal fade" id="modalLinkFirma" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">Link de Firma Generado</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="text-muted">Envíe este link al cliente para que firme la orden y confirme el trabajo:</p>
                        <div class="input-group mb-3">
                            <input type="text" class="form-control" value="${link}" readonly id="link-firma-input">
                            <button class="btn btn-outline-success" onclick="copiarLinkFirmaModal('${link}')">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <div class="d-grid gap-2 mb-3">
                            <button class="btn btn-primary" onclick="window.open('${link}', '_blank')">
                                <i class="fas fa-external-link-alt me-2"></i>Abrir página de firma
                            </button>
                        </div>
                        ${mensaje ? `<p class="small text-muted">Mensaje prellenado WhatsApp:<br>${mensaje.replace(/\n/g,'<br>')}</p>` : ''}
                        <div class="alert alert-info small">
                            <i class="fas fa-info-circle me-2"></i>
                            El cliente tendrá un resumen de la orden + canvas de firma en la página.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Eliminar modal existente si hay uno
    const modalExistente = document.getElementById('modalLinkFirma');
    if (modalExistente) {
        modalExistente.remove();
    }

    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalLinkFirma'));
    modal.show();
}

function copiarLinkFirmaModal(link) {
    navigator.clipboard.writeText(link).then(() => {
        mostrarNotificacion('success', 'Link Copiado', 'El link ha sido copiado al portapapeles');
    }).catch(() => {
        const input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        mostrarNotificacion('success', 'Link Copiado', 'El link ha sido copiado al portapapeles');
    });
}

async function aceptarYCerrarOrden() {
    if (!ordenActual || !tecnicoActual) {
        mostrarNotificacion('error', 'Error', 'No se puede procesar la orden en este momento');
        return;
    }

    if (ordenActual.estado_trabajo === 'Cerrada') {
        mostrarNotificacion('warning', 'Orden cerrada', 'Esta orden ya está cerrada y no puede volver a procesarse.');
        return;
    }

    const notasCierreInput = document.getElementById('notas-cierre');
    const notasCierre = notasCierreInput ? notasCierreInput.value.trim() : '';
    if (!notasCierre) {
        mostrarNotificacion('warning', 'Notas obligatorias', 'Debe ingresar las notas de cierre antes de cerrar la orden');
        if (notasCierreInput) notasCierreInput.focus();
        return;
    }

    const pagoSeleccionado = document.querySelector('input[name="pago-cerrado"]:checked');
    if (!pagoSeleccionado) {
        mostrarNotificacion('warning', 'Pago obligatorio', 'Debe indicar si el cliente pagó o no antes de cerrar la orden');
        return;
    }

    const pagoCompletado = pagoSeleccionado.value === 'si';
    let metodoPago = null;
    let motivoNoPago = null;

    if (pagoCompletado) {
        const metodoSelect = document.getElementById('metodo-pago-cierre');
        metodoPago = metodoSelect ? metodoSelect.value : '';
        if (!metodoPago) {
            mostrarNotificacion('warning', 'Método obligatorio', 'Debe seleccionar el método de pago del cliente');
            if (metodoSelect) metodoSelect.focus();
            return;
        }
    } else {
        const motivoSelect = document.getElementById('motivo-no-pago-cierre');
        motivoNoPago = motivoSelect ? motivoSelect.value : '';
        if (!motivoNoPago) {
            mostrarNotificacion('warning', 'Motivo obligatorio', 'Debe seleccionar el motivo por el cual no pagó el cliente');
            if (motivoSelect) motivoSelect.focus();
            return;
        }
    }

    // Generar token de firma
    try {
        const tokenResponse = await fetch(`${API_BASE}/generar-token-firma`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id
            })
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.success) {
            mostrarNotificacion('error', 'Error', tokenData.error || 'No se pudo generar el token de firma');
            return;
        }

        const token = tokenData.token;
        const metodoPagoParam = pagoCompletado ? metodoPago : `Pago pendiente: ${motivoNoPago}`;

        // Construir URL de firma con parámetros
        const firmaUrl = `${window.location.origin}/aprobar-tecnico?token=${encodeURIComponent(token)}&notas=${encodeURIComponent(notasCierre)}&pago_completado=${pagoCompletado}&metodo_pago=${encodeURIComponent(metodoPagoParam)}`;

        // Mostrar botones para compartir el link
        const cierrePanel = document.getElementById('cierre-panel');
        if (cierrePanel) {
            cierrePanel.innerHTML = `
                <div class="orden-card mb-3">
                    <h6 class="fw-bold mb-3"><i class="fas fa-share-alt me-2"></i>Compartir Link de Firma</h6>
                    <p class="text-muted mb-3">Envía este link al cliente para que firme y cierre la orden.</p>
                    <div class="d-grid gap-2">
                        <button class="btn btn-primary" onclick="copiarLinkFirma('${firmaUrl}')">
                            <i class="fas fa-copy me-2"></i>Copiar Link
                        </button>
                        <button class="btn btn-success" onclick="enviarWhatsApp('${firmaUrl}')">
                            <i class="fab fa-whatsapp me-2"></i>Enviar por WhatsApp
                        </button>
                    </div>
                </div>
            `;
        }

        mostrarNotificacion('success', 'Link generado', 'Se ha generado el link de firma. Compártelo con el cliente.');

    } catch (error) {
        console.error('Error al generar token de firma:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo iniciar el proceso de firma. Intente nuevamente.');
    }
}

function actualizarPanelPagoCierre() {
    const pagoSi = document.getElementById('pago-cerrado-si')?.checked;
    const pagoNo = document.getElementById('pago-cerrado-no')?.checked;
    const metodoPanel = document.getElementById('pago-metodo-panel');
    const motivoPanel = document.getElementById('pago-motivo-panel');
    const metodoSelect = document.getElementById('metodo-pago-cierre');
    const motivoSelect = document.getElementById('motivo-no-pago-cierre');

    if (metodoPanel) metodoPanel.style.display = pagoSi ? 'block' : 'none';
    if (motivoPanel) motivoPanel.style.display = pagoNo ? 'block' : 'none';

    if (pagoSi && motivoSelect) {
        motivoSelect.value = '';
        document.querySelectorAll('#pago-motivo-panel .option-btn').forEach(btn => btn.classList.remove('active'));
    }
    if (pagoNo && metodoSelect) {
        metodoSelect.value = '';
        document.querySelectorAll('#pago-metodo-panel .option-btn').forEach(btn => btn.classList.remove('active'));
    }
}

function seleccionarMetodoPagoCierre(metodo) {
    const metodoSelect = document.getElementById('metodo-pago-cierre');
    if (!metodoSelect) return;
    metodoSelect.value = metodo;
    document.querySelectorAll('#pago-metodo-panel .option-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === metodo);
    });
}

function seleccionarMotivoNoPagoCierre(motivo) {
    const motivoSelect = document.getElementById('motivo-no-pago-cierre');
    if (!motivoSelect) return;
    motivoSelect.value = motivo;
    document.querySelectorAll('#pago-motivo-panel .option-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === motivo);
    });
}

function enviarResumenWhatsApp() {
    if (!ordenActual) return;

    const tel = normalizarTelefonoWhatsApp(ordenActual.cliente_telefono);
    if (!tel) {
        mostrarNotificacion('error', 'Error', 'Número de teléfono inválido');
        return;
    }

    const mensaje = encodeURIComponent(`Pedido #${String(ordenActual.numero_orden).padStart(6, '0')} cerrado.\n` +
        `Cliente: ${ordenActual.cliente_nombre || 'N/A'}\n` +
        `Vehículo: ${ordenActual.marca || 'N/A'} ${ordenActual.modelo || ''} ${ordenActual.patente_placa || ''}\n` +
        `Estado final: ${ordenActual.estado_trabajo || ordenActual.estado}\n` +
        `Fecha cierre: ${new Date().toLocaleString('es-CL')}\n` +
        `Gracias por su confianza en Global Pro!`);

    const whatsappUrl = `https://wa.me/${tel}?text=${mensaje}`;
    window.open(whatsappUrl, '_blank');
}

// ============================================
// ORDEN NO COMPLETADA
// ============================================

function abrirModalNoCompletada() {
    const modal = new bootstrap.Modal(document.getElementById('modalNoCompletada'));
    modal.show();
}

async function guardarNoCompletada() {
    const motivo = document.getElementById('motivo-no-completada').value;
    const detalles = document.getElementById('detalles-no-completada').value.trim();

    if (!motivo) {
        mostrarNotificacion('warning', 'Falta Motivo', 'Seleccione el motivo por el cual no se completó');
        return;
    }

    try {
        let posicion = {};
        try {
            posicion = await obtenerPosicionGPS();
        } catch (e) {
            console.log('No se pudo obtener GPS');
        }

        const response = await fetch(`${API_BASE}/cambiar-estado`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id,
                nuevo_estado: 'No Completada',
                observaciones: `${motivo}. ${detalles}`,
                latitud: posicion.lat || null,
                longitud: posicion.lng || null
            })
        });

        const data = await response.json();

        if (data.success) {
            ordenActual.estado_trabajo = 'No Completada';
            mostrarNotificacion('warning', 'Reportado', 'La orden ha sido marcada como no completada');

            // Cerrar modal y actualizar
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalNoCompletada'));
            modal.hide();

            mostrarOrdenEnModal(ordenActual);
            cargarOrdenes();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al reportar');
        }
    } catch (error) {
        console.error('Error al guardar no completada:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo reportar');
    }
}

// ============================================
// UTILIDADES
// ============================================

function obtenerPosicionGPS() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocalización no soportada'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

function obtenerClaseEstado(estado) {
    const clases = {
        'Pendiente Visita': 'estado-pendiente-visita',
        'En Sitio': 'estado-en-sitio',
        'En Progreso': 'estado-en-progreso',
        'Pendiente Piezas': 'estado-pendiente-piezas',
        'Completada': 'estado-completada',
        'Aprobada': 'estado-aprobada',
        'Usuario Satisfecho': 'estado-aprobada',
        'No Completada': 'estado-no-completada',
        'Cerrada': 'estado-cerrada'
    };
    return clases[estado] || 'bg-secondary';
}

function mostrarNotificacion(tipo, titulo, mensaje) {
    // Crear toast dinámicamente
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    toastContainer.style.zIndex = '9999';

    const bgClass = tipo === 'success' ? 'bg-success' :
                    tipo === 'error' ? 'bg-danger' :
                    tipo === 'warning' ? 'bg-warning' : 'bg-primary';

    toastContainer.innerHTML = `
        <div class="toast show" role="alert">
            <div class="toast-header ${bgClass} text-white">
                <strong class="me-auto">${titulo}</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
            </div>
            <div class="toast-body">
                ${mensaje}
            </div>
        </div>
    `;

    document.body.appendChild(toastContainer);

    // Remover después de 3 segundos
    setTimeout(() => {
        toastContainer.remove();
    }, 3000);
}

// ============================================
// HELPER: Normalizar teléfono para WhatsApp (wa.me)
// wa.me necesita SOLO digitos, sin +
// - Chile (empieza con 9): agregar 56 al inicio
// - Internacional (+58, +1, etc): dejar tal cual (sin +)
// ============================================
function normalizarTelefonoWhatsApp(telefono) {
    if (!telefono) return '';
    // Quitar todo lo que no sea digito
    let tel = String(telefono).replace(/\D/g, '');
    // Si empieza con 9 (formato local chileno), agregar prefijo 56
    if (tel.startsWith('9') && tel.length <= 9) {
        tel = '56' + tel;
    }
    // Validar longitud minima
    if (tel.length < 10) return '';
    return tel;
}

function enviarWhatsApp(url) {
    if (!ordenActual || !ordenActual.cliente_telefono) {
        mostrarNotificacion('error', 'Error', 'No se encontró el número de teléfono del cliente');
        return;
    }

    const telefono = normalizarTelefonoWhatsApp(ordenActual.cliente_telefono);
    if (!telefono) {
        mostrarNotificacion('error', 'Error', 'Número de teléfono inválido');
        return;
    }

    const mensaje = encodeURIComponent(`Firma la orden aquí: ${url}`);
    const whatsappUrl = `https://wa.me/${telefono}?text=${mensaje}`;

    window.open(whatsappUrl, '_blank');
}

// Actualizar órdenes cada 30 segundos
setInterval(() => {
    if (tecnicoActual && document.getElementById('app-screen').style.display !== 'none') {
        cargarOrdenes();
    }
}, 30000);
