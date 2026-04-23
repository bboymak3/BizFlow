// ============================================================
// BizFlow - Admin Ordenes [id] Estado API
// PUT: Change order status with validation, tracking, and notification
// ============================================================

import { jsonResponse, errorResponse, handleCors, validarEstadoOT, hoyISO } from '../../../../lib/db-helpers.js';
import { notificarCambioEstado } from '../../../../lib/notificaciones.js';

// Valid state transitions
const TRANSICIONES_VALIDAS = {
  'pendiente': ['asignada', 'cancelada'],
  'asignada': ['en_proceso', 'pendiente', 'cancelada'],
  'en_proceso': ['pausada', 'completada', 'cancelada'],
  'pausada': ['en_proceso', 'cancelada'],
  'completada': ['aprobada', 'cancelada'],
  'aprobada': ['cerrada'],
  'cancelada': [],
  'cerrada': [],
};

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB } = env;
  const { id } = params;

  if (request.method !== 'PUT') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    const orden = await DB.prepare(
      'SELECT id, estado, estado_trabajo, tecnico_asignado_id, cliente_id FROM OrdenesTrabajo WHERE id = ?'
    ).bind(id).first();

    if (!orden) {
      return errorResponse('Orden no encontrada', 404);
    }

    const data = await request.json();
    const { estado, notas, latitud, longitud } = data;

    if (!estado || !validarEstadoOT(estado)) {
      return errorResponse(`Estado inválido. Estados válidos: pendiente, asignada, en_proceso, pausada, completada, cancelada, aprobada, cerrada`);
    }

    // Validate transition
    const estadoActual = orden.estado;
    if (estadoActual === estado) {
      return errorResponse('La orden ya está en ese estado');
    }

    const transicionesPermitidas = TRANSICIONES_VALIDAS[estadoActual] || [];
    if (!transicionesPermitidas.includes(estado)) {
      return errorResponse(`Transición no permitida de "${estadoActual}" a "${estado}". Permitido: ${transicionesPermitidas.join(', ')}`);
    }

    const now = hoyISO();

    // Update order status
    await DB.prepare(`
      UPDATE OrdenesTrabajo SET estado = ?, actualizado_en = ? WHERE id = ?
    `).bind(estado, now, id).run();

    // Set timestamp fields based on status
    if (estado === 'asignada') {
      await DB.prepare(
        "UPDATE OrdenesTrabajo SET fecha_asignacion = ? WHERE id = ?"
      ).bind(now, id).run();
    } else if (estado === 'en_proceso') {
      await DB.prepare(
        "UPDATE OrdenesTrabajo SET fecha_inicio = ? WHERE id = ?"
      ).bind(now, id).run();
    } else if (estado === 'completada') {
      await DB.prepare(
        "UPDATE OrdenesTrabajo SET fecha_fin = ? WHERE id = ?"
      ).bind(now, id).run();
    } else if (estado === 'aprobada') {
      await DB.prepare(
        "UPDATE OrdenesTrabajo SET fecha_aprobacion_cliente = ?, aprobada_por_cliente = 1 WHERE id = ?"
      ).bind(now, id).run();
    }

    // Record in tracking table
    await DB.prepare(`
      INSERT INTO SeguimientoOT (orden_id, estado_anterior, estado_nuevo, realizado_por,
        realizado_por_tipo, notas, latitud, longitud)
      VALUES (?, ?, ?, 'admin', 'admin', ?, ?, ?)
    `).bind(id, estadoActual, estado, notas?.trim() || '', latitud || 0, longitud || 0).run();

    // Add a note
    await DB.prepare(`
      INSERT INTO NotasTrabajo (orden_id, autor, autor_tipo, contenido)
      VALUES (?, 'Sistema', 'sistema', ?)
    `).bind(id, `Estado cambiado de "${estadoActual}" a "${estado}"${notas ? '. Nota: ' + notas : ''}`).run();

    // Send WhatsApp notification (async)
    notificarCambioEstado(env, DB, parseInt(id), estado, {
      telefono: data.telefono_tecnico || '',
    }).catch(err => {
      console.error('Notification error:', err);
    });

    // Get updated order
    const ordenActualizada = await DB.prepare(
      'SELECT id, estado, estado_trabajo, tecnico_asignado_id, cliente_id FROM OrdenesTrabajo WHERE id = ?'
    ).bind(id).first();

    return jsonResponse({
      orden: ordenActualizada,
      mensaje: `Estado cambiado de "${estadoActual}" a "${estado}" exitosamente`,
    });
  } catch (error) {
    console.error('Cambiar estado error:', error);
    return errorResponse('Error cambiando estado: ' + error.message, 500);
  }
}
