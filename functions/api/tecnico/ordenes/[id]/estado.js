// ============================================================
// BizFlow - Technician Change Order Status API
// PUT /api/tecnico/ordenes/:id/estado
// Body: { estado, notas, latitud, longitud }
// ============================================================

import { jsonResponse, errorResponse, handleCors, hoyISO, validarEstadoOT } from '../../../../lib/db-helpers.js';
import { notificarCambioEstado } from '../../../../lib/notificaciones.js';

// Technicians can only change to these states
const TECNICO_ESTADOS_VALIDOS = ['en_proceso', 'pausada', 'completada'];

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  if (context.request.method !== 'PUT') {
    return errorResponse('Método no permitido', 405);
  }

  const { request, env, params } = context;
  const { DB } = env;
  const { id } = params;

  try {
    const body = await request.json();
    const { estado, notas, latitud, longitud, tecnico_id } = body;

    if (!estado || !tecnico_id) {
      return errorResponse('Estado y tecnico_id son obligatorios');
    }

    // Validate that the state change is allowed for technicians
    if (!TECNICO_ESTADOS_VALIDOS.includes(estado)) {
      return errorResponse(
        `Estado no válido para técnico. Estados permitidos: ${TECNICO_ESTADOS_VALIDOS.join(', ')}`
      );
    }

    // Get current order
    const orden = await DB.prepare(`
      SELECT id, estado, estado_trabajo, tecnico_asignado_id, tecnico_id, fecha_inicio FROM OrdenesTrabajo WHERE id = ?
    `).bind(parseInt(id)).first();

    if (!orden) {
      return errorResponse('Orden no encontrada', 404);
    }

    // Verify technician assignment
    if (orden.tecnico_id !== parseInt(tecnico_id)) {
      return errorResponse('Esta orden no está asignada a este técnico', 403);
    }

    // Validate overall state is valid
    if (!validarEstadoOT(estado)) {
      return errorResponse('Estado no válido');
    }

    const estadoAnterior = orden.estado;
    const now = hoyISO();

    // Build update clauses
    const setClauses = ['estado = ?', 'actualizado_en = ?'];
    const updateParams = [estado, now];

    // Handle specific transitions
    if (estado === 'en_proceso' && !orden.fecha_inicio) {
      setClauses.push('fecha_inicio = ?');
      updateParams.push(now);
    }

    if (estado === 'completada') {
      setClauses.push('fecha_fin = ?');
      updateParams.push(now);
    }

    // Update GPS coordinates if provided
    if (latitud !== null && longitud !== null) {
      setClauses.push('latitud_ubicacion = ?');
      setClauses.push('longitud_ubicacion = ?');
      updateParams.push(parseFloat(latitud));
      updateParams.push(parseFloat(longitud));
    }

    updateParams.push(parseInt(id));
    const sqlUpdate = `UPDATE OrdenesTrabajo SET ${setClauses.join(', ')} WHERE id = ?`;
    await DB.prepare(sqlUpdate).bind(...updateParams).run();

    // Get technician name for tracking
    const tecnico = await DB.prepare(`
      SELECT nombre FROM Tecnicos WHERE id = ?
    `).bind(parseInt(tecnico_id)).first();

    // Insert tracking record
    await DB.prepare(`
      INSERT INTO SeguimientoOT (orden_id, estado_anterior, estado_nuevo, realizado_por, realizado_por_tipo, notas, latitud, longitud, creado_en)
      VALUES (?, ?, ?, ?, 'tecnico', ?, ?, ?, ?)
    `).bind(
      parseInt(id),
      estadoAnterior,
      estado,
      tecnico?.nombre || 'Técnico',
      notas || '',
      latitud !== null ? parseFloat(latitud) : 0,
      longitud !== null ? parseFloat(longitud) : 0,
      now
    ).run();

    // Send WhatsApp notification (non-blocking)
    try {
      await notificarCambioEstado(env, DB, parseInt(id), estado, {
        telefono: tecnico?.telefono || '',
      });
    } catch (notifErr) {
      console.warn('[NOTIF] Error enviando notificación:', notifErr.message);
    }

    return jsonResponse({
      orden_id: parseInt(id),
      estado_anterior: estadoAnterior,
      estado_nuevo: estado,
      fecha_evento: now,
      mensaje: `Estado cambiado exitosamente de "${estadoAnterior}" a "${estado}"`,
    });
  } catch (error) {
    console.error('[CAMBIAR ESTADO] Error:', error);
    return errorResponse('Error al cambiar el estado: ' + error.message, 500);
  }
}
