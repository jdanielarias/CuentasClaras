/* ============================================================
   Catálogo público

   Lee lo que está publicado y arma un pedido que se envía por
   WhatsApp. No inicia sesión ni guarda ninguna: usa su propia
   conexión anónima para no tocar la sesión del panel, que puede
   estar abierta en el mismo navegador.

   Lo que se ve aquí es exactamente lo que las políticas de la base
   de datos dejan ver a un desconocido. Los precios de compra, las
   notas y las ventas no llegan siquiera al navegador.
   ============================================================ */

(() => {
  const cfg = window.CUENTAS_CLARAS_SUPABASE;
  const $ = (s) => document.querySelector(s);

  const cliente = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  const money = (n) => '$' + nf.format(Math.round(Number(n) || 0));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  /* Cuando quedan estas o menos, se avisa sin decir cuántas quedan. */
  const POCAS = 3;
  const CLAVE_PEDIDO = 'cuentas-claras-pedido';

  const estado = {
    catalogo: null,
    productos: [],
    categoria: '',
    busqueda: '',
    pedido: {},
    grupos: [],
    abierto: null, // clave del grupo abierto
    variante: null, // id del tono elegido dentro de ese grupo
    foto: 0 // cuál de las fotos se está mirando
  };

  /* ---------------- el pedido, guardado en este navegador ---------------- */

  function leerPedido() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE_PEDIDO) || '{}');
      return d && typeof d === 'object' ? d : {};
    } catch (e) {
      return {};
    }
  }

  function guardarPedido() {
    try {
      localStorage.setItem(CLAVE_PEDIDO, JSON.stringify(estado.pedido));
    } catch (e) {
      /* si el navegador no deja, el pedido dura lo que dure la visita */
    }
  }

  const enPedido = (id) => estado.pedido[id] || 0;

  /** Nunca se puede pedir más de lo que hay, ni de lo que ya no existe. */
  function ajustarPedido() {
    const porId = new Map(estado.productos.map((p) => [p.id, p]));
    Object.keys(estado.pedido).forEach((id) => {
      const p = porId.get(id);
      const tope = p ? p.unidades : 0;
      const cant = Math.min(estado.pedido[id], tope);
      if (cant > 0) estado.pedido[id] = cant;
      else delete estado.pedido[id];
    });
    guardarPedido();
  }

  /** El nombre tal como debe leerlo el cliente: con su tono si lo tiene. */
  const etiqueta = (p) =>
    p.nombre + ((p.tono || '').trim() ? ' · ' + p.tono.trim() : '');

  const lineasPedido = () =>
    estado.productos
      .filter((p) => enPedido(p.id) > 0)
      .map((p) => ({
        ...p,
        etiqueta: etiqueta(p),
        cantidad: enPedido(p.id),
        subtotal: p.venta * enPedido(p.id)
      }));

  const totalPedido = () => lineasPedido().reduce((s, l) => s + l.subtotal, 0);
  const piezasPedido = () => lineasPedido().reduce((s, l) => s + l.cantidad, 0);

  /* ---------------- dibujar ---------------- */

  const inicial = (nombre) => {
    const n = (nombre || '').trim();
    return n ? n[0].toLocaleUpperCase('es') : '·';
  };

  /** La foto del producto, o una lámina con su monograma si no tiene. */
  function lamina(p, clase = '', indice = 0) {
    const foto = p.fotos && p.fotos.length ? urlFoto(p.fotos[indice] || p.fotos[0]) : '';
    const dentro = foto
      ? `<img src="${esc(foto)}" alt="${esc(p.nombre)}" loading="lazy">`
      : `<span class="lamina-mono" aria-hidden="true">${esc(inicial(p.nombre))}</span>`;
    return `<div class="lamina ${clase}">${dentro}</div>`;
  }

  /** Todas las fotos del producto: la grande y, debajo, las demás en fila. */
  function galeria(p) {
    if (p.fotos.length <= 1) return lamina(p, 'ficha-lamina');
    const i = Math.min(estado.foto, p.fotos.length - 1);
    const tiras = p.fotos
      .map(
        (ruta, n) => `
        <button class="tira ${n === i ? 'activa' : ''}" data-foto="${n}" aria-label="Foto ${n + 1}">
          <img src="${esc(urlFoto(ruta))}" alt="" loading="lazy">
        </button>`
      )
      .join('');
    return `${lamina(p, 'ficha-lamina', i)}<div class="tiras">${tiras}</div>`;
  }

  const urlFoto = (ruta) =>
    /^https?:\/\//.test(ruta) ? ruta : cliente.storage.from('fotos').getPublicUrl(ruta).data.publicUrl;

  /* Los tonos del mismo producto (mismo nombre, con tono puesto) se
     muestran como una sola ficha. Cada tono sigue teniendo sus propias
     unidades, y es el tono el que se pide y el que se descuenta. */
  function agrupar(productos) {
    const grupos = [];
    const porClave = new Map();

    productos.forEach((p) => {
      const conTono = (p.tono || '').trim() !== '';
      const clave = conTono ? 'g:' + p.nombre.trim().toLocaleLowerCase('es') : 'p:' + p.id;
      let g = porClave.get(clave);
      if (!g) {
        g = { clave, nombre: p.nombre.trim(), categoria: p.categoria, descripcion: '', variantes: [] };
        porClave.set(clave, g);
        grupos.push(g);
      }
      if (!g.descripcion && p.descripcion) g.descripcion = p.descripcion;
      if (!g.categoria && p.categoria) g.categoria = p.categoria;
      g.variantes.push(p);
    });

    grupos.forEach((g) => {
      g.unidades = g.variantes.reduce((s, v) => s + v.unidades, 0);
      const precios = g.variantes.map((v) => v.venta);
      g.precioMin = Math.min(...precios);
      g.precioMax = Math.max(...precios);
      g.conTonos = (g.variantes[0].tono || '').trim() !== '';
      // La portada sale del primer tono que tenga fotos.
      const conFotos = g.variantes.find((v) => v.fotos.length);
      const conFotoTono = g.variantes.find((v) => v.fotoTono);
      g.fotos = conFotos ? conFotos.fotos : conFotoTono ? [conFotoTono.fotoTono] : [];
    });
    return grupos;
  }

  /* Búsqueda sin tildes ni mayúsculas: «traslucido» encuentra «Traslúcido».
     Cada palabra tiene que aparecer en algún lado del producto: nombre,
     categoría, descripción o el nombre de alguno de sus tonos. */
  const normalizar = (t) =>
    String(t || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const terminos = () => normalizar(estado.busqueda).split(/\s+/).filter(Boolean);

  function coincide(g, palabras) {
    if (!palabras.length) return true;
    if (!g.texto) {
      g.texto = normalizar(
        [g.nombre, g.categoria, g.descripcion, ...g.variantes.map((v) => v.tono)].join(' ')
      );
    }
    return palabras.every((w) => g.texto.includes(w));
  }

  /** Si la búsqueda nombra un tono, la ficha se abre ya en ese tono. */
  function tonoBuscado(g) {
    const palabras = terminos();
    if (!palabras.length || !g.conTonos) return null;
    return (
      g.variantes.find(
        (v) => v.unidades > 0 && palabras.some((w) => normalizar(v.tono).includes(w))
      ) || null
    );
  }

  const precioGrupo = (g) =>
    g.precioMin === g.precioMax ? money(g.precioMin) : 'desde ' + money(g.precioMin);

  function categorias() {
    const vistas = [];
    estado.productos.forEach((p) => {
      if (p.categoria && !vistas.includes(p.categoria)) vistas.push(p.categoria);
    });
    return vistas.sort((a, b) => a.localeCompare(b, 'es'));
  }

  function renderFiltros() {
    const cats = categorias();
    if (!cats.length) {
      $('#filtros').hidden = true;
      return;
    }
    $('#filtros').innerHTML = [
      `<button data-cat="" class="${estado.categoria ? '' : 'activo'}">Todo</button>`,
      ...cats.map(
        (c) =>
          `<button data-cat="${esc(c)}" class="${estado.categoria === c ? 'activo' : ''}">${esc(c)}</button>`
      )
    ].join('');
  }

  function renderRejilla() {
    const palabras = terminos();
    const lista = estado.grupos.filter(
      (g) => (!estado.categoria || g.categoria === estado.categoria) && coincide(g, palabras)
    );

    if (!lista.length) {
      if (!palabras.length) {
        $('#rejilla').innerHTML = `<p class="vacio">No hay nada por aquí todavía.</p>`;
        return;
      }
      // Si la categoría elegida es la que deja la búsqueda vacía, se ofrece quitarla.
      const enTodo = estado.categoria && estado.grupos.some((g) => coincide(g, palabras));
      $('#rejilla').innerHTML = `
        <div class="vacio">
          <p>Nada coincide con «${esc(estado.busqueda.trim())}»${
            estado.categoria ? ` en ${esc(estado.categoria)}` : ''
          }.</p>
          ${
            enTodo
              ? `<button class="btn-fino" id="buscarEnTodo">Buscar en todo el catálogo</button>`
              : `<p class="vacio-sub">Prueba con otra palabra, o escríbenos por WhatsApp y te contamos si lo tenemos.</p>`
          }
        </div>`;
      return;
    }

    $('#rejilla').innerHTML = lista
      .map((g, i) => {
        const agotado = g.unidades <= 0;
        const pocas = !agotado && g.unidades <= POCAS;
        const disponibles = g.variantes.filter((v) => v.unidades > 0).length;
        const aviso = agotado
          ? '<span class="pieza-aviso agotado">Agotado</span>'
          : pocas
          ? '<span class="pieza-aviso pocas">Quedan pocas</span>'
          : g.conTonos
          ? `<span class="pieza-aviso tonos">${disponibles} ${disponibles === 1 ? 'tono' : 'tonos'}</span>`
          : '';
        return `
          <button class="pieza ${agotado ? 'agotada' : ''}" data-clave="${esc(g.clave)}">
            <span class="pieza-num cifra">${String(i + 1).padStart(2, '0')}</span>
            ${lamina(g)}
            <span class="pieza-nom">${esc(g.nombre)}</span>
            <span class="pieza-precio cifra">${precioGrupo(g)}</span>
            ${aviso}
          </button>`;
      })
      .join('');
  }

  function renderBarra() {
    const piezas = piezasPedido();
    const barra = $('#barraPedido');
    barra.hidden = piezas === 0;
    if (piezas === 0) return;
    $('#barraCuenta').textContent = piezas === 1 ? '1 artículo' : `${piezas} artículos`;
    $('#barraTotal').textContent = money(totalPedido());
  }

  /* ---------------- ficha de un producto ---------------- */

  function abrirFicha(clave) {
    const g = estado.grupos.find((x) => x.clave === clave);
    if (!g) return;
    estado.abierto = clave;
    // Empieza en el tono que se buscó, o en el primero que tenga existencias.
    const disponible =
      tonoBuscado(g) || g.variantes.find((v) => v.unidades > 0) || g.variantes[0];
    estado.variante = disponible.id;
    estado.foto = 0;
    renderFicha();
    $('#hojaProducto').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  /** El tono que se está mirando dentro del grupo abierto. */
  function varianteActual(g) {
    return g.variantes.find((v) => v.id === estado.variante) || g.variantes[0];
  }

  function renderFicha() {
    const g = estado.grupos.find((x) => x.clave === estado.abierto);
    if (!g) return;
    const v = varianteActual(g);
    const agotado = v.unidades <= 0;
    const todoAgotado = g.unidades <= 0;
    const cant = enPedido(v.id);
    const tope = v.unidades;
    // Las fotos del tono elegido; si ese tono no tiene, las del producto.
    // La foto del tono elegido va primero y en grande; debajo, las fotos
    // generales del producto (por ejemplo, la carta de tonos).
    const fotos = [v.fotoTono, ...(v.fotos.length ? v.fotos : g.fotos)].filter(Boolean);
    const mostrar = { nombre: g.nombre, fotos: [...new Set(fotos)] };

    const tonos = g.conTonos
      ? `<span class="rotulo ficha-cat">Elige tu tono</span>
         <div class="tonos">
           ${g.variantes
             .map(
               (x) => `
             <button class="tono-op ${x.id === v.id ? 'activo' : ''} ${
                 x.unidades <= 0 ? 'sinexistencias' : ''
               }" data-id="${esc(x.id)}">
               ${x.fotoTono ? `<img class="tono-mini" src="${esc(urlFoto(x.fotoTono))}" alt="" loading="lazy">` : ''}
               ${esc(x.tono || 'Único')}
               ${x.unidades <= 0 ? '<small>agotado</small>' : ''}
             </button>`
             )
             .join('')}
         </div>`
      : '';

    $('#fichaCuerpo').innerHTML = `
      ${galeria(mostrar)}
      <h3 class="ficha-nom">${esc(g.nombre)}</h3>
      <p class="ficha-precio cifra">${money(v.venta)}</p>
      ${g.descripcion ? `<p class="ficha-desc">${esc(g.descripcion)}</p>` : ''}
      ${!g.conTonos && g.categoria ? `<span class="rotulo ficha-cat">${esc(g.categoria)}</span>` : ''}
      ${tonos}
      ${
        todoAgotado
          ? `<p class="aclaracion">Ahora mismo no queda ninguno. Escríbenos y te avisamos cuando vuelva.</p>`
          : agotado
          ? `<p class="aclaracion">Ese tono está agotado. Elige otro, o escríbenos y te avisamos cuando vuelva.</p>`
          : `
        <div class="contador">
          <button data-paso="-1" ${cant <= 0 ? 'disabled' : ''} aria-label="Quitar una">−</button>
          <span class="cifra" id="fichaCant">${cant}</span>
          <button data-paso="1" ${cant >= tope ? 'disabled' : ''} aria-label="Añadir una">+</button>
        </div>
        ${cant >= tope ? `<p class="aclaracion">Es todo lo que queda de este tono.</p>` : ''}
        <button class="btn-wa" id="btnAnadir">${cant > 0 ? 'Listo' : 'Añadir al pedido'}</button>`
      }`;
  }

  /* ---------------- el pedido ---------------- */

  function abrirPedido() {
    renderPedido();
    $('#hojaPedido').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function renderPedido() {
    const lineas = lineasPedido();
    if (!lineas.length) {
      cerrarHojas();
      return;
    }
    const wa = (estado.catalogo.whatsapp || '').replace(/\D/g, '');

    $('#pedidoCuerpo').innerHTML = `
      <div class="nota">
        ${lineas
          .map(
            (l) => `
          <div class="nota-linea">
            <span class="nota-nom">${esc(l.etiqueta)}</span>
            <span class="nota-cant cifra">×${l.cantidad}</span>
            <span class="nota-puntos"></span>
            <span class="nota-val cifra">${money(l.subtotal)}</span>
            <button class="nota-quitar" data-quitar="${esc(l.id)}" aria-label="Quitar ${esc(l.etiqueta)}">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12"/><path d="M18 6 6 18"/></svg>
            </button>
          </div>`
          )
          .join('')}
        <div class="nota-total">
          <span class="rotulo">Total</span>
          <b class="cifra">${money(totalPedido())}</b>
        </div>
      </div>
      ${
        wa
          ? `<button class="btn-wa" id="btnEnviar">
               <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.6a8.4 8.4 0 0 1-12.3 7.4L3.5 20.5l1.6-4.6A8.4 8.4 0 1 1 20.5 11.6z"/><path d="M8.8 8.4c.3-.6 1.2-.6 1.5 0l.6 1.2-.7 1a5 5 0 0 0 2.6 2.6l1-.7 1.2.6c.6.3.6 1.2 0 1.5-1.4.8-3.2.3-4.8-1.2S8 9.8 8.8 8.4z"/></svg>
               Enviar por WhatsApp
             </button>`
          : `<p class="aclaracion">Todavía no hay un número de WhatsApp configurado.</p>`
      }
      <button class="btn-fino" id="btnSeguir">Seguir mirando</button>
      <p class="aclaracion">Se abrirá WhatsApp con el pedido escrito. Nada se cobra aquí: acordamos entrega y pago por el chat.</p>`;
  }

  /** Arma el texto del pedido tal como llegará al chat. */
  function textoPedido() {
    const lineas = lineasPedido();
    const cuerpo = lineas
      .map((l) => `• ${l.etiqueta} ×${l.cantidad} — ${money(l.subtotal)}`)
      .join('\n');
    return `${estado.catalogo.saludo || 'Hola, quiero pedir:'}\n\n${cuerpo}\n\nTotal: ${money(totalPedido())}`;
  }

  /** Un número colombiano de 10 dígitos se completa con el 57. */
  function numeroWhatsApp() {
    let n = (estado.catalogo.whatsapp || '').replace(/\D/g, '');
    if (n.length === 10 && n.startsWith('3')) n = '57' + n;
    return n;
  }

  function cerrarHojas() {
    $('#hojaProducto').hidden = true;
    $('#hojaPedido').hidden = true;
    estado.abierto = null;
    estado.variante = null;
    document.body.style.overflow = '';
  }

  /* ---------------- sucesos ---------------- */

  document.addEventListener('click', (e) => {
    const cerrar = e.target.closest('[data-cerrar]');
    if (cerrar || e.target.classList.contains('hoja')) {
      cerrarHojas();
      return;
    }

    const filtro = e.target.closest('#filtros button');
    if (filtro) {
      estado.categoria = filtro.dataset.cat;
      renderFiltros();
      renderRejilla();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (e.target.closest('#buscarEnTodo')) {
      estado.categoria = '';
      renderFiltros();
      renderRejilla();
      return;
    }

    const pieza = e.target.closest('.pieza');
    if (pieza) {
      abrirFicha(pieza.dataset.clave);
      return;
    }

    const tonoOp = e.target.closest('.tono-op');
    if (tonoOp) {
      estado.variante = tonoOp.dataset.id;
      estado.foto = 0;
      renderFicha();
      return;
    }

    const tira = e.target.closest('.tira');
    if (tira) {
      estado.foto = Number(tira.dataset.foto);
      renderFicha();
      return;
    }

    const paso = e.target.closest('.contador button');
    if (paso) {
      const p = estado.productos.find((x) => x.id === estado.variante);
      if (!p) return;
      const nueva = Math.min(Math.max(0, enPedido(p.id) + Number(paso.dataset.paso)), p.unidades);
      if (nueva > 0) estado.pedido[p.id] = nueva;
      else delete estado.pedido[p.id];
      guardarPedido();
      renderFicha();
      renderBarra();
      return;
    }

    if (e.target.closest('#btnAnadir')) {
      const p = estado.productos.find((x) => x.id === estado.variante);
      if (p && enPedido(p.id) === 0) {
        estado.pedido[p.id] = 1;
        guardarPedido();
        renderBarra();
      }
      cerrarHojas();
      return;
    }

    if (e.target.closest('#barraPedido')) {
      abrirPedido();
      return;
    }

    const quitar = e.target.closest('[data-quitar]');
    if (quitar) {
      delete estado.pedido[quitar.dataset.quitar];
      guardarPedido();
      renderBarra();
      renderPedido();
      return;
    }

    if (e.target.closest('#btnSeguir')) {
      cerrarHojas();
      return;
    }

    if (e.target.closest('#btnEnviar')) {
      const n = numeroWhatsApp();
      if (!n) return;
      window.open(`https://wa.me/${n}?text=${encodeURIComponent(textoPedido())}`, '_blank', 'noopener');
      return;
    }
  });

  $('#buscar').addEventListener('input', (e) => {
    estado.busqueda = e.target.value;
    $('#limpiarBusqueda').hidden = !e.target.value;
    renderRejilla();
  });

  // Al pulsar «buscar» en el teclado del celular, se cierra el teclado.
  $('#formBuscar').addEventListener('submit', (e) => {
    e.preventDefault();
    $('#buscar').blur();
  });

  $('#limpiarBusqueda').addEventListener('click', () => {
    estado.busqueda = '';
    $('#buscar').value = '';
    $('#limpiarBusqueda').hidden = true;
    renderRejilla();
    $('#buscar').focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarHojas();
  });

  /* ---------------- arranque ---------------- */

  function error(titulo, detalle) {
    $('#estado').innerHTML = `<h2>${esc(titulo)}</h2><p>${esc(detalle)}</p>`;
    $('#estado').hidden = false;
    $('#tienda').hidden = true;
  }

  async function arrancar() {
    let cat, productos;
    try {
      const COLUMNAS = 'id, nombre, venta, unidades, categoria, descripcion, tono, fotos, creado';
      const pedirProductos = (cols) => cliente.from('cc_productos').select(cols).order('creado');
      let [c, p] = await Promise.all([
        cliente.from('cc_catalogo').select('*').single(),
        pedirProductos(COLUMNAS + ', foto_tono')
      ]);
      // Si la base todavía no tiene la foto por tono, el catálogo sigue
      // funcionando igual, solo que sin esas fotos.
      if (p.error && /foto_tono/i.test(p.error.message || '')) p = await pedirProductos(COLUMNAS);
      if (c.error) throw c.error;
      if (p.error) throw p.error;
      cat = c.data;
      productos = p.data || [];
    } catch (e) {
      error('No se pudo abrir el catálogo', 'Revisa tu conexión y vuelve a intentarlo.');
      return;
    }

    estado.catalogo = {
      nombre: cat.nombre || 'Catálogo',
      whatsapp: cat.whatsapp || '',
      saludo: cat.saludo || 'Hola, quiero pedir:',
      tema: cat.tema || 'dorado'
    };
    estado.productos = productos.map((p) => ({
      ...p,
      venta: Number(p.venta) || 0,
      unidades: p.unidades || 0,
      categoria: p.categoria || '',
      descripcion: p.descripcion || '',
      tono: p.tono || '',
      fotos: Array.isArray(p.fotos) ? p.fotos : [],
      fotoTono: p.foto_tono || ''
    }));
    estado.grupos = agrupar(estado.productos);
    estado.pedido = leerPedido();
    ajustarPedido();

    document.body.dataset.tema = estado.catalogo.tema;
    document.title = estado.catalogo.nombre;
    $('#pieNombre').textContent = estado.catalogo.nombre;

    // El logo lleva los nombres dentro; si falla, se escribe el título.
    const logo = $('#cabLogo');
    if (logo) {
      logo.alt = estado.catalogo.nombre;
      logo.addEventListener('error', () => {
        $('#cabNombre').textContent = estado.catalogo.nombre;
      });
    } else {
      $('#cabNombre').textContent = estado.catalogo.nombre;
    }

    if (!estado.productos.length) {
      error('Todavía no hay nada publicado', 'Vuelve en un rato: estamos preparando el catálogo.');
      return;
    }

    renderFiltros();
    renderRejilla();
    renderBarra();
    $('#estado').hidden = true;
    $('#tienda').hidden = false;
  }

  arrancar();
})();
