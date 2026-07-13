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
  const amount = num(document.getElementById('cm-amount').value);
  const type = document.getElementById('cm-type').value;
  if(!desc || !amount) return;
  const c = { id:uid(), desc, category, amount, type };
  if(category!=='income'){
    c.method = document.getElementById('cm-method').value;
    c.cardId = c.method==='Cartão de Crédito' ? document.getElementById('cm-card').value : undefined;
  }
  if(type==='installment'){
    c.start = document.getElementById('cm-start').value || currentMonth;
    c.startNum = parseInt(document.getElementById('cm-startnum').value)||1;
    c.total = parseInt(document.getElementById('cm-total').value)||1;
  } else {
    c.start = document.getElementById('cm-start-monthly').value || currentMonth;
  }
  state.commitments.push(c);
  ['cm-desc','cm-amount'].forEach(id=>document.getElementById(id).value='');
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
    if(c.endMonth) progress += ` · encerra após ${monthLabel(c.endMonth)}`;
    if(c.skipMonths && c.skipMonths.length) progress += ` · ${c.skipMonths.length} mês(es) pulado(s)`;
    return `<tr>
      <td data-label="Descrição">${c.desc}</td>
      <td data-label="Categoria">${catLabel}</td>
      <td class="small" data-label="Método">${methodLabel}</td>
      <td class="num" data-label="Valor">${fmt.format(c.amount)}</td>
      <td class="small" data-label="Progresso">${progress}</td>
      <td class="row-actions"><button onclick="openManageModal('${c.id}')" title="Editar e gerenciar">${ICON.manage}</button><button class="del" onclick="removeCommitment('${c.id}')" title="Excluir compromisso inteiro">${ICON.trash}</button></td>
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
  root.innerHTML = `<div class="toast">
    <span>${message}</span>
    <button class="toast-undo" id="toast-undo-btn">Desfazer</button>
  </div>`;
  document.getElementById('toast-undo-btn').onclick = () => {
    clearTimeout(undoTimer);
    root.innerHTML = '';
    onUndo();
  };
  undoTimer = setTimeout(() => { root.innerHTML = ''; }, 7000);
}
function openManageModal(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  const suggestedFrom = monthDiff(c.start,todayKey())>0 ? todayKey() : c.start;
  const skipList = (c.skipMonths||[]).slice().sort();
  const skipHtml = skipList.length
    ? skipList.map(k=>`<span class="skip-chip">${monthLabel(k)} <button onclick="removeSkip('${c.id}','${k}')" title="Restaurar este mês">${ICON.close}</button></span>`).join('')
    : `<span class="small">Nenhum mês pulado.</span>`;
  const endInfo = c.endMonth
    ? `<p class="small">Encerrado a partir de <strong>${monthLabel(addMonthsToKey(c.endMonth,1))}</strong>.</p><button class="btn secondary" onclick="reactivateCommitment('${c.id}')">Reativar compromisso</button>`
    : `<div class="entry-form" style="margin-top:0;">
        <div><label>Parar de lançar a partir de</label><input type="month" id="stop-month" value="${addMonthsToKey(suggestedFrom,1)}"></div>
        <div class="btn-wrap"><button class="btn danger" onclick="stopCommitmentFrom('${c.id}')">Encerrar a partir deste mês</button></div>
      </div>`;
  const isCardMethod = c.method==='Cartão de Crédito';
  const methodField = c.category==='income' ? '' : `
    <div><label>Método</label><select id="mm-method" onchange="document.getElementById('mm-card-wrap').style.display=this.value==='Cartão de Crédito'?'block':'none'">${methodOptionsHTML(c.method)}</select></div>`;
  const cardField = c.category==='income' ? '' : `
    <div id="mm-card-wrap" style="display:${isCardMethod?'block':'none'};"><label>Cartão</label><select id="mm-card" class="card-select">${cardOptionsHTML(c.cardId)}</select></div>`;
  const totalField = c.type==='installment' ? `<div><label>Total de parcelas</label><input type="number" id="mm-total" value="${c.total}"></div>` : '';
  const html = `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <h3>${escapeAttr(c.desc)}</h3>
        <p class="modal-sub">Alterações aqui valem para os meses ainda não fechados como "Pago"/"Recebido" — o histórico já concluído não é alterado.</p>

        <div class="modal-section" style="border-top:none;padding-top:0;margin-top:0;">
          <h4>Dados do compromisso</h4>
          <div class="entry-form" style="margin-top:0;">
            <div><label>Descrição</label><input type="text" id="mm-desc" value="${escapeAttr(c.desc)}"></div>
            ${methodField}
          </div>
          <div class="entry-form">
            ${cardField}
            ${totalField}
          </div>
          <div class="modal-close-row" style="margin-top:10px;"><button class="btn secondary" onclick="saveBasicCommitment('${c.id}')">Salvar dados</button></div>
        </div>

        <div class="modal-section">
          <h4>Alterar valor a partir de um mês</h4>
          <div class="entry-form" style="margin-top:0;">
            <div><label>A partir do mês</label><input type="month" id="bulk-month" value="${suggestedFrom}"></div>
            <div><label>Novo valor</label><input type="number" step="0.01" id="bulk-amount" value="${c.amount}"></div>
            <div class="btn-wrap"><button class="btn" onclick="applyBulkAmount('${c.id}')">Aplicar</button></div>
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
}
function saveBasicCommitment(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  const before = { desc:c.desc, method:c.method, cardId:c.cardId, total:c.total };
  c.desc = document.getElementById('mm-desc').value.trim() || c.desc;
  if(c.category!=='income'){
    c.method = document.getElementById('mm-method').value;
    c.cardId = c.method==='Cartão de Crédito' ? document.getElementById('mm-card').value : undefined;
  }
  if(c.type==='installment'){
    const totalEl = document.getElementById('mm-total');
    if(totalEl) c.total = parseInt(totalEl.value)||c.total;
  }
  const diff = auditDiff([
    ['Descrição', before.desc, c.desc],
    c.category!=='income' ? ['Método', before.method||'—', c.method||'—'] : null,
    c.category!=='income' ? ['Cartão', before.cardId?cardName(before.cardId):'—', c.cardId?cardName(c.cardId):'—'] : null,
    c.type==='installment' ? ['Total de parcelas', before.total, c.total] : null,
  ]);
  logAudit('Edição', `Compromisso "${c.desc}" editado${diff ? ' — '+diff : ''}.`);
  save(); renderCompromissos(); renderMes(); renderDashboard();
  openManageModal(id);
}
function applyBulkAmount(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  const fromMonth = document.getElementById('bulk-month').value;
  const newAmount = num(document.getElementById('bulk-amount').value);
  if(!fromMonth || !newAmount) return;
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
