/* ================= Mês a mês ================= */
function renderMes(){
  document.getElementById('mes-label').textContent = monthLabel(currentMonth);
  const t = monthTotals(currentMonth);
  const acc = accumulatedUpTo(currentMonth);
  const mm = t.mm;
  const payable = sumPayable(mm);
  const receivable = sumReceivable(mm);
  const prevT = peekMonthTotals(addMonthsToKey(currentMonth,-1));
  const cardDefs = [
    {label:'Receita', value:fmt.format(t.income), cls:'', delta: deltaHTML(t.income, prevT.income, true)},
    {label:'Despesas', value:fmt.format(t.expenses), cls:'', delta: deltaHTML(t.expenses, prevT.expenses, false)},
    {label:'A pagar', value:fmt.format(payable), cls: payable>0?'neg':'', delta:''},
    {label:'A receber', value:fmt.format(receivable), cls: receivable>0?'pos':'', delta:''},
    {label:'Saldo do mês', value:fmt.format(t.balance), cls:t.balance>=0?'pos':'neg', delta: deltaHTML(t.balance, prevT.balance, true)},
    {label:'Saldo acumulado', value:fmt.format(acc), cls:acc>=0?'pos':'neg', delta:''},
  ];
  document.getElementById('mes-cards').innerHTML = cardDefs.map(c=>`<div class="card"><div class="label">${c.label}</div><div class="value ${c.cls}">${c.value}</div>${c.delta}</div>`).join('');

  document.getElementById('mes-faturas-wrap').style.display = state.cards.length ? 'block' : 'none';
  document.getElementById('mes-secondary-grid').style.gridTemplateColumns = state.cards.length ? '' : '1fr';
  if(state.cards.length) renderFaturasInto(mm, 'mes-faturas-panel', currentMonth);
  renderMethodBreakdown(mm, 'mes-method-panel');

  renderEntryTable('tbl-income', mm.income, 'income');
  renderEntryTable('tbl-fixed', mm.fixed, 'fixed');
  renderEntryTable('tbl-variable', mm.variable, 'variable');
  document.getElementById('tot-income').textContent = fmt.format(sumEntries(mm.income));
  document.getElementById('tot-fixed').textContent = fmt.format(sumEntries(mm.fixed));
  document.getElementById('tot-variable').textContent = fmt.format(sumEntries(mm.variable));
  refreshCardSelects();
  setMesSection(mesSection);
}
let mesSection = 'receitas';
function setMesSection(section){
  mesSection = section;
  document.querySelectorAll('#mes-section-toggle button').forEach(b=>b.classList.toggle('active', b.dataset.section===section));
  document.getElementById('mes-panel-receitas').classList.toggle('section-active', section==='receitas');
  document.getElementById('mes-panel-fixas').classList.toggle('section-active', section==='fixas');
  document.getElementById('mes-panel-variaveis').classList.toggle('section-active', section==='variaveis');
}

