// Generador de libros Excel (.xlsx) con formato, sin dependencias.
//
// Admite estilos por celda (fuente, relleno, bordes, alineación, formato numérico),
// anchos de columna, alto de filas, celdas combinadas, paneles inmovilizados,
// imagen incrustada (escudo), filas de título para impresión y página horizontal
// ajustada al ancho.
//
// Descriptor de estilo: { negrita, cursiva, tamano, color, relleno, borde, h, v, ajustar, formato }
//   color/relleno: "RRGGBB"; borde: { abajo: ["thin", "RRGGBB"], arriba, izquierda, derecha } o "rejilla".

const EMU_POR_PIXEL = 9525;
const HORA_DOS = 24576;
const FECHA_DOS = 23886;

function letraColumna(indice) {
  let letra = "";
  let numero = indice + 1;
  while (numero > 0) {
    const resto = (numero - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    numero = Math.floor((numero - 1) / 26);
  }
  return letra;
}

export function referencia(columna, fila) {
  return `${letraColumna(columna)}${fila + 1}`;
}

function xml(valor) {
  return String(valor)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[&<>"']/g, (caracter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[caracter]));
}

const ENCABEZADO_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

// ——— Estilos ———

function crearRegistroEstilos() {
  const fuentes = ['<font><sz val="10"/><color rgb="FF1B2433"/><name val="Calibri"/><family val="2"/></font>'];
  const rellenos = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const bordes = ["<border><left/><right/><top/><bottom/><diagonal/></border>"];
  const formatos = [];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const indices = new Map();

  const buscar = (lista, texto) => {
    let indice = lista.indexOf(texto);
    if (indice < 0) {
      lista.push(texto);
      indice = lista.length - 1;
    }
    return indice;
  };

  function fuente(estilo) {
    const partes = [];
    if (estilo.negrita) partes.push("<b/>");
    if (estilo.cursiva) partes.push("<i/>");
    partes.push(`<sz val="${estilo.tamano || 10}"/>`);
    partes.push(`<color rgb="FF${estilo.color || "1B2433"}"/>`);
    partes.push('<name val="Calibri"/><family val="2"/>');
    return buscar(fuentes, `<font>${partes.join("")}</font>`);
  }

  function relleno(estilo) {
    if (!estilo.relleno) return 0;
    return buscar(rellenos, `<fill><patternFill patternType="solid"><fgColor rgb="FF${estilo.relleno}"/><bgColor indexed="64"/></patternFill></fill>`);
  }

  function borde(estilo) {
    let definicion = estilo.borde;
    if (!definicion) return 0;
    if (definicion === "rejilla") {
      const fino = ["thin", "D9D4C7"];
      definicion = { izquierda: fino, derecha: fino, arriba: fino, abajo: fino };
    }
    const lado = (etiqueta, valor) => (valor
      ? `<${etiqueta} style="${valor[0]}"><color rgb="FF${valor[1]}"/></${etiqueta}>`
      : `<${etiqueta}/>`);
    return buscar(bordes, `<border>${lado("left", definicion.izquierda)}${lado("right", definicion.derecha)}${lado("top", definicion.arriba)}${lado("bottom", definicion.abajo)}<diagonal/></border>`);
  }

  function formato(estilo) {
    if (!estilo.formato) return 0;
    const integrados = { "0": 1, "0.00": 2, "0%": 9, "0.00%": 10 };
    if (integrados[estilo.formato] !== undefined) return integrados[estilo.formato];
    const existente = formatos.findIndex((otro) => otro.codigo === estilo.formato);
    if (existente >= 0) return formatos[existente].id;
    const id = 164 + formatos.length;
    formatos.push({ id, codigo: estilo.formato });
    return id;
  }

  return {
    indice(estilo) {
      if (!estilo) return 0;
      const clave = JSON.stringify(estilo);
      if (indices.has(clave)) return indices.get(clave);
      const atributos = [
        `numFmtId="${formato(estilo)}"`,
        `fontId="${fuente(estilo)}"`,
        `fillId="${relleno(estilo)}"`,
        `borderId="${borde(estilo)}"`,
        'xfId="0"',
        'applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"',
      ];
      const alineacion = [];
      if (estilo.h) alineacion.push(`horizontal="${estilo.h}"`);
      alineacion.push(`vertical="${estilo.v || "center"}"`);
      if (estilo.ajustar) alineacion.push('wrapText="1"');
      if (estilo.sangria) alineacion.push(`indent="${estilo.sangria}"`);
      xfs.push(`<xf ${atributos.join(" ")}><alignment ${alineacion.join(" ")}/></xf>`);
      const indice = xfs.length - 1;
      indices.set(clave, indice);
      return indice;
    },
    xml() {
      const numFmts = formatos.length
        ? `<numFmts count="${formatos.length}">${formatos.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${xml(f.codigo)}"/>`).join("")}</numFmts>`
        : "";
      return `${ENCABEZADO_XML}<styleSheet xmlns="${NS_MAIN}">${numFmts}`
        + `<fonts count="${fuentes.length}">${fuentes.join("")}</fonts>`
        + `<fills count="${rellenos.length}">${rellenos.join("")}</fills>`
        + `<borders count="${bordes.length}">${bordes.join("")}</borders>`
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>`
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>'
        + "</styleSheet>";
    },
  };
}

