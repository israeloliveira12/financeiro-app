# Contexto do projeto — Meu Financeiro

Sistema de controle financeiro pessoal do Israel, feito em HTML/CSS/JS puro (sem build, sem framework, sem bundler). Roda no navegador (PC ou celular, publicado no Vercel), com login por e-mail/senha e sincronização na nuvem via Supabase — pensado para uso pessoal (substituiu uma planilha Excel).

Este arquivo existe para dar contexto rápido em qualquer sessão nova do Claude Code/Cowork sobre esse projeto — ele foi construído ao longo de uma conversa longa no claude.ai, e este é o resumo do que foi decidido e por quê.

## Arquivos do projeto

- `index.html` — só o HTML/markup das telas (sidebar, views, modais). CSS e JS foram extraídos pra arquivos próprios (ver abaixo) — decisão explícita do usuário pra facilitar manutenção, sem adicionar build/bundler.
- `style.css` — todo o CSS do app.
- `js/` — o JavaScript, dividido por assunto e carregado via `<script src>` simples (sem módulos ES, sem bundler — tudo continua no mesmo escopo global de sempre, só organizado em arquivos):
  - `icons.js` — `ICON`/`GOOGLE_ICON` (SVGs inline)
  - `utils.js` — formatação de data/moeda, helpers puros sem dependência de estado
  - `state.js` — modelo de dados (`state`, `save`/`load`, `localKey`), helpers de cartão, regras de vigência de compromissos, `ensureMonth`, cálculos (`monthTotals`, `cardLimitUsage` etc.), status
  - `auth.js` — cliente Supabase, login/signup/Google/recuperação de senha, sincronização com a nuvem, chip do usuário
  - `dashboard.js` — tudo da "Visão geral" (cards, gráficos, rosca, faturas, timeline)
  - `mes.js` — tudo do "Mensal" (lançamentos, tabelas, abas de seção)
  - `compromissos.js` — CRUD de compromissos + modal de gerenciar + toast de desfazer (`showUndoToast`)
  - `cartoes.js` — CRUD de cartões
  - `backup.js` — exportar/importar/resetar/excluir conta, backup automático agendado
  - `auditoria.js` — `renderAuditoria()`, tela de histórico de ações (`state.auditLog`)
  - `relatorios.js` — `collectAllData()` + exportação em Excel (`exportExcel`, via SheetJS), CSV (`exportCSV`) e PDF (`exportPDF`, via impressão do navegador)
  - `main.js` — **carrega por último**: wiring de navegação entre abas (`switchView`), menu mobile "Mais" (`showMoreMenu`) e o boot inicial (`populateStaticSelects`, `bootUI`, `boot()`, `supa.auth.onAuthStateChange`). Só funciona por último porque chama funções definidas nos outros arquivos — os demais arquivos podem carregar em qualquer ordem entre si, já que tudo que fazem no top-level é ou definição de função (hoisted) ou `addEventListener`/`onclick` (só executa depois, quando tudo já carregou).
- `manifest.json` — permite instalar como PWA no celular
- `sw.js` — service worker; `FILES_TO_CACHE` precisa ser atualizado se algum arquivo novo em `js/` for criado
- `icon-192.png`, `icon-512.png` — ícones do PWA
- `supabase/schema.sql` — script pra rodar uma vez no SQL Editor do Supabase (cria a tabela `financeiro_state` e as políticas de Row Level Security)
- `api/delete-account.js` — function serverless do Vercel (Node, sem dependências) que exclui a conta de login do usuário via Supabase Admin API, usando a `SUPABASE_SERVICE_ROLE_KEY` (variável de ambiente só no Vercel, nunca no cliente)

## Sincronização entre aparelhos (Supabase)

