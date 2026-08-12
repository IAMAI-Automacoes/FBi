-- Corrige o disparo automático de sugestão de ações.
--
-- O gatilho contava as ações SUGERIDA da plataforma inteira e chamava a edge
-- function sem informar o restaurante. Com isso, esvaziar a fila de um
-- restaurante não disparava nada enquanto qualquer outro tivesse sugestão
-- pendente, e quando disparava a função escolhia sozinha "o primeiro
-- restaurante ativo" — que podia ser outro.
--
-- Agora a contagem e a chamada são sempre do restaurante da linha alterada.

create or replace function public.trg_check_sugestoes_acoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_restaurante bigint;
  v_url text := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/sugerir-acoes';
  v_headers jsonb;
begin
  if tg_op = 'UPDATE' then
    if not (old.status = 'SUGERIDA' and new.status <> 'SUGERIDA') then
      return null;
    end if;
    v_restaurante := new.restaurante_id;
  elsif tg_op = 'DELETE' then
    if old.status <> 'SUGERIDA' then
      return null;
    end if;
    v_restaurante := old.restaurante_id;
  else
    return null;
  end if;

  if v_restaurante is null then
    return null;
  end if;

  select count(*) into v_count
  from public.acoes_operacionais
  where status = 'SUGERIDA' and restaurante_id = v_restaurante;

  if v_count > 0 then
    return null;
  end if;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.settings.anon_key', true)
  );

  -- Sem a chave configurada, mantém o comportamento anterior de usar o token
  -- embutido; a chamada segue autenticada como anon.
  if current_setting('app.settings.anon_key', true) is null then
    v_headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM"}'::jsonb;
  end if;

  perform net.http_post(
    url := v_url,
    headers := v_headers,
    body := jsonb_build_object(
      'trigger', 'db_empty_queue',
      'restaurante_id', v_restaurante
    )
  );

  return null;
end;
$$;
