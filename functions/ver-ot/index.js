// ============================================
// BIZFLOW - Ver Orden de Trabajo (P\u00fablico)
// Cloudflare Pages Function
// GET ?token=xxx → Render read-only order viewer
// ============================================

import {
  handleOptions,
  htmlResponse,
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
  buildJsPDFGeneratorScript,
  getJsPDFScript,
  escapeHtml,
  formatDateTime,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

// ─────────────────────────────────────────────
// GET: Render read-only order viewer
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
  return htmlResponse(renderViewerPage(order, client, vehicle, costs, config));
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

function renderViewerPage(order, client, vehicle, costs, config) {
  const html = buildPageHead('Ver Orden', config);

  // Determine status label and color
  const estadoBadge = order.estado === 'Cerrada' ? 'badge-closed'
    : order.estado === 'Aprobada' ? 'badge-approved'
    : 'badge-pending';

  const estadoTrabajoBadge = order.estado_trabajo === 'Cerrada' ? 'badge-closed'
    : order.estado_trabajo === 'En Proceso' ? 'badge-pending'
    : order.estado_trabajo === 'Completada' ? 'badge-approved'
    : 'badge-pending';

  return `${html}
<body>
<div class="page-wrapper">
  <div class="top-bar">
    <h1><i class="fas fa-eye me-2"></i>Orden de Trabajo</h1>
    <div class="subtitle">${escapeHtml(config?.negocio_nombre || 'BizFlow')}</div>
  </div>
  <div class="content">

    <!-- Business info card -->
    <div class="card">
      <div class="card-header">
        <div class="icon-circle" style="background:#dbeafe;color:#2563eb;"><i class="fas fa-building"></i></div>
        <h2>Datos del Negocio</h2>
      </div>
      <div class="info-row">
        <span class="info-label">Nombre</span>
        <span class="info-value">${escapeHtml(config?.negocio_nombre || 'Mi Negocio')}</span>
      </div>
      ${config?.negocio_direccion ? `
      <div class="info-row">
        <span class="info-label">Direcci\u00f3n</span>
        <span class="info-value">${escapeHtml(config.negocio_direccion)}</span>
      </div>` : ''}
      ${config?.negocio_telefono ? `
      <div class="info-row">
        <span class="info-label">Tel\u00e9fono</span>
        <span class="info-value">${escapeHtml(config.negocio_telefono)}</span>
      </div>` : ''}
      ${config?.negocio_email ? `
      <div class="info-row">
        <span class="info-label">Email</span>
        <span class="info-value">${escapeHtml(config.negocio_email)}</span>
      </div>` : ''}
    </div>

    ${buildOrderInfoCard(order)}

    <!-- Show estado_trabajo if present -->
    ${order.estado_trabajo ? `
    <div class="card">
      <div class="card-header">
        <div class="icon-circle" style="background:#fef3c7;color:#d97706;"><i class="fas fa-tasks"></i></div>
        <h2>Estado del Trabajo</h2>
      </div>
      <div class="info-row">
        <span class="info-label">Estado</span>
        <span class="info-value"><span class="badge ${estadoTrabajoBadge}">${escapeHtml(order.estado_trabajo)}</span></span>
      </div>
      ${order.tecnico_asignado_id ? `
      <div class="info-row">
        <span class="info-label">T\u00e9cnico ID</span>
        <span class="info-value">#${order.tecnico_asignado_id}</span>
      </div>` : ''}
      ${order.fecha_completado ? `
      <div class="info-row">
        <span class="info-label">Fecha completado</span>
        <span class="info-value">${formatDateTime(order.fecha_completado)}</span>
      </div>` : ''}
      ${order.fecha_aprobacion ? `
      <div class="info-row">
        <span class="info-label">Fecha aprobaci\u00f3n</span>
        <span class="info-value">${formatDateTime(order.fecha_aprobacion)}</span>
      </div>` : ''}
    </div>` : ''}

    ${buildClientInfoCard(client, order)}
    ${buildVehicleInfoCard(order, vehicle)}
    ${buildDomicilioCard(order)}
    ${buildServicesCard(order)}
    ${buildChecklistCard(order)}
    ${buildCostsCard(costs)}
    ${buildTotalsCard(order)}
    ${buildNotesCard(order)}

    <!-- Client signature -->
    ${order.firma_imagen ? `
    <div class="card">
      <div class="card-header">
        <div class="icon-circle"><i class="fas fa-signature"></i></div>
        <h2>Firma del Cliente</h2>
      </div>
      <img id="signatureImg" src="${order.firma_imagen}" class="signature-preview" alt="Firma del cliente">
    </div>` : ''}

    <!-- Action buttons -->
    <div class="btn-group-actions no-print">
      <button class="btn-action btn-pdf" onclick="generatePDF()">
        <i class="fas fa-file-pdf me-2"></i>Descargar PDF
      </button>
      <button class="btn-action btn-print" onclick="window.print()">
        <i class="fas fa-print me-2"></i>Imprimir
      </button>
      <a id="whatsappLink" href="#" class="btn-action btn-whatsapp" target="_blank">
        <i class="fab fa-whatsapp me-2"></i>Compartir por WhatsApp
      </a>
    </div>

    <!-- Hidden PDF data elements -->
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
${buildJsPDFGeneratorScript('ver')}
<script>
(function(){
  const phone = '${escapeHtml(client?.telefono || '')}';
  const link = document.getElementById('whatsappLink');
  if (phone && link) {
    const num = '${escapeHtml(String(order.numero_orden || '').padStart(5, '0'))}';
    const text = encodeURIComponent('Hola, le comparto mi orden de trabajo #' + num + '. Gracias.');
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
