// ============================================
// API: COSTOS ADICIONALES POR ORDEN
// Con categorización: Mano de Obra / Repuestos-Materiales
// Global Pro Automotriz
// ============================================

// Categorías válidas
const CATEGORIAS_VALIDAS = ['Mano de Obra', 'Repuestos/Materiales'];

async function asegurarColumnaCategoria(env) {
  try {
    // Verificar si la columna categoria existe
    const columns = await env.DB.prepare("PRAGMA table_info(CostosAdicionales)").all();
    const hasCategoria = columns.results?.some(c => c.name === 'categoria');
    if (!hasCategoria) {
      await env.DB.prepare("ALTER TABLE CostosAdicionales ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Mano de Obra'").run();
    }
  } catch (e) {
    console.log('Columna categoria ya existe o error:', e.message);
  }
}

// GET: Obtener costos de una orden (con desglose por categoría)
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnaCategoria(env);

    const url = new URL(request.url);
    const ordenId = url.searchParams.get('orden_id');

    if (!ordenId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere orden_id'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const { results } = await env.DB.prepare(`
      SELECT * FROM CostosAdicionales
      WHERE orden_id = ?
      ORDER BY fecha_registro DESC
    `).bind(ordenId).all();

    // Desglose por categoría
    const totalManoObra = results.reduce((sum, c) => {
      if (c.categoria === 'Mano de Obra') return sum + Number(c.monto || 0);
      return sum;
    }, 0);
    const totalRepuestos = results.reduce((sum, c) => {
      if (c.categoria === 'Repuestos/Materiales') return sum + Number(c.monto || 0);
      return sum;
    }, 0);
    const total = totalManoObra + totalRepuestos;

    return new Response(JSON.stringify({
      success: true,
      costos: results,
      total,
      desglose: {
        mano_de_obra: totalManoObra,
        repuestos_materiales: totalRepuestos
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener costos adicionales:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// POST: Agregar costo adicional (con categoría obligatoria)
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await asegurarColumnaCategoria(env);

    const data = await request.json();

    if (!data.orden_id || !data.concepto || !data.monto) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: orden_id, concepto y monto son obligatorios'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Validar categoría
    const categoria = CATEGORIAS_VALIDAS.includes(data.categoria) ? data.categoria : 'Mano de Obra';

    // VERIFICAR que la orden NO esté Cerrada
    const orden = await env.DB.prepare(`
      SELECT estado, estado_trabajo FROM OrdenesTrabajo WHERE id = ?
    `).bind(data.orden_id).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    if (orden.estado_trabajo === 'Cerrada' || orden.estado === 'Cancelada') {
      return new Response(JSON.stringify({
        success: false,
        error: 'No se pueden agregar costos a una orden Cerrada o Cancelada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Insertar costo adicional con categoría
    const result = await env.DB.prepare(`
      INSERT INTO CostosAdicionales (orden_id, concepto, monto, categoria, registrado_por)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.orden_id,
      data.concepto,
      data.monto,
      categoria,
      data.registrado_por || 'Admin'
    ).run();

    const nuevoCostoId = result.meta.last_row_id;

    // Obtener el nuevo costo insertado
    const costo = await env.DB.prepare(
      'SELECT * FROM CostosAdicionales WHERE id = ?'
    ).bind(nuevoCostoId).first();

    // Obtener desglose de costos adicionales de la orden
    const todosCostos = await env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN categoria = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
        COALESCE(SUM(CASE WHEN categoria = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
        COALESCE(SUM(monto), 0) as total_general
      FROM CostosAdicionales WHERE orden_id = ?
    `).bind(data.orden_id).first();

    return new Response(JSON.stringify({
      success: true,
      costo: { ...costo, categoria },
      desglose: {
        mano_de_obra: Number(todosCostos.total_mano_obra || 0),
        repuestos_materiales: Number(todosCostos.total_repuestos || 0),
        total_general: Number(todosCostos.total_general || 0)
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al agregar costo adicional:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// DELETE: Eliminar un costo adicional
export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    await asegurarColumnaCategoria(env);

    const url = new URL(request.url);
    const costoId = url.searchParams.get('id');
    const ordenId = url.searchParams.get('orden_id');

    if (!costoId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere el ID del costo a eliminar'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Eliminar
    await env.DB.prepare('DELETE FROM CostosAdicionales WHERE id = ?').bind(costoId).run();

    // Obtener nuevo desglose de costos
    let desglose = { mano_de_obra: 0, repuestos_materiales: 0, total_general: 0 };
    if (ordenId) {
      const { results } = await env.DB.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN categoria = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
          COALESCE(SUM(CASE WHEN categoria = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
          COALESCE(SUM(monto), 0) as total_general
        FROM CostosAdicionales WHERE orden_id = ?
      `).bind(ordenId).all();
      if (results[0]) {
        desglose = {
          mano_de_obra: Number(results[0].total_mano_obra || 0),
          repuestos_materiales: Number(results[0].total_repuestos || 0),
          total_general: Number(results[0].total_general || 0)
        };
      }
    }

    return new Response(JSON.stringify({
      success: true,
      desglose
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al eliminar costo adicional:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
