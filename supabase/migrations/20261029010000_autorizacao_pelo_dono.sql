-- O próprio dono autoriza (ou revoga) a divulgação dos resultados do
-- restaurante, em Configurações → Divulgação.
--
-- Antes só o admin registrava a autorização, com a prova guardada fora do
-- sistema (print, e-mail). Agora o clique do dono logado É a prova: fica quem
-- clicou, quando, o que marcou e QUAL TEXTO estava na tela.
--
--   - o texto aceito é versionado em `textos_autorizacao_marketing`; a tela
--     mostra o que vem do banco e manda de volta a versão lida, então o que foi
--     aceito é exatamente o que foi mostrado;
--   - toda mudança (do dono ou do admin) vira uma linha em
--     `autorizacoes_marketing_historico`: revogar não apaga a autorização que
--     valeu antes;
--   - o admin dentro da conta do cliente ("Entrar na conta") NÃO consegue
--     autorizar em nome dele: o banco reconhece a sessão por `acesso_admin_atual`.
--
-- Pode rodar mais de uma vez.

-- ─────────────────────────────────────────────────────────────
-- 1. De onde veio a autorização
-- ─────────────────────────────────────────────────────────────
alter table public.autorizacoes_marketing
  add column if not exists origem text not null default 'admin',
  add column if not exists versao_texto text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'autorizacoes_marketing_origem_check') then
    alter table public.autorizacoes_marketing
      add constraint autorizacoes_marketing_origem_check check (origem in ('admin', 'dono'));
  end if;
end $$;

-- 'painel' = marcado pelo dono na tela.
alter table public.autorizacoes_marketing drop constraint if exists autorizacoes_marketing_canal_check;
alter table public.autorizacoes_marketing
  add constraint autorizacoes_marketing_canal_check check (canal in ('whatsapp', 'email', 'contrato', 'outro', 'painel'));

-- ─────────────────────────────────────────────────────────────
-- 2. O texto que o dono aceita, por versão
-- ─────────────────────────────────────────────────────────────
-- Mudou o texto? Insira uma versão NOVA (nunca edite uma antiga): quem aceitou
-- a anterior continua com a anterior registrada.
create table if not exists public.textos_autorizacao_marketing (
  versao    text primary key,
  texto     text not null,
  criado_em timestamptz not null default now()
);

alter table public.textos_autorizacao_marketing enable row level security;
-- Sem política: a tela lê pela função `minha_autorizacao_marketing`.

insert into public.textos_autorizacao_marketing (versao, texto) values (
  '2026-10-15',
  'Autorizo o EasyFeed a divulgar, em materiais de marketing (site, redes sociais, apresentações e conversas com '
  || 'possíveis clientes), os resultados do meu restaurante medidos pela plataforma, apenas dentro das opções que '
  || 'marquei abaixo. Nenhum dado dos meus clientes — texto de feedback, nome ou telefone — é divulgado. Posso '
  || 'mudar as opções ou revogar a autorização quando quiser, nesta mesma tela; a partir da revogação, o EasyFeed '
  || 'não publica material novo com o nome do restaurante.'
) on conflict (versao) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 3. Histórico de toda mudança
-- ─────────────────────────────────────────────────────────────
create table if not exists public.autorizacoes_marketing_historico (
  id              bigint generated always as identity primary key,
  restaurante_id  bigint not null references public.restaurantes(id) on delete cascade,
  status          text not null,
  pode_nome       boolean not null,
  pode_logo       boolean not null,
  pode_numeros    boolean not null,
  pode_depoimento boolean not null,
  origem          text not null,
  canal           text not null,
  autorizado_por  text not null,
  observacao      text,
  versao_texto    text,
  registrado_por  text,
  criado_em       timestamptz not null default now()
);

create index if not exists autorizacoes_marketing_historico_rest
  on public.autorizacoes_marketing_historico (restaurante_id, criado_em desc);

alter table public.autorizacoes_marketing_historico enable row level security;
drop policy if exists autorizacoes_marketing_historico_admin_le on public.autorizacoes_marketing_historico;
create policy autorizacoes_marketing_historico_admin_le on public.autorizacoes_marketing_historico
  for select using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));
-- Sem política de escrita: só o gatilho grava.

create or replace function public.autorizacao_marketing_para_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.autorizacoes_marketing_historico (
    restaurante_id, status, pode_nome, pode_logo, pode_numeros, pode_depoimento,
    origem, canal, autorizado_por, observacao, versao_texto, registrado_por)
  values (
    new.restaurante_id, new.status, new.pode_nome, new.pode_logo, new.pode_numeros, new.pode_depoimento,
    new.origem, new.canal, new.autorizado_por, new.observacao, new.versao_texto, new.registrado_por);
  return new;
end;
$$;

