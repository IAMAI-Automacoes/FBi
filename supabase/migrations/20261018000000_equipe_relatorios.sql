-- Equipe: os números de participação do relatório da equipe (/equipe/relatorios).
--
-- O relatório da equipe é a mesma tela de Relatórios dos clientes, lendo só o
-- que os funcionários falaram (o endereço /equipe decide, ver publico-rota.ts).
-- O que não dá para tirar das tabelas de feedback é QUEM falou: feedback da
-- equipe não guarda telefone, e `equipe_autorias` ninguém lê pela tela.
--
-- Esta função devolve só CONTAGENS, nunca nome: quantos funcionários falaram,
-- como quiseram aparecer e quantos responderam aos pedidos.
--
-- Equipe pequena: com menos de 5 funcionários ativos, "quantas pessoas falaram"
-- não é devolvido. Numa equipe de 2, saber que "2 falaram" com um feedback
-- identificado entrega de quem é o anônimo.
--
-- Pode rodar mais de uma vez.

create or replace function public.equipe_relatorio_participacao(p_desde timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rid     bigint;
  v_ativos  integer;
  v_minimo  constant integer := 5;
  v_res     jsonb;
begin
  if not public.equipe_liberada() then return null; end if;
  v_rid := public.get_user_restaurante_id();
  if v_rid is null then return null; end if;

  select count(*) into v_ativos from public.equipe_funcionarios f where f.restaurante_id = v_rid and f.ativo;

  with aut as (
    select a.funcionario_id, a.identidade
      from public.equipe_autorias a
     where a.restaurante_id = v_rid and a.criado_em >= p_desde
  ), por_pessoa as (
    select funcionario_id, count(*) as n from aut where funcionario_id is not null group by funcionario_id
  ), conv as (
    select c.status, c.respondeu_em
      from public.equipe_convites c
      join public.equipe_envios e on e.id = c.envio_id
     where e.restaurante_id = v_rid and e.tipo = 'pedido' and e.status <> 'cancelado' and e.criado_em >= p_desde
  )
  select jsonb_build_object(
    'ativos',          v_ativos,
    'minimo',          v_minimo,
    -- Nulo = equipe pequena demais para dizer quantas pessoas falaram.
    'falaram',         case when v_ativos >= v_minimo then (select count(*) from por_pessoa) end,
    'mais_de_uma_vez', case when v_ativos >= v_minimo then (select count(*) from por_pessoa where n > 1) end,
    'feedbacks',       (select count(*) from aut),
    'identificados',   (select count(*) from aut where identidade = 'identificado'),
    'anonimos',        (select count(*) from aut where identidade = 'anonimo'),
    'aguardando',      (select count(*) from aut where identidade = 'pendente'),
    'pedidos',         (select count(*) from public.equipe_envios e
                         where e.restaurante_id = v_rid and e.tipo = 'pedido' and e.status <> 'cancelado' and e.criado_em >= p_desde),
    'receberam',       (select count(*) from conv where status = 'enviado'),
    'responderam',     (select count(*) from conv where status = 'enviado' and respondeu_em is not null)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.equipe_relatorio_participacao(timestamptz) from public, anon;
grant execute on function public.equipe_relatorio_participacao(timestamptz) to authenticated, service_role;
