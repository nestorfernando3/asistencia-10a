import test from "node:test";
import assert from "node:assert/strict";
import {
  AJUSTES_POR_DEFECTO,
  AUSENTE,
  EXCUSA,
  PRESENTE,
  TARDE,
  claveDelDia,
  claveRegistro,
  contadoresDelDia,
  csvMatriz,
  csvResumen,
  diasEnMes,
  esFinDeSemana,
  estadoDe,
  fechaHumana,
  letraEstado,
  matrizDelMes,
  mesAnterior,
  mesHumano,
  mesSiguiente,
  primerDiaSemana,
  resumenDelMes,
  textoAlerta,
} from "../src/dominio.js";

const estudiantes = [
  { mat: 1, no: 1, nombre: "UNO UNO", estado: "activo" },
  { mat: 2, no: 2, nombre: "DOS; DOS", estado: "activo" },
  { mat: 3, no: 3, nombre: "TRES TRES", estado: "retirada" },
];

const dias = [
  { fecha: "2026-10-01", tipo: "clase" },
  { fecha: "2026-10-02", tipo: "clase" },
  { fecha: "2026-10-05", tipo: "clase" },
  { fecha: "2026-10-06", tipo: "clase" },
  { fecha: "2026-10-07", tipo: "clase" },
  { fecha: "2026-10-08", tipo: "clase" },
  { fecha: "2026-10-09", tipo: "sinClase", motivo: "Festivo" },
];

const registros = [
  { fecha: "2026-10-01", mat: 1, estado: AUSENTE, comentario: "", etiquetas: [] },
  { fecha: "2026-10-02", mat: 1, estado: AUSENTE, comentario: "", etiquetas: [] },
  { fecha: "2026-10-05", mat: 1, estado: AUSENTE, comentario: "", etiquetas: [] },
  { fecha: "2026-10-06", mat: 2, estado: TARDE, comentario: "", etiquetas: [] },
  { fecha: "2026-10-07", mat: 2, estado: EXCUSA, comentario: "Cita médica", etiquetas: ["Cita médica"] },
  { fecha: "2026-10-08", mat: 2, estado: AUSENTE, comentario: "", etiquetas: [] },
];

test("diasEnMes y primerDiaSemana", () => {
  assert.equal(diasEnMes("2026-10"), 31);
  assert.equal(diasEnMes("2026-02"), 28);
  assert.equal(diasEnMes("2028-02"), 29);
  assert.equal(primerDiaSemana("2026-10"), 3);
});

test("claves de meses vecinos y nombre del mes", () => {
  assert.equal(mesSiguiente("2026-12"), "2027-01");
  assert.equal(mesSiguiente("2026-10"), "2026-11");
  assert.equal(mesAnterior("2026-01"), "2025-12");
  assert.equal(mesHumano("2026-10"), "Octubre 2026");
});

test("findes de semana y clave del día", () => {
  assert.equal(esFinDeSemana("2026-10", 17), true);
  assert.equal(esFinDeSemana("2026-10", 18), true);
  assert.equal(esFinDeSemana("2026-10", 16), false);
  assert.equal(claveDelDia("2026-10", 5), "2026-10-05");
});

test("fecha humana", () => {
  assert.equal(fechaHumana("2026-10-14"), "miércoles, 14 de octubre de 2026");
});

test("estadoDe, letras y clave de registro", () => {
  assert.equal(estadoDe(null), PRESENTE);
  assert.equal(estadoDe({ estado: TARDE }), TARDE);
  assert.equal(letraEstado(PRESENTE), "P");
  assert.equal(letraEstado(AUSENTE), "A");
  assert.equal(letraEstado(TARDE), "T");
  assert.equal(letraEstado(EXCUSA), "E");
  assert.equal(claveRegistro("2026-10-05", 493), "2026-10-05_493");
});

test("contadores del día", () => {
  const contadores = contadoresDelDia([
    { estado: PRESENTE },
    null,
    { estado: AUSENTE },
    { estado: TARDE },
    { estado: EXCUSA },
  ]);
  assert.deepEqual(contadores, { presente: 2, ausente: 1, tarde: 1, excusa: 1 });
});

