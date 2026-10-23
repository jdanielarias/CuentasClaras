-- Ejecutar después de 01-crear-tablas.sql.
-- Primero crea tu usuario en Authentication > Users del panel Supabase.
-- Pega su UID en lugar de PEGAR_UID_DEL_USUARIO, conservando las comillas.
-- Ese usuario administrará TODAS las tiendas de esta instalación.
-- Ejecuta esto desde SQL Editor. No se ejecuta desde el navegador de la tienda.
begin;
do $$
declare
  usuario uuid := 'PEGAR_UID_DEL_USUARIO';
begin
  if not exists (select 1 from auth.users where id = usuario) then
    raise exception 'No existe ese usuario en Authentication > Users.';
  end if;
  insert into cuentas_claras_privado.administradores(usuario_id)
    values (usuario) on conflict (usuario_id) do nothing;
end;
$$;
commit;

select 'Administrador autorizado.' as resultado;
