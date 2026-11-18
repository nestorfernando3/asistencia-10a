# Asistencia 10°-A — IED Brisas del Río

Aplicación web para pasar lista a diario al curso 10°-A: calendario mensual, una marca por estudiante por día, comentarios por caso particular, resumen mensual con alertas y exportación para planillas.

- **App publicada**: https://nestorfernando3.github.io/asistencia-10a/
- Diseño acordado: `DISEÑO.md` · Glosario: `GLOSSARY.md` · Decisión de plataforma: `docs/adr/0001-firebase-y-github-pages.md`

## Versiones

- **Principal** (raíz): interfaz nueva. Demo con datos ficticios: `?demo=1`.
- **Clásica** (`clasica/`): la interfaz anterior, intacta y con los mismos datos. La dirección antigua `v2/` redirige a la principal.

Ambas leen y escriben los mismos documentos de Firestore con la misma forma: no hubo migración y se pueden usar indistintamente.

- **Hoy**: estado del pase del día, días hábiles sin registrar, el mes en cifras, estudiantes con alerta y observaciones recientes.
- **Pase del día**: contadores que filtran, búsqueda, selector P/A/T/E grande, observaciones con etiquetas, nota del día, «sin clase» y aviso con «Deshacer» tras cada cambio.
- **Calendario** con porcentaje de asistencia por día; **Resumen** con gráfico de novedades, tabla ordenable y ficha mensual de cada estudiante.
- **Documentos**: informe PDF A4 horizontal (panorama, tabla con barras, matriz coloreada, observaciones opcionales y firmas), libro de Excel con formato (cinco hojas con membrete y escudo) y los mismos CSV de siempre.
- Preparada para varios cursos y docentes: ver `docs/adr/0002-interfaz-v2-y-modelo-multicurso.md`.

## Uso diario

1. Abre la app (mejor: agrégala a la pantalla de inicio desde el navegador del celular).
2. Entra con el correo y la contraseña de la cuenta única.
3. Toca el día en el calendario → todos aparecen **Presentes** → marca solo las excepciones (A/T/E) y, si hace falta, el comentario.
4. Todo se guarda solo. «Todos presentes» registra el día completo. «Deshacer» revierte la última acción.
5. En **Resumen** ves el mes por estudiante con las alertas (3+ faltas seguidas o 5+ en el mes) y descargas el **Excel del mes** (lista, resumen, detalle y estadísticas), el **informe PDF horizontal con membrete** o los CSV.

## Modo demo

Sin conectar nada puedes probar la aplicación con datos ficticios: abre la app con `?demo=1` agregado a la URL (se guardan solo en tu navegador; jamás tocan Firebase).

## Montaje de Firebase (una sola vez, ~10 minutos)

1. Entra a https://console.firebase.google.com con la cuenta de Google → **Crear proyecto** → nombre `asistencia-10a` (desactiva Google Analytics).
2. **Compilación → Authentication → Comenzar** → habilita **Correo electrónico/Contraseña**.
3. En **Users → Agregar usuario**: el correo y una contraseña. Esa será la única cuenta. Copia su **UID de usuario** (columna de la tabla).
4. En **Authentication → Configuración → Acciones del usuario**, desmarca **Habilitar creación (registro)** y **Habilitar eliminación**: así nadie puede abrirse una cuenta con la clave pública del proyecto.
5. **Compilación → Firestore Database → Crear base de datos** → ubicación (p. ej. `us-east1`) → modo **producción**.
6. Pestaña **Reglas**: pega el contenido de `firestore.rules`, reemplaza `PEGAR_AQUI_EL_UID_DEL_DOCENTE` por el UID del paso 3 y **Publicar**. Compruébalo en **Área de pruebas de reglas**: una lectura de `/estudiantes/1` autenticada con ese UID debe permitirse, y con cualquier otro UID, negarse.
7. ⚙️ **Configuración del proyecto → Tus apps → Web (`</>`)** → registra la app `asistencia-10a-web` → copia el bloque `firebaseConfig` y pégalo en `src/firebase-config.js` (reemplaza `null` por el objeto).
8. Recarga la app publicada e inicia sesión.

## Importar la lista base (una sola vez)

El archivo `datos-base/lista_10A_base.json` (29 estudiantes, generado desde el registro P3 con `herramientas/generar_lista_base.py`) **no se versiona** — está en `.gitignore` porque contiene datos de estudiantes y este repositorio es público.

