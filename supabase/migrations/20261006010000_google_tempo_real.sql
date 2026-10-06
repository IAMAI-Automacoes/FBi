-- Avaliações do Google mais perto do tempo real.
--
-- O cron passa de 6 em 6 horas para de 2 em 2 minutos. Cada rodada faz a
-- leitura RÁPIDA (só o que foi criado ou editado desde a última leitura —
-- quase sempre uma chamada por restaurante) e, uma vez por dia, a COMPLETA
-- (o histórico inteiro, que renova a cópia temporária e tira o que foi
-- apagado no Google). `ultima_completa` marca quando foi a última completa.

alter table public.google_conexoes add column if not exists ultima_completa timestamptz;

do $$ begin perform cron.unschedule('google-sincronizar'); exception when others then null; end $$;
select cron.schedule(
  'google-sincronizar',
  '*/2 * * * *',
  $cron$
    select net.http_post(
      url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/google-perfil',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM',
        'x-cron-secret', (select valor from public.integracao_config where chave = 'PUSH_TRIGGER_SECRET')
      ),
      body := '{"acao": "sincronizar_todos"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
