import { crearRepositorio, hayConfiguracion } from "./src/datos.js";
import * as D from "./src/dominio.js";

const app = document.getElementById("app");
const buscador = new URLSearchParams(location.search);

const estado = {
  modo: null,
  usuario: null,
  estudiantes: [],
  ajustes: null,
  cache: new Map(),
  mesVista: D.hoyClave().slice(0, 7),
  diaVista: null,
  deshacer: null,
  comentarioAbierto: null,
  etiquetasBorrador: [],
  notaAbierta: false,
  formulario: null,
};

let repo = null;
let tokenRender = 0;

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caracter) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[caracter]
  ));
}

function plural(cantidad, singular, formaPlural) {
  return `${cantidad} ${cantidad === 1 ? singular : formaPlural}`;
}

function ordenarLocal(lista) {
  return [...lista].sort((a, b) => Number(a.no || 0) - Number(b.no || 0));
}

function avisar(texto, tipo = "ok") {
  let contenedor = document.querySelector(".avisos");
  if (!contenedor) {
    contenedor = document.createElement("div");
    contenedor.className = "avisos";
    document.body.appendChild(contenedor);
  }
  const aviso = document.createElement("div");
  aviso.className = `aviso ${tipo}`;
  aviso.textContent = texto;
  contenedor.appendChild(aviso);
  setTimeout(() => aviso.remove(), 5000);
}

