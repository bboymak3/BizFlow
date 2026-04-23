export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return getHTMLResponse('Token no proporcionado', 'Debe proporcionar un token para ver la orden.', false);
  }

  try {
    // Buscar orden por el token
    const orden = await env.DB.prepare(`
      SELECT
        o.*,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        c.rut as cliente_rut,
        t.nombre as tecnico_nombre
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
      WHERE o.token = ?
    `).bind(token).first();

    if (!orden) {
      return getHTMLResponse('Orden no encontrada', 'El link no es válido o la orden no existe.', false);
    }

    // Obtener costos adicionales
    let costosAdicionales = [];
    let totalCostos = 0;
    try {
      const { results } = await env.DB.prepare(
        'SELECT concepto, monto, categoria FROM CostosAdicionales WHERE orden_id = ? ORDER BY fecha_registro DESC'
      ).bind(orden.id).all();
      costosAdicionales = results || [];
      totalCostos = costosAdicionales.reduce((sum, c) => sum + Number(c.monto || 0), 0);
    } catch (e) {
      console.log('CostosAdicionales no disponible:', e.message);
    }

    const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
    const html = generateOTViewerPage(orden, numeroFormateado, token, costosAdicionales, totalCostos);

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

  } catch (error) {
    console.error('Error al ver orden:', error);
    return new Response('Error interno del servidor', { status: 500 });
  }
}

