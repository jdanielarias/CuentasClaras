# Preparación de Supabase para Cuentas Claras

Estado: todo ejecutado. El panel y el catálogo público están conectados,
con los datos importados y los tonos activos. Los scripts quedan aquí como
referencia y por si hay que rehacer el proyecto desde cero.

Los scripts se ejecutan **en orden** y una sola vez cada uno:

| Script | Qué hace | ¿Repetible? |
|---|---|---|
| `01-crear-tablas.sql` | Crea las tablas y los permisos | Sí |
| `02-autorizar-admin.sql` | Da permiso de administrador a tu usuario | Sí |
| `03-operaciones.sql` | Crea las operaciones que no pueden quedar a medias | Sí |
| `04-importar-datos.sql` | Sube tus productos, ventas y gastos del celular | Sí, no duplica |
| `05-catalogo.sql` | Prepara el catálogo público y el depósito de fotos | Sí |
| `06-tonos.sql` | Añade el tono a los productos que vienen en varios | Sí |
| `07-foto-tono.sql` | Una foto propia por tono; restaurar copias devuelve fotos y publicación | Sí |

## 1. Crear las tablas

1. Abre tu proyecto en Supabase y entra en **SQL Editor** (icono `>_` de la izquierda).
2. Abre una consulta nueva.
3. Copia TODO el contenido de `01-crear-tablas.sql`, pégalo y pulsa **Run**.
4. El resultado esperado es: **Estructura de Cuentas Claras creada. Falta autorizar al administrador.**

El script crea tablas vacías y permisos en una transacción. Puede repetirse sin
borrar registros de esta estructura. No sustituye una migración de un esquema
diferente: si aparece un error, conserva su texto para revisar la causa.

## 2. Crear y autorizar el usuario del panel

1. En **Authentication > Users**, crea el usuario con el correo y contraseña que
   usarás para entrar en Cuentas Claras. La cuenta de acceso al dashboard de
   Supabase y este usuario de tu aplicación son cuentas independientes.
2. Copia el **UID** de ese usuario.
3. En una consulta nueva del SQL Editor, pega `02-autorizar-admin.sql` y reemplaza
   `PEGAR_UID_DEL_USUARIO` por el UID, dejando las comillas.
4. Pulsa **Run**. Debe aparecer **Administrador autorizado.**

Solo los usuarios añadidos a `cuentas_claras_privado.administradores` pueden
administrar. Registrarse o iniciar sesión por sí solo no concede ese permiso.
Cada administrador autorizado tiene acceso a todas las tiendas de esta instalación.

## 3. Completar la configuración pública

Abre `D:\Escritorio\CuentasClaras\supabase-config.js` en un editor de texto.
La URL se tomó de la captura del proyecto; comprueba que coincide con tu panel.
Pega la clave **Publishable key**, que empieza por `sb_publishable_`, entre las
comillas vacías de `publishableKey`. Guarda el archivo.

No se necesitan contraseñas de base de datos, claves `sb_secret_` ni `service_role`
en este archivo. La clave pública identifica el proyecto; los permisos RLS y el
usuario conectado controlan el acceso.

## 4. Crear las operaciones e importar los datos

1. En SQL Editor, ejecuta `03-operaciones.sql`. Debe aparecer
   **Operaciones creadas.**
2. Después ejecuta `04-importar-datos.sql`. Al final devuelve una tabla con las
   cantidades: deben salir **3 tiendas, 37 productos, 117 unidades, 1 venta y 0 gastos**.
   Si no coinciden, no sigas y revisa el mensaje.

`04` contiene los datos de la copia del 22 de septiembre de 2026, con las dos
"Argollas ancla" ya unificadas en una sola de 13 unidades a $20.000.

## Tablas y privacidad

| Tabla | Contenido | Lectura pública |
|---|---|---|
| `cc_tiendas` | Nombre, tema, dirección corta y WhatsApp comercial | Solo tiendas publicadas |
| `cc_productos` | Nombre, categoría, descripción, precio de venta, unidades y enlaces a fotos | Solo productos publicados en tiendas publicadas |
| `cc_producto_interno` | Precio de compra, notas y mínimo de inventario | No |
| `cc_ventas` | Historial con precios y costos de cada venta | No |
| `cc_gastos` | Gastos y proveedores | No |

Las tiendas y productos nuevos empiezan ocultos. `compra` puede ser `null` para
mantener los productos cuyo costo se desconoce. Los IDs son texto para poder
conservar los del JSON actual. Las fotos se guardan en el depósito `fotos`;
en `cc_productos.fotos` solo van sus direcciones, en el orden en que se ven.

