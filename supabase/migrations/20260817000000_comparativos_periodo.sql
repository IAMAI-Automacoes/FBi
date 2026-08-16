-- Comparativo de períodos: o dono escolhe dois intervalos de datas (ex.: "este
-- mês" vs "mês passado", ou datas livres) e vê o que melhorou e o que piorou —
-- satisfação geral, % positivas/negativas e satisfação por categoria.
--
-- O cálculo em si é sempre feito na hora (lendo feedbacks_restaurante), não
-- precisa de tabela pra isso. Esta tabela guarda só as comparações que o dono
-- decide SALVAR (ex.: "Antes e depois da reforma da cozinha"), com um retrato
-- (snapshot) do resultado em JSON — mesmo padrão já usado por `relatorios`
-- (dados_json) para o relatório em PDF.
create table public.comparativos_periodo (
  id uuid primary key default gen_random_uuid(),
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  titulo text,
  periodo_a_inicio timestamptz not null,
  periodo_a_fim timestamptz not null,
  periodo_b_inicio timestamptz not null,
  periodo_b_fim timestamptz not null,
  resultado_json jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.comparativos_periodo is
  'Comparações de período (A = mais recente, B = anterior) salvas pelo dono, com o resultado já calculado em resultado_json.';

create index comparativos_periodo_restaurante_idx
  on public.comparativos_periodo (restaurante_id, created_at desc);

alter table public.comparativos_periodo enable row level security;

-- Mesmo padrão de isolamento das demais tabelas do restaurante.
create policy "dono_le_seus_comparativos"
  on public.comparativos_periodo for select
  using (restaurante_id = public.get_user_restaurante_id());

create policy "dono_cria_seus_comparativos"
  on public.comparativos_periodo for insert
  with check (restaurante_id = public.get_user_restaurante_id());

create policy "dono_apaga_seus_comparativos"
  on public.comparativos_periodo for delete
  using (restaurante_id = public.get_user_restaurante_id());
