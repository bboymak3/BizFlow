// ============================================================
// BizFlow - Admin Contabilidad Cuentas API
// GET: List chart of accounts
// POST: Create account
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const { DB } = env;

  try {
    if (request.method === 'GET') {
      return await handleGet(request, DB);
    } else if (request.method === 'POST') {
      return await handlePost(request, DB);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Cuentas contables error:', error);
    return errorResponse('Error en cuentas contables: ' + error.message, 500);
  }
}

async function handleGet(request, DB) {
  const url = new URL(request.url);
  let usuarioId = url.searchParams.get('usuario_id');

  if (!usuarioId) {
    // Default to usuario_id 1 when not provided
    usuarioId = '1';
  }

  const { results } = await DB.prepare(`
    SELECT * FROM CuentasContables
    WHERE usuario_id = ? AND activa = 1
    ORDER BY codigo ASC
  `).bind(usuarioId).all();

  // Calculate balance for each account
  const cuentasConSaldo = [];
  for (const cuenta of (results || [])) {
    const saldoDebe = await DB.prepare(`
      SELECT COALESCE(SUM(m.debe), 0) as total_debe
      FROM MovimientosContables m
      JOIN AsientosContables a ON m.asiento_id = a.id
      WHERE m.cuenta_id = ? AND a.usuario_id = ?
    `).bind(cuenta.id, usuarioId).first();

    const saldoHaber = await DB.prepare(`
      SELECT COALESCE(SUM(m.haber), 0) as total_haber
      FROM MovimientosContables m
      JOIN AsientosContables a ON m.asiento_id = a.id
      WHERE m.cuenta_id = ? AND a.usuario_id = ?
    `).bind(cuenta.id, usuarioId).first();

    const debe = saldoDebe?.total_debe || 0;
    const haber = saldoHaber?.total_haber || 0;

    cuentasConSaldo.push({
      ...cuenta,
      total_debe: debe,
      total_haber: haber,
      saldo: cuenta.tipo === 'activo' || cuenta.tipo === 'gasto'
        ? debe - haber
        : haber - debe,
    });
  }

  return jsonResponse({
    cuentas: cuentasConSaldo,
    total: cuentasConSaldo.length,
  });
}

async function handlePost(request, DB) {
  const data = await request.json();
  let { usuario_id, codigo, nombre, tipo, descripcion } = data;

  if (!usuario_id) usuario_id = 1;
  if (!codigo || !codigo.trim()) return errorResponse('codigo es requerido');
  if (!nombre || !nombre.trim()) return errorResponse('nombre es requerido');

  const tiposValidos = ['activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto'];
  if (!tiposValidos.includes(tipo)) {
    return errorResponse(`tipo inválido. Valores: ${tiposValidos.join(', ')}`);
  }

  // Check for duplicate code
  const existing = await DB.prepare(
    'SELECT id FROM CuentasContables WHERE codigo = ? AND usuario_id = ?'
  ).bind(codigo.trim(), usuario_id).first();

  if (existing) {
    return errorResponse('Ya existe una cuenta con ese código');
  }

  const result = await DB.prepare(`
    INSERT INTO CuentasContables (usuario_id, codigo, nombre, tipo, descripcion)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    usuario_id,
    codigo.trim(),
    nombre.trim(),
    tipo,
    descripcion?.trim() || ''
  ).run();

  const cuenta = await DB.prepare(
    'SELECT * FROM CuentasContables WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return jsonResponse({ cuenta }, 201);
}
