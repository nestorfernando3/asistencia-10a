// Datos del mes y documentos exportables (Excel con formato y CSV de planillas).
// Todo es puro: recibe los datos y devuelve estructuras o bytes.

import * as D from "../../src/dominio.js";
import { observacionesDelMes, diasSinClase, diaCorto, inicialDia } from "./analisis.js";
import { crearLibroXlsx, referencia } from "./libro-xlsx.js";

export function datosDelMes({ estudiantes, dias, registros, ajustes, mes }) {
  const resumen = D.resumenDelMes({ estudiantes, dias, registros, ajustes });
  const matriz = D.matrizDelMes({ estudiantes, diasDeClase: resumen.diasDeClase, registros });
  const porDia = D.estadisticasPorDia({ estudiantes, diasDeClase: resumen.diasDeClase, registros });
  const estadisticas = D.estadisticasDelMes({ estudiantes, resumen });
  const observaciones = observacionesDelMes({ estudiantes, registros, dias });
  const sinClase = diasSinClase(dias);
  return { mes, estudiantes, resumen, matriz, porDia, estadisticas, observaciones, sinClase };
}

export function nombreArchivo(curso, mes, extension, prefijo = "Asistencia") {
  const curso_ = curso.nombre.replace(/[°\s]/g, "").replace(/-/g, "");
  const sufijo = mes ? `_${D.mesHumano(mes).replace(" ", "_")}` : "";
  return `${prefijo}_${curso_}${sufijo}.${extension}`;
}

// ——— CSV compatibles con las planillas (mismo formato que la versión clásica) ———

const BOM = "﻿";

export function csvResumenDelMes(datos, curso) {
  return BOM + D.csvResumen(datos.resumen, { curso: curso.nombre, mes: datos.mes });
}

export function csvDetalleDelMes(datos, curso) {
  return BOM + D.csvMatriz(datos.matriz, { curso: curso.nombre, mes: datos.mes, diasDeClase: datos.resumen.diasDeClase });
}

export function csvListaDelCurso(estudiantes, curso) {
  return BOM + D.csvLista(estudiantes, { curso: curso.nombre });
}

// ——— Excel ———

const C = {
  marca: "1F5FA6",
  marcaOscura: "153F6E",
  marcaSuave: "E8F0FA",
  sol: "E4E33A",
  tinta: "1B2433",
  tinta2: "5A6475",
  tinta3: "8A93A3",
  linea: "E2DED3",
  cebra: "F8F6F0",
  blanco: "FFFFFF",
  rojo: "B83A26",
  rojoSuave: "FBE6E1",
  verde: "2E7D4F",
  verdeSuave: "E4F1E8",
  ambar: "A86B12",
  ambarSuave: "FBF0DA",
  violeta: "6A4FB5",
  violetaSuave: "EEE9FA",
};

const LINEA_FINA = ["thin", C.linea];

const E = {
  institucion: { negrita: true, tamano: 13, color: C.tinta, v: "bottom" },
  sub: { tamano: 9, color: C.tinta2 },
  titulo: { negrita: true, tamano: 12, color: C.marca },
  banda: { relleno: C.marca },
  bandaSol: { relleno: C.sol },
  seccion: { negrita: true, tamano: 11, color: C.marca, v: "bottom" },
  encabezado: { negrita: true, tamano: 9.5, color: C.blanco, relleno: C.marca, h: "center", ajustar: true, borde: { abajo: ["thin", C.marcaOscura], derecha: ["thin", "3C77B8"] } },
  encabezadoIzq: { negrita: true, tamano: 9.5, color: C.blanco, relleno: C.marca, h: "left", sangria: 1, borde: { abajo: ["thin", C.marcaOscura], derecha: ["thin", "3C77B8"] } },
  subEncabezado: { tamano: 8, color: C.marca, relleno: C.marcaSuave, h: "center", borde: { abajo: LINEA_FINA } },
  nota: { cursiva: true, tamano: 8.5, color: C.tinta3, ajustar: true, v: "top" },
};

