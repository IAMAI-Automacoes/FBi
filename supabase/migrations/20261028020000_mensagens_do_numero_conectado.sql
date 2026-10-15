-- Tela WhatsApp: só as conversas do número conectado AGORA.
--
-- `mensagens_whatsapp` guarda tudo por restaurante, sem dizer de qual número
-- veio. Quem desconectava e conectava outro número continuava vendo as
-- conversas do antigo (caso da Florinda: número de 1–2/10 aparecendo depois de
-- conectar outro em 15/10). Cada evento da uazapi traz o número da instância em
-- `payload->>'owner'`; ele vira uma coluna e uma regra de leitura.
--
-- Nada é apagado: reconectar o número antigo traz o histórico dele de volta. O
-- n8n e as funções (service role) seguem vendo tudo. Desconectado
-- (`numero_whatsapp` nulo) = nenhuma conversa, e a tela mostra o botão de
-- conectar.

alter table public.mensagens_whatsapp
  add column if not exists numero_restaurante text
  generated always as (public.telefone_chave(payload ->> 'owner')) stored;

create index if not exists mensagens_whatsapp_restaurante_numero_idx
  on public.mensagens_whatsapp (restaurante_id, numero_restaurante);

-- Security definer como whatsapp_publico_da_conta: a policy roda para o admin
-- da plataforma também, que não lê `restaurantes` de outra conta pela RLS.
create or replace function public.whatsapp_numero_da_conta(p_restaurante_id bigint)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.telefone_chave(r.numero_whatsapp) from public.restaurantes r where r.id = p_restaurante_id
$$;

revoke all on function public.whatsapp_numero_da_conta(bigint) from public, anon;
grant execute on function public.whatsapp_numero_da_conta(bigint) to authenticated;

-- Restritiva, como as outras duas: soma com elas (E), não abre nada novo.
-- Vale para a lista (conversas_whatsapp), a busca e o tempo real, que leem
-- pela RLS.
drop policy if exists so_do_numero_conectado on public.mensagens_whatsapp;
create policy so_do_numero_conectado on public.mensagens_whatsapp
  as restrictive
  for select
  using (numero_restaurante = public.whatsapp_numero_da_conta(restaurante_id));
