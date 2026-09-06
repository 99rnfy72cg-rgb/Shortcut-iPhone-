# El atajo en el iPhone

Antes de empezar necesitas dos datos de la instalación (ver el
[README](../README.md)):

* **URL** de la Web App → `https://script.google.com/macros/s/AKfycb…/exec`
* **TOKEN** → el que pusiste en `CONFIG.TOKEN`

---

## Atajo principal: “Gasto”

Abre la app **Atajos** → **+** → ponle nombre `Gasto` y añade estas
7 acciones en orden.

### 1. Solicitar entrada

Busca **“Solicitar entrada”**.

| Campo | Valor |
| --- | --- |
| Tipo | **Número** |
| Pregunta | `¿Cuánto?` |

### 2. Obtener contenido de una URL  ← trae el menú de categorías

Busca **“Obtener contenido de una URL”**. Pega en la URL, todo en una línea:

```
https://script.google.com/macros/s/AKfycb…/exec?token=TU_TOKEN&accion=catalogo
```

Toca la flecha **▸** para desplegar las opciones y deja **Método: GET**
(es el valor por defecto).

### 3. Obtener valor del diccionario

Busca **“Obtener valor del diccionario”**.

| Campo | Valor |
| --- | --- |
| Obtener | **Valor** |
| Clave | `etiquetas` |
| De | *Contenido de la URL* (se rellena solo) |

### 4. Elegir de la lista

Busca **“Elegir de la lista”**. En **Preguntar**, escribe `¿En qué categoría?`

Aquí es donde ves, ya en el menú, cuánto te queda de cada una:

```
🥑 Groceries  | Gastos Esenciales | queda $419.60
🏡  Rent  | Gastos Esenciales | queda $127.00
🎫 Travel savings // Chase | Ahorros | queda $250.00
```

### 5. Obtener contenido de una URL  ← registra el gasto

Otra vez **“Obtener contenido de una URL”**. La URL ahora va **sin
parámetros**:

```
https://script.google.com/macros/s/AKfycb…/exec
```

Despliega **▸** y configura:

| Campo | Valor |
| --- | --- |
| Método | **POST** |
| Cuerpo de la solicitud | **JSON** |

Añade tres campos con **“Añadir campo nuevo”**:

| Clave | Tipo | Valor |
| --- | --- | --- |
| `token` | Texto | `TU_TOKEN` |
| `monto` | Número | variable **Entrada proporcionada** (la del paso 1) |
| `subcategoria` | Texto | variable **Elemento elegido** (la del paso 4) |

> Para poner una variable: toca el campo de valor y elígela en la barra que
> aparece encima del teclado. Si te ofrece la variable equivocada, tócala y
> usa *Seleccionar variable* para apuntar a la acción correcta.

### 6. Obtener valor del diccionario

| Campo | Valor |
| --- | --- |
| Obtener | **Valor** |
| Clave | `mensaje` |
| De | *Contenido de la URL* (la del paso 5) |

### 7. Mostrar notificación

Busca **“Mostrar notificación”** y pon como texto la variable
**Valor del diccionario** del paso 6.

Verás algo así:

```
$25.40 en 🥑 Groceries  (Septiembre)
Te quedan $419.60 de $465.00.
```

Y si algo sale mal, la misma notificación te dice por qué:
`No se registro: Token invalido.`

---

## Ponlo a un toque de distancia

* **En la pantalla de inicio**: en el atajo, toca **ⓘ → Añadir a pantalla
  de inicio**. Queda como una app más.
* **Con Siri**: “Oye Siri, **Gasto**”. Siri te pregunta el monto por voz y
  te muestra el menú de categorías.
* **En el widget**: mantén pulsada la pantalla de inicio → **+** → *Atajos*.
* **En el Botón de Acción** (iPhone 15 Pro o posterior):
  *Ajustes → Botón de Acción → Atajo → Gasto*.

---

## Variantes

### Añadir una nota (“Publix”, “cine”, …)

Entre los pasos 4 y 5, añade otra **“Solicitar entrada”**:

| Campo | Valor |
| --- | --- |
| Tipo | **Texto** |
| Pregunta | `Nota (opcional)` |
| Permitir varias líneas | No |

Y en el paso 5 añade un cuarto campo al JSON:

| Clave | Tipo | Valor |
| --- | --- | --- |
| `nota` | Texto | la variable de esa nueva entrada |

### Registrar en otro mes

Añade al JSON del paso 5:

| Clave | Tipo | Valor |
| --- | --- | --- |
| `mes` | Texto | `Octubre` |

O pídelo con un **“Elegir del menú”** con los doce meses. Sin este campo,
siempre usa el mes de hoy.

### Atajo “Cómo voy” (solo consulta, no escribe nada)

Tres acciones:

1. **Obtener contenido de una URL** →
   `https://script.google.com/macros/s/AKfycb…/exec?token=TU_TOKEN&accion=resumen`
2. **Obtener valor del diccionario** → clave `mensaje`
3. **Mostrar resultado**

```
Septiembre
Ingresos: $1,330.00 de $6,870.00
Gastos Esenciales: $1,318.40 de $2,025.00
Gastos Discrecionales: $0.00 de $1,140.00
...
```

### Dictado rápido, sin menú

Si prefieres decirlo todo de una vez, sustituye los pasos 1–4 por una sola
**“Solicitar entrada”** de tipo Texto (`Gasto`, y le dictas *“groceries 25”*).
Luego, en el paso 5, manda ese texto en `subcategoria` y el número en
`monto` usando la acción **“Obtener números del texto”**. El servidor
resuelve `groceries` → `🥑 Groceries ` por su cuenta.

---

## Si algo no funciona

| Qué ves | Qué pasa |
| --- | --- |
| El menú del paso 4 sale vacío | La URL del paso 2 está mal, o falta `&accion=catalogo`. Comprueba que no se haya cortado. |
| `No se registro: Token invalido.` | El token del atajo no coincide con el del script. Suele ser un espacio de más al pegarlo. |
| Aparece un montón de HTML | La Web App se implementó como *Solo yo*. Vuelve a implementarla con acceso **Cualquier usuario**. |
| “No se pudo convertir…” | El campo `monto` del JSON quedó como Texto. Cámbialo a **Número**. |
| Escribe en la categoría equivocada | Estás mandando texto libre que coincide con varias. Usa el menú del paso 4, que ya manda la categoría dentro de la etiqueta. |