function cuerpo(extra = {}, cebra = false) {
  return { tamano: 10, color: C.tinta, h: "center", borde: { abajo: LINEA_FINA }, ...(cebra ? { relleno: C.cebra } : {}), ...extra };
}

function totalEstilo(extra = {}) {
  return { negrita: true, tamano: 10, color: C.tinta, relleno: C.marcaSuave, h: "center", borde: { arriba: ["medium", C.marca], abajo: ["thin", C.marca] }, ...extra };
}

const LETRA = {
  P: { color: C.verde },
  A: { negrita: true, color: C.rojo, relleno: C.rojoSuave },
  T: { negrita: true, color: C.ambar, relleno: C.ambarSuave },
  E: { negrita: true, color: C.violeta, relleno: C.violetaSuave },
};

const fraccion = (porcentaje) => (porcentaje == null ? "—" : porcentaje / 100);

function celda(v, e) {
  return { v, e };
}

function vacias(cantidad, estilo) {
  return Array.from({ length: cantidad }, () => celda("", estilo));
}

// Membrete: escudo a la izquierda, datos institucionales y una banda azul y amarilla.
function membrete({ institucion, curso, titulo, generado, totalColumnas, columnaTexto }) {
  const ultima = totalColumnas - 1;
  const fila = (texto, estilo, alto) => {
    const celdas = vacias(totalColumnas, null);
    celdas[columnaTexto] = celda(texto, estilo);
    return { alto, celdas };
  };
  const banda = { alto: 5, celdas: Array.from({ length: totalColumnas }, (_, indice) => celda("", indice <= Math.max(1, Math.floor(ultima / 3)) ? E.bandaSol : E.banda)) };
  const filas = [
    fila(institucion.nombre.toUpperCase(), E.institucion, 22),
    fila(`${institucion.resolucion} · ${institucion.ciudad}`, E.sub, 15),
    fila(titulo, E.titulo, 20),
    fila(`Curso ${curso.nombre}${curso.docente ? ` · Docente: ${curso.docente}` : ""} · Generado el ${generado}`, E.sub, 15),
    banda,
    { alto: 10, celdas: [] },
  ];
  const combinar = [0, 1, 2, 3].map((indice) => `${referencia(columnaTexto, indice)}:${referencia(ultima, indice)}`);
  return { filas, combinar };
}

function imagenEscudo(escudo) {
  if (!escudo) return null;
  const alto = 64;
  return { clave: "escudo", columna: 0, fila: 0, desplazarX: 6, desplazarY: 6, alto, ancho: Math.round((alto * escudo.ancho) / escudo.alto) };
}

