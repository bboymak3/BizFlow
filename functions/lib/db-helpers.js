// ============================================================
// BizFlow - DB Helpers
// Funciones compartidas para interactuar con D1
// ============================================================

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export async function getUserIdFromRequest(request, DB) {
  // Extraer usuario_id del header Authorization o query param
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const email = auth.replace('Bearer ', '');
    const user = await DB.prepare('SELECT id FROM Usuarios WHERE email = ? AND activo = 1').bind(email).first();
    if (user) return user.id;
  }
  // Fallback: query param user_id
  const url = new URL(request.url);
  const userId = url.searchParams.get('usuario_id');
  if (userId) return parseInt(userId);
  return null;
}

export async function getProximoNumero(DB, usuarioId) {
  const result = await DB.prepare(
    'SELECT COALESCE(MAX(numero), 0) + 1 as proximo FROM OrdenesTrabajo WHERE usuario_id = ?'
  ).bind(usuarioId).first();
  return result.proximo;
}

export function validarEstadoOT(nuevoEstado) {
  const estadosValidos = [
    'pendiente', 'asignada', 'en_proceso', 'pausada',
    'completada', 'cancelada', 'aprobada', 'cerrada'
  ];
  return estadosValidos.includes(nuevoEstado);
}

export function generarToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function formatearFecha(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-VE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

export function hoyISO() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

// Handle CORS preflight
export function handleCors(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
  return null;
}

// Paginación helper
export function paginar(query, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  return {
    sql: `${query} LIMIT ? OFFSET ?`,
    params: [limit, offset],
    page,
    limit,
    offset
  };
}
