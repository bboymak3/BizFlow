// ============================================================
// BizFlow - Admin Ordenes [id] Seguimiento API
// GET: Tracking history for order
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB } = env;
  const { id } = params;

  if (request.method !== 'GET') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    const orden = await DB.prepare(
      'SELECT id, estado, fecha_creacion FROM OrdenesTrabajo WHERE id = ?'
    ).bind(id).first();

    if (!orden) {
      return errorResponse('Orden no encontrada', 404);
    }

    const { results } = await DB.prepare(`
      SELECT * FROM SeguimientoOT WHERE orden_id = ? ORDER BY creado_en ASC
    `).bind(id).all();

    // Build timeline view
    const timeline = (results || []).map((entry, index) => ({
      ...entry,
      paso: index + 1,
      estado_anterior_display: entry.estado_anterior || '(inicial)',
      estado_nuevo_display: formatEstado(entry.estado_nuevo),
    }));

    return jsonResponse({
      seguimiento: timeline,
      total: timeline.length,
      estado_actual: orden.estado,
    });
  } catch (error) {
    console.error('Seguimiento error:', error);
    return errorResponse('Error en seguimiento: ' + error.message, 500);
  }
}

function formatEstado(estado) {
  const map = {
    'pendiente': 'Pendiente',
    'asignada': 'Asignada',
    'en_proceso': 'En Proceso',
    'pausada': 'Pausada',
    'completada': 'Completada',
    'cancelada': 'Cancelada',
    'aprobada': 'Aprobada',
    'cerrada': 'Cerrada',
  };
  return map[estado] || estado;
}
