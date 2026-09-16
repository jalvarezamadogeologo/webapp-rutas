// ui.js - Helpers de interfaz: modales, toast y construccion de tarjetas del listado.

import { escapeHtml, formatearFecha, formatearDistancia, formatearDuracion, formatearVelocidad } from './util.js';

export function abrirModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('abierto');
}

export function cerrarModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('abierto');
}

let _toastTimer = null;
export function mostrarToast(msg, tipo = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${tipo}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.className = 'toast';
  }, 3000);
}

/** Renderiza la lista de rutas guardadas dentro del contenedor. */
export function renderLista(contenedor, rutas, acciones) {
  contenedor.innerHTML = '';
  if (rutas.length === 0) {
    contenedor.innerHTML =
      '<p class="lista-vacia">Todavia no hay rutas guardadas.<br>Grabá una con Play.</p>';
    return;
  }
  for (const r of rutas) {
    const stats = r.stats || {};
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta';
    tarjeta.innerHTML = `
      <div class="tarjeta-cab">
        <h3>${escapeHtml(r.nombre)}</h3>
        <span class="tarjeta-fecha">${escapeHtml(formatearFecha(r.fecha))}</span>
      </div>
      <div class="tarjeta-datos">
        <span>${escapeHtml(formatearDistancia(stats.distancia))}</span>
        <span>${(stats.subida ?? 0).toFixed(0)} m ↑</span>
        <span>${(stats.bajada ?? 0).toFixed(0)} m ↓</span>
        <span>alt ${stats.altMin ?? '—'}-${stats.altMax ?? '—'} m</span>
        ${r.altCorregida === false ? '<span class="badge-aviso">alt sin corregir</span>' : ''}
      </div>
      <div class="tarjeta-acciones">
        <button data-accion="ver" data-id="${r.id}">Ver</button>
        <button data-accion="gpx" data-id="${r.id}">GPX</button>
        <button data-accion="json" data-id="${r.id}">JSON</button>
        <button data-accion="borrar" data-id="${r.id}" class="btn-peligro">Borrar</button>
      </div>`;
    tarjeta.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-accion]');
      if (!btn) return;
      acciones[btn.dataset.accion]?.(btn.dataset.id);
    });
    contenedor.appendChild(tarjeta);
  }
}

/** Devuelve el HTML de una grilla de estadisticas (reutilizable). */
export function gridEstadisticas(stats, altCorregida) {
  const s = stats || {};
  const aviso = altCorregida === false ? '<p class="aviso">Alturas sin corregir (SRTM no disponible).</p>' : '';
  return `
    <div class="grid-stats">
      <div><span class="stat">${escapeHtml(formatearDistancia(s.distancia))}</span><label>distancia</label></div>
      <div><span class="stat">${escapeHtml(formatearDuracion(s.duracionSeg))}</span><label>duracion</label></div>
      <div><span class="stat">${(s.subida ?? 0).toFixed(0)} m</span><label>subida ↑</label></div>
      <div><span class="stat">${(s.bajada ?? 0).toFixed(0)} m</span><label>bajada ↓</label></div>
      <div><span class="stat">${s.altMin ?? '—'}</span><label>alt min</label></div>
      <div><span class="stat">${s.altMax ?? '—'}</span><label>alt max</label></div>
      <div><span class="stat">${escapeHtml(formatearVelocidad(s.velMedia))}</span><label>vel media</label></div>
      <div><span class="stat">${s.nPuntos ?? 0}</span><label>puntos</label></div>
    </div>
    ${aviso}`;
}