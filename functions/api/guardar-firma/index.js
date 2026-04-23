// ============================================================
// BizFlow - Guardar Firma (R2)
// POST /api/guardar-firma
// Guarda firma digital en R2 y registra la URL en la OT
// Usado por: /aprobar, /aprobar-tecnico, tecnico/app
// ============================================================

import { jsonResponse, errorResponse, handleCors, hoyISO } from '../../lib/db-helpers.js';
import { subirArchivoR2, generarRutaFirma, base64ToArrayBuffer } from '../../lib/r2-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;

  if (request.method !== 'POST') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    const body = await request.json();

    if (!body.firma || !body.orden_id) {
      return errorResponse('Campos obligatorios: firma (base64), orden_id');
    }

    const {
      firma,
      orden_id,
      tipo = 'cliente',  // 'cliente' o 'tecnico'
      token,              // Token de aprobación (opcional)
      actualizar_estado,  // 'Aprobada', 'Cerrada', o null
    } = body;

    // Find order
    let order;
    if (token) {
      order = await env.DB.prepare(
        'SELECT id, estado, usuario_id FROM OrdenesTrabajo WHERE token_aprobacion = ? OR token_aprobacion_tecnico = ? OR firma_token = ?'
      ).bind(token, token, token).first();
    } else {
      order = await env.DB.prepare(
        'SELECT id, estado, usuario_id FROM OrdenesTrabajo WHERE id = ?'
      ).bind(parseInt(orden_id)).first();
    }

    if (!order) {
      return errorResponse('Orden de trabajo no encontrada', 404);
    }

    // Convert base64 to buffer
    const buffer = base64ToArrayBuffer(firma);

    // Generate R2 path
    const rutaR2 = generarRutaFirma(parseInt(orden_id), tipo);

    // Upload signature to R2
    const r2Result = await subirArchivoR2(env.MEDIA, rutaR2, buffer, {
      contentType: 'image/png',
      metadata: {
        tipo: 'firma',
        firmante: tipo,
        orden_id: orden_id.toString(),
      }
    });

    const firmaUrl = r2Result.urlPublica;
    const now = hoyISO();

    // Save to FotosTrabajo as type 'firma'
    await env.DB.prepare(`
      INSERT INTO FotosTrabajo (orden_id, tipo, descripcion, ruta_r2, url_publica,
        subida_por, mime_type, tamano_bytes, creado_en)
      VALUES (?, 'firma', ?, ?, ?, ?, 'image/png', ?, ?)
    `).bind(
      parseInt(orden_id),
      `Firma del ${tipo}`,
      rutaR2,
      firmaUrl,
      tipo === 'tecnico' ? 'tecnico' : 'cliente',
      buffer.byteLength,
      now
    ).run();

    // Register in MediosR2
    await env.DB.prepare(`
      INSERT INTO MediosR2 (usuario_id, ruta, nombre_original, mime_type, tamano_bytes,
        tipo_recurso, recurso_id, creado_en)
      VALUES (?, ?, ?, 'image/png', ?, 'firma', ?, ?)
    `).bind(
      order.usuario_id,
      rutaR2,
      `firma_${tipo}_${orden_id}.png`,
      buffer.byteLength,
      parseInt(orden_id),
      now
    ).run();

    // Update order with signature URL
    const updateFields = [];
    const updateParams = [];

    if (tipo === 'cliente') {
      updateFields.push('firma_cliente = ?');
      updateParams.push(firmaUrl);
      updateFields.push('aprobada_por_cliente = 1');
    } else if (tipo === 'tecnico') {
      updateFields.push('firma_tecnico = ?');
      updateParams.push(firmaUrl);
      updateFields.push('aprobada_por_tecnico = 1');
    }

    if (actualizar_estado) {
      updateFields.push('estado = ?');
      updateParams.push(actualizar_estado);
      if (actualizar_estado === 'Aprobada') {
        updateFields.push('fecha_aprobacion_cliente = ?');
        updateParams.push(now);
      }
    }

    updateFields.push('actualizado_en = ?');
    updateParams.push(now);

    updateParams.push(parseInt(orden_id));

    await env.DB.prepare(`
      UPDATE OrdenesTrabajo SET ${updateFields.join(', ')} WHERE id = ?
    `).bind(...updateParams).run();

    // Create tracking entry
    await env.DB.prepare(`
      INSERT INTO SeguimientoOT (orden_id, estado_anterior, estado_nuevo,
        realizado_por, realizado_por_tipo, notas, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      parseInt(orden_id),
      order.estado,
      actualizar_estado || order.estado,
      tipo === 'tecnico' ? 'Sistema (Técnico)' : 'Cliente',
      tipo,
      `Firma digital guardada en R2: ${tipo}`,
      now
    ).run();

    return jsonResponse({
      success: true,
      firma_url: firmaUrl,
      ruta_r2: rutaR2,
      tipo,
      mensaje: `Firma del ${tipo} guardada exitosamente`,
    });

  } catch (error) {
    console.error('Error saving signature to R2:', error);
    return errorResponse('Error al guardar la firma: ' + error.message, 500);
  }
}
