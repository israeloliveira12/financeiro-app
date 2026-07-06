/* ================= Navegação de abas ================= */
// Cobre tanto os botões da sidebar (desktop) quanto a barra inferior (mobile) —
// os dois conjuntos de botões ficam sincronizados, já que ambos existem no DOM
// o tempo todo (só a visibilidade muda por CSS conforme o tamanho da tela).
document.querySelectorAll('[data-view]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const view = btn.dataset.view;
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+view).classList.add('active');
    renderAll();
  });
});

/* ================= Inicialização ================= */
function populateStaticSelects(){
  ['fix-method','var-method','cm-method'].forEach(id=>{
    document.getElementById(id).innerHTML = methodOptionsHTML('Pix');
  });
}
function renderAll(){
  renderDashboard();
  renderMes();
  renderCompromissos();
  renderCartoes();
  renderBackupInfo();
  refreshCardSelects();
  const emailLbl = document.getElementById('auth-email-label');
  if(emailLbl && currentSession) emailLbl.textContent = currentSession.user.email;
  const nameLbl = document.getElementById('auth-name-label');
  if(nameLbl && currentSession) nameLbl.textContent = userDisplayName();
}
function bootUI(){
  populateStaticSelects();
  document.getElementById('cm-start').value = currentMonth;
  document.getElementById('cm-start-monthly').value = currentMonth;
  toggleCommitFields();
  onCommitCategoryChange();
  renderAll();
}

supa.auth.onAuthStateChange((event, session) => {
  if(event === 'SIGNED_OUT'){ location.reload(); return; }
  if(event === 'PASSWORD_RECOVERY'){ showResetPasswordModal(); return; }
  handleAuthEvent(session);
});
(async function boot(){
  const { data:{ session } } = await supa.auth.getSession();
  await handleAuthEvent(session);
})();

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* funciona normal mesmo sem SW */ });
  });
}
