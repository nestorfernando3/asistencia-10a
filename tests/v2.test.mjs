import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as A from "../v2/src/analisis.js";
import { datosDelMes, libroDelMes, excelDelMes, csvResumenDelMes, nombreArchivo } from "../v2/src/exportes.js";
import { CURSOS, INSTITUCION, cursosDe, rutasDeCurso } from "../v2/src/config.js";
import { sembrarDemo } from "../v2/src/repositorio.js";
import { csvResumen, resumenDelMes } from "../src/dominio.js";

const estudiantes = [
  { mat: 1, no: 1, nombre: "DE LA HOZ OSPINO MATEO", estado: "activo" },
  { mat: 2, no: 2, nombre: "ACOSTA RIVERA ANA MARIA", estado: "activo", notaPersistente: "PIAR" },
  { mat: 3, no: 3, nombre: "TRES TRES", estado: "retirada" },
];
const dias = [
  { fecha: "2026-10-01", tipo: "clase", nota: "" },
  { fecha: "2026-10-02", tipo: "clase", nota: "Salida pedagógica" },
  { fecha: "2026-10-05", tipo: "sinClase", motivo: "Festivo" },
];
const registros = [
  { fecha: "2026-10-01", mat: 1, estado: "Ausente", comentario: "", etiquetas: [] },
  { fecha: "2026-10-02", mat: 2, estado: "Excusa", comentario: "Cita EPS", etiquetas: ["Cita médica"] },
];

test("nombreVisible respeta partículas y tildes", () => {
  assert.equal(A.nombreVisible("DE LA HOZ OSPINO MATEO"), "De la Hoz Ospino Mateo");
  assert.equal(A.nombreVisible("ORTEGA BOLAÑO SANTIAGO"), "Ortega Bolaño Santiago");
  assert.equal(A.iniciales("ACOSTA RIVERA ANA MARIA"), "AA");
});

test("diasPendientes cuenta solo días hábiles pasados sin registro", () => {
  const mapa = new Map(dias.map((dia) => [dia.fecha, dia]));
  const pendientes = A.diasPendientes("2026-10", mapa, "2026-10-09");
  assert.deepEqual(pendientes, ["2026-10-06", "2026-10-07", "2026-10-08"]);
});

test("observacionesDelMes incluye observaciones y notas del día en orden", () => {
  const obs = A.observacionesDelMes({ estudiantes, registros, dias });
  assert.equal(obs.length, 2);
  assert.equal(obs[0].comentario, "Salida pedagógica");
  assert.equal(obs[0].mat, null);
  assert.equal(obs[1].nombre, "ACOSTA RIVERA ANA MARIA");
});

test("historialEstudiante y búsqueda sin tildes", () => {
  const historial = A.historialEstudiante({ mat: 1, diasDeClase: ["2026-10-01", "2026-10-02"], registros });
  assert.deepEqual(historial.map((dia) => dia.estado), ["Ausente", "Presente"]);
  assert.equal(A.filtrarPorTexto(estudiantes, "bolano").length, 0);
  assert.equal(A.filtrarPorTexto(estudiantes, "hoz mat").length, 1);
  assert.equal(A.filtrarPorTexto(estudiantes, "2").length, 1);
});

test("el CSV de planillas es idéntico al de la versión clásica", () => {
  const datos = datosDelMes({ estudiantes, dias, registros, ajustes: null, mes: "2026-10" });
  const clasico = csvResumen(resumenDelMes({ estudiantes, dias, registros }), { curso: "10°-A", mes: "2026-10" });
  assert.equal(csvResumenDelMes(datos, CURSOS[0]), `﻿${clasico}`);
  assert.equal(nombreArchivo(CURSOS[0], "2026-10", "xlsx"), "Asistencia_10A_Octubre_2026.xlsx");
});

test("el curso 10°-A usa las colecciones originales y los nuevos cursos su propio espacio", () => {
  assert.deepEqual(CURSOS[0].rutas, { estudiantes: ["estudiantes"], dias: ["dias"], asistencia: ["asistencia"], ajustes: ["ajustes", "config"] });
  assert.deepEqual(rutasDeCurso("11B").asistencia, ["cursos", "11B", "asistencia"]);
  assert.equal(cursosDe("cualquiera@correo.com").length, CURSOS.filter((curso) => !curso.docentes.length).length);
});

test("el libro de Excel trae cinco hojas con membrete, escudo y alertas", () => {
  const demo = sembrarDemo();
  const mesDemo = Object.keys(demo.dias).sort()[0].slice(0, 7);
  const datos = datosDelMes({
    estudiantes: demo.estudiantes,
    dias: Object.values(demo.dias).filter((dia) => dia.fecha.startsWith(mesDemo)),
    registros: Object.values(demo.registros).filter((registro) => registro.fecha.startsWith(mesDemo)),
    ajustes: null,
    mes: mesDemo,
  });
  const escudo = { datos: new Uint8Array(readFileSync(new URL("../assets/institution/logo_colegio.png", import.meta.url))), ancho: 368, alto: 384 };
  const libro = libroDelMes(datos, { institucion: INSTITUCION, curso: CURSOS[0], escudo, hoy: "2026-11-03" });
  assert.deepEqual(libro.hojas.map((hoja) => hoja.nombre), ["Resumen", "Detalle por día", "Estadísticas", "Observaciones", "Lista"]);
  assert.equal(libro.hojas[0].filas[0].celdas[2].v, INSTITUCION.nombre.toUpperCase());

  const bytes = excelDelMes(datos, { institucion: INSTITUCION, curso: CURSOS[0], escudo, hoy: "2026-11-03" });
  const texto = new TextDecoder("latin1").decode(bytes);
  assert.equal(texto.slice(0, 2), "PK");
  for (const parte of ["xl/workbook.xml", "xl/styles.xml", "xl/media/image1.png", "xl/drawings/drawing5.xml", "docProps/core.xml"]) {
    assert.ok(texto.includes(parte), `falta ${parte}`);
  }
  assert.ok(texto.includes("_xlnm.Print_Titles"));
  assert.ok(texto.includes('state="frozen"'));
});

test("el informe PDF se genera con las librerías locales", async () => {
  globalThis.window = globalThis;
  vm.runInThisContext(readFileSync(new URL("../v2/vendor/jspdf.umd.min.js", import.meta.url), "utf8"));
  vm.runInThisContext(readFileSync(new URL("../v2/vendor/jspdf.plugin.autotable.min.js", import.meta.url), "utf8"));
  const { construirInformePdf } = await import("../v2/src/informe-pdf.js");
  const datos = datosDelMes({ estudiantes, dias, registros, ajustes: null, mes: "2026-10" });
  const doc = construirInformePdf(window.jspdf.jsPDF, { datos, institucion: INSTITUCION, curso: CURSOS[0], incluirObservaciones: true, hoy: "2026-11-03" });
  assert.equal(doc.getNumberOfPages(), 4);
  const vacio = construirInformePdf(window.jspdf.jsPDF, {
    datos: datosDelMes({ estudiantes, dias: [], registros: [], ajustes: null, mes: "2026-12" }),
    institucion: INSTITUCION,
    curso: CURSOS[0],
    hoy: "2026-11-03",
  });
  assert.ok(vacio.getNumberOfPages() >= 3);
});
