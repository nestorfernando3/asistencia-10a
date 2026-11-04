// Acceso a datos de la interfaz principal.
//
// Lee y escribe exactamente los mismos documentos que la versión clásica
// (src/datos.js): estudiantes/{mat}, dias/{AAAA-MM-DD}, asistencia/{AAAA-MM-DD}_{mat}
// y ajustes/config, con la misma forma. La única diferencia es que cada curso
// trae sus rutas (ver config.js), lo que deja lista la app para varios cursos.

import { FIREBASE_CONFIG } from "./firebase-config.js";
import { claveDeFecha, mesSiguiente, mesAnterior, claveRegistro } from "./dominio.js";
import { festivo } from "./festivos.js";

const VERSION_FIREBASE = "11.0.2";
const urlSdk = (paquete) => `https://www.gstatic.com/firebasejs/${VERSION_FIREBASE}/${paquete}.js`;

export function hayConfiguracion() {
  return Boolean(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

export async function crearRepositorio({ demo = false } = {}) {
  if (demo || !hayConfiguracion()) return crearRepositorioDemo();
  return crearRepositorioFirebase(FIREBASE_CONFIG);
}

function ordenar(lista) {
  return [...lista].sort((a, b) => Number(a.no || 0) - Number(b.no || 0));
}

function limpiar(objeto) {
  const salida = {};
  for (const [clave, valor] of Object.entries(objeto)) {
    if (valor !== undefined) salida[clave] = valor;
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
  if (codigo.includes("operation-not-allowed")) return "El acceso con correo y contraseña no está habilitado en Firebase.";
  if (codigo.includes("user-disabled")) return "Esta cuenta está deshabilitada.";
  if (codigo.includes("unauthorized-domain")) return "Este dominio no está autorizado en Firebase Authentication.";
  return codigo ? `No se pudo entrar (Firebase: ${codigo}).` : "No se pudo entrar. Intenta de nuevo.";
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

  function delCurso(curso) {
    const { rutas } = curso;
    const coleccion = (nombre) => modFs.collection(db, ...rutas[nombre]);
    const documento = (nombre, id) => modFs.doc(db, ...rutas[nombre], String(id));
    const refEstudiante = (mat) => documento("estudiantes", mat);
    const refDia = (fecha) => documento("dias", fecha);
    const refRegistro = (fecha, mat) => documento("asistencia", claveRegistro(fecha, mat));
    const rango = (nombre, inicio, fin) => modFs.getDocs(modFs.query(
      coleccion(nombre),
      modFs.where(modFs.documentId(), ">=", inicio),
      modFs.where(modFs.documentId(), "<", fin),
    ));

    return {
      async listarEstudiantes() {
        const resultado = await modFs.getDocs(coleccion("estudiantes"));
        return ordenar(resultado.docs.map((doc) => doc.data()));
      },
      async guardarEstudiante(estudiante) {
        await modFs.setDoc(refEstudiante(estudiante.mat), limpiar(estudiante), { merge: true });
      },
      async importarLista(lista) {
        const lote = modFs.writeBatch(db);
        for (const estudiante of lista) lote.set(refEstudiante(estudiante.mat), limpiar(estudiante), { merge: true });
        await lote.commit();
        return lista.length;
      },
      async cargarMes(claveMes) {
        const inicio = `${claveMes}-01`;
        const fin = `${mesSiguiente(claveMes)}-01`;
        const [dias, registros] = await Promise.all([rango("dias", inicio, fin), rango("asistencia", inicio, fin)]);
        return {
          dias: dias.docs.map((doc) => doc.data()),
          registros: registros.docs.map((doc) => doc.data()),
        };
      },
      async guardarDia(dia) {
        await modFs.setDoc(refDia(dia.fecha), limpiar(dia), { merge: true });
      },
      async borrarDia(fecha) {
        await modFs.deleteDoc(refDia(fecha));
      },
      async guardarRegistro(registro) {
        await modFs.setDoc(refRegistro(registro.fecha, registro.mat), limpiar(registro), { merge: true });
      },
      async borrarRegistro(fecha, mat) {
        await modFs.deleteDoc(refRegistro(fecha, mat));
      },
      async exportarTodo() {
        const [estudiantes, dias, registros] = await Promise.all([
          modFs.getDocs(coleccion("estudiantes")),
          modFs.getDocs(coleccion("dias")),
          modFs.getDocs(coleccion("asistencia")),
        ]);
        return {
          app: "asistencia-10a",
          curso: curso.id,
          exportado: new Date().toISOString(),
          estudiantes: estudiantes.docs.map((doc) => doc.data()),
          dias: dias.docs.map((doc) => doc.data()),
          registros: registros.docs.map((doc) => doc.data()),
        };
      },
      async importarTodo(entrada) {
        // Firestore admite 500 escrituras por lote: se parte en bloques.
        const operaciones = [
          ...(entrada.estudiantes || []).map((estudiante) => [refEstudiante(estudiante.mat), estudiante]),
          ...(entrada.dias || []).map((dia) => [refDia(dia.fecha), dia]),
          ...(entrada.registros || []).map((registro) => [refRegistro(registro.fecha, registro.mat), registro]),
        ];
        for (let inicio = 0; inicio < operaciones.length; inicio += 450) {
          const lote = modFs.writeBatch(db);
          for (const [ref, datos] of operaciones.slice(inicio, inicio + 450)) lote.set(ref, limpiar(datos), { merge: true });
          await lote.commit();
        }
        return operaciones.length;
      },
      async cargarAjustes() {
        const resultado = await modFs.getDoc(modFs.doc(db, ...rutas.ajustes));
        return resultado.exists() ? resultado.data() : null;
      },
    };
  }

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
    delCurso,
  };
}

// ——— Modo demo: datos ficticios, solo en este navegador ———

const CLAVE_DEMO = "asistencia.v2.demo";

const NOMBRES_DEMO = [
  "ACOSTA RIVERA ANA MARIA", "BARRIOS MEZA LUIS CARLOS", "CAMARGO DIAZ VALENTINA", "DE LA HOZ OSPINO MATEO",
  "ESCOBAR PINTO LUISA FERNANDA", "FONTALVO VILLA SAMUEL", "GUTIERREZ CASTRO MARIANA", "HERRERA ROJAS ANDRES FELIPE",
  "JIMENEZ PEREZ SOFIA", "LOPEZ SALAS JUAN PABLO", "MARTINEZ TORRES ISABELLA", "MENDOZA RUIZ SEBASTIAN",
  "NAVARRO CANTILLO DANIELA", "ORTEGA BOLAÑO SANTIAGO", "PACHECO MOLINA GABRIELA", "PALMA ARIZA DAVID ESTEBAN",
  "QUINTERO LARA CAMILA", "RAMOS CHARRIS TOMAS", "RODRIGUEZ POLO MARIA JOSE", "SARMIENTO VEGA NICOLAS",
  "SUAREZ BARRAZA LAURA SOFIA", "TORRES MERCADO EMMANUEL", "VASQUEZ OROZCO ANTONELLA", "ZAPATA FERIA JERONIMO",
];

export function sembrarDemo() {
  const estudiantes = NOMBRES_DEMO.map((nombre, indice) => ({
    mat: 9001 + indice,
    no: indice + 1,
    nombre,
    estado: indice === 22 ? "retirada" : "activo",
    notaPersistente: indice === 6 ? "Ajustes PIAR: tiempo adicional en evaluaciones" : null,
  }));

  const dias = {};
  const registros = {};
  const hoy = new Date();
  const ayer = claveDeFecha(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1));
  const mesActual = claveDeFecha(hoy).slice(0, 7);
  const meses = [mesAnterior(mesActual), mesActual];

  // Generador determinista para que la demo se vea igual en cada carga.
  let semilla = 7;
  const azar = () => {
    semilla = (semilla * 9301 + 49297) % 233280;
    return semilla / 233280;
  };
  const poner = (fecha, mat, estado, comentario = "", etiquetas = []) => {
    registros[claveRegistro(fecha, mat)] = { fecha, mat, estado, comentario, etiquetas };
  };

  for (const mes of meses) {
    const [anio, numeroMes] = mes.split("-").map(Number);
    const total = new Date(anio, numeroMes, 0).getDate();
    let indiceClase = 0;
    for (let dia = 1; dia <= total; dia++) {
      const fecha = claveDeFecha(new Date(anio, numeroMes - 1, dia));
      if (fecha > ayer) break;
      const semana = new Date(anio, numeroMes - 1, dia).getDay();
      if (semana === 0 || semana === 6 || festivo(fecha)) continue;
      if (indiceClase === 6) {
        dias[fecha] = { fecha, tipo: "sinClase", motivo: "Festivo", nota: "" };
        indiceClase++;
        continue;
      }
      if (indiceClase === 13) {
        dias[fecha] = { fecha, tipo: "sinClase", motivo: "Jornada institucional", nota: "" };
        indiceClase++;
        continue;
      }
      dias[fecha] = { fecha, tipo: "clase", motivo: "", nota: indiceClase === 9 ? "Salida pedagógica al Museo del Caribe (2.ª hora)." : "" };
      for (const estudiante of estudiantes) {
        if (estudiante.estado === "retirada") continue;
        const r = azar();
        if (r < 0.045) poner(fecha, estudiante.mat, "Ausente");
        else if (r < 0.075) poner(fecha, estudiante.mat, "Tarde", "", ["Llegada tarde"]);
        else if (r < 0.09) poner(fecha, estudiante.mat, "Excusa", "Excusa firmada por acudiente", ["Excusa médica"]);
      }
      indiceClase++;
    }
  }

  // Casos que activan alertas y observaciones visibles.
  const clases = Object.values(dias).filter((dia) => dia.tipo === "clase").map((dia) => dia.fecha).sort();
  const delMesAnterior = clases.filter((fecha) => fecha.startsWith(meses[0]));
  for (const fecha of delMesAnterior.slice(3, 6)) poner(fecha, 9004, "Ausente", "", []);
  if (delMesAnterior[6]) poner(delMesAnterior[6], 9004, "Presente", "Acudiente informa situación familiar; se remite a orientación.", ["Disciplina"]);
  for (const fecha of delMesAnterior.filter((_, indice) => indice % 4 === 1).slice(0, 5)) poner(fecha, 9012, "Ausente");
  if (delMesAnterior[8]) poner(delMesAnterior[8], 9007, "Excusa", "Cita médica EPS", ["Cita médica"]);

  return { estudiantes, dias, registros, ajustes: null };
}

const CLAVE_SESION_DEMO = "asistencia.v2.demo.sesion";

function leerSesionDemo() {
  try {
    return sessionStorage.getItem(CLAVE_SESION_DEMO) === "1";
  } catch {
    return false;
  }
}

function fijarSesionDemo(activa) {
  try {
    if (activa) sessionStorage.setItem(CLAVE_SESION_DEMO, "1");
    else sessionStorage.removeItem(CLAVE_SESION_DEMO);
  } catch {
    // Sin almacenamiento de sesión: la demo pide entrar en cada recarga.
  }
}

function crearRepositorioDemo() {
  let sesion = leerSesionDemo();
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
    try {
      localStorage.setItem(CLAVE_DEMO, JSON.stringify(datos));
    } catch {
      // Sin almacenamiento (ventana privada): la demo sigue en memoria.
    }
  }

  function upsertEstudiante(estudiante) {
    datos.estudiantes = ordenar([...datos.estudiantes.filter((otro) => otro.mat !== estudiante.mat), estudiante]);
  }

  const espacio = {
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
      datos.registros[claveRegistro(registro.fecha, registro.mat)] = registro;
      persistir();
    },
    async borrarRegistro(fecha, mat) {
      delete datos.registros[claveRegistro(fecha, mat)];
      persistir();
    },
    async exportarTodo() {
      return {
        app: "asistencia-10a",
        curso: "demo",
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
        datos.registros[claveRegistro(registro.fecha, registro.mat)] = registro;
        total++;
      }
      persistir();
      return total;
    },
    async cargarAjustes() {
      return datos.ajustes || null;
    },
  };

  return {
    modo: "demo",
    observarSesion(callback) {
      observador = callback;
      callback(sesion ? { email: "demo@local" } : null);
      return () => {};
    },
    async entrar() {
      sesion = true;
      fijarSesionDemo(true);
      observador?.({ email: "demo@local" });
    },
    async salir() {
      sesion = false;
      fijarSesionDemo(false);
      observador?.(null);
    },
    reiniciarDemo() {
      datos = sembrarDemo();
      persistir();
    },
    delCurso() {
      return espacio;
    },
  };
}
