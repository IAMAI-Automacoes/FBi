-- Marca quando o dono terminou de configurar a página do cliente.
--
-- É o que separa os dois modos da tela de personalizar. Enquanto for nulo, ela
-- leva pelos dois passos em sequência — cartaz impresso, depois página do
-- cliente —, porque na primeira vez ninguém sabe que a segunda existe. Depois
-- disso a tela abre no resumo, com as duas prévias lado a lado, e cada uma se
-- edita sozinha: quem volta ali quer mexer numa coisa específica, não refazer
-- o caminho todo.
alter table public.restaurantes
  add column if not exists cliente_configurado_em timestamptz;

comment on column public.restaurantes.cliente_configurado_em is
  'Quando o dono salvou a pagina do cliente pela primeira vez. Enquanto for nulo, a tela de personalizar leva ele pelos dois passos em sequencia; depois disso ela abre no resumo, com as duas previas lado a lado.';