// ——— Hojas ———

function celdaXml(ref, celda, estilos) {
  const valor = celda && typeof celda === "object" && !Array.isArray(celda) ? celda.v : celda;
  const estilo = celda && typeof celda === "object" ? celda.e : null;
  const s = estilo ? ` s="${estilos.indice(estilo)}"` : "";
  if (valor === null || valor === undefined || valor === "") return `<c r="${ref}"${s}/>`;
  if (typeof valor === "number" && Number.isFinite(valor)) return `<c r="${ref}"${s}><v>${valor}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(valor)}</t></is></c>`;
}

function hojaXml(hoja, indiceHoja, estilos, conDibujo) {
  const filas = hoja.filas || [];
  let maxColumna = Math.max(0, (hoja.columnas || []).length - 1);
  const filasXml = filas.map((fila, indice) => {
    if (!fila) return "";
    const celdas = fila.celdas || [];
    maxColumna = Math.max(maxColumna, celdas.length - 1);
    const contenido = celdas.map((celda, columna) => (celda === undefined ? "" : celdaXml(referencia(columna, indice), celda, estilos))).join("");
    const alto = fila.alto ? ` ht="${fila.alto}" customHeight="1"` : "";
    return `<row r="${indice + 1}"${alto}>${contenido}</row>`;
  }).join("");

  const dimension = `A1:${referencia(maxColumna, Math.max(0, filas.length - 1))}`;
  const fijar = hoja.fijar || null;
  let panel = "";
  if (fijar && (fijar.filas || fijar.columnas)) {
    const activo = fijar.filas && fijar.columnas ? "bottomRight" : fijar.filas ? "bottomLeft" : "topRight";
    const division = [
      fijar.columnas ? `xSplit="${fijar.columnas}"` : "",
      fijar.filas ? `ySplit="${fijar.filas}"` : "",
    ].filter(Boolean).join(" ");
    panel = `<pane ${division} topLeftCell="${referencia(fijar.columnas || 0, fijar.filas || 0)}" activePane="${activo}" state="frozen"/><selection pane="${activo}"/>`;
  }
  const vista = `<sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="${hoja.zoom || 100}"${indiceHoja === 0 ? ' tabSelected="1"' : ""}>${panel}</sheetView></sheetViews>`;
  const columnas = (hoja.columnas || []).length
    ? `<cols>${hoja.columnas.map((ancho, indice) => `<col min="${indice + 1}" max="${indice + 1}" width="${ancho}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const combinar = (hoja.combinar || []).length
    ? `<mergeCells count="${hoja.combinar.length}">${hoja.combinar.map((rango) => `<mergeCell ref="${rango}"/>`).join("")}</mergeCells>`
    : "";
  const horizontal = hoja.imprimir?.horizontal !== false;
  const margenes = '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.25" footer="0.3"/>';
  const pagina = `<pageSetup paperSize="9" orientation="${horizontal ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="${hoja.imprimir?.unaPagina ? 1 : 0}"/>`;
  const pie = hoja.pie
    ? `<headerFooter><oddFooter>${xml(`&L&8${hoja.pie}&R&8Página &P de &N`)}</oddFooter></headerFooter>`
    : "";
  const dibujo = conDibujo ? '<drawing r:id="rId1"/>' : "";

  return `${ENCABEZADO_XML}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">`
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    + `<dimension ref="${dimension}"/>${vista}<sheetFormatPr defaultRowHeight="15"/>${columnas}`
    + `<sheetData>${filasXml}</sheetData>${combinar}${margenes}${pagina}${pie}${dibujo}</worksheet>`;
}