function descargar(nombre, contenido, tipoContenido) {
  const blob = new Blob([contenido], { type: tipoContenido });
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

async function iniciar() {
  if (!hayConfiguracion() && !buscador.has("demo")) {
    estado.modo = "sin-config";
    render();
    return;
  }
  repo = await crearRepositorio({ demo: buscador.has("demo") || !hayConfiguracion() });
  estado.modo = repo.modo;
  repo.observarSesion(async (usuario) => {
    estado.usuario = usuario;
    if (usuario) {
      try {
        estado.estudiantes = await repo.listarEstudiantes();
        estado.ajustes = await repo.cargarAjustes();
      } catch (error) {
        console.error(error);
        avisar("No se pudieron cargar los datos.", "error");
      }
    } else {
      estado.estudiantes = [];
      estado.cache.clear();
      estado.deshacer = null;
    }
    render();
  });
}

function parsearRuta() {
  const bruto = location.hash.replace(/^#\/?/, "");
  if (!bruto) return { vista: "mes", param: null };
  const [vista, param] = bruto.split("/");
  return { vista, param: param || null };
}

async function asegurarMes(claveMes) {
  if (estado.cache.has(claveMes)) return estado.cache.get(claveMes);
  const { dias, registros } = await repo.cargarMes(claveMes);
  const cache = {
    dias: new Map(dias.map((dia) => [dia.fecha, dia])),
    registros: new Map(registros.map((registro) => [D.claveRegistro(registro.fecha, registro.mat), registro])),
  };
  estado.cache.set(claveMes, cache);
  return cache;
}

function prepararDia(cache, fecha) {
  const diaAnterior = cache.dias.get(fecha) || null;
  const dia = diaAnterior ? { ...diaAnterior } : { fecha, tipo: "clase", motivo: "", nota: "" };
  if (dia.tipo === "sinClase") {
    dia.tipo = "clase";
    dia.motivo = "";
  }
  return { diaAnterior, dia };
}

async function render() {
  const token = ++tokenRender;
  if (estado.modo === "sin-config") {
    app.innerHTML = vistaSinConfig();
    return;
  }
  if (!estado.usuario) {
    app.innerHTML = vistaEntrar();
    return;
  }
  const ruta = parsearRuta();
  try {
    if (ruta.vista === "dia" && ruta.param) {
      let fecha = ruta.param;
      if (fecha > D.hoyClave()) fecha = D.hoyClave();
      const cache = await asegurarMes(fecha.slice(0, 7));
      if (token !== tokenRender) return;
      estado.mesVista = fecha.slice(0, 7);
      estado.diaVista = fecha;
      app.innerHTML = vistaDia(fecha, cache);
    } else if (ruta.vista === "resumen") {
      const mes = /^\d{4}-\d{2}$/.test(ruta.param || "") ? ruta.param : estado.mesVista;
      await asegurarMes(mes);
      if (token !== tokenRender) return;
      estado.mesVista = mes;
      app.innerHTML = vistaResumen(mes);
    } else if (ruta.vista === "lista") {
      app.innerHTML = vistaLista();
    } else {
      const mes = /^\d{4}-\d{2}$/.test(ruta.param || "") ? ruta.param : estado.mesVista;
      const cache = await asegurarMes(mes);
      if (token !== tokenRender) return;
      estado.mesVista = mes;
      app.innerHTML = vistaMes(mes, cache);
    }
  } catch (error) {
    console.error(error);
    app.innerHTML = vistaError(error);
  }
}

function cabecera() {
  const demo = estado.modo === "demo"
    ? `<div class="banda-demo no-imprimir">Modo demo: los datos quedan solo en este navegador.</div>`
    : "";
  return `
    <header class="cabecera no-imprimir">
      <div class="marca-app">
        <img class="logo-app" src="assets/institution/logo_colegio.png" alt="Escudo de la IED Brisas del Río">
        <div class="textos">
          <span class="titulo">Asistencia 10°-A</span>
          <span class="sub">IED Brisas del Río</span>
        </div>
      </div>
    </header>
    ${demo}
  `;
}

function navInferior(activa) {
  const botones = [
    ["mes", "Mes", `#/mes/${estado.mesVista}`],
    ["resumen", "Resumen", `#/resumen/${estado.mesVista}`],
    ["lista", "Lista", "#/lista"],
  ];
  return `
    <nav class="nav-inferior no-imprimir">
      ${botones.map(([id, etiqueta, destino]) => `
        <button class="${activa === id ? "activo" : ""}" data-accion="navegar" data-destino="${destino}">${etiqueta}</button>
      `).join("")}
    </nav>
  `;
}

function vistaSinConfig() {
  return `
    <main class="contenido">
      <section class="bloque tarjeta-config">
        <img class="logo-config" src="assets/institution/logo_colegio.png" alt="">
        <h1>Asistencia 10°-A</h1>
        <p>Falta conectar la base de datos (Firebase). Sigue los pasos de <code>README.md</code> y pega la configuración en <code>src/firebase-config.js</code>.</p>
        <p>Mientras tanto puedes explorar la aplicación con datos de ejemplo:</p>
        <a class="boton-secundario" href="?demo=1">Ver modo demo</a>
      </section>
    </main>
  `;
}

function vistaEntrar() {
  if (estado.modo === "demo") {
    return `
      <main class="pantalla-entrar">
        <section class="tarjeta">
          <img class="logo-tarjeta" src="assets/institution/logo_colegio.png" alt="">
          <h1>Asistencia 10°-A</h1>
          <p class="sub">IED Brisas del Río</p>
          <p class="demo-nota">Estás en modo demo: los datos quedan solo en este navegador.</p>
          <button class="boton-principal" data-accion="entrar-demo">Entrar al modo demo</button>
        </section>
      </main>
    `;
  }
  return `
    <main class="pantalla-entrar">
      <section class="tarjeta">
        <img class="logo-tarjeta" src="assets/institution/logo_colegio.png" alt="">
        <h1>Asistencia 10°-A</h1>
        <p class="sub">IED Brisas del Río</p>
        <form data-accion="entrar">
          <label class="campo">Correo
            <input type="email" name="correo" autocomplete="username" required>
          </label>
          <label class="campo">Contraseña
            <input type="password" name="clave" autocomplete="current-password" required>
          </label>
          <button type="submit" class="boton-principal">Entrar</button>
          <p class="error" id="error-entrar"></p>
        </form>
      </section>
    </main>
  `;
}

function vistaError(error) {
  return `
    <main class="contenido">
      <section class="bloque">
        <p>No se pudieron cargar los datos. Revisa la conexión e intenta de nuevo.</p>
        <p class="detalle-error">${esc(error?.message || error)}</p>
        <button class="boton-secundario" data-accion="reintentar">Reintentar</button>
      </section>
    </main>
  `;
}

function vistaMes(mes, cache) {
  const hoy = D.hoyClave();
  const totalDias = D.diasEnMes(mes);
  const desplazamiento = D.primerDiaSemana(mes);
  const resumen = D.resumenDelMes({
    estudiantes: estado.estudiantes,
    dias: [...cache.dias.values()],
    registros: [...cache.registros.values()],
    ajustes: estado.ajustes,
  });

  let celdas = "";
  for (let i = 0; i < desplazamiento; i++) celdas += `<span class="celda-vacia"></span>`;
  for (let dia = 1; dia <= totalDias; dia++) {
    const fecha = D.claveDelDia(mes, dia);
    const futuro = fecha > hoy;
    const finde = D.esFinDeSemana(mes, dia);
    const diaDoc = cache.dias.get(fecha);
    let marca = "";
    if (diaDoc && diaDoc.tipo === "sinClase") marca = "sin-clase";
    else if (diaDoc) marca = "guardado";
    else if (!futuro && !finde) marca = "pendiente";
    const clases = ["celda-dia"];
    if (finde) clases.push("finde");
    if (fecha === hoy) clases.push("hoy");
    if (futuro) clases.push("futuro");
    celdas += `
      <button class="${clases.join(" ")}" data-accion="abrir-dia" data-fecha="${fecha}" ${futuro ? "disabled" : ""} ${fecha === hoy ? 'aria-current="date"' : ""} aria-label="${esc(D.fechaHumana(fecha))}">
        <span class="numero">${dia}</span>
        <span class="marca ${marca}"></span>
      </button>
    `;
  }

  return `
    ${cabecera()}
    <main class="contenido">
      <section class="bloque">
        <div class="navegador-mes">
          <button class="boton-icono" data-accion="mes-anterior" aria-label="Mes anterior">‹</button>
          <h2>${D.mesHumano(mes)}</h2>
          <button class="boton-icono" data-accion="mes-siguiente" aria-label="Mes siguiente">›</button>
        </div>
        <div class="calendario">
          ${["L", "M", "X", "J", "V", "S", "D"].map((letra) => `<span class="dia-semana">${letra}</span>`).join("")}
          ${celdas}
        </div>
        <p class="leyenda-calendario">
          <span><span class="marca guardado"></span>Registrado</span>
          <span><span class="marca pendiente"></span>Pendiente</span>
          <span><span class="marca sin-clase"></span>Sin clase</span>
        </p>
        <div class="resumen-mes">
          <span class="dato">${plural(resumen.totales.diasDeClase, "día de clase", "días de clase")}</span>
          <span class="dato rojo">${plural(resumen.totales.ausente, "falta en el mes", "faltas en el mes")}</span>
        </div>
        <button class="boton-principal" data-accion="ir-hoy">${cache.dias.has(hoy) ? "Ver el pase de hoy" : "Pasar lista de hoy"}</button>
      </section>
    </main>
    ${navInferior("mes")}
  `;
}

function filaEstudiante(fecha, estudiante, cache) {
  const registro = cache.registros.get(D.claveRegistro(fecha, estudiante.mat));
  const actual = D.estadoDe(registro);
  const abierto = estado.comentarioAbierto === estudiante.mat;
  const tieneComentario = Boolean(registro && (registro.comentario || (registro.etiquetas && registro.etiquetas.length)));

  const botones = D.ESTADOS.map((opcion) => {
    const activa = opcion === actual;
    return `
      <button type="button" class="pastilla e-${D.letraEstado(opcion).toLowerCase()}${activa ? " activa" : ""}"
        data-accion="estado" data-fecha="${fecha}" data-mat="${estudiante.mat}" data-estado="${opcion}"
        aria-pressed="${activa}" aria-label="${opcion} para ${esc(estudiante.nombre)}">${D.letraEstado(opcion)}</button>
    `;
  }).join("");

  const etiquetas = D.ETIQUETAS_RAPIDAS.map((etiqueta) => {
    const puesta = abierto
      ? estado.etiquetasBorrador.includes(etiqueta)
      : Boolean(registro?.etiquetas?.includes(etiqueta));
    return `<button type="button" class="chip${puesta ? " puesta" : ""}" data-accion="etiqueta" data-etiqueta="${esc(etiqueta)}">${esc(etiqueta)}</button>`;
  }).join("");

  const nota = estudiante.notaPersistente
    ? `<span class="nota-persistente">${esc(estudiante.notaPersistente)}</span>`
    : "";

  return `
    <li class="fila">
      <div class="fila-principal">
        <span class="fila-numero">${estudiante.no}</span>
        <span class="fila-nombre">${esc(estudiante.nombre)}${nota}</span>
        <div class="estados" role="group" aria-label="Estado de ${esc(estudiante.nombre)}">${botones}</div>
        <button type="button" class="boton-comentario${tieneComentario ? " lleno" : ""}" data-accion="comentario" data-mat="${estudiante.mat}" aria-label="Comentario de ${esc(estudiante.nombre)}" aria-expanded="${abierto}">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 4h16v11H8l-4 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
        </button>
      </div>
      ${abierto ? `
        <div class="caja-comentario">
          <textarea data-comentario="${estudiante.mat}" rows="2" placeholder="Observación del día…">${esc(registro?.comentario || "")}</textarea>
          <div class="chips">${etiquetas}</div>
          <div class="acciones-comentario">
            <button type="button" class="boton-secundario" data-accion="quitar-comentario" data-fecha="${fecha}" data-mat="${estudiante.mat}">Quitar</button>
            <button type="button" class="boton-principal compacto" data-accion="guardar-comentario" data-fecha="${fecha}" data-mat="${estudiante.mat}">Guardar</button>
          </div>
        </div>
      ` : ""}
    </li>
  `;
}

function vistaDia(fecha, cache) {
  const dia = cache.dias.get(fecha) || { fecha, tipo: "clase", motivo: "", nota: "" };
  const sinClase = dia.tipo === "sinClase";
  const activos = estado.estudiantes.filter((estudiante) => estudiante.estado !== "retirada");
  const contadores = D.contadoresDelDia(
    activos.map((estudiante) => cache.registros.get(D.claveRegistro(fecha, estudiante.mat)) || { estado: D.PRESENTE })
  );
  const filas = activos.map((estudiante) => filaEstudiante(fecha, estudiante, cache)).join("");

  const motivoPersonalizado = dia.motivo && !D.MOTIVOS_SIN_CLASE.includes(dia.motivo);
  const bloqueSinClase = `
    <div class="aviso-sin-clase">Día sin clase: no genera faltas ni cuenta en el resumen.</div>
    <label class="campo">Motivo
      <select data-campo="motivo-dia">
        ${D.MOTIVOS_SIN_CLASE.map((motivo) => `<option value="${esc(motivo)}" ${motivo === dia.motivo ? "selected" : ""}>${esc(motivo)}</option>`).join("")}
        <option value="__otro" ${motivoPersonalizado || !dia.motivo ? "selected" : ""}>Otro…</option>
      </select>
    </label>
    <label class="campo">Detalle (opcional)
      <input data-campo="motivo-detalle" value="${esc(motivoPersonalizado ? dia.motivo : "")}" placeholder="Escribe el motivo">
    </label>
    <button class="boton-secundario" data-accion="volver-clase" data-fecha="${fecha}">Marcar como día de clase</button>
  `;

  const bloqueNota = estado.notaAbierta
    ? `
      <div class="caja-nota-dia">
        <textarea data-campo="nota-texto" rows="2" placeholder="Nota general del día (p. ej. salida pedagógica)">${esc(dia.nota || "")}</textarea>
        <div class="acciones-comentario">
          <button type="button" class="boton-secundario" data-accion="nota-dia" data-fecha="${fecha}">Cerrar</button>
          <button type="button" class="boton-principal compacto" data-accion="guardar-nota-dia" data-fecha="${fecha}">Guardar nota</button>
        </div>
      </div>
    `
    : `
      <button type="button" class="enlace nota-dia" data-accion="nota-dia" data-fecha="${fecha}">
        ${dia.nota ? "Editar nota del día" : "Agregar nota del día"}
      </button>
      ${dia.nota ? `<p class="texto-nota-dia">${esc(dia.nota)}</p>` : ""}
    `;

  const bloqueClase = `
    <div class="contadores">
      <span class="dato verde">${plural(contadores.presente, "presente", "presentes")}</span>
      <span class="dato rojo">${plural(contadores.ausente, "ausente", "ausentes")}</span>
      <span class="dato ambar">${plural(contadores.tarde, "tarde", "tardes")}</span>
      <span class="dato azul">${plural(contadores.excusa, "excusa", "excusas")}</span>
    </div>
    <div class="acciones-dia">
      <button class="boton-secundario" data-accion="todos-presentes" data-fecha="${fecha}">Todos presentes</button>
      ${estado.deshacer ? `<button class="boton-secundario" data-accion="deshacer">Deshacer</button>` : ""}
      <button class="boton-secundario" data-accion="sin-clase" data-fecha="${fecha}">Sin clase</button>
    </div>
    ${bloqueNota}
  `;

  return `
    ${cabecera()}
    <main class="contenido">
      <section class="bloque">
        <div class="navegador-mes">
          <button class="boton-icono" data-accion="volver" aria-label="Volver al mes">‹</button>
          <h2>${D.fechaHumana(fecha)}</h2>
          <span></span>
        </div>
        ${sinClase ? bloqueSinClase : bloqueClase}
        ${sinClase
          ? `<p class="leyenda">Este día no cuenta en las estadísticas. Si registras asistencia, vuelve a marcarlo como día de clase.</p>`
          : `<p class="leyenda">P presente · A ausente · T tarde · E excusa. Todos arrancan presentes: marca solo las excepciones.</p>`}
      </section>
      <section class="bloque sin-padding">
        <ul class="lista-estudiantes">${filas}</ul>
      </section>
    </main>
    ${navInferior("")}
  `;
}

function vistaResumen(mes) {
  const cache = estado.cache.get(mes);
  const resumen = D.resumenDelMes({
    estudiantes: estado.estudiantes,
    dias: [...cache.dias.values()],
    registros: [...cache.registros.values()],
    ajustes: estado.ajustes,
  });

  const filas = resumen.filas.map((fila) => `
    <tr class="${fila.alerta ? "alerta" : ""}">
      <td class="num">${fila.no}</td>
      <td class="nom">${esc(fila.nombre)}${fila.alerta ? `<span class="insignia">${esc(D.textoAlerta(fila.alerta))}</span>` : ""}</td>
      <td>${fila.presente}</td>
      <td>${fila.tarde}</td>
      <td>${fila.excusa}</td>
      <td class="fuerte">${fila.ausente}</td>
      <td>${fila.porcentaje == null ? "—" : `${fila.porcentaje}%`}</td>
    </tr>
  `).join("");

  return `
    ${cabecera()}
    <main class="contenido">
      <section class="bloque">
        <div class="solo-impresion">IED Brisas del Río · Asistencia 10°-A · ${D.mesHumano(mes)}</div>
        <div class="navegador-mes no-imprimir">
          <button class="boton-icono" data-accion="mes-anterior" aria-label="Mes anterior">‹</button>
          <h2>Resumen · ${D.mesHumano(mes)}</h2>
          <button class="boton-icono" data-accion="mes-siguiente" aria-label="Mes siguiente">›</button>
        </div>
        <table class="tabla">
          <thead>
            <tr>
              <th class="num">No.</th>
              <th class="nom">Estudiante</th>
              <th title="Presente">P</th>
              <th title="Tarde">T</th>
              <th title="Excusa">E</th>
              <th title="Ausente">A</th>
              <th title="Porcentaje de asistencia">%</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
          <tfoot>
            <tr>
              <td></td>
              <td class="nom">TOTAL DEL CURSO</td>
              <td>${resumen.totales.presente}</td>
              <td>${resumen.totales.tarde}</td>
              <td>${resumen.totales.excusa}</td>
              <td class="fuerte">${resumen.totales.ausente}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <p class="leyenda">${plural(resumen.totales.diasDeClase, "día de clase", "días de clase")} en el mes · % = (P + T) ÷ días de clase · Alerta: 3+ faltas seguidas o 5+ en el mes.</p>
        <div class="grupo-botones no-imprimir">
          <button class="boton-secundario" data-accion="csv-resumen">Exportar resumen (CSV)</button>
          <button class="boton-secundario" data-accion="csv-matriz">Exportar detalle por día (CSV)</button>
          <button class="boton-secundario" data-accion="imprimir">Imprimir</button>
        </div>
      </section>
    </main>
    ${navInferior("resumen")}
  `;
}

function filaListaEstudiante(estudiante) {
  const editando = estado.formulario?.modo === "editar" && Number(estado.formulario.mat) === Number(estudiante.mat);
  if (editando) {
    return `
      <li class="fila">
        <form class="formulario-estudiante" data-accion="form-estudiante" data-mat="${estudiante.mat}">
          <label class="campo">No. <input name="no" type="number" min="1" value="${estudiante.no}"></label>
          <label class="campo">Nombre completo <input name="nombre" value="${esc(estudiante.nombre)}" required></label>
          <label class="campo">Mat. No. <input value="${estudiante.mat}" disabled></label>
          <label class="campo">Nota persistente <input name="nota" value="${esc(estudiante.notaPersistente || "")}" placeholder="Opcional (p. ej. ajustes PIAR)"></label>
          <div class="acciones-comentario">
            <button type="button" class="boton-secundario" data-accion="cancelar-form">Cancelar</button>
            <button type="submit" class="boton-principal compacto">Guardar</button>
          </div>
        </form>
      </li>
    `;
  }
  return `
    <li class="fila fila-estudiante">
      <span class="fila-numero">${estudiante.no}</span>
      <span class="fila-nombre">${esc(estudiante.nombre)}<span class="mat">Mat. ${estudiante.mat}</span></span>
      <span class="estado-cuenta ${estudiante.estado === "retirada" ? "retirada" : ""}">${estudiante.estado === "retirada" ? "Retirada" : "Activa"}</span>
      <span class="botonera">
        <button class="boton-secundario compacto" data-accion="editar-estudiante" data-mat="${estudiante.mat}" aria-label="Editar ${esc(estudiante.nombre)}">Editar</button>
        ${estudiante.estado === "retirada"
          ? `<button class="boton-secundario compacto" data-accion="reactivar" data-mat="${estudiante.mat}" aria-label="Reactivar ${esc(estudiante.nombre)}">Reactivar</button>`
          : `<button class="boton-secundario compacto" data-accion="retirar" data-mat="${estudiante.mat}" aria-label="Retirar ${esc(estudiante.nombre)}">Retirar</button>`}
      </span>
    </li>
  `;
}

function vistaLista() {
  const activos = estado.estudiantes.filter((estudiante) => estudiante.estado !== "retirada");
  const retiradas = estado.estudiantes.filter((estudiante) => estudiante.estado === "retirada");
  const nuevo = estado.formulario?.modo === "nuevo";

  return `
    ${cabecera()}
    <main class="contenido">
      <section class="bloque">
        <h2>Estudiantes (${activos.length})</h2>
        ${nuevo ? `
          <form class="formulario-estudiante" data-accion="form-estudiante">
            <label class="campo">No. <input name="no" type="number" min="1"></label>
            <label class="campo">Nombre completo <input name="nombre" required placeholder="APELLIDOS NOMBRES"></label>
            <label class="campo">Mat. No. <input name="mat" type="number" required></label>
            <label class="campo">Nota persistente <input name="nota" placeholder="Opcional (p. ej. ajustes PIAR)"></label>
            <div class="acciones-comentario">
              <button type="button" class="boton-secundario" data-accion="cancelar-form">Cancelar</button>
              <button type="submit" class="boton-principal compacto">Guardar</button>
            </div>
          </form>
        ` : `
          <button class="boton-secundario" data-accion="agregar-estudiante">Agregar estudiante</button>
        `}
        <ul class="lista-estudiantes">${activos.map(filaListaEstudiante).join("")}</ul>
      </section>

      ${retiradas.length ? `
        <section class="bloque">
          <h2>Retiradas (${retiradas.length})</h2>
          <ul class="lista-estudiantes">${retiradas.map(filaListaEstudiante).join("")}</ul>
        </section>
      ` : ""}

      <section class="bloque">
        <h2>Datos</h2>
        <div class="grupo-botones">
          <button class="boton-secundario" data-accion="importar-lista">Importar lista base (JSON)</button>
          <button class="boton-secundario" data-accion="respaldo">Descargar respaldo (JSON)</button>
          <button class="boton-secundario" data-accion="restaurar-respaldo">Restaurar respaldo (JSON)</button>
        </div>
        <input type="file" accept=".json,application/json" hidden data-rol="archivo-lista">
        <input type="file" accept=".json,application/json" hidden data-rol="archivo-respaldo">
        <p class="leyenda">La lista base se importa una sola vez (agrega o actualiza por Mat. No.). El respaldo guarda todo el histórico.</p>
      </section>

      <section class="bloque">
        <h2>Cuenta</h2>
        <p class="leyenda">${estado.usuario?.email ? `Sesión: ${esc(estado.usuario.email)}` : ""}</p>
        <button class="boton-secundario" data-accion="salir">Cerrar sesión</button>
      </section>
    </main>
    ${navInferior("lista")}
  `;
}

function moverMes(delta) {
  const ruta = parsearRuta();
  const base = estado.mesVista;
  const nuevo = delta < 0 ? D.mesAnterior(base) : D.mesSiguiente(base);
  if (ruta.vista === "resumen") location.hash = `#/resumen/${nuevo}`;
  else location.hash = `#/mes/${nuevo}`;
}

async function fijarEstado(fecha, mat, nuevoEstado) {
  const mes = fecha.slice(0, 7);
  const cache = estado.cache.get(mes);
  if (!cache) return;
  const clave = D.claveRegistro(fecha, mat);
  const anterior = cache.registros.get(clave) || null;
  const registro = {
    fecha,
    mat,
    estado: nuevoEstado,
    comentario: anterior?.comentario || "",
    etiquetas: anterior?.etiquetas ? [...anterior.etiquetas] : [],
  };
  const esPredeterminado = registro.estado === D.PRESENTE && !registro.comentario && registro.etiquetas.length === 0;
  const { diaAnterior, dia } = prepararDia(cache, fecha);

  estado.deshacer = async () => {
    if (anterior) {
      await repo.guardarRegistro(anterior);
      cache.registros.set(clave, anterior);
    } else {
      await repo.borrarRegistro(fecha, mat);
      cache.registros.delete(clave);
    }
    if (diaAnterior) {
      await repo.guardarDia(diaAnterior);
      cache.dias.set(fecha, diaAnterior);
    } else {
      await repo.borrarDia(fecha);
      cache.dias.delete(fecha);
    }
    estado.deshacer = null;
    render();
  };

  if (esPredeterminado) cache.registros.delete(clave);
  else cache.registros.set(clave, registro);
  cache.dias.set(fecha, dia);
  render();

  try {
    if (esPredeterminado) await repo.borrarRegistro(fecha, mat);
    else await repo.guardarRegistro(registro);
    await repo.guardarDia(dia);
  } catch {
    avisar("No se pudo guardar el cambio. Revisa la conexión.", "error");
  }
}

async function marcarTodosPresentes(fecha) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  if (!cache) return;
  const diaAnterior = cache.dias.get(fecha) || null;
  const dia = { fecha, tipo: "clase", motivo: "", nota: diaAnterior?.nota || "" };

  const previos = [...cache.registros.values()]
    .filter((registro) => registro.fecha === fecha)
    .map((registro) => ({ ...registro, etiquetas: [...(registro.etiquetas || [])] }));
  const cambios = [];
  for (const [clave, registro] of [...cache.registros]) {
    if (registro.fecha !== fecha) continue;
    const conNota = Boolean(registro.comentario) || Boolean(registro.etiquetas && registro.etiquetas.length);
    if (conNota) {
      const actualizado = { ...registro, estado: D.PRESENTE };
      cache.registros.set(clave, actualizado);
      cambios.push(["guardar", actualizado]);
    } else {
      cache.registros.delete(clave);
      cambios.push(["borrar", registro]);
    }
  }

  estado.deshacer = async () => {
    for (const [clave, registro] of [...cache.registros]) {
      if (registro.fecha !== fecha) continue;
      await repo.borrarRegistro(fecha, registro.mat);
      cache.registros.delete(clave);
    }
    for (const registro of previos) {
      await repo.guardarRegistro(registro);
      cache.registros.set(D.claveRegistro(fecha, registro.mat), registro);
    }
    if (diaAnterior) {
      await repo.guardarDia(diaAnterior);
      cache.dias.set(fecha, diaAnterior);
    } else {
      await repo.borrarDia(fecha);
      cache.dias.delete(fecha);
    }
    estado.deshacer = null;
    render();
  };

  cache.dias.set(fecha, dia);
  render();
  try {
    for (const [operacion, registro] of cambios) {
      if (operacion === "borrar") await repo.borrarRegistro(fecha, registro.mat);
      else await repo.guardarRegistro(registro);
    }
    await repo.guardarDia(dia);
    avisar("Día registrado: todos presentes.");
  } catch {
    avisar("No se pudo guardar. Revisa la conexión.", "error");
  }
}

async function fijarTipoDia(fecha, tipo, motivo) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  if (!cache) return;
  const diaAnterior = cache.dias.get(fecha) || null;
  const dia = {
    fecha,
    tipo,
    motivo: motivo || "",
    nota: diaAnterior?.nota || "",
  };

  estado.deshacer = async () => {
    if (diaAnterior) {
      await repo.guardarDia(diaAnterior);
      cache.dias.set(fecha, diaAnterior);
    } else {
      await repo.borrarDia(fecha);
      cache.dias.delete(fecha);
    }
    estado.deshacer = null;
    render();
  };

  cache.dias.set(fecha, dia);
  render();
  try {
    await repo.guardarDia(dia);
  } catch {
    avisar("No se pudo guardar. Revisa la conexión.", "error");
  }
}

