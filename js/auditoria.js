/* ================= Auditoria ================= */
const AUDIT_BADGE_CLASS = {
  'Lançamento':'lancado',
  'Registro':'pago',
  'Edição':'pendente',
  'Status':'parcial',
  'Exclusão':'excluido',
  'Importação':'pago',
};
function renderAuditoria(){
  const tbody = document.getElementById('tbl-auditoria');
  if(!tbody) return;
  const log = state.auditLog || [];
  if(!log.length){ tbody.innerHTML = `<tr><td colspan="3" class="empty">Nenhuma ação registrada ainda.</td></tr>`; return; }
  tbody.innerHTML = log.map(a=>`<tr>
    <td class="small" data-label="Quando" style="font-family:var(--mono);white-space:nowrap;">${fmtDateTime(a.ts)}</td>
    <td data-label="Ação"><span class="badge ${AUDIT_BADGE_CLASS[a.action]||'pendente'}" style="cursor:default;">${a.action}</span></td>
    <td data-label="Descrição">${a.description}</td>
  </tr>`).join('');
}
