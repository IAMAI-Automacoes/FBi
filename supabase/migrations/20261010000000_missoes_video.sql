-- Missões de vídeo: o restaurante grava um vídeo falando do EasyFeed para
-- cumprir uma missão (uma lista de requisitos que a IA confere assistindo o
-- vídeo). A 1ª missão cumprida dá o prêmio 1 da escada, a 2ª o prêmio 2, e
-- assim por diante. O prêmio fica registrado como pendente e o admin marca
-- "aplicado" (ainda não há desconto automático no Stripe).
--
-- Por enquanto só o admin da plataforma usa: menu e rota (/missoes) e a função
-- videos-missao (SO_ADMIN). Quem cria e muda envio é a função (chave de
-- serviço); o restaurante só lê os dele e sobe o arquivo do envio que a função
-- abriu.

-- ---------------------------------------------------------------------------
-- Missões e a escada de prêmios (o admin edita)
-- ---------------------------------------------------------------------------
create table if not exists public.video_missoes (
  id             bigint generated always as identity primary key,
  titulo         text not null check (btrim(titulo) <> ''),
  descricao      text not null default '',
  -- [{ "id": "nome_easyfeed", "texto": "Fala o nome \"EasyFeed\" em voz alta" }, ...]
  requisitos     jsonb not null default '[]'::jsonb check (jsonb_typeof(requisitos) = 'array'),
  ordem          integer not null default 0,
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- A escada: o que ganha quem cumpre a 1ª, a 2ª, a 3ª missão…
create table if not exists public.video_recompensas (
  ordem          integer primary key check (ordem >= 1),
  descricao      text not null check (btrim(descricao) <> ''),
  atualizado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Os vídeos enviados e os prêmios ganhos
-- ---------------------------------------------------------------------------
create table if not exists public.video_envios (
  id                uuid primary key default gen_random_uuid(),
  restaurante_id    bigint not null references public.restaurantes(id) on delete cascade,
  missao_id         bigint not null references public.video_missoes(id) on delete restrict,
  -- Caminho no bucket videos-clientes: restaurante_<id>/<envio>.<ext>
  caminho           text not null unique,
  nome_arquivo      text not null default '',
  tamanho_bytes     bigint not null check (tamanho_bytes > 0),
  duracao_segundos  numeric(8,2),
  mime              text not null,
  -- "Autorizo o EasyFeed a usar este vídeo na divulgação" (obrigatório).
  autorizou_uso     boolean not null check (autorizou_uso),
  -- enviando: a função abriu o envio, o arquivo está subindo
  -- analisando: a IA está assistindo
  -- aprovado / reprovado: veredito (da IA ou do admin)
  -- erro: a análise não terminou (sem chave, timeout, formato) — o admin roda de novo
  status            text not null default 'enviando'
                    check (status in ('enviando', 'analisando', 'aprovado', 'reprovado', 'erro')),
  -- { requisitos: [{ id, texto, cumpriu, motivo }], conteudo_adequado, problema_conteudo, resumo }
  analise           jsonb,
  -- O que o restaurante lê (curto).
  motivo            text,
  analisado_em      timestamptz,
  revisado_por      text,
  revisado_em       timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create index if not exists video_envios_restaurante_idx on public.video_envios (restaurante_id, missao_id, criado_em desc);
create index if not exists video_envios_status_idx on public.video_envios (status, criado_em desc);
-- Uma missão vale uma vez por restaurante.
create unique index if not exists video_envios_uma_aprovada on public.video_envios (restaurante_id, missao_id) where status = 'aprovado';

create table if not exists public.video_premios (
  id                uuid primary key default gen_random_uuid(),
  restaurante_id    bigint not null references public.restaurantes(id) on delete cascade,
  -- Qual degrau da escada (1 = primeira missão cumprida).
  recompensa_ordem  integer not null check (recompensa_ordem >= 1),
  -- Cópia do texto do degrau no momento em que ganhou (o admin pode mudar a escada depois).
  descricao         text not null,
  envio_id          uuid not null unique references public.video_envios(id) on delete cascade,
  status            text not null default 'pendente' check (status in ('pendente', 'aplicado', 'cancelado')),
  aplicado_em       timestamptz,
  aplicado_por      text,
  criado_em         timestamptz not null default now()
);

create index if not exists video_premios_restaurante_idx on public.video_premios (restaurante_id, recompensa_ordem);
-- Cada degrau, uma vez por restaurante.
create unique index if not exists video_premios_um_por_degrau on public.video_premios (restaurante_id, recompensa_ordem) where status <> 'cancelado';

-- ---------------------------------------------------------------------------
-- atualizado_em
-- ---------------------------------------------------------------------------
create or replace function public.video_tocar_atualizado()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists video_missoes_atualizado on public.video_missoes;
create trigger video_missoes_atualizado before update on public.video_missoes
  for each row execute function public.video_tocar_atualizado();
drop trigger if exists video_recompensas_atualizado on public.video_recompensas;
create trigger video_recompensas_atualizado before update on public.video_recompensas
  for each row execute function public.video_tocar_atualizado();
drop trigger if exists video_envios_atualizado on public.video_envios;
create trigger video_envios_atualizado before update on public.video_envios
  for each row execute function public.video_tocar_atualizado();

-- ---------------------------------------------------------------------------
-- O prêmio: aprovou → ganha o degrau N (N = missões aprovadas do restaurante).
-- Desaprovou → o prêmio desse envio, se ainda pendente, é cancelado.
-- ---------------------------------------------------------------------------
create or replace function public.video_envio_premio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  texto text;
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    select count(*) into n
      from public.video_envios
     where restaurante_id = new.restaurante_id and status = 'aprovado';
    select descricao into texto from public.video_recompensas where ordem = n;
    if texto is null then
      return new; -- a escada não tem esse degrau: missão cumprida, sem prêmio novo
    end if;
    -- Degrau já ocupado por outro envio (aprovações desfeitas e refeitas): não dá dois.
    if exists (
      select 1 from public.video_premios
       where restaurante_id = new.restaurante_id and recompensa_ordem = n
         and status <> 'cancelado' and envio_id <> new.id
    ) then
      return new;
    end if;
    insert into public.video_premios (restaurante_id, recompensa_ordem, descricao, envio_id)
    values (new.restaurante_id, n, texto, new.id)
    on conflict (envio_id) do update
      set recompensa_ordem = excluded.recompensa_ordem, descricao = excluded.descricao,
          status = 'pendente', aplicado_em = null, aplicado_por = null
      where public.video_premios.status = 'cancelado';
  elsif old.status = 'aprovado' and new.status is distinct from 'aprovado' then
    update public.video_premios set status = 'cancelado'
     where envio_id = new.id and status = 'pendente';
  end if;
  return new;
end;
$$;

drop trigger if exists video_envios_premio on public.video_envios;
create trigger video_envios_premio after update of status on public.video_envios
  for each row execute function public.video_envio_premio();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.video_missoes enable row level security;
alter table public.video_recompensas enable row level security;
alter table public.video_envios enable row level security;
alter table public.video_premios enable row level security;

drop policy if exists video_missoes_admin on public.video_missoes;
create policy video_missoes_admin on public.video_missoes for all
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())))
  with check (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));
