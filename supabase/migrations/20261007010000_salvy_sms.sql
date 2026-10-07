-- SMS recebidos pelos números virtuais da Salvy (webhook sms.received).
--
-- Quem grava é a função salvy-webhook (chave de serviço, passa por cima da
-- RLS). Quem lê é só o admin da plataforma: é ele quem conecta os números ao
-- WhatsApp oficial e precisa ver o código que a Meta mandou por SMS.

create table if not exists public.salvy_sms (
  -- ID da mensagem na Salvy: a mesma entrega repetida não duplica a linha.
  id text primary key,
  -- phoneAccountId da Salvy (a linha/número virtual).
  linha_id text not null,
  -- Número virtual que recebeu, em E.164 (+5541963475701).
  numero text not null,
  origem text not null default '',
  mensagem text not null default '',
  -- Código do WhatsApp, quando o SMS é do WhatsApp (detecção da Salvy ou do texto).
  codigo_whatsapp text,
  deteccoes jsonb not null default '{}'::jsonb,
  recebido_em timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_salvy_sms_numero on public.salvy_sms (numero, recebido_em desc);

alter table public.salvy_sms enable row level security;

drop policy if exists salvy_sms_admin_le on public.salvy_sms;
create policy salvy_sms_admin_le on public.salvy_sms
  for select
  using (exists (select 1 from public.platform_admins where platform_admins.email = auth.email()));

-- Tempo real: a tela mostra o código no instante em que o SMS chega.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'salvy_sms'
  ) then
    alter publication supabase_realtime add table public.salvy_sms;
  end if;
end $$;
