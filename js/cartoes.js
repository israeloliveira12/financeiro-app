/* ================= Cartões ================= */
// Dia de fatura precisa ser 1-31; um "45" digitado por engano gerava vencimento
// impossível e quebrava a agenda de vencimentos.
function validDay(v){ const n = parseInt(v); return (n>=1 && n<=31) ? n : null; }
function addCard(){
  const name = document.getElementById('card-name').value.trim();
  if(!name) return fieldError('card-name','Dê um nome ao cartão.');
  const closingRaw = document.getElementById('card-closing').value;
  const dueRaw = document.getElementById('card-due').value;
  if(closingRaw && !validDay(closingRaw)) return fieldError('card-closing','O dia de fechamento precisa estar entre 1 e 31.');
  if(dueRaw && !validDay(dueRaw)) return fieldError('card-due','O dia de vencimento precisa estar entre 1 e 31.');
  const limitRaw = document.getElementById('card-limit').value;
  if(limitRaw && !validAmount(limitRaw)) return fieldError('card-limit','O limite precisa ser maior que zero.');
  const c = {
    id:uid(), name,
    bank: document.getElementById('card-bank').value.trim(),
    closingDay: validDay(closingRaw),
    dueDay: validDay(dueRaw),
    limit: num(limitRaw)||null,
    color: document.getElementById('card-color').value || '#0E7A5F'
  };
  state.cards.push(c);
  ['card-name','card-bank','card-closing','card-due','card-limit'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('card-color').value = '#0E7A5F';
  const details = [c.bank?`banco ${c.bank}`:null, c.closingDay?`fecha dia ${c.closingDay}`:null, c.dueDay?`vence dia ${c.dueDay}`:null, c.limit?`limite ${fmt.format(c.limit)}`:null].filter(Boolean).join(', ');
  logAudit('Registro', `Cartão "${name}" cadastrado${details?' ('+details+')':''}.`);
  save(); renderCartoes(); refreshCardSelects();
}
function removeCard(id){
  const idx = state.cards.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removed] = state.cards.splice(idx,1);
  logAudit('Exclusão', `Cartão "${removed.name}"${removed.bank?` (${removed.bank})`:''} removido.`);
  save(); renderCartoes(); refreshCardSelects(); renderDashboard();
  showUndoToast(`Cartão "${removed.name}" removido. Lançamentos que usavam ele continuam existindo.`, () => {
    state.cards.splice(idx,0,removed);
    save(); renderCartoes(); refreshCardSelects(); renderDashboard();
  });
}
function openCardEditModal(id){
  const c = state.cards.find(x=>x.id===id);
  if(!c) return;
  const html = `
    <div class="modal-overlay">
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="ecm2-title">
        <h3 id="ecm2-title">Editar cartão</h3>
        <div class="entry-form" style="margin-top:0;">
          <div><label for="ecm2-name">Nome do cartão</label><input type="text" id="ecm2-name" value="${escapeAttr(c.name)}"></div>
          <div><label for="ecm2-bank">Banco / bandeira</label><input type="text" id="ecm2-bank" value="${escapeAttr(c.bank||'')}"></div>
        </div>
        <div class="entry-form">
          <div class="narrow"><label for="ecm2-closing">Fecha dia</label><input type="number" id="ecm2-closing" min="1" max="31" value="${esc(c.closingDay||'')}"></div>
          <div class="narrow"><label for="ecm2-due">Vence dia</label><input type="number" id="ecm2-due" min="1" max="31" value="${esc(c.dueDay||'')}"></div>
          <div><label for="ecm2-limit">Limite de crédito</label><input type="number" step="0.01" min="0.01" id="ecm2-limit" value="${esc(c.limit||'')}" placeholder="Opcional"></div>
          <div class="narrow"><label for="ecm2-color">Cor</label><input type="color" id="ecm2-color" value="${escapeAttr(c.color||'#0E7A5F')}" style="padding:3px;height:38px;cursor:pointer;"></div>
        </div>
        <div class="modal-close-row">
          <button class="btn secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn" onclick="saveCardEdit('${esc(c.id)}')" style="margin-left:8px;">Salvar</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
  focusModal();
}
function saveCardEdit(id){
  const c = state.cards.find(x=>x.id===id);
  if(!c) return;
  const closingRaw = document.getElementById('ecm2-closing').value;
  const dueRaw = document.getElementById('ecm2-due').value;
  const limitRaw = document.getElementById('ecm2-limit').value;
  if(closingRaw && !validDay(closingRaw)) return fieldError('ecm2-closing','O dia de fechamento precisa estar entre 1 e 31.');
  if(dueRaw && !validDay(dueRaw)) return fieldError('ecm2-due','O dia de vencimento precisa estar entre 1 e 31.');
  if(limitRaw && !validAmount(limitRaw)) return fieldError('ecm2-limit','O limite precisa ser maior que zero.');
  const before = { name:c.name, bank:c.bank, closingDay:c.closingDay, dueDay:c.dueDay, limit:c.limit };
  c.name = document.getElementById('ecm2-name').value.trim() || c.name;
  c.bank = document.getElementById('ecm2-bank').value.trim();
  c.closingDay = validDay(closingRaw);
  c.dueDay = validDay(dueRaw);
  c.limit = num(limitRaw)||null;
  c.color = document.getElementById('ecm2-color').value || c.color;
  closeModal();
  const diff = auditDiff([
    ['Nome', before.name, c.name],
    ['Banco', before.bank||'—', c.bank||'—'],
    ['Fecha dia', before.closingDay||'—', c.closingDay||'—'],
    ['Vence dia', before.dueDay||'—', c.dueDay||'—'],
    ['Limite', before.limit?fmt.format(before.limit):'—', c.limit?fmt.format(c.limit):'—'],
  ]);
  logAudit('Edição', `Cartão "${c.name}" editado${diff ? ' — '+diff : ''}.`);
  save(); renderCartoes(); refreshCardSelects(); renderDashboard();
}
function renderCartoes(){
  const tbody = document.getElementById('tbl-cards');
  if(!state.cards.length){ tbody.innerHTML = `<tr><td colspan="6" class="empty">Nenhum cartão cadastrado ainda.</td></tr>`; return; }
  tbody.innerHTML = state.cards.map(c=>{
    return `<tr>
      <td data-label="Cartão"><span class="tag-card" style="background:${escapeAttr(c.color||'#999')}"></span>${esc(c.name)}</td>
      <td class="small" data-label="Banco">${esc(c.bank||'—')}</td>
      <td class="small" data-label="Fecha">${c.closingDay?('dia '+esc(c.closingDay)):'—'}</td>
      <td class="small" data-label="Vence">${c.dueDay?('dia '+esc(c.dueDay)):'—'}</td>
      <td class="num" data-label="Limite">${c.limit?fmt.format(c.limit):'—'}</td>
      <td class="row-actions"><button onclick="openCardEditModal('${esc(c.id)}')" title="Editar" aria-label="Editar ${escapeAttr(c.name)}">${ICON.edit}</button><button class="del" onclick="removeCard('${esc(c.id)}')" title="Excluir" aria-label="Excluir ${escapeAttr(c.name)}">${ICON.trash}</button></td>
    </tr>`;
  }).join('');
}
