// Validación de un respaldo JSON antes de restaurarlo.
//
// Evita tres accidentes: subir un archivo que no es un respaldo de la app, mezclar los
// datos ficticios de la demo con la base real y restaurar el respaldo de otro curso.
// Si algo no cuadra se rechaza el archivo entero: una restauración a medias es peor
// que ninguna.

import { ESTADOS } from "./dominio.js";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS_DIA = ["clase", "sinClase"];
const ESTADOS_ESTUDIANTE = ["activo", "retirada"];

function fechaValida(fecha) {
  if (typeof fecha !== "string" || !FECHA.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const objeto = new Date(anio, mes - 1, dia);
  return objeto.getFullYear() === anio && objeto.getMonth() === mes - 1 && objeto.getDate() === dia;
}

function matValida(mat) {
  return Number.isInteger(Number(mat)) && Number(mat) > 0 && String(mat).trim() !== "";
}

function lista(contenido, clave) {
  const valor = contenido[clave];
  if (valor === undefined) return [];
  if (!Array.isArray(valor)) throw new Error(`la sección «${clave}» no es una lista`);
  return valor;
}

function revisar(elementos, valido, nombre) {
  const malos = elementos.filter((elemento) => !elemento || typeof elemento !== "object" || !valido(elemento));
  if (malos.length) {
    throw new Error(`${malos.length} ${nombre} con datos incompletos o inválidos`);
  }
}

// cursoDestino: id del curso abierto ("10A", …) o "demo" en el modo demo.
export function validarRespaldo(contenido, { cursoDestino }) {
  if (!contenido || typeof contenido !== "object" || Array.isArray(contenido)) {
    throw new Error("el archivo no parece un respaldo");
  }
  if (contenido.app !== "asistencia-10a") {
    throw new Error("el archivo no es un respaldo de esta aplicación");
  }
  // Los respaldos de la versión clásica no traen curso: corresponden al 10°-A.
  const cursoOrigen = contenido.curso ?? null;
  if (cursoOrigen === "demo" && cursoDestino !== "demo") {
    throw new Error("es un respaldo del modo demo, con datos ficticios; no se puede subir a la base real");
  }
  if (cursoOrigen && cursoOrigen !== "demo" && cursoDestino !== "demo" && cursoOrigen !== cursoDestino) {
    throw new Error(`es un respaldo del curso ${cursoOrigen}, no del curso abierto`);
  }

  const estudiantes = lista(contenido, "estudiantes");
  const dias = lista(contenido, "dias");
  const registros = lista(contenido, "registros");
  if (!estudiantes.length && !registros.length) throw new Error("el respaldo está vacío");

  revisar(estudiantes, (e) => matValida(e.mat) && typeof e.nombre === "string" && e.nombre.trim()
    && (e.estado === undefined || ESTADOS_ESTUDIANTE.includes(e.estado)), "estudiantes");
  revisar(dias, (d) => fechaValida(d.fecha) && (d.tipo === undefined || TIPOS_DIA.includes(d.tipo)), "días");
  revisar(registros, (r) => fechaValida(r.fecha) && matValida(r.mat) && ESTADOS.includes(r.estado), "registros de asistencia");

  const fechas = [...dias.map((d) => d.fecha), ...registros.map((r) => r.fecha)].sort();
  return {
    estudiantes,
    dias,
    registros,
    cursoOrigen,
    exportado: typeof contenido.exportado === "string" ? contenido.exportado : null,
    desde: fechas[0] || null,
    hasta: fechas[fechas.length - 1] || null,
  };
}
