-- Os textos fixos do topo do cartaz viram editáveis pelo dono.
--
-- Antes, o rótulo era a palavra "RESTAURANTE" cravada no código e o título era
-- obrigatoriamente `nome_restaurante`. Só que o cartaz é material impresso da
-- casa: quem é bar quer "BAR", quem tem nome comprido no cadastro quer o nome
-- curto na parede, e a mensagem ao cliente já era editável — a inconsistência
-- era o resto não ser.
--
-- Ambas nulas = usa o padrão de sempre (rótulo "RESTAURANTE" e o nome do
-- cadastro), então nenhum cartaz existente muda de aparência.
alter table public.restaurantes
  add column if not exists qr_rotulo text,
  add column if not exists qr_titulo text;

comment on column public.restaurantes.qr_rotulo is
  'Palavra pequena acima do nome no cartaz do QR. Null = "RESTAURANTE". String vazia = sem rótulo.';
comment on column public.restaurantes.qr_titulo is
  'Nome grande no cartaz do QR. Null = usa `nome_restaurante`.';
