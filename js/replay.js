// replay.js - Reproduccion animada de rutas sobre el mapa.
// Avanza por los timestamps de los puntos (t en ms) y dibuja el track
// progresivamente con un marcador de posicion; los waypoints aparecen cuando
// el tiempo de reproduccion llega a su timestamp. Velocidades 1x/2x/4x.

import { obtenerMapa } from './mapa.js';

const VELOCIDADES = [1, 2, 4];

let _seq = []; // puntos con t valido, ordenados
let _marcados = [];
let _tMin = 0;
let _tMax = 0;
let _tActual = 0;
let _velocidad = 1;
let _jugando = false;
let _termino = false;
let _preparado = false;
let _rafId = null;
let _ultimoFrame = 0;
let _polyline = null;
let _marcador = null;
let _capaMarcados = null;
let _onEstado = null;

/**
 * Posicion interpolada para el tiempo t sobre una secuencia de puntos
 * {lat, lon, t} (logica pura, testeable en Node). Devuelve {i, pos} con pos
 * [lat, lon]; i es el indice del punto anterior o igual. null si seq vacia.
 */
export function posicionEn(seq, t) {
  if (seq.length === 0) return null;
  if (t <= seq[0].t) return { i: 0, pos: [seq[0].lat, seq[0].lon] };
  const ultimo = seq[seq.length - 1];
  if (t >= ultimo.t) return { i: seq.length - 1, pos: [ultimo.lat, ultimo.lon] };
  let i = 0;
  while (i < seq.length - 1 && seq[i + 1].t < t) i++;
  const a = seq[i];
  const b = seq[i + 1];
  const f = (t - a.t) / (b.t - a.t);
  return { i, pos: [a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f] };
}

/** Prepara el replay con la ruta. Devuelve la duracion en segundos, o null si no hay rango temporal. */
export function preparar(puntos, puntosMarcados, onEstado) {
  detener();
  _onEstado = onEstado;
  _marcados = puntosMarcados || [];
  _seq = (puntos || []).filter(
    (p) => typeof p.t === 'number' && Number.isFinite(p.t),
  );
  if (_seq.length < 2) {
    _preparado = false;
    return null;
  }
  _tMin = _seq[0].t;
  _tMax = _seq[_seq.length - 1].t;
  if (_tMax <= _tMin) {
    _preparado = false;
    return null;
  }
  _preparado = true;
  _tActual = _tMin;
  _velocidad = 1;
  _termino = false;
  crearCapas();
  dibujarFrame();
  emitir();
  return (_tMax - _tMin) / 1000;
}

export function preparado() {
  return _preparado;
}

export function reproducir() {
  if (!_preparado || _jugando) return;
  if (_termino) {
    _tActual = _tMin;
    _termino = false;
  }
  _jugando = true;
  _ultimoFrame = performance.now();
  _rafId = requestAnimationFrame(loop);
  emitir();
}

export function pausar() {
  if (!_jugando) return;
  _jugando = false;
  if (_rafId) cancelAnimationFrame(_rafId);
  _rafId = null;
  emitir();
}

export function alternar() {
  _jugando ? pausar() : reproducir();
}

export function reiniciar() {
  if (!_preparado) return;
  _tActual = _tMin;
  _termino = false;
  _jugando = false;
  if (_rafId) cancelAnimationFrame(_rafId);
  _rafId = null;
  dibujarFrame();
  emitir();
}

export function cambiarVelocidad() {
  const idx = VELOCIDADES.indexOf(_velocidad);
  _velocidad = VELOCIDADES[(idx + 1) % VELOCIDADES.length];
  emitir();
  return _velocidad;
}

export function velocidadActual() {
  return _velocidad;
}

export function estadoActual() {
  return {
    preparado: _preparado,
    jugando: _jugando,
    velocidad: _velocidad,
    tActual: _tActual,
    tMax: _tMax,
    termino: _termino,
  };
}

export function detener() {
  if (_rafId) cancelAnimationFrame(_rafId);
  _rafId = null;
  _jugando = false;
  limpiarReplay();
  _seq = [];
  _marcados = [];
  _preparado = false;
  _onEstado = null;
}

function loop(ahora) {
  const dt = (ahora - _ultimoFrame) / 1000; // segundos reales
  _ultimoFrame = ahora;
  _tActual += dt * 1000 * _velocidad; // ms virtuales de grabacion
  if (_tActual >= _tMax) {
    _tActual = _tMax;
    _termino = true;
    _jugando = false;
    _rafId = null;
    dibujarFrame();
    emitir();
    return;
  }
  dibujarFrame();
  emitir();
  _rafId = requestAnimationFrame(loop);
}

function dibujarFrame() {
  if (!_polyline) return;
  const { i, pos } = posicionEn(_seq, _tActual);
  const latlngs = _seq.slice(0, i + 1).map((p) => [p.lat, p.lon]);
  latlngs.push(pos);
  _polyline.setLatLngs(latlngs);
  _marcador.setLatLng(pos);

  // waypoints alcanzados
  _capaMarcados.clearLayers();
  for (const w of _marcados) {
    if (typeof w.t === 'number' && w.t <= _tActual) {
      L.marker([w.lat, w.lon]).addTo(_capaMarcados);
    }
  }
}

function crearCapas() {
  const mapa = obtenerMapa();
  _polyline = L.polyline([], { color: '#d62828', weight: 4, opacity: 0.85 }).addTo(mapa);
  _marcador = L.circleMarker([_seq[0].lat, _seq[0].lon], {
    radius: 7,
    color: '#ffffff',
    weight: 2,
    fillColor: '#d62828',
    fillOpacity: 1,
  }).addTo(mapa);
  _capaMarcados = L.layerGroup().addTo(mapa);
}

function limpiarReplay() {
  const mapa = obtenerMapa();
  if (_polyline) {
    mapa.removeLayer(_polyline);
    _polyline = null;
  }
  if (_marcador) {
    mapa.removeLayer(_marcador);
    _marcador = null;
  }
  if (_capaMarcados) {
    mapa.removeLayer(_capaMarcados);
    _capaMarcados = null;
  }
}

function emitir() {
  _onEstado?.(estadoActual());
}