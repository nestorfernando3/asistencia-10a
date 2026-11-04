import * as D from "./dominio.js";

const LIBRERIAS = [
  {
    src: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    integrity: "sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk",
  },
  {
    src: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
    integrity: "sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3",
  },
];
// Relativa a la página de la versión clásica (clasica/index.html).
const RUTA_LOGO = "../assets/institution/logo_colegio.png";

const COLOR = {
  azul: [30, 95, 168],
  amarillo: [231, 230, 54],
  texto: [20, 32, 46],
  suave: [91, 102, 117],
  tenue: [122, 134, 150],
  borde: [219, 226, 234],
  cebra: [247, 250, 253],
  azulClaro: [230, 241, 251],
  rojo: [179, 38, 30],
  rojoClaro: [253, 236, 234],
  verde: [30, 122, 60],
  ambar: [150, 97, 10],
  excusa: [46, 119, 188],
  blanco: [255, 255, 255],
};
const COLOR_LETRA = { P: COLOR.verde, A: COLOR.rojo, T: COLOR.ambar, E: COLOR.excusa };

const ANCHO = 297;
const ALTO = 210;
const MARGEN = 12;
const UTIL = ANCHO - MARGEN * 2;

let cargaLibrerias = null;
let cargaLogo = null;

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

export function prepararLibrerias() {
  if (!cargaLibrerias) {
    cargaLibrerias = (async () => {
      for (const libreria of LIBRERIAS) await cargarScript(libreria);
      if (!window.jspdf?.jsPDF) throw new Error("La librería de PDF no quedó disponible");
      return window.jspdf.jsPDF;
    })();
    cargaLibrerias.catch(() => {
      cargaLibrerias = null;
    });
  }
  if (!cargaLogo) {
    cargaLogo = fetch(RUTA_LOGO)
      .then((respuesta) => (respuesta.ok ? respuesta.blob() : null))
      .then((blob) => blob && new Promise((resolver) => {
        const lector = new FileReader();
        lector.onload = () => resolver(lector.result);
        lector.onerror = () => resolver(null);
        lector.readAsDataURL(blob);
      }))
      .catch(() => null);
  }
  return Promise.all([cargaLibrerias, cargaLogo]);
}

function porcentaje(valor) {
  return valor == null ? "—" : `${valor}%`;
}

function membrete(doc, { logo, mesTexto, generado }) {
  let xTexto = MARGEN;
  if (logo) {
    const propiedades = doc.getImageProperties(logo);
    const alto = 19;
    const ancho = (alto * propiedades.width) / propiedades.height;
    doc.addImage(logo, "PNG", MARGEN, 9, ancho, alto);
    xTexto = MARGEN + ancho + 4;
  }

  doc.setTextColor(...COLOR.texto);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text("INSTITUCIÓN EDUCATIVA DISTRITAL BRISAS DEL RÍO", xTexto, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR.suave);
  doc.text("Resolución 5256 de 2017 · Barranquilla, Atlántico", xTexto, 22);

  const derecha = ANCHO - MARGEN;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...COLOR.azul);
  doc.text("Informe mensual de asistencia", derecha, 14.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.suave);
  doc.text(`Curso 10°-A · ${mesTexto}`, derecha, 19.5, { align: "right" });
  doc.text(`Generado el ${generado}`, derecha, 24, { align: "right" });

  doc.setLineWidth(1);
  doc.setDrawColor(...COLOR.azul);
  doc.line(MARGEN, 31, ANCHO - MARGEN, 31);
  doc.setDrawColor(...COLOR.amarillo);
  doc.line(MARGEN, 31, MARGEN + UTIL * 0.32, 31);
  return 39;
}

function titulo(doc, texto, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...COLOR.azul);
  doc.text(texto, MARGEN, y);
  return y + 3;
}

function nota(doc, texto, y) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR.tenue);
  const lineas = doc.splitTextToSize(texto, UTIL);
  doc.text(lineas, MARGEN, y);
  return y + lineas.length * 3.2;
}

