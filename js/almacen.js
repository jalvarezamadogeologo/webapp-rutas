// almacen.js - Persistencia local con IndexedDB.
// Almacena rutas completas (puntos + waypoints + estadisticas) en el store "rutas".
// La lista de tarjetas devuelve resumenes sin los puntos para no cargar datos de mas.

const DB_NOMBRE = 'webapp-rutas';
const DB_VERSION = 1;
const STORE = 'rutas';

let _db = null;

function abrirDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, modo, fn) {
  return abrirDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, modo);
        const s = t.objectStore(store);
        const resultado = fn(s); // IDBRequest (get/getAll/put/delete/count)
        t.oncomplete = () => resolve(resultado ? resultado.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

/** Genera id simple tipo "r_<epoch>_<random>". */
export function nuevoId() {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Guarda una ruta (inserta o actualiza segun tenga id). Devuelve el id. */
export async function guardarRuta(ruta) {
  if (!ruta.id) ruta.id = nuevoId();
  if (!ruta.fecha) ruta.fecha = new Date().toISOString();
  await tx(STORE, 'readwrite', (s) => s.put(ruta));
  return ruta.id;
}

/** Lista resumenes (sin puntos) ordenados por fecha descendente. */
export async function listarRutas() {
  const todas = await tx(STORE, 'readonly', (s) => s.getAll());
  return todas
    .map((r) => {
      const { puntos, puntosMarcados, ...resumen } = r;
      return { ...resumen, nPuntos: puntos ? puntos.length : 0 };
    })
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

/** Devuelve una ruta completa por id, o null si no existe. */
export async function obtenerRuta(id) {
  const r = await tx(STORE, 'readonly', (s) => s.get(id));
  return r || null;
}

export async function eliminarRuta(id) {
  await tx(STORE, 'readwrite', (s) => s.delete(id));
}

/** Cuenta total de rutas guardadas (util en el estado inicial). */
export async function contarRutas() {
  return tx(STORE, 'readonly', (s) => s.count());
}