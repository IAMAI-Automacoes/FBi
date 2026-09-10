-- Textos e imagens livres sobre a página que o cliente abre pelo QR.
--
-- Mesmo formato de `qr_elementos` (ElementoCartaz) de propósito: é o que deixa
-- o mesmo editor, as mesmas alças e a mesma conta de redimensionar servirem aos
-- dois lugares. A diferença está só em quem desenha — o cartaz é um canvas, e
-- esta página é HTML, porque ela é servida por um bundle leve pro celular de
-- quem escaneia.
alter table public.restaurantes
  add column if not exists cliente_elementos jsonb not null default '[]'::jsonb;

comment on column public.restaurantes.cliente_elementos is
  'Textos e imagens que o dono posicionou sobre a pagina que o cliente abre pelo QR. Mesmo formato de qr_elementos (ElementoCartaz), mas desenhados em HTML pela CamadaDeElementos, nao no canvas do cartaz.';
