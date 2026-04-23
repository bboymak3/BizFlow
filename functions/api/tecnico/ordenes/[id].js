// ============================================================
// BizFlow - Technician Order Detail API
// GET /api/tecnico/ordenes/:id?tecnico_id=X
// Full order detail for technician view
// ============================================================

import { jsonResponse, errorResponse, handleCors, asegurarColumnasFaltantes, getColumnas } from '../../../lib/db-helpers.js';

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
    await asegurarColumnasFaltantes(env);
    const otCols = await getColumnas(env, 'OrdenesTrabajo');

    // Solo columnas que existen
    const wantedOt = [
      'id','numero','numero_orden','token','patente_placa',
      'cliente_id','vehiculo_id','tecnico_id','tecnico_asignado_id','usuario_id',
      'estado','estado_trabajo','tipo','prioridad',
      'titulo','descripcion','diagnostico','trabajo_realizado','recomendaciones',
      'fecha_creacion','fecha_asignacion','fecha_inicio','fecha_fin',
      'fecha_aprobacion','fecha_completado',
      'fecha_ingreso','hora_ingreso','recepcionista',
      'marca','modelo','anio','cilindrada','combustible','kilometraje',
      'direccion',
      'subtotal','impuesto','total',
      'trabajo_frenos','detalle_frenos',
      'trabajo_luces','detalle_luces',
      'trabajo_tren_delantero','detalle_tren_delantero',
      'trabajo_correas','detalle_correas',
      'trabajo_componentes','detalle_componentes',
      'nivel_combustible',
      'check_paragolfe_delantero_der','check_puerta_delantera_der',
      'check_puerta_trasera_der','check_paragolfe_trasero_izq','check_otros_carroceria',
      'monto_total','monto_abono','monto_restante',
      'metodo_pago','es_express','pagado','completo',
      'firma_imagen','firma_cliente','firma_tecnico',
      'diagnostico_checks','diagnostico_observaciones',
      'servicios_seleccionados','notas','notas_internas',
      'cliente_nombre','cliente_telefono',
    ];
    const safeOt = wantedOt.filter(c => otCols.includes(c));
    const otColStr = safeOt.map(c => `ot.${c}`).join(', ');

    // Get main order with joins
    const orden = await DB.prepare(`
      SELECT ${otColStr},
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

    // Verify technician owns this order (check both tecnico_id and tecnico_asignado_id)
    const tid = parseInt(tecnicoId);
    if (tecnicoId && orden.tecnico_asignado_id !== tid && orden.tecnico_id !== tid) {
      return errorResponse('Esta orden no está asignada a este técnico', 403);
    }

    // Get all related data in parallel (SELECT * is OK for small tables without JOINs)
    const [costos, fotos, notas, seguimiento, pagos] = await Promise.all([
      DB.prepare(`SELECT * FROM CostosAdicionales WHERE orden_id = ? ORDER BY creado_en ASC`).bind(id).all(),
      DB.prepare(`SELECT * FROM FotosTrabajo WHERE orden_id = ? ORDER BY creado_en ASC`).bind(id).all(),
      DB.prepare(`SELECT * FROM NotasTrabajo WHERE orden_id = ? ORDER BY creado_en ASC`).bind(id).all(),
      DB.prepare(`SELECT * FROM SeguimientoOT WHERE orden_id = ? ORDER BY creado_en ASC`).bind(id).all(),
      DB.prepare(`SELECT * FROM Pagos WHERE orden_id = ? ORDER BY fecha_pago ASC`).bind(id).all(),
    ]);

    // Calculate totals
    const totalCostos = (costos.results || []).reduce((sum, c) => sum + (c.total || c.monto || 0), 0);
    const totalPagado = (pagos.results || []).reduce((sum, p) => sum + (p.monto || 0), 0);

    // Group photos by type
    const fotosPorTipo = {};
    for (const foto of (fotos.results || [])) {
      const tipo = foto.tipo || foto.tipo_foto || 'evidencia';
      if (!fotosPorTipo[tipo]) fotosPorTipo[tipo] = [];
      fotosPorTipo[tipo].push(foto);
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
      saldo_pendiente: (orden.total || orden.monto_total || 0) - totalPagado,
    });
  } catch (error) {
    console.error('[ORDEN DETAIL] Error:', error);
    return errorResponse('Error obteniendo detalle de orden: ' + error.message, 500);
  }
}
