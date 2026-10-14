const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const HORA_DOS = 24576;
const FECHA_DOS = 23886;

function letraColumna(indice) {
  let letra = "";
  let numero = indice + 1;
  while (numero > 0) {
    const resto = (numero - 1) % 26;
    letra = LETRAS[resto] + letra;
    numero = Math.floor((numero - 1) / 26);
  }
  return letra;
}

function escaparXml(valor) {
  return String(valor).replace(/[&<>"']/g, (caracter) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[caracter]
  ));
}

function celdaXml(referencia, valor, negrita) {
  const estilo = negrita ? ' s="1"' : "";
  if (valor === null || valor === undefined || valor === "") {
    return `<c r="${referencia}"${estilo}/>`;
  }
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return `<c r="${referencia}"${estilo}><v>${valor}</v></c>`;
  }
  return `<c r="${referencia}" t="inlineStr"${estilo}><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`;
}

function hojaXml(filas, filaNegrita) {
  const contenido = filas.map((fila, indice) => {
    const numeroFila = indice + 1;
    const celdas = fila
      .map((valor, columna) => celdaXml(`${letraColumna(columna)}${numeroFila}`, valor, numeroFila === filaNegrita))
      .join("");
    return celdas ? `<row r="${numeroFila}">${celdas}</row>` : `<row r="${numeroFila}"/>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${contenido}</sheetData></worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function partesXml(hojas) {
  const tipos = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ...hojas.map((_, indice) => `<Override PartName="/xl/worksheets/sheet${indice + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    "</Types>",
  ].join("");

  const relaciones = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';

  const libro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((hoja, indice) => `<sheet name="${escaparXml(hoja.nombre)}" sheetId="${indice + 1}" r:id="rId${indice + 1}"/>`).join("")}</sheets></workbook>`;

  const relacionesLibro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, indice) => `<Relationship Id="rId${indice + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${indice + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return [
    { nombre: "[Content_Types].xml", texto: tipos },
    { nombre: "_rels/.rels", texto: relaciones },
    { nombre: "xl/workbook.xml", texto: libro },
    { nombre: "xl/_rels/workbook.xml.rels", texto: relacionesLibro },
    { nombre: "xl/styles.xml", texto: ESTILOS },
    ...hojas.map((hoja, indice) => ({
      nombre: `xl/worksheets/sheet${indice + 1}.xml`,
      texto: hojaXml(hoja.filas, hoja.filaNegrita || 1),
    })),
  ];
}

function crc32(datos) {
  if (!crc32.tabla) {
    const tabla = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let valor = n;
      for (let k = 0; k < 8; k++) {
        valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
      }
      tabla[n] = valor >>> 0;
    }
    crc32.tabla = tabla;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < datos.length; i++) {
    crc = crc32.tabla[(crc ^ datos[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escribirZip(archivos) {
  const codificador = new TextEncoder();
  const partes = [];
  const centrales = [];
  let offset = 0;

  for (const archivo of archivos) {
    const nombre = codificador.encode(archivo.nombre);
    const datos = archivo.datos;
    const crc = crc32(datos);
    const tamano = datos.length;

    const local = new Uint8Array(30 + nombre.length);
    const vistaLocal = new DataView(local.buffer);
    vistaLocal.setUint32(0, 0x04034b50, true);
    vistaLocal.setUint16(4, 20, true);
    vistaLocal.setUint16(6, 0x0800, true);
    vistaLocal.setUint16(8, 0, true);
    vistaLocal.setUint16(10, HORA_DOS, true);
    vistaLocal.setUint16(12, FECHA_DOS, true);
    vistaLocal.setUint32(14, crc, true);
    vistaLocal.setUint32(18, tamano, true);
    vistaLocal.setUint32(22, tamano, true);
    vistaLocal.setUint16(26, nombre.length, true);
    vistaLocal.setUint16(28, 0, true);
    local.set(nombre, 30);

    const central = new Uint8Array(46 + nombre.length);
    const vistaCentral = new DataView(central.buffer);
    vistaCentral.setUint32(0, 0x02014b50, true);
    vistaCentral.setUint16(4, 20, true);
    vistaCentral.setUint16(6, 20, true);
    vistaCentral.setUint16(8, 0x0800, true);
    vistaCentral.setUint16(10, 0, true);
    vistaCentral.setUint16(12, HORA_DOS, true);
    vistaCentral.setUint16(14, FECHA_DOS, true);
    vistaCentral.setUint32(16, crc, true);
    vistaCentral.setUint32(20, tamano, true);
    vistaCentral.setUint32(24, tamano, true);
    vistaCentral.setUint16(28, nombre.length, true);
    vistaCentral.setUint16(30, 0, true);
    vistaCentral.setUint16(32, 0, true);
    vistaCentral.setUint16(34, 0, true);
    vistaCentral.setUint16(36, 0, true);
    vistaCentral.setUint32(38, 0, true);
    vistaCentral.setUint32(42, offset, true);
    central.set(nombre, 46);

    partes.push(local, datos);
    centrales.push(central);
    offset += local.length + tamano;
  }

  const tamanoCentral = centrales.reduce((suma, parte) => suma + parte.length, 0);
  const fin = new Uint8Array(22);
  const vistaFin = new DataView(fin.buffer);
  vistaFin.setUint32(0, 0x06054b50, true);
  vistaFin.setUint16(4, 0, true);
  vistaFin.setUint16(6, 0, true);
  vistaFin.setUint16(8, archivos.length, true);
  vistaFin.setUint16(10, archivos.length, true);
  vistaFin.setUint32(12, tamanoCentral, true);
  vistaFin.setUint32(16, offset, true);
  vistaFin.setUint16(20, 0, true);

  const bloques = [...partes, ...centrales, fin];
  const total = bloques.reduce((suma, bloque) => suma + bloque.length, 0);
  const salida = new Uint8Array(total);
  let posicion = 0;
  for (const bloque of bloques) {
    salida.set(bloque, posicion);
    posicion += bloque.length;
  }
  return salida;
}

export function crearXlsx(hojas) {
  const codificador = new TextEncoder();
  const archivos = partesXml(hojas).map((parte) => ({
    nombre: parte.nombre,
    datos: codificador.encode(parte.texto),
  }));
  return escribirZip(archivos);
}