async function guardarMotivoDia(fecha, motivo) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  if (!cache) return;
  const diaAnterior = cache.dias.get(fecha) || { fecha, tipo: "sinClase", motivo: "", nota: "" };
  const dia = { ...diaAnterior, tipo: "sinClase", motivo };
  cache.dias.set(fecha, dia);
  try {
    await repo.guardarDia(dia);
  } catch {
    avisar("No se pudo guardar el motivo.", "error");
  }
}

async function guardarNotaDia(fecha) {
  const campo = document.querySelector('[data-campo="nota-texto"]');
  const nota = (campo?.value || "").trim();
  const cache = estado.cache.get(fecha.slice(0, 7));
  if (!cache) return;
  const diaAnterior = cache.dias.get(fecha) || null;
  const dia = diaAnterior ? { ...diaAnterior, nota } : { fecha, tipo: "clase", motivo: "", nota };
  cache.dias.set(fecha, dia);
  estado.notaAbierta = false;
  render();
  try {
    await repo.guardarDia(dia);
    avisar("Nota del día guardada.");
  } catch {
    avisar("No se pudo guardar la nota.", "error");
  }
}

async function guardarComentario(fecha, mat) {
  const cache = estado.cache.get(fecha.slice(0, 7));
  if (!cache) return;
  const clave = D.claveRegistro(fecha, mat);
  const anterior = cache.registros.get(clave) || null;
  const campo = document.querySelector(`textarea[data-comentario="${mat}"]`);
  const comentario = (campo?.value || "").trim();
  const etiquetas = [...estado.etiquetasBorrador];
  const registro = {
    fecha,
    mat,
    estado: anterior?.estado || D.PRESENTE,
    comentario,
    etiquetas,
  };
  const esPredeterminado = registro.estado === D.PRESENTE && !comentario && etiquetas.length === 0;
  const { dia } = prepararDia(cache, fecha);

  if (esPredeterminado) cache.registros.delete(clave);
  else cache.registros.set(clave, registro);
  cache.dias.set(fecha, dia);
  render();

  try {
    if (esPredeterminado) await repo.borrarRegistro(fecha, mat);
    else await repo.guardarRegistro(registro);
    await repo.guardarDia(dia);
    avisar("Comentario guardado.");
  } catch {
    avisar("No se pudo guardar el comentario.", "error");
  }
}

