import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as A from "../src/analisis.js";
import { datosDelMes, libroDelMes, excelDelMes, csvResumenDelMes, nombreArchivo } from "../src/exportes.js";
import { CURSOS, INSTITUCION, cursosDe, rutasDeCurso } from "../src/config.js";
import { sembrarDemo } from "../src/repositorio.js";
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
  // 5 al 9 de octubre es receso y el 12 es festivo: no cuentan como pendientes.
  const pendientes = A.diasPendientes("2026-10", mapa, "2026-10-17");
  assert.deepEqual(pendientes, ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
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
  vm.runInThisContext(readFileSync(new URL("../vendor/jspdf.umd.min.js", import.meta.url), "utf8"));
  vm.runInThisContext(readFileSync(new URL("../vendor/jspdf.plugin.autotable.min.js", import.meta.url), "utf8"));
  const { construirInformePdf } = await import("../src/informe-pdf.js");
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

test("festivos de Colombia coinciden con el calendario oficial", async () => {
  const { festivosDelAnio, festivo } = await import("../src/festivos.js");
  assert.deepEqual([...festivosDelAnio(2026).keys()], [
    "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-18", "2026-06-08",
    "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16",
    "2026-12-08", "2026-12-25",
  ]);
  assert.equal(festivosDelAnio(2025).size, 17);
  assert.equal(festivo("2025-06-30"), "San Pedro y San Pablo y Sagrado Corazón");
  assert.equal(festivo("2027-03-26"), "Viernes Santo");
  assert.equal(festivo("2026-11-03"), null);
});

test("los festivos no son pendientes y aparecen como días sin clase sin tocar los conteos", () => {
  const diasNov = new Map([["2026-11-03", { fecha: "2026-11-03", tipo: "clase", nota: "" }]]);
  assert.deepEqual(A.diasPendientes("2026-11", diasNov, "2026-11-06"), ["2026-11-04", "2026-11-05"]);
  assert.deepEqual(A.noLectivoPendiente("2026-11-02", diasNov), { tipo: "festivo", nombre: "Todos los Santos" });
  // Si se pasó lista en un festivo, cuenta como día de clase y deja de mostrarse como festivo.
  assert.equal(A.noLectivoPendiente("2026-11-02", new Map([["2026-11-02", { fecha: "2026-11-02", tipo: "clase" }]])), null);
  const datos = datosDelMes({ estudiantes, dias: [...diasNov.values()], registros: [], ajustes: null, mes: "2026-11" });
  assert.deepEqual(datos.sinClase.map((dia) => [dia.fecha, dia.motivo]), [
    ["2026-11-02", "Festivo: Todos los Santos"],
    ["2026-11-16", "Festivo: Independencia de Cartagena"],
  ]);
  assert.equal(datos.resumen.totales.diasDeClase, 1);
});

test("semanas de receso de Semana Santa y octubre (calendario A)", async () => {
  const { recesosDelAnio, diaNoLectivo } = await import("../src/festivos.js");
  assert.deepEqual([...recesosDelAnio(2026).keys()], [
    "2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03",
    "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09",
  ]);
  assert.equal(recesosDelAnio(2025).get("2025-10-06"), "Receso de octubre");
  assert.equal(recesosDelAnio(2025).get("2025-04-14"), "Receso de Semana Santa");
  assert.deepEqual(diaNoLectivo("2026-03-31"), { tipo: "receso", nombre: "Receso de Semana Santa" });
  assert.deepEqual(diaNoLectivo("2026-04-03"), { tipo: "festivo", nombre: "Viernes Santo" });

  const datosOct = datosDelMes({ estudiantes, dias: [], registros: [], ajustes: null, mes: "2026-10" });
  assert.deepEqual(datosOct.sinClase.map((dia) => dia.fecha), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"]);
  assert.equal(datosOct.sinClase[0].motivo, "Receso de octubre");
  assert.ok(!A.diasPendientes("2026-10", new Map(), "2026-10-14").some((fecha) => fecha >= "2026-10-05" && fecha <= "2026-10-12"));
});
