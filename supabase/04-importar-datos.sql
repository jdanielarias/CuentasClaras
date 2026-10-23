-- Importación de los datos del celular a Supabase.
-- Generado desde la copia de seguridad del 22 de septiembre de 2026,
-- con las dos "Argollas ancla" ya unificadas en una sola (13 unidades, $20.000).
-- Ejecutar después de 01-crear-tablas.sql, en SQL Editor.
-- Conserva los identificadores originales del celular.
-- Puede repetirse sin duplicar: lo que ya exista se deja como está.
begin;

-- Tiendas
insert into public.cc_tiendas (id, nombre, tema) values
  ('mswdz3vzgfhb5m', 'Lizzmaraccesorios', 'dorado'),
  ('mswdz3w0ilfdds', 'Venusstore', 'rosa'),
  ('mswdz3w062y1qn', 'Perfumes', 'azul')
on conflict (id) do nothing;

-- Productos (lo que puede verse en un catálogo)
insert into public.cc_productos (id, tienda_id, nombre, venta, unidades, categoria, creado) values
  ('mswe0vjcjk7j9s', 'mswdz3w0ilfdds', 'Labial', 12000, 2, 'Labios', '2026-08-16T22:39:48.648Z'),
  ('mswe2e2imkthvw', 'mswdz3w0ilfdds', 'Labial trendy', 15000, 1, 'Labios', '2026-08-16T22:40:59.322Z'),
  ('mswe49o10i3601', 'mswdz3w0ilfdds', 'Polvo engol', 15000, 1, 'Rostro', '2026-08-16T22:42:26.929Z'),
  ('mt0n29a22rc8n0', 'mswdz3vzgfhb5m', 'Argollas ancla', 20000, 13, 'Argollas', '2026-08-19T22:03:54.362Z'),
  ('mt0n6sar39qmr4', 'mswdz3vzgfhb5m', 'Anillos Ancla', 19000, 5, 'Anillos', '2026-08-19T22:07:25.636Z'),
  ('mt0n93i1d10lum', 'mswdz3vzgfhb5m', 'Topos ancla', 18000, 11, 'Topos', '2026-08-19T22:09:13.465Z'),
  ('mt0nawdlisnyqf', 'mswdz3vzgfhb5m', 'Cadenas ancla', 12000, 2, 'Cadenas', '2026-08-19T22:10:37.545Z'),
  ('mtgdmklg0vbi97', 'mswdz3w062y1qn', 'Florrata', 160000, 2, 'Mujer', '2026-08-30T22:24:04.804Z'),
  ('mtgdnbcqa018ct', 'mswdz3w062y1qn', 'Pomada moldeadora', 35000, 2, 'Hombre', '2026-08-30T22:24:39.482Z'),
  ('mtgdtlbfmm95k4', 'mswdz3w062y1qn', 'Homem clasico', 160000, 1, 'Hombre', '2026-08-30T22:29:32.331Z'),
  ('mtgdvah359576c', 'mswdz3w062y1qn', 'Bleu', 100000, 1, 'Hombre', '2026-08-30T22:30:51.591Z'),
  ('mtgdx9ghr3003m', 'mswdz3w062y1qn', 'Winner', 75000, 1, 'Hombre', '2026-08-30T22:32:23.585Z'),
  ('mtgdxupy3ms8jq', 'mswdz3w062y1qn', 'Splash', 35000, 2, 'Hombre', '2026-08-30T22:32:51.142Z'),
  ('mtgdynzsrphm6e', 'mswdz3w062y1qn', 'Musk', 40000, 1, 'Hombre', '2026-08-30T22:33:29.080Z'),
  ('mtge175dk1qxxo', 'mswdz3w062y1qn', 'Talco pies', 40000, 1, 'Hombre', '2026-08-30T22:35:27.217Z'),
  ('mtge1v0mbdjg7n', 'mswdz3w062y1qn', 'Ble femme', 80000, 2, 'Mujer', '2026-08-30T22:35:58.150Z'),
  ('mtge2i4mu2leq0', 'mswdz3w062y1qn', 'Vibranza', 70000, 1, 'Mujer', '2026-08-30T22:36:28.102Z'),
  ('mtge31vuegl1o5', 'mswdz3w062y1qn', 'Impredecible', 70000, 1, 'Mujer', '2026-08-30T22:36:53.706Z'),
  ('mtge45bnvj5xr1', 'mswdz3w062y1qn', 'Body spirit', 100000, 1, 'Mujer', '2026-08-30T22:37:44.819Z'),
  ('mtge4yw3mw9m5d', 'mswdz3w062y1qn', 'Miss lbel', 90000, 1, 'Mujer', '2026-08-30T22:38:23.139Z'),
  ('mtge5u32zl1svy', 'mswdz3w062y1qn', 'Cielo', 130000, 1, 'Mujer', '2026-08-30T22:39:03.566Z'),
  ('mtge703bvx8tm7', 'mswdz3w062y1qn', 'Humor', 130000, 1, 'Mujer', '2026-08-30T22:39:58.007Z'),
  ('mtge8955nwjgyt', 'mswdz3w062y1qn', 'Identity', 45000, 1, 'Mujer', '2026-08-30T22:40:56.393Z'),
  ('mtge8rqmckrqub', 'mswdz3w062y1qn', 'Acai', 55000, 1, 'Mujer', '2026-08-30T22:41:20.494Z'),
  ('mtge9xjd6267cm', 'mswdz3w062y1qn', 'Aqua fresca', 90000, 1, 'Mujer', '2026-08-30T22:42:14.665Z'),
  ('mtgedfdrrphee2', 'mswdz3w062y1qn', 'Castaña', 110000, 1, 'Mujer', '2026-08-30T22:44:57.759Z'),
  ('mtgedvkbxflzex', 'mswdz3w062y1qn', 'Estoraque', 80000, 1, 'Mujer', '2026-08-30T22:45:18.731Z'),
  ('mtgehhsgm4rp05', 'mswdz3w062y1qn', 'Taste', 25000, 2, 'Mujer', '2026-08-30T22:48:07.505Z'),
  ('mtgehz8udgu94o', 'mswdz3w062y1qn', 'Humor splash', 45000, 1, 'Mujer', '2026-08-30T22:48:30.126Z'),
  ('mu7ls0xd69h5zm', 'mswdz3vzgfhb5m', 'Maxitopos preziosa', 18000, 18, 'Maxitopo', '2026-09-18T23:42:02.929Z'),
  ('mu7lv4n6e32p9o', 'mswdz3vzgfhb5m', 'Minitopos x3 preziosa', 10000, 17, 'Mini topos', '2026-09-18T23:44:27.714Z'),
  ('mu7lxiuzbh7h7t', 'mswdz3vzgfhb5m', 'Collar rojo preziosa', 35000, 1, 'Collares', '2026-09-18T23:46:19.451Z'),
  ('mu7m3xx4okwlr3', 'mswdz3vzgfhb5m', 'Set corazon + manilla preziosa', 45000, 5, 'Set', '2026-09-18T23:51:18.904Z'),
  ('mu7m680h0k9yov', 'mswdz3vzgfhb5m', 'Set sencillo preziosa', 32000, 8, 'Set', '2026-09-18T23:53:05.297Z'),
  ('mu7mdp4bi0odw8', 'mswdz3vzgfhb5m', 'Trio pulseras preziosa', 35000, 3, 'Pulseras', '2026-09-18T23:58:54.059Z'),
  ('mu7mecb72uzswt', 'mswdz3vzgfhb5m', 'Pulsera perla', 12000, 1, 'Pulseras', '2026-09-18T23:59:24.115Z'),
  ('mu7mezsk1vt0o6', 'mswdz3vzgfhb5m', 'Pulsera balin grande', 17000, 2, 'Pulseras', '2026-09-18T23:59:54.548Z')
