// app.js - Orquestador de la interfaz: botones, grabacion, guardado, listado y detalle.

import * as mapa from './mapa.js';
import * as graba from './graba.js';
import * as almacen from './almacen.js';
import * as altura from './altura.js';
import * as perfil from './perfil.js';
import * as exp from './exportar.js';
import { abrirModal, cerrarModal, mostrarToast, renderLista, gridEstadisticas } from './ui.js';
import { escapeHtml, formatearFecha, formatearDistancia, formatearDuracion, formatearVelocidad } from './util.js';
import { estadisticas } from './geo.js';

// --- estado de la sesion de grabacion ---
let _rutaActual = { puntos: [], segmentos: [], puntosMarcados: [] };
let _polylineViva = null;
let _temporizadorVivo = null;
let _rutaGuardando = null; // ruta abierta en el modal de detalle

const $ = (id) => document.getElementById(id);

function init() {
  mapa.inicializarMapa('mapa');

  // Registrar service worker (PWA) solo en contexto seguro: https o localhost.
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Centrar en la posicion actual si el GPS responde.
  navigator.geolocation?.getCurrentPosition?.(
    (pos) => mapa.centrarEn(pos.coords.latitude, pos.coords.longitude, 16),
    () => {},
    { enableHighAccuracy: true, timeout: 8000 },
  );

  $('btnPlay').addEventListener('click', iniciarGrabacion);
  $('btnPause').addEventListener('click', alternarPausa);
  $('btnStop').addEventListener('click', detenerGrabacion);
  $('btnPunto').addEventListener('click', abrirModalPunto);
  $('btnLista').addEventListener('click', abrirLista);
  $('btnCapa').addEventListener('click', alternarCapa);

  // Trazo manual con clics como respaldo sin GPS.
  mapa.obtenerMapa().on('click', (ev) => {
    if (graba.estadoActual() !== graba.ESTADO.IDLE) {
      graba.agregarPuntoManual(ev.latlng.lat, ev.latlng.lng);
    }
  });

  $('btnConfirmarGuardar').addEventListener('click', confirmarGuardado);
  $('btnConfirmarPunto').addEventListener('click', confirmarPunto);
  $('btnExportarDetalleGPX').addEventListener('click', () => {
    if (_rutaGuardando) exportarGPX(_rutaGuardando.id);
  });
  $('btnExportarDetalleJSON').addEventListener('click', () => {
    if (_rutaGuardando) exportarJSON(_rutaGuardando.id);
  });

  // Cualquier elemento con data-cerrar cierra su modal/panel.
  document.addEventListener('click', (ev) => {
    const cerrar = ev.target.closest('[data-cerrar]');
    if (cerrar) cerrarModal(cerrar.dataset.cerrar);
  });

  actualizarControles();
}

// --- grabacion ---

function iniciarGrabacion() {
  if (graba.estadoActual() !== graba.ESTADO.IDLE) return;
  _rutaActual = { puntos: [], segmentos: [], puntosMarcados: [] };
  _polylineViva = L.polyline([], { color: '#d62828', weight: 4, opacity: 0.85 }).addTo(mapa.obtenerMapa());

  graba.iniciar({
    onPunto: (p) => {
      _rutaActual.puntos.push(p);
      _polylineViva.addLatLng([p.lat, p.lon]);
    },
    onEstado: actualizarControles,
    onError: (msg) => mostrarToast(msg, 'error'),
  });

  _temporizadorVivo = setInterval(actualizarInfoVivo, 1000);
  mostrarToast('Grabando...');
}

function alternarPausa() {
  const est = graba.estadoActual();
  if (est === graba.ESTADO.GRABANDO) {
    graba.pausar();
    mostrarToast('Grabacion en pausa');
  } else if (est === graba.ESTADO.PAUSADO) {
    graba.reanudar();
    mostrarToast('Grabacion reanudada');
  }
}

