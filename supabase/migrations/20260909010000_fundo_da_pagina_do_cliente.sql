-- Separa o fundo da PÁGINA DO CLIENTE do tema do CARTAZ IMPRESSO.
--
-- Até aqui os dois liam os mesmos `qr_bg_modo` / `qr_bg_imagem` / `qr_estilo`:
-- escolher a madeira do display de mesa mudava junto o que o cliente via ao
-- abrir o QR no celular. São decisões diferentes — uma é papel impresso sob luz
-- de restaurante, a outra é uma tela na mão de alguém — e agora cada uma tem o
-- seu campo.
--
-- Os valores atuais são COPIADOS para as colunas novas, e não zerados: quem já
-- configurou continua vendo exatamente a mesma página do cliente depois desta
-- migração. O corte só vale daqui pra frente.
alter table public.restaurantes
  add column if not exists cliente_bg_modo text,
  add column if not exists cliente_bg_imagem text,
  add column if not exists cliente_estilo text;

update public.restaurantes
set
  cliente_bg_modo = coalesce(cliente_bg_modo, qr_bg_modo),
  cliente_bg_imagem = coalesce(cliente_bg_imagem, qr_bg_imagem),
  cliente_estilo = coalesce(cliente_estilo, qr_estilo)
where cliente_bg_modo is null
   or cliente_bg_imagem is null
   or cliente_estilo is null;

comment on column public.restaurantes.cliente_bg_modo is
  'Fundo da página que o cliente abre pelo QR: "upload" (foto do dono) ou "estilo" (textura/cor). Nada a ver com o cartaz impresso, que usa qr_bg_modo.';
comment on column public.restaurantes.cliente_bg_imagem is
  'Foto de fundo da página do cliente, quando cliente_bg_modo = "upload".';
comment on column public.restaurantes.cliente_estilo is
  'Id do tema (cor ou textura) do fundo da página do cliente, quando cliente_bg_modo = "estilo".';
