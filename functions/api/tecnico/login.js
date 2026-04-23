// ============================================================
// BizFlow - Técnico Login API
// POST /api/tecnico/login
// Authenticate technician with codigo + password
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  if (context.request.method !== 'POST') {
    return errorResponse('Método no permitido', 405);
  }

  const { request, env } = context;
  const { DB } = env;

  try {
    const body = await request.json();
    const { codigo, password } = body;

    if (!codigo || !password) {
      return errorResponse('Código y contraseña son obligatorios');
    }

    // Look up technician by codigo
    const tecnico = await DB.prepare(`
      SELECT t.id, t.nombre, t.codigo, t.especialidad, t.telefono, t.email, t.activo,
             u.password_hash
      FROM Tecnicos t
      INNER JOIN Usuarios u ON t.usuario_id = u.id
      WHERE t.codigo = ? AND t.activo = 1
      LIMIT 1
    `).bind(codigo.trim()).first();

    if (!tecnico) {
      return errorResponse('Credenciales inválidas o técnico inactivo', 401);
    }

    // Verify password (simple comparison — production should use bcrypt/argon2)
    if (tecnico.password_hash !== password) {
      return errorResponse('Credenciales inválidas', 401);
    }

    // Return technician data (exclude password)
    return jsonResponse({
      token: tecnico.id,
      tecnico_id: tecnico.id,
      nombre: tecnico.nombre,
      codigo: tecnico.codigo,
      especialidad: tecnico.especialidad,
      telefono: tecnico.telefono,
      email: tecnico.email,
    });
  } catch (error) {
    console.error('[LOGIN] Error:', error);
    return errorResponse('Error interno del servidor', 500);
  }
}
