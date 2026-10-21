-- Indicações: a escada de benefícios (decisões do Raver, 17/10/2026).
--
--   - Os benefícios são níveis cadastrados no Admin → Afiliados, por software:
--     "com N indicações, ganha tal coisa". Substituem o desconto de X% por
--     indicado (o afiliado de fora continua com a % em dinheiro).
--   - Uma indicação conta depois que o indicado paga o 2º mês (como antes).
--   - Ao alcançar um nível, nasce o benefício em `indicacao_premios` (um por
--     nível), para o admin aplicar à mão até a cobrança fazer isso sozinha.
--
-- E duas correções: os números da página e do admin vinham de
-- `indicacoes.pagou_em`, que nada preenche desde a troca para o Asaas
-- (nada chama `indicacao_registrar_pagamento`) — todo indicado aparecia como
-- "não assinou". Agora contam pelas mensalidades pagas (`indicacao_meses_pagos`),
-- e os níveis são conferidos sempre que a página ou o admin abrem.

create table if not exists public.indicacao_niveis (
  area text not null check (area in ('restaurante', 'rh')),
  indicacoes integer not null check (indicacoes between 1 and 1000),
  beneficio text not null check (length(btrim(beneficio)) between 1 and 200),
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  primary key (area, indicacoes)
);
alter table public.indicacao_niveis enable row level security;
-- Só o admin mexe; a página lê pela função `indicacao_minha`.
drop policy if exists indicacao_niveis_admin on public.indicacao_niveis;
create policy indicacao_niveis_admin on public.indicacao_niveis
  for all to authenticated
  using (public.indicacao_eh_admin())
  with check (public.indicacao_eh_admin());

-- O exemplo para começar (o Raver edita no admin).
insert into public.indicacao_niveis (area, indicacoes, beneficio)
select a.area, n.indicacoes, n.beneficio
  from (values ('restaurante'), ('rh')) a(area)
 cross join (values
   (1, '10% de desconto na mensalidade'),
   (3, '1 mês grátis'),
   (5, '3 meses grátis'),
   (10, '1 ano grátis')
 ) n(indicacoes, beneficio)
on conflict (area, indicacoes) do nothing;

-- O benefício de um nível: um por conta e nível.
alter table public.indicacao_premios add column if not exists nivel integer;
create unique index if not exists indicacao_premios_nivel on public.indicacao_premios (restaurante_id, nivel) where nivel is not null;

