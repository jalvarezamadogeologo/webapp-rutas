// app.js - Orquestador de la interfaz: botones, grabacion, guardado, listado y detalle.

import * as mapa from './mapa.js';
import * as graba from './graba.js';
import * as almacen from './almacen.js';
import * as altura from './altura.js';
import * as perfil from './perfil.js';
import * as replay from './replay.js';
import * as exp from './exportar.js';
import { abrirModal, cerrarModal, mostrarToast, renderLista, gridEstadisticas } from './ui.js';
import { escapeHtml, formatearFecha, formatearDistancia, formatearDuracion, formatearVelocidad } from './util.js';
import { estadisticas } from './geo.js';

// --- estado de la sesion de grabacion ---
let _rutaActual = { puntos: [], segmentos: [], puntosMarcados: [] };
let _polylineViva = null;
let _temporizadorVivo = null;
let _rutaGuardando = null; // ruta abierta en el modal de detalle
let _ultimaUbicacion = null; // ultima posicion conocida (indicador en el mapa)
let _mapaCentrado = false; // el mapa ya se centro en la primera fijacion
let _sesionPendiente = null; // sesion en curso recuperada al abrir la app
let _ultimoGuardadoSesion = 0; // debounce de guardado periodico de la sesion

// La sesion en curso se persiste en IndexedDB cada INTERVALO_SESION_MS como
// respaldo ante la muerte de la app (pantalla apagada): al reabrir se ofrece
// continuar o descartar, y no se pierde el track.
const INTERVALO_SESION_MS = 10000;

const $ = (id) => document.getElementById(id);

function init() {
  mapa.inicializarMapa('mapa');

  // Registrar service worker (PWA) solo en contexto seguro: https o localhost.
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Indicador de ubicacion actual (punto solido + circulo de error) con
  // watchPosition continuo; centra el mapa la primera vez que el GPS responde.
  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        _ultimaUbicacion = { lat: latitude, lon: longitude };
        mapa.mostrarUbicacion(latitude, longitude, accuracy);
        if (!_mapaCentrado) {
          _mapaCentrado = true;
          mapa.centrarEn(latitude, longitude, 16);
        }
      },
      () => {
        // Sin permiso o sin senal: no reintentar el centrado automatico.
        _mapaCentrado = true;
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }

  $('btnPlay').addEventListener('click', iniciarGrabacion);
  $('btnPause').addEventListener('click', alternarPausa);
  $('btnStop').addEventListener('click', detenerGrabacion);
  $('btnPunto').addEventListener('click', abrirModalPunto);
  $('btnLista').addEventListener('click', abrirLista);
  $('btnCapa').addEventListener('click', alternarCapa);
  $('btnUbicacion').addEventListener('click', irAUbicacion);

  // Trazo manual con clics como respaldo sin GPS.
  mapa.obtenerMapa().on('click', (ev) => {
    if (graba.estadoActual() !== graba.ESTADO.IDLE) {
      graba.agregarPuntoManual(ev.latlng.lat, ev.latlng.lng);
    }
  });

  $('btnConfirmarGuardar').addEventListener('click', confirmarGuardado);
  $('btnConfirmarPunto').addEventListener('click', confirmarPunto);
  $('btnSesionContinuar').addEventListener('click', continuarSesion);
  $('btnSesionDescartar').addEventListener('click', descartarSesion);
  $('btnExportarDetalleGPX').addEventListener('click', () => {
    if (_rutaGuardando) exportarGPX(_rutaGuardando.id);
  });
  $('btnExportarDetalleJSON').addEventListener('click', () => {
    if (_rutaGuardando) exportarJSON(_rutaGuardando.id);
  });
  $('btnCorregirAlturas').addEventListener('click', corregirAlturasGuardada);
  $('btnReplayPlay').addEventListener('click', () => {
    replay.alternar();
    actualizarReplayUI();
  });
  $('btnReplayVel').addEventListener('click', () => {
    replay.cambiarVelocidad();
    actualizarReplayUI();
  });
  $('btnReplayReiniciar').addEventListener('click', () => {
    replay.reiniciar();
    actualizarReplayUI();
  });

  // Cualquier elemento con data-cerrar cierra su modal/panel.
  document.addEventListener('click', (ev) => {
    const cerrar = ev.target.closest('[data-cerrar]');
    if (cerrar) {
      if (cerrar.dataset.cerrar === 'modalDetalle') replay.detener();
      cerrarModal(cerrar.dataset.cerrar);
    }
  });

  // Al volver a primer plano se refresca el aviso de pantalla (graba.js
  // re-solicita el wakeLock y avisa via onWakeLock).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') actualizarAvisoPantalla();
  });

  actualizarControles();
  recuperarSesion();
}

