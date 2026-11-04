// Lógica pura de la interfaz principal. Se apoya en src/dominio.js (conteos,
// alertas y CSV compartidos con la versión clásica) y no toca datos.

import * as D from "./dominio.js";
import { festivo } from "./festivos.js";

const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "van", "von"]);
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const INICIAL_DIA = ["D", "L", "M", "X", "J", "V", "S"];

// «DE LA HOZ OSPINO MATEO» → «De la Hoz Ospino Mateo». Solo para pantalla:
// los documentos conservan el nombre oficial en mayúsculas.
export function nombreVisible(nombre) {
  return String(nombre || "")
    .toLocaleLowerCase("es")
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra, indice) => (indice > 0 && PARTICULAS.has(palabra)
      ? palabra
      : palabra.charAt(0).toLocaleUpperCase("es") + palabra.slice(1)))
    .join(" ");
}

export function iniciales(nombre) {
  const partes = String(nombre || "").split(/\s+/).filter((parte) => parte && !PARTICULAS.has(parte.toLowerCase()));
  // Orden oficial «Apellidos Nombres»: primer apellido + primer nombre.
  const apellido = partes[0] || "";
  const nombrePila = partes.length >= 3 ? partes[2] : partes[1] || "";
  return `${apellido.charAt(0)}${nombrePila.charAt(0)}`.toUpperCase();
}

export function diaCorto(fecha) {
  const objeto = D.fechaDeClave(fecha);
  return `${DIAS_CORTOS[objeto.getDay()]} ${objeto.getDate()}`;
}

export function inicialDia(fecha) {
  return INICIAL_DIA[D.fechaDeClave(fecha).getDay()];
}

export function sumarDias(fecha, cantidad) {
  const objeto = D.fechaDeClave(fecha);
  objeto.setDate(objeto.getDate() + cantidad);
  return D.claveDeFecha(objeto);
}

export function esFinDeSemanaFecha(fecha) {
  const dia = D.fechaDeClave(fecha).getDay();
  return dia === 0 || dia === 6;
}

// Días hábiles ya pasados (sin contar hoy) que aún no tienen pase ni marca de «sin clase».
// Los festivos no cuentan como pendientes.
export function diasPendientes(mes, dias, hoy) {
  const pendientes = [];
  const total = D.diasEnMes(mes);
  for (let dia = 1; dia <= total; dia++) {
    const fecha = D.claveDelDia(mes, dia);
    if (fecha >= hoy) break;
    if (D.esFinDeSemana(mes, dia) || festivo(fecha)) continue;
    if (!dias.has(fecha)) pendientes.push(fecha);
  }
  return pendientes;
}

export function registrosDelDia(registros, fecha) {
  return [...registros.values()].filter((registro) => registro.fecha === fecha);
}

export function tieneObservacion(registro) {
  return Boolean(registro && (registro.comentario || registro.etiquetas?.length));
}

export function observacionesDelMes({ estudiantes, registros, dias }) {
  const porMat = new Map((estudiantes || []).map((estudiante) => [String(estudiante.mat), estudiante]));
  const salida = [];
  for (const registro of registros || []) {
    if (!tieneObservacion(registro)) continue;
    const estudiante = porMat.get(String(registro.mat));
    salida.push({
      fecha: registro.fecha,
      mat: registro.mat,
      no: estudiante?.no ?? "",
      nombre: estudiante?.nombre || `Mat. ${registro.mat}`,
      estado: D.estadoDe(registro),
      etiquetas: registro.etiquetas || [],
      comentario: registro.comentario || "",
    });
  }
  for (const dia of dias || []) {
    if (!dia.nota) continue;
    salida.push({ fecha: dia.fecha, mat: null, no: "", nombre: "Nota del día", estado: "", etiquetas: [], comentario: dia.nota });
  }
  return salida.sort((a, b) => (a.fecha === b.fecha ? Number(a.no || 0) - Number(b.no || 0) : a.fecha.localeCompare(b.fecha)));
}

export function historialEstudiante({ mat, diasDeClase, registros }) {
  const propios = new Map();
  for (const registro of registros || []) {
    if (String(registro.mat) === String(mat)) propios.set(registro.fecha, registro);
  }
  return (diasDeClase || []).map((fecha) => {
    const registro = propios.get(fecha) || null;
    return { fecha, estado: D.estadoDe(registro), comentario: registro?.comentario || "", etiquetas: registro?.etiquetas || [] };
  });
}

export function diasSinClase(dias) {
  return [...(dias || [])].filter((dia) => dia.tipo === "sinClase").sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Festivo que la app muestra para una fecha: entre semana y sin pase ni marca guardada.
export function festivoPendiente(fecha, dias) {
  if (dias.has(fecha) || esFinDeSemanaFecha(fecha)) return null;
  return festivo(fecha);
}

// Días sin clase del mes: los marcados por el docente y los festivos entre semana
// que no tienen pase. Los festivos se calculan; no se guardan en la base.
export function diasNoLectivos(mes, dias) {
  const marcados = diasSinClase([...dias.values()]).map((dia) => ({ ...dia, automatico: false }));
  const festivos = [];
  const total = D.diasEnMes(mes);
  for (let numero = 1; numero <= total; numero++) {
    const fecha = D.claveDelDia(mes, numero);
    const nombre = festivoPendiente(fecha, dias);
    if (nombre) festivos.push({ fecha, tipo: "sinClase", motivo: `Festivo: ${nombre}`, nota: "", automatico: true });
  }
  return [...marcados, ...festivos].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function filtrarPorTexto(estudiantes, texto) {
  const normal = (valor) => String(valor || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const consulta = normal(texto).trim();
  if (!consulta) return estudiantes;
  const piezas = consulta.split(/\s+/);
  return estudiantes.filter((estudiante) => {
    const objetivo = `${normal(estudiante.nombre)} ${estudiante.no} ${estudiante.mat}`;
    return piezas.every((pieza) => objetivo.includes(pieza));
  });
}

export function nivelAsistencia(porcentaje) {
  if (porcentaje == null) return "nulo";
  if (porcentaje >= 95) return "alto";
  if (porcentaje >= 85) return "medio";
  return "bajo";
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// «Martes 3 de noviembre» (sin año), para títulos de pantalla.
export function fechaTitulo(fecha) {
  const objeto = D.fechaDeClave(fecha);
  return `${DIAS_LARGOS[objeto.getDay()]} ${objeto.getDate()} de ${MESES[objeto.getMonth()]}`;
}

export function saludo(hora = new Date().getHours()) {
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}
