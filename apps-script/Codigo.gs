/**
 * Presupuesto -> Atajo de iPhone
 * ------------------------------------------------------------------
 * Web App que recibe un monto + una subcategoria desde la app Atajos
 * (Shortcuts) de iOS y escribe la transaccion en la pestana del mes
 * de la plantilla "Presupuesto + Patrimonio Neto" en Google Sheets.
 *
 * El script NO asume filas ni columnas fijas: detecta en tiempo real
 * la fila de encabezado ("Subcategoria | Fecha | Monto | N") y los
 * seis bloques de categorias, para que siga funcionando si la
 * plantilla cambia de tamano o si agregas filas.
 */

// =====================  CONFIGURACION  =============================

const CONFIG = {
  // Cambia esto por una contrasena larga e inventada. Es lo unico que
  // protege la URL publica de la Web App.
  TOKEN: 'CAMBIA-ESTE-TOKEN-POR-UNO-LARGO',

  // Deja '' si pegas el script dentro de la propia hoja de calculo
  // (Extensiones > Apps Script). Si lo creas como proyecto aparte,
  // pon aqui el ID de la hoja.
  ID_HOJA: '',

  // Nombre de la pestana con el presupuesto anual (catalogo de subcategorias).
  HOJA_PRESUPUESTO: 'Presupuesto',

  // Formato con el que se escribe la fecha en la columna "Fecha".
  FORMATO_FECHA: 'd-mmm',

  // Separador de los campos dentro de cada etiqueta del menu del atajo.
  SEP: ' | ',

  // Categorias que NO salen en el menu del atajo. Solo afecta a lo que se
  // muestra: si mandas una subcategoria de una categoria oculta, se
  // registra igual. Se puede cambiar por peticion con "&excluir=...",
  // y "&excluir=" (vacio) muestra todas.
  CATEGORIAS_OCULTAS: ['Ingresos'],
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// =====================  PUNTOS DE ENTRADA  =========================

/**
 * GET: consultas de solo lectura.
 *   ?token=XXX&accion=ping
 *   ?token=XXX&accion=catalogo[&mes=Septiembre]
 *   ?token=XXX&accion=resumen[&mes=Septiembre]
 */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    verificarToken_(p.token);
    const accion = (p.accion || 'catalogo').toLowerCase();

    if (accion === 'ping') {
      return json_({ ok: true, mensaje: 'Conexion correcta', mes: mesActual_() });
    }
    if (accion === 'catalogo') {
      return json_(catalogo_(p.mes, p.excluir));
    }
    if (accion === 'resumen') {
      return json_(resumen_(p.mes));
    }
    return error_('Accion desconocida: ' + accion);
  } catch (err) {
    return error_(err);
  }
}

/**
 * POST: registra una transaccion.
 * Cuerpo JSON:
 *   {
 *     "token": "XXX",
 *     "monto": 25.40,
 *     "subcategoria": "Groceries",        // o la etiqueta completa del menu
 *     "categoria": "Gastos Esenciales",   // opcional, se deduce sola
 *     "nota": "Publix",                   // opcional
 *     "fecha": "2026-09-06",              // opcional, por defecto hoy
 *     "mes": "Septiembre"                 // opcional, por defecto el mes de la fecha
 *   }
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const datos = cuerpo_(e);
    verificarToken_(datos.token);
    lock.waitLock(20000);
    return json_(agregarTransaccion_(datos));
  } catch (err) {
    return error_(err);
  } finally {
    try { lock.releaseLock(); } catch (ignorado) {}
  }
}

// =====================  LOGICA PRINCIPAL  ==========================

/**
 * Escribe una transaccion en la pestana del mes correspondiente.
 */
