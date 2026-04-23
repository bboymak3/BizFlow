-- ============================================================
-- BizFlow + Globalprov2 - MIGRACION D1 (VERSION CORREGIDA)
-- ============================================================
-- PROBLEMA RESUELTO: SQLite NO permite DEFAULT con funciones
-- como datetime('now') en ALTER TABLE ADD COLUMN.
-- Solucion: DEFAULT '' (constante) + UPDATE posterior.
--
-- COMO EJECUTAR:
--   Opcion A: Pega TODO en la consola D1 de Cloudflare.
--             Si una columna ya existe, veras error "duplicate
--             column name" — IGNORALO y continua con las demas.
--   Opcion B: Ejecuta GET /api/admin/migrar-db en tu app
--             (este endpoint verifica automaticamente que no
--             duplique columnas ni tablas).
-- ============================================================


-- ============================================================
-- 1. TABLAS NUEVAS (CREATE IF NOT EXISTS = seguro)
-- ============================================================

CREATE TABLE IF NOT EXISTS AdminUsers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS SesionesAdmin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT,
  creado_en TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS SeguimientoTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  tecnico_id INTEGER,
  estado_anterior TEXT DEFAULT '',
  estado_nuevo TEXT DEFAULT '',
  latitud REAL DEFAULT 0,
  longitud REAL DEFAULT 0,
  observaciones TEXT DEFAULT '',
  fecha_registro TEXT DEFAULT '',
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE,
  FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ConfigKV (
  clave TEXT PRIMARY KEY,
  valor TEXT DEFAULT '',
  actualizado_en TEXT DEFAULT ''
);


-- ============================================================
-- 2. COLUMNAS NUEVAS - Clientes
-- ============================================================
ALTER TABLE Clientes ADD COLUMN rut TEXT DEFAULT '';
ALTER TABLE Clientes ADD COLUMN patente TEXT DEFAULT '';


-- ============================================================
-- 3. COLUMNAS NUEVAS - Vehiculos
-- ============================================================
ALTER TABLE Vehiculos ADD COLUMN patente_placa TEXT DEFAULT '';
ALTER TABLE Vehiculos ADD COLUMN cilindrada TEXT DEFAULT '';
ALTER TABLE Vehiculos ADD COLUMN combustible TEXT DEFAULT '';


-- ============================================================
-- 4. COLUMNAS NUEVAS - ServiciosCatalogo
-- ============================================================
ALTER TABLE ServiciosCatalogo ADD COLUMN precio_sugerido REAL DEFAULT 0;
ALTER TABLE ServiciosCatalogo ADD COLUMN tipo_comision TEXT DEFAULT 'mano_obra';
ALTER TABLE ServiciosCatalogo ADD COLUMN fecha_registro TEXT DEFAULT '';


-- ============================================================
-- 5. COLUMNAS NUEVAS - Tecnicos
-- ============================================================
ALTER TABLE Tecnicos ADD COLUMN comision_porcentaje REAL DEFAULT 40;
ALTER TABLE Tecnicos ADD COLUMN password TEXT DEFAULT '';
ALTER TABLE Tecnicos ADD COLUMN token TEXT DEFAULT '';


-- ============================================================
-- 6. COLUMNAS NUEVAS - OrdenesTrabajo
-- ============================================================
ALTER TABLE OrdenesTrabajo ADD COLUMN numero_orden TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN token TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN patente_placa TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN fecha_ingreso TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN hora_ingreso TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN recepcionista TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN marca TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN modelo TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN anio TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN cilindrada TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN combustible TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN kilometraje TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN direccion TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN trabajo_frenos INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN detalle_frenos TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN trabajo_luces INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN detalle_luces TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN trabajo_tren_delantero INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN detalle_tren_delantero TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN trabajo_correas INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN detalle_correas TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN trabajo_componentes INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN detalle_componentes TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN nivel_combustible TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN check_paragolfe_delantero_der INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN check_puerta_delantera_der INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN check_puerta_trasera_der INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN check_paragolfe_trasero_izq INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN check_otros_carroceria INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN monto_total REAL DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN monto_abono REAL DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN monto_restante REAL DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN firma_imagen TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN fecha_aprobacion TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN completo INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN es_express INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN estado_trabajo TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN tecnico_asignado_id INTEGER;
ALTER TABLE OrdenesTrabajo ADD COLUMN cliente_nombre TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN cliente_telefono TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN motivo_cancelacion TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN fecha_cancelacion TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN pagado INTEGER DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN referencia_direccion TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN distancia_km REAL DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN cargo_domicilio REAL DEFAULT 0;
ALTER TABLE OrdenesTrabajo ADD COLUMN domicilio_modo_cobro TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN diagnostico_checks TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN diagnostico_observaciones TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN servicios_seleccionados TEXT DEFAULT '';
ALTER TABLE OrdenesTrabajo ADD COLUMN fecha_completado TEXT DEFAULT '';


-- ============================================================
-- 7. COLUMNAS NUEVAS - CostosAdicionales
-- ============================================================
ALTER TABLE CostosAdicionales ADD COLUMN monto REAL DEFAULT 0;
ALTER TABLE CostosAdicionales ADD COLUMN categoria TEXT DEFAULT 'Mano de Obra';
ALTER TABLE CostosAdicionales ADD COLUMN fecha_registro TEXT DEFAULT '';
ALTER TABLE CostosAdicionales ADD COLUMN registrado_por TEXT DEFAULT '';


-- ============================================================
-- 8. COLUMNAS NUEVAS - GastosNegocio
-- ============================================================
ALTER TABLE GastosNegocio ADD COLUMN fecha_gasto TEXT DEFAULT '';
ALTER TABLE GastosNegocio ADD COLUMN observaciones TEXT DEFAULT '';


