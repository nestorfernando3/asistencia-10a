# Asistencia 10°-A — IED Brisas del Río

Aplicación web para pasar lista a diario al curso 10°-A: calendario mensual, una marca por estudiante por día, comentarios por caso particular, resumen mensual con alertas y exportación para planillas.

- **App publicada**: https://nestorfernando3.github.io/asistencia-10a/
- Diseño acordado: `DISEÑO.md` · Glosario: `GLOSSARY.md` · Decisión de plataforma: `docs/adr/0001-firebase-y-github-pages.md`

## Uso diario

1. Abre la app (mejor: agrégala a la pantalla de inicio desde el navegador del celular).
2. Entra con el correo y la contraseña de la cuenta única.
3. Toca el día en el calendario → todos aparecen **Presentes** → marca solo las excepciones (A/T/E) y, si hace falta, el comentario.
4. Todo se guarda solo. «Todos presentes» registra el día completo. «Deshacer» revierte la última acción.
5. En **Resumen** ves el mes por estudiante con las alertas (3+ faltas seguidas o 5+ en el mes) y exportas CSV o imprimes.

## Modo demo

Sin conectar nada puedes probar la aplicación con datos ficticios: abre la app con `?demo=1` agregado a la URL (se guardan solo en tu navegador; jamás tocan Firebase).

## Montaje de Firebase (una sola vez, ~10 minutos)

1. Entra a https://console.firebase.google.com con la cuenta de Google → **Crear proyecto** → nombre `asistencia-10a` (desactiva Google Analytics).
2. **Compilación → Authentication → Comenzar** → habilita **Correo electrónico/Contraseña**.
3. En **Users → Agregar usuario**: el correo y una contraseña. Esa será la única cuenta.
4. **Compilación → Firestore Database → Crear base de datos** → ubicación (p. ej. `us-east1`) → modo **producción**.
5. Pestaña **Reglas**: pega el contenido de `firestore.rules` y **Publicar**.
6. ⚙️ **Configuración del proyecto → Tus apps → Web (`</>`)** → registra la app `asistencia-10a-web` → copia el bloque `firebaseConfig` y pégalo en `src/firebase-config.js` (reemplaza `null` por el objeto).
7. Recarga la app publicada e inicia sesión.

## Importar la lista base (una sola vez)

El archivo `datos-base/lista_10A_base.json` (29 estudiantes, generado desde el registro P3 con `herramientas/generar_lista_base.py`) **no se versiona** — está en `.gitignore` porque contiene datos de estudiantes y este repositorio es público.

Para importarlo: abre la app **desde el computador** donde está el archivo → **Lista → Importar lista base (JSON)** → elige el archivo. Después, las altas, retiros y reactivaciones se hacen desde esa misma pantalla.

## Datos, respaldo y privacidad

- Los datos viven en Firestore y solo son visibles con la sesión iniciada (regla `request.auth != null`).
- El repositorio y la página **jamás** contienen nombres de estudiantes: solo el código.
- **Descargar respaldo (JSON)** guarda todo el histórico; **Restaurar respaldo** lo vuelve a subir (también sirve para migrar de plataforma).
- Los CSV usan separador `;` y vienen con codificación para Excel; la columna «Inas.» coincide con las planillas institucionales.

## Estructura

```
index.html              Interfaz (una sola página)
app.js                  Router, vistas y acciones
src/dominio.js          Lógica pura (conteos, alertas, CSV) — con pruebas
src/datos.js            Repositorios: Firebase (real) y demo (local)
src/firebase-config.js  Configuración web de Firebase (claves públicas)
src/estilos.css         Estilos
firestore.rules         Reglas de seguridad de Firestore
herramientas/           Script que genera la lista base desde el registro P3
datos-base/             Lista base y respaldos locales (ignorado por git)
tests/                  Pruebas de la lógica (node --test)
```

## Desarrollo

```
npm test                                     # pruebas de src/dominio.js
python3 herramientas/generar_lista_base.py   # regenera datos-base/lista_10A_base.json
python3 -m http.server 8000                  # servidor local → http://localhost:8000/?demo=1
```

## Publicación

GitHub Pages desde la rama `main` (raíz del repositorio). Cualquier cambio se publica solo con hacer commit y push.
