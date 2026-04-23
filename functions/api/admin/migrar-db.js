/**
 * Migración automática de D1 - BizFlow + Globalprov2
 * GET /api/admin/migrar-db
 *
 * Verifica si cada tabla/columna ya existe antes de agregarla.
 * Ejecutar UNA VEZ despues de desplegar.
 * Las columnas de fecha que SQLite no permite con datetime('now')
 * se agregan con DEFAULT '' y luego se actualizan con UPDATE.
 * IDEMPOTENTE: se puede ejecutar multiples veces sin error.
 */

// Tablas nuevas a crear (CREATE IF NOT EXISTS)
const NUEVAS_TABLAS = [
  { nombre: 'AdminUsers', sql: `CREATE TABLE IF NOT EXISTS AdminUsers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nombre TEXT NOT NULL,
    activo INTEGER DEFAULT 1,
    creado_en TEXT DEFAULT ''
  )` },
  { nombre: 'SesionesAdmin', sql: `CREATE TABLE IF NOT EXISTS SesionesAdmin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT,
    creado_en TEXT DEFAULT ''
  )` },
  { nombre: 'SeguimientoTrabajo', sql: `CREATE TABLE IF NOT EXISTS SeguimientoTrabajo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orden_id INTEGER NOT NULL,
    tecnico_id INTEGER,
    estado_anterior TEXT DEFAULT '',
    estado_nuevo TEXT DEFAULT '',
    latitud REAL DEFAULT 0,
    longitud REAL DEFAULT 0,
    observaciones TEXT DEFAULT '',
    fecha_registro TEXT DEFAULT ''
  )` },
  { nombre: 'ConfigKV', sql: `CREATE TABLE IF NOT EXISTS ConfigKV (
    clave TEXT PRIMARY KEY,
    valor TEXT DEFAULT '',
    actualizado_en TEXT DEFAULT ''
  )` },
];

