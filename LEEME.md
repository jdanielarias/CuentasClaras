# Cuentas Claras

App de inventario, ventas y gastos. Hecha para usarse en el celular.

## Qué hace

**Tiendas**
- La app maneja **varias tiendas independientes**: Lizzmaraccesorios, Venusstore y una tercera.
- Se cambia de tienda tocando el nombre en la barra de arriba.
- Cada tienda tiene **su propio inventario, sus ventas, sus gastos y su resumen**. No se mezcla nada.
- Cada tienda tiene además **su propio color e ícono**, y la app entera se repinta al cambiar de una
  a otra: barra, botones, pestañas y hasta el color de la barra de estado del Android. Así es
  imposible registrar algo en la tienda equivocada sin darse cuenta.
  - Lizzmaraccesorios: dorado 💎 (accesorios, bisutería)
  - Venusstore: rosa 💄 (maquillaje)
  - La tercera arranca en azul 🛒 hasta que le pongan nombre e identidad.
- Con el lápiz se abre el editor: nombre, 12 íconos y 6 colores, con vista previa en vivo.
- También se pueden borrar tiendas o agregar más.

**Inventario**
- Cada producto se registra con **nombre, precio de compra y precio de venta** (los dos, aparte).
- El **precio de compra es opcional**: para la mercancía vieja que ya no se sabe en cuánto se compró,
  se deja vacío. Ese producto suma solo en "Si vendo todo"; no entra en "Invertido" ni en "Ganancia",
  y la app avisa en amarillo cuántos productos están en esa situación.
- Se ve **cuántas unidades** hay de cada uno, en grande.
- Arriba, sumado todo:
  - **Invertido** — la suma de `precio de compra × unidades` (solo de los que tienen ese precio).
  - **Si vendo todo** — la suma de `precio de venta × unidades` (de todos).
  - **Ganancia** — la diferencia, solo sobre los que tienen precio de compra.
- Mientras escribes los precios, te dice cuánto ganas por unidad y el porcentaje.
- Los productos con pocas unidades quedan marcados en naranja; los agotados, en rojo.
- Buscador y orden (A-Z, menos unidades, más ganancia, más reciente).

**Filtro por categoría**
- Cada producto puede llevar una categoría (aretes, collares, labiales...).
- Debajo del buscador salen botones con las categorías de esa tienda: un toque y quedan solo esos.
- Al filtrar, **los totales de arriba pasan a ser de esa categoría** (cuánto hay invertido en aretes,
  por ejemplo), con un aviso rosado que lo recuerda.
- El filtro y el orden funcionan juntos: se puede ver *solo aretes* ordenados por *más ganancia*.
- El botón "Sin categoría" solo aparece si quedan productos sueltos por clasificar.

**Ventas**
- Botón **Vender** en cada producto: eliges la cantidad, puedes bajar el precio si diste rebaja, y confirmas.
- Descuenta las unidades del inventario y guarda la venta con la ganancia real de ese momento.
- El historial se ve por día, con el total vendido, el costo y la ganancia del periodo.
- Si el producto no tenía precio de compra, la venta se registra por su valor completo pero su
  ganancia no se calcula, y la app lo aclara para que el número no se lea como si fuera todo.
- Si te equivocaste, la **×** anula la venta y devuelve las unidades al inventario.

**Gastos** (pestaña aparte, independiente del inventario)
- Valor, categoría, descripción, fecha y proveedor.
- Total del periodo y desglose por categoría.

**Resumen**
- Ventas − costo de lo vendido = ganancia de las ventas.
- Menos los gastos = **lo que realmente quedó**.
- Lo que más se vendió y una foto del inventario actual.

Todas las pestañas se filtran por: hoy, esta semana, este mes, este año, o todo.

## Dónde se guardan los datos

En **Supabase**, no en el celular. Se entra con correo y contraseña, y los mismos datos
se ven desde cualquier dispositivo. Si se desinstala la app o se cambia de teléfono, no
se pierde nada.

Tener cuenta no basta para entrar: el usuario tiene que estar autorizado como
administrador (ver `supabase/LEEME.md`).

**Sin internet** se puede consultar lo último que se cargó —queda una copia de solo
lectura en el dispositivo, y arriba aparece un aviso con la fecha de esa copia—, pero
**no se puede registrar** nada: ni ventas, ni gastos, ni productos. Es a propósito: así
dos celulares no pueden pisarse los datos. Al volver la señal, la app se recarga sola.

Al cerrar sesión esa copia local se borra.

