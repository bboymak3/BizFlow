// ============================================================
// BizFlow - Admin Configuración [clave] API
// GET: Get config value by key
// PUT: Update config value
// ============================================================

import { jsonResponse, errorResponse, handleCors, hoyISO } from '../../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB } = env;
  const { clave } = params;

  if (!clave || !clave.trim()) {
    return errorResponse('clave es requerida en la URL');
  }

  try {
    if (request.method === 'GET') {
      return await handleGet(request, DB, clave);
    } else if (request.method === 'PUT') {
      return await handlePut(request, DB, clave);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Configuración error:', error);
    return errorResponse('Error en configuración: ' + error.message, 500);
  }
}

async function handleGet(request, DB, clave) {
  const url = new URL(request.url);
  const usuarioId = url.searchParams.get('usuario_id');

  if (!usuarioId) {
    usuarioId = '1';
  }

  const config = await DB.prepare(
    'SELECT * FROM Configuracion WHERE usuario_id = ? AND clave = ?'
  ).bind(usuarioId, clave).first();

  if (!config) {
    return jsonResponse({
      clave,
      valor: null,
      existe: false,
    });
  }

  return jsonResponse({
    id: config.id,
    clave: config.clave,
    valor: config.valor,
    actualizado_en: config.actualizado_en,
    existe: true,
  });
}

async function handlePut(request, DB, clave) {
  const url = new URL(request.url);
  const usuarioId = url.searchParams.get('usuario_id');

  if (!usuarioId) {
    usuarioId = '1';
  }

  const data = await request.json();
  const { valor } = data;

  if (valor === undefined) {
    return errorResponse('valor es requerido');
  }

  const now = hoyISO();

  // Try to update existing, if not exists insert
  const existing = await DB.prepare(
    'SELECT id FROM Configuracion WHERE usuario_id = ? AND clave = ?'
  ).bind(usuarioId, clave).first();

  if (existing) {
    await DB.prepare(`
      UPDATE Configuracion SET valor = ?, actualizado_en = ? WHERE id = ?
    `).bind(String(valor), now, existing.id).run();
  } else {
    await DB.prepare(`
      INSERT INTO Configuracion (usuario_id, clave, valor, actualizado_en)
      VALUES (?, ?, ?, ?)
    `).bind(usuarioId, clave, String(valor), now).run();
  }

  return jsonResponse({
    clave,
    valor: String(valor),
    actualizado: true,
    mensaje: `Configuración "${clave}" actualizada correctamente`,
  });
}
