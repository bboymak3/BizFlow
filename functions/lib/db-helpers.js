// ============================================================
// BizFlow - Shared D1 Database Utilities
// Cloudflare Pages Functions + D1
// ============================================================

/**
 * CORS headers for all responses
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Negocio-Id',
  'Content-Type': 'application/json',
};

/**
 * Chile timezone offset: UTC-3 or UTC-4 depending on DST.
 * We use Intl for accuracy.
 */
function getChileTimezoneDate() {
  const now = new Date();
  const chileStr = now.toLocaleString('en-US', { timeZone: 'America/Santiago' });
  return new Date(chileStr);
}

/**
 * Current date/time in Chile as a Date object
 */
export function chileNow() {
  return getChileTimezoneDate();
}

/**
 * Current date in Chile formatted as YYYY-MM-DD
 */
export function chileDate() {
  const d = chileNow();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Current timestamp in Chile as ISO string
 */
export function chileNowISO() {
  const d = chileNow();
  return d.toISOString();
}

/**
 * Table definitions for asegurarColumnasFaltantes
 * Maps table name to its CREATE TABLE statement (CREATE IF NOT EXISTS)
 */
const TABLE_DEFINITIONS = {
  CostosAdicionales: `
    CREATE TABLE IF NOT EXISTS CostosAdicionales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      concepto TEXT NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      categoria TEXT DEFAULT 'otro',
      negocio_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id)
    )
  `,
  GastosNegocio: `
    CREATE TABLE IF NOT EXISTS GastosNegocio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concepto TEXT NOT NULL,
      categoria TEXT DEFAULT 'otro',
      monto REAL NOT NULL DEFAULT 0,
      fecha_gasto TEXT,
      negocio_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `,
  Pagos: `
    CREATE TABLE IF NOT EXISTS Pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      metodo_pago TEXT DEFAULT 'efectivo',
      fecha_pago TEXT DEFAULT (datetime('now')),
      referencia TEXT,
      negocio_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id)
    )
  `,
  ServiciosCatalogo: `
    CREATE TABLE IF NOT EXISTS ServiciosCatalogo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio_sugerido REAL DEFAULT 0,
      categoria TEXT DEFAULT 'general',
      tipo_comision TEXT DEFAULT 'porcentaje',
      activo INTEGER DEFAULT 1,
      negocio_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `,
  ModelosVehiculo: `
    CREATE TABLE IF NOT EXISTS ModelosVehiculo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marca TEXT NOT NULL,
      modelo TEXT NOT NULL,
      anio_desde INTEGER,
      anio_hasta INTEGER,
      negocio_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `,
  NotificacionesWhatsApp: `
    CREATE TABLE IF NOT EXISTS NotificacionesWhatsApp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER,
      telefono TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      tipo_evento TEXT,
      estado_envio TEXT DEFAULT 'pendiente',
      respuesta TEXT,
      intentos INTEGER DEFAULT 0,
      negocio_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `,
  FotosTrabajo: `
    CREATE TABLE IF NOT EXISTS FotosTrabajo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      tipo TEXT DEFAULT 'progreso',
      descripcion TEXT,
      negocio_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id)
    )
  `,
  NotasTrabajo: `
    CREATE TABLE IF NOT EXISTS NotasTrabajo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      nota TEXT NOT NULL,
      autor TEXT,
      negocio_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id)
    )
  `,
  SeguimientoOT: `
    CREATE TABLE IF NOT EXISTS SeguimientoOT (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      estado_anterior TEXT,
      estado_nuevo TEXT,
      tecnico_id INTEGER,
      observacion TEXT,
      negocio_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id),
      FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
    )
  `,
  LandingPages: `
    CREATE TABLE IF NOT EXISTS LandingPages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id INTEGER NOT NULL DEFAULT 1,
      slug TEXT NOT NULL,
      titulo TEXT,
      contenido TEXT,
      activa INTEGER DEFAULT 1,
      meta_descripcion TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `,
  Usuarios: `
    CREATE TABLE IF NOT EXISTS Usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      nombre TEXT NOT NULL,
      rol TEXT DEFAULT 'admin',
      negocio_id INTEGER NOT NULL DEFAULT 1,
      activo INTEGER DEFAULT 1,
      ultimo_acceso TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `,
};

/**
 * Get real column names for a table from D1 pragma
 * @param {object} env - Cloudflare env with DB binding
 * @param {string} tabla - Table name
 * @returns {string[]} Array of column names
 */
export async function getColumnas(env, tabla) {
  try {
    const result = await env.DB.prepare(`PRAGMA table_info("${tabla}")`).all();
    if (result && result.results) {
      return result.results.map(row => row.name);
    }
    return [];
  } catch (error) {
    console.error(`Error getting columns for ${tabla}:`, error);
    return [];
  }
}

/**
 * Ensure all required tables exist in D1.
 * Creates tables if they don't exist.
 * Also ensures core tables have negocio_id column if missing.
 * @param {object} env - Cloudflare env with DB binding
 */
export async function asegurarColumnasFaltantes(env) {
  const errors = [];

  // Create tables that might not exist
  for (const [tableName, createSQL] of Object.entries(TABLE_DEFINITIONS)) {
    try {
      await env.DB.prepare(createSQL).run();
    } catch (error) {
      errors.push({ table: tableName, error: error.message });
      console.error(`Error creating table ${tableName}:`, error);
    }
  }

  // Ensure negocio_id column exists on core tables
  const coreTables = [
    'OrdenesTrabajo', 'Tecnicos', 'Clientes', 'Vehiculos',
    'Configuracion', 'ServiciosOrden', 'Empresas',
  ];

  for (const tabla of coreTables) {
    try {
      const columns = await getColumnas(env, tabla);
      if (columns.length > 0 && !columns.includes('negocio_id')) {
        await env.DB.prepare(
          `ALTER TABLE "${tabla}" ADD COLUMN negocio_id INTEGER NOT NULL DEFAULT 1`
        ).run();
      }
    } catch (error) {
      // Table might not exist yet, which is fine
      // It will be created by the schema migration
    }
  }

  // Ensure OrdenesTrabajo has express column
  try {
    const otColumns = await getColumnas(env, 'OrdenesTrabajo');
    if (otColumns.length > 0 && !otColumns.includes('express')) {
      await env.DB.prepare(
        `ALTER TABLE OrdenesTrabajo ADD COLUMN express INTEGER DEFAULT 0`
      ).run();
    }
    if (otColumns.length > 0 && !otColumns.includes('monto_final')) {
      await env.DB.prepare(
        `ALTER TABLE OrdenesTrabajo ADD COLUMN monto_final REAL DEFAULT 0`
      ).run();
    }
    if (otColumns.length > 0 && !otColumns.includes('restante')) {
      await env.DB.prepare(
        `ALTER TABLE OrdenesTrabajo ADD COLUMN restante REAL DEFAULT 0`
      ).run();
    }
    if (otColumns.length > 0 && !otColumns.includes('token')) {
      await env.DB.prepare(
        `ALTER TABLE OrdenesTrabajo ADD COLUMN token TEXT`
      ).run();
    }
    if (otColumns.length > 0 && !otColumns.includes('direccion')) {
      await env.DB.prepare(
        `ALTER TABLE OrdenesTrabajo ADD COLUMN direccion TEXT`
      ).run();
    }
  } catch (error) {
    console.error('Error ensuring OrdenesTrabajo columns:', error);
  }

  // Ensure Tecnicos has comision_porcentaje column
  try {
    const tecColumns = await getColumnas(env, 'Tecnicos');
    if (tecColumns.length > 0 && !tecColumns.includes('comision_porcentaje')) {
      await env.DB.prepare(
        `ALTER TABLE Tecnicos ADD COLUMN comision_porcentaje REAL DEFAULT 10`
      ).run();
    }
    if (tecColumns.length > 0 && !tecColumns.includes('pin')) {
      await env.DB.prepare(
        `ALTER TABLE Tecnicos ADD COLUMN pin TEXT`
      ).run();
    }
  } catch (error) {
    console.error('Error ensuring Tecnicos columns:', error);
  }

  // Ensure Configuracion has UltraMsg columns
  try {
    const confColumns = await getColumnas(env, 'Configuracion');
    if (confColumns.length > 0 && !confColumns.includes('ultramsg_instance')) {
      await env.DB.prepare(
        `ALTER TABLE Configuracion ADD COLUMN ultramsg_instance TEXT`
      ).run();
    }
    if (confColumns.length > 0 && !confColumns.includes('ultramsg_token')) {
      await env.DB.prepare(
        `ALTER TABLE Configuracion ADD COLUMN ultramsg_token TEXT`
      ).run();
    }
  } catch (error) {
    console.error('Error ensuring Configuracion columns:', error);
  }

  return errors;
}

/**
 * Get the date column name and format for OrdenesTrabajo
 * Different installations may use fecha_creacion, fecha, created_at, etc.
 * @param {object} env - Cloudflare env with DB binding
 * @returns {{column: string, format: string}} Column info
 */
export async function getFechaColumn(env) {
  const columns = await getColumnas(env, 'OrdenesTrabajo');
  const dateColumns = [
    'fecha_creacion', 'fecha', 'created_at', 'fechaCreacion',
    'fecha_creacion_local', 'fechaRegistro',
  ];
  for (const col of dateColumns) {
    if (columns.includes(col)) {
      return { column: col, format: 'text' };
    }
  }
  // Default fallback
  return { column: 'fecha_creacion', format: 'text' };
}

/**
 * Build a WHERE clause fragment for date filtering
 * @param {object} fechaCol - { column, format } from getFechaColumn
 * @param {string} periodo - dia | semana | quincena | mes | anio | custom
 * @param {string} valor - The date value (YYYY-MM-DD format or specific period value)
 * @returns {{ where: string, params: string[] }} SQL WHERE fragment and params
 */
export function buildFechaWhere(fechaCol, periodo, valor) {
  const col = fechaCol.column;
  const where = [];
  const params = [];

  if (!periodo || periodo === 'todo') {
    return { where: '', params: [] };
  }

  const targetDate = valor || chileDate();

  switch (periodo) {
    case 'dia': {
      // Orders from a specific day
      where.push(`date(${col}) = ?`);
      params.push(targetDate);
      break;
    }
    case 'semana': {
      // Current week (Mon-Sun) containing targetDate
      where.push(`${col} >= date(?, 'weekday 0', '-6 days')`);
      where.push(`${col} < date(?, 'weekday 0', '+1 days')`);
      params.push(targetDate, targetDate);
      break;
    }
    case 'quincena': {
      // 1st or 2nd half of the month
      const parts = targetDate.split('-');
      const day = parseInt(parts[2], 10);
      const isFirstHalf = day <= 15;
      const startDate = `${parts[0]}-${parts[1]}-${isFirstHalf ? '01' : '16'}`;
      const endDate = isFirstHalf ? `${parts[0]}-${parts[1]}-15` : `${parts[0]}-${parts[1]}-31`;
      where.push(`date(${col}) >= ?`);
      where.push(`date(${col}) <= ?`);
      params.push(startDate, endDate);
      break;
    }
    case 'mes': {
      // Entire month of targetDate
      where.push(`strftime('%Y-%m', ${col}) = strftime('%Y-%m', ?)`);
      params.push(targetDate);
      break;
    }
    case 'anio': {
      // Entire year of targetDate
      where.push(`strftime('%Y', ${col}) = strftime('%Y', ?)`);
      params.push(targetDate);
      break;
    }
    case 'rango': {
      // Custom range: valor = "YYYY-MM-DD,YYYY-MM-DD"
      if (valor && valor.includes(',')) {
        const [start, end] = valor.split(',').map(d => d.trim());
        where.push(`date(${col}) >= ?`);
        where.push(`date(${col}) <= ?`);
        params.push(start, end);
      }
      break;
    }
    default: {
      // Fallback to day
      where.push(`date(${col}) = ?`);
      params.push(targetDate);
      break;
    }
  }

  return {
    where: where.length > 0 ? ` AND ${where.join(' AND ')}` : '',
    params,
  };
}

/**
 * Extract negocio_id from request headers or body
 * @param {Request} request - Cloudflare request object
 * @returns {number} negocio_id (default 1)
 */
export function getNegocioId(request) {
  const header = request.headers.get('X-Negocio-Id');
  if (header) return parseInt(header, 10) || 1;
  return 1;
}

/**
 * Parse JSON body from request
 * @param {Request} request - Cloudflare request object
 * @returns {Promise<object>} Parsed body
 */
export async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * Create a JSON response with CORS headers
 * @param {object} data - Response data
 * @param {number} status - HTTP status code
 * @returns {Response} Cloudflare Response
 */
export function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

/**
 * Create an error JSON response
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Response} Cloudflare Response
 */
export function errorRes(message, status = 400) {
  return jsonRes({ success: false, error: message }, status);
}

/**
 * Create a success JSON response
 * @param {*} data - Response data
 * @param {number} status - HTTP status code
 * @returns {Response} Cloudflare Response
 */
export function successRes(data, status = 200) {
  return jsonRes({ success: true, data }, status);
}

/**
 * Handle OPTIONS preflight requests
 * @returns {Response} Empty response with CORS headers
 */
export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Simple hash function for PINs/passwords (not cryptographic-grade, use for PINS)
 * @param {string} str - String to hash
 * @returns {string} Hashed string
 */
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return 'h_' + Math.abs(hash).toString(36);
}

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================
// Additional helpers for técnico endpoints & public API
// ============================================================

