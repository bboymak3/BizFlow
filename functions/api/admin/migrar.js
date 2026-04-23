// ============================================
// API: MIGRACIÓN AUTOMÁTICA
// Crea las tablas CostosAdicionales y GastosNegocio si no existen
// Global Pro Automotriz
// ============================================

export async function onRequestGet(context) {
  const { env } = context;

  try {
    // Crear tabla CostosAdicionales
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS CostosAdicionales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orden_id INTEGER NOT NULL,
        concepto TEXT NOT NULL,
        monto REAL NOT NULL,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
        registrado_por TEXT,
        FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
      )
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_costos_orden ON CostosAdicionales(orden_id)
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_costos_fecha ON CostosAdicionales(fecha_registro)
    `).run();

    // Crear tabla GastosNegocio
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS GastosNegocio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        concepto TEXT NOT NULL,
        categoria TEXT NOT NULL DEFAULT 'Otros',
        monto REAL NOT NULL,
        fecha_gasto DATE NOT NULL,
        observaciones TEXT,
        registrado_por TEXT,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON GastosNegocio(categoria)
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON GastosNegocio(fecha_gasto)
    `).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Migración completada exitosamente',
      tablas_creadas: ['CostosAdicionales', 'GastosNegocio']
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en migración:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
