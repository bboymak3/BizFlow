// ============================================
// API: RESUMEN DE PAGOS Y FLUJO DE CAJA
// Con desglose de costos por categoría
// Auto-crea tablas si no existen
// Global Pro Automotriz
// ============================================

import { asegurarColumnasFaltantes, buildFechaWhereGP as buildFechaWhere } from '../../lib/db-helpers.js';

async function asegurarTablas(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS CostosAdicionales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      concepto TEXT NOT NULL,
      monto REAL NOT NULL,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
      registrado_por TEXT,
      categoria TEXT NOT NULL DEFAULT 'Mano de Obra'
    )`).run();
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
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON GastosNegocio(fecha_gasto)`).run();

    // Asegurar columna categoria
    try {
      const columns = await env.DB.prepare("PRAGMA table_info(CostosAdicionales)").all();
      const hasCategoria = columns.results?.some(c => c.name === 'categoria');
      if (!hasCategoria) {
        await env.DB.prepare("ALTER TABLE CostosAdicionales ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Mano de Obra'").run();
      }
    } catch (e) {
      console.log('asegurar columna categoria:', e.message);
    }
  } catch (e) {
    console.error('Error al asegurar tablas:', e);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarTablas(env);
    await asegurarColumnasFaltantes(env);

    const url = new URL(request.url);
    const periodo = url.searchParams.get('periodo') || 'mes';
    const valor = url.searchParams.get('valor');

    // SIEMPRE usar o.fecha_ingreso para filtrar (columna 100% segura)
    const fechaWhere = buildFechaWhere('o.fecha_ingreso', periodo, valor);
    const fechaCondicion = fechaWhere.condicion;
    const fechaSQL = fechaCondicion ? `WHERE ${fechaCondicion}` : '';
    const params = fechaWhere.params;

    // 1. Desglose por método de pago
    const { results: metodosPago } = await env.DB.prepare(`
      SELECT
        metodo_pago,
        COUNT(*) as cantidad,
        COALESCE(SUM(monto_abono), 0) as total_abonos,
        COALESCE(SUM(monto_total), 0) as total_ordenes
      FROM OrdenesTrabajo o
      ${fechaSQL}
      ${fechaSQL ? 'AND' : 'WHERE'} metodo_pago IS NOT NULL AND metodo_pago != ''
      GROUP BY metodo_pago
      ORDER BY total_abonos DESC
    `).bind(...params).all();

    // 2. Órdenes pendientes de pago
    const pendientes = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_pendientes,
        COALESCE(SUM(monto_restante), 0) as saldo_pendiente
      FROM OrdenesTrabajo o
      ${fechaSQL ? fechaSQL + ' AND' : 'WHERE'}
        monto_restante > 0
        AND (estado = 'Aprobada' OR estado_trabajo = 'Cerrada')
    `).bind(...params).first();

    // 3. Costos adicionales DESGLOSADOS del periodo
    let costosParams = [];
    let costosFecha = '';
    if (valor) {
      switch (periodo) {
        case 'dia':
          costosFecha = "WHERE date(fecha_registro) = ?";
          costosParams.push(valor);
          break;
        case 'semana':
          const [yr, wk] = valor.split('-').map(Number);
          costosFecha = "WHERE strftime('%Y', fecha_registro) = ? AND cast(strftime('%W', fecha_registro) as integer) = ?";
          costosParams.push(String(yr), wk);
          break;
        case 'anio':
          costosFecha = "WHERE strftime('%Y', fecha_registro) = ?";
          costosParams.push(valor);
          break;
        default:
          costosFecha = "WHERE strftime('%Y-%m', fecha_registro) = ?";
          costosParams.push(valor);
          break;
      }
    }

    const costosAdicionales = await env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN categoria = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
        COALESCE(SUM(CASE WHEN categoria = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
        COALESCE(SUM(monto), 0) as total
      FROM CostosAdicionales
      ${costosFecha}
    `).bind(...costosParams).first();

    // 4. Gastos del negocio
    let gastosFecha = '';
    let gastosParams = [];
    if (valor) {
      switch (periodo) {
        case 'dia':
          gastosFecha = 'WHERE fecha_gasto = ?';
          gastosParams.push(valor);
          break;
        case 'semana':
          const [y, w] = valor.split('-').map(Number);
          gastosFecha = "WHERE strftime('%Y', fecha_gasto) = ? AND cast(strftime('%W', fecha_gasto) as integer) = ?";
          gastosParams.push(String(y), w);
          break;
        case 'anio':
          gastosFecha = "WHERE strftime('%Y', fecha_gasto) = ?";
          gastosParams.push(valor);
          break;
        default:
          gastosFecha = "WHERE strftime('%Y-%m', fecha_gasto) = ?";
          gastosParams.push(valor);
          break;
      }
    }

    const totalGastos = await env.DB.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM GastosNegocio
      ${gastosFecha}
    `).bind(...gastosParams).first();

    // 5. Historial diario
    const historialResult = await env.DB.prepare(`
      SELECT
        date(o.fecha_ingreso) as fecha,
        COUNT(*) as ordenes,
        COALESCE(SUM(monto_total), 0) as ingresos,
        COALESCE(SUM(monto_abono), 0) as abonos_recibidos
      FROM OrdenesTrabajo o
      ${fechaSQL}
      GROUP BY date(o.fecha_ingreso)
      ORDER BY fecha ASC
    `).bind(...params).all();

    const historial = historialResult.results || [];

    // Cálculos
    const totalAbonos = metodosPago.reduce((sum, m) => sum + Number(m.total_abonos || 0), 0);
    const totalIngresosOrd = metodosPago.reduce((sum, m) => sum + Number(m.total_ordenes || 0), 0);
    const costosManoObra = Number(costosAdicionales?.total_mano_obra || 0);
    const costosRepuestos = Number(costosAdicionales?.total_repuestos || 0);
    const costosExtra = Number(costosAdicionales?.total || 0);
    const gastosNegocio = Number(totalGastos?.total || 0);

    // Total de ingresos incluyendo TODOS los costos adicionales
    const totalIngresosConExtras = totalIngresosOrd + costosExtra;

    // Separar mano de obra vs repuestos de los servicios del catálogo
    let totalMOFromServicios = 0;
    try {
      const ordenesServicios = await env.DB.prepare(`
        SELECT servicios_seleccionados FROM OrdenesTrabajo
        ${fechaSQL}
        AND servicios_seleccionados IS NOT NULL AND servicios_seleccionados != ''
      `).bind(...params).all();
      (ordenesServicios.results || []).forEach(row => {
        if (row.servicios_seleccionados) {
          try {
            const srvs = typeof row.servicios_seleccionados === 'string'
              ? JSON.parse(row.servicios_seleccionados) : row.servicios_seleccionados;
            if (Array.isArray(srvs)) {
              srvs.forEach(s => {
                if (s.tipo_comision === 'mano_obra') {
                  totalMOFromServicios += Number(s.precio_final || s.precio_sugerido || 0);
                }
              });
            }
          } catch (e) {}
        }
      });
    } catch (e) {}

    // Obtener comisión promedio de todos los técnicos
    const { results: tecnicosComision } = await env.DB.prepare(`
      SELECT COALESCE(AVG(comision_porcentaje), 40) as avg_comision
      FROM Tecnicos WHERE comision_porcentaje IS NOT NULL AND comision_porcentaje > 0
    `).all();
    const comisionPromedio = Number(tecnicosComision?.[0]?.avg_comision || 40);
    const factorComision = comisionPromedio / 100;

    // Comisiones: SOLO sobre mano de obra (excluir repuestos)
    const baseComisionable = totalMOFromServicios > 0
      ? totalMOFromServicios + costosManoObra
      : totalIngresosOrd + costosManoObra; // Fallback: sin catálogo, asumir todo como MO
    const comisionesTecnicos = Math.round(baseComisionable * factorComision);

    return new Response(JSON.stringify({
      success: true,
      periodo,
      valor: valor || null,
      entradas: {
        total_abonos: totalAbonos,
        total_ordenes_valor: totalIngresosOrd,
        costos_adicionales: costosExtra,
        desglose_costos: {
          mano_de_obra: costosManoObra,
          repuestos_materiales: costosRepuestos
        },
        total_ingresos_con_extras: totalIngresosConExtras
      },
      salidas: {
        comisiones_tecnicos: comisionesTecnicos,
        base_comisionable: baseComisionable,
        comision_porcentaje: comisionPromedio,
        gastos_operativos: gastosNegocio
      },
      balance_neto: totalAbonos - comisionesTecnicos - gastosNegocio,
      saldo_pendiente_cobrar: Number(pendientes?.saldo_pendiente || 0),
      total_pendientes_cobrar: pendientes?.total_pendientes || 0,
      por_metodo_pago: metodosPago,
      historial_diario: historial,
      formula_comision: `(Mano de Obra de servicios + Costos MO extra) x ${comisionPromedio}%. Los repuestos NO generan comisión.`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener resumen de pagos:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
