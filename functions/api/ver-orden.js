// ============================================
// BIZFLOW - View Order (Public)
// GET /api/ver-orden?token=X
// Ver detalle de orden de trabajo (lectura pública)
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
  const token = url.searchParams.get('token');

  if (!token) {
    return errorResponse('Parámetro token es obligatorio');
  }

  try {
    // 1. Find order by token (either main token or firma_token)
    const orden = await env.DB.prepare(`
      SELECT
        ot.*,
        c.nombre AS cliente_nombre,
        c.telefono AS cliente_telefono,
        c.email AS cliente_email,
        c.direccion AS cliente_direccion,
        t.nombre AS tecnico_nombre,
        t.especialidad AS tecnico_especialidad
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      LEFT JOIN Tecnicos t ON ot.tecnico_asignado_id = t.id
      WHERE ot.token = ? OR ot.firma_token = ?
      LIMIT 1
    `).bind(token, token).first();

    if (!orden) {
      return errorResponse('Orden no encontrada. Verifique el enlace.', 404);
    }

    // 2. Get additional costs (read-only)
    const costos = await env.DB.prepare(`
      SELECT concepto, monto, categoria FROM CostosAdicionales
      WHERE orden_id = ?
      ORDER BY fecha_registro ASC
    `).bind(orden.id).all();

    // 3. Get work notes (read-only)
    const notas = await env.DB.prepare(`
      SELECT
        nt.nota,
        nt.fecha_nota,
        t.nombre AS tecnico_nombre
      FROM NotasTrabajo nt
      LEFT JOIN Tecnicos t ON nt.tecnico_id = t.id
      WHERE nt.orden_id = ?
      ORDER BY nt.fecha_nota DESC
    `).bind(orden.id).all();

    // 4. Get tracking history (read-only)
    const seguimiento = await env.DB.prepare(`
      SELECT
        s.estado_anterior,
        s.estado_nuevo,
        s.observaciones,
        s.fecha_evento,
        t.nombre AS tecnico_nombre
      FROM SeguimientoOT s
      LEFT JOIN Tecnicos t ON s.tecnico_id = t.id
      WHERE s.orden_id = ?
      ORDER BY s.fecha_evento DESC
    `).bind(orden.id).all();

    // 5. Get photos metadata only (no base64 for public view)
    const fotos = await env.DB.prepare(`
      SELECT
        id,
        tipo,
        fecha_subida,
        tecnico_id
      FROM FotosTrabajo
      WHERE orden_id = ?
      ORDER BY
        CASE tipo
          WHEN 'antes' THEN 1
          WHEN 'durante' THEN 2
          WHEN 'despues' THEN 3
          ELSE 4
        END,
        fecha_subida ASC
    `).bind(orden.id).all();

    // 6. Parse services
    let servicios = [];
    if (orden.servicios_seleccionados) {
      try {
        servicios = JSON.parse(orden.servicios_seleccionados);
      } catch {
        servicios = orden.servicios_seleccionados.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    // 7. Check if order can be approved
    const puedeAprobar = orden.estado !== 'Aprobada' &&
                         orden.estado !== 'Cancelada' &&
                         orden.estado !== 'Cerrada';

    // 8. Check if order can be cancelled
    const puedeCancelar = orden.estado !== 'Cancelada' &&
                          orden.estado !== 'Cerrada' &&
                          orden.estado !== 'Aprobada';

    // Build public-safe response (exclude sensitive fields)
    const ordenPublica = {
      id: orden.id,
      numero_orden: orden.numero_orden,
      estado: orden.estado,
      estado_trabajo: orden.estado_trabajo,
      fecha_creacion: orden.fecha_creacion,
      fecha_ingreso: orden.fecha_ingreso,
      fecha_completado: orden.fecha_completado,
      fecha_aprobacion: orden.fecha_aprobacion,
      patente_placa: orden.patente_placa,
      marca: orden.marca,
      modelo: orden.modelo,
      anio: orden.anio,
      kilometraje: orden.kilometraje,
      direccion: orden.direccion,
      referencia_direccion: orden.referencia_direccion,
      nivel_combustible: orden.nivel_combustible,
      monto_total: orden.monto_total,
      monto_abono: orden.monto_abono,
      monto_restante: orden.monto_restante,
      metodo_pago: orden.metodo_pago,
      distancia_km: orden.distancia_km,
      cargo_domicilio: orden.cargo_domicilio,
      es_express: orden.es_express,
      prioridad: orden.prioridad,
      diagnostico_observaciones: orden.diagnostico_observaciones,
      notas: orden.notas,
      servicios,
      // Checklist items
      trabajo_frenos: orden.trabajo_frenos,
      detalle_frenos: orden.detalle_frenos,
      trabajo_luces: orden.trabajo_luces,
      detalle_luces: orden.detalle_luces,
      trabajo_tren_delantero: orden.trabajo_tren_delantero,
      detalle_tren_delantero: orden.detalle_tren_delantero,
      trabajo_correas: orden.trabajo_correas,
      detalle_correas: orden.detalle_correas,
      trabajo_componentes: orden.trabajo_componentes,
      detalle_componentes: orden.detalle_componentes,
      // Has signature?
      tiene_firma: !!orden.firma_imagen,
      // Related entities
      cliente: {
        nombre: orden.cliente_nombre,
        telefono: orden.cliente_telefono,
        email: orden.cliente_email,
        direccion: orden.cliente_direccion,
      },
      tecnico: orden.tecnico_nombre ? {
        nombre: orden.tecnico_nombre,
        especialidad: orden.tecnico_especialidad,
      } : null,
    };

    return successResponse({
      orden: ordenPublica,
      costos: costos.results || [],
      notas: notas.results || [],
      seguimiento: seguimiento.results || [],
      fotos: {
        total: (fotos.results || []).length,
        por_tipo: {
          antes: (fotos.results || []).filter((f) => f.tipo === 'antes').length,
          durante: (fotos.results || []).filter((f) => f.tipo === 'durante').length,
          despues: (fotos.results || []).filter((f) => f.tipo === 'despues').length,
        },
      },
      acciones: {
        puede_aprobar: puedeAprobar,
        puede_cancelar: puedeCancelar,
      },
    });
  } catch (error) {
    console.error('Error viewing order:', error);
    return errorResponse('Error al obtener la orden', 500);
  }
}
