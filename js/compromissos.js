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
  /* Estorno só faz sentido em compra parcelada no cartão: é o cartão que antecipa
     parcelas e lança crédito na fatura. */
  const estornoSection = (c.type==='installment' && isCardMethod) ? `
        <div class="modal-section">
          <h4>Cancelar compra / estorno</h4>
          <p class="small" style="margin:0 0 10px;">Compra cancelada? O cartão resolve tudo numa fatura só. Abra o estorno para escolher como o seu banco fez e ver a prévia antes de aplicar.</p>
          <button class="btn danger" onclick="openEstornoModal('${esc(c.id)}')">Cancelar compra / estornar</button>
        </div>` : '';
  const html = `
    <div class="modal-overlay">
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="mm-title">
        <h3 id="mm-title">${esc(c.desc)}</h3>
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

        ${estornoSection}

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
/* ===================== Estorno / cancelamento de parcelamento =====================
   Quando uma compra parcelada no cartão é cancelada, o banco não mexe nas faturas
   passadas: ele resolve tudo numa fatura só. Mas CADA BANCO resolve de um jeito, e
   os dois que o usuário já viu estão cobertos aqui:

     'antecipar'  o banco joga todas as parcelas que faltam para a fatura do mês do
                  cancelamento e credita o valor de uma vez (foi o que o Picpay fez:
                  as 11 parcelas restantes foram para dezembro junto com um crédito
                  de R$ 7.615,18).
     'uma-a-uma'  o banco deixa cada parcela no mês dela e lança um crédito em cada
                  mês, anulando uma a uma.

   Fazer isso na mão já custou horas e um saldo errado (ver CLAUDE.md, seção de
   estornos): são 11 lançamentos pra mover, um compromisso pra encerrar e um
   crédito pra criar, e esquecer qualquer peça deixa o limite e o "A pagar" errados. */

// Parcelas JÁ MATERIALIZADAS desse parcelamento, de `fromMonth` em diante, ainda não
// quitadas. Casa por commitmentId E pela descrição no formato "Desc 3/12", porque uma
// parcela que foi pulada (skipMonths) e relançada à mão perde o vínculo com o compromisso
// — é exatamente o caso do "iPhone 17 Pro 2/12" do usuário.
function parcelasParaEstornar(c, fromMonth){
  const re = new RegExp('^' + String(c.desc||'').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\d+\\s*/\\s*\\d+$');
  const out = [];
  Object.keys(state.months).forEach(k=>{
    if(!fromMonth || monthDiff(fromMonth, k) < 0) return;   // anterior ao início: preserva
    ['fixed','variable'].forEach(cat=>{
      (state.months[k][cat]||[]).forEach(e=>{
        if(e.status === 'Pago') return;                      // histórico fechado não muda
        if(e.commitmentId === c.id || re.test(e.desc||'')) out.push({ mes:k, cat, e });
      });
    });
  });
  return out.sort((a,b)=> a.mes.localeCompare(b.mes));
}

// Créditos de estorno já lançados para este compromisso, em qualquer mês.
function estornosExistentes(c){
  const alvo = 'Estorno ' + String(c.desc||'');
  const out = [];
  Object.keys(state.months).forEach(k=>{
    (state.months[k].variable||[]).forEach(e=>{
      if((e.desc||'') === alvo) out.push({ mes:k, e });
    });
  });
  return out.sort((a,b)=> a.mes.localeCompare(b.mes));
}

/* Modal proprio, e nao uma secao do "Gerenciar compromisso": a previa de 12 parcelas
   somava 645px num modal que ja tinha cinco secoes, e o botao "Aplicar" ficava fora
   da tela (medido: 1400px de modal em 900px de janela). Aqui a classe `has-est` faz a
   mesma cadeia flex do `has-ba` — titulo, campos e botoes sempre visiveis, e a
   `.est-list` como unica coisa que rola. */
function openEstornoModal(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  const sug = c.endMonth && monthDiff(c.endMonth, todayKey()) > 0 ? addMonthsToKey(c.endMonth,1) : todayKey();
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box has-est" role="dialog" aria-modal="true" aria-labelledby="est-title">
        <h3 id="est-title">Cancelar compra / estorno</h3>
        <p class="modal-sub">${esc(c.desc)} &middot; ${esc(c.total)}x de ${esc(fmt.format(num(c.amount)))} no ${esc(cardName(c.cardId))}</p>
        <div class="est-section">
          <div class="entry-form" style="margin-top:0;">
            <div><label for="est-from">Cancelar a partir de</label><input type="month" id="est-from" value="${esc(sug)}" onchange="renderEstornoPreview('${esc(id)}')"></div>
            <div><label for="est-modo">Como o banco fez</label><select id="est-modo" onchange="renderEstornoPreview('${esc(id)}')">
              <option value="antecipar">Antecipou tudo e creditou de uma vez</option>
              <option value="uma-a-uma">Credita parcela a parcela</option>
            </select></div>
          </div>
          <div class="entry-form">
            <div id="est-mes-wrap"><label for="est-mes">Fatura do crédito</label><input type="month" id="est-mes" value="${esc(todayKey())}" onchange="renderEstornoPreview('${esc(id)}')">
              <p class="field-note">O mês como você lança, não o do vencimento.</p></div>
            <div id="est-valor-wrap"><label for="est-valor">Valor creditado</label><input type="number" step="0.01" id="est-valor" placeholder="0,00" oninput="renderEstornoPreview('${esc(id)}')"></div>
          </div>
          <div class="est-preview" id="est-preview"></div>
        </div>
        <div class="modal-close-row">
          <button class="btn secondary" onclick="openManageModal('${esc(id)}')">Cancelar</button>
          <button class="btn danger" onclick="aplicarEstorno('${esc(id)}')">Aplicar estorno</button>
        </div>
      </div>
    </div>`;
  // O valor do crédito começa com a soma das parcelas em aberto; o usuário ajusta
  // quando o banco devolve também o que já foi pago.
  const p0 = planEstorno(id);
  if(p0 && p0.soma) document.getElementById('est-valor').value = p0.soma.toFixed(2);
  renderEstornoPreview(id);
  focusModal();
}

