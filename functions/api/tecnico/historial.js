// ============================================
// BIZFLOW - Order Tracking History
// GET /api/tecnico/historial?orden_id=X
// Obtener historial completo de seguimiento de una orden
// ============================================

import {
  corsHeaders,
  handleOptions,
  successResponse,
  errorResponse,
} from '../../lib/db-helpers.js';

export async function onRequestOptions(context) {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const ordenId = url.searchParams.get('orden_id');

  if (!ordenId) {
    return errorResponse('Parámetro orden_id es obligatorio');
  }

  try {
    // 1. Get order basic info
    const orden = await env.DB.prepare(`
      SELECT id, numero_orden, patente_placa, estado, estado_trabajo
      FROM OrdenesTrabajo WHERE id = ?
    `).bind(parseInt(ordenId)).first();

    if (!orden) {
      return errorResponse('Orden de trabajo no encontrada', 404);
    }

    // 2. Get full tracking history
    const seguimiento = await env.DB.prepare(`
      SELECT
        s.id,
        s.orden_id,
        s.tecnico_id,
        s.estado_anterior,
        s.estado_nuevo,
        s.latitud,
        s.longitud,
        s.observaciones,
        s.fecha_evento,
        t.nombre AS tecnico_nombre,
        t.telefono AS tecnico_telefono
      FROM SeguimientoOT s
      LEFT JOIN Tecnicos t ON s.tecnico_id = t.id
      WHERE s.orden_id = ?
      ORDER BY s.fecha_evento DESC
    `).bind(parseInt(ordenId)).all();

    // 3. Also get notes as part of history (they provide context)
    const notasHistorial = await env.DB.prepare(`
      SELECT
        nt.id,
        nt.nota AS observaciones,
        nt.fecha_nota AS fecha_evento,
        t.nombre AS tecnico_nombre,
        'nota' AS tipo_evento
      FROM NotasTrabajo nt
      LEFT JOIN Tecnicos t ON nt.tecnico_id = t.id
      WHERE nt.orden_id = ?
      ORDER BY nt.fecha_nota DESC
    `).bind(parseInt(ordenId)).all();

    // 4. Build timeline
    const timeline = [
      ...seguimiento.results.map((s) => ({
        ...s,
        tipo_evento: 'cambio_estado',
        titulo: `Cambio: ${s.estado_anterior || 'Sin estado'} → ${s.estado_nuevo}`,
      })),
      ...notasHistorial.results.map((n) => ({
        ...n,
        tipo_evento: 'nota',
        titulo: 'Nota agregada',
      })),
    ].sort((a, b) => {
      // Sort by date descending (most recent first)
      const dateA = new Date(a.fecha_evento);
      const dateB = new Date(b.fecha_evento);
      return dateB - dateA;
    });

    // 5. Calculate duration if available
    let duracion_total = null;
    const primeraFecha = timeline.length > 0
      ? new Date(timeline[timeline.length - 1].fecha_evento)
      : null;
    const ultimaFecha = timeline.length > 0
      ? new Date(timeline[0].fecha_evento)
      : null;

    if (primeraFecha && ultimaFecha && primeraFecha !== ultimaFecha) {
      const diffMs = Math.abs(ultimaFecha - primeraFecha);
      const diffHours = Math.round(diffMs / (1000 * 60 * 60) * 10) / 10;
      const diffDays = Math.round(diffHours / 24 * 10) / 10;
      duracion_total = {
        horas: diffHours,
        dias: diffDays,
        texto: diffDays >= 1 ? `${diffDays} día(s)` : `${diffHours} hora(s)`,
      };
    }

    return successResponse({
      orden: {
        id: orden.id,
        numero_orden: orden.numero_orden,
        patente_placa: orden.patente_placa,
        estado_actual: orden.estado_trabajo || orden.estado,
      },
      seguimiento: seguimiento.results || [],
      notas: notasHistorial.results || [],
      timeline,
      duracion_total,
      total_eventos: timeline.length,
    });
  } catch (error) {
    console.error('Error fetching tracking history:', error);
    return errorResponse('Error al obtener el historial de seguimiento', 500);
  }
}
