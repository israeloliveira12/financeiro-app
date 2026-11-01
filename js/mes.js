/* ================= Mês a mês ================= */
/* Filtro de status das três tabelas. Começa em 'aberto' porque é o estado útil
   em quase toda visita — o que já foi resolvido não pede nada. Vive em memória,
   como `mesSection`: trocar de mês mantém a escolha, recarregar volta ao padrão. */
let mesFiltro = 'aberto';
// "Resolvido" = quitado por inteiro. Parcial e Lançado continuam à vista de
// propósito: ainda falta dinheiro neles.
function entryDone(e, kind){ return e.status === (kind==='income' ? 'Recebido' : 'Pago'); }
/* Os três formulários de inclusão ficavam abertos o tempo todo — 14 campos
   permanentes numa tela que é feita pra ler e marcar status. Agora abrem no
   lugar, ao clicar. O estado vive no próprio DOM (atributo hidden), então
   sobrevive aos re-renders do renderMes sem precisar de variável. */
const ADD_LABELS = { income:'receita', fixed:'despesa fixa', variable:'despesa variável' };
function toggleAddForm(kind){
  const wrap = document.getElementById('addwrap-'+kind);
  const btn = document.getElementById('addbtn-'+kind);
  if(!wrap || !btn) return;
  const abrir = wrap.hidden;
  wrap.hidden = !abrir;
  btn.setAttribute('aria-expanded', String(abrir));
  btn.textContent = (abrir ? '− Fechar' : '+ Adicionar ') + (abrir ? '' : ADD_LABELS[kind]);
  btn.classList.toggle('open', abrir);
  if(abrir){
    const campo = wrap.querySelector('input');
    if(campo) campo.focus();
  }
}
// O bloco "Análise do mês" lembra se estava aberto — preferência do aparelho,
// não dado da conta, então fica numa chave global e não em localKey().
const ANALISE_KEY = 'financeiro_analise_open';
function saveAnaliseOpen(open){ try{ localStorage.setItem(ANALISE_KEY, open ? '1' : '0'); }catch(e){} }
function restoreAnaliseOpen(){
  const el = document.getElementById('mes-analise');
  if(!el) return;
  let v = null;
  try{ v = localStorage.getItem(ANALISE_KEY); }catch(e){}
  el.open = v === '1';
}
function setMesFiltro(v){
  mesFiltro = v;
  document.querySelectorAll('#mes-filtro-toggle button').forEach(b=>b.classList.toggle('active', b.dataset.filtro===v));
  renderMes();
}
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
    {label:'A pagar', value:fmt.format(payable), cls: payable>0?'neg':'', delta:'', key:true},
    {label:'A receber', value:fmt.format(receivable), cls: receivable>0?'pos':'', delta:'', key:true},
    {label:'Saldo do mês', value:fmt.format(t.balance), cls:t.balance>=0?'pos':'neg', delta: deltaHTML(t.balance, prevT.balance, true), key:true},
    {label:'Saldo acumulado', value:fmt.format(acc), cls:acc>=0?'pos':'neg', delta:''},
  ];
  // Faixa única no lugar de seis caixas iguais: os três números que pedem ação
  // (A pagar / A receber / Saldo do mês) ganham destaque, o resto é contexto.
  document.getElementById('mes-cards').innerHTML = cardDefs.map(c=>
    `<div class="stat${c.key?' key':''}"><div class="label">${esc(c.label)}</div><div class="value ${esc(c.cls)}">${esc(c.value)}</div>${c.delta}</div>`
  ).join('');

  document.getElementById('mes-faturas-wrap').style.display = state.cards.length ? 'block' : 'none';
  document.getElementById('mes-secondary-grid').style.gridTemplateColumns = state.cards.length ? '' : '1fr';
  if(state.cards.length) renderFaturasInto(mm, 'mes-faturas-panel', currentMonth);
  renderMethodBreakdown(mm, 'mes-method-panel');

  renderEntryTable('tbl-income', mm.income, 'income', 'resolved-income');
  renderEntryTable('tbl-fixed', mm.fixed, 'fixed', 'resolved-fixed');
  renderEntryTable('tbl-variable', mm.variable, 'variable', 'resolved-variable');
  renderFiltroInfo(mm);
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

