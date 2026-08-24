/* ================= Compromissos ================= */
function toggleCommitFields(){
  const isInstallment = document.getElementById('cm-type').value === 'installment';
  document.getElementById('cm-installment-fields').style.display = isInstallment ? 'flex':'none';
  document.getElementById('cm-monthly-fields').style.display = isInstallment ? 'none':'flex';
}
function onCommitCategoryChange(){
  const isIncome = document.getElementById('cm-cat').value === 'income';
  document.getElementById('cm-method-fields').style.display = isIncome ? 'none' : 'flex';
}
function addCommitment(){
  const desc = document.getElementById('cm-desc').value.trim();
  const category = document.getElementById('cm-cat').value;
  const amountRaw = document.getElementById('cm-amount').value;
  const amount = num(amountRaw);
  const type = document.getElementById('cm-type').value;
  if(!desc) return fieldError('cm-desc','Escreva uma descrição para o compromisso.');
  if(!validAmount(amountRaw)) return fieldError('cm-amount','O valor precisa ser maior que zero.');
  const c = { id:uid(), desc, category, amount, type };
  if(category!=='income'){
    c.method = document.getElementById('cm-method').value;
    c.cardId = c.method==='Cartão de Crédito' ? document.getElementById('cm-card').value : undefined;
    if(c.method==='Cartão de Crédito' && !c.cardId) return fieldError('cm-card','Cadastre um cartão antes de usar o crédito.');
  }
  if(type==='installment'){
    c.start = document.getElementById('cm-start').value || currentMonth;
    c.startNum = parseInt(document.getElementById('cm-startnum').value)||1;
    c.total = parseInt(document.getElementById('cm-total').value)||1;
    // Sem isso, um "parcela 12 de 1" era aceito, aparecia na lista como compromisso
    // ativo e nunca gerava lançamento em mês nenhum — a conta simplesmente sumia.
    if(c.startNum > c.total) return fieldError('cm-startnum', `A parcela inicial (${c.startNum}) não pode ser maior que o total (${c.total}).`);
  } else {
    c.start = document.getElementById('cm-start-monthly').value || currentMonth;
  }
  const dueDay = parseInt(document.getElementById('cm-dueday').value);
  if(dueDay >= 1 && dueDay <= 31) c.dueDay = dueDay;
  state.commitments.push(c);
  ['cm-desc','cm-amount','cm-dueday'].forEach(id=>document.getElementById(id).value='');
  const catLabel = {fixed:'despesa fixa',variable:'despesa variável',income:'receita'}[category];
  const typeLabel = type==='installment' ? `parcelado ${c.startNum}/${c.total}` : 'mensal contínuo';
  const methodInfo = category!=='income' ? `, via ${c.method}${c.cardId?' ('+cardName(c.cardId)+')':''}` : '';
  logAudit('Registro', `Compromisso "${desc}" cadastrado (${catLabel}, ${typeLabel}, ${fmt.format(amount)}${methodInfo}, a partir de ${monthLabel(c.start)}).`);
  save(); renderCompromissos(); renderDashboard();
}
function removeCommitment(id){
  const idx = state.commitments.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removed] = state.commitments.splice(idx,1);
  const catLabel = {fixed:'despesa fixa',variable:'despesa variável',income:'receita'}[removed.category];
  logAudit('Exclusão', `Compromisso "${removed.desc}" (${catLabel}, ${fmt.format(removed.amount)}) removido.`);
  save(); renderCompromissos(); renderMes(); renderDashboard();
  showUndoToast(`"${removed.desc}" removido dos compromissos. Lançamentos já criados continuam existindo.`, () => {
    state.commitments.splice(idx,0,removed);
    save(); renderCompromissos(); renderMes(); renderDashboard();
  });
}
function renderCompromissos(){
  const tbody = document.getElementById('tbl-commitments');
  if(!state.commitments.length){ tbody.innerHTML = `<tr><td colspan="6" class="empty">Nenhum compromisso cadastrado ainda.</td></tr>`; return; }
  tbody.innerHTML = state.commitments.map(c=>{
    let progress;
    if(c.type==='monthly'){ progress = `Mensal contínuo desde ${monthLabel(c.start)}`; }
    else {
      const diff = monthDiff(c.start, todayKey());
      const cur = Math.min(Math.max(c.startNum+diff, c.startNum), c.total);
      progress = `${cur} / ${c.total} parcelas`;
    }
    const catLabel = {fixed:'Despesa fixa',variable:'Despesa variável',income:'Receita'}[c.category];
    const methodLabel = c.category==='income' ? '—' : methodDisplay(c);
    if(c.dueDay) progress += ` · vence dia ${c.dueDay}`;
    if(c.endMonth) progress += ` · encerra após ${monthLabel(c.endMonth)}`;
    if(c.skipMonths && c.skipMonths.length) progress += ` · ${c.skipMonths.length} mês(es) pulado(s)`;
    return `<tr>
      <td data-label="Descrição">${esc(c.desc)}</td>
      <td data-label="Categoria">${esc(catLabel)}</td>
      <td class="small" data-label="Método">${methodLabel}</td>
      <td class="num" data-label="Valor">${fmt.format(c.amount)}</td>
      <td class="small" data-label="Progresso">${esc(progress)}</td>
      <td class="row-actions"><button onclick="openManageModal('${esc(c.id)}')" title="Editar e gerenciar" aria-label="Gerenciar ${escapeAttr(c.desc)}">${ICON.manage}</button><button class="del" onclick="removeCommitment('${esc(c.id)}')" title="Excluir compromisso inteiro" aria-label="Excluir ${escapeAttr(c.desc)}">${ICON.trash}</button></td>
    </tr>`;
  }).join('');
  refreshCardSelects();
}

