# Asistencia 10°-A — Diseño acordado

Fecha: 2026-10-14 · Estado: pendiente de visto bueno final

## Objetivo

App web para el pase de lista diario del curso 10°-A (29 estudiantes) desde el celular: calendario mensual para escoger el día, estados de asistencia, comentarios por caso particular, resumen mensual con alertas y exportación para planillas institucionales.

## Plataforma

- **Datos y login**: Firebase plan Spark — Firestore + Authentication (correo/contraseña). Gratis, sin tarjeta, sin pausas por inactividad. Las claves de configuración del front son públicas por diseño; la protección real es el login + las reglas de Firestore (`request.auth != null`).
- **Página**: sitio estático en GitHub Pages, repo `nestorfernando3/asistencia-10a` (público, solo código), URL `https://nestorfernando3.github.io/asistencia-10a/`, con `noindex` y aviso de uso interno.
- **Acceso**: una sola cuenta (docente). Sin sesión no se ve nada. Instalable en pantalla de inicio (manifest), sin funcionamiento offline real en v1.

## Lista de estudiantes

- Base inicial: los 29 estudiantes del registro P3 (Mat. No. 493–524 + 665), orden oficial «Apellidos Nombres»; las dos retiradas se siembran marcadas como tal.
- Importación única desde el computador del docente; la lista nunca viaja al repositorio.
- Edición completa en la app: agregar, editar, retirar (conserva historial, oculta del pase) y reactivar.

## Modelo de datos (esbozo)

- `estudiantes/{id}`: `mat`, `no`, `nombre`, `estado` (activo | retirada), `notaPersistente`.
- `dias/{AAAA-MM-DD}`: `tipo` (clase | sinClase), `motivo`, `nota`.
- `asistencia/{AAAA-MM-DD}_{mat}`: `estado`, `comentario`, `etiquetas[]`.
- `ajustes/config`: umbrales y etiquetas rápidas.

## Pase diario

- Se elige el día en el calendario y se abre la lista con todos en **Presente**; se marcan solo las excepciones (Ausente, Tarde, Excusa).
- Autoguardado a la primera interacción, sin botón Guardar; botones «Todos presentes» y deshacer; contador vivo («2 ausentes, 1 tarde»).
- Comentario libre por estudiante/día + etiquetas rápidas (excusa médica, cita médica, llegada tarde, disciplina, ajuste PIAR) + nota general del día.
- Nota persistente por estudiante (p. ej. ajustes PIAR).

## Calendario

- Vista mensual con selector de mes; los días aún sin pasar lista llevan un indicador suave.
- **Sin clase** con motivos sugeridos (Festivo, Jornada institucional, Permiso, No dicté) + texto libre.
- Fines de semana en gris (activables para jornadas especiales); días futuros bloqueados; hoy y días pasados editables.

## Resumen y exportación

- Resumen mensual por estudiante (asistencias, faltas, tardes, excusas, %) y totales del curso.
- Alertas resaltadas: 3 o más faltas consecutivas, o 5 o más acumuladas en el mes. Solo en pantalla y export; sin avisos externos.
- **Excel del mes** (`.xlsx`): cinco hojas — Lista, Resumen del mes, Detalle por día, Días del mes (estadística diaria) y Estadísticas del curso.
- Export del mes: CSV/Excel con resumen por estudiante (columna «Inas.» compatible con las planillas) + matriz día × estudiante + CSV de la lista.
- Vista imprimible del mes (PDF vía impresión del navegador) y botón «Descargar respaldo» (histórico completo en JSON).

## Reglas de conteo

- Asistencias = Presente + Tarde; Faltas = Ausente; Faltas justificadas = Excusa.
- Retiradas no cuentan en estadísticas.
- Arranque en blanco desde el estreno; los días anteriores no cuentan y no se migran históricos.

## Montaje

1. **Docente (guiado, una vez, ~10 min)**: crear el proyecto Firebase, habilitar Authentication (correo/contraseña), crear la única cuenta, crear Firestore y pegar las reglas que se entregan.
2. **Construcción**: repo + Pages + app + carga de la lista base generada desde la planilla P3.
3. **Pruebas**: navegador local y celular del docente; pase de lista real de un día como ensayo.

## Fuera de alcance (v1)

- Sin modo offline real, sin notificaciones externas, sin vista por periodo (el export mensual se suma por periodo), sin multiusuario y sin pantalla de ajustes (umbrales y etiquetas se cambian con una actualización).
