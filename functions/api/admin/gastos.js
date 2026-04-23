// ============================================================
// BizFlow - Admin Gastos API
// GET: List expenses with filters
// POST: Create expense (optional R2 receipt upload)
// ============================================================

import { jsonResponse, errorResponse, handleCors, hoyISO } from '../../lib/db-helpers.js';
import { subirArchivoR2, generarRutaDocumento, base64ToArrayBuffer } from '../../lib/r2-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const { DB, MEDIA } = env;

  try {
    if (request.method === 'GET') {
      return await handleGet(request, DB);
    } else if (request.method === 'POST') {
      return await handlePost(request, DB, MEDIA);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Gastos error:', error);
    return errorResponse('Error en gastos: ' + error.message, 500);
  }
}

async function handleGet(request, DB) {
  const url = new URL(request.url);
  const usuarioId = url.searchParams.get('usuario_id');
  const fechaDesde = url.searchParams.get('fecha_desde');
  const fechaHasta = url.searchParams.get('fecha_hasta');
  const categoria = url.searchParams.get('categoria');
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 20;

  if (!usuarioId) {
    return errorResponse('usuario_id es requerido');
  }

  let whereClause = 'WHERE usuario_id = ?';
  const params = [usuarioId];

  if (fechaDesde) {
    whereClause += ' AND fecha >= ?';
    params.push(fechaDesde);
  }

  if (fechaHasta) {
    whereClause += ' AND fecha <= ?';
    params.push(fechaHasta);
  }

  if (categoria) {
    whereClause += ' AND categoria = ?';
    params.push(categoria);
  }

  // Count
  const countResult = await DB.prepare(
    `SELECT COUNT(*) as total FROM GastosNegocio ${whereClause}`
  ).bind(...params).first();

  // Total sum
  const sumResult = await DB.prepare(
    `SELECT COALESCE(SUM(monto), 0) as total_gastos FROM GastosNegocio ${whereClause}`
  ).bind(...params).first();

  // Results
  const offset = (page - 1) * limit;
  const { results } = await DB.prepare(`
    SELECT * FROM GastosNegocio
    ${whereClause}
    ORDER BY fecha DESC, creado_en DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  // Category breakdown
  const { results: porCategoria } = await DB.prepare(`
    SELECT categoria, COUNT(*) as cantidad, SUM(monto) as total
    FROM GastosNegocio
    ${whereClause}
    GROUP BY categoria
    ORDER BY total DESC
  `).bind(...params).all();

  return jsonResponse({
    gastos: results || [],
    total_gastos: sumResult?.total_gastos || 0,
    por_categoria: porCategoria || [],
    paginacion: {
      page,
      limit,
      total: countResult?.total || 0,
      total_pages: Math.ceil((countResult?.total || 0) / limit),
    }
  });
}

async function handlePost(request, DB, MEDIA) {
  const data = await request.json();

  const {
    usuario_id, concepto, monto, categoria, fecha, descripcion, comprobante_base64,
  } = data;

  if (!usuario_id) return errorResponse('usuario_id es requerido');
  if (!concepto || !concepto.trim()) return errorResponse('concepto es requerido');
  if (!monto || parseFloat(monto) <= 0) return errorResponse('monto debe ser positivo');

  // Handle receipt upload if provided
  let comprobante = '';
  if (comprobante_base64) {
    try {
      const buffer = base64ToArrayBuffer(comprobante_base64);
      const ruta = generarRutaDocumento('comprobante', `${concepto.trim().substring(0, 30)}_${Date.now()}.jpg`);

      await subirArchivoR2(MEDIA, ruta, buffer, {
        contentType: 'image/jpeg',
        metadata: { tipo: 'comprobante_gasto', concepto: concepto.trim() },
      });

      comprobante = ruta;

      // Register in MediosR2
      await DB.prepare(`
        INSERT INTO MediosR2 (usuario_id, ruta, nombre_original, mime_type, tamano_bytes, tipo_recurso)
        VALUES (?, ?, ?, ?, ?, 'comprobante')
      `).bind(usuario_id, ruta, `comprobante_${Date.now()}.jpg`, 'image/jpeg', buffer.byteLength || 0).run();
    } catch (err) {
      console.error('Error subiendo comprobante:', err);
      // Non-critical, continue without receipt
    }
  }

  const now = hoyISO();

  const result = await DB.prepare(`
    INSERT INTO GastosNegocio (usuario_id, concepto, monto, categoria, fecha, descripcion, comprobante)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    usuario_id,
    concepto.trim(),
    parseFloat(monto),
    categoria?.trim() || 'operativo',
    fecha || now,
    descripcion?.trim() || '',
    comprobante
  ).run();

  const gasto = await DB.prepare(
    'SELECT * FROM GastosNegocio WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return jsonResponse({ gasto }, 201);
}