function agregarTransaccion_(datos) {
  const monto = aNumero_(datos.monto);
  if (monto === null) {
    throw new Error('Monto invalido: "' + datos.monto + '"');
  }
  if (monto <= 0) {
    throw new Error('El monto debe ser mayor que cero.');
  }

  const fecha = aFecha_(datos.fecha);
  const nombreMes = datos.mes ? String(datos.mes) : MESES[fecha.getMonth()];
  const hoja = hojaDelMes_(nombreMes);
  const disposicion = ubicarEncabezado_(hoja, { conFecha: true });

  // Resolver a que bloque (categoria) y con que nombre exacto se escribe.
  const elegida = resolverSubcategoria_(datos, disposicion);

  const bloque = elegida.bloque;
  const fila = primeraFilaLibre_(hoja, disposicion.fila, bloque);

  hoja.getRange(fila, bloque.colSub).setValue(elegida.subcategoria);
  if (bloque.colFecha) {
    hoja.getRange(fila, bloque.colFecha)
      .setValue(fecha)
      .setNumberFormat(CONFIG.FORMATO_FECHA);
  }
  hoja.getRange(fila, bloque.colMonto).setValue(monto);
  if (bloque.colNota && datos.nota) {
    hoja.getRange(fila, bloque.colNota).setValue(String(datos.nota));
  }
  SpreadsheetApp.flush();

  // Devolver como quedo el presupuesto de esa subcategoria.
  const estado = estadoSubcategoria_(hoja, disposicion, bloque, elegida.subcategoria);

  return {
    ok: true,
    mensaje: formatearMensaje_(monto, elegida, nombreMes, estado),
    mes: nombreMes,
    fila: fila,
    categoria: bloque.categoria,
    subcategoria: elegida.subcategoria,
    monto: monto,
    nota: datos.nota || '',
    estimado: estado.estimado,
    gastado: estado.gastado,
    restante: estado.restante,
  };
}

/**
 * Lista de subcategorias con su presupuesto y lo que va gastado en el mes.
 * Es lo que el atajo usa para pintar el menu de categorias.
 */
function catalogo_(mesPedido, excluirPedido) {
  const nombreMes = mesPedido ? String(mesPedido) : mesActual_();
  const hoja = hojaDelMes_(nombreMes);
  const disposicion = ubicarEncabezado_(hoja, { conFecha: true });
  const estimados = estimadosDelPresupuesto_();
  const gastados = gastadoPorSubcategoria_(hoja, disposicion);
  const ocultas = categoriasOcultas_(excluirPedido);

  const items = [];
  const etiquetas = [];

  disposicion.bloques.forEach(function (bloque, indice) {
    if (estaOculta_(bloque.categoria, ocultas)) return;
    const subs = subsDelBloque_(estimados, bloque, indice);
    Object.keys(subs).forEach(function (sub) {
      const estimado = subs[sub];
      const gastado = gastados[clave_(bloque.categoria, sub)] || 0;
      const restante = estimado - gastado;
      const etiqueta = [
        sub,
        bloque.categoria,
        (restante >= 0 ? 'queda ' : 'excedido ') + dinero_(Math.abs(restante)),
      ].join(CONFIG.SEP);

      items.push({
        etiqueta: etiqueta,
        categoria: bloque.categoria,
        subcategoria: sub,
        estimado: estimado,
        gastado: gastado,
        restante: restante,
      });
      etiquetas.push(etiqueta);
    });
  });

  return { ok: true, mes: nombreMes, etiquetas: etiquetas, items: items };
}

/**
 * Categorias que no deben salir en el menu.
 *   - parametro ausente  -> las de CONFIG.CATEGORIAS_OCULTAS
 *   - "&excluir=Ahorros" -> solo esas
 *   - "&excluir="        -> ninguna (se muestran todas)
 */
function categoriasOcultas_(excluirPedido) {
  if (excluirPedido === undefined || excluirPedido === null) {
    return CONFIG.CATEGORIAS_OCULTAS || [];
  }
  return String(excluirPedido).split(',').filter(function (nombre) {
    return nombre.trim() !== '';
  });
}

