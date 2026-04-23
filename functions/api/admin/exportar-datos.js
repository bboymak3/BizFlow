// ============================================
// API: EXPORTAR TODOS LOS DATOS (completo)
// Consulta TODAS las tablas de la BD con filtros de periodo
// Global Pro Automotriz
// ============================================
// Usa PRAGMA para detectar columnas existentes y evitar
// errores "no such column" en D1 remoto.
// SIEMPRE usa fecha_ingreso para filtrar/ordenar (columna segura).
// fecha_creacion solo se agrega como columna extra de lectura.
// ============================================

import { chileNowISO } from '../../lib/db-helpers.js';

async function asegurarTablas(env) {
  try {
    // ===== CREAR TABLAS SI NO EXISTEN =====
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS CostosAdicionales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      concepto TEXT NOT NULL,
      monto REAL NOT NULL,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
      registrado_por TEXT,
      categoria TEXT NOT NULL DEFAULT 'Mano de Obra'
    )`).run();

    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_costos_orden ON CostosAdicionales(orden_id)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_costos_categoria ON CostosAdicionales(categoria)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS GastosNegocio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concepto TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'Otros',
      monto REAL NOT NULL,
      fecha_gasto DATE NOT NULL,
      observaciones TEXT,
      registrado_por TEXT,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON GastosNegocio(categoria)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON GastosNegocio(fecha_gasto)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS Pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      monto REAL NOT NULL,
      metodo_pago TEXT NOT NULL,
      fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
      observaciones TEXT
    )`).run();

    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pagos_orden ON Pagos(orden_id)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ServiciosCatalogo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      precio_sugerido REAL NOT NULL DEFAULT 0,
      categoria TEXT NOT NULL DEFAULT 'Mantenimiento',
      tipo_comision TEXT NOT NULL DEFAULT 'mano_obra',
      activo INTEGER DEFAULT 1,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ModelosVehiculo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // ===== COLUMNAS FALTANTES EN OrdenesTrabajo =====
    const columnasOT = [
      'servicios_seleccionados TEXT',
      'diagnostico_checks TEXT',
      'diagnostico_observaciones TEXT',
      'fecha_creacion TEXT',
      'fecha_completado TEXT',
      'referencia_direccion TEXT'
    ];
    for (const colDef of columnasOT) {
      try {
        await env.DB.prepare(`ALTER TABLE OrdenesTrabajo ADD COLUMN ${colDef}`).run();
      } catch (e) { /* columna ya existe */ }
    }

    // ===== COLUMNAS FALTANTES EN Tecnicos =====
    try {
      await env.DB.prepare(`ALTER TABLE Tecnicos ADD COLUMN comision_porcentaje REAL NOT NULL DEFAULT 40`).run();
    } catch (e) { /* ya existe */ }

    // ===== COLUMNAS FALTANTES EN CostosAdicionales =====
    try {
      await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Mano de Obra'`).run();
    } catch (e) { /* ya existe */ }
  } catch (e) {
    console.log('asegurarTablas:', e.message);
  }
}

