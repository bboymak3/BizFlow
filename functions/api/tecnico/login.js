// ============================================
// API: LOGIN DE TÉCNICOS
// Global Pro Automotriz
// Detecta automáticamente si la columna es 'pin' o 'codigo_acceso'
// ============================================

async function obtenerColumnaAcceso(env) {
  try {
    const tableInfo = await env.DB.prepare("PRAGMA table_info(Tecnicos)").all();
    const columnas = (tableInfo.results || []).map(col => col.name);

    if (columnas.includes('pin')) return 'pin';
    if (columnas.includes('codigo_acceso')) return 'codigo_acceso';
    return null;
  } catch (e) {
    console.log('Error obteniendo columna de acceso:', e.message);
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.telefono || !data.pin) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: teléfono y PIN'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Detectar columna de acceso (pin o codigo_acceso)
    const accessColumn = await obtenerColumnaAcceso(env);

    if (!accessColumn) {
      // Intentar crear la columna pin si no existe ninguna
      try {
        await env.DB.prepare("ALTER TABLE Tecnicos ADD COLUMN pin TEXT").run();
        const check = await env.DB.prepare("PRAGMA table_info(Tecnicos)").all();
        const cols = (check.results || []).map(c => c.name);
        if (cols.includes('pin')) {
          return await doLogin(env, 'pin', data.telefono, data.pin);
        }
      } catch (e) {
        // Columna ya existe o error
      }
      return new Response(JSON.stringify({
        success: false,
        error: 'Error de configuración: tabla Tecnicos no tiene columna de acceso'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      });
    }

    return await doLogin(env, accessColumn, data.telefono, data.pin);

  } catch (error) {
    console.error('Error en login de técnico:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

async function doLogin(env, accessColumn, telefono, pin) {
  // Debug: log qué columna usa y qué valores busca
  console.log(`Login intent: telefono="${telefono}", pin="${pin}", accessColumn="${accessColumn}"`);

  // Primero buscar solo por teléfono para ver si el técnico existe
  const tecnicoByPhone = await env.DB.prepare(
    `SELECT id, nombre, telefono, email, pin, codigo_acceso, activo FROM Tecnicos WHERE telefono = ?`
  ).bind(telefono).first();
  console.log(`Tecnico by phone:`, tecnicoByPhone ? { id: tecnicoByPhone.id, nombre: tecnicoByPhone.nombre, pin: tecnicoByPhone.pin, codigo_acceso: tecnicoByPhone.codigo_acceso, activo: tecnicoByPhone.activo } : 'NOT FOUND');

  if (!tecnicoByPhone) {
    return new Response(JSON.stringify({
      success: false,
      error: `No se encontró técnico con teléfono "${telefono}". Verifique que el técnico esté registrado.`
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401
    });
  }

  // Verificar PIN con la columna correcta
  const storedPin = tecnicoByPhone[accessColumn] || '';
  if (storedPin !== pin) {
    return new Response(JSON.stringify({
      success: false,
      error: `PIN incorrecto. Columna usada: ${accessColumn}, PIN guardado: "${storedPin}" vs ingresado: "${pin}"`
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401
    });
  }

  // Verificar activo
  if (tecnicoByPhone.activo !== 1 && tecnicoByPhone.activo !== true) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Técnico inactivo. Contacte al administrador.'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401
    });
  }

  return new Response(JSON.stringify({
    success: true,
    tecnico: { id: tecnicoByPhone.id, nombre: tecnicoByPhone.nombre, telefono: tecnicoByPhone.telefono, email: tecnicoByPhone.email }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