drop trigger if exists trg_autorizacao_marketing_historico on public.autorizacoes_marketing;
create trigger trg_autorizacao_marketing_historico
  after insert or update on public.autorizacoes_marketing
  for each row execute function public.autorizacao_marketing_para_historico();

-- ─────────────────────────────────────────────────────────────
-- 4. O que a tela do dono usa
-- ─────────────────────────────────────────────────────────────
-- A conta do dono é a de `restaurantes.auth_user_id`: funcionário com login
-- próprio não decide pelo restaurante.
create or replace function public.minha_autorizacao_marketing()
returns table (
  status text,
  pode_nome boolean,
  pode_logo boolean,
  pode_numeros boolean,
  pode_depoimento boolean,
  origem text,
  autorizado_por text,
  autorizado_em timestamptz,
  revogado_em timestamptz,
  versao_aceita text,
  versao_atual text,
  texto_atual text,
  eh_dono boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select versao, texto from public.textos_autorizacao_marketing order by versao desc limit 1
  ),
  r as (
    select id, (auth_user_id = auth.uid()) as eh_dono
      from public.restaurantes
     where id = public.get_user_restaurante_id()
  )
  select a.status, a.pode_nome, a.pode_logo, a.pode_numeros, a.pode_depoimento, a.origem,
         a.autorizado_por, a.autorizado_em, a.revogado_em, a.versao_texto,
         t.versao, t.texto, coalesce(r.eh_dono, false)
    from t
    left join r on true
    left join public.autorizacoes_marketing a on a.restaurante_id = r.id
$$;

revoke all on function public.minha_autorizacao_marketing() from public, anon;
grant execute on function public.minha_autorizacao_marketing() to authenticated;

create or replace function public.definir_minha_autorizacao_marketing(
  p_autorizar boolean,
  p_pode_nome boolean,
  p_pode_numeros boolean,
  p_pode_logo boolean,
  p_pode_depoimento boolean,
  p_versao text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rest bigint;
  v_versao text;
  v_quem text;
begin
  select r.id into v_rest from public.restaurantes r where r.auth_user_id = auth.uid() limit 1;
  if v_rest is null then
    raise exception 'Só o dono da conta pode decidir a divulgação do restaurante.' using errcode = '42501';
  end if;
  if exists (select 1 from public.acesso_admin_atual()) then
    raise exception 'Você está dentro da conta do cliente: a autorização tem que ser marcada pelo próprio dono.'
      using errcode = '42501';
  end if;

  if not p_autorizar then
    update public.autorizacoes_marketing
       set status = 'revogado', revogado_em = now(), atualizado_em = now(),
           origem = 'dono', canal = 'painel', registrado_por = auth.email(),
           observacao = 'Revogado pelo dono no painel'
     where restaurante_id = v_rest and status = 'autorizado';
    return;
  end if;

  select versao into v_versao from public.textos_autorizacao_marketing order by versao desc limit 1;
  if p_versao is distinct from v_versao then
    raise exception 'O texto da autorização mudou. Recarregue a página e leia de novo.' using errcode = 'P0001';
  end if;
  if not (coalesce(p_pode_nome, false) or coalesce(p_pode_numeros, false)
          or coalesce(p_pode_logo, false) or coalesce(p_pode_depoimento, false)) then
    raise exception 'Marque pelo menos uma opção, ou revogue.' using errcode = 'P0001';
  end if;

  v_quem := coalesce(
    (select nullif(btrim(u.nome), '') from public.usuarios u where u.id = auth.uid()),
    auth.email(),
    'dono');

  insert into public.autorizacoes_marketing as a (
    restaurante_id, status, pode_nome, pode_logo, pode_numeros, pode_depoimento,
    autorizado_por, canal, observacao, autorizado_em, revogado_em, registrado_por,
    origem, versao_texto, atualizado_em)
  values (
    v_rest, 'autorizado', coalesce(p_pode_nome, false), coalesce(p_pode_logo, false),
    coalesce(p_pode_numeros, false), coalesce(p_pode_depoimento, false),
    v_quem, 'painel', 'Marcado pelo dono no painel (texto de ' || v_versao || ')', now(), null, auth.email(),
    'dono', v_versao, now())
  on conflict (restaurante_id) do update set
    status = excluded.status, pode_nome = excluded.pode_nome, pode_logo = excluded.pode_logo,
    pode_numeros = excluded.pode_numeros, pode_depoimento = excluded.pode_depoimento,
    autorizado_por = excluded.autorizado_por, canal = excluded.canal, observacao = excluded.observacao,
    autorizado_em = excluded.autorizado_em, revogado_em = null, registrado_por = excluded.registrado_por,
    origem = excluded.origem, versao_texto = excluded.versao_texto, atualizado_em = excluded.atualizado_em;
end;
$$;

revoke all on function public.definir_minha_autorizacao_marketing(boolean, boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.definir_minha_autorizacao_marketing(boolean, boolean, boolean, boolean, boolean, text) to authenticated;