// --- sesion en curso (continuar o descartar) ---

/** Al abrir la app, si hay una grabacion interrumpida se ofrece retomarla. */
async function recuperarSesion() {
  const sesion = await almacen.obtenerSesion();
  if (!sesion || !sesion.puntos || sesion.puntos.length === 0) return;
  const haceSeg = Math.max(0, Math.round((Date.now() - (sesion.guardadoEn || Date.now())) / 1000));
  $('sesionInfo').textContent =
    `${sesion.puntos.length} puntos registrados · ultima actividad hace ${formatearDuracion(haceSeg)}`;
  _sesionPendiente = sesion;
  abrirModal('modalSesion');
}

/** Retoma la grabacion interrumpida: restaura track, mapa y sigue grabando. */
function continuarSesion() {
  const sesion = _sesionPendiente;
  _sesionPendiente = null;
  cerrarModal('modalSesion');
  if (!sesion) return;

  _rutaActual = {
    puntos: sesion.puntos,
    segmentos: sesion.segmentos && sesion.segmentos.length ? sesion.segmentos : [0],
    puntosMarcados: sesion.puntosMarcados || [],
  };
  _polylineViva = L.polyline(
    _rutaActual.puntos.map((p) => [p.lat, p.lon]),
    { color: '#d62828', weight: 4, opacity: 0.85 },
  ).addTo(mapa.obtenerMapa());

  const ult = _rutaActual.puntos[_rutaActual.puntos.length - 1];
  if (ult) mapa.centrarEn(ult.lat, ult.lon, 16);

  graba.iniciar(opcionesGrabacion(), {
    puntos: _rutaActual.puntos,
    segmentos: _rutaActual.segmentos,
  });
  _temporizadorVivo = setInterval(actualizarInfoVivo, 1000);
  guardarSesion(true);
  mostrarToast('Grabacion restaurada');
}

/** Descarta la grabacion interrumpida. */
async function descartarSesion() {
  _sesionPendiente = null;
  cerrarModal('modalSesion');
  await almacen.eliminarSesion();
  mostrarToast('Grabacion descartada');
}

/** Guarda la sesion en curso en IndexedDB (con debounce, o forzado). */
function guardarSesion(fuerza = false) {
  if (_rutaActual.puntos.length === 0) return;
  const ahora = Date.now();
  if (!fuerza && ahora - _ultimoGuardadoSesion < INTERVALO_SESION_MS) return;
  _ultimoGuardadoSesion = ahora;
  almacen
    .guardarSesion({
      puntos: _rutaActual.puntos,
      segmentos: _rutaActual.segmentos,
      puntosMarcados: _rutaActual.puntosMarcados,
    })
    .catch(() => {}); // si IndexedDB falla, se sigue grabando igual
}

/** Callbacks comunes de grabacion (en vivo y al retomar una sesion). */
function opcionesGrabacion() {
  return {
    onPunto: (p) => {
      _rutaActual.puntos.push(p);
      _polylineViva.addLatLng([p.lat, p.lon]);
      guardarSesion();
    },
    onEstado: actualizarControles,
    onError: (msg) => mostrarToast(msg, 'error'),
    onWakeLock: () => actualizarAvisoPantalla(),
  };
}

