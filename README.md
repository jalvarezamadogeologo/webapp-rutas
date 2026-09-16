# webapp-rutas

Registrador de rutas GPS sobre un mapa (Leaflet) para uso en terreno. PWA instalable que funciona offline.

## Funciones

- Grabacion con GPS: Play, Pausa y Stop.
- Alturas corregidas con SRTM al guardar y re-correccion de rutas guardadas.
- Waypoints, estadisticas y perfil de elevacion.
- Export a GPX 1.1 y JSON.
- Replay animado de rutas sobre el mapa.
- Grabacion recuperable: si la app se cierra con la pantalla apagada, al reabrir
  se ofrece continuar la sesion sin perder el track grabado.
- Todo se guarda en el navegador (IndexedDB).