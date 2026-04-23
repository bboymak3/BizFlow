// ============================================
// BIZFLOW - Generate Signature Token
// POST /api/tecnico/generar-token-firma
// Generar token único para firma del cliente
// ============================================

import {
  corsHeaders,
  handleOptions,
  parseBody,
  validateRequired,
  successResponse,
  errorResponse,
  chileNowStr,
  generateToken,
  asegurarColumnas,
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

  const { valid, missing } = validateRequired(body, ['orden_id', 'tecnico_id']);
  if (!valid) {
    return errorResponse(`Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  const { orden_id, tecnico_id } = body;

  try {
    // Ensure firma_token column exists
    await asegurarColumnas(env.DB, 'OrdenesTrabajo', [
      { column: 'firma_token', type: 'TEXT', default: '' },
      { column: 'firma_token_expiracion', type: 'TEXT', default: '' },
    ]);

    // 1. Get current order
    const orden = await env.DB.prepare(`
      SELECT id, numero_orden, estado, estado_trabajo, firma_token, firma_token_expiracion
      FROM OrdenesTrabajo WHERE id = ?
    `).bind(parseInt(orden_id)).first();

    if (!orden) {
      return errorResponse('Orden de trabajo no encontrada', 404);
    }

    // 2. Verify technician assignment
    if (orden.tecnico_asignado_id !== parseInt(tecnico_id)) {
      return errorResponse('Esta orden no está asignada a este técnico', 403);
    }

    // 3. Check if order is in a valid state for signature
    const estadosValidos = ['Completada', 'En Proceso'];
    if (!estadosValidos.includes(orden.estado) && !['Completada', 'En Progreso'].includes(orden.estado_trabajo)) {
      return errorResponse(
        'La orden no está en un estado que permita generar firma. ' +
        'La orden debe estar completada o en proceso.'
      );
    }

    // 4. Check if there's already a valid (non-expired) token
    const now = new Date();
    if (orden.firma_token && orden.firma_token_expiracion) {
      const expiracion = new Date(orden.firma_token_expiracion);
      if (expiracion > now) {
        // Token still valid, return existing one
        return successResponse({
          token: orden.firma_token,
          url_aprobacion: `/aprobar-tecnico?token=${orden.firma_token}`,
          expiracion: orden.firma_token_expiracion,
          mensaje: 'Token existente aún es válido',
        });
      }
    }

    // 5. Generate new token
    const token = generateToken(32);
    // Token expires in 72 hours
    const expiracion = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const expiracionStr = expiracion.toISOString().replace('T', ' ').substring(0, 19);

    // 6. Save token to order
    await env.DB.prepare(`
      UPDATE OrdenesTrabajo SET firma_token = ?, firma_token_expiracion = ? WHERE id = ?
    `).bind(token, expiracionStr, parseInt(orden_id)).run();

    return successResponse({
      token,
      url_aprobacion: `/aprobar-tecnico?token=${token}`,
      expiracion: expiracionStr,
      numero_orden: orden.numero_orden,
      mensaje: 'Token de firma generado exitosamente. Comparta este enlace con el cliente.',
    });
  } catch (error) {
    console.error('Error generating signature token:', error);
    return errorResponse('Error al generar el token de firma', 500);
  }
}
