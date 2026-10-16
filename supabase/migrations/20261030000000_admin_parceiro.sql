-- Admin parceiro: uma segunda classe de admin, feita só para o Anderson
-- (Parrilla Hamburgueria, parceiro do EasyFeed). Pedido do Raver em 16/10/2026.
--
-- O que o parceiro tem:
--   - Painel Admin → Suporte: as conversas dos clientes, como qualquer admin;
--   - Painel Admin → WhatsApp: ver o WhatsApp de um restaurante (só leitura);
--   - Painel Admin → Contas: ver a lista e entrar na conta de um restaurante;
--   - a página Google da própria conta (google-perfil, SO_ADMIN).
-- E só contas da versão Restaurante, não excluídas e que não são de um admin
-- da plataforma. O resto do painel (pagamentos, cupons, afiliados, agentes…)
-- continua só de `platform_admins`: o parceiro NÃO entra nessa tabela, e cada
-- liberação dele aqui é uma regra própria, com o nome `parceiro_*`.
--
-- A lista de contas dele sai de `parceiro_contas()`, e não da tabela
-- `restaurantes`: ela tem a chave da instância do WhatsApp de cada conta
-- (`whatsapp_token`), que manda mensagem pelo número do restaurante.
--
-- Junto, dois furos achados no caminho:
--   - `admin_push_subscriptions` podia ser chamada por qualquer um com a chave
--     pública e devolvia os endereços de notificação dos aparelhos dos admins
--     (dava para mandar notificação falsa para eles). Agora só o servidor.
--   - os anexos do suporte (`sugestoes-plataforma`): qualquer conta logada
--     listava e baixava os de todos os clientes, e enviava arquivo em qualquer
--     pasta. Agora cada um lê os próprios e os da própria conversa, e só envia
--     para a própria pasta.

create table if not exists public.admins_parceiros (
  email text primary key check (email = lower(btrim(email))),
  nome text,
  criado_em timestamptz not null default now()
);
alter table public.admins_parceiros enable row level security;
-- Cada um só se enxerga (é assim que o site sabe que a conta é de parceiro).
drop policy if exists admins_parceiros_proprio on public.admins_parceiros;
create policy admins_parceiros_proprio on public.admins_parceiros
  for select to authenticated using (email = lower(auth.email()));

insert into public.admins_parceiros (email, nome)
values ('parrillahamburgueria@gmail.com', 'Anderson Rodrigo de Sousa (Parrilla Hamburgueria)')
on conflict (email) do nothing;

-- ── Quem o parceiro enxerga ─────────────────────────────────────────────────

-- O núcleo: este e-mail é de parceiro e esta conta está ao alcance dele.
-- Só o servidor chama direto (as funções do site usam auth.email()).
create or replace function public.parceiro_pode_ver(p_email text, p_restaurante_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins_parceiros ap where ap.email = lower(btrim(coalesce(p_email, ''))))
     and exists (
       select 1
         from public.restaurantes r
         left join auth.users u on u.id = r.auth_user_id
        where r.id = p_restaurante_id
          and r.excluida_em is null
          and coalesce(r.area, 'restaurante') = 'restaurante'
          and not exists (
            select 1 from public.platform_admins pa
             where lower(pa.email) = lower(coalesce(u.email, r.email, ''))
          )
     )
$$;
revoke execute on function public.parceiro_pode_ver(text, bigint) from public, anon, authenticated;
grant execute on function public.parceiro_pode_ver(text, bigint) to service_role;

create or replace function public.eh_admin_parceiro()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins_parceiros ap where ap.email = lower(coalesce(auth.email(), '')))
$$;