// Detecta qué columnas existen realmente en una tabla
async function getColumnas(env, tabla) {
  try {
    const r = await env.DB.prepare(`PRAGMA table_info('${tabla}')`).all();
    return (r.results || r || []).map(c => c.name);
  } catch (e) {
    return [];
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    await asegurarTablas(env);

    // Detectar columnas reales existentes
    const colOT = await getColumnas(env, 'OrdenesTrabajo');
    const colTec = await getColumnas(env, 'Tecnicos');

    const tiene_fecha_creacion = colOT.includes('fecha_creacion');
    const tiene_fecha_completado = colOT.includes('fecha_completado');
    const tiene_servicios_sel = colOT.includes('servicios_seleccionados');
    const tiene_diag_checks = colOT.includes('diagnostico_checks');
    const tiene_diag_obs = colOT.includes('diagnostico_observaciones');
    const tiene_comision = colTec.includes('comision_porcentaje');

    // SIEMPRE usar fecha_ingreso para filtrar y ordenar (columna que siempre existe)
    // Solo agregar fecha_creacion como columna extra de lectura si existe
    const fechaLabel = tiene_fecha_creacion
      ? "COALESCE(o.fecha_creacion, o.fecha_ingreso) as fecha_creacion"
      : "o.fecha_ingreso as fecha_creacion";

    const url = new URL(request.url);
    const periodo = url.searchParams.get('periodo') || 'mes';
    const valor = url.searchParams.get('valor') || '';

    // Construir condición de fecha según periodo - SIEMPRE usando fecha_ingreso (columna segura)
    function fechaWhere(col, per, val) {
      if (!val) return '';
      switch (per) {
        case 'dia': return `AND date(${col}) = '${val}'`;
        case 'quincena': {
          return `AND strftime('%Y-%m', ${col}) = '${val}' AND cast(strftime('%d', ${col}) as integer) <= 15`;
        }
        case 'semana': {
          const [y, w] = val.split('-').map(Number);
          return `AND strftime('%Y', ${col}) = '${y}' AND cast(strftime('%W', ${col}) as integer) = ${w}`;
        }
        case 'anio': return `AND strftime('%Y', ${col}) = '${val}'`;
        default: return `AND strftime('%Y-%m', ${col}) = '${val}'`;
      }
    }

    // Usar SIEMPRE o.fecha_ingreso para filtrar (columna 100% segura)
    const fOT = fechaWhere('o.fecha_ingreso', periodo, valor);
    const fGasto = fechaWhere('gn.fecha_gasto', periodo, valor);
    const fCosto = fechaWhere('ca.fecha_registro', periodo, valor);
    const fPago = fechaWhere('p.fecha_pago', periodo, valor);

    // ===== 1. ORDENES DE TRABAJO =====
    // Construir SELECT solo con columnas que existen
    let ordenesSelect = `
      o.id,
      o.numero_orden, o.patente_placa, o.marca, o.modelo, o.anio, o.cilindrada, o.combustible,
      o.kilometraje, o.fecha_ingreso, o.hora_ingreso, o.recepcionista, o.direccion,
      o.estado, o.estado_trabajo,
      ${fechaLabel},
      o.fecha_aprobacion,`;

    if (tiene_fecha_completado) {
      ordenesSelect += ` o.fecha_completado,`;
    }

    ordenesSelect += `
      o.monto_total, o.monto_abono, o.monto_restante, o.metodo_pago, o.nivel_combustible,
      o.pagado, o.completo,
      o.notas,
      c.nombre as cliente_nombre, c.rut as cliente_rut, c.telefono as cliente_telefono, c.email as cliente_email,`;

    if (tiene_comision) {
      ordenesSelect += ` t.comision_porcentaje as tecnico_comision,`;
    }

    ordenesSelect += ` t.nombre as tecnico_nombre, t.telefono as tecnico_telefono,`;

    if (tiene_diag_checks) ordenesSelect += ` o.diagnostico_checks,`;
    if (tiene_diag_obs) ordenesSelect += ` o.diagnostico_observaciones,`;
    if (tiene_servicios_sel) ordenesSelect += ` o.servicios_seleccionados,`;

    ordenesSelect += `
      (SELECT COALESCE(SUM(monto),0) FROM CostosAdicionales WHERE orden_id = o.id) as total_costos_extra,
      (SELECT COALESCE(SUM(CASE WHEN categoria='Mano de Obra' THEN monto ELSE 0 END),0) FROM CostosAdicionales WHERE orden_id = o.id) as costos_mo,
      (SELECT COALESCE(SUM(CASE WHEN categoria='Repuestos/Materiales' THEN monto ELSE 0 END),0) FROM CostosAdicionales WHERE orden_id = o.id) as costos_rep`;

    let ordenes = [];
    try {
      const r = await env.DB.prepare(`
        SELECT ${ordenesSelect}
        FROM OrdenesTrabajo o
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
        WHERE 1=1 ${fOT}
        ORDER BY o.fecha_ingreso DESC
        LIMIT 500
      `).all();
      ordenes = r.results || [];
    } catch (e) {
      console.log('Error ordenes main (fallback simple):', e.message);
      try {
        const r = await env.DB.prepare(`
          SELECT
            o.id, o.numero_orden, o.patente_placa, o.marca, o.modelo,
            o.anio, o.cilindrada, o.combustible, o.kilometraje,
            o.fecha_ingreso, o.hora_ingreso, o.recepcionista, o.direccion,
            o.estado, o.estado_trabajo, o.fecha_ingreso as fecha_creacion,
            o.fecha_aprobacion, o.monto_total, o.monto_abono, o.monto_restante,
            o.metodo_pago, o.nivel_combustible, o.pagado, o.completo, o.notas
          FROM OrdenesTrabajo o
          WHERE 1=1 ${fOT}
          ORDER BY o.fecha_ingreso DESC
          LIMIT 500
        `).all();
        ordenes = r.results || [];
      } catch (e2) {
        console.log('Error ordenes fallback:', e2.message);
      }
    }

    // ===== 2. TECNICOS =====
    let tecnicos = [];
    try {
      let tecSelect = `t.id, t.nombre, t.telefono, t.email, t.activo, t.fecha_registro`;
      if (tiene_comision) tecSelect += `, t.comision_porcentaje`;

      const r = await env.DB.prepare(`
        SELECT ${tecSelect},
          COALESCE(ot.total_ordenes, 0) as total_ordenes,
          COALESCE(ot.total_cerradas, 0) as total_cerradas,
          COALESCE(ot.total_generado, 0) as total_generado
        FROM Tecnicos t
        LEFT JOIN (
          SELECT tecnico_asignado_id,
            COUNT(*) as total_ordenes,
            SUM(CASE WHEN estado_trabajo='Cerrada' THEN 1 ELSE 0 END) as total_cerradas,
            COALESCE(SUM(monto_total),0) as total_generado
          FROM OrdenesTrabajo WHERE 1=1 ${fOT} AND tecnico_asignado_id IS NOT NULL
          GROUP BY tecnico_asignado_id
        ) ot ON ot.tecnico_asignado_id = t.id
        ORDER BY total_ordenes DESC
      `).all();
      tecnicos = r.results || [];
    } catch (e) {
      console.log('Error tecnicos:', e.message);
    }

    // ===== 3. COSTOS ADICIONALES =====
    let costosAdicionales = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT ca.id, ca.orden_id, ca.concepto, ca.monto,
          COALESCE(ca.categoria, 'Mano de Obra') as categoria,
          ca.fecha_registro, ca.registrado_por,
          o.numero_orden, o.patente_placa
        FROM CostosAdicionales ca
        LEFT JOIN OrdenesTrabajo o ON ca.orden_id = o.id
        WHERE 1=1 ${fCosto}
        ORDER BY ca.fecha_registro DESC
      `).all();
      costosAdicionales = results || [];
    } catch (e) {
      console.log('Error costos adicionales:', e.message);
    }

    // ===== 4. GASTOS DEL NEGOCIO =====
    let gastosNegocio = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT * FROM GastosNegocio WHERE 1=1 ${fGasto}
        ORDER BY fecha_gasto DESC
      `).all();
      gastosNegocio = results || [];
    } catch (e) {
      console.log('Error gastos negocio:', e.message);
    }

    // ===== 5. PAGOS =====
    let pagos = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT p.*, o.numero_orden, o.patente_placa, c.nombre as cliente_nombre
        FROM Pagos p
        LEFT JOIN OrdenesTrabajo o ON p.orden_id = o.id
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        WHERE 1=1 ${fPago}
        ORDER BY p.fecha_pago DESC
      `).all();
      pagos = results || [];
    } catch (e) {
      console.log('Error pagos:', e.message);
    }

    // ===== 6. CLIENTES DEL PERIODO =====
    let clientes = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT DISTINCT c.id, c.nombre, c.rut, c.telefono, c.email
        FROM Clientes c
        INNER JOIN OrdenesTrabajo o ON o.cliente_id = c.id
        WHERE 1=1 ${fOT}
        ORDER BY c.nombre ASC
      `).all();
      clientes = results || [];
    } catch (e) {
      console.log('Error clientes:', e.message);
    }

    // ===== 7. VEHICULOS DEL PERIODO =====
    let vehiculos = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT DISTINCT v.id, v.patente_placa, v.marca, v.modelo, v.anio, v.combustible
        FROM Vehiculos v
        INNER JOIN OrdenesTrabajo o ON o.vehiculo_id = v.id
        WHERE 1=1 ${fOT}
        ORDER BY v.marca ASC
      `).all();
      vehiculos = results || [];
    } catch (e) {
      console.log('Error vehiculos:', e.message);
    }

    // ===== 8. SERVICIOS DEL CATALOGO =====
    let serviciosPopulares = [];
    try {
      if (tiene_servicios_sel) {
        const fOTClean = fOT.replace(/^AND\s*/i, '');
        const srvResult = await env.DB.prepare(`
          SELECT sc.nombre, sc.categoria, sc.tipo_comision, sc.precio_sugerido,
            COUNT(DISTINCT o.id) as veces_usado
          FROM ServiciosCatalogo sc
          LEFT JOIN (
            SELECT id, json_each.value as serv_id
            FROM OrdenesTrabajo, json_each(
              CASE WHEN servicios_seleccionados IS NOT NULL AND servicios_seleccionados != '' AND servicios_seleccionados != '[]'
              THEN servicios_seleccionados ELSE '[]' END
            )
          ) j ON CAST(json_extract(j.value, '$.id') AS INTEGER) = sc.id
          LEFT JOIN OrdenesTrabajo o ON o.id = j.id ${fOTClean ? 'AND ' + fOTClean : ''}
          GROUP BY sc.id
          ORDER BY veces_usado DESC
          LIMIT 30
        `).all();
        serviciosPopulares = srvResult.results || [];
      }
    } catch (e) {
      console.log('Error servicios populares:', e.message);
    }

    // ===== 9. RESUMEN GENERAL =====
    let resumen = {
      total_ordenes: 0, aprobadas: 0, enviadas: 0, canceladas: 0,
      cerradas: 0, pendientes_visita: 0, en_sitio: 0, en_progreso: 0,
      completadas: 0, total_monto_ordenes: 0, total_abonos: 0, total_restantes: 0,
      total_pagado: 0, total_impago: 0, promedio_orden: 0,
      total_clientes_unicos: 0, total_tecnicos_activos: 0, total_patentes_unicas: 0
    };
    try {
      const r = await env.DB.prepare(`
        SELECT
          COUNT(*) as total_ordenes,
          SUM(CASE WHEN estado='Aprobada' THEN 1 ELSE 0 END) as aprobadas,
          SUM(CASE WHEN estado='Enviada' THEN 1 ELSE 0 END) as enviadas,
          SUM(CASE WHEN estado='Cancelada' THEN 1 ELSE 0 END) as canceladas,
          SUM(CASE WHEN estado_trabajo='Cerrada' THEN 1 ELSE 0 END) as cerradas,
          SUM(CASE WHEN estado_trabajo='Pendiente Visita' THEN 1 ELSE 0 END) as pendientes_visita,
          SUM(CASE WHEN estado_trabajo='En Sitio' THEN 1 ELSE 0 END) as en_sitio,
          SUM(CASE WHEN estado_trabajo='En Progreso' OR estado_trabajo='En trabajo' THEN 1 ELSE 0 END) as en_progreso,
          SUM(CASE WHEN estado_trabajo='Completada' OR estado_trabajo='Usuario Satisfecho' THEN 1 ELSE 0 END) as completadas,
          COALESCE(SUM(monto_total),0) as total_monto_ordenes,
          COALESCE(SUM(monto_abono),0) as total_abonos,
          COALESCE(SUM(monto_restante),0) as total_restantes,
          COALESCE(SUM(CASE WHEN pagado=1 THEN monto_total ELSE 0 END),0) as total_pagado,
          COALESCE(SUM(CASE WHEN pagado=0 OR pagado IS NULL THEN monto_total ELSE 0 END),0) as total_impago,
          AVG(monto_total) as promedio_orden,
          COUNT(DISTINCT cliente_id) as total_clientes_unicos,
          COUNT(DISTINCT tecnico_asignado_id) as total_tecnicos_activos,
          COUNT(DISTINCT patente_placa) as total_patentes_unicas
        FROM OrdenesTrabajo o
        WHERE 1=1 ${fOT}
      `).first();
      if (r) resumen = { ...resumen, ...r };
    } catch (e) {
      console.log('Error resumen:', e.message);
    }

    // Gastos resumen
    let gastosPorCategoria = [];
    let totalGastos = 0;
    try {
      const gastosResumen = await env.DB.prepare(`
        SELECT categoria, COUNT(*) as cantidad, COALESCE(SUM(monto),0) as total
        FROM GastosNegocio WHERE 1=1 ${fGasto}
        GROUP BY categoria ORDER BY total DESC
      `).all();
      gastosPorCategoria = gastosResumen.results || [];
      totalGastos = gastosPorCategoria.reduce((s, g) => s + Number(g.total || 0), 0);
    } catch (e) {
      console.log('Error gastos resumen:', e.message);
    }

    // Costos extras resumen
    let totalCostosExtras = 0, costosMO = 0, costosRep = 0;
    try {
      const costosResumen = await env.DB.prepare(`
        SELECT
          COUNT(*) as total_items,
          COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra')='Mano de Obra' THEN monto ELSE 0 END),0) as total_mo,
          COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra')='Repuestos/Materiales' THEN monto ELSE 0 END),0) as total_rep,
          COALESCE(SUM(monto),0) as total_general
        FROM CostosAdicionales WHERE 1=1 ${fCosto}
      `).first();
      if (costosResumen) {
        totalCostosExtras = Number(costosResumen.total_general || 0);
        costosMO = Number(costosResumen.total_mo || 0);
        costosRep = Number(costosResumen.total_rep || 0);
      }
    } catch (e) {
      console.log('Error costos resumen:', e.message);
    }

    const totalIngresos = Number(resumen.total_monto_ordenes || 0) + totalCostosExtras;

    return new Response(JSON.stringify({
      success: true,
      periodo, valor,
      generado_en: chileNowISO(),
      resumen: {
        ...resumen,
        total_costos_extra: totalCostosExtras,
        costos_mano_obra: costosMO,
        costos_repuestos: costosRep,
        total_gastos_negocio: totalGastos,
        gastos_por_categoria: gastosPorCategoria,
        total_ingresos: totalIngresos,
        balance: totalIngresos - totalGastos
      },
      ordenes,
      tecnicos,
      costos_adicionales: costosAdicionales,
      gastos_negocio: gastosNegocio,
      pagos,
      clientes,
      vehiculos,
      servicios_populares: serviciosPopulares
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al exportar datos:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
