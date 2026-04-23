// ============================================================
// BizFlow - Distance Calculation Utilities
// Haversine distance + OSRM routing + geocoding
// ============================================================

/**
 * Calculate the haversine distance between two points in kilometers
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;

  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100; // 2 decimal places
}

/**
 * Convert degrees to radians
 */
function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate route distance via OSRM API (real road distance)
 * @param {number} lat1 - Origin latitude
 * @param {number} lon1 - Origin longitude
 * @param {number} lat2 - Destination latitude
 * @param {number} lon2 - Destination longitude
 * @returns {Promise<{distance_km: number, duration_min: number|null, error: string|null}>}
 */
export async function calcularDistanciaOSRM(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return { distance_km: 0, duration_min: null, error: 'Coordenadas inválidas' };
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000), // 8s timeout
    });

    if (!response.ok) {
      return { distance_km: haversineDistance(lat1, lon1, lat2, lon2), duration_min: null, error: 'OSRM no disponible' };
    }

    const data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distance_km: Math.round((route.distance / 1000) * 100) / 100,
        duration_min: Math.round(route.duration / 60),
        error: null,
      };
    }

    // Fallback to haversine if no route found
    return {
      distance_km: haversineDistance(lat1, lon1, lat2, lon2),
      duration_min: null,
      error: 'No se encontró ruta',
    };
  } catch (error) {
    console.error('OSRM API error:', error);
    // Fallback to haversine
    return {
      distance_km: haversineDistance(lat1, lon1, lat2, lon2),
      duration_min: null,
      error: error.message || 'Error conectando a OSRM',
    };
  }
}

/**
 * Calculate delivery charge based on distance and business config
 * @param {number} distanciaKm - Distance in kilometers
 * @param {object} config - Business configuration
 * @param {number} config.radio_gratis_km - Free radius in km (default 5)
 * @param {number} config.tarifa_por_km - Rate per km (default 500)
 * @param {number} config.cargo_minimo - Minimum charge (default 0)
 * @returns {number} Delivery charge in CLP
 */
export function calcularCargoDomicilio(distanciaKm, config = {}) {
  if (!distanciaKm || distanciaKm <= 0) return 0;

  const radioGratis = parseFloat(config.radio_gratis_km) || 5;
  const tarifaPorKm = parseFloat(config.tarifa_por_km) || 500;
  const cargoMinimo = parseFloat(config.cargo_minimo) || 0;

  // Within free radius: no charge
  if (distanciaKm <= radioGratis) {
    return 0;
  }

  // Calculate charge for km beyond free radius
  const kmCobrables = distanciaKm - radioGratis;
  let cargo = Math.round(kmCobrables * tarifaPorKm);

  // Apply minimum charge
  if (cargo < cargoMinimo) {
    cargo = Math.round(cargoMinimo);
  }

  return cargo;
}

/**
 * Basic geocoding using Nominatim (OpenStreetMap)
 * @param {string} direccion - Street address in Chile
 * @returns {Promise<{lat: number|null, lon: number|null, display_name: string|null, error: string|null}>}
 */
export async function geocodificarDireccion(direccion) {
  if (!direccion || direccion.trim().length < 3) {
    return { lat: null, lon: null, display_name: null, error: 'Dirección vacía o muy corta' };
  }

  try {
    // Append Chile country hint for better results
    const query = `${direccion}, Chile`;
    const encodedQuery = encodeURIComponent(query);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&countrycodes=cl`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BizFlow-CRM/1.0',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { lat: null, lon: null, display_name: null, error: 'Error en servicio de geocodificación' };
    }

    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        display_name: result.display_name,
        error: null,
      };
    }

    return { lat: null, lon: null, display_name: null, error: 'No se encontró la dirección' };
  } catch (error) {
    console.error('Geocoding error:', error);
    return { lat: null, lon: null, display_name: null, error: error.message || 'Error de conexión' };
  }
}