drop policy if exists video_missoes_le on public.video_missoes;
create policy video_missoes_le on public.video_missoes for select to authenticated
  using (ativa);

drop policy if exists video_recompensas_admin on public.video_recompensas;
create policy video_recompensas_admin on public.video_recompensas for all
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())))
  with check (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));
drop policy if exists video_recompensas_le on public.video_recompensas;
create policy video_recompensas_le on public.video_recompensas for select to authenticated
  using (true);

drop policy if exists video_envios_admin_le on public.video_envios;
create policy video_envios_admin_le on public.video_envios for select
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));
drop policy if exists video_envios_proprio_le on public.video_envios;
create policy video_envios_proprio_le on public.video_envios for select
  using (restaurante_id = public.get_user_restaurante_id());

drop policy if exists video_premios_admin on public.video_premios;
create policy video_premios_admin on public.video_premios for all
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())))
  with check (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));
drop policy if exists video_premios_proprio_le on public.video_premios;
create policy video_premios_proprio_le on public.video_premios for select
  using (restaurante_id = public.get_user_restaurante_id());

-- A página atualiza sozinha quando a análise termina ou um prêmio muda.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'video_envios') then
    alter publication supabase_realtime add table public.video_envios;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'video_premios') then
    alter publication supabase_realtime add table public.video_premios;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado. O restaurante só sobe o arquivo do envio que a
-- função abriu (status enviando) e só lê a própria pasta; o admin lê tudo.
-- O limite por arquivo também depende do limite global do projeto
-- (Storage → Settings no Supabase).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos-clientes', 'videos-clientes', false, 314572800,
        array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/mpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists videos_clientes_sobe on storage.objects;
create policy videos_clientes_sobe on storage.objects for insert to authenticated
  with check (
    bucket_id = 'videos-clientes'
    and (storage.foldername(name))[1] = 'restaurante_' || public.get_user_restaurante_id()::text
    and exists (
      select 1 from public.video_envios e
       where e.caminho = name and e.status = 'enviando' and e.restaurante_id = public.get_user_restaurante_id()
    )
  );

drop policy if exists videos_clientes_le on storage.objects;
create policy videos_clientes_le on storage.objects for select to authenticated
  using (
    bucket_id = 'videos-clientes'
    and (
      (storage.foldername(name))[1] = 'restaurante_' || public.get_user_restaurante_id()::text
      or exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email()))
    )
  );

-- ---------------------------------------------------------------------------
-- Para começar (o admin edita na aba Vídeos)
-- ---------------------------------------------------------------------------
insert into public.video_missoes (titulo, descricao, requisitos, ordem)
select * from (values
  ('Depoimento sobre o EasyFeed',
   'Grave um vídeo curto contando como o EasyFeed ajuda o seu restaurante.',
   '[{"id": "nome_easyfeed", "texto": "Fala o nome \"EasyFeed\" em voz alta"},
     {"id": "nome_restaurante", "texto": "Diz o nome do restaurante"},
     {"id": "melhoria", "texto": "Conta pelo menos uma coisa que melhorou no restaurante depois de usar o EasyFeed"},
     {"id": "rosto", "texto": "Quem fala aparece no vídeo, com o rosto visível"},
     {"id": "duracao", "texto": "O vídeo tem pelo menos 30 segundos"}]'::jsonb,
   1),
  ('Mostre o QR Code',
   'Mostre onde fica o QR Code do EasyFeed no restaurante e como o cliente usa.',
   '[{"id": "qr_visivel", "texto": "Mostra o QR Code do EasyFeed numa mesa, balcão ou parede do restaurante"},
     {"id": "explica", "texto": "Explica como o cliente usa o QR Code para mandar a opinião"},
     {"id": "duracao", "texto": "O vídeo tem pelo menos 20 segundos"}]'::jsonb,
   2)
) as v(titulo, descricao, requisitos, ordem)
where not exists (select 1 from public.video_missoes);

insert into public.video_recompensas (ordem, descricao) values
  (1, '10% de desconto na próxima mensalidade'),
  (2, '20% de desconto na próxima mensalidade'),
  (3, '1 mês grátis')
on conflict (ordem) do nothing;