// Columnas nuevas a agregar con ALTER TABLE
// { tabla, columna, tipo, default } — default SIEMPRE constante (no funciones)
const NUEVAS_COLUMNAS = [
  // Clientes
  { tabla: 'Clientes', columna: 'rut', tipo: 'TEXT', default: "''" },
  { tabla: 'Clientes', columna: 'patente', tipo: 'TEXT', default: "''" },
  // Vehiculos
  { tabla: 'Vehiculos', columna: 'patente_placa', tipo: 'TEXT', default: "''" },
  { tabla: 'Vehiculos', columna: 'cilindrada', tipo: 'TEXT', default: "''" },
  { tabla: 'Vehiculos', columna: 'combustible', tipo: 'TEXT', default: "''" },
  // ServiciosCatalogo
  { tabla: 'ServiciosCatalogo', columna: 'precio_sugerido', tipo: 'REAL', default: '0' },
  { tabla: 'ServiciosCatalogo', columna: 'tipo_comision', tipo: 'TEXT', default: "'mano_obra'" },
  { tabla: 'ServiciosCatalogo', columna: 'fecha_registro', tipo: 'TEXT', default: "''" },
  // Tecnicos
  { tabla: 'Tecnicos', columna: 'comision_porcentaje', tipo: 'REAL', default: '40' },
  { tabla: 'Tecnicos', columna: 'password', tipo: 'TEXT', default: "''" },
  { tabla: 'Tecnicos', columna: 'token', tipo: 'TEXT', default: "''" },
  // OrdenesTrabajo - bloque 1
  { tabla: 'OrdenesTrabajo', columna: 'numero_orden', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'token', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'patente_placa', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'fecha_ingreso', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'hora_ingreso', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'recepcionista', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'marca', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'modelo', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'anio', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'cilindrada', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'combustible', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'kilometraje', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'direccion', tipo: 'TEXT', default: "''" },
  // OrdenesTrabajo - checks
  { tabla: 'OrdenesTrabajo', columna: 'trabajo_frenos', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'detalle_frenos', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'trabajo_luces', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'detalle_luces', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'trabajo_tren_delantero', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'detalle_tren_delantero', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'trabajo_correas', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'detalle_correas', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'trabajo_componentes', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'detalle_componentes', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'nivel_combustible', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'check_paragolfe_delantero_der', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'check_puerta_delantera_der', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'check_puerta_trasera_der', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'check_paragolfe_trasero_izq', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'check_otros_carroceria', tipo: 'INTEGER', default: '0' },
  // OrdenesTrabajo - montos y estado
  { tabla: 'OrdenesTrabajo', columna: 'monto_total', tipo: 'REAL', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'monto_abono', tipo: 'REAL', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'monto_restante', tipo: 'REAL', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'firma_imagen', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'fecha_aprobacion', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'completo', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'es_express', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'estado_trabajo', tipo: 'TEXT', default: "''" },
  // OrdenesTrabajo - relaciones
  { tabla: 'OrdenesTrabajo', columna: 'tecnico_asignado_id', tipo: 'INTEGER', default: null },
  { tabla: 'OrdenesTrabajo', columna: 'cliente_nombre', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'cliente_telefono', tipo: 'TEXT', default: "''" },
  // OrdenesTrabajo - cancelacion y domicilio
  { tabla: 'OrdenesTrabajo', columna: 'motivo_cancelacion', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'fecha_cancelacion', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'pagado', tipo: 'INTEGER', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'referencia_direccion', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'distancia_km', tipo: 'REAL', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'cargo_domicilio', tipo: 'REAL', default: '0' },
  { tabla: 'OrdenesTrabajo', columna: 'domicilio_modo_cobro', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'diagnostico_checks', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'diagnostico_observaciones', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'servicios_seleccionados', tipo: 'TEXT', default: "''" },
  { tabla: 'OrdenesTrabajo', columna: 'fecha_completado', tipo: 'TEXT', default: "''" },
  // CostosAdicionales
  { tabla: 'CostosAdicionales', columna: 'monto', tipo: 'REAL', default: '0' },
  { tabla: 'CostosAdicionales', columna: 'categoria', tipo: 'TEXT', default: "'Mano de Obra'" },
  { tabla: 'CostosAdicionales', columna: 'fecha_registro', tipo: 'TEXT', default: "''" },
  { tabla: 'CostosAdicionales', columna: 'registrado_por', tipo: 'TEXT', default: "''" },
  // GastosNegocio
  { tabla: 'GastosNegocio', columna: 'fecha_gasto', tipo: 'TEXT', default: "''" },
  { tabla: 'GastosNegocio', columna: 'observaciones', tipo: 'TEXT', default: "''" },
  // ModelosVehiculo
  { tabla: 'ModelosVehiculo', columna: 'nombre', tipo: 'TEXT', default: "''" },
  { tabla: 'ModelosVehiculo', columna: 'fecha_registro', tipo: 'TEXT', default: "''" },
  // NotificacionesWhatsApp
  { tabla: 'NotificacionesWhatsApp', columna: 'telefono', tipo: 'TEXT', default: "''" },
  { tabla: 'NotificacionesWhatsApp', columna: 'tipo_evento', tipo: 'TEXT', default: "''" },
  { tabla: 'NotificacionesWhatsApp', columna: 'enviada', tipo: 'INTEGER', default: '0' },
  { tabla: 'NotificacionesWhatsApp', columna: 'fecha_creacion', tipo: 'TEXT', default: "''" },
  // Pagos
  { tabla: 'Pagos', columna: 'metodo_pago', tipo: 'TEXT', default: "''" },
  { tabla: 'Pagos', columna: 'observaciones', tipo: 'TEXT', default: "''" },
  // Configuracion
  { tabla: 'Configuracion', columna: 'ultimo_numero_orden', tipo: 'INTEGER', default: '0' },
];

