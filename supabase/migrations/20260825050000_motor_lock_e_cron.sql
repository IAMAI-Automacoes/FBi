-- Lock por contato e agendamento do worker.
--
-- Sobre o lock: a escolha óbvia seria `pg_try_advisory_xact_lock`, mas ele não
-- serve aqui. O worker é uma edge function que fala com o banco via PostgREST,
-- e cada chamada é a sua própria transação — o lock cairia no fim da RPC, muito
-- antes de a mensagem ser montada e entregue ao n8n. A janela em que duas
-- execuções poderiam se sobrepor é exatamente essa.
--
-- Então o lock é uma linha, com dono e validade. Fica em `janela_contato`, que
-- já é uma linha por contato — não precisa de tabela nova.
--
-- A validade (lease) é o que impede um worker morto de travar o contato para
-- sempre: se a função morrer no meio, o lock expira sozinho e o próximo tick
-- assume. 10 minutos cobre com folga o pior caso (LLM lento + n8n lento) e
-- ainda é menor que o intervalo em que qualquer atraso seria perceptível.

alter table public.janela_contato
  add column if not exists lock_ate   timestamptz,
  add column if not exists lock_dono  uuid;

-- Tenta tomar o lock do contato. Devolve o token de posse, ou NULL se outro
-- worker o detém.
--
-- Cria a linha se ainda não existe: `janela_contato` nasce no primeiro
-- processamento do contato, não no backfill (a base atual é de teste e não há
-- ninguém para represar).
create or replace function public.motor_tomar_lock_contato(
  p_contato_id     uuid,
  p_restaurante_id bigint,
  p_segundos       int default 600
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_token uuid := gen_random_uuid();
  v_ok    boolean;
begin
  insert into public.janela_contato (contato_id, restaurante_id, lock_ate, lock_dono)
  values (p_contato_id, p_restaurante_id, now() + make_interval(secs => p_segundos), v_token)
  on conflict (contato_id) do update
    set lock_ate  = now() + make_interval(secs => p_segundos),
        lock_dono = v_token
    -- Só toma se ninguém detém, ou se o lock do outro já venceu.
    where public.janela_contato.lock_ate is null
       or public.janela_contato.lock_ate < now()
  returning true into v_ok;

  if v_ok is null then
    return null;  -- ocupado
  end if;
  return v_token;
end;
$fn$;

-- Libera o lock, mas só se ainda for nosso: um worker lento cujo lease venceu
-- não pode roubar o lock de quem assumiu depois dele.
create or replace function public.motor_soltar_lock_contato(
  p_contato_id uuid,
  p_token      uuid
)
returns void
language sql
security definer
set search_path = public
as $fn$
  update public.janela_contato
     set lock_ate = null, lock_dono = null
   where contato_id = p_contato_id
     and lock_dono  = p_token;
$fn$;

-- Confirmação do envio, em uma transação só.
--
-- Precisa ser atômico: marcar os avisos como enviados sem avançar o cooldown
-- deixaria o contato liberado para receber outra mensagem na hora seguinte
-- (violando I1); avançar o cooldown sem marcar os avisos os faria sair de novo
-- na próxima janela (violando I6). Ou os dois, ou nenhum.
create or replace function public.motor_confirmar_envio(
  p_mensagem_id uuid,
  p_provider_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_contato uuid;
begin
  update public.mensagem_enviada
     set status              = 'enviado',
         enviado_em          = now(),
         provider_message_id = coalesce(p_provider_id, provider_message_id)
   where id = p_mensagem_id
     -- Idempotente: um callback repetido (retry de rede do n8n) não faz nada.
     and status = 'enviando'
  returning contato_id into v_contato;

  if v_contato is null then
    return;
  end if;

  update public.aviso_pendente
     set status = 'enviado'
   where mensagem_id = p_mensagem_id
     and status = 'na_fila';

  -- UPSERT, não UPDATE. A linha de janela normalmente já existe (nasce ao
  -- tomar o lock), mas um UPDATE puro falharia silenciosamente se não
  -- existisse — e o cooldown nunca avançaria, deixando a pessoa receber outra
  -- mensagem na janela seguinte. Isso quebraria I1 sem erro nenhum aparecendo.
  insert into public.janela_contato (contato_id, restaurante_id, ultimo_envio_em)
  select v_contato, m.restaurante_id, now()
    from public.mensagem_enviada m
   where m.id = p_mensagem_id
  on conflict (contato_id) do update
    set ultimo_envio_em = now(),
        lock_ate        = null,
        lock_dono       = null;
end;
$fn$;

-- Falha no envio: devolve os avisos para a fila e NÃO avança o cooldown.
--
-- É o que garante I3 ("nenhum aviso é descartado silenciosamente"): se o n8n
-- ou o provedor falharem, a pessoa recebe na próxima janela, com a fila
-- inteira. Perder a mensagem seria pior que atrasá-la.
create or replace function public.motor_falhar_envio(
  p_mensagem_id uuid,
  p_codigo      text default null,
  p_mensagem    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_contato uuid;
begin
  update public.mensagem_enviada
     set status       = 'falhou',
         erro_codigo  = p_codigo,
         erro_mensagem = left(coalesce(p_mensagem, ''), 500)
   where id = p_mensagem_id
     and status = 'enviando'
  returning contato_id into v_contato;

  if v_contato is null then
    return;
  end if;

  update public.aviso_pendente
     set mensagem_id = null
   where mensagem_id = p_mensagem_id
     and status = 'na_fila';

  update public.janela_contato
     set lock_ate = null, lock_dono = null
   where contato_id = v_contato;
end;
$fn$;

-- Tick do worker: a cada 5 minutos.
--
-- Mesmo formato dos 4 jobs que já rodam neste projeto (pg_cron -> pg_net ->
-- edge function). Dois headers são obrigatórios e por motivos diferentes:
--   Authorization  -> exigido pelo gateway das edge functions, antes de a
--                     requisição chegar ao código da função;
--   x-cron-secret  -> exigido pela própria função, para que só o cron possa
--                     disparar a fila de todos os restaurantes.
--
-- Os segredos ficam embutidos no comando, como nos jobs existentes. O ideal
-- seria `current_setting('app.settings.*')`, mas definir esses parâmetros exige
-- privilégio que o projeto não concede (ALTER DATABASE ... SET é negado).
-- Quem consultar cron.job consegue lê-los — vale trocá-los se vazarem.
select cron.unschedule('motor-retorno-worker')
where exists (select 1 from cron.job where jobname = 'motor-retorno-worker');

select cron.schedule(
  'motor-retorno-worker',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/motor-retorno-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM',
      'x-cron-secret', 'bb19a03ea39073963c3b948c345de4e39adf4939a0f9dc2d'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