function dibujoXml(imagen) {
  const ancho = Math.round(imagen.ancho * EMU_POR_PIXEL);
  const alto = Math.round(imagen.alto * EMU_POR_PIXEL);
  return `${ENCABEZADO_XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${NS_REL}">`
    + "<xdr:oneCellAnchor>"
    + `<xdr:from><xdr:col>${imagen.columna || 0}</xdr:col><xdr:colOff>${Math.round((imagen.desplazarX || 0) * EMU_POR_PIXEL)}</xdr:colOff><xdr:row>${imagen.fila || 0}</xdr:row><xdr:rowOff>${Math.round((imagen.desplazarY || 0) * EMU_POR_PIXEL)}</xdr:rowOff></xdr:from>`
    + `<xdr:ext cx="${ancho}" cy="${alto}"/>`
    + '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Escudo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
    + '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
    + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${ancho}" cy="${alto}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`
    + "<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>";
}

function relaciones(lista) {
  return `${ENCABEZADO_XML}<Relationships xmlns="${NS_PKG_REL}">${lista.map(([id, tipo, destino]) => `<Relationship Id="${id}" Type="${tipo}" Target="${destino}"/>`).join("")}</Relationships>`;
}

const TIPO_REL = {
  documento: `${NS_REL}/officeDocument`,
  hoja: `${NS_REL}/worksheet`,
  estilos: `${NS_REL}/styles`,
  dibujo: `${NS_REL}/drawing`,
  imagen: `${NS_REL}/image`,
  core: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  app: `${NS_REL}/extended-properties`,
};

function partesDelLibro(libro) {
  const estilos = crearRegistroEstilos();
  const hojas = libro.hojas;
  const imagenes = libro.imagenes || {};
  const nombresImagen = Object.keys(imagenes).filter((clave) => imagenes[clave]?.datos?.length);
  const archivoImagen = new Map(nombresImagen.map((clave, indice) => [clave, `image${indice + 1}.png`]));
  const partes = [];
  let dibujos = 0;

  const hojasXml = hojas.map((hoja, indice) => {
    const imagen = hoja.imagen && archivoImagen.has(hoja.imagen.clave) ? hoja.imagen : null;
    if (imagen) {
      dibujos++;
      const numero = dibujos;
      partes.push({ nombre: `xl/drawings/drawing${numero}.xml`, texto: dibujoXml(imagen) });
      partes.push({
        nombre: `xl/drawings/_rels/drawing${numero}.xml.rels`,
        texto: relaciones([["rId1", TIPO_REL.imagen, `../media/${archivoImagen.get(imagen.clave)}`]]),
      });
      partes.push({
        nombre: `xl/worksheets/_rels/sheet${indice + 1}.xml.rels`,
        texto: relaciones([["rId1", TIPO_REL.dibujo, `../drawings/drawing${numero}.xml`]]),
      });
    }
    return { nombre: `xl/worksheets/sheet${indice + 1}.xml`, texto: hojaXml(hoja, indice, estilos, Boolean(imagen)) };
  });

  const nombresDefinidos = hojas
    .map((hoja, indice) => (hoja.imprimir?.titulos
      ? `<definedName name="_xlnm.Print_Titles" localSheetId="${indice}">'${xml(hoja.nombre.replace(/'/g, "''"))}'!$${hoja.imprimir.titulos[0] + 1}:$${hoja.imprimir.titulos[1] + 1}</definedName>`
      : ""))
    .filter(Boolean);

  const libroXml = `${ENCABEZADO_XML}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>`
    + hojas.map((hoja, indice) => `<sheet name="${xml(hoja.nombre.slice(0, 31))}" sheetId="${indice + 1}" r:id="rId${indice + 1}"/>`).join("")
    + "</sheets>"
    + (nombresDefinidos.length ? `<definedNames>${nombresDefinidos.join("")}</definedNames>` : "")
    + "</workbook>";

  const propiedades = libro.propiedades || {};
  const ahora = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const core = `${ENCABEZADO_XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${xml(propiedades.titulo || "")}</dc:title><dc:creator>${xml(propiedades.autor || "")}</dc:creator>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${ahora}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${ahora}</dcterms:modified>`
    + "</cp:coreProperties>";
  const app = `${ENCABEZADO_XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Asistencia escolar</Application></Properties>`;

  const tipos = `${ENCABEZADO_XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + (nombresImagen.length ? '<Default Extension="png" ContentType="image/png"/>' : "")
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + hojas.map((_, indice) => `<Override PartName="/xl/worksheets/sheet${indice + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
    + Array.from({ length: dibujos }, (_, indice) => `<Override PartName="/xl/drawings/drawing${indice + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("")
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    + "</Types>";

  return [
    { nombre: "[Content_Types].xml", texto: tipos },
    { nombre: "_rels/.rels", texto: relaciones([
      ["rId1", TIPO_REL.documento, "xl/workbook.xml"],
      ["rId2", TIPO_REL.core, "docProps/core.xml"],
      ["rId3", TIPO_REL.app, "docProps/app.xml"],
    ]) },
    { nombre: "docProps/core.xml", texto: core },
    { nombre: "docProps/app.xml", texto: app },
    { nombre: "xl/workbook.xml", texto: libroXml },
    { nombre: "xl/_rels/workbook.xml.rels", texto: relaciones([
      ...hojas.map((_, indice) => [`rId${indice + 1}`, TIPO_REL.hoja, `worksheets/sheet${indice + 1}.xml`]),
      [`rId${hojas.length + 1}`, TIPO_REL.estilos, "styles.xml"],
    ]) },
    ...hojasXml,
    ...partes,
    ...nombresImagen.map((clave) => ({ nombre: `xl/media/${archivoImagen.get(clave)}`, datos: imagenes[clave].datos })),
    // styles.xml se serializa al final, cuando todas las hojas ya registraron sus estilos.
    { nombre: "xl/styles.xml", texto: () => estilos.xml() },
  ];
}

// ——— ZIP (almacenado, sin compresión) ———

function crc32(datos) {
  if (!crc32.tabla) {
    crc32.tabla = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let valor = n;
      for (let k = 0; k < 8; k++) valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
      crc32.tabla[n] = valor >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < datos.length; i++) crc = crc32.tabla[(crc ^ datos[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function escribirZip(archivos) {
  const codificador = new TextEncoder();
  const bloques = [];
  const centrales = [];
  let offset = 0;
  for (const archivo of archivos) {
    const nombre = codificador.encode(archivo.nombre);
    const datos = archivo.datos;
    const crc = crc32(datos);
    const local = new Uint8Array(30 + nombre.length);
    const vl = new DataView(local.buffer);
    vl.setUint32(0, 0x04034b50, true);
    vl.setUint16(4, 20, true);
    vl.setUint16(6, 0x0800, true);
    vl.setUint16(10, HORA_DOS, true);
    vl.setUint16(12, FECHA_DOS, true);
    vl.setUint32(14, crc, true);
    vl.setUint32(18, datos.length, true);
    vl.setUint32(22, datos.length, true);
    vl.setUint16(26, nombre.length, true);
    local.set(nombre, 30);

    const central = new Uint8Array(46 + nombre.length);
    const vc = new DataView(central.buffer);
    vc.setUint32(0, 0x02014b50, true);
    vc.setUint16(4, 20, true);
    vc.setUint16(6, 20, true);
    vc.setUint16(8, 0x0800, true);
    vc.setUint16(12, HORA_DOS, true);
    vc.setUint16(14, FECHA_DOS, true);
    vc.setUint32(16, crc, true);
    vc.setUint32(20, datos.length, true);
    vc.setUint32(24, datos.length, true);
    vc.setUint16(28, nombre.length, true);
    vc.setUint32(42, offset, true);
    central.set(nombre, 46);

    bloques.push(local, datos);
    centrales.push(central);
    offset += local.length + datos.length;
  }
  const tamanoCentral = centrales.reduce((suma, parte) => suma + parte.length, 0);
  const fin = new Uint8Array(22);
  const vf = new DataView(fin.buffer);
  vf.setUint32(0, 0x06054b50, true);
  vf.setUint16(8, archivos.length, true);
  vf.setUint16(10, archivos.length, true);
  vf.setUint32(12, tamanoCentral, true);
  vf.setUint32(16, offset, true);

  const todos = [...bloques, ...centrales, fin];
  const salida = new Uint8Array(todos.reduce((suma, bloque) => suma + bloque.length, 0));
  let posicion = 0;
  for (const bloque of todos) {
    salida.set(bloque, posicion);
    posicion += bloque.length;
  }
  return salida;
}

export function crearLibroXlsx(libro) {
  const codificador = new TextEncoder();
  const partes = partesDelLibro(libro);
  return escribirZip(partes.map((parte) => ({
    nombre: parte.nombre,
    datos: parte.datos || codificador.encode(typeof parte.texto === "function" ? parte.texto() : parte.texto),
  })));
}
