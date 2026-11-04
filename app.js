// Asistencia · interfaz principal.
// Misma base de datos que la versión clásica (ver src/repositorio.js); interfaz,
// navegación y documentos nuevos. Todo el estado de pantalla vive en `estado`
// y cada cambio vuelve a pintar la vista con render().

import { crearRepositorio } from "./src/repositorio.js";
import * as D from "./src/dominio.js";
import * as A from "./src/analisis.js";
import { INSTITUCION, cursosDe, slugCurso } from "./src/config.js";
import { icono } from "./src/iconos.js";
import { festivo } from "./src/festivos.js";
import {
  datosDelMes, excelDelMes, csvResumenDelMes, csvDetalleDelMes, csvListaDelCurso, nombreArchivo,
} from "./src/exportes.js";
import { crearInformePdf, prepararPdf } from "./src/informe-pdf.js";

const raiz = document.getElementById("app");
const zonaAvisos = document.querySelector(".avisos");
const parametros = new URLSearchParams(location.search);
const CLAVE_PREFERENCIAS = "asistencia.v2.preferencias";

const LETRA = { [D.PRESENTE]: "p", [D.AUSENTE]: "a", [D.TARDE]: "t", [D.EXCUSA]: "e" };
const PLURAL = {
  [D.PRESENTE]: ["presente", "presentes"],
  [D.AUSENTE]: ["ausente", "ausentes"],
  [D.TARDE]: ["tarde", "tardes"],
  [D.EXCUSA]: ["excusa", "excusas"],
};

const estado = {
  modo: null,
  usuario: null,
  cursos: [],
  curso: null,
  espacio: null,
  estudiantes: [],
  ajustes: null,
  cache: new Map(),
  mes: D.hoyClave().slice(0, 7),
  rutaPintada: "",
  hoja: null,
  etiquetasBorrador: [],
  busqueda: "",
  filtro: null,
  orden: "no",
  deshacer: null,
  guardando: 0,
  errorGuardado: false,
  incluirObservaciones: false,
  generando: null,
};

let repo = null;
let tokenRender = 0;

// ——— Utilidades ———

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caracter) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[caracter]
  ));
}

function plural(cantidad, singular, varios) {
  return `${cantidad} ${cantidad === 1 ? singular : varios}`;
}

function capitalizar(texto) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

function ordenarLocal(lista) {
  return [...lista].sort((a, b) => Number(a.no || 0) - Number(b.no || 0));
}

function activos() {
  return estado.estudiantes.filter((estudiante) => estudiante.estado !== "retirada");
}

function leerPreferencias() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS) || "{}");
  } catch {
    return {};
  }
}

function guardarPreferencia(clave, valor) {
  try {
    localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify({ ...leerPreferencias(), [clave]: valor }));
  } catch {
    // Sin almacenamiento local: la preferencia dura solo esta sesión.
  }
}

function esTactil() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function descargar(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);
}

// En el celular (sobre todo en la app instalada) la descarga directa no siempre
// funciona: se ofrece el menú Compartir para guardar en Archivos o enviar.
async function entregarArchivo(nombre, blob) {
  const archivo = new File([blob], nombre, { type: blob.type });
  if (esTactil() && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return "compartido";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelado";
    }
  }
  descargar(nombre, blob);
  return "descargado";
}

// ——— Avisos y estado de guardado ———

function avisar(texto, { tipo = "ok", deshacer = false, duracion = 5000 } = {}) {
  zonaAvisos.querySelectorAll(".aviso").forEach((otro) => {
    if (deshacer || otro.dataset.deshacer) otro.remove();
  });
  const aviso = document.createElement("div");
  aviso.className = `aviso aviso-${tipo}`;
  aviso.setAttribute("role", tipo === "error" ? "alert" : "status");
  if (deshacer) aviso.dataset.deshacer = "1";
  aviso.innerHTML = `
    <span class="aviso-icono">${icono(tipo === "error" ? "alerta" : "check", { tamano: 18 })}</span>
    <span class="aviso-texto">${esc(texto)}</span>
    ${deshacer ? `<button type="button" class="aviso-accion" data-accion="deshacer">${icono("deshacer", { tamano: 16 })}Deshacer</button>` : ""}
  `;
  zonaAvisos.appendChild(aviso);
  requestAnimationFrame(() => aviso.classList.add("visible"));
  setTimeout(() => {
    aviso.classList.remove("visible");
    setTimeout(() => aviso.remove(), 300);
  }, duracion);
}

function pintarIndicador() {
  const html = indicadorGuardado();
  document.querySelectorAll("[data-rol='indicador']").forEach((nodo) => {
    nodo.outerHTML = html;
  });
}

function indicadorGuardado() {
  if (estado.modo === "demo") {
    return `<span class="indicador indicador-demo" data-rol="indicador" title="Los datos de la demo quedan solo en este navegador">${icono("info", { tamano: 15 })}<span>Demo</span></span>`;
  }
  if (estado.guardando > 0) {
    return `<span class="indicador indicador-guardando" data-rol="indicador">${icono("nube", { tamano: 15 })}<span>Guardando…</span></span>`;
  }
  if (estado.errorGuardado) {
    return `<span class="indicador indicador-error" data-rol="indicador">${icono("nubeError", { tamano: 15 })}<span>Sin guardar</span></span>`;
  }
  return `<span class="indicador" data-rol="indicador">${icono("check", { tamano: 15 })}<span>Guardado</span></span>`;
}

async function guardarEnSegundoPlano(tarea, mensajeError) {
  estado.guardando++;
  pintarIndicador();
  try {
    await tarea();
    estado.errorGuardado = false;
    return true;
  } catch (error) {
    console.error(error);
    estado.errorGuardado = true;
    avisar(mensajeError || "No se pudo guardar. Revisa la conexión.", { tipo: "error", duracion: 8000 });
    return false;
  } finally {
    estado.guardando--;
    pintarIndicador();
  }
}

// ——— Arranque y datos ———

async function iniciar() {
  try {
    repo = await crearRepositorio({ demo: parametros.has("demo") });
  } catch (error) {
    console.error(error);
    raiz.innerHTML = vistaFallo("No se pudo conectar con la base de datos. Revisa el internet y recarga la página.");
    return;
  }
  estado.modo = repo.modo;
  repo.observarSesion(async (usuario) => {
    estado.usuario = usuario;
    estado.cache.clear();
    estado.deshacer = null;
    estado.hoja = null;
    if (usuario) {
      estado.cursos = estado.modo === "demo" ? cursosDe("") : cursosDe(usuario.email);
      const preferido = leerPreferencias().curso;
      estado.curso = estado.cursos.find((curso) => curso.id === preferido) || estado.cursos[0] || null;
      await cargarCurso();
    } else {
      estado.cursos = [];
      estado.curso = null;
      estado.espacio = null;
      estado.estudiantes = [];
    }
    render();
  });
}

async function cargarCurso() {
  estado.cache.clear();
  estado.estudiantes = [];
  estado.ajustes = null;
  if (!estado.curso) return;
  estado.espacio = repo.delCurso(estado.curso);
  try {
    const [estudiantes, ajustes] = await Promise.all([estado.espacio.listarEstudiantes(), estado.espacio.cargarAjustes()]);
    estado.estudiantes = estudiantes;
    estado.ajustes = ajustes;
  } catch (error) {
    console.error(error);
    avisar("No se pudieron cargar los estudiantes.", { tipo: "error" });
  }
}

async function asegurarMes(mes) {
  if (estado.cache.has(mes)) return estado.cache.get(mes);
  const { dias, registros } = await estado.espacio.cargarMes(mes);
  const cache = {
    dias: new Map(dias.map((dia) => [dia.fecha, dia])),
    registros: new Map(registros.map((registro) => [D.claveRegistro(registro.fecha, registro.mat), registro])),
  };
  estado.cache.set(mes, cache);
  return cache;
}

function datosMes(mes) {
  const cache = estado.cache.get(mes);
  return datosDelMes({
    estudiantes: estado.estudiantes,
    dias: [...cache.dias.values()],
    registros: [...cache.registros.values()],
    ajustes: estado.ajustes,
    mes,
  });
}

function umbrales() {
  return { ...D.AJUSTES_POR_DEFECTO, ...(estado.ajustes || {}) };
}

// ——— Rutas ———

const esMes = (valor) => /^\d{4}-\d{2}$/.test(valor || "");
const esFecha = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor || "");