function alternarCapa() {
  const nueva = mapa.capaActual() === 'calle' ? 'satelite' : 'calle';
  mapa.cambiarCapaBase(nueva);
  $('btnCapa').textContent = nueva === 'satelite' ? 'Mapa' : 'Satelite';
}

function detenerGrabacion() {
  if (graba.estadoActual() === graba.ESTADO.IDLE) return;
  clearInterval(_temporizadorVivo);
  _temporizadorVivo = null;

  const res = graba.detener();
  _rutaActual.puntos = res.puntos;
  _rutaActual.segmentos = res.segmentos;

  if (_rutaActual.puntos.length === 0) {
    _polylineViva = null;
    actualizarControles();
    mostrarToast('No se registraron puntos', 'error');
    return;
  }

  abrirModalGuardar();
}

// --- modal guardar ---

function abrirModalGuardar() {
  const stats = estadisticas(_rutaActual.puntos);
  $('inputNombre').value = '';
  $('inputDescripcion').value = '';
  $('zonaGuardarStats').innerHTML = gridEstadisticas(stats);
  $('btnConfirmarGuardar').disabled = false;
  $('zonaGuardarEstado').textContent = '';
  abrirModal('modalGuardar');
  // perfil con datos preliminares (alt del GPS)
  requestAnimationFrame(() => perfil.dibujarPerfil($('canvasGuardar'), _rutaActual.puntos));
}

async function confirmarGuardado() {
  const nombre = $('inputNombre').value.trim();
  if (!nombre) {
    mostrarToast('Ingresa un nombre para la ruta', 'error');
    return;
  }
  const btn = $('btnConfirmarGuardar');
  btn.disabled = true;
  $('zonaGuardarEstado').textContent = 'Corrigiendo alturas con SRTM...';

  let puntos = _rutaActual.puntos;
  let altCorregida = false;
  try {
    puntos = await altura.corregirAlturas(puntos);
    altCorregida = true;
  } catch {
    altCorregida = false; // sin red: se conserva la altitud del GPS
  }

  const ruta = {
    id: almacen.nuevoId(),
    nombre,
    descripcion: $('inputDescripcion').value.trim(),
    fecha: new Date().toISOString(),
    puntos,
    segmentos: _rutaActual.segmentos,
    puntosMarcados: _rutaActual.puntosMarcados,
    stats: estadisticas(puntos),
    altCorregida,
  };

  await almacen.guardarRuta(ruta);
  _rutaActual = { puntos: [], segmentos: [], puntosMarcados: [] };
  _polylineViva = null;

  $('zonaGuardarEstado').textContent = altCorregida
    ? 'Alturas corregidas con SRTM y ruta guardada.'
    : 'Sin conexion: alturas del GPS. Podes re-exportar despues. Ruta guardada.';
  // redibujar perfil con alturas corregidas
  perfil.dibujarPerfil($('canvasGuardar'), puntos);

  setTimeout(() => {
    cerrarModal('modalGuardar');
    actualizarControles();
    mostrarToast(`Ruta "${nombre}" guardada`);
  }, 1200);
}

// --- puntos marcados ---

function abrirModalPunto() {
  if (graba.estadoActual() === graba.ESTADO.IDLE) {
    mostrarToast('Inicia una grabacion para agregar puntos', 'error');
    return;
  }
  $('inputPuntoNombre').value = '';
  $('inputPuntoDesc').value = '';
  abrirModal('modalPunto');
}

function confirmarPunto() {
  const nombre = $('inputPuntoNombre').value.trim();
  const desc = $('inputPuntoDesc').value.trim();
  if (!nombre && !desc) {
    mostrarToast('El punto necesita nombre o descripcion', 'error');
    return;
  }
  const w = graba.crearPuntoMarcado(nombre, desc);
  if (!w) {
    mostrarToast('Todavia no hay posicion GPS; intentalo de nuevo', 'error');
    return;
  }
  _rutaActual.puntosMarcados.push(w);
  mapa.crearMarcadorTemporal(w.lat, w.lon, `<b>${escapeHtml(nombre || 'Punto')}</b>`);
  cerrarModal('modalPunto');
  mostrarToast(`Punto "${nombre || 'marcado'}" agregado`);
}

