-- Os textos da página do cliente passam a ser do dono.
--
-- Tudo o que aparece naquela tela é reescrevível — o rótulo acima do nome, o
-- nome, o pedido, o texto do botão e a linha abaixo dele. A única exceção é o
-- crédito do Easy Feed: é a marca do produto no material do cliente, e se
-- coubesse aqui bastaria apagar o campo pra sumir.
--
-- Ausente = usa o padrão. String VAZIA é uma escolha ("não quero esta linha"),
-- e por isso a leitura testa nulidade em vez de cair no falsy.
alter table public.restaurantes
  add column if not exists cliente_textos jsonb not null default '{}'::jsonb,
  add column if not exists cliente_textos_estilo jsonb not null default '{}'::jsonb;

comment on column public.restaurantes.cliente_textos is
  'O que o dono reescreveu nos textos da pagina do cliente: rotulo, nome, mensagem, botao, dica. Ausente = usa o padrao. String vazia = escolha de nao ter aquela linha.';
comment on column public.restaurantes.cliente_textos_estilo is
  'Tipografia desses textos (fonte, tamanho, negrito, italico, cor), por id.';
