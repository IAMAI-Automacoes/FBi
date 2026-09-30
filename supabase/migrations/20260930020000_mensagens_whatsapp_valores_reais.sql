-- Documenta os valores que a tabela recebe DE VERDADE.
--
-- Os comentários da primeira migration foram escritos antes de existir um
-- payload real. O teste de 30/09 (texto, edição, exclusão, reação, resposta,
-- áudio, imagem, PDF, figurinha, gif e emoji pelo número do Camelo) mostrou
-- duas diferenças, e é o comentário que a pessoa da interface vai ler:
--
-- - gif é tipo próprio. A uazapi manda como VideoMessage com mediaType "gif"
--   (é um mp4 sem som que o WhatsApp toca em loop). Tratar como vídeo comum
--   poria controles de play onde o WhatsApp não põe.
-- - "entregue" chega como Delivered, não como RECEIVED.

comment on column public.mensagens_whatsapp.tipo is
  'text, image, video, gif, audio, document, sticker, reaction, location, contact, outro. '
  'gif é um mp4 para tocar em loop, mudo, sem controles.';

comment on column public.mensagens_whatsapp.status is
  'Só avança, nunca volta: SENT (enviada por nós) → DELIVERED → READ → PLAYED (áudio ouvido). '
  'DELETED = apagada para todos; a tela mostra "mensagem apagada". Nulo em mensagem recebida.';

comment on column public.mensagens_whatsapp.reacao is
  'Emoji da reação quando tipo = reaction. A mensagem reagida está em responde_message_id. '
  'Nulo numa linha de reação = a pessoa removeu a reação. Vale a reação mais recente por mensagem e por lado (de_mim).';

comment on column public.mensagens_whatsapp.responde_message_id is
  'Resposta (citação): id da mensagem citada. Reação: id da mensagem reagida.';

comment on column public.mensagens_whatsapp.editada_em is
  'Preenchido quando a mensagem foi editada; texto já contém a versão nova. A tela mostra "editada".';
