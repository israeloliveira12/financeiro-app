/* ================= Utilidades ================= */
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const METHODS = ['Pix','Cartão de Crédito','Boleto','Transferência','Dinheiro','Débito automático','Outro'];
const fmt = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function keyParts(k){ const [y,m]=k.split('-').map(Number); return {y,m}; }
function addMonthsToKey(k,n){ let {y,m}=keyParts(k); m+=n; while(m>12){m-=12;y++;} while(m<1){m+=12;y--;} return `${y}-${String(m).padStart(2,'0')}`; }
function monthLabel(k){ const {y,m}=keyParts(k); return `${MONTH_NAMES[m-1]} ${y}`; }
function monthShort(k){ const {y,m}=keyParts(k); return `${MONTH_NAMES[m-1].slice(0,3)}/${String(y).slice(2)}`; }
function monthDiff(a,b){ const A=keyParts(a),B=keyParts(b); return (B.y-A.y)*12+(B.m-A.m); }
function num(v){ const n=parseFloat(v); return isNaN(n)?0:n; }
function escapeAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
