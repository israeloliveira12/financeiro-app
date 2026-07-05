-- Rode este script inteiro no SQL Editor do seu projeto Supabase (supabase.com/dashboard -> seu projeto -> SQL Editor -> New query).
-- Cria a tabela que guarda o "state" inteiro do app (um JSON por usuário) e trava o acesso
-- para que cada pessoa só consiga ler/escrever a própria linha.

create table if not exists financeiro_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table financeiro_state enable row level security;

create policy "Usuário lê só o próprio estado"
  on financeiro_state for select
  using (auth.uid() = user_id);

create policy "Usuário insere só o próprio estado"
  on financeiro_state for insert
  with check (auth.uid() = user_id);

create policy "Usuário atualiza só o próprio estado"
  on financeiro_state for update
  using (auth.uid() = user_id);
