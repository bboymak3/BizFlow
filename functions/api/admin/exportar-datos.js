// ============================================================
// BizFlow - Exportar Datos API
// GET: Export data as JSON
// ?tipo=ordenes/tecnicos/clientes/gastos
// ============================================================

import {
  handleOptions,
  successRes,
  errorRes,
  getFechaColumn,
  buildFechaWhere,
  chileDate,
  asegurarColumnasFaltantes,
  getColumnas,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const tipo = url.searchParams.get('tipo') || 'ordenes';
  const periodo = url.searchParams.get('periodo') || 'todo';
  const valor = url.searchParams.get('valor') || chileDate();
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 500, 2000);

  try {
    await asegurarColumnasFaltantes(env);

    const fechaCol = await getFechaColumn(env);
    const fechaWhere = buildFechaWhere(fechaCol, periodo, valor);

    let data;
    let filename;

    switch (tipo) {
      case 'ordenes': {
        const whereClause = `ot.estado != 'Eliminada'${fechaWhere.where}`;
        const params = [...fechaWhere.params];

        const result = await env.DB.prepare(`
          SELECT
            ot.id,
            ot.numero_orden,
            ot.estado,
            ot.estado_trabajo,
            ot.patente_placa as patente,
            ot.marca,
            ot.modelo,
            ot.anio,
            COALESCE(ot.monto_final, ot.monto_base, ot.monto_total, 0) as monto_total,
            COALESCE(ot.monto_abono, ot.abono, 0) as monto_abono,
            ot.metodo_pago,
            ot.fecha_creacion,
            ot.fecha_completado,
            ot.direccion,
            ot.notas,
            c.nombre as cliente_nombre,
            c.telefono as cliente_telefono,
            t.nombre as tecnico_nombre
          FROM OrdenesTrabajo ot
          LEFT JOIN Clientes c ON ot.cliente_id = c.id
          LEFT JOIN Tecnicos t ON ot.tecnico_asignado_id = t.id
          WHERE ${whereClause}
          ORDER BY ot.fecha_creacion DESC
          LIMIT ?
        `).bind(...params, limit).all();

        data = result.results || [];
        filename = `ordenes_${chileDate()}.json`;
        break;
      }

      case 'tecnicos': {
        const result = await env.DB.prepare(`
          SELECT
            t.id,
            t.nombre,
            t.telefono,
            t.email,
            t.comision_porcentaje,
            t.activo,
            t.especialidad,
            COUNT(ot.id) as total_ordenes,
            COALESCE(SUM(CASE WHEN ot.estado IN ('Cerrada','cerrada','Aprobada') THEN COALESCE(ot.monto_final, ot.monto_base, 0) ELSE 0 END), 0) as total_facturado
          FROM Tecnicos t
          LEFT JOIN OrdenesTrabajo ot ON ot.tecnico_asignado_id = t.id AND ot.estado != 'Eliminada'
          WHERE (t.negocio_id = 1 OR t.negocio_id IS NULL)
          GROUP BY t.id
          ORDER BY t.nombre ASC
        `).all();

        data = result.results || [];
        filename = `tecnicos_${chileDate()}.json`;
        break;
      }

      case 'clientes': {
        const result = await env.DB.prepare(`
          SELECT
            c.id,
            c.nombre,
            c.rut,
            c.telefono,
            c.email,
            c.direccion,
            c.fecha_registro,
            COUNT(v.id) as total_vehiculos,
            COUNT(DISTINCT ot.id) as total_ordenes,
            COALESCE(SUM(CASE WHEN ot.estado IN ('Cerrada','cerrada','Aprobada') THEN COALESCE(ot.monto_final, ot.monto_base, 0) ELSE 0 END), 0) as total_gastado
          FROM Clientes c
          LEFT JOIN Vehiculos v ON v.cliente_id = c.id
          LEFT JOIN OrdenesTrabajo ot ON ot.cliente_id = c.id AND ot.estado != 'Eliminada'
          WHERE (c.negocio_id = 1 OR c.negocio_id IS NULL OR c.negocio_id = 'default')
          GROUP BY c.id
          ORDER BY c.nombre ASC
          LIMIT ?
        `).bind(limit).all();

        data = result.results || [];
        filename = `clientes_${chileDate()}.json`;
        break;
      }

      case 'gastos': {
        const gastoWhere = `(gn.negocio_id = 1 OR gn.negocio_id IS NULL)`;
        const gastoFechaWhere = fechaWhere.where.replace(fechaCol.column, 'fecha_gasto');

        const result = await env.DB.prepare(`
          SELECT
            gn.id,
            gn.concepto,
            gn.categoria,
            gn.monto,
            gn.fecha_gasto,
            gn.observaciones,
            gn.registrado_por,
            gn.created_at
          FROM GastosNegocio gn
          WHERE ${gastoWhere}${gastoFechaWhere}
          ORDER BY gn.fecha_gasto DESC
          LIMIT ?
        `).bind(...fechaWhere.params, limit).all();

        data = result.results || [];
        filename = `gastos_${chileDate()}.json`;
        break;
      }

      case 'servicios': {
        const result = await env.DB.prepare(`
          SELECT * FROM ServiciosCatalogo
          WHERE (negocio_id = 1 OR negocio_id IS NULL)
          ORDER BY categoria ASC, nombre ASC
        `).all();

        data = result.results || [];
        filename = `servicios_${chileDate()}.json`;
        break;
      }

      default:
        return errorRes(`Tipo de exportación no válido: ${tipo}. Use: ordenes, tecnicos, clientes, gastos, servicios`);
    }

    return successRes({
      tipo,
      filename,
      fecha_exportacion: chileDate(),
      total_registros: data.length,
      datos: data,
    });
  } catch (error) {
    console.error('Exportar datos error:', error);
    return errorRes('Error exportando datos: ' + error.message, 500);
  }
}