function ruta() {
  const [vista = "hoy", param = null] = location.hash.replace(/^#\/?/, "").split("/");
  return { vista: vista || "hoy", param };
}

function ir(destino) {
  if (location.hash === destino) render();
  else location.hash = destino;
}

async function render() {
  const token = ++tokenRender;
  const foco = document.activeElement?.dataset?.foco || null;
  const seleccion = foco ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;

  if (!estado.modo) return;
  if (!estado.usuario) {
    raiz.innerHTML = vistaEntrar();
    estado.rutaPintada = "entrar";
    return;
  }
  if (!estado.curso) {
    raiz.innerHTML = vistaSinCursos();
    return;
  }

  const { vista, param } = ruta();
  const firma = `${vista}/${param || ""}`;
  const cambioDeRuta = firma !== estado.rutaPintada;
  if (cambioDeRuta) {
    estado.busqueda = "";
    estado.filtro = null;
  }

  let mes = estado.mes;
  let fecha = null;
  if (vista === "dia") {
    fecha = esFecha(param) ? param : D.hoyClave();
    if (fecha > D.hoyClave()) fecha = D.hoyClave();
    mes = fecha.slice(0, 7);
  } else if (vista === "hoy") {
    mes = D.hoyClave().slice(0, 7);
  } else if (esMes(param)) {
    mes = param;
  }

  try {
    if (vista !== "estudiantes" && !estado.cache.has(mes)) {
      if (cambioDeRuta) raiz.innerHTML = marco(vista, `<div class="cargando-vista" role="status">${icono("reloj", { tamano: 22 })}<span>Cargando ${esc(D.mesHumano(mes).toLowerCase())}…</span></div>`);
      await asegurarMes(mes);
      if (token !== tokenRender) return;
    }
    if (vista !== "estudiantes") estado.mes = mes;

    let contenido;
    if (vista === "dia") contenido = vistaDia(fecha);
    else if (vista === "calendario") contenido = vistaCalendario(mes);
    else if (vista === "resumen") {
      contenido = vistaResumen(mes);
      // Deja lista la librería del informe mientras se revisa el resumen.
      prepararPdf().catch(() => {});
    }
    else if (vista === "estudiantes") contenido = vistaEstudiantes();
    else contenido = vistaHoy();

    raiz.innerHTML = marco(vista, contenido) + hojaHtml();
    raiz.classList.toggle("con-hoja", Boolean(estado.hoja));
    document.body.classList.toggle("sin-scroll", Boolean(estado.hoja));
  } catch (error) {
    console.error(error);
    raiz.innerHTML = marco(vista, vistaFallo("No se pudieron cargar los datos. Revisa la conexión e intenta de nuevo.", true));
  }

  if (cambioDeRuta) {
    estado.rutaPintada = firma;
    window.scrollTo({ top: 0 });
    raiz.querySelector(".vista")?.classList.add("entra");
  }
  if (foco) {
    const nodo = raiz.querySelector(`[data-foco="${foco}"]`);
    if (nodo) {
      nodo.focus({ preventScroll: true });
      if (seleccion && typeof nodo.setSelectionRange === "function") {
        try {
          nodo.setSelectionRange(...seleccion);
        } catch {
          // Algunos campos (number) no admiten selección.
        }
      }
    }
  } else if (estado.hoja?.enfocar) {
    (raiz.querySelector(".hoja [data-autofoco]") || raiz.querySelector(".hoja-cabecera .boton-icono"))?.focus();
    estado.hoja.enfocar = false;
  }
}

// ——— Marco de la app ———

const NAVEGACION = [
  ["hoy", "Hoy", "hoy"],
  ["calendario", "Calendario", "calendario"],
  ["resumen", "Resumen", "resumen"],
  ["estudiantes", "Estudiantes", "estudiantes"],
];

function destinoDe(id) {
  if (id === "calendario" || id === "resumen") return `#/${id}/${estado.mes}`;
  return `#/${id}`;
}

function marco(vista, contenido) {
  const activa = vista === "dia" ? "calendario" : vista;
  const enlaces = NAVEGACION.map(([id, etiqueta, nombreIcono]) => `
    <a href="${destinoDe(id)}" class="nav-enlace${activa === id ? " activo" : ""}" ${activa === id ? 'aria-current="page"' : ""}>
      ${icono(nombreIcono, { tamano: 22 })}<span>${etiqueta}</span>
    </a>
  `).join("");
  const varios = estado.cursos.length > 1;
  const curso = `
    <button type="button" class="selector-curso" data-accion="abrir-cursos" aria-label="Curso ${esc(estado.curso.nombre)}${varios ? ". Cambiar de curso" : ""}">
      <span class="selector-curso-etiqueta">Curso</span>
      <span class="selector-curso-nombre">${esc(estado.curso.nombre)}</span>
      ${icono("abajo", { tamano: 16 })}
    </button>
  `;
  return `
    <div class="marco">
      <aside class="lateral" aria-label="Navegación principal">
        <div class="lateral-marca">
          <img src="${INSTITUCION.escudo}" alt="" width="44" height="46">
          <div>
            <strong>Asistencia</strong>
            <span>${esc(INSTITUCION.nombreCorto)}</span>
          </div>
        </div>
        ${curso}
        <nav class="lateral-nav">${enlaces}</nav>
        <div class="lateral-pie">
          ${indicadorGuardado()}
          <span class="lateral-cuenta" title="${esc(estado.usuario?.email || "")}">${esc(estado.usuario?.email || "")}</span>
        </div>
      </aside>
      <header class="barra-superior">
        <div class="barra-marca">
          <img src="${INSTITUCION.escudo}" alt="" width="32" height="33">
          <span>Asistencia</span>
        </div>
        ${indicadorGuardado()}
        ${curso}
      </header>
      ${estado.modo === "demo" ? `<div class="banda-demo">${icono("info", { tamano: 16 })}<span>Modo demo con datos ficticios: nada se guarda en la base real.</span></div>` : ""}
      <main class="principal" id="principal">${contenido}</main>
      <nav class="barra-inferior" aria-label="Navegación principal">${enlaces}</nav>
    </div>
  `;
}

function vistaFallo(mensaje, conReintento = false) {
  return `
    <section class="vista">
      <div class="tarjeta tarjeta-vacia">
        ${icono("nubeError", { tamano: 32 })}
        <p>${esc(mensaje)}</p>
        ${conReintento ? `<button type="button" class="boton boton-secundario" data-accion="reintentar">${icono("reiniciar", { tamano: 18 })}Reintentar</button>` : ""}
      </div>
    </section>
  `;
}

function vistaSinCursos() {
  return `
    <main class="entrar">
      <section class="entrar-tarjeta">
        <img class="entrar-escudo" src="${INSTITUCION.escudo}" alt="Escudo de la ${esc(INSTITUCION.nombre)}" width="88" height="92">
        <h1>Sin cursos asignados</h1>
        <p class="entrar-texto">La cuenta ${esc(estado.usuario?.email || "")} todavía no tiene cursos. Pide que la agreguen en la configuración de la app.</p>
        <button type="button" class="boton boton-secundario" data-accion="salir">${icono("salir", { tamano: 18 })}Cerrar sesión</button>
      </section>
    </main>
  `;
}

function vistaEntrar() {
  const demo = estado.modo === "demo";
  return `
    <main class="entrar">
      <section class="entrar-portada" aria-hidden="true">
        <div class="entrar-franjas"><span></span><span></span><span></span></div>
        <img src="${INSTITUCION.escudo}" alt="" width="132" height="138">
        <p class="entrar-lema">Ciencia · Tecnología · Virtud · Solidaridad</p>
      </section>
      <section class="entrar-tarjeta">
        <img class="entrar-escudo" src="${INSTITUCION.escudo}" alt="Escudo de la ${esc(INSTITUCION.nombre)}" width="72" height="75">
        <p class="sobretitulo">${esc(INSTITUCION.nombreCorto)}</p>
        <h1>Asistencia escolar</h1>
        <p class="entrar-texto">Pase de lista diario, resumen del mes e informes listos para entregar.</p>
        ${demo ? `
          <div class="nota-demo">${icono("info", { tamano: 18 })}<span>Modo demo: datos ficticios que se guardan solo en este navegador.</span></div>
          <button type="button" class="boton boton-primario boton-grande" data-accion="entrar-demo">Entrar a la demo</button>
        ` : `
          <form class="formulario" data-accion="entrar" novalidate>
            <label class="campo">
              <span>Correo</span>
              <input type="email" name="correo" autocomplete="username" inputmode="email" required>
            </label>
            <label class="campo">
              <span>Contraseña</span>
              <input type="password" name="clave" autocomplete="current-password" required>
            </label>
            <p class="error-formulario" id="error-entrar" role="alert"></p>
            <button type="submit" class="boton boton-primario boton-grande">Entrar</button>
          </form>
        `}
        <p class="entrar-pie">Uso interno de la institución.</p>
      </section>
    </main>
  `;
}

// ——— Piezas compartidas ———

function encabezadoVista({ sobretitulo, titulo, acciones = "", subtitulo = "" }) {
  return `
    <header class="encabezado-vista">
      <div>
        ${sobretitulo ? `<p class="sobretitulo">${sobretitulo}</p>` : ""}
        <h1 class="titulo-vista">${titulo}</h1>
        ${subtitulo ? `<p class="subtitulo-vista">${subtitulo}</p>` : ""}
      </div>
      ${acciones ? `<div class="encabezado-acciones">${acciones}</div>` : ""}
    </header>
  `;
}

function navegadorMes(mes, vista) {
  const siguiente = D.mesSiguiente(mes);
  const futuro = siguiente > D.hoyClave().slice(0, 7);
  return `
    <div class="navegador-mes" role="group" aria-label="Cambiar de mes">
      <a class="boton-icono" href="#/${vista}/${D.mesAnterior(mes)}" aria-label="Mes anterior">${icono("izquierda")}</a>
      <span class="navegador-mes-texto">${esc(D.mesHumano(mes))}</span>
      ${futuro
        ? `<span class="boton-icono deshabilitado" aria-hidden="true">${icono("derecha")}</span>`
        : `<a class="boton-icono" href="#/${vista}/${siguiente}" aria-label="Mes siguiente">${icono("derecha")}</a>`}
    </div>
  `;
}

function anillo(porcentaje, { tamano = 96, grosor = 9 } = {}) {
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const valor = porcentaje == null ? 0 : porcentaje;
  const nivel = A.nivelAsistencia(porcentaje);
  return `
    <svg class="anillo nivel-${nivel}" width="${tamano}" height="${tamano}" viewBox="0 0 ${tamano} ${tamano}" aria-hidden="true">
      <circle cx="${tamano / 2}" cy="${tamano / 2}" r="${radio}" stroke-width="${grosor}" class="anillo-pista"/>
      <circle cx="${tamano / 2}" cy="${tamano / 2}" r="${radio}" stroke-width="${grosor}" class="anillo-valor"
        stroke-dasharray="${(circunferencia * valor) / 100} ${circunferencia}" transform="rotate(-90 ${tamano / 2} ${tamano / 2})"/>
    </svg>
  `;
}

function barraPorcentaje(porcentaje) {
  const nivel = A.nivelAsistencia(porcentaje);
  return `
    <span class="barra-pct nivel-${nivel}">
      <span class="barra-pct-texto">${porcentaje == null ? "—" : `${porcentaje} %`}</span>
      <span class="barra-pct-pista"><span style="width:${porcentaje ?? 0}%"></span></span>
    </span>
  `;
}

function graficoNovedades(porDia, { compacto = false } = {}) {
  if (!porDia.length) return `<p class="vacio-suave">Todavía no hay días de clase registrados este mes.</p>`;
  const maximo = Math.max(2, ...porDia.map((dia) => dia.ausente + dia.excusa + dia.tarde));
  const techo = maximo <= 4 ? 4 : maximo <= 6 ? 6 : maximo <= 8 ? 8 : Math.ceil(maximo / 5) * 5;
  // Cada día ocupa al menos 26 px; con pocos días se reparten el ancho disponible.
  const paso = Math.max(26, Math.min(64, Math.floor((compacto ? 300 : 700) / porDia.length)));
  const alto = compacto ? 96 : 160;
  const izquierda = 22;
  const ancho = izquierda + porDia.length * paso;
  const base = alto - 30;
  const escala = (base - 14) / techo;
  const lineas = [0, techo / 2, techo].map((valor) => {
    const y = base - valor * escala;
    return `<line x1="${izquierda}" x2="${ancho}" y1="${y}" y2="${y}" class="${valor === 0 ? "eje" : "rejilla"}"/><text x="${izquierda - 6}" y="${y + 3.5}" class="eje-texto" text-anchor="end">${valor}</text>`;
  }).join("");
  const barras = porDia.map((dia, indice) => {
    const x = izquierda + indice * paso + (paso - 14) / 2;
    let cima = base;
    const partes = [["a", dia.ausente], ["e", dia.excusa], ["t", dia.tarde]].map(([clase, cantidad]) => {
      if (!cantidad) return "";
      const altura = cantidad * escala;
      cima -= altura;
      return `<rect x="${x}" y="${cima}" width="14" height="${altura}" rx="2" class="serie-${clase}"/>`;
    }).join("");
    const total = dia.ausente + dia.excusa + dia.tarde;
    const etiqueta = `${A.diaCorto(dia.fecha)}: ${plural(dia.ausente, "ausente", "ausentes")}, ${plural(dia.excusa, "excusa", "excusas")}, ${plural(dia.tarde, "tarde", "tardes")} · asistencia ${dia.porcentaje ?? "—"} %`;
    return `
      <g class="grafico-dia">
        <title>${esc(etiqueta)}</title>
        <rect x="${x - (paso - 14) / 2}" y="0" width="${paso}" height="${base}" class="grafico-zona"/>
        ${partes}
        ${total && !compacto ? `<text x="${x + 7}" y="${cima - 4}" text-anchor="middle" class="grafico-total">${total}</text>` : ""}
        <text x="${x + 7}" y="${base + 13}" text-anchor="middle" class="grafico-dia-num">${Number(dia.fecha.slice(8, 10))}</text>
        <text x="${x + 7}" y="${base + 24}" text-anchor="middle" class="grafico-dia-letra">${A.inicialDia(dia.fecha)}</text>
      </g>
    `;
  }).join("");
  return `
    <div class="grafico-desplazable">
      <svg class="grafico" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img" aria-label="Ausencias, excusas y llegadas tarde por día de clase">
        ${lineas}${barras}
      </svg>
    </div>
    <div class="leyenda">
      <span><i class="punto serie-a"></i>Ausente</span>
      <span><i class="punto serie-e"></i>Excusa</span>
      <span><i class="punto serie-t"></i>Tarde</span>
    </div>
  `;
}

function fichaAlumno(estudiante, { tamano = "" } = {}) {
  return `<span class="avatar ${tamano}" aria-hidden="true">${esc(A.iniciales(estudiante.nombre))}</span>`;
}

// ——— Vista: Hoy ———

function vistaHoy() {
  const hoy = D.hoyClave();
  const mes = hoy.slice(0, 7);
  const cache = estado.cache.get(mes);
  const datos = datosMes(mes);
  const dia = cache.dias.get(hoy);
  const lista = activos();
  const finDeSemana = A.esFinDeSemanaFecha(hoy);
  const pendientes = A.diasPendientes(mes, cache.dias, hoy);
  const festivoHoy = A.festivoPendiente(hoy, cache.dias);

  let tarjetaPase;
  if (festivoHoy) {
    tarjetaPase = `
      <div class="pase-estado">
        <span class="pastilla pastilla-sol">${icono("calendario", { tamano: 15 })}Festivo</span>
        <p class="pase-texto">Hoy es festivo en Colombia: <strong>${esc(festivoHoy)}</strong>. No hay clase programada ni genera faltas.</p>
      </div>
      <div class="pase-acciones">
        <a class="boton boton-secundario" href="#/dia/${hoy}">Pasar lista de todos modos</a>
      </div>
    `;
  } else if (dia?.tipo === "sinClase") {
    tarjetaPase = `
      <div class="pase-estado">
        <span class="pastilla pastilla-gris">${icono("sinClase", { tamano: 15 })}Sin clase</span>
        <p class="pase-texto">Hoy está marcado sin clase${dia.motivo ? `: <strong>${esc(dia.motivo)}</strong>` : ""}. No genera faltas.</p>
      </div>
      <div class="pase-acciones">
        <a class="boton boton-secundario" href="#/dia/${hoy}">Ver el día</a>
      </div>
    `;
  } else if (dia) {
    const contadores = D.contadoresDelDia(lista.map((estudiante) => cache.registros.get(D.claveRegistro(hoy, estudiante.mat)) || null));
    const porcentaje = lista.length ? Math.round(((contadores.presente + contadores.tarde) / lista.length) * 100) : null;
    tarjetaPase = `
      <div class="pase-estado">
        <span class="pastilla pastilla-verde">${icono("check", { tamano: 15 })}Pase registrado</span>
        <div class="pase-cifras">
          <span class="cifra cifra-p"><strong>${contadores.presente}</strong>presentes</span>
          <span class="cifra cifra-a"><strong>${contadores.ausente}</strong>${contadores.ausente === 1 ? "ausente" : "ausentes"}</span>
          <span class="cifra cifra-t"><strong>${contadores.tarde}</strong>${contadores.tarde === 1 ? "tarde" : "tardes"}</span>
          <span class="cifra cifra-e"><strong>${contadores.excusa}</strong>${contadores.excusa === 1 ? "excusa" : "excusas"}</span>
        </div>
        <p class="pase-texto">Asistencia del día: <strong>${porcentaje ?? "—"} %</strong></p>
      </div>
      <div class="pase-acciones">
        <a class="boton boton-primario" href="#/dia/${hoy}">${icono("editar", { tamano: 18 })}Revisar el pase</a>
      </div>
    `;
  } else if (finDeSemana) {
    tarjetaPase = `
      <div class="pase-estado">
        <span class="pastilla pastilla-gris">Fin de semana</span>
        <p class="pase-texto">No hay clase programada. Si hubo una jornada especial, puedes pasar lista igualmente.</p>
      </div>
      <div class="pase-acciones">
        <a class="boton boton-secundario" href="#/dia/${hoy}">Pasar lista de todos modos</a>
      </div>
    `;
  } else {
    tarjetaPase = `
      <div class="pase-estado">
        <span class="pastilla pastilla-ambar">${icono("reloj", { tamano: 15 })}Pendiente</span>
        <p class="pase-texto">${plural(lista.length, "estudiante activo", "estudiantes activos")}. Todos arrancan como presentes: marca solo las novedades.</p>
      </div>
      <div class="pase-acciones">
        <a class="boton boton-primario boton-grande" href="#/dia/${hoy}">${icono("checkDoble", { tamano: 20 })}Pasar lista</a>
        <button type="button" class="boton boton-secundario" data-accion="todos-presentes" data-fecha="${hoy}">Registrar: todos presentes</button>
      </div>
    `;
  }

  const bloquePendientes = pendientes.length ? `
    <section class="tarjeta tarjeta-pendientes">
      <div class="tarjeta-encabezado">
        <h2>${icono("reloj", { tamano: 18 })}Días sin registrar</h2>
        <span class="contador-suave">${pendientes.length}</span>
      </div>
      <p class="tarjeta-nota">Días hábiles de ${esc(D.mesHumano(mes).split(" ")[0].toLowerCase())} sin pase ni marca de «sin clase».</p>
      <div class="chips-dias">
        ${pendientes.map((fecha) => `<a class="chip-dia" href="#/dia/${fecha}">${esc(A.diaCorto(fecha))}</a>`).join("")}
      </div>
    </section>
  ` : "";

  const conAlerta = datos.resumen.filas.filter((fila) => fila.alerta);
  const atencion = `
    <section class="tarjeta">
      <div class="tarjeta-encabezado">
        <h2>${icono("alerta", { tamano: 18 })}Requieren atención</h2>
        ${conAlerta.length ? `<span class="contador-suave contador-rojo">${conAlerta.length}</span>` : ""}
      </div>
      ${conAlerta.length ? `
        <ul class="lista-compacta">
          ${conAlerta.map((fila) => `
            <li>
              <button type="button" class="fila-boton" data-accion="ver-estudiante" data-mat="${fila.mat}" data-mes="${mes}">
                ${fichaAlumno(fila)}
                <span class="fila-texto">
                  <strong>${esc(A.nombreVisible(fila.nombre))}</strong>
                  <small class="texto-rojo">${esc(D.textoAlerta(fila.alerta))}</small>
                </span>
                ${icono("derecha", { tamano: 18, clase: "fila-flecha" })}
              </button>
            </li>
          `).join("")}
        </ul>
      ` : `<p class="vacio-suave">Nadie alcanza los umbrales de alerta este mes (${umbrales().umbralSeguidas} faltas seguidas o ${umbrales().umbralAcumuladas} en el mes).</p>`}
    </section>
  `;

  const recientes = [...datos.observaciones].filter((obs) => obs.mat != null).reverse().slice(0, 4);
  const observaciones = `
    <section class="tarjeta">
      <div class="tarjeta-encabezado">
        <h2>${icono("comentario", { tamano: 18 })}Observaciones recientes</h2>
      </div>
      ${recientes.length ? `
        <ul class="lista-observaciones">
          ${recientes.map((obs) => `
            <li>
              <a href="#/dia/${obs.fecha}" class="observacion">
                <span class="observacion-fecha">${esc(A.diaCorto(obs.fecha))}</span>
                <span class="observacion-cuerpo">
                  <strong>${esc(A.nombreVisible(obs.nombre))}</strong>
                  ${obs.estado && obs.estado !== D.PRESENTE ? `<span class="etiqueta-estado e-${LETRA[obs.estado]}">${esc(obs.estado)}</span>` : ""}
                  <span class="observacion-texto">${esc(obs.comentario || obs.etiquetas.join(", "))}</span>
                </span>
              </a>
            </li>
          `).join("")}
        </ul>
      ` : `<p class="vacio-suave">Sin observaciones este mes.</p>`}
    </section>
  `;

  const estadisticas = datos.estadisticas;
  const mesEnCurso = `
    <section class="tarjeta tarjeta-mes">
      <div class="tarjeta-encabezado">
        <h2>${icono("resumen", { tamano: 18 })}${esc(D.mesHumano(mes))}</h2>
        <a class="enlace" href="#/resumen/${mes}">Ver resumen ${icono("derecha", { tamano: 16 })}</a>
      </div>
      <div class="mes-cifras">
        <div class="mes-anillo">
          ${anillo(estadisticas.porcentajeCurso, { tamano: 84, grosor: 8 })}
          <span class="mes-anillo-valor">${estadisticas.porcentajeCurso ?? "—"}<small>%</small></span>
        </div>
        <dl class="mini-datos">
          <div><dt>Días de clase</dt><dd>${estadisticas.dias}</dd></div>
          <div><dt>Faltas</dt><dd class="texto-rojo">${estadisticas.totales.ausente}</dd></div>
          <div><dt>Excusas</dt><dd class="texto-violeta">${estadisticas.totales.excusa}</dd></div>
          <div><dt>Tardes</dt><dd class="texto-ambar">${estadisticas.totales.tarde}</dd></div>
        </dl>
      </div>
      ${datos.porDia.length ? graficoNovedades(datos.porDia, { compacto: true }) : ""}
    </section>
  `;

  return `
    <section class="vista vista-hoy">
      ${encabezadoVista({
        sobretitulo: `${A.saludo()} · Curso ${esc(estado.curso.nombre)}`,
        titulo: esc(A.fechaTitulo(hoy)),
      })}
      <section class="tarjeta tarjeta-pase${dia ? "" : " destacada"}">
        <h2 class="visualmente-oculto">Pase de hoy</h2>
        ${tarjetaPase}
      </section>
      ${bloquePendientes}
      <div class="rejilla-dos">
        ${mesEnCurso}
        ${atencion}
      </div>
      ${observaciones}
    </section>
  `;
}

// ——— Vista: Calendario ———

function vistaCalendario(mes) {
  const cache = estado.cache.get(mes);
  const hoy = D.hoyClave();
  const datos = datosMes(mes);
  const porFecha = new Map(datos.porDia.map((dia) => [dia.fecha, dia]));
  const total = D.diasEnMes(mes);
  const desplazamiento = D.primerDiaSemana(mes);
  const pendientes = new Set(A.diasPendientes(mes, cache.dias, hoy));

  let celdas = "";
  for (let i = 0; i < desplazamiento; i++) celdas += `<span class="cal-vacia" aria-hidden="true"></span>`;
  for (let numero = 1; numero <= total; numero++) {
    const fecha = D.claveDelDia(mes, numero);
    const futuro = fecha > hoy;
    const finde = D.esFinDeSemana(mes, numero);
    const dia = cache.dias.get(fecha);
    const nombreFestivo = A.festivoPendiente(fecha, cache.dias);
    const clases = ["cal-dia"];
    let detalle = "";
    let descripcion = "";
    if (nombreFestivo) {
      clases.push("cal-festivo");
      detalle = `<span class="cal-motivo" title="${esc(nombreFestivo)}">${esc(nombreFestivo)}</span>`;
      descripcion = `festivo: ${nombreFestivo}`;
    } else if (dia?.tipo === "sinClase") {
      clases.push("cal-sin-clase");
      detalle = `<span class="cal-motivo">${esc(dia.motivo || "Sin clase")}</span>`;
      descripcion = `sin clase${dia.motivo ? `: ${dia.motivo}` : ""}`;
    } else if (dia) {
      const resumenDia = porFecha.get(fecha);
      const nivel = A.nivelAsistencia(resumenDia?.porcentaje);
      clases.push("cal-registrado", `nivel-${nivel}`);
      const novedades = resumenDia ? resumenDia.ausente : 0;
      detalle = `
        <span class="cal-pct">${resumenDia?.porcentaje ?? "—"}<small>%</small></span>
        <span class="cal-barra"><span style="width:${resumenDia?.porcentaje ?? 0}%"></span></span>
        ${novedades ? `<span class="cal-faltas" title="${plural(novedades, "ausente", "ausentes")}">${novedades}</span>` : ""}
      `;
      descripcion = `registrado, asistencia ${resumenDia?.porcentaje ?? "—"} %`;
    } else if (pendientes.has(fecha)) {
      clases.push("cal-pendiente");
      detalle = `<span class="cal-etiqueta">Pendiente</span>`;
      descripcion = "pendiente";
    } else if (fecha === hoy && !finde) {
      detalle = `<span class="cal-etiqueta">Hoy</span>`;
      descripcion = "sin registrar";
    }
    if (finde) clases.push("cal-finde");
    if (fecha === hoy) clases.push("cal-hoy");
    if (futuro) clases.push("cal-futuro");
    const etiqueta = `${capitalizar(D.fechaHumana(fecha))}${descripcion ? `, ${descripcion}` : ""}`;
    celdas += futuro
      ? `<span class="${clases.join(" ")}" aria-label="${esc(etiqueta)}"><span class="cal-numero">${numero}</span>${nombreFestivo ? detalle : ""}</span>`
      : `<a class="${clases.join(" ")}" href="#/dia/${fecha}" aria-label="${esc(etiqueta)}" ${fecha === hoy ? 'aria-current="date"' : ""}><span class="cal-numero">${numero}</span>${detalle}</a>`;
  }

  const sinClase = datos.sinClase;
  return `
    <section class="vista vista-calendario">
      ${encabezadoVista({
        sobretitulo: `Calendario · Curso ${esc(estado.curso.nombre)}`,
        titulo: "Días del mes",
        acciones: navegadorMes(mes, "calendario"),
      })}
      <section class="tarjeta tarjeta-calendario">
        <div class="calendario" role="grid" aria-label="Calendario de ${esc(D.mesHumano(mes))}">
          ${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((nombre) => `<span class="cal-semana" role="columnheader">${nombre}</span>`).join("")}
          ${celdas}
        </div>
        <div class="leyenda leyenda-calendario">
          <span><i class="punto punto-alto"></i>Registrado</span>
          <span><i class="punto punto-pendiente"></i>Pendiente</span>
          <span><i class="punto punto-sin-clase"></i>Sin clase</span>
          <span><i class="punto punto-festivo"></i>Festivo</span>
          <span><i class="punto punto-hoy"></i>Hoy</span>
        </div>
      </section>
      <div class="rejilla-dos">
        <section class="tarjeta">
          <div class="tarjeta-encabezado"><h2>${icono("resumen", { tamano: 18 })}En cifras</h2></div>
          <dl class="mini-datos mini-datos-fila">
            <div><dt>Días de clase</dt><dd>${datos.estadisticas.dias}</dd></div>
            <div><dt>Pendientes</dt><dd class="${pendientes.size ? "texto-ambar" : ""}">${pendientes.size}</dd></div>
            <div><dt>Sin clase</dt><dd>${sinClase.length}</dd></div>
            <div><dt>Asistencia</dt><dd>${datos.estadisticas.porcentajeCurso ?? "—"}<small> %</small></dd></div>
          </dl>
          <a class="enlace" href="#/resumen/${mes}">Ver el resumen del mes ${icono("derecha", { tamano: 16 })}</a>
        </section>
        <section class="tarjeta">
          <div class="tarjeta-encabezado"><h2>${icono("sinClase", { tamano: 18 })}Días sin clase</h2></div>
          ${sinClase.length ? `
            <ul class="lista-simple">
              ${sinClase.map((dia) => `<li><a href="#/dia/${dia.fecha}"><strong>${esc(A.diaCorto(dia.fecha))}</strong><span>${esc(dia.motivo || "Sin motivo registrado")}</span></a></li>`).join("")}
            </ul>
          ` : `<p class="vacio-suave">Ninguno marcado este mes.</p>`}
        </section>
      </div>
    </section>
  `;
}

// ——— Vista: Pase del día ———

function vistaDia(fecha) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  const dia = cache.dias.get(fecha) || null;
  const sinClase = dia?.tipo === "sinClase";
  const nombreFestivo = A.festivoPendiente(fecha, cache.dias);
  const lista = activos();
  const hoy = D.hoyClave();
  const anterior = A.sumarDias(fecha, -1);
  const siguiente = A.sumarDias(fecha, 1);
  const registrosDe = (estudiante) => cache.registros.get(D.claveRegistro(fecha, estudiante.mat)) || null;
  const contadores = D.contadoresDelDia(lista.map(registrosDe));
  const porcentaje = lista.length ? Math.round(((contadores.presente + contadores.tarde) / lista.length) * 100) : null;

  let estadoDia;
  if (sinClase) estadoDia = `<span class="pastilla pastilla-gris">${icono("sinClase", { tamano: 15 })}Sin clase</span>`;
  else if (nombreFestivo) estadoDia = `<span class="pastilla pastilla-sol">${icono("calendario", { tamano: 15 })}Festivo</span>`;
  else if (dia) estadoDia = `<span class="pastilla pastilla-verde">${icono("check", { tamano: 15 })}Registrado</span>`;
  else estadoDia = `<span class="pastilla pastilla-ambar">${icono("reloj", { tamano: 15 })}Sin registrar</span>`;

  const navegacion = `
    <div class="navegador-mes" role="group" aria-label="Cambiar de día">
      <a class="boton-icono" href="#/dia/${anterior}" aria-label="Día anterior">${icono("izquierda")}</a>
      <a class="boton-icono boton-texto" href="#/calendario/${fecha.slice(0, 7)}">${icono("calendario", { tamano: 18 })}<span>Mes</span></a>
      ${siguiente > hoy
        ? `<span class="boton-icono deshabilitado" aria-hidden="true">${icono("derecha")}</span>`
        : `<a class="boton-icono" href="#/dia/${siguiente}" aria-label="Día siguiente">${icono("derecha")}</a>`}
    </div>
  `;

  const encabezado = encabezadoVista({
    sobretitulo: `Pase de lista · Curso ${esc(estado.curso.nombre)}`,
    titulo: `${esc(A.fechaTitulo(fecha))}${fecha.slice(0, 4) !== hoy.slice(0, 4) ? ` de ${fecha.slice(0, 4)}` : ""}`,
    subtitulo: `${estadoDia}${fecha === hoy ? '<span class="pastilla pastilla-marca">Hoy</span>' : ""}${A.esFinDeSemanaFecha(fecha) ? '<span class="pastilla pastilla-gris">Fin de semana</span>' : ""}`,
    acciones: navegacion,
  });

  if (sinClase) {
    return `
      <section class="vista vista-dia">
        ${encabezado}
        <section class="tarjeta tarjeta-sin-clase">
          <div class="sin-clase-icono">${icono("sinClase", { tamano: 28 })}</div>
          <div>
            <h2>Día sin clase</h2>
            <p>Motivo: <strong>${esc(dia.motivo || "sin especificar")}</strong>. Este día no genera faltas ni cuenta en el resumen.</p>
            ${dia.nota ? `<p class="nota-dia-texto">${icono("nota", { tamano: 16 })}${esc(dia.nota)}</p>` : ""}
          </div>
          <div class="sin-clase-acciones">
            <button type="button" class="boton boton-secundario" data-accion="abrir-sin-clase" data-fecha="${fecha}">${icono("editar", { tamano: 18 })}Cambiar motivo</button>
            <button type="button" class="boton boton-primario" data-accion="volver-clase" data-fecha="${fecha}">${icono("checkDoble", { tamano: 18 })}Sí hubo clase</button>
          </div>
        </section>
      </section>
    `;
  }

  const filtros = [D.PRESENTE, D.AUSENTE, D.TARDE, D.EXCUSA].map((opcion) => {
    const cantidad = contadores[{ [D.PRESENTE]: "presente", [D.AUSENTE]: "ausente", [D.TARDE]: "tarde", [D.EXCUSA]: "excusa" }[opcion]];
    const activo = estado.filtro === opcion;
    return `
      <button type="button" class="contador contador-${LETRA[opcion]}${activo ? " activo" : ""}" data-accion="filtrar" data-estado="${opcion}" aria-pressed="${activo}">
        <strong>${cantidad}</strong><span>${cantidad === 1 ? PLURAL[opcion][0] : PLURAL[opcion][1]}</span>
      </button>
    `;
  }).join("");

  let visibles = A.filtrarPorTexto(lista, estado.busqueda);
  if (estado.filtro) visibles = visibles.filter((estudiante) => D.estadoDe(registrosDe(estudiante)) === estado.filtro);
  const filas = visibles.map((estudiante) => filaPase(fecha, estudiante, registrosDe(estudiante))).join("");

  return `
    <section class="vista vista-dia">
      ${encabezado}
      ${nombreFestivo ? `
        <section class="tarjeta tarjeta-festivo">
          <div class="sin-clase-icono">${icono("calendario", { tamano: 26 })}</div>
          <div>
            <h2>Festivo: ${esc(nombreFestivo)}</h2>
            <p>No hay clase programada y el día no cuenta en el resumen. Si hubo jornada, pasa lista como siempre y quedará como día de clase.</p>
          </div>
        </section>
      ` : ""}
      <section class="tarjeta tarjeta-resumen-dia">
        <div class="contadores" role="group" aria-label="Filtrar por estado">${filtros}</div>
        <div class="resumen-dia-pie">
          <span class="resumen-dia-pct">Asistencia del día <strong>${porcentaje ?? "—"} %</strong></span>
          <div class="acciones-dia">
            <button type="button" class="boton ${dia || nombreFestivo ? "boton-secundario" : "boton-primario"} boton-chico" data-accion="todos-presentes" data-fecha="${fecha}">${icono("checkDoble", { tamano: 17 })}Todos presentes</button>
            <button type="button" class="boton boton-secundario boton-chico" data-accion="abrir-nota-dia" data-fecha="${fecha}">${icono("nota", { tamano: 17 })}${dia?.nota ? "Nota del día" : "Agregar nota"}</button>
            <button type="button" class="boton boton-secundario boton-chico" data-accion="abrir-sin-clase" data-fecha="${fecha}">${icono("sinClase", { tamano: 17 })}Sin clase</button>
          </div>
        </div>
        ${dia?.nota ? `<button type="button" class="nota-dia-texto" data-accion="abrir-nota-dia" data-fecha="${fecha}">${icono("nota", { tamano: 16 })}<span>${esc(dia.nota)}</span></button>` : ""}
      </section>

      <div class="barra-busqueda">
        <label class="buscador">
          ${icono("buscar", { tamano: 18 })}
          <input type="search" placeholder="Buscar estudiante" value="${esc(estado.busqueda)}" data-campo="busqueda" data-foco="busqueda-dia" aria-label="Buscar estudiante" autocomplete="off">
        </label>
        ${estado.filtro ? `<button type="button" class="boton boton-fantasma boton-chico" data-accion="filtrar" data-estado="${estado.filtro}">${icono("cerrar", { tamano: 16 })}Quitar filtro</button>` : ""}
      </div>

      <ul class="lista-pase" aria-label="Estudiantes">
        ${filas || `<li class="vacio-suave">${lista.length ? "Ningún estudiante coincide con la búsqueda o el filtro." : "La lista está vacía. Agrega estudiantes en la pestaña Estudiantes."}</li>`}
      </ul>
      <p class="ayuda">Todos arrancan como <strong>presentes</strong>: marca solo las novedades. Cada cambio se guarda solo y puedes deshacerlo desde el aviso.</p>
    </section>
  `;
}

