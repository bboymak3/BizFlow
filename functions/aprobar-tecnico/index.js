// ============================================
// BIZFLOW - Cierre Técnico de Orden de Trabajo
// Cloudflare Pages Function
// GET  ?token=xxx&notas=xxx&pago_completado=true&metodo_pago=Efectivo
// POST ?token=xxx&confirmar_firma=si  → Close order + save signature
// ============================================

import {
  handleOptions,
  htmlResponse,
  jsonResponse,
  getOrderByToken,
  buildPageHead,
  buildOrderInfoCard,
  buildClientInfoCard,
  buildVehicleInfoCard,
  buildDomicilioCard,
  buildServicesCard,
  buildChecklistCard,
  buildCostsCard,
  buildTotalsCard,
  buildNotesCard,
  buildSignatureCanvasHtml,
  buildSignatureCanvasScript,
  buildJsPDFGeneratorScript,
  getJsPDFScript,
  escapeHtml,
  formatDateTime,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

// ─────────────────────────────────────────────
// GET: Render technician closure page
// ─────────────────────────────────────────────
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return htmlResponse(renderError('Token no proporcionado', 'El enlace de acceso es inv\u00e1lido.'));
  }

  const data = await getOrderByToken(env.DB, token);
  if (!data) {
    return htmlResponse(renderError('Enlace inv\u00e1lido o expirado', 'No se encontr\u00f3 ninguna orden de trabajo asociada a este enlace.'));
  }

  const { order, client, vehicle, costs, config } = data;

  // Get extra params from URL
  const notasCierre = url.searchParams.get('notas') || '';
  const pagoCompletado = url.searchParams.get('pago_completado') === 'true';
  const metodoPago = url.searchParams.get('metodo_pago') || '';

  // If already closed, show confirmation
  if (order.estado === 'Cerrada') {
    return htmlResponse(renderAlreadyClosed(order, client, vehicle, costs, config));
  }

  // Show closure page
  return htmlResponse(renderClosurePage(order, client, vehicle, costs, config, token, notasCierre, pagoCompletado, metodoPago));
}

// ─────────────────────────────────────────────
// POST: Save signature and close order
// ─────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const confirmar = url.searchParams.get('confirmar_firma');

  if (!token || confirmar !== 'si') {
    return jsonResponse({ error: 'Par\u00e1metros inv\u00e1lidos' }, 400);
  }

  const data = await getOrderByToken(env.DB, token);
  if (!data) {
    return jsonResponse({ error: 'Orden no encontrada' }, 404);
  }

  const { order } = data;

  if (order.estado === 'Cerrada') {
    return jsonResponse({ error: 'La orden ya fue cerrada', alreadyClosed: true });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Body inv\u00e1lido' }, 400);
  }

  const firma = body.firma;
  if (!firma) {
    return jsonResponse({ error: 'No se recibi\u00f3 la firma' }, 400);
  }

  const now = new Date().toISOString();

  // Close the order: set estado and estado_trabajo to 'Cerrada'
  await env.DB.prepare(`
    UPDATE OrdenesTrabajo
    SET estado = 'Cerrada',
        estado_trabajo = 'Cerrada',
        firma_imagen = COALESCE(firma_imagen, ?),
        fecha_aprobacion = COALESCE(fecha_aprobacion, ?),
        fecha_completado = ?
    WHERE token = ?
  `).bind(firma, now, now, token).run();

  return jsonResponse({ success: true, message: 'Orden cerrada correctamente' });
}

// ─────────────────────────────────────────────
// Render functions
// ─────────────────────────────────────────────

