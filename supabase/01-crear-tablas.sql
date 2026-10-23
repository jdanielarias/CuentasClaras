-- Cuentas Claras: ejecutar completo en SQL Editor del proyecto Supabase.
-- Crea la estructura vacía. No importa datos ni publica productos.
-- Los administradores autorizados podrán gestionar todas las tiendas.
-- Puede repetirse sobre esta misma estructura sin borrar registros.
begin;

create schema if not exists cuentas_claras_privado;
revoke all on schema cuentas_claras_privado from public, anon, authenticated;
grant usage on schema cuentas_claras_privado to authenticated;

-- Tener una cuenta de Auth no convierte a nadie en administrador.
-- La autorización se asigna desde SQL Editor con 02-autorizar-admin.sql.
create table if not exists cuentas_claras_privado.administradores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  creado timestamptz not null default now()
);
alter table cuentas_claras_privado.administradores enable row level security;
revoke all on cuentas_claras_privado.administradores from public, anon, authenticated;

create or replace function cuentas_claras_privado.es_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from cuentas_claras_privado.administradores
    where usuario_id = (select auth.uid())
  );
$$;
revoke all on function cuentas_claras_privado.es_admin() from public, anon, authenticated;
grant execute on function cuentas_claras_privado.es_admin() to authenticated;

-- Identificadores de texto para conservar los IDs del JSON de la app actual.
create table if not exists public.cc_tiendas (
  id text primary key default gen_random_uuid()::text,
  nombre text not null check (length(trim(nombre)) > 0),
  tema text not null default 'verde',
  slug text unique,
  whatsapp text not null default '',
  publicada boolean not null default false,
  creada timestamptz not null default now()
);

-- Esta tabla contiene exclusivamente información apta para el catálogo.
create table if not exists public.cc_productos (
  id text primary key default gen_random_uuid()::text,
  tienda_id text not null references public.cc_tiendas(id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  venta numeric(14,2) not null check (venta >= 0),
  unidades integer not null default 0 check (unidades >= 0),
  categoria text not null default '',
  descripcion text not null default '',
  fotos text[] not null default '{}',
  publicado boolean not null default false,
  creado timestamptz not null default now()
);
create index if not exists cc_productos_tienda_idx on public.cc_productos(tienda_id);

-- Costos, notas y alertas de inventario: acceso solo del administrador.
create table if not exists public.cc_producto_interno (
  producto_id text primary key references public.cc_productos(id) on delete cascade,
  compra numeric(14,2) check (compra >= 0),
  minimo integer not null default 1 check (minimo >= 0),
  notas text not null default ''
);

-- Los valores de cada venta conservan el precio y costo de ese momento.
-- Al integrar la app, el registro/anulación de venta y el descuento/devolución
-- de unidades se implementarán juntos en una transacción del servidor.
create table if not exists public.cc_ventas (
  id text primary key default gen_random_uuid()::text,
  tienda_id text not null references public.cc_tiendas(id) on delete restrict,
  producto_id text references public.cc_productos(id) on delete set null,
  nombre text not null,
  cantidad integer not null check (cantidad > 0),
  compra numeric(14,2) check (compra >= 0),
  venta numeric(14,2) not null check (venta >= 0),
  fecha timestamptz not null default now()
);
create index if not exists cc_ventas_tienda_fecha_idx on public.cc_ventas(tienda_id, fecha);
create index if not exists cc_ventas_producto_idx on public.cc_ventas(producto_id);

create table if not exists public.cc_gastos (
  id text primary key default gen_random_uuid()::text,
  tienda_id text not null references public.cc_tiendas(id) on delete restrict,
  monto numeric(14,2) not null check (monto > 0),
  categoria text not null default '',
  descripcion text not null default '',
  proveedor text not null default '',
  fecha date not null default current_date,
  creado timestamptz not null default now()
);
create index if not exists cc_gastos_tienda_fecha_idx on public.cc_gastos(tienda_id, fecha);

-- Permisos explícitos, incluso si se activó la exposición automática de tablas.
grant usage on schema public to anon, authenticated;
revoke all on public.cc_tiendas, public.cc_productos, public.cc_producto_interno,
  public.cc_ventas, public.cc_gastos from public, anon, authenticated;
grant select on public.cc_tiendas, public.cc_productos to anon;
grant select, insert, update, delete on public.cc_tiendas, public.cc_productos,
  public.cc_producto_interno, public.cc_ventas, public.cc_gastos to authenticated;

-- Activa RLS y crea una política por operación para el administrador.
-- Los nombres de tablas proceden de esta lista fija, no de entradas del usuario.
do $$
declare
  tabla text;
  accion text;
  nombre_politica text;
begin
  foreach tabla in array array[
    'cc_tiendas', 'cc_productos', 'cc_producto_interno', 'cc_ventas', 'cc_gastos'
  ] loop
    execute format('alter table public.%I enable row level security', tabla);
    foreach accion in array array['select', 'insert', 'update', 'delete'] loop
      nombre_politica := 'cc_admin_' || accion;
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = tabla and policyname = nombre_politica
      ) then
        if accion = 'insert' then
          execute format(
            'create policy %I on public.%I for insert to authenticated
             with check ((select cuentas_claras_privado.es_admin()))',
            nombre_politica, tabla
          );
        elsif accion = 'update' then
          execute format(
            'create policy %I on public.%I for update to authenticated
             using ((select cuentas_claras_privado.es_admin()))
             with check ((select cuentas_claras_privado.es_admin()))',
            nombre_politica, tabla
          );
        else
          execute format(
            'create policy %I on public.%I for %s to authenticated
             using ((select cuentas_claras_privado.es_admin()))',
            nombre_politica, tabla, accion
          );
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

-- El público solo lee tiendas publicadas y productos publicados de esas tiendas.
-- También se aplica a cuentas registradas sin autorización de administrador.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
    and tablename = 'cc_tiendas' and policyname = 'cc_catalogo_tiendas'
  ) then
    create policy cc_catalogo_tiendas on public.cc_tiendas
      for select to anon, authenticated using (publicada);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
    and tablename = 'cc_productos' and policyname = 'cc_catalogo_productos'
  ) then
    create policy cc_catalogo_productos on public.cc_productos
      for select to anon, authenticated
      using (
        publicado and exists (
          select 1 from public.cc_tiendas t
          where t.id = tienda_id and t.publicada
        )
      );
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;

select 'Estructura de Cuentas Claras creada. Falta autorizar al administrador.' as resultado;
