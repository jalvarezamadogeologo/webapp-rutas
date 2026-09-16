// geo.js - Logica pura de geolocalizacion: distancias, filtros, desniveles y estadisticas.
// Sin dependencias del DOM ni del navegador: importable en Node para tests y en el browser.

export const RADIO_TIERRA_M = 6_371_000;

export function aRad(grados) {
  return (grados * Math.PI) / 180;
}

/** Distancia haversine entre dos puntos en metros. */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = aRad(lat2 - lat1);
  const dLon = aRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(a));
}

/**
 * Distancia total recorrida en metros.
 * Un punto es {lat, lon}. Se ignoran puntos sin coordenadas validas.
 */
export function distanciaTotal(puntos) {
  let total = 0;
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    if (esCoordenadaValida(a) && esCoordenadaValida(b)) {
      total += haversine(a.lat, a.lon, b.lat, b.lon);
    }
  }
  return total;
}

/** True si el punto tiene lat/lon numericos validos. */
export function esCoordenadaValida(p) {
  return (
    p &&
    typeof p.lat === 'number' && Number.isFinite(p.lat) &&
    typeof p.lon === 'number' && Number.isFinite(p.lon)
  );
}

/**
 * Filtra puntos cuya precision (accuracy en metros) supera el umbral.
 * Los puntos sin campo acc se conservan (origen manual, sin dato de precision).
 */
export function filtrarPrecision(puntos, umbral = 50) {
  return puntos.filter((p) => p.acc === undefined || p.acc <= umbral);
}

/**
 * Desnivel acumulado: subida y bajada totales en metros.
 * Solo cuenta diferencias entre puntos consecutivos con altitud numerica.
 */
export function desnivelAcumulado(puntos) {
  let subida = 0;
  let bajada = 0;
  let prev = null;
  for (const p of puntos) {
    const alt = p.alt;
    if (typeof alt === 'number' && Number.isFinite(alt)) {
      if (prev !== null) {
        const d = alt - prev;
        if (d > 0) subida += d;
        else bajada += -d;
      }
      prev = alt;
    }
  }
  return { subida, bajada };
}

/**
 * Estadisticas de una ruta a partir de sus puntos.
 * Punto: {lat, lon, alt, t (ms epoch), acc}. Devuelve objeto plano.
 */
export function estadisticas(puntos) {
  const nPuntos = puntos.length;
  const distancia = distanciaTotal(puntos);

  let tMin = null;
  let tMax = null;
  let altMin = null;
  let altMax = null;
  for (const p of puntos) {
    if (typeof p.t === 'number' && Number.isFinite(p.t)) {
      if (tMin === null || p.t < tMin) tMin = p.t;
      if (tMax === null || p.t > tMax) tMax = p.t;
    }
    if (typeof p.alt === 'number' && Number.isFinite(p.alt)) {
      if (altMin === null || p.alt < altMin) altMin = p.alt;
      if (altMax === null || p.alt > altMax) altMax = p.alt;
    }
  }

  const duracionSeg = tMin === null ? 0 : (tMax - tMin) / 1000;
  const velMedia = duracionSeg > 0 ? distancia / duracionSeg : 0;
  const { subida, bajada } = desnivelAcumulado(puntos);

  return {
    nPuntos,
    distancia,
    duracionSeg,
    velMedia,
    altMin,
    altMax,
    subida,
    bajada,
  };
}

/** Divide una lista en lotes de tamano fijo. Util para batchs de elevacion. */
export function dividirEnLotes(lista, tamano) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamano) {
    lotes.push(lista.slice(i, i + tamano));
  }
  return lotes;
}