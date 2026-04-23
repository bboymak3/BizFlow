// ============================================
// BIZFLOW - Upload Photo
// POST /api/tecnico/subir-foto
// Subir foto de trabajo (antes/durante/despues)
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

// Max photo size: ~5MB base64 encoded (base64 is ~33% larger than binary)
const MAX_PHOTO_SIZE = 7 * 1024 * 1024; // 7MB for base64

const VALID_TIPOS = ['antes', 'durante', 'despues', 'diagnostico', 'repuesto', 'final'];

export async function onRequestOptions(context) {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await parseBody(request);

  if (!body) {
    return errorResponse('Body de la petición inválido');
  }

  const { valid, missing } = validateRequired(body, ['orden_id', 'tecnico_id', 'foto_base64']);
  if (!valid) {
    return errorResponse(`Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  const { orden_id, tecnico_id, foto_base64, tipo = 'antes' } = body;

  // Validate tipo
  if (!VALID_TIPOS.includes(tipo)) {
    return errorResponse(`Tipo de foto inválido. Valores permitidos: ${VALID_TIPOS.join(', ')}`);
  }

  // Validate base64 data
  if (!foto_base64 || typeof foto_base64 !== 'string') {
    return errorResponse('Datos de foto inválidos');
  }

  // Clean up base64 string (remove data URI prefix if present)
  const base64Clean = foto_base64.replace(/^data:image\/[a-z]+;base64,/, '');

  // Check size
  if (base64Clean.length > MAX_PHOTO_SIZE) {
    return errorResponse(
      `La foto es demasiado grande (${Math.round(base64Clean.length / 1024 / 1024)}MB). ` +
      `Tamaño máximo permitido: ${Math.round(MAX_PHOTO_SIZE / 1024 / 1024)}MB`
    );
  }

  // Basic base64 validation
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64Clean.substring(0, 100))) {
    return errorResponse('Formato de imagen inválido (no es un base64 válido)');
  }

  try {
    // 1. Verify order exists
    const orden = await env.DB.prepare(`
      SELECT id, negocio_id FROM OrdenesTrabajo WHERE id = ?
    `).bind(parseInt(orden_id)).first();

    if (!orden) {
      return errorResponse('Orden de trabajo no encontrada', 404);
    }

    // 2. Verify technician
    const tecnico = await env.DB.prepare(`
      SELECT id FROM Tecnicos WHERE id = ? AND activo = 1
    `).bind(parseInt(tecnico_id)).first();

    if (!tecnico) {
      return errorResponse('Técnico no encontrado o inactivo', 404);
    }

    // 3. Insert photo
    const now = chileNowStr();
    const result = await env.DB.prepare(`
      INSERT INTO FotosTrabajo (orden_id, tecnico_id, foto_base64, tipo, fecha_subida, negocio_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      parseInt(orden_id),
      parseInt(tecnico_id),
      base64Clean,
      tipo,
      now,
      orden.negocio_id
    ).run();

    return successResponse({
      id: result.meta.last_row_id,
      orden_id: parseInt(orden_id),
      tecnico_id: parseInt(tecnico_id),
      tipo,
      fecha_subida: now,
      tamano_bytes: base64Clean.length,
      mensaje: 'Foto subida exitosamente',
    });
  } catch (error) {
    console.error('Error uploading photo:', error);
    return errorResponse('Error al subir la foto', 500);
  }
}
