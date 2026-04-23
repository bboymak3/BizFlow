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

    // Password check - support both 'password' and 'password_hash' column names
    const storedPass = usuario.password_hash || usuario.password || '';
    const hashedPassword = simpleHash(password);
    if (storedPass !== hashedPassword) {
      // Also try plain text comparison for backwards compatibility
      if (storedPass !== password) {
        return errorRes('Credenciales inválidas', 401);
      }
      // If plain text matched, upgrade to hashed version
      const passCol = usuario.password_hash !== undefined ? 'password_hash' : 'password';
      await env.DB.prepare(`UPDATE Usuarios SET ${passCol} = ? WHERE id = ?`).bind(hashedPassword, usuario.id).run();
    }

    // Generate session token
    const token = generateUUID();

    // Update last access
    const now = chileNowISO();
    const tsCol = usuario.actualizado_en !== undefined ? 'actualizado_en' : 'updated_at';
    await env.DB.prepare(
      `UPDATE Usuarios SET ${tsCol} = ? WHERE id = ?`
    ).bind(now, usuario.id).run();

    // Store session token
    if (usuario.id) {
      await env.DB.prepare(
        `INSERT INTO Configuracion (usuario_id, clave, valor, actualizado_en)
         VALUES (?, ?, ?, ?)`
      ).bind(usuario.id, `session_token`, token, now).run();
    }

    // Return user data without password
    const { password_hash: _, password: __, ...userData } = usuario;

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
