// Registra o plugin de rótulos de valor uma vez só — cada gráfico liga/desliga
// os labels no próprio dataset (ver dashboard.js), então não precisa de default global.
Chart.register(ChartDataLabels);

/* ================= Navegação de abas ================= */
// Cobre tanto os botões da sidebar (desktop) quanto a barra inferior (mobile) —
// os dois conjuntos de botões ficam sincronizados, já que ambos existem no DOM
// o tempo todo (só a visibilidade muda por CSS conforme o tamanho da tela).
// Guarda a última aba visitada por conta, pra um F5 não jogar o usuário de
// volta pra "Visão geral" no meio do que ele estava fazendo.
function lastViewKey(){
  return currentSession ? 'financeiro_lastView_' + currentSession.user.id : 'financeiro_lastView';
}
function switchView(view){
  // Trava enquanto o estado ainda não chegou da nuvem — sem isso um clique de menu
  // durante o login derrubava o app inteiro com TypeError.
  if(!state) return;
  const alvo = document.getElementById('view-'+view);
  if(!alvo) return;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  const moreBtn = document.getElementById('mobile-more-btn');
  if(moreBtn) moreBtn.classList.toggle('active', MOBILE_OVERFLOW_ITEMS.some(it=>it.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  alvo.classList.add('active');
  localStorage.setItem(lastViewKey(), view);
  renderAll();
}
document.querySelectorAll('[data-view]').forEach(btn=>{
  btn.addEventListener('click', ()=> switchView(btn.dataset.view));
});

// A barra inferior tem 4 abas + o "+" no meio, com 2 de cada lado — é o que mantém
// o botão de lançar exatamente centralizado (com 3 de um lado ele ficava torto).
// Quem não coube vai pro modal "Mais", reaproveitando .modal-overlay/.modal-box.
// No desktop isso não muda nada: a sidebar sempre mostrou todos os itens.
const MOBILE_OVERFLOW_ITEMS = [
  { view:'cartoes', label:'Cartões', icon: ICON.card },
  { view:'auditoria', label:'Auditoria', icon: ICON.audit },
  { view:'backup', label:'Configurações', icon: ICON.settings },
];
function showMoreMenu(){
  const html = `
    <div class="modal-overlay">
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="more-title">
        <div class="modal-head">
          <h3 id="more-title">Mais opções</h3>
          <button class="modal-x" onclick="closeModal()" aria-label="Fechar">${ICON.close}</button>
        </div>
        <div class="more-menu-list">
          ${MOBILE_OVERFLOW_ITEMS.map(it=>`<button class="more-menu-item" onclick="closeModal(); switchView('${esc(it.view)}');">${it.icon}<span>${esc(it.label)}</span></button>`).join('')}
        </div>
        <div class="modal-close-row"><button class="btn secondary" onclick="closeModal()">Fechar</button></div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
  focusModal();
}

/* ================= Lançamento rápido (celular) =================
   O botão central da barra abre uma folha com o valor em primeiro — o teclado
   numérico já sobe no campo certo. Método vira chip tocável em vez de <select>,
   e o lançamento cai sempre no mês que está aberto no "Mensal". */
let quickKind = 'variable';
function openQuickEntry(){
  if(!state) return;
  quickKind = 'variable';
  const html = `
    <div class="modal-overlay is-sheet">
      <div class="modal-box sheet-box" role="dialog" aria-modal="true" aria-labelledby="qe-title">
        <div class="sheet-grab"></div>
        <div class="modal-head">
          <h3 id="qe-title">Novo lançamento</h3>
          <button class="modal-x" onclick="closeModal()" aria-label="Fechar">${ICON.close}</button>
        </div>
        <div class="mode-toggle qe-toggle" id="qe-toggle">
          <button type="button" data-kind="income" onclick="setQuickKind('income')">Receita</button>
          <button type="button" class="active" data-kind="variable" onclick="setQuickKind('variable')">Despesa</button>
        </div>
        <div class="qe-amount">
          <span class="qe-cur">R$</span>
          <input type="number" step="0.01" min="0.01" id="qe-amount" inputmode="decimal" placeholder="0,00" aria-label="Valor">
        </div>
        <div class="entry-form" style="margin-top:4px;">
          <div><label for="qe-desc">Descrição</label><input type="text" id="qe-desc" placeholder="Ex: Mercado"></div>
        </div>
        <div id="qe-method-wrap">
          <label style="margin-top:12px;">Forma de pagamento</label>
          <div class="qe-chips" id="qe-chips"></div>
        </div>
        <p class="small" id="qe-month" style="margin-top:12px;"></p>
        <div class="modal-close-row">
          <button class="btn" style="width:100%;padding:12px;" onclick="saveQuickEntry()">Salvar lançamento</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
  renderQuickChips();
  document.getElementById('qe-month').textContent = 'Vai para ' + monthLabel(currentMonth) + '.';
  bindEnterToAdd(['qe-desc','qe-amount'], ()=>saveQuickEntry());
  document.getElementById('qe-amount').focus();
}
function setQuickKind(kind){
  quickKind = kind;
  document.querySelectorAll('#qe-toggle button').forEach(b=>b.classList.toggle('active', b.dataset.kind===kind));
  document.getElementById('qe-method-wrap').style.display = kind==='income' ? 'none' : '';
}
let quickMethod = 'Pix', quickCardId = null;
function renderQuickChips(){
  const chips = [];
  state.cards.forEach(c=>chips.push({label:c.name, method:'Cartão de Crédito', cardId:c.id, cor:c.color}));
  ['Pix','Boleto','Débito automático','Dinheiro','Transferência'].forEach(m=>chips.push({label:m, method:m, cardId:null}));
  if(!chips.some(c=>c.method===quickMethod && c.cardId===quickCardId)){
    quickMethod = chips[0].method; quickCardId = chips[0].cardId;
  }
  document.getElementById('qe-chips').innerHTML = chips.map((c,i)=>{
    const on = c.method===quickMethod && c.cardId===quickCardId;
    const ponto = c.cardId ? `<span class="tag-card" style="background:${escapeAttr(c.cor||'#999')}"></span>` : '';
    return `<button type="button" class="qe-chip ${on?'on':''}" onclick="pickQuickMethod(${i})">${ponto}${esc(c.label)}</button>`;
  }).join('');
  window.__quickChips = chips;
}
function pickQuickMethod(i){
  const c = window.__quickChips[i];
  quickMethod = c.method; quickCardId = c.cardId;
  renderQuickChips();
}
function saveQuickEntry(){
  const desc = document.getElementById('qe-desc').value.trim();
  const amountRaw = document.getElementById('qe-amount').value;
  if(!validAmount(amountRaw)) return fieldError('qe-amount','O valor precisa ser maior que zero.');
  if(!desc) return fieldError('qe-desc','Escreva uma descrição.');
  const amount = num(amountRaw);
  const mm = ensureMonth(currentMonth);
  if(quickKind==='income'){
    mm.income.push({id:uid(), desc, amount, status:'Pendente'});
    logAudit('Lançamento', `Receita "${desc}" de ${fmt.format(amount)} lançada em ${monthLabel(currentMonth)}, status Pendente.`);
  } else {
    mm.variable.push({id:uid(), desc, amount, method:quickMethod, cardId:quickCardId||undefined, status:'Pendente'});
    const info = quickCardId ? ` via Cartão de Crédito (${cardName(quickCardId)})` : ` via ${quickMethod}`;
    logAudit('Lançamento', `Despesa variável "${desc}" de ${fmt.format(amount)} lançada em ${monthLabel(currentMonth)}${info}, status Pendente.`);
  }
  closeModal();
  save(); renderAll();
  showToast(`${quickKind==='income'?'Receita':'Despesa'} de ${fmt.format(amount)} lançada.`);
}

/* ================= Modais: teclado e foco =================
   Regra pedida pelo usuário: clicar fora NÃO fecha (evita perder o que foi
   digitado por um clique torto) — só Esc ou o X. */
function focusModal(){
  const box = document.querySelector('.modal-box');
  if(!box) return;
  const alvo = box.querySelector('input:not([type=hidden]), select, textarea, button');
  if(alvo) alvo.focus();
}
document.addEventListener('keydown', (ev)=>{
  const box = document.querySelector('.modal-box[role="dialog"]');
  if(!box) return;
  if(ev.key === 'Escape'){ ev.preventDefault(); closeModal(); return; }
  if(ev.key !== 'Tab') return;
  // Prende o Tab dentro do modal.
  const focaveis = [...box.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])')]
    .filter(el=>el.offsetParent !== null);
  if(!focaveis.length) return;
  const primeiro = focaveis[0], ultimo = focaveis[focaveis.length-1];
  if(ev.shiftKey && document.activeElement === primeiro){ ev.preventDefault(); ultimo.focus(); }
  else if(!ev.shiftKey && document.activeElement === ultimo){ ev.preventDefault(); primeiro.focus(); }
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
  const lastView = localStorage.getItem(lastViewKey());
  if(lastView && lastView!=='dashboard' && document.getElementById('view-'+lastView)){
    switchView(lastView); // já chama renderAll()
  } else {
    renderAll();
  }
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
