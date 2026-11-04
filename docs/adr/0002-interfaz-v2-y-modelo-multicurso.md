# Interfaz v2 en paralelo y modelo multicurso

Status: accepted

La app necesitaba una interfaz nueva (más clara en el celular, con resumen visual e informes mejor diseñados) sin poner en riesgo los datos ya registrados ni la versión que se usa a diario. También se quiere dejar abierta la puerta para que otros docentes pasen lista en sus cursos.

## Decisión

- **La interfaz nueva ocupa la raíz y la anterior pasa a `clasica/`.** (Se probó primero en `v2/`, que ahora redirige a la raíz.) Ambas leen y escriben los mismos documentos de Firestore con la misma forma (`estudiantes/{mat}`, `dias/{AAAA-MM-DD}`, `asistencia/{AAAA-MM-DD}_{mat}`, `ajustes/config`). No hay migración: se puede usar una u otra indistintamente y comparten la sesión (mismo dominio y misma configuración de Firebase).
- **La lógica de conteo es la misma.** La interfaz nueva importa `src/dominio.js` (resumen, alertas, CSV) en lugar de reescribirlo; los CSV para planillas salen idénticos.
- **Cursos como configuración.** `src/config.js` declara cada curso con sus rutas en Firestore. El 10°-A conserva las colecciones raíz; un curso nuevo usa `cursos/{id}/estudiantes`, `cursos/{id}/dias`, `cursos/{id}/asistencia` y `cursos/{id}/ajustes/config`. El campo `docentes` (correos) decide quién ve cada curso; vacío equivale a cualquier sesión iniciada, que es el comportamiento actual.
- **Librerías del PDF en el repositorio.** `vendor/` guarda jsPDF 2.5.1 y jspdf-autotable 3.8.2, copias idénticas a las de cdnjs (se verificó el hash SRI), para que el informe no dependa de un CDN.

## Para sumar otro docente (cuando se decida)

1. Crear su cuenta en Firebase Authentication.
2. Agregar su curso en `src/config.js` con `rutas: rutasDeCurso("ID")` y su correo en `docentes`.
3. Endurecer las reglas de Firestore para que cada docente solo lea y escriba su espacio (hoy basta con tener sesión). Por ejemplo, reglas por curso con una lista de correos autorizados en `cursos/{id}`. Este paso cambia la seguridad de la base y debe probarse antes con el emulador de Firestore.

## Consecuencias

- Mientras convivan las dos versiones, un cambio en la forma de los datos debe hacerse en ambas.
- La versión clásica no conoce los cursos nuevos: solo ve el 10°-A.
- La clásica puede retirarse más adelante borrando `clasica/` y los módulos que solo ella usa (`src/datos.js`, `src/pdf.js`, `src/xlsx.js`, `src/estilos.css`).
