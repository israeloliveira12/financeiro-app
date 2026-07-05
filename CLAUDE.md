# Contexto do projeto — Meu Financeiro

Sistema de controle financeiro pessoal do Israel, feito em HTML/CSS/JS puro (um único arquivo `index.html`, sem build). Roda no navegador (PC ou celular, publicado no Vercel), com login por e-mail/senha e sincronização na nuvem via Supabase — pensado para uso pessoal (substituiu uma planilha Excel).

Este arquivo existe para dar contexto rápido em qualquer sessão nova do Claude Code/Cowork sobre esse projeto — ele foi construído ao longo de uma conversa longa no claude.ai, e este é o resumo do que foi decidido e por quê.

## Arquivos do projeto

- `index.html` — o app inteiro (HTML + CSS + JS inline, um arquivo só)
- `manifest.json` — permite instalar como PWA no celular
- `sw.js` — service worker, cache básico para uso offline
- `icon-192.png`, `icon-512.png` — ícones do PWA
- `supabase/schema.sql` — script pra rodar uma vez no SQL Editor do Supabase (cria a tabela `financeiro_state` e as políticas de Row Level Security)

## Sincronização entre aparelhos (Supabase)

- **Por quê**: o Israel pediu pra acessar os mesmos dados do PC, celular ou qualquer aparelho com internet, publicando no Vercel. Isso substituiu a decisão antiga de "sem backend" (ver histórico de commits/conversa se precisar do racional completo).
- **Autenticação**: e-mail/senha via Supabase Auth (`supa.auth.signInWithPassword`/`signUp`). Sem sessão, `showAuthGate()` bloqueia o `.app` com um modal (reaproveita `.modal-overlay`/`.modal-box`) até logar.
- **Armazenamento**: uma linha por usuário na tabela `financeiro_state` (`user_id`, `data jsonb`, `updated_at`), protegida por RLS (`auth.uid() = user_id`) — só o próprio dono lê/escreve os dados dele.
- **`localStorage` continua existindo** como cache local/offline-first: `save()` grava local na hora (interface não trava) e agenda (`scheduleCloudSync`, debounce de 1.5s) um `upsert` em segundo plano pro Supabase. Se a rede falhar, o app continua funcionando só local e mostra "Sem conexão" no indicador da sidebar (`#sync-status`).
- **Resolução de conflito ao logar** (`onAuthenticated`): compara `state.meta.lastModified` da cópia local com o da nuvem e fica com o mais recente — mesmo padrão de timestamp já usado em `importBackup()`, não é uma lógica nova.
- **Chaves do Supabase**: `SUPABASE_URL`/`SUPABASE_ANON_KEY` ficam hardcoded no topo do `<script>` do `index.html`. A anon key é pública por design do Supabase (a proteção de verdade é a RLS), então não precisa de variável de ambiente/segredo aqui.

## Modelo de dados (guardado como JSON — local em `localStorage` chave `financeiro_v2`, e em espelho na nuvem na coluna `data` de `financeiro_state`)

```
state = {
  meta: { startingBalance, lastModified, lastExported },
  cards: [ {id, name, bank, closingDay, dueDay, color} ],
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
  projections: { 'YYYY-MM': number }   // renda esperada editada manualmente no dashboard
}
```

Status possíveis: `Pendente`, `Lançado` (só cartão, entre Pendente e Pago), `Pago`/`Recebido`, `Parcial` (com `paidAmount` preenchido parcialmente).

## Decisões de arquitetura importantes

- **Geração automática de compromissos é "preguiçosa" (lazy) e não deveria persistir meses futuros sem necessidade.** Existem duas funções para isso:
  - `ensureMonth(key)` — cria/persiste o mês de verdade no `state.months`, usada quando o usuário está realmente vendo/editando aquele mês (aba "Mês a mês").
  - `peekMonthTotals(key)` — calcula os totais **sem gravar nada**, usada em previsões (Visão do ano, gráficos de tendência, timeline de 6 meses). **Importante:** se algum dia adicionar uma nova visão de "meses futuros", use `peek`, nunca `ensureMonth`, senão volta o bug antigo de gerar dezenas de meses vazios só de olhar o dashboard.
- **Edição sempre em popup/modal**, nunca inline na linha da tabela — foi decisão explícita do usuário depois de achar a edição em linha apertada demais.
- **Exclusão sempre com toast "Desfazer" (7s)**, não com `confirm()` — trade-off deliberado (menos travamento de UI, mais seguro que um clique acidental apague algo pra sempre).
- **Compromissos fixos nunca são "hard deleted" sem preservar histórico**: pular um mês usa `skipMonths`, encerrar no futuro usa `endMonth` (nunca mexe no passado). A etiqueta "auto" numa linha só aparece se o `commitmentId` ainda resolver para um compromisso existente (evita etiqueta órfã).
- **Paleta e estilo**: verde `--brand: #0E7A5F` (positivo), vermelho `--bad: #B8433A` (negativo), fundo `--bg:#EEF1F0`, fonte mono para números (`--mono`). Ícones são SVG inline (não emoji — davam problema de renderização inconsistente entre sistemas).
- **Tabelas viram "cartão empilhado" no celular** (`.table-scroll` + `data-label` em cada `<td>`) via media query `max-width:640px`. Qualquer tabela nova deve seguir esse padrão (adicionar `data-label="..."` em cada célula).

## Limitações conhecidas (decisões conscientes, não bugs)

- Projeção de gastos futuros (gráficos de tendência, timeline) só considera **compromissos fixos cadastrados** — gastos variáveis do dia a dia não entram na previsão, porque não são recorrentes por natureza. Já foi explicado ao usuário.
- Não existem categorias nas despesas variáveis (Mercado, Lazer, etc.) — o usuário pediu explicitamente para **não** implementar isso.
- Import de backup (`.json`) ainda compara timestamp e avisa se o arquivo for mais antigo que os dados atuais — continua valendo mesmo com a sincronização em nuvem, é uma segunda camada de segurança pro caso de restaurar um backup manual antigo.

## Bugs já corrigidos (não reintroduzir)

1. Excluir lançamento manual não pedia confirmação — resolvido com o sistema de toast/desfazer.
2. Etiqueta "auto" continuava aparecendo em lançamentos cujo compromisso original já tinha sido excluído — resolvido checando se `commitmentId` ainda existe em `state.commitments`.
3. Progresso de parcela mostrava "1/60" para financiamentos que ainda nem tinham começado — resolvido tratando `diff < 0` como "ainda não começou".
4. Import de backup sem validação de estrutura podia quebrar o app silenciosamente — resolvido com `validateBackupShape()` e cópia de segurança em memória antes de aplicar.

## Pendências / ideias para o futuro (mencionadas ao usuário, não implementadas)

- Otimizar performance para quando houver anos de dados acumulados (hoje tudo re-renderiza por completo a cada clique — funciona bem em escala pequena/média).
- Campos de valor monetário ainda são `<input type="number">` nativos, sem máscara de moeda visual.
