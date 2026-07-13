/* ================= Cartões ================= */
function addCard(){
  const name = document.getElementById('card-name').value.trim();
  if(!name) return;
  const c = {
    id:uid(), name,
    bank: document.getElementById('card-bank').value.trim(),
    closingDay: parseInt(document.getElementById('card-closing').value)||null,
    dueDay: parseInt(document.getElementById('card-due').value)||null,
    limit: num(document.getElementById('card-limit').value)||null,
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
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <h3>Editar cartão</h3>
        <div class="entry-form" style="margin-top:0;">
          <div><label>Nome do cartão</label><input type="text" id="ecm2-name" value="${escapeAttr(c.name)}"></div>
          <div><label>Banco / bandeira</label><input type="text" id="ecm2-bank" value="${escapeAttr(c.bank||'')}"></div>
        </div>
        <div class="entry-form">
          <div class="narrow"><label>Fecha dia</label><input type="number" id="ecm2-closing" value="${c.closingDay||''}"></div>
          <div class="narrow"><label>Vence dia</label><input type="number" id="ecm2-due" value="${c.dueDay||''}"></div>
          <div><label>Limite de crédito</label><input type="number" step="0.01" id="ecm2-limit" value="${c.limit||''}" placeholder="Opcional"></div>
          <div class="narrow"><label>Cor</label><input type="color" id="ecm2-color" value="${c.color||'#0E7A5F'}" style="padding:3px;height:38px;cursor:pointer;"></div>
        </div>
        <div class="modal-close-row">
          <button class="btn secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn" onclick="saveCardEdit('${c.id}')" style="margin-left:8px;">Salvar</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
}
function saveCardEdit(id){
  const c = state.cards.find(x=>x.id===id);
  if(!c) return;
  const before = { name:c.name, bank:c.bank, closingDay:c.closingDay, dueDay:c.dueDay, limit:c.limit };
  c.name = document.getElementById('ecm2-name').value.trim() || c.name;
  c.bank = document.getElementById('ecm2-bank').value.trim();
  c.closingDay = parseInt(document.getElementById('ecm2-closing').value)||null;
  c.dueDay = parseInt(document.getElementById('ecm2-due').value)||null;
  c.limit = num(document.getElementById('ecm2-limit').value)||null;
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
      <td data-label="Cartão"><span class="tag-card" style="background:${c.color||'#999'}"></span>${c.name}</td>
      <td class="small" data-label="Banco">${c.bank||'—'}</td>
      <td class="small" data-label="Fecha">${c.closingDay?('dia '+c.closingDay):'—'}</td>
      <td class="small" data-label="Vence">${c.dueDay?('dia '+c.dueDay):'—'}</td>
      <td class="num" data-label="Limite">${c.limit?fmt.format(c.limit):'—'}</td>
      <td class="row-actions"><button onclick="openCardEditModal('${c.id}')" title="Editar">${ICON.edit}</button><button class="del" onclick="removeCard('${c.id}')" title="Excluir">${ICON.trash}</button></td>
    </tr>`;
  }).join('');
}