test("resumen del mes: conteos, porcentajes, alertas y retiradas", () => {
  const resumen = resumenDelMes({ estudiantes, dias, registros, ajustes: AJUSTES_POR_DEFECTO });
  assert.equal(resumen.totales.diasDeClase, 6);
  assert.equal(resumen.filas.length, 2);

  const uno = resumen.filas[0];
  assert.equal(uno.presente, 3);
  assert.equal(uno.ausente, 3);
  assert.equal(uno.seguidasMax, 3);
  assert.deepEqual(uno.alerta, { seguidas: 3, acumuladas: 0 });
  assert.equal(uno.porcentaje, 50);

  const dos = resumen.filas[1];
  assert.equal(dos.presente, 3);
  assert.equal(dos.tarde, 1);
  assert.equal(dos.excusa, 1);
  assert.equal(dos.ausente, 1);
  assert.equal(dos.asistencias, 4);
  assert.equal(dos.porcentaje, 67);
  assert.equal(dos.alerta, null);

  assert.equal(resumen.totales.ausente, 4);
  assert.equal(resumen.totales.tarde, 1);
  assert.equal(resumen.totales.excusa, 1);
});

test("alerta por faltas acumuladas", () => {
  const seguidos = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"]
    .map((fecha) => ({ fecha, mat: 2, estado: AUSENTE, comentario: "", etiquetas: [] }));
  const resumen = resumenDelMes({ estudiantes: [estudiantes[1]], dias, registros: seguidos, ajustes: AJUSTES_POR_DEFECTO });
  assert.deepEqual(resumen.filas[0].alerta, { seguidas: 5, acumuladas: 5 });
});

test("texto de alerta", () => {
  assert.equal(textoAlerta(null), "");
  assert.equal(textoAlerta({ seguidas: 3, acumuladas: 0 }), "3 faltas seguidas");
  assert.equal(textoAlerta({ seguidas: 3, acumuladas: 5 }), "3 faltas seguidas; 5 faltas en el mes");
});

test("matriz del mes", () => {
  const resumen = resumenDelMes({ estudiantes, dias, registros, ajustes: AJUSTES_POR_DEFECTO });
  const matriz = matrizDelMes({ estudiantes, diasDeClase: resumen.diasDeClase, registros });
  assert.equal(matriz.length, 2);
  assert.deepEqual(matriz[0].porDia, ["A", "A", "A", "P", "P", "P"]);
  assert.deepEqual(matriz[1].porDia, ["P", "P", "P", "T", "E", "A"]);
});

test("csvResumen: encabezados, comillas y totales", () => {
  const resumen = resumenDelMes({ estudiantes, dias, registros, ajustes: AJUSTES_POR_DEFECTO });
  const csv = csvResumen(resumen, { curso: "10°-A", mes: "2026-10" });
  const lineas = csv.split("\r\n");
  assert.equal(lineas[0], "Curso;10°-A");
  assert.equal(lineas[1], "Mes;Octubre 2026");
  assert.ok(lineas.some((linea) => linea.includes("Ausente (Inas.)")));
  assert.ok(lineas.some((linea) => linea.includes('"DOS; DOS"')));
  assert.ok(lineas.some((linea) => linea.includes("TOTAL DEL CURSO")));
});

test("csvMatriz: días en el encabezado y letras por estudiante", () => {
  const resumen = resumenDelMes({ estudiantes, dias, registros, ajustes: AJUSTES_POR_DEFECTO });
  const matriz = matrizDelMes({ estudiantes, diasDeClase: resumen.diasDeClase, registros });
  const csv = csvMatriz(matriz, { curso: "10°-A", mes: "2026-10", diasDeClase: resumen.diasDeClase });
  assert.ok(csv.includes("Mat. No.;No.;Estudiante;1;2;5;6;7;8"));
  assert.ok(csv.includes("UNO UNO;A;A;A;P;P;P"));
  assert.ok(csv.includes('"DOS; DOS";P;P;P;T;E;A'));
});
