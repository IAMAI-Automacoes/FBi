-- Equipe: o pedido automático vira REGRAS, e pode ter mais de uma.
--
-- Pedido do Raver (14/10/2026): na aba "Pedidos de feedback" de Funcionários,
-- um botão para criar regras de pedido (pode ser mais de uma) e, embaixo, a
-- lista dos últimos pedidos. Cada regra escolhe AS PESSOAS que recebem (uma a
-- uma: quem for cadastrado depois não entra sozinho).
--
-- Cada regra tem a própria pergunta, frequência (toda semana, a cada 15 dias ou
-- todo mês, com o dia) e próxima data. Quem cria o pedido quando a data chega
-- continua sendo a rotina de minuto em minuto (função equipe, ação tick), e o
-- pedido criado guarda de qual regra veio (`equipe_envios.regra_id`).
--
-- `equipe_automatico` (uma regra por conta) deixa de ser usada. As linhas que
-- existirem viram regras para os funcionários ativos daquela conta.
--
-- Pode rodar mais de uma vez.

create table if not exists public.equipe_regras_pedido (
  id             bigint generated always as identity primary key,
  restaurante_id bigint not null references public.restaurantes (id) on delete cascade,
  -- Um nome curto para o dono se achar ("Cozinha, toda semana"). Pode ficar vazio.
  nome           text not null default '' check (char_length(nome) <= 60),
  ativo          boolean not null default true,
  cada_dias      integer not null check (cada_dias in (7, 14, 30)),
  -- Só no mensal: o dia do mês (1 = começo do mês).
  dia_do_mes     smallint check (dia_do_mes is null or dia_do_mes between 1 and 31),
  -- Os mesmos limites de validarPergunta (PERGUNTA_MIN e PERGUNTA_MAX em _shared/equipe.ts).
  pergunta       text not null check (char_length(btrim(pergunta)) between 10 and 400),
  -- Quem recebe: ids de equipe_funcionarios. Quem foi apagado ou desativado é
  -- pulado na hora de mandar.
  funcionarios   bigint[] not null default '{}',
  proximo_em     timestamptz,
  ultimo_em      timestamptz,
  ultimo_erro    text,
  criado_em      timestamptz not null default now(),
  atualizado_por text,
  atualizado_em  timestamptz not null default now()
);
create index if not exists equipe_regras_pedido_conta_idx on public.equipe_regras_pedido (restaurante_id, criado_em);
create index if not exists equipe_regras_pedido_vencidas_idx on public.equipe_regras_pedido (proximo_em) where ativo;

-- Ninguém lê nem grava direto: só a função equipe (chave de serviço).
alter table public.equipe_regras_pedido enable row level security;
revoke all on public.equipe_regras_pedido from anon, authenticated;

alter table public.equipe_envios
  add column if not exists regra_id bigint references public.equipe_regras_pedido (id) on delete set null;

comment on table public.equipe_regras_pedido is
  'Regras de pedido automático de feedback da equipe (várias por conta). Cada uma: pergunta, frequência, pessoas e próxima data. Só a função equipe mexe.';

-- O que existia na tabela antiga vira regra (uma vez só).
insert into public.equipe_regras_pedido (restaurante_id, nome, ativo, cada_dias, dia_do_mes, pergunta, funcionarios, proximo_em, ultimo_em, ultimo_erro, atualizado_por)
select a.restaurante_id, '', a.ativo, a.cada_dias, a.dia_do_mes, a.pergunta,
       coalesce((select array_agg(f.id order by f.nome) from public.equipe_funcionarios f where f.restaurante_id = a.restaurante_id and f.ativo), '{}'),
       a.proximo_em, a.ultimo_em, a.ultimo_erro, a.atualizado_por
  from public.equipe_automatico a
 where not exists (select 1 from public.equipe_regras_pedido r where r.restaurante_id = a.restaurante_id);

comment on table public.equipe_automatico is
  'NÃO É MAIS USADA (20261022000000): o pedido automático virou equipe_regras_pedido, com várias regras por conta.';