on conflict (id) do nothing;

-- Costos, mínimos y notas (privado, nunca público)
insert into public.cc_producto_interno (producto_id, compra, minimo, notas) values
  ('mswe0vjcjk7j9s', null, 1, ''),
  ('mswe2e2imkthvw', 5000, 1, ''),
  ('mswe49o10i3601', null, 1, ''),
  ('mt0n29a22rc8n0', 7000, 1, ''),
  ('mt0n6sar39qmr4', 7000, 1, ''),
  ('mt0n93i1d10lum', 7000, 1, ''),
  ('mt0nawdlisnyqf', 3500, 1, ''),
  ('mtgdmklg0vbi97', 68000, 1, ''),
  ('mtgdnbcqa018ct', 16000, 1, ''),
  ('mtgdtlbfmm95k4', null, 1, ''),
  ('mtgdvah359576c', null, 1, ''),
  ('mtgdx9ghr3003m', null, 1, ''),
  ('mtgdxupy3ms8jq', null, 1, ''),
  ('mtgdynzsrphm6e', null, 1, ''),
  ('mtge175dk1qxxo', null, 1, ''),
  ('mtge1v0mbdjg7n', null, 1, ''),
  ('mtge2i4mu2leq0', null, 1, ''),
  ('mtge31vuegl1o5', null, 1, ''),
  ('mtge45bnvj5xr1', null, 1, ''),
  ('mtge4yw3mw9m5d', null, 1, ''),
  ('mtge5u32zl1svy', null, 1, ''),
  ('mtge703bvx8tm7', null, 1, ''),
  ('mtge8955nwjgyt', null, 1, ''),
  ('mtge8rqmckrqub', null, 1, ''),
  ('mtge9xjd6267cm', null, 1, ''),
  ('mtgedfdrrphee2', null, 1, ''),
  ('mtgedvkbxflzex', null, 1, ''),
  ('mtgehhsgm4rp05', null, 1, ''),
  ('mtgehz8udgu94o', null, 1, ''),
  ('mu7ls0xd69h5zm', 5000, 1, ''),
  ('mu7lv4n6e32p9o', 3700, 1, ''),
  ('mu7lxiuzbh7h7t', 14000, 1, ''),
  ('mu7m3xx4okwlr3', 20000, 1, ''),
  ('mu7m680h0k9yov', 12000, 1, ''),
  ('mu7mdp4bi0odw8', 12000, 1, ''),
  ('mu7mecb72uzswt', 4000, 1, ''),
  ('mu7mezsk1vt0o6', 6000, 1, '')
on conflict (producto_id) do nothing;

-- Ventas ya registradas (las unidades ya estaban descontadas en el celular)
insert into public.cc_ventas (id, tienda_id, producto_id, nombre, cantidad, compra, venta, fecha) values
  ('mswe2qm1kfquvn', 'mswdz3w0ilfdds', 'mswe0vjcjk7j9s', 'Labial', 1, null, 12000, '2026-08-16T22:41:15.577Z')
on conflict (id) do nothing;

-- No había gastos que importar.

commit;

-- Comprueba que llegó todo: deben salir 3 tiendas, 37 productos,
-- 117 unidades, 1 venta(s) y 0 gasto(s).
select
  (select count(*) from public.cc_tiendas)   as tiendas,
  (select count(*) from public.cc_productos) as productos,
  (select coalesce(sum(unidades), 0) from public.cc_productos) as unidades,
  (select count(*) from public.cc_ventas)    as ventas,
  (select count(*) from public.cc_gastos)    as gastos;
