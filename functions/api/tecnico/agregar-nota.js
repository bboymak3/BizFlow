// ============================================
// BIZFLOW - Add Note to Order
// POST /api/tecnico/agregar-nota
// Agregar nota a una orden de trabajo
// ============================================

import {
  corsHeaders,
  handleOptions,
  parseBody,
  validateRequired,
  successResponse,
  errorResponse,
  chileNowStr,
} from '../../lib/db-helpers.js';

export async function onRequestOptions(context) {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await parseBody(request);

  if (!body) {
    return errorResponse('Body de la petición inválido');
  }

  const { valid, missing } = validateRequired(body, ['orden_id', 'tecnico_id', 'nota']);
  if (!valid) {
    return errorResponse(`Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  const { orden_id, tecnico_id, nota } = body;
  const now = chileNowStr();

  try {
    // 1. Verify order exists
    const orden = await env.DB.prepare(`
      SELECT id, negocio_id FROM OrdenesTrabajo WHERE id = ?
    `).bind(parseInt(orden_id)).first();

    if (!orden) {
      return errorResponse('Orden de trabajo no encontrada', 404);
    }

    // 2. Verify technician exists
    const tecnico = await env.DB.prepare(`
      SELECT id FROM Tecnicos WHERE id = ? AND activo = 1
    `).bind(parseInt(tecnico_id)).first();

    if (!tecnico) {
      return errorResponse('Técnico no encontrado o inactivo', 404);
    }

    // 3. Insert note
    const result = await env.DB.prepare(`
      INSERT INTO NotasTrabajo (orden_id, tecnico_id, nota, fecha_nota, negocio_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      parseInt(orden_id),
      parseInt(tecnico_id),
      nota.trim(),
      now,
      orden.negocio_id
    ).run();

    return successResponse({
      id: result.meta.last_row_id,
      orden_id: parseInt(orden_id),
      tecnico_id: parseInt(tecnico_id),
      nota: nota.trim(),
      fecha_nota: now,
      mensaje: 'Nota agregada exitosamente',
    });
  } catch (error) {
    console.error('Error adding note:', error);
    return errorResponse('Error al agregar la nota', 500);
  }
}
