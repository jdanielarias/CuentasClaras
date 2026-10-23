/* ============================================================
   Cuentas Claras — inventario, ventas y gastos
   Los datos viven en Supabase (ver datos.js). Este archivo es la
   pantalla: pinta lo que llega y manda al servidor lo que cambia.
   ============================================================ */

/* Lo único que se guarda en el celular: qué tienda estabas mirando. */
const CLAVE_PREFERENCIAS = 'cuentas-claras-preferencias';

const estado = {
  tiendas: [],
  tiendaActiva: null,
  productos: [],
  ventas: [],
  gastos: [],
  vista: 'inventario',
  categoria: '', // '' = todas
  periodo: { ventas: 'mes', gastos: 'mes', resumen: 'mes' },
  soloLectura: false, // sin internet: se puede mirar, no registrar
  visto: null // cuándo se cargó la copia que se está mirando
};

/* ---------------- utilidades ---------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* Íconos dibujados a mano, no emoji. Trazo de 1.7 para que casen
   con los de la barra inferior. */
const svg = (d, w = 18) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const ICO = {
  mas: svg('<path d="M12 5.5v13"/><path d="M5.5 12h13"/>'),
  lapiz: svg('<path d="m14.6 5.4 4 4"/><path d="m4 20 1.2-4.2L15.9 5.1a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3L8.2 18.8z"/>'),
  equis: svg('<path d="m6 6 12 12"/><path d="M18 6 6 18"/>'),
  papelera: svg('<path d="M4.5 7h15"/><path d="M9.5 7V4.8h5V7"/><path d="M6.5 7l.9 12.2h9.2L17.5 7"/>')
};

const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const money = (n) => '$' + nf.format(Math.round(Number(n) || 0));

/** Acepta 20000, "20.000", "20,000", "$ 20.000" y devuelve un número. */
function parseNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s/g, '').replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const partes = s.split('.');
    if (partes.length > 2) s = partes.join('');
    else if (partes.length === 2 && partes[1].length === 3) s = partes.join('');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/** Igual que parseNum, pero devuelve null si el campo se dejó vacío. */
function parseNumOpcional(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  return String(v).trim() === '' ? null : parseNum(v);
}

/** ¿Este producto o venta tiene precio de compra registrado? */
const conCosto = (r) => r.compra !== null && r.compra !== undefined;

function hoyISO(d = new Date()) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

function fechaLarga(iso) {
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
  const hoy = hoyISO();
  const ayer = hoyISO(new Date(Date.now() - 86400000));
  const dia = iso.slice(0, 10);
  if (dia === hoy) return 'Hoy';
  if (dia === ayer) return 'Ayer';
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}

function hora(iso) {
  if (iso.length <= 10) return '';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.add('visible');
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => el.classList.remove('visible'), 2200);
}

/* ---------------- preferencias de este celular ---------------- */

function guardarPreferencias() {
  try {
    localStorage.setItem(
      CLAVE_PREFERENCIAS,
      JSON.stringify({ tiendaActiva: estado.tiendaActiva })
    );
  } catch (e) {
    /* como mucho se pierde la tienda elegida; los datos no están aquí */
  }
}

function leerPreferencias() {
  try {
    const crudo = localStorage.getItem(CLAVE_PREFERENCIAS);
    return crudo ? JSON.parse(crudo) : {};
  } catch (e) {
    return {};
  }
}

/** Vuelca en el estado lo que llegó del servidor o de la última copia vista. */
function recibir(datos) {
  estado.tiendas = datos.tiendas || [];
  estado.productos = datos.productos || [];
  estado.ventas = datos.ventas || [];
  estado.gastos = datos.gastos || [];
  estado.soloLectura = datos.origen === 'copia';
  estado.visto = datos.visto || null;
  normalizarTiendas();
}

/** Pone color a las tiendas que no lo traen y decide cuál se muestra. */
function normalizarTiendas() {
  estado.tiendas.forEach(vestirTienda);
  const ids = new Set(estado.tiendas.map((t) => t.id));
  if (!ids.has(estado.tiendaActiva)) {
    estado.tiendaActiva = estado.tiendas.length ? estado.tiendas[0].id : null;
  }
}

/* ---------------- avisar de lo que falla ---------------- */

/** Ejecuta algo contra el servidor y, si falla, lo dice en cristiano. */
async function intentar(fn) {
  try {
    await fn();
    return true;
  } catch (e) {
    aviso(e.message || 'No se pudo completar.');
    return false;
  }
}

/** Sin conexión no se registra nada: es preferible a que se pisen los datos. */
function bloqueadoSinRed() {
  if (estado.soloLectura || !DB.hayRed()) {
    aviso('Sin internet solo puedes mirar. Conéctate para registrar.');
    return true;
  }
  return false;
}

/* Si todavía no hay ninguna tienda cargada, la barra no se queda en blanco. */
const SIN_TIENDA = { id: null, nombre: 'Cuentas Claras', tema: 'verde' };

const tiendaPorId = (id) =>
  estado.tiendas.find((t) => t.id === id) || estado.tiendas[0] || SIN_TIENDA;

const tiendaActual = () => tiendaPorId(estado.tiendaActiva);

const deTienda = (lista) => lista.filter((r) => r.tiendaId === estado.tiendaActiva);

/* ---------------- identidad de cada tienda ---------------- */

/** Monograma de la tienda: su inicial, en serif. Nada de emoji. */
function inicial(nombre) {
  const n = (nombre || '').trim();
  return n ? n[0].toLocaleUpperCase('es') : 'C';
}

// Los hex tienen que ser idénticos a los de --marca en styles.css:
// de aquí salen las muestras del editor, el monograma y el color de
// la barra de estado del Android.
const TEMAS = [
  { id: 'dorado', nombre: 'Dorado', hex: '#6b4f1d' },
  { id: 'rosa', nombre: 'Rosa', hex: '#7a2540' },
  { id: 'verde', nombre: 'Verde', hex: '#1e4d45' },
  { id: 'morado', nombre: 'Morado', hex: '#43305e' },
  { id: 'azul', nombre: 'Azul', hex: '#1e3a5f' },
  { id: 'coral', nombre: 'Coral', hex: '#7a2e22' }
];

const hexDeTema = (id) => (TEMAS.find((t) => t.id === id) || TEMAS[2]).hex;

/** Le asigna color a una tienda que todavía no lo tiene. */
function vestirTienda(t, indice) {
  if (!t.tema || !TEMAS.some((x) => x.id === t.tema)) {
    if (/venus/i.test(t.nombre)) t.tema = 'rosa';
    else if (/lizz/i.test(t.nombre)) t.tema = 'dorado';
    else t.tema = TEMAS[(indice + 2) % TEMAS.length].id;
  }
}

/** Pinta la app entera con los colores de la tienda activa. */
function aplicarTema() {
  const t = tiendaActual();
  document.body.dataset.tema = t.tema;
  $('#iconoTienda').textContent = inicial(t.nombre);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', hexDeTema(t.tema));
}

/* ---------------- periodos ---------------- */

const PERIODOS = [
  { id: 'hoy', txt: 'Hoy' },
  { id: 'semana', txt: 'Esta semana' },
  { id: 'mes', txt: 'Este mes' },
  { id: 'anio', txt: 'Este año' },
  { id: 'todo', txt: 'Todo' }
];

function inicioDe(periodo) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (periodo === 'hoy') return d;
  if (periodo === 'semana') {
    const dia = (d.getDay() + 6) % 7; // lunes = 0
    d.setDate(d.getDate() - dia);
    return d;
  }
  if (periodo === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (periodo === 'anio') return new Date(d.getFullYear(), 0, 1);
  return new Date(0);
}

function enPeriodo(iso, periodo) {
  if (periodo === 'todo') return true;
  const f = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
  return f >= inicioDe(periodo);
}

function pintarPeriodos() {
  $$('.periodo').forEach((cont) => {
    const cual = cont.dataset.periodoDe;
    cont.innerHTML = PERIODOS.map(
      (p) =>
        `<button data-p="${p.id}" class="${estado.periodo[cual] === p.id ? 'activo' : ''}">${p.txt}</button>`
    ).join('');
    cont.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      estado.periodo[cual] = b.dataset.p;
      pintarPeriodos();
      render();
    };
  });
}

