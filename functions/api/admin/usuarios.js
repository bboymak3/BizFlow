// ============================================================
// BizFlow - Usuarios SaaS CRUD API
// GET: list users for negocio_id (excluding passwords)
// POST: create user { email, password, nombre, rol }
// PUT: update user
// DELETE: delete by ?id
// ============================================================

import {
  handleOptions,
  parseBody,
  successRes,
  errorRes,
  simpleHash,
  chileNowISO,
  asegurarColumnasFaltantes,
  validateRequired,
  getColumnas,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

// GET - List users
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const negocioId = url.searchParams.get('negocio_id') || '1';

  try {
    await asegurarColumnasFaltantes(env);
    const cols = await getColumnas(env, 'Usuarios');

    let query = `SELECT `;
    const selectFields = cols.filter(c => c !== 'password' && c !== 'password_hash');
    query += selectFields.join(', ');
    query += ` FROM Usuarios WHERE (negocio_id = ? OR negocio_id IS NULL)`;

    // Include inactive only if explicitly requested
    if (cols.includes('activo')) {
      const incluirInactivos = url.searchParams.get('incluir_inactivos') === 'true';
      if (!incluirInactivos) {
        query += ` AND (activo = 1 OR activo IS NULL)`;
      }
    }

    query += ` ORDER BY nombre ASC`;

    const result = await env.DB.prepare(query).bind(negocioId).all();

    return successRes(result.results || []);
  } catch (error) {
    console.error('Usuarios list error:', error);
    return errorRes('Error listando usuarios: ' + error.message, 500);
  }
}

// POST - Create user
export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { email, password, nombre, rol, negocio_id } = data;

  const validation = validateRequired(data, ['email', 'password', 'nombre']);
  if (!validation.valid) {
    return errorRes(`Campos requeridos faltantes: ${validation.missing.join(', ')}`);
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorRes('Email inválido');
  }

  // Validate password length
  if (password.length < 6) {
    return errorRes('La contraseña debe tener al menos 6 caracteres');
  }

  try {
    await asegurarColumnasFaltantes(env);
    const cols = await getColumnas(env, 'Usuarios');

    // Check unique email
    const existing = await env.DB.prepare(
      `SELECT id FROM Usuarios WHERE email = ? LIMIT 1`
    ).bind(email.trim().toLowerCase()).first();

    if (existing) {
      return errorRes('Ya existe un usuario con ese email');
    }

    // Hash password
    const hashedPassword = simpleHash(password);

    // Determine the password column name
    const passCol = cols.includes('password_hash') ? 'password_hash' : 'password';

    let query = `
      INSERT INTO Usuarios (email, ${passCol}, nombre, rol, negocio_id, activo, fecha_registro)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `;

    // Handle updated_at if exists
    const params = [
      email.trim().toLowerCase(),
      hashedPassword,
      nombre.trim(),
      rol?.trim() || 'admin',
      negocio_id || '1',
      chileNowISO(),
    ];

    if (cols.includes('created_at')) {
      query = query.replace('fecha_registro', 'created_at');
    }
    if (cols.includes('updated_at')) {
      query = query.replace(')', ', updated_at)');
      query = query.replace('VALUES', 'VALUES');
      // Rebuild with updated_at
      query = `
        INSERT INTO Usuarios (email, ${passCol}, nombre, rol, negocio_id, activo, ${cols.includes('created_at') ? 'created_at' : 'fecha_registro'}, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `;
      params.push(chileNowISO());
    }

    const result = await env.DB.prepare(query).bind(...params).run();

    // Fetch created user (without password)
    const user = await env.DB.prepare(`
      SELECT ${cols.filter(c => c !== 'password' && c !== 'password_hash').join(', ')}
      FROM Usuarios WHERE id = ?
    `).bind(result.meta.last_row_id).first();

    return successRes(user, 201);
  } catch (error) {
    console.error('Usuario create error:', error);
    return errorRes('Error creando usuario: ' + error.message, 500);
  }
}

// PUT - Update user
export async function onRequestPut(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { id, password, ...fields } = data;

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);
    const cols = await getColumnas(env, 'Usuarios');

    const existing = await env.DB.prepare(
      `SELECT id, email FROM Usuarios WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Usuario no encontrado', 404);
    }

    // Check unique email if changing
    if (fields.email && fields.email.trim().toLowerCase() !== existing.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
        return errorRes('Email inválido');
      }
      const dup = await env.DB.prepare(
        `SELECT id FROM Usuarios WHERE email = ? AND id != ? LIMIT 1`
      ).bind(fields.email.trim().toLowerCase(), id).first();
      if (dup) {
        return errorRes('Ya existe un usuario con ese email');
      }
    }

    const allowedFields = ['email', 'nombre', 'rol', 'activo'];
    const passCol = cols.includes('password_hash') ? 'password_hash' : 'password';

    const updates = [];
    const params = [];

    for (const [key, value] of Object.entries(fields)) {
      if (!allowedFields.includes(key)) continue;
      if (key === 'email') {
        updates.push('email = ?');
        params.push(value.trim().toLowerCase());
      } else if (key === 'activo') {
        updates.push('activo = ?');
        params.push(value ? 1 : 0);
      } else {
        updates.push(`${key} = ?`);
        params.push(value?.trim() || value);
      }
    }

    // Handle password change
    if (password) {
      if (password.length < 6) {
        return errorRes('La contraseña debe tener al menos 6 caracteres');
      }
      updates.push(`${passCol} = ?`);
      params.push(simpleHash(password));
    }

    if (updates.length === 0) {
      return errorRes('No hay campos para actualizar');
    }

    // Update timestamp
    const tsCol = cols.includes('updated_at') ? 'updated_at' : cols.includes('fecha_registro') ? 'fecha_registro' : null;
    if (tsCol) {
      updates.push(`${tsCol} = ?`);
      params.push(chileNowISO());
    }

    params.push(id);

    await env.DB.prepare(
      `UPDATE Usuarios SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    const user = await env.DB.prepare(`
      SELECT ${cols.filter(c => c !== 'password' && c !== 'password_hash').join(', ')}
      FROM Usuarios WHERE id = ?
    `).bind(id).first();

    return successRes(user);
  } catch (error) {
    console.error('Usuario update error:', error);
    return errorRes('Error actualizando usuario: ' + error.message, 500);
  }
}

// DELETE - Delete user
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    const existing = await env.DB.prepare(
      `SELECT id, email, rol FROM Usuarios WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Usuario no encontrado', 404);
    }

    // Prevent deleting the last admin
    if (existing.rol === 'admin') {
      const adminCount = await env.DB.prepare(
        `SELECT COUNT(*) as total FROM Usuarios WHERE rol = 'admin' AND activo = 1 AND id != ?`
      ).bind(id).first();

      if (!adminCount || adminCount.total === 0) {
        return errorRes('No se puede eliminar al último administrador activo');
      }
    }

    await env.DB.prepare(`DELETE FROM Usuarios WHERE id = ?`).bind(id).run();

    return successRes({ deleted: true, id: parseInt(id) });
  } catch (error) {
    console.error('Usuario delete error:', error);
    return errorRes('Error eliminando usuario: ' + error.message, 500);
  }
}
