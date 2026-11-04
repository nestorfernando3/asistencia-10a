// Festivos de Colombia calculados para cualquier año (Ley 51 de 1983, «Ley Emiliani»).
// Se calculan en la app: no se guardan en Firestore ni cambian los datos. Un festivo
// sin pase registrado se muestra como día sin clase; si el docente pasa lista ese día,
// cuenta como día de clase normal.

import { claveDeFecha } from "./dominio.js";
import { RECESOS_AJUSTADOS } from "./config.js";

// Fechas que no se trasladan.
const FIJOS = [
  [1, 1, "Año Nuevo"],
  [5, 1, "Día del Trabajo"],
  [7, 20, "Día de la Independencia"],
  [8, 7, "Batalla de Boyacá"],
  [12, 8, "Inmaculada Concepción"],
  [12, 25, "Navidad"],
];

// Fechas que se trasladan al lunes siguiente cuando no caen en lunes.
const TRASLADABLES = [
  [1, 6, "Reyes Magos"],
  [3, 19, "San José"],
  [6, 29, "San Pedro y San Pablo"],
  [8, 15, "Asunción de la Virgen"],
  [10, 12, "Día de la Raza"],
  [11, 1, "Todos los Santos"],
  [11, 11, "Independencia de Cartagena"],
];

// Domingo de Pascua (algoritmo anónimo gregoriano).
export function pascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

function alLunes(fecha) {
  const resultado = new Date(fecha);
  const dia = resultado.getDay();
  if (dia !== 1) resultado.setDate(resultado.getDate() + ((8 - dia) % 7));
  return resultado;
}

function desplazar(fecha, dias) {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

const cache = new Map();

// Mapa AAAA-MM-DD → nombre del festivo.
export function festivosDelAnio(anio) {
  if (cache.has(anio)) return cache.get(anio);
  const lista = [];
  for (const [mes, dia, nombre] of FIJOS) lista.push([new Date(anio, mes - 1, dia), nombre]);
  for (const [mes, dia, nombre] of TRASLADABLES) lista.push([alLunes(new Date(anio, mes - 1, dia)), nombre]);
  const domingo = pascua(anio);
  lista.push([desplazar(domingo, -3), "Jueves Santo"]);
  lista.push([desplazar(domingo, -2), "Viernes Santo"]);
  lista.push([alLunes(desplazar(domingo, 39)), "Ascensión del Señor"]);
  lista.push([alLunes(desplazar(domingo, 60)), "Corpus Christi"]);
  lista.push([alLunes(desplazar(domingo, 68)), "Sagrado Corazón"]);
  // Dos festivos pueden caer el mismo lunes (p. ej. 30 de junio de 2025).
  const nombres = new Map();
  for (const [fecha, nombre] of lista) {
    const clave = claveDeFecha(fecha);
    nombres.set(clave, nombres.has(clave) ? `${nombres.get(clave)} y ${nombre}` : nombre);
  }
  const mapa = new Map([...nombres].sort(([a], [b]) => a.localeCompare(b)));
  cache.set(anio, mapa);
  return mapa;
}

export function festivo(fecha) {
  return festivosDelAnio(Number(fecha.slice(0, 4))).get(fecha) || null;
}

export function festivosDelMes(mes) {
  return [...festivosDelAnio(Number(mes.slice(0, 4)))].filter(([fecha]) => fecha.startsWith(mes));
}

// ——— Semanas de receso estudiantil (calendario A, colegios oficiales) ———
// Semana Santa: lunes a viernes de la semana mayor (jueves y viernes son además festivos).
// Octubre: cinco días en la semana inmediatamente anterior al festivo del 12 de octubre
// (Decreto 1373 de 2007, compilado en el Decreto 1075 de 2015).
// Si la Secretaría de Educación fija otras fechas para un año, se escriben en
// RECESOS_AJUSTADOS (config.js) y reemplazan las calculadas para ese año.

function semanaHabil(lunes, nombre) {
  return Array.from({ length: 5 }, (_, indice) => [claveDeFecha(desplazar(lunes, indice)), nombre]);
}

const cacheRecesos = new Map();

// Mapa AAAA-MM-DD → nombre del receso.
export function recesosDelAnio(anio) {
  if (cacheRecesos.has(anio)) return cacheRecesos.get(anio);
  let lista;
  if (RECESOS_AJUSTADOS[anio]) {
    lista = [];
    for (const { desde, hasta, nombre } of RECESOS_AJUSTADOS[anio]) {
      for (let fecha = new Date(`${desde}T00:00:00`); claveDeFecha(fecha) <= hasta; fecha = desplazar(fecha, 1)) {
        lista.push([claveDeFecha(fecha), nombre]);
      }
    }
  } else {
    const lunesSanto = desplazar(pascua(anio), -6);
    const festivoOctubre = alLunes(new Date(anio, 9, 12));
    lista = [
      ...semanaHabil(lunesSanto, "Receso de Semana Santa"),
      ...semanaHabil(desplazar(festivoOctubre, -7), "Receso de octubre"),
    ];
  }
  const mapa = new Map(lista.sort(([a], [b]) => a.localeCompare(b)));
  cacheRecesos.set(anio, mapa);
  return mapa;
}

export function receso(fecha) {
  return recesosDelAnio(Number(fecha.slice(0, 4))).get(fecha) || null;
}

// Día sin clase según el calendario: { tipo: "festivo" | "receso", nombre } o null.
// El festivo tiene prioridad (Jueves y Viernes Santo se muestran como festivos).
export function diaNoLectivo(fecha) {
  const nombreFestivo = festivo(fecha);
  if (nombreFestivo) return { tipo: "festivo", nombre: nombreFestivo };
  const nombreReceso = receso(fecha);
  return nombreReceso ? { tipo: "receso", nombre: nombreReceso } : null;
}