function renderEntryTable(tbodyId, list, kind){
  const tbody = document.getElementById(tbodyId);
  if(!list.length){
    tbody.innerHTML = `<tr><td colspan="${kind==='income'?4:5}" class="empty">Nada lançado ainda.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(e=>{
    const methodCell = kind==='income' ? '' : `<td class="small" data-label="Método">${methodDisplay(e)}</td>`;
    const progressNote = e.status==='Parcial' ? `<div class="progress-note">${fmt.format(e.paidAmount||0)} de ${fmt.format(e.amount)}</div>` : '';
    const linkedCommitment = e.commitmentId && state.commitments.some(c=>c.id===e.commitmentId);
    return `<tr>
      <td data-label="Descrição">${esc(e.desc)}${linkedCommitment?'<br><span class="tag-commit">auto</span>':''}</td>
      ${methodCell}
      <td class="num" data-label="Valor">${fmt.format(e.amount)}</td>
      <td data-label="Status"><div class="status-cell"><button type="button" class="badge ${badgeClass(e.status)}" onclick="cycleStatus('${esc(kind)}','${esc(e.id)}')" title="Clique para avançar o status">${esc(e.status)}</button>${progressNote}</div></td>
      <td class="row-actions"><button onclick="openEntryEditModal('${esc(kind)}','${esc(e.id)}')" title="Editar" aria-label="Editar ${escapeAttr(e.desc)}">${ICON.edit}</button><button class="del" onclick="deleteEntry('${esc(kind)}','${esc(e.id)}')" title="Excluir" aria-label="Excluir ${escapeAttr(e.desc)}">${ICON.trash}</button></td>
    </tr>`;
  }).join('');
}

function openEntryEditModal(kind, id){
  const mm = ensureMonth(currentMonth);
  const e = mm[kind].find(x=>x.id===id);
  if(!e) return;
  const isCardMethod = e.method==='Cartão de Crédito';
  const linkedCommitment = e.commitmentId && state.commitments.some(c=>c.id===e.commitmentId);
  const methodSection = kind==='income' ? '' : `
    <div class="entry-form" style="margin-top:0;">
      <div><label>Método</label><select id="em-method" onchange="document.getElementById('em-card-wrap').style.display=this.value==='Cartão de Crédito'?'block':'none'">${methodOptionsHTML(e.method)}</select></div>
      <div id="em-card-wrap" style="display:${isCardMethod?'block':'none'};"><label>Cartão</label><select id="em-card" class="card-select">${cardOptionsHTML(e.cardId)}</select></div>
    </div>`;
  const paidLabel = kind==='income' ? 'Recebido até agora' : 'Pago até agora';
  const html = `
    <div class="modal-overlay">
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="em-title">
        <div class="modal-head">
          <h3 id="em-title">Editar lançamento</h3>
          <button class="modal-x" onclick="closeModal()" aria-label="Fechar">${ICON.close}</button>
        </div>
        <p class="modal-sub">${linkedCommitment ? 'Este lançamento vem de um compromisso fixo — as mudanças aqui valem só para ' + esc(monthLabel(currentMonth)) + '.' : esc(monthLabel(currentMonth))}</p>
        <div class="entry-form" style="margin-top:0;">
          <div><label for="em-desc">Descrição</label><input type="text" id="em-desc" value="${escapeAttr(e.desc)}"></div>
          <div><label for="em-amount">Valor</label><input type="number" step="0.01" min="0.01" id="em-amount" value="${esc(e.amount)}"></div>
        </div>
        ${methodSection}
        <div class="entry-form">
          <div><label for="em-paid">${esc(paidLabel)}</label><input type="number" step="0.01" min="0" id="em-paid" value="${esc(e.paidAmount||0)}"></div>
          <div><label for="em-move-month">Mover para o mês</label><input type="month" id="em-move-month" value="${esc(currentMonth)}"></div>
        </div>
        <div class="modal-close-row">
          <button class="btn secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn" onclick="saveEntryEdit('${esc(kind)}','${esc(id)}')" style="margin-left:8px;">Salvar</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
  refreshCardSelects();
  focusModal();
}

function saveEntryEdit(kind, id){
  const mm = ensureMonth(currentMonth);
  const e = mm[kind].find(x=>x.id===id);
  if(!e) return;
  const amountRaw = document.getElementById('em-amount').value;
  if(!validAmount(amountRaw)) return fieldError('em-amount','O valor precisa ser maior que zero.');
  const before = { desc:e.desc, amount:e.amount, method:e.method, cardId:e.cardId, paidAmount:e.paidAmount||0, status:e.status };
  e.desc = document.getElementById('em-desc').value.trim() || e.desc;
  e.amount = num(amountRaw);
  if(kind!=='income'){
    e.method = document.getElementById('em-method').value;
    e.cardId = e.method==='Cartão de Crédito' ? document.getElementById('em-card').value : undefined;
    delete e.isCard;
  }
  const paidVal = num(document.getElementById('em-paid').value);
  const fullStatus = kind==='income' ? 'Recebido' : 'Pago';
  if(paidVal<=0){
    e.paidAmount = 0;
  } else if(paidVal>=e.amount){
    e.paidAmount = e.amount;
    e.status = fullStatus;
  } else {
    e.paidAmount = paidVal;
    e.status = 'Parcial';
  }

  const targetMonth = document.getElementById('em-move-month').value;
  let moved = false;
  if(targetMonth && targetMonth !== currentMonth){
    let proceed = true;
    const linkedCommitment = e.commitmentId && state.commitments.some(c=>c.id===e.commitmentId);
    if(linkedCommitment){
      proceed = confirm(`"${e.desc}" vem de um compromisso fixo. Mover para outro mês desliga esse lançamento do compromisso automático — ele vira um lançamento manual, só no mês de destino. O compromisso continua gerando o lançamento normalmente nos outros meses. Continuar?`);
      if(proceed) delete e.commitmentId;
    }
    if(proceed){
      mm[kind] = mm[kind].filter(x=>x.id!==id);
      const targetMM = ensureMonth(targetMonth);
      targetMM[kind].push(e);
      moved = true;
    }
  }

  closeModal();
  const paidLabel = kind==='income' ? 'Recebido' : 'Pago';
  const diff = auditDiff([
    ['Descrição', before.desc, e.desc],
    ['Valor', fmt.format(before.amount), fmt.format(e.amount)],
    kind!=='income' ? ['Método', before.method||'—', e.method||'—'] : null,
    kind!=='income' ? ['Cartão', before.cardId?cardName(before.cardId):'—', e.cardId?cardName(e.cardId):'—'] : null,
    [paidLabel, fmt.format(before.paidAmount), fmt.format(e.paidAmount||0)],
    ['Status', before.status, e.status],
  ]);
  const movedInfo = moved ? ` Movido para ${monthLabel(targetMonth)}.` : '';
  logAudit('Edição', `Lançamento "${e.desc}" editado em ${monthLabel(currentMonth)}${diff ? ' — '+diff : ''}.${movedInfo}`);
  save();
  renderMes();
  renderDashboard();
  if(moved) renderCompromissos();
}
function cycleStatus(kind, id){
  const mm = ensureMonth(currentMonth);
  const e = mm[kind].find(x=>x.id===id);
  if(!e) return;
  const ns = nextStatus(e,kind);
  const oldStatus = e.status;
  e.status = ns;
  if(ns==='Pago' || ns==='Recebido') e.paidAmount = e.amount;
  if(ns==='Pendente') e.paidAmount = 0;
  logAudit('Status', `"${e.desc}" mudou de ${oldStatus} para ${ns} em ${monthLabel(currentMonth)}.`);
  save(); renderMes(); renderDashboard();
}
function deleteEntry(kind, id){
  const mm = ensureMonth(currentMonth);
  const e = mm[kind].find(x=>x.id===id);
  if(!e) return;
  const monthAtDelete = currentMonth;
  let skipWasAdded = false;
  let commit = null;

  if(e.commitmentId){
    commit = state.commitments.find(x=>x.id===e.commitmentId);
    if(commit){
      if(!commit.skipMonths) commit.skipMonths = [];
      if(!commit.skipMonths.includes(monthAtDelete)){
        commit.skipMonths.push(monthAtDelete);
        skipWasAdded = true;
      }
    }
  }
  mm[kind] = mm[kind].filter(x=>x.id!==id);
  const kindLabel = kind==='income' ? 'Receita' : (kind==='fixed' ? 'Despesa fixa' : 'Despesa variável');
  logAudit('Exclusão', `${kindLabel} "${e.desc}" (${fmt.format(e.amount)}, status ${e.status}) excluída de ${monthLabel(monthAtDelete)}.`);
  save(); renderMes(); renderCompromissos(); renderDashboard();

  const msg = commit
    ? `Removido de ${monthLabel(monthAtDelete)}. "${commit.desc}" continua ativo nos outros meses.`
    : `"${e.desc}" excluído.`;
  showUndoToast(msg, () => {
    const targetMM = ensureMonth(monthAtDelete);
    targetMM[kind].push(e);
    if(skipWasAdded && commit){
      commit.skipMonths = commit.skipMonths.filter(k=>k!==monthAtDelete);
    }
    save(); renderMes(); renderCompromissos(); renderDashboard();
  });
}
function addIncome(){
  const desc = document.getElementById('inc-desc').value.trim();
  const amountRaw = document.getElementById('inc-amount').value;
  const amount = num(amountRaw);
  if(!desc) return fieldError('inc-desc','Escreva uma descrição para a receita.');
  if(!validAmount(amountRaw)) return fieldError('inc-amount','O valor precisa ser maior que zero.');
  const mm = ensureMonth(currentMonth);
  mm.income.push({id:uid(), desc, amount, status:'Pendente'});
  document.getElementById('inc-desc').value=''; document.getElementById('inc-amount').value='';
  logAudit('Lançamento', `Receita "${desc}" de ${fmt.format(amount)} lançada em ${monthLabel(currentMonth)}, status Pendente.`);
  save(); renderMes();
  document.getElementById('inc-desc').focus(); // depois do render, pra emendar o próximo
}
function addManual(kind){
  const p = kind==='fixed' ? 'fix' : 'var';
  const desc = document.getElementById(p+'-desc').value.trim();
  const amountRaw = document.getElementById(p+'-amount').value;
  const amount = num(amountRaw);
  const method = document.getElementById(p+'-method').value;
  const cardId = method==='Cartão de Crédito' ? document.getElementById(p+'-card').value : undefined;
  if(!desc) return fieldError(p+'-desc','Escreva uma descrição para a despesa.');
  if(!validAmount(amountRaw)) return fieldError(p+'-amount','O valor precisa ser maior que zero.');
  if(method==='Cartão de Crédito' && !cardId) return fieldError(p+'-card','Cadastre um cartão antes de lançar no crédito.');
  const mm = ensureMonth(currentMonth);
  mm[kind].push({id:uid(), desc, amount, method, cardId, status:'Pendente'});
  document.getElementById(p+'-desc').value='';
  document.getElementById(p+'-amount').value='';
  const kindLabel = kind==='fixed' ? 'Despesa fixa' : 'Despesa variável';
  const methodInfo = method ? ` via ${method}${method==='Cartão de Crédito' && cardId ? ' ('+cardName(cardId)+')' : ''}` : '';
  logAudit('Lançamento', `${kindLabel} "${desc}" de ${fmt.format(amount)} lançada em ${monthLabel(currentMonth)}${methodInfo}, status Pendente.`);
  save(); renderMes();
  document.getElementById(p+'-desc').focus(); // depois do render, pra emendar o próximo
}
function toggleCardSelect(prefix){
  const method = document.getElementById(prefix+'-method').value;
  const wrap = document.getElementById(prefix+'-card-wrap');
  if(!wrap) return;
  wrap.style.display = method==='Cartão de Crédito' ? 'block' : 'none';
  refreshCardSelects();
}
document.getElementById('mes-prev').onclick = ()=>{ currentMonth = addMonthsToKey(currentMonth,-1); renderMes(); };
document.getElementById('mes-next').onclick = ()=>{ currentMonth = addMonthsToKey(currentMonth,1); renderMes(); };
document.getElementById('mes-today').onclick = ()=>{ currentMonth = todayKey(); renderMes(); };

// Enter em qualquer campo do formulário de lançamento dispara o "Adicionar" —
// digitar descrição + valor e ter que pegar o mouse era o atrito diário do app.
function bindEnterToAdd(fieldIds, run){
  fieldIds.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('keydown', ev=>{
      if(ev.key==='Enter'){ ev.preventDefault(); run(); }
    });
  });
}
bindEnterToAdd(['inc-desc','inc-amount'], ()=>addIncome());
bindEnterToAdd(['fix-desc','fix-amount','fix-method','fix-card'], ()=>addManual('fixed'));
bindEnterToAdd(['var-desc','var-amount','var-method','var-card'], ()=>addManual('variable'));
function toggleLegendPopover(){
  const el = document.getElementById('status-legend-popover');
  el.style.display = el.style.display==='none' ? 'flex' : 'none';
}
