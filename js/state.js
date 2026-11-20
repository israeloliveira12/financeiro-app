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
// Monta "campo: antes → depois" só para os pares que realmente mudaram —
// usado nas mensagens de edição da Auditoria para mostrar o que de fato mudou.
function auditDiff(pairs){
  const changed = pairs.filter(p=>p && String(p[1])!==String(p[2]));
  if(!changed.length) return '';
  return changed.map(([label,oldV,newV])=>`${label}: ${oldV} → ${newV}`).join('; ');
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
  return state.cards.map(c=>`<option value="${esc(c.id)}" ${c.id===selectedId?'selected':''}>${esc(c.name)}</option>`).join('');
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
    return `<span title="Cartão de Crédito" style="white-space:nowrap;"><span class="tag-card" style="background:${esc(cardColor(e.cardId))}"></span>${esc(label)}</span>`;
  }
  return `<span title="${escapeAttr(method)}">${esc(method)}</span>`;
}

/* ================= Validação de formulário ================= */
// Valor precisa ser um número positivo. Um "-500" digitado por engano passava
// direto e levava a despesa do mês pra negativo, sem nenhum sinal na tela.
function validAmount(v){ const n = num(v); return isFinite(n) && n > 0; }
/* Despesa PODE ser negativa: estorno do cartão, redução de anuidade, crédito
   que a fatura lança com "-" na frente. Antes isso era barrado junto com o
   "-500" digitado por engano, e não havia como lançar um abatimento. Zero
   continua barrado (lançamento de valor zero não quer dizer nada), e receita
   e compromisso seguem usando `validAmount` — só despesa aceita sinal. */