async function importarListaDeArchivo(archivo) {
  if (!archivo) return;
  try {
    const contenido = JSON.parse(await archivo.text());
    const lista = Array.isArray(contenido) ? contenido : contenido.estudiantes;
    if (!Array.isArray(lista) || !lista.length) throw new Error("El archivo no trae estudiantes.");
    const normalizados = lista.map(normalizarEstudiante).filter(Boolean);
    if (!normalizados.length) throw new Error("No se encontró ningún estudiante válido.");
    if (!confirm(`Se van a importar o actualizar ${normalizados.length} estudiantes por Mat. No. ¿Continuar?`)) return;
    await repo.importarLista(normalizados);
    estado.estudiantes = await repo.listarEstudiantes();
    render();
    avisar(`Lista importada: ${normalizados.length} estudiantes.`);
  } catch (error) {
    avisar(`No se pudo importar la lista: ${error.message}`, "error");
  }
}

async function restaurarDeArchivo(archivo) {
  if (!archivo) return;
  try {
    const contenido = JSON.parse(await archivo.text());
    const estudiantes = contenido.estudiantes || [];
    const dias = contenido.dias || [];
    const registros = contenido.registros || [];
    if (!estudiantes.length && !registros.length) throw new Error("El archivo no parece un respaldo.");
    if (!confirm(`Se van a restaurar ${estudiantes.length} estudiantes y ${registros.length} registros de asistencia. ¿Continuar?`)) return;
    await repo.importarTodo({ estudiantes, dias, registros });
    estado.cache.clear();
    estado.estudiantes = await repo.listarEstudiantes();
    render();
    avisar("Respaldo restaurado.");
  } catch (error) {
    avisar(`No se pudo restaurar: ${error.message}`, "error");
  }
}

