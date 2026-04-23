// ============================================
// BIZFLOW - Técnico Login
// POST /api/tecnico/login
// Autenticar técnico con teléfono + PIN
// ============================================

import {
  corsHeaders,
  handleOptions,
  parseBody,
  validateRequired,
  successResponse,
  errorResponse,
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

  // Validate required fields
  const { valid, missing } = validateRequired(body, ['telefono', 'pin']);
  if (!valid) {
    return errorResponse(`Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  // Sanitize phone - remove spaces, dashes, keep digits
  const telefono = body.telefono.replace(/[\s\-\(\)]/g, '').trim();
  const pin = body.pin.trim();

  try {
    const tecnico = await env.DB.prepare(`
      SELECT id, nombre, telefono, email, pin, activo, comision_porcentaje, especialidad
      FROM Tecnicos
      WHERE telefono = ? AND pin = ? AND activo = 1
      LIMIT 1
    `).bind(telefono, pin).first();

    if (!tecnico) {
      return errorResponse('Credenciales inválidas o técnico inactivo', 401);
    }

    // Return tecnico data (exclude pin from response)
    const { pin: _, ...tecnicoData } = tecnico;

    return successResponse({
      id: tecnicoData.id,
      nombre: tecnicoData.nombre,
      telefono: tecnicoData.telefono,
      email: tecnicoData.email,
      comision_porcentaje: tecnicoData.comision_porcentaje,
      especialidad: tecnicoData.especialidad,
    });
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('Error interno del servidor', 500);
  }
}
