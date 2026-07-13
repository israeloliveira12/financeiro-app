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
      <td data-label="Descrição">${e.desc}${linkedCommitment?'<br><span class="tag-commit">auto</span>':''}</td>
      ${methodCell}
      <td class="num" data-label="Valor">${fmt.format(e.amount)}</td>
      <td data-label="Status"><div class="status-cell"><span class="badge ${badgeClass(e.status)}" onclick="cycleStatus('${kind}','${e.id}')">${e.status}</span>${progressNote}</div></td>
      <td class="row-actions"><button onclick="openEntryEditModal('${kind}','${e.id}')" title="Editar">${ICON.edit}</button><button class="del" onclick="deleteEntry('${kind}','${e.id}')" title="Excluir">${ICON.trash}</button></td>
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
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <h3>Editar lançamento</h3>
        <p class="modal-sub">${linkedCommitment ? 'Este lançamento vem de um compromisso fixo — as mudanças aqui valem só para ' + monthLabel(currentMonth) + '.' : monthLabel(currentMonth)}</p>
        <div class="entry-form" style="margin-top:0;">
          <div><label>Descrição</label><input type="text" id="em-desc" value="${escapeAttr(e.desc)}"></div>
          <div><label>Valor</label><input type="number" step="0.01" id="em-amount" value="${e.amount}"></div>
        </div>
        ${methodSection}
        <div class="entry-form">
          <div><label>${paidLabel}</label><input type="number" step="0.01" id="em-paid" value="${e.paidAmount||0}"></div>
          <div><label>Mover para o mês</label><input type="month" id="em-move-month" value="${currentMonth}"></div>
        </div>
        <div class="modal-close-row">
          <button class="btn secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn" onclick="saveEntryEdit('${kind}','${id}')" style="margin-left:8px;">Salvar</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
  refreshCardSelects();
}

function saveEntryEdit(kind, id){
  const mm = ensureMonth(currentMonth);
  const e = mm[kind].find(x=>x.id===id);
  if(!e) return;
  const before = { desc:e.desc, amount:e.amount, method:e.method, cardId:e.cardId, paidAmount:e.paidAmount||0, status:e.status };
  e.desc = document.getElementById('em-desc').value.trim() || e.desc;
  e.amount = num(document.getElementById('em-amount').value);
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
  const amount = num(document.getElementById('inc-amount').value);
  if(!desc || !amount) return;
  const mm = ensureMonth(currentMonth);
  mm.income.push({id:uid(), desc, amount, status:'Pendente'});
  document.getElementById('inc-desc').value=''; document.getElementById('inc-amount').value='';
  logAudit('Lançamento', `Receita "${desc}" de ${fmt.format(amount)} lançada em ${monthLabel(currentMonth)}, status Pendente.`);
  save(); renderMes();
}
function addManual(kind){
  const p = kind==='fixed' ? 'fix' : 'var';
  const desc = document.getElementById(p+'-desc').value.trim();
  const amount = num(document.getElementById(p+'-amount').value);
  const method = document.getElementById(p+'-method').value;
  const cardId = method==='Cartão de Crédito' ? document.getElementById(p+'-card').value : undefined;
  if(!desc || !amount) return;
  const mm = ensureMonth(currentMonth);
  mm[kind].push({id:uid(), desc, amount, method, cardId, status:'Pendente'});
  document.getElementById(p+'-desc').value='';
  document.getElementById(p+'-amount').value='';
  const kindLabel = kind==='fixed' ? 'Despesa fixa' : 'Despesa variável';
  const methodInfo = method ? ` via ${method}${method==='Cartão de Crédito' && cardId ? ' ('+cardName(cardId)+')' : ''}` : '';
  logAudit('Lançamento', `${kindLabel} "${desc}" de ${fmt.format(amount)} lançada em ${monthLabel(currentMonth)}${methodInfo}, status Pendente.`);
  save(); renderMes();
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
function toggleLegendPopover(){
  const el = document.getElementById('status-legend-popover');
  el.style.display = el.style.display==='none' ? 'flex' : 'none';
}
