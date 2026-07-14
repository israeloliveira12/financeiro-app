/* ================= Backup ================= */
const BACKUP_FREQ_DAYS = { daily:1, weekly:7, biweekly:15, monthly:30 };
const BACKUP_FREQ_HINT = {
  daily: 'Verificado 1x por dia, no primeiro acesso ao sistema — se já tiver rodado no período, não baixa de novo.',
  weekly: 'Verificado 1x por semana, no primeiro acesso ao sistema — se já tiver rodado no período, não baixa de novo.',
  biweekly: 'Verificado a cada 15 dias, no primeiro acesso ao sistema — se já tiver rodado no período, não baixa de novo.',
  monthly: 'Verificado 1x por mês, no primeiro acesso ao sistema — se já tiver rodado no período, não baixa de novo.',
};
function setBackupAutoEnabled(enabled){
  state.meta.backupAutoEnabled = enabled;
  save();
  renderBackupFreqControls();
}
function setBackupFrequency(freq){
  state.meta.backupFrequency = freq;
  save();
  renderBackupFreqControls();
}
function renderBackupFreqControls(){
  const toggle = document.getElementById('backup-auto-toggle');
  if(!toggle) return;
  toggle.checked = !!state.meta.backupAutoEnabled;
  const freq = BACKUP_FREQ_DAYS[state.meta.backupFrequency] ? state.meta.backupFrequency : 'daily';
  const select = document.getElementById('backup-freq-select');
  if(select) select.value = freq;
  const hint = document.getElementById('backup-freq-hint');
  if(hint) hint.textContent = BACKUP_FREQ_HINT[freq];
}
function checkAutoBackup(){
  if(!state.meta.backupAutoEnabled) return;
  const days = BACKUP_FREQ_DAYS[state.meta.backupFrequency] || 1;
  const last = state.meta.lastExported;
  const daysSince = last ? (Date.now()-last)/86400000 : Infinity;
  if(daysSince >= days) exportBackup();
}
function saveSaldoInicial(){
  const oldVal = state.meta.startingBalance || 0;
  state.meta.startingBalance = num(document.getElementById('saldo-inicial').value);
  logAudit('Edição', `Saldo inicial alterado de ${fmt.format(oldVal)} para ${fmt.format(state.meta.startingBalance)}.`);
  save(); renderAll();
}
function fmtDateTime(ts){
  if(!ts) return 'nunca';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function generateSQLBackup(){
  const userId = currentSession ? currentSession.user.id : '00000000-0000-0000-0000-000000000000';
  const json = JSON.stringify(state).replace(/'/g, "''");
  const updatedAt = new Date(state.meta.lastModified || Date.now()).toISOString();
  return `-- Backup do Meu Financeiro — gerado em ${fmtDateTime(Date.now())}
-- Cole este script no SQL Editor do Supabase (o usuário já precisa existir em auth.users)
-- pra restaurar os dados desta conta na tabela financeiro_state — ver supabase/schema.sql.

insert into financeiro_state (user_id, data, updated_at)
values (
  '${userId}',
  '${json}'::jsonb,
  '${updatedAt}'
)
on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at;
`;
}
function exportBackup(){
  const stamp = new Date().toISOString().slice(0,16).replace(/[-:T]/g,'').replace(/(\d{8})(\d{4})/,'$1-$2');
  downloadBlob(new Blob([JSON.stringify(state,null,2)], {type:'application/json'}), `backup-financeiro-${stamp}.json`);
  downloadBlob(new Blob([generateSQLBackup()], {type:'application/sql'}), `backup-financeiro-${stamp}.sql`);
  state.meta.lastExported = Date.now();
  save();
  renderBackupInfo();
}
function validateBackupShape(parsed){
  if(!parsed || typeof parsed !== 'object') return 'O arquivo não é um backup válido.';
  if(parsed.months !== undefined && (typeof parsed.months !== 'object' || Array.isArray(parsed.months))) return 'A seção de meses do arquivo está com formato inesperado.';
  if(parsed.commitments !== undefined && !Array.isArray(parsed.commitments)) return 'A seção de compromissos do arquivo está com formato inesperado.';
  if(parsed.cards !== undefined && !Array.isArray(parsed.cards)) return 'A seção de cartões do arquivo está com formato inesperado.';
  if(parsed.months){
    for(const key in parsed.months){
      const mm = parsed.months[key];
      if(!mm || !Array.isArray(mm.income) || !Array.isArray(mm.fixed) || !Array.isArray(mm.variable)){
        return `O mês "${key}" dentro do arquivo está com formato inesperado.`;
      }
    }
  }
  return null;
}
function importBackup(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    let parsed;
    try{
      parsed = JSON.parse(reader.result);
    }catch(e){
      alert('Não consegui ler esse arquivo. Confira se é um backup exportado por este mesmo sistema.');
      ev.target.value=''; return;
    }
    const problem = validateBackupShape(parsed);
    if(problem){
      alert(`Esse arquivo não parece ser um backup válido deste sistema. Detalhe: ${problem}\n\nNada foi alterado nos seus dados atuais.`);
      ev.target.value=''; return;
    }
    const currentTs = state.meta && state.meta.lastModified;
    const importTs = parsed.meta && parsed.meta.lastModified;
    if(currentTs && (!importTs || importTs < currentTs)){
      const msg = `Atenção: os dados que já estão aqui foram alterados por último em ${fmtDateTime(currentTs)}, e esse backup é de ${fmtDateTime(importTs)} — ou seja, mais antigo. Importar mesmo assim vai APAGAR os dados mais recentes que estão aqui. Tem certeza que quer continuar?`;
      if(!confirm(msg)) { ev.target.value=''; return; }
    }
    const backup = JSON.parse(JSON.stringify(state)); // cópia de segurança em memória
    try{
      state = Object.assign(defaultState(), parsed);
      logAudit('Importação', `Backup importado (arquivo "${file.name}").`);
      save(); renderAll();
      alert('Backup importado com sucesso.');
    }catch(e){
      state = backup;
      save(); renderAll();
      alert('Algo deu errado ao aplicar esse backup, e por segurança nada foi alterado. Confira se o arquivo é realmente um backup deste sistema.');
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}
function resetAll(){
  if(!confirm('Isso vai apagar TODOS os dados salvos — neste navegador e na nuvem. Sua conta de login continua existindo. Tem certeza?')) return;
  state = defaultState();
  logAudit('Exclusão', 'Todos os dados foram apagados (Zona de risco).');
  save(); renderAll();
}
async function handleDeleteAccount(){
  if(!currentSession) return;
  if(!confirm('Isso vai excluir sua conta de login e TODOS os dados financeiros associados a ela, de forma PERMANENTE e IRREVERSÍVEL — inclusive na nuvem. Tem certeza que quer continuar?')) return;
  const btn = document.getElementById('delete-account-btn');
  btn.disabled = true;
  try{
    const res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + currentSession.access_token }
    });
    const body = await res.json().catch(()=>({}));
    if(!res.ok){ alert('Não consegui excluir sua conta: ' + (body.error || 'erro desconhecido')); return; }
    localStorage.removeItem(localKey());
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(OLD_STORAGE_KEY);
    await supa.auth.signOut();
    location.reload();
  }catch(e){
    alert('Não consegui excluir sua conta (verifique sua conexão) e tente novamente.');
  } finally {
    if(document.body.contains(btn)) btn.disabled = false;
  }
}
function renderBackupInfo(){
  renderBackupFreqControls();
  document.getElementById('saldo-inicial').value = state.meta.startingBalance || 0;
  document.getElementById('info-months').textContent = Object.keys(state.months).length;
  document.getElementById('info-commits').textContent = state.commitments.length;
  document.getElementById('info-cards').textContent = state.cards.length;
  const lm = document.getElementById('info-lastmod');
  if(lm) lm.textContent = fmtDateTime(state.meta.lastModified);

  const le = document.getElementById('info-lastexport');
  const warn = document.getElementById('backup-warning');
  if(le){
    const lastExported = state.meta.lastExported;
    le.textContent = fmtDateTime(lastExported);
    const daysSince = lastExported ? (Date.now()-lastExported)/86400000 : Infinity;
    if(warn){
      if(daysSince > 7){
        warn.style.display = 'block';
        warn.textContent = lastExported
          ? `Já fazem mais de ${Math.floor(daysSince)} dias desde o último backup exportado. Vale exportar um novo agora.`
          : 'Você ainda não exportou nenhum backup. Vale fazer isso agora, especialmente se usa em mais de um aparelho.';
      } else {
        warn.style.display = 'none';
      }
    }
  }
}