function normalizarEstudiante(bruto) {
  const mat = Number(bruto?.mat);
  const nombre = String(bruto?.nombre || "").trim();
  if (!mat || !nombre) return null;
  return {
    mat,
    no: Number(bruto.no) || 0,
    nombre,
    estado: bruto.estado === "retirada" ? "retirada" : "activo",
    notaPersistente: bruto.notaPersistente ? String(bruto.notaPersistente) : null,
  };
}

async function exportarResumenCsv() {
  const mes = estado.mesVista;
  const cache = estado.cache.get(mes);
  const resumen = D.resumenDelMes({
    estudiantes: estado.estudiantes,
    dias: [...cache.dias.values()],
    registros: [...cache.registros.values()],
    ajustes: estado.ajustes,
  });
  descargar(`asistencia-10A_resumen_${mes}.csv`, "\uFEFF" + D.csvResumen(resumen, { curso: "10°-A", mes }), "text/csv;charset=utf-8");
}

async function exportarMatrizCsv() {
  const mes = estado.mesVista;
  const cache = estado.cache.get(mes);
  const resumen = D.resumenDelMes({
    estudiantes: estado.estudiantes,
    dias: [...cache.dias.values()],
    registros: [...cache.registros.values()],
    ajustes: estado.ajustes,
  });
  const matriz = D.matrizDelMes({
    estudiantes: estado.estudiantes,
    diasDeClase: resumen.diasDeClase,
    registros: [...cache.registros.values()],
  });
  descargar(
    `asistencia-10A_detalle_${mes}.csv`,
    "\uFEFF" + D.csvMatriz(matriz, { curso: "10°-A", mes, diasDeClase: resumen.diasDeClase }),
    "text/csv;charset=utf-8"
  );
}