function estaOculta_(categoria, ocultas) {
  return ocultas.some(function (oculta) {
    return sonLaMismaCategoria_(categoria, oculta);
  });
}

/**
 * Totales por categoria del mes: estimado, gastado y diferencia.
 */
function resumen_(mesPedido) {
  const nombreMes = mesPedido ? String(mesPedido) : mesActual_();
  const hoja = hojaDelMes_(nombreMes);
  const disposicion = ubicarEncabezado_(hoja, { conFecha: true });
  const estimados = estimadosDelPresupuesto_();
  const gastados = gastadoPorSubcategoria_(hoja, disposicion);

  const categorias = disposicion.bloques.map(function (bloque, indice) {
    const subs = subsDelBloque_(estimados, bloque, indice);
    let estimado = 0;
    let gastado = 0;
    Object.keys(subs).forEach(function (sub) {
      estimado += subs[sub];
      gastado += gastados[clave_(bloque.categoria, sub)] || 0;
    });
    return {
      categoria: bloque.categoria,
      estimado: estimado,
      gastado: gastado,
      restante: estimado - gastado,
    };
  });

  const lineas = categorias.map(function (c) {
    return c.categoria + ': ' + dinero_(c.gastado) + ' de ' + dinero_(c.estimado);
  });

  return {
    ok: true,
    mes: nombreMes,
    categorias: categorias,
    mensaje: nombreMes + '\n' + lineas.join('\n'),
  };
}

// =====================  DETECCION DE LA PLANTILLA  =================

/**
 * Localiza la fila de encabezado y los bloques de categorias de una pestana.
 *
 * En las pestanas mensuales hay dos encabezados parecidos:
 *   - el resumen:       "Subcategoria | Estimado | Real"
 *   - las transacciones:"Subcategoria | Fecha | Monto | N"
 * Por eso se exige (o se prohibe) la columna "Fecha" segun el caso.
 */
function ubicarEncabezado_(hoja, opciones) {
  const conFecha = !!(opciones && opciones.conFecha);
  const filas = Math.min(hoja.getMaxRows(), 200);
  const columnas = Math.min(hoja.getMaxColumns(), 60);
  const valores = hoja.getRange(1, 1, filas, columnas).getDisplayValues();

  for (let f = 0; f < filas; f++) {
    const fila = valores[f].map(normalizar_);
    const tieneSub = fila.indexOf('subcategoria') !== -1;
    const tieneFecha = fila.indexOf('fecha') !== -1;
    if (!tieneSub) continue;
    if (conFecha !== tieneFecha) continue;

    const arriba = f > 0 ? valores[f - 1] : [];
    const bloques = leerBloques_(fila, arriba);
    if (bloques.length) {
      return { fila: f + 1, bloques: bloques };
    }
  }

  throw new Error(
    'No encontre la fila de encabezado ' +
    (conFecha ? '"Subcategoria / Fecha / Monto"' : '"Subcategoria / Monto"') +
    ' en la pestana "' + hoja.getName() + '".'
  );
}

/**
 * A partir de la fila de encabezado arma los bloques de 1 categoria.
 */
function leerBloques_(filaEncabezado, filaCategorias) {
  const bloques = [];
  for (let c = 0; c < filaEncabezado.length; c++) {
    if (filaEncabezado[c] !== 'subcategoria') continue;

    const bloque = {
      categoria: nombreCategoria_(filaCategorias, c),
      colSub: c + 1,
      colFecha: 0,
      colMonto: 0,
      colNota: 0,
    };

    for (let d = c + 1; d < Math.min(c + 5, filaEncabezado.length); d++) {
      const titulo = filaEncabezado[d];
      if (titulo === 'subcategoria') break;
      if (titulo === 'fecha' && !bloque.colFecha) bloque.colFecha = d + 1;
      else if (titulo === 'monto' && !bloque.colMonto) bloque.colMonto = d + 1;
      else if (bloque.colMonto && !bloque.colNota && titulo.charAt(0) === 'n') bloque.colNota = d + 1;
    }

    if (bloque.colMonto) bloques.push(bloque);
  }
  return bloques;
}

