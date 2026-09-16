// Service worker de paso: NO CACHEA NADA, y es a propósito.
//
// Existe por una sola razón: Chrome sacó el requisito de service worker
// para instalar desde el menú (v108 en móvil, v112 en escritorio), pero el
// aviso AUTOMÁTICO de instalar todavía pide que exista un handler de
// fetch. Con este archivo, la app ofrece instalarse sola.
//
// Lo que deliberadamente no hace es guardar respuestas. Un service worker
// que cachea HTML sirve una pantalla vieja después de cada deploy, y en
// una app que muestra plata una pantalla vieja es peor que no tener app:
// no se ve rota, se ve desactualizada, que es justo lo que nadie nota.
// Además el panel se refresca solo por Realtime, y un cache pelearía
// contra eso.
//
// El handler no llama a respondWith: la petición sale a la red exactamente
// como si este archivo no existiera. Está para que el navegador lo vea,
// no para meterse en el medio.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
