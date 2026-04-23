// ============================================================
// BizFlow - Admin Ordenes [id] PDF API
// GET: Returns order data formatted for client-side PDF generation
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../../lib/db-helpers.js';

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
    // Get full order with all related data
    const orden = await DB.prepare(`
      SELECT ot.*,
        c.nombre as cliente_nombre, c.apellido as cliente_apellido,
        c.empresa as cliente_empresa, c.cedula_rif, c.email as cliente_email,
        c.telefono as cliente_telefono, c.telefono2 as cliente_telefono2,
        c.direccion as cliente_direccion, c.ciudad as cliente_ciudad,
        c.estado as cliente_estado, c.codigo_postal as cliente_codigo_postal,
        v.placa, v.marca as vehiculo_marca, v.modelo as vehiculo_modelo,
        v.anio as vehiculo_anio, v.color as vehiculo_color, v.vin, v.kilometraje,
        t.nombre as tecnico_nombre, t.especialidad, t.telefono as tecnico_telefono,
        u.empresa as usuario_empresa, u.nombre as usuario_nombre, u.telefono as usuario_telefono
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      LEFT JOIN Vehiculos v ON ot.vehiculo_id = v.id
      LEFT JOIN Tecnicos t ON ot.tecnico_id = t.id
      LEFT JOIN Usuarios u ON ot.usuario_id = u.id
      WHERE ot.id = ?
    `).bind(id).first();

    if (!orden) {
      return errorResponse('Orden no encontrada', 404);
    }

    const [costos, fotos, notas, seguimiento, pagos] = await Promise.all([
      DB.prepare('SELECT * FROM CostosAdicionales WHERE orden_id = ? ORDER BY creado_en ASC').bind(id).all(),
      DB.prepare('SELECT * FROM FotosTrabajo WHERE orden_id = ? ORDER BY creado_en ASC').bind(id).all(),
      DB.prepare('SELECT * FROM NotasTrabajo WHERE orden_id = ? ORDER BY creado_en ASC').bind(id).all(),
      DB.prepare('SELECT * FROM SeguimientoOT WHERE orden_id = ? ORDER BY creado_en ASC').bind(id).all(),
      DB.prepare('SELECT * FROM Pagos WHERE orden_id = ? ORDER BY fecha_pago ASC').bind(id).all(),
    ]);

    const totalCostos = (costos.results || []).reduce((sum, c) => sum + (c.total || 0), 0);
    const totalPagado = (pagos.results || []).reduce((sum, p) => sum + (p.monto || 0), 0);

    // Build PDF data structure
    return jsonResponse({
      // Empresa info
      empresa: {
        nombre: orden.usuario_empresa || 'BizFlow',
        telefono: orden.usuario_telefono || '',
        representante: orden.usuario_nombre || '',
      },
      // Order header
      orden: {
        numero: orden.numero,
        tipo: orden.tipo,
        prioridad: orden.prioridad,
        estado: orden.estado,
        fecha_creacion: orden.fecha_creacion,
        fecha_asignacion: orden.fecha_asignacion,
        fecha_inicio: orden.fecha_inicio,
        fecha_fin: orden.fecha_fin,
        fecha_aprobacion: orden.fecha_aprobacion_cliente,
        titulo: orden.titulo,
        descripcion: orden.descripcion,
        diagnostico: orden.diagnostico,
        trabajo_realizado: orden.trabajo_realizado,
        recomendaciones: orden.recomendaciones,
        subtotal: orden.subtotal || 0,
        impuesto: orden.impuesto || 0,
        total: orden.total || totalCostos || 0,
        metodo_pago: orden.metodo_pago || '',
      },
      // Client info
      cliente: {
        nombre: orden.cliente_nombre || '',
        apellido: orden.cliente_apellido || '',
        empresa: orden.cliente_empresa || '',
        cedula_rif: orden.cedula_rif || '',
        email: orden.cliente_email || '',
        telefono: orden.cliente_telefono || '',
        telefono2: orden.cliente_telefono2 || '',
        direccion: orden.cliente_direccion || '',
        ciudad: orden.cliente_ciudad || '',
        estado: orden.cliente_estado || '',
        codigo_postal: orden.cliente_codigo_postal || '',
      },
      // Vehicle info
      vehiculo: {
        placa: orden.placa || '',
        marca: orden.vehiculo_marca || '',
        modelo: orden.vehiculo_modelo || '',
        anio: orden.vehiculo_anio || '',
        color: orden.vehiculo_color || '',
        vin: orden.vin || '',
        kilometraje: orden.kilometraje || '',
      },
      // Technician info
      tecnico: {
        nombre: orden.tecnico_nombre || '',
        especialidad: orden.especialidad || '',
        telefono: orden.tecnico_telefono || '',
      },
      // Cost details
      costos_adicionales: (costos.results || []).map(c => ({
        concepto: c.concepto,
        cantidad: c.cantidad,
        precio_unitario: c.precio_unitario,
        total: c.total,
        tipo: c.tipo,
      })),
      total_costos: totalCostos,
      // Payment details
      pagos: (pagos.results || []).map(p => ({
        monto: p.monto,
        metodo: p.metodo,
        referencia: p.referencia,
        fecha: p.fecha_pago,
        notas: p.notas,
      })),
      total_pagado: totalPagado,
      saldo_pendiente: (orden.total || totalCostos) - totalPagado,
      // Notes
      notas: (notas.results || []).map(n => ({
        autor: n.autor,
        autor_tipo: n.autor_tipo,
        contenido: n.contenido,
        fecha: n.creado_en,
      })),
      // Photos (URLs for embedding)
      fotos: (fotos.results || []).map(f => ({
        tipo: f.tipo,
        url: f.url_publica,
        descripcion: f.descripcion,
        fecha: f.creado_en,
      })),
      // Tracking
      seguimiento: (seguimiento.results || []).map(s => ({
        estado_anterior: s.estado_anterior,
        estado_nuevo: s.estado_nuevo,
        realizado_por: s.realizado_por,
        notas: s.notas,
        fecha: s.creado_en,
      })),
    });
  } catch (error) {
    console.error('PDF data error:', error);
    return errorResponse('Error obteniendo datos para PDF: ' + error.message, 500);
  }
}