/**
 * El titulo de la categoria vive en la fila de arriba, en una celda
 * combinada: solo la celda superior izquierda trae el texto, asi que
 * se busca hacia la izquierda desde la columna "Subcategoria".
 */
function nombreCategoria_(filaCategorias, columna) {
  for (let c = columna; c >= Math.max(0, columna - 4); c--) {
    const texto = String(filaCategorias[c] || '').trim();
    if (texto) return capitalizar_(texto);
  }
  return 'Sin categoria';
}

/**
 * Catalogo de la pestana "Presupuesto", como lista ordenada:
 *   [{ categoria: 'Ingresos', subs: { 'KFE': 6500, ... } }, ...]
 *
 * Se devuelve en orden porque los seis bloques aparecen en la misma
 * secuencia en la pestana "Presupuesto" y en las mensuales. Emparejar por
 * posicion evita depender de que los titulos esten escritos igual en las
 * dos pestanas (hay copias de la plantilla donde el presupuesto dice
 * "AHORROS - CLPG / EMI" y el mes dice solo "AHORROS").
 */
function estimadosDelPresupuesto_() {
  const hoja = libro_().getSheetByName(CONFIG.HOJA_PRESUPUESTO);
  if (!hoja) {
    throw new Error('No existe la pestana "' + CONFIG.HOJA_PRESUPUESTO + '".');
  }
  const disposicion = ubicarEncabezado_(hoja, { conFecha: false });
  const ultima = hoja.getLastRow();
  const resultado = [];

  disposicion.bloques.forEach(function (bloque) {
    const subs = {};
    const alto = ultima - disposicion.fila;
    if (alto > 0) {
      const nombres = hoja.getRange(disposicion.fila + 1, bloque.colSub, alto, 1).getValues();
      const montos = hoja.getRange(disposicion.fila + 1, bloque.colMonto, alto, 1).getValues();
      for (let i = 0; i < alto; i++) {
        // Ojo: el nombre se guarda TAL CUAL (varias subcategorias de la
        // plantilla terminan en espacio). Si se recorta, deja de coincidir
        // con la validacion de datos y con los SUMIF del resumen del mes.
        const nombre = String(nombres[i][0] === null || nombres[i][0] === undefined ? '' : nombres[i][0]);
        if (!nombre.trim()) continue;
        if (normalizar_(nombre) === 'total') break;
        subs[nombre] = aNumero_(montos[i][0]) || 0;
      }
    }
    resultado.push({ categoria: bloque.categoria, subs: subs });
  });

  return resultado;
}

/**
 * Subcategorias presupuestadas que corresponden a un bloque de la pestana
 * mensual: primero por posicion, y si no cuadra, por nombre.
 */
function subsDelBloque_(estimados, bloque, indice) {
  if (estimados[indice] && sonLaMismaCategoria_(estimados[indice].categoria, bloque.categoria)) {
    return estimados[indice].subs;
  }
  for (let i = 0; i < estimados.length; i++) {
    if (sonLaMismaCategoria_(estimados[i].categoria, bloque.categoria)) return estimados[i].subs;
  }
  return (estimados[indice] && estimados[indice].subs) || {};
}

/**
 * "AHORROS - CLPG / EMI" y "AHORROS" son la misma categoria.
 */
function sonLaMismaCategoria_(a, b) {
  const x = normalizar_(a);
  const y = normalizar_(b);
  if (!x || !y) return false;
  return x === y || x.indexOf(y) === 0 || y.indexOf(x) === 0;
}

/**
 * Suma lo ya registrado en el mes: { "categoria||subcategoria": total }.
 */