function hojaResumen(datos, contexto) {
  const { resumen, estadisticas } = datos;
  const columnas = [6, 10, 40, 9, 8, 8, 8, 10, 10, 36];
  const { filas, combinar } = membrete({ ...contexto, titulo: `Informe mensual de asistencia · ${D.mesHumano(datos.mes)}`, totalColumnas: columnas.length, columnaTexto: 2 });
  const filaEncabezado = filas.length;
  filas.push({
    alto: 30,
    celdas: [
      celda("No.", E.encabezado), celda("Mat. No.", E.encabezado), celda("Estudiante", E.encabezadoIzq),
      celda("Días de clase", E.encabezado), celda("Presente", E.encabezado), celda("Tarde", E.encabezado),
      celda("Excusa", E.encabezado), celda("Ausente (Inas.)", E.encabezado), celda("% Asistencia", E.encabezado),
      celda("Alerta", E.encabezadoIzq),
    ],
  });
  resumen.filas.forEach((fila, indice) => {
    const cebra = indice % 2 === 1;
    const extra = fila.alerta ? { relleno: C.rojoSuave } : {};
    const base = cuerpo(extra, cebra);
    filas.push({
      alto: 15.5,
      celdas: [
        celda(Number(fila.no) || fila.no, base),
        celda(Number(fila.mat) || fila.mat, { ...base, color: C.tinta2 }),
        celda(fila.nombre, { ...base, h: "left", sangria: 1 }),
        celda(resumen.totales.diasDeClase, base),
        celda(fila.presente, base),
        celda(fila.tarde, base),
        celda(fila.excusa, base),
        celda(fila.ausente, { ...base, negrita: true, color: fila.ausente ? C.rojo : C.tinta }),
        celda(fraccion(fila.porcentaje), { ...base, formato: "0%" }),
        celda(D.textoAlerta(fila.alerta), { ...base, h: "left", sangria: 1, negrita: true, color: C.rojo, tamano: 9 }),
      ],
    });
  });
  filas.push({
    alto: 20,
    celdas: [
      celda("", totalEstilo()), celda("", totalEstilo()), celda("TOTAL DEL CURSO", totalEstilo({ h: "left", sangria: 1 })),
      celda(resumen.totales.diasDeClase, totalEstilo()), celda(resumen.totales.presente, totalEstilo()),
      celda(resumen.totales.tarde, totalEstilo()), celda(resumen.totales.excusa, totalEstilo()),
      celda(resumen.totales.ausente, totalEstilo({ color: C.rojo })),
      celda(fraccion(estadisticas.porcentajeCurso), totalEstilo({ formato: "0%" })), celda("", totalEstilo()),
    ],
  });
  filas.push({ alto: 8, celdas: [] });
  const filaNota = filas.length;
  filas.push({
    alto: 30,
    celdas: [celda("Presente y Tarde cuentan como asistencia. Ausente es la falta sin justificar (columna «Inas.» de las planillas); Excusa es la falta justificada. % = (Presente + Tarde) ÷ días de clase. Alerta: 3 o más faltas seguidas o 5 o más en el mes.", E.nota)],
  });
  combinar.push(`${referencia(0, filaNota)}:${referencia(columnas.length - 1, filaNota)}`);
  return {
    nombre: "Resumen",
    columnas,
    filas,
    combinar,
    fijar: { filas: filaEncabezado + 1, columnas: 3 },
    imprimir: { titulos: [filaEncabezado, filaEncabezado], unaPagina: true },
    imagen: imagenEscudo(contexto.escudo),
    pie: `${contexto.institucion.nombreCorto} · Asistencia ${contexto.curso.nombre} · ${D.mesHumano(datos.mes)} · Uso interno`,
  };
}

