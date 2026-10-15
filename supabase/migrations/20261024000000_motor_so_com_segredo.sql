-- Segurança do motor: os gatilhos e as rotinas do banco passam a provar quem são.
--
-- Antes, os gatilhos `trg_classificar_feedback`, `trg_destacar_feedback`,
-- `trg_destacar_feedback_update` e `retriar_feedbacks_pendentes`, e as rotinas
-- `atualizar_banner_diario` e `destacar-feedbacks-pendentes`, chamavam o motor
-- só com a chave PÚBLICA do site. Como as funções não conferiam quem chamava,
-- qualquer pessoa com essa chave (ela vai dentro do site) disparava IA paga
-- em qualquer conta.
--
-- Agora o banco manda também `x-cron-secret`, lido na hora de
-- `integracao_config.PUSH_TRIGGER_SECRET` (só o servidor lê: RLS sem
-- políticas). As funções `classificar-feedback`, `vincular-feedback`,
-- `destacar-feedback` e `atualizar-banner` aceitam esse segredo, a chave de
-- serviço, ou o dono/admin da conta logado (`_shared/quem-chama.ts`).
-- A chave pública continua no cabeçalho só para passar no portão da Supabase
-- (verify_jwt): sozinha, ela não abre mais nada.
--
-- Os corpos abaixo são os que estavam no ar, só com o cabeçalho trocado.
-- Pode rodar mais de uma vez.

create or replace function public.motor_cabecalhos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'Content-Type', 'application/json',
    -- A chave pública do site (a mesma de src/lib/supabase/client.ts).
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM',
    'x-cron-secret', coalesce((select c.valor from public.integracao_config c where c.chave = 'PUSH_TRIGGER_SECRET'), '')
  )
$$;
-- Só o banco usa (gatilhos e rotinas): ninguém de fora lê o segredo por aqui.
revoke all on function public.motor_cabecalhos() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.retriar_feedbacks_pendentes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
begin
  update public.feedbacks_restaurante
     set triado_em = now()
   where triado_em is null
     and created_at < now() - interval '120 minutes';

  for r in
    select id from public.feedbacks_restaurante
     where triado_em is null
       and created_at < now() - interval '5 minutes'
     order by created_at
     limit 20
  loop
    perform net.http_post(
      url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/vincular-feedback',
      headers := public.motor_cabecalhos(),
      body := jsonb_build_object('feedback_id', r.id),
      timeout_milliseconds := 60000
    );
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_classificar_feedback()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  perform net.http_post(
    url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/classificar-feedback',
    headers := public.motor_cabecalhos(),
    body := jsonb_build_object('feedback_id', new.id)
  );
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_destacar_feedback()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  perform net.http_post(
    url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/destacar-feedback',
    headers := public.motor_cabecalhos(),
    body := jsonb_build_object('original_id', new.id),
    timeout_milliseconds := 30000
  );
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_destacar_feedback_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Só quando o texto APARECE e ainda não há destaque. Sem esta guarda, a
  -- própria gravação do destaque dispararia o trigger de novo, em laço.
  if new.texto_original is distinct from old.texto_original
     and new.texto_original is not null
     and new.texto_destacado is null then
    perform net.http_post(
      url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/destacar-feedback',
      headers := public.motor_cabecalhos(),
      body := jsonb_build_object('original_id', new.id),
      timeout_milliseconds := 30000
    );
  end if;
  return null;
end;
$function$;

select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'atualizar_banner_diario'), command := $cmd$SELECT net.http_post(
        url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/atualizar-banner',
        headers := public.motor_cabecalhos(),
        body := '{"process_all": true, "force": false}'::jsonb
      );$cmd$);
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'destacar-feedbacks-pendentes'), command := $cmd$
  select net.http_post(
    url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/destacar-feedback',
    headers := public.motor_cabecalhos(),
    body := jsonb_build_object('lote', 15),
    timeout_milliseconds := 120000
  );
  $cmd$);
