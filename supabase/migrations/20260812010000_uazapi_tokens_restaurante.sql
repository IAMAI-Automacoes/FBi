-- Tokens de conexão da uazapi copiados para cada restaurante, pra o n8n puxar
-- tudo do restaurante numa leitura só.
--
--   whatsapp_token        (já existia) → token da INSTÂNCIA, por número
--   whatsapp_admin_token  (novo)       → admin token GLOBAL, copiado
--   whatsapp_base_url     (novo)       → URL do servidor, copiada
--
-- O admin token e a base_url são GLOBAIS: moram em integracao_config (o lugar de
-- coisas globais) e são copiados pra cada restaurante — na criação (trigger) e
-- sempre que o valor global mudar (trigger). Substitui a view restaurante_uazapi.
--
-- Obs. de segurança: como o dono lê a própria linha no app (RLS + select('*')),
-- estes campos ficam visíveis pra ele também. Decisão consciente — o n8n é
-- interno e só nós usamos. (Se um dia quiser blindar, dá pra revogar a coluna do
-- papel authenticated e trocar o select('*') do use-auth por lista de colunas.)

drop view if exists public.restaurante_uazapi;

alter table public.restaurantes
  add column if not exists whatsapp_admin_token text,
  add column if not exists whatsapp_base_url text;

-- Backfill dos restaurantes que já existem
update public.restaurantes set
  whatsapp_admin_token = (select valor from public.integracao_config where chave = 'UAZAPI_ADMIN_TOKEN'),
  whatsapp_base_url    = (select valor from public.integracao_config where chave = 'UAZAPI_BASE_URL');

-- Novo restaurante já nasce com os globais copiados. SECURITY DEFINER porque
-- integracao_config tem RLS deny-all para o usuário comum — a função (dona:
-- postgres) lê mesmo assim.
create or replace function public.preencher_uazapi_global()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.whatsapp_admin_token is null then
    new.whatsapp_admin_token := (select valor from public.integracao_config where chave = 'UAZAPI_ADMIN_TOKEN');
  end if;
  if new.whatsapp_base_url is null then
    new.whatsapp_base_url := (select valor from public.integracao_config where chave = 'UAZAPI_BASE_URL');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preencher_uazapi_global on public.restaurantes;
create trigger trg_preencher_uazapi_global
  before insert on public.restaurantes
  for each row execute function public.preencher_uazapi_global();

-- Rotacionou o admin token / base_url no lugar global? Propaga pra todos.
create or replace function public.propagar_uazapi_global()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.chave = 'UAZAPI_ADMIN_TOKEN' then
    update public.restaurantes set whatsapp_admin_token = new.valor;
  elsif new.chave = 'UAZAPI_BASE_URL' then
    update public.restaurantes set whatsapp_base_url = new.valor;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_propagar_uazapi_global on public.integracao_config;
create trigger trg_propagar_uazapi_global
  after insert or update on public.integracao_config
  for each row execute function public.propagar_uazapi_global();