// --- listado y detalle ---

async function abrirLista() {
  const rutas = await almacen.listarRutas();
  renderLista($('listaRutas'), rutas, {
    ver: verRuta,
    gpx: exportarGPX,
    json: exportarJSON,
    borrar: borrarRuta,
  });
  $('panelLista').classList.add('abierto');
}

async function verRuta(id) {
  const ruta = await almacen.obtenerRuta(id);
  if (!ruta) return;
  _rutaGuardando = ruta;
  cerrarModal('panelLista');
  mapa.dibujarRuta(ruta.puntos);
  mapa.dibujarPuntosMarcados(ruta.puntosMarcados);
  $('detalleTitulo').textContent = ruta.nombre;
  $('detalleFecha').textContent = formatearFecha(ruta.fecha);
  $('detalleStats').innerHTML = gridEstadisticas(ruta.stats, ruta.altCorregida);
  if (ruta.descripcion) {
    $('detalleDesc').textContent = ruta.descripcion;
    $('detalleDesc').style.display = 'block';
  } else {
    $('detalleDesc').style.display = 'none';
  }
  abrirModal('modalDetalle');
  requestAnimationFrame(() => perfil.dibujarPerfil($('canvasDetalle'), ruta.puntos));
}

async function exportarGPX(id) {
  const ruta = await almacen.obtenerRuta(id);
  if (!ruta) return;
  exp.descargar(`${exp.nombreArchivo(ruta.nombre)}.gpx`, exp.aGPX(ruta), 'application/gpx+xml');
  mostrarToast('GPX exportado');
}

async function exportarJSON(id) {
  const ruta = await almacen.obtenerRuta(id);
  if (!ruta) return;
  exp.descargar(`${exp.nombreArchivo(ruta.nombre)}.json`, exp.aJSON(ruta), 'application/json');
  mostrarToast('JSON exportado');
}

async function borrarRuta(id) {
  const ruta = await almacen.obtenerRuta(id);
  if (!ruta) return;
  if (!confirm(`¿Eliminar la ruta "${ruta.nombre}"? Esta accion no se puede deshacer.`)) return;
  await almacen.eliminarRuta(id);
  abrirLista();
  mostrarToast('Ruta eliminada');
}

// --- UI de controles ---

function actualizarControles() {
  const est = graba.estadoActual();
  $('btnPlay').disabled = est !== graba.ESTADO.IDLE;
  $('btnStop').disabled = est === graba.ESTADO.IDLE;
  $('btnPunto').disabled = est === graba.ESTADO.IDLE;

  const lblPause = $('btnPause');
  lblPause.disabled = est === graba.ESTADO.IDLE;
  lblPause.textContent = est === graba.ESTADO.PAUSADO ? 'Reanudar' : 'Pausa';

  const badge = $('estadoGrabacion');
  if (est === graba.ESTADO.GRABANDO) {
    badge.textContent = '● GRABANDO';
    badge.className = 'estado estado-activo';
  } else if (est === graba.ESTADO.PAUSADO) {
    badge.textContent = 'Ⅱ PAUSADO';
    badge.className = 'estado estado-pausa';
  } else {
    badge.textContent = '';
    badge.className = 'estado';
  }
}

function actualizarInfoVivo() {
  const puntos = _rutaActual.puntos;
  const stats = estadisticas(puntos);
  $('infoEnVivo').textContent =
    `${formatearDistancia(stats.distancia)} · ${formatearDuracion(stats.duracionSeg)} · ${formatearVelocidad(stats.velMedia)}`;
}

// Exportamos verRuta para acceso desde el listado (ya asignado por referencia).
init();