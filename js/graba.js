// graba.js - Control de grabacion de rutas.
// Estados: idle -> grabando <-> pausado -> (stop) idle.
// Usa navigator.geolocation.watchPosition con alta precision; acumula puntos
// {lat, lon, alt, t, acc} filtrando por precision y distancia minima.
// Soporta trazado manual con clics como respaldo si el GPS no esta disponible.
// Mantiene la pantalla despierta (wakeLock) mientras graba, cuando el navegador lo permite.

import { haversine } from './geo.js';

const UMBRAL_PRECISION_M = 50;
const DISTANCIA_MIN_M = 5;
const ERRORES = {
  1: 'Permiso de ubicacion denegado. Podes trazar la ruta con clics sobre el mapa.',
  2: 'Posicion no disponible. Verifica la senal GPS.',
  3: 'Tiempo de espera agotado al obtener la posicion.',
};

export const ESTADO = Object.freeze({ IDLE: 'idle', GRABANDO: 'grabando', PAUSADO: 'pausado' });

let _estado = ESTADO.IDLE;
let _puntos = [];
let _segmentos = []; // indices donde empieza cada segmento tras una pausa
let _ultimaPos = null; // ultima posicion conocida, aunque este pausado
let _watchId = null;
let _wakelock = null;
let _opciones = null;

export function estadoActual() {
  return _estado;
}

export function puntosActuales() {
  return _puntos.slice();
}

export function ultimaPosicion() {
  return _ultimaPos ? { ..._ultimaPos } : null;
}

/** Comienza la grabacion. opciones: {onPunto, onEstado, onError} */
export function iniciar(opciones) {
  if (_estado === ESTADO.GRABANDO) return;
  _opciones = opciones;
  _estado = ESTADO.GRABANDO;
  if (_puntos.length === 0) _segmentos = [0];
  _opciones.onEstado?.(_estado);
  solicitarWakeLock();
  _watchId = navigator.geolocation.watchPosition(
    onPosicion,
    onErrorGeo,
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
  );
}

export function pausar() {
  if (_estado !== ESTADO.GRABANDO) return;
  _estado = ESTADO.PAUSADO;
  _opciones?.onEstado?.(_estado);
}

export function reanudar() {
  if (_estado !== ESTADO.PAUSADO) return;
  _estado = ESTADO.GRABANDO;
  _segmentos.push(_puntos.length);
  _opciones?.onEstado?.(_estado);
}

/** Detiene la grabacion y devuelve {puntos, segmentos}. No resetea el estado visual. */
export function detener() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  liberarWakeLock();
  const resultado = { puntos: _puntos.slice(), segmentos: _segmentos.slice() };
  _puntos = [];
  _segmentos = [];
  _ultimaPos = null;
  _estado = ESTADO.IDLE;
  _opciones?.onEstado?.(_estado);
  return resultado;
}

/** Agrega un punto manualmente (trazo con clics en el mapa). */
export function agregarPuntoManual(lat, lon) {
  if (_estado === ESTADO.IDLE) return;
  const p = { lat, lon, alt: null, t: Date.now(), acc: 0, manual: true };
  _puntos.push(p);
  _ultimaPos = { lat, lon };
  _opciones?.onPunto?.(p);
}

/** Crea un waypoint (punto marcado) en la ultima posicion conocida. */
export function crearPuntoMarcado(nombre, descripcion) {
  const pos = _ultimaPos;
  if (!pos) return null;
  return {
    lat: pos.lat,
    lon: pos.lon,
    nombre,
    descripcion: descripcion || '',
    t: Date.now(),
  };
}

function onPosicion(pos) {
  const { latitude, longitude, accuracy, altitude, timestamp } = pos.coords;
  if (_estado !== ESTADO.GRABANDO) {
    // Aunque este pausado, mantenemos la ultima posicion conocida.
    if (accuracy <= UMBRAL_PRECISION_M) {
      _ultimaPos = { lat: latitude, lon: longitude };
    }
    return;
  }
  if (accuracy > UMBRAL_PRECISION_M) return; // fijacion pobre, se descarta

  const ultimo = _puntos[_puntos.length - 1];
  if (ultimo && haversine(ultimo.lat, ultimo.lon, latitude, longitude) < DISTANCIA_MIN_M) {
    _ultimaPos = { lat: latitude, lon: longitude };
    return; // muy cerca del punto anterior
  }

  const p = {
    lat: latitude,
    lon: longitude,
    alt: typeof altitude === 'number' && Number.isFinite(altitude) ? Math.round(altitude) : null,
    t: timestamp,
    acc: accuracy,
  };
  _puntos.push(p);
  _ultimaPos = { lat: latitude, lon: longitude };
  _opciones?.onPunto?.(p);
}

function onErrorGeo(err) {
  const msg = ERRORES[err.code] || `Error de geolocalizacion (${err.code})`;
  _opciones?.onError?.(msg, err.code);
}

async function solicitarWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      _wakelock = await navigator.wakeLock.request('screen');
    }
  } catch {
    _wakelock = null; // no soportado o denegado: se sigue grabando igual
  }
}

function liberarWakeLock() {
  if (_wakelock) {
    _wakelock.release().catch(() => {});
    _wakelock = null;
  }
}