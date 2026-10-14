# Firebase Spark y GitHub Pages como plataforma

Status: accepted

La app necesita un backend gratuito para guardar la asistencia sin exponer datos en el front, con el requisito explícito de que **no se bloquee**. Se evaluaron Supabase, Firebase, Google Sheets + Apps Script y Cloudflare Workers + D1. Supabase (favorito inicial por simplicidad) quedó descartado porque su plan gratuito pausa los proyectos tras 7 días sin actividad y limita las restauraciones; los «keep-alive» exigirían piezas extra que a su vez pueden morir solas. Se eligió **Firebase (plan Spark)** —gratis, sin tarjeta, sin pausas por inactividad— con Firestore y Authentication (correo/contraseña), y **GitHub Pages** para servir la página estática, porque el entorno ya usa Pages y el repositorio puede crearse y publicarse directamente.

## Considered Options

- **Supabase**: descartado por la pausa del plan gratuito (7 días de inactividad) y el tope de restauraciones.
- **Google Sheets + Apps Script**: sin pausas, pero cada actualización exige pegar el código a mano y no permite verificación local.
- **Cloudflare Workers + D1**: sin pausas, pero exige escribir la API y la autenticación a mano.

## Consequences

- El repositorio es público (Pages gratuito), así que **jamás contiene datos de estudiantes**: la lista base se importa una vez desde el computador del docente y vive solo en Firestore.
- La protección de los datos recae en el login (una única cuenta) y en las reglas de Firestore (`request.auth != null`).
- Cambiar de plataforma después requeriría migrar el histórico (mitigado por el respaldo JSON exportable).
