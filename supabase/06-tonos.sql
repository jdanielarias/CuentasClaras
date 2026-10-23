-- Ejecutar después de 05-catalogo.sql.
-- Añade el tono a los productos que vienen en varios (labiales, bases,
-- esmaltes). Cada tono sigue siendo un producto con sus propias unidades:
-- por eso vender un tono descuenta ese tono y no los demás, sin cambiar
-- nada de cómo funcionan las ventas.
-- En el catálogo, los productos que se llaman igual y tienen tono se
-- muestran juntos, en una sola ficha con los tonos para elegir.
-- Puede repetirse sin borrar nada.
begin;

alter table public.cc_productos
  add column if not exists tono text not null default '';

-- Para agrupar rápido los tonos de un mismo producto dentro de su tienda.
create index if not exists cc_productos_grupo_idx
  on public.cc_productos (tienda_id, lower(btrim(nombre)));

-- Se reemplaza la función de 05 por una que también guarde el tono.
drop function if exists public.cc_guardar_producto(text, text, text, numeric, integer, text, numeric, integer, text, text);

create or replace function public.cc_guardar_producto(
  p_id text,
  p_tienda_id text,
  p_nombre text,
  p_venta numeric,
  p_unidades integer,
  p_categoria text,
  p_compra numeric,
  p_minimo integer,
  p_notas text,
  p_descripcion text default '',
  p_tono text default ''
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
    insert into public.cc_productos
      (tienda_id, nombre, venta, unidades, categoria, descripcion, tono)
      values (p_tienda_id, p_nombre, p_venta, p_unidades,
              coalesce(p_categoria, ''), coalesce(p_descripcion, ''),
              coalesce(p_tono, ''))
      returning * into guardado;
  else
    update public.cc_productos set
      tienda_id   = p_tienda_id,
      nombre      = p_nombre,
      venta       = p_venta,
      unidades    = p_unidades,
      categoria   = coalesce(p_categoria, ''),
      descripcion = coalesce(p_descripcion, ''),
      tono        = coalesce(p_tono, '')
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

revoke all on function public.cc_guardar_producto(text, text, text, numeric, integer, text, numeric, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.cc_guardar_producto(text, text, text, numeric, integer, text, numeric, integer, text, text, text) to authenticated;

-- La venta guarda el nombre tal como se vendió, para que el historial
-- siga diciendo qué tono fue aunque el producto cambie después.
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
  etiqueta text;
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

  etiqueta := prod.nombre;
  if btrim(coalesce(prod.tono, '')) <> '' then
    etiqueta := etiqueta || ' · ' || prod.tono;
  end if;

  insert into public.cc_ventas(tienda_id, producto_id, nombre, cantidad, compra, venta)
    values (prod.tienda_id, prod.id, etiqueta, p_cantidad, costo, p_precio)
    returning * into creada;

  update public.cc_productos set unidades = unidades - p_cantidad
    where id = prod.id;

  return creada;
end;
$$;

-- `cc_restaurar` también conserva el tono de cada producto.
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

  insert into public.cc_productos
    (id, tienda_id, nombre, venta, unidades, categoria, descripcion, tono, creado)
  select p.id, p."tiendaId", p.nombre, coalesce(p.venta, 0),
         coalesce(p.unidades, 0), coalesce(p.categoria, ''),
         coalesce(p.descripcion, ''), coalesce(p.tono, ''),
         coalesce(p.creado, now())
  from jsonb_to_recordset(p_datos -> 'productos')
    as p(id text, "tiendaId" text, nombre text, venta numeric,
         unidades integer, categoria text, descripcion text, tono text,
         creado timestamptz);

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

notify pgrst, 'reload schema';
commit;

select 'Tonos activados. Añade el tono a cada producto desde el panel.' as resultado;