/* ---------------- render: inventario ---------------- */

/** Ganancia total de un producto; los que no tienen costo van al final del orden. */
const ganTotal = (p) => (conCosto(p) ? (p.venta - p.compra) * p.unidades : -1);

// Valor interno del filtro "Sin categoría". Sin espacios ni acentos: viaja como
// atributo data-cat del botón y debe volver idéntico al leerlo.
const SIN_CATEGORIA = '__sin_categoria__';

/** Categorías que existen en la tienda actual, ordenadas alfabéticamente. */
function categoriasDeTienda() {
  const propios = deTienda(estado.productos);
  const conNombre = [...new Set(propios.map((p) => (p.categoria || '').trim()).filter(Boolean))];
  conNombre.sort((a, b) => a.localeCompare(b, 'es'));
  const hayHuerfanos = propios.some((p) => !(p.categoria || '').trim());
  return { conNombre, hayHuerfanos };
}

function productosFiltrados() {
  const q = ($('#buscar').value || '').trim().toLowerCase();
  let lista = deTienda(estado.productos);

  if (estado.categoria === SIN_CATEGORIA) {
    lista = lista.filter((p) => !(p.categoria || '').trim());
  } else if (estado.categoria) {
    lista = lista.filter((p) => (p.categoria || '').trim() === estado.categoria);
  }

  if (q) {
    lista = lista.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.categoria || '').toLowerCase().includes(q) ||
        (p.notas || '').toLowerCase().includes(q)
    );
  }
  const orden = $('#orden').value;
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const criterios = {
    nombre: porNombre,
    // Ordena por precio de venta; a igual precio, alfabético.
    precioDesc: (a, b) => b.venta - a.venta || porNombre(a, b),
    precioAsc: (a, b) => a.venta - b.venta || porNombre(a, b),
    unidades: (a, b) => a.unidades - b.unidades,
    ganancia: (a, b) => ganTotal(b) - ganTotal(a),
    reciente: (a, b) => (b.creado || '').localeCompare(a.creado || '')
  };
  return lista.sort(criterios[orden] || porNombre);
}

function renderInventario() {
  const propios = deTienda(estado.productos);
  renderChipsCategorias();

  // Los totales describen lo que se está viendo en pantalla.
  const lista = productosFiltrados();
  const conPrecio = lista.filter(conCosto);
  const sinPrecio = lista.filter((p) => !conCosto(p) && p.unidades > 0);

  // Lo invertido solo puede sumar lo que sí tiene precio de compra.
  const invertido = conPrecio.reduce((s, p) => s + p.compra * p.unidades, 0);
  // El total de venta sí incluye todo, con costo conocido o sin él.
  const enVenta = lista.reduce((s, p) => s + p.venta * p.unidades, 0);
  const ganancia = conPrecio.reduce((s, p) => s + (p.venta - p.compra) * p.unidades, 0);
  const unidades = lista.reduce((s, p) => s + p.unidades, 0);

  $('#totInvertido').textContent = money(invertido);
  $('#totVenta').textContent = money(enVenta);
  $('#totGanancia').textContent = money(ganancia);
  $('#totUnidades').textContent =
    nf.format(unidades) + (unidades === 1 ? ' unidad' : ' unidades');

  const enVentaSinPrecio = sinPrecio.reduce((s, p) => s + p.venta * p.unidades, 0);
  $('#notaSinCosto').textContent = sinPrecio.length
    ? `${nf.format(sinPrecio.length)} ${sinPrecio.length === 1 ? 'producto no tiene' : 'productos no tienen'} precio de compra (${money(enVentaSinPrecio)} en venta). ${sinPrecio.length === 1 ? 'Está sumado' : 'Están sumados'} en "Si vendo todo", pero no en "Invertido" ni en "Ganancia".`
    : '';

  const buscando = ($('#buscar').value || '').trim();
  const filtroCat =
    estado.categoria === SIN_CATEGORIA
      ? 'sin categoría'
      : estado.categoria
        ? estado.categoria
        : '';
  $('#notaFiltro').textContent =
    filtroCat || buscando
      ? `Estos totales son solo de ${filtroCat ? `"${filtroCat}"` : `lo que coincide con "${buscando}"`}${filtroCat && buscando ? ` que coincide con "${buscando}"` : ''}. Toca "Todas" para ver el total de la tienda.`
      : '';

  const cont = $('#listaInventario');

  if (!propios.length) {
    cont.innerHTML = `<div class="vacio"><span class="emoji">${esc(inicial(tiendaActual().nombre))}</span>
      <p><strong>${esc(tiendaActual().nombre)} está vacía</strong></p>
      <p>Toca el botón + para registrar el primer producto.</p></div>`;
    return;
  }
  if (!lista.length) {
    cont.innerHTML = `<div class="vacio">
      <p><strong>Sin resultados</strong></p>
      <p>Ningún producto coincide con lo que estás filtrando.</p></div>`;
    return;
  }

  cont.innerHTML = lista
    .map((p) => {
      const tiene = conCosto(p);
      const clase = p.unidades === 0 ? 'agotado' : p.unidades <= (p.minimo ?? 0) ? 'poco' : '';
      return `<div class="item ${clase}">
        <div class="item-cab">
          <div class="item-nombre">${esc(p.nombre)}${
            (p.tono || '').trim() ? `<span class="item-tono">${esc(p.tono.trim())}</span>` : ''
          }</div>
          <div class="item-cant">${nf.format(p.unidades)}<small>${p.unidades === 1 ? 'unidad' : 'unidades'}</small></div>
        </div>
        <div class="item-precios">
          ${tiene
            ? `<span>Compra <b>${money(p.compra)}</b></span>`
            : `<span class="sin-costo">Compra sin registrar</span>`}
          <span>Venta <b>${money(p.venta)}</b></span>
          ${tiene ? `<span class="gana">Ganas ${money(p.venta - p.compra)} c/u</span>` : ''}
        </div>
        <div class="item-precios">
          ${tiene
            ? `<span>En bodega: <b>${money(p.compra * p.unidades)}</b> invertidos &rarr; <b>${money(p.venta * p.unidades)}</b> en venta</span>`
            : `<span>En bodega: <b>${money(p.venta * p.unidades)}</b> en venta</span>`}
        </div>
        ${(p.categoria || '').trim() ? `<span class="item-cat">${esc(p.categoria.trim())}</span>` : ''}
        ${p.notas ? `<div class="item-nota">${esc(p.notas)}</div>` : ''}
        <div class="item-acciones">
          <button class="vender" data-accion="vender" data-id="${p.id}" ${p.unidades === 0 ? 'disabled' : ''}>
            ${p.unidades === 0 ? 'Sin unidades' : 'Vender'}
          </button>
          <button class="mas" data-accion="sumar" data-id="${p.id}" aria-label="Entró una unidad">${ICO.mas}</button>
          <button data-accion="editar" data-id="${p.id}">Editar</button>
        </div>
      </div>`;
    })
    .join('');
}

