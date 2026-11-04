// Informe mensual de asistencia en PDF (A4 horizontal).
//
// jsPDF y jspdf-autotable viven en vendor/ (copias idénticas a las de cdnjs,
// verificadas con su hash SRI), así el informe no depende de un CDN externo.

import * as D from "./dominio.js";
import { inicialDia, nivelAsistencia, diaCorto } from "./analisis.js";

const LIBRERIAS = [
  { src: "vendor/jspdf.umd.min.js", integrity: "sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" },
  { src: "vendor/jspdf.plugin.autotable.min.js", integrity: "sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3" },
];

const C = {
  marca: [31, 95, 166],
  marcaOscura: [21, 63, 110],
  marcaSuave: [232, 240, 250],
  sol: [228, 227, 58],
  tinta: [27, 36, 51],
  tinta2: [90, 100, 117],
  tinta3: [138, 147, 163],
  linea: [226, 222, 211],
  cebra: [249, 248, 244],
  blanco: [255, 255, 255],
  rojo: [184, 58, 38],
  rojoSuave: [251, 230, 225],
  verde: [46, 125, 79],
  verdeSuave: [228, 241, 232],
  ambar: [168, 107, 18],
  ambarSuave: [251, 240, 218],
  violeta: [106, 79, 181],
  violetaSuave: [238, 233, 250],
};

const COLOR_LETRA = {
  P: { texto: C.verde, fondo: null },
  A: { texto: C.rojo, fondo: C.rojoSuave },
  T: { texto: C.ambar, fondo: C.ambarSuave },
  E: { texto: C.violeta, fondo: C.violetaSuave },
};

const COLOR_NIVEL = { alto: C.verde, medio: C.ambar, bajo: C.rojo, nulo: C.tinta3 };

const ANCHO = 297;
const ALTO = 210;
const M = 14;
const UTIL = ANCHO - M * 2;
const LIMITE_INFERIOR = ALTO - 16;

let cargaLibrerias = null;

function cargarScript({ src, integrity }) {
  return new Promise((resolver, rechazar) => {
    const script = document.createElement("script");
    script.src = src;
    script.integrity = integrity;
    script.crossOrigin = "anonymous";
    script.onload = resolver;
    script.onerror = () => {
      script.remove();
      rechazar(new Error(`No se pudo cargar ${src}`));
    };
    document.head.appendChild(script);
  });
}

export function prepararPdf() {
  if (!cargaLibrerias) {
    cargaLibrerias = (async () => {
      if (!window.jspdf?.jsPDF) {
        for (const libreria of LIBRERIAS) await cargarScript(libreria);
      }
      if (!window.jspdf?.jsPDF) throw new Error("La librería de PDF no quedó disponible");
      return window.jspdf.jsPDF;
    })();
    cargaLibrerias.catch(() => {
      cargaLibrerias = null;
    });
  }
  return cargaLibrerias;
}

const pct = (valor) => (valor == null ? "—" : `${valor} %`);

function texto(doc, contenido, x, y, { tamano = 9, color = C.tinta, negrita = false, alinear = "left", espaciado = 0 } = {}) {
  doc.setFont("helvetica", negrita ? "bold" : "normal");
  doc.setFontSize(tamano);
  doc.setTextColor(...color);
  doc.setCharSpace(espaciado);
  doc.text(String(contenido), x, y, { align: alinear });
  doc.setCharSpace(0);
}

// ——— Encabezados ———

function membrete(doc, { logo, institucion, curso, mesTexto, generado }) {
  let x = M;
  if (logo) {
    const props = doc.getImageProperties(logo);
    const alto = 21;
    const ancho = (alto * props.width) / props.height;
    doc.addImage(logo, "PNG", M, 10, ancho, alto, "escudo", "FAST");
    x = M + ancho + 5;
  }
  texto(doc, institucion.nombre.toUpperCase(), x, 17.5, { tamano: 12.5, negrita: true });
  texto(doc, `${institucion.resolucion} · ${institucion.ciudad}`, x, 23, { tamano: 8.5, color: C.tinta2 });
  if (curso.docente) texto(doc, `Docente: ${curso.docente}`, x, 27.5, { tamano: 8.5, color: C.tinta2 });

  const derecha = ANCHO - M;
  texto(doc, "INFORME MENSUAL DE ASISTENCIA", derecha, 14, { tamano: 7.5, negrita: true, color: C.marca, alinear: "right", espaciado: 0.4 });
  texto(doc, mesTexto, derecha, 22.5, { tamano: 19, negrita: true, alinear: "right" });
  texto(doc, `Curso ${curso.nombre} · Generado el ${generado}`, derecha, 28, { tamano: 8.5, color: C.tinta2, alinear: "right" });

  doc.setDrawColor(...C.marca);
  doc.setLineWidth(1.1);
  doc.line(M, 34, ANCHO - M, 34);
  doc.setDrawColor(...C.sol);
  doc.line(M, 34, M + UTIL * 0.3, 34);
  return 41;
}

