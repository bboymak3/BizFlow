// ============================================
// BIZFLOW - Get Notes for Order
// GET /api/tecnico/notas?orden_id=X
// Obtener notas de una orden de trabajo
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
    // Get all notes for this order, including technician name
    const notas = await env.DB.prepare(`
      SELECT
        nt.id,
        nt.orden_id,
        nt.tecnico_id,
        nt.nota,
        nt.fecha_nota,
        t.nombre AS tecnico_nombre
      FROM NotasTrabajo nt
      LEFT JOIN Tecnicos t ON nt.tecnico_id = t.id
      WHERE nt.orden_id = ?
      ORDER BY nt.fecha_nota DESC
    `).bind(parseInt(ordenId)).all();

    return successResponse({
      notas: notas.results || [],
      total: (notas.results || []).length,
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    return errorResponse('Error al obtener las notas', 500);
  }
}
