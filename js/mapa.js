// mapa.js - Capa de mapa con Leaflet (cargado como global "L" via <script>).
// Responsabilidades: crear el mapa, dibujar/limpiar rutas y waypoints,
// ajustar la vista a un recorrido y crear marcadores temporales.

import { escapeHtml } from './util.js';

export const CENTRO_DEFAULT = [-33.45, -70.66]; // Santiago
export const ZOOM_DEFAULT = 13;

// Capas base disponibles: calle (OSM) y satelite (Esri World Imagery).
const CAPAS_BASE = {
  calle: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  satelite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
};

let _map = null;
let _capaRuta = null; // grupo donde van tracks y waypoints de la ruta activa
let _capaUbicacion = null; // grupo del indicador de ubicacion actual
let _circuloPos = null; // punto solido de la posicion
let _circuloError = null; // circulo de precision (transparente)
let _tileLayer = null;
let _capaActual = 'calle';

/** Crea el mapa en el contenedor dado. Devuelve la instancia Leaflet. */
export function inicializarMapa(contenedorId, centro = CENTRO_DEFAULT, zoom = ZOOM_DEFAULT) {
  _map = L.map(contenedorId, { zoomControl: true }).setView(centro, zoom);
  _tileLayer = L.tileLayer(CAPAS_BASE.calle.url, {
    maxZoom: CAPAS_BASE.calle.maxZoom,
    attribution: CAPAS_BASE.calle.attribution,
  }).addTo(_map);
  _capaRuta = L.layerGroup().addTo(_map);
  _capaUbicacion = L.layerGroup().addTo(_map);
  return _map;
}

/** Cambia la capa base ("calle" o "satelite"). Devuelve el nombre activo. */
export function cambiarCapaBase(nombre) {
  const capa = CAPAS_BASE[nombre];
  if (!capa || nombre === _capaActual) return _capaActual;
  if (_tileLayer) _map.removeLayer(_tileLayer);
  _tileLayer = L.tileLayer(capa.url, {
    maxZoom: capa.maxZoom,
    attribution: capa.attribution,
  }).addTo(_map);
  _capaActual = nombre;
  return _capaActual;
}

export function capaActual() {
  return _capaActual;
}

export function obtenerMapa() {
  return _map;
}

/** Limpia tracks y waypoints de la ruta activa (deja los tiles). */
export function limpiarCapas() {
  if (_capaRuta) _capaRuta.clearLayers();
}

/** Dibuja el track de la ruta y ajusta la vista a su extensión. */
export function dibujarRuta(puntos, color = '#d62828') {
  limpiarCapas();
  if (!puntos || puntos.length === 0) return;
  const latlngs = puntos.map((p) => [p.lat, p.lon]);
  L.polyline(latlngs, { color, weight: 4, opacity: 0.85 }).addTo(_capaRuta);
  _map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
}

/** Dibuja waypoints (puntos marcados) con popup de nombre y descripcion. */
export function dibujarPuntosMarcados(puntosMarcados) {
  if (!puntosMarcados) return;
  for (const w of puntosMarcados) {
    const mk = L.marker([w.lat, w.lon]).addTo(_capaRuta);
    if (w.nombre || w.descripcion) {
      const titulo = w.nombre ? `<b>${escapeHtml(w.nombre)}</b>` : '<b>Punto</b>';
      const desc = w.descripcion ? `<br>${escapeHtml(w.descripcion)}` : '';
      mk.bindPopup(`${titulo}${desc}`);
    }
  }
}

/** Crea un marcador temporal (para "agregar punto" en vivo) sin dibujarlo en capa de ruta. */
export function crearMarcadorTemporal(lat, lon, contenido) {
  const mk = L.marker([lat, lon]).addTo(_map);
  if (contenido) mk.bindPopup(contenido);
  return mk;
}

/** Centra el mapa en una posicion. */
export function centrarEn(lat, lon, zoom = 17) {
  _map.setView([lat, lon], zoom);
}

/** Dibuja/actualiza el indicador de ubicacion actual: punto solido + circulo de error (precision). */
export function mostrarUbicacion(lat, lon, accuracy) {
  if (!_map) return;
  const radio = Math.max(accuracy || 0, 10); // minimo visible
  if (!_circuloError) {
    _circuloError = L.circle([lat, lon], {
      radius: radio,
      color: 'rgba(26, 115, 232, 0.35)',
      weight: 1,
      fillColor: 'rgba(26, 115, 232, 0.15)',
      fillOpacity: 1,
      interactive: false, // no interferir con el trazo por clics
    }).addTo(_capaUbicacion);
  } else {
    _circuloError.setLatLng([lat, lon]).setRadius(radio);
  }
  if (!_circuloPos) {
    _circuloPos = L.circleMarker([lat, lon], {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: '#1a73e8',
      fillOpacity: 1,
      interactive: false,
    }).addTo(_capaUbicacion);
  } else {
    _circuloPos.setLatLng([lat, lon]);
  }
}