function encabezadoCorrido(doc, { institucion, curso, mesTexto, paginasConEncabezado }) {
  const pagina = doc.internal.getCurrentPageInfo().pageNumber;
  if (pagina === 1 || paginasConEncabezado.has(pagina)) return 22;
  paginasConEncabezado.add(pagina);
  texto(doc, `${institucion.nombreCorto} · Informe de asistencia · Curso ${curso.nombre}`, M, 11, { tamano: 8, color: C.tinta2 });
  texto(doc, mesTexto, ANCHO - M, 11, { tamano: 8, negrita: true, color: C.marca, alinear: "right" });
  doc.setDrawColor(...C.linea);
  doc.setLineWidth(0.3);
  doc.line(M, 13.5, ANCHO - M, 13.5);
  return 22;
}

function titulo(doc, contenido, y, subtitulo = "") {
  doc.setFillColor(...C.sol);
  doc.rect(M, y - 3.6, 1.4, 4.6, "F");
  texto(doc, contenido, M + 3.5, y, { tamano: 11.5, negrita: true, color: C.marcaOscura });
  if (subtitulo) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    const ancho = doc.getTextWidth(contenido);
    texto(doc, subtitulo, M + 3.5 + ancho + 3, y, { tamano: 8.5, color: C.tinta3 });
  }
  return y + 4;
}

function nota(doc, contenido, y, ancho = UTIL, x = M) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.tinta3);
  const lineas = doc.splitTextToSize(contenido, ancho);
  doc.text(lineas, x, y);
  return y + lineas.length * 3.3;
}

// ——— Portada: indicadores, gráfico y alertas ———

function tarjetas(doc, { estadisticas }, y) {
  const lista = [
    { valor: pct(estadisticas.porcentajeCurso), etiqueta: "Asistencia del curso", detalle: "(Presente + Tarde) ÷ días", destacada: true },
    { valor: estadisticas.dias, etiqueta: "Días de clase", detalle: `${estadisticas.activos} estudiantes activos`, acento: C.marca },
    { valor: estadisticas.totales.ausente, etiqueta: "Faltas (Inas.)", detalle: `Promedio ${String(estadisticas.promedioFaltas ?? 0).replace(".", ",")} por estudiante`, acento: C.rojo },
    { valor: estadisticas.totales.excusa, etiqueta: "Excusas", detalle: "Faltas justificadas", acento: C.violeta },
    { valor: estadisticas.totales.tarde, etiqueta: "Tardes", detalle: "Cuentan como asistencia", acento: C.ambar },
    { valor: estadisticas.conAlerta, etiqueta: "Con alerta", detalle: `${estadisticas.sinFaltas} sin ninguna falta`, acento: estadisticas.conAlerta ? C.rojo : C.verde },
  ];
  const separacion = 3.5;
  const ancho = (UTIL - separacion * (lista.length - 1)) / lista.length;
  const alto = 25;
  lista.forEach((tarjeta, indice) => {
    const x = M + indice * (ancho + separacion);
    if (tarjeta.destacada) {
      doc.setFillColor(...C.marca);
      doc.roundedRect(x, y, ancho, alto, 2.2, 2.2, "F");
      doc.setFillColor(...C.sol);
      doc.rect(x + 4, y + 3.6, 6, 1, "F");
    } else {
      doc.setFillColor(...C.blanco);
      doc.setDrawColor(...C.linea);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, ancho, alto, 2.2, 2.2, "FD");
      doc.setFillColor(...tarjeta.acento);
      doc.rect(x + 4, y + 3.6, 6, 1, "F");
    }
    const claro = tarjeta.destacada;
    texto(doc, tarjeta.etiqueta.toUpperCase(), x + 4, y + 8.6, { tamano: 6.6, negrita: true, color: claro ? [205, 222, 243] : C.tinta2, espaciado: 0.2 });
    texto(doc, tarjeta.valor, x + 4, y + 17, { tamano: 17, negrita: true, color: claro ? C.blanco : C.tinta });
    texto(doc, tarjeta.detalle, x + 4, y + 21.6, { tamano: 6.6, color: claro ? [205, 222, 243] : C.tinta3 });
  });
  return y + alto + 9;
}

