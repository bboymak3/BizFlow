// ============================================================
// BizFlow - Admin Modelos Vehiculo API
// GET: List vehicle models with optional brand filter
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../lib/db-helpers.js';

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
    const marca = url.searchParams.get('marca');

    let query = 'SELECT * FROM ModelosVehiculo';
    const params = [];

    if (marca && marca.trim()) {
      query += ' WHERE marca LIKE ?';
      params.push(`%${marca.trim()}%`);
    }

    query += ' ORDER BY marca ASC, modelo ASC';

    const { results } = await DB.prepare(query).bind(...params).all();

    // Group by brand
    const porMarca = {};
    for (const modelo of (results || [])) {
      if (!porMarca[modelo.marca]) {
        porMarca[modelo.marca] = [];
      }
      porMarca[modelo.marca].push({
        id: modelo.id,
        modelo: modelo.modelo,
        anio_desde: modelo.anio_desde,
        anio_hasta: modelo.anio_hasta,
      });
    }

    return jsonResponse({
      modelos: results || [],
      por_marca: porMarca,
      total: (results || []).length,
      marcas: Object.keys(porMarca).sort(),
    });
  } catch (error) {
    console.error('Modelos vehiculo error:', error);
    return errorResponse('Error en modelos de vehículo: ' + error.message, 500);
  }
}