create or replace function public.parceiro_ve_conta(p_restaurante_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.parceiro_pode_ver(auth.email(), p_restaurante_id)
$$;

-- Pela pessoa (o suporte é por usuário, não por restaurante).
create or replace function public.parceiro_ve_usuario(p_usuario uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.restaurantes r
     where r.auth_user_id = p_usuario
       and public.parceiro_pode_ver(auth.email(), r.id)
  )
$$;

create or replace function public.parceiro_ve_sugestao(p_sugestao uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.sugestoes_plataforma s
     where s.id = p_sugestao
       and public.parceiro_ve_usuario(s.usuario_id)
  )
$$;

-- Arquivo do suporte: `<usuario_id>/…` (do cliente) ou `admin/<sugestao_id>/…`.
create or replace function public.parceiro_ve_arquivo_suporte(p_nome text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  partes text[] := string_to_array(coalesce(p_nome, ''), '/');
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if not public.eh_admin_parceiro() then
    return false;
  end if;
  if partes[1] = 'admin' then
    if coalesce(partes[2], '') !~* uuid_re then
      return false;
    end if;
    return public.parceiro_ve_sugestao(partes[2]::uuid);
  end if;
  if coalesce(partes[1], '') !~* uuid_re then
    return false;
  end if;
  return public.parceiro_ve_usuario(partes[1]::uuid);
end;
$$;

-- Mídia do WhatsApp: `restaurante_<id>/…`.
create or replace function public.parceiro_ve_midia_whatsapp(p_nome text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  pasta text := split_part(coalesce(p_nome, ''), '/', 1);
begin
  if pasta !~ '^restaurante_[0-9]{1,18}$' then
    return false;
  end if;
  return public.parceiro_ve_conta(substr(pasta, 13)::bigint);
end;
$$;

revoke execute on function public.eh_admin_parceiro() from public, anon;
revoke execute on function public.parceiro_ve_conta(bigint) from public, anon;
revoke execute on function public.parceiro_ve_usuario(uuid) from public, anon;
revoke execute on function public.parceiro_ve_sugestao(uuid) from public, anon;
revoke execute on function public.parceiro_ve_arquivo_suporte(text) from public, anon;
revoke execute on function public.parceiro_ve_midia_whatsapp(text) from public, anon;
grant execute on function public.eh_admin_parceiro() to authenticated, service_role;
grant execute on function public.parceiro_ve_conta(bigint) to authenticated, service_role;
grant execute on function public.parceiro_ve_usuario(uuid) to authenticated, service_role;
grant execute on function public.parceiro_ve_sugestao(uuid) to authenticated, service_role;
grant execute on function public.parceiro_ve_arquivo_suporte(text) to authenticated, service_role;
grant execute on function public.parceiro_ve_midia_whatsapp(text) to authenticated, service_role;

-- ── As contas que ele vê (Contas, WhatsApp e o perfil no Suporte) ───────────
-- Sem a chave do WhatsApp: só se a conta tem instância.
create or replace function public.parceiro_contas()
returns table (
  id bigint, auth_user_id uuid, nome_restaurante text, logo_url text,
  nome text, email text, avatar_url text,
  numero_whatsapp text, whatsapp_dono text, tem_instancia boolean, whatsapp_conectado boolean,
  tipo_culinaria text, numero_mesas integer, detalhes text, area text,
  assinatura_status text, plano_ciclo text, onboarding_completo boolean, created_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.eh_admin_parceiro() then
    raise exception 'só o admin parceiro' using errcode = '42501';
  end if;
  return query
    select r.id, r.auth_user_id, r.nome_restaurante, r.logo_url,
           u.nome, coalesce(u.email, r.email), u.avatar_url,
           r.numero_whatsapp, r.whatsapp_dono, r.whatsapp_token is not null, coalesce(r.whatsapp_conectado, false),
           r.tipo_culinaria, r.numero_mesas, r.detalhes, r.area,
           r.assinatura_status, r.plano_ciclo, r.onboarding_completo, r.created_at
      from public.restaurantes r
      left join public.usuarios u on u.id = r.auth_user_id
     where public.parceiro_pode_ver(auth.email(), r.id)
     order by r.created_at desc;
end;
$$;
revoke execute on function public.parceiro_contas() from public, anon;
grant execute on function public.parceiro_contas() to authenticated;

-- ── Suporte ─────────────────────────────────────────────────────────────────
-- `(select eh_admin_parceiro())` roda uma vez por consulta: para quem não é
-- parceiro a regra para ali, sem custo por linha.

drop policy if exists parceiro_le_sugestoes on public.sugestoes_plataforma;
create policy parceiro_le_sugestoes on public.sugestoes_plataforma
  for select to authenticated
  using ((select public.eh_admin_parceiro()) and public.parceiro_ve_usuario(usuario_id));

drop policy if exists parceiro_marca_sugestoes on public.sugestoes_plataforma;
create policy parceiro_marca_sugestoes on public.sugestoes_plataforma
  for update to authenticated
  using ((select public.eh_admin_parceiro()) and public.parceiro_ve_usuario(usuario_id))
  with check ((select public.eh_admin_parceiro()) and public.parceiro_ve_usuario(usuario_id));

drop policy if exists parceiro_le_respostas on public.respostas_sugestoes;
create policy parceiro_le_respostas on public.respostas_sugestoes
  for select to authenticated
  using ((select public.eh_admin_parceiro()) and public.parceiro_ve_sugestao(sugestao_id));

drop policy if exists parceiro_responde on public.respostas_sugestoes;
create policy parceiro_responde on public.respostas_sugestoes
  for insert to authenticated
  with check ((select public.eh_admin_parceiro()) and autor <> 'usuario' and public.parceiro_ve_sugestao(sugestao_id));

drop policy if exists parceiro_edita_respostas on public.respostas_sugestoes;
create policy parceiro_edita_respostas on public.respostas_sugestoes
  for update to authenticated
  using ((select public.eh_admin_parceiro()) and autor <> 'usuario' and public.parceiro_ve_sugestao(sugestao_id))
  with check ((select public.eh_admin_parceiro()) and autor <> 'usuario' and public.parceiro_ve_sugestao(sugestao_id));

drop policy if exists parceiro_exclui_respostas on public.respostas_sugestoes;
create policy parceiro_exclui_respostas on public.respostas_sugestoes
  for delete to authenticated
  using ((select public.eh_admin_parceiro()) and autor <> 'usuario' and public.parceiro_ve_sugestao(sugestao_id));

drop policy if exists parceiro_le_reacoes on public.reacoes_sugestoes;
create policy parceiro_le_reacoes on public.reacoes_sugestoes
  for select to authenticated
  using ((select public.eh_admin_parceiro()) and public.parceiro_ve_sugestao(sugestao_id));

drop policy if exists parceiro_reage on public.reacoes_sugestoes;
create policy parceiro_reage on public.reacoes_sugestoes
  for insert to authenticated
  with check ((select public.eh_admin_parceiro()) and autor = 'admin' and public.parceiro_ve_sugestao(sugestao_id));

drop policy if exists parceiro_troca_reacao on public.reacoes_sugestoes;
create policy parceiro_troca_reacao on public.reacoes_sugestoes
  for update to authenticated
  using ((select public.eh_admin_parceiro()) and autor = 'admin' and public.parceiro_ve_sugestao(sugestao_id))
  with check ((select public.eh_admin_parceiro()) and autor = 'admin' and public.parceiro_ve_sugestao(sugestao_id));

drop policy if exists parceiro_tira_reacao on public.reacoes_sugestoes;
create policy parceiro_tira_reacao on public.reacoes_sugestoes
  for delete to authenticated
  using ((select public.eh_admin_parceiro()) and autor = 'admin' and public.parceiro_ve_sugestao(sugestao_id));

-- O cliente: os anexos dele (`<usuario_id>/…`) e os que o suporte mandou na
-- conversa dele (`admin/<sugestao_id>/…`). Antes era o bucket inteiro.
drop policy if exists select_sugestoes on storage.objects;
create policy select_sugestoes on storage.objects
  for select to authenticated
  using (bucket_id = 'sugestoes-plataforma' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or ((storage.foldername(name))[1] = 'admin' and exists (
          select 1 from public.sugestoes_plataforma s
           where s.id::text = (storage.foldername(name))[2]
             and s.usuario_id = auth.uid()))
  ));

drop policy if exists upload_sugestoes on storage.objects;
create policy upload_sugestoes on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sugestoes-plataforma' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists parceiro_le_arquivos_suporte on storage.objects;
create policy parceiro_le_arquivos_suporte on storage.objects
  for select to authenticated
  using (bucket_id = 'sugestoes-plataforma' and (select public.eh_admin_parceiro()) and public.parceiro_ve_arquivo_suporte(name));

drop policy if exists parceiro_envia_arquivos_suporte on storage.objects;
create policy parceiro_envia_arquivos_suporte on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sugestoes-plataforma' and (storage.foldername(name))[1] = 'admin'
              and (select public.eh_admin_parceiro()) and public.parceiro_ve_arquivo_suporte(name));

drop policy if exists parceiro_apaga_arquivos_suporte on storage.objects;
create policy parceiro_apaga_arquivos_suporte on storage.objects
  for delete to authenticated
  using (bucket_id = 'sugestoes-plataforma' and (storage.foldername(name))[1] = 'admin'
         and (select public.eh_admin_parceiro()) and public.parceiro_ve_arquivo_suporte(name));

-- ── WhatsApp (só leitura) ───────────────────────────────────────────────────
-- As regras restritivas de mensagens_whatsapp (número conectado, versão,
-- ocultas) continuam valendo por cima desta.

drop policy if exists parceiro_le_mensagens on public.mensagens_whatsapp;
create policy parceiro_le_mensagens on public.mensagens_whatsapp
  for select to authenticated
  using ((select public.eh_admin_parceiro()) and public.parceiro_ve_conta(restaurante_id));

drop policy if exists parceiro_le_leitura on public.mensagens_whatsapp_leitura;
create policy parceiro_le_leitura on public.mensagens_whatsapp_leitura
  for select to authenticated
  using ((select public.eh_admin_parceiro()) and public.parceiro_ve_conta(restaurante_id));

drop policy if exists parceiro_le_midias_whatsapp on storage.objects;
create policy parceiro_le_midias_whatsapp on storage.objects
  for select to authenticated
  using (bucket_id = 'mensagens' and (select public.eh_admin_parceiro()) and public.parceiro_ve_midia_whatsapp(name));

-- As conversas que o dono fixou (a tela do admin mostra igual à do dono).
create or replace function public.fixadas_whatsapp_do_restaurante(p_restaurante_id bigint)
returns table(conversa text, fixada_em timestamp with time zone)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.platform_admins where platform_admins.email = auth.email())
     and not public.parceiro_ve_conta(p_restaurante_id) then
    raise exception 'só o admin da plataforma' using errcode = '42501';
  end if;
  return query
    select p.conversa, p.fixada_em
      from public.preferencias_conversa p
      join public.restaurantes r on r.auth_user_id = p.auth_user_id
     where r.id = p_restaurante_id
       and p.canal = 'whatsapp'
       and p.conversa <> ''
       and p.fixada_em is not null;
end;
$$;

-- ── Notificação do suporte ──────────────────────────────────────────────────
-- Os aparelhos dos admins e, quando a conversa é de uma conta ao alcance dele,
-- os do parceiro (`p_cliente` = quem escreveu; a função enviar-push passa).
drop function if exists public.admin_push_subscriptions();
create function public.admin_push_subscriptions(p_cliente uuid default null)
returns table(auth_user_id uuid, endpoint text, p256dh text, auth text, aparelho text)
language sql stable security definer set search_path = public
as $$
  select ps.auth_user_id, ps.endpoint, ps.p256dh, ps.auth, ps.aparelho
    from public.push_subscriptions ps
    join auth.users u on u.id = ps.auth_user_id
   where exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(u.email))
      or (p_cliente is not null and exists (
            select 1 from public.restaurantes r
             where r.auth_user_id = p_cliente
               and public.parceiro_pode_ver(u.email, r.id)
          ));
$$;
revoke execute on function public.admin_push_subscriptions(uuid) from public, anon, authenticated;
grant execute on function public.admin_push_subscriptions(uuid) to service_role;
