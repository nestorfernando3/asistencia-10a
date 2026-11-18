// Service worker: permite abrir la app instalada sin internet.
//
// - Archivos propios: primero la red (siempre el código publicado más reciente) y, si
//   no hay señal o tarda más de unos segundos, la copia guardada.
// - SDK de Firebase (gstatic, con versión fija en la URL) y fuentes: la copia guardada
//   primero, porque no cambian.
// - Firestore y Authentication no pasan por aquí: los datos sin conexión los maneja el
//   caché persistente de Firestore (src/repositorio.js).
//
// Si cambia la lista de archivos o la versión de Firebase, sube VERSION.

const VERSION = "2026-11-18.1";
const PREFIJO = "asistencia-";
const CACHE = `${PREFIJO}${VERSION}`;
const VERSION_FIREBASE = "11.0.2";
const ESPERA_RED_MS = 4000;

const CARCASA = [
  "./",
  "index.html",
  "app.js",
  "estilos.css",
  "manifest.webmanifest",
  "icono.svg",
  "icono-192.png",
  "icono-512.png",
  "assets/institution/logo_colegio.png",
  "src/analisis.js",
  "src/config.js",
  "src/dominio.js",
  "src/exportes.js",
  "src/festivos.js",
  "src/firebase-config.js",
  "src/iconos.js",
  "src/informe-pdf.js",
  "src/libro-xlsx.js",
  "src/repositorio.js",
  "src/respaldo.js",
  "vendor/jspdf.umd.min.js",
  "vendor/jspdf.plugin.autotable.min.js",
];

const SDK_FIREBASE = ["firebase-app", "firebase-auth", "firebase-firestore"]
  .map((paquete) => `https://www.gstatic.com/firebasejs/${VERSION_FIREBASE}/${paquete}.js`);

const ORIGENES_INMUTABLES = ["https://www.gstatic.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"];

self.addEventListener("install", (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Uno a uno: si un archivo falla, los demás igual quedan guardados.
    await Promise.allSettled([
      ...CARCASA.map((ruta) => cache.add(new Request(ruta, { cache: "reload" }))),
      ...SDK_FIREBASE.map((url) => cache.add(new Request(url, { mode: "cors" }))),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((nombre) => nombre.startsWith(PREFIJO) && nombre !== CACHE).map((nombre) => caches.delete(nombre)));
    await self.clients.claim();
  })());
});

function guardarCopia(peticion, respuesta) {
  if (!respuesta || (!respuesta.ok && respuesta.type !== "opaque")) return;
  const copia = respuesta.clone();
  caches.open(CACHE).then((cache) => cache.put(peticion, copia)).catch(() => {});
}

async function copiaGuardada(peticion) {
  const cache = await caches.open(CACHE);
  const exacta = await cache.match(peticion, { ignoreSearch: true });
  if (exacta) return exacta;
  if (peticion.mode === "navigate") {
    const carpeta = new URL("./", peticion.url).href;
    return (await cache.match(carpeta)) || cache.match("index.html");
  }
  return undefined;
}

async function redPrimero(evento) {
  const { request } = evento;
  const red = fetch(request).then((respuesta) => {
    guardarCopia(request, respuesta);
    return respuesta;
  });
  evento.waitUntil(red.catch(() => {}));
  const plazo = new Promise((resolver) => setTimeout(resolver, ESPERA_RED_MS));
  try {
    const ganadora = await Promise.race([red, plazo.then(() => null)]);
    if (ganadora) return ganadora;
    // La red está lenta: si hay copia, se usa ya; si no, se sigue esperando la red.
    return (await copiaGuardada(request)) || red;
  } catch (error) {
    const copia = await copiaGuardada(request);
    if (copia) return copia;
    throw error;
  }
}

async function copiaPrimero(request) {
  const cache = await caches.open(CACHE);
  const copia = await cache.match(request);
  if (copia) return copia;
  const respuesta = await fetch(request);
  guardarCopia(request, respuesta);
  return respuesta;
}

self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    evento.respondWith(redPrimero(evento));
  } else if (ORIGENES_INMUTABLES.includes(url.origin) && (url.origin !== "https://www.gstatic.com" || url.pathname.startsWith("/firebasejs/"))) {
    evento.respondWith(copiaPrimero(request));
  }
});
