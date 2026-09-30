-- Histórico completo do WhatsApp de cada restaurante — a base da tela que
-- mostra as conversas como no WhatsApp.
--
-- ## De onde vêm as linhas
--
-- Da uazapi, por um webhook DE INSTÂNCIA (`POST /webhook` com `action: "add"`),
-- configurado em `whatsapp-instancia` quando a instância é criada/conectada.
-- Ele é um segundo destino, independente do webhook GLOBAL da conta, que
-- continua entregando só o fluxo de feedback em `/webhook/easyfeed`.
--
-- A diferença entre os dois é o filtro: o global exclui `wasSentByApi` e grupos
-- (senão o fluxo de feedback entraria em laço com as próprias respostas); o de
-- registro não exclui nada, porque aqui a graça é justamente ver tudo — o que o
-- cliente mandou, o que o sistema respondeu e o que o dono digitou no celular.
--
-- ## Por que a UNIQUE existe
--
-- A uazapi reentrega o evento quando o webhook não responde 200 (ver
-- `/webhook/errors`), e o mesmo `messageid` chega de novo. Sem a UNIQUE a tela
-- mostraria a mensagem duplicada. Com ela, o n8n pode reenviar à vontade.
--
-- ## Mídia
--
-- `midia_url` guarda o link que `POST /message/download` devolve — e ele morre
-- em 2 dias, quando a uazapi limpa o storage dela. Enquanto a mídia não for
-- copiada para um bucket nosso, a tela só mostra imagem/arquivo recente; o
-- `midia_id` fica guardado para baixar de novo pelo mesmo endpoint.

create table if not exists public.mensagens_whatsapp (
  id bigint generated always as identity primary key,
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,

  -- Identidade da mensagem no WhatsApp. `message_id` é o `messageid` do evento.
  message_id text not null,
  chat_id text not null,              -- 5511999999999@s.whatsapp.net ou ...@g.us
  telefone text,                      -- só dígitos, extraído do chat_id
  nome_exibicao text,                 -- nome do perfil/contato no WhatsApp, quando vem

  -- Quem mandou. São três estados diferentes, não dois:
  -- recebida (de_mim=false), enviada pelo sistema (de_mim=true, por_api=true)
  -- e enviada pelo dono no celular dele (de_mim=true, por_api=false).
  de_mim boolean not null default false,
  por_api boolean not null default false,
  grupo boolean not null default false,

  tipo text not null,                 -- text, image, audio, video, document, sticker, reaction, location, contact, outro
  texto text,                         -- texto da mensagem ou legenda da mídia
  transcricao text,                   -- áudio virado texto
  reacao text,                        -- emoji, quando tipo = reaction
  responde_message_id text,           -- mensagem citada/reagida

  midia_id text,                      -- id para rebaixar em /message/download
  midia_url text,
  midia_mime text,
  midia_nome text,

  status text,                        -- PENDING, SENT, RECEIVED, READ, PLAYED, DELETED
  enviada_em timestamptz not null,    -- messageTimestamp do WhatsApp
  payload jsonb,                      -- evento cru, para depurar e evoluir o mapeamento
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  unique (restaurante_id, message_id)
);

-- Abrir uma conversa: as mensagens daquele chat, da mais nova para a mais velha.
create index if not exists idx_mensagens_whatsapp_conversa
  on public.mensagens_whatsapp (restaurante_id, chat_id, enviada_em desc);

-- Lista de conversas do restaurante e varredura por período.
create index if not exists idx_mensagens_whatsapp_recentes
  on public.mensagens_whatsapp (restaurante_id, enviada_em desc);

alter table public.mensagens_whatsapp enable row level security;

-- Só leitura para o dono; quem escreve é o n8n, com a chave de serviço.
-- Mesmo padrão de alerta_urgente e bonificacao_marco.
drop policy if exists tenant_isolation_select on public.mensagens_whatsapp;
create policy tenant_isolation_select on public.mensagens_whatsapp
  for select using (
    restaurante_id = public.get_user_restaurante_id()
    or exists (select 1 from public.platform_admins where email = auth.email())
  );

-- `atualizado_em` existe para o evento messages_update (entregue, lido): a linha
-- nasce no evento `messages` e o status muda depois, às vezes minutos depois.
create or replace function public.mensagens_whatsapp_touch()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_mensagens_whatsapp_touch on public.mensagens_whatsapp;
create trigger trg_mensagens_whatsapp_touch
  before update on public.mensagens_whatsapp
  for each row execute function public.mensagens_whatsapp_touch();

comment on table public.mensagens_whatsapp is
  'Histórico bruto do WhatsApp por restaurante (recebidas, enviadas pelo sistema e enviadas pelo dono). Alimentado pelo workflow n8n de registro, via webhook de instância da uazapi.';
