// ============================================================
// BizFlow - Cálculo de Distancia y Geolocalización
// Geolocation API + OSRM Routing + Haversine
// ============================================================

// Fórmula de Haversine para distancia entre dos puntos GPS
// Retorna distancia en kilómetros
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

// Calcular distancia y tiempo estimado usando OSRM (routing)
// @param {number} lat1 - Latitud origen
// @param {number} lon1 - Longitud origen
// @param {number} lat2 - Latitud destino
// @param {number} lon2 - Longitud destino
// @returns {object} - { distanciaKm, tiempoMinutos, ruta }
export async function calcularRutaOSRM(lat1, lon1, lat2, lon2) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distanciaKm: Math.round(route.distance / 100) / 10,
        tiempoMinutos: Math.round(route.duration / 60),
        ruta: route.geometry
      };
    }
  } catch (error) {
    console.error('Error OSRM:', error);
  }

  // Fallback a Haversine si OSRM falla
  return {
    distanciaKm: Math.round(haversine(lat1, lon1, lat2, lon2) * 10) / 10,
    tiempoMinutos: Math.round(haversine(lat1, lon1, lat2, lon2) * 1.5), // ~40km/h promedio
    ruta: null
  };
}

// Calcular distancia a cada técnico desde una ubicación
// @param {Array} tecnicos - [{ id, nombre, latitud, longitud }]
// @param {number} lat - Latitud destino
// @param {number} lon - Longitud destino
// @returns {Array} - Tecnicos ordenados por distancia
export async function ordenarTecnicosPorDistancia(tecnicos, lat, lon) {
  const resultados = [];

  for (const tecnico of tecnicos) {
    if (tecnico.latitud && tecnico.longitud) {
      const distancia = haversine(lat, lon, tecnico.latitud, tecnico.longitud);
      resultados.push({
        ...tecnico,
        distanciaKm: Math.round(distancia * 10) / 10,
        distanciaTexto: distancia < 1
          ? `${Math.round(distancia * 1000)}m`
          : `${Math.round(distancia * 10) / 10}km`
      });
    } else {
      resultados.push({
        ...tecnico,
        distanciaKm: null,
        distanciaTexto: 'Sin ubicación'
      });
    }
  }

  return resultados.sort((a, b) => {
    if (a.distanciaKm === null) return 1;
    if (b.distanciaKm === null) return -1;
    return a.distanciaKm - b.distanciaKm;
  });
}

// Formatear distancia para mostrar
export function formatearDistancia(km) {
  if (km === null || km === undefined) return 'N/A';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

// Formatear duración para mostrar
export function formatearDuracion(minutos) {
  if (minutos === null || minutos === undefined) return 'N/A';
  if (minutos < 60) return `${Math.round(minutos)}min`;
  const horas = Math.floor(minutos / 60);
  const mins = Math.round(minutos % 60);
  return `${horas}h ${mins}min`;
}
