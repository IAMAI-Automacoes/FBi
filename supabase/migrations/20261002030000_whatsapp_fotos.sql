-- Foto de perfil dos participantes dos grupos (e de quem mais precisar).
--
-- O evento da uazapi traz só a foto do CHAT (do grupo); a de quem mandou cada
-- mensagem vem de POST /chat/details {number, preview:true}. A função
-- whatsapp-instancia (ação "fotos") busca e guarda aqui por 24 h: o link é do
-- WhatsApp e expira, e não dá para chamar a uazapi a cada balão.
-- foto_url nula = a pessoa esconde a foto ou não tem (a tela não mostra nada).
create table if not exists public.whatsapp_fotos (
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  telefone text not null,
  foto_url text,
  atualizada_em timestamptz not null default now(),
  primary key (restaurante_id, telefone)
);

alter table public.whatsapp_fotos enable row level security;

-- Só leitura, do próprio restaurante. Quem grava é a função (chave de serviço).
drop policy if exists fotos_select on public.whatsapp_fotos;
create policy fotos_select on public.whatsapp_fotos
  for select using (restaurante_id = public.get_user_restaurante_id());

comment on table public.whatsapp_fotos is
  'Cache (24 h) da foto de perfil do WhatsApp por telefone, para a tela WhatsApp. Gravado pela whatsapp-instancia (ação fotos).';
