// Seguridad de los datos y guardado confiable (fases 0 y 1 de docs/plan-de-mejoras.md).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { validarRespaldo } from "../src/respaldo.js";
import { crearRepositorio, op, VERSION_FIREBASE } from "../src/repositorio.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => readFileSync(join(raiz, ruta), "utf8");

// ——— Reglas de Firestore ———
// El emulador necesita Java; esta revisión estática atrapa la regresión más grave
// (volver a abrir la base a cualquier sesión). La prueba real se hace en el área de
// pruebas de reglas de la consola de Firebase.

test("las reglas de Firestore no abren la base a cualquier sesión iniciada", () => {
  const reglas = leer("firestore.rules").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(reglas, /if\s+request\.auth\s*!=\s*null\s*;/, "una regla permite el acceso con solo iniciar sesión");
  assert.doesNotMatch(reglas, /allow[^;]*if\s+true/, "una regla permite el acceso sin sesión");
  const permisos = reglas.match(/allow [^;]+;/g) || [];
  assert.ok(permisos.length > 0);
  for (const permiso of permisos) assert.match(permiso, /esDocente\(\)/, `regla sin restricción por docente: ${permiso}`);
  assert.match(reglas, /request\.auth\.uid in \[/);
});

// ——— Respaldos ———

const respaldo = (cambios = {}) => ({
  app: "asistencia-10a",
  curso: "10A",
  exportado: "2026-11-18T12:00:00.000Z",
  estudiantes: [{ mat: 493, no: 1, nombre: "APELLIDO NOMBRE", estado: "activo" }],
  dias: [{ fecha: "2026-11-03", tipo: "clase", motivo: "", nota: "" }, { fecha: "2026-10-13", tipo: "sinClase", motivo: "Festivo" }],
  registros: [{ fecha: "2026-11-03", mat: 493, estado: "Ausente", comentario: "", etiquetas: [] }],
  ...cambios,
});

test("un respaldo válido del mismo curso se acepta con su rango de fechas", () => {
  const resultado = validarRespaldo(respaldo(), { cursoDestino: "10A" });
  assert.equal(resultado.registros.length, 1);
  assert.equal(resultado.desde, "2026-10-13");
  assert.equal(resultado.hasta, "2026-11-03");
});

test("los respaldos de la versión clásica (sin curso) se aceptan", () => {
  const { curso, ...clasico } = respaldo();
  assert.equal(curso, "10A");
  assert.doesNotThrow(() => validarRespaldo(clasico, { cursoDestino: "10A" }));
});

test("un respaldo de la demo no se puede subir a la base real", () => {
  assert.throws(() => validarRespaldo(respaldo({ curso: "demo" }), { cursoDestino: "10A" }), /demo/);
  assert.doesNotThrow(() => validarRespaldo(respaldo({ curso: "demo" }), { cursoDestino: "demo" }));
});

test("se rechazan respaldos de otro curso, de otra app o con datos inválidos", () => {
  assert.throws(() => validarRespaldo(respaldo({ curso: "11B" }), { cursoDestino: "10A" }), /11B/);
  assert.throws(() => validarRespaldo(respaldo({ app: "otra" }), { cursoDestino: "10A" }), /no es un respaldo/);
  assert.throws(() => validarRespaldo([], { cursoDestino: "10A" }), /no parece/);
  assert.throws(() => validarRespaldo(respaldo({ estudiantes: [], registros: [] }), { cursoDestino: "10A" }), /vacío/);
  assert.throws(() => validarRespaldo(respaldo({ registros: [{ fecha: "2026-02-30", mat: 493, estado: "Ausente" }] }), { cursoDestino: "10A" }), /registros/);
  assert.throws(() => validarRespaldo(respaldo({ registros: [{ fecha: "2026-11-03", mat: 493, estado: "Fugado" }] }), { cursoDestino: "10A" }), /registros/);
  assert.throws(() => validarRespaldo(respaldo({ estudiantes: [{ mat: "abc", nombre: "X" }] }), { cursoDestino: "10A" }), /estudiantes/);
  assert.throws(() => validarRespaldo(respaldo({ dias: "no" }), { cursoDestino: "10A" }), /lista/);
});

// ——— Escrituras en lote (modo demo, misma interfaz que Firebase) ———

test("aplicar guarda y borra registro y día juntos", async () => {
  const repo = await crearRepositorio({ demo: true });
  repo.reiniciarDemo();
  const espacio = repo.delCurso();
  const fecha = "2031-03-04";
  await espacio.aplicar([
    op.registro({ fecha, mat: 9001, estado: "Ausente", comentario: "", etiquetas: [] }),
    op.registro({ fecha, mat: 9002, estado: "Tarde", comentario: "Bus", etiquetas: ["Llegada tarde"] }),
    op.dia({ fecha, tipo: "clase", motivo: "", nota: "" }),
  ]);
  let mes = await espacio.cargarMes("2031-03");
  assert.equal(mes.dias.length, 1);
  assert.equal(mes.registros.length, 2);

  await espacio.aplicar([op.borrarRegistro(fecha, 9001), op.dia({ fecha, nota: "Evaluación" })]);
  mes = await espacio.cargarMes("2031-03");
  assert.deepEqual(mes.registros.map((registro) => registro.mat), [9002]);
  assert.equal(mes.dias[0].tipo, "clase", "guardar un día mezcla los campos, como Firestore con merge");
  assert.equal(mes.dias[0].nota, "Evaluación");

  await espacio.aplicar([op.borrarRegistro(fecha, 9002), op.borrarDia(fecha)]);
  mes = await espacio.cargarMes("2031-03");
  assert.equal(mes.dias.length + mes.registros.length, 0);
  await assert.rejects(() => espacio.aplicar([{ tipo: "otro", datos: {} }]), /desconocida/);
});

// ——— Service worker ———

function cargarServiceWorker() {
  const contexto = vm.createContext({ self: { addEventListener() {}, location: { origin: "https://ejemplo" } } });
  return vm.runInContext(`${leer("sw.js")}\n;({ CARCASA, SDK_FIREBASE, VERSION_FIREBASE })`, contexto);
}

function importacionesDe(ruta, vistos = new Set()) {
  if (vistos.has(ruta)) return vistos;
  vistos.add(ruta);
  const codigo = leer(ruta);
  for (const [, destino] of codigo.matchAll(/(?:import|from)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    importacionesDe(normalize(join(dirname(ruta), destino)), vistos);
  }
  return vistos;
}

test("el service worker guarda todos los módulos que carga la app", () => {
  const { CARCASA } = cargarServiceWorker();
  for (const ruta of CARCASA) {
    if (ruta === "./") continue;
    assert.ok(existsSync(join(raiz, ruta)), `${ruta} no existe`);
  }
  for (const modulo of importacionesDe("app.js")) {
    assert.ok(CARCASA.includes(modulo), `${modulo} falta en la lista del service worker`);
  }
  for (const [, libreria] of leer("src/informe-pdf.js").matchAll(/src: "(vendor\/[^"]+)"/g)) {
    assert.ok(CARCASA.includes(libreria), `${libreria} falta en la lista del service worker`);
  }
});

test("el service worker guarda la misma versión de Firebase que usa la app", () => {
  const { SDK_FIREBASE, VERSION_FIREBASE: versionSw } = cargarServiceWorker();
  assert.equal(versionSw, VERSION_FIREBASE);
  assert.equal(SDK_FIREBASE.length, 3);
  for (const url of SDK_FIREBASE) assert.ok(url.includes(`/firebasejs/${VERSION_FIREBASE}/`));
});
