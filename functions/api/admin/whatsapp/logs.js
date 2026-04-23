// ============================================================
// BizFlow - Admin WhatsApp Logs API
// GET: List WhatsApp notification logs with pagination
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const { DB } = env;

  if (request.method !== 'GET') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const estadoEnvio = url.searchParams.get('estado_envio');
    const tipo = url.searchParams.get('tipo');

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (estadoEnvio && ['pendiente', 'enviada', 'fallida', 'leida'].includes(estadoEnvio)) {
      whereClause += ' AND estado_envio = ?';
      params.push(estadoEnvio);
    }

    if (tipo) {
      whereClause += ' AND tipo = ?';
      params.push(tipo);
    }

    // Count
    const countResult = await DB.prepare(
      `SELECT COUNT(*) as total FROM NotificacionesWhatsApp ${whereClause}`
    ).bind(...params).first();

    // Summary stats
    const stats = await DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN estado_envio = 'enviada' THEN 1 ELSE 0 END) as enviadas,
        SUM(CASE WHEN estado_envio = 'fallida' THEN 1 ELSE 0 END) as fallidas,
        SUM(CASE WHEN estado_envio = 'pendiente' THEN 1 ELSE 0 END) as pendientes
      FROM NotificacionesWhatsApp
    `).first();

    // Results
    const offset = (page - 1) * limit;
    const { results } = await DB.prepare(`
      SELECT nw.*,
        ot.numero as orden_numero, ot.estado as orden_estado
      FROM NotificacionesWhatsApp nw
      LEFT JOIN OrdenesTrabajo ot ON nw.orden_id = ot.id
      ${whereClause}
      ORDER BY nw.creado_en DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    return jsonResponse({
      logs: results || [],
      estadisticas: {
        total: stats?.total || 0,
        enviadas: stats?.enviadas || 0,
        fallidas: stats?.fallidas || 0,
        pendientes: stats?.pendientes || 0,
      },
      paginacion: {
        page,
        limit,
        total: countResult?.total || 0,
        total_pages: Math.ceil((countResult?.total || 0) / limit),
      }
    });
  } catch (error) {
    console.error('WhatsApp logs error:', error);
    return errorResponse('Error en logs WhatsApp: ' + error.message, 500);
  }
}
