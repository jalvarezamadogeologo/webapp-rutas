// altura.js - Correccion de altitud con SRTM via Open-Meteo.
// El GPS del movil da altitud ruidosa; al guardar se consulta Open-Meteo
// (elevacion con datos SRTM, gratis, sin API key y con CORS habilitado para
// navegadores) por lotes de hasta 100 puntos y se reemplaza la altitud.
// Si no hay red, se conserva la del GPS.
// Nota (2026-09-16): se migro desde OpenTopoData porque su preflight CORS dejo
// de incluir Access-Control-Allow-Origin y los navegadores bloquean la llamada.

import { dividirEnLotes, estadisticas } from './geo.js';

const ENDPOINT = 'https://api.open-meteo.com/v1/elevation';
const TAMANO_LOTE = 100;

/** Separa lat y lon en listas CSV para el query de Open-Meteo. */
function aCoordenadas(puntos) {
  return {
    lat: puntos.map((p) => p.lat).join(','),
    lon: puntos.map((p) => p.lon).join(','),
  };
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
    const { lat, lon } = aCoordenadas(lote);
    let res;
    try {
      res = await fetch(`${ENDPOINT}?latitude=${lat}&longitude=${lon}`);
    } catch {
      throw new Error('sin conexion');
    }
    if (!res.ok) {
      throw new Error(`la API respondio ${res.status}`);
    }
    const datos = await res.json();
    if (!Array.isArray(datos.elevation) || datos.elevation.length !== lote.length) {
      throw new Error('la API respondio con formato inesperado');
    }
    lote.forEach((p, i) => {
      const elev = datos.elevation[i];
      if (typeof elev === 'number' && Number.isFinite(elev)) {
        p.alt = Math.round(elev);
        p.altFuente = 'srtm';
      }
    });
    resultados.push(...lote);
  }
  return resultados;
}

/** Puntos en que la API devolvio null (sin cobertura SRTM, ej. mar). */
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