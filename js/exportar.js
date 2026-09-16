// exportar.js - Exportacion de rutas a GPX 1.1 y JSON, con descarga local.

/**
 * Genera el contenido GPX 1.1 de una ruta.
 * Track en <trk>/<trkseg>, waypoints en <wpt>. Incluye <ele> cuando el punto
 * tiene altitud. Devuelve string.
 */
export function aGPX(ruta) {
  const fecha = new Date(ruta.fecha).toISOString();
  const lineas = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="webapp-rutas" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><time>${fecha}</time><name>${xmlEscape(ruta.nombre)}</name></metadata>`,
    '  <trk>',
    `    <name>${xmlEscape(ruta.nombre)}</name>`,
  ];

  // Segmentos: agrupamos por los indices de segmento guardados.
  const puntos = ruta.puntos || [];
  const segmentos = construirSegmentos(puntos, ruta.segmentos || [0]);
  for (const seg of segmentos) {
    lineas.push('    <trkseg>');
    for (const p of seg) {
      let t = `      <trkpt lat="${p.lat}" lon="${p.lon}">`;
      if (typeof p.alt === 'number' && Number.isFinite(p.alt)) {
        t += `\n        <ele>${p.alt}</ele>`;
      }
      if (p.t) t += `\n        <time>${new Date(p.t).toISOString()}</time>`;
      t += '\n      </trkpt>';
      lineas.push(t);
    }
    lineas.push('    </trkseg>');
  }
  lineas.push('  </trk>');

  for (const w of ruta.puntosMarcados || []) {
    lineas.push(`  <wpt lat="${w.lat}" lon="${w.lon}">`);
    if (w.nombre) lineas.push(`    <name>${xmlEscape(w.nombre)}</name>`);
    if (w.descripcion) lineas.push(`    <desc>${xmlEscape(w.descripcion)}</desc>`);
    if (typeof w.alt === 'number' && Number.isFinite(w.alt)) lineas.push(`    <ele>${w.alt}</ele>`);
    if (w.t) lineas.push(`    <time>${new Date(w.t).toISOString()}</time>`);
    lineas.push('  </wpt>');
  }

  lineas.push('</gpx>');
  return lineas.join('\n');
}

/** Divide los puntos en segmentos segun los indices de corte. */
export function construirSegmentos(puntos, cortes) {
  const segmentos = [];
  const cortesValidos = (cortes || [0]).filter((i) => i >= 0 && i <= puntos.length);
  for (let k = 0; k < cortesValidos.length; k++) {
    const ini = cortesValidos[k];
    const fin = k + 1 < cortesValidos.length ? cortesValidos[k + 1] : puntos.length;
    if (fin > ini) segmentos.push(puntos.slice(ini, fin));
  }
  return segmentos;
}

export function aJSON(ruta) {
  return JSON.stringify(ruta, null, 2);
}

/** Dispara la descarga de un archivo desde el navegador. */
export function descargar(nombreArchivo, contenido, mime) {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Nombre de archivo seguro a partir del nombre de la ruta. */
export function nombreArchivo(base) {
  const limpio = String(base || 'ruta')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return limpio || 'ruta';
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}