const ESTILO_TABLA = {
  theme: "plain",
  margin: { left: MARGEN, right: MARGEN, top: 14, bottom: 16 },
  styles: {
    font: "helvetica",
    fontSize: 8.5,
    textColor: COLOR.texto,
    cellPadding: { top: 1.4, bottom: 1.4, left: 1.6, right: 1.6 },
    lineColor: COLOR.borde,
    lineWidth: { bottom: 0.25 },
    halign: "center",
    valign: "middle",
  },
  headStyles: { fillColor: COLOR.azul, textColor: COLOR.blanco, fontStyle: "bold", fontSize: 8, lineWidth: 0 },
  footStyles: { fillColor: COLOR.azulClaro, textColor: COLOR.texto, fontStyle: "bold", lineColor: COLOR.azul, lineWidth: { top: 0.5 } },
  alternateRowStyles: { fillColor: COLOR.cebra },
  rowPageBreak: "avoid",
  showHead: "everyPage",
};

function estiloCompacto(filas, base) {
  if (filas <= 18) return base;
  return { ...base, fontSize: base.fontSize - 0.5, cellPadding: { ...base.cellPadding, top: 0.7, bottom: 0.7 } };
}

function tablaResumen(doc, { resumen, estadisticas }, y) {
  const filas = resumen.filas.map((fila) => [
    fila.no,
    fila.mat,
    fila.nombre,
    resumen.totales.diasDeClase,
    fila.presente,
    fila.tarde,
    fila.excusa,
    fila.ausente,
    porcentaje(fila.porcentaje),
    D.textoAlerta(fila.alerta),
  ]);
  doc.autoTable({
    ...ESTILO_TABLA,
    startY: y,
    styles: estiloCompacto(filas.length, ESTILO_TABLA.styles),
    head: [["No.", "Mat. No.", "Estudiante", "Días de clase", "P", "T", "E", "A (Inas.)", "% Asist.", "Alerta"]],
    body: filas,
    foot: [["", "", "TOTAL DEL CURSO", resumen.totales.diasDeClase, resumen.totales.presente, resumen.totales.tarde,
      resumen.totales.excusa, resumen.totales.ausente, porcentaje(estadisticas.porcentajeCurso), ""]],
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 17 },
      2: { halign: "left", cellWidth: 78 },
      3: { cellWidth: 20 },
      4: { cellWidth: 12 },
      5: { cellWidth: 12 },
      6: { cellWidth: 12 },
      7: { cellWidth: 18, fontStyle: "bold" },
      8: { cellWidth: 17 },
      9: { halign: "left", textColor: COLOR.rojo, fontStyle: "bold", fontSize: 7.5 },
    },
    didParseCell: (datos) => {
      if (datos.column.index === 2 || datos.column.index === 9) datos.cell.styles.halign = "left";
      if (datos.section === "body" && resumen.filas[datos.row.index]?.alerta) {
        datos.cell.styles.fillColor = COLOR.rojoClaro;
      }
    },
  });
  return doc.lastAutoTable.finalY + 5;
}

function tarjetas(doc, estadisticas, y) {
  const lista = [
    [estadisticas.dias, "Días de clase"],
    [porcentaje(estadisticas.porcentajeCurso), "Asistencia del curso"],
    [estadisticas.asistencias, "Asistencias (P + T)"],
    [estadisticas.totales.ausente, "Faltas (Inas.)"],
    [estadisticas.totales.tarde, "Tardes"],
    [estadisticas.totales.excusa, "Excusas"],
    [estadisticas.conAlerta, "Con alerta"],
    [estadisticas.sinFaltas, "Sin faltas"],
  ];
  const separacion = 3;
  const ancho = (UTIL - separacion * (lista.length - 1)) / lista.length;
  const alto = 16;
  lista.forEach(([valor, etiqueta], indice) => {
    const x = MARGEN + indice * (ancho + separacion);
    doc.setFillColor(...COLOR.cebra);
    doc.setDrawColor(207, 217, 230);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, ancho, alto, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...COLOR.azul);
    doc.text(String(valor), x + 3, y + 7.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...COLOR.suave);
    doc.text(doc.splitTextToSize(etiqueta.toUpperCase(), ancho - 6), x + 3, y + 12);
  });
  return y + alto + 9;
}

