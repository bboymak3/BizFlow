// ============================================================
// BizFlow - Técnico Orders List API
// GET /api/tecnico/ordenes?tecnico_id=X&estado=X&page=1&limit=20
// List orders assigned to a technician
// ============================================================

import { jsonResponse, errorResponse, handleCors, paginar } from '../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  if (context.request.method !== 'GET') {
    return errorResponse('Método no permitido', 405);
  }

  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);

  const tecnicoId = url.searchParams.get('tecnico_id');
  const estado = url.searchParams.get('estado');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  if (!tecnicoId) {
    return errorResponse('Parámetro tecnico_id es obligatorio');
  }

  try {
    // Build query with filters
    let sql = `
      SELECT
        ot.id, ot.numero, ot.estado, ot.tipo, ot.prioridad,
        ot.titulo, ot.descripcion, ot.fecha_creacion, ot.fecha_inicio, ot.fecha_fin,
        ot.latitud_ubicacion, ot.longitud_ubicacion,
        c.nombre as cliente_nombre, c.telefono as cliente_telefono,
        c.direccion as cliente_direccion,
        v.placa, v.marca as vehiculo_marca, v.modelo as vehiculo_modelo,
        t.nombre as tecnico_nombre
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      LEFT JOIN Vehiculos v ON ot.vehiculo_id = v.id
      LEFT JOIN Tecnicos t ON ot.tecnico_id = t.id
      WHERE ot.tecnico_id = ?
    `;
    const params = [parseInt(tecnicoId)];

    if (estado && estado !== 'todas') {
      if (estado === 'en_proceso') {
        sql += ` AND ot.estado IN ('en_proceso', 'pausada', 'asignada')`;
      } else {
        sql += ` AND ot.estado = ?`;
        params.push(estado);
      }
    }

    // Exclude cancelled
    sql += ` AND ot.estado != 'cancelada'`;

    sql += ` ORDER BY ot.fecha_creacion DESC`;

    // Apply pagination
    const pag = paginar(sql, page, limit);
    const result = await DB.prepare(pag.sql).bind(...params, ...pag.params).all();

    // Get total count for pagination info
    const countSql = sql.replace(/SELECT[\s\S]+?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await DB.prepare(countSql).bind(...params).first();
    const total = countResult?.total || 0;

    return jsonResponse({
      ordenes: result.results || [],
      paginacion: {
        page: pag.page,
        limit: pag.limit,
        total,
        total_pages: Math.ceil(total / pag.limit),
      },
    });
  } catch (error) {
    console.error('[ORDENES] Error:', error);
    return errorResponse('Error al obtener las órdenes de trabajo', 500);
  }
}
