-- A conta do admin usa as DUAS versões (Restaurante e RH) no mesmo número.
--
-- Pedido do Raver (14/10/2026): a conta de admin troca de versão com um clique,
-- sem perder nem misturar dados, e as duas versões usam o mesmo WhatsApp. Na
-- tela WhatsApp, cada versão mostra só as conversas dela.
--
-- Como fica:
--   - trocar de versão muda só o que a conta VÊ (`restaurantes.area`): menu,
--     páginas e palavras. Os dados não mudam de lugar: feedback de cliente é
--     público 'cliente', feedback de funcionário é público 'equipe', sempre;
--   - conta que usa as duas (o dono é admin da plataforma) continua atendendo
--     cliente e funcionário no mesmo número, esteja vendo a versão que estiver:
--     o número não cadastrado NÃO é ignorado nela, é cliente;
--   - cada mensagem do WhatsApp passa a dizer de que versão é a conversa
--     (`mensagens_whatsapp.publico`): 'equipe' quando o telefone é de um
--     funcionário cadastrado, 'cliente' no resto. A tela WhatsApp mostra as do
--     público da versão em que a conta está.
--
-- Pode rodar mais de uma vez.

-- ─────────────────────────────────────────────────────────────
-- 1. Quem usa as duas versões
-- ─────────────────────────────────────────────────────────────
create or replace function public.conta_usa_as_duas_versoes(p_restaurante_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.restaurantes r
      join auth.users u on u.id = r.auth_user_id
      join public.platform_admins pa on lower(pa.email) = lower(u.email)
     where r.id = p_restaurante_id)
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. De que versão é cada conversa do WhatsApp
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'mensagens_whatsapp' and column_name = 'publico') then
    alter table public.mensagens_whatsapp add column publico text not null default 'cliente';
    alter table public.mensagens_whatsapp
      add constraint mensagens_whatsapp_publico_check check (publico in ('cliente', 'equipe'));
    -- O que já existia: conversa com telefone de funcionário cadastrado é da equipe.
    update public.mensagens_whatsapp m
       set publico = 'equipe'
     where not coalesce(m.grupo, false)
       and m.telefone is not null
       and exists (select 1 from public.equipe_funcionarios f
                    where f.restaurante_id = m.restaurante_id
                      and public.telefone_chave(f.telefone) = public.telefone_chave(m.telefone));
  end if;
end $$;

create index if not exists mensagens_whatsapp_publico_idx on public.mensagens_whatsapp (restaurante_id, publico);

comment on column public.mensagens_whatsapp.publico is
  'De que versão é a conversa: equipe (telefone de funcionário cadastrado) ou cliente. Preenchido pelo gatilho na gravação. A tela WhatsApp mostra as do público da versão em que a conta está.';

-- O gatilho que já decidia o sigilo passa a dizer também de que versão é a
-- mensagem. Regras do sigilo (as mesmas de antes):
--   - conversa com funcionário ATIVO nasce escondida e só aparece quando a
--     pessoa deixa mostrar o nome;
--   - conta SÓ de RH: número de fora também nasce escondido, e nunca aparece.
--     Conta que usa as duas versões não entra nesta regra: nela o número de
--     fora é um cliente do restaurante.
create or replace function public.mensagens_whatsapp_sigilo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cadastrado boolean;
  v_ativo      boolean;
  v_so_rh      boolean;
begin
  if coalesce(new.grupo, false) or new.telefone is null then
    return new;
  end if;

  select count(*) > 0, coalesce(bool_or(f.ativo), false) into v_cadastrado, v_ativo
    from public.equipe_funcionarios f
   where f.restaurante_id = new.restaurante_id
     and public.telefone_chave(f.telefone) = public.telefone_chave(new.telefone);

  v_so_rh := exists (select 1 from public.restaurantes r where r.id = new.restaurante_id and r.area = 'rh')
             and not public.conta_usa_as_duas_versoes(new.restaurante_id);

  if v_cadastrado or v_so_rh then
    new.publico := 'equipe';
  end if;

  if (not new.de_mim or new.por_api) and (v_ativo or v_so_rh) then
    new.oculta := true;
  end if;
  return new;
end;
$$;

-- A tela WhatsApp (lista, conversa, busca e tempo real) só recebe as mensagens
-- do público da versão em que a conta está. Vale por linha, pelo restaurante da
-- mensagem: o admin olhando a conta de um cliente vê o que o cliente vê.
create or replace function public.whatsapp_publico_da_conta(p_restaurante_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when (select r.area from public.restaurantes r where r.id = p_restaurante_id) = 'rh' then 'equipe' else 'cliente' end
$$;

drop policy if exists mensagens_da_versao on public.mensagens_whatsapp;
create policy mensagens_da_versao on public.mensagens_whatsapp as restrictive for select
  using (publico = public.whatsapp_publico_da_conta(restaurante_id));

-- ─────────────────────────────────────────────────────────────
-- 3. Número de fora só é ignorado na conta SÓ de RH
-- ─────────────────────────────────────────────────────────────
create or replace function public.equipe_quem_e(p_restaurante_id bigint, p_telefone text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'ok', true,
      'funcionario_id', f.id,
      'nome', f.nome,
      'ignorar', false,
      -- Já recebeu a pergunta do anonimato há pouco: "anônimo" escrito por
      -- extenso também vale como resposta.
      'pode_escolher', exists (
        select 1 from public.equipe_autorias a
         where a.funcionario_id = f.id
           and a.perguntado_em > now() - interval '7 days'),
      -- A pergunta está no ar agora (feita e ainda no prazo): só aqui um
      -- "sim" ou "não" solto vale como resposta a ela.
      'aguardando_escolha', exists (
        select 1 from public.equipe_autorias a
         where a.funcionario_id = f.id
           and a.identidade = 'pendente'
           and a.perguntado_em is not null
           and (a.identidade_ate is null or a.identidade_ate > now())))
      from public.equipe_funcionarios f
     where f.restaurante_id = p_restaurante_id
       and f.ativo
       and public.telefone_chave(f.telefone) = public.telefone_chave(p_telefone)
     limit 1
  ), jsonb_build_object(
       'ok', true,
       'funcionario_id', null,
       -- Conta só de RH: não existe conversa de cliente, o fluxo para. Conta
       -- que usa as duas versões: o número de fora é cliente, segue normal.
       'ignorar', exists (select 1 from public.restaurantes r where r.id = p_restaurante_id and r.area = 'rh')
                  and not public.conta_usa_as_duas_versoes(p_restaurante_id)))
$$;

do $$
declare f text;
begin
  foreach f in array array['conta_usa_as_duas_versoes(bigint)', 'whatsapp_publico_da_conta(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
