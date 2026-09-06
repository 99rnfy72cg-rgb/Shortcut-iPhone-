// Casos de prueba. Se ejecutan con: node pruebas/ejecutar.js
CONFIG.TOKEN = 'secreto123';

function t(nombre, fn){ try { fn(); console.log('  OK  ' + nombre); } catch(e){ console.log('  FALLA ' + nombre + ' -> ' + e.message); process.exitCode=1; } }
function igual(a,b,msg){ const A=JSON.stringify(a), B=JSON.stringify(b); if(A!==B) throw new Error((msg||'')+' esperado '+B+' pero fue '+A); }

console.log('\n--- deteccion de la plantilla ---');
t('encuentra el encabezado de transacciones (fila 59, 6 bloques)', ()=>{
  const d = ubicarEncabezado_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Septiembre'), {conFecha:true});
  igual(d.fila, 59, 'fila'); igual(d.bloques.length, 6, 'bloques');
  igual(d.bloques[1], {categoria:'Gastos Esenciales', colSub:6, colFecha:7, colMonto:8, colNota:9});
});
t('encuentra el encabezado del presupuesto (sin Fecha)', ()=>{
  const d = ubicarEncabezado_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Presupuesto'), {conFecha:false});
  igual(d.fila, 10); igual(d.bloques[0].colMonto, 3);
});
t('lee el catalogo de subcategorias (lista ordenada)', ()=>{
  const e = estimadosDelPresupuesto_();
  igual(e.length, 6);
  igual(e[1].categoria, 'Gastos Esenciales');
  igual(e[1].subs['🥑 Groceries '], 465);
  igual(Object.keys(e[0].subs).length, 3);
});
t('empareja bloques aunque el titulo lleve sufijo', ()=>{
  // "AHORROS - CLPG / EMI" en Presupuesto vs "AHORROS" en el mes.
  const e = estimadosDelPresupuesto_();
  const conSufijo = e.map((b,i)=> i===4 ? {categoria:'Ahorros - Clpg / Emi', subs:b.subs} : b);
  const bloqueMes = {categoria:'Ahorros'};
  igual(subsDelBloque_(conSufijo, bloqueMes, 4)['🎫 Travel savings // Chase'], 500);
  // Y aunque ademas cambie el orden, lo encuentra por nombre.
  const desordenado = [conSufijo[4]].concat(conSufijo.slice(0,4), conSufijo.slice(5));
  igual(subsDelBloque_(desordenado, bloqueMes, 4)['🎫 Travel savings // Chase'], 500);
});
t('no confunde categorias distintas', ()=>{
  if (sonLaMismaCategoria_('Ahorros', 'Inversiones')) throw new Error('empareja categorias distintas');
  if (!sonLaMismaCategoria_('AHORROS - CLPG / EMI', 'Ahorros')) throw new Error('no empareja el sufijo');
});

console.log('\n--- numeros y fechas ---');
t('acepta formatos de monto', ()=>{
  igual(aNumero_('25'),25); igual(aNumero_('25,40'),25.4); igual(aNumero_('$1,330.00'),1330);
  igual(aNumero_('1.330,50'),1330.5); igual(aNumero_(' 12.5 '),12.5); igual(aNumero_('abc'),null);
});
t('acepta fecha ISO', ()=>{ const f=aFecha_('2026-09-06'); igual([f.getFullYear(),f.getMonth(),f.getDate()],[2026,8,6]); });

console.log('\n--- resolucion de subcategoria ---');
const disp = ubicarEncabezado_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Septiembre'), {conFecha:true});
t('texto libre sin emoji ni mayusculas', ()=>{ igual(resolverSubcategoria_({subcategoria:'groceries'}, disp).subcategoria, '🥑 Groceries '); });
t('etiqueta completa del menu', ()=>{
  const r = resolverSubcategoria_({subcategoria:'🏡  Rent  | Gastos Esenciales | queda $127.00'}, disp);
  igual(r.subcategoria,'🏡  Rent '); igual(r.bloque.categoria,'Gastos Esenciales');
});
t('coincidencia parcial', ()=>{ igual(resolverSubcategoria_({subcategoria:'travel'}, disp).subcategoria, '🎫 Travel savings // Chase'); });
t('busqueda solo con emoji es ambigua y lo dice', ()=>{
  let msg=''; try { resolverSubcategoria_({subcategoria:'📱'}, disp); } catch(e){ msg=e.message; }
  if(!/coincide con varias/.test(msg)) throw new Error('mensaje inesperado: '+msg);
});
t('emoji + categoria si resuelve', ()=>{
  igual(resolverSubcategoria_({subcategoria:'📱', categoria:'Pago de Deudas'}, disp).subcategoria, '📱 Phone ');
});
t('mantiene el nombre exacto con espacio final', ()=>{
  const r = resolverSubcategoria_({subcategoria:'rent'}, disp);
  if(r.subcategoria !== '🏡  Rent ') throw new Error('perdio el espacio final: '+JSON.stringify(r.subcategoria));
});
t('nombre de categoria bien escrito', ()=>{ igual(disp.bloques[3].categoria, 'Pago de Deudas'); });
t('inexistente da error con opciones', ()=>{
  let msg=''; try { resolverSubcategoria_({subcategoria:'zzzz'}, disp); } catch(e){ msg=e.message; }
  if(!/No encontre la subcategoria/.test(msg)) throw new Error(msg);
});

