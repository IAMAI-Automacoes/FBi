-- Categorias editáveis por conta (Restaurante e RH).
--
-- Pedido do Raver (15/10/2026): cada conta edita as categorias nas
-- Configurações (renomear, descrever, mudar a cor, desativar) e cria novas.
-- Renomear vale daqui para frente: os feedbacks antigos ficam com o nome que
-- tinham (os dados de hoje são de teste, disse ele).
--
-- - Conta sem nenhuma linha usa o PADRÃO do público: as 14 dos clientes
--   (paleta oficial, src/lib/categorias-feedback.ts) ou as 12 da equipe
--   (src/lib/categorias-equipe.ts e supabase/functions/_shared/publico.ts).
-- - "Outros" existe sempre e fica no fim: é para onde vai o que não se encaixa.
-- - A descrição de cada categoria vai para a IA que classifica (n8n): ajuda
--   ela a escolher certo.
-- - Quem lê: o n8n e as funções (chave de serviço), o dono e o admin
--   (categorias_da_conta). Quem grava: só o dono, por salvar_categorias (que
--   confere as regras). A tabela `categorias` existia vazia e sem uso.
--
-- Pode rodar mais de uma vez.

alter table public.categorias add column if not exists publico text not null default 'cliente';
alter table public.categorias add column if not exists descricao text;
alter table public.categorias add column if not exists cor text;
alter table public.categorias add column if not exists icone text;
alter table public.categorias add column if not exists ordem integer not null default 0;
alter table public.categorias add column if not exists atualizado_em timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categorias_publico_check') then
    alter table public.categorias add constraint categorias_publico_check check (publico in ('cliente', 'equipe'));
  end if;
end $$;
create unique index if not exists categorias_nome_unico on public.categorias (restaurante_id, publico, lower(nome));
comment on table public.categorias is
  'Categorias de feedback de cada conta, por público (cliente/equipe). Sem linhas = o padrão (categorias_padrao). Grava só por salvar_categorias.';
comment on column public.categorias.cor is 'A chave da cor: o nome de uma categoria padrão (a cor oficial dela) ou uma cor da paleta extra (src/lib/categorias-feedback.ts).';

-- O dono continua LENDO direto; gravar, só pela função (que confere as regras).
drop policy if exists tenant_isolation_insert on public.categorias;
drop policy if exists tenant_isolation_update on public.categorias;
drop policy if exists tenant_isolation_delete on public.categorias;

-- ─────────────────────────────────────────────────────────────
-- O padrão de cada público
-- ─────────────────────────────────────────────────────────────
create or replace function public.categorias_padrao(p_publico text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p_publico = 'equipe' then jsonb_build_array(
    jsonb_build_object('nome', 'Liderança e gestão', 'descricao', 'como os líderes e gestores tratam, cobram, orientam e decidem', 'cor', 'Liderança e gestão'),
    jsonb_build_object('nome', 'Salário e benefícios', 'descricao', 'salário, pagamento em dia, comissões, gorjetas, vales e benefícios', 'cor', 'Salário e benefícios'),
    jsonb_build_object('nome', 'Escala e horários', 'descricao', 'escala, folgas, turnos, horas extras e intervalos', 'cor', 'Escala e horários'),
    jsonb_build_object('nome', 'Carga de trabalho', 'descricao', 'volume de trabalho, ritmo, falta de gente e cansaço', 'cor', 'Carga de trabalho'),
    jsonb_build_object('nome', 'Clima e colegas', 'descricao', 'relação com os colegas, conflitos e o ambiente entre a equipe', 'cor', 'Clima e colegas'),
    jsonb_build_object('nome', 'Estrutura e equipamentos', 'descricao', 'equipamentos, ferramentas, uniforme, materiais e o espaço de trabalho', 'cor', 'Estrutura e equipamentos'),
    jsonb_build_object('nome', 'Treinamento e crescimento', 'descricao', 'treinamento, aprendizado, promoção e plano de carreira', 'cor', 'Treinamento e crescimento'),
    jsonb_build_object('nome', 'Reconhecimento', 'descricao', 'elogio, valorização e reconhecimento pelo trabalho', 'cor', 'Reconhecimento'),
    jsonb_build_object('nome', 'Comunicação', 'descricao', 'informação que chega ou não chega, avisos, reuniões e clareza das regras', 'cor', 'Comunicação'),
    jsonb_build_object('nome', 'Segurança e saúde', 'descricao', 'acidentes, riscos, saúde, assédio e segurança no trabalho', 'cor', 'Segurança e saúde'),
    jsonb_build_object('nome', 'Clientes', 'descricao', 'o que a equipe conta sobre os clientes e o atendimento a eles', 'cor', 'Clientes'),
    jsonb_build_object('nome', 'Outros', 'descricao', 'o que não se encaixa em nenhuma outra', 'cor', 'Outros')
  ) else jsonb_build_array(
    jsonb_build_object('nome', 'Comida', 'descricao', 'sabor, temperatura, ponto, tempero, porção e qualidade dos pratos', 'cor', 'Comida'),
    jsonb_build_object('nome', 'Bebidas', 'descricao', 'drinks, sucos, café, vinhos, temperatura e qualidade das bebidas', 'cor', 'Bebidas'),
    jsonb_build_object('nome', 'Atendimento', 'descricao', 'simpatia, educação e atenção de garçons, caixa e recepção', 'cor', 'Atendimento'),
    jsonb_build_object('nome', 'Ambiente', 'descricao', 'decoração, conforto, iluminação, temperatura do salão e o clima do lugar', 'cor', 'Ambiente'),
    jsonb_build_object('nome', 'Limpeza', 'descricao', 'limpeza do salão, das mesas, da louça e dos banheiros', 'cor', 'Limpeza'),
    jsonb_build_object('nome', 'Preço', 'descricao', 'valor cobrado, custo-benefício, cobrança e conta', 'cor', 'Preço'),
    jsonb_build_object('nome', 'Tempo de Espera', 'descricao', 'demora para sentar, ser atendido, receber o pedido ou a conta', 'cor', 'Tempo de Espera'),
    jsonb_build_object('nome', 'Reserva', 'descricao', 'marcar mesa, fila de espera, lista e reserva não cumprida', 'cor', 'Reserva'),
    jsonb_build_object('nome', 'Estacionamento', 'descricao', 'vagas, manobrista, segurança e acesso de carro', 'cor', 'Estacionamento'),
    jsonb_build_object('nome', 'Acessibilidade', 'descricao', 'rampas, banheiro adaptado, cadeirantes, idosos e pessoas com deficiência', 'cor', 'Acessibilidade'),
    jsonb_build_object('nome', 'Música/Som', 'descricao', 'música ambiente, som ao vivo, volume e barulho', 'cor', 'Música/Som'),
    jsonb_build_object('nome', 'Cardápio/Variedade', 'descricao', 'opções do cardápio, itens em falta, novidades, opções veganas ou sem glúten', 'cor', 'Cardápio/Variedade'),
    jsonb_build_object('nome', 'Higiene', 'descricao', 'cabelo ou objeto na comida, manipulação dos alimentos, intoxicação e segurança sanitária', 'cor', 'Higiene'),
    jsonb_build_object('nome', 'Outros', 'descricao', 'o que não se encaixa em nenhuma outra', 'cor', 'Outros')
  ) end
$$;

-- Quem pode ler as categorias de uma conta: o servidor, o dono e o admin.
create or replace function public.categorias_pode_ver(p_restaurante_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or exists (select 1 from public.restaurantes r where r.id = p_restaurante_id and r.auth_user_id = auth.uid())
      or exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(coalesce(auth.email(), '')))
$$;

-- ─────────────────────────────────────────────────────────────
-- As categorias ATIVAS de uma conta (o n8n e as funções usam)
-- ─────────────────────────────────────────────────────────────
-- Devolve um objeto só (o nó HTTP do n8n trata um array como vários itens):
--   publico, personalizada, itens [{nome, descricao, cor, icone}], nomes [..],
--   prompt (uma linha por categoria, pronta para o prompt da IA).
create or replace function public.categorias_da_conta(p_restaurante_id bigint, p_publico text default 'cliente')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pub   text := case when p_publico = 'equipe' then 'equipe' else 'cliente' end;
  v_itens jsonb;
  v_pers  boolean;
begin
  if not public.categorias_pode_ver(p_restaurante_id) then
    raise exception 'Sem acesso às categorias desta conta' using errcode = '42501';
  end if;

  select jsonb_agg(jsonb_build_object('nome', c.nome, 'descricao', coalesce(c.descricao, ''), 'cor', c.cor, 'icone', c.icone) order by c.ordem, c.nome)
    into v_itens
    from public.categorias c
   where c.restaurante_id = p_restaurante_id and c.publico = v_pub and c.ativa;
  v_pers := v_itens is not null;
  if v_itens is null then
    v_itens := public.categorias_padrao(v_pub);
  end if;
  -- "Outros" sempre existe (salvar_categorias já garante; isto é a rede).
  if not exists (select 1 from jsonb_array_elements(v_itens) e where lower(e->>'nome') = 'outros') then
    v_itens := v_itens || jsonb_build_array(jsonb_build_object('nome', 'Outros', 'descricao', 'o que não se encaixa em nenhuma outra', 'cor', 'Outros'));
  end if;

  return jsonb_build_object(
    'publico', v_pub,
    'personalizada', v_pers,
    'itens', v_itens,
    'nomes', (select jsonb_agg(e->>'nome') from jsonb_array_elements(v_itens) e),
    'prompt', (select string_agg('- "' || (e->>'nome') || '"'
                 || case when coalesce(e->>'descricao', '') <> '' then ': ' || (e->>'descricao') else '' end, E'\n')
                 from jsonb_array_elements(v_itens) e)
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- A tela de Configurações: todas (ativas e não) dos dois públicos
-- ─────────────────────────────────────────────────────────────
create or replace function public.minhas_categorias()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rest bigint;
  v_res  jsonb := '{}'::jsonb;
  v_pub  text;
  v_itens jsonb;
begin
  select r.id into v_rest from public.restaurantes r where r.auth_user_id = auth.uid();
  if v_rest is null then
    return jsonb_build_object('sem_conta', true);
  end if;
  foreach v_pub in array array['cliente', 'equipe'] loop
    select jsonb_agg(jsonb_build_object('nome', c.nome, 'descricao', coalesce(c.descricao, ''), 'cor', c.cor, 'icone', c.icone, 'ativa', c.ativa) order by c.ordem, c.nome)
      into v_itens
      from public.categorias c
     where c.restaurante_id = v_rest and c.publico = v_pub;
    v_res := v_res || jsonb_build_object(v_pub, jsonb_build_object(
      'personalizada', v_itens is not null,
      'itens', coalesce(v_itens, (select jsonb_agg(e || jsonb_build_object('icone', null, 'ativa', true)) from jsonb_array_elements(public.categorias_padrao(v_pub)) e))
    ));
  end loop;
  return v_res;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Salvar a lista de um público (o dono)
-- ─────────────────────────────────────────────────────────────
-- p_itens: [{nome, descricao, cor, icone, ativa}] na ordem da tela.
-- Devolve {ok: true} ou {ok: false, motivo}. Os motivos são os mesmos da tela
-- (problemaDasCategorias em src/lib/categorias-conta.ts).
create or replace function public.salvar_categorias(p_publico text, p_itens jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rest  bigint;
  v_pub   text := case when p_publico = 'equipe' then 'equipe' else 'cliente' end;
  v_item  jsonb;
  v_nome  text;
  v_desc  text;
  v_nomes text[] := '{}';
  v_ordem integer := 0;
  v_tem_outros boolean := false;
begin
  select r.id into v_rest from public.restaurantes r where r.auth_user_id = auth.uid();
  if v_rest is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_conta');
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'vazia');
  end if;
  if jsonb_array_length(p_itens) > 30 then
    return jsonb_build_object('ok', false, 'motivo', 'demais');
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_nome := btrim(regexp_replace(coalesce(v_item->>'nome', ''), '\s+', ' ', 'g'));
    v_desc := btrim(coalesce(v_item->>'descricao', ''));
    if v_nome = '' then return jsonb_build_object('ok', false, 'motivo', 'nome_vazio'); end if;
    if length(v_nome) > 40 then return jsonb_build_object('ok', false, 'motivo', 'nome_longo'); end if;
    if length(v_desc) > 200 then return jsonb_build_object('ok', false, 'motivo', 'descricao_longa'); end if;
    if lower(v_nome) = any (select lower(n) from unnest(v_nomes) n) then
      return jsonb_build_object('ok', false, 'motivo', 'repetida', 'nome', v_nome);
    end if;
    v_nomes := v_nomes || v_nome;
    if lower(v_nome) = 'outros' then v_tem_outros := true; end if;
  end loop;

  delete from public.categorias where restaurante_id = v_rest and publico = v_pub;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_nome := btrim(regexp_replace(coalesce(v_item->>'nome', ''), '\s+', ' ', 'g'));
    continue when lower(v_nome) = 'outros';
    v_ordem := v_ordem + 1;
    insert into public.categorias (restaurante_id, publico, nome, descricao, cor, icone, ativa, ordem)
    values (v_rest, v_pub, v_nome, nullif(btrim(coalesce(v_item->>'descricao', '')), ''),
            left(nullif(v_item->>'cor', ''), 40), left(nullif(v_item->>'icone', ''), 40),
            coalesce((v_item->>'ativa')::boolean, true), v_ordem);
  end loop;
  -- "Outros" sempre no fim e ligada (mantém a descrição e a cor que vieram).
  select e into v_item from jsonb_array_elements(p_itens) e where lower(btrim(e->>'nome')) = 'outros' limit 1;
  insert into public.categorias (restaurante_id, publico, nome, descricao, cor, icone, ativa, ordem)
  values (v_rest, v_pub, 'Outros',
          coalesce(nullif(btrim(coalesce(v_item->>'descricao', '')), ''), 'o que não se encaixa em nenhuma outra'),
          coalesce(left(nullif(v_item->>'cor', ''), 40), 'Outros'), left(nullif(v_item->>'icone', ''), 40), true, 999);

  return jsonb_build_object('ok', true, 'outros_incluida', not v_tem_outros);
end;
$$;

-- Voltar ao padrão: apaga a lista da conta (o padrão volta a valer).
create or replace function public.restaurar_categorias(p_publico text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rest bigint;
begin
  select r.id into v_rest from public.restaurantes r where r.auth_user_id = auth.uid();
  if v_rest is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_conta');
  end if;
  delete from public.categorias where restaurante_id = v_rest and publico = case when p_publico = 'equipe' then 'equipe' else 'cliente' end;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.categorias_padrao(text) from public;
grant execute on function public.categorias_padrao(text) to authenticated, service_role;
revoke all on function public.categorias_pode_ver(bigint) from public, anon;
grant execute on function public.categorias_pode_ver(bigint) to authenticated, service_role;
revoke all on function public.categorias_da_conta(bigint, text) from public, anon;
grant execute on function public.categorias_da_conta(bigint, text) to authenticated, service_role;
revoke all on function public.minhas_categorias() from public, anon;
grant execute on function public.minhas_categorias() to authenticated;
revoke all on function public.salvar_categorias(text, jsonb) from public, anon;
grant execute on function public.salvar_categorias(text, jsonb) to authenticated;
revoke all on function public.restaurar_categorias(text) from public, anon;
grant execute on function public.restaurar_categorias(text) to authenticated;

notify pgrst, 'reload schema';