function renderError(title, message) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - BizFlow</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; background: #f9fafb; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .error-box { text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 420px; width: 90%; }
    .error-icon { width: 72px; height: 72px; border-radius: 50%; background: #fef2f2; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin: 0 auto 20px; }
    .error-box h2 { font-size: 1.2rem; font-weight: 700; color: #111827; margin-bottom: 8px; }
    .error-box p { color: #6b7280; font-size: 0.9rem; margin: 0; }
  </style>
</head>
<body>
  <div class="error-box">
    <div class="error-icon"><i class="fas fa-link-slash"></i></div>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

function renderAlreadyClosed(order, client, vehicle, costs, config) {
  const html = buildPageHead('Orden Cerrada', config);
  return `${html}
<body>
<div class="page-wrapper">
  <div class="top-bar" style="background:linear-gradient(135deg, #374151 0%, #111827 100%);">
    <h1><i class="fas fa-lock me-2"></i>Orden Cerrada</h1>
    <div class="subtitle">${escapeHtml(config?.negocio_nombre || 'BizFlow')}</div>
  </div>
  <div class="content">
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#e5e7eb 0%,#d1d5db 100%);padding:30px 20px;text-align:center;">
        <div style="font-size:3rem;margin-bottom:12px;">\u2705</div>
        <h2 style="font-size:1.3rem;font-weight:800;color:#1f2937;margin:0 0 6px;">\u00a1Orden Cerrada!</h2>
        <p style="color:#4b5563;font-size:0.9rem;margin:0;">
          Esta orden fue cerrada el ${order.fecha_completado ? formatDateTime(order.fecha_completado) : 'fecha no registrada'}
        </p>
      </div>
    </div>

    ${buildOrderInfoCard(order)}
    ${buildClientInfoCard(client, order)}
    ${buildVehicleInfoCard(order, vehicle)}
    ${buildDomicilioCard(order)}
    ${buildServicesCard(order)}
    ${buildChecklistCard(order)}
    ${buildCostsCard(costs)}
    ${buildTotalsCard(order)}
    ${buildNotesCard(order)}

    ${order.firma_imagen ? `
    <div class="card">
      <div class="card-header">
        <div class="icon-circle"><i class="fas fa-signature"></i></div>
        <h2>Firma Registrada</h2>
      </div>
      <img id="signatureImg" src="${order.firma_imagen}" class="signature-preview" alt="Firma">
    </div>` : ''}

    <div class="btn-group-actions no-print">
      <button class="btn-action btn-pdf" onclick="generatePDF()">
        <i class="fas fa-file-pdf me-2"></i>Descargar PDF
      </button>
      <a id="whatsappLink" href="#" class="btn-action btn-whatsapp" target="_blank">
        <i class="fab fa-whatsapp me-2"></i>Compartir por WhatsApp
      </a>
    </div>

    <!-- Hidden PDF data -->
    <span id="bizName" style="display:none">${escapeHtml(config?.negocio_nombre || '')}</span>
    <span id="bizAddr" style="display:none">${escapeHtml(config?.negocio_direccion || '')}</span>
    <span id="bizPhone" style="display:none">${escapeHtml(config?.negocio_telefono || '')}</span>
    <span id="bizEmail" style="display:none">${escapeHtml(config?.negocio_email || '')}</span>
    <span id="clientName" style="display:none">${escapeHtml(client?.nombre || '')}</span>
    <span id="clientPhone" style="display:none">${escapeHtml(client?.telefono || '')}</span>
    <span id="clientAddr" style="display:none">${escapeHtml(client?.direccion || order?.direccion || '')}</span>
    <span id="clientRut" style="display:none">${escapeHtml(client?.rut || '\u2014')}</span>
    <span id="vehiclePatente" style="display:none">${escapeHtml(vehicle?.patente_placa || order?.patente_placa || '')}</span>
    <span id="vehicleMarca" style="display:none">${escapeHtml(vehicle?.marca || order?.marca || '')}</span>
    <span id="vehicleModelo" style="display:none">${escapeHtml(vehicle?.modelo || order?.modelo || '')}</span>
    <span id="vehicleAnio" style="display:none">${escapeHtml(String(vehicle?.anio || order?.anio || ''))}</span>
    <span id="vehicleCilindrada" style="display:none">${escapeHtml(vehicle?.cilindrada || order?.cilindrada || '\u2014')}</span>
    <span id="vehicleCombustible" style="display:none">${escapeHtml(vehicle?.combustible || order?.combustible || '')}</span>
    <span id="vehicleKm" style="display:none">${escapeHtml(String(vehicle?.kilometraje || order?.kilometraje || ''))}</span>
    <span id="domDistancia" style="display:none">${(parseFloat(order.distancia_km) || 0).toFixed(1)} km</span>
    <span id="domCargo" style="display:none">${'$' + (parseFloat(order.cargo_domicilio) || 0).toLocaleString('es-MX')}</span>
    <span id="fuelLevel" style="display:none">${escapeHtml(order.nivel_combustible || '\u2014')}</span>
    <span id="totalValue" style="display:none">${'$' + (parseFloat(order.monto_total) || 0).toLocaleString('es-MX')}</span>
    <span id="abonoValue" style="display:none">${(parseFloat(order.monto_abono) || 0) > 0 ? '$' + (parseFloat(order.monto_abono)).toLocaleString('es-MX') : ''}</span>
    <span id="restanteValue" style="display:none">${'$' + (parseFloat(order.monto_restante) || 0).toLocaleString('es-MX')}</span>
    <span id="notesText" style="display:none">${escapeHtml((order.notas || '') + (order.diagnostico_observaciones ? '\n' + order.diagnostico_observaciones : ''))}</span>
    <span id="orderNumber" style="display:none">#${escapeHtml(String(order.numero_orden || '').padStart(5, '0'))}</span>
    <span id="orderDate" style="display:none">${escapeHtml(order.fecha_ingreso || '')}</span>
    <span id="orderStatus" style="display:none">${escapeHtml(order.estado || '')}</span>
  </div>
</div>

${getJsPDFScript()}
${buildJsPDFGeneratorScript('tecnico')}
<script>
(function(){
  const phone = '${escapeHtml(client?.telefono || '')}';
  const link = document.getElementById('whatsappLink');
  if (phone && link) {
    const num = '${escapeHtml(String(order.numero_orden || '').padStart(5, '0'))}';
    const text = encodeURIComponent('Hola, su orden de trabajo #' + num + ' ha sido cerrada. Puede retirar su veh\u00edculo. Gracias.');
    link.href = 'https://wa.me/' + phone.replace(/[^0-9+]/g,'') + '?text=' + text;
  } else if (link) {
    link.style.display = 'none';
  }
})();
</script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
}

function renderClosurePage(order, client, vehicle, costs, config, token, notasCierre, pagoCompletado, metodoPago) {
  const html = buildPageHead('Cierre T\u00e9cnico', config);
  return `${html}
<body>
<div class="page-wrapper">
  <div class="top-bar" style="background:linear-gradient(135deg, #374151 0%, #111827 100%);">
    <h1><i class="fas fa-wrench me-2"></i>Cierre de Orden</h1>
    <div class="subtitle">${escapeHtml(config?.negocio_nombre || 'BizFlow')} \u2014 Firma del cliente para entrega</div>
  </div>
  <div class="content">

    <!-- Closure info banner -->
    <div class="card" style="background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-color:#d1d5db;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="width:44px;height:44px;border-radius:12px;background:#374151;color:white;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">
          <i class="fas fa-clipboard-check"></i>
        </div>
        <div>
          <h3 style="font-size:1rem;font-weight:700;color:#1f2937;margin:0 0 4px;">Entrega de veh\u00edculo</h3>
          <p style="font-size:0.85rem;color:#4b5563;margin:0;">
            El t\u00e9cnico ha completado el trabajo. Firme para confirmar la entrega de su veh\u00edculo y aceptar los trabajos realizados.
          </p>
        </div>
      </div>
    </div>

    <!-- Closing notes from technician -->
    ${notasCierre ? `
    <div class="card">
      <div class="card-header">
        <div class="icon-circle" style="background:#e5e7eb;color:#374151;"><i class="fas fa-comment-dots"></i></div>
        <h2>Notas del Cierre</h2>
      </div>
      <div class="notes-box">${escapeHtml(notasCierre)}</div>
    </div>` : ''}

    <!-- Payment info -->
    <div class="card">
      <div class="card-header">
        <div class="icon-circle" style="background:#dbeafe;color:#2563eb;"><i class="fas fa-credit-card"></i></div>
        <h2>Estado de Pago</h2>
      </div>
      <div class="info-row">
        <span class="info-label">Pago completado</span>
        <span class="info-value">
          <span class="badge ${pagoCompletado ? 'badge-approved' : 'badge-pending'}">
            ${pagoCompletado ? 'S\u00ed' : 'No'}
          </span>
        </span>
      </div>
      ${metodoPago ? `
      <div class="info-row">
        <span class="info-label">M\u00e9todo de pago</span>
        <span class="info-value">${escapeHtml(metodoPago)}</span>
      </div>` : ''}
      ${!pagoCompletado && (parseFloat(order.monto_restante) || 0) > 0 ? `
      <div class="info-row">
        <span class="info-label">Monto pendiente</span>
        <span class="info-value" style="color:var(--danger);font-weight:700;">
          ${'$' + (parseFloat(order.monto_restante) || 0).toLocaleString('es-MX')}
        </span>
      </div>` : ''}
    </div>

    ${buildOrderInfoCard(order)}
    ${buildClientInfoCard(client, order)}
    ${buildVehicleInfoCard(order, vehicle)}
    ${buildDomicilioCard(order)}
    ${buildServicesCard(order)}
    ${buildChecklistCard(order)}
    ${buildCostsCard(costs)}
    ${buildTotalsCard(order)}
    ${buildNotesCard(order)}

    ${buildSignatureCanvasHtml()}

    <div id="loadingOverlay" style="display:none;text-align:center;padding:20px;">
      <div class="spinner-border" role="status" style="width:2.5rem;height:2.5rem;color:#374151;">
        <span class="visually-hidden">Procesando...</span>
      </div>
      <p style="margin-top:10px;color:var(--gray-500);font-size:0.9rem;">Cerrando orden y guardando firma...</p>
    </div>

    <div id="actionButtons">
      <button class="btn-action" style="background:linear-gradient(135deg,#374151 0%,#111827 100%);color:white;box-shadow:0 4px 14px rgba(55,65,81,0.4);" onclick="submitClosure()">
        <i class="fas fa-check-circle me-2"></i>FIRMAR Y CERRAR ORDEN
      </button>
      <button class="btn-action btn-danger-outline" onclick="cancelClosure()">
        <i class="fas fa-times me-2"></i>CANCELAR
      </button>
    </div>

    <!-- Hidden PDF data -->
    <span id="bizName" style="display:none">${escapeHtml(config?.negocio_nombre || '')}</span>
    <span id="bizAddr" style="display:none">${escapeHtml(config?.negocio_direccion || '')}</span>
    <span id="bizPhone" style="display:none">${escapeHtml(config?.negocio_telefono || '')}</span>
    <span id="bizEmail" style="display:none">${escapeHtml(config?.negocio_email || '')}</span>
    <span id="clientName" style="display:none">${escapeHtml(client?.nombre || '')}</span>
    <span id="clientPhone" style="display:none">${escapeHtml(client?.telefono || '')}</span>
    <span id="clientAddr" style="display:none">${escapeHtml(client?.direccion || order?.direccion || '')}</span>
    <span id="clientRut" style="display:none">${escapeHtml(client?.rut || '\u2014')}</span>
    <span id="vehiclePatente" style="display:none">${escapeHtml(vehicle?.patente_placa || order?.patente_placa || '')}</span>
    <span id="vehicleMarca" style="display:none">${escapeHtml(vehicle?.marca || order?.marca || '')}</span>
    <span id="vehicleModelo" style="display:none">${escapeHtml(vehicle?.modelo || order?.modelo || '')}</span>
    <span id="vehicleAnio" style="display:none">${escapeHtml(String(vehicle?.anio || order?.anio || ''))}</span>
    <span id="vehicleCilindrada" style="display:none">${escapeHtml(vehicle?.cilindrada || order?.cilindrada || '\u2014')}</span>
    <span id="vehicleCombustible" style="display:none">${escapeHtml(vehicle?.combustible || order?.combustible || '')}</span>
    <span id="vehicleKm" style="display:none">${escapeHtml(String(vehicle?.kilometraje || order?.kilometraje || ''))}</span>
    <span id="domDistancia" style="display:none">${(parseFloat(order.distancia_km) || 0).toFixed(1)} km</span>
    <span id="domCargo" style="display:none">${'$' + (parseFloat(order.cargo_domicilio) || 0).toLocaleString('es-MX')}</span>
    <span id="fuelLevel" style="display:none">${escapeHtml(order.nivel_combustible || '\u2014')}</span>
    <span id="totalValue" style="display:none">${'$' + (parseFloat(order.monto_total) || 0).toLocaleString('es-MX')}</span>
    <span id="abonoValue" style="display:none">${(parseFloat(order.monto_abono) || 0) > 0 ? '$' + (parseFloat(order.monto_abono)).toLocaleString('es-MX') : ''}</span>
    <span id="restanteValue" style="display:none">${'$' + (parseFloat(order.monto_restante) || 0).toLocaleString('es-MX')}</span>
    <span id="notesText" style="display:none">${escapeHtml((order.notas || '') + (order.diagnostico_observaciones ? '\n' + order.diagnostico_observaciones : '') + (notasCierre ? '\nNotas cierre: ' + notasCierre : ''))}</span>
    <span id="orderNumber" style="display:none">#${escapeHtml(String(order.numero_orden || '').padStart(5, '0'))}</span>
    <span id="orderDate" style="display:none">${escapeHtml(order.fecha_ingreso || '')}</span>
    <span id="orderStatus" style="display:none">${escapeHtml(order.estado || '')}</span>

  </div>
</div>

${getJsPDFScript()}
${buildSignatureCanvasScript()}
${buildJsPDFGeneratorScript('tecnico')}
<script>
const TOKEN = '${token}';

async function submitClosure() {
  if (window.isSignatureEmpty()) {
    showToast('Por favor firme antes de continuar', 'warning');
    return;
  }

  const firma = window.getSignatureData();
  if (!firma) {
    showToast('Error al capturar la firma', 'danger');
    return;
  }

  if (!confirm('\u00bfConfirma la firma para el cierre y entrega del veh\u00edculo?')) return;

  document.getElementById('loadingOverlay').style.display = 'block';
  document.getElementById('actionButtons').style.display = 'none';
  document.getElementById('signatureCard').style.display = 'none';

  try {
    const resp = await fetch(window.location.pathname + '?token=' + TOKEN + '&confirmar_firma=si', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firma }),
    });

    const data = await resp.json();

    if (data.success) {
      showClosureConfirmation();
    } else if (data.alreadyClosed) {
      showToast('Esta orden ya fue cerrada', 'info');
      setTimeout(() => location.reload(), 1500);
    } else {
      throw new Error(data.error || 'Error desconocido');
    }
  } catch (err) {
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('actionButtons').style.display = '';
    document.getElementById('signatureCard').style.display = '';
    showToast('Error: ' + err.message, 'danger');
  }
}

function cancelClosure() {
  if (confirm('\u00bfEst\u00e1 seguro de que desea cancelar? No se realizar\u00e1 ning\u00fan cambio.')) {
    window.location.href = window.location.pathname + '?token=' + TOKEN;
  }
}

function showClosureConfirmation() {
  document.getElementById('loadingOverlay').style.display = 'none';
  const content = document.querySelector('.content');
  content.innerHTML = \`
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%);padding:40px 20px;text-align:center;">
        <div style="width:80px;height:80px;border-radius:50%;background:#059669;color:white;display:flex;align-items:center;justify-content:center;font-size:2.5rem;margin:0 auto 20px;animation:scaleIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275);">
          <i class="fas fa-check"></i>
        </div>
        <h2 style="font-size:1.5rem;font-weight:800;color:#065f46;margin:0 0 8px;">\u00a1Orden Cerrada!</h2>
        <p style="color:#047857;font-size:0.95rem;margin:0 0 4px;">La orden de trabajo ha sido cerrada exitosamente.</p>
        <p style="color:#047857;font-size:0.85rem;margin:0;opacity:0.8;">Su firma ha sido registrada como conformidad con el trabajo realizado.</p>
      </div>
    </div>
    <div class="btn-group-actions" style="margin-top:20px;">
      <button class="btn-action btn-pdf" onclick="generatePDF()">
        <i class="fas fa-file-pdf me-2"></i>Descargar PDF
      </button>
      <a href="https://wa.me/${(client?.telefono || '').replace(/[^0-9+]/g,'')}" class="btn-action btn-whatsapp" target="_blank">
        <i class="fab fa-whatsapp me-2"></i>Compartir por WhatsApp
      </a>
    </div>
  \`;
}

function showToast(message, type) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:' +
    (type === 'danger' ? '#dc2626' : type === 'warning' ? '#f59e0b' : '#374151') +
    ';color:white;padding:12px 24px;border-radius:10px;font-size:0.9rem;font-weight:500;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:fadeInUp 0.3s ease;';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}
</script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
}