function gastadoPorSubcategoria_(hoja, disposicion) {
  const totales = {};
  disposicion.bloques.forEach(function (bloque) {
    filasDelBloque_(hoja, disposicion.fila, bloque).forEach(function (registro) {
      if (!registro.subcategoria.trim()) return;
      const k = clave_(bloque.categoria, registro.subcategoria);
      totales[k] = (totales[k] || 0) + (registro.monto || 0);
    });
  });
  return totales;
}

/**
 * Devuelve las transacciones ya escritas en un bloque.
 */
function filasDelBloque_(hoja, filaEncabezado, bloque) {
  const alto = hoja.getMaxRows() - filaEncabezado;
  if (alto <= 0) return [];

  const ancho = (bloque.colNota || bloque.colMonto) - bloque.colSub + 1;
  const celdas = hoja.getRange(filaEncabezado + 1, bloque.colSub, alto, ancho).getValues();
  const iMonto = bloque.colMonto - bloque.colSub;
  const registros = [];

  for (let i = 0; i < celdas.length; i++) {
    const sub = String(celdas[i][0] === null || celdas[i][0] === undefined ? '' : celdas[i][0]);
    if (normalizar_(sub) === 'total') break;
    registros.push({
      fila: filaEncabezado + 1 + i,
      subcategoria: sub,
      monto: aNumero_(celdas[i][iMonto]) || 0,
      vacia: celdas[i].every(function (v) { return v === '' || v === null; }),
    });
  }
  return registros;
}

/**
 * Primera fila libre del bloque: justo debajo de la ultima usada, para
 * no rellenar huecos que puedan tener una nota a medias.
 */
function primeraFilaLibre_(hoja, filaEncabezado, bloque) {
  const registros = filasDelBloque_(hoja, filaEncabezado, bloque);
  let ultimaUsada = filaEncabezado;
  registros.forEach(function (r) {
    if (!r.vacia) ultimaUsada = r.fila;
  });

  const siguiente = ultimaUsada + 1;
  const limite = registros.length ? registros[registros.length - 1].fila : filaEncabezado;
  if (siguiente > limite) {
    throw new Error(
      'La categoria "' + bloque.categoria + '" se quedo sin filas libres en la pestana "' +
      hoja.getName() + '". Agrega filas en la plantilla y vuelve a intentarlo.'
    );
  }
  return siguiente;
}

// =====================  RESOLUCION DE LA SUBCATEGORIA  =============

/**
 * Convierte lo que mando el atajo en una subcategoria existente de la
 * plantilla. Acepta:
 *   - la etiqueta completa del menu ("Groceries | Gastos Esenciales | queda $345")
 *   - el nombre exacto (con o sin emoji)
 *   - texto libre aproximado ("groceries", "mercado")
 */