function techoAgradable(valor) {
  if (valor <= 4) return 4;
  if (valor <= 6) return 6;
  if (valor <= 8) return 8;
  if (valor <= 10) return 10;
  return Math.ceil(valor / 5) * 5;
}

function graficoNovedades(doc, { porDia }, x, y, ancho, alto) {
  y = titulo(doc, "Novedades por día de clase", y, "ausencias, excusas y llegadas tarde");
  const top = y + 4;
  const ejeX = x + 7;
  const anchoGrafico = ancho - 7;
  const altoGrafico = alto - 22;
  const base = top + altoGrafico;

  if (!porDia.length) {
    doc.setFillColor(...C.cebra);
    doc.roundedRect(x, top, ancho, altoGrafico, 2, 2, "F");
    texto(doc, "Este mes todavía no tiene días de clase registrados.", x + ancho / 2, top + altoGrafico / 2, { tamano: 9, color: C.tinta3, alinear: "center" });
    return;
  }

  const maximo = techoAgradable(Math.max(1, ...porDia.map((dia) => dia.ausente + dia.excusa + dia.tarde)));
  doc.setLineWidth(0.2);
  for (let paso = 0; paso <= 2; paso++) {
    const valor = (maximo / 2) * paso;
    const yLinea = base - (altoGrafico * paso) / 2;
    doc.setDrawColor(...(paso === 0 ? C.tinta3 : C.linea));
    if (paso > 0) doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(ejeX, yLinea, ejeX + anchoGrafico, yLinea);
    doc.setLineDashPattern([], 0);
    texto(doc, valor, ejeX - 2, yLinea + 1, { tamano: 6.5, color: C.tinta3, alinear: "right" });
  }

  const paso = anchoGrafico / porDia.length;
  const anchoBarra = Math.min(7, paso * 0.62);
  porDia.forEach((dia, indice) => {
    const centro = ejeX + paso * indice + paso / 2;
    let cima = base;
    for (const [cantidad, color] of [[dia.ausente, C.rojo], [dia.excusa, C.violeta], [dia.tarde, C.ambar]]) {
      if (!cantidad) continue;
      const altura = (altoGrafico * cantidad) / maximo;
      doc.setFillColor(...color);
      doc.rect(centro - anchoBarra / 2, cima - altura, anchoBarra, altura, "F");
      cima -= altura;
    }
    const total = dia.ausente + dia.excusa + dia.tarde;
    if (total) texto(doc, total, centro, cima - 1.2, { tamano: 6.5, negrita: true, color: C.tinta2, alinear: "center" });
    texto(doc, Number(dia.fecha.slice(8, 10)), centro, base + 4, { tamano: 6.8, color: C.tinta, alinear: "center" });
    texto(doc, inicialDia(dia.fecha), centro, base + 7.2, { tamano: 5.8, color: C.tinta3, alinear: "center" });
  });

  let xLeyenda = ejeX;
  const yLeyenda = base + 13;
  for (const [etiqueta, color] of [["Ausente", C.rojo], ["Excusa", C.violeta], ["Tarde", C.ambar]]) {
    doc.setFillColor(...color);
    doc.roundedRect(xLeyenda, yLeyenda - 2.4, 2.8, 2.8, 0.5, 0.5, "F");
    texto(doc, etiqueta, xLeyenda + 4, yLeyenda, { tamano: 7.2, color: C.tinta2 });
    xLeyenda += 22;
  }
}

