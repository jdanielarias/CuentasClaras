-- Ejecutar después de 06-tonos.sql.
-- Cada tono puede llevar su propia foto. En el catálogo, al elegir un
-- tono, la foto grande cambia a la de ese tono; las fotos generales del
-- producto (por ejemplo, la carta de tonos) siguen disponibles debajo.
--
-- También corrige la restauración de copias de seguridad, que hasta ahora
-- no devolvía las fotos ni lo que estaba publicado en el catálogo.
-- Puede repetirse sin borrar nada.
begin;

-- La foto propia del tono: una ruta dentro del depósito `fotos`.
-- Va aparte de `fotos` (que es la galería compartida por todos los tonos)
-- para que nunca se confundan.
alter table public.cc_productos
  add column if not exists foto_tono text not null default '';

-- Restaurar una copia devuelve ahora también las fotos, la foto de cada
-- tono, lo que estaba publicado y el WhatsApp de cada tienda.
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

  insert into public.cc_tiendas (id, nombre, tema, publicada, whatsapp)
  select t.id, t.nombre, coalesce(t.tema, 'verde'),
         coalesce(t.publicada, false), coalesce(t.whatsapp, '')
  from jsonb_to_recordset(p_datos -> 'tiendas')
    as t(id text, nombre text, tema text, publicada boolean, whatsapp text);

  insert into public.cc_productos
    (id, tienda_id, nombre, venta, unidades, categoria, descripcion, tono,
     fotos, foto_tono, publicado, creado)
  select p.id, p."tiendaId", p.nombre, coalesce(p.venta, 0),
         coalesce(p.unidades, 0), coalesce(p.categoria, ''),
         coalesce(p.descripcion, ''), coalesce(p.tono, ''),
         coalesce(p.fotos, '{}'), coalesce(p."fotoTono", ''),
         coalesce(p.publicado, false), coalesce(p.creado, now())
  from jsonb_to_recordset(p_datos -> 'productos')
    as p(id text, "tiendaId" text, nombre text, venta numeric,
         unidades integer, categoria text, descripcion text, tono text,
         fotos text[], "fotoTono" text, publicado boolean, creado timestamptz);

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

select 'Fotos por tono activadas.' as resultado;