Para importarlo: abre la app **desde el computador** donde está el archivo → **Lista → Importar lista base (JSON)** → elige el archivo. Después, las altas, retiros y reactivaciones se hacen desde esa misma pantalla.

## Datos, respaldo y privacidad

- Los datos viven en Firestore y solo los lee o escribe la cuenta del docente (regla por UID en `firestore.rules`). El registro de cuentas nuevas está desactivado en Firebase.
- **Sin internet** la app abre igual (service worker) y se puede pasar lista: los cambios quedan guardados en el dispositivo y se envían solos al volver la conexión, aunque se cierre la app. El indicador dice *Guardado*, *Guardando…*, *Sin conexión* o *En el dispositivo*; si la base rechaza un cambio dice *Sin guardar · Recargar*.
- Cada marca se guarda junto con su día en una sola escritura: o queda todo o no queda nada.
- **Cerrar sesión** borra la copia local de los datos en ese dispositivo. Si hay cambios sin enviar, la app avisa antes.
- Importar la lista, restaurar y descargar el respaldo piden conexión: el respaldo se arma siempre con los datos del servidor.
- **Restaurar** revisa el archivo antes de escribir: rechaza respaldos de la demo, de otro curso o con datos inválidos, y muestra las fechas que trae.
- El repositorio y la página **jamás** contienen nombres de estudiantes: solo el código.
- **Descargar respaldo (JSON)** guarda todo el histórico; **Restaurar respaldo** lo vuelve a subir (también sirve para migrar de plataforma).
- **Descargar Excel del mes** produce un `.xlsx` con cinco hojas: Lista, Resumen del mes, Detalle por día, Días del mes y Estadísticas.
- **Informe PDF (horizontal)**: hoja A4 horizontal con membrete institucional (escudo, nombre y resolución), resumen por estudiante, estadísticas del curso y detalle por día. Se abre la vista previa y **Descargar PDF** genera el archivo directamente (en el celular abre el menú Compartir para guardarlo en Archivos, enviarlo o imprimirlo); **Imprimir** sigue disponible en el computador.
- **Exportar lista (CSV)** descarga el listado de estudiantes (Mat. No., No., nombre, estado) desde la pantalla Lista.
- Los CSV usan separador `;` y vienen con codificación para Excel; la columna «Inas.» coincide con las planillas institucionales.

## Estructura

```
index.html, app.js, estilos.css   Interfaz principal (una sola página)
manifest.webmanifest              Instalación en el celular
src/config.js                     Institución y registro de cursos (rutas en Firestore, docentes)
src/repositorio.js                Datos: Firebase (real) y demo (local), por curso
src/analisis.js                   Lógica de pantalla (pendientes, observaciones, historial)
src/exportes.js, libro-xlsx.js    Excel con formato y CSV de planillas
src/informe-pdf.js                Informe PDF (jsPDF desde vendor/)
src/dominio.js                    Lógica pura compartida (conteos, alertas, CSV) — con pruebas
src/respaldo.js                   Validación de respaldos antes de restaurar
src/firebase-config.js            Configuración web de Firebase (claves públicas)
sw.js                             Service worker: la app abre sin internet
vendor/                           jsPDF y jspdf-autotable (copias verificadas con SRI)
clasica/                          Interfaz anterior (usa src/datos.js, src/pdf.js, src/xlsx.js, src/estilos.css)
v2/                               Redirección de la dirección antigua a la principal
firestore.rules                   Reglas de seguridad de Firestore
herramientas/                     Script que genera la lista base desde el registro P3
datos-base/                       Lista base y respaldos locales (ignorado por git)
tests/                            Pruebas (node --test)
```

## Desarrollo

```
npm test                                     # pruebas de src/dominio.js
python3 herramientas/generar_lista_base.py   # regenera datos-base/lista_10A_base.json
python3 -m http.server 8000                  # servidor local → http://localhost:8000/?demo=1
```

## Publicación

GitHub Pages desde la rama `main` (raíz del repositorio). Cualquier cambio se publica solo con hacer commit y push.

El service worker busca siempre primero la versión publicada, así que los cambios de código llegan sin hacer nada más. Si se agrega un módulo nuevo a `src/` o cambia la versión de Firebase, hay que sumarlo a la lista de `sw.js` y subir su `VERSION` (una prueba avisa si falta un módulo).
