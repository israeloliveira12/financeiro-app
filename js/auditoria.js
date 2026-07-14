/* ================= Auditoria ================= */
const AUDIT_BADGE_CLASS = {
  'Lançamento':'lancado',
  'Registro':'pago',
  'Edição':'pendente',
  'Status':'parcial',
  'Exclusão':'excluido',
  'Importação':'pago',
  'Exportação':'lancado',
};
let auditLogLimit = 15; // padrão: só os 15 mais recentes, pra não carregar tudo de uma vez
let auditDateFilter = null; // 'YYYY-MM-DD' ou null — quando setado, ignora o limite e mostra o dia inteiro
function setAuditLimit(val){
  auditLogLimit = val==='all' ? 'all' : parseInt(val);
  renderAuditoria();
}
function setAuditDateFilter(val){
  auditDateFilter = val || null;
  renderAuditoria();
}
function clearAuditDateFilter(){
  auditDateFilter = null;
  const input = document.getElementById('audit-date-filter');
  if(input) input.value = '';
  renderAuditoria();
}
function dateKeyLocal(ts){
  const d = new Date(ts);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function renderAuditoria(){
  const tbody = document.getElementById('tbl-auditoria');
  if(!tbody) return;
  const log = state.auditLog || [];
  const selectEl = document.getElementById('audit-limit-select');
  if(selectEl){ selectEl.value = auditLogLimit; selectEl.disabled = !!auditDateFilter; }
  const clearBtn = document.getElementById('audit-clear-date-btn');
  if(clearBtn) clearBtn.style.display = auditDateFilter ? 'inline-flex' : 'none';

  const filtered = auditDateFilter ? log.filter(a=>dateKeyLocal(a.ts)===auditDateFilter) : log;
  const shown = (!auditDateFilter && auditLogLimit!=='all') ? filtered.slice(0, auditLogLimit) : filtered;

  const countInfo = document.getElementById('audit-count-info');
  if(countInfo){
    countInfo.textContent = auditDateFilter
      ? `${filtered.length} registro(s) em ${new Date(auditDateFilter+'T00:00:00').toLocaleDateString('pt-BR')}.`
      : (log.length ? `Mostrando ${shown.length} de ${log.length} registro(s).` : '');
  }
  if(!shown.length){ tbody.innerHTML = `<tr><td colspan="3" class="empty">${auditDateFilter ? 'Nenhuma ação registrada nessa data.' : 'Nenhuma ação registrada ainda.'}</td></tr>`; return; }
  tbody.innerHTML = shown.map(a=>`<tr>
    <td class="small" data-label="Quando" style="font-family:var(--mono);white-space:nowrap;">${fmtDateTime(a.ts)}</td>
    <td data-label="Ação"><span class="badge ${AUDIT_BADGE_CLASS[a.action]||'pendente'}" style="cursor:default;">${a.action}</span></td>
    <td data-label="Descrição">${a.description}</td>
  </tr>`).join('');
}
