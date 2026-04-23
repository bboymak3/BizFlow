// ============================================================
// BizFlow - Gastos CRUD API
// GET: list gastos with filters ?categoria, ?desde, ?hasta
// POST: create gasto
// PUT: update gasto
// DELETE: delete by ?id
// ============================================================

import {
  handleOptions,
  parseBody,
  successRes,
  errorRes,
  chileDate,
  chileNowISO,
  asegurarColumnasFaltantes,
  validateRequired,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

// GET - List gastos
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const categoria = url.searchParams.get('categoria');
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta');
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 200);
  const offset = (page - 1) * limit;

  try {
    await asegurarColumnasFaltantes(env);

    let query = `SELECT * FROM GastosNegocio WHERE (negocio_id = 1 OR negocio_id IS NULL)`;
    const countQuery = `SELECT COUNT(*) as total FROM GastosNegocio WHERE (negocio_id = 1 OR negocio_id IS NULL)`;
    const params = [];
    const countParams = [];

    if (categoria) {
      query += ` AND categoria = ?`;
      countQuery += ` AND categoria = ?`;
      params.push(categoria);
      countParams.push(categoria);
    }
    if (desde) {
      query += ` AND fecha_gasto >= ?`;
      countQuery += ` AND fecha_gasto >= ?`;
      params.push(desde);
      countParams.push(desde);
    }
    if (hasta) {
      query += ` AND fecha_gasto <= ?`;
      countQuery += ` AND fecha_gasto <= ?`;
      params.push(hasta);
      countParams.push(hasta);
    }

    query += ` ORDER BY fecha_gasto DESC, id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      env.DB.prepare(query).bind(...params).all(),
      env.DB.prepare(countQuery).bind(...countParams).first(),
    ]);

    // Get totals by category
    let totalQuery = `
      SELECT categoria, COUNT(*) as cantidad, COALESCE(SUM(monto), 0) as total
      FROM GastosNegocio WHERE (negocio_id = 1 OR negocio_id IS NULL)
    `;
    const totalParams = [];
    if (categoria) {
      totalQuery += ` AND categoria = ?`;
      totalParams.push(categoria);
    }
    if (desde) {
      totalQuery += ` AND fecha_gasto >= ?`;
      totalParams.push(desde);
    }
    if (hasta) {
      totalQuery += ` AND fecha_gasto <= ?`;
      totalParams.push(hasta);
    }
    totalQuery += ` GROUP BY categoria ORDER BY total DESC`;

    const totales = await env.DB.prepare(totalQuery).bind(...totalParams).all();

    return successRes({
      gastos: result.results || [],
      totales_por_categoria: totales.results || [],
      paginacion: {
        total: countResult?.total || 0,
        page,
        limit,
        total_pages: Math.ceil((countResult?.total || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Gastos list error:', error);
    return errorRes('Error listando gastos: ' + error.message, 500);
  }
}

// POST - Create gasto
export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { concepto, categoria, monto, fecha_gasto, observaciones, registrado_por } = data;

  const validation = validateRequired(data, ['concepto', 'monto']);
  if (!validation.valid) {
    return errorRes(`Campos requeridos faltantes: ${validation.missing.join(', ')}`);
  }

  const montoNum = parseFloat(monto);
  if (isNaN(montoNum) || montoNum < 0) {
    return errorRes('Monto debe ser un número positivo');
  }

  try {
    await asegurarColumnasFaltantes(env);

    const result = await env.DB.prepare(`
      INSERT INTO GastosNegocio (concepto, categoria, monto, fecha_gasto, observaciones, registrado_por, negocio_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      concepto.trim(),
      categoria?.trim() || 'Otros',
      montoNum,
      fecha_gasto || chileDate(),
      observaciones?.trim() || null,
      registrado_por || null,
      chileNowISO()
    ).run();

    const gasto = await env.DB.prepare(
      `SELECT * FROM GastosNegocio WHERE id = ?`
    ).bind(result.meta.last_row_id).first();

    return successRes(gasto, 201);
  } catch (error) {
    console.error('Gasto create error:', error);
    return errorRes('Error creando gasto: ' + error.message, 500);
  }
}

// PUT - Update gasto
export async function onRequestPut(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { id, ...fields } = data;

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);

    const existing = await env.DB.prepare(
      `SELECT id FROM GastosNegocio WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Gasto no encontrado', 404);
    }

    const allowedFields = ['concepto', 'categoria', 'monto', 'fecha_gasto', 'observaciones', 'registrado_por'];
    const updates = [];
    const params = [];

    for (const [key, value] of Object.entries(fields)) {
      if (!allowedFields.includes(key)) continue;
      updates.push(`${key} = ?`);
      params.push(key === 'monto' ? (parseFloat(value) || 0) : (value?.trim?.() || value || null));
    }

    if (updates.length === 0) {
      return errorRes('No hay campos para actualizar');
    }

    params.push(id);

    await env.DB.prepare(
      `UPDATE GastosNegocio SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    const gasto = await env.DB.prepare(
      `SELECT * FROM GastosNegocio WHERE id = ?`
    ).bind(id).first();

    return successRes(gasto);
  } catch (error) {
    console.error('Gasto update error:', error);
    return errorRes('Error actualizando gasto: ' + error.message, 500);
  }
}

// DELETE - Delete gasto
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM GastosNegocio WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Gasto no encontrado', 404);
    }

    await env.DB.prepare(`DELETE FROM GastosNegocio WHERE id = ?`).bind(id).run();

    return successRes({ deleted: true, id: parseInt(id) });
  } catch (error) {
    console.error('Gasto delete error:', error);
    return errorRes('Error eliminando gasto: ' + error.message, 500);
  }
}
