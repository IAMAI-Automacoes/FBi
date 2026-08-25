-- Identidade estável de contato — a base do motor de resposta a feedbacks.
--
-- Até aqui o cliente não existia como entidade: era uma string de telefone
-- solta em feedbacks_originais.telefone_cliente e feedbacks_restaurante.
-- Sem tabela, sem unique, sem índice, sem opt-out. Isso funciona para exibir
-- um feedback, mas não para PERGUNTAR "o que essa pessoa está esperando
-- receber?" — que é a pergunta central do motor.
--
-- O par (restaurante_id, telefone) é a chave, não o telefone sozinho: o mesmo
-- número aparece hoje em dois restaurantes diferentes (5511987650003 está nos
-- restaurantes 11 e 12). Filas independentes por restaurante, como manda o SPEC.
--
-- Formato: o n8n já entrega o telefone limpo (chatid.split('@')[0]), e os 63
-- registros existentes estão todos em 55DDNNNNNNNNN — 13 dígitos, sem '+' e
-- sem sufixo. A normalização abaixo repete essa limpeza no banco para que uma
-- futura troca de gateway não envenene a tabela.

create table if not exists public.contatos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  telefone       text   not null,
  nome           text,
  -- Opt-out (SPEC, Parte E). Marcado à mão por enquanto: com a base atual de
  -- teste não se justifica mexer no workflow de entrada do n8n só para
  -- detectar "PARAR". Quando preenchido, o worker cancela a fila do contato.
  opt_out_em     timestamptz,
  created_at     timestamptz not null default now(),
  constraint contatos_telefone_digitos check (telefone ~ '^[0-9]{10,15}$')
);

create unique index if not exists contatos_restaurante_telefone
  on public.contatos (restaurante_id, telefone);

alter table public.feedbacks_originais
  add column if not exists contato_id uuid references public.contatos(id) on delete set null;

create index if not exists idx_feedbacks_originais_contato
  on public.feedbacks_originais (contato_id);

-- Mesma limpeza que o n8n faz, e um pouco mais: corta o sufixo do JID
-- (@s.whatsapp.net), remove qualquer caractere não numérico (+, espaço, hífen,
-- parênteses) e devolve NULL para string vazia.
create or replace function public.normalizar_telefone(p text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(split_part(coalesce(p, ''), '@', 1), '[^0-9]', '', 'g'), '');
$$;

-- Resolve o contato no INSERT do feedback, do lado do banco.
--
-- Poderia ser um nó a mais no n8n, mas ficaria preso àquele workflow: qualquer
-- outra origem de feedback (formulário, importação, outro gateway) nasceria sem
-- contato. No banco vale para todas. E o workflow de entrada, que hoje funciona,
-- não precisa ser tocado.
create or replace function public.resolver_contato_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_id  uuid;
begin
  -- Já veio resolvido (backfill, importação): respeita.
  if new.contato_id is not null then
    return new;
  end if;

  v_tel := public.normalizar_telefone(new.telefone_cliente);

  -- Sem telefone utilizável ou sem tenant não há contato a criar. O feedback
  -- entra mesmo assim — perder o feedback seria pior que ficar sem contato.
  if v_tel is null or new.restaurante_id is null then
    return new;
  end if;

  -- O DO UPDATE (em vez de DO NOTHING) é o que garante o RETURNING: com
  -- DO NOTHING o conflito não devolve linha e o contato_id ficaria nulo.
  insert into public.contatos (restaurante_id, telefone)
  values (new.restaurante_id, v_tel)
  on conflict (restaurante_id, telefone)
    do update set telefone = excluded.telefone
  returning id into v_id;

  new.contato_id := v_id;
  -- Normaliza também na origem: a coluna passa a ter sempre o mesmo formato
  -- que a tabela de contatos, o que torna qualquer join futuro confiável.
  new.telefone_cliente := v_tel;

  return new;
end;
$$;

drop trigger if exists trg_feedbacks_originais_contato on public.feedbacks_originais;
create trigger trg_feedbacks_originais_contato
  before insert on public.feedbacks_originais
  for each row
  execute function public.resolver_contato_feedback();

-- RLS: mesmo padrão das demais tabelas do projeto (4 policies via
-- get_user_restaurante_id()). Sem USING (true) em lugar nenhum.
alter table public.contatos enable row level security;

drop policy if exists tenant_isolation_select on public.contatos;
create policy tenant_isolation_select on public.contatos
  for select using (restaurante_id = public.get_user_restaurante_id());

drop policy if exists tenant_isolation_insert on public.contatos;
create policy tenant_isolation_insert on public.contatos
  for insert with check (restaurante_id = public.get_user_restaurante_id());

drop policy if exists tenant_isolation_update on public.contatos;
create policy tenant_isolation_update on public.contatos
  for update using (restaurante_id = public.get_user_restaurante_id())
           with check (restaurante_id = public.get_user_restaurante_id());

drop policy if exists tenant_isolation_delete on public.contatos;
create policy tenant_isolation_delete on public.contatos
  for delete using (restaurante_id = public.get_user_restaurante_id());

-- Backfill dos feedbacks existentes.
--
-- Isto é DADO HISTÓRICO, não base de envio: a base atual é de teste e nenhum
-- cliente antigo recebe mensagem (o motor só age sobre transições posteriores
-- ao go-live). O objetivo é só não deixar contato_id nulo no que já existe.
insert into public.contatos (restaurante_id, telefone)
select distinct fo.restaurante_id, public.normalizar_telefone(fo.telefone_cliente)
from public.feedbacks_originais fo
where fo.restaurante_id is not null
  and public.normalizar_telefone(fo.telefone_cliente) is not null
on conflict (restaurante_id, telefone) do nothing;

update public.feedbacks_originais fo
set contato_id = c.id,
    telefone_cliente = c.telefone
from public.contatos c
where c.restaurante_id = fo.restaurante_id
  and c.telefone = public.normalizar_telefone(fo.telefone_cliente)
  and fo.contato_id is null;
