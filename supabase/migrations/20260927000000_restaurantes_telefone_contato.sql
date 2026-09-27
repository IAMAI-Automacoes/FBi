-- Número que o cliente recebe quando manda no WhatsApp algo que NÃO é feedback.
--
-- O fluxo de entrada do n8n passa a triar cada mensagem. Quando é uma pergunta
-- sobre o restaurante (horário, reserva, pedido), a resposta diz que este canal
-- é só de feedback e indica para onde ir — e esse "para onde" é este número,
-- configurado pelo dono em Configurações → Perfil do Restaurante.
--
-- Nulo é um estado válido e comum: sem número configurado, a resposta só diz
-- que o canal é de feedback, sem indicar contato nenhum. O n8n decide isso.
--
-- Formato: canônico do sistema ('55' + DDD + número, só dígitos), o mesmo que
-- `garcons.telefone` e `restaurantes.whatsapp_dono` usam — quem grava é o
-- CampoTelefone, único componente de telefone do front.
alter table public.restaurantes
  add column if not exists telefone_contato text;

comment on column public.restaurantes.telefone_contato is
  'Telefone que o cliente recebe quando manda mensagem que não é feedback. Canônico: 55 + DDD + número, só dígitos. Nulo = não indicar contato.';
