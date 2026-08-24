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
const AUDIT_TIPOS = ['Lançamento','Status','Edição','Registro','Exclusão'];

let auditLogLimit = 15;      // padrão: só os mais recentes, pra não montar milhares de <tr>
let auditDateFilter = null;  // 'YYYY-MM-DD' — quando setado, mostra o dia inteiro
let auditTipoFilter = null;  // um dos AUDIT_TIPOS
let auditBusca = '';

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
function setAuditTipo(tipo){
  auditTipoFilter = (auditTipoFilter===tipo) ? null : tipo;
  renderAuditoria();
}
function setAuditBusca(v){
  auditBusca = String(v||'').trim().toLowerCase();
  renderAuditoria();
}
function dateKeyLocal(ts){
  const d = new Date(ts);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function horaLocal(ts){
  return new Date(ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
// "Hoje" / "Ontem" / "23 de agosto de 2026" — cabeçalho de cada grupo de dia.
function rotuloDoDia(dateKey){
  const hoje = dateKeyLocal(Date.now());
  const ontem = dateKeyLocal(Date.now() - 86400000);
  if(dateKey===hoje) return 'Hoje';
  if(dateKey===ontem) return 'Ontem';
  const [y,m,d] = dateKey.split('-').map(Number);
  return `${String(d).padStart(2,'0')} de ${MONTH_NAMES[m-1].toLowerCase()} de ${y}`;
}
// A descrição já vem no formato "Campo: antes → depois" (auditDiff, em state.js).
// Aqui isso vira duas colunas visuais em vez de uma frase corrida.
function formatarDescricao(texto){
  const bruto = String(texto||'');
  const corte = bruto.indexOf(' — ');
  if(corte === -1) return `<span>${esc(bruto)}</span>`;
  const titulo = bruto.slice(0, corte);
  const mudancas = bruto.slice(corte+3).replace(/\.$/,'').split('; ');
  const linhas = mudancas.map(m=>{
    const p = m.split(': ');
    if(p.length < 2) return `<div class="diff-row">${esc(m)}</div>`;
    const campo = p[0];
    const valores = p.slice(1).join(': ').split(' → ');
    if(valores.length < 2) return `<div class="diff-row">${esc(m)}</div>`;
    return `<div class="diff-row"><span class="diff-campo">${esc(campo)}</span>
      <span class="diff-was">${esc(valores[0])}</span>
      <span class="diff-arrow">→</span>
      <span class="diff-now">${esc(valores[1])}</span></div>`;
  }).join('');
  return `<span>${esc(titulo)}</span><div class="diff">${linhas}</div>`;
}

function renderAuditoria(){
  const tbody = document.getElementById('tbl-auditoria');
  if(!tbody) return;
  const log = state.auditLog || [];

  const selectEl = document.getElementById('audit-limit-select');
  if(selectEl){ selectEl.value = auditLogLimit; selectEl.disabled = !!auditDateFilter; }
  const clearBtn = document.getElementById('audit-clear-date-btn');
  if(clearBtn) clearBtn.style.display = auditDateFilter ? 'inline-flex' : 'none';
  document.querySelectorAll('#audit-tipos [data-tipo]').forEach(b=>{
    const t = b.dataset.tipo;
    b.classList.toggle('on', t==='' ? !auditTipoFilter : auditTipoFilter===t);
  });

  let filtrado = log;
  if(auditTipoFilter) filtrado = filtrado.filter(a=>a.action===auditTipoFilter);
  if(auditBusca) filtrado = filtrado.filter(a=>String(a.description||'').toLowerCase().includes(auditBusca));
  if(auditDateFilter) filtrado = filtrado.filter(a=>dateKeyLocal(a.ts)===auditDateFilter);

  // O filtro por data específica mostra o dia completo de propósito — quantidade
  // e data não se combinam, senão "15 mais recentes de um dia" confundiria.
  const shown = (!auditDateFilter && auditLogLimit!=='all') ? filtrado.slice(0, auditLogLimit) : filtrado;

  const countInfo = document.getElementById('audit-count-info');
  if(countInfo){
    const temFiltro = auditTipoFilter || auditBusca || auditDateFilter;
    countInfo.textContent = !log.length ? ''
      : temFiltro ? `${shown.length} de ${filtrado.length} encontrado(s) · ${log.length} no total`
      : `Mostrando ${shown.length} de ${log.length} registro(s)`;
  }

  if(!shown.length){
    const msg = (auditTipoFilter || auditBusca || auditDateFilter)
      ? 'Nenhuma ação encontrada com esses filtros.'
      : 'Nenhuma ação registrada ainda.';
    tbody.innerHTML = `<tr><td colspan="3" class="empty">${esc(msg)}</td></tr>`;
    return;
  }

  let html = '', diaAtual = null;
  shown.forEach(a=>{
    const dia = dateKeyLocal(a.ts);
    if(dia !== diaAtual){
      diaAtual = dia;
      html += `<tr class="audit-daygroup"><td colspan="3">${esc(rotuloDoDia(dia))}</td></tr>`;
    }
    html += `<tr>
      <td class="audit-hora" data-label="Hora">${esc(horaLocal(a.ts))}</td>
      <td data-label="Ação"><span class="badge ${esc(AUDIT_BADGE_CLASS[a.action]||'pendente')} is-static">${esc(a.action)}</span></td>
      <td data-label="O que mudou">${formatarDescricao(a.description)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}
