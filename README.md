# webapp-rutas (PWA publicada)

Registrador de rutas GPS sobre mapa (Leaflet) para uso en terreno.
Version publicada de `proyectos/webapp-rutas/` del workspace de Javier:
solo los archivos de la app (sin tests, tools ni historial de desarrollo).

- App: https://jalvarezamadogeologo.github.io/webapp-rutas/
- Repo fuente y desarrollo: local en `D:\IA\opencode\proyectos\webapp-rutas`
  (este repo publico solo contiene la app para servirla por GitHub Pages).

## Republicar (tras cambios en el proyecto)

```powershell
# desde proyectos/webapp-rutas
Copy-Item index.html, manifest.webmanifest, sw.js -Destination publica -Force
Copy-Item css, js, iconos, vendor -Destination publica -Recurse -Force
Set-Location publica
git add --all
git commit -m "descripcion del cambio"
git push
```

El repo publico no debe contener datos personales ni rutas grabadas
(la app guarda todo en el IndexedDB del navegador del usuario, nunca en el servidor).