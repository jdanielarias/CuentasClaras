-- Ejecutar después de 03-operaciones.sql.
-- Prepara el catálogo público: los datos de la tienda que ve el cliente
-- y el depósito donde viven las fotos.
-- No publica nada por sí solo: cada tienda y cada producto se publican
-- desde el panel, uno a uno, y todo empieza apagado.
-- Puede repetirse sin borrar nada.
begin;

-- ---------------------------------------------------------------
-- Datos de la tienda pública. Una sola fila: el catálogo es uno.
-- ---------------------------------------------------------------
create table if not exists public.cc_catalogo (
  id boolean primary key default true check (id),
  nombre text not null default 'Mi tienda',
  whatsapp text not null default '',
  saludo text not null default 'Hola, quiero pedir:',
  tema text not null default 'dorado'
);

insert into public.cc_catalogo (id) values (true) on conflict (id) do nothing;

alter table public.cc_catalogo enable row level security;
revoke all on public.cc_catalogo from public, anon, authenticated;
grant select on public.cc_catalogo to anon;
grant select, update on public.cc_catalogo to authenticated;

-- El nombre y el WhatsApp son públicos por definición: van impresos en
-- el catálogo. Cambiarlos, solo el administrador.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
    and tablename = 'cc_catalogo' and policyname = 'cc_catalogo_lectura'
  ) then
    create policy cc_catalogo_lectura on public.cc_catalogo
      for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
    and tablename = 'cc_catalogo' and policyname = 'cc_catalogo_admin'
  ) then
    create policy cc_catalogo_admin on public.cc_catalogo
      for update to authenticated
      using ((select cuentas_claras_privado.es_admin()))
      with check ((select cuentas_claras_privado.es_admin()));
  end if;
end;
$$;

-- ---------------------------------------------------------------
-- El producto gana una descripción para el catálogo.
-- Se reemplaza la función de 03 por una que también la guarde; las
-- políticas RLS siguen siendo las que deciden quién puede usarla.
-- Publicar, despublicar y cambiar las fotos son `update` normales:
-- no hacen falta funciones aparte, RLS ya los protege.
-- ---------------------------------------------------------------
drop function if exists public.cc_guardar_producto(text, text, text, numeric, integer, text, numeric, integer, text);

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
  p_descripcion text default ''
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
    insert into public.cc_productos (tienda_id, nombre, venta, unidades, categoria, descripcion)
      values (p_tienda_id, p_nombre, p_venta, p_unidades,
              coalesce(p_categoria, ''), coalesce(p_descripcion, ''))
      returning * into guardado;
  else
    update public.cc_productos set
      tienda_id   = p_tienda_id,
      nombre      = p_nombre,
      venta       = p_venta,
      unidades    = p_unidades,
      categoria   = coalesce(p_categoria, ''),
      descripcion = coalesce(p_descripcion, '')
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

revoke all on function public.cc_guardar_producto(text, text, text, numeric, integer, text, numeric, integer, text, text) from public, anon, authenticated;
grant execute on function public.cc_guardar_producto(text, text, text, numeric, integer, text, numeric, integer, text, text) to authenticated;

-- ---------------------------------------------------------------
-- Fotos: un depósito público de solo lectura.
-- Verlas puede cualquiera, porque están en el catálogo. Subirlas,
-- cambiarlas y borrarlas, solo un administrador autorizado.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('fotos', 'fotos', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'cc_fotos_ver'
  ) then
    create policy cc_fotos_ver on storage.objects
      for select to anon, authenticated using (bucket_id = 'fotos');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'cc_fotos_subir'
  ) then
    create policy cc_fotos_subir on storage.objects
      for insert to authenticated
      with check (bucket_id = 'fotos' and (select cuentas_claras_privado.es_admin()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'cc_fotos_cambiar'
  ) then
    create policy cc_fotos_cambiar on storage.objects
      for update to authenticated
      using (bucket_id = 'fotos' and (select cuentas_claras_privado.es_admin()))
      with check (bucket_id = 'fotos' and (select cuentas_claras_privado.es_admin()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'cc_fotos_borrar'
  ) then
    create policy cc_fotos_borrar on storage.objects
      for delete to authenticated
      using (bucket_id = 'fotos' and (select cuentas_claras_privado.es_admin()));
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;

select 'Catálogo preparado. Publica tus tiendas y productos desde el panel.' as resultado;
