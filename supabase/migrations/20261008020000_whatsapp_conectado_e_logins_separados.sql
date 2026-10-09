-- 1) WhatsApp conectado DE VERDADE.
--
-- Até aqui a tela usava sinais indiretos: `whatsapp_token` (a instância existe)
-- ou `numero_whatsapp` (gravado na conexão, limpo no "desconectar"). Nenhum dos
-- dois percebe quando o WhatsApp cai pelo celular (aparelho removido em
-- "Aparelhos conectados"). Agora a função whatsapp-instancia grava o estado que
-- a uazapi informa, sempre que confere, e uma rotina confere todos a cada 5 min.
-- A tela WhatsApp (dono e admin) só mostra as conversas com `whatsapp_conectado`.

alter table public.restaurantes
  add column if not exists whatsapp_conectado boolean not null default false,
  add column if not exists whatsapp_status_em timestamptz;

-- Ponto de partida até a primeira conferência (a rotina corrige em minutos).
update public.restaurantes
   set whatsapp_conectado = (whatsapp_token is not null and numero_whatsapp is not null)
 where whatsapp_conectado is distinct from (whatsapp_token is not null and numero_whatsapp is not null);

select cron.unschedule('whatsapp-verificar-conexoes')
 where exists (select 1 from cron.job where jobname = 'whatsapp-verificar-conexoes');

select cron.schedule(
  'whatsapp-verificar-conexoes',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/whatsapp-instancia',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM',
        'x-cron-secret', (select valor from public.integracao_config where chave = 'PUSH_TRIGGER_SECRET')
      ),
      body := '{"action": "verificar_todos"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

-- 2) EasyFeed normal e EasyFeed Influencers não compartilham login.
--
-- Cada área já guarda a sessão separada no navegador. Mas o Supabase tem uma
-- conta por e-mail: se o mesmo e-mail fosse de um restaurante E de um
-- influencer, a senha seria a mesma nos dois. Então o mesmo e-mail não pode
-- ser das duas coisas.

create or replace function public.influenciador_nao_pode_ser_restaurante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from auth.users u
      join public.restaurantes r on r.auth_user_id = u.id
     where lower(u.email) = new.email
  ) then
    raise exception 'EMAIL_DE_RESTAURANTE: esse e-mail já é de uma conta de restaurante do EasyFeed.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_influenciador_nao_pode_ser_restaurante on public.influenciadores;
create trigger trg_influenciador_nao_pode_ser_restaurante
  before insert or update of email on public.influenciadores
  for each row execute function public.influenciador_nao_pode_ser_restaurante();

create or replace function public.restaurante_nao_pode_ser_influenciador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from auth.users u
      join public.influenciadores i on i.email = lower(u.email)
     where u.id = new.auth_user_id
  ) then
    raise exception 'EMAIL_DE_INFLUENCER: esse e-mail é de um parceiro do EasyFeed Influencers.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restaurante_nao_pode_ser_influenciador on public.restaurantes;
create trigger trg_restaurante_nao_pode_ser_influenciador
  before insert on public.restaurantes
  for each row execute function public.restaurante_nao_pode_ser_influenciador();