async function descargarRespaldo() {
  try {
    const datos = await repo.exportarTodo();
    descargar(`respaldo_asistencia-10A_${D.hoyClave()}.json`, JSON.stringify(datos, null, 2), "application/json");
    avisar("Respaldo descargado.");
  } catch {
    avisar("No se pudo descargar el respaldo.", "error");
  }
}

async function guardarEstudianteDeFormulario(formulario) {
  const datos = new FormData(formulario);
  const esEdicion = Boolean(formulario.dataset.mat);
  const mat = esEdicion ? Number(formulario.dataset.mat) : Number(datos.get("mat"));
  const nombre = String(datos.get("nombre") || "").trim();
  const no = Number(datos.get("no")) || 0;
  const nota = String(datos.get("nota") || "").trim();
  if (!mat || !nombre) {
    avisar("Completa el Mat. No. y el nombre.", "error");
    return;
  }
  const existente = estado.estudiantes.find((estudiante) => Number(estudiante.mat) === mat);
  if (!esEdicion && existente) {
    avisar("Ya existe un estudiante con ese Mat. No.", "error");
    return;
  }
  const estudiante = {
    mat,
    no: no || existente?.no || estado.estudiantes.length + 1,
    nombre,
    estado: existente?.estado || "activo",
    notaPersistente: nota || null,
  };
  try {
    await repo.guardarEstudiante(estudiante);
    estado.estudiantes = ordenarLocal([
      ...estado.estudiantes.filter((otro) => Number(otro.mat) !== mat),
      estudiante,
    ]);
    estado.formulario = null;
    render();
    avisar("Estudiante guardado.");
  } catch {
    avisar("No se pudo guardar el estudiante.", "error");
  }
}