/**
 * Muestra el aviso "manten la pantalla encendida" solo si se esta grabando
 * y el wakeLock no esta activo (navegador sin soporte o denegado).
 */
function actualizarAvisoPantalla() {
  const aviso = $('avisoWakelock');
  if (!aviso) return;
  const grabando = graba.estadoActual() === graba.ESTADO.GRABANDO;
  aviso.hidden = !(grabando && !graba.wakeLockActivo());
}

// --- grabacion ---

function iniciarGrabacion() {
  if (graba.estadoActual() !== graba.ESTADO.IDLE) return;
  _rutaActual = { puntos: [], segmentos: [], puntosMarcados: [] };
  _polylineViva = L.polyline([], { color: '#d62828', weight: 4, opacity: 0.85 }).addTo(mapa.obtenerMapa());

  graba.iniciar(opcionesGrabacion());

  _temporizadorVivo = setInterval(actualizarInfoVivo, 1000);
  mostrarToast('Grabando...');
}

function alternarPausa() {
  const est = graba.estadoActual();
  if (est === graba.ESTADO.GRABANDO) {
    graba.pausar();
    guardarSesion(true); // persistir la pausa
    mostrarToast('Grabacion en pausa');
  } else if (est === graba.ESTADO.PAUSADO) {
    graba.reanudar();
    guardarSesion(true);
    mostrarToast('Grabacion reanudada');
  }
}

function alternarCapa() {
  const nueva = mapa.capaActual() === 'calle' ? 'satelite' : 'calle';
  mapa.cambiarCapaBase(nueva);
  $('btnCapa').textContent = nueva === 'satelite' ? 'Mapa' : 'Satelite';
}

/** Centra el mapa en la ultima posicion conocida del GPS. */
function irAUbicacion() {
  if (!_ultimaUbicacion) {
    mostrarToast('Esperando posicion GPS...', 'error');
    return;
  }
  mapa.centrarEn(_ultimaUbicacion.lat, _ultimaUbicacion.lon, 16);
}

