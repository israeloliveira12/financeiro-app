/* ================= Supabase (sincronização entre aparelhos) ================= */
const SUPABASE_URL = 'https://requjwthyczhwrelmpmx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcXVqd3RoeWN6aHdyZWxtcG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNTA1NjUsImV4cCI6MjA5ODgyNjU2NX0._Z9xhE23kMgrPWMzj5C6ET5okuHciEpv0MLa5AUPO68';
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentSession = null;
let syncTimer = null;

let syncPending = false;   // há alteração local ainda não confirmada na nuvem
let syncRetryTimer = null;

// O status aparece em dois lugares: no rodapé da barra lateral (computador) e
// num chip no topo — o chip existe também no celular, onde o rodapé some por CSS.
function setSyncStatus(text, kind){
  document.querySelectorAll('[data-sync-text]').forEach(el=>{ el.textContent = text; });
  document.querySelectorAll('[data-sync-chip]').forEach(el=>{
    el.classList.remove('is-ok','is-error','is-busy');
    el.classList.add(kind==='error' ? 'is-error' : (kind==='busy' ? 'is-busy' : 'is-ok'));
    el.title = text;
  });
  const foot = document.getElementById('sync-status');
  if(foot) foot.style.color = kind==='error' ? 'var(--bad)' : '#9FB0A8';
}
async function pushToCloud(){
  if(!currentSession || !state) return;
  syncPending = true;
  setSyncStatus('Enviando…','busy');
  try{
    const { error } = await supa.from('financeiro_state').upsert({
      user_id: currentSession.user.id,
      data: state,
      // updated_at do servidor, não do aparelho: um celular com o relógio atrasado
      // fazia a cópia dele parecer mais antiga e perder na resolução de conflito.
      updated_at: new Date().toISOString()
    });
    if(error) throw error;
    syncPending = false;
    clearTimeout(syncRetryTimer);
    setSyncStatus('Sincronizado às ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),'ok');
  }catch(e){
    setSyncStatus('Sem conexão — salvo neste aparelho','error');
    // Tenta de novo sozinho. Antes, uma falha só era reparada no próximo save —
    // dava pra passar horas com dado só no aparelho achando que tinha subido.
    clearTimeout(syncRetryTimer);
    syncRetryTimer = setTimeout(pushToCloud, 30000);
  }
}
function scheduleCloudSync(){
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushToCloud, 1500);
}
// Assim que a rede volta, empurra o que ficou pendente sem esperar novo clique.
window.addEventListener('online', ()=>{ if(syncPending) pushToCloud(); });
window.addEventListener('offline', ()=> setSyncStatus('Sem conexão — salvo neste aparelho','error'));
// Clicar no chip força o envio na hora.
function forceSync(){
  if(!currentSession) return;
  clearTimeout(syncTimer);
  pushToCloud();
}

