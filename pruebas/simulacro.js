// Simulacro minimo de SpreadsheetApp reproduciendo la plantilla real.
const CATS = ['INGRESOS','GASTOS ESENCIALES','GASTOS DISCRECIONALES','PAGO DE DEUDAS','AHORROS','INVERSIONES'];

function celda(){ return ''; }
class Hoja {
  constructor(nombre, filas, cols){ this.nombre=nombre; this.filas=filas; this.cols=cols;
    this.d = Array.from({length:filas},()=>Array.from({length:cols},celda)); }
  getName(){ return this.nombre; }
  getMaxRows(){ return this.filas; }
  getMaxColumns(){ return this.cols; }
  getLastRow(){ let last=0; this.d.forEach((f,i)=>{ if(f.some(v=>v!=='' && v!==null)) last=i+1; }); return last; }
  set(r,c,v){ this.d[r-1][c-1]=v; }
  getRange(r,c,nr=1,nc=1){ const h=this;
    return {
      getValues(){ const out=[]; for(let i=0;i<nr;i++){ const fila=[]; for(let j=0;j<nc;j++) fila.push(h.d[r-1+i][c-1+j]); out.push(fila);} return out; },
      getDisplayValues(){ return this.getValues().map(f=>f.map(v=> v instanceof Date ? v.toDateString() : String(v===null||v===undefined?'':v))); },
      setValue(v){ h.d[r-1][c-1]=v; return this; },
      setNumberFormat(){ return this; },
    };
  }
}

function hojaMes(nombre, transacciones){
  const h = new Hoja(nombre, 120, 40);
  // Zona de resumen (encabezado SIN "Fecha"): fila 40
  CATS.forEach((cat,i)=>{ const c=1+i*5; h.set(39,c,cat); h.set(40,c,'Subcategoria'); h.set(40,c+1,'Estimado'); h.set(40,c+2,'Real'); });
  // Zona de transacciones (encabezado CON "Fecha"): fila 59
  CATS.forEach((cat,i)=>{ const c=1+i*5; h.set(58,c,cat); h.set(59,c,'Subcategoría'); h.set(59,c+1,'Fecha'); h.set(59,c+2,'Monto'); h.set(59,c+3,'N✏️'); });
  (transacciones||[]).forEach(t=>{ const c=1+CATS.indexOf(t.cat)*5; h.set(t.fila,c,t.sub); h.set(t.fila,c+2,t.monto); });
  return h;
}

const presupuesto = new Hoja('Presupuesto', 60, 40);
CATS.forEach((cat,i)=>{ const c=1+i*4; presupuesto.set(9,c,cat); presupuesto.set(10,c,'Subcategoría'); presupuesto.set(10,c+1,''); presupuesto.set(10,c+2,'Monto'); });
const subs = {
 'INGRESOS':[['KFE 🇺🇸',6500],['Pasivo Colombia 🇨🇴',130],['Andres Training 💪🏽',240]],
 'GASTOS ESENCIALES':[['🥑 Groceries ',465],['🏡  Rent ',1300],['⛽️ Car\'s gas',150],['💇 Haircut',50],['💅 Nails',60]],
 'GASTOS DISCRECIONALES':[['📱 Oskar\'s ',900],['🇨🇴 Mom ',200],['📱 Apple apps',40]],
 'PAGO DE DEUDAS':[['📱 Phone ',30],['🏠 MAI ',800]],
 'AHORROS':[['🎵 Airbnb Home // (ETF)',1200],['🚨  EMI // BoA debit',150],['🎫 Travel savings // Chase',500]],
 'INVERSIONES':[['🇨🇴 🌎 Pago Lote Acacias',215],['♥️ Own Donation',50],['📈 Shares ',350]],
};
CATS.forEach((cat,i)=>{ const c=1+i*4; subs[cat].forEach(([n,m],k)=>{ presupuesto.set(11+k,c,n); presupuesto.set(11+k,c+2,m); }); presupuesto.set(11+subs[cat].length,c,'Total'); });

const septiembre = hojaMes('Septiembre', [
  {cat:'GASTOS ESENCIALES', fila:60, sub:'🥑 Groceries ', monto:11},
  {cat:'GASTOS ESENCIALES', fila:61, sub:'🏡  Rent ', monto:1173},
  {cat:'INGRESOS', fila:60, sub:'KFE 🇺🇸', monto:1330},
]);
const hojas=[presupuesto, hojaMes('Enero',[]), septiembre, hojaMes('Octubre',[])];

global.SpreadsheetApp = {
  getActiveSpreadsheet: ()=>({
    getSheets: ()=>hojas,
    getSheetByName: (n)=>hojas.find(h=>h.getName()===n)||null,
    getSpreadsheetTimeZone: ()=>'America/New_York',
  }),
  flush: ()=>{},
};
global.Session = { getScriptTimeZone: ()=>'America/New_York' };
global.Utilities = { formatDate: (d,tz,f)=> f==='M' ? String(d.getMonth()+1) : d.toISOString() };
global.LockService = { getScriptLock: ()=>({ waitLock(){}, releaseLock(){} }) };
global.ContentService = { MimeType:{JSON:'json'}, createTextOutput:(t)=>({ setMimeType:()=>({texto:t}) }) };
global.Logger = { log: (...a)=>console.log(...a) };
module.exports = { hojas, septiembre, presupuesto };
