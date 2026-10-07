-- Pedidos de recuperação de senha (tela "Esqueci a senha").
--
-- Serve só de trava contra abuso: ninguém pode usar a tela para encher a caixa
-- de e-mail de outra pessoa. A função recuperar-senha consulta esta tabela:
--   - no máximo 1 e-mail por minuto para o mesmo endereço;
--   - no máximo 5 pedidos por hora do mesmo IP (guardado embaralhado, não o IP em si).
-- Nada aqui identifica quem pediu além do e-mail digitado; o cron apaga tudo com
-- mais de 1 dia.

create table if not exists public.recuperacoes_senha (
  id bigserial primary key,
  email text not null,
  ip_hash text not null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_recuperacoes_senha_email on public.recuperacoes_senha (email, criado_em desc);
create index if not exists idx_recuperacoes_senha_ip on public.recuperacoes_senha (ip_hash, criado_em desc);

alter table public.recuperacoes_senha enable row level security;
-- Sem política: só a função (chave de serviço) lê e grava.

create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('limpar-recuperacoes-senha'); exception when others then null; end $$;
select cron.schedule(
  'limpar-recuperacoes-senha',
  '45 3 * * *',
  $cron$ delete from public.recuperacoes_senha where criado_em < now() - interval '1 day'; $cron$
);
