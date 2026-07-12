/* ================= Navegação de abas ================= */
// Cobre tanto os botões da sidebar (desktop) quanto a barra inferior (mobile) —
// os dois conjuntos de botões ficam sincronizados, já que ambos existem no DOM
// o tempo todo (só a visibilidade muda por CSS conforme o tamanho da tela).
function switchView(view){
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  const moreBtn = document.getElementById('mobile-more-btn');
  if(moreBtn) moreBtn.classList.toggle('active', MOBILE_OVERFLOW_ITEMS.some(it=>it.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  renderAll();
}
document.querySelectorAll('[data-view]').forEach(btn=>{
  btn.addEventListener('click', ()=> switchView(btn.dataset.view));
});

// No celular a barra inferior só cabe 4 abas + "Mais" — os itens que não couberam
// (Auditoria, Configurações) ficam num modal reaproveitando .modal-overlay/.modal-box.
// No desktop isso não muda nada: a sidebar sempre mostrou todos os itens.
const MOBILE_OVERFLOW_ITEMS = [
  { view:'auditoria', label:'Auditoria', icon: ICON.audit },
  { view:'backup', label:'Configurações', icon: ICON.settings },
];
function showMoreMenu(){
  const html = `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <h3>Mais opções</h3>
        <div class="more-menu-list">
          ${MOBILE_OVERFLOW_ITEMS.map(it=>`<button class="more-menu-item" onclick="closeModal(); switchView('${it.view}');">${it.icon}<span>${it.label}</span></button>`).join('')}
        </div>
        <div class="modal-close-row"><button class="btn secondary" onclick="closeModal()">Fechar</button></div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
}

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
  renderAuditoria();
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
  checkAutoBackup();
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