function renderChipsCategorias() {
  const { conNombre, hayHuerfanos } = categoriasDeTienda();
  const cont = $('#filtroCategorias');

  // Con una sola categoría (o ninguna) no vale la pena mostrar el filtro.
  if (!conNombre.length) {
    cont.innerHTML = '';
    if (estado.categoria) estado.categoria = '';
    return;
  }

  // Si la categoría filtrada ya no existe en esta tienda, se vuelve a "Todas".
  if (
    estado.categoria &&
    estado.categoria !== SIN_CATEGORIA &&
    !conNombre.includes(estado.categoria)
  ) {
    estado.categoria = '';
  }
  if (estado.categoria === SIN_CATEGORIA && !hayHuerfanos) estado.categoria = '';

  const chip = (valor, texto) =>
    `<button data-accion="filtrar-cat" data-cat="${esc(valor)}" class="${estado.categoria === valor ? 'activo' : ''}">${esc(texto)}</button>`;

  cont.innerHTML =
    chip('', 'Todas') +
    conNombre.map((c) => chip(c, c)).join('') +
    (hayHuerfanos ? chip(SIN_CATEGORIA, 'Sin categoría') : '');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ---------------- render: ventas ---------------- */

function renderVentas() {
  const p = estado.periodo.ventas;
  const lista = deTienda(estado.ventas)
    .filter((v) => enPeriodo(v.fecha, p))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const conPrecio = lista.filter(conCosto);
  const sinPrecio = lista.filter((v) => !conCosto(v));

  const total = lista.reduce((s, v) => s + v.venta * v.cantidad, 0);
  const costo = conPrecio.reduce((s, v) => s + v.compra * v.cantidad, 0);
  const ganancia = conPrecio.reduce((s, v) => s + (v.venta - v.compra) * v.cantidad, 0);
  const unid = lista.reduce((s, v) => s + v.cantidad, 0);

  $('#vtaTotal').textContent = money(total);
  $('#vtaCosto').textContent = money(costo);
  $('#vtaGanancia').textContent = money(ganancia);
  $('#vtaUnidades').textContent = nf.format(unid) + (unid === 1 ? ' unidad' : ' unidades');

  const vendidoSinPrecio = sinPrecio.reduce((s, v) => s + v.venta * v.cantidad, 0);
  $('#notaVentasSinCosto').textContent = sinPrecio.length
    ? `${nf.format(sinPrecio.length)} ${sinPrecio.length === 1 ? 'venta' : 'ventas'} sin precio de compra registrado (${money(vendidoSinPrecio)}). Su ganancia no se puede calcular, así que no está incluida acá.`
    : '';

  const cont = $('#listaVentas');
  if (!lista.length) {
    cont.innerHTML = `<div class="vacio">
      <p><strong>Sin ventas en este periodo</strong></p>
      <p>Vende desde la pestaña Inventario.</p></div>`;
    return;
  }

  let html = '';
  let diaActual = '';
  lista.forEach((v) => {
    const dia = v.fecha.slice(0, 10);
    if (dia !== diaActual) {
      diaActual = dia;
      html += `<div class="fecha-grupo">${fechaLarga(v.fecha)}</div>`;
    }
    const marca = conCosto(v)
      ? `<small>+${money((v.venta - v.compra) * v.cantidad)}</small>`
      : '';
    html += `<div class="mov">
      <div class="mov-txt">
        <div class="mov-nombre">${esc(v.nombre)}</div>
        <div class="mov-meta">${nf.format(v.cantidad)} &times; ${money(v.venta)} &middot; ${hora(v.fecha)}</div>
      </div>
      <div class="mov-val">${money(v.venta * v.cantidad)}${marca}</div>
      <button class="mov-borrar" data-accion="borrar-venta" data-id="${v.id}" aria-label="Anular venta">${ICO.equis}</button>
    </div>`;
  });
  cont.innerHTML = html;
}

/* ---------------- render: gastos ---------------- */

function renderGastos() {
  const p = estado.periodo.gastos;
  const lista = deTienda(estado.gastos)
    .filter((g) => enPeriodo(g.fecha, p))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || '').localeCompare(a.creado || ''));

  const total = lista.reduce((s, g) => s + g.monto, 0);
  $('#gasTotal').textContent = money(total);
  $('#gasCantidad').textContent =
    nf.format(lista.length) + (lista.length === 1 ? ' registro' : ' registros');

  const porCat = {};
  lista.forEach((g) => {
    porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto;
  });
  $('#resumenCategorias').innerHTML = Object.entries(porCat)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `<span class="chip-cat">${esc(c)}<b>${money(v)}</b></span>`)
    .join('');

  const cont = $('#listaGastos');
  if (!lista.length) {
    cont.innerHTML = `<div class="vacio">
      <p><strong>Sin gastos en este periodo</strong></p>
      <p>Toca el botón + para registrar uno.</p></div>`;
    return;
  }

  let html = '';
  let diaActual = '';
  lista.forEach((g) => {
    if (g.fecha !== diaActual) {
      diaActual = g.fecha;
      html += `<div class="fecha-grupo">${fechaLarga(g.fecha)}</div>`;
    }
    const detalle = [g.descripcion, g.proveedor].filter(Boolean).join(' &middot; ');
    html += `<div class="mov">
      <div class="mov-txt">
        <div class="mov-nombre">${esc(g.categoria)}</div>
        ${detalle ? `<div class="mov-meta">${esc(g.descripcion || '')}${g.proveedor ? ' &middot; ' + esc(g.proveedor) : ''}</div>` : ''}
      </div>
      <div class="mov-val gasto">-${money(g.monto)}</div>
      <button class="mov-borrar" data-accion="editar-gasto" data-id="${g.id}" aria-label="Editar gasto">${ICO.lapiz}</button>
    </div>`;
  });
  cont.innerHTML = html;
}

/* ---------------- render: resumen ---------------- */

function renderResumen() {
  const p = estado.periodo.resumen;
  const ventas = deTienda(estado.ventas).filter((v) => enPeriodo(v.fecha, p));
  const gastos = deTienda(estado.gastos).filter((g) => enPeriodo(g.fecha, p));

  const ventasConCosto = ventas.filter(conCosto);
  const ventasSinCosto = ventas.filter((v) => !conCosto(v));

  const ingresos = ventas.reduce((s, v) => s + v.venta * v.cantidad, 0);
  const costo = ventasConCosto.reduce((s, v) => s + v.compra * v.cantidad, 0);
  const bruta = ventasConCosto.reduce((s, v) => s + (v.venta - v.compra) * v.cantidad, 0);
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const neta = bruta - totalGastos;

  const negativo = (n) => (n > 0 ? '-' : '') + money(n);
  $('#rsVentas').textContent = money(ingresos);
  $('#rsCosto').textContent = negativo(costo);
  $('#rsBruta').textContent = money(bruta);
  $('#rsGastos').textContent = negativo(totalGastos);
  const celdaNeta = $('#rsNeta');
  celdaNeta.textContent = money(neta);
  celdaNeta.classList.toggle('negativo', neta < 0);

  const vendidoSinCosto = ventasSinCosto.reduce((s, v) => s + v.venta * v.cantidad, 0);
  $('#notaResumenSinCosto').textContent = ventasSinCosto.length
    ? `Ojo: ${money(vendidoSinCosto)} de estas ventas son de productos sin precio de compra. Ese dinero sí está contado en "Ventas", pero como no se sabe qué costaron, su ganancia no entra en "Te quedaron" — la ganancia real es mayor.`
    : '';

  const top = {};
  ventas.forEach((v) => {
    if (!top[v.nombre]) top[v.nombre] = { cant: 0, total: 0 };
    top[v.nombre].cant += v.cantidad;
    top[v.nombre].total += v.venta * v.cantidad;
  });
  const orden = Object.entries(top)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8);
  $('#topProductos').innerHTML = orden.length
    ? orden
        .map(
          ([n, d]) =>
            `<div class="mini-fila"><span>${esc(n)} <small>(${nf.format(d.cant)})</small></span><b>${money(d.total)}</b></div>`
        )
        .join('')
    : '<p class="ayuda">Sin ventas en este periodo.</p>';

  const propios = deTienda(estado.productos);
  const invertido = propios
    .filter(conCosto)
    .reduce((s, x) => s + x.compra * x.unidades, 0);
  const potencial = propios
    .filter(conCosto)
    .reduce((s, x) => s + (x.venta - x.compra) * x.unidades, 0);
  $('#rsProductos').textContent = nf.format(propios.length);
  $('#rsUnidades').textContent = nf.format(propios.reduce((s, x) => s + x.unidades, 0));
  $('#rsInvertido').textContent = money(invertido);
  $('#rsPotencial').textContent = money(potencial);
}

/* ---------------- render general ---------------- */

function render() {
  aplicarTema();
  $('#nombreTienda').textContent = tiendaActual().nombre;
  renderInventario();
  renderVentas();
  renderGastos();
  renderResumen();
  renderEstadoCopia();
}

/* ---------------- tiendas ---------------- */

