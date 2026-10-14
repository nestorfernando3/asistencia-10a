export const PRESENTE = "Presente";
export const AUSENTE = "Ausente";
export const TARDE = "Tarde";
export const EXCUSA = "Excusa";
export const ESTADOS = [PRESENTE, AUSENTE, TARDE, EXCUSA];

export const AJUSTES_POR_DEFECTO = { umbralSeguidas: 3, umbralAcumuladas: 5 };
export const ETIQUETAS_RAPIDAS = ["Excusa médica", "Cita médica", "Llegada tarde", "Disciplina", "Ajuste PIAR"];
export const MOTIVOS_SIN_CLASE = ["Festivo", "Jornada institucional", "Permiso", "No dicté"];

const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function dosDigitos(numero) {
  return String(numero).padStart(2, "0");
}

export function claveDeFecha(fecha) {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

export function fechaDeClave(clave) {
  const [anio, mes, dia] = clave.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

export function claveDeMes(anio, mes) {
  return `${anio}-${dosDigitos(mes)}`;
}

export function partesDeMes(claveMes) {
  const [anio, mes] = claveMes.split("-").map(Number);
  return { anio, mes };
}

export function mesSiguiente(claveMes) {
  const { anio, mes } = partesDeMes(claveMes);
  return mes === 12 ? claveDeMes(anio + 1, 1) : claveDeMes(anio, mes + 1);
}

export function mesAnterior(claveMes) {
  const { anio, mes } = partesDeMes(claveMes);
  return mes === 1 ? claveDeMes(anio - 1, 12) : claveDeMes(anio, mes - 1);
}

export function diasEnMes(claveMes) {
  const { anio, mes } = partesDeMes(claveMes);
  return new Date(anio, mes, 0).getDate();
}

export function primerDiaSemana(claveMes) {
  const { anio, mes } = partesDeMes(claveMes);
  return (new Date(anio, mes - 1, 1).getDay() + 6) % 7;
}

export function claveDelDia(claveMes, dia) {
  return `${claveMes}-${dosDigitos(dia)}`;
}

export function esFinDeSemana(claveMes, dia) {
  const { anio, mes } = partesDeMes(claveMes);
  const indice = new Date(anio, mes - 1, dia).getDay();
  return indice === 0 || indice === 6;
}

export function hoyClave() {
  return claveDeFecha(new Date());
}

export function fechaHumana(clave) {
  const fecha = fechaDeClave(clave);
  return `${NOMBRES_DIA[fecha.getDay()]}, ${fecha.getDate()} de ${NOMBRES_MES[fecha.getMonth()]} de ${fecha.getFullYear()}`;
}

export function mesHumano(claveMes) {
  const { anio, mes } = partesDeMes(claveMes);
  const nombre = NOMBRES_MES[mes - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${anio}`;
}

export function claveRegistro(fecha, mat) {
  return `${fecha}_${mat}`;
}

export function estadoDe(registro) {
  return registro ? registro.estado : PRESENTE;
}

export function letraEstado(estado) {
  if (estado === AUSENTE) return "A";
  if (estado === TARDE) return "T";
  if (estado === EXCUSA) return "E";
  return "P";
}

export function contadoresDelDia(registros) {
  const contadores = { presente: 0, ausente: 0, tarde: 0, excusa: 0 };
  for (const registro of registros) {
    const estado = estadoDe(registro);
    if (estado === AUSENTE) contadores.ausente++;
    else if (estado === TARDE) contadores.tarde++;
    else if (estado === EXCUSA) contadores.excusa++;
    else contadores.presente++;
  }
  return contadores;
}

export function textoAlerta(alerta) {
  if (!alerta) return "";
  const partes = [];
  if (alerta.seguidas) partes.push(`${alerta.seguidas} faltas seguidas`);
  if (alerta.acumuladas) partes.push(`${alerta.acumuladas} faltas en el mes`);
  return partes.join("; ");
}

function indexarRegistros(registros) {
  const porFecha = new Map();
  for (const registro of registros || []) {
    if (!porFecha.has(registro.fecha)) porFecha.set(registro.fecha, new Map());
    porFecha.get(registro.fecha).set(String(registro.mat), registro);
  }
  return porFecha;
}

export function resumenDelMes({ estudiantes, dias, registros, ajustes }) {
  const limites = { ...AJUSTES_POR_DEFECTO, ...(ajustes || {}) };
  const porFecha = indexarRegistros(registros);
  const fechasDeClase = new Set();
  for (const dia of dias || []) {
    if (dia.tipo !== "sinClase") fechasDeClase.add(dia.fecha);
  }
  for (const fecha of porFecha.keys()) fechasDeClase.add(fecha);
  const diasDeClase = [...fechasDeClase].sort();

  const filas = [];
  for (const estudiante of estudiantes || []) {
    if (estudiante.estado === "retirada") continue;
    let presente = 0;
    let tarde = 0;
    let excusa = 0;
    let ausente = 0;
    let seguidas = 0;
    let seguidasMax = 0;
    for (const fecha of diasDeClase) {
      const estado = estadoDe(porFecha.get(fecha)?.get(String(estudiante.mat)));
      if (estado === AUSENTE) {
        ausente++;
        seguidas++;
        if (seguidas > seguidasMax) seguidasMax = seguidas;
      } else {
        seguidas = 0;
        if (estado === TARDE) tarde++;
        else if (estado === EXCUSA) excusa++;
        else presente++;
      }
    }
    const asistencias = presente + tarde;
    const porcentaje = diasDeClase.length ? Math.round((asistencias / diasDeClase.length) * 100) : null;
    const alerta = (seguidasMax >= limites.umbralSeguidas || ausente >= limites.umbralAcumuladas)
      ? {
          seguidas: seguidasMax >= limites.umbralSeguidas ? seguidasMax : 0,
          acumuladas: ausente >= limites.umbralAcumuladas ? ausente : 0,
        }
      : null;
    filas.push({
      mat: estudiante.mat,
      no: estudiante.no,
      nombre: estudiante.nombre,
      presente,
      tarde,
      excusa,
      ausente,
      asistencias,
      porcentaje,
      seguidasMax,
      alerta,
    });
  }

  const totales = { diasDeClase: diasDeClase.length, presente: 0, tarde: 0, excusa: 0, ausente: 0 };
  for (const fila of filas) {
    totales.presente += fila.presente;
    totales.tarde += fila.tarde;
    totales.excusa += fila.excusa;
    totales.ausente += fila.ausente;
  }
  return { diasDeClase, filas, totales };
}

export function matrizDelMes({ estudiantes, diasDeClase, registros }) {
  const porFecha = indexarRegistros(registros);
  return (estudiantes || [])
    .filter((estudiante) => estudiante.estado !== "retirada")
    .map((estudiante) => ({
      mat: estudiante.mat,
      no: estudiante.no,
      nombre: estudiante.nombre,
      porDia: (diasDeClase || []).map((fecha) =>
        letraEstado(estadoDe(porFecha.get(fecha)?.get(String(estudiante.mat))))
      ),
    }));
}

function celdaCsv(valor) {
  const texto = valor == null ? "" : String(valor);
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function aCsv(filas) {
  return filas.map((fila) => fila.map(celdaCsv).join(";")).join("\r\n");
}

export function csvResumen(resumen, { curso, mes }) {
  const filas = [
    ["Curso", curso],
    ["Mes", mesHumano(mes)],
    [],
    ["Mat. No.", "No.", "Estudiante", "Días de clase", "Presente", "Tarde", "Excusa", "Ausente (Inas.)", "% Asistencia", "Alerta"],
  ];
  for (const fila of resumen.filas) {
    filas.push([
      fila.mat,
      fila.no,
      fila.nombre,
      resumen.totales.diasDeClase,
      fila.presente,
      fila.tarde,
      fila.excusa,
      fila.ausente,
      fila.porcentaje == null ? "" : fila.porcentaje,
      textoAlerta(fila.alerta),
    ]);
  }
  filas.push([
    "", "", "TOTAL DEL CURSO",
    resumen.totales.diasDeClase,
    resumen.totales.presente,
    resumen.totales.tarde,
    resumen.totales.excusa,
    resumen.totales.ausente,
    "", "",
  ]);
  return aCsv(filas);
}

export function csvMatriz(matriz, { curso, mes, diasDeClase }) {
  const filas = [
    ["Curso", curso],
    ["Mes", mesHumano(mes)],
    [],
    ["Mat. No.", "No.", "Estudiante", ...(diasDeClase || []).map((fecha) => Number(fecha.slice(8, 10)))],
  ];
  for (const fila of matriz) {
    filas.push([fila.mat, fila.no, fila.nombre, ...fila.porDia]);
  }
  return aCsv(filas);
}