function hojaDetalle(datos, contexto) {
  const { resumen, matriz, porDia } = datos;
  const dias = resumen.diasDeClase;
  const columnas = [10, 38, ...dias.map(() => 4.6), 8, 9];
  const total = columnas.length;
  const { filas, combinar } = membrete({ ...contexto, titulo: `Detalle por día · ${D.mesHumano(datos.mes)}`, totalColumnas: Math.max(total, 8), columnaTexto: 1 });
  const filaEncabezado = filas.length;
  filas.push({
    alto: 20,
    celdas: [
      celda("No.", E.encabezado), celda("Estudiante", E.encabezadoIzq),
      ...dias.map((fecha) => celda(Number(fecha.slice(8, 10)), E.encabezado)),
      celda("Inas.", E.encabezado), celda("% Asist.", E.encabezado),
    ],
  });
  filas.push({
    alto: 14,
    celdas: [celda("", E.subEncabezado), celda("", E.subEncabezado), ...dias.map((fecha) => celda(inicialDia(fecha), E.subEncabezado)), celda("", E.subEncabezado), celda("", E.subEncabezado)],
  });
  const porMat = new Map(resumen.filas.map((fila) => [String(fila.mat), fila]));
  matriz.forEach((fila, indice) => {
    const cebra = indice % 2 === 1;
    const resumenFila = porMat.get(String(fila.mat));
    filas.push({
      alto: 16,
      celdas: [
        celda(Number(fila.no) || fila.no, cuerpo({}, cebra)),
        celda(fila.nombre, cuerpo({ h: "left", sangria: 1 }, cebra)),
        ...fila.porDia.map((letra) => celda(letra, cuerpo({ tamano: 9, borde: { abajo: LINEA_FINA, derecha: ["hair", C.linea] }, ...LETRA[letra] }, cebra))),
        celda(resumenFila?.ausente ?? 0, cuerpo({ negrita: true, color: resumenFila?.ausente ? C.rojo : C.tinta }, cebra)),
        celda(fraccion(resumenFila?.porcentaje), cuerpo({ formato: "0%" }, cebra)),
      ],
    });
  });
  filas.push({
    alto: 18,
    celdas: [celda("", totalEstilo()), celda("Ausentes del día", totalEstilo({ h: "left", sangria: 1 })), ...porDia.map((dia) => celda(dia.ausente, totalEstilo({ color: dia.ausente ? C.rojo : C.tinta }))), celda(resumen.totales.ausente, totalEstilo({ color: C.rojo })), celda("", totalEstilo())],
  });
  filas.push({
    alto: 18,
    celdas: [celda("", totalEstilo()), celda("% asistencia del día", totalEstilo({ h: "left", sangria: 1 })), ...porDia.map((dia) => celda(fraccion(dia.porcentaje), totalEstilo({ formato: "0%", tamano: 8 }))), celda("", totalEstilo()), celda(fraccion(datos.estadisticas.porcentajeCurso), totalEstilo({ formato: "0%" }))],
  });
  filas.push({ alto: 8, celdas: [] });
  const filaNota = filas.length;
  filas.push({
    alto: 26,
    celdas: [celda(dias.length
      ? "Cada columna es un día de clase del mes (número del día e inicial del día de la semana). P presente · A ausente · T tarde · E excusa."
      : "Este mes todavía no tiene días de clase registrados.", E.nota)],
  });
  combinar.push(`${referencia(0, filaNota)}:${referencia(Math.max(total, 8) - 1, filaNota)}`);
  return {
    nombre: "Detalle por día",
    columnas,
    filas,
    combinar,
    fijar: { filas: filaEncabezado + 2, columnas: 2 },
    imprimir: { titulos: [filaEncabezado, filaEncabezado + 1], unaPagina: true },
    imagen: imagenEscudo(contexto.escudo),
    pie: `${contexto.institucion.nombreCorto} · Asistencia ${contexto.curso.nombre} · ${D.mesHumano(datos.mes)} · Uso interno`,
  };
}