function renderListaTiendas() {
  $('#listaTiendas').innerHTML = estado.tiendas
    .map((t) => {
      const n = estado.productos.filter((p) => p.tiendaId === t.id).length;
      const u = estado.productos
        .filter((p) => p.tiendaId === t.id)
        .reduce((s, p) => s + p.unidades, 0);
      return `<div class="tienda-fila ${t.id === estado.tiendaActiva ? 'activa' : ''}">
        <span class="tienda-ico" style="background:${hexDeTema(t.tema)}">${esc(inicial(t.nombre))}</span>
        <button class="tienda-nombre" data-accion="usar-tienda" data-id="${t.id}">
          ${esc(t.nombre)}
          <small>${nf.format(n)} ${n === 1 ? 'producto' : 'productos'} &middot; ${nf.format(u)} ${u === 1 ? 'unidad' : 'unidades'}</small>
        </button>
        <button class="icon-btn" data-accion="renombrar-tienda" data-id="${t.id}" aria-label="Editar tienda">${ICO.lapiz}</button>
        ${estado.tiendas.length > 1 ? `<button class="icon-btn" data-accion="borrar-tienda" data-id="${t.id}" aria-label="Borrar tienda">${ICO.papelera}</button>` : ''}
      </div>`;
    })
    .join('');
}

function usarTienda(id) {
  estado.tiendaActiva = id;
  estado.categoria = ''; // cada tienda arranca mostrando todo
  $('#buscar').value = '';
  guardarPreferencias();
  render();
  cerrar('#modalTiendas');
  aviso(tiendaActual().nombre);
}

/* --- editor de tienda (nombre, ícono y color) --- */

const borrador = { tema: 'verde' };

function pintarPrevia() {
  const nombre = $('#tNombre').value.trim();
  $('#previaTienda').style.background = hexDeTema(borrador.tema);
  $('#previaIco').textContent = inicial(nombre || 'Mi tienda');
  $('#previaNombre').textContent = nombre || 'Mi tienda';
  $$('#rejillaColores button').forEach((b) =>
    b.classList.toggle('activo', b.dataset.tema === borrador.tema)
  );
}

function abrirEditorTienda(id) {
  const t = id ? estado.tiendas.find((x) => x.id === id) : null;
  $('#tituloEditarTienda').textContent = t ? 'Editar tienda' : 'Nueva tienda';
  $('#tId').value = t ? t.id : '';
  $('#tNombre').value = t ? t.nombre : '';
  $('#tPublicada').checked = t ? t.publicada : false;
  borrador.tema = t ? t.tema : TEMAS[(estado.tiendas.length + 2) % TEMAS.length].id;

  $('#rejillaColores').innerHTML = TEMAS.map(
    (x) =>
      `<button type="button" data-tema="${x.id}" style="background:${x.hex}" aria-label="${x.nombre}"></button>`
  ).join('');

  pintarPrevia();
  abrir('#modalEditarTienda');
  if (!t) setTimeout(() => $('#tNombre').focus(), 250);
}

$('#rejillaColores').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  borrador.tema = b.dataset.tema;
  pintarPrevia();
};
$('#tNombre').addEventListener('input', pintarPrevia);

$('#formTienda').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = $('#tNombre').value.trim();
  if (!nombre) return;
  if (bloqueadoSinRed()) return;
  const id = $('#tId').value;

  await intentar(async () => {
    const guardada = await DB.guardarTienda({
      id: id || null,
      nombre,
      tema: borrador.tema,
      publicada: $('#tPublicada').checked
    });
    vestirTienda(guardada, estado.tiendas.length);
    if (id) {
      Object.assign(estado.tiendas.find((x) => x.id === id), guardada);
      aviso('Tienda actualizada');
    } else {
      estado.tiendas.push(guardada);
      aviso('Tienda creada');
    }
    render();
    renderListaTiendas();
    cerrar('#modalEditarTienda');
  });
});

async function borrarTienda(id) {
  if (estado.tiendas.length <= 1) return;
  const t = estado.tiendas.find((x) => x.id === id);
  if (!t) return;
  const prods = estado.productos.filter((p) => p.tiendaId === id).length;
  const vtas = estado.ventas.filter((v) => v.tiendaId === id).length;
  const gtos = estado.gastos.filter((g) => g.tiendaId === id).length;
  if (
    !confirm(
      `¿Borrar la tienda "${t.nombre}"?\n\nSe borran también sus ${prods} producto(s), ${vtas} venta(s) y ${gtos} gasto(s).\n\nEsto no se puede deshacer.`
    )
  )
    return;
  if (bloqueadoSinRed()) return;

  await intentar(async () => {
    await DB.borrarTienda(id);
    estado.tiendas = estado.tiendas.filter((x) => x.id !== id);
    estado.productos = estado.productos.filter((p) => p.tiendaId !== id);
    estado.ventas = estado.ventas.filter((v) => v.tiendaId !== id);
    estado.gastos = estado.gastos.filter((g) => g.tiendaId !== id);
    if (estado.tiendaActiva === id) {
      estado.tiendaActiva = estado.tiendas[0].id;
      guardarPreferencias();
    }
    render();
    renderListaTiendas();
    aviso('Tienda borrada');
  });
}

$('#btnTienda').onclick = () => {
  renderListaTiendas();
  abrir('#modalTiendas');
};

$('#btnAnadirTienda').onclick = () => abrirEditorTienda();

function cambiarVista(v) {
  estado.vista = v;
  $$('.vista').forEach((s) => s.classList.add('oculto'));
  $('#vista-' + v).classList.remove('oculto');
  $$('.tab').forEach((t) => t.classList.toggle('activa', t.dataset.vista === v));
  $('#tituloVista').textContent = {
    inventario: 'Inventario',
    ventas: 'Ventas',
    gastos: 'Gastos',
    resumen: 'Resumen'
  }[v];
  $('#fab').hidden = v === 'ventas' || v === 'resumen';
  window.scrollTo(0, 0);
}

/* ---------------- modales ---------------- */

function abrir(id) {
  $(id).classList.remove('oculto');
  document.body.style.overflow = 'hidden';
}
function cerrar(id) {
  $(id).classList.add('oculto');
  // El editor de tienda se abre encima de la lista de tiendas: solo se
  // devuelve el scroll cuando ya no queda ningún modal abierto.
  if (!document.querySelector('.fondo-modal:not(.oculto)')) {
    document.body.style.overflow = '';
  }
}

$$('[data-cerrar]').forEach((b) => {
  b.onclick = () => cerrar('#' + b.closest('.fondo-modal').id);
});
$$('.fondo-modal').forEach((f) => {
  f.addEventListener('click', (e) => {
    if (e.target === f) cerrar('#' + f.id);
  });
});

/* ---------------- producto: crear / editar ---------------- */

