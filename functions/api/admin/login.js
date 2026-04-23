// ============================================================
// BizFlow - Admin Login API
// POST: Authenticate admin with email/password
// ============================================================

import {
  corsHeaders,
  parseBody,
  handleOptions,
  successRes,
  errorRes,
  simpleHash,
  generateUUID,
  chileNowISO,
  asegurarColumnasFaltantes,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { email, password } = data;

  // Validate required fields
  if (!email || !password) {
    return errorRes('Email y contraseña son requeridos', 400);
  }

  try {
    // Ensure tables exist
    await asegurarColumnasFaltantes(env);

    // Find user by email
    const usuario = await env.DB.prepare(
      `SELECT * FROM Usuarios WHERE email = ? AND activo = 1 LIMIT 1`
    ).bind(email.trim().toLowerCase()).first();

    if (!usuario) {
      return errorRes('Credenciales inválidas', 401);
    }

    // Simple password check (compare hashed)
    // In production, use bcrypt or similar
    const hashedPassword = simpleHash(password);
    if (usuario.password !== hashedPassword) {
      // Also try plain text comparison for backwards compatibility
      if (usuario.password !== password) {
        return errorRes('Credenciales inválidas', 401);
      }
    }

    // Generate session token
    const token = generateUUID();

    // Update last access
    const now = chileNowISO();
    await env.DB.prepare(
      `UPDATE Usuarios SET ultimo_acceso = ?, updated_at = ? WHERE id = ?`
    ).bind(now, now, usuario.id).run();

    // Store session token (use Configuracion or a sessions table)
    // For simplicity, we'll include it in the response
    await env.DB.prepare(
      `INSERT OR REPLACE INTO Configuracion (clave, valor, negocio_id)
       VALUES (?, ?, ?)`
    ).bind(`session_token_${usuario.id}`, token, usuario.negocio_id || 1).run();

    // Return user data without password
    const { password: _, ...userData } = usuario;

    return successRes({
      usuario: {
        ...userData,
        token,
        ultimo_acceso: now,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return errorRes('Error interno del servidor', 500);
  }
}