function panelAtencion(doc, { resumen, sinClase }, x, y, ancho, alto) {
  doc.setFillColor(...C.cebra);
  doc.setDrawColor(...C.linea);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y - 6, ancho, alto + 4, 2.4, 2.4, "FD");
  const xi = x + 5;
  let yi = y + 1;
  texto(doc, "Requieren atención", xi, yi, { tamano: 10.5, negrita: true, color: C.marcaOscura });
  yi += 6;
  const conAlerta = resumen.filas.filter((fila) => fila.alerta);
  if (!conAlerta.length) {
    yi = nota(doc, "Ningún estudiante alcanzó los umbrales de alerta este mes (3 o más faltas seguidas, o 5 o más en el mes).", yi, ancho - 10, xi) + 2;
  } else {
    const maximo = 7;
    for (const fila of conAlerta.slice(0, maximo)) {
      doc.setFillColor(...C.rojo);
      doc.circle(xi + 1, yi - 1.1, 0.9, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.8);
      const nombre = doc.splitTextToSize(fila.nombre, ancho - 14)[0];
      texto(doc, nombre, xi + 4, yi, { tamano: 7.8, negrita: true });
      texto(doc, D.textoAlerta(fila.alerta), xi + 4, yi + 3.6, { tamano: 7, color: C.rojo });
      yi += 8.4;
    }
    if (conAlerta.length > maximo) {
      texto(doc, `y ${conAlerta.length - maximo} más (ver tabla por estudiante).`, xi + 4, yi, { tamano: 7, color: C.tinta3 });
      yi += 5;
    }
  }

  yi += 2;
  doc.setDrawColor(...C.linea);
  doc.line(xi, yi - 3, x + ancho - 5, yi - 3);
  texto(doc, "Días sin clase", xi, yi + 2, { tamano: 9, negrita: true, color: C.marcaOscura });
  yi += 7;
  if (!sinClase.length) {
    texto(doc, "Ninguno en el mes.", xi, yi, { tamano: 7.5, color: C.tinta3 });
  } else {
    for (const dia of sinClase.slice(0, 10)) {
      texto(doc, diaCorto(dia.fecha), xi, yi, { tamano: 7.5, negrita: true, color: C.tinta2 });
      texto(doc, dia.motivo || "Sin motivo registrado", xi + 15, yi, { tamano: 7.5, color: C.tinta2 });
      yi += 4.2;
    }
    if (sinClase.length > 10) texto(doc, `y ${sinClase.length - 10} más.`, xi, yi, { tamano: 7, color: C.tinta3 });
  }
}

// ——— Tablas ———

const ESTILO = {
  theme: "plain",
  margin: { left: M, right: M, top: 20, bottom: 18 },
  styles: {
    font: "helvetica",
    fontSize: 8.4,
    textColor: C.tinta,
    cellPadding: { top: 1.35, bottom: 1.35, left: 1.8, right: 1.8 },
    lineColor: C.linea,
    lineWidth: { bottom: 0.2 },
    halign: "center",
    valign: "middle",
  },
  headStyles: { fillColor: C.marca, textColor: C.blanco, fontStyle: "bold", fontSize: 7.6, lineWidth: 0, cellPadding: { top: 2.2, bottom: 2.2, left: 1.8, right: 1.8 } },
  footStyles: { fillColor: C.marcaSuave, textColor: C.tinta, fontStyle: "bold", lineColor: C.marca, lineWidth: { top: 0.5 } },
  alternateRowStyles: { fillColor: C.cebra },
  rowPageBreak: "avoid",
  showHead: "everyPage",
  showFoot: "lastPage",
};

// Ajusta tipografía y relleno para que `filas` quepan en `disponible` milímetros.
// Si ni con el mínimo caben, la tabla continúa en la página siguiente.
function ajustarAFilas(estilos, filas, disponible, { maximo = 1.6, minimoFuente = 6.8 } = {}) {
  let fuente = estilos.fontSize;
  const altoLinea = (tamano) => tamano * 0.3528 * 1.15;
  let relleno = (disponible / Math.max(1, filas) - altoLinea(fuente)) / 2;
  while (relleno < 0.45 && fuente > minimoFuente) {
    fuente = Math.max(minimoFuente, fuente - 0.2);
    relleno = (disponible / Math.max(1, filas) - altoLinea(fuente)) / 2;
  }
  relleno = Math.min(maximo, Math.max(0.45, relleno));
  return { ...estilos, fontSize: fuente, cellPadding: { ...estilos.cellPadding, top: relleno, bottom: relleno } };
}