/**
 * Chile time formatted as string "YYYY-MM-DD HH:MM:SS"
 */
export function chileNowStr() {
  const d = chileNow();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Alias for chileDate */
export const chileToday = chileDate;

/** Alias for successRes */
export const successResponse = successRes;

/** Alias for errorRes */
export const errorResponse = errorRes;

/**
 * Validate required fields in request body
 * @param {object} body - Request body
 * @param {string[]} requiredFields - Array of required field names
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateRequired(body, requiredFields) {
  const missing = requiredFields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  return { valid: missing.length === 0, missing };
}

/**
 * Generate a cryptographically random token
 * @param {number} length - Token length in bytes (default 32)
 * @returns {string} Hex string token
 */
export function generateToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculate distance between two GPS points using Haversine formula
 * @param {number} lat1 - Start latitude
 * @param {number} lng1 - Start longitude
 * @param {number} lat2 - End latitude
 * @param {number} lng2 - End longitude
 * @returns {number} Distance in kilometers (rounded to 2 decimals)
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate domicilio (home visit) charge based on distance and Configuracion fields
 * @param {object} config - Row from Configuracion table
 * @param {number} distanceKm - Distance in km
 * @returns {{ distancia_km: number, cargo_domicilio: number }}
 */
export function calcularCargoDomicilio(config, distanceKm) {
  const modoCobro = config.domicilio_modo_cobro || 'no_cobrar';
  const radioGratis = config.domicilio_radio_gratis_km || 5;
  const tarifaPorKm = config.domicilio_tarifa_por_km || 500;
  const cargoMinimo = config.domicilio_cargo_minimo || 1000;
  const coberturaMaxima = config.domicilio_cobertura_maxima_km || 50;

  if (modoCobro === 'no_cobrar' || distanceKm <= radioGratis) {
    return { distancia_km: distanceKm, cargo_domicilio: 0 };
  }
  if (distanceKm > coberturaMaxima) {
    return { distancia_km: distanceKm, cargo_domicilio: -1 };
  }
  const kmCobrables = distanceKm - radioGratis;
  const cargoCalculado = kmCobrables * tarifaPorKm;
  const cargoFinal = Math.max(cargoCalculado, cargoMinimo);
  return { distancia_km: distanceKm, cargo_domicilio: Math.round(cargoFinal) };
}

/**
 * Get configuration row from Configuracion table
 * @param {D1Database} db - D1 database binding
 * @returns {Promise<object>}
 */
export async function getConfig(db) {
  const result = await db.prepare('SELECT * FROM Configuracion WHERE id = 1').first();
  return result || {};
}

/**
 * Ensure specific columns exist in a table (safe migration helper)
 * @param {D1Database} db - D1 database binding
 * @param {string} table - Table name
 * @param {Array<{column: string, type: string, default?: any}>} columns
 */
export async function asegurarColumnas(db, table, columns) {
  const columnInfo = await db.prepare(`PRAGMA table_info(${table})`).all();
  const existingColumns = new Set((columnInfo.results || []).map((c) => c.name));
  for (const col of columns) {
    if (!existingColumns.has(col.column)) {
      const defaultClause = col.default !== undefined
        ? ` DEFAULT ${typeof col.default === 'string' ? `'${col.default}'` : col.default}`
        : '';
      try {
        await db.exec(`ALTER TABLE ${table} ADD COLUMN ${col.column} ${col.type}${defaultClause}`);
      } catch (e) {
        console.warn(`Could not add column ${table}.${col.column}:`, e.message);
      }
    }
  }
}

/**
 * Send WhatsApp notification via UltraMsg and store in DB
 * @param {D1Database} db - D1 database
 * @param {object} config - Configuracion row
 * @param {{ orden_id: number, telefono: string, mensaje: string, tipo_evento: string, negocio_id?: string }} params
 */
export async function sendWhatsApp(db, config, { orden_id, telefono, mensaje, tipo_evento, negocio_id = 'default' }) {
  try {
    await db.prepare(`
      INSERT INTO NotificacionesWhatsApp (orden_id, telefono, mensaje, tipo_evento, estado_envio, negocio_id)
      VALUES (?, ?, ?, ?, 'pendiente', ?)
    `).bind(orden_id, telefono, mensaje, tipo_evento, negocio_id).run();
  } catch (e) {
    console.error('Error saving WhatsApp notification:', e);
  }

  const instance = config.whatsapp_ultramsg_instance;
  const token = config.whatsapp_ultramsg_token;
  if (!instance || !token) {
    return { sent: false, reason: 'WhatsApp not configured' };
  }

  try {
    const url = `https://api.ultramsg.com/${instance}/messages/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        to: telefono.startsWith('56') ? telefono : `56${telefono}`,
        body: mensaje,
      }),
    });
    const result = await response.json();
    const sent = result.status === 'success';
    if (sent) {
      await db.prepare(`
        UPDATE NotificacionesWhatsApp SET estado_envio = 'enviado', respuesta = ? WHERE orden_id = ? AND tipo_evento = ? ORDER BY id DESC LIMIT 1
      `).bind(result.id || 'sent', orden_id, tipo_evento).run();
    }
    return { sent, ...result };
  } catch (e) {
    console.error('UltraMsg API error:', e);
    return { sent: false, reason: 'API error' };
  }
}

/**
 * Generate WhatsApp message for order status transitions
 * @param {string} tipo - en_sitio, en_progreso, completada, cerrada, aprobada, cancelada, pendiente_piezas
 * @param {object} orden - Order row
 * @param {object} tecnico - Tecnico row (optional)
 * @param {object} cliente - Cliente row (optional)
 * @returns {string}
 */
export function generarMensajeWhatsApp(tipo, orden, tecnico = null, cliente = null) {
  const numOrden = orden.numero_orden || orden.id;
  const nombreCliente = cliente?.nombre || 'Cliente';
  const nombreTecnico = tecnico?.nombre || '';
  const patente = orden.patente_placa || orden.patente || '';
  const monto = orden.monto_total || orden.monto_final || orden.monto_base || 0;

  const fmt = (n) => Math.round(n).toLocaleString('es-CL');

  const mensajes = {
    en_sitio: `🔧 *Actualización de Orden #${numOrden}*\n\nHola ${nombreCliente},\n\nNuestro técnico ${nombreTecnico} ha llegado al domicilio para atender su vehículo ${patente}.\n\n📍 Estado: En Sitio\n🕐 Hora: ${chileNowStr()}\n\nLe mantendremos informados del progreso.`,

    en_progreso: `🔧 *Trabajo Iniciado - Orden #${numOrden}*\n\nHola ${nombreCliente},\n\n${nombreTecnico} ha comenzado a trabajar en su vehículo ${patente}.\n\n⚙️ Estado: En Progreso\n🕐 Hora: ${chileNowStr()}`,

    completada: `✅ *Trabajo Completado - Orden #${numOrden}*\n\nHola ${nombreCliente},\n\nEl trabajo en su vehículo ${patente} ha sido completado exitosamente.\n\n👨‍🔧 Técnico: ${nombreTecnico}\n🕐 Hora: ${chileNowStr()}\n\nLe enviaremos un enlace para aprobar y ver los detalles.`,

    cerrada: `📋 *Orden Cerrada #${numOrden}*\n\nHola ${nombreCliente},\n\nSu orden de trabajo ha sido cerrada.\n🚗 Vehículo: ${patente}\n💰 Monto Total: $${fmt(monto)}\n\n¡Gracias por confiar en nosotros!`,

    aprobada: `✅ *Orden Aprobada #${numOrden}*\n\nHola ${nombreCliente},\n\nUsted ha aprobado la orden de trabajo para su vehículo ${patente}.\n\n¡Gracias por su confianza!`,

    cancelada: `❌ *Orden Cancelada #${numOrden}*\n\nHola ${nombreCliente},\n\nLa orden de trabajo para su vehículo ${patente} ha sido cancelada.\n\nSi tiene alguna consulta, no dude en contactarnos.`,

    pendiente_piezas: `⏳ *Pendiente Piezas - Orden #${numOrden}*\n\nHola ${nombreCliente},\n\nEl trabajo en su vehículo ${patente} requiere repuestos que no están disponibles.\n\n⏳ Estado: Pendiente Piezas\n👨‍🔧 Técnico: ${nombreTecnico}\n🕐 Hora: ${chileNowStr()}\n\nLe notificaremos cuando se retome el trabajo.`,
  };

  return mensajes[tipo] || `🔧 *Notificación - Orden #${numOrden}*\n\nActualización de su orden de trabajo.`;
}
