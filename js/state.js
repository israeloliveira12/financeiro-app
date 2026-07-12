/* ================= Estado ================= */
const STORAGE_KEY = 'financeiro_v2';
const OLD_STORAGE_KEY = 'financeiro_v1';
let state = null;
let currentMonth = todayKey();
let currentYear = keyParts(todayKey()).y;

function defaultState(){
  return { meta:{startingBalance:0}, cards:[], commitments:[], months:{}, projections:{}, auditLog:[] };
}
function logAudit(action, description){
  if(!state.auditLog) state.auditLog = [];
  state.auditLog.unshift({ id:uid(), ts:Date.now(), action, description });
  if(state.auditLog.length > 2000) state.auditLog.length = 2000;
}
function localKey(){
  // Cada conta tem sua própria chave no localStorage — evita que um aparelho
  // compartilhado misture o cache local de duas contas diferentes.
  return currentSession ? STORAGE_KEY + '_' + currentSession.user.id : STORAGE_KEY;
}
function loadLocalState(){
  try{
    const raw = localStorage.getItem(localKey());
    if(!raw) return null;
    return Object.assign(defaultState(), JSON.parse(raw));
  }catch(e){ return null; }
}
function save(){
  state.meta.lastModified = Date.now();
  localStorage.setItem(localKey(), JSON.stringify(state));
  scheduleCloudSync();
}

/* ================= Cartões: helpers ================= */
function cardName(id){ const c=state.cards.find(x=>x.id===id); return c?c.name:'—'; }
function cardColor(id){ const c=state.cards.find(x=>x.id===id); return c?(c.color||'#999'):'#999'; }
function cardOptionsHTML(selectedId){
  if(!state.cards.length) return `<option value="">Cadastre um cartão primeiro</option>`;
  return state.cards.map(c=>`<option value="${c.id}" ${c.id===selectedId?'selected':''}>${c.name}</option>`).join('');
}
function methodOptionsHTML(selected){
  return METHODS.map(m=>`<option value="${escapeAttr(m)}" ${m===selected?'selected':''}>${m}</option>`).join('');
}
function refreshCardSelects(){
  document.querySelectorAll('select.card-select').forEach(sel=>{
    const cur = sel.value;
    sel.innerHTML = cardOptionsHTML(cur);
  });
}
function methodDisplay(e){
  const method = e.method || (e.isCard ? 'Cartão de Crédito' : '');
  if(!method) return '—';
  if(method==='Cartão de Crédito'){
    const label = e.cardId ? cardName(e.cardId) : 'Cartão';
    return `<span title="Cartão de Crédito" style="white-space:nowrap;"><span class="tag-card" style="background:${cardColor(e.cardId)}"></span>${label}</span>`;
  }
  return `<span title="${escapeAttr(method)}">${method}</span>`;
}

/* ================= Compromissos: regras de vigência ================= */
function commitmentInfoForMonth(c, key){
  if(c.skipMonths && c.skipMonths.includes(key)) return null;
  if(c.endMonth && monthDiff(key,c.endMonth) < 0) return null;
  if(c.type==='monthly'){
    if(monthDiff(c.start,key) < 0) return null;
    return { label: c.desc, amount:c.amount };
  } else {
    const diff = monthDiff(c.start,key);
    if(diff<0) return null;
    const instNum = c.startNum + diff;
    if(instNum > c.total) return null;
    return { label: `${c.desc} ${instNum}/${c.total}`, amount:c.amount };
  }
}
function peekCommittedForMonth(key, category){
  return state.commitments
    .filter(c=>c.category===category)
    .reduce((sum,c)=>{ const info=commitmentInfoForMonth(c,key); return sum + (info? info.amount:0); },0);
}

/* ================= Garantir mês (gera entradas a partir dos compromissos) ================= */
function ensureMonth(key){
  if(!state.months[key]) state.months[key] = { income:[], fixed:[], variable:[] };
  const mm = state.months[key];
  ['income','fixed','variable'].forEach(cat=>{
    const existingIds = new Set(mm[cat].filter(e=>e.commitmentId).map(e=>e.commitmentId));
    state.commitments.filter(c=>c.category===cat).forEach(c=>{
      if(existingIds.has(c.id)) return;
      const info = commitmentInfoForMonth(c,key);
      if(!info) return;
      const entry = { id:uid(), desc:info.label, amount:info.amount, status:'Pendente', commitmentId:c.id };
      if(cat!=='income'){ entry.method = c.method||''; entry.cardId = c.method==='Cartão de Crédito' ? c.cardId : undefined; }
      mm[cat].push(entry);
    });
  });
  return mm;
}

