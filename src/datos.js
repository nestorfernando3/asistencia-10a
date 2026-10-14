import { FIREBASE_CONFIG } from "./firebase-config.js";
import { claveDeFecha, mesSiguiente } from "./dominio.js";

const VERSION_FIREBASE = "11.0.2";
const urlSdk = (paquete) => `https://www.gstatic.com/firebasejs/${VERSION_FIREBASE}/${paquete}.js`;

export function hayConfiguracion() {
  return Boolean(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

export async function crearRepositorio({ demo = false } = {}) {
  if (demo) return crearRepositorioDemo();
  if (!hayConfiguracion()) throw new Error("Falta la configuración de Firebase");
  return crearRepositorioFirebase(FIREBASE_CONFIG);
}

function ordenar(lista) {
  return [...lista].sort((a, b) => Number(a.no || 0) - Number(b.no || 0));
}

function limpiar(objeto) {
  const salida = {};
  for (const [clave, valor] of Object.entries(objeto)) {
    if (valor === undefined) continue;
    salida[clave] = valor;
  }
  return salida;
}

function mensajeDeError(error) {
  const codigo = String(error?.code || "");
  if (codigo.includes("invalid-credential") || codigo.includes("wrong-password") || codigo.includes("user-not-found")) {
    return "Correo o contraseña incorrectos.";
  }
  if (codigo.includes("invalid-email")) return "El correo no tiene un formato válido.";
  if (codigo.includes("too-many-requests")) return "Demasiados intentos. Espera un momento e intenta de nuevo.";
  if (codigo.includes("network")) return "Sin conexión. Revisa el internet e intenta de nuevo.";
  return "No se pudo entrar. Intenta de nuevo.";
}

async function crearRepositorioFirebase(config) {
  const [modApp, modAuth, modFs] = await Promise.all([
    import(urlSdk("firebase-app")),
    import(urlSdk("firebase-auth")),
    import(urlSdk("firebase-firestore")),
  ]);
  const app = modApp.initializeApp(config);
  const auth = modAuth.getAuth(app);
  const db = modFs.getFirestore(app);

  const refEstudiante = (mat) => modFs.doc(db, "estudiantes", String(mat));

  return {
    modo: "firebase",

    observarSesion(observador) {
      return modAuth.onAuthStateChanged(auth, observador);
    },

    async entrar(correo, clave) {
      try {
        await modAuth.signInWithEmailAndPassword(auth, correo, clave);
      } catch (error) {
        throw new Error(mensajeDeError(error));
      }
    },

    async salir() {
      await modAuth.signOut(auth);
    },

    async listarEstudiantes() {
      const resultado = await modFs.getDocs(modFs.collection(db, "estudiantes"));
      return ordenar(resultado.docs.map((doc) => doc.data()));
    },

    async guardarEstudiante(estudiante) {
      await modFs.setDoc(refEstudiante(estudiante.mat), limpiar(estudiante), { merge: true });
    },

    async importarLista(lista) {
      const lote = modFs.writeBatch(db);
      for (const estudiante of lista) {
        lote.set(refEstudiante(estudiante.mat), limpiar(estudiante), { merge: true });
      }
      await lote.commit();
      return lista.length;
    },

    async cargarMes(claveMes) {
      const inicio = `${claveMes}-01`;
      const fin = `${mesSiguiente(claveMes)}-01`;
      const [dias, registros] = await Promise.all([
        modFs.getDocs(
          modFs.query(
            modFs.collection(db, "dias"),
            modFs.where(modFs.documentId(), ">=", inicio),
            modFs.where(modFs.documentId(), "<", fin)
          )
        ),
        modFs.getDocs(
          modFs.query(
            modFs.collection(db, "asistencia"),
            modFs.where(modFs.documentId(), ">=", inicio),
            modFs.where(modFs.documentId(), "<", fin)
          )
        ),
      ]);
      return {
        dias: dias.docs.map((doc) => doc.data()),
        registros: registros.docs.map((doc) => doc.data()),
      };
    },

    async guardarDia(dia) {
      await modFs.setDoc(modFs.doc(db, "dias", dia.fecha), limpiar(dia), { merge: true });
    },

    async borrarDia(fecha) {
      await modFs.deleteDoc(modFs.doc(db, "dias", fecha));
    },

    async guardarRegistro(registro) {
      await modFs.setDoc(
        modFs.doc(db, "asistencia", `${registro.fecha}_${registro.mat}`),
        limpiar(registro),
        { merge: true }
      );
    },

    async borrarRegistro(fecha, mat) {
      await modFs.deleteDoc(modFs.doc(db, "asistencia", `${fecha}_${mat}`));
    },

    async exportarTodo() {
      const [estudiantes, dias, registros] = await Promise.all([
        modFs.getDocs(modFs.collection(db, "estudiantes")),
        modFs.getDocs(modFs.collection(db, "dias")),
        modFs.getDocs(modFs.collection(db, "asistencia")),
      ]);
      return {
        app: "asistencia-10a",
        exportado: new Date().toISOString(),
        estudiantes: estudiantes.docs.map((doc) => doc.data()),
        dias: dias.docs.map((doc) => doc.data()),
        registros: registros.docs.map((doc) => doc.data()),
      };
    },

    async importarTodo(entrada) {
      const lote = modFs.writeBatch(db);
      let total = 0;
      for (const estudiante of entrada.estudiantes || []) {
        lote.set(refEstudiante(estudiante.mat), limpiar(estudiante), { merge: true });
        total++;
      }
      for (const dia of entrada.dias || []) {
        lote.set(modFs.doc(db, "dias", dia.fecha), limpiar(dia), { merge: true });
        total++;
      }
      for (const registro of entrada.registros || []) {
        lote.set(
          modFs.doc(db, "asistencia", `${registro.fecha}_${registro.mat}`),
          limpiar(registro),
          { merge: true }
        );
        total++;
      }
      await lote.commit();
      return total;
    },

    async cargarAjustes() {
      const resultado = await modFs.getDoc(modFs.doc(db, "ajustes", "config"));
      return resultado.exists() ? resultado.data() : null;
    },
  };
}

const CLAVE_DEMO = "asistencia10a.demo.v1";

function sembrarDemo() {
  const estudiantes = [
    { mat: 9001, no: 1, nombre: "ACOSTA RIVERA ANA MARIA", estado: "activo", notaPersistente: null },
    { mat: 9002, no: 2, nombre: "BARRIOS MEZA LUIS CARLOS", estado: "activo", notaPersistente: null },
    { mat: 9003, no: 3, nombre: "CAMARGO DIAZ VALENTINA", estado: "activo", notaPersistente: null },
    { mat: 9004, no: 4, nombre: "DIAZ OSPINO MATEO", estado: "activo", notaPersistente: null },
    { mat: 9005, no: 5, nombre: "ESCOBAR PINTO LUISA FERNANDA", estado: "activo", notaPersistente: null },
    { mat: 9006, no: 6, nombre: "GOMEZ VILLA SAMUEL", estado: "activo", notaPersistente: null },
    { mat: 9007, no: 7, nombre: "HURTADO CASTRO MARIANA", estado: "activo", notaPersistente: null },
    { mat: 9008, no: 8, nombre: "JIMENEZ ROJAS ANDRES", estado: "activo", notaPersistente: null },
    { mat: 9009, no: 9, nombre: "LUNA PEREZ SOFIA", estado: "activo", notaPersistente: null },
    { mat: 9010, no: 10, nombre: "MEDINA SALAS JUAN PABLO", estado: "activo", notaPersistente: null },
    { mat: 9011, no: 11, nombre: "NIÑO TORRES ISABELLA", estado: "activo", notaPersistente: null },
    { mat: 9012, no: 12, nombre: "OCAMPO RUIZ SEBASTIAN", estado: "activo", notaPersistente: null },
  ];

  const dias = {};
  const registros = {};
  const hoy = new Date();
  const fechas = [];
  for (let atras = 1; fechas.length < 6 && atras <= 12; atras++) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras);
    if (fecha.getMonth() !== hoy.getMonth()) break;
    const indice = fecha.getDay();
    if (indice === 0 || indice === 6) continue;
    fechas.push(claveDeFecha(fecha));
  }
  fechas.reverse();

  const festivo = fechas.length > 2 ? fechas[2] : null;
  for (const fecha of fechas) {
    dias[fecha] = fecha === festivo
      ? { fecha, tipo: "sinClase", motivo: "Jornada institucional", nota: "" }
      : { fecha, tipo: "clase", motivo: "", nota: "" };
  }
  const deClase = fechas.filter((fecha) => fecha !== festivo);
  const poner = (fecha, mat, estado, comentario = "", etiquetas = []) => {
    if (!fecha) return;
    registros[`${fecha}_${mat}`] = { fecha, mat, estado, comentario, etiquetas };
  };
  poner(deClase[0], 9004, "Ausente");
  poner(deClase[1], 9004, "Ausente");
  poner(deClase[2], 9004, "Ausente");
  poner(deClase[1], 9003, "Ausente");
  poner(deClase[3], 9005, "Tarde", "", ["Llegada tarde"]);
  poner(deClase[2], 9007, "Excusa", "Cita médica EPS", ["Cita médica"]);
  poner(deClase[deClase.length - 1], 9010, "Ausente", "Sin excusa al día siguiente");

  return { estudiantes, dias, registros, ajustes: null };
}

