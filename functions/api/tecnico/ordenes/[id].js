// ============================================================
// BizFlow - Technician Order Detail API
// GET /api/tecnico/ordenes/:id?tecnico_id=X
// Full order detail for technician view
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  if (context.request.method !== 'GET') {
    return errorResponse('Método no permitido', 405);
  }

  const { request, env, params } = context;
  const { DB } = env;
  const { id } = params;
  const url = new URL(request.url);
  const tecnicoId = url.searchParams.get('tecnico_id');

  try {
    // Get main order with joins
    const orden = await DB.prepare(`
      SELECT
        ot.id, ot.numero, ot.numero_orden, ot.token, ot.patente_placa,
        ot.cliente_id, ot.vehiculo_id, ot.tecnico_id, ot.tecnico_asignado_id,
        ot.usuario_id,
        ot.estado, ot.estado_trabajo, ot.tipo, ot.prioridad,
        ot.titulo, ot.descripcion, ot.diagnostico, ot.trabajo_realizado, ot.recomendaciones,
        ot.fecha_creacion, ot.fecha_asignacion, ot.fecha_inicio, ot.fecha_fin,
        ot.fecha_aprobacion_cliente, ot.fecha_aprobacion, ot.fecha_completado,
        ot.fecha_ingreso, ot.hora_ingreso, ot.recepcionista,
        ot.marca, ot.modelo, ot.anio, ot.cilindrada, ot.combustible, ot.kilometraje,
        ot.direccion, ot.referencia_direccion,
        ot.subtotal, ot.impuesto, ot.total,
        ot.trabajo_frenos, ot.detalle_frenos,
        ot.trabajo_luces, ot.detalle_luces,
        ot.trabajo_tren_delantero, ot.detalle_tren_delantero,
        ot.trabajo_correas, ot.detalle_correas,
        ot.trabajo_componentes, ot.detalle_componentes,
        ot.nivel_combustible,
        ot.check_paragolfe_delantero_der, ot.check_puerta_delantera_der,
        ot.check_puerta_trasera_der, ot.check_paragolfe_trasero_izq, ot.check_otros_carroceria,
        ot.monto_total, ot.monto_abono, ot.monto_restante,
        ot.monto_base, ot.mano_obra, ot.descuento, ot.monto_final,
        ot.metodo_pago, ot.es_express, ot.pagado, ot.completo,
        ot.firma_imagen, ot.firma_cliente, ot.firma_tecnico,
        ot.aprobada_por_cliente, ot.aprobada_por_tecnico,
        ot.diagnostico_checks, ot.diagnostico_observaciones,
        ot.servicios_seleccionados, ot.notas, ot.notas_internas,
        ot.distancia_km, ot.cargo_domicilio, ot.domicilio_modo_cobro,
        ot.cliente_nombre as ot_cliente_nombre, ot.cliente_telefono as ot_cliente_telefono,
        ot.cliente_email, ot.cliente_rut as ot_cliente_rut,
        ot.fecha_programada, ot.hora_programada,
        c.id as cliente_db_id, c.nombre as cliente_nombre, c.apellido as cliente_apellido,
        c.empresa as cliente_empresa, c.email as cliente_email, c.telefono as cliente_telefono,
        c.direccion as cliente_direccion, c.ciudad as cliente_ciudad,
        v.id as vehiculo_db_id, v.placa, v.marca as vehiculo_marca,
        v.modelo as vehiculo_modelo, v.anio as vehiculo_anio,
        v.color as vehiculo_color, v.vin, v.kilometraje,
        t.id as tecnico_db_id, t.nombre as tecnico_nombre, t.especialidad,
        t.telefono as tecnico_telefono, t.codigo as tecnico_codigo
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      LEFT JOIN Vehiculos v ON ot.vehiculo_id = v.id
      LEFT JOIN Tecnicos t ON ot.tecnico_id = t.id
      WHERE ot.id = ?
    `).bind(id).first();

    if (!orden) {
      return errorResponse('Orden no encontrada', 404);
    }

    // Verify technician owns this order
    if (tecnicoId && orden.tecnico_id !== parseInt(tecnicoId)) {
      return errorResponse('Esta orden no está asignada a este técnico', 403);
    }

    // Get all related data in parallel
    const [costos, fotos, notas, seguimiento, pagos] = await Promise.all([
      DB.prepare(`
        SELECT * FROM CostosAdicionales WHERE orden_id = ? ORDER BY creado_en ASC
      `).bind(id).all(),

      DB.prepare(`
        SELECT * FROM FotosTrabajo WHERE orden_id = ? ORDER BY creado_en ASC
      `).bind(id).all(),

      DB.prepare(`
        SELECT * FROM NotasTrabajo WHERE orden_id = ? ORDER BY creado_en ASC
      `).bind(id).all(),

      DB.prepare(`
        SELECT * FROM SeguimientoOT WHERE orden_id = ? ORDER BY creado_en ASC
      `).bind(id).all(),

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
      if (!fotosPorTipo[foto.tipo]) fotosPorTipo[foto.tipo] = [];
      fotosPorTipo[foto.tipo].push(foto);
    }

    return jsonResponse({
      orden,
      cliente: orden.cliente_db_id ? {
        id: orden.cliente_db_id,
        nombre: orden.cliente_nombre,
        apellido: orden.cliente_apellido,
        email: orden.cliente_email,
        telefono: orden.cliente_telefono,
        direccion: orden.cliente_direccion,
      } : null,
      vehiculo: orden.vehiculo_db_id ? {
        id: orden.vehiculo_db_id,
        placa: orden.placa,
        marca: orden.vehiculo_marca,
        modelo: orden.vehiculo_modelo,
      } : null,
      costos_adicionales: costos.results || [],
      total_costos_adicionales: totalCostos,
      fotos: fotos.results || [],
      fotos_por_tipo: fotosPorTipo,
      notas: notas.results || [],
      seguimiento: seguimiento.results || [],
      pagos: pagos.results || [],
      total_pagado: totalPagado,
      saldo_pendiente: (orden.total || 0) - totalPagado,
    });
  } catch (error) {
    console.error('[ORDEN DETAIL] Error:', error);
    return errorResponse('Error obteniendo detalle de orden: ' + error.message, 500);
  }
}