function validSignedAmount(v){ const n = num(v); return isFinite(n) && n !== 0; }
// Marca o campo em vermelho, foca nele e mostra o motivo — a validação antiga
// só dava `return` e o botão parecia não funcionar.
function fieldError(inputId, message){
  const el = document.getElementById(inputId);
  if(el){
    el.classList.add('has-error');
    el.setAttribute('aria-invalid','true');
    el.focus();
    const limpa = ()=>{ el.classList.remove('has-error'); el.removeAttribute('aria-invalid'); };
    el.addEventListener('input', limpa, {once:true});
    el.addEventListener('change', limpa, {once:true});
  }
  showToast(message, 'error');
  return false;
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
function remaining(e){
  const total = num(e.amount), pago = num(e.paidAmount||0);
  const falta = total - pago;
  // O clamp existe pra pagamento a maior não virar sobra. Num estorno (valor
  // negativo) o que falta também é negativo, então o clamp espelha o sinal —
  // sem isso um crédito de -30 virava 0 e não abatia o "A pagar" nem a fatura.
  return total < 0 ? Math.min(0, falta) : Math.max(0, falta);
}
/* Um crédito na fatura (estorno, desconto) abate o que você ainda vai
   desembolsar, e **esse abatimento não se desfaz quando ele é quitado**. Antes o
   filtro `status!=='Pago'` jogava o crédito fora assim que ele virava Pago, e
   "A pagar" subia de volta enquanto os gastos que ele abate continuavam em
   aberto — marcar o estorno como Pago inflava o número em 211,47 no caso real.
   Agora o crédito conta em qualquer status, e o total tem piso zero. */
function sumPayable(mm){
  let aberto = 0, credito = 0;
  [...mm.fixed, ...mm.variable].forEach(e=>{
    const a = num(e.amount);
    if(a < 0) credito += a;
    else if(e.status !== 'Pago') aberto += remaining(e);
  });
  return Math.max(0, aberto + credito);
}
function sumReceivable(mm){ return mm.income.filter(e=>e.status!=='Recebido').reduce((s,e)=>s+remaining(e),0); }
// Três grandezas independentes; "total" e "previsto" são soma delas.
//   pago     = o que já foi quitado (Pago inteiro + a parte paga dos Parciais)
//   lancado  = gasto de verdade e ainda em aberto (Lançado inteiro + o que falta dos Parciais)
//   pendente = só orçamento, ainda não virou gasto
// O antigo cálculo jogava o Parcial inteiro em "pendente" e contava "Pago" dentro
// de "lancado". Resultado: adiantar R$ 250 de uma parcela fazia esse valor sumir da
// tela, empurrava o restante pra "Pendente" (misturando dívida real com orçamento) e
// encolhia o "Previsto" — que agora fica estável, porque pagar só move dinheiro de
// "lancado" pra "pago". Isso também alinha o painel com a barra de limite do cartão,
// que sempre contou o restante do Parcial como limite usado (ver cardLimitUsage).
function cardInvoiceTotals(mm, cardId){
  const entries = [...mm.fixed, ...mm.variable].filter(e=>(e.method==='Cartão de Crédito'||e.isCard) && e.cardId===cardId);
  let pago = 0, lancado = 0, pendente = 0, credito = 0;
  entries.forEach(e=>{
    const a = num(e.amount);
    /* Crédito (estorno/desconto) não é "uma despesa negativa paga": ele ABATE as
       outras linhas da mesma fatura. Somado direto em `pago`, mudar o estorno de
       Lançado para Pago fazia a coluna "Lançado" saltar 211,47 — o valor saía do
       abatimento sem que nada tivesse sido quitado. Pendente continua abatendo o
       orçamento, que é onde ele estava antes. */
    if(a < 0){
      if(e.status==='Pendente') pendente += a;
      else credito += a;
      return;
    }
    if(e.status==='Pago') pago += a;
    else if(e.status==='Parcial'){ pago += num(e.paidAmount||0); lancado += remaining(e); }
    else if(e.status==='Lançado') lancado += a;
    else pendente += remaining(e); // Pendente
  });
  // Abate primeiro o que ainda está em aberto; só o que sobrar encosta no já pago.
  // Assim o número não depende de em qual status o crédito está, e quando a fatura
  // inteira é paga o crédito acaba em `pago`, que é o desembolso real.
  const noLancado = Math.max(-lancado, credito);
  lancado += noLancado;
  pago += credito - noLancado;
  return { pago, lancado, pendente, total: pago+lancado, previsto: pago+lancado+pendente };
}
function cardLimitUsage(cardId){
  /* Quanto do limite está comprometido de verdade. Conta FATURA POR FATURA
     (cartão + mês) e só depois soma, porque um estorno abate os gastos da fatura
     DELE — somando tudo de uma vez, um crédito antigo ficaria abatendo compra
     nova pra sempre.

     Gasto (valor positivo): "Lançado"/"Parcial" prendem limite; "Pendente" é só
     orçamento e "Pago" já liberou.

     Estorno (valor negativo): libera limite assim que entra na fatura e
     **continua liberando depois de quitado** — o dinheiro voltou pro cartão, não
     é algo que se desfaz quando a fatura fecha. Antes ele só contava em
     "Lançado", então marcar como Pago fazia a liberação evaporar e o limite usado
     subir de volta (bug real relatado pelo usuário). "Pendente" segue de fora:
     aí o estorno ainda é expectativa, não apareceu na fatura.

     O piso por fatura existe pra fechar a conta quando a fatura inteira é paga:
     os gastos saem, o estorno fica, e sem o piso a fatura passaria a devolver
     limite a mais do que o cartão tem. */
  let used = 0;
  Object.keys(state.months).forEach(k=>{
    const mm = state.months[k];
    let fatura = 0;
    [...mm.fixed, ...mm.variable].forEach(e=>{
      if(!((e.method==='Cartão de Crédito'||e.isCard) && e.cardId===cardId)) return;
      if(num(e.amount) < 0){
        if(e.status !== 'Pendente') fatura += num(e.amount);
      }
      else if(e.status==='Lançado') fatura += num(e.amount);
      else if(e.status==='Parcial') fatura += remaining(e);
    });
    used += Math.max(0, fatura);
  });
  return used;
}
/* Marcar UMA linha como "Pago" numa fatura que tem estorno pode afirmar um
   pagamento maior do que a fatura inteira deve — e aí o limite preso cai pra zero
   e o app passa a mostrar crédito que o banco não devolveu. Caso real
   (novembro/2026): o iPhone 17 Pro cancelado deixou 11 parcelas de R$ 634,59 em
   novembro, anuladas por um crédito de R$ 7.615,18. A fatura devia R$ 429,63, mas
   marcar UMA parcela dizia ao sistema que R$ 634,59 tinham sido pagos.
   Essas parcelas não foram pagas: foram canceladas. Quem quita uma fatura assim é
   o botão "Pagar fatura", que move tudo de uma vez — e aí a conta fecha certo. */
function pagamentoPassariaDaFatura(entry, monthKey){
  if(!((entry.method==='Cartão de Crédito' || entry.isCard) && entry.cardId)) return false;
  if(num(entry.amount) <= 0) return false;
  const mm = state.months[monthKey];
  if(!mm) return false;
  let abertos = 0, credito = 0;
  [...mm.fixed, ...mm.variable].forEach(x=>{
    if(!((x.method==='Cartão de Crédito'||x.isCard) && x.cardId===entry.cardId)) return;
    const a = num(x.amount);
    if(a < 0){ if(x.status !== 'Pendente') credito += -a; }
    else if(x.id !== entry.id && (x.status==='Lançado' || x.status==='Parcial')) abertos += remaining(x);
  });
  return credito > 0 && (abertos - credito) < -0.005;
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
/* Quanto o sistema PRESSUPÕE que já passou pela conta corrente: saldo inicial
   mais tudo que está marcado como Recebido/Pago (Parcial conta só a parte
   quitada). Esse é o único número do app que pode ser conferido direto contra o
   extrato do banco, e ele estava invisível.

   Por que importa: vale a identidade
       saldo acumulado = caixaEsperado + a receber − a pagar
   Ou seja, quando a conta "saldo em conta + a receber − a pagar" não bate com o
   saldo acumulado, **a diferença está sempre aqui** — em algo marcado como
   quitado que não aconteceu, ou numa saída real que nunca foi lançada. Nunca é
   erro de cálculo do app. Em novembro/2026 isso custou horas de procura manual
   e um lançamento "Temp" criado pra forçar o fechamento. */
function caixaEsperado(){
  let v = num(state.meta.startingBalance);
  const hoje = todayKey();
  Object.keys(state.months).forEach(k=>{
    if(monthDiff(k, hoje) < 0) return;   // mês futuro não passou pela conta ainda
    const mm = state.months[k];
    mm.income.forEach(e=>{
      if(e.status==='Recebido') v += num(e.amount);
      else if(e.status==='Parcial') v += num(e.paidAmount||0);
    });
    [...mm.fixed, ...mm.variable].forEach(e=>{
      if(e.status==='Pago') v -= num(e.amount);
      else if(e.status==='Parcial') v -= num(e.paidAmount||0);
    });
  });
  return v;
}

// Base de todos os cálculos proporcionais do mês, conforme definido pelo usuário:
// o que sobrou dos meses anteriores + a receita deste mês.
function disponivelDoMes(key, income){
  return accumulatedUpTo(addMonthsToKey(key,-1)) + num(income);
}

/* ================= Status ================= */
function nextStatus(entry, kind){
  if(kind==='income'){
    if(entry.status==='Parcial') return 'Recebido';
    return entry.status==='Recebido' ? 'Pendente' : 'Recebido';
  }
  if(entry.status==='Parcial') return 'Pago';
  const ehCartao = entry.method==='Cartão de Crédito' || entry.isCard;
  /* Crédito de cartão não tem "Pago": você não paga um estorno. Ele é quitado
     junto com a fatura, pelo botão "Pagar fatura" — nunca sozinho. Marcar só ele
     como Pago somava o crédito ao caixa como se tivesse entrado dinheiro na
     conta, o que não acontece: estorno abate fatura, não credita conta.
     O ciclo do clique passa a ser Pendente <-> Lançado; `payInvoice` continua
     podendo marcar Pago, que é o caminho correto. */
  if(ehCartao && num(entry.amount) < 0){
    return entry.status==='Lançado' ? 'Pendente' : 'Lançado';
  }
  if(ehCartao){
    if(entry.status==='Pendente') return 'Lançado';
    if(entry.status==='Lançado') return 'Pago';
    return 'Pendente';
  }
  return entry.status==='Pago' ? 'Pendente' : 'Pago';
}
function badgeClass(status){
  return { 'Pendente':'pendente','Recebido':'recebido','Pago':'pago','Lançado':'lancado','Parcial':'parcial' }[status] || 'pendente';
}
