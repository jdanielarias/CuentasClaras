/* ============================================================
   Cuentas Claras — capa de datos (Supabase)

   Los datos viven en Supabase, no en el celular. Aquí se traducen
   las tablas (cc_tiendas, cc_productos…) a la forma que usa app.js,
   y cada cambio se envía al servidor antes de tocar la pantalla.

   Sin internet: se puede consultar lo último que se cargó, guardado
   en este dispositivo como copia de solo lectura. Para registrar
   cualquier cosa hace falta conexión, y así dos celulares no pueden
   pisarse los datos.
   ============================================================ */

const DB = (() => {
  const cfg = window.CUENTAS_CLARAS_SUPABASE;
  const CLAVE_CACHE = 'cuentas-claras-ultimo-visto';

  const configurado =
    !!cfg && /^https:\/\//.test(cfg.url || '') && /^sb_publishable_/.test(cfg.publishableKey || '');

  const cliente = configurado
    ? window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      })
    : null;

  /* ---------------- errores en lenguaje claro ---------------- */

  const hayRed = () => navigator.onLine !== false;

  function esFalloDeRed(e) {
    if (!hayRed()) return true;
    const m = String((e && (e.message || e.error_description)) || '');
    return /failed to fetch|networkerror|network request failed|load failed/i.test(m);
  }

  /** Convierte el error técnico en algo que se pueda leer en pantalla. */
  function explicar(e, accion) {
    if (esFalloDeRed(e)) return `Sin internet: no se pudo ${accion}. Inténtalo otra vez.`;
    const m = String((e && e.message) || '');
    if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/email not confirmed/i.test(m)) return 'Esa cuenta todavía no está confirmada.';
    if (/jwt|token|session/i.test(m)) return 'Tu sesión se venció. Vuelve a entrar.';
    if (/row-level security|permission denied/i.test(m))
      return 'Tu cuenta no tiene permiso para hacer eso.';
    if (/could not find the function|schema cache/i.test(m))
      return 'Falta ejecutar 03-operaciones.sql en Supabase.';
    if (/foto_tono/i.test(m)) return 'Falta ejecutar 07-foto-tono.sql en Supabase.';
    if (/relation .* does not exist/i.test(m))
      return 'Faltan las tablas: ejecuta 01-crear-tablas.sql en Supabase.';
    return m || `No se pudo ${accion}.`;
  }

  /** Envuelve un error para que la pantalla muestre siempre una frase clara. */
  function fallo(e, accion) {
    const err = new Error(explicar(e, accion));
    err.sinRed = esFalloDeRed(e);
    err.original = e;
    return err;
  }

  /** Toda llamada pasa por aquí: si Supabase devuelve error, se lanza traducido. */
  async function pedir(accion, promesa) {
    let r;
    try {
      r = await promesa;
    } catch (e) {
      throw fallo(e, accion);
    }
    if (r && r.error) throw fallo(r.error, accion);
    return r ? r.data : null;
  }

  /* ---------------- traducción tabla <-> app ---------------- */

  const num = (v) => (v === null || v === undefined ? null : Number(v));

  function aProducto(fila) {
    const interno = Array.isArray(fila.cc_producto_interno)
      ? fila.cc_producto_interno[0]
      : fila.cc_producto_interno;
    return {
      id: fila.id,
      creado: fila.creado,
      nombre: fila.nombre,
      compra: interno ? num(interno.compra) : null,
      venta: num(fila.venta) || 0,
      unidades: fila.unidades || 0,
      minimo: interno && interno.minimo !== null ? interno.minimo : 1,
      tiendaId: fila.tienda_id,
      categoria: fila.categoria || '',
      notas: (interno && interno.notas) || '',
      descripcion: fila.descripcion || '',
      tono: fila.tono || '',
      publicado: fila.publicado === true,
      fotos: Array.isArray(fila.fotos) ? fila.fotos : [],
      fotoTono: fila.foto_tono || ''
    };
  }

  const aVenta = (f) => ({
    id: f.id,
    tiendaId: f.tienda_id,
    productoId: f.producto_id,
    nombre: f.nombre,
    cantidad: f.cantidad,
    compra: num(f.compra),
    venta: num(f.venta) || 0,
    fecha: f.fecha
  });

  const aGasto = (f) => ({
    id: f.id,
    tiendaId: f.tienda_id,
    monto: num(f.monto) || 0,
    categoria: f.categoria || '',
    descripcion: f.descripcion || '',
    fecha: f.fecha,
    proveedor: f.proveedor || '',
    creado: f.creado
  });

  const aTienda = (f) => ({
    id: f.id,
    nombre: f.nombre,
    tema: f.tema,
    creada: f.creada,
    publicada: f.publicada === true,
    whatsapp: f.whatsapp || ''
  });

  /* ---------------- copia local de solo lectura ---------------- */

  function guardarCache(datos) {
    try {
      localStorage.setItem(CLAVE_CACHE, JSON.stringify({ visto: new Date().toISOString(), ...datos }));
    } catch (e) {
      /* si no cabe, se sigue funcionando en línea */
    }
  }

  function leerCache() {
    try {
      const crudo = localStorage.getItem(CLAVE_CACHE);
      if (!crudo) return null;
      const d = JSON.parse(crudo);
      if (!Array.isArray(d.productos)) return null;
      return d;
    } catch (e) {
      return null;
    }
  }

  const olvidarCache = () => {
    try {
      localStorage.removeItem(CLAVE_CACHE);
    } catch (e) {
      /* nada que hacer */
    }
  };

  /* ---------------- sesión ---------------- */

  async function sesion() {
    if (!cliente) return null;
    const { data } = await cliente.auth.getSession();
    return data ? data.session : null;
  }

  async function entrar(correo, contrasena) {
    const { data, error } = await cliente.auth.signInWithPassword({
      email: correo,
      password: contrasena
    });
    if (error) throw fallo(error, 'entrar');
    return data.session;
  }

  async function salir() {
    olvidarCache();
    try {
      await cliente.auth.signOut();
    } catch (e) {
      /* si no hay red, la sesión local se borra igual */
    }
  }

  /** ¿Esta cuenta está autorizada para administrar? Tener cuenta no basta. */
  async function soyAdmin() {
    const data = await pedir('comprobar tu permiso', cliente.rpc('cc_soy_admin'));
    return data === true;
  }

  function alCambiarSesion(fn) {
    if (!cliente) return;
    cliente.auth.onAuthStateChange((evento, ses) => fn(evento, ses));
  }

  /* ---------------- lectura ---------------- */

  /** Trae todo de una vez. Devuelve además de dónde salió: servidor o copia local. */
  async function cargarTodo() {
    const [tiendas, productos, ventas, gastos] = await Promise.all([
      pedir('cargar las tiendas', cliente.from('cc_tiendas').select('*').order('creada')),
      pedir(
        'cargar el inventario',
        cliente
          .from('cc_productos')
          .select('*, cc_producto_interno(compra, minimo, notas)')
          .order('creado')
      ),
      pedir('cargar las ventas', cliente.from('cc_ventas').select('*').order('fecha')),
      pedir('cargar los gastos', cliente.from('cc_gastos').select('*').order('fecha'))
    ]);

    const datos = {
      tiendas: (tiendas || []).map(aTienda),
      productos: (productos || []).map(aProducto),
      ventas: (ventas || []).map(aVenta),
      gastos: (gastos || []).map(aGasto)
    };
    guardarCache(datos);
    return { ...datos, origen: 'servidor' };
  }

  /** Lo mismo, pero si no hay internet devuelve la última copia vista. */
  async function cargarTodoOCache() {
    try {
      return await cargarTodo();
    } catch (e) {
      const cache = leerCache();
      if (e.sinRed && cache) return { ...cache, origen: 'copia', visto: cache.visto };
      throw e;
    }
  }

  /* ---------------- escritura ---------------- */

  async function guardarTienda({ id, nombre, tema, publicada }) {
    const campos = { nombre, tema, publicada: publicada === true };
    const fila = id
      ? await pedir('guardar la tienda', cliente.from('cc_tiendas').update(campos).eq('id', id).select().single())
      : await pedir('crear la tienda', cliente.from('cc_tiendas').insert(campos).select().single());
    return aTienda(fila);
  }

  const borrarTienda = (id) =>
    pedir('borrar la tienda', cliente.rpc('cc_borrar_tienda', { p_tienda_id: id }));

  async function guardarProducto(p) {
    const fila = await pedir(
      'guardar el producto',
      cliente.rpc('cc_guardar_producto', {
        p_id: p.id || null,
        p_tienda_id: p.tiendaId,
        p_nombre: p.nombre,
        p_venta: p.venta,
        p_unidades: p.unidades,
        p_categoria: p.categoria,
        p_compra: p.compra,
        p_minimo: p.minimo,
        p_notas: p.notas,
        p_descripcion: p.descripcion || '',
        p_tono: p.tono || ''
      })
    );
    return { ...aProducto(fila), compra: p.compra, minimo: p.minimo, notas: p.notas };
  }

  const borrarProducto = (id) =>
    pedir('borrar el producto', cliente.from('cc_productos').delete().eq('id', id));

  /** Suma unidades sin pasar por el formulario (el botón + del inventario). */
  async function ajustarUnidades(id, unidades) {
    const fila = await pedir(
      'actualizar las unidades',
      cliente.from('cc_productos').update({ unidades }).eq('id', id).select().single()
    );
    return fila.unidades;
  }

  async function registrarVenta(productoId, cantidad, precio) {
    const fila = await pedir(
      'registrar la venta',
      cliente.rpc('cc_registrar_venta', {
        p_producto_id: productoId,
        p_cantidad: cantidad,
        p_precio: precio
      })
    );
    return aVenta(fila);
  }

  const anularVenta = (id) =>
    pedir('anular la venta', cliente.rpc('cc_anular_venta', { p_venta_id: id }));

  async function guardarGasto(g) {
    const campos = {
      tienda_id: g.tiendaId,
      monto: g.monto,
      categoria: g.categoria,
      descripcion: g.descripcion,
      proveedor: g.proveedor,
      fecha: g.fecha
    };
    const fila = g.id
      ? await pedir(
          'guardar el gasto',
          cliente.from('cc_gastos').update(campos).eq('id', g.id).select().single()
        )
      : await pedir('crear el gasto', cliente.from('cc_gastos').insert(campos).select().single());
    return aGasto(fila);
  }

  const borrarGasto = (id) =>
    pedir('borrar el gasto', cliente.from('cc_gastos').delete().eq('id', id));

  const borrarTodo = () => pedir('borrar los datos', cliente.rpc('cc_borrar_todo'));

  const restaurar = (datos) =>
    pedir('restaurar la copia', cliente.rpc('cc_restaurar', { p_datos: datos }));

  /* ---------------- catálogo público ---------------- */

  async function leerCatalogo() {
    const fila = await pedir(
      'cargar los datos de la tienda pública',
      cliente.from('cc_catalogo').select('*').single()
    );
    return {
      nombre: fila.nombre || '',
      whatsapp: fila.whatsapp || '',
      saludo: fila.saludo || '',
      tema: fila.tema || 'dorado'
    };
  }

  async function guardarCatalogo({ nombre, whatsapp, saludo, tema }) {
    const fila = await pedir(
      'guardar la tienda pública',
      cliente
        .from('cc_catalogo')
        .update({ nombre, whatsapp, saludo, tema })
        .eq('id', true)
        .select()
        .single()
    );
    return { nombre: fila.nombre, whatsapp: fila.whatsapp, saludo: fila.saludo, tema: fila.tema };
  }

  async function publicarProducto(id, publicado) {
    const fila = await pedir(
      publicado ? 'publicar el producto' : 'ocultar el producto',
      cliente.from('cc_productos').update({ publicado }).eq('id', id).select().single()
    );
    return fila.publicado === true;
  }

  /* ---------------- fotos ---------------- */

  /** Dirección pública de una foto ya subida, para mostrarla en el catálogo. */
  function urlFoto(ruta) {
    if (!ruta) return '';
    if (/^https?:\/\//.test(ruta)) return ruta; // por si ya viene completa
    return cliente.storage.from('fotos').getPublicUrl(ruta).data.publicUrl;
  }

  /** Sube una foto y devuelve su ruta dentro del depósito. */
  async function subirFoto(productoId, archivo) {
    const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
    const ruta = `${productoId}/${Date.now()}.${ext}`;
    const { error } = await cliente.storage
      .from('fotos')
      .upload(ruta, archivo, { cacheControl: '31536000', upsert: false });
    if (error) throw fallo(error, 'subir la foto');
    return ruta;
  }

  async function borrarFoto(ruta) {
    if (!ruta || /^https?:\/\//.test(ruta)) return;
    const { error } = await cliente.storage.from('fotos').remove([ruta]);
    if (error) throw fallo(error, 'borrar la foto');
  }

  /** La foto propia de un tono ('' para quitarla). */
  async function guardarFotoTono(productoId, ruta) {
    const fila = await pedir(
      'guardar la foto del tono',
      cliente.from('cc_productos').update({ foto_tono: ruta || '' }).eq('id', productoId).select().single()
    );
    return fila.foto_tono || '';
  }

  /** Guarda la lista de fotos de un producto, en el orden en que se ven. */
  async function guardarFotos(productoId, fotos) {
    const fila = await pedir(
      'guardar las fotos',
      cliente.from('cc_productos').update({ fotos }).eq('id', productoId).select().single()
    );
    return Array.isArray(fila.fotos) ? fila.fotos : [];
  }

  return {
    configurado,
    hayRed,
    sesion,
    entrar,
    salir,
    soyAdmin,
    alCambiarSesion,
    cargarTodo,
    cargarTodoOCache,
    leerCache,
    olvidarCache,
    guardarTienda,
    borrarTienda,
    guardarProducto,
    borrarProducto,
    ajustarUnidades,
    registrarVenta,
    anularVenta,
    guardarGasto,
    borrarGasto,
    borrarTodo,
    restaurar,
    leerCatalogo,
    guardarCatalogo,
    publicarProducto,
    urlFoto,
    subirFoto,
    borrarFoto,
    guardarFotos,
    guardarFotoTono
  };
})();