async function cambiarEstadoEstudiante(mat, nuevoEstado) {
  const existente = estado.estudiantes.find((estudiante) => Number(estudiante.mat) === Number(mat));
  if (!existente) return;
  const estudiante = { ...existente, estado: nuevoEstado };
  try {
    await repo.guardarEstudiante(estudiante);
    estado.estudiantes = ordenarLocal([
      ...estado.estudiantes.filter((otro) => Number(otro.mat) !== Number(mat)),
      estudiante,
    ]);
    render();
    avisar(nuevoEstado === "retirada" ? "Estudiante marcada como retirada." : "Estudiante reactivada.");
  } catch {
    avisar("No se pudo actualizar la estudiante.", "error");
  }
}

app.addEventListener("click", async (evento) => {
  const elemento = evento.target.closest("[data-accion]");
  if (!elemento || elemento.tagName === "FORM") return;
  const accion = elemento.dataset.accion;
  const fecha = elemento.dataset.fecha;
  const mat = elemento.dataset.mat;

  switch (accion) {
    case "entrar-demo":
      await repo.entrar();
      break;
    case "salir":
      await repo.salir();
      break;
    case "navegar":
      location.hash = elemento.dataset.destino;
      break;
    case "mes-anterior":
      moverMes(-1);
      break;
    case "mes-siguiente":
      moverMes(1);
      break;
    case "abrir-dia":
      location.hash = `#/dia/${fecha}`;
      break;
    case "ir-hoy":
      location.hash = `#/dia/${D.hoyClave()}`;
      break;
    case "volver":
      location.hash = `#/mes/${estado.mesVista}`;
      break;
    case "estado":
      await fijarEstado(fecha, Number(mat), elemento.dataset.estado);
      break;
    case "todos-presentes":
      await marcarTodosPresentes(fecha);
      break;
    case "sin-clase":
      await fijarTipoDia(fecha, "sinClase");
      break;
    case "volver-clase":
      await fijarTipoDia(fecha, "clase");
      break;
    case "deshacer":
      if (estado.deshacer) {
        const deshacer = estado.deshacer;
        estado.deshacer = null;
        try {
          await deshacer();
        } catch {
          avisar("No se pudo deshacer.", "error");
        }
      }
      break;
    case "nota-dia":
      estado.notaAbierta = !estado.notaAbierta;
      render();
      if (estado.notaAbierta) document.querySelector('[data-campo="nota-texto"]')?.focus();
      break;
    case "guardar-nota-dia":
      await guardarNotaDia(fecha);
      break;
    case "comentario": {
      const matNumero = Number(mat);
      if (estado.comentarioAbierto === matNumero) {
        estado.comentarioAbierto = null;
      } else {
        estado.comentarioAbierto = matNumero;
        const cache = estado.cache.get(fecha?.slice(0, 7)) || estado.cache.get(estado.diaVista?.slice(0, 7));
        const registro = cache?.registros.get(D.claveRegistro(estado.diaVista, matNumero));
        estado.etiquetasBorrador = registro?.etiquetas ? [...registro.etiquetas] : [];
        estado.notaAbierta = false;
      }
      render();
      if (estado.comentarioAbierto === matNumero) {
        document.querySelector(`textarea[data-comentario="${matNumero}"]`)?.focus();
      }
      break;
    }
    case "etiqueta": {
      const etiqueta = elemento.dataset.etiqueta;
      if (estado.etiquetasBorrador.includes(etiqueta)) {
        estado.etiquetasBorrador = estado.etiquetasBorrador.filter((otra) => otra !== etiqueta);
        elemento.classList.remove("puesta");
      } else {
        estado.etiquetasBorrador.push(etiqueta);
        elemento.classList.add("puesta");
      }
      break;
    }
    case "guardar-comentario":
      await guardarComentario(fecha, Number(mat));
      break;
    case "quitar-comentario": {
      const cache = estado.cache.get(fecha.slice(0, 7));
      const clave = D.claveRegistro(fecha, Number(mat));
      const anterior = cache.registros.get(clave) || null;
      const estadoActual = anterior?.estado || D.PRESENTE;
      const esPredeterminado = estadoActual === D.PRESENTE;
      if (esPredeterminado) cache.registros.delete(clave);
      else cache.registros.set(clave, { fecha, mat: Number(mat), estado: estadoActual, comentario: "", etiquetas: [] });
      estado.comentarioAbierto = null;
      render();
      try {
        if (esPredeterminado) await repo.borrarRegistro(fecha, Number(mat));
        else await repo.guardarRegistro({ fecha, mat: Number(mat), estado: estadoActual, comentario: "", etiquetas: [] });
      } catch {
        avisar("No se pudo quitar el comentario.", "error");
      }
      break;
    }
    case "csv-resumen":
      await exportarResumenCsv();
      break;
    case "csv-matriz":
      await exportarMatrizCsv();
      break;
    case "imprimir":
      window.print();
      break;
    case "respaldo":
      await descargarRespaldo();
      break;
    case "importar-lista":
      document.querySelector('[data-rol="archivo-lista"]')?.click();
      break;
    case "restaurar-respaldo":
      document.querySelector('[data-rol="archivo-respaldo"]')?.click();
      break;
    case "agregar-estudiante":
      estado.formulario = { modo: "nuevo" };
      render();
      break;
    case "editar-estudiante":
      estado.formulario = { modo: "editar", mat: Number(mat) };
      render();
      break;
    case "cancelar-form":
      estado.formulario = null;
      render();
      break;
    case "retirar":
      await cambiarEstadoEstudiante(mat, "retirada");
      break;
    case "reactivar":
      await cambiarEstadoEstudiante(mat, "activo");
      break;
    case "reintentar":
      render();
      break;
  }
});