/* ================= Cálculos ================= */
function sumEntries(list){ return list.reduce((s,e)=>s+num(e.amount),0); }
function remaining(e){ return Math.max(0, num(e.amount) - num(e.paidAmount||0)); }
function sumPayable(mm){ return [...mm.fixed, ...mm.variable].filter(e=>e.status!=='Pago').reduce((s,e)=>s+remaining(e),0); }
function sumReceivable(mm){ return mm.income.filter(e=>e.status!=='Recebido').reduce((s,e)=>s+remaining(e),0); }
function cardInvoiceTotals(mm, cardId){
  const entries = [...mm.fixed, ...mm.variable].filter(e=>(e.method==='Cartão de Crédito'||e.isCard) && e.cardId===cardId);
  const lancado = entries.filter(e=>e.status==='Lançado'||e.status==='Pago').reduce((s,e)=>s+num(e.amount),0);
  const pendente = entries.filter(e=>e.status==='Pendente'||e.status==='Parcial').reduce((s,e)=>s+remaining(e),0);
  return { lancado, pendente, previsto: lancado+pendente };
}
function cardLimitUsage(cardId){
  // Quanto do limite já está comprometido de verdade: só "Lançado"/"Parcial" contam
  // (já foi gasto de fato, mesmo que em fatura futura) — "Pendente" é só orçamento,
  // ainda não virou gasto real, então não consome limite até ser lançado.
  let used = 0;
  Object.keys(state.months).forEach(k=>{
    const mm = state.months[k];
    [...mm.fixed, ...mm.variable].forEach(e=>{
      if(!((e.method==='Cartão de Crédito'||e.isCard) && e.cardId===cardId)) return;
      if(e.status==='Lançado') used += num(e.amount);
      else if(e.status==='Parcial') used += remaining(e);
    });
  });
  return used;
}
function monthTotals(key){
  const mm = ensureMonth(key);
  const income = sumEntries(mm.income);
  const expenses = sumEntries(mm.fixed)+sumEntries(mm.variable);
  return {income,expenses,balance:income-expenses,mm};
}
function peekMonthTotals(key){
  // Igual a monthTotals, mas nunca cria/grava o mês no armazenamento — usado para
  // exibir meses ainda não visitados (ex: Visão do ano) sem "sujar" o backup.
  if(state.months[key]) return monthTotals(key);
  let income=0, expenses=0;
  ['income','fixed','variable'].forEach(cat=>{
    state.commitments.filter(c=>c.category===cat).forEach(c=>{
      const info = commitmentInfoForMonth(c,key);
      if(!info) return;
      if(cat==='income') income += info.amount; else expenses += info.amount;
    });
  });
  return {income,expenses,balance:income-expenses};
}
function earliestRelevantMonth(){
  const keys = Object.keys(state.months);
  const starts = state.commitments.map(c=>c.start).filter(Boolean);
  const all = keys.concat(starts);
  if(!all.length) return null;
  return all.sort()[0];
}
function accumulatedUpTo(key){
  let acc = num(state.meta.startingBalance);
  const start = earliestRelevantMonth();
  if(!start) return acc;
  let cursor = start;
  while(monthDiff(cursor,key) >= 0){
    acc += peekMonthTotals(cursor).balance;
    cursor = addMonthsToKey(cursor,1);
  }
  return acc;
}

/* ================= Status ================= */
function nextStatus(entry, kind){
  if(kind==='income'){
    if(entry.status==='Parcial') return 'Recebido';
    return entry.status==='Recebido' ? 'Pendente' : 'Recebido';
  }
  if(entry.status==='Parcial') return 'Pago';
  if(entry.method==='Cartão de Crédito' || entry.isCard){
    if(entry.status==='Pendente') return 'Lançado';
    if(entry.status==='Lançado') return 'Pago';
    return 'Pendente';
  }
  return entry.status==='Pago' ? 'Pendente' : 'Pago';
}
function badgeClass(status){
  return { 'Pendente':'pendente','Recebido':'recebido','Pago':'pago','Lançado':'lancado','Parcial':'parcial' }[status] || 'pendente';
}
