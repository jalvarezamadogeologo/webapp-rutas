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

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Separa lat y lon en listas CSV para el query de Open-Meteo. */
function aCoordenadas(puntos) {
  return {
    lat: puntos.map((p) => p.lat).join(','),
    lon: puntos.map((p) => p.lon).join(','),
  };
}

/** True si el error es transitorio y conviene reintentar (red o rate limit). */
function esReintentable(mensaje) {
  return (
    mensaje === 'sin conexion' ||
    mensaje.startsWith('la API respondio 429') ||
    /la API respondio 5\d\d/.test(mensaje)
  );
}

/** Consulta un lote de hasta 100 puntos y devuelve el array de elevaciones. */
async function consultarLote(lote) {
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
  return datos.elevation;
}

/**
 * Consulta elevacion SRTM para una lista de puntos.
 * Cada punto: {lat, lon, alt}. Devuelve puntos nuevos con .alt reemplazada
 * por la elevacion SRTM (o conservada si la API no responde para ese punto).
 * Trabaja sobre copias: si algo falla, los puntos de entrada quedan intactos
 * (no se guarda una ruta a medio corregir).
 * El rate limit gratuito de Open-Meteo es ~20 requests/min por IP: los lotes
 * se espacian (~4 s = 15/min, margen seguro) y ante 429 se espera 60 s (lo que
 * pide la API) antes de reintentar el lote.
 * opciones: {esperaEntreLotesMs, espera429Ms, esperaErrorMs, maxReintentos, onProgreso}
 * Lanza Error con mensaje diferenciado:
 *  - red caida / servidor inaccesible -> "sin conexion"
 *  - respuesta invalida de la API    -> "la API respondio ..."
 */
export async function corregirAlturas(puntos, opciones = {}) {
  if (puntos.length === 0) return [];
  const {
    esperaEntreLotesMs = 4000,
    espera429Ms = 60000,
    esperaErrorMs = 3000,
    maxReintentos = 4,
    onProgreso = null,
  } = opciones;

  const trabajo = puntos.map((p) => ({ ...p }));
  const lotes = dividirEnLotes(trabajo, TAMANO_LOTE);
  const resultados = [];
  for (const [i, lote] of lotes.entries()) {
    onProgreso?.(i + 1, lotes.length);
    let elevaciones = null;
    for (let intento = 1; intento <= maxReintentos && elevaciones === null; intento++) {
      try {
        elevaciones = await consultarLote(lote);
      } catch (e) {
        if (intento === maxReintentos || !esReintentable(e.message)) throw e;
        const espera = e.message.startsWith('la API respondio 429') ? espera429Ms : esperaErrorMs;
        await esperar(espera);
      }
    }
    lote.forEach((p, idx) => {
      const elev = elevaciones[idx];
      if (typeof elev === 'number' && Number.isFinite(elev)) {
        p.alt = Math.round(elev);
        p.altFuente = 'srtm';
      }
    });
    resultados.push(...lote);
    await esperar(esperaEntreLotesMs);
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