app.addEventListener("submit", async (evento) => {
  const formulario = evento.target.closest("form");
  if (!formulario) return;
  if (formulario.dataset.accion === "entrar") {
    evento.preventDefault();
    const correo = formulario.correo.value.trim();
    const clave = formulario.clave.value;
    const boton = formulario.querySelector("button[type=submit]");
    const errorEl = document.getElementById("error-entrar");
    errorEl.textContent = "";
    boton.disabled = true;
    boton.textContent = "Entrando…";
    try {
      await repo.entrar(correo, clave);
    } catch (error) {
      errorEl.textContent = error.message;
      boton.disabled = false;
      boton.textContent = "Entrar";
    }
    return;
  }
  if (formulario.dataset.accion === "form-estudiante") {
    evento.preventDefault();
    await guardarEstudianteDeFormulario(formulario);
  }
});

app.addEventListener("change", async (evento) => {
  const objetivo = evento.target;
  if (objetivo.dataset.rol === "archivo-lista") {
    await importarListaDeArchivo(objetivo.files?.[0]);
    objetivo.value = "";
    return;
  }
  if (objetivo.dataset.rol === "archivo-respaldo") {
    await restaurarDeArchivo(objetivo.files?.[0]);
    objetivo.value = "";
    return;
  }
  if (objetivo.dataset.campo === "motivo-dia") {
    const fecha = estado.diaVista;
    if (objetivo.value === "__otro") {
      await guardarMotivoDia(fecha, "");
      render();
    } else {
      await guardarMotivoDia(fecha, objetivo.value);
    }
    return;
  }
  if (objetivo.dataset.campo === "motivo-detalle") {
    await guardarMotivoDia(estado.diaVista, objetivo.value.trim());
  }
});

window.addEventListener("hashchange", render);

iniciar();
