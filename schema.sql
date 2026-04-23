-- ============================================
-- BIZFLOW - Schema completo de base de datos
-- Cloudflare D1 (SQLite)
-- ============================================

-- Configuracion global del sistema
CREATE TABLE IF NOT EXISTS Configuracion (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ultimo_numero_orden INTEGER DEFAULT 0,
  whatsapp_ultramsg_instance TEXT,
  whatsapp_ultramsg_token TEXT,
  domicilio_habilitado INTEGER DEFAULT 0,
  domicilio_taller_lat REAL DEFAULT 0,
  domicilio_taller_lng REAL DEFAULT 0,
  domicilio_radio_gratis_km REAL DEFAULT 5,
  domicilio_tarifa_por_km REAL DEFAULT 500,
  domicilio_cargo_minimo REAL DEFAULT 1000,
  domicilio_cobertura_maxima_km REAL DEFAULT 50,
  domicilio_modo_cobro TEXT DEFAULT 'no_cobrar',
  negocio_nombre TEXT DEFAULT 'Mi Negocio',
  negocio_direccion TEXT DEFAULT '',
  negocio_telefono TEXT DEFAULT '',
  negocio_email TEXT DEFAULT '',
  negocio_logo TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert config por defecto
INSERT OR IGNORE INTO Configuracion (id) VALUES (1);

-- Clientes
CREATE TABLE IF NOT EXISTS Clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  rut TEXT,
  telefono TEXT NOT NULL,
  email TEXT,
  direccion TEXT,
  negocio_id TEXT DEFAULT 'default',
  fecha_registro TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON Clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_negocio ON Clientes(negocio_id);

-- Vehiculos
CREATE TABLE IF NOT EXISTS Vehiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER,
  patente_placa TEXT NOT NULL UNIQUE,
  marca TEXT,
  modelo TEXT,
  anio INTEGER,
  cilindrada TEXT,
  combustible TEXT,
  kilometraje INTEGER,
  negocio_id TEXT DEFAULT 'default',
  fecha_registro TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vehiculos_patente ON Vehiculos(patente_placa);
CREATE INDEX IF NOT EXISTS idx_vehiculos_negocio ON Vehiculos(negocio_id);

-- Tecnicos / Operarios
CREATE TABLE IF NOT EXISTS Tecnicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL UNIQUE,
  email TEXT,
  pin TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  comision_porcentaje REAL NOT NULL DEFAULT 40,
  especialidad TEXT,
  negocio_id TEXT DEFAULT 'default',
  fecha_registro TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tecnicos_negocio ON Tecnicos(negocio_id);

-- Ordenes de Trabajo (core)
CREATE TABLE IF NOT EXISTS OrdenesTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_orden INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  cliente_id INTEGER,
  vehiculo_id INTEGER,
  tecnico_asignado_id INTEGER,
  patente_placa TEXT,
  fecha_ingreso TEXT,
  hora_ingreso TEXT,
  recepcionista TEXT,
  marca TEXT,
  modelo TEXT,
  anio INTEGER,
  cilindrada TEXT,
  combustible TEXT,
  kilometraje TEXT,
  direccion TEXT,
  referencia_direccion TEXT,
  trabajo_frenos INTEGER DEFAULT 0,
  detalle_frenos TEXT,
  trabajo_luces INTEGER DEFAULT 0,
  detalle_luces TEXT,
  trabajo_tren_delantero INTEGER DEFAULT 0,
  detalle_tren_delantero TEXT,
  trabajo_correas INTEGER DEFAULT 0,
  detalle_correas TEXT,
  trabajo_componentes INTEGER DEFAULT 0,
  detalle_componentes TEXT,
  nivel_combustible TEXT,
  check_paragolfe_delantero_der INTEGER DEFAULT 0,
  check_puerta_delantera_der INTEGER DEFAULT 0,
  check_puerta_trasera_der INTEGER DEFAULT 0,
  check_paragolfe_trasero_izq INTEGER DEFAULT 0,
  check_otros_carroceria TEXT,
  monto_total REAL DEFAULT 0,
  monto_abono REAL DEFAULT 0,
  monto_restante REAL DEFAULT 0,
  metodo_pago TEXT,
  diagnostico_checks TEXT,
  diagnostico_observaciones TEXT,
  servicios_seleccionados TEXT,
  estado TEXT DEFAULT 'Enviada',
  estado_trabajo TEXT,
  firma_imagen TEXT,
  fecha_aprobacion TEXT,
  fecha_creacion TEXT DEFAULT (datetime('now')),
  fecha_completado TEXT,
  distancia_km REAL DEFAULT 0,
  cargo_domicilio REAL DEFAULT 0,
  domicilio_modo_cobro TEXT DEFAULT 'no_cobrar',
  es_express INTEGER DEFAULT 0,
  notas TEXT,
  prioridad TEXT DEFAULT 'normal',
  negocio_id TEXT DEFAULT 'default',
  FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE SET NULL,
  FOREIGN KEY (vehiculo_id) REFERENCES Vehiculos(id) ON DELETE SET NULL,
  FOREIGN KEY (tecnico_asignado_id) REFERENCES Tecnicos(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ot_estado ON OrdenesTrabajo(estado);
CREATE INDEX IF NOT EXISTS idx_ot_estado_trabajo ON OrdenesTrabajo(estado_trabajo);
CREATE INDEX IF NOT EXISTS idx_ot_patente ON OrdenesTrabajo(patente_placa);
CREATE INDEX IF NOT EXISTS idx_ot_tecnico ON OrdenesTrabajo(tecnico_asignado_id);
CREATE INDEX IF NOT EXISTS idx_ot_fecha ON OrdenesTrabajo(fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_ot_negocio ON OrdenesTrabajo(negocio_id);

-- Costos adicionales por orden
CREATE TABLE IF NOT EXISTS CostosAdicionales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  concepto TEXT NOT NULL,
  monto REAL NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Mano de Obra',
  fecha_registro TEXT DEFAULT (datetime('now')),
  registrado_por TEXT,
  negocio_id TEXT DEFAULT 'default',
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_costos_orden ON CostosAdicionales(orden_id);

-- Gastos del negocio
CREATE TABLE IF NOT EXISTS GastosNegocio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concepto TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Otros',
  monto REAL NOT NULL,
  fecha_gasto TEXT NOT NULL,
  observaciones TEXT,
  registrado_por TEXT,
  negocio_id TEXT DEFAULT 'default',
  fecha_registro TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON GastosNegocio(categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON GastosNegocio(fecha_gasto);

-- Catalogo de servicios
CREATE TABLE IF NOT EXISTS ServiciosCatalogo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  precio_sugerido REAL NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL DEFAULT 'Mantenimiento',
  tipo_comision TEXT NOT NULL DEFAULT 'mano_obra',
  activo INTEGER DEFAULT 1,
  negocio_id TEXT DEFAULT 'default',
  fecha_registro TEXT DEFAULT (datetime('now'))
);

-- Modelos de vehiculos
CREATE TABLE IF NOT EXISTS ModelosVehiculo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  negocio_id TEXT DEFAULT 'default',
  fecha_registro TEXT DEFAULT (datetime('now'))
);

-- Notificaciones WhatsApp
CREATE TABLE IF NOT EXISTS NotificacionesWhatsApp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  telefono TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  tipo_evento TEXT NOT NULL,
  enviada INTEGER DEFAULT 0,
  negocio_id TEXT DEFAULT 'default',
  fecha_creacion TEXT DEFAULT (datetime('now'))
);

-- Fotos de trabajo
CREATE TABLE IF NOT EXISTS FotosTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  tecnico_id INTEGER,
  foto_base64 TEXT NOT NULL,
  tipo TEXT DEFAULT 'antes',
  fecha_subida TEXT DEFAULT (datetime('now')),
  negocio_id TEXT DEFAULT 'default',
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- Notas de trabajo
CREATE TABLE IF NOT EXISTS NotasTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  tecnico_id INTEGER,
  nota TEXT NOT NULL,
  fecha_nota TEXT DEFAULT (datetime('now')),
  negocio_id TEXT DEFAULT 'default',
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- Seguimiento de OT (historial de estados)
CREATE TABLE IF NOT EXISTS SeguimientoOT (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  tecnico_id INTEGER,
  estado_anterior TEXT,
  estado_nuevo TEXT,
  latitud REAL,
  longitud REAL,
  observaciones TEXT,
  fecha_evento TEXT DEFAULT (datetime('now')),
  negocio_id TEXT DEFAULT 'default',
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- Pagos
CREATE TABLE IF NOT EXISTS Pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  monto REAL NOT NULL,
  metodo_pago TEXT NOT NULL,
  observaciones TEXT,
  fecha_pago TEXT DEFAULT (datetime('now')),
  negocio_id TEXT DEFAULT 'default',
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- ============================================
-- SaaS CRM / Landing Pages
-- ============================================

-- Usuarios del sistema SaaS (admin de cada negocio)
CREATE TABLE IF NOT EXISTS Usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT,
  rol TEXT DEFAULT 'admin',
  negocio_id TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  fecha_registro TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON Usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_negocio ON Usuarios(negocio_id);

-- Landing Pages creadas por usuarios
CREATE TABLE IF NOT EXISTS LandingPages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  negocio_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  contenido TEXT,
  secciones TEXT,
  colores TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  meta_title TEXT,
  meta_description TEXT,
  publicado INTEGER DEFAULT 0,
  visitas INTEGER DEFAULT 0,
  fecha_creacion TEXT DEFAULT (datetime('now')),
  fecha_actualizacion TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_landing_slug ON LandingPages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_negocio ON LandingPages(negocio_id);

-- ============================================
-- DATOS SEMILLA
-- ============================================

-- Servicios pre-cargados
INSERT OR IGNORE INTO ServiciosCatalogo (nombre, precio_sugerido, categoria, tipo_comision) VALUES
('Frenos - Pastillas y Discos', 45000, 'Reparacion', 'mano_obra'),
('Luces - Cambio de focos/bombillas', 8000, 'Mantenimiento', 'mano_obra'),
('Tren Delantero - Suspension y Direccion', 55000, 'Reparacion', 'mano_obra'),
('Correas - Distribucion y Accesorios', 65000, 'Reparacion', 'mano_obra'),
('Componentes - Revision general', 15000, 'Diagnostico', 'mano_obra'),
('Motor - Diagnostico computarizado', 20000, 'Diagnostico', 'mano_obra'),
('Motor - Reparacion general', 80000, 'Reparacion', 'mano_obra'),
('Culatas - Rectificacion', 120000, 'Reparacion', 'mano_obra'),
('Embrague - Kit completo', 90000, 'Reparacion', 'mano_obra'),
('Aire Acondicionado - Recarga y Reparacion', 35000, 'Reparacion', 'mano_obra'),
('Scanner - Diagnostico electronico', 15000, 'Diagnostico', 'mano_obra'),
('Suspension - Amortiguadores', 50000, 'Reparacion', 'mano_obra'),
('Direccion - Cajas y cremalleras', 70000, 'Reparacion', 'mano_obra'),
('Electricidad - Alternador y Motor de arranque', 45000, 'Reparacion', 'mano_obra'),
('Transmision - Caja de cambios', 100000, 'Reparacion', 'mano_obra'),
('Escape - Mofle y catalitico', 40000, 'Reparacion', 'mano_obra'),
('Refrigeracion - Radiador y ventilador', 35000, 'Reparacion', 'mano_obra'),
('Turbo - Revision y reparacion', 80000, 'Reparacion', 'repuestos'),
('Inyeccion - Limpieza de inyectores', 25000, 'Mantenimiento', 'mano_obra'),
('Timing - Cambio de kit', 60000, 'Reparacion', 'mano_obra'),
('Diferencial - Servicio', 50000, 'Reparacion', 'mano_obra'),
('Alternador - Reconstruccion', 40000, 'Reparacion', 'repuestos'),
('Motor de Arranque - Reconstruccion', 35000, 'Reparacion', 'repuestos'),
('Alineacion y Balanceo', 20000, 'Mantenimiento', 'mano_obra'),
('Revision General Preventiva', 25000, 'Mantenimiento', 'mano_obra'),
('Cambio de Aceite y Filtros', 18000, 'Mantenimiento', 'mano_obra');

-- Modelos de vehiculos pre-cargados
INSERT OR IGNORE INTO ModelosVehiculo (nombre) VALUES
('Toyota'),('Nissan'),('Honda'),('Hyundai'),('Kia'),('Chevrolet'),('Ford'),
('Mazda'),('Volkswagen'),('BMW'),('Mercedes-Benz'),('Peugeot'),('Renault'),
('Fiat'),('Suzuki'),('Mitsubishi'),('Subaru'),('Audi'),('Jeep'),('Dodge'),
('Chery'),('Great Wall'),('Lifan'),('Jac'),('Zhongxing'),('Haval');
