-- Ejecutar después de 01-crear-tablas.sql.
-- Crea las operaciones que deben ocurrir completas o no ocurrir.
-- Ejemplo: una venta descuenta unidades y queda registrada en el mismo paso;
-- si algo se interrumpe no queda ni la venta sin descontar ni el descuento
-- sin venta. Lo mismo para guardar un producto con su costo, borrar una
-- tienda con todo lo suyo y restaurar una copia de seguridad.
-- Todas se ejecutan con los permisos de quien llama (security invoker):
-- las políticas RLS siguen aplicando y solo un administrador autorizado
-- puede usarlas.
-- Puede repetirse: reemplaza las funciones sin tocar los datos.
begin;

-- ---------------------------------------------------------------
-- Producto: la ficha visible y su costo privado se guardan juntos.
-- ---------------------------------------------------------------
create or replace function public.cc_guardar_producto(
  p_id text,
  p_tienda_id text,
  p_nombre text,
  p_venta numeric,
  p_unidades integer,
  p_categoria text,
  p_compra numeric,
  p_minimo integer,
  p_notas text
)
returns public.cc_productos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  guardado public.cc_productos%rowtype;
begin
  if p_id is null or p_id = '' then
    insert into public.cc_productos (tienda_id, nombre, venta, unidades, categoria)
      values (p_tienda_id, p_nombre, p_venta, p_unidades, coalesce(p_categoria, ''))
      returning * into guardado;
  else
    update public.cc_productos set
      tienda_id = p_tienda_id,
      nombre    = p_nombre,
      venta     = p_venta,
      unidades  = p_unidades,
      categoria = coalesce(p_categoria, '')
    where id = p_id
    returning * into guardado;
    if not found then
      raise exception 'Ese producto ya no existe.';
    end if;
  end if;

  insert into public.cc_producto_interno (producto_id, compra, minimo, notas)
    values (guardado.id, p_compra, coalesce(p_minimo, 1), coalesce(p_notas, ''))
  on conflict (producto_id) do update set
    compra = excluded.compra,
    minimo = excluded.minimo,
    notas  = excluded.notas;

  return guardado;
end;
$$;

-- ---------------------------------------------------------------
-- Venta: registrar y descontar, o anular y devolver.
-- ---------------------------------------------------------------

-- Bloquea la fila del producto para que dos ventas simultáneas del mismo
-- artículo no lean las mismas unidades disponibles.
create or replace function public.cc_registrar_venta(
  p_producto_id text,
  p_cantidad integer,
  p_precio numeric
)
returns public.cc_ventas
language plpgsql
security invoker
set search_path = ''
as $$
declare
  prod public.cc_productos%rowtype;
  costo numeric(14,2);
  creada public.cc_ventas%rowtype;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ser negativo.';
  end if;

  select * into prod from public.cc_productos
    where id = p_producto_id for update;
  if not found then
    raise exception 'Ese producto ya no existe.';
  end if;
  if prod.unidades < p_cantidad then
    raise exception 'Solo quedan % unidades de %.', prod.unidades, prod.nombre;
  end if;

  select compra into costo from public.cc_producto_interno
    where producto_id = prod.id;

  insert into public.cc_ventas(tienda_id, producto_id, nombre, cantidad, compra, venta)
    values (prod.tienda_id, prod.id, prod.nombre, p_cantidad, costo, p_precio)
    returning * into creada;

  update public.cc_productos set unidades = unidades - p_cantidad
    where id = prod.id;

  return creada;
end;
$$;

