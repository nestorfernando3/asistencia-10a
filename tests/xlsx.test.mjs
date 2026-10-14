import test from "node:test";
import assert from "node:assert/strict";
import { crearXlsx } from "../src/xlsx.js";

function leerZip(bytes) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fin = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("No se encontró el fin del directorio central");
  const total = vista.getUint16(fin + 10, true);
  const entradas = {};
  const decodificador = new TextDecoder();
  let posicion = vista.getUint32(fin + 16, true);
  for (let i = 0; i < total; i++) {
    const largoNombre = vista.getUint16(posicion + 28, true);
    const offsetLocal = vista.getUint32(posicion + 42, true);
    const nombre = decodificador.decode(bytes.slice(posicion + 46, posicion + 46 + largoNombre));
    const tamano = vista.getUint32(posicion + 24, true);
    const inicioDatos = offsetLocal + 30 + vista.getUint16(offsetLocal + 26, true) + vista.getUint16(offsetLocal + 28, true);
    entradas[nombre] = decodificador.decode(bytes.slice(inicioDatos, inicioDatos + tamano));
    posicion += 46 + largoNombre + vista.getUint16(posicion + 30, true) + vista.getUint16(posicion + 32, true);
  }
  return entradas;
}

test("crearXlsx genera un zip válido con todas las partes", () => {
  const bytes = crearXlsx([
    { nombre: "Lista", filas: [["Mat. No.", "No.", "Estudiante"], [493, 1, "ANGUILA MARTINEZ DULSE MARIA"]] },
    { nombre: "Resumen del mes", filas: [["Curso", "10°-A"], ["Mes", "Octubre 2026"], [], ["No.", "Presente"], [1, 5]], filaNegrita: 4 },
  ]);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");

  const entradas = leerZip(bytes);
  assert.ok(entradas["[Content_Types].xml"].includes("spreadsheetml.sheet.main+xml"));
  assert.ok(entradas["_rels/.rels"].includes("xl/workbook.xml"));
  assert.ok(entradas["xl/workbook.xml"].includes('name="Lista"'));
  assert.ok(entradas["xl/workbook.xml"].includes('name="Resumen del mes"'));
  assert.ok(entradas["xl/_rels/workbook.xml.rels"].includes("worksheets/sheet2.xml"));
  assert.ok(entradas["xl/styles.xml"].includes("<b/>"));

  const hoja1 = entradas["xl/worksheets/sheet1.xml"];
  assert.ok(hoja1.includes("Mat. No."));
  assert.ok(hoja1.includes("<v>493</v>"));
  assert.ok(hoja1.includes("ANGUILA MARTINEZ DULSE MARIA"));
  assert.ok(hoja1.includes('s="1"'));

  const hoja2 = entradas["xl/worksheets/sheet2.xml"];
  assert.ok(hoja2.includes('<row r="3"/>'));
  assert.ok(hoja2.includes("Octubre 2026"));
});

test("crearXlsx escapa caracteres especiales y usa textos en línea", () => {
  const bytes = crearXlsx([
    { nombre: "Prueba", filas: [["A&B <uno> \"dos\""]] },
  ]);
  const hoja = leerZip(bytes)["xl/worksheets/sheet1.xml"];
  assert.ok(hoja.includes("A&amp;B &lt;uno&gt; &quot;dos&quot;"));
  assert.ok(hoja.includes('t="inlineStr"'));
});