Aun con los datos en la nube, **Guardar copia** (menú ⚙ arriba a la derecha) sigue ahí y
conviene usarla de vez en cuando: baja un `.json` que es tuyo y no depende de nadie.
**Restaurar copia** reemplaza todo lo que hay en la nube por el contenido de ese archivo,
en todos los dispositivos.

### Qué ve un desconocido

Nada. Las tablas tienen Row Level Security: sin sesión autorizada no se devuelve ni una
fila. Los precios de compra, las notas y los mínimos viven además en una tabla aparte
(`cc_producto_interno`) que nunca será pública, ni siquiera cuando se publique el catálogo.

## El catálogo público

Los clientes entran a `/catalogo.html`. Es una página aparte, con conexión anónima
propia: no inicia sesión, no toca la del panel y solo puede leer lo que las políticas
de la base de datos dejan ver a un desconocido.

Todo empieza apagado. Para que algo se vea hacen falta **las dos llaves**:

1. La tienda, marcada en ⚙ → su lápiz → *Vender esta tienda en el catálogo*.
2. El producto, marcado en su ficha → *Mostrar este producto*.

Apagar una tienda esconde todos sus productos de golpe, sin desmarcarlos uno a uno.

El nombre del catálogo, el número de WhatsApp y su color se configuran en
⚙ → **Tienda pública**. Ahí mismo se ve cuántos productos está viendo el cliente
ahora mismo, y hay un enlace para abrirlo.

Del inventario solo salen el nombre, el precio de venta, la categoría, la descripción
y las fotos. El precio de compra, la ganancia, las notas, las ventas y los gastos no
llegan siquiera al navegador del cliente.

Las unidades no se muestran: si quedan 3 o menos aparece «Quedan pocas», y si no
queda ninguna, «Agotado» y no se puede pedir. El pedido se arma en el navegador del
cliente y sale como mensaje de WhatsApp; no se guarda nada en la base de datos ni se
descuenta inventario. La venta la registras tú en el panel cuando la cierres.

### Buscador

Arriba del catálogo, pegado a las categorías (los dos se quedan a la vista al bajar),
hay un buscador. No distingue tildes ni mayúsculas —«traslucido» encuentra
«Traslúcido»— y busca en el nombre, la categoría, la descripción y los nombres de los
tonos. Si se escriben varias palabras, tienen que estar todas.

Se combina con la categoría elegida. Si esa combinación no da nada pero la búsqueda sí
encontraría algo en otra categoría, ofrece «Buscar en todo el catálogo». Y si se busca
un tono («nude»), la ficha del producto se abre ya con ese tono seleccionado.

### Productos con tonos

Lo que viene en varios tonos (labiales, polvos, esmaltes) **se edita como un solo
producto**. En su ficha se enciende *Viene en varios tonos* y aparece una lista:
un renglón por tono, con su nombre y sus unidades. Ahí se añaden, se cambian y se
quitan. El nombre, los precios, la categoría, la descripción y las fotos son del
producto entero.

Por dentro, cada tono es una fila propia de `cc_productos` con las mismas columnas
y distinto `tono`. Eso es lo que hace que vender el *Tono 2* descuente el *Tono 2*
y no los demás, reutilizando el registro de ventas que ya existía. Al guardar, la
app actualiza los tonos que ya estaban, crea los nuevos y borra los que quitaste
—avisando antes de cuántas unidades se pierden—. El historial de ventas guarda
«Polvo suelto · Tono 2», así que sigue diciendo qué tono se vendió aunque el
producto cambie después.

En el inventario los tonos se ven como renglones separados, con el tono en una
etiqueta junto al nombre, para que puedas ver de un vistazo cuántos quedan de cada
uno y vender el que toque. Al tocar *Editar* en cualquiera de ellos se abre el
producto entero con todos sus tonos.

Cada tono puede llevar **su propia foto**: el cuadrito con la cámara al inicio de su
fila. En el catálogo, al tocar un tono, la foto grande cambia a la de ese tono, y su
botón la lleva en miniatura, redonda como una muestra de color. Las fotos generales
del producto (la carta de tonos, por ejemplo) siguen debajo como miniaturas. Un tono
sin foto propia muestra las generales.

En el catálogo el cliente ve **una sola ficha** con los tonos para elegir. Un tono
sin existencias sale tachado y no se puede pedir; si se acaban todos, el producto
entero queda agotado.

### Diseño

