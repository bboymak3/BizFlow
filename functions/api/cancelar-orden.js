// ============================================
// BIZFLOW - Cancel Order
// POST /api/cancelar-orden
// Cancelar orden de trabajo por token
// ============================================

import {
  corsHeaders,
  handleOptions,
  parseBody,
  validateRequired,
  successResponse,
  errorResponse,
  chileNowStr,
  getConfig,
  sendWhatsApp,
  generarMensajeWhatsApp,
} from '../lib/db-helpers.js';

export async function onRequestOptions(context) {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await parseBody(request);

  if (!body) {
    return errorResponse('Body de la petición inválido');
  }

  const { valid, missing } = validateRequired(body, ['token']);
  if (!valid) {
    return errorResponse(`Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  const { token, motivo } = body;
  const now = chileNowStr();

  try {
    // 1. Find order by token
    const orden = await env.DB.prepare(`
      SELECT * FROM OrdenesTrabajo WHERE token = ? OR firma_token = ?
    `).bind(token, token).first();

    if (!orden) {
      return errorResponse('Orden no encontrada. Verifique el enlace.', 404);
    }

    // 2. Check if already cancelled
    if (orden.estado === 'Cancelada') {
      return successResponse({
        orden_id: orden.id,
        numero_orden: orden.numero_orden,
        estado: orden.estado,
        mensaje: 'Esta orden ya fue cancelada previamente.',
      });
    }

    // 3. Check if already completed/approved (cannot cancel)
    const estadosNoCancelables = ['Aprobada', 'Cerrada'];
    if (estadosNoCancelables.includes(orden.estado)) {
      return errorResponse(
        `No se puede cancelar una orden en estado "${orden.estado}". Contacte al taller.`
      );
    }

    // 4. Update order
    await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET estado = 'Cancelada',
          estado_trabajo = 'No Completada',
          notas = COALESCE(notas || ?, '')
      WHERE id = ?
    `).bind(
      motivo ? `\n\n[CANCELADA - ${now}]\nMotivo: ${motivo}` : `\n\n[CANCELADA - ${now}]`,
      orden.id
    ).run();

    // 5. Insert tracking record
    await env.DB.prepare(`
      INSERT INTO SeguimientoOT (orden_id, tecnico_id, estado_anterior, estado_nuevo, observaciones, fecha_evento)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      orden.id,
      orden.tecnico_asignado_id || null,
      orden.estado_trabajo || orden.estado,
      'No Completada',
      motivo ? `Orden cancelada: ${motivo}` : 'Orden cancelada por el cliente',
      now
    ).run();

    // 6. Send WhatsApp notification
    const cliente = await env.DB.prepare(`
      SELECT nombre, telefono FROM Clientes WHERE id = ?
    `).bind(orden.cliente_id).first();

    if (cliente?.telefono) {
      const config = await getConfig(env.DB);
      const mensaje = generarMensajeWhatsApp('cancelada', orden, null, cliente);
      await sendWhatsApp(env.DB, config, {
        orden_id: orden.id,
        telefono: cliente.telefono,
        mensaje,
        tipo_evento: 'cancelada',
        negocio_id: orden.negocio_id,
      });
    }

    return successResponse({
      orden_id: orden.id,
      numero_orden: orden.numero_orden,
      estado: 'Cancelada',
      fecha_cancelacion: now,
      mensaje: 'Orden cancelada exitosamente.',
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    return errorResponse('Error al cancelar la orden', 500);
  }
}