function tablaResumen(doc, { resumen, estadisticas }, y, contexto) {
  const COLUMNA_PCT = 8;
  const disponible = LIMITE_INFERIOR - 9 - y - 11;
  doc.autoTable({
    ...ESTILO,
    startY: y,
    styles: ajustarAFilas(ESTILO.styles, resumen.filas.length + 1, disponible, { maximo: 1.7 }),
    head: [["No.", "Mat. No.", "Estudiante", "Días", "Presente", "Tarde", "Excusa", "Ausente (Inas.)", "% de asistencia", "Alerta"]],
    body: resumen.filas.map((fila) => [
      fila.no, fila.mat, fila.nombre, resumen.totales.diasDeClase, fila.presente, fila.tarde, fila.excusa, fila.ausente,
      fila.porcentaje, D.textoAlerta(fila.alerta),
    ]),
    foot: [["", "", "TOTAL DEL CURSO", resumen.totales.diasDeClase, resumen.totales.presente, resumen.totales.tarde,
      resumen.totales.excusa, resumen.totales.ausente, estadisticas.porcentajeCurso, ""]],
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 16, textColor: C.tinta2 },
      2: { halign: "left", cellWidth: 74 },
      3: { cellWidth: 12 },
      4: { cellWidth: 16 },
      5: { cellWidth: 13 },
      6: { cellWidth: 14 },
      7: { cellWidth: 21, fontStyle: "bold" },
      8: { cellWidth: 40 },
      9: { halign: "left", textColor: C.rojo, fontStyle: "bold", fontSize: 7.4 },
    },
    didParseCell: (celda) => {
      if (celda.column.index === 2 || celda.column.index === 9) celda.cell.styles.halign = "left";
      if (celda.column.index === COLUMNA_PCT && celda.section !== "head") celda.cell.text = [""];
      if (celda.section === "body") {
        const fila = resumen.filas[celda.row.index];
        if (fila?.alerta) celda.cell.styles.fillColor = C.rojoSuave;
        if (celda.column.index === 7 && fila?.ausente) celda.cell.styles.textColor = C.rojo;
      }
      if (celda.section === "foot" && celda.column.index === 7) celda.cell.styles.textColor = C.rojo;
    },
    didDrawCell: (celda) => {
      if (celda.column.index !== COLUMNA_PCT || celda.section === "head") return;
      const valor = celda.cell.raw;
      const { x, y: yCelda, width, height } = celda.cell;
      const centroY = yCelda + height / 2;
      const color = COLOR_NIVEL[nivelAsistencia(valor)];
      texto(doc, pct(valor), x + 12.5, centroY + 1.1, { tamano: 8, negrita: true, color: celda.section === "foot" ? C.tinta : color, alinear: "right" });
      if (valor == null) return;
      const xBarra = x + 15;
      const anchoBarra = width - 18;
      doc.setFillColor(...C.linea);
      doc.roundedRect(xBarra, centroY - 0.9, anchoBarra, 1.8, 0.9, 0.9, "F");
      doc.setFillColor(...color);
      doc.roundedRect(xBarra, centroY - 0.9, Math.max(1.8, (anchoBarra * valor) / 100), 1.8, 0.9, 0.9, "F");
    },
    didDrawPage: () => encabezadoCorrido(doc, contexto),
  });
  return doc.lastAutoTable.finalY + 5;
}