function hojaEstadisticas(datos, contexto) {
  const { estadisticas, porDia, sinClase } = datos;
  const columnas = [12, 32, 13, 12, 12, 12, 13];
  const { filas, combinar } = membrete({ ...contexto, titulo: `Estadísticas del curso · ${D.mesHumano(datos.mes)}`, totalColumnas: columnas.length, columnaTexto: 1 });
  const seccion = (texto) => filas.push({ alto: 22, celdas: [celda(""), celda(texto, E.seccion)] });

  seccion("Indicadores del mes");
  const indicadores = [
    ["Días de clase", estadisticas.dias],
    ["Estudiantes activos", estadisticas.activos],
    ["Estudiantes retirados", estadisticas.retirados],
    ["Asistencia del curso", fraccion(estadisticas.porcentajeCurso), "0%"],
    ["Asistencias (Presente + Tarde)", estadisticas.asistencias],
    ["Faltas sin justificar (Inas.)", estadisticas.totales.ausente],
    ["Tardes", estadisticas.totales.tarde],
    ["Excusas", estadisticas.totales.excusa],
    ["Promedio de faltas por estudiante", estadisticas.promedioFaltas ?? "—", "0.0"],
    ["Estudiantes con alerta", estadisticas.conAlerta],
    ["Estudiantes sin faltas", estadisticas.sinFaltas],
  ];
  indicadores.forEach(([etiqueta, valor, formato], indice) => {
    const cebra = indice % 2 === 1;
    filas.push({
      alto: 18,
      celdas: [
        celda(""),
        celda(etiqueta, cuerpo({ h: "left", sangria: 1, color: C.tinta2 }, cebra)),
        celda(valor, cuerpo({ negrita: true, color: C.marca, tamano: 11, ...(formato ? { formato } : {}) }, cebra)),
      ],
    });
  });

  filas.push({ alto: 12, celdas: [] });
  seccion("Asistencia por día de clase");
  filas.push({
    alto: 22,
    celdas: [celda(""), celda("Fecha", E.encabezadoIzq), celda("Presentes", E.encabezado), celda("Tardes", E.encabezado), celda("Excusas", E.encabezado), celda("Ausentes", E.encabezado), celda("% Asistencia", E.encabezado)],
  });
  if (!porDia.length) {
    filas.push({ alto: 18, celdas: [celda(""), celda("Sin días de clase registrados.", E.nota)] });
  }
  porDia.forEach((dia, indice) => {
    const cebra = indice % 2 === 1;
    filas.push({
      alto: 17,
      celdas: [
        celda(""),
        celda(D.fechaHumana(dia.fecha).replace(/^./, (letra) => letra.toUpperCase()), cuerpo({ h: "left", sangria: 1 }, cebra)),
        celda(dia.presente, cuerpo({}, cebra)),
        celda(dia.tarde, cuerpo({}, cebra)),
        celda(dia.excusa, cuerpo({}, cebra)),
        celda(dia.ausente, cuerpo({ negrita: Boolean(dia.ausente), color: dia.ausente ? C.rojo : C.tinta }, cebra)),
        celda(fraccion(dia.porcentaje), cuerpo({ formato: "0%" }, cebra)),
      ],
    });
  });

  filas.push({ alto: 12, celdas: [] });
  seccion("Días sin clase");
  if (!sinClase.length) {
    filas.push({ alto: 18, celdas: [celda(""), celda("Ninguno en el mes.", E.nota)] });
  }
  sinClase.forEach((dia, indice) => {
    const numero = filas.length;
    filas.push({
      alto: 17,
      celdas: [
        celda(""),
        celda(D.fechaHumana(dia.fecha).replace(/^./, (letra) => letra.toUpperCase()), cuerpo({ h: "left", sangria: 1 }, indice % 2 === 1)),
        celda(dia.motivo || "Sin motivo registrado", cuerpo({ h: "left", sangria: 1, color: C.tinta2 }, indice % 2 === 1)),
        ...vacias(4, cuerpo({}, indice % 2 === 1)),
      ],
    });
    combinar.push(`${referencia(2, numero)}:${referencia(6, numero)}`);
  });

  return {
    nombre: "Estadísticas",
    columnas,
    filas,
    combinar,
    imprimir: { horizontal: false },
    imagen: imagenEscudo(contexto.escudo),
    pie: `${contexto.institucion.nombreCorto} · Asistencia ${contexto.curso.nombre} · ${D.mesHumano(datos.mes)} · Uso interno`,
  };
}

function hojaObservaciones(datos, contexto) {
  const columnas = [14, 6, 36, 11, 24, 62];
  const { filas, combinar } = membrete({ ...contexto, titulo: `Observaciones del mes · ${D.mesHumano(datos.mes)}`, totalColumnas: columnas.length, columnaTexto: 1 });
  const filaEncabezado = filas.length;
  filas.push({
    alto: 22,
    celdas: [celda("Fecha", E.encabezadoIzq), celda("No.", E.encabezado), celda("Estudiante", E.encabezadoIzq), celda("Estado", E.encabezado), celda("Etiquetas", E.encabezadoIzq), celda("Observación", E.encabezadoIzq)],
  });
  if (!datos.observaciones.length) {
    const numero = filas.length;
    filas.push({ alto: 20, celdas: [celda("No hay observaciones registradas en el mes.", E.nota)] });
    combinar.push(`${referencia(0, numero)}:${referencia(5, numero)}`);
  }
  datos.observaciones.forEach((obs, indice) => {
    const cebra = indice % 2 === 1;
    const letra = obs.estado ? D.letraEstado(obs.estado) : "";
    const lineas = Math.max(1, Math.ceil(obs.comentario.length / 70));
    filas.push({
      alto: Math.min(80, 6 + lineas * 13),
      celdas: [
        celda(diaCorto(obs.fecha), cuerpo({ h: "left", sangria: 1 }, cebra)),
        celda(obs.mat == null ? "" : Number(obs.no) || obs.no, cuerpo({}, cebra)),
        celda(obs.mat == null ? "Nota del día" : obs.nombre, cuerpo({ h: "left", sangria: 1, ...(obs.mat == null ? { cursiva: true, color: C.marca } : {}) }, cebra)),
        celda(obs.estado, cuerpo({ ...(letra && letra !== "P" ? LETRA[letra] : {}) }, cebra)),
        celda(obs.etiquetas.join(", "), cuerpo({ h: "left", sangria: 1, color: C.tinta2, tamano: 9, ajustar: true }, cebra)),
        celda(obs.comentario, cuerpo({ h: "left", sangria: 1, ajustar: true }, cebra)),
      ],
    });
  });
  return {
    nombre: "Observaciones",
    columnas,
    filas,
    combinar,
    fijar: { filas: filaEncabezado + 1 },
    imprimir: { titulos: [filaEncabezado, filaEncabezado] },
    imagen: imagenEscudo(contexto.escudo),
    pie: `${contexto.institucion.nombreCorto} · Asistencia ${contexto.curso.nombre} · ${D.mesHumano(datos.mes)} · Uso interno`,
  };
}

