-- Painel do admin, aba "WhatsApp": o admin da plataforma vê o WhatsApp de
-- qualquer restaurante exatamente como o dono vê — só leitura.
--
-- mensagens_whatsapp e restaurantes o admin já lia. Faltava:
--   1. o "lido até" de cada conversa (o contador de não lidas do dono);
--   2. os arquivos (bucket privado "mensagens": fotos, áudios, PDFs);
--   3. as conversas fixadas pelo DONO (preferencias_conversa é por conta).
-- Nada muda para os donos: as políticas deles continuam iguais.

-- 1. Contador de não lidas igual ao do dono
drop policy if exists leitura_select_admin on public.mensagens_whatsapp_leitura;
create policy leitura_select_admin on public.mensagens_whatsapp_leitura
  for select using (exists (select 1 from public.platform_admins where platform_admins.email = auth.email()));

-- 2. Arquivos das conversas (URLs assinadas)
drop policy if exists "mensagens: admin le tudo" on storage.objects;
create policy "mensagens: admin le tudo" on storage.objects
  for select using (
    bucket_id = 'mensagens'
    and exists (select 1 from public.platform_admins where platform_admins.email = auth.email())
  );

-- 3. Fixadas do dono do restaurante (só para o admin, só o canal WhatsApp).
-- Mais estreito que abrir preferencias_conversa inteira para o admin.
create or replace function public.fixadas_whatsapp_do_restaurante(p_restaurante_id bigint)
returns table (conversa text, fixada_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.platform_admins where platform_admins.email = auth.email()) then
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
revoke all on function public.fixadas_whatsapp_do_restaurante(bigint) from public, anon;
grant execute on function public.fixadas_whatsapp_do_restaurante(bigint) to authenticated;