- **Por quê**: o Israel pediu pra acessar os mesmos dados do PC, celular ou qualquer aparelho com internet, publicando no Vercel. Isso substituiu a decisão antiga de "sem backend" (ver histórico de commits/conversa se precisar do racional completo).
- **Autenticação**: e-mail/senha via Supabase Auth (`supa.auth.signInWithPassword`/`signUp`) ou login com Google (`supa.auth.signInWithOAuth`, puxa nome/foto automaticamente para `session.user.user_metadata`). Sem sessão, `showAuthGate()` bloqueia o `.app` com um modal (reaproveita `.modal-overlay`/`.modal-box`) até logar. Todo evento de auth passa por `handleAuthEvent()` — existe pra evitar disparar `onAuthenticated()` em paralelo (cliques duplicados, corrida entre boot e o retorno do redirect do Google já causaram bug real de login).
- **Recuperação de senha**: "Esqueci minha senha" chama `resetPasswordForEmail`; o evento `PASSWORD_RECOVERY` do Supabase abre `showResetPasswordModal()`. Requer que a *Site URL*/*Redirect URLs* no painel do Supabase apontem pro domínio de produção do Vercel, senão o link do e-mail cai no lugar errado.
- **Perfil do usuário**: chip fixo no topo da sidebar (`#user-chip`) com avatar/nome/e-mail e botão de sair sempre visível — `renderUserChip()`, chamada de dentro de `onAuthenticated()`.
- **Armazenamento**: uma linha por usuário na tabela `financeiro_state` (`user_id`, `data jsonb`, `updated_at`), protegida por RLS (`auth.uid() = user_id`) — só o próprio dono lê/escreve os dados dele.
- **`localStorage` continua existindo** como cache local/offline-first: `save()` grava local na hora (interface não trava) e agenda (`scheduleCloudSync`, debounce de 1.5s) um `upsert` em segundo plano pro Supabase. Se a rede falhar, o app continua funcionando só local e mostra "Sem conexão" no indicador da sidebar (`#sync-status`).
- **A chave do `localStorage` é por conta**: `localKey()` retorna `financeiro_v2_<user.id>`, não uma chave fixa. Isso existe porque um aparelho compartilhado por duas contas diferentes já teve risco real de uma conta ver/sobrescrever o cache local da outra antes da nuvem sincronizar — não reintroduzir uma chave fixa aqui.
- **Resolução de conflito ao logar** (`onAuthenticated`): compara `state.meta.lastModified` da cópia local com o da nuvem e fica com o mais recente — mesmo padrão de timestamp já usado em `importBackup()`, não é uma lógica nova.
- **Excluir conta** (botão "Excluir minha conta" na Zona de risco, aba Configurações): chama `POST /api/delete-account` com o `access_token` da sessão. A function verifica o token, descobre o usuário e apaga com a Admin API do Supabase — o `on delete cascade` da tabela `financeiro_state` cuida de apagar os dados junto. Diferente do botão "Apagar todos os meus dados" (`resetAll()`), que só zera os dados e mantém o login.
- **Chaves do Supabase**: `SUPABASE_URL`/`SUPABASE_ANON_KEY` ficam hardcoded no topo do `<script>` do `index.html` (e duplicadas em `api/delete-account.js`, que roda em outro ambiente). A anon key é pública por design do Supabase (a proteção de verdade é a RLS), então não precisa de variável de ambiente/segredo. Já a `SUPABASE_SERVICE_ROLE_KEY` (usada só na function) é secreta de verdade e só existe como env var no Vercel.

## Modelo de dados (guardado como JSON — local em `localStorage` na chave `financeiro_v2_<user.id>`, e em espelho na nuvem na coluna `data` de `financeiro_state`)

```
state = {
  meta: { startingBalance, lastModified, lastExported, backupFrequency },  // backupFrequency: 'off'|'daily'|'weekly'|'biweekly'|'monthly'
  cards: [ {id, name, bank, closingDay, dueDay, color, limit} ],  // limit é opcional
  commitments: [ {
    id, desc, category: 'income'|'fixed'|'variable', amount,
    type: 'installment'|'monthly',
    method, cardId,                    // ausentes se category==='income'
    start, startNum, total,            // se type==='installment'
    endMonth,                          // opcional: último mês ainda ativo (inclusive)
    skipMonths: []                     // meses individuais pulados
  } ],
  months: {
    'YYYY-MM': {
      income:   [ {id, desc, amount, status, paidAmount, commitmentId} ],
      fixed:    [ {id, desc, amount, method, cardId, status, paidAmount, commitmentId} ],
      variable: [ ...mesma forma que fixed... ]
    }
  },
  projections: { 'YYYY-MM': number },  // renda esperada editada manualmente no dashboard
  auditLog: [ {id, ts, action, description} ]  // histórico de ações, mais recente primeiro, capado em 2000 itens
}
```

Status possíveis: `Pendente`, `Lançado` (só cartão, entre Pendente e Pago), `Pago`/`Recebido`, `Parcial` (com `paidAmount` preenchido parcialmente).

## Decisões de arquitetura importantes

- **Geração automática de compromissos é "preguiçosa" (lazy) e não deveria persistir meses futuros sem necessidade.** Existem duas funções para isso:
  - `ensureMonth(key)` — cria/persiste o mês de verdade no `state.months`, usada quando o usuário está realmente vendo/editando aquele mês (aba "Mês a mês").
  - `peekMonthTotals(key)` — calcula os totais **sem gravar nada**, usada em previsões (Visão do ano, gráficos de tendência, timeline de 6 meses). **Importante:** se algum dia adicionar uma nova visão de "meses futuros", use `peek`, nunca `ensureMonth`, senão volta o bug antigo de gerar dezenas de meses vazios só de olhar o dashboard.
- **Edição sempre em popup/modal**, nunca inline na linha da tabela — foi decisão explícita do usuário depois de achar a edição em linha apertada demais.
- **Exclusão (e outras ações em lote como "Pagar fatura") sempre com toast "Desfazer" (7s)**, não com `confirm()` — trade-off deliberado (menos travamento de UI, mais seguro que um clique acidental apague/altere algo pra sempre). `payInvoice()` segue esse padrão: guarda um snapshot de status/paidAmount antes de marcar como "Pago" e restaura no undo.
- **Compromissos fixos nunca são "hard deleted" sem preservar histórico**: pular um mês usa `skipMonths`, encerrar no futuro usa `endMonth` (nunca mexe no passado). A etiqueta "auto" numa linha só aparece se o `commitmentId` ainda resolver para um compromisso existente (evita etiqueta órfã).
- **Paleta e estilo**: verde `--brand: #0E7A5F` (positivo), vermelho `--bad: #B8433A` (negativo), fundo `--bg:#EEF1F0`, fonte mono para números (`--mono`). Ícones são SVG inline (não emoji — davam problema de renderização inconsistente entre sistemas).
- **Tabelas viram "cartão empilhado" no celular** (`.table-scroll` + `data-label` em cada `<td>`) via media query `max-width:640px`. Qualquer tabela nova deve seguir esse padrão (adicionar `data-label="..."` em cada célula). **Cuidado**: nessa media query o `<td>` vira `display:flex`, então uma célula com mais de um elemento-irmão (ex: badge de status + nota de progresso) precisa agrupar tudo num wrapper único dentro do `<td>` — senão os irmãos viram itens do flex lado a lado e colidem (bug real já visto na coluna de Status do "Mensal").
- **No "Mensal", Receitas/Fixas/Variáveis viram abas só no celular** (`.mes-section-toggle` + `setMesSection()`) — no desktop as 3 continuam lado a lado (`.cols3`) igual sempre foi. Existe porque empilhado no celular exigia rolar a tela inteira pra chegar em "Variáveis". `renderMes()` chama `setMesSection(mesSection)` no fim pra manter a aba certa visível a cada re-render.
- **Navegação mobile é uma barra fixa inferior** (`.mobile-tabbar`, ícone+texto pequeno), não mais a sidebar virando linha horizontal no topo — ela escondia itens do menu exigindo scroll horizontal. Os botões da sidebar (desktop) e da barra inferior (mobile) compartilham o mesmo `[data-view]` e o mesmo listener de clique; os dois ficam sempre no DOM, só a visibilidade muda por CSS.
- **Painel "Faturas dos cartões"** usa layout flex-wrap (`.fatura-card`/`.fatura-top`/`.fatura-vals`), não mais uma CSS grid de colunas fixas — isso existe pra empilhar sozinho em telas estreitas em vez de vazar/cortar conteúdo pra fora da tela (bug real já visto). O botão "Pagar fatura" (`payInvoice(cardId, monthKey)`) marca em massa os lançamentos `Lançado` daquele cartão/mês como `Pago` — recebe o mês explícito porque esse painel aparece tanto no Dashboard (sempre mês atual) quanto no "Mensal" (mês navegável).
- **`cardLimitUsage(cardId)` é diferente de `cardInvoiceTotals`**: os números Lançado/Pendente/Previsto exibidos continuam só do mês em questão (não mexer nisso), mas a barra "Limite do cartão" soma só `Lançado`/`Parcial` (restante) de **todos os meses** — já foi gasto de fato, mesmo que a fatura seja futura. `Pendente` **nunca** conta pro limite, nem no mês atual — é só orçamento, ainda não virou gasto real (decisão explícita do usuário: "os 500 pendentes não entram na conta, até que sejam lançados"). Existe porque uma compra já lançada numa fatura futura já consome limite de crédito real, não só a fatura do mês corrente.
- **"Mensal" tem um painel "Gastos por forma de pagamento"** (`renderMethodBreakdown`) ao lado do de faturas dos cartões (`.grid2-equal`, colapsa pra 1 coluna se não houver cartão cadastrado, via `mes-secondary-grid`) — soma `fixed`+`variable` do mês agrupado por `method`, mesmo padrão visual (`.debt-row`/`.debt-head`) do "Progresso das parcelas". **Importante**: a barra é a fatia daquele método sobre o total de despesas do mês (as barras somam 100%) — não é relativo ao maior método. Se mexer nessa função de novo, manter esse parâmetro claro (mostrar o `%` no texto, não só a barra).
- **Visão geral tem um toggle Mês/Ano** (`dashboardMode`, função `setDashboardMode()`) — no modo Ano, os cards e o gráfico de barras (`renderAnoChart()`) usam a navegação de ano já existente (`currentYear`/`ano-prev`/`ano-next`). Os painéis "Visão do ano" (tabela) e "Contas no cartão ainda não lançadas" foram removidos de propósito — o pedido foi tirar elementos "de planilha" e manter só visual/gráfico.
- **"Comprometido x renda esperada" é o último painel da Visão Geral** (`dash-timeline-wrap`), depois dos gráficos de tendência — decisão explícita do usuário, não mexer na ordem sem pedir.
- **Painel "Crédito disponível" na Visão Geral** (`renderCardsSummary()`) é um resumo consolidado (soma de todos os limites vs. `cardLimitUsage()` de todos os cartões) + uma lista compacta de % usado por cartão (nome + barra, sem os números de Lançado/Pendente/Previsto) — diferente do painel "Faturas dos cartões" do "Mensal", que mostra o detalhe completo. A lista por cartão existe também pra equilibrar visualmente com o painel "Saúde financeira" ao lado (que tem a rosca) — sem ela, o painel ficava raso e desalinhado na `.grid2`.
- **"Saúde financeira do mês" tem uma rosca (Fixas/Variáveis/Sobra)** via `donutSVG()` (SVG com `stroke-dasharray`/`stroke-dashoffset`, sem biblioteca) — só aparece se houver receita ou despesa lançada no mês (sem isso não dá pra calcular proporção).
- **`.card`/`.panel` têm uma sombra bem sutil** (`box-shadow` leve) — decisão consciente de manter minimalista, não exagerar na elevação.
- **Auditoria** (`js/auditoria.js`, aba entre "Cartões" e "Configurações"): `logAudit(action, description)` (em `state.js`) é chamado logo antes de cada `save()` relevante — lançamentos, mudanças de status, edições, exclusões, registros de compromisso/cartão, importação de backup. Grava em `state.auditLog` (mais recente primeiro via `unshift`, capado em 2000 itens pra não inflar o JSON sincronizado indefinidamente). A tela (`renderAuditoria()`) segue o mesmo padrão `.table-scroll` das outras tabelas. Cada tipo de ação (`Lançamento`/`Registro`/`Edição`/`Status`/`Exclusão`/`Importação`) reaproveita as cores dos `.badge` já existentes (`AUDIT_BADGE_CLASS` em `auditoria.js`), com uma cor nova (`.badge.excluido`, vermelho) adicionada só pra exclusões. **Se criar uma nova função que muda dados do usuário, adicionar `logAudit()` nela também** (chamar sempre logo antes do `save()` correspondente).
  - **Mensagens de edição mostram antes/depois, não só "foi editado"**: `auditDiff(pairs)` (em `state.js`) recebe uma lista de `[rótulo, valorAntigo, valorNovo]` e devolve só os campos que de fato mudaram, formatados `Campo: antes → depois`. Usado em `saveEntryEdit`, `saveBasicCommitment`, `saveCardEdit` (que por isso guardam um snapshot `before = {...}` logo no início da função, antes de qualquer atribuição) e nos deltas simples de `applyBulkAmount`/`saveSaldoInicial`. **Se adicionar um novo campo editável a um formulário existente, inclua-o no snapshot `before` e na lista de pares do `auditDiff()` correspondente** — senão a edição desse campo fica muda no log.
  - **A tela limita quantos registros renderiza por vez** (`auditLogLimit`, padrão `15`) via um `<select>` (15/30/50/100/Todos) — existe pra não re-renderizar milhares de `<tr>` de uma vez conforme o log cresce. `setAuditLimit(val)` atualiza a variável e re-renderiza; `renderAuditoria()` faz `log.slice(0, auditLogLimit)` (ou usa a lista inteira se `'all'`) e mostra "Mostrando X de Y registro(s)" acima da tabela.
- **Menu mobile "Mais"**: a barra inferior (`.mobile-tabbar`) só tem espaço confortável pra 4-5 ícones, então mostra só Geral/Mensal/Compr./Cartões + um botão "Mais" (`showMoreMenu()`, em `main.js`) que abre um modal (reaproveita `.modal-overlay`/`.modal-box`) listando os itens que não couberam (hoje: Auditoria e Configurações), definidos em `MOBILE_OVERFLOW_ITEMS`. O desktop (sidebar) não usa esse conceito — sempre mostrou todos os itens direto. A navegação de aba foi refatorada pra uma função única `switchView(view)` (em `main.js`), usada tanto pelo listener de clique dos botões `[data-view]` quanto pelos itens do modal "Mais" — evita duplicar a lógica de troca de view. **Se adicionar uma nova aba no futuro**, ela entra na sidebar normalmente e, se não couber na barra mobile, entra em `MOBILE_OVERFLOW_ITEMS` (não crie um botão `data-view` novo dentro do `.mobile-tabbar` sem antes considerar se cabe).
- **Backup automático** (`state.meta.backupFrequency`, seletor em Configurações): reaproveita o mesmo timestamp `state.meta.lastExported` que já existia pro aviso "vale exportar" — não criei um timestamp paralelo, então um export manual também "conta" e adia o próximo automático. `checkAutoBackup()` (`backup.js`) roda uma vez no `bootUI()` (depois do login) e, se passou o intervalo escolhido (1/7/15/30 dias), chama `exportBackup()` de novo, disparando o download `.json` sozinho. **Limitação conhecida e já avisada ao usuário**: navegadores podem bloquear downloads automáticos não amarrados a um clique direto do usuário — se isso acontecer, o backup manual continua funcionando normalmente como alternativa.
- **Exportação Excel/CSV/PDF** (`js/relatorios.js`): `collectAllData()` centraliza a coleta (todos os meses/lançamentos, compromissos, cartões) e é reaproveitada pelas três exportações — evita triplicar a lógica de "juntar tudo". Excel usa a biblioteca **SheetJS** carregada via CDN (`<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/...">`, mesmo padrão do `supabase-js`: script externo, sem build) e gera `.xlsx` com 3 abas (Lançamentos/Compromissos/Cartões). CSV é gerado na mão (sem biblioteca), com BOM UTF-8 pro Excel abrir acentos corretamente. PDF **não usa nenhuma biblioteca** — `exportPDF()` monta HTML dentro de `#print-report` (elemento escondido por padrão, `display:none` via `.print-only`) e chama `window.print()`; o CSS em `@media print` (final do `style.css`) esconde todo o resto da página (`body * { visibility:hidden }`) e mostra só o relatório, com tipografia própria — o usuário escolhe "Salvar como PDF" no diálogo nativo do navegador. Essa foi uma escolha deliberada do usuário (controle total do design, zero dependência nova) em vez de uma lib tipo jsPDF.

## Limitações conhecidas (decisões conscientes, não bugs)

- Projeção de gastos futuros (gráficos de tendência, timeline) só considera **compromissos fixos cadastrados** — gastos variáveis do dia a dia não entram na previsão, porque não são recorrentes por natureza. Já foi explicado ao usuário.
- Não existem categorias nas despesas variáveis (Mercado, Lazer, etc.) — o usuário pediu explicitamente para **não** implementar isso.
- Import de backup (`.json`) ainda compara timestamp e avisa se o arquivo for mais antigo que os dados atuais — continua valendo mesmo com a sincronização em nuvem, é uma segunda camada de segurança pro caso de restaurar um backup manual antigo.

## Bugs já corrigidos (não reintroduzir)

1. Excluir lançamento manual não pedia confirmação — resolvido com o sistema de toast/desfazer.
2. Etiqueta "auto" continuava aparecendo em lançamentos cujo compromisso original já tinha sido excluído — resolvido checando se `commitmentId` ainda existe em `state.commitments`.
3. Progresso de parcela mostrava "1/60" para financiamentos que ainda nem tinham começado — resolvido tratando `diff < 0` como "ainda não começou".
4. Import de backup sem validação de estrutura podia quebrar o app silenciosamente — resolvido com `validateBackupShape()` e cópia de segurança em memória antes de aplicar.
5. Botão "Sair da conta" não saía de verdade — `supa.auth.signOut()` não era aguardado antes do `location.reload()`, então a página recarregava com a sessão antiga ainda válida. Resolvido tornando `handleSignOut()` `async` com `await`.
6. O cache do `localStorage` usava uma chave fixa (`financeiro_v2`) compartilhada por qualquer conta que logasse no mesmo navegador — uma conta podia ver/sobrescrever o cache local de outra antes de sincronizar com a nuvem. Resolvido com `localKey()` por `user.id` (ver seção de sincronização acima).
7. No celular, a coluna de Status (badge + "R$X de R$Y" quando Parcial) ficava com os dois lado a lado colidindo, porque o `<td>` vira `display:flex` na media query mobile e os dois elementos-irmãos viravam itens do flex. Resolvido agrupando os dois num wrapper único dentro do `<td>`.
8. O painel "Faturas dos cartões" usava uma CSS grid de colunas fixas dentro de um `min-width:460px` — no celular isso cortava/escondia os valores da direita em vez de deixar claro que dava pra rolar. Resolvido trocando por um layout flex-wrap que empilha sozinho em telas estreitas.
9. `.card .label`/`.card .value` cortavam com reticências (`text-overflow:ellipsis`) quando o número era grande — no modo "Ano" da Visão Geral, valores de 6+ dígitos (totais anuais) e o rótulo "Acumulado até dez/26" ficavam ilegíveis no celular. Resolvido deixando o texto quebrar linha (`overflow-wrap:break-word`) em vez de truncar — nunca escondemos um número de verdade.
10. A faixa "‹ ano ›" + resumo (Receita/Despesas/Saldo) no modo Ano não quebrava linha — no celular o resumo espremia do lado das setas. Resolvido com `flex-wrap` no `.nav-strip` e uma classe `.ano-totals` que cai pra linha de baixo em telas estreitas.

## Pendências / ideias para o futuro (mencionadas ao usuário, não implementadas)

- Otimizar performance para quando houver anos de dados acumulados (hoje tudo re-renderiza por completo a cada clique — funciona bem em escala pequena/média).
- Campos de valor monetário ainda são `<input type="number">` nativos, sem máscara de moeda visual.