function filaPase(fecha, estudiante, registro) {
  const actual = D.estadoDe(registro);
  const nombre = A.nombreVisible(estudiante.nombre);
  const opciones = D.ESTADOS.map((opcion) => {
    const marcada = opcion === actual;
    return `
      <button type="button" class="op op-${LETRA[opcion]}${marcada ? " marcada" : ""}" role="radio" aria-checked="${marcada}"
        data-accion="estado" data-fecha="${fecha}" data-mat="${estudiante.mat}" data-estado="${opcion}"
        aria-label="${opcion}" title="${opcion}">
        <span class="op-letra">${D.letraEstado(opcion)}</span><span class="op-nombre">${opcion}</span>
      </button>
    `;
  }).join("");
  const conObservacion = A.tieneObservacion(registro);
  const detalle = [];
  if (estudiante.notaPersistente) detalle.push(`<span class="marca-persistente" title="${esc(estudiante.notaPersistente)}">${esc(estudiante.notaPersistente)}</span>`);
  if (conObservacion) {
    detalle.push(`<span class="marca-observacion">${icono("comentario", { tamano: 13 })}${esc([...(registro.etiquetas || []), registro.comentario].filter(Boolean).join(" · "))}</span>`);
  }
  return `
    <li class="alumno estado-${LETRA[actual]}">
      <div class="alumno-id">
        <span class="alumno-no">${esc(estudiante.no)}</span>
        <div class="alumno-texto">
          <span class="alumno-nombre">${esc(nombre)}</span>
          ${detalle.length ? `<span class="alumno-detalle">${detalle.join("")}</span>` : ""}
        </div>
      </div>
      <div class="alumno-controles">
        <div class="selector-estado" role="radiogroup" aria-label="Estado de ${esc(nombre)}">${opciones}</div>
        <button type="button" class="boton-observacion${conObservacion ? " con-observacion" : ""}" data-accion="abrir-observacion" data-fecha="${fecha}" data-mat="${estudiante.mat}" aria-label="Observación de ${esc(nombre)}">
          ${icono("comentario", { tamano: 19 })}
        </button>
      </div>
    </li>
  `;
}

