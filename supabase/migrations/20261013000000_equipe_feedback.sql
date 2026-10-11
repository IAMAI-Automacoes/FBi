-- Feedback da equipe: o restaurante cadastra os funcionários (nome e número),
-- o sistema pede feedback pelo WhatsApp e analisa o que eles respondem.
--
-- As mensagens saem de um número SÓ DO EASYFEED (não é o WhatsApp do
-- restaurante, que o dono lê inteiro): é o que permite a resposta ser anônima
-- para o dono. O token dessa instância fica em integracao_config
-- (EQUIPE_WHATSAPP_TOKEN, EQUIPE_WHATSAPP_NUMERO, EQUIPE_WEBHOOK_SEGREDO).
--
-- Tudo separado do feedback dos clientes (feedbacks_originais,
-- feedbacks_restaurante, contatos): nada daqui entra nos números, insights,
-- alertas ou no motor de resposta dos clientes.
--
-- Por enquanto só o admin da plataforma usa (menu, rota /equipe e as funções
-- equipe / equipe-webhook). Quem grava envios, convites, mensagens e respostas
-- são as funções (chave de serviço).

-- ---------------------------------------------------------------------------
-- Funcionários
-- ---------------------------------------------------------------------------
create table if not exists public.equipe_funcionarios (
  id              bigint generated always as identity primary key,
  restaurante_id  bigint not null references public.restaurantes(id) on delete cascade,
  nome            text not null check (btrim(nome) <> ''),
  -- "55" + DDD + número, só dígitos (a convenção de src/lib/telefone.ts).
  telefone        text not null check (telefone ~ '^55[0-9]{10,11}$'),
  -- Cargo ou setor (garçom, cozinha, caixa…). Opcional.
  funcao          text not null default '',
  ativo           boolean not null default true,
  -- Respondeu PARAR: não recebe mais pedido de feedback.
  opt_out_em      timestamptz,
  opt_out_motivo  text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- O mesmo WhatsApp (com ou sem o 9) uma vez só por restaurante.
create unique index if not exists equipe_funcionarios_numero
  on public.equipe_funcionarios (restaurante_id, public.telefone_chave(telefone));
create index if not exists equipe_funcionarios_chave
  on public.equipe_funcionarios (public.telefone_chave(telefone));

create or replace function public.equipe_funcionario_arrumar()
returns trigger
language plpgsql
as $$
begin
  new.telefone := public.normalizar_telefone(new.telefone);
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  new.funcao := btrim(coalesce(new.funcao, ''));
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists equipe_funcionarios_arrumar on public.equipe_funcionarios;
create trigger equipe_funcionarios_arrumar before insert or update on public.equipe_funcionarios
  for each row execute function public.equipe_funcionario_arrumar();

-- ---------------------------------------------------------------------------
-- Envios (cada pedido de feedback) e os convites (um por funcionário)
-- ---------------------------------------------------------------------------
create table if not exists public.equipe_envios (
  id              bigint generated always as identity primary key,
  restaurante_id  bigint not null references public.restaurantes(id) on delete cascade,
  -- A pergunta aberta que vai na mensagem.
  pergunta        text not null check (btrim(pergunta) <> ''),
  criado_por      text not null default '',
  -- na_fila: nenhum convite saiu ainda · enviando · concluido · cancelado
  status          text not null default 'na_fila'
                  check (status in ('na_fila', 'enviando', 'concluido', 'cancelado')),
  -- Resumo da IA: { clima, vai_bem[], incomoda[], sugestoes[], por_onde_comecar, respostas }
  resumo          jsonb,
  resumo_em       timestamptz,
  criado_em       timestamptz not null default now(),
  concluido_em    timestamptz
);
create index if not exists equipe_envios_restaurante_idx on public.equipe_envios (restaurante_id, criado_em desc);

create table if not exists public.equipe_convites (
  id              bigint generated always as identity primary key,
  envio_id        bigint not null references public.equipe_envios(id) on delete cascade,
  restaurante_id  bigint not null references public.restaurantes(id) on delete cascade,
  -- Funcionário removido depois: o convite fica (para as contas do envio).
  funcionario_id  bigint references public.equipe_funcionarios(id) on delete set null,
  telefone        text not null,
  -- A mensagem inteira, montada na criação do envio.
  texto           text not null,
  -- na_fila · enviando (a rotina pegou) · enviado · falhou · cancelado
  status          text not null default 'na_fila'
                  check (status in ('na_fila', 'enviando', 'enviado', 'falhou', 'cancelado')),
  message_id      text,
  erro            text,
  tentou_em       timestamptz,
  enviado_em      timestamptz,
  -- Quando chegou a primeira resposta. Só o admin da plataforma vê.
  respondeu_em    timestamptz,
  criado_em       timestamptz not null default now()
);
create unique index if not exists equipe_convites_um_por_funcionario
  on public.equipe_convites (envio_id, funcionario_id) where funcionario_id is not null;
create index if not exists equipe_convites_fila_idx on public.equipe_convites (status, criado_em, id);
create index if not exists equipe_convites_envio_idx on public.equipe_convites (envio_id);
create index if not exists equipe_convites_chave_idx
  on public.equipe_convites (public.telefone_chave(telefone), enviado_em desc);

-- ---------------------------------------------------------------------------
-- Respostas (a mensagem inteira) e os pontos (um por assunto), como
-- feedbacks_originais e feedbacks_restaurante
-- ---------------------------------------------------------------------------
create table if not exists public.equipe_respostas (
  id              uuid primary key default gen_random_uuid(),
  restaurante_id  bigint not null references public.restaurantes(id) on delete cascade,
  -- Nulo = resposta espontânea (mandou sem ter um pedido recente).
  envio_id        bigint references public.equipe_envios(id) on delete set null,
  -- Só para uso interno (saber quem já respondeu, apagar a pedido da pessoa).
  -- NUNCA vai para a tela do restaurante: a página lê equipe_respostas_anonimas.
  funcionario_id  bigint references public.equipe_funcionarios(id) on delete set null,
  texto_original  text not null,
  -- Positivo · Negativo · Positivo e Negativo · Sugestão · Neutro (nulo = a análise não rodou)
  sentimento      text,
  -- Relato grave (assédio, discriminação, ameaça, risco à segurança…).
  sensivel        boolean not null default false,
  criado_em       timestamptz not null default now()
);
create index if not exists equipe_respostas_restaurante_idx on public.equipe_respostas (restaurante_id, criado_em desc);
create index if not exists equipe_respostas_envio_idx on public.equipe_respostas (envio_id);

create table if not exists public.equipe_pontos (
  id              bigint generated always as identity primary key,
  resposta_id     uuid not null references public.equipe_respostas(id) on delete cascade,
  restaurante_id  bigint not null references public.restaurantes(id) on delete cascade,
  -- O trecho, nas palavras da pessoa.
  texto_original  text not null,
  -- Reescrito pela IA, curto e sem nada que identifique quem falou.
  resumo          text not null default '',
  -- Uma das categorias da equipe (_shared/equipe.ts, src/lib/categorias-equipe.ts).
  categoria       text not null,
  sentimento      text not null check (sentimento in ('Positivo', 'Negativo', 'Neutro', 'Sugestão')),
  criado_em       timestamptz not null default now()
);
create index if not exists equipe_pontos_resposta_idx on public.equipe_pontos (resposta_id);
create index if not exists equipe_pontos_restaurante_idx on public.equipe_pontos (restaurante_id, criado_em desc);

-- O que a página do restaurante lê: sem funcionário e sem hora (só o dia, em
-- Brasília), para não dar para casar a resposta com quem estava no celular.
create or replace view public.equipe_respostas_anonimas
with (security_invoker = true) as
select r.id,
       r.restaurante_id,
       r.envio_id,
       r.texto_original,
       r.sentimento,
       r.sensivel,
       (r.criado_em at time zone 'America/Sao_Paulo')::date as dia
  from public.equipe_respostas r;

-- ---------------------------------------------------------------------------
-- Mensagens do número do EasyFeed (o buffer de entrada e o registro da saída)
-- ---------------------------------------------------------------------------
create table if not exists public.equipe_mensagens (
  id              bigint generated always as identity primary key,
  -- Id da mensagem no WhatsApp: a mesma entrega repetida não duplica.
  message_id      text not null unique,
  direcao         text not null check (direcao in ('entrada', 'saida')),
  telefone        text not null,
  tipo            text not null default 'texto' check (tipo in ('texto', 'audio')),
  -- Texto digitado, ou a transcrição do áudio depois de processada.
  texto           text not null default '',
  -- pendente: chegou, esperando a pessoa terminar de escrever
  -- processando: a rotina pegou · processada · ignorada · erro
  status          text not null default 'pendente'
                  check (status in ('pendente', 'processando', 'processada', 'ignorada', 'erro')),
  tentativas      integer not null default 0,
  -- Quando a rotina pegou (para destravar o que ficou no meio do caminho).
  pegou_em        timestamptz,
  restaurante_id  bigint references public.restaurantes(id) on delete set null,
  resposta_id     uuid references public.equipe_respostas(id) on delete set null,
  erro            text,
  recebida_em     timestamptz not null default now(),
  processada_em   timestamptz
);
create index if not exists equipe_mensagens_fila_idx on public.equipe_mensagens (direcao, status, recebida_em);
create index if not exists equipe_mensagens_chave_idx
  on public.equipe_mensagens (public.telefone_chave(telefone), recebida_em desc);

-- ---------------------------------------------------------------------------
-- A fila: a rotina (função equipe, ação tick) pega um item de cada vez sem
-- risco de duas execuções pegarem o mesmo
-- ---------------------------------------------------------------------------

-- O próximo convite da fila (o mais antigo), já marcado como "enviando".
create or replace function public.equipe_pegar_convite()
returns setof public.equipe_convites
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.equipe_convites c
     set status = 'enviando', tentou_em = now()
   where c.id = (
     select c2.id
       from public.equipe_convites c2
       join public.equipe_envios e on e.id = c2.envio_id and e.status in ('na_fila', 'enviando')
      where c2.status = 'na_fila'
      order by c2.criado_em, c2.id
      limit 1
      for update of c2 skip locked
   )
  returning c.*;
end;
$$;

-- As mensagens de quem já parou de escrever (a última tem mais de
-- p_espera_segundos), de até p_telefones pessoas, já marcadas "processando".
create or replace function public.equipe_pegar_mensagens_prontas(p_espera_segundos integer default 45, p_telefones integer default 4)
returns setof public.equipe_mensagens
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.equipe_mensagens m
     set status = 'processando', tentativas = m.tentativas + 1, pegou_em = now()
   where m.direcao = 'entrada'
     and m.status = 'pendente'
     and public.telefone_chave(m.telefone) in (
       select x.chave
         from (
           select public.telefone_chave(p.telefone) as chave, max(p.recebida_em) as ultima, min(p.recebida_em) as primeira
             from public.equipe_mensagens p
            where p.direcao = 'entrada' and p.status = 'pendente'
            group by 1
         ) x
        where x.ultima < now() - make_interval(secs => greatest(p_espera_segundos, 0))
        order by x.primeira
        limit greatest(p_telefones, 1)
     )
  returning m.*;
end;
$$;

revoke all on function public.equipe_pegar_convite() from public, anon, authenticated;
revoke all on function public.equipe_pegar_mensagens_prontas(integer, integer) from public, anon, authenticated;
grant execute on function public.equipe_pegar_convite() to service_role;
grant execute on function public.equipe_pegar_mensagens_prontas(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: só o admin da plataforma, por enquanto
-- ---------------------------------------------------------------------------
alter table public.equipe_funcionarios enable row level security;
alter table public.equipe_envios enable row level security;
alter table public.equipe_convites enable row level security;
alter table public.equipe_respostas enable row level security;
alter table public.equipe_pontos enable row level security;
alter table public.equipe_mensagens enable row level security;

-- Funcionários: o admin cadastra, edita e remove pela tela.
drop policy if exists equipe_funcionarios_admin on public.equipe_funcionarios;
create policy equipe_funcionarios_admin on public.equipe_funcionarios for all
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())))
  with check (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));