function detenerGrabacion() {
  if (graba.estadoActual() === graba.ESTADO.IDLE) return;
  clearInterval(_temporizadorVivo);
  _temporizadorVivo = null;

  const res = graba.detener();
  _rutaActual.puntos = res.puntos;
  _rutaActual.segmentos = res.segmentos;
  // Se persiste la sesion antes de mostrar el modal: si el usuario cierra el
  // modal sin guardar, el track queda recuperable al reabrir la app.
  guardarSesion(true);

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
  let errorAltura = null;
  const zonaEstado = $('zonaGuardarEstado');
  zonaEstado.textContent = 'Corrigiendo alturas con SRTM...';
  try {
    puntos = await altura.corregirAlturas(puntos, {
      onProgreso: (lote, total) => {
        zonaEstado.textContent = `Corrigiendo alturas SRTM (lote ${lote} de ${total})...`;
      },
    });
    altCorregida = true;
  } catch (e) {
    altCorregida = false; // sin red o error de la API: se conserva la altitud del GPS
    errorAltura = e.message;
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
  await almacen.eliminarSesion(); // la grabacion ya quedo guardada como ruta
  _ultimoGuardadoSesion = 0;
  _rutaActual = { puntos: [], segmentos: [], puntosMarcados: [] };
  _polylineViva = null;

  $('zonaGuardarEstado').textContent = altCorregida
    ? 'Alturas corregidas con SRTM y ruta guardada.'
    : `Alturas del GPS (${errorAltura || 'sin conexion'}). Podes re-exportar despues. Ruta guardada.`;
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
  guardarSesion(true);
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
  replay.detener();
  _rutaGuardando = ruta;
  cerrarModal('panelLista');
  mapa.dibujarRuta(ruta.puntos);
  mapa.dibujarPuntosMarcados(ruta.puntosMarcados);
  $('detalleTitulo').textContent = ruta.nombre;
  $('detalleFecha').textContent = formatearFecha(ruta.fecha);
  $('detalleStats').innerHTML = gridEstadisticas(ruta.stats, ruta.altCorregida);
  const avisoAltura = $('detalleAlturaEstado');
  const btnCorregir = $('btnCorregirAlturas');
  if (ruta.altCorregida === false) {
    avisoAltura.textContent = 'Alturas del GPS (sin corregir SRTM).';
    avisoAltura.className = 'detalle-altura aviso';
  } else {
    avisoAltura.textContent = 'Alturas corregidas con SRTM. Podes re-corregir si lo deseas.';
    avisoAltura.className = 'detalle-altura';
  }
  // El boton queda siempre disponible: re-corregir es idempotente y sirve
  // tambien para rutas que quedaron a medio corregir en versiones viejas.
  btnCorregir.style.display = '';
  btnCorregir.disabled = false;
  if (ruta.descripcion) {
    $('detalleDesc').textContent = ruta.descripcion;
    $('detalleDesc').style.display = 'block';
  } else {
    $('detalleDesc').style.display = 'none';
  }
  abrirModal('modalDetalle');
  requestAnimationFrame(() => perfil.dibujarPerfil($('canvasDetalle'), ruta.puntos));

  // Replay animado: disponible si la ruta tiene rango temporal valido.
  const duracion = replay.preparar(ruta.puntos, ruta.puntosMarcados, actualizarReplayUI);
  $('replayControles').style.display = duracion === null ? 'none' : '';
  actualizarReplayUI();
}

/** Actualiza la barra de control del replay (play/pausa, velocidad, estado). */
function actualizarReplayUI() {
  if (!replay.preparado()) return;
  const est = replay.estadoActual();
  $('btnReplayPlay').textContent = est.termino ? 'Reproducir' : est.jugando ? 'Pausa' : 'Reproducir';
  $('btnReplayVel').textContent = `${est.velocidad}x`;
  const resta = Math.max(0, (est.tMax - est.tActual) / 1000);
  $('replayEstado').textContent = est.termino
    ? 'Fin del recorrido'
    : `${formatearDuracion(resta)} restantes`;
}

/** Re-corrige alturas SRTM de una ruta guardada (modal de detalle). */
async function corregirAlturasGuardada() {
  const ruta = _rutaGuardando;
  if (!ruta) return;
  const btn = $('btnCorregirAlturas');
  const avisoAltura = $('detalleAlturaEstado');
  btn.disabled = true;
  avisoAltura.textContent = 'Corrigiendo alturas con SRTM...';
  avisoAltura.className = 'detalle-altura aviso';

  let puntos;
  try {
    puntos = await altura.corregirAlturas(ruta.puntos, {
      onProgreso: (lote, total) => {
        avisoAltura.textContent = `Corrigiendo alturas SRTM (lote ${lote} de ${total})...`;
      },
    });
  } catch (e) {
    avisoAltura.textContent = `No se pudo corregir (${e.message}). Intentalo de nuevo.`;
    btn.disabled = false;
    mostrarToast('Fallo la correccion de alturas', 'error');
    return;
  }

  const actualizada = altura.rutaCorregida(ruta, puntos);
  if (!actualizada) {
    avisoAltura.textContent = 'La API de elevacion no tiene cobertura SRTM en esta zona.';
    btn.disabled = false;
    mostrarToast('Sin cobertura SRTM en la zona', 'error');
    return;
  }

  await almacen.guardarRuta(actualizada);
  _rutaGuardando = actualizada;

  $('detalleStats').innerHTML = gridEstadisticas(actualizada.stats, true);
  requestAnimationFrame(() => perfil.dibujarPerfil($('canvasDetalle'), actualizada.puntos));
  avisoAltura.textContent = 'Alturas corregidas con SRTM.';
  avisoAltura.className = 'detalle-altura';
  btn.style.display = 'none';
  mostrarToast('Alturas corregidas con SRTM');
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