// ——— Vista: Resumen ———

function vistaResumen(mes) {
  const datos = datosMes(mes);
  const { resumen, estadisticas } = datos;
  const lista = A.filtrarPorTexto(resumen.filas, estado.busqueda);
  const ordenadas = [...lista].sort((a, b) => {
    if (estado.orden === "faltas") return b.ausente - a.ausente || Number(a.no) - Number(b.no);
    if (estado.orden === "porcentaje") return (a.porcentaje ?? 101) - (b.porcentaje ?? 101) || Number(a.no) - Number(b.no);
    return Number(a.no) - Number(b.no);
  });
  const limites = umbrales();

  const filas = ordenadas.map((fila) => `
    <tr class="${fila.alerta ? "con-alerta" : ""}" data-accion="ver-estudiante" data-mat="${fila.mat}" data-mes="${mes}" tabindex="0">
      <td class="col-no">${esc(fila.no)}</td>
      <td class="col-nombre">
        <span class="celda-nombre">${esc(A.nombreVisible(fila.nombre))}</span>
        ${fila.alerta ? `<span class="insignia-alerta">${icono("alerta", { tamano: 13 })}${esc(D.textoAlerta(fila.alerta))}</span>` : ""}
        <span class="celda-movil">P ${fila.presente} · T ${fila.tarde} · E ${fila.excusa}</span>
      </td>
      <td class="col-num ocultar-movil">${fila.presente}</td>
      <td class="col-num ocultar-movil">${fila.tarde}</td>
      <td class="col-num ocultar-movil">${fila.excusa}</td>
      <td class="col-num col-faltas${fila.ausente ? " texto-rojo" : ""}">${fila.ausente}</td>
      <td class="col-pct">${barraPorcentaje(fila.porcentaje)}</td>
    </tr>
  `).join("");

  const ordenBoton = (clave, texto) => `<button type="button" class="segmento${estado.orden === clave ? " activo" : ""}" data-accion="ordenar" data-orden="${clave}" aria-pressed="${estado.orden === clave}">${texto}</button>`;
  const generando = estado.generando;

  return `
    <section class="vista vista-resumen">
      ${encabezadoVista({
        sobretitulo: `Resumen mensual · Curso ${esc(estado.curso.nombre)}`,
        titulo: esc(D.mesHumano(mes)),
        acciones: navegadorMes(mes, "resumen"),
      })}

      <section class="tarjeta tarjeta-kpi">
        <div class="kpi-principal">
          <div class="mes-anillo grande">
            ${anillo(estadisticas.porcentajeCurso, { tamano: 120, grosor: 11 })}
            <span class="mes-anillo-valor">${estadisticas.porcentajeCurso ?? "—"}<small>%</small></span>
          </div>
          <div>
            <p class="kpi-titulo">Asistencia del curso</p>
            <p class="kpi-texto">${plural(estadisticas.dias, "día de clase", "días de clase")} · ${plural(estadisticas.activos, "estudiante activo", "estudiantes activos")}</p>
          </div>
        </div>
        <dl class="kpis">
          <div class="kpi kpi-a"><dt>Faltas (Inas.)</dt><dd>${estadisticas.totales.ausente}</dd><span>Promedio ${String(estadisticas.promedioFaltas ?? 0).replace(".", ",")} por estudiante</span></div>
          <div class="kpi kpi-e"><dt>Excusas</dt><dd>${estadisticas.totales.excusa}</dd><span>Faltas justificadas</span></div>
          <div class="kpi kpi-t"><dt>Tardes</dt><dd>${estadisticas.totales.tarde}</dd><span>Cuentan como asistencia</span></div>
          <div class="kpi ${estadisticas.conAlerta ? "kpi-a" : "kpi-p"}"><dt>Con alerta</dt><dd>${estadisticas.conAlerta}</dd><span>${plural(estadisticas.sinFaltas, "sin ninguna falta", "sin ninguna falta")}</span></div>
        </dl>
      </section>

      <section class="tarjeta">
        <div class="tarjeta-encabezado"><h2>${icono("resumen", { tamano: 18 })}Novedades por día de clase</h2></div>
        ${graficoNovedades(datos.porDia)}
      </section>

      <section class="tarjeta tarjeta-exportar">
        <div class="tarjeta-encabezado"><h2>${icono("descargar", { tamano: 18 })}Documentos del mes</h2></div>
        <div class="exportes">
          <div class="exporte exporte-destacado">
            <span class="exporte-icono">${icono("pdf", { tamano: 26 })}</span>
            <div class="exporte-texto">
              <strong>Informe PDF</strong>
              <span>A4 horizontal con membrete: panorama del mes, tabla por estudiante, detalle por día y firmas.</span>
              <label class="interruptor">
                <input type="checkbox" data-campo="incluir-observaciones" ${estado.incluirObservaciones ? "checked" : ""}>
                <span class="interruptor-pista"></span>
                <span>Incluir observaciones</span>
              </label>
            </div>
            <div class="exporte-acciones">
              <button type="button" class="boton boton-primario" data-accion="pdf" data-mes="${mes}" ${generando ? "disabled" : ""}>${generando === "pdf" ? "Preparando…" : `${icono("descargar", { tamano: 18 })}Descargar`}</button>
              ${esTactil() ? "" : `<button type="button" class="boton boton-secundario" data-accion="pdf-abrir" data-mes="${mes}" ${generando ? "disabled" : ""}>${icono("imprimir", { tamano: 18 })}Abrir</button>`}
            </div>
          </div>
          <div class="exporte">
            <span class="exporte-icono exporte-icono-verde">${icono("tabla", { tamano: 26 })}</span>
            <div class="exporte-texto">
              <strong>Libro de Excel</strong>
              <span>Cinco hojas con formato: resumen, detalle por día, estadísticas, observaciones y lista.</span>
            </div>
            <div class="exporte-acciones">
              <button type="button" class="boton boton-secundario" data-accion="excel" data-mes="${mes}" ${generando ? "disabled" : ""}>${generando === "excel" ? "Preparando…" : `${icono("descargar", { tamano: 18 })}Descargar`}</button>
            </div>
          </div>
          <div class="exporte">
            <span class="exporte-icono exporte-icono-gris">${icono("nota", { tamano: 26 })}</span>
            <div class="exporte-texto">
              <strong>CSV para planillas</strong>
              <span>Mismo formato de siempre (separador «;»), con la columna «Inas.».</span>
            </div>
            <div class="exporte-acciones">
              <button type="button" class="boton boton-secundario boton-chico" data-accion="csv-resumen" data-mes="${mes}">Resumen</button>
              <button type="button" class="boton boton-secundario boton-chico" data-accion="csv-detalle" data-mes="${mes}">Detalle</button>
            </div>
          </div>
        </div>
      </section>

      <section class="tarjeta tarjeta-tabla">
        <div class="tarjeta-encabezado tarjeta-encabezado-tabla">
          <h2>${icono("estudiantes", { tamano: 18 })}Por estudiante</h2>
          <div class="controles-tabla">
            <label class="buscador buscador-chico">
              ${icono("buscar", { tamano: 16 })}
              <input type="search" placeholder="Buscar" value="${esc(estado.busqueda)}" data-campo="busqueda" data-foco="busqueda-resumen" aria-label="Buscar estudiante" autocomplete="off">
            </label>
            <div class="segmentos" role="group" aria-label="Ordenar">
              ${ordenBoton("no", "No.")}${ordenBoton("faltas", "Faltas")}${ordenBoton("porcentaje", "%")}
            </div>
          </div>
        </div>
        <div class="tabla-contenedor">
          <table class="tabla">
            <thead>
              <tr>
                <th class="col-no" scope="col">No.</th>
                <th class="col-nombre" scope="col">Estudiante</th>
                <th class="col-num ocultar-movil" scope="col" title="Presente">P</th>
                <th class="col-num ocultar-movil" scope="col" title="Tarde">T</th>
                <th class="col-num ocultar-movil" scope="col" title="Excusa">E</th>
                <th class="col-num" scope="col" title="Ausente (Inas.)">A</th>
                <th class="col-pct" scope="col">Asistencia</th>
              </tr>
            </thead>
            <tbody>${filas || `<tr><td colspan="7" class="vacio-suave">Ningún estudiante coincide con la búsqueda.</td></tr>`}</tbody>
            <tfoot>
              <tr>
                <td></td>
                <td class="col-nombre">Total del curso<span class="celda-movil">P ${resumen.totales.presente} · T ${resumen.totales.tarde} · E ${resumen.totales.excusa}</span></td>
                <td class="col-num ocultar-movil">${resumen.totales.presente}</td>
                <td class="col-num ocultar-movil">${resumen.totales.tarde}</td>
                <td class="col-num ocultar-movil">${resumen.totales.excusa}</td>
                <td class="col-num texto-rojo">${resumen.totales.ausente}</td>
                <td class="col-pct">${barraPorcentaje(estadisticas.porcentajeCurso)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="ayuda">% = (Presente + Tarde) ÷ días de clase. Alerta: ${limites.umbralSeguidas} o más faltas seguidas, o ${limites.umbralAcumuladas} o más en el mes. Toca un estudiante para ver su mes.</p>
      </section>
    </section>
  `;
}

