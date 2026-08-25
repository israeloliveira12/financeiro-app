/* ================= Utilidades ================= */
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const METHODS = ['Pix','Cartão de Crédito','Boleto','Transferência','Dinheiro','Débito automático','Outro'];
const fmt = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
// Formato compacto pra rótulos de valor dentro dos gráficos (espaço é curto ali) — ex: 1.234 -> "1,2k"
function fmtCompact(v){
  const n = num(v);
  const abs = Math.abs(n);
  if(abs>=1000) return (n/1000).toFixed(abs>=10000?0:1).replace('.',',') + 'k';
  return Math.round(n).toString();
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function keyParts(k){ const [y,m]=k.split('-').map(Number); return {y,m}; }
function addMonthsToKey(k,n){ let {y,m}=keyParts(k); m+=n; while(m>12){m-=12;y++;} while(m<1){m+=12;y--;} return `${y}-${String(m).padStart(2,'0')}`; }
function monthLabel(k){ const {y,m}=keyParts(k); return `${MONTH_NAMES[m-1]} ${y}`; }
function monthShort(k){ const {y,m}=keyParts(k); return `${MONTH_NAMES[m-1].slice(0,3)}/${String(y).slice(2)}`; }
function monthDiff(a,b){ const A=keyParts(a),B=keyParts(b); return (B.y-A.y)*12+(B.m-A.m); }
function num(v){ const n=parseFloat(v); return isNaN(n)?0:n; }
function escapeAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
// Escapa texto do usuário antes de entrar em innerHTML. TODA descrição, nome de
// cartão ou mensagem montada com dado digitado precisa passar por aqui — sem isso
// um "<img src=x onerror=...>" numa descrição executa código, fica salvo no state
// e volta sincronizado em todo aparelho (bug real, corrigido em 2026-08).
function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ================= Datas de vencimento ================= */
// Um "dia do mês" (1-31) vira a data real daquele mês, sem estourar em meses curtos:
// dia 31 em fevereiro cai no último dia do mês, não em 3 de março.
function dueDateOf(monthKey, day){
  if(!day) return null;
  const {y,m} = keyParts(monthKey);
  const ultimo = new Date(y, m, 0).getDate();
  return new Date(y, m-1, Math.min(num(day), ultimo));
}
function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function daysUntil(date){
  if(!date) return null;
  return Math.round((new Date(date).setHours(0,0,0,0) - startOfToday()) / 86400000);
}
function shortDate(date){
  return date ? `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}` : '';
}
// Só fala do que ainda vai vencer. O app não classifica nada como "atrasado" —
// quem controla se a conta foi paga é o usuário, no status do lançamento.
function relativeDueLabel(dias){
  if(dias===null) return '';
  if(dias <= 0) return 'vence hoje';
  if(dias === 1) return 'vence amanhã';
  return `vence em ${dias} dias`;
}