console.log('\n--- escritura ---');
const sep = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Septiembre');
t('escribe debajo de la ultima fila usada', ()=>{
  const r = agregarTransaccion_({monto:'25,40', subcategoria:'groceries', nota:'Publix', fecha:'2026-09-06'});
  igual(r.fila, 62); igual(r.categoria,'Gastos Esenciales'); igual(r.subcategoria,'🥑 Groceries ');
  igual(sep.d[61][5], '🥑 Groceries '); igual(sep.d[61][7], 25.4); igual(sep.d[61][8], 'Publix');
  if(!(sep.d[61][6] instanceof Date)) throw new Error('la fecha no se escribio');
  igual(r.gastado, 36.4); igual(r.restante, 428.6);
});
t('la siguiente va a la fila 63, no rellena huecos', ()=>{
  const r = agregarTransaccion_({monto:9, subcategoria:'groceries'});
  igual(r.fila, 63); igual(r.restante, 419.6);
});
t('otra categoria usa su propio bloque', ()=>{
  const r = agregarTransaccion_({monto:1330, subcategoria:'KFE'});
  igual(r.fila, 61); igual(r.categoria, 'Ingresos'); igual(sep.d[60][0], 'KFE 🇺🇸');
});
t('mes explicito escribe en esa pestana', ()=>{
  const r = agregarTransaccion_({monto:50, subcategoria:'Nails', mes:'Octubre'});
  igual(r.mes,'Octubre'); igual(r.fila, 60);
});
t('rechaza monto invalido y negativo', ()=>{
  let a='',b=''; try{ agregarTransaccion_({monto:'nada', subcategoria:'groceries'}); }catch(e){a=e.message;}
  try{ agregarTransaccion_({monto:-5, subcategoria:'groceries'}); }catch(e){b=e.message;}
  if(!/Monto invalido/.test(a)) throw new Error(a); if(!/mayor que cero/.test(b)) throw new Error(b);
});

console.log('\n--- catalogo y resumen para el atajo ---');
t('catalogo trae etiquetas legibles', ()=>{
  const c = catalogo_('Septiembre');
  igual(c.items.length, 19);
  const g = c.items.find(i=>i.subcategoria==='🥑 Groceries ');
  igual(g.etiqueta, '🥑 Groceries  | Gastos Esenciales | queda $419.60');
});
t('marca cuando te pasaste del presupuesto', ()=>{
  const r = agregarTransaccion_({monto:100, subcategoria:'Nails', mes:'Septiembre'});
  if(!/Te pasaste \$40\.00/.test(r.mensaje)) throw new Error('mensaje: '+r.mensaje);
  const c = catalogo_('Septiembre');
  const excedido = c.items.find(i=>i.subcategoria==='💅 Nails');
  igual(excedido.etiqueta, '💅 Nails | Gastos Esenciales | excedido $40.00');
});
t('resumen suma por categoria', ()=>{
  const r = resumen_('Septiembre');
  const ge = r.categorias.find(c=>c.categoria==='Gastos Esenciales');
  igual(ge.gastado, 1318.4); igual(ge.estimado, 2025);
});

console.log('\n--- seguridad ---');
t('token invalido se rechaza', ()=>{ let m=''; try{ verificarToken_('otro'); }catch(e){m=e.message;} if(m!=='Token invalido.') throw new Error(m); });
t('doGet sin token responde error, no explota', ()=>{
  const r = JSON.parse(doGet({parameter:{}}).texto ? doGet({parameter:{}}).texto : '{}');
});
