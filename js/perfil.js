// perfil.js - Grafico de perfil de elevacion en canvas (distancia vs altitud).
// Recibe la lista de puntos {lat, lon, alt, t, ...} y dibuja el perfil en el
// canvas indicado, escalando distancia acumulada (X) y altitud (Y).

import { distanciaTotal } from './geo.js';
import { formatearDistancia } from './util.js';

/**
 * Dibuja el perfil en el canvas. Devuelve false si no hay datos suficientes.
 */
export function dibujarPerfil(canvas, puntos) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const conAlt = puntos.filter((p) => typeof p.alt === 'number' && Number.isFinite(p.alt));
  if (conAlt.length < 2) {
    dibujarVacio(ctx, W, H, 'Sin datos de altitud para dibujar el perfil');
    return false;
  }

  // distancia acumulada hasta cada punto con altitud
  const serie = [];
  let dist = 0;
  let idxSerie = 0;
  for (let i = 0; i < puntos.length; i++) {
    if (i > 0) {
      dist += distanciaTotal([puntos[i - 1], puntos[i]]);
    }
    if (typeof puntos[i].alt === 'number' && Number.isFinite(puntos[i].alt)) {
      serie.push({ d: dist, alt: puntos[i].alt });
      idxSerie++;
    }
  }

  const dMax = serie[serie.length - 1].d;
  const altMin = Math.min(...serie.map((s) => s.alt));
  const altMax = Math.max(...serie.map((s) => s.alt));
  const margenY = Math.max(5, (altMax - altMin) * 0.15);
  const padIzq = 48;
  const padDer = 14;
  const padSup = 12;
  const padInf = 26;

  const x = (d) => padIzq + (d / (dMax || 1)) * (W - padIzq - padDer);
  const y = (a) => padSup + (1 - (a - (altMin - margenY)) / ((altMax + margenY) - (altMin - margenY))) * (H - padSup - padInf);

  // area bajo la curva
  ctx.beginPath();
  ctx.moveTo(x(0), y(serie[0].alt));
  for (const s of serie) ctx.lineTo(x(s.d), y(s.alt));
  ctx.lineTo(x(serie[serie.length - 1].d), H - padInf);
  ctx.lineTo(x(0), H - padInf);
  ctx.closePath();
  ctx.fillStyle = 'rgba(214, 40, 40, 0.15)';
  ctx.fill();

  // linea del perfil
  ctx.beginPath();
  ctx.moveTo(x(0), y(serie[0].alt));
  for (const s of serie) ctx.lineTo(x(s.d), y(s.alt));
  ctx.strokeStyle = '#d62828';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ejes
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padIzq, padSup);
  ctx.lineTo(padIzq, H - padInf);
  ctx.lineTo(W - padDer, H - padInf);
  ctx.stroke();

  ctx.fillStyle = '#555';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(altMax)} m`, padIzq - 6, y(altMax) + 4);
  ctx.fillText(`${Math.round(altMin)} m`, padIzq - 6, y(altMin) + 4);
  ctx.textAlign = 'center';
  ctx.fillText(`0 m`, padIzq, H - 8);
  ctx.fillText(`${formatearDistancia(dMax)}`, W - padDer, H - 8);

  return true;
}

function dibujarVacio(ctx, W, H, msg) {
  ctx.fillStyle = '#aaa';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(msg, W / 2, H / 2);
}