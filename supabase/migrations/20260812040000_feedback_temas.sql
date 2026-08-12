-- Agrupamento de feedbacks semelhantes em TEMAS (ex.: "Comida fria", "Som alto"),
-- com contagem de quantas pessoas falaram de cada. Mostrado em Visão Geral.
--
-- Como funciona: quando um feedback separado é inserido em feedbacks_restaurante,
-- um trigger dispara (async, via pg_net) a edge function `classificar-feedback`,
-- que pergunta pra IA se o feedback é de um tema JÁ EXISTENTE ou de um tema novo,
-- e grava o vínculo (tema_id) + a contagem. Classificar um feedback novo não
-- remexe os antigos → agrupamento estável e específico. O dashboard escuta esta
-- tabela por Realtime e atualiza sozinho.

create table if not exists public.feedback_temas (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id bigint references public.restaurantes(id) on delete cascade,
  rotulo         text not null,                       -- "Comida fria", "Atendimento simpático"
  tipo           text not null default 'reclamacao',  -- elogio | reclamacao | neutro
  quantidade     int  not null default 0,             -- quantas pessoas falaram
  atualizado_em  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

alter table public.feedback_temas enable row level security;

-- App só LÊ (isolado por restaurante). A escrita é feita pela edge function com
-- service_role, que passa por cima da RLS.
create policy tenant_isolation_select on public.feedback_temas
  for select to authenticated using (restaurante_id = get_user_restaurante_id());

create index if not exists idx_feedback_temas_restaurante
  on public.feedback_temas (restaurante_id, quantidade desc);

-- Vínculo do feedback separado com o tema dele.
alter table public.feedbacks_restaurante
  add column if not exists tema_id uuid references public.feedback_temas(id) on delete set null;
create index if not exists idx_feedbacks_tema on public.feedbacks_restaurante (tema_id);

-- Realtime: dashboard recebe mudanças de tema na hora, sem recarregar a página.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback_temas'
  ) then
    alter publication supabase_realtime add table public.feedback_temas;
  end if;
end $$;

-- Dispara a classificação automática a cada feedback separado que chega.
create or replace function public.trg_classificar_feedback()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/classificar-feedback',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM"}'::jsonb,
    body := jsonb_build_object('feedback_id', new.id)
  );
  return null;
end;
$$;

drop trigger if exists trg_feedbacks_classificar on public.feedbacks_restaurante;
create trigger trg_feedbacks_classificar
  after insert on public.feedbacks_restaurante
  for each row execute function public.trg_classificar_feedback();