function estornoInputs(){
  return {
    from:   document.getElementById('est-from').value,
    modo:   document.getElementById('est-modo').value,
    mesCred:document.getElementById('est-mes').value,
    valor:  document.getElementById('est-valor').value,
  };
}

/* Decide o que mudaria sem alterar nada. A prévia e o "Aplicar" chamam esta mesma
   função — mesmo contrato do reajuste em lote: a prévia não pode mentir. */
function planEstorno(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return null;
  const inp = estornoInputs();
  const parcelas = parcelasParaEstornar(c, inp.from);
  const soma = parcelas.reduce((s,p)=> s + num(p.e.amount), 0);
  const valorCredito = inp.valor === '' ? soma : num(inp.valor);
  return { c, parcelas, soma, valorCredito, ...inp };
}

function renderEstornoPreview(id){
  const box = document.getElementById('est-preview');
  if(!box) return;
  const p = planEstorno(id);
  if(!p) return;
  const antecipa = p.modo === 'antecipar';
  document.getElementById('est-mes-wrap').style.display = antecipa ? '' : 'none';
  document.getElementById('est-valor-wrap').style.display = antecipa ? '' : 'none';

  if(!p.parcelas.length){
    box.innerHTML = `<p class="est-hint">Nenhuma parcela em aberto a partir de ${esc(monthLabel(p.from))}.</p>`;
    return;
  }
  /* Aplicar duas vezes no mesmo compromisso empilha créditos silenciosamente (visto
     em teste: 11 créditos extras no mesmo mês). Não bloqueia — pode ser um segundo
     estorno legítimo — mas avisa, porque o normal é ser engano. */
  const jaTem = estornosExistentes(p.c);
  const aviso = jaTem.length
    ? `<p class="est-alerta">Já existe ${esc(jaTem.length)} crédito(s) de estorno desta compra (${esc(jaTem.map(x=>monthLabel(x.mes)).join(', '))}). Aplicar de novo soma mais um.</p>`
    : '';
  const linhas = p.parcelas.map(x=>
    `<div class="est-row"><span class="est-mes">${esc(monthLabel(x.mes))}</span>`
    + `<span class="est-val">${esc(x.e.desc)} &middot; ${esc(fmt.format(num(x.e.amount)))}</span></div>`).join('');

  let resumo, credito;
  if(antecipa){
    credito = `<div class="est-row est-cred"><span class="est-mes">${esc(monthLabel(p.mesCred))}</span>`
      + `<span class="est-val">Crédito do estorno &middot; <strong>${esc(fmt.format(-Math.abs(p.valorCredito)))}</strong></span></div>`;
    // A diferença entre o crédito e as parcelas movidas quase sempre é proposital: o
    // banco devolve também o que você já pagou. Mostrar isso evita achar que é erro.
    const dif = Math.abs(p.valorCredito) - p.soma;
    resumo = `${esc(p.parcelas.length)} parcela(s) vão para <strong>${esc(monthLabel(p.mesCred))}</strong>`
      + ` (somam ${esc(fmt.format(p.soma))}), mais um crédito de ${esc(fmt.format(Math.abs(p.valorCredito)))}.`
      + (Math.abs(dif) > 0.005
          ? `<br><span class="est-dif">O crédito é ${esc(fmt.format(Math.abs(dif)))} ${dif>0?'maior':'menor'} que as parcelas movidas`
            + `${dif>0?' — normal quando o banco devolve também parcelas que você já pagou':''}.</span>`
          : '');
  } else {
    credito = p.parcelas.map(x=>
      `<div class="est-row est-cred"><span class="est-mes">${esc(monthLabel(x.mes))}</span>`
      + `<span class="est-val">Crédito &middot; <strong>${esc(fmt.format(-num(x.e.amount)))}</strong></span></div>`).join('');
    resumo = `Cada uma das ${esc(p.parcelas.length)} parcela(s) ganha um crédito no mês dela,`
      + ` anulando ${esc(fmt.format(p.soma))} no total.`;
  }

  box.innerHTML = aviso + `<p class="est-hint">${resumo}</p>`
    + `<div class="est-list"><div class="est-sub">Parcelas em aberto</div>${linhas}`
    + `<div class="est-sub">Crédito lançado</div>${credito}</div>`
    + `<p class="est-hint">O compromisso para de gerar parcelas a partir de ${esc(monthLabel(p.from))}.`
    + ` Parcelas já marcadas como Pago não são tocadas.</p>`;
}