function crearRepositorioDemo() {
  let sesion = false;
  let observador = null;
  let datos = cargar() || sembrarDemo();

  function cargar() {
    try {
      const bruto = localStorage.getItem(CLAVE_DEMO);
      return bruto ? JSON.parse(bruto) : null;
    } catch {
      return null;
    }
  }

  function persistir() {
    localStorage.setItem(CLAVE_DEMO, JSON.stringify(datos));
  }

  function upsertEstudiante(estudiante) {
    datos.estudiantes = datos.estudiantes.filter((otro) => otro.mat !== estudiante.mat);
    datos.estudiantes.push(estudiante);
    datos.estudiantes = ordenar(datos.estudiantes);
  }

  return {
    modo: "demo",

    observarSesion(callback) {
      observador = callback;
      callback(sesion ? { email: "demo@local" } : null);
    },

    async entrar() {
      sesion = true;
      if (observador) observador({ email: "demo@local" });
    },

    async salir() {
      sesion = false;
      if (observador) observador(null);
    },

    async listarEstudiantes() {
      return ordenar(datos.estudiantes);
    },

    async guardarEstudiante(estudiante) {
      upsertEstudiante(estudiante);
      persistir();
    },

    async importarLista(lista) {
      for (const estudiante of lista) upsertEstudiante(estudiante);
      persistir();
      return lista.length;
    },

    async cargarMes(claveMes) {
      return {
        dias: Object.values(datos.dias).filter((dia) => dia.fecha.startsWith(claveMes)),
        registros: Object.values(datos.registros).filter((registro) => registro.fecha.startsWith(claveMes)),
      };
    },

    async guardarDia(dia) {
      datos.dias[dia.fecha] = dia;
      persistir();
    },

    async borrarDia(fecha) {
      delete datos.dias[fecha];
      persistir();
    },

    async guardarRegistro(registro) {
      datos.registros[`${registro.fecha}_${registro.mat}`] = registro;
      persistir();
    },

    async borrarRegistro(fecha, mat) {
      delete datos.registros[`${fecha}_${mat}`];
      persistir();
    },

    async exportarTodo() {
      return {
        app: "asistencia-10a",
        exportado: new Date().toISOString(),
        estudiantes: datos.estudiantes,
        dias: Object.values(datos.dias),
        registros: Object.values(datos.registros),
      };
    },

    async importarTodo(entrada) {
      let total = 0;
      for (const estudiante of entrada.estudiantes || []) {
        upsertEstudiante(estudiante);
        total++;
      }
      for (const dia of entrada.dias || []) {
        datos.dias[dia.fecha] = dia;
        total++;
      }
      for (const registro of entrada.registros || []) {
        datos.registros[`${registro.fecha}_${registro.mat}`] = registro;
        total++;
      }
      persistir();
      return total;
    },

    async cargarAjustes() {
      return datos.ajustes || null;
    },
  };
}