// Índices nuevos (CREATE INDEX IF NOT EXISTS = seguro)
const NUEVOS_INDICES = [
  'CREATE INDEX IF NOT EXISTS idx_clientes_rut ON Clientes(rut)',
  'CREATE INDEX IF NOT EXISTS idx_clientes_patente ON Clientes(patente)',
  'CREATE INDEX IF NOT EXISTS idx_vehiculos_patente_placa ON Vehiculos(patente_placa)',
  'CREATE INDEX IF NOT EXISTS idx_ot_token_gp2 ON OrdenesTrabajo(token)',
  'CREATE INDEX IF NOT EXISTS idx_ot_numero_orden ON OrdenesTrabajo(numero_orden)',
  'CREATE INDEX IF NOT EXISTS idx_ot_patente_placa ON OrdenesTrabajo(patente_placa)',
  'CREATE INDEX IF NOT EXISTS idx_ot_estado_trabajo ON OrdenesTrabajo(estado_trabajo)',
  'CREATE INDEX IF NOT EXISTS idx_ot_tecnico_asignado ON OrdenesTrabajo(tecnico_asignado_id)',
  'CREATE INDEX IF NOT EXISTS idx_ot_fecha_ingreso ON OrdenesTrabajo(fecha_ingreso)',
  'CREATE INDEX IF NOT EXISTS idx_ot_pagado ON OrdenesTrabajo(pagado)',
  'CREATE INDEX IF NOT EXISTS idx_ot_completo ON OrdenesTrabajo(completo)',
  'CREATE INDEX IF NOT EXISTS idx_costos_categoria ON CostosAdicionales(categoria)',
  'CREATE INDEX IF NOT EXISTS idx_seguimiento_trabajo_orden ON SeguimientoTrabajo(orden_id)',
  'CREATE INDEX IF NOT EXISTS idx_seguimiento_trabajo_tecnico ON SeguimientoTrabajo(tecnico_id)',
  'CREATE INDEX IF NOT EXISTS idx_whatsapp_telefono ON NotificacionesWhatsApp(telefono)',
  'CREATE INDEX IF NOT EXISTS idx_whatsapp_enviada ON NotificacionesWhatsApp(enviada)',
  'CREATE INDEX IF NOT EXISTS idx_sesiones_admin_token ON SesionesAdmin(token)',
  'CREATE INDEX IF NOT EXISTS idx_sesiones_admin_admin ON SesionesAdmin(admin_id)',
];

// UPDATE para llenar fechas en filas existentes
const UPDATE_FECHAS = [
  "UPDATE AdminUsers SET creado_en = datetime('now') WHERE creado_en = '' OR creado_en IS NULL",
  "UPDATE SesionesAdmin SET creado_en = datetime('now') WHERE creado_en = '' OR creado_en IS NULL",
  "UPDATE SeguimientoTrabajo SET fecha_registro = datetime('now') WHERE fecha_registro = '' OR fecha_registro IS NULL",
  "UPDATE ConfigKV SET actualizado_en = datetime('now') WHERE actualizado_en = '' OR actualizado_en IS NULL",
  "UPDATE ServiciosCatalogo SET fecha_registro = datetime('now') WHERE fecha_registro = '' OR fecha_registro IS NULL",
  "UPDATE CostosAdicionales SET fecha_registro = datetime('now') WHERE fecha_registro = '' OR fecha_registro IS NULL",
  "UPDATE ModelosVehiculo SET fecha_registro = datetime('now') WHERE fecha_registro = '' OR fecha_registro IS NULL",
  "UPDATE NotificacionesWhatsApp SET fecha_creacion = datetime('now') WHERE fecha_creacion = '' OR fecha_creacion IS NULL",
];

// Datos iniciales
const DATOS_INICIALES = [
  "INSERT OR IGNORE INTO AdminUsers (username, password_hash, nombre) VALUES ('admin', 'admin123_hashed_change_me', 'Administrador Globalprov2')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('ultimo_numero_orden', '0')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('nombre_negocio', 'Globalprov2')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('moneda', 'CLP')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('tasa_impuesto', '19')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('url_base', '')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('whatsapp_api_url', '')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('whatsapp_api_token', '')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('whatsapp_numero_remitente', '')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('google_maps_api_key', '')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('umbral_bajo_combustible', '25')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('radio_busqueda_km', '50')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('cargo_domicilio_base', '0')",
  "INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('cargo_domicilio_por_km', '0')",
];