-- Si el producto ya se borró, la venta se anula igual y no hay nada que devolver.
create or replace function public.cc_anular_venta(p_venta_id text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.cc_ventas%rowtype;
begin
  delete from public.cc_ventas where id = p_venta_id returning * into v;
  if not found then
    raise exception 'Esa venta ya no existe.';
  end if;

  if v.producto_id is not null then
    update public.cc_productos set unidades = unidades + v.cantidad
      where id = v.producto_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------
-- Borrados en bloque.
-- ---------------------------------------------------------------

-- Borra una tienda con todo lo suyo, en el orden que exigen las referencias.
create or replace function public.cc_borrar_tienda(p_tienda_id text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cc_tiendas where id = p_tienda_id) then
    raise exception 'Esa tienda ya no existe.';
  end if;
  if (select count(*) from public.cc_tiendas) <= 1 then
    raise exception 'No puedes quedarte sin ninguna tienda.';
  end if;

  delete from public.cc_gastos where tienda_id = p_tienda_id;
  delete from public.cc_ventas where tienda_id = p_tienda_id;
  delete from public.cc_productos where tienda_id = p_tienda_id;
  delete from public.cc_tiendas where id = p_tienda_id;
end;
$$;

-- Vacía productos, ventas y gastos de todas las tiendas. Las tiendas quedan.
create or replace function public.cc_borrar_todo()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.cc_gastos;
  delete from public.cc_ventas;
  delete from public.cc_productos;
end;
$$;

-- ---------------------------------------------------------------
-- Restaurar una copia de seguridad: reemplaza TODO por el contenido
-- del archivo .json que exporta la app. En una sola transacción, para
-- que no pueda quedar a medio restaurar.
-- ---------------------------------------------------------------
create or replace function public.cc_restaurar(p_datos jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_datos -> 'productos') <> 'array'
     or jsonb_typeof(p_datos -> 'tiendas') <> 'array' then
    raise exception 'Ese archivo no es una copia válida de Cuentas Claras.';
  end if;

  delete from public.cc_gastos;
  delete from public.cc_ventas;
  delete from public.cc_productos;
  delete from public.cc_tiendas;

  insert into public.cc_tiendas (id, nombre, tema)
  select t.id, t.nombre, coalesce(t.tema, 'verde')
  from jsonb_to_recordset(p_datos -> 'tiendas')
    as t(id text, nombre text, tema text);

  insert into public.cc_productos (id, tienda_id, nombre, venta, unidades, categoria, creado)
  select p.id, p."tiendaId", p.nombre, coalesce(p.venta, 0),
         coalesce(p.unidades, 0), coalesce(p.categoria, ''),
         coalesce(p.creado, now())
  from jsonb_to_recordset(p_datos -> 'productos')
    as p(id text, "tiendaId" text, nombre text, venta numeric,
         unidades integer, categoria text, creado timestamptz);

  insert into public.cc_producto_interno (producto_id, compra, minimo, notas)
  select p.id, p.compra, coalesce(p.minimo, 1), coalesce(p.notas, '')
  from jsonb_to_recordset(p_datos -> 'productos')
    as p(id text, compra numeric, minimo integer, notas text);

  if jsonb_typeof(p_datos -> 'ventas') = 'array' then
    insert into public.cc_ventas (id, tienda_id, producto_id, nombre, cantidad, compra, venta, fecha)
    select v.id, v."tiendaId", v."productoId", v.nombre, v.cantidad, v.compra,
           coalesce(v.venta, 0), coalesce(v.fecha, now())
    from jsonb_to_recordset(p_datos -> 'ventas')
      as v(id text, "tiendaId" text, "productoId" text, nombre text,
           cantidad integer, compra numeric, venta numeric, fecha timestamptz);
  end if;

  if jsonb_typeof(p_datos -> 'gastos') = 'array' then
    insert into public.cc_gastos (id, tienda_id, monto, categoria, descripcion, proveedor, fecha)
    select g.id, g."tiendaId", g.monto, coalesce(g.categoria, ''),
           coalesce(g.descripcion, ''), coalesce(g.proveedor, ''),
           coalesce(g.fecha, current_date)
    from jsonb_to_recordset(p_datos -> 'gastos')
      as g(id text, "tiendaId" text, monto numeric, categoria text,
           descripcion text, proveedor text, fecha date);
  end if;
end;
$$;

-- ---------------------------------------------------------------
-- ¿La cuenta que inició sesión está autorizada para administrar?
-- La app lo pregunta al entrar para no mostrar un panel vacío a
-- quien tiene cuenta pero no permiso.
-- ---------------------------------------------------------------
create or replace function public.cc_soy_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select cuentas_claras_privado.es_admin();
$$;

-- ---------------------------------------------------------------
-- Permisos: solo cuentas con sesión iniciada, y RLS decide el resto.
-- ---------------------------------------------------------------
revoke all on function public.cc_guardar_producto(text, text, text, numeric, integer, text, numeric, integer, text) from public, anon, authenticated;
revoke all on function public.cc_registrar_venta(text, integer, numeric) from public, anon, authenticated;
revoke all on function public.cc_anular_venta(text) from public, anon, authenticated;
revoke all on function public.cc_borrar_tienda(text) from public, anon, authenticated;
revoke all on function public.cc_borrar_todo() from public, anon, authenticated;
revoke all on function public.cc_restaurar(jsonb) from public, anon, authenticated;
revoke all on function public.cc_soy_admin() from public, anon, authenticated;

grant execute on function public.cc_guardar_producto(text, text, text, numeric, integer, text, numeric, integer, text) to authenticated;
grant execute on function public.cc_registrar_venta(text, integer, numeric) to authenticated;
grant execute on function public.cc_anular_venta(text) to authenticated;
grant execute on function public.cc_borrar_tienda(text) to authenticated;
grant execute on function public.cc_borrar_todo() to authenticated;
grant execute on function public.cc_restaurar(jsonb) to authenticated;
grant execute on function public.cc_soy_admin() to authenticated;

notify pgrst, 'reload schema';
commit;

select 'Operaciones creadas. Falta importar los datos (04) y publicar la app.' as resultado;
