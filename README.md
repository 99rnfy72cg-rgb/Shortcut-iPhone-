# Presupuesto → Atajo de iPhone

Registrar un gasto en el presupuesto de Google Drive en **tres toques**:
abres el atajo → escribes el monto → eliges la categoría. La transacción
queda escrita en la pestaña del mes de tu hoja, en la columna correcta, y
el iPhone te responde cuánto te queda de ese presupuesto.

```
   iPhone (Atajos)                Google Apps Script            Google Sheets
 ┌────────────────┐   HTTPS     ┌──────────────────┐          ┌──────────────┐
 │ 1. ¿Cuánto?    │ ──────────► │ Web App privada  │ ───────► │ Pestaña del  │
 │    25.40       │             │ (tu token)       │          │ mes actual   │
 │ 2. ¿Categoría? │ ◄────────── │ valida, ubica la │ ◄─────── │ Subcategoría │
 │    Groceries   │  respuesta  │ fila y escribe   │          │ Fecha, Monto │
 └────────────────┘             └──────────────────┘          └──────────────┘
        │
        └─► "$25.40 en 🥑 Groceries (Septiembre). Te quedan $419.60 de $465.00."
```

Está hecho a la medida de la plantilla **PRESUPUESTO + PATRIMONIO NETO**
(la de las pestañas `Presupuesto`, `Enero`…`Diciembre` y `Patrimonio Neto`),
que es la que usa `💵 Presupuesto Oskar 2026`.

---

## Qué hace exactamente

* Detecta sola la pestaña del **mes actual** (o el mes que le indiques).
* Detecta sola la fila de encabezado `Subcategoría | Fecha | Monto | N✏️` y
  los seis bloques de categorías. **No hay filas ni columnas fijas en el
  código**, así que sigue funcionando si agregas filas o mueves cosas.
* Escribe la transacción **debajo de la última usada** de esa categoría, sin
  rellenar huecos y sin tocar fórmulas.
* Usa el **nombre exacto** de la subcategoría (varias terminan en espacio,
  como `"🥑 Groceries "`), para que la validación de datos y los `SUMIF` del
  resumen mensual la sumen bien.
* Te devuelve **estimado, gastado y restante** de esa subcategoría.
* El menú de categorías del atajo se lee **de la hoja en vivo**: si cambias
  las subcategorías en la pestaña `Presupuesto`, el atajo se actualiza solo.

---

## Instalación (10 minutos, una sola vez)

### 1. Pega el script en tu hoja

