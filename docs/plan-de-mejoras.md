# Plan de mejoras: Asistencia 10°-A

Fecha: 2026-11-17 · Estado: propuesta para revisión · Base: commit `a2bc104`

**Avance (2026-11-18):** fases 0 y 1 implementadas en el código. Pendiente del lado de la consola de Firebase: pegar el UID en las reglas y publicarlas (0.1), desactivar el registro de cuentas (0.2) y descargar el respaldo de cierre (0.3). Las reglas se revisan con una prueba estática; la prueba con el emulador quedó pendiente porque requiere Java.

## Diagnóstico en una página

La app está en buen estado: 29 pruebas en verde, lógica de conteo aislada en `src/dominio.js`, datos de estudiantes fuera del repositorio, librerías del PDF locales con SRI, festivos y recesos calculados, y decisiones documentadas en ADR. Lo que falta no es funcionalidad visible, sino tres cosas de fondo:

1. **Seguridad de los datos.** Las reglas de Firestore dejan leer y escribir todo a *cualquier* cuenta autenticada. Si el registro de cuentas sigue habilitado en Firebase (viene así por defecto), cualquiera con la clave pública del proyecto puede crearse una cuenta y leer nombres, faltas y notas PIAR de menores de edad.
2. **Confiabilidad del guardado.** Cada marca se guarda con dos escrituras sueltas y sin caché persistente: con internet inestable en el salón, un cambio puede quedar a medias o perderse al cerrar la app, aunque la pantalla ya lo muestre.
3. **Deuda de mantenimiento.** Dos interfaces conviven sobre los mismos datos (la clásica suma unas 2.100 líneas duplicadas) y `app.js` tiene 2.212 líneas en un solo archivo.

A eso se suma el calendario: estamos al cierre del año escolar, así que conviene prever el informe por periodo y anual y el paso del curso a 2027.

El plan va en cinco fases ordenadas por riesgo. Las fases 0 y 1 son las que recomiendo hacer ya; las demás pueden esperar al receso.

---

## Fase 0. Seguridad de los datos (urgente, ~1–2 h)

### 0.1 Cerrar las reglas de Firestore a la cuenta del docente

- **Problema.** `firestore.rules:5` usa `allow read, write: if request.auth != null;`. La protección depende por completo de que nadie más tenga una cuenta en el proyecto.
- **Propuesta.** Restringir por UID (o por correo verificado) de la cuenta única:
  ```
  function esDocente() {
    return request.auth != null && request.auth.uid in ["<UID_DEL_DOCENTE>"];
  }
  match /{document=**} { allow read, write: if esDocente(); }
  ```
  Dejar preparado el bloque por curso (`cursos/{id}`) que describe la ADR 0002 para cuando entre otro docente.
- **Verificación.** Probar con el emulador de Firestore (`firebase emulators:start`) un caso permitido y uno denegado, y agregar la prueba a `tests/` con `@firebase/rules-unit-testing`.
- **Criterio de cierre.** Una cuenta distinta a la del docente recibe `permission-denied` al leer `estudiantes`.

### 0.2 Desactivar el registro de cuentas nuevas

- En la consola: Authentication, Configuración, Acciones del usuario: desmarcar **Habilitar creación (registro)** y **Habilitar eliminación**.
- Revisar en Authentication, Usuarios, que solo exista la cuenta del docente.
- Opcional: restringir la clave de API en Google Cloud a los referentes `nestorfernando3.github.io/*` y `localhost`.

### 0.3 Respaldo de cierre de año

- Descargar ahora el respaldo JSON completo y guardarlo fuera del repositorio (por ejemplo en `datos-base/respaldos/2026-11-cierre.json`, que ya está ignorado por git) y en una segunda ubicación.

### 0.4 Validar el archivo antes de restaurar

- **Problema.** `restaurarDeArchivo` (`app.js:1804`) no revisa `contenido.app` ni `contenido.curso`. Un respaldo de la demo (`curso: "demo"`, nombres ficticios, matrículas 9001+) se puede restaurar sobre la base real y mezclarse con los datos verdaderos.
- **Propuesta.** Rechazar archivos cuyo `app` no sea `asistencia-10a`, avisar si `curso` no coincide con el curso abierto, y validar la forma mínima de cada registro (`fecha` AAAA-MM-DD, `mat` numérico, `estado` dentro de `ESTADOS`). Mostrar el rango de fechas del respaldo en la confirmación.

---

## Fase 1. Guardado confiable con internet inestable (~1 día)

### 1.1 Caché persistente de Firestore

