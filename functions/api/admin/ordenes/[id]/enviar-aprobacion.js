// ============================================================
// BizFlow - Admin Ordenes [id] Enviar Aprobación API
// POST: Generate approval token, update order, send WhatsApp with approval link
// ============================================================

import { jsonResponse, errorResponse, handleCors, generarToken, hoyISO } from '../../../../lib/db-helpers.js';
import { enviarNotificacion } from '../../../../lib/notificaciones.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB } = env;
  const { id } = params;

  if (request.method !== 'POST') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    const orden = await DB.prepare(`
      SELECT ot.*, c.telefono as cliente_telefono, c.nombre as cliente_nombre, c.apellido as cliente_apellido
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      WHERE ot.id = ?
    `).bind(id).first();

    if (!orden) {
      return errorResponse('Orden no encontrada', 404);
    }

    if (orden.estado !== 'completada') {
      return errorResponse('Solo se puede enviar aprobación para órdenes en estado "completada". Estado actual: "' + orden.estado + '"');
    }

    if (!orden.cliente_telefono) {
      return errorResponse('El cliente no tiene teléfono registrado');
    }

    const data = await request.json();
    const { empresa_nombre } = data;

    // Generate approval token
    const token = generarToken(48);

    const now = hoyISO();

    // Update order with token
    await DB.prepare(`
      UPDATE OrdenesTrabajo
      SET token_aprobacion = ?, actualizado_en = ?
      WHERE id = ?
    `).bind(token, now, id).run();

    // Build approval URL
    const baseUrl = env.BASE_URL || new URL(request.url).origin;
    const urlAprobacion = `${baseUrl}/aprobar?token=${token}`;

    // Send WhatsApp notification
    const nombreEmpresa = empresa_nombre || 'BizFlow';
    const mensaje = `📝 *Solicitud de Aprobación - OT #${orden.numero}*\n` +
      `Estimado/a ${orden.cliente_nombre || 'Cliente'},\n\n` +
      `Su orden de trabajo está lista para revisión.\n` +
      `Total: $${(orden.total || 0).toFixed(2)}\n\n` +
      `🔗 *Apruebe su orden aquí:*\n${urlAprobacion}\n\n` +
      `🏢 ${nombreEmpresa}`;

    const { ULTRAMSG_INSTANCE, ULTRAMSG_TOKEN } = env;

    let enviado = false;
    let errorEnvio = '';

    if (ULTRAMSG_INSTANCE && ULTRAMSG_TOKEN) {
      try {
        const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
        const body = new URLSearchParams({
          token: ULTRAMSG_TOKEN,
          to: orden.cliente_telefono,
          body: mensaje,
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        const result = await response.json();
        enviado = result.status === 'success';
        errorEnvio = enviado ? '' : (result.message || 'Error desconocido');
      } catch (err) {
        errorEnvio = err.message;
      }
    }

    // Log notification
    await DB.prepare(`
      INSERT INTO NotificacionesWhatsApp (orden_id, destinatario, tipo, mensaje,
        estado_envio, error, enviado_en)
      VALUES (?, ?, 'aprobacion_pendiente', ?, ?, ?, ?)
    `).bind(
      parseInt(id),
      orden.cliente_telefono,
      mensaje,
      enviado ? 'enviada' : 'fallida',
      errorEnvio,
      enviado ? new Date().toISOString() : null
    ).run();

    // Add tracking entry
    await DB.prepare(`
      INSERT INTO SeguimientoOT (orden_id, estado_anterior, estado_nuevo,
        realizado_por, realizado_por_tipo, notas)
      VALUES (?, 'completada', 'completada', 'sistema', 'sistema', ?)
    `).bind(id, 'Solicitud de aprobación enviada via WhatsApp').run();

    return jsonResponse({
      mensaje: enviado
        ? 'Solicitud de aprobación enviada exitosamente via WhatsApp'
        : 'Token de aprobación generado. WhatsApp no configurado o envío falló.',
      token,
      url_aprobacion: urlAprobacion,
      enviada: enviado,
      error: errorEnvio,
    });
  } catch (error) {
    console.error('Enviar aprobación error:', error);
    return errorResponse('Error enviando aprobación: ' + error.message, 500);
  }
}