function abrirProducto(id) {
  const p = id ? estado.productos.find((x) => x.id === id) : null;
  $('#tituloProducto').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('#pId').value = p ? p.id : '';
  $('#pNombre').value = p ? p.nombre : '';
  $('#pCompra').value = p && conCosto(p) ? p.compra : '';
  $('#pVenta').value = p ? p.venta : '';
  $('#pUnidades').value = p ? p.unidades : 1;
  $('#pMinimo').value = p ? (p.minimo ?? 1) : 1;
  $('#pTienda').innerHTML = estado.tiendas
    .map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`)
    .join('');
  $('#pTienda').value = p ? p.tiendaId : estado.tiendaActiva;
  // Sugiere las categorías que ya existen (de todas las tiendas, para reutilizarlas).
  $('#categoriasProducto').innerHTML = [
    ...new Set(estado.productos.map((x) => (x.categoria || '').trim()).filter(Boolean))
  ]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((c) => `<option value="${esc(c)}">`)
    .join('');
  // Al crear un producto con un filtro activo, esa categoría viene puesta.
  const sugerida =
    estado.categoria && estado.categoria !== SIN_CATEGORIA ? estado.categoria : '';
  $('#pCategoria').value = p ? p.categoria || '' : sugerida;
  // Sugiere los tonos que ya usaste, para escribirlos igual siempre.
  $('#tonosProducto').innerHTML = [
    ...new Set(estado.productos.map((x) => (x.tono || '').trim()).filter(Boolean))
  ]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((t) => `<option value="${esc(t)}">`)
    .join('');

  // Un producto con tonos se edita entero: se cargan todos sus tonos.
  grupoOriginal = grupoDe(p);
  const conTonos = grupoOriginal.length > 1 || (!!p && (p.tono || '').trim() !== '');
  $('#pTieneTonos').checked = conTonos;
  tonosBorrador.length = 0;
  if (conTonos) {
    grupoOriginal.forEach((x) =>
      tonosBorrador.push({ id: x.id, tono: x.tono, unidades: x.unidades, foto: x.fotoTono || '' })
    );
  } else {
    tonosBorrador.push({ id: p ? p.id : null, tono: '', unidades: p ? p.unidades : 1 });
  }
  $('#pMinimo2').value = $('#pMinimo').value;
  aplicarModoTonos();

  $('#pNotas').value = p ? p.notas || '' : '';
  $('#pDescripcion').value = p ? p.descripcion || '' : '';
  $('#pPublicado').checked = p ? p.publicado : false;

  // Las fotos se editan en un borrador: las nuevas no se suben hasta
  // que el producto exista y se guarde.
  fotosBorrador.guardadas = p ? [...p.fotos] : [];
  fotosBorrador.nuevas = [];
  renderFotos();
  avisoPublicado();

  $('#btnBorrarProducto').hidden = !p;
  actualizarGananciaProducto();
  abrir('#modalProducto');
  if (!p) setTimeout(() => $('#pNombre').focus(), 250);
}

/* ---------------- tonos del producto ---------------- */

/* Por dentro cada tono es una fila propia —por eso vender uno descuenta
   solo ese—, pero aquí se editan todos juntos dentro del mismo producto. */

let grupoOriginal = []; // los tonos que existían al abrir la ficha
const tonosBorrador = [];

/** Todos los tonos del mismo producto: misma tienda y mismo nombre. */
function grupoDe(p) {
  if (!p) return [];
  if (!(p.tono || '').trim()) return [p];
  const clave = p.nombre.trim().toLocaleLowerCase('es');
  return estado.productos.filter(
    (x) =>
      x.tiendaId === p.tiendaId &&
      x.nombre.trim().toLocaleLowerCase('es') === clave &&
      (x.tono || '').trim() !== ''
  );
}

function aplicarModoTonos() {
  const con = $('#pTieneTonos').checked;
  $('#filaUnidades').hidden = con;
  $('#bloqueMinimo').hidden = !con;
  $('#bloqueTonos').hidden = !con;
  if (con) renderTonos();
}

function resumenTonos() {
  const total = tonosBorrador.reduce((n, t) => n + (Number(t.unidades) || 0), 0);
  $('#resumenTonos').textContent = `${tonosBorrador.length} ${
    tonosBorrador.length === 1 ? 'tono' : 'tonos'
  }, ${nf.format(total)} ${total === 1 ? 'unidad' : 'unidades'} en total.`;
}

function renderTonos() {
  if (!tonosBorrador.length) tonosBorrador.push({ id: null, tono: '', unidades: 1 });
  $('#listaTonos').innerHTML = tonosBorrador
    .map(
      (t, i) => `
      <div class="tono-fila">
        ${cuadroFotoTono(t, i)}
        <input type="text" class="tono-nombre" data-i="${i}" list="tonosProducto"
               value="${esc(t.tono)}" placeholder="Nombre del tono" autocomplete="off"
               aria-label="Nombre del tono">
        <input type="number" class="tono-uds" data-i="${i}" min="0" step="1"
               value="${t.unidades}" inputmode="numeric" aria-label="Unidades de este tono">
        <button type="button" class="tono-quitar" data-i="${i}" aria-label="Quitar este tono">${ICO.equis}</button>
      </div>`
    )
    .join('');
  resumenTonos();
}

/** El cuadrito de la foto del tono: la foto si tiene, una cámara si no. */
function cuadroFotoTono(t, i) {
  const src = t.fotoNueva ? t.fotoNueva.previa : t.foto ? DB.urlFoto(t.foto) : '';
  if (!src) {
    return `<button type="button" class="tono-foto" data-i="${i}" aria-label="Añadir foto de este tono">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.2" r="3.2"/></svg>
    </button>`;
  }
  return `<div class="tono-foto con-foto">
    <button type="button" class="tono-foto-ver" data-i="${i}" aria-label="Cambiar foto de este tono"><img src="${esc(src)}" alt=""></button>
    <button type="button" class="tono-foto-quitar" data-i="${i}" aria-label="Quitar foto de este tono">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m6 6 12 12"/><path d="M18 6 6 18"/></svg>
    </button>
  </div>`;
}

let tonoFotoPendiente = null; // a qué fila va la foto que se está eligiendo

$('#archivoFotoTono').addEventListener('change', (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  const t = tonosBorrador[tonoFotoPendiente];
  tonoFotoPendiente = null;
  if (!archivo || !t) return;
  if (!/^image\//.test(archivo.type)) {
    aviso('Ese archivo no es una imagen.');
    return;
  }
  if (archivo.size > 5 * 1024 * 1024) {
    aviso('Esa foto pesa más de 5 MB. Usa una más liviana.');
    return;
  }
  if (t.fotoNueva) URL.revokeObjectURL(t.fotoNueva.previa);
  t.fotoNueva = { archivo, previa: URL.createObjectURL(archivo) };
  renderTonos();
});

/* Al escribir no se vuelve a dibujar la lista: se perdería el cursor. */
$('#listaTonos').addEventListener('input', (e) => {
  const i = Number(e.target.dataset.i);
  if (!tonosBorrador[i]) return;
  if (e.target.classList.contains('tono-nombre')) tonosBorrador[i].tono = e.target.value;
  else if (e.target.classList.contains('tono-uds'))
    tonosBorrador[i].unidades = Math.max(0, Math.round(parseNum(e.target.value)));
  resumenTonos();
});

$('#listaTonos').addEventListener('click', (e) => {
  const elegir = e.target.closest('.tono-foto:not(.con-foto), .tono-foto-ver');
  if (elegir) {
    tonoFotoPendiente = Number(elegir.dataset.i);
    $('#archivoFotoTono').click();
    return;
  }
  const quitarFoto = e.target.closest('.tono-foto-quitar');
  if (quitarFoto) {
    const t = tonosBorrador[Number(quitarFoto.dataset.i)];
    if (t.fotoNueva) URL.revokeObjectURL(t.fotoNueva.previa);
    t.fotoNueva = null;
    t.foto = '';
    renderTonos();
    return;
  }
  const b = e.target.closest('.tono-quitar');
  if (!b) return;
  if (tonosBorrador.length <= 1) {
    aviso('Tiene que quedar al menos un tono');
    return;
  }
  tonosBorrador.splice(Number(b.dataset.i), 1);
  renderTonos();
});

$('#btnAnadirTono').onclick = () => {
  tonosBorrador.push({ id: null, tono: '', unidades: 1 });
  renderTonos();
  setTimeout(() => {
    const campos = $$('#listaTonos .tono-nombre');
    if (campos.length) campos[campos.length - 1].focus();
  }, 60);
};

$('#pTieneTonos').addEventListener('change', () => {
  if ($('#pTieneTonos').checked && tonosBorrador.length === 1 && !tonosBorrador[0].tono) {
    // Las unidades que ya había pasan al primer tono, para no perderlas.
    tonosBorrador[0].unidades = Math.max(0, Math.round(parseNum($('#pUnidades').value)));
  }
  if (!$('#pTieneTonos').checked && tonosBorrador.length) {
    $('#pUnidades').value = tonosBorrador.reduce((n, t) => n + (Number(t.unidades) || 0), 0);
  }
  aplicarModoTonos();
});

/* ---------------- fotos del producto ---------------- */

const fotosBorrador = { guardadas: [], nuevas: [] };

/** Avisa si el producto no se verá aunque esté marcado, porque su tienda está apagada. */
function avisoPublicado() {
  const el = $('#pPublicadoAyuda');
  const t = tiendaPorId($('#pTienda').value);
  if ($('#pPublicado').checked && t && !t.publicada) {
    el.textContent = `No se verá: la tienda ${t.nombre} todavía no está en el catálogo.`;
    el.className = 'ayuda alerta';
  } else {
    el.textContent = 'Se verá su nombre, su precio de venta y sus fotos. Nunca el precio de compra.';
    el.className = 'ayuda';
  }
}

function renderFotos() {
  const guardadas = fotosBorrador.guardadas.map((ruta, i) => ({
    clave: 'g' + i,
    src: DB.urlFoto(ruta),
    tipo: 'guardada',
    i
  }));
  const nuevas = fotosBorrador.nuevas.map((f, i) => ({
    clave: 'n' + i,
    src: f.previa,
    tipo: 'nueva',
    i
  }));
  $('#pFotos').innerHTML = [...guardadas, ...nuevas]
    .map(
      (f, pos) => `
      <div class="foto-mini ${pos === 0 ? 'primera' : ''}">
        <img src="${esc(f.src)}" alt="">
        <button type="button" class="quitar" data-foto="${f.tipo}" data-i="${f.i}" aria-label="Quitar foto">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m6 6 12 12"/><path d="M18 6 6 18"/></svg>
        </button>
      </div>`
    )
    .join('');
}

$('#btnAnadirFoto').onclick = () => $('#archivoFoto').click();

$('#archivoFoto').addEventListener('change', (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  if (!/^image\//.test(archivo.type)) {
    aviso('Ese archivo no es una imagen.');
    return;
  }
  if (archivo.size > 5 * 1024 * 1024) {
    aviso('Esa foto pesa más de 5 MB. Usa una más liviana.');
    return;
  }
  fotosBorrador.nuevas.push({ archivo, previa: URL.createObjectURL(archivo) });
  renderFotos();
});

$('#pFotos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-foto]');
  if (!b) return;
  const i = Number(b.dataset.i);
  if (b.dataset.foto === 'guardada') fotosBorrador.guardadas.splice(i, 1);
  else {
    URL.revokeObjectURL(fotosBorrador.nuevas[i].previa);
    fotosBorrador.nuevas.splice(i, 1);
  }
  renderFotos();
});

$('#pPublicado').addEventListener('change', avisoPublicado);
$('#pTienda').addEventListener('change', avisoPublicado);

function actualizarGananciaProducto() {
  const compra = parseNumOpcional($('#pCompra').value);
  const venta = parseNum($('#pVenta').value);
  const el = $('#avisoGanancia');

  if (compra === null) {
    el.classList.remove('mal');
    el.innerHTML = venta
      ? 'Sin precio de compra: solo suma al total de venta'
      : 'Si no sabes en cuánto lo compraste, deja ese campo vacío';
    return;
  }

  const g = venta - compra;
  el.classList.toggle('mal', g < 0);
  if (!compra && !venta) {
    el.innerHTML = 'Escribe los dos precios para ver tu ganancia';
  } else if (g < 0) {
    el.innerHTML = `Cuidado: pierdes <strong>${money(-g)}</strong> por unidad`;
  } else {
    const pct = compra > 0 ? Math.round((g / compra) * 100) : 0;
    el.innerHTML = `Ganas <strong>${money(g)}</strong> por unidad${compra > 0 ? ` (${pct}%)` : ''}`;
  }
}
$('#pCompra').addEventListener('input', actualizarGananciaProducto);
$('#pVenta').addEventListener('input', actualizarGananciaProducto);

$('#formProducto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#pId').value;
  const conTonos = $('#pTieneTonos').checked;
  const datos = {
    nombre: $('#pNombre').value.trim(),
    compra: parseNumOpcional($('#pCompra').value),
    venta: parseNum($('#pVenta').value),
    minimo: Math.max(0, Math.round(parseNum($(conTonos ? '#pMinimo2' : '#pMinimo').value))),
    tiendaId: $('#pTienda').value,
    categoria: $('#pCategoria').value.trim(),
    notas: $('#pNotas').value.trim(),
    descripcion: $('#pDescripcion').value.trim()
  };
  if (!datos.nombre) return;

  // Cada tono se guarda como una fila propia; sin tonos, una sola fila.
  let filas;
  if (conTonos) {
    filas = tonosBorrador
      .map((t) => ({
        id: t.id,
        tono: (t.tono || '').trim(),
        unidades: Math.max(0, Math.round(Number(t.unidades) || 0)),
        foto: t.foto || '',
        fotoNueva: t.fotoNueva || null
      }))
      .filter((t) => t.tono !== '');
    if (!filas.length) {
      aviso('Ponle nombre a por lo menos un tono');
      return;
    }
    const vistos = new Set();
    for (const f of filas) {
      const clave = f.tono.toLocaleLowerCase('es');
      if (vistos.has(clave)) {
        aviso(`El tono "${f.tono}" está repetido`);
        return;
      }
      vistos.add(clave);
    }
  } else {
    filas = [
      {
        id: grupoOriginal.length ? grupoOriginal[0].id : id || null,
        tono: '',
        unidades: Math.max(0, Math.round(parseNum($('#pUnidades').value)))
      }
    ];
  }

  // Los tonos que estaban y ya no: se borran, avisando de lo que se pierde.
  const sobran = grupoOriginal.filter((g) => !filas.some((f) => f.id === g.id));
  if (sobran.length) {
    const lista = sobran.map((x) => `${x.tono || x.nombre} (${x.unidades} uds)`).join(', ');
    if (
      !confirm(
        `Se van a borrar del inventario: ${lista}.

Sus unidades desaparecen. Las ventas que ya registraste no se borran.

¿Continuar?`
      )
    )
      return;
  }
  if (bloqueadoSinRed()) return;

  const publicado = $('#pPublicado').checked;

  await intentar(async () => {
    const guardados = [];
    for (const f of filas) {
      const g = await DB.guardarProducto({ id: f.id || null, ...datos, tono: f.tono, unidades: f.unidades });

      // La foto propia de cada tono. Sin tonos no aplica: se limpia si quedó.
      let foto = conTonos ? f.foto : '';
      if (conTonos && f.fotoNueva) {
        aviso(`Subiendo la foto de ${f.tono}…`);
        foto = await DB.subirFoto(g.id, f.fotoNueva.archivo);
        URL.revokeObjectURL(f.fotoNueva.previa);
      }
      if (foto !== (g.fotoTono || '')) g.fotoTono = await DB.guardarFotoTono(g.id, foto);

      guardados.push(g);
    }

    // Las fotos se suben una vez y quedan en todos los tonos.
    if (fotosBorrador.nuevas.length) {
      aviso(fotosBorrador.nuevas.length === 1 ? 'Subiendo la foto…' : 'Subiendo las fotos…');
      for (const f of fotosBorrador.nuevas) {
        fotosBorrador.guardadas.push(await DB.subirFoto(guardados[0].id, f.archivo));
        URL.revokeObjectURL(f.previa);
      }
      fotosBorrador.nuevas = [];
    }
    for (const g of guardados) {
      const mismas =
        g.fotos.length === fotosBorrador.guardadas.length &&
        g.fotos.every((r, i) => r === fotosBorrador.guardadas[i]);
      if (!mismas) g.fotos = await DB.guardarFotos(g.id, fotosBorrador.guardadas);
      if (publicado !== g.publicado) g.publicado = await DB.publicarProducto(g.id, publicado);
    }

    for (const x of sobran) await DB.borrarProducto(x.id);

    // Reflejar en pantalla lo que quedó guardado.
    const borrados = new Set(sobran.map((x) => x.id));
    estado.productos = estado.productos.filter((x) => !borrados.has(x.id));
    estado.ventas.forEach((v) => {
      if (borrados.has(v.productoId)) v.productoId = null;
    });
    guardados.forEach((g) => {
      const i = estado.productos.findIndex((x) => x.id === g.id);
      if (i >= 0) estado.productos[i] = { ...estado.productos[i], ...g };
      else estado.productos.push(g);
    });

    const movido = grupoOriginal.length && grupoOriginal[0].tiendaId !== datos.tiendaId;
    render();
    cerrar('#modalProducto');
    aviso(
      movido
        ? 'Movido a ' + tiendaPorId(datos.tiendaId).nombre
        : grupoOriginal.length
        ? 'Producto actualizado'
        : 'Producto guardado'
    );
  });
});

$('#btnBorrarProducto').onclick = async () => {
  const id = $('#pId').value;
  const p = estado.productos.find((x) => x.id === id);
  if (!p) return;
  // Un producto con tonos se borra entero: sus tonos no son productos sueltos.
  const aBorrar = grupoDe(p);
  const detalle = aBorrar.length > 1 ? `

Se borran sus ${aBorrar.length} tonos.` : '';
  if (
    !confirm(
      `¿Borrar "${p.nombre}" del inventario?${detalle}

Las ventas que ya registraste no se borran.`
    )
  )
    return;
  if (bloqueadoSinRed()) return;

  await intentar(async () => {
    for (const x of aBorrar) await DB.borrarProducto(x.id);
    const borrados = new Set(aBorrar.map((x) => x.id));
    estado.productos = estado.productos.filter((x) => !borrados.has(x.id));
    // La venta conserva su historial, pero ya no apunta a un producto.
    estado.ventas.forEach((v) => {
      if (borrados.has(v.productoId)) v.productoId = null;
    });
    render();
    cerrar('#modalProducto');
    aviso(aBorrar.length > 1 ? 'Producto y sus tonos borrados' : 'Producto borrado');
  });
};

/* ---------------- venta ---------------- */

function abrirVenta(id) {
  const p = estado.productos.find((x) => x.id === id);
  if (!p || p.unidades === 0) return;
  $('#vProductoId').value = p.id;
  $('#vNombre').textContent = p.nombre;
  $('#vCantidad').value = 1;
  $('#vCantidad').max = p.unidades;
  $('#vPrecio').value = p.venta;
  $('#vDisponible').textContent = `Tienes ${nf.format(p.unidades)} ${p.unidades === 1 ? 'unidad' : 'unidades'}`;
  actualizarResumenVenta();
  abrir('#modalVenta');
}

function actualizarResumenVenta() {
  const p = estado.productos.find((x) => x.id === $('#vProductoId').value);
  if (!p) return;
  let cant = Math.round(parseNum($('#vCantidad').value));
  cant = Math.min(Math.max(1, cant || 1), p.unidades);
  const precio = parseNum($('#vPrecio').value);
  $('#vTotal').textContent = money(precio * cant);
  $('#vGanancia').textContent = conCosto(p)
    ? money((precio - p.compra) * cant)
    : 'sin precio de compra';
}

$$('.paso').forEach((b) => {
  b.onclick = () => {
    const input = $('#vCantidad');
    const max = parseInt(input.max, 10) || 1;
    let v = Math.round(parseNum(input.value)) + parseInt(b.dataset.paso, 10);
    input.value = Math.min(Math.max(1, v), max);
    actualizarResumenVenta();
  };
});
$('#vCantidad').addEventListener('input', actualizarResumenVenta);
$('#vPrecio').addEventListener('input', actualizarResumenVenta);

$('#formVenta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = estado.productos.find((x) => x.id === $('#vProductoId').value);
  if (!p) return;
  let cant = Math.round(parseNum($('#vCantidad').value));
  cant = Math.min(Math.max(1, cant || 1), p.unidades);
  const precio = parseNum($('#vPrecio').value);
  if (bloqueadoSinRed()) return;

  // El servidor registra la venta y descuenta las unidades en un solo paso:
  // si esto falla, no queda ni la venta ni el descuento a medias.
  await intentar(async () => {
    const venta = await DB.registrarVenta(p.id, cant, precio);
    estado.ventas.push(venta);
    p.unidades -= cant;
    render();
    cerrar('#modalVenta');
    aviso(
      conCosto(venta)
        ? `Vendido. Ganaste ${money((precio - venta.compra) * cant)}`
        : `Vendido por ${money(precio * cant)}`
    );
  });
});

async function borrarVenta(id) {
  const v = estado.ventas.find((x) => x.id === id);
  if (!v) return;
  if (!confirm(`¿Anular esta venta de "${v.nombre}"?\n\nLas ${v.cantidad} unidad(es) vuelven al inventario.`)) return;
  if (bloqueadoSinRed()) return;

  await intentar(async () => {
    await DB.anularVenta(id);
    const p = estado.productos.find((x) => x.id === v.productoId);
    if (p) p.unidades += v.cantidad;
    estado.ventas = estado.ventas.filter((x) => x.id !== id);
    render();
    aviso('Venta anulada');
  });
}

/* ---------------- gasto ---------------- */

function abrirGasto(id) {
  const g = id ? estado.gastos.find((x) => x.id === id) : null;
  $('#tituloGasto').textContent = g ? 'Editar gasto' : 'Nuevo gasto';
  $('#gId').value = g ? g.id : '';
  $('#gMonto').value = g ? g.monto : '';
  $('#gCategoria').value = g ? g.categoria : 'Mercancía';
  $('#gDescripcion').value = g ? g.descripcion || '' : '';
  $('#gFecha').value = g ? g.fecha : hoyISO();
  $('#gProveedor').value = g ? g.proveedor || '' : '';
  $('#btnBorrarGasto').hidden = !g;
  abrir('#modalGasto');
  if (!g) setTimeout(() => $('#gMonto').focus(), 250);
}

$('#formGasto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#gId').value;
  const datos = {
    monto: parseNum($('#gMonto').value),
    categoria: $('#gCategoria').value,
    descripcion: $('#gDescripcion').value.trim(),
    fecha: $('#gFecha').value || hoyISO(),
    proveedor: $('#gProveedor').value.trim()
  };
  if (!datos.monto) {
    aviso('Escribe el valor del gasto');
    return;
  }
  if (bloqueadoSinRed()) return;

  await intentar(async () => {
    const guardado = await DB.guardarGasto({
      id: id || null,
      tiendaId: id ? estado.gastos.find((x) => x.id === id).tiendaId : estado.tiendaActiva,
      ...datos
    });
    if (id) {
      Object.assign(estado.gastos.find((x) => x.id === id), guardado);
      aviso('Gasto actualizado');
    } else {
      estado.gastos.push(guardado);
      aviso('Gasto guardado');
    }
    render();
    cerrar('#modalGasto');
  });
});

$('#btnBorrarGasto').onclick = async () => {
  const id = $('#gId').value;
  if (!confirm('¿Borrar este gasto?')) return;
  if (bloqueadoSinRed()) return;

  await intentar(async () => {
    await DB.borrarGasto(id);
    estado.gastos = estado.gastos.filter((x) => x.id !== id);
    render();
    cerrar('#modalGasto');
    aviso('Gasto borrado');
  });
};

/* ---------------- clicks de las listas ---------------- */

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.accion) {
    case 'vender':
      abrirVenta(id);
      break;
    case 'editar':
      abrirProducto(id);
      break;
    case 'sumar': {
      const p = estado.productos.find((x) => x.id === id);
      if (!p || bloqueadoSinRed()) break;
      await intentar(async () => {
        p.unidades = await DB.ajustarUnidades(p.id, p.unidades + 1);
        render();
        aviso(`${p.nombre}: ${p.unidades} unidades`);
      });
      break;
    }
    case 'borrar-venta':
      borrarVenta(id);
      break;
    case 'editar-gasto':
      abrirGasto(id);
      break;
    case 'usar-tienda':
      usarTienda(id);
      break;
    case 'renombrar-tienda':
      abrirEditorTienda(id);
      break;
    case 'borrar-tienda':
      borrarTienda(id);
      break;
    case 'filtrar-cat':
      estado.categoria = b.dataset.cat;
      renderInventario();
      break;
  }
});

/* ---------------- navegación ---------------- */

$$('.tab').forEach((t) => {
  t.onclick = () => cambiarVista(t.dataset.vista);
});

$('#fab').onclick = () => {
  if (estado.vista === 'gastos') abrirGasto();
  else abrirProducto();
};

$('#buscar').addEventListener('input', renderInventario);
$('#orden').addEventListener('change', renderInventario);
$('#btnMenu').onclick = () => abrir('#modalMenu');

/* ---------------- copia de seguridad ---------------- */

const CLAVE_COPIA = 'cuentas-claras-ultima-copia';

/** Le pide al navegador que NO borre estos datos si el celular necesita espacio. */
async function pedirAlmacenamientoPersistente() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const yaEs = await navigator.storage.persisted();
      if (!yaEs) await navigator.storage.persist();
    }
  } catch (e) {
    /* si el navegador no lo soporta, seguimos igual */
  }
}

function renderEstadoCopia() {
  const el = $('#estadoCopia');
  if (!el) return;
  const hay = estado.productos.length || estado.ventas.length || estado.gastos.length;
  const ultima = localStorage.getItem(CLAVE_COPIA);
  if (!hay) {
    el.textContent = '';
    el.className = 'ayuda';
    return;
  }
  if (!ultima) {
    el.textContent = 'Todavía no has guardado ninguna copia.';
    el.className = 'ayuda alerta';
    return;
  }
  const dias = Math.floor((Date.now() - new Date(ultima).getTime()) / 86400000);
  const txt =
    dias === 0 ? 'Última copia: hoy' : dias === 1 ? 'Última copia: ayer' : `Última copia: hace ${dias} días`;
  el.textContent = txt;
  el.className = dias >= 7 ? 'ayuda alerta' : 'ayuda';
}

function exportar() {
  const datos = {
    app: 'Cuentas Claras',
    v: 2,
    exportado: new Date().toISOString(),
    tiendas: estado.tiendas,
    productos: estado.productos,
    ventas: estado.ventas,
    gastos: estado.gastos
  };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cuentas-claras-${hoyISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  localStorage.setItem(CLAVE_COPIA, new Date().toISOString());
  renderEstadoCopia();
  aviso('Copia descargada');
}

$('#archivoImportar').addEventListener('change', (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = async () => {
    let d;
    try {
      d = JSON.parse(lector.result);
      if (!Array.isArray(d.productos) || !Array.isArray(d.tiendas)) throw new Error('formato');
    } catch (err) {
      alert('Ese archivo no es una copia válida de Cuentas Claras.');
      return;
    }
    if (
      !confirm(
        'Esto reemplaza TODO lo que hay en la nube por el contenido de la copia, en todos tus dispositivos.\n\n¿Continuar?'
      )
    )
      return;
    if (bloqueadoSinRed()) return;

    await intentar(async () => {
      await DB.restaurar(d);
      recibir(await DB.cargarTodo());
      render();
      cerrar('#modalMenu');
      aviso('Copia restaurada');
    });
  };
  lector.readAsText(archivo);
  e.target.value = '';
});

$('#btnExportar').onclick = exportar;
$('#btnExportar2').onclick = exportar;
$('#btnImportar').onclick = () => $('#archivoImportar').click();
$('#btnImportar2').onclick = () => $('#archivoImportar').click();

$('#btnBorrarTodo').onclick = async () => {
  if (!confirm('¿Borrar TODO: productos, ventas y gastos?\n\nEsto no se puede deshacer.')) return;
  if (!confirm('De verdad, ¿borrar todo? Guarda una copia antes si no estás seguro.')) return;
  if (bloqueadoSinRed()) return;

  await intentar(async () => {
    await DB.borrarTodo();
    estado.productos = [];
    estado.ventas = [];
    estado.gastos = [];
    localStorage.removeItem(CLAVE_COPIA);
    render();
    cerrar('#modalMenu');
    aviso('Todo borrado');
  });
};

/* ---------------- tienda pública ---------------- */

const catalogo = { nombre: '', whatsapp: '', saludo: '', tema: 'dorado' };

/** Cuenta lo que el cliente vería ahora mismo, para que no haya sorpresas. */
function renderEstadoPublica() {
  const tiendas = estado.tiendas.filter((t) => t.publicada);
  const ids = new Set(tiendas.map((t) => t.id));
  const n = estado.productos.filter((p) => p.publicado && ids.has(p.tiendaId)).length;
  const el = $('#estadoPublica');
  if (!n) {
    el.textContent = 'Ahora mismo el catálogo está vacío: marca tiendas y productos para que se vean.';
    el.className = 'ayuda centro alerta';
  } else {
    el.textContent = `Ahora mismo se ven ${n} producto${n === 1 ? '' : 's'} de ${tiendas
      .map((t) => t.nombre)
      .join(' y ')}.`;
    el.className = 'ayuda centro';
  }
}

$('#btnTiendaPublica').onclick = async () => {
  if (bloqueadoSinRed()) return;
  await intentar(async () => {
    Object.assign(catalogo, await DB.leerCatalogo());
    $('#cNombre').value = catalogo.nombre;
    $('#cWhatsapp').value = catalogo.whatsapp;
    $('#cSaludo').value = catalogo.saludo;
    $('#coloresCatalogo').innerHTML = TEMAS.map(
      (x) =>
        `<button type="button" data-tema="${x.id}" style="background:${x.hex}" aria-label="${x.nombre}" class="${
          x.id === catalogo.tema ? 'activo' : ''
        }"></button>`
    ).join('');
    renderEstadoPublica();
    cerrar('#modalMenu');
    abrir('#modalPublica');
  });
};