- **Problema.** `src/repositorio.js:58` crea la base con `getFirestore(app)`, que guarda solo en memoria. Sin conexión, las escrituras quedan en cola mientras la pestaña esté abierta; si el celular cierra la app, se pierden.
- **Propuesta.** Usar `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`. Las marcas quedan en IndexedDB y se sincronizan al volver la conexión, aun después de cerrar la app.
- **Riesgo a cuidar.** El caché local guarda datos de estudiantes en el dispositivo: limpiarlo al cerrar sesión (`clearIndexedDbPersistence` tras `signOut`) y documentarlo en el README.

### 1.2 Escrituras atómicas

- **Problema.** `fijarEstado` guarda el registro y después el día por separado (`app.js:1571–1574`); «Todos presentes» hace una escritura por estudiante en serie (`app.js:1614–1617`). Un fallo a mitad deja el día marcado con registros incompletos, y en conexiones lentas «Todos presentes» tarda segundos.
- **Propuesta.** Agregar al repositorio un método `aplicarCambios(operaciones)` que use `writeBatch` (en demo, una sola persistencia). Usarlo en `fijarEstado`, `marcarTodosPresentes`, `marcarSinClase`, `guardarObservacion` y en cada `deshacer`.

### 1.3 Indicador honesto y reintento

- **Problema.** `guardarEnSegundoPlano` (`app.js:170`) muestra «Sin guardar» tras un error, pero el caché de pantalla ya tiene el cambio y no hay reintento: la pantalla puede mostrar algo que no está en la base.
- **Propuesta.** Con la caché persistente, distinguir tres estados: *Guardado* (confirmado por el servidor), *Pendiente de sincronizar* (en el dispositivo, sin red; usar `waitForPendingWrites` y `navigator.onLine`) y *Error* (rechazado por reglas o validación, con botón «Reintentar» o recarga del mes). Avisar con `beforeunload` si se intenta cerrar con escrituras pendientes.

### 1.4 Abrir la app sin internet

- **Problema.** No hay service worker: sin red, la app instalada ni siquiera carga.
- **Propuesta.** Un service worker mínimo que guarde la carcasa (HTML, JS, CSS, íconos, escudo, `vendor/`) con estrategia «red primero, caché de respaldo» y una versión por despliegue para no servir código viejo. Las fuentes de Google pueden quedar con respaldo de fuente del sistema.
- **Criterio de cierre de la fase.** En modo avión: abrir la app instalada, pasar lista de un día, cerrar, reactivar la red y comprobar en la consola de Firebase que los registros llegaron.

---

## Fase 2. Reglas de negocio y cierre de año (~1–2 días)

### 2.1 Faltas seguidas que cruzan el mes

- **Problema.** `resumenDelMes` (`src/dominio.js:147`) cuenta las faltas consecutivas solo dentro del mes. Un estudiante que falta el 29 y 30 de octubre y el 3 de noviembre no genera alerta en ninguno de los dos meses.
- **Propuesta.** Calcular la racha con los últimos días de clase del mes anterior (basta con cargar ese mes, que casi siempre ya está en caché) y mostrarla en la alerta («3 faltas seguidas, desde el 29 oct.»). Prueba nueva en `tests/dominio.test.mjs`.

### 2.2 Vista e informe por periodo y anual

- **Problema.** El diseño dejó fuera la vista por periodo; hoy hay que sumar a mano los meses para las planillas de P1–P4.
- **Propuesta.**
  - Declarar los periodos del año en `src/config.js` (fechas de inicio y fin de cada uno, ajustables cada año).
  - Agregar en `dominio.js` un `resumenDeRango({ desde, hasta })` que reutilice la lógica mensual.
  - En **Resumen**, un selector Mes / Periodo / Año; el Excel y el PDF salen con el mismo rango y la columna «Inas.» del periodo.
- **Criterio de cierre.** El total de inasistencias de P4 coincide con la suma de los meses que lo componen.

### 2.3 Paso a 2027

- **Problema.** El 10°-A de 2026 pasa a ser otro curso en 2027, y el modelo actual usa las colecciones raíz para «el curso», sin noción de año.
- **Propuesta (para decidir).**
  - **A (recomendada).** Dejar 2026 en las colecciones raíz como curso de solo lectura («10°-A 2026») y crear los cursos de 2027 bajo `cursos/{id}` con el modelo multicurso que ya existe. No hay migración.
  - **B.** Mover 2026 a `cursos/10A-2026/…` con un script y dejar la raíz libre. Más limpio, pero requiere migrar y retirar antes la versión clásica.
- Agregar al registro de cursos un campo `anio` y `soloLectura`, y que la interfaz bloquee la edición de cursos cerrados.

### 2.4 Ajustes editables