## Operaciones del servidor (`03-operaciones.sql`)

Lo que no puede quedar a medias no se hace desde el navegador, sino con una
función que el servidor ejecuta entera o no ejecuta:

| Función | Para qué |
|---|---|
| `cc_guardar_producto` | Guarda la ficha y su costo privado a la vez |
| `cc_registrar_venta` | Registra la venta y descuenta unidades en un paso |
| `cc_anular_venta` | Anula y devuelve las unidades |
| `cc_borrar_tienda` | Borra la tienda con sus productos, ventas y gastos |
| `cc_borrar_todo` | Vacía productos, ventas y gastos; deja las tiendas |
| `cc_restaurar` | Reemplaza todo por el contenido de una copia `.json` |
| `cc_soy_admin` | Dice si la cuenta que entró está autorizada |

Todas son `security invoker`: se ejecutan con los permisos de quien llama, así
que las políticas RLS siguen decidiendo. Una cuenta sin autorización no puede
usarlas aunque las invoque directamente.

`cc_registrar_venta` bloquea la fila del producto (`for update`) para que dos
ventas simultáneas del mismo artículo no lean las mismas unidades disponibles.

## Uso sin conexión

Al cargar, la app guarda en el dispositivo una copia de solo lectura de lo que
trajo del servidor. Sin internet se puede consultar esa copia, con un aviso de
su fecha, pero no registrar nada. Así se evita que dos dispositivos escriban
cambios distintos sobre el mismo dato. La copia se borra al cerrar sesión.

El service worker solo guarda en caché archivos del propio sitio: las respuestas
de Supabase nunca se escriben en el navegador.

## 5. Activar el catálogo

Ejecuta `05-catalogo.sql` en SQL Editor. Debe aparecer **Catálogo preparado.**
No publica nada: todo queda apagado hasta que lo marques desde el panel.

## Qué hace `05-catalogo.sql`

Añade la tabla `cc_catalogo` (una sola fila: nombre, WhatsApp, saludo y color
del catálogo), reemplaza `cc_guardar_producto` por una versión que también
guarda la descripción para el cliente, y crea el depósito de fotos.

Publicar, despublicar y cambiar fotos son `update` normales sobre las tablas:
no hacen falta funciones aparte, porque RLS ya decide quién puede escribir.

| Depósito | Quién puede ver | Quién puede subir y borrar |
|---|---|---|
| `fotos` | Cualquiera: las fotos van en el catálogo | Solo el administrador autorizado |

Las políticas públicas de `cc_tiendas` y `cc_productos` ya existían desde `01`:
un desconocido solo ve tiendas con `publicada` y productos con `publicado` que
además pertenezcan a una tienda publicada. `cc_producto_interno`, `cc_ventas` y
`cc_gastos` no tienen ninguna política pública y le responden *permission denied*.

## 6. Tonos (`06-tonos.sql`)

Añade la columna `tono` a `cc_productos` y actualiza tres funciones:
`cc_guardar_producto` (para guardarlo), `cc_registrar_venta` (para que el
historial diga «Labial mate · Nude») y `cc_restaurar` (para conservarlo en las
copias).

Cada tono es una fila de `cc_productos` con sus propias unidades, así que el
descuento al vender, las anulaciones y los totales funcionan sin cambios. El
panel los edita todos juntos dentro de una sola ficha: al guardar, actualiza los
que existían, inserta los nuevos y borra los que se quitaron. El
catálogo los agrupa por `lower(btrim(nombre))` dentro de la misma tienda, y solo
agrupa los que tienen `tono` distinto de vacío.

## 7. Foto por tono (`07-foto-tono.sql`)

Añade `foto_tono` a `cc_productos`: la ruta, dentro del depósito `fotos`, de la foto
propia de ese tono. Va aparte de `fotos`, que es la galería compartida por todos los
tonos del producto, para que nunca se mezclen.

También reescribe `cc_restaurar`: hasta ahora una copia restaurada volvía sin fotos,
sin lo publicado y sin el WhatsApp de las tiendas. Ahora devuelve todo eso.

El catálogo pide `foto_tono` y, si la columna todavía no existe, repite la consulta
sin ella: publicar la app antes de ejecutar este script no lo rompe.

## Siguiente etapa

- Fotos más livianas: hoy se sube el archivo tal cual, sin redimensionar.
- Publicar o despublicar varios productos de una vez, sin abrir cada ficha.

## Referencias

- [Claves públicas de Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
- [Permisos y Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
