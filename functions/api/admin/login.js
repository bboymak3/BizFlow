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

  // Validate email at minimum
  if (!email) {
    return errorRes('Email es requerido', 400);
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Find user by email
    const usuario = await env.DB.prepare(
      `SELECT * FROM Usuarios WHERE email = ? AND activo = 1 LIMIT 1`
    ).bind(email.trim().toLowerCase()).first();

    if (!usuario) {
      // Auto-create admin if this is the first user
      const count = await env.DB.prepare('SELECT COUNT(*) as total FROM Usuarios').first();
      if (count && count.total === 0) {
        const hash = simpleHash(password || 'admin123');
        const result = await env.DB.prepare(
          `INSERT INTO Usuarios (email, password_hash, nombre, rol, empresa, activo)
           VALUES (?, ?, ?, 'admin', 'BizFlow', 1)`
        ).bind(email.trim().toLowerCase(), hash, email.split('@')[0] || 'Admin').run();

        const newUsuario = await env.DB.prepare(
          `SELECT * FROM Usuarios WHERE id = ?`
        ).bind(result.meta.last_row_id).first();

        const token = generateUUID();
        const now = chileNowISO();
        const { password_hash: _, password: __, ...userData } = newUsuario;

        return successRes({ usuario: { ...userData, token, ultimo_acceso: now } });
      }
      return errorRes('Credenciales inválidas - usuario no encontrado', 401);
    }

    // Password check
    const storedPass = usuario.password_hash || usuario.password || '';
    const hashedPassword = simpleHash(password || 'admin123');

    // Accept login if hash matches, plain text matches, or password is empty/any (temp bypass)
    let passwordOk = false;
    if (storedPass === hashedPassword) {
      passwordOk = true;
    } else if (storedPass === password) {
      passwordOk = true;
      // Upgrade plain text to hash
      const passCol = usuario.password_hash !== undefined ? 'password_hash' : 'password';
      await env.DB.prepare(`UPDATE Usuarios SET ${passCol} = ? WHERE id = ?`).bind(hashedPassword, usuario.id).run();
    } else if (!password || password === '') {
      // Temp: allow empty password
      passwordOk = true;
    }

    if (!passwordOk) {
      return errorRes('Credenciales inválidas', 401);
    }

    // Generate session token
    const token = generateUUID();

    // Update last access
    const now = chileNowISO();
    try {
      const tsCol = usuario.actualizado_en !== undefined ? 'actualizado_en' : 'updated_at';
      await env.DB.prepare(
        `UPDATE Usuarios SET ${tsCol} = ? WHERE id = ?`
      ).bind(now, usuario.id).run();
    } catch (e) {
      console.warn('Update access time error:', e.message);
    }

    // Store session token
    try {
      if (usuario.id) {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO Configuracion (usuario_id, clave, valor, actualizado_en)
           VALUES (?, ?, ?, ?)`
        ).bind(usuario.id, 'session_token', token, now).run();
      }
    } catch (e) {
      console.warn('Session storage error:', e.message);
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
    return errorRes('Error interno del servidor: ' + error.message, 500);
  }
}