function getHTMLResponse(titulo, mensaje, esExito) {
  const color = esExito ? '#28a745' : '#dc3545';
  const icono = esExito ? '✓' : '✗';

  const html = '' +
    '<!DOCTYPE html>' +
    '<html lang="es">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + titulo + ' - Global Pro Automotriz</title>' +
    '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">' +
    '<style>' +
    'body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }' +
    '.card { border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 500px; width: 90%; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="card">' +
    '<div class="card-body text-center py-5">' +
    '<div style="font-size: 5rem; color: ' + color + ';">' + icono + '</div>' +
    '<h3 class="mt-4">' + titulo + '</h3>' +
    '<p class="text-muted">' + mensaje + '</p>' +
    '</div>' +
    '</div>' +
    '</body>' +
    '</html>';

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ============================================
// HELPER: Build diagnosis items from new or old format
// ============================================
function buildDiagnosticoItems(orden) {
  let checks = [];
  let observaciones = orden.diagnostico_observaciones || '';

  // Try new checkbox format first
  if (orden.diagnostico_checks) {
    try {
      const parsed = typeof orden.diagnostico_checks === 'string'
        ? JSON.parse(orden.diagnostico_checks)
        : orden.diagnostico_checks;
      if (Array.isArray(parsed) && parsed.length > 0) {
        checks = parsed;
      }
    } catch (e) {
      // Not valid JSON, fall back to old format
    }
  }

  // Fall back to old individual fields
  if (checks.length === 0) {
    if (orden.trabajo_frenos) checks.push('Frenos' + (orden.detalle_frenos ? ': ' + orden.detalle_frenos : ''));
    if (orden.trabajo_luces) checks.push('Luces' + (orden.detalle_luces ? ': ' + orden.detalle_luces : ''));
    if (orden.trabajo_tren_delantero) checks.push('Tren Delantero' + (orden.detalle_tren_delantero ? ': ' + orden.detalle_tren_delantero : ''));
    if (orden.trabajo_correas) checks.push('Correas' + (orden.detalle_correas ? ': ' + orden.detalle_correas : ''));
    if (orden.trabajo_componentes) checks.push('Componentes' + (orden.detalle_componentes ? ': ' + orden.detalle_componentes : ''));
  }

  return { checks, observaciones };
}

// ============================================
// HELPER: Diagnosis as styled HTML list (Bootstrap)
// ============================================
function buildDiagnosticoHtmlBootstrap(orden, title) {
  // Check for servicios_seleccionados (catalog services with prices)
  let servicios = [];
  if (orden.servicios_seleccionados) {
    try {
      const parsed = typeof orden.servicios_seleccionados === 'string'
        ? JSON.parse(orden.servicios_seleccionados)
        : orden.servicios_seleccionados;
      if (Array.isArray(parsed) && parsed.length > 0) {
        servicios = parsed;
      }
    } catch (e) {}
  }

  if (servicios.length > 0) {
    let subtotal = 0;
    let hasEdited = false;
    let html = '<h6 class="fw-bold text-danger">' + (title || 'DIAGNÓSTICO') + '</h6>';
    html += '<div class="table-responsive"><table class="table table-sm table-bordered"><thead class="table-light"><tr><th>Servicio</th><th>Categoría</th><th>Tipo</th><th class="text-end">Precio</th></tr></thead><tbody>';
    servicios.forEach(function(s) {
      const precio = Number(s.precio_final || s.precio_sugerido || 0);
      subtotal += precio;
      if (s.editado) hasEdited = true;
      const tipo = s.tipo_comision === 'mano_obra' ? '<span class="badge bg-warning text-dark" style="font-size:0.65rem;">Mano de Obra</span>' : '<span class="badge bg-secondary" style="font-size:0.65rem;">Repuestos</span>';
      const editMark = s.editado ? ' *' : '';
      html += '<tr><td>' + (s.nombre || s.nombre_servicio || '') + editMark + '</td><td>' + (s.categoria || '') + '</td><td>' + tipo + '</td><td class="text-end fw-bold">$' + precio.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + '</td></tr>';
    });
    html += '<tr class="table-warning"><td class="fw-bold" colspan="3">Subtotal Servicios</td><td class="text-end fw-bold fs-5">$' + subtotal.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + '</td></tr>';
    html += '</tbody></table></div>';
    if (hasEdited) {
      html += '<small class="text-muted">* Precio editado manualmente</small>';
    }
    return html;
  }

  // Fallback to old diagnostic format
  const { checks, observaciones } = buildDiagnosticoItems(orden);
  let html = '<h6 class="fw-bold text-danger">' + (title || 'DIAGNÓSTICO') + '</h6>';
  if (checks.length === 0) {
    html += '<p class="text-muted">Sin diagnóstico registrado</p>';
  } else {
    html += '<ul class="list-unstyled mb-0">';
    checks.forEach(function(item) {
      html += '<li class="mb-1"><span style="color:#16a34a;font-size:1rem;">✅</span> ' + item + '</li>';
    });
    html += '</ul>';
  }
  if (observaciones) {
    html += '<p class="text-muted mt-2 mb-0" style="font-size:0.9rem;"><em>📝 Observaciones: ' + observaciones + '</em></p>';
  }
  return html;
}

function generateOTViewerPage(orden, numeroFormateado, token, costosAdicionales, totalCostos) {
  const estadoClass = obtenerClaseEstado(orden.estado);
  const montoBase = Number(orden.monto_total || 0);
  const montoFinal = montoBase + totalCostos;

  // Domicilio data (always visible, even when $0)
  const distanciaKm = Number(orden.distancia_km || 0);
  const cargoDomicilio = Number(orden.cargo_domicilio || 0);
  const domicilioModo = orden.domicilio_modo_cobro || '';
  const domicilioHtml = '<div class="alert ' + (distanciaKm > 0 ? 'alert-info' : 'alert-secondary') + ' py-2 mb-3">' +
    '<h6 class="fw-bold mb-2" style="color:' + (cargoDomicilio > 0 ? '#0066cc' : '#6c757d') + ';"><i class="fas fa-truck me-2"></i>DOMICILIO' + (distanciaKm === 0 ? ' (No calculado)' : '') + '</h6>' +
    '<div class="row text-center">' +
    '<div class="col-6">' +
    '<small class="text-muted">Distancia recorrida</small>' +
    '<div class="h5">' + (distanciaKm > 0 ? distanciaKm.toFixed(1) + ' km' : 'N/A') + '</div>' +
    '</div>' +
    '<div class="col-6">' +
    '<small class="text-muted">Cargo por domicilio</small>' +
    '<div class="h5 ' + (cargoDomicilio > 0 ? 'text-danger' : (distanciaKm > 0 ? 'text-success' : 'text-muted')) + '">' + (distanciaKm > 0 ? (cargoDomicilio > 0 ? '$' + cargoDomicilio.toLocaleString('es-CL') : 'Gratis') : 'No calculado') + '</div>' +
    '</div>' +
    '</div>' +
    (distanciaKm > 0 ? '<small class="text-muted"><em>NOTA: Este valor NO esta incluido en el total de la factura. El pago se realiza directamente al tecnico.</em></small>' : '') +
    '</div>';

  // Build diagnosis HTML using new checkbox format
  const diagnosticoHtml = buildDiagnosticoHtmlBootstrap(orden, 'DIAGNÓSTICO / TRABAJOS A REALIZAR');

  // Construir HTML de checklist
  let checklistHtml = '' +
    '<p><strong>Nivel de Combustible:</strong> ' + (orden.nivel_combustible || 'No registrado') + '</p>' +
    '<p><strong>Estado de Carrocería:</strong></p>' +
    '<ul>';
  if (orden.check_paragolfe_delantero_der) checklistHtml += '<li>✓ Parachoques delantero derecho</li>';
  if (orden.check_puerta_delantera_der) checklistHtml += '<li>✓ Puerta delantera derecha</li>';
  if (orden.check_puerta_trasera_der) checklistHtml += '<li>✓ Puerta trasera derecha</li>';
  if (orden.check_paragolfe_trasero_izq) checklistHtml += '<li>✓ Parachoques trasero izquierdo</li>';
  if (orden.check_otros_carroceria) checklistHtml += '<li>' + orden.check_otros_carroceria + '</li>';
  checklistHtml += '</ul>';

  // Procesar notas
  let notasCierre = '';
  let otrasNotas = '';
  if (orden.notas) {
    const notasArray = orden.notas.split('\n');
    for (const nota of notasArray) {
      if (nota.startsWith('Cierre: ')) {
        notasCierre = nota.replace('Cierre: ', '');
      } else {
        otrasNotas += (otrasNotas ? '\n' : '') + nota;
      }
    }
  }

  let notasHtml = '';
  if (notasCierre || otrasNotas) {
    notasHtml = '<hr><h6 class="fw-bold text-danger">NOTAS</h6>';
    if (notasCierre) {
      notasHtml += '<p><strong>Notas de cierre:</strong> ' + notasCierre + '</p>';
    }
    if (otrasNotas) {
      notasHtml += '<p><strong>Otras notas:</strong> ' + otrasNotas.replace(/\n/g, '<br>') + '</p>';
    }
  }

  // Construir HTML de costos adicionales
  let costosHtml = '';
  if (costosAdicionales && costosAdicionales.length > 0) {
    costosHtml += '<hr><h6 class="fw-bold text-danger"><i class="fas fa-receipt me-2"></i>GASTOS ADICIONALES</h6>';
    costosHtml += '<div class="table-responsive"><table class="table table-sm table-bordered">';
    costosHtml += '<thead><tr><th>Concepto</th><th>Tipo</th><th class="text-end">Monto</th></tr></thead><tbody>';
    costosAdicionales.forEach(c => {
      const catLabel = c.categoria === 'Repuestos/Materiales' ? 'Repuesto' : 'Mano de Obra';
      const catBadge = c.categoria === 'Repuestos/Materiales'
        ? '<span class="badge bg-secondary">Repuesto</span>'
        : '<span class="badge bg-warning text-dark">Mano de Obra</span>';
      costosHtml += '<tr><td>' + (c.concepto || 'Gasto adicional') + '</td><td>' + catBadge + '</td><td class="text-end fw-bold text-danger">$' + Number(c.monto || 0).toLocaleString('es-CL') + '</td></tr>';
    });
    costosHtml += '</tbody></table></div>';
    costosHtml += '<div class="text-end mt-2"><small class="text-muted">Base: $' + montoBase.toLocaleString('es-CL') + ' + Extras: $' + totalCostos.toLocaleString('es-CL') + ' = <strong class="text-danger">Total: $' + montoFinal.toLocaleString('es-CL') + '</strong></small></div>';
  }

  // Firma
  let firmaHtml = '';
  if (orden.firma_imagen) {
    firmaHtml = '<div class="text-center mt-3"><h6><i class="fas fa-signature me-2"></i>Firma del Cliente</h6><img src="' + orden.firma_imagen + '" alt="Firma" style="max-width: 300px; border: 1px solid #ddd; border-radius: 5px;"><p class="small text-muted mt-1">Fecha: ' + (orden.fecha_aprobacion || 'N/A') + '</p></div>';
  }

  const costosJson = JSON.stringify(costosAdicionales || []);
  const totalCostosNum = totalCostos;
  const montoFinalNum = montoFinal;

  const html = '' +
    '<!DOCTYPE html>' +
    '<html lang="es">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Orden de Trabajo #' + numeroFormateado + ' - Global Pro Automotriz</title>' +
    '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">' +
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">' +
    '<style>' +
    '@media print {' +
    '.no-print { display: none !important; }' +
    '.print-only { display: block !important; }' +
    'body { background: white !important; }' +
    '}' +
    'body { background: #f5f5f5; }' +
    '.ot-card { box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-radius: 15px; margin-bottom: 20px; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<nav class="navbar navbar-dark no-print" style="background: #a80000;">' +
    '<div class="container">' +
    '<a class="navbar-brand fw-bold" href="#">' +
    '<i class="fas fa-wrench me-2"></i>GLOBAL PRO AUTOMOTRIZ' +
    '</a>' +
    '</div>' +
    '</nav>' +
    '<div style="width:100%;text-align:center;line-height:0;"><img src="/banner.jpeg" alt="Global Pro Automotriz" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.15);"></div>' +
    '<div class="container py-4">' +
    '<div class="d-flex justify-content-between align-items-center mb-4 no-print">' +
    '<h2 class="mb-0">Orden de Trabajo #' + numeroFormateado + '</h2>' +
    '<div class="d-flex gap-2">' +
    '<button class="btn btn-primary" onclick="descargarPDF()">' +
    '<i class="fas fa-download me-2"></i>Descargar PDF' +
    '</button>' +
    '<button class="btn btn-secondary" onclick="window.print()">' +
    '<i class="fas fa-print me-2"></i>Imprimir' +
    '</button>' +
    '</div>' +
    '</div>' +
    '<div class="ot-card card">' +
    '<div class="card-header bg-danger text-white">' +
    '<h5 class="mb-0"><i class="fas fa-file-alt me-2"></i>ORDEN DE TRABAJO #' + numeroFormateado + '</h5>' +
    '</div>' +
    '<div class="card-body">' +
    '<div class="row mb-4">' +
    '<div class="col-md-6">' +
    '<h6 class="fw-bold text-danger">INFORMACIÓN DEL TALLER</h6>' +
    '<p><strong>Empresa:</strong> Global Pro Automotriz</p>' +
    '<p><strong>Dirección:</strong> Padre Alberto Hurtado 3596, Pedro Aguirre Cerda</p>' +
    '<p><strong>Contactos:</strong> +56 9 3902 6185</p>' +
    '<p><strong>RRSS:</strong> @globalproautomotriz</p>' +
    '<hr>' +
    '<h6 class="fw-bold">DATOS DEL CLIENTE</h6>' +
    '<p><strong>Nombre:</strong> ' + (orden.cliente_nombre || 'N/A') + '</p>' +
    '<p><strong>Dirección Cliente:</strong> ' + (orden.direccion || 'N/A') + '</p>' +
    '<p><strong>RUT:</strong> ' + (orden.cliente_rut || 'N/A') + '</p>' +
    '<p><strong>Fecha Ingreso:</strong> ' + (orden.fecha_ingreso || 'N/A') + ' ' + (orden.hora_ingreso || '') + '</p>' +
    '<p><strong>Recepcionista:</strong> ' + (orden.recepcionista || 'N/A') + '</p>' +
    '</div>' +
    '<div class="col-md-6">' +
    '<h6 class="fw-bold text-danger">DATOS DEL VEHÍCULO</h6>' +
    '<p><strong>Patente:</strong> <span style="font-size: 1.2rem; font-weight: bold; color: #a80000;">' + (orden.patente_placa || 'N/A') + '</span></p>' +
    '<p><strong>Marca/Modelo:</strong> ' + (orden.marca || 'N/A') + ' ' + (orden.modelo || '') + ' (' + (orden.anio || 'N/A') + ')</p>' +
    '<p><strong>Cilindrada:</strong> ' + (orden.cilindrada || 'N/A') + '</p>' +
    '<p><strong>Combustible:</strong> ' + (orden.combustible || 'N/A') + '</p>' +
    '<p><strong>Kilometraje:</strong> ' + (orden.kilometraje || 'N/A') + '</p>' +
    '<hr>' +
    '<h6 class="fw-bold">ESTADO DE LA ORDEN</h6>' +
    '<p><span class="badge ' + estadoClass + ' fs-6">' + (orden.estado || 'N/A') + '</span></p>' +
    ((orden.estado_trabajo === 'Cerrada') ? '<p><span class="badge bg-success fs-6">Orden cerrada</span></p>' : '') +
    ((orden.fecha_completado) ? '<p><strong>Fecha de cierre:</strong> ' + orden.fecha_completado + '</p>' : '') +
    '</div>' +
    '</div>' +
    domicilioHtml +
    '<hr>' +
    '<div class="row">' +
    '<div class="col-md-6">' +
    diagnosticoHtml +
    '</div>' +
    '<div class="col-md-6">' +
    '<h6 class="fw-bold text-danger">CHECKLIST DEL VEHÍCULO</h6>' +
    checklistHtml +
    '</div>' +
    '</div>' +
    costosHtml +
    '<hr>' +
    '<h6 class="fw-bold text-danger">VALORES</h6>' +
    '<div class="row text-center">' +
    '<div class="col-4">' +
    '<div class="p-3 bg-light rounded">' +
    '<small class="text-muted">Total</small>' +
    '<div class="h4">$' + montoFinal.toLocaleString('es-CL') + '</div>' +
    (totalCostos > 0 ? '<small class="text-muted">Base: $' + montoBase.toLocaleString('es-CL') + '</small>' : '') +
    '</div>' +
    '</div>' +
    '<div class="col-4">' +
    '<div class="p-3 bg-light rounded">' +
    '<small class="text-muted">Abono</small>' +
    '<div class="h4">$' + ((orden.monto_abono || 0).toLocaleString('es-CL')) + '</div>' +
    '</div>' +
    '</div>' +
    '<div class="col-4">' +
    '<div class="p-3 bg-light rounded">' +
    '<small class="text-muted">Restante</small>' +
    '<div class="h4">$' + ((montoFinal - Number(orden.monto_abono || 0)).toLocaleString('es-CL')) + '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    (orden.metodo_pago ? '<p class="text-center mt-2"><strong>Método de Pago:</strong> ' + orden.metodo_pago + '</p>' : '') +
    '</div>' +
    notasHtml +
    firmaHtml +
    '<hr>' +
    '<div class="alert alert-info">' +
    '<small class="text-danger">' +
    '<strong>Validez y Responsabilidad:</strong><br>' +
    '• El cliente autoriza la intervención del vehículo<br>' +
    '• Se autorizan pruebas de carretera necesarias<br>' +
    '• La empresa no se hace responsable por objetos no declarados' +
    '</small>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<footer class="text-center py-3 text-muted no-print">' +
    '<small>Generado el ' + new Date().toLocaleString('es-CL') + '</small>' +
    '</footer>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>' +
    '<script>' +
    'function loadImage(src) {' +
    '  return new Promise(function(resolve) {' +
    '    var img = new Image(); img.crossOrigin = "anonymous";' +
    '    var t = setTimeout(function() { resolve(null); }, 2000);' +
    '    img.onload = function() { clearTimeout(t); resolve(img); };' +
    '    img.onerror = function() { clearTimeout(t); resolve(null); };' +
    '    img.src = src;' +
    '  });' +
    '}' +
    'async function descargarPDF() {' +
    '  const { jsPDF } = window.jspdf;' +
    '  const doc = new jsPDF("p", "mm", "a4");' +
    '  const ordenData = ' + JSON.stringify(orden) + ';' +
    '  const costosData = ' + costosJson + ';' +
    '  const totalExtras = ' + totalCostosNum + ';' +
    '  const montoFinal = ' + montoFinalNum + ';' +
    '  const numeroFormateado = "' + numeroFormateado + '";' +
    '  const pageWidth = doc.internal.pageSize.getWidth();' +
    '  const pageHeight = doc.internal.pageSize.getHeight();' +
    '  const leftMargin = 10;' +
    '  let yPos = 15;' +
    '  var logoImg = await loadImage("corto.jpg");' +
    '  var bannerImg = await loadImage("banner.jpeg");' +
    '  if (logoImg) {' +
    '    doc.setGState(new doc.GState({ opacity: 0.08 }));' +
    '    var wmW = 80; var wmH = (logoImg.naturalHeight / logoImg.naturalWidth) * wmW;' +
    '    doc.addImage(logoImg, "JPEG", (pageWidth - wmW) / 2, (pageHeight - wmH) / 2, wmW, wmH);' +
    '    doc.setGState(new doc.GState({ opacity: 1 }));' +
    '  }' +
    '  if (logoImg) { doc.addImage(logoImg, "JPEG", leftMargin, 5, 15, 10); }' +
    '  if (bannerImg) {' +
    '    var bw = pageWidth - (leftMargin * 2); var bh = (bannerImg.naturalHeight / bannerImg.naturalWidth) * bw;' +
    '    var maxH = 30; var fbh = Math.min(bh, maxH); var fbw = (bannerImg.naturalWidth / bannerImg.naturalHeight) * fbh;' +
    '    doc.addImage(bannerImg, "JPEG", (pageWidth - fbw) / 2, yPos, fbw, fbh);' +
    '    yPos += fbh + 3;' +
    '  }' +
    // Header
    '  doc.setFontSize(8);' +
    '  doc.setTextColor(128, 128, 128);' +
    '  doc.text("OT #" + numeroFormateado, pageWidth - 15, 10, { align: "right" });' +
    '  doc.setFontSize(16);' +
    '  doc.setTextColor(168, 0, 0);' +
    '  doc.text("ORDEN DE TRABAJO", pageWidth / 2, yPos, { align: "center" });' +
    '  yPos += 8;' +
    '  doc.setFontSize(10);' +
    '  doc.text("GLOBAL PRO AUTOMOTRIZ", pageWidth / 2, yPos, { align: "center" });' +
    '  yPos += 10;' +
    // Section 1: Info del Taller
    '  doc.setTextColor(0, 0, 0);' +
    '  doc.setFontSize(9);' +
    '  doc.setFont(undefined, "bold");' +
    '  doc.text("1. INFORMACION DEL TALLER", leftMargin, yPos);' +
    '  yPos += 6;' +
    '  doc.setFont(undefined, "normal");' +
    '  doc.setFontSize(7);' +
    '  doc.text("Empresa: Global Pro Automotriz", leftMargin, yPos); yPos += 4;' +
    '  doc.text("Direccion: Padre Alberto Hurtado 3596, Pedro Aguirre Cerda", leftMargin, yPos); yPos += 4;' +
    '  doc.text("Contactos: +56 9 3902 6185", leftMargin, yPos); yPos += 10;' +
    // Section 2: Datos del Cliente
    '  doc.setFontSize(9);' +
    '  doc.setFont(undefined, "bold");' +
    '  doc.text("2. DATOS DEL CLIENTE", leftMargin, yPos);' +
    '  yPos += 6;' +
    '  doc.setFont(undefined, "normal");' +
    '  doc.setFontSize(7);' +
    '  doc.text("Cliente: " + (ordenData.cliente_nombre || "N/A"), leftMargin, yPos); yPos += 4;' +
    '  doc.text("Direccion: " + (ordenData.direccion || "N/A"), leftMargin, yPos); yPos += 4;' +
    '  doc.text("RUT: " + (ordenData.cliente_rut || "N/A"), leftMargin, yPos); yPos += 4;' +
    '  doc.text("Telefono: " + (ordenData.cliente_telefono || "N/A"), leftMargin, yPos); yPos += 4;' +
    '  doc.text("Fecha Ingreso: " + (ordenData.fecha_ingreso || "N/A"), leftMargin, yPos); yPos += 10;' +
    // Section 3: Datos del Vehiculo
    '  doc.setFontSize(9);' +
    '  doc.setFont(undefined, "bold");' +
    '  doc.text("3. DATOS DEL VEHICULO", leftMargin, yPos);' +
    '  yPos += 6;' +
    '  doc.setFont(undefined, "normal");' +
    '  doc.setFontSize(7);' +
    '  doc.text("Patente: " + (ordenData.patente_placa || "N/A"), leftMargin, yPos); yPos += 4;' +
    '  doc.text("Marca/Modelo: " + (ordenData.marca || "N/A") + " " + (ordenData.modelo || ""), leftMargin, yPos); yPos += 10;' +
    // Section 4: Domicilio (always visible, even when $0)
    '  var domDist = Number(ordenData.distancia_km || 0);' +
    '  var domCargo = Number(ordenData.cargo_domicilio || 0);' +
    '  if (yPos > 255) { doc.addPage(); yPos = 20; }' +
    '  doc.setFontSize(9);' +
    '  doc.setFont(undefined, "bold");' +
    '  doc.text("4. DOMICILIO", leftMargin, yPos);' +
    '  yPos += 6;' +
    '  doc.setFont(undefined, "normal");' +
    '  doc.setFontSize(7);' +
    '  if (domDist > 0) {' +
    '    doc.text("Distancia recorrida: " + domDist.toFixed(1) + " km", leftMargin, yPos); yPos += 4;' +
    '    if (domCargo > 0) {' +
    '      doc.text("Cargo por domicilio: $" + domCargo.toLocaleString("es-CL") + " (pago directo al tecnico)", leftMargin, yPos);' +
    '    } else {' +
    '      doc.text("Cargo por domicilio: Gratis (dentro del radio de cobertura)", leftMargin, yPos);' +
    '    }' +
    '  } else {' +
    '    doc.text("Domicilio: No calculado", leftMargin, yPos);' +
    '  }' +
    '  yPos += 10;' +
    // Section 5: Diagnostico / Trabajos (with catalog services support)
    '  doc.setFontSize(9);' +
    '  doc.setFont(undefined, "bold");' +
    '  doc.text("5. DIAGNOSTICO / TRABAJOS", leftMargin, yPos);' +
    '  yPos += 6;' +
    '  doc.setFont(undefined, "normal");' +
    '  doc.setFontSize(7);' +
    '  var srvs = [];' +
    '  if (ordenData.servicios_seleccionados) {' +
    '    try {' +
    '      var sp = typeof ordenData.servicios_seleccionados === "string" ? JSON.parse(ordenData.servicios_seleccionados) : ordenData.servicios_seleccionados;' +
    '      if (Array.isArray(sp) && sp.length > 0) srvs = sp;' +
    '    } catch(e) {}' +
    '  }' +
    '  if (srvs.length > 0) {' +
    '    var sub = 0;' +
    '    srvs.forEach(function(s) {' +
    '      if (yPos > 260) { doc.addPage(); yPos = 20; }' +
    '      var pr = Number(s.precio_final || s.precio_sugerido || 0);' +
    '      sub += pr;' +
    '      var tp = s.tipo_comision === "mano_obra" ? "MO" : "Rep";' +
    '      var em = s.editado ? " *" : "";' +
    '      doc.text("[x] " + (s.nombre || s.nombre_servicio || "") + em + " [" + tp + "] $" + pr.toLocaleString("es-CL", {maximumFractionDigits: 0}), leftMargin, yPos);' +
    '      yPos += 5;' +
    '    });' +
    '    if (yPos > 260) { doc.addPage(); yPos = 20; }' +
    '    doc.setFont(undefined, "bold");' +
    '    doc.setFontSize(8);' +
    '    doc.text("Subtotal Servicios: $" + sub.toLocaleString("es-CL", {maximumFractionDigits: 0}), leftMargin, yPos);' +
    '    yPos += 6;' +
    '    doc.setFont(undefined, "normal");' +
    '    doc.setFontSize(7);' +
    '  } else {' +
    '    var diagChecks = [];' +
    '    var diagObs = ordenData.diagnostico_observaciones || "";' +
    '    if (ordenData.diagnostico_checks) {' +
    '      try {' +
    '        var dp = typeof ordenData.diagnostico_checks === "string" ? JSON.parse(ordenData.diagnostico_checks) : ordenData.diagnostico_checks;' +
    '        if (Array.isArray(dp) && dp.length > 0) diagChecks = dp;' +
    '      } catch(e) {}' +
    '    }' +
    '    if (diagChecks.length === 0) {' +
    '      if (ordenData.trabajo_frenos) diagChecks.push("Frenos" + (ordenData.detalle_frenos ? ": " + ordenData.detalle_frenos : ""));' +
    '      if (ordenData.trabajo_luces) diagChecks.push("Luces" + (ordenData.detalle_luces ? ": " + ordenData.detalle_luces : ""));' +
    '      if (ordenData.trabajo_tren_delantero) diagChecks.push("Tren Delantero" + (ordenData.detalle_tren_delantero ? ": " + ordenData.detalle_tren_delantero : ""));' +
    '      if (ordenData.trabajo_correas) diagChecks.push("Correas" + (ordenData.detalle_correas ? ": " + ordenData.detalle_correas : ""));' +
    '      if (ordenData.trabajo_componentes) diagChecks.push("Componentes" + (ordenData.detalle_componentes ? ": " + ordenData.detalle_componentes : ""));' +
    '    }' +
    '    if (diagChecks.length === 0) {' +
    '      doc.text("- Sin diagnostico", leftMargin, yPos); yPos += 5;' +
    '    } else {' +
    '      diagChecks.forEach(function(item) {' +
    '        if (yPos > 260) { doc.addPage(); yPos = 20; }' +
    '        doc.text("- " + item, leftMargin, yPos); yPos += 5;' +
    '      });' +
    '    }' +
    '    if (diagObs) {' +
    '      if (yPos > 260) { doc.addPage(); yPos = 20; }' +
    '      doc.setFont(undefined, "italic");' +
    '      doc.setTextColor(80, 80, 80);' +
    '      doc.text("Observaciones: " + diagObs, leftMargin, yPos); yPos += 5;' +
    '      doc.setFont(undefined, "normal");' +
    '      doc.setTextColor(0, 0, 0);' +
    '    }' +
    '  }' +
    '  yPos += 5;' +
    // Section 6: Valores
    '  doc.setFontSize(9);' +
    '  doc.setFont(undefined, "bold");' +
    '  doc.text("6. VALORES", leftMargin, yPos);' +
    '  yPos += 6;' +
    '  doc.setFont(undefined, "normal");' +
    '  doc.setFontSize(7);' +
    '  doc.text("Total: $" + montoFinal.toLocaleString("es-CL"), leftMargin, yPos); yPos += 4;' +
    (totalCostos > 0 ? '  doc.text("(Base: $" + (montoBase.toLocaleString("es-CL")) + " + Extras: $" + totalCostos.toLocaleString("es-CL") + ")", leftMargin, yPos); yPos += 4;' : '') +
    '  doc.text("Abono: $" + ((ordenData.monto_abono || 0).toLocaleString("es-CL")), leftMargin, yPos); yPos += 4;' +
    '  doc.text("Restante: $" + (montoFinal - (ordenData.monto_abono || 0)).toLocaleString("es-CL"), leftMargin, yPos); yPos += 10;' +
    // Section 6: Gastos Adicionales
    '  if (costosData && costosData.length > 0) {' +
    '    doc.setFontSize(9);' +
    '    doc.setFont(undefined, "bold");' +
    '    doc.setTextColor(168, 0, 0);' +
    '    doc.text("7. GASTOS ADICIONALES", leftMargin, yPos);' +
    '    yPos += 6;' +
    '    doc.setFont(undefined, "normal");' +
    '    doc.setFontSize(7);' +
    '    doc.setTextColor(0, 0, 0);' +
    '    costosData.forEach(function(c) {' +
    '      if (yPos > 260) { doc.addPage(); yPos = 20; }' +
    '      doc.text("  - " + (c.concepto || "Gasto adicional") + " (" + (c.categoria || "N/A") + "): $" + Number(c.monto || 0).toLocaleString("es-CL"), leftMargin, yPos);' +
    '      yPos += 5;' +
    '    });' +
    '    yPos += 4;' +
    '  }' +
    // Section 7: Notas
    '  const notas = ' + JSON.stringify(orden.notas || '') + ';' +
    '  if (notas) {' +
    '    const notasArray = notas.split("\\n");' +
    '    let notasCierre = "";' +
    '    let otrasNotas = "";' +
    '    for (const nota of notasArray) {' +
    '      if (nota.startsWith("Cierre: ")) {' +
    '        notasCierre = nota.replace("Cierre: ", "");' +
    '      } else {' +
    '        otrasNotas += (otrasNotas ? "\\n" : "") + nota;' +
    '      }' +
    '    }' +
    '    doc.setFontSize(9);' +
    '    doc.setFont(undefined, "bold");' +
    '    doc.text("8. NOTAS", leftMargin, yPos);' +
    '    yPos += 6;' +
    '    doc.setFont(undefined, "normal");' +
    '    doc.setFontSize(7);' +
    '    if (notasCierre) {' +
    '      doc.text("Notas de cierre: " + notasCierre, leftMargin, yPos); yPos += 4;' +
    '    }' +
    '    if (otrasNotas) {' +
    '      doc.text("Otras notas: " + otrasNotas.replace(/\\n/g, ", "), leftMargin, yPos); yPos += 4;' +
    '    }' +
    '    yPos += 6;' +
    '  }' +
    // Firma
    '  if (ordenData.firma_imagen) {' +
    '    try {' +
    '      doc.text("Firma del Cliente:", leftMargin, yPos); yPos += 4;' +
    '      doc.addImage(ordenData.firma_imagen, "PNG", leftMargin, yPos, 40, 25);' +
    '    } catch(e) {}' +
    '  }' +
    // Footer
    '  doc.setFontSize(6);' +
    '  doc.setTextColor(128, 128, 128);' +
    '  doc.text("Generado: " + new Date().toLocaleString("es-CL"), pageWidth / 2, pageHeight - 10, { align: "center" });' +
    '  doc.save("OT-" + numeroFormateado + "-" + (ordenData.patente_placa || "N/A") + ".pdf");' +
    '}' +
    '<\/script>' +
    '</div>' +
    '</body>' +
    '</html>';

  return html;
}

function obtenerClaseEstado(estado) {
  const clases = {
    'Enviada': 'bg-warning',
    'Aprobada': 'bg-success',
    'Cancelada': 'bg-danger'
  };
  return clases[estado] || 'bg-secondary';
}