-- Respostas: o admin lê e pode apagar (ex.: testes); os pontos vão junto.
drop policy if exists equipe_respostas_admin on public.equipe_respostas;
create policy equipe_respostas_admin on public.equipe_respostas for all
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())))
  with check (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));

-- O resto: o admin só lê; quem grava são as funções.
drop policy if exists equipe_envios_admin_le on public.equipe_envios;
create policy equipe_envios_admin_le on public.equipe_envios for select
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));
drop policy if exists equipe_convites_admin_le on public.equipe_convites;
create policy equipe_convites_admin_le on public.equipe_convites for select
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));
drop policy if exists equipe_pontos_admin_le on public.equipe_pontos;
create policy equipe_pontos_admin_le on public.equipe_pontos for select
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));
drop policy if exists equipe_mensagens_admin_le on public.equipe_mensagens;
create policy equipe_mensagens_admin_le on public.equipe_mensagens for select
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));

-- ---------------------------------------------------------------------------
-- Tempo real (a página atualiza sozinha)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['equipe_funcionarios', 'equipe_envios', 'equipe_convites', 'equipe_respostas'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- A rotina de 1 em 1 minuto. Só chama a função quando há o que fazer: convite
-- na fila ou mensagem esperando.
-- ---------------------------------------------------------------------------
select cron.unschedule('equipe-tick')
 where exists (select 1 from cron.job where jobname = 'equipe-tick');

select cron.schedule(
  'equipe-tick',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/equipe',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM',
        'x-cron-secret', (select valor from public.integracao_config where chave = 'PUSH_TRIGGER_SECRET')
      ),
      body := '{"acao": "tick"}'::jsonb,
      timeout_milliseconds := 30000
    )
     where exists (select 1 from public.equipe_convites where status in ('na_fila', 'enviando'))
        or exists (select 1 from public.equipe_mensagens where direcao = 'entrada' and status in ('pendente', 'processando'));
  $cron$
);
