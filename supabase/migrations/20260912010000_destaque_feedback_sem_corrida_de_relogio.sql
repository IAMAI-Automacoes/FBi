-- O negrito dos feedbacks tinha parado de sair: 70 dos 72 feedbacks com texto
-- estavam sem `texto_destacado`, e nenhum dos 12 da semana tinha ganhado
-- destaque.
--
-- Não era a IA nem a validação — as duas funcionam quando chamadas à mão. Era
-- relógio. `net.http_post` desliga a conexão aos 5 segundos por padrão, e o
-- trigger não mudava isso. A edge function precisa ir até a IA e voltar: 1,6 a
-- 2,1 s com o isolate quente, mas os feedbacks chegam esparsos, então quase
-- toda invocação pega a função FRIA — e subir o isolate mais a ida à IA passa
-- dos 5 s. O pg_net cortava antes de o destaque ser gravado, e como o trigger
-- não olha a resposta, a falha era invisível.
--
-- A função agora responde 202 na hora e termina em segundo plano
-- (`EdgeRuntime.waitUntil`), então o relógio deixou de importar. O timeout
-- maior aqui é cinto de segurança.

create or replace function public.trg_destacar_feedback()
returns trigger
language plpgsql
security definer
as $function$
begin
  perform net.http_post(
    url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/destacar-feedback',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM"}'::jsonb,
    body := jsonb_build_object('original_id', new.id),
    timeout_milliseconds := 30000
  );
  return null;
end;
$function$;

-- O feedback também pode chegar SEM o texto e ganhá-lo logo depois. O trigger
-- só existia no INSERT, então nesses casos ninguém voltava para destacar.
create or replace function public.trg_destacar_feedback_update()
returns trigger
language plpgsql
security definer
as $function$
begin
  -- Só quando o texto APARECE e ainda não há destaque. Sem esta guarda, a
  -- própria gravação do destaque dispararia o trigger de novo, em laço.
  if new.texto_original is distinct from old.texto_original
     and new.texto_original is not null
     and new.texto_destacado is null then
    perform net.http_post(
      url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/destacar-feedback',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM"}'::jsonb,
      body := jsonb_build_object('original_id', new.id),
      timeout_milliseconds := 30000
    );
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_feedbacks_originais_destacar_update on public.feedbacks_originais;
create trigger trg_feedbacks_originais_destacar_update
after update of texto_original on public.feedbacks_originais
for each row execute function public.trg_destacar_feedback_update();

-- Rede de segurança: varre de hora em hora quem ficou sem negrito e tenta de
-- novo. O disparo no insert é o caminho normal; isto existe porque nenhum
-- disparo assíncrono acerta 100% das vezes — e sem a varredura um feedback
-- perdido ficava perdido para sempre, que foi como 70 deles se acumularam.
-- Aos :40 para não competir com a geração de insights, que roda aos :00.
select cron.schedule(
  'destacar-feedbacks-pendentes',
  '40 * * * *',
  $$
  select net.http_post(
    url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/destacar-feedback',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM"}'::jsonb,
    body := jsonb_build_object('lote', 15),
    timeout_milliseconds := 120000
  );
  $$
);