function tablaMatriz(doc, { resumen, matriz }, y) {
  if (!resumen.diasDeClase.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.suave);
    doc.text("Este mes todavía no tiene días de clase registrados.", MARGEN, y + 3);
    return y + 9;
  }
  const anchoDias = UTIL - 10 - 70;
  const anchoDia = Math.min(12, anchoDias / resumen.diasDeClase.length);
  doc.autoTable({
    ...ESTILO_TABLA,
    startY: y,
    styles: estiloCompacto(matriz.length, { ...ESTILO_TABLA.styles, fontSize: 7.5, cellPadding: { top: 1.1, bottom: 1.1, left: 0.6, right: 0.6 } }),
    head: [["No.", "Estudiante", ...resumen.diasDeClase.map((fecha) => String(Number(fecha.slice(8, 10))))]],
    body: matriz.map((fila) => [fila.no, fila.nombre, ...fila.porDia]),
    columnStyles: {
      0: { cellWidth: 10 },
      1: { halign: "left", cellWidth: 70 },
      ...Object.fromEntries(resumen.diasDeClase.map((_, indice) => [indice + 2, { cellWidth: anchoDia }])),
    },
    tableWidth: 80 + anchoDia * resumen.diasDeClase.length,
    didParseCell: (datos) => {
      if (datos.column.index === 1) datos.cell.styles.halign = "left";
      if (datos.section === "body" && datos.column.index >= 2) {
        const color = COLOR_LETRA[datos.cell.raw];
        if (color) {
          datos.cell.styles.textColor = color;
          datos.cell.styles.fontStyle = "bold";
        }
      }
    },
  });
  return doc.lastAutoTable.finalY + 5;
}

function pies(doc, mesTexto) {
  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina++) {
    doc.setPage(pagina);
    doc.setDrawColor(...COLOR.borde);
    doc.setLineWidth(0.25);
    doc.line(MARGEN, ALTO - 10, ANCHO - MARGEN, ALTO - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.tenue);
    doc.text("IED Brisas del Río · Asistencia 10°-A · documento de uso interno", MARGEN, ALTO - 6);
    doc.text(`${mesTexto} · Página ${pagina} de ${total}`, ANCHO - MARGEN, ALTO - 6, { align: "right" });
  }
}

export async function crearInformePdf({ mes, resumen, matriz, estadisticas }) {
  const [JsPdf, logo] = await prepararLibrerias();
  const mesTexto = D.mesHumano(mes);
  const generado = D.fechaCortaHumana(D.hoyClave());
  const doc = new JsPdf({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `Informe de asistencia 10°-A · ${mesTexto}`,
    subject: "Informe mensual de asistencia",
    author: "IED Brisas del Río",
    creator: "Asistencia 10°-A",
  });

  let y = membrete(doc, { logo, mesTexto, generado });
  y = titulo(doc, "Resumen del mes por estudiante", y);
  y = tablaResumen(doc, { resumen, estadisticas }, y);
  nota(doc, "P presente · T tarde · E excusa justificada · A ausencia sin justificar (columna «Inas.» de las planillas) · % = (P + T) ÷ días de clase.", y);

  doc.addPage();
  y = titulo(doc, "Estadísticas del curso", 18);
  y = tarjetas(doc, estadisticas, y + 1);
  y = titulo(doc, "Detalle por día", y);
  y = tablaMatriz(doc, { resumen, matriz }, y);
  if (resumen.diasDeClase.length) {
    nota(doc, "Cada columna es un día de clase del mes (número del día). Las letras siguen la misma convención del resumen.", y);
  }

  pies(doc, mesTexto);
  return doc.output("blob");
}

export function nombreInformePdf(mes) {
  return `Informe_Asistencia_10A_${D.mesHumano(mes).replace(" ", "_")}.pdf`;
}
