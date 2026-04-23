// ============================================
// BIZFLOW - Get Photos for Order
// GET /api/tecnico/fotos?orden_id=X
// Obtener fotos de una orden de trabajo
// ============================================

import {
  corsHeaders,
  handleOptions,
  successResponse,
  errorResponse,
} from '../../lib/db-helpers.js';

export async function onRequestOptions(context) {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const ordenId = url.searchParams.get('orden_id');

  if (!ordenId) {
    return errorResponse('Parámetro orden_id es obligatorio');
  }

  try {
    // Get all photos for this order
    // Include base64 data by default for direct display
    const incluirBase64 = url.searchParams.get('include_base64') !== 'false';

    let query;
    if (incluirBase64) {
      query = `
        SELECT
          ft.id,
          ft.orden_id,
          ft.tecnico_id,
          ft.foto_base64,
          ft.tipo,
          ft.fecha_subida,
          t.nombre AS tecnico_nombre
        FROM FotosTrabajo ft
        LEFT JOIN Tecnicos t ON ft.tecnico_id = t.id
        WHERE ft.orden_id = ?
        ORDER BY
          CASE ft.tipo
            WHEN 'antes' THEN 1
            WHEN 'durante' THEN 2
            WHEN 'despues' THEN 3
            ELSE 4
          END,
          ft.fecha_subida ASC
      `;
    } else {
      query = `
        SELECT
          ft.id,
          ft.orden_id,
          ft.tecnico_id,
          ft.tipo,
          ft.fecha_subida,
          LENGTH(ft.foto_base64) AS tamano_bytes,
          t.nombre AS tecnico_nombre
        FROM FotosTrabajo ft
        LEFT JOIN Tecnicos t ON ft.tecnico_id = t.id
        WHERE ft.orden_id = ?
        ORDER BY
          CASE ft.tipo
            WHEN 'antes' THEN 1
            WHEN 'durante' THEN 2
            WHEN 'despues' THEN 3
            ELSE 4
          END,
          ft.fecha_subida ASC
      `;
    }

    const fotos = await env.DB.prepare(query).bind(parseInt(ordenId)).all();

    // Group by type
    const agrupadas = {
      antes: [],
      durante: [],
      despues: [],
      otra: [],
    };

    for (const foto of fotos.results || []) {
      const tipo = foto.tipo || 'otra';
      if (agrupadas[tipo]) {
        agrupadas[tipo].push(foto);
      } else {
        agrupadas.otra.push(foto);
      }
    }

    return successResponse({
      fotos: fotos.results || [],
      agrupadas,
      total: (fotos.results || []).length,
    });
  } catch (error) {
    console.error('Error fetching photos:', error);
    return errorResponse('Error al obtener las fotos', 500);
  }
}
