-- Reaponta o cron 'expirar-assinaturas' para a edge function, que além de
-- expirar as vencidas (ativa+vencida → cancelada) também DERRUBA a instância da
-- uazapi de quem não está mais ativo (libera o slot pago). Antes o cron só
-- rodava o SQL public.expirar_assinaturas(), que não mexia na instância.
--
-- O segredo (x-cron-secret) é lido do integracao_config na hora que o job roda —
-- não fica escrito no repo/migração.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('expirar-assinaturas'); exception when others then null; end $$;

select cron.schedule(
  'expirar-assinaturas',
  '10 0 * * *',
  $cron$
    select net.http_post(
      url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/expirar-assinaturas',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select valor from public.integracao_config where chave = 'PUSH_TRIGGER_SECRET')
      )
    );
  $cron$
);