function tablaMatriz(doc, { resumen, matriz }, y, contexto, reserva) {
  const dias = resumen.diasDeClase;
  if (!dias.length) {
    texto(doc, "Este mes todavía no tiene días de clase registrados.", M, y + 4, { tamano: 9, color: C.tinta3 });
    return y + 10;
  }
  const fijas = 9 + 64 + 13 + 15;
  const anchoDia = Math.min(9.5, (UTIL - fijas) / dias.length);
  const porMat = new Map(resumen.filas.map((fila) => [String(fila.mat), fila]));
  const totalColumnas = dias.length + 4;
  const estilos = ajustarAFilas({ ...ESTILO.styles, fontSize: 7.4, cellPadding: { top: 1.25, bottom: 1.25, left: 0.4, right: 0.4 } }, matriz.length, LIMITE_INFERIOR - reserva - y - 11, { maximo: 1.5, minimoFuente: 6.6 });
  doc.autoTable({
    ...ESTILO,
    startY: y,
    tableWidth: fijas + anchoDia * dias.length,
    styles: estilos,
    head: [[
      "No.", "Estudiante",
      ...dias.map((fecha) => `${Number(fecha.slice(8, 10))}\n${inicialDia(fecha)}`),
      "Inas.", "% Asist.",
    ]],
    body: matriz.map((fila) => {
      const resumenFila = porMat.get(String(fila.mat));
      return [fila.no, fila.nombre, ...fila.porDia, resumenFila?.ausente ?? 0, pct(resumenFila?.porcentaje)];
    }),
    columnStyles: {
      0: { cellWidth: 9 },
      1: { halign: "left", cellWidth: 64, cellPadding: { ...estilos.cellPadding, left: 1.8, right: 1 } },
      ...Object.fromEntries(dias.map((_, indice) => [indice + 2, { cellWidth: anchoDia }])),
      [totalColumnas - 2]: { cellWidth: 13, fontStyle: "bold" },
      [totalColumnas - 1]: { cellWidth: 15 },
    },
    didParseCell: (celda) => {
      if (celda.column.index === 1) celda.cell.styles.halign = "left";
      if (celda.section !== "body") return;
      const indice = celda.column.index;
      if (indice >= 2 && indice < totalColumnas - 2) {
        const color = COLOR_LETRA[celda.cell.raw];
        if (!color) return;
        celda.cell.styles.textColor = color.texto;
        celda.cell.styles.fontStyle = celda.cell.raw === "P" ? "normal" : "bold";
        if (color.fondo) celda.cell.styles.fillColor = color.fondo;
      }
      if (indice === totalColumnas - 2 && Number(celda.cell.raw) > 0) celda.cell.styles.textColor = C.rojo;
    },
    didDrawPage: () => encabezadoCorrido(doc, contexto),
  });
  return doc.lastAutoTable.finalY + 5;
}

function tablaObservaciones(doc, { observaciones }, y, contexto) {
  if (!observaciones.length) {
    texto(doc, "No hay observaciones registradas en el mes.", M, y + 4, { tamano: 9, color: C.tinta3 });
    return y + 10;
  }
  doc.autoTable({
    ...ESTILO,
    startY: y,
    rowPageBreak: "auto",
    head: [["Fecha", "No.", "Estudiante", "Estado", "Etiquetas", "Observación"]],
    body: observaciones.map((obs) => [
      diaCorto(obs.fecha), obs.mat == null ? "" : obs.no, obs.mat == null ? "Nota del día" : obs.nombre, obs.estado,
      obs.etiquetas.join(", "), obs.comentario,
    ]),
    columnStyles: {
      0: { cellWidth: 16, halign: "left" },
      1: { cellWidth: 9 },
      2: { cellWidth: 70, halign: "left" },
      3: { cellWidth: 18 },
      4: { cellWidth: 38, halign: "left", textColor: C.tinta2, fontSize: 7.6 },
      5: { halign: "left" },
    },
    didParseCell: (celda) => {
      if ([0, 2, 4, 5].includes(celda.column.index)) celda.cell.styles.halign = "left";
      if (celda.section !== "body") return;
      const obs = observaciones[celda.row.index];
      if (celda.column.index === 2 && obs?.mat == null) {
        celda.cell.styles.textColor = C.marca;
        celda.cell.styles.fontStyle = "italic";
      }
      if (celda.column.index === 3 && obs?.estado) {
        const color = COLOR_LETRA[D.letraEstado(obs.estado)];
        if (color && obs.estado !== D.PRESENTE) {
          celda.cell.styles.textColor = color.texto;
          celda.cell.styles.fontStyle = "bold";
        }
      }
    },
    didDrawPage: () => encabezadoCorrido(doc, contexto),
  });
  return doc.lastAutoTable.finalY + 5;
}

function leyendaEstados(doc, y) {
  let x = M;
  for (const [letra, etiqueta] of [["P", "Presente"], ["A", "Ausente (Inas.)"], ["T", "Tarde"], ["E", "Excusa"]]) {
    const color = COLOR_LETRA[letra];
    doc.setFillColor(...(color.fondo || C.verdeSuave));
    doc.roundedRect(x, y - 3, 5, 4.2, 0.8, 0.8, "F");
    texto(doc, letra, x + 2.5, y, { tamano: 7.2, negrita: true, color: color.texto, alinear: "center" });
    texto(doc, etiqueta, x + 6.8, y, { tamano: 7.4, color: C.tinta2 });
    x += 12 + doc.getTextWidth(etiqueta);
  }
  return y + 5;
}

function firmas(doc, y, contexto) {
  const { curso } = contexto;
  if (y > LIMITE_INFERIOR - 24) {
    doc.addPage();
    y = encabezadoCorrido(doc, contexto) + 10;
  }
  const yLinea = Math.max(y + 12, LIMITE_INFERIOR - 12);
  const anchoFirma = 78;
  const columnas = [M + 20, ANCHO - M - 20 - anchoFirma];
  const etiquetas = [
    ["Docente", curso.docente || ""],
    ["Vo. Bo. Coordinación", ""],
  ];
  doc.setDrawColor(...C.tinta2);
  doc.setLineWidth(0.3);
  columnas.forEach((x, indice) => {
    doc.line(x, yLinea, x + anchoFirma, yLinea);
    texto(doc, etiquetas[indice][0], x + anchoFirma / 2, yLinea + 4.5, { tamano: 8, negrita: true, color: C.tinta2, alinear: "center" });
    if (etiquetas[indice][1]) texto(doc, etiquetas[indice][1], x + anchoFirma / 2, yLinea + 8.5, { tamano: 7.5, color: C.tinta3, alinear: "center" });
  });
}

function pies(doc, { institucion, curso, mesTexto }) {
  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina++) {
    doc.setPage(pagina);
    doc.setDrawColor(...C.linea);
    doc.setLineWidth(0.3);
    doc.line(M, ALTO - 11, ANCHO - M, ALTO - 11);
    texto(doc, `${institucion.nombreCorto} · Asistencia ${curso.nombre} · Documento de uso interno`, M, ALTO - 6.8, { tamano: 7.2, color: C.tinta3 });
    texto(doc, `${mesTexto} · Página ${pagina} de ${total}`, ANCHO - M, ALTO - 6.8, { tamano: 7.2, color: C.tinta3, alinear: "right" });
  }
}

export function construirInformePdf(JsPdf, { datos, institucion, curso, logo = null, incluirObservaciones = false, hoy = D.hoyClave() }) {
  const mesTexto = D.mesHumano(datos.mes);
  const contexto = { institucion, curso, mesTexto, generado: D.fechaCortaHumana(hoy), logo, paginasConEncabezado: new Set() };
  const doc = new JsPdf({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `Informe de asistencia ${curso.nombre} · ${mesTexto}`,
    subject: "Informe mensual de asistencia",
    author: institucion.nombreCorto,
    creator: `Asistencia ${curso.nombre}`,
  });

  // Página 1: panorama del mes.
  let y = membrete(doc, contexto);
  y = tarjetas(doc, datos, y);
  const anchoPanel = 86;
  const altoBloque = LIMITE_INFERIOR - y - 4;
  graficoNovedades(doc, datos, M, y, UTIL - anchoPanel - 8, altoBloque);
  panelAtencion(doc, datos, ANCHO - M - anchoPanel, y, anchoPanel, altoBloque);

  // Página 2: resumen por estudiante.
  doc.addPage();
  y = encabezadoCorrido(doc, contexto);
  y = titulo(doc, "Resumen del mes por estudiante", y + 2);
  y = tablaResumen(doc, datos, y + 1, contexto);
  nota(doc, "Presente y Tarde cuentan como asistencia · Ausente es la falta sin justificar (columna «Inas.» de las planillas) · Excusa es la falta justificada · % = (Presente + Tarde) ÷ días de clase · Alerta: 3 o más faltas seguidas o 5 o más en el mes.", y);

  // Página 3: detalle por día.
  doc.addPage();
  y = encabezadoCorrido(doc, contexto);
  y = titulo(doc, "Detalle por día", y + 2, "cada columna es un día de clase del mes");
  // Sin observaciones, se reserva espacio para que las firmas queden en esta misma hoja.
  y = tablaMatriz(doc, datos, y + 1, contexto, incluirObservaciones ? 8 : 40);
  if (datos.resumen.diasDeClase.length) y = leyendaEstados(doc, y + 1);

  if (incluirObservaciones) {
    doc.addPage();
    y = encabezadoCorrido(doc, contexto);
    y = titulo(doc, "Observaciones del mes", y + 2, "comentarios por estudiante y notas del día");
    y = tablaObservaciones(doc, datos, y + 1, contexto);
  }

  firmas(doc, y, contexto);
  pies(doc, contexto);
  return doc;
}

export async function crearInformePdf(opciones) {
  const JsPdf = await prepararPdf();
  return construirInformePdf(JsPdf, opciones).output("blob");
}
