// ============================================
// BIZFLOW - Approve Order with Signature
// POST /api/aprobar-orden
// Aprobar orden de trabajo con firma del cliente
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

  const { token, firma_imagen } = body;
  const now = chileNowStr();

  try {
    // 1. Find order by token
    const orden = await env.DB.prepare(`
      SELECT * FROM OrdenesTrabajo WHERE token = ? OR firma_token = ?
    `).bind(token, token).first();

    if (!orden) {
      return errorResponse('Orden no encontrada. Verifique el enlace.', 404);
    }

    // 2. Check if already approved or cancelled
    if (orden.estado === 'Aprobada') {
      return successResponse({
        orden_id: orden.id,
        numero_orden: orden.numero_orden,
        estado: orden.estado,
        mensaje: 'Esta orden ya fue aprobada previamente.',
      });
    }

    if (orden.estado === 'Cancelada') {
      return errorResponse('Esta orden ha sido cancelada y no puede ser aprobada.', 400);
    }

    // 3. Check token expiration if it's a firma_token
    if (orden.firma_token === token && orden.firma_token_expiracion) {
      const expiracion = new Date(orden.firma_token_expiracion);
      const ahora = new Date();
      if (expiracion < ahora) {
        return errorResponse('El enlace de aprobación ha expirado. Solicite uno nuevo al técnico.', 410);
      }
    }

    // 4. Update order
    await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET estado = 'Aprobada',
          firma_imagen = ?,
          fecha_aprobacion = ?
      WHERE id = ?
    `).bind(
      firma_imagen || null,
      now,
      orden.id
    ).run();

    // 5. Insert tracking record
    await env.DB.prepare(`
      INSERT INTO SeguimientoOT (orden_id, tecnico_id, estado_anterior, estado_nuevo, observaciones, fecha_evento)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      orden.id,
      orden.tecnico_asignado_id || null,
      orden.estado,
      'Aprobada',
      'Orden aprobada por el cliente',
      now
    ).run();

    // 6. Send WhatsApp notification
    const cliente = await env.DB.prepare(`
      SELECT nombre, telefono FROM Clientes WHERE id = ?
    `).bind(orden.cliente_id).first();

    const tecnico = orden.tecnico_asignado_id
      ? await env.DB.prepare(`
          SELECT nombre FROM Tecnicos WHERE id = ?
        `).bind(orden.tecnico_asignado_id).first()
      : null;

    if (cliente?.telefono) {
      const config = await getConfig(env.DB);
      const mensaje = generarMensajeWhatsApp('aprobada', orden, tecnico, cliente);
      await sendWhatsApp(env.DB, config, {
        orden_id: orden.id,
        telefono: cliente.telefono,
        mensaje,
        tipo_evento: 'aprobada',
        negocio_id: orden.negocio_id,
      });
    }

    return successResponse({
      orden_id: orden.id,
      numero_orden: orden.numero_orden,
      estado: 'Aprobada',
      fecha_aprobacion: now,
      mensaje: 'Orden aprobada exitosamente. ¡Gracias por su confianza!',
    });
  } catch (error) {
    console.error('Error approving order:', error);
    return errorResponse('Error al aprobar la orden', 500);
  }
}