function hojaLista(datos, contexto) {
  const columnas = [7, 11, 42, 12, 50];
  const ordenados = [...datos.estudiantes].sort((a, b) => Number(a.no || 0) - Number(b.no || 0));
  const { filas, combinar } = membrete({ ...contexto, titulo: `Lista del curso · ${ordenados.filter((e) => e.estado !== "retirada").length} estudiantes activos`, totalColumnas: columnas.length, columnaTexto: 2 });
  const filaEncabezado = filas.length;
  filas.push({
    alto: 22,
    celdas: [celda("No.", E.encabezado), celda("Mat. No.", E.encabezado), celda("Estudiante", E.encabezadoIzq), celda("Estado", E.encabezado), celda("Nota persistente", E.encabezadoIzq)],
  });
  ordenados.forEach((estudiante, indice) => {
    const cebra = indice % 2 === 1;
    const retirada = estudiante.estado === "retirada";
    const tono = retirada ? { color: C.tinta3, cursiva: true } : {};
    filas.push({
      alto: 17,
      celdas: [
        celda(Number(estudiante.no) || estudiante.no, cuerpo(tono, cebra)),
        celda(Number(estudiante.mat) || estudiante.mat, cuerpo({ color: C.tinta2, ...tono }, cebra)),
        celda(estudiante.nombre, cuerpo({ h: "left", sangria: 1, ...tono }, cebra)),
        celda(retirada ? "Retirada" : "Activa", cuerpo(retirada ? tono : { color: C.verde }, cebra)),
        celda(estudiante.notaPersistente || "", cuerpo({ h: "left", sangria: 1, color: C.tinta2, ...tono }, cebra)),
      ],
    });
  });
  return {
    nombre: "Lista",
    columnas,
    filas,
    combinar,
    fijar: { filas: filaEncabezado + 1 },
    imprimir: { horizontal: false, titulos: [filaEncabezado, filaEncabezado] },
    imagen: imagenEscudo(contexto.escudo),
    pie: `${contexto.institucion.nombreCorto} · Lista ${contexto.curso.nombre} · Uso interno`,
  };
}

export function libroDelMes(datos, { institucion, curso, escudo = null, hoy = D.hoyClave() }) {
  const contexto = { institucion, curso, escudo, generado: D.fechaCortaHumana(hoy) };
  return {
    propiedades: { titulo: `Asistencia ${curso.nombre} · ${D.mesHumano(datos.mes)}`, autor: institucion.nombreCorto },
    imagenes: escudo ? { escudo } : {},
    hojas: [
      hojaResumen(datos, contexto),
      hojaDetalle(datos, contexto),
      hojaEstadisticas(datos, contexto),
      hojaObservaciones(datos, contexto),
      hojaLista(datos, contexto),
    ],
  };
}

export function excelDelMes(datos, opciones) {
  return crearLibroXlsx(libroDelMes(datos, opciones));
}