$('#coloresCatalogo').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  catalogo.tema = b.dataset.tema;
  $$('#coloresCatalogo button').forEach((x) =>
    x.classList.toggle('activo', x.dataset.tema === catalogo.tema)
  );
};

$('#formPublica').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (bloqueadoSinRed()) return;
  await intentar(async () => {
    Object.assign(
      catalogo,
      await DB.guardarCatalogo({
        nombre: $('#cNombre').value.trim() || 'Mi tienda',
        whatsapp: $('#cWhatsapp').value.trim(),
        saludo: $('#cSaludo').value.trim() || 'Hola, quiero pedir:',
        tema: catalogo.tema
      })
    );
    renderEstadoPublica();
    aviso('Tienda pública actualizada');
  });
});

/* ---------------- sesión ---------------- */

const pantalla = (cual) => {
  $('#pantallaEntrar').hidden = cual !== 'entrar';
  $('#cargando').hidden = cual !== 'cargando';
  document.body.classList.toggle('con-sesion', cual === 'app');
};

function mensajeEntrar(texto, mal = true) {
  const el = $('#entrarAviso');
  el.textContent = texto || '';
  el.classList.toggle('mal', !!texto && mal);
}

/** Muestra si lo que se está viendo salió del servidor o de la última copia. */
function renderEstadoConexion() {
  const el = $('#barraSinRed');
  if (!el) return;
  el.hidden = !estado.soloLectura;
  if (!estado.soloLectura) return;
  if (!estado.visto) {
    el.textContent = 'Sin internet. Estás viendo la última copia guardada.';
    return;
  }
  // "hoy a las 11:24 a. m." — sin punto final, porque "a. m." ya lo lleva.
  const dia = fechaLarga(estado.visto).toLocaleLowerCase('es');
  const h = hora(estado.visto);
  el.textContent = `Sin internet. Estás viendo lo guardado ${dia}${h ? ' a las ' + h : ''}`;
}

