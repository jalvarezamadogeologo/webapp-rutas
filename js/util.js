// util.js - Funciones de formato y escape compartidas entre modulos de UI.

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatearFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatearDuracion(seg) {
  if (!seg || seg <= 0) return '—';
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.round(seg % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatearVelocidad(mPorSeg) {
  if (!mPorSeg || mPorSeg <= 0) return '—';
  return `${(mPorSeg * 3.6).toFixed(1)} km/h`;
}

export function formatearDistancia(m) {
  if (!m || m <= 0) return '0 m';
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}