-- Quantas indicações deste afiliado já contam (o indicado pagou o 2º mês).
create or replace function public.indicacao_contam(p_afiliado uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::integer
    from public.indicacoes i
   where i.afiliado_id = p_afiliado
     and public.indicacao_meses_pagos(i.indicado_restaurante_id) >= 2
$$;

-- Libera os níveis que a conta já alcançou (o que já existe fica como está).
create or replace function public.indicacao_liberar_niveis(p_restaurante_id bigint)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_af     public.afiliados%rowtype;
  v_contam integer;
  v_n      integer;
begin
  select * into v_af from public.afiliados a where a.restaurante_id = p_restaurante_id;
  if v_af.id is null or not v_af.ativo then
    return 0;
  end if;
  v_contam := public.indicacao_contam(v_af.id);
  insert into public.indicacao_premios (restaurante_id, nivel, beneficio)
  select p_restaurante_id, n.indicacoes, n.beneficio
    from public.indicacao_niveis n
   where n.area = public.area_da_conta(p_restaurante_id)
     and n.indicacoes <= v_contam
  on conflict (restaurante_id, nivel) where nivel is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.indicacao_contam(uuid) from public, anon, authenticated;
revoke execute on function public.indicacao_liberar_niveis(bigint) from public, anon, authenticated;
grant execute on function public.indicacao_contam(uuid) to service_role;
grant execute on function public.indicacao_liberar_niveis(bigint) to service_role;

-- Quando o pagamento chamar (Asaas): marca que pagou e confere os níveis de quem indicou.
create or replace function public.indicacao_registrar_pagamento(p_restaurante_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ind public.indicacoes%rowtype;
  v_af  public.afiliados%rowtype;
begin
  if p_restaurante_id is null then return null; end if;

  select * into v_ind from public.indicacoes i where i.indicado_restaurante_id = p_restaurante_id for update;
  if not found then return null; end if;

  if v_ind.pagou_em is null then
    update public.indicacoes set pagou_em = now() where indicado_restaurante_id = p_restaurante_id;
  end if;

  -- A indicação só conta depois do 2º mês pago.
  if public.indicacao_meses_pagos(p_restaurante_id) < 2 then return null; end if;

  select * into v_af from public.afiliados a where a.id = v_ind.afiliado_id;
  -- Benefício só para conta EasyFeed que indica (afiliado de fora ganha
  -- comissão em dinheiro), ativa, e nunca para si mesma.
  if not found or v_af.restaurante_id is null or not v_af.ativo or v_af.restaurante_id = p_restaurante_id then
    return null;
  end if;

  -- Desde 17/10/2026 o benefício é por nível (indicacao_niveis), não por indicado.
  perform public.indicacao_liberar_niveis(v_af.restaurante_id);
  return null;
end;
$$;

-- A página Descontos → Indicações.
create or replace function public.indicacao_minha()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid  bigint;
  v_area text;
  v_af   public.afiliados%rowtype;
  v_nome text;
  v_pct  numeric;
begin
  if not public.indicacao_liberada() then
    return jsonb_build_object('liberado', false);
  end if;
  v_rid := public.get_user_restaurante_id();
  if v_rid is null then
    return jsonb_build_object('liberado', true, 'sem_restaurante', true);
  end if;
  v_area := public.area_da_conta(v_rid);

  select * into v_af from public.afiliados a where a.restaurante_id = v_rid;
  if v_af.id is null then
    select r.nome_restaurante into v_nome from public.restaurantes r where r.id = v_rid;
    select c.comissao_padrao into v_pct from public.afiliado_config c where c.area = v_area;
    begin
      insert into public.afiliados (nome, codigo, comissao_tipo, comissao_valor, ativo, restaurante_id, area, observacoes)
      values (coalesce(nullif(btrim(v_nome), ''), 'Conta ' || v_rid), public.indicacao_codigo_novo(v_nome),
              'porcentagem', coalesce(v_pct, 10), true, v_rid, v_area, 'Criado pela página Descontos → Indicações.')
      returning * into v_af;
    exception when unique_violation then
      -- Duas abas ao mesmo tempo: a outra já criou.
      select * into v_af from public.afiliados a where a.restaurante_id = v_rid;
    end;
  end if;

  -- Um nível alcançado desde a última visita vira benefício agora.
  perform public.indicacao_liberar_niveis(v_rid);

  return jsonb_build_object(
    'liberado',    true,
    'area',        v_area,
    'codigo',      v_af.codigo,
    'ativo',       v_af.ativo,
    'porcentagem', coalesce(v_af.comissao_valor, 0),
    'numeros', (
      select jsonb_build_object(
        'entraram',    count(*),
        'nao_pagaram', count(*) filter (where m.meses = 0),
        'a_caminho',   count(*) filter (where m.meses = 1 and r.assinatura_status = 'ativa'),
        'contam',      count(*) filter (where m.meses >= 2),
        'liberados',   (select count(*) from public.indicacao_premios p where p.restaurante_id = v_rid and p.status <> 'cancelado'))
        from public.indicacoes i
        left join public.restaurantes r on r.id = i.indicado_restaurante_id
       cross join lateral (select public.indicacao_meses_pagos(i.indicado_restaurante_id) as meses) m
       where i.afiliado_id = v_af.id),
    -- A escada do software, com o que a conta já ganhou em cada nível (e um
    -- nível ganho que o admin tirou da escada continua aparecendo).
    'niveis', coalesce((
      select jsonb_agg(jsonb_build_object(
               'indicacoes',  coalesce(n.indicacoes, p.nivel),
               'beneficio',   coalesce(p.beneficio, n.beneficio),
               'status',      p.status,
               'liberado_em', p.criado_em,
               'aplicado_em', p.aplicado_em) order by coalesce(n.indicacoes, p.nivel))
        from (select * from public.indicacao_niveis where area = v_area) n
        full join (select * from public.indicacao_premios where restaurante_id = v_rid and nivel is not null) p
          on p.nivel = n.indicacoes), '[]'::jsonb),
    'premios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'beneficio', p.beneficio, 'porcentagem', p.porcentagem, 'status', p.status,
               'criado_em', p.criado_em, 'aplicado_em', p.aplicado_em) order by p.criado_em desc)
        from public.indicacao_premios p
       where p.restaurante_id = v_rid), '[]'::jsonb)
  );
end;
$$;

-- Admin → Afiliados: os números pelas mensalidades pagas, e os níveis
-- conferidos antes (por isso deixa de ser `stable`).
create or replace function public.afiliados_numeros(p_area text)
returns jsonb
language plpgsql
volatile security definer
set search_path = public
as $$
declare
  v_area text := case when p_area = 'rh' then 'rh' else 'restaurante' end;
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  perform public.indicacao_liberar_niveis(a.restaurante_id)
     from public.afiliados a
    where a.restaurante_id is not null and a.area = v_area;
  return coalesce((
    select jsonb_object_agg(a.id, jsonb_build_object(
             'entraram',  (select count(*) from public.indicacoes i where i.afiliado_id = a.id),
             'assinaram', (select count(*) from public.indicacoes i where i.afiliado_id = a.id
                             and public.indicacao_meses_pagos(i.indicado_restaurante_id) >= 1),
             'usam',      (select count(*) from public.indicacoes i join public.restaurantes r on r.id = i.indicado_restaurante_id
                             where i.afiliado_id = a.id and r.assinatura_status = 'ativa'
                               and public.indicacao_meses_pagos(i.indicado_restaurante_id) >= 1),
             'contam',    public.indicacao_contam(a.id),
             'premios',   coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', p.id, 'beneficio', p.beneficio, 'status', p.status, 'criado_em', p.criado_em, 'aplicado_em', p.aplicado_em,
                        'nivel', p.nivel,
                        'indicado', case when p.nivel is not null then null
                                         else coalesce(nullif(btrim(ri.nome_restaurante), ''), 'Conta ' || p.indicado_restaurante_id) end)
                      order by (p.status = 'pendente') desc, p.criado_em desc)
                 from public.indicacao_premios p
                 left join public.restaurantes ri on ri.id = p.indicado_restaurante_id
                where a.restaurante_id is not null and p.restaurante_id = a.restaurante_id), '[]'::jsonb)))
      from public.afiliados a
     where a.area = v_area), '{}'::jsonb);
end;
$$;