- `ajustes/config` ya se lee, pero umbrales y etiquetas solo cambian editando código. Una pantalla sencilla de Ajustes (umbrales de alerta, etiquetas rápidas, motivos de «sin clase», recesos del año) evita depender de un despliegue.

---

## Fase 3. Mantenimiento del código (~2 días, sin cambios visibles)

### 3.1 Retirar la versión clásica

- Tras dos o tres semanas de uso de la nueva interfaz sin volver a la clásica: borrar `clasica/`, `src/datos.js`, `src/pdf.js`, `src/xlsx.js`, `src/estilos.css` y dejar en `clasica/index.html` una redirección como la de `v2/`. Ajustar la prueba «CSV idéntico al de la clásica» para que compare contra un CSV de referencia fijo.
- Elimina unas 3.500 líneas y la obligación de cambiar la forma de los datos en dos lugares (consecuencia anotada en la ADR 0002). Es requisito de la opción B de 2.3.

### 3.2 Partir `app.js`

- Separar en módulos sin cambiar comportamiento: `vistas/hoy.js`, `vistas/calendario.js`, `vistas/dia.js`, `vistas/resumen.js`, `vistas/estudiantes.js`, `hojas.js` (hojas modales), `acciones.js` (fijarEstado, deshacer, exportes) y `estado.js`.
- Hacerlo después de la fase 1, para no mover código que se está cambiando.

### 3.3 Pruebas y verificación automática

- Pruebas de las acciones sobre el repositorio demo: marcar, deshacer, «Todos presentes», sin clase y restaurar respaldo (incluido el rechazo de respaldos de la demo).
- Pruebas de las reglas de Firestore con el emulador (fase 0.1).
- GitHub Actions que corra `npm test` en cada push: como Pages publica `main` directamente, hoy un error llega a producción sin filtro.

### 3.4 Dependencias

- Firebase está fijado en `11.0.2` y se carga desde gstatic sin verificación de integridad. Opciones: actualizar a la versión vigente y revisar cada semestre, o copiarlo a `vendor/` como se hizo con jsPDF.
- Agregar una política de seguridad de contenido (`<meta http-equiv="Content-Security-Policy">`) que solo permita los orígenes que la app usa (propio, gstatic, googleapis, fuentes de Google).

### 3.5 Orden del repositorio

- Decidir si `.claude/launch.json` se versiona o se agrega a `.gitignore`.
- `herramientas/generar_lista_base.py` tiene las matrículas retiradas fijas en el código (`RETIRADAS = {494, 521}`): pasarlas a un argumento o a un archivo dentro de `datos-base/` para reutilizar el script con otros cursos.

---

## Fase 4. Mejoras de uso (opcionales, según necesidad)

| Mejora | Para qué | Esfuerzo |
|---|---|---|
| Ficha por estudiante en PDF (semestre o año) | Citaciones de acudientes, orientación, comité de convivencia | Medio |
| Búsqueda en observaciones y filtro por etiqueta | Encontrar rápido todos los casos «Ajuste PIAR» o «Disciplina» | Bajo |
| Sincronización entre dispositivos en vivo (`onSnapshot` del mes abierto) | Que el celular y el computador no muestren datos distintos | Bajo, después de la fase 1 |
| Deshacer de varios pasos | Hoy solo se revierte la última acción | Bajo |
| Retardos y salidas anticipadas con hora | Si la institución lo pide en planillas | Medio |
| Segundo docente (ADR 0002) | Requiere 0.1 por curso, 2.3 y pruebas de reglas | Medio |

---

## Orden recomendado y calendario tentativo

| Bloque | Contenido | Cuándo |
|---|---|---|
| 1 | Fase 0 completa | Esta semana, antes de cerrar notas |
| 2 | Fase 1 (caché persistente, lotes, indicador, service worker) | Antes del cierre del año |
| 3 | 2.1 y 2.2 (rachas y periodo/año) | Para el informe final de 2026 |
| 4 | 3.1 a 3.3 (retirar clásica, partir `app.js`, pruebas y CI) | Receso de fin de año |
| 5 | 2.3 y 2.4 (cursos 2027 y ajustes) | Antes del inicio de clases 2027 |
| 6 | Fase 4 según lo que pida el uso real | 2027 |

## Decisiones pendientes

1. ¿Restringir las reglas por UID (recomendado: simple y sin depender del correo) o por correo verificado?
2. ¿Opción A o B para el paso a 2027? (Recomendada: A.)
3. ¿Firebase local en `vendor/` o desde gstatic con actualización periódica? (Recomendada: local, por coherencia con jsPDF.)
4. ¿Fecha para retirar la versión clásica?