-- ============================================================
-- 9. COLUMNAS NUEVAS - ModelosVehiculo
-- ============================================================
ALTER TABLE ModelosVehiculo ADD COLUMN nombre TEXT DEFAULT '';
ALTER TABLE ModelosVehiculo ADD COLUMN fecha_registro TEXT DEFAULT '';


-- ============================================================
-- 10. COLUMNAS NUEVAS - NotificacionesWhatsApp
-- ============================================================
ALTER TABLE NotificacionesWhatsApp ADD COLUMN telefono TEXT DEFAULT '';
ALTER TABLE NotificacionesWhatsApp ADD COLUMN tipo_evento TEXT DEFAULT '';
ALTER TABLE NotificacionesWhatsApp ADD COLUMN enviada INTEGER DEFAULT 0;
ALTER TABLE NotificacionesWhatsApp ADD COLUMN fecha_creacion TEXT DEFAULT '';


-- ============================================================
-- 11. COLUMNAS NUEVAS - Pagos
-- ============================================================
ALTER TABLE Pagos ADD COLUMN metodo_pago TEXT DEFAULT '';
ALTER TABLE Pagos ADD COLUMN observaciones TEXT DEFAULT '';


-- ============================================================
-- 12. COLUMNAS NUEVAS - Configuracion
-- ============================================================
ALTER TABLE Configuracion ADD COLUMN ultimo_numero_orden INTEGER DEFAULT 0;


-- ============================================================
-- 13. LLENAR FECHAS EN FILAS EXISTENTES
-- (registros que quedaron con '' ahora reciben datetime)
-- ============================================================
UPDATE AdminUsers SET creado_en = datetime('now') WHERE creado_en = '' OR creado_en IS NULL;
UPDATE SesionesAdmin SET creado_en = datetime('now') WHERE creado_en = '' OR creado_en IS NULL;
UPDATE SeguimientoTrabajo SET fecha_registro = datetime('now') WHERE fecha_registro = '' OR fecha_registro IS NULL;
UPDATE ConfigKV SET actualizado_en = datetime('now') WHERE actualizado_en = '' OR actualizado_en IS NULL;
UPDATE ServiciosCatalogo SET fecha_registro = datetime('now') WHERE fecha_registro = '' OR fecha_registro IS NULL;
UPDATE CostosAdicionales SET fecha_registro = datetime('now') WHERE fecha_registro = '' OR fecha_registro IS NULL;
UPDATE ModelosVehiculo SET fecha_registro = datetime('now') WHERE fecha_registro = '' OR fecha_registro IS NULL;
UPDATE NotificacionesWhatsApp SET fecha_creacion = datetime('now') WHERE fecha_creacion = '' OR fecha_creacion IS NULL;


-- ============================================================
-- 14. INDICES (CREATE INDEX IF NOT EXISTS = seguro)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clientes_rut ON Clientes(rut);
CREATE INDEX IF NOT EXISTS idx_clientes_patente ON Clientes(patente);
CREATE INDEX IF NOT EXISTS idx_vehiculos_patente_placa ON Vehiculos(patente_placa);
CREATE INDEX IF NOT EXISTS idx_ot_token_gp2 ON OrdenesTrabajo(token);
CREATE INDEX IF NOT EXISTS idx_ot_numero_orden ON OrdenesTrabajo(numero_orden);
CREATE INDEX IF NOT EXISTS idx_ot_patente_placa ON OrdenesTrabajo(patente_placa);
CREATE INDEX IF NOT EXISTS idx_ot_estado_trabajo ON OrdenesTrabajo(estado_trabajo);
CREATE INDEX IF NOT EXISTS idx_ot_tecnico_asignado ON OrdenesTrabajo(tecnico_asignado_id);
CREATE INDEX IF NOT EXISTS idx_ot_fecha_ingreso ON OrdenesTrabajo(fecha_ingreso);
CREATE INDEX IF NOT EXISTS idx_ot_pagado ON OrdenesTrabajo(pagado);
CREATE INDEX IF NOT EXISTS idx_ot_completo ON OrdenesTrabajo(completo);
CREATE INDEX IF NOT EXISTS idx_costos_categoria ON CostosAdicionales(categoria);
CREATE INDEX IF NOT EXISTS idx_seguimiento_trabajo_orden ON SeguimientoTrabajo(orden_id);
CREATE INDEX IF NOT EXISTS idx_seguimiento_trabajo_tecnico ON SeguimientoTrabajo(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_telefono ON NotificacionesWhatsApp(telefono);
CREATE INDEX IF NOT EXISTS idx_whatsapp_enviada ON NotificacionesWhatsApp(enviada);
CREATE INDEX IF NOT EXISTS idx_sesiones_admin_token ON SesionesAdmin(token);
CREATE INDEX IF NOT EXISTS idx_sesiones_admin_admin ON SesionesAdmin(admin_id);


-- ============================================================
-- 15. DATOS INICIALES (INSERT OR IGNORE = no duplica)
-- ============================================================
INSERT OR IGNORE INTO AdminUsers (username, password_hash, nombre) VALUES
('admin', 'admin123_hashed_change_me', 'Administrador Globalprov2');

INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES
('ultimo_numero_orden', '0'),
('nombre_negocio', 'Globalprov2'),
('moneda', 'CLP'),
('tasa_impuesto', '19'),
('url_base', ''),
('whatsapp_api_url', ''),
('whatsapp_api_token', ''),
('whatsapp_numero_remitente', ''),
('google_maps_api_key', ''),
('umbral_bajo_combustible', '25'),
('radio_busqueda_km', '50'),
('cargo_domicilio_base', '0'),
('cargo_domicilio_por_km', '0');