/* ---------- Modal: gerenciar parcelas / meses de um compromisso ---------- */
function closeModal(){ document.getElementById('modal-root').innerHTML = ''; }

/* ---------- Toast com "Desfazer" ---------- */
let undoTimer = null;
function showUndoToast(message, onUndo){
  const root = document.getElementById('toast-root');
  clearTimeout(undoTimer);
  root.innerHTML = `<div class="toast" role="status">
    <span>${esc(message)}</span>
    <button class="toast-undo" id="toast-undo-btn">Desfazer</button>
  </div>`;
  document.getElementById('toast-undo-btn').onclick = () => {
    clearTimeout(undoTimer);
    root.innerHTML = '';
    onUndo();
  };
  undoTimer = setTimeout(() => { root.innerHTML = ''; }, 7000);
}
// Aviso simples, sem "desfazer" — usado pela validação e pelo backup automático.
let msgTimer = null;
function showToast(message, kind){
  const root = document.getElementById('toast-root');
  clearTimeout(msgTimer);
  root.innerHTML = `<div class="toast ${kind==='error'?'is-error':''}" role="${kind==='error'?'alert':'status'}"><span>${esc(message)}</span></div>`;
  msgTimer = setTimeout(() => { root.innerHTML = ''; }, kind==='error' ? 5000 : 4000);
}
function openManageModal(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  const suggestedFrom = monthDiff(c.start,todayKey())>0 ? todayKey() : c.start;
  const skipList = (c.skipMonths||[]).slice().sort();
  const skipHtml = skipList.length
    ? skipList.map(k=>`<span class="skip-chip">${esc(monthLabel(k))} <button onclick="removeSkip('${esc(c.id)}','${esc(k)}')" title="Restaurar este mês" aria-label="Restaurar ${escapeAttr(monthLabel(k))}">${ICON.close}</button></span>`).join('')
    : `<span class="small">Nenhum mês pulado.</span>`;
  const endInfo = c.endMonth
    ? `<p class="small">Encerrado a partir de <strong>${esc(monthLabel(addMonthsToKey(c.endMonth,1)))}</strong>.</p><button class="btn secondary" onclick="reactivateCommitment('${esc(c.id)}')">Reativar compromisso</button>`
    : `<div class="entry-form" style="margin-top:0;">
        <div><label for="stop-month">Parar de lançar a partir de</label><input type="month" id="stop-month" value="${esc(addMonthsToKey(suggestedFrom,1))}"></div>
        <div class="btn-wrap"><button class="btn danger" onclick="stopCommitmentFrom('${esc(c.id)}')">Encerrar a partir deste mês</button></div>
      </div>`;
  const isCardMethod = c.method==='Cartão de Crédito';
  const methodField = c.category==='income' ? '' : `
    <div><label for="mm-method">Método</label><select id="mm-method" onchange="document.getElementById('mm-card-wrap').style.display=this.value==='Cartão de Crédito'?'block':'none'">${methodOptionsHTML(c.method)}</select></div>`;
  const cardField = c.category==='income' ? '' : `
    <div id="mm-card-wrap" style="display:${isCardMethod?'block':'none'};"><label for="mm-card">Cartão</label><select id="mm-card" class="card-select">${cardOptionsHTML(c.cardId)}</select></div>`;
  const totalField = c.type==='installment' ? `<div class="narrow"><label for="mm-total">Total de parcelas</label><input type="number" id="mm-total" min="1" value="${esc(c.total)}"></div>` : '';
  const html = `
    <div class="modal-overlay">
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="mm-title">
        <div class="modal-head">
          <h3 id="mm-title">${esc(c.desc)}</h3>
          <button class="modal-x" onclick="closeModal()" aria-label="Fechar">${ICON.close}</button>
        </div>
        <p class="modal-sub">Alterações aqui valem para os meses ainda não fechados como "Pago"/"Recebido" — o histórico já concluído não é alterado.</p>

        <div class="modal-section" style="border-top:none;padding-top:0;margin-top:0;">
          <h4>Dados do compromisso</h4>
          <div class="entry-form" style="margin-top:0;">
            <div><label for="mm-desc">Descrição</label><input type="text" id="mm-desc" value="${escapeAttr(c.desc)}"></div>
            ${methodField}
          </div>
          <div class="entry-form">
            ${cardField}
            ${totalField}
            <div class="narrow"><label for="mm-dueday">Vence dia</label><input type="number" id="mm-dueday" min="1" max="31" placeholder="—" value="${esc(c.dueDay||'')}"></div>
          </div>
          <div class="modal-close-row" style="margin-top:10px;"><button class="btn secondary" onclick="saveBasicCommitment('${esc(c.id)}')">Salvar dados</button></div>
        </div>

        <div class="modal-section">
          <h4>Alterar valor a partir de um mês</h4>
          <div class="entry-form" style="margin-top:0;">
            <div><label for="bulk-month">A partir do mês</label><input type="month" id="bulk-month" value="${esc(suggestedFrom)}"></div>
            <div><label for="bulk-amount">Novo valor</label><input type="number" step="0.01" min="0.01" id="bulk-amount" value="${esc(c.amount)}"></div>
            <div class="btn-wrap"><button class="btn" onclick="applyBulkAmount('${esc(c.id)}')">Aplicar</button></div>
          </div>
        </div>

        <div class="modal-section">
          <h4>Encerrar compromisso no futuro</h4>
          ${endInfo}
        </div>

        <div class="modal-section">
          <h4>Meses excluídos individualmente</h4>
          <div>${skipHtml}</div>
          <p class="small" style="margin-top:8px;">Para pular só um mês específico (ex: não lavou o carro), vá em "Mensal", encontre o lançamento automático e clique em excluir — ele volta a aparecer aqui, e você pode restaurar quando quiser.</p>
        </div>

        <div class="modal-close-row"><button class="btn secondary" onclick="closeModal()">Fechar</button></div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
  refreshCardSelects();
  focusModal();
}
function saveBasicCommitment(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  const before = { desc:c.desc, method:c.method, cardId:c.cardId, total:c.total, dueDay:c.dueDay };
  if(c.type==='installment'){
    const novoTotal = parseInt(document.getElementById('mm-total').value)||c.total;
    if(c.startNum > novoTotal) return fieldError('mm-total', `A parcela inicial (${c.startNum}) não pode ser maior que o total (${novoTotal}).`);
  }
  c.desc = document.getElementById('mm-desc').value.trim() || c.desc;
  if(c.category!=='income'){
    c.method = document.getElementById('mm-method').value;
    c.cardId = c.method==='Cartão de Crédito' ? document.getElementById('mm-card').value : undefined;
  }
  if(c.type==='installment'){
    const totalEl = document.getElementById('mm-total');
    if(totalEl) c.total = parseInt(totalEl.value)||c.total;
  }
  const dd = parseInt(document.getElementById('mm-dueday').value);
  if(dd >= 1 && dd <= 31) c.dueDay = dd; else delete c.dueDay;
  const diff = auditDiff([
    ['Descrição', before.desc, c.desc],
    c.category!=='income' ? ['Método', before.method||'—', c.method||'—'] : null,
    c.category!=='income' ? ['Cartão', before.cardId?cardName(before.cardId):'—', c.cardId?cardName(c.cardId):'—'] : null,
    c.type==='installment' ? ['Total de parcelas', before.total, c.total] : null,
    ['Vence dia', before.dueDay||'—', c.dueDay||'—'],
  ]);
  logAudit('Edição', `Compromisso "${c.desc}" editado${diff ? ' — '+diff : ''}.`);
  save(); renderCompromissos(); renderMes(); renderDashboard();
  openManageModal(id);
}
function applyBulkAmount(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  const fromMonth = document.getElementById('bulk-month').value;
  const amountRaw = document.getElementById('bulk-amount').value;
  const newAmount = num(amountRaw);
  if(!fromMonth) return fieldError('bulk-month','Escolha a partir de qual mês o novo valor vale.');
  if(!validAmount(amountRaw)) return fieldError('bulk-amount','O valor precisa ser maior que zero.');
  const oldAmount = c.amount;
  c.amount = newAmount;
  Object.keys(state.months).forEach(k=>{
    if(monthDiff(k,fromMonth) > 0) return; // mês anterior ao início da alteração: preserva
    const mm = state.months[k];
    ['income','fixed','variable'].forEach(cat=>{
      const e = mm[cat].find(x=>x.commitmentId===id);
      if(!e) return;
      if(e.status==='Pago' || e.status==='Recebido') return; // preserva histórico já concluído
      const info = commitmentInfoForMonth(c,k);
      if(info){ e.amount = info.amount; e.desc = info.label; }
    });
  });
  logAudit('Edição', `Valor de "${c.desc}" alterado de ${fmt.format(oldAmount)} para ${fmt.format(newAmount)} a partir de ${monthLabel(fromMonth)}.`);
  save(); closeModal(); renderCompromissos(); renderMes(); renderDashboard();
}
function stopCommitmentFrom(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  const stopFrom = document.getElementById('stop-month').value;
  if(!stopFrom) return;
  if(!confirm(`Encerrar "${c.desc}" a partir de ${monthLabel(stopFrom)}? Os meses já lançados continuam existindo.`)) return;
  c.endMonth = addMonthsToKey(stopFrom,-1);
  // remove lançamentos automáticos ainda pendentes de meses futuros já gerados
  Object.keys(state.months).forEach(k=>{
    if(monthDiff(k,stopFrom) > 0) return; // antes do encerramento: mantém
    const mm = state.months[k];
    ['income','fixed','variable'].forEach(cat=>{
      mm[cat] = mm[cat].filter(e=> !(e.commitmentId===id && e.status==='Pendente'));
    });
  });
  logAudit('Edição', `Compromisso "${c.desc}" encerrado a partir de ${monthLabel(stopFrom)}.`);
  save(); closeModal(); renderCompromissos(); renderMes(); renderDashboard();
}
function reactivateCommitment(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  delete c.endMonth;
  logAudit('Edição', `Compromisso "${c.desc}" reativado.`);
  save(); closeModal(); renderCompromissos(); renderMes(); renderDashboard();
}
function removeSkip(id, monthKey){
  const c = state.commitments.find(x=>x.id===id);
  if(!c || !c.skipMonths) return;
  c.skipMonths = c.skipMonths.filter(k=>k!==monthKey);
  save(); openManageModal(id); renderMes(); renderDashboard();
}