// Conta e soma o que o filtro esconderia, por categoria.
function doneEntries(mm, kind){
  const cat = kind==='income' ? mm.income : (kind==='fixed' ? mm.fixed : mm.variable);
  return cat.filter(e=>entryDone(e, kind));
}
function renderFiltroInfo(mm){
  const el = document.getElementById('mes-filtro-info');
  if(!el) return;
  const total = mm.income.length + mm.fixed.length + mm.variable.length;
  const feitos = ['income','fixed','variable'].reduce((n,k)=>n + doneEntries(mm,k).length, 0);
  // De propósito só a contagem aqui: somar receita recebida com despesa paga daria
  // um valor sem significado. O dinheiro aparece por categoria, no rodapé de cada tabela.
  if(mesFiltro!=='aberto'){
    el.textContent = total ? `Mostrando os ${total} lançamentos do mês.` : '';
  } else if(feitos){
    el.textContent = `${total-feitos} em aberto · ${feitos} já resolvido${feitos>1?'s':''} oculto${feitos>1?'s':''}.`;
  } else {
    el.textContent = total ? `${total} em aberto · nada resolvido ainda.` : '';
  }
}
function renderEntryTable(tbodyId, list, kind, resolvedId){
  const tbody = document.getElementById(tbodyId);
  const feitos = list.filter(e=>entryDone(e, kind));
  const visiveis = mesFiltro==='aberto' ? list.filter(e=>!entryDone(e, kind)) : list;

  /* O filtro tira a linha da tabela, nunca o dinheiro da tela — mesma regra do
     bug das reticências nos cards (ver CLAUDE.md): número de verdade não some. */
  const rod = document.getElementById(resolvedId);
  if(rod){
    if(mesFiltro==='aberto' && feitos.length){
      const rotulo = kind==='income' ? 'recebido' : 'pago';
      rod.innerHTML = `<span>${esc(feitos.length)} ${esc(rotulo)}${feitos.length>1?'s':''} · <span class="resolved-val">${esc(fmt.format(sumEntries(feitos)))}</span></span>`
        + `<button type="button" class="linklike" onclick="setMesFiltro('todos')">mostrar</button>`;
      rod.style.display = '';
    } else {
      rod.innerHTML = '';
      rod.style.display = 'none';
    }
  }

  if(!visiveis.length){
    const msg = (mesFiltro==='aberto' && list.length) ? 'Tudo resolvido neste mês.' : 'Nada lançado ainda.';
    tbody.innerHTML = `<tr><td colspan="${kind==='income'?4:5}" class="empty">${msg}</td></tr>`;
    return;
  }
  tbody.innerHTML = visiveis.map(e=>{
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

/* ---------- Reajuste em lote de um lançamento que se repete ----------
   Existe para o caso que compromisso não cobre: uma receita que volta todo mês
   mas com valor diferente a cada um (ex: "SIGES"). Compromisso é valor fixo, então
   essas entradas são lançadas na mão — e um aumento de R$ 12 obrigava a editar mês
   a mês. Aqui o vínculo entre os meses é a própria descrição, que é como o usuário
   já identifica o lançamento. */
function sameNameEntries(kind, desc, fromMonth){
  const alvo = String(desc||'').trim().toLowerCase();
  if(!alvo) return [];
  const out = [];
  // Só percorre meses que já existem — nunca usar ensureMonth aqui, senão varrer
  // o histórico passaria a materializar meses vazios (ver regra lazy no CLAUDE.md).
  Object.keys(state.months).forEach(k=>{
    if(fromMonth && monthDiff(k, fromMonth) > 0) return; // anterior ao início: preserva
    (state.months[k][kind]||[]).forEach(e=>{
      if(e.commitmentId) return; // compromisso tem o fluxo próprio de alterar valor
      if(String(e.desc||'').trim().toLowerCase() !== alvo) return;
      out.push({ mes:k, e });
    });
  });
  return out;
}
// Lê os três campos do reajuste de uma vez só — a prévia e o "Aplicar" leem iguais.
function bulkAdjustInputs(){
  const valorRaw = document.getElementById('ba-valor').value;
  let fromMonth = document.getElementById('ba-month').value;
  // Piso no mês atual. O que já passou fica completamente fora do reajuste e da
  // prévia — pedido explícito do usuário: só interessa o que ainda vai ser recebido,
  // então nem como linha "já recebido" o passado deve aparecer.
  if(fromMonth && monthDiff(fromMonth, currentMonth) > 0) fromMonth = currentMonth;
  const subtrai = document.getElementById('ba-op').value === 'subtrair';
  return { valorRaw, fromMonth, subtrai, delta: (subtrai ? -1 : 1) * num(valorRaw) };
}
/* Meses que o usuário desmarcou na prévia. Guarda os desmarcados (e não os
   marcados) de propósito: a prévia é redesenhada a cada tecla e um mês que passa a
   caber no filtro deve entrar já marcado — o padrão é "aplica em todos". */
let bulkAdjustDeselected = new Set();
/* Decide o que mudaria, sem alterar nada. A prévia do modal e o "Aplicar" chamam
   exatamente esta função, então o que o usuário confere antes de salvar nunca pode
   discordar do que acontece de fato — se mudar uma regra aqui, muda nos dois.
   `mudancas` = o que a regra permite mudar; `selecionadas` = o que ele escolheu. */
function planBulkAdjust(kind, desc, fromMonth, delta){
  const concluido = kind==='income' ? 'Recebido' : 'Pago';
  const mudancas = [], ignorados = [];
  sameNameEntries(kind, desc, fromMonth)
    .sort((a,b)=>a.mes.localeCompare(b.mes))
    .forEach(({mes,e})=>{
      const antes = num(e.amount);
      // histórico fechado não muda
      if(e.status===concluido){ ignorados.push({mes, antes, motivo:'já '+concluido.toLowerCase()}); return; }
      const depois = Math.round((antes + delta) * 100) / 100;
      // nunca deixa valor zerado/negativo
      if(depois <= 0){ ignorados.push({mes, antes, motivo:'ficaria zerado'}); return; }
      mudancas.push({ mes, e, antes, depois });
    });
  const selecionadas = mudancas.filter(m=>!bulkAdjustDeselected.has(m.mes));
  return { mudancas, selecionadas, ignorados, concluido };
}
function toggleBulkMonth(mes, kind, id){
  if(bulkAdjustDeselected.has(mes)) bulkAdjustDeselected.delete(mes);
  else bulkAdjustDeselected.add(mes);
  renderBulkPreview(kind, id);
  // Redesenhar troca o DOM inteiro, então devolve o foco pra caixa que acabou de ser
  // clicada — senão o Tab recomeça do topo a cada marcação.
  const volta = document.getElementById('ba-chk-'+mes);
  if(volta) volta.focus();
}
function toggleBulkAll(kind, id){
  const alvo = ensureMonth(currentMonth)[kind].find(x=>x.id===id);
  if(!alvo) return;
  const { fromMonth, delta } = bulkAdjustInputs();
  const { mudancas, selecionadas } = planBulkAdjust(kind, alvo.desc, fromMonth, delta);
  if(selecionadas.length) mudancas.forEach(m=>bulkAdjustDeselected.add(m.mes));
  else mudancas.forEach(m=>bulkAdjustDeselected.delete(m.mes));
  renderBulkPreview(kind, id);
}
/* Prévia ao vivo dentro do modal: redesenhada a cada tecla, mostra mês a mês como
   está e como vai ficar, mais os que ficam de fora e por quê. */
function renderBulkPreview(kind, id){
  const box = document.getElementById('ba-preview');
  if(!box) return;
  const alvo = ensureMonth(currentMonth)[kind].find(x=>x.id===id);
  if(!alvo) return;
  const { valorRaw, fromMonth, delta } = bulkAdjustInputs();
  if(!validAmount(valorRaw) || !fromMonth){
    box.innerHTML = `<p class="ba-hint">Digite um valor para ver como cada mês vai ficar.</p>`;
    return;
  }
  const { mudancas, selecionadas, ignorados } = planBulkAdjust(kind, alvo.desc, fromMonth, delta);
  if(!mudancas.length && !ignorados.length){
    box.innerHTML = `<p class="ba-hint">Nenhum lançamento a partir de ${esc(monthLabel(fromMonth))}.</p>`;
    return;
  }
  const somaAntes = selecionadas.reduce((s,m)=>s+m.antes,0);
  const somaDepois = selecionadas.reduce((s,m)=>s+m.depois,0);
  // O resumo conta só o que está marcado — é o total que o "Aplicar" vai mexer.
  let resumo;
  if(!mudancas.length) resumo = 'Nenhum mês pode ser alterado por este reajuste.';
  else if(!selecionadas.length) resumo = 'Nenhum mês selecionado.';
  else resumo = `${esc(selecionadas.length)}${mudancas.length>selecionadas.length ? ' de '+esc(mudancas.length) : ''} mês(es) · total ${esc(fmt.format(somaAntes))} → <strong>${esc(fmt.format(somaDepois))}</strong>`;
  const acao = mudancas.length
    ? `<button type="button" class="ba-all" onclick="toggleBulkAll('${esc(kind)}','${esc(id)}')">${selecionadas.length ? 'Desmarcar todos' : 'Marcar todos'}</button>`
    : '';
  const valor = (antes, direita)=>
    `<span class="ba-val"><span class="de">${esc(fmt.format(antes))}</span>${direita}</span>`;
  box.innerHTML = `
    <div class="ba-head"><p class="ba-hint">${resumo}</p>${acao}</div>
    <div class="ba-list">
      ${mudancas.map(m=>{
        const on = !bulkAdjustDeselected.has(m.mes);
        return `<label class="ba-row ba-pick${on?'':' is-off'}">
          <input type="checkbox" id="ba-chk-${esc(m.mes)}" ${on?'checked':''} onchange="toggleBulkMonth('${esc(m.mes)}','${esc(kind)}','${esc(id)}')">
          <span class="ba-mes">${esc(monthLabel(m.mes))}</span>
          ${valor(m.antes, `<span class="seta">→</span><span class="para">${esc(fmt.format(m.depois))}</span>`)}
        </label>`;
      }).join('')}
      ${ignorados.map(i=>`<div class="ba-row is-skip">
          <input type="checkbox" disabled aria-hidden="true" tabindex="-1">
          <span class="ba-mes">${esc(monthLabel(i.mes))}</span>
          ${valor(i.antes, `<span class="motivo">${esc(i.motivo)}</span>`)}
        </div>`).join('')}
    </div>`;
}
function applyBulkAdjust(kind, id){
  const mm = ensureMonth(currentMonth);
  const alvo = mm[kind].find(x=>x.id===id);
  if(!alvo) return;
  const { valorRaw, fromMonth, subtrai, delta } = bulkAdjustInputs();
  if(!validAmount(valorRaw)) return fieldError('ba-valor','O valor do reajuste precisa ser maior que zero.');
  if(!fromMonth) return fieldError('ba-month','Escolha a partir de qual mês o reajuste vale.');

  const { mudancas, selecionadas, ignorados, concluido } = planBulkAdjust(kind, alvo.desc, fromMonth, delta);
  const pulouInvalido = ignorados.filter(i=>i.motivo==='ficaria zerado').length;
  const pulouConcluido = ignorados.length - pulouInvalido;
  const desmarcados = mudancas.length - selecionadas.length;

  if(!selecionadas.length){
    let motivo;
    if(desmarcados) motivo = 'nenhum mês está marcado na prévia';
    else if(pulouInvalido) motivo = `o reajuste deixaria ${pulouInvalido} lançamento(s) com valor zero ou negativo`;
    else if(pulouConcluido) motivo = `os ${pulouConcluido} lançamento(s) desse período já estão como ${concluido}`;
    else motivo = `nenhum lançamento foi encontrado a partir de ${monthLabel(fromMonth)}`;
    showToast(`Nada alterado em "${alvo.desc}": ${motivo}.`, 'error');
    return;
  }

  const snapshot = selecionadas.map(m=>({ e:m.e, antes:m.antes }));
  selecionadas.forEach(m=>{ m.e.amount = m.depois; });

  const sinal = subtrai ? '−' : '+';
  const ressalva = [
    pulouConcluido ? `${pulouConcluido} já ${concluido.toLowerCase()}(s) mantido(s)` : null,
    pulouInvalido ? `${pulouInvalido} ignorado(s) por zerar o valor` : null,
    desmarcados ? `${desmarcados} desmarcado(s) na prévia` : null,
  ].filter(Boolean).join(', ');
  // Com seleção parcial, "a partir de X" mentiria — o log nomeia os meses escolhidos.
  const nomes = selecionadas.map(m=>monthLabel(m.mes));
  const onde = desmarcados
    ? 'em ' + (nomes.length > 4 ? nomes.slice(0,4).join(', ') + ` e mais ${nomes.length-4}` : nomes.join(', '))
    : `a partir de ${monthLabel(fromMonth)}`;
  logAudit('Edição', `Reajuste em lote: "${alvo.desc}" ${sinal}${fmt.format(Math.abs(delta))} em ${snapshot.length} lançamento(s), ${onde}${ressalva?' ('+ressalva+')':''}.`);
  closeModal();
  save(); renderMes(); renderDashboard();
  showUndoToast(`"${alvo.desc}" ${sinal}${fmt.format(Math.abs(delta))} em ${snapshot.length} mês(es)${ressalva?' · '+ressalva:''}.`, ()=>{
    snapshot.forEach(s=>{ s.e.amount = s.antes; });
    save(); renderMes(); renderDashboard();
  });
}

function openEntryEditModal(kind, id){
  bulkAdjustDeselected = new Set(); // cada abertura começa com todos os meses marcados
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
  // Só oferece o reajuste em lote quando o lançamento de fato se repete e não vem
  // de compromisso (esse tem o próprio "Alterar valor a partir de um mês").
  const repeticoes = linkedCommitment ? 0 : sameNameEntries(kind, e.desc, currentMonth).length;
  const ajusteSection = repeticoes > 1 ? `
        <div class="modal-section ba-section">
          <h4>Reajustar em vários meses</h4>
          <p class="small" style="margin:0;">"${esc(e.desc)}" aparece em ${esc(repeticoes)} meses de ${esc(monthLabel(currentMonth))} em diante. Some ou subtraia um valor em todos de uma vez; desmarque abaixo os que não devem mudar.</p>
          <div class="entry-form">
            <div class="narrow"><label for="ba-op">Operação</label><select id="ba-op" onchange="renderBulkPreview('${esc(kind)}','${esc(id)}')"><option value="somar">Somar</option><option value="subtrair">Subtrair</option></select></div>
            <div class="narrow"><label for="ba-valor">Valor</label><input type="number" step="0.01" min="0.01" id="ba-valor" placeholder="0,00" oninput="renderBulkPreview('${esc(kind)}','${esc(id)}')"></div>
            <div><label for="ba-month">A partir de</label><input type="month" id="ba-month" value="${esc(currentMonth)}" min="${esc(currentMonth)}" onchange="renderBulkPreview('${esc(kind)}','${esc(id)}')"></div>
            <div class="btn-wrap"><button class="btn" onclick="applyBulkAdjust('${esc(kind)}','${esc(id)}')">Aplicar</button></div>
          </div>
          <div class="ba-preview" id="ba-preview"></div>
          <p class="small" style="margin-top:8px;">Meses anteriores nunca mudam. "Aplicar" vale só para o reajuste.</p>
        </div>` : '';
  const html = `
    <div class="modal-overlay">
      <div class="modal-box${ajusteSection?' has-ba':''}" role="dialog" aria-modal="true" aria-labelledby="em-title">
        <h3 id="em-title">Editar lançamento</h3>
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
        ${ajusteSection}
        <div class="modal-close-row">
          <button class="btn secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn" onclick="saveEntryEdit('${esc(kind)}','${esc(id)}')" style="margin-left:8px;">Salvar</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
  refreshCardSelects();
  if(repeticoes > 1) renderBulkPreview(kind, id);
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
