/* ================= Auditoria ================= */
const AUDIT_BADGE_CLASS = {
  'Lançamento':'lancado',
  'Registro':'pago',
  'Edição':'pendente',
  'Status':'parcial',
  'Exclusão':'excluido',
  'Importação':'pago',
};
let auditLogLimit = 15; // padrão: só os 15 mais recentes, pra não carregar tudo de uma vez
function setAuditLimit(val){
  auditLogLimit = val==='all' ? 'all' : parseInt(val);
  renderAuditoria();
}
function renderAuditoria(){
  const tbody = document.getElementById('tbl-auditoria');
  if(!tbody) return;
  const log = state.auditLog || [];
  const selectEl = document.getElementById('audit-limit-select');
  if(selectEl) selectEl.value = auditLogLimit;
  const countInfo = document.getElementById('audit-count-info');
  const shown = auditLogLimit==='all' ? log : log.slice(0, auditLogLimit);
  if(countInfo) countInfo.textContent = log.length ? `Mostrando ${shown.length} de ${log.length} registro(s).` : '';
  if(!shown.length){ tbody.innerHTML = `<tr><td colspan="3" class="empty">Nenhuma ação registrada ainda.</td></tr>`; return; }
  tbody.innerHTML = shown.map(a=>`<tr>
    <td class="small" data-label="Quando" style="font-family:var(--mono);white-space:nowrap;">${fmtDateTime(a.ts)}</td>
    <td data-label="Ação"><span class="badge ${AUDIT_BADGE_CLASS[a.action]||'pendente'}" style="cursor:default;">${a.action}</span></td>
    <td data-label="Descrição">${a.description}</td>
  </tr>`).join('');
}