function resolverSubcategoria_(datos, disposicion) {
  let textoSub = String(datos.subcategoria || datos.categoria || '').trim();
  let textoCat = String(datos.categoria || '').trim();

  if (textoSub.indexOf(CONFIG.SEP.trim()) !== -1) {
    const partes = textoSub.split('|').map(function (s) { return s.trim(); });
    textoSub = partes[0] || textoSub;
    if (partes[1]) textoCat = partes[1];
  }
  if (!textoSub) {
    throw new Error('Falta la subcategoria.');
  }

  const estimados = estimadosDelPresupuesto_();
  const candidatos = [];

  disposicion.bloques.forEach(function (bloque, indice) {
    if (textoCat && !sonLaMismaCategoria_(bloque.categoria, textoCat)) return;
    Object.keys(subsDelBloque_(estimados, bloque, indice)).forEach(function (sub) {
      candidatos.push({ bloque: bloque, subcategoria: sub });
    });
  });

  if (!candidatos.length) {
    throw new Error('No hay subcategorias configuradas' + (textoCat ? ' en "' + textoCat + '"' : '') + '.');
  }

  const buscado = normalizar_(textoSub);
  if (!buscado) {
    // Busqueda solo con emoji o simbolos: comparar el texto tal cual.
    const crudos = candidatos.filter(function (c) {
      return c.subcategoria.indexOf(textoSub) !== -1;
    });
    if (crudos.length === 1) return crudos[0];
    if (crudos.length > 1) return desempatar_(crudos, textoCat, textoSub);
    throw new Error('No encontre ninguna subcategoria que contenga "' + textoSub + '".');
  }

  const exactos = candidatos.filter(function (c) { return normalizar_(c.subcategoria) === buscado; });
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) return desempatar_(exactos, textoCat, textoSub);

  const empiezan = candidatos.filter(function (c) { return normalizar_(c.subcategoria).indexOf(buscado) === 0; });
  if (empiezan.length === 1) return empiezan[0];

  const contienen = candidatos.filter(function (c) { return normalizar_(c.subcategoria).indexOf(buscado) !== -1; });
  if (contienen.length === 1) return contienen[0];

  const parciales = empiezan.length ? empiezan : contienen;
  if (parciales.length > 1) return desempatar_(parciales, textoCat, textoSub);

  throw new Error(
    'No encontre la subcategoria "' + textoSub + '". Opciones: ' +
    candidatos.map(function (c) { return c.subcategoria; }).join(', ')
  );
}

function desempatar_(opciones, textoCat, textoSub) {
  if (textoCat) {
    const filtradas = opciones.filter(function (c) {
      return sonLaMismaCategoria_(c.bloque.categoria, textoCat);
    });
    if (filtradas.length === 1) return filtradas[0];
  }
  throw new Error(
    '"' + textoSub + '" coincide con varias subcategorias: ' +
    opciones.map(function (c) { return c.subcategoria + ' (' + c.bloque.categoria + ')'; }).join(', ') +
    '. Indica tambien la categoria.'
  );
}

/**
 * Estimado / gastado / restante de una subcategoria despues de escribir.
 */
function estadoSubcategoria_(hoja, disposicion, bloque, subcategoria) {
  const indice = disposicion.bloques.indexOf(bloque);
  const subs = subsDelBloque_(estimadosDelPresupuesto_(), bloque, indice);
  const estimado = subs[subcategoria] || 0;
  let gastado = 0;
  filasDelBloque_(hoja, disposicion.fila, bloque).forEach(function (r) {
    if (normalizar_(r.subcategoria) === normalizar_(subcategoria)) gastado += r.monto || 0;
  });
  return { estimado: estimado, gastado: gastado, restante: estimado - gastado };
}

function formatearMensaje_(monto, elegida, nombreMes, estado) {
  const cabeza = dinero_(monto) + ' en ' + elegida.subcategoria + ' (' + nombreMes + ')';
  if (!estado.estimado) {
    return cabeza + '\nLlevas ' + dinero_(estado.gastado) + ' este mes.';
  }
  const cola = estado.restante >= 0
    ? 'Te quedan ' + dinero_(estado.restante) + ' de ' + dinero_(estado.estimado) + '.'
    : 'Te pasaste ' + dinero_(-estado.restante) + ' del presupuesto de ' + dinero_(estado.estimado) + '.';
  return cabeza + '\n' + cola;
}

// =====================  UTILIDADES  ================================

