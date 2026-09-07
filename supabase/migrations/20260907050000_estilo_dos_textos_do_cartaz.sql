-- Os textos fixos do cartaz (rótulo, nome e mensagem) passam a ter os mesmos
-- controles de um texto livre: fonte, corpo, negrito, itálico e cor.
--
-- Tudo num jsonb só, e não em três colunas por propriedade, porque é sempre
-- lido e gravado junto — e porque a lista de propriedades ainda deve crescer
-- (alinhamento, sombra), o que viraria migração nova a cada vez.
--
-- Formato:
--   { "rotulo":   { "fonte": "playfair", "tamanho": 24, "negrito": true,
--                   "italico": false, "cor": "#8A6A45" },
--     "titulo":   { ... },
--     "mensagem": { ... } }
--
-- Ausente ou incompleto = o desenho de sempre. Cada campo cai no padrão
-- sozinho (ver `lerEstiloDosTextos` em cartaz-elementos.ts), então nenhum
-- cartaz existente muda de aparência.
alter table public.restaurantes
  add column if not exists qr_textos_estilo jsonb;

comment on column public.restaurantes.qr_textos_estilo is
  'Fonte/corpo/negrito/itálico/cor dos textos fixos do cartaz (rotulo, titulo, mensagem). Null = padrão do tema.';
