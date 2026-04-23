// ============================================================
// BizFlow - Admin Ordenes [id] API
// GET: Full order detail with all related data
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB } = env;
  const { id } = params;

  if (request.method !== 'GET') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    // Get main order with joins
    const orden = await DB.prepare(`
      SELECT
        ot.*,
        c.id as cliente_db_id, c.nombre as cliente_nombre, c.apellido as cliente_apellido,
        c.empresa as cliente_empresa, c.email as cliente_email, c.telefono as cliente_telefono,
        c.telefono2 as cliente_telefono2, c.cedula_rif, c.direccion as cliente_direccion,
        c.ciudad as cliente_ciudad, c.estado as cliente_estado,
        v.id as vehiculo_db_id, v.placa, v.marca as vehiculo_marca,
        v.modelo as vehiculo_modelo, v.anio as vehiculo_anio,
        v.color as vehiculo_color, v.vin, v.kilometraje,
        t.id as tecnico_db_id, t.nombre as tecnico_nombre, t.especialidad,
        t.telefono as tecnico_telefono, t.email as tecnico_email,
        t.codigo as tecnico_codigo
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      LEFT JOIN Vehiculos v ON ot.vehiculo_id = v.id
      LEFT JOIN Tecnicos t ON ot.tecnico_id = t.id
      WHERE ot.id = ?
    `).bind(id).first();

    if (!orden) {
      return errorResponse('Orden no encontrada', 404);
    }

    // Get all related data in parallel
    const [
      costos,
      fotos,
      notas,
      seguimiento,
      pagos,
    ] = await Promise.all([
      // Additional costs
      DB.prepare(`
        SELECT * FROM CostosAdicionales WHERE orden_id = ? ORDER BY creado_en ASC
      `).bind(id).all(),

      // Photos
      DB.prepare(`
        SELECT * FROM FotosTrabajo WHERE orden_id = ? ORDER BY creado_en ASC
      `).bind(id).all(),

      // Notes
      DB.prepare(`
        SELECT * FROM NotasTrabajo WHERE orden_id = ? ORDER BY creado_en ASC
      `).bind(id).all(),

      // Tracking history
      DB.prepare(`
        SELECT * FROM SeguimientoOT WHERE orden_id = ? ORDER BY creado_en ASC
      `).bind(id).all(),

      // Payments
      DB.prepare(`
        SELECT * FROM Pagos WHERE orden_id = ? ORDER BY fecha_pago ASC
      `).bind(id).all(),
    ]);

    // Calculate totals
    const totalCostos = (costos.results || []).reduce((sum, c) => sum + (c.total || 0), 0);
    const totalPagado = (pagos.results || []).reduce((sum, p) => sum + (p.monto || 0), 0);

    // Group photos by type
    const fotosPorTipo = {};
    for (const foto of (fotos.results || [])) {
      if (!fotosPorTipo[foto.tipo]) {
        fotosPorTipo[foto.tipo] = [];
      }
      fotosPorTipo[foto.tipo].push(foto);
    }

    return jsonResponse({
      orden,
      cliente: orden.cliente_db_id ? {
        id: orden.cliente_db_id,
        nombre: orden.cliente_nombre,
        apellido: orden.cliente_apellido,
        empresa: orden.cliente_empresa,
        email: orden.cliente_email,
        telefono: orden.cliente_telefono,
        telefono2: orden.cliente_telefono2,
        cedula_rif: orden.cedula_rif,
        direccion: orden.cliente_direccion,
        ciudad: orden.cliente_ciudad,
        estado: orden.cliente_estado,
      } : null,
      vehiculo: orden.vehiculo_db_id ? {
        id: orden.vehiculo_db_id,
        placa: orden.placa,
        marca: orden.vehiculo_marca,
        modelo: orden.vehiculo_modelo,
        anio: orden.vehiculo_anio,
        color: orden.vehiculo_color,
        vin: orden.vin,
        kilometraje: orden.kilometraje,
      } : null,
      tecnico: orden.tecnico_db_id ? {
        id: orden.tecnico_db_id,
        nombre: orden.tecnico_nombre,
        especialidad: orden.especialidad,
        telefono: orden.tecnico_telefono,
        email: orden.tecnico_email,
        codigo: orden.tecnico_codigo,
      } : null,
      costos_adicionales: costos.results || [],
      total_costos_adicionales: totalCostos,
      fotos: fotos.results || [],
      fotos_por_tipo: fotosPorTipo,
      notas: notas.results || [],
      seguimiento: seguimiento.results || [],
      pagos: pagos.results || [],
      total_pagado,
      saldo_pendiente: (orden.total || 0) - totalPagado,
    });
  } catch (error) {
    console.error('Orden [id] error:', error);
    return errorResponse('Error obteniendo orden: ' + error.message, 500);
  }
}