function aplicarEstorno(id){
  const p = planEstorno(id);
  if(!p) return;
  if(!p.from) return fieldError('est-from','Escolha a partir de qual mês o cancelamento vale.');
  if(!p.parcelas.length) return showToast('Nenhuma parcela em aberto a partir desse mês.', 'error');
  const antecipa = p.modo === 'antecipar';
  if(antecipa){
    if(!p.mesCred) return fieldError('est-mes','Escolha em qual mês o crédito aparece.');
    if(!validAmount(p.valorCredito)) return fieldError('est-valor','Informe o valor do crédito, maior que zero.');
  }

  // Snapshot pro desfazer: os meses tocados inteiros, mais o endMonth anterior.
  // `null` marca mês que ainda nem existia, pra o desfazer apagá-lo de volta em vez
  // de deixar um mês materializado do nada.
  const tocados = new Set(p.parcelas.map(x=>x.mes));
  if(antecipa) tocados.add(p.mesCred);
  const snap = { endMonth: p.c.endMonth, months: {} };
  tocados.forEach(k=> snap.months[k] = state.months[k] ? JSON.parse(JSON.stringify(state.months[k])) : null);

  /* Encerra o compromisso ANTES de mexer nos lançamentos. A ordem importa: qualquer
     `ensureMonth` daqui pra frente recriaria a parcela que acabamos de tirar do mês,
     porque o compromisso ainda estaria ativo. Isso duplicou a parcela de dezembro
     num teste real antes de a ordem ser corrigida. */
  p.c.endMonth = addMonthsToKey(p.from, -1);

  const credito = (mes, valor, desc) => {
    const alvo = ensureMonth(mes);
    alvo.variable.push({ id: uid(), desc, amount: -Math.abs(valor),
      method: p.c.method, cardId: p.c.cardId, status: 'Lançado' });
  };

  if(antecipa){
    // Tira cada parcela do mês dela e recria no mês do crédito, como o banco fez.
    // Perde o commitmentId de propósito: deixaram de ser parcelas futuras geradas e
    // viraram linhas de uma fatura específica — mantendo o vínculo, `ensureMonth`
    // enxergaria várias parcelas do mesmo compromisso no mesmo mês.
    const destino = ensureMonth(p.mesCred);
    p.parcelas.forEach(({mes, cat, e})=>{
      const lista = state.months[mes][cat];
      const i = lista.indexOf(e);
      if(i >= 0) lista.splice(i, 1);
      const copia = Object.assign({}, e, { id: uid(), status: 'Lançado' });
      delete copia.commitmentId;
      destino[cat].push(copia);
    });
    credito(p.mesCred, p.valorCredito, `Estorno ${p.c.desc}`);
  } else {
    p.parcelas.forEach(({mes, e})=> credito(mes, num(e.amount), `Estorno ${p.c.desc}`));
  }

  const comoTxt = antecipa
    ? `antecipadas para ${monthLabel(p.mesCred)} com crédito único de ${fmt.format(Math.abs(p.valorCredito))}`
    : `creditadas uma a uma no mês de cada parcela (${fmt.format(p.soma)} no total)`;
  logAudit('Edição', `Estorno de "${p.c.desc}": ${p.parcelas.length} parcela(s) a partir de ${monthLabel(p.from)} ${comoTxt}. Compromisso encerrado em ${monthLabel(p.c.endMonth)}.`);
  closeModal();
  save(); renderAll();
  showUndoToast(`Estorno de "${p.c.desc}" aplicado em ${p.parcelas.length} parcela(s).`, ()=>{
    p.c.endMonth = snap.endMonth;
    if(snap.endMonth === undefined) delete p.c.endMonth;
    Object.keys(snap.months).forEach(k=>{
      if(snap.months[k]) state.months[k] = snap.months[k];
      else delete state.months[k];
    });
    save(); renderAll();
  });
}

function saveBasicCommitment(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  const before = { desc:c.desc, method:c.method, cardId:c.cardId, total:c.total };
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