El catálogo es la misma identidad del panel llevada a un catálogo impreso: Fraunces
en grande, retícula dibujada con filetes de un píxel, productos numerados y el pedido
presentado como una nota de venta con puntos suspensivos entre el nombre y el precio.
Sin fotos no queda un hueco roto: se muestra una lámina con la inicial del producto,
igual que el monograma de las tiendas.

La portada la encabeza `icons/logos.webp`, el lockup de Venus Store y LizzMar. Se le
quitó el fondo (transparente) para que se apoye en el papel sin recuadro, y pesa 83 KB.
Si esa imagen no cargara, el título vuelve a escribirse con tipografía: el nombre del
catálogo sigue saliendo de ⚙ → Tienda pública.

El **color del catálogo** (⚙ → Tienda pública) se reserva para lo que el cliente toca:
el botón de enviar el pedido, la barra inferior, la categoría seleccionada y el tono
elegido. Los textos y las fotos siguen en negro sobre papel, así que la página no se
convierte en un muestrario de colores: el color señala dónde se actúa.

## Probarla desde el computador

```bash
python -m http.server 5173 --directory "D:\Escritorio\CuentasClaras"
```

Luego abrir `http://localhost:5173` en el navegador.

## Probarla en el celular (misma red WiFi)

Con el servidor de arriba corriendo (pero con `--bind 0.0.0.0`), abrir en el celular:

```
http://192.168.1.103:5173
```

Así se prueba todo, pero **no** se puede instalar en la pantalla de inicio: para eso
el sitio tiene que estar en `https` o en `localhost`.

## Publicar una versión nueva

El sitio vive en Netlify, en el proyecto **cuentas-claras-lizz**.

Manual: entrar al proyecto en Netlify → pestaña **Deploys** → arrastrar el zip ahí.
Ojo: en *Deploys*, no en "Add new project" (eso crearía un sitio aparte con otra dirección).

Por consola, después de `npx netlify-cli login` una sola vez:

```bash
npx netlify-cli deploy --prod --dir="D:\Escritorio\CuentasClaras"
```

En los dos casos la dirección no cambia y el celular se actualiza solo la próxima vez
que abra la app con internet. Nadie pierde datos.

## Instalarla en el celular

Abrir la dirección en Chrome → menú (⋮) → **"Añadir a pantalla de inicio"**.
Desde ahí abre a pantalla completa, sin barra del navegador, y funciona sin internet.

## Archivos

## Diseño

- **Tipografía**: Fraunces (serif) para nombres y títulos, Manrope (sans) para datos y cifras.
  Las dos viven en `fonts/`, no se piden a Google: la app se ve igual sin internet y no
  filtra visitas a terceros.
- Las cifras usan numeración tabular, así no bailan de ancho al cambiar de valor.
- **Íconos dibujados en SVG**, no emoji. Cada tienda se identifica con el monograma de su
  inicial en serif, no con una carita.
- Paleta de neutros cálidos (papel, no gris) y seis tonos profundos para las tiendas.
  Los hex de `TEMAS` en `app.js` **tienen que coincidir** con los de `--marca` en
  `styles.css`: de ahí salen las muestras del editor, el monograma y el color de la
  barra de estado del Android.
- Tarjetas con borde de un pixel en vez de sombras difusas.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La estructura de las pantallas, incluida la de entrar |
| `tokens.css` | Tipos, paleta y radios, compartidos por el panel y el catálogo |
| `styles.css` | Los estilos del panel y los temas de cada tienda |
| `app.js` | La pantalla: productos, ventas, gastos, totales, sesión |
| `datos.js` | La conexión con Supabase: leer, guardar y traducir errores |
| `catalogo.html` · `catalogo.css` · `catalogo.js` | El catálogo que ven los clientes |
| `supabase-config.js` | Dirección y clave pública del proyecto (no es secreta) |
| `supabase/` | Los scripts SQL que crean y llenan la base de datos |
| `vendor/supabase.js` | La librería de Supabase, guardada aquí para no depender de un CDN |
| `fonts/` | Las dos tipografías (90 KB) |
| `manifest.webmanifest` | Lo que la hace instalable |
| `sw.js` | Hace que abra sin internet |
| `icons/` | El icono de la app y `logos.webp`, el lockup de las dos marcas |

| `netlify.toml` | Impide que los scripts de `supabase/` queden accesibles en internet |

**Nunca pongas archivos `.json` de copias de seguridad en esta carpeta**: al publicar se
sube entera, y quedarían accesibles desde internet con tus costos y ganancias dentro.
Las copias van en `D:\Escritorio\CuentasClaras-copias`.