/** Trae los datos y pinta la app. Si no hay red, muestra la última copia. */
async function abrirPanel() {
  pantalla('cargando');
  try {
    recibir(await DB.cargarTodoOCache());
  } catch (e) {
    pantalla('entrar');
    mensajeEntrar(e.message);
    return;
  }
  pantalla('app');
  renderEstadoConexion();
  render();
  renderEstadoCopia();
}

$('#formEntrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('#btnEntrar');
  mensajeEntrar('');
  boton.disabled = true;
  try {
    await DB.entrar($('#eCorreo').value.trim(), $('#eClave').value);
    if (!(await DB.soyAdmin())) {
      await DB.salir();
      mensajeEntrar('Esa cuenta existe, pero no está autorizada para administrar.');
      return;
    }
    $('#eClave').value = '';
    await abrirPanel();
  } catch (err) {
    mensajeEntrar(err.message);
  } finally {
    boton.disabled = false;
  }
});

$('#btnSalir').onclick = async () => {
  if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
  await DB.salir();
  estado.tiendas = [];
  estado.productos = [];
  estado.ventas = [];
  estado.gastos = [];
  cerrar('#modalMenu');
  pantalla('entrar');
};

/* Al recuperar la conexión, vuelve a traer los datos del servidor. */
window.addEventListener('online', async () => {
  if (!estado.soloLectura) return;
  if (!(await DB.sesion())) return;
  await abrirPanel();
  aviso('Conectado otra vez');
});

window.addEventListener('offline', () => {
  estado.soloLectura = true;
  renderEstadoConexion();
});

/* ---------------- arranque ---------------- */

async function arrancar() {
  estado.tiendaActiva = leerPreferencias().tiendaActiva || null;
  pintarPeriodos();
  cambiarVista('inventario');
  pedirAlmacenamientoPersistente();

  if (!DB.configurado) {
    pantalla('entrar');
    mensajeEntrar('Falta completar supabase-config.js con la dirección y la clave pública.');
    $('#formEntrar').hidden = true;
    return;
  }

  // Sin internet no se puede comprobar la sesión contra el servidor, pero
  // la sesión guardada y la última copia vista bastan para poder mirar.
  if (await DB.sesion()) await abrirPanel();
  else pantalla('entrar');
}

arrancar();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