1. Abre `💵 Presupuesto Oskar 2026` en Google Sheets.
2. Menú **Extensiones → Apps Script**.
3. Borra lo que haya en `Código.gs` y pega el contenido de
   [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
4. Arriba del todo, cambia el token por una contraseña larga inventada:

   ```js
   TOKEN: 'presupuesto-oskar-8f3k2j9x7q',   // ← invéntate una, no uses esta
   ```

5. Guarda (⌘S).

> La plantilla ya trae sus propios scripts (los de agregar/eliminar filas).
> **No los borres**: crea un archivo nuevo con el botón `+` → *Script* y pega
> el código ahí si prefieres tenerlo aparte.

### 2. Comprueba que lee bien la plantilla

En el editor, elige la función **`probar`** en el desplegable de arriba y
pulsa **Ejecutar**. Google te pedirá permisos la primera vez (es tu propio
script sobre tu propia hoja: acepta).

En el registro de ejecución deberías ver tus subcategorías reales:

```
Mes: Septiembre
Subcategorias encontradas: 19
🥑 Groceries  | Gastos Esenciales | queda $419.60
🏡  Rent  | Gastos Esenciales | queda $127.00
...
```

Si sale un error aquí, léelo: te dice exactamente qué pestaña o qué
encabezado no encontró.

### 3. Publica la Web App

1. **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Configura:
   * *Ejecutar como*: **Yo** (tu cuenta).
   * *Quién tiene acceso*: **Cualquier usuario**.
4. **Implementar** y copia la **URL de la aplicación web**. Termina en `/exec`:

   ```
   https://script.google.com/macros/s/AKfycb.....largo...../exec
   ```

> *Cualquier usuario* suena abierto, pero es necesario para que el iPhone no
> tenga que iniciar sesión en Google. Lo que protege la hoja es **tu token**:
> sin él, la Web App responde `Token invalido.` y no lee ni escribe nada.
> Ver [Seguridad](#seguridad).

### 4. Pruébalo desde la terminal (opcional pero recomendado)

```bash
./tools/probar-api.sh 'https://script.google.com/macros/s/AKfycb.../exec' 'tu-token'
```

Hace ping, lista las subcategorías, registra $1 de prueba y muestra el
resumen del mes. Borra después esa fila de $1 de la hoja.

### 5. Arma el atajo en el iPhone

Está en **[`docs/atajo-ios.md`](docs/atajo-ios.md)**, acción por acción.
Son 7 acciones y se hace en unos 5 minutos.

---

## La API

Todo pasa por la misma URL. El token va en cada llamada.

| Qué | Cómo |
| --- | --- |
| Comprobar conexión | `GET  …/exec?token=T&accion=ping` |
| Menú de categorías | `GET  …/exec?token=T&accion=catalogo[&mes=Octubre][&excluir=Ahorros]` |
| Resumen del mes | `GET  …/exec?token=T&accion=resumen[&mes=Octubre]` |
| Registrar transacción | `POST …/exec` con cuerpo JSON |

Cuerpo del `POST` (solo `token`, `monto` y `subcategoria` son obligatorios):

```json
{
  "token": "tu-token",
  "monto": 25.40,
  "subcategoria": "groceries",
  "categoria": "Gastos Esenciales",
  "nota": "Publix",
  "fecha": "2026-09-06",
  "mes": "Septiembre"
}
```

Respuesta:

```json
{
  "ok": true,
  "mensaje": "$25.40 en 🥑 Groceries  (Septiembre)\nTe quedan $419.60 de $465.00.",
  "mes": "Septiembre", "fila": 62,
  "categoria": "Gastos Esenciales", "subcategoria": "🥑 Groceries ",
  "monto": 25.4, "estimado": 465, "gastado": 45.4, "restante": 419.6
}
```

**Siempre** viene el campo `mensaje`, también cuando algo falla
(`"No se registro: …"`), así el atajo solo tiene que mostrar ese campo.

### Cómo entiende la categoría

`subcategoria` acepta cualquiera de estas formas:

* la etiqueta completa del menú → `"🥑 Groceries  | Gastos Esenciales | queda $419.60"`
* el nombre exacto → `"🥑 Groceries "`
* texto libre, sin emoji ni acentos ni mayúsculas → `"groceries"`, `"travel"`, `"rent"`

Si el texto coincide con varias, te responde cuáles son y te pide que
añadas también `categoria`. Si no coincide con ninguna, te lista las
opciones disponibles.

### Qué sale en el menú

Por defecto el menú del atajo **no muestra las categorías de Ingresos**: la
lista se usa para registrar gastos, y tenerlos ahí solo estorba. Se controla
con `CONFIG.CATEGORIAS_OCULTAS`:

```js
CATEGORIAS_OCULTAS: ['Ingresos'],
```

Y se puede cambiar por petición, sin tocar el script:

| URL | Qué devuelve |
| --- | --- |
| `&accion=catalogo` | todo menos Ingresos (el valor de `CONFIG`) |
| `&accion=catalogo&excluir=` | absolutamente todo |
| `&accion=catalogo&excluir=Ahorros,Inversiones` | todo menos esas dos |

Es solo un filtro de **lo que se muestra**. Registrar sigue funcionando con
cualquier subcategoría, oculta o no — así un segundo atajo "Ingreso" puede
usar `&excluir=` y escribir en Ingresos con el mismo script.

### Montos

Acepta `25`, `"25"`, `"25,40"`, `"$1,330.00"` y `"1.330,50"`. Rechaza
texto sin números y montos ≤ 0.

---

## Seguridad

* La URL es pública pero **inútil sin el token**. Cualquier petición sin él
  (o con uno incorrecto) devuelve `Token invalido.` y termina ahí.
* El script solo puede tocar **la hoja donde está pegado**
  (permiso `spreadsheets.currentonly`). No ve el resto de tu Drive.
* La Web App se ejecuta **como tú**: nadie más necesita acceso a la hoja.
* Trata el token como una contraseña. Está escrito en el script *y* dentro
  del atajo del iPhone; no compartas ninguno de los dos.
* Si el token se filtra: cámbialo en `CONFIG.TOKEN`, vuelve a implementar
  (**Implementar → Gestionar implementaciones → editar → Nueva versión**) y
  actualízalo en el atajo. La URL no cambia.

---

## Pruebas

La lógica corre contra un simulacro de Google Sheets que reproduce la
estructura real de la plantilla (los dos encabezados parecidos de las
pestañas mensuales, los seis bloques, los nombres con espacio final):

```bash
node pruebas/ejecutar.js
```

29 casos: detección de la plantilla, formatos de monto, resolución de
subcategorías ambiguas, escritura en la fila correcta, catálogo, resumen y
rechazo de token inválido.

---

## Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| `Token invalido.` | El token del atajo no es igual al de `CONFIG.TOKEN`. Ojo con espacios al copiar. |
| `Configura CONFIG.TOKEN…` | Dejaste el token de ejemplo sin cambiar. |
| `No encontre la pestaña del mes "X"` | La pestaña del mes no existe o se llama distinto. El script tolera emojis y acentos, pero no un nombre completamente diferente. |
| `No encontre la fila de encabezado…` | Se modificó la fila `Subcategoría / Fecha / Monto` de esa pestaña. Restáurala. |
| `…se quedo sin filas libres` | Ese bloque del mes llegó al final. Usa el botón de la plantilla para agregar filas. |
| `No encontre la subcategoria "X"` | No existe en la pestaña `Presupuesto`. Créala ahí primero; el menú del atajo se actualiza solo. |
| El atajo muestra HTML en vez de JSON | La implementación quedó como *Solo yo*. Vuelve a implementar con acceso **Cualquier usuario**. |
| Cambié el código y no pasa nada | Apps Script sirve la **versión implementada**, no la guardada. Haz *Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva*. |

---

## Estructura del repo

```
apps-script/
  Codigo.gs          La Web App: recibe el gasto y lo escribe en la hoja
  appsscript.json    Manifiesto (permisos mínimos y config de la Web App)
docs/
  atajo-ios.md       Cómo armar el atajo, acción por acción
pruebas/
  ejecutar.js        node pruebas/ejecutar.js
  simulacro.js       Simulacro de Google Sheets con la estructura real
  casos.js           Los 22 casos de prueba
tools/
  probar-api.sh      Prueba la Web App desde la terminal
```