export const onRequestGet = async (context) => {
  const db = context.env.DB;
  const log = [];

  try {
    // ── PASO 1: Crear tablas nuevas ──
    log.push('=== PASO 1: Creando tablas nuevas ===');
    for (const t of NUEVAS_TABLAS) {
      try {
        await db.prepare(t.sql).run();
        log.push(`  [OK] Tabla ${t.nombre} creada (o ya existia)`);
      } catch (e) {
        log.push(`  [ERROR] Tabla ${t.nombre}: ${e.message}`);
      }
    }

    // ── PASO 2: Agregar columnas nuevas (verifica existencia) ──
    log.push('=== PASO 2: Agregando columnas nuevas ===');

    // Obtener todas las tablas existentes
    const tablasResult = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    const tablasExistentes = new Set(tablasResult.results.map(r => r.name));

    for (const col of NUEVAS_COLUMNAS) {
      // Verificar que la tabla existe
      if (!tablasExistentes.has(col.tabla)) {
        log.push(`  [SKIP] ${col.tabla}.${col.columna} — tabla no existe`);
        continue;
      }

      // Verificar si la columna ya existe usando PRAGMA
      let columnaExiste = false;
      try {
        const pragmaResult = await db.prepare(`PRAGMA table_info("${col.tabla}")`).all();
        columnaExiste = pragmaResult.results.some(r => r.name === col.columna);
      } catch (e) {
        log.push(`  [WARN] No se pudo verificar ${col.tabla}.${col.columna}: ${e.message}`);
        continue;
      }

      if (columnaExiste) {
        log.push(`  [SKIP] ${col.tabla}.${col.columna} — ya existe`);
        continue;
      }

      // Agregar la columna con default CONSTANTE (sin funciones)
      const defStr = col.default === null ? '' : ` DEFAULT ${col.default}`;
      const sql = `ALTER TABLE "${col.tabla}" ADD COLUMN "${col.columna}" ${col.tipo}${defStr}`;
      try {
        await db.prepare(sql).run();
        log.push(`  [OK] ${col.tabla}.${col.columna} ${col.tipo} agregada`);
      } catch (e) {
        log.push(`  [ERROR] ${col.tabla}.${col.columna}: ${e.message}`);
      }
    }

    // ── PASO 3: Llenar fechas en filas existentes ──
    log.push('=== PASO 3: Actualizando fechas ===');
    for (const sql of UPDATE_FECHAS) {
      try {
        const res = await db.prepare(sql).run();
        if (res.meta.changes > 0) {
          log.push(`  [OK] ${sql.split(' SET ')[0].split('UPDATE ')[1]}: ${res.meta.changes} filas actualizadas`);
        } else {
          log.push(`  [SKIP] ${sql.split(' SET ')[0].split('UPDATE ')[1]}: sin cambios`);
        }
      } catch (e) {
        log.push(`  [WARN] ${e.message}`);
      }
    }

    // ── PASO 4: Crear índices ──
    log.push('=== PASO 4: Creando índices ===');
    for (const sql of NUEVOS_INDICES) {
      try {
        await db.prepare(sql).run();
        const idxName = sql.split(' INDEX ')[1].split(' ON ')[0].replace('IF NOT EXISTS ', '');
        log.push(`  [OK] ${idxName}`);
      } catch (e) {
        log.push(`  [ERROR] ${e.message}`);
      }
    }

    // ── PASO 5: Insertar datos iniciales ──
    log.push('=== PASO 5: Datos iniciales ===');
    for (const sql of DATOS_INICIALES) {
      try {
        await db.prepare(sql).run();
        log.push(`  [OK] ${sql.split('VALUES ')[1]}`);
      } catch (e) {
        log.push(`  [ERROR] ${e.message}`);
      }
    }

    // ── RESUMEN FINAL ──
    const totalOk = log.filter(l => l.includes('[OK]')).length;
    const totalSkip = log.filter(l => l.includes('[SKIP]')).length;
    const totalError = log.filter(l => l.includes('[ERROR]')).length;
    const totalWarn = log.filter(l => l.includes('[WARN]')).length;

    return new Response(JSON.stringify({
      success: true,
      message: 'Migración completada',
      resumen: {
        tablas_creadas: NUEVAS_TABLAS.length,
        columnas_procesadas: NUEVAS_COLUMNAS.length,
        indices_creados: NUEVOS_INDICES.length,
        datos_iniciales: DATOS_INICIALES.length,
        resultados: { ok: totalOk, skip: totalSkip, error: totalError, warn: totalWarn },
      },
      log,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      log,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
