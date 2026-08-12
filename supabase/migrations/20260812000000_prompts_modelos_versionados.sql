-- Versiona as tabelas prompts_editaveis e modelos_ia, que até aqui só existiam
-- no banco remoto (criadas fora do controle de migrations). Tudo é idempotente:
-- rodar contra o banco atual não muda nada; num ambiente novo, cria igual.

create table if not exists public.prompts_editaveis (
  chave text primary key,
  conteudo text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.prompts_editaveis is
  'Sobrescritas dos system prompts da IA, editáveis pelo painel de admin. Chave = identificador do bloco; conteudo = texto que substitui o padrão do código.';

create table if not exists public.modelos_ia (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  modelo text not null,
  ativo boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.modelos_ia is
  'Modelos do OpenRouter configuráveis pelo admin. Um ativo por vez; as edge functions usam o ativo (fallback: env).';

-- Só um modelo ativo por vez.
create unique index if not exists modelos_ia_um_ativo
  on public.modelos_ia (ativo) where ativo;

alter table public.prompts_editaveis enable row level security;
alter table public.modelos_ia enable row level security;

-- Leitura liberada para autenticados (o front monta os prompts no browser);
-- escrita só para admin da plataforma.
drop policy if exists "prompts leitura autenticada" on public.prompts_editaveis;
create policy "prompts leitura autenticada" on public.prompts_editaveis
  for select to authenticated using (true);

drop policy if exists "prompts escrita admin" on public.prompts_editaveis;
create policy "prompts escrita admin" on public.prompts_editaveis
  for all to authenticated
  using (exists (select 1 from public.platform_admins where email = auth.email()))
  with check (exists (select 1 from public.platform_admins where email = auth.email()));

drop policy if exists "modelos leitura autenticada" on public.modelos_ia;
create policy "modelos leitura autenticada" on public.modelos_ia
  for select to authenticated using (true);

drop policy if exists "modelos admin" on public.modelos_ia;
create policy "modelos admin" on public.modelos_ia
  for all to authenticated
  using (exists (select 1 from public.platform_admins where email = auth.email()))
  with check (exists (select 1 from public.platform_admins where email = auth.email()));

-- Ativa um modelo desativando os demais, numa transação só.
create or replace function public.ativar_modelo_ia(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.platform_admins where email = auth.email()) then
    raise exception 'Apenas admin da plataforma pode ativar um modelo';
  end if;
  update public.modelos_ia set ativo = false where ativo;
  update public.modelos_ia set ativo = true where id = p_id;
end;
$$;

revoke execute on function public.ativar_modelo_ia(uuid) from public, anon;
grant execute on function public.ativar_modelo_ia(uuid) to authenticated, service_role;
