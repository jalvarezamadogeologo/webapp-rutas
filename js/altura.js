// altura.js - Correccion de altitud con SRTM via OpenTopoData.
// El GPS del movil da altitud ruidosa; al guardar se consulta OpenTopoData
// (SRTM 90 m, gratis, sin API key) por lotes de hasta 100 puntos y se
// reemplaza la altitud. Si no hay red, se conserva la del GPS.

import { dividirEnLotes, estadisticas } from './geo.js';

const ENDPOINT = 'https://api.opentopodata.org/v1/srtm90m';
const TAMANO_LOTE = 100;

/** Coordenadas para el endpoint: string "lat,lon" separado por pipes. */
function aCoordenadas(puntos) {
  return puntos.map((p) => `${p.lat},${p.lon}`).join('|');
}

/**
 * Consulta elevacion SRTM para una lista de puntos.
 * Cada punto: {lat, lon, alt}. Devuelve los puntos con .alt reemplazada
 * por la elevacion SRTM (o conservada si la API no responde para ese punto).
 * Lanza Error con mensaje diferenciado:
 *  - red caida / servidor inaccesible -> "sin conexion"
 *  - respuesta invalida de la API    -> "la API respondio ..."
 */
export async function corregirAlturas(puntos) {
  if (puntos.length === 0) return [];
  const resultados = [];
  for (const lote of dividirEnLotes(puntos, TAMANO_LOTE)) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: aCoordenadas(lote) }),
      });
    } catch {
      throw new Error('sin conexion');
    }
    if (!res.ok) {
      throw new Error(`la API respondio ${res.status}`);
    }
    const datos = await res.json();
    if (!datos.results || datos.results.length !== lote.length) {
      throw new Error('la API respondio con formato inesperado');
    }
    lote.forEach((p, i) => {
      const elev = datos.results[i].elevation;
      if (typeof elev === 'number' && Number.isFinite(elev)) {
        p.alt = Math.round(elev);
        p.altFuente = 'srtm';
      }
    });
    resultados.push(...lote);
  }
  return resultados;
}

/** Puntos en que OpenTopoData devolvio null (sin cobertura SRTM, ej. mar). */
export function sinCobertura(puntos) {
  return puntos.filter((p) => p.altFuente !== 'srtm');
}

/**
 * Construye la ruta actualizada tras una correccion SRTM exitosa: recalcula
 * estadisticas y marca altCorregida. Devuelve null si ningun punto quedo
 * corregido (sin cobertura SRTM en la zona).
 */
export function rutaCorregida(ruta, puntos) {
  if (puntos.length === 0 || sinCobertura(puntos).length === puntos.length) return null;
  return { ...ruta, puntos, stats: estadisticas(puntos), altCorregida: true };
}