function showAuthGate(){
  const html = `
    <div class="modal-overlay" id="auth-gate">
      <div class="modal-box" style="max-width:360px;">
        <h3>Meu Financeiro</h3>
        <p class="modal-sub">Entre para acessar seus dados de qualquer aparelho.</p>
        <button class="btn secondary" id="auth-google-btn" onclick="handleGoogleSignIn()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;">${GOOGLE_ICON} Entrar com Google</button>
        <div class="auth-divider">ou por e-mail</div>
        <div class="entry-form" style="margin-top:0;flex-direction:column;align-items:stretch;">
          <div><label>E-mail</label><input type="email" id="auth-email" placeholder="voce@email.com" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="email"></div>
          <div><label>Senha</label>
            <div class="pw-wrap">
              <input type="password" id="auth-password" placeholder="mínimo 6 caracteres" autocapitalize="none" autocorrect="off" autocomplete="current-password">
              <button type="button" class="pw-toggle" onclick="togglePasswordVisibility('auth-password',this)">${ICON.eye}</button>
            </div>
          </div>
        </div>
        <p id="auth-error" class="small" style="display:none;margin-top:8px;"></p>
        <div class="modal-close-row" style="justify-content:space-between;">
          <button class="btn secondary" id="auth-signup-btn" onclick="handleSignUp()">Criar conta</button>
          <button class="btn" id="auth-signin-btn" onclick="handleSignIn()">Entrar</button>
        </div>
        <p class="small" style="text-align:center;margin-top:14px;"><a href="#" onclick="handleForgotPassword();return false;" style="color:var(--ink-soft);">Esqueci minha senha</a></p>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
}
function togglePasswordVisibility(inputId, btn){
  const input = document.getElementById(inputId);
  const isPw = input.type === 'password';
  input.type = isPw ? 'text' : 'password';
  btn.innerHTML = isPw ? ICON.eyeOff : ICON.eye;
}
function authMessage(text, isError){
  const el = document.getElementById('auth-error');
  el.textContent = text;
  el.style.color = isError ? 'var(--bad)' : 'var(--brand)';
  el.style.display = 'block';
}
function validAuthInput(email, password){
  if(!email || !password){ authMessage('Preencha e-mail e senha para continuar.', true); return false; }
  if(password.length < 6){ authMessage('A senha precisa ter no mínimo 6 caracteres.', true); return false; }
  return true;
}
async function withAuthButtonsDisabled(fn){
  const ids = ['auth-signin-btn','auth-signup-btn','auth-google-btn'];
  const btns = ids.map(id=>document.getElementById(id)).filter(Boolean);
  if(btns.some(b=>b.disabled)) return; // já tem uma chamada em andamento, ignora clique duplicado
  btns.forEach(b=>b.disabled = true);
  try{ await fn(); } finally { btns.forEach(b=>{ if(document.body.contains(b)) b.disabled = false; }); }
}
async function handleSignIn(){
  await withAuthButtonsDisabled(async () => {
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const password = document.getElementById('auth-password').value;
    if(!validAuthInput(email,password)) return;
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if(error){ authMessage('Não consegui entrar: ' + error.message, true); return; }
    await handleAuthEvent(data.session);
  });
}
async function handleSignUp(){
  await withAuthButtonsDisabled(async () => {
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const password = document.getElementById('auth-password').value;
    if(!validAuthInput(email,password)) return;
    const { data, error } = await supa.auth.signUp({ email, password });
    if(error){ authMessage('Não consegui criar a conta: ' + error.message, true); return; }
    if(!data.session){ authMessage('Conta criada! Confirme seu e-mail (verifique a caixa de entrada) e depois clique em "Entrar".', false); return; }
    await handleAuthEvent(data.session);
  });
}
async function handleGoogleSignIn(){
  await withAuthButtonsDisabled(async () => {
    const { error } = await supa.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if(error) authMessage('Não consegui abrir o login do Google: ' + error.message, true);
  });
}
async function handleForgotPassword(){
  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  if(!email){ authMessage('Digite seu e-mail acima e depois clique em "Esqueci minha senha".', true); return; }
  const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if(error){ authMessage('Não consegui enviar o e-mail: ' + error.message, true); return; }
  authMessage('Enviamos um e-mail com um link para redefinir sua senha.', false);
}
function showResetPasswordModal(){
  document.querySelector('.app').style.display = 'none';
  const html = `
    <div class="modal-overlay">
      <div class="modal-box" style="max-width:360px;">
        <h3>Definir nova senha</h3>
        <p class="modal-sub">Escolha uma nova senha para a sua conta.</p>
        <div class="pw-wrap">
          <input type="password" id="reset-password" placeholder="nova senha (mín. 6 caracteres)" autocapitalize="none" autocorrect="off">
          <button type="button" class="pw-toggle" onclick="togglePasswordVisibility('reset-password',this)">${ICON.eye}</button>
        </div>
        <p id="reset-error" class="small" style="display:none;margin-top:8px;color:var(--bad);"></p>
        <div class="modal-close-row"><button class="btn" id="reset-submit-btn" onclick="submitNewPassword()">Salvar nova senha</button></div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
}
async function submitNewPassword(){
  const btn = document.getElementById('reset-submit-btn');
  const errEl = document.getElementById('reset-error');
  const password = document.getElementById('reset-password').value;
  if(password.length < 6){ errEl.textContent = 'A senha precisa ter no mínimo 6 caracteres.'; errEl.style.display = 'block'; return; }
  btn.disabled = true;
  try{
    const { error } = await supa.auth.updateUser({ password });
    if(error){ errEl.textContent = 'Não consegui salvar: ' + error.message; errEl.style.display = 'block'; return; }
    const { data:{ session } } = await supa.auth.getSession();
    await handleAuthEvent(session);
  } finally { if(document.body.contains(btn)) btn.disabled = false; }
}
async function handleSignOut(){
  await supa.auth.signOut();
  location.reload();
}
function userDisplayName(){
  if(!currentSession) return '';
  const meta = currentSession.user.user_metadata || {};
  return meta.full_name || meta.name || currentSession.user.email;
}
function renderUserChip(){
  if(!currentSession) return;
  const meta = currentSession.user.user_metadata || {};
  const name = userDisplayName();
  const avatar = meta.avatar_url || meta.picture;
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-email').textContent = currentSession.user.email;
  const img = document.getElementById('user-avatar');
  const fallback = document.getElementById('user-avatar-fallback');
  if(avatar){
    img.src = avatar; img.style.display = 'block'; fallback.style.display = 'none';
  } else {
    img.style.display = 'none'; fallback.style.display = 'flex';
    fallback.textContent = (name||'?').trim().charAt(0).toUpperCase();
  }
}
let authHandled = false;
async function handleAuthEvent(session){
  if(!session){
    if(!authHandled){ authHandled = true; showAuthGate(); }
    return;
  }
  if(authHandled && currentSession && currentSession.user.id === session.user.id) return; // já tratado, evita corrida
  authHandled = true;
  await onAuthenticated(session);
}
async function onAuthenticated(session){
  currentSession = session;
  document.getElementById('modal-root').innerHTML = '';
  renderUserChip();
  // A tela do app SÓ aparece depois que o estado existe. Antes ela era exibida
  // enquanto o fetch da nuvem ainda estava no ar, e clicar num menu nessa janela
  // dava "Cannot read properties of null (reading 'months')".
  showLoading();

  const localState = loadLocalState();
  let cloudState = null;
  try{
    const { data, error } = await supa.from('financeiro_state').select('data, updated_at').eq('user_id', session.user.id).maybeSingle();
    if(!error && data) cloudState = data.data;
  }catch(e){ /* offline: segue só com a cópia local */ }

  const localTs = localState && localState.meta ? num(localState.meta.lastModified) : 0;
  const cloudTs = cloudState && cloudState.meta ? num(cloudState.meta.lastModified) : 0;

  if(cloudState && cloudTs >= localTs) state = Object.assign(defaultState(), cloudState);
  else if(localState) state = localState;
  else state = defaultState();

  localStorage.setItem(localKey(), JSON.stringify(state));

  hideLoading();
  document.querySelector('.app').style.display = '';
  bootUI();

  if(localTs > cloudTs) scheduleCloudSync(); // garante que a nuvem fique com a versão mais nova
  else setSyncStatus('Sincronizado','ok');
}
function showLoading(){
  document.getElementById('modal-root').innerHTML =
    `<div class="modal-overlay is-loading"><div class="boot-card"><span class="spinner" aria-hidden="true"></span><span>Carregando seus dados…</span></div></div>`;
}
function hideLoading(){ document.getElementById('modal-root').innerHTML = ''; }
