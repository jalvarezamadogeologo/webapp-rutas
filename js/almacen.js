// almacen.js - Persistencia local con IndexedDB.
// Almacena rutas completas (puntos + waypoints + estadisticas) en el store "rutas".
// El store "sesion" guarda la grabacion EN CURSO (una sola entrada 'activa') para
// no perder el track si el navegador mata la app con la pantalla apagada.
// La lista de tarjetas devuelve resumenes sin los puntos para no cargar datos de mas.

const DB_NOMBRE = 'webapp-rutas';
const DB_VERSION = 2;
const STORE = 'rutas';
const STORE_SESION = 'sesion';
const ID_SESION_ACTIVA = 'activa';

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
      if (!db.objectStoreNames.contains(STORE_SESION)) {
        db.createObjectStore(STORE_SESION, { keyPath: 'id' });
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

// --- sesion en curso (grabacion activa) ---

/** Guarda (o reemplaza) la sesion de grabacion en curso. Devuelve el id. */
export async function guardarSesion(sesion) {
  sesion.id = ID_SESION_ACTIVA;
  sesion.guardadoEn = Date.now();
  await tx(STORE_SESION, 'readwrite', (s) => s.put(sesion));
  return sesion.id;
}

/** Devuelve la sesion en curso, o null si no hay grabacion activa pendiente. */
export async function obtenerSesion() {
  const s = await tx(STORE_SESION, 'readonly', (s) => s.get(ID_SESION_ACTIVA));
  return s || null;
}

/** Elimina la sesion en curso (se guardo la ruta o el usuario la descarto). */
export async function eliminarSesion() {
  await tx(STORE_SESION, 'readwrite', (s) => s.delete(ID_SESION_ACTIVA));
}