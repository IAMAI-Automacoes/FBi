-- Textos e logo que o dono posiciona livremente no cartaz do QR.
--
-- Guardado como jsonb, e não em colunas ou numa tabela própria, porque é uma
-- LISTA de tamanho variável de objetos heterogêneos (um texto tem fonte e
-- corpo; uma logo tem url e escala), lida e gravada sempre inteira, por um
-- restaurante só, e nunca consultada por dentro — não há "buscar cartazes que
-- tenham a fonte X". Coluna por campo não comporta a lista; tabela própria
-- traria join e ordem para um dado que só o próprio cartaz usa.
--
-- Formato de cada item:
--   { id, tipo: 'texto' | 'logo',
--     x, y,                     -- centro, em FRAÇÃO do cartaz (0..1)
--     texto, fonte, tamanho,    -- só em tipo 'texto'
--     negrito, italico, cor,
--     url, escala }             -- só em tipo 'logo'
--
-- As posições são fração e não pixel de propósito: o mesmo cartaz é desenhado
-- no selo da prévia, no canvas de 720×1080 e no PDF, e fração é o único jeito
-- de o elemento cair no mesmo lugar nos três.

alter table public.restaurantes
  add column if not exists qr_elementos jsonb not null default '[]'::jsonb;

comment on column public.restaurantes.qr_elementos is
  'Textos e logo que o dono posicionou no cartaz do QR. Lista de objetos; x/y são o centro em fração do cartaz (0..1). O ícone do Easy Feed no centro do QR e o rodapé "feito com Easy Feed" NÃO ficam aqui — são fixos e não editáveis.';

-- Rede de segurança: o app sempre grava uma lista, e uma escrita malformada
-- (objeto solto, string) quebraria o desenho do cartaz para o restaurante
-- inteiro, num campo que ninguém revisa.
alter table public.restaurantes
  drop constraint if exists restaurantes_qr_elementos_lista;
alter table public.restaurantes
  add constraint restaurantes_qr_elementos_lista
  check (jsonb_typeof(qr_elementos) = 'array');
