# BizFlow - SaaS CRM & Gestión de Órdenes de Trabajo

Plataforma completa SaaS para gestión de negocios con CRM, órdenes de trabajo, gestión de técnicos/operarios, notificaciones WhatsApp, firma digital y más.

## Despliegue en Cloudflare

### 1. Crear base de datos D1
```bash
npx wrangler d1 create bizflow_db
```
Actualizar el `database_id` en `wrangler.toml`

### 2. Migrar base de datos
```bash
npx wrangler d1 execute bizflow_db --remote --file=./schema.sql
```

### 3. Desplegar
```bash
npx wrangler pages deploy .
```

## Estructura del Proyecto

```
├── index.html                    ← Panel Admin ERP
├── app.js                        ← Lógica del panel admin
├── tecnico/                      ← PWA del Técnico/Operario
│   ├── app.html
│   ├── app.js
│   ├── manifest.json
│   └── sw.js
├── functions/                    ← Cloudflare Pages Functions (API)
│   ├── api/admin/                ← APIs del panel (24 endpoints)
│   ├── api/tecnico/              ← APIs del técnico (12 endpoints)
│   ├── api/                      ← APIs públicas (5 endpoints)
│   ├── aprobar/                  ← Página de aprobación del cliente
│   ├── aprobar-tecnico/          ← Firma del cliente (vía técnico)
│   ├── ver-ot/                   ← Visor público + PDF
│   └── lib/                      ← Utilidades compartidas
├── schema.sql                    ← Schema de base de datos
├── wrangler.toml                 ← Config Cloudflare
└── package.json
```

## Módulos

### Panel Admin
- Dashboard con KPIs financieros
- Crear/Editar/Eliminar órdenes de trabajo
- OT Express (emergencia sin aprobación)
- Gestión de técnicos con comisiones
- Asignación de órdenes a técnicos
- Catálogo de 25+ servicios
- Costos adicionales por orden
- Gastos del negocio (7 categorías)
- Liquidación de comisiones
- Notificaciones WhatsApp (UltraMsg)
- Generación de PDF profesional
- Exportar datos
- Configuración del sistema
- **Constructor de Landing Pages (SaaS)**

### App del Técnico (PWA)
- Login con teléfono + PIN
- 3 pestañas: Pendientes / En Curso / Completadas
- Navegación GPS
- Captura de GPS al llegar al sitio
- Cálculo automático de domicilio
- Subir fotos de trabajo
- Agregar notas
- Historial de seguimiento
- Solicitar firma del cliente
- Cerrar órdenes

### Páginas del Cliente
- Aprobación de orden con firma digital
- Firma de cierre (vía técnico)
- Visor público de OT + PDF

## Tecnologías

- **Cloudflare Pages** (hosting + functions)
- **Cloudflare D1** (SQLite serverless)
- **Bootstrap 5 + Tailwind CSS** (UI)
- **jsPDF** (generación de PDF)
- **UltraMsg** (WhatsApp API)
- **Service Worker** (PWA offline)
- **Geolocation API** (GPS)

## Licencia
MIT