function libro_() {
  return CONFIG.ID_HOJA
    ? SpreadsheetApp.openById(CONFIG.ID_HOJA)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function zonaHoraria_() {
  return libro_().getSpreadsheetTimeZone() || Session.getScriptTimeZone();
}

function mesActual_() {
  const hoy = new Date();
  return MESES[Number(Utilities.formatDate(hoy, zonaHoraria_(), 'M')) - 1];
}

/**
 * Busca la pestana del mes tolerando emojis, acentos y mayusculas.
 */
function hojaDelMes_(nombreMes) {
  const buscado = normalizar_(nombreMes);
  const hojas = libro_().getSheets();
  for (let i = 0; i < hojas.length; i++) {
    if (normalizar_(hojas[i].getName()) === buscado) return hojas[i];
  }
  for (let i = 0; i < hojas.length; i++) {
    if (normalizar_(hojas[i].getName()).indexOf(buscado) !== -1) return hojas[i];
  }
  throw new Error('No encontre la pestana del mes "' + nombreMes + '".');
}

/**
 * Normaliza texto para comparar: sin acentos, sin emojis, sin simbolos,
 * en minusculas y con un solo espacio entre palabras.
 */
function normalizar_(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const MINUSCULAS = ['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'a', 'en'];

function capitalizar_(texto) {
  const palabras = String(texto).trim().toLowerCase().split(/\s+/);
  return palabras.map(function (palabra, i) {
    if (i > 0 && MINUSCULAS.indexOf(palabra) !== -1) return palabra;
    return palabra.charAt(0).toUpperCase() + palabra.slice(1);
  }).join(' ');
}

function clave_(categoria, subcategoria) {
  return normalizar_(categoria) + '||' + normalizar_(subcategoria);
}

/**
 * Acepta 25, "25", "25,40", "$1,330.00", "1.330,00".
 */
function aNumero_(valor) {
  if (typeof valor === 'number') return isFinite(valor) ? valor : null;
  if (valor === null || valor === undefined) return null;

  let texto = String(valor).replace(/[^\d,.\-]/g, '').trim();
  if (!texto) return null;

  const comas = (texto.match(/,/g) || []).length;
  const puntos = (texto.match(/\./g) || []).length;

  if (comas && puntos) {
    // El separador decimal es el ultimo que aparece.
    if (texto.lastIndexOf(',') > texto.lastIndexOf('.')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else {
      texto = texto.replace(/,/g, '');
    }
  } else if (comas === 1 && /,\d{1,2}$/.test(texto)) {
    texto = texto.replace(',', '.');
  } else if (comas) {
    texto = texto.replace(/,/g, '');
  }

  const numero = parseFloat(texto);
  return isFinite(numero) ? numero : null;
}

function aFecha_(valor) {
  if (!valor) return new Date();
  if (valor instanceof Date) return valor;
  const texto = String(valor).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const fecha = new Date(texto);
  return isNaN(fecha.getTime()) ? new Date() : fecha;
}

function dinero_(numero) {
  const n = Number(numero) || 0;
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function verificarToken_(token) {
  if (!CONFIG.TOKEN || CONFIG.TOKEN === 'CAMBIA-ESTE-TOKEN-POR-UNO-LARGO') {
    throw new Error('Configura CONFIG.TOKEN en el script antes de usarlo.');
  }
  if (String(token || '') !== CONFIG.TOKEN) {
    throw new Error('Token invalido.');
  }
}

function cuerpo_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      // Si el atajo manda un formulario en vez de JSON.
      return (e && e.parameter) || {};
    }
  }
  return (e && e.parameter) || {};
}

/**
 * Respuesta de error. Incluye "mensaje" para que el atajo del iPhone
 * siempre pueda mostrar el mismo campo, salga bien o mal.
 */
function error_(err) {
  const texto = String(err && err.message || err);
  return json_({ ok: false, error: texto, mensaje: 'No se registro: ' + texto });
}

function json_(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================  PRUEBAS DESDE EL EDITOR  ===================

/**
 * Ejecuta esta funcion una vez desde el editor de Apps Script para
 * conceder permisos y comprobar que la plantilla se lee bien.
 */
function probar() {
  const cat = catalogo_();
  Logger.log('Mes: %s', cat.mes);
  Logger.log('Subcategorias encontradas: %s', cat.items.length);
  cat.etiquetas.forEach(function (etiqueta) { Logger.log(etiqueta); });
  Logger.log(resumen_().mensaje);
}
