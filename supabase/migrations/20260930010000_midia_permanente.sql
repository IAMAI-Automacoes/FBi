-- Mídia do WhatsApp que não desaparece.
--
-- `midia_url` é o link que a uazapi devolve no `POST /message/download`, e ele
-- morre em 2 dias (a documentação é explícita: a mídia sai do storage deles na
-- limpeza automática). Serve para conferência imediata, não para histórico.
--
-- `midia_caminho` é o caminho do arquivo no NOSSO bucket, no formato
-- `restaurante_<id>/<message_id>.<ext>`. É esse que a tela usa, gerando uma URL
-- assinada na hora de exibir — o bucket é privado porque ali tem foto e
-- documento de cliente.
--
-- `editada_em` existe porque o WhatsApp deixa editar mensagem enviada: o evento
-- `messages_update` chega com o texto novo, e a tela precisa poder mostrar
-- "editada" como o WhatsApp mostra. Mensagem apagada não ganha coluna: ela vira
-- `status = 'DELETED'`, que é exatamente o que a uazapi manda.

alter table public.mensagens_whatsapp
  add column if not exists midia_caminho text,
  add column if not exists editada_em timestamptz;

comment on column public.mensagens_whatsapp.midia_url is
  'Link temporário da uazapi (expira em ~2 dias). Para exibir histórico use midia_caminho.';
comment on column public.mensagens_whatsapp.midia_caminho is
  'Caminho no bucket privado "mensagens": restaurante_<id>/<message_id>.<ext>. A tela gera URL assinada.';

-- Bucket privado. `public = false`: quem lê passa pela política abaixo, com a
-- sessão do dono — foto de cliente não pode ficar em link aberto na internet.
insert into storage.buckets (id, name, public)
values ('mensagens', 'mensagens', false)
on conflict (id) do nothing;

-- O dono lê os arquivos da pasta do restaurante dele, e mais nada. O primeiro
-- segmento do caminho é a pasta: restaurante_11/ABC123.jpg → 'restaurante_11'.
drop policy if exists "mensagens: dono le a pasta do seu restaurante" on storage.objects;
create policy "mensagens: dono le a pasta do seu restaurante" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'mensagens'
    and (storage.foldername(name))[1] = 'restaurante_' || public.get_user_restaurante_id()::text
  );

-- Quem grava é a edge function `guardar-midia`, com a chave de serviço, que
-- ignora RLS. Não existe política de insert/update para o dono de propósito:
-- o histórico é registro do que aconteceu, ninguém edita pela tela.
