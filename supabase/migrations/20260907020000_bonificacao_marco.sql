-- Aviso ao GARÇOM quando ele cruza um marco (%) da meta de aberturas de uma
-- regra de bonificação — mesmo espírito do `alerta_urgente`, adaptado pra
-- progresso em vez de gravidade.
--
-- ## O dedup também é do banco, não do código
--
-- Duas aberturas de QR do mesmo garçom podem chegar quase juntas (duas mesas
-- escaneando ao mesmo tempo). Se as duas contagens caírem no mesmo marco, as
-- duas tentariam avisar. A UNIQUE abaixo — por garçom, por regra, por
-- período, por marco — é a única barreira que resolve de verdade: quem
-- perder a corrida do INSERT recebe conflito do Postgres e desiste.
--
-- `periodo_inicio` entra na chave porque quando o período renova (regra
-- `renovar_automatico`), os marcos precisam poder disparar de novo — é uma
-- rodada nova de progresso, não a mesma.

create table if not exists public.bonificacao_marco (
  id bigint generated always as identity primary key,
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  garcom_id bigint not null references public.garcons(id) on delete cascade,
  -- Não é FK: a regra vive dentro de `restaurantes.config_bonificacao` (jsonb),
  -- não numa tabela própria. É o `id` (uuid) que a tela já gera pra cada regra.
  regra_id text not null,
  periodo_inicio timestamptz not null,
  marco smallint not null check (marco > 0 and marco <= 100),
  enviado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  unique (garcom_id, regra_id, periodo_inicio, marco)
);

create index if not exists idx_bonificacao_marco_restaurante
  on public.bonificacao_marco (restaurante_id, created_at desc);

alter table public.bonificacao_marco enable row level security;

-- Só leitura para o dono: quem escreve é a edge function, com a chave de
-- serviço — mesmo padrão de `alerta_urgente`.
drop policy if exists tenant_isolation_select on public.bonificacao_marco;
create policy tenant_isolation_select on public.bonificacao_marco
  for select using (restaurante_id = public.get_user_restaurante_id());