// ——— Vista: Estudiantes ———

function vistaEstudiantes() {
  const lista = activos();
  const retiradas = estado.estudiantes.filter((estudiante) => estudiante.estado === "retirada");
  const visibles = A.filtrarPorTexto(lista, estado.busqueda);
  const fila = (estudiante) => `
    <li>
      <button type="button" class="fila-boton" data-accion="editar-estudiante" data-mat="${estudiante.mat}">
        <span class="alumno-no">${esc(estudiante.no)}</span>
        <span class="fila-texto">
          <strong>${esc(A.nombreVisible(estudiante.nombre))}</strong>
          <small>Mat. ${esc(estudiante.mat)}${estudiante.notaPersistente ? ` · <span class="texto-marca">${esc(estudiante.notaPersistente)}</span>` : ""}</small>
        </span>
        ${icono("editar", { tamano: 18, clase: "fila-flecha" })}
      </button>
    </li>
  `;
  return `
    <section class="vista vista-estudiantes">
      ${encabezadoVista({
        sobretitulo: `Curso ${esc(estado.curso.nombre)}`,
        titulo: "Estudiantes",
        subtitulo: `${plural(lista.length, "activo", "activos")}${retiradas.length ? ` · ${plural(retiradas.length, "retirada", "retiradas")}` : ""}`,
        acciones: `<button type="button" class="boton boton-primario" data-accion="nuevo-estudiante">${icono("mas", { tamano: 18 })}Agregar</button>`,
      })}
      <div class="rejilla-lateral">
        <section class="tarjeta tarjeta-lista">
          <label class="buscador">
            ${icono("buscar", { tamano: 18 })}
            <input type="search" placeholder="Buscar por nombre, No. o Mat." value="${esc(estado.busqueda)}" data-campo="busqueda" data-foco="busqueda-estudiantes" aria-label="Buscar estudiante" autocomplete="off">
          </label>
          <ul class="lista-compacta lista-estudiantes">
            ${visibles.map(fila).join("") || `<li class="vacio-suave">${lista.length ? "Nadie coincide con la búsqueda." : "Todavía no hay estudiantes. Agrégalos uno a uno o importa la lista base."}</li>`}
          </ul>
          ${retiradas.length ? `
            <details class="plegable">
              <summary>${icono("abajo", { tamano: 16 })}Retiradas (${retiradas.length})</summary>
              <ul class="lista-compacta lista-estudiantes retiradas">${retiradas.map(fila).join("")}</ul>
            </details>
          ` : ""}
        </section>
        <div class="columna-lateral">
          <section class="tarjeta">
            <div class="tarjeta-encabezado"><h2>${icono("respaldo", { tamano: 18 })}Datos y respaldo</h2></div>
            <div class="lista-acciones">
              <button type="button" class="accion" data-accion="csv-lista">${icono("descargar", { tamano: 18 })}<span><strong>Exportar lista</strong><small>CSV para planillas</small></span></button>
              <button type="button" class="accion" data-accion="respaldo">${icono("respaldo", { tamano: 18 })}<span><strong>Descargar respaldo</strong><small>Todo el histórico en JSON</small></span></button>
              <button type="button" class="accion" data-accion="restaurar">${icono("subir", { tamano: 18 })}<span><strong>Restaurar respaldo</strong><small>Vuelve a subir un JSON de respaldo</small></span></button>
              <button type="button" class="accion" data-accion="importar-lista">${icono("estudiantes", { tamano: 18 })}<span><strong>Importar lista base</strong><small>Agrega o actualiza por Mat. No.</small></span></button>
            </div>
            <input type="file" accept=".json,application/json" hidden data-rol="archivo-lista">
            <input type="file" accept=".json,application/json" hidden data-rol="archivo-respaldo">
          </section>
          <section class="tarjeta">
            <div class="tarjeta-encabezado"><h2>${icono("escuela", { tamano: 18 })}Cuenta</h2></div>
            <p class="tarjeta-nota">Sesión: <strong>${esc(estado.usuario?.email || "")}</strong></p>
            <div class="lista-acciones">
              ${estado.modo === "demo" ? `<button type="button" class="accion" data-accion="reiniciar-demo">${icono("reiniciar", { tamano: 18 })}<span><strong>Reiniciar la demo</strong><small>Vuelve a los datos ficticios iniciales</small></span></button>` : ""}
              <a class="accion" href="clasica/${estado.modo === "demo" ? "?demo=1" : ""}">${icono("izquierda", { tamano: 18 })}<span><strong>Versión clásica</strong><small>La app anterior, con los mismos datos</small></span></a>
              <button type="button" class="accion accion-peligro" data-accion="salir">${icono("salir", { tamano: 18 })}<span><strong>Cerrar sesión</strong></span></button>
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

// ——— Hojas (paneles emergentes) ———

function hojaHtml() {
  const hoja = estado.hoja;
  if (!hoja) return "";
  let contenido = "";
  if (hoja.tipo === "observacion") contenido = hojaObservacion(hoja);
  else if (hoja.tipo === "nota-dia") contenido = hojaNotaDia(hoja);
  else if (hoja.tipo === "sin-clase") contenido = hojaSinClase(hoja);
  else if (hoja.tipo === "estudiante") contenido = hojaEstudiante(hoja);
  else if (hoja.tipo === "form-estudiante") contenido = hojaFormEstudiante(hoja);
  else if (hoja.tipo === "cursos") contenido = hojaCursos();
  else if (hoja.tipo === "confirmar") contenido = hojaConfirmar(hoja);
  return `
    <div class="velo" data-accion="cerrar-hoja"></div>
    <div class="hoja" role="dialog" aria-modal="true" aria-labelledby="titulo-hoja">
      <div class="hoja-asa" aria-hidden="true"></div>
      ${contenido}
    </div>
  `;
}

function cabeceraHoja(titulo, subtitulo = "") {
  return `
    <header class="hoja-cabecera">
      <div>
        <h2 id="titulo-hoja">${titulo}</h2>
        ${subtitulo ? `<p>${subtitulo}</p>` : ""}
      </div>
      <button type="button" class="boton-icono" data-accion="cerrar-hoja" aria-label="Cerrar">${icono("cerrar")}</button>
    </header>
  `;
}

function hojaObservacion({ fecha, mat }) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  const registro = cache?.registros.get(D.claveRegistro(fecha, mat)) || null;
  const estudiante = estado.estudiantes.find((otro) => Number(otro.mat) === Number(mat));
  const actual = D.estadoDe(registro);
  const etiquetas = D.ETIQUETAS_RAPIDAS.map((etiqueta) => {
    const puesta = estado.etiquetasBorrador.includes(etiqueta);
    return `<button type="button" class="chip${puesta ? " puesta" : ""}" data-accion="etiqueta" data-etiqueta="${esc(etiqueta)}" aria-pressed="${puesta}">${esc(etiqueta)}</button>`;
  }).join("");
  return `
    ${cabeceraHoja(esc(A.nombreVisible(estudiante?.nombre || "")), `${esc(capitalizar(D.fechaHumana(fecha)))} · <span class="etiqueta-estado e-${LETRA[actual]}">${esc(actual)}</span>`)}
    <div class="hoja-cuerpo">
      ${estudiante?.notaPersistente ? `<p class="nota-persistente">${icono("info", { tamano: 16 })}${esc(estudiante.notaPersistente)}</p>` : ""}
      <label class="campo">
        <span>Observación del día</span>
        <textarea rows="3" data-rol="comentario" data-autofoco placeholder="Ej.: llegó a la segunda hora con excusa firmada">${esc(registro?.comentario || "")}</textarea>
      </label>
      <div class="campo">
        <span>Etiquetas rápidas</span>
        <div class="chips">${etiquetas}</div>
      </div>
    </div>
    <footer class="hoja-pie">
      ${A.tieneObservacion(registro) ? `<button type="button" class="boton boton-fantasma texto-rojo" data-accion="quitar-observacion" data-fecha="${fecha}" data-mat="${mat}">Quitar</button>` : "<span></span>"}
      <button type="button" class="boton boton-primario" data-accion="guardar-observacion" data-fecha="${fecha}" data-mat="${mat}">Guardar</button>
    </footer>
  `;
}

function hojaNotaDia({ fecha }) {
  const dia = estado.cache.get(fecha.slice(0, 7))?.dias.get(fecha);
  return `
    ${cabeceraHoja("Nota del día", esc(capitalizar(D.fechaHumana(fecha))))}
    <div class="hoja-cuerpo">
      <label class="campo">
        <span>Comentario general (no corresponde a un estudiante)</span>
        <textarea rows="3" data-rol="nota-dia" data-autofoco placeholder="Ej.: salida pedagógica, simulacro, cambio de horario">${esc(dia?.nota || "")}</textarea>
      </label>
    </div>
    <footer class="hoja-pie">
      ${dia?.nota ? `<button type="button" class="boton boton-fantasma texto-rojo" data-accion="borrar-nota-dia" data-fecha="${fecha}">Borrar nota</button>` : "<span></span>"}
      <button type="button" class="boton boton-primario" data-accion="guardar-nota-dia" data-fecha="${fecha}">Guardar</button>
    </footer>
  `;
}

function hojaSinClase({ fecha, motivo = "" }) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  const marcas = A.registrosDelDia(cache.registros, fecha).length;
  const dia = cache.dias.get(fecha);
  const actual = motivo || dia?.motivo || (festivo(fecha) ? "Festivo" : "");
  const personalizado = actual && !D.MOTIVOS_SIN_CLASE.includes(actual) ? actual : "";
  return `
    ${cabeceraHoja("Marcar sin clase", esc(capitalizar(D.fechaHumana(fecha))))}
    <div class="hoja-cuerpo">
      <p class="tarjeta-nota">Un día sin clase no genera faltas ni cuenta en el resumen.</p>
      <div class="campo">
        <span>Motivo</span>
        <div class="chips">
          ${D.MOTIVOS_SIN_CLASE.map((opcion) => `<button type="button" class="chip${actual === opcion ? " puesta" : ""}" data-accion="motivo" data-motivo="${esc(opcion)}" aria-pressed="${actual === opcion}">${esc(opcion)}</button>`).join("")}
        </div>
      </div>
      <label class="campo">
        <span>Otro motivo o detalle</span>
        <input type="text" data-rol="motivo-libre" value="${esc(personalizado)}" placeholder="Escribe el motivo" data-autofoco>
      </label>
      ${marcas ? `<p class="advertencia">${icono("alerta", { tamano: 18 })}<span>Este día tiene ${plural(marcas, "marca registrada", "marcas registradas")} (novedades u observaciones). Se borrarán para que el día no cuente; podrás deshacerlo desde el aviso.</span></p>` : ""}
    </div>
    <footer class="hoja-pie">
      <button type="button" class="boton boton-fantasma" data-accion="cerrar-hoja">Cancelar</button>
      <button type="button" class="boton boton-primario" data-accion="confirmar-sin-clase" data-fecha="${fecha}">Marcar sin clase</button>
    </footer>
  `;
}

function hojaEstudiante({ mat, mes }) {
  const estudiante = estado.estudiantes.find((otro) => Number(otro.mat) === Number(mat));
  if (!estudiante) return cabeceraHoja("Estudiante no encontrado");
  const datos = datosMes(mes);
  const fila = datos.resumen.filas.find((otra) => Number(otra.mat) === Number(mat));
  const cache = estado.cache.get(mes);
  const historial = A.historialEstudiante({ mat, diasDeClase: datos.resumen.diasDeClase, registros: [...cache.registros.values()] });
  const novedades = historial.filter((dia) => dia.estado !== D.PRESENTE || dia.comentario || dia.etiquetas.length);
  return `
    ${cabeceraHoja(esc(A.nombreVisible(estudiante.nombre)), `No. ${esc(estudiante.no)} · Mat. ${esc(estudiante.mat)} · ${esc(D.mesHumano(mes))}`)}
    <div class="hoja-cuerpo">
      ${estudiante.notaPersistente ? `<p class="nota-persistente">${icono("info", { tamano: 16 })}${esc(estudiante.notaPersistente)}</p>` : ""}
      ${fila?.alerta ? `<p class="advertencia">${icono("alerta", { tamano: 18 })}<span>${esc(D.textoAlerta(fila.alerta))}</span></p>` : ""}
      <dl class="mini-datos mini-datos-fila">
        <div><dt>Asistencia</dt><dd>${fila?.porcentaje ?? "—"}<small> %</small></dd></div>
        <div><dt>Faltas</dt><dd class="texto-rojo">${fila?.ausente ?? 0}</dd></div>
        <div><dt>Excusas</dt><dd class="texto-violeta">${fila?.excusa ?? 0}</dd></div>
        <div><dt>Tardes</dt><dd class="texto-ambar">${fila?.tarde ?? 0}</dd></div>
      </dl>
      ${historial.length ? `
        <div class="campo">
          <span>Días de clase del mes</span>
          <div class="tira-dias">
            ${historial.map((dia) => `<a href="#/dia/${dia.fecha}" class="tira-dia e-${LETRA[dia.estado]}" title="${esc(`${A.diaCorto(dia.fecha)}: ${dia.estado}`)}"><span>${Number(dia.fecha.slice(8, 10))}</span><b>${D.letraEstado(dia.estado)}</b></a>`).join("")}
          </div>
        </div>
      ` : ""}
      <div class="campo">
        <span>Novedades y observaciones</span>
        ${novedades.length ? `
          <ul class="lista-observaciones">
            ${novedades.map((dia) => `
              <li>
                <a href="#/dia/${dia.fecha}" class="observacion">
                  <span class="observacion-fecha">${esc(A.diaCorto(dia.fecha))}</span>
                  <span class="observacion-cuerpo">
                    <span class="etiqueta-estado e-${LETRA[dia.estado]}">${esc(dia.estado)}</span>
                    <span class="observacion-texto">${esc([...dia.etiquetas, dia.comentario].filter(Boolean).join(" · ") || "Sin observación")}</span>
                  </span>
                </a>
              </li>
            `).join("")}
          </ul>
        ` : `<p class="vacio-suave">Asistió todos los días de clase del mes, sin observaciones.</p>`}
      </div>
    </div>
    <footer class="hoja-pie">
      <button type="button" class="boton boton-fantasma" data-accion="editar-estudiante" data-mat="${estudiante.mat}">${icono("editar", { tamano: 18 })}Editar datos</button>
      <button type="button" class="boton boton-primario" data-accion="cerrar-hoja">Listo</button>
    </footer>
  `;
}

function hojaFormEstudiante({ mat = null }) {
  const estudiante = mat == null ? null : estado.estudiantes.find((otro) => Number(otro.mat) === Number(mat));
  const nuevo = !estudiante;
  const siguienteNo = Math.max(0, ...estado.estudiantes.map((otro) => Number(otro.no) || 0)) + 1;
  return `
    ${cabeceraHoja(nuevo ? "Agregar estudiante" : "Editar estudiante", nuevo ? "Se agrega como activa al final de la lista." : esc(A.nombreVisible(estudiante.nombre)))}
    <form class="formulario" data-accion="guardar-estudiante" ${nuevo ? "" : `data-mat="${estudiante.mat}"`} novalidate>
      <div class="hoja-cuerpo">
        <label class="campo">
          <span>Nombre completo (Apellidos Nombres)</span>
          <input name="nombre" value="${esc(estudiante?.nombre || "")}" required placeholder="APELLIDOS NOMBRES" autocomplete="off" data-autofoco>
        </label>
        <div class="campos-dos">
          <label class="campo">
            <span>No. en la lista</span>
            <input name="no" type="number" min="1" inputmode="numeric" value="${esc(estudiante?.no ?? siguienteNo)}">
          </label>
          <label class="campo">
            <span>Mat. No.</span>
            <input name="mat" type="number" min="1" inputmode="numeric" value="${esc(estudiante?.mat ?? "")}" ${nuevo ? "required" : "disabled"}>
          </label>
        </div>
        <label class="campo">
          <span>Nota persistente (opcional)</span>
          <input name="nota" value="${esc(estudiante?.notaPersistente || "")}" placeholder="Ej.: ajustes PIAR" autocomplete="off">
        </label>
        <p class="error-formulario" role="alert"></p>
        ${!nuevo ? `
          <div class="zona-estado">
            <span>Estado: <strong>${estudiante.estado === "retirada" ? "Retirada" : "Activa"}</strong></span>
            ${estudiante.estado === "retirada"
              ? `<button type="button" class="boton boton-secundario boton-chico" data-accion="reactivar" data-mat="${estudiante.mat}">${icono("reactivar", { tamano: 17 })}Reactivar</button>`
              : `<button type="button" class="boton boton-secundario boton-chico texto-rojo" data-accion="retirar" data-mat="${estudiante.mat}">${icono("retirar", { tamano: 17 })}Marcar como retirada</button>`}
          </div>
        ` : ""}
      </div>
      <footer class="hoja-pie">
        <button type="button" class="boton boton-fantasma" data-accion="cerrar-hoja">Cancelar</button>
        <button type="submit" class="boton boton-primario">Guardar</button>
      </footer>
    </form>
  `;
}

function hojaCursos() {
  return `
    ${cabeceraHoja("Cursos", estado.cursos.length > 1 ? "Elige el curso para pasar lista." : "Tu cuenta tiene un curso.")}
    <div class="hoja-cuerpo">
      <ul class="lista-compacta">
        ${estado.cursos.map((curso) => `
          <li>
            <button type="button" class="fila-boton${curso.id === estado.curso.id ? " activa" : ""}" data-accion="cambiar-curso" data-curso="${esc(curso.id)}" aria-current="${curso.id === estado.curso.id}">
              <span class="avatar avatar-curso">${esc(slugCurso(curso))}</span>
              <span class="fila-texto"><strong>Curso ${esc(curso.nombre)}</strong><small>${esc(curso.docente || "")}</small></span>
              ${curso.id === estado.curso.id ? icono("check", { tamano: 18, clase: "fila-flecha texto-marca" }) : ""}
            </button>
          </li>
        `).join("")}
      </ul>
      <p class="tarjeta-nota">La app está preparada para que otros docentes pasen lista en sus cursos con su propia cuenta. Cada curso guarda sus datos aparte.</p>
    </div>
  `;
}

function hojaConfirmar({ titulo, texto, boton, peligro }) {
  return `
    ${cabeceraHoja(esc(titulo))}
    <div class="hoja-cuerpo"><p>${esc(texto)}</p></div>
    <footer class="hoja-pie">
      <button type="button" class="boton boton-fantasma" data-accion="cerrar-hoja">Cancelar</button>
      <button type="button" class="boton ${peligro ? "boton-peligro" : "boton-primario"}" data-accion="aceptar-confirmacion" data-autofoco>${esc(boton)}</button>
    </footer>
  `;
}

function abrirHoja(hoja) {
  estado.hoja = { ...hoja, enfocar: !esTactil() };
  render();
}

function cerrarHoja() {
  if (!estado.hoja) return;
  estado.hoja = null;
  render();
}

function confirmar(opciones) {
  return new Promise((resolver) => {
    abrirHoja({ tipo: "confirmar", ...opciones, resolver });
  });
}

// ——— Cambios en la asistencia (misma semántica que la versión clásica) ———

function prepararDia(cache, fecha) {
  const diaAnterior = cache.dias.get(fecha) || null;
  const dia = diaAnterior ? { ...diaAnterior } : { fecha, tipo: "clase", motivo: "", nota: "" };
  if (dia.tipo === "sinClase") {
    dia.tipo = "clase";
    dia.motivo = "";
  }
  return { diaAnterior, dia };
}

async function restaurarDia(cache, fecha, diaAnterior) {
  if (diaAnterior) {
    await estado.espacio.guardarDia(diaAnterior);
    cache.dias.set(fecha, diaAnterior);
  } else {
    await estado.espacio.borrarDia(fecha);
    cache.dias.delete(fecha);
  }
}

async function fijarEstado(fecha, mat, nuevoEstado) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  if (!cache) return;
  const clave = D.claveRegistro(fecha, mat);
  const anterior = cache.registros.get(clave) || null;
  if (D.estadoDe(anterior) === nuevoEstado && cache.dias.has(fecha)) return;
  const registro = {
    fecha,
    mat,
    estado: nuevoEstado,
    comentario: anterior?.comentario || "",
    etiquetas: anterior?.etiquetas ? [...anterior.etiquetas] : [],
  };
  const predeterminado = registro.estado === D.PRESENTE && !registro.comentario && !registro.etiquetas.length;
  const { diaAnterior, dia } = prepararDia(cache, fecha);

  estado.deshacer = async () => {
    if (anterior) {
      await estado.espacio.guardarRegistro(anterior);
      cache.registros.set(clave, anterior);
    } else {
      await estado.espacio.borrarRegistro(fecha, mat);
      cache.registros.delete(clave);
    }
    await restaurarDia(cache, fecha, diaAnterior);
  };

  if (predeterminado) cache.registros.delete(clave);
  else cache.registros.set(clave, registro);
  cache.dias.set(fecha, dia);
  render();
  const estudiante = estado.estudiantes.find((otro) => Number(otro.mat) === Number(mat));
  avisar(`${A.nombreVisible(estudiante?.nombre || "")}: ${nuevoEstado.toLowerCase()}`, { deshacer: true, duracion: 4500 });

  await guardarEnSegundoPlano(async () => {
    if (predeterminado) await estado.espacio.borrarRegistro(fecha, mat);
    else await estado.espacio.guardarRegistro(registro);
    await estado.espacio.guardarDia(dia);
  }, "No se pudo guardar el cambio. Revisa la conexión.");
}

async function marcarTodosPresentes(fecha) {
  const cache = estado.cache.get(fecha.slice(0, 7)) || await asegurarMes(fecha.slice(0, 7));
  const diaAnterior = cache.dias.get(fecha) || null;
  const dia = { fecha, tipo: "clase", motivo: "", nota: diaAnterior?.nota || "" };
  const previos = A.registrosDelDia(cache.registros, fecha).map((registro) => ({ ...registro, etiquetas: [...(registro.etiquetas || [])] }));
  const cambios = [];
  for (const registro of previos) {
    const clave = D.claveRegistro(fecha, registro.mat);
    if (A.tieneObservacion(registro)) {
      const actualizado = { ...registro, estado: D.PRESENTE };
      cache.registros.set(clave, actualizado);
      cambios.push(["guardar", actualizado]);
    } else {
      cache.registros.delete(clave);
      cambios.push(["borrar", registro]);
    }
  }

  estado.deshacer = async () => {
    for (const registro of A.registrosDelDia(cache.registros, fecha)) {
      await estado.espacio.borrarRegistro(fecha, registro.mat);
      cache.registros.delete(D.claveRegistro(fecha, registro.mat));
    }
    for (const registro of previos) {
      await estado.espacio.guardarRegistro(registro);
      cache.registros.set(D.claveRegistro(fecha, registro.mat), registro);
    }
    await restaurarDia(cache, fecha, diaAnterior);
  };

  cache.dias.set(fecha, dia);
  estado.filtro = null;
  render();
  avisar("Día registrado: todos presentes.", { deshacer: true });
  await guardarEnSegundoPlano(async () => {
    for (const [operacion, registro] of cambios) {
      if (operacion === "borrar") await estado.espacio.borrarRegistro(fecha, registro.mat);
      else await estado.espacio.guardarRegistro(registro);
    }
    await estado.espacio.guardarDia(dia);
  });
}

async function marcarSinClase(fecha, motivo) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  if (!cache) return;
  const diaAnterior = cache.dias.get(fecha) || null;
  const dia = { fecha, tipo: "sinClase", motivo, nota: diaAnterior?.nota || "" };
  const borrados = A.registrosDelDia(cache.registros, fecha);

  estado.deshacer = async () => {
    for (const registro of borrados) {
      await estado.espacio.guardarRegistro(registro);
      cache.registros.set(D.claveRegistro(fecha, registro.mat), registro);
    }
    await restaurarDia(cache, fecha, diaAnterior);
  };

  for (const registro of borrados) cache.registros.delete(D.claveRegistro(fecha, registro.mat));
  cache.dias.set(fecha, dia);
  estado.hoja = null;
  render();
  avisar(`Día marcado sin clase${motivo ? `: ${motivo}` : ""}.`, { deshacer: true });
  await guardarEnSegundoPlano(async () => {
    for (const registro of borrados) await estado.espacio.borrarRegistro(fecha, registro.mat);
    await estado.espacio.guardarDia(dia);
  });
}

async function volverAClase(fecha) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  if (!cache) return;
  const diaAnterior = cache.dias.get(fecha) || null;
  const dia = { fecha, tipo: "clase", motivo: "", nota: diaAnterior?.nota || "" };
  estado.deshacer = async () => restaurarDia(cache, fecha, diaAnterior);
  cache.dias.set(fecha, dia);
  render();
  avisar("Día de clase: todos quedan presentes.", { deshacer: true });
  await guardarEnSegundoPlano(() => estado.espacio.guardarDia(dia));
}

async function guardarNotaDia(fecha, nota) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  if (!cache) return;
  const diaAnterior = cache.dias.get(fecha) || null;
  const dia = diaAnterior ? { ...diaAnterior, nota } : { fecha, tipo: "clase", motivo: "", nota };
  cache.dias.set(fecha, dia);
  estado.hoja = null;
  render();
  const ok = await guardarEnSegundoPlano(() => estado.espacio.guardarDia(dia), "No se pudo guardar la nota.");
  if (ok) avisar(nota ? "Nota del día guardada." : "Nota del día borrada.");
}

async function guardarObservacion(fecha, mat, comentario, etiquetas) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  if (!cache) return;
  const clave = D.claveRegistro(fecha, mat);
  const anterior = cache.registros.get(clave) || null;
  const registro = { fecha, mat, estado: anterior?.estado || D.PRESENTE, comentario, etiquetas };
  const predeterminado = registro.estado === D.PRESENTE && !comentario && !etiquetas.length;
  const { diaAnterior, dia } = prepararDia(cache, fecha);

  estado.deshacer = async () => {
    if (anterior) {
      await estado.espacio.guardarRegistro(anterior);
      cache.registros.set(clave, anterior);
    } else {
      await estado.espacio.borrarRegistro(fecha, mat);
      cache.registros.delete(clave);
    }
    await restaurarDia(cache, fecha, diaAnterior);
  };

  if (predeterminado) cache.registros.delete(clave);
  else cache.registros.set(clave, registro);
  cache.dias.set(fecha, dia);
  estado.hoja = null;
  render();
  avisar(predeterminado ? "Observación quitada." : "Observación guardada.", { deshacer: true });
  await guardarEnSegundoPlano(async () => {
    if (predeterminado) await estado.espacio.borrarRegistro(fecha, mat);
    else await estado.espacio.guardarRegistro(registro);
    await estado.espacio.guardarDia(dia);
  }, "No se pudo guardar la observación.");
}

// ——— Estudiantes y datos ———

function normalizarEstudiante(bruto) {
  const mat = Number(bruto?.mat);
  const nombre = String(bruto?.nombre || "").trim().replace(/\s+/g, " ");
  if (!mat || !nombre) return null;
  return {
    mat,
    no: Number(bruto.no) || 0,
    nombre,
    estado: bruto.estado === "retirada" ? "retirada" : "activo",
    notaPersistente: bruto.notaPersistente ? String(bruto.notaPersistente) : null,
  };
}

async function guardarEstudianteDeFormulario(formulario) {
  const datos = new FormData(formulario);
  const edicion = Boolean(formulario.dataset.mat);
  const mat = edicion ? Number(formulario.dataset.mat) : Number(datos.get("mat"));
  const nombre = String(datos.get("nombre") || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("es");
  const no = Number(datos.get("no")) || 0;
  const nota = String(datos.get("nota") || "").trim();
  const error = formulario.querySelector(".error-formulario");
  if (!nombre) {
    error.textContent = "Escribe el nombre completo.";
    formulario.nombre.focus();
    return;
  }
  if (!mat || mat < 1) {
    error.textContent = "Escribe un Mat. No. válido.";
    formulario.mat?.focus();
    return;
  }
  const existente = estado.estudiantes.find((estudiante) => Number(estudiante.mat) === mat);
  if (!edicion && existente) {
    error.textContent = `Ya existe un estudiante con el Mat. No. ${mat} (${A.nombreVisible(existente.nombre)}).`;
    return;
  }
  const estudiante = {
    mat,
    no: no || existente?.no || estado.estudiantes.length + 1,
    nombre,
    estado: existente?.estado || "activo",
    notaPersistente: nota || null,
  };
  const boton = formulario.querySelector("button[type=submit]");
  boton.disabled = true;
  const ok = await guardarEnSegundoPlano(() => estado.espacio.guardarEstudiante(estudiante), "No se pudo guardar el estudiante.");
  boton.disabled = false;
  if (!ok) return;
  estado.estudiantes = ordenarLocal([...estado.estudiantes.filter((otro) => Number(otro.mat) !== mat), estudiante]);
  estado.hoja = null;
  render();
  avisar(edicion ? "Datos actualizados." : "Estudiante agregado.");
}

async function cambiarEstadoEstudiante(mat, nuevoEstado) {
  const existente = estado.estudiantes.find((estudiante) => Number(estudiante.mat) === Number(mat));
  if (!existente) return;
  if (nuevoEstado === "retirada") {
    const ok = await confirmar({
      titulo: "Marcar como retirada",
      texto: `${A.nombreVisible(existente.nombre)} dejará de aparecer en el pase y en las estadísticas. Su historial se conserva y puedes reactivarla cuando quieras.`,
      boton: "Marcar como retirada",
      peligro: true,
    });
    if (!ok) return;
  }
  const estudiante = { ...existente, estado: nuevoEstado };
  const ok = await guardarEnSegundoPlano(() => estado.espacio.guardarEstudiante(estudiante), "No se pudo actualizar el estado.");
  if (!ok) return;
  estado.estudiantes = ordenarLocal([...estado.estudiantes.filter((otro) => Number(otro.mat) !== Number(mat)), estudiante]);
  estado.hoja = null;
  render();
  avisar(nuevoEstado === "retirada" ? "Marcada como retirada." : "Reactivada en la lista.");
}

async function importarListaDeArchivo(archivo) {
  if (!archivo) return;
  try {
    const contenido = JSON.parse(await archivo.text());
    const lista = Array.isArray(contenido) ? contenido : contenido.estudiantes;
    if (!Array.isArray(lista) || !lista.length) throw new Error("el archivo no trae estudiantes");
    const normalizados = lista.map(normalizarEstudiante).filter(Boolean);
    if (!normalizados.length) throw new Error("no se encontró ningún estudiante válido");
    const ok = await confirmar({
      titulo: "Importar lista base",
      texto: `Se van a agregar o actualizar ${normalizados.length} estudiantes según su Mat. No. Los demás datos no se tocan.`,
      boton: "Importar",
    });
    if (!ok) return;
    await guardarEnSegundoPlano(() => estado.espacio.importarLista(normalizados));
    estado.estudiantes = await estado.espacio.listarEstudiantes();
    render();
    avisar(`Lista importada: ${normalizados.length} estudiantes.`);
  } catch (error) {
    avisar(`No se pudo importar la lista: ${error.message}.`, { tipo: "error" });
  }
}

async function restaurarDeArchivo(archivo) {
  if (!archivo) return;
  try {
    const contenido = JSON.parse(await archivo.text());
    const estudiantes = contenido.estudiantes || [];
    const dias = contenido.dias || [];
    const registros = contenido.registros || [];
    if (!estudiantes.length && !registros.length) throw new Error("el archivo no parece un respaldo");
    const ok = await confirmar({
      titulo: "Restaurar respaldo",
      texto: `Se van a escribir ${plural(estudiantes.length, "estudiante", "estudiantes")}, ${plural(dias.length, "día", "días")} y ${plural(registros.length, "registro", "registros")} de asistencia. Lo que coincida se sobrescribe con la versión del respaldo.`,
      boton: "Restaurar",
      peligro: true,
    });
    if (!ok) return;
    const exito = await guardarEnSegundoPlano(() => estado.espacio.importarTodo({ estudiantes, dias, registros }), "No se pudo restaurar el respaldo.");
    if (!exito) return;
    estado.cache.clear();
    estado.estudiantes = await estado.espacio.listarEstudiantes();
    render();
    avisar("Respaldo restaurado.");
  } catch (error) {
    avisar(`No se pudo restaurar: ${error.message}.`, { tipo: "error" });
  }
}

async function descargarRespaldo() {
  try {
    const datos = await estado.espacio.exportarTodo();
    descargar(`respaldo_asistencia-${slugCurso(estado.curso)}_${D.hoyClave()}.json`, JSON.stringify(datos, null, 2), "application/json");
    avisar("Respaldo descargado.");
  } catch (error) {
    console.error(error);
    avisar("No se pudo descargar el respaldo.", { tipo: "error" });
  }
}

// ——— Exportaciones ———

let escudoCache = null;

async function cargarEscudo() {
  if (!escudoCache) {
    escudoCache = (async () => {
      const respuesta = await fetch(INSTITUCION.escudo);
      if (!respuesta.ok) return null;
      const blob = await respuesta.blob();
      const datos = new Uint8Array(await blob.arrayBuffer());
      const dataUrl = await new Promise((resolver) => {
        const lector = new FileReader();
        lector.onload = () => resolver(lector.result);
        lector.onerror = () => resolver(null);
        lector.readAsDataURL(blob);
      });
      const imagen = await new Promise((resolver, rechazar) => {
        const elemento = new Image();
        elemento.onload = () => resolver(elemento);
        elemento.onerror = rechazar;
        elemento.src = dataUrl;
      });
      return { datos, dataUrl, ancho: imagen.naturalWidth, alto: imagen.naturalHeight };
    })().catch(() => null);
  }
  return escudoCache;
}

async function conGeneracion(tipo, tarea) {
  if (estado.generando) return;
  estado.generando = tipo;
  render();
  try {
    await tarea();
  } finally {
    estado.generando = null;
    render();
  }
}

async function exportarPdf(mes, abrir = false) {
  // La ventana se abre antes de generar para que el navegador no la bloquee.
  const ventana = abrir ? window.open("", "_blank") : null;
  await conGeneracion("pdf", async () => {
    try {
      await asegurarMes(mes);
      const escudo = await cargarEscudo();
      const blob = await crearInformePdf({
        datos: datosMes(mes),
        institucion: INSTITUCION,
        curso: estado.curso,
        logo: escudo?.dataUrl || null,
        incluirObservaciones: estado.incluirObservaciones,
      });
      const nombre = nombreArchivo(estado.curso, mes, "pdf", "Informe_Asistencia");
      if (ventana) {
        ventana.location.href = URL.createObjectURL(blob);
        return;
      }
      const resultado = await entregarArchivo(nombre, blob);
      if (resultado === "descargado") avisar("Informe PDF descargado.");
    } catch (error) {
      console.error(error);
      ventana?.close();
      avisar("No se pudo generar el PDF. Intenta de nuevo.", { tipo: "error" });
    }
  });
}

async function exportarExcel(mes) {
  await conGeneracion("excel", async () => {
    try {
      await asegurarMes(mes);
      const escudo = await cargarEscudo();
      const bytes = excelDelMes(datosMes(mes), {
        institucion: INSTITUCION,
        curso: estado.curso,
        escudo: escudo ? { datos: escudo.datos, ancho: escudo.ancho, alto: escudo.alto } : null,
      });
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const resultado = await entregarArchivo(nombreArchivo(estado.curso, mes, "xlsx"), blob);
      if (resultado === "descargado") avisar("Libro de Excel descargado.");
    } catch (error) {
      console.error(error);
      avisar("No se pudo generar el Excel.", { tipo: "error" });
    }
  });
}

function exportarCsv(tipo, mes) {
  const datos = mes ? datosMes(mes) : null;
  if (tipo === "resumen") {
    descargar(nombreArchivo(estado.curso, mes, "csv", "Asistencia_Resumen"), csvResumenDelMes(datos, estado.curso), "text/csv;charset=utf-8");
  } else if (tipo === "detalle") {
    descargar(nombreArchivo(estado.curso, mes, "csv", "Asistencia_Detalle"), csvDetalleDelMes(datos, estado.curso), "text/csv;charset=utf-8");
  } else {
    descargar(nombreArchivo(estado.curso, null, "csv", "Lista"), csvListaDelCurso(estado.estudiantes, estado.curso), "text/csv;charset=utf-8");
  }
  avisar("CSV descargado.");
}

// ——— Eventos ———

async function alClic(evento) {
  const elemento = evento.target.closest("[data-accion]");
  if (!elemento || elemento.tagName === "FORM") return;
  if (elemento.tagName === "TR" && evento.target.closest("a, button")) return;
  const { accion, fecha, mat, mes } = elemento.dataset;

  switch (accion) {
    case "entrar-demo":
      await repo.entrar();
      break;
    case "salir": {
      const ok = estado.modo === "demo" || await confirmar({ titulo: "Cerrar sesión", texto: "Tendrás que volver a escribir el correo y la contraseña para entrar.", boton: "Cerrar sesión" });
      if (ok) {
        estado.hoja = null;
        await repo.salir();
        location.hash = "#/hoy";
      }
      break;
    }
    case "reintentar":
      estado.cache.clear();
      render();
      break;
    case "estado":
      await fijarEstado(fecha, Number(mat), elemento.dataset.estado);
      break;
    case "todos-presentes":
      await marcarTodosPresentes(fecha);
      break;
    case "deshacer": {
      const deshacer = estado.deshacer;
      if (!deshacer) return;
      estado.deshacer = null;
      elemento.closest(".aviso")?.remove();
      const ok = await guardarEnSegundoPlano(deshacer, "No se pudo deshacer.");
      render();
      if (ok) avisar("Cambio deshecho.");
      break;
    }
    case "filtrar":
      estado.filtro = estado.filtro === elemento.dataset.estado ? null : elemento.dataset.estado;
      render();
      break;
    case "abrir-observacion": {
      const registro = estado.cache.get(fecha.slice(0, 7))?.registros.get(D.claveRegistro(fecha, Number(mat)));
      estado.etiquetasBorrador = [...(registro?.etiquetas || [])];
      abrirHoja({ tipo: "observacion", fecha, mat: Number(mat) });
      break;
    }
    case "etiqueta": {
      const etiqueta = elemento.dataset.etiqueta;
      const puesta = estado.etiquetasBorrador.includes(etiqueta);
      estado.etiquetasBorrador = puesta ? estado.etiquetasBorrador.filter((otra) => otra !== etiqueta) : [...estado.etiquetasBorrador, etiqueta];
      elemento.classList.toggle("puesta", !puesta);
      elemento.setAttribute("aria-pressed", String(!puesta));
      break;
    }
    case "guardar-observacion": {
      const comentario = (raiz.querySelector("[data-rol='comentario']")?.value || "").trim();
      await guardarObservacion(fecha, Number(mat), comentario, [...estado.etiquetasBorrador]);
      break;
    }
    case "quitar-observacion":
      await guardarObservacion(fecha, Number(mat), "", []);
      break;
    case "abrir-nota-dia":
      abrirHoja({ tipo: "nota-dia", fecha });
      break;
    case "guardar-nota-dia":
      await guardarNotaDia(fecha, (raiz.querySelector("[data-rol='nota-dia']")?.value || "").trim());
      break;
    case "borrar-nota-dia":
      await guardarNotaDia(fecha, "");
      break;
    case "abrir-sin-clase":
      abrirHoja({ tipo: "sin-clase", fecha });
      break;
    case "motivo": {
      raiz.querySelectorAll("[data-accion='motivo']").forEach((chip) => {
        const elegido = chip === elemento && !chip.classList.contains("puesta");
        chip.classList.toggle("puesta", elegido);
        chip.setAttribute("aria-pressed", String(elegido));
      });
      const libre = raiz.querySelector("[data-rol='motivo-libre']");
      if (libre && elemento.classList.contains("puesta")) libre.value = "";
      break;
    }
    case "confirmar-sin-clase": {
      const elegido = raiz.querySelector("[data-accion='motivo'].puesta")?.dataset.motivo || "";
      const libre = (raiz.querySelector("[data-rol='motivo-libre']")?.value || "").trim();
      await marcarSinClase(fecha, libre || elegido);
      break;
    }
    case "volver-clase":
      await volverAClase(fecha);
      break;
    case "ver-estudiante":
      abrirHoja({ tipo: "estudiante", mat: Number(mat), mes: mes || estado.mes });
      break;
    case "nuevo-estudiante":
      abrirHoja({ tipo: "form-estudiante", mat: null });
      break;
    case "editar-estudiante":
      abrirHoja({ tipo: "form-estudiante", mat: Number(mat) });
      break;
    case "retirar":
      await cambiarEstadoEstudiante(mat, "retirada");
      break;
    case "reactivar":
      await cambiarEstadoEstudiante(mat, "activo");
      break;
    case "abrir-cursos":
      abrirHoja({ tipo: "cursos" });
      break;
    case "cambiar-curso": {
      const curso = estado.cursos.find((otro) => otro.id === elemento.dataset.curso);
      estado.hoja = null;
      if (curso && curso.id !== estado.curso.id) {
        estado.curso = curso;
        guardarPreferencia("curso", curso.id);
        await cargarCurso();
        location.hash = "#/hoy";
      }
      render();
      break;
    }
    case "cerrar-hoja":
      if (estado.hoja?.resolver) estado.hoja.resolver(false);
      cerrarHoja();
      break;
    case "aceptar-confirmacion": {
      const resolver = estado.hoja?.resolver;
      estado.hoja = null;
      render();
      resolver?.(true);
      break;
    }
    case "ordenar":
      estado.orden = elemento.dataset.orden;
      render();
      break;
    case "pdf":
      await exportarPdf(mes);
      break;
    case "pdf-abrir":
      await exportarPdf(mes, true);
      break;
    case "excel":
      await exportarExcel(mes);
      break;
    case "csv-resumen":
      exportarCsv("resumen", mes);
      break;
    case "csv-detalle":
      exportarCsv("detalle", mes);
      break;
    case "csv-lista":
      exportarCsv("lista");
      break;
    case "respaldo":
      await descargarRespaldo();
      break;
    case "importar-lista":
      raiz.querySelector("[data-rol='archivo-lista']")?.click();
      break;
    case "restaurar":
      raiz.querySelector("[data-rol='archivo-respaldo']")?.click();
      break;
    case "reiniciar-demo": {
      const ok = await confirmar({ titulo: "Reiniciar la demo", texto: "Se borran los cambios hechos en la demo y vuelven los datos ficticios iniciales.", boton: "Reiniciar", peligro: true });
      if (ok) {
        repo.reiniciarDemo?.();
        await cargarCurso();
        render();
        avisar("Demo reiniciada.");
      }
      break;
    }
    default:
      break;
  }
}

document.addEventListener("click", (evento) => {
  alClic(evento).catch((error) => {
    console.error(error);
    avisar("Algo salió mal. Intenta de nuevo.", { tipo: "error" });
  });
});

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && estado.hoja) {
    if (estado.hoja.resolver) estado.hoja.resolver(false);
    cerrarHoja();
    return;
  }
  const fila = evento.target.closest("tr[data-accion='ver-estudiante']");
  if (fila && (evento.key === "Enter" || evento.key === " ")) {
    evento.preventDefault();
    fila.click();
  }
  if (evento.key === "Enter" && evento.target.dataset?.rol === "motivo-libre") {
    evento.preventDefault();
    raiz.querySelector("[data-accion='confirmar-sin-clase']")?.click();
  }
});

let temporizadorBusqueda = null;
raiz.addEventListener("input", (evento) => {
  if (evento.target.dataset.campo === "busqueda") {
    estado.busqueda = evento.target.value;
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(render, 120);
  }
});

raiz.addEventListener("change", async (evento) => {
  const objetivo = evento.target;
  if (objetivo.dataset.campo === "incluir-observaciones") {
    estado.incluirObservaciones = objetivo.checked;
    return;
  }
  if (objetivo.dataset.rol === "archivo-lista") {
    await importarListaDeArchivo(objetivo.files?.[0]);
    objetivo.value = "";
  } else if (objetivo.dataset.rol === "archivo-respaldo") {
    await restaurarDeArchivo(objetivo.files?.[0]);
    objetivo.value = "";
  }
});

raiz.addEventListener("submit", async (evento) => {
  const formulario = evento.target.closest("form");
  if (!formulario) return;
  evento.preventDefault();
  if (formulario.dataset.accion === "entrar") {
    const correo = formulario.correo.value.trim();
    const clave = formulario.clave.value;
    const error = document.getElementById("error-entrar");
    const boton = formulario.querySelector("button[type=submit]");
    if (!correo || !clave) {
      error.textContent = "Escribe el correo y la contraseña.";
      return;
    }
    error.textContent = "";
    boton.disabled = true;
    boton.textContent = "Entrando…";
    try {
      await repo.entrar(correo, clave);
    } catch (fallo) {
      error.textContent = fallo.message;
      boton.disabled = false;
      boton.textContent = "Entrar";
    }
  } else if (formulario.dataset.accion === "guardar-estudiante") {
    await guardarEstudianteDeFormulario(formulario);
  }
});

window.addEventListener("hashchange", () => {
  if (estado.hoja) {
    estado.hoja.resolver?.(false);
    estado.hoja = null;
  }
  render();
});

iniciar();
