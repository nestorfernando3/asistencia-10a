// Datos institucionales y registro de cursos.
//
// Cada curso declara dónde viven sus datos en Firestore. El curso 10°-A usa las
// colecciones raíz originales (estudiantes, dias, asistencia, ajustes/config), las
// mismas que lee la versión clásica: así ambas versiones comparten la base sin
// migraciones. Un curso nuevo usa su propio espacio bajo cursos/{id}/…
// (ver docs/adr/0002-interfaz-v2-y-modelo-multicurso.md).

export const INSTITUCION = {
  nombre: "Institución Educativa Distrital Brisas del Río",
  nombreCorto: "IED Brisas del Río",
  resolucion: "Resolución 5256 de 2017",
  ciudad: "Barranquilla, Atlántico",
  escudo: "assets/institution/logo_colegio.png",
};

function rutasRaiz() {
  return {
    estudiantes: ["estudiantes"],
    dias: ["dias"],
    asistencia: ["asistencia"],
    ajustes: ["ajustes", "config"],
  };
}

export function rutasDeCurso(id) {
  return {
    estudiantes: ["cursos", id, "estudiantes"],
    dias: ["cursos", id, "dias"],
    asistencia: ["cursos", id, "asistencia"],
    ajustes: ["cursos", id, "ajustes", "config"],
  };
}

// docentes: correos con acceso al curso. Vacío = cualquier sesión iniciada
// (comportamiento actual, una sola cuenta).
export const CURSOS = [
  {
    id: "10A",
    nombre: "10°-A",
    docente: "Néstor Fernando De León Llanos",
    docentes: [],
    rutas: rutasRaiz(),
  },
  // Ejemplo para un curso nuevo (descomentar y ajustar):
  // {
  //   id: "11B",
  //   nombre: "11°-B",
  //   docente: "Nombre de la docente",
  //   docentes: ["correo@dominio.com"],
  //   rutas: rutasDeCurso("11B"),
  // },
];

export function cursosDe(correo) {
  const email = String(correo || "").toLowerCase();
  return CURSOS.filter((curso) => !curso.docentes.length || curso.docentes.some((otro) => otro.toLowerCase() === email));
}

export function slugCurso(curso) {
  return curso.nombre.replace(/[°\s]/g, "").replace(/-/g, "");
}
