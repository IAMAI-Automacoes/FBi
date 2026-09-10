-- Marco de leitura da aba Feedbacks, para o numerozinho de notificação na
-- barra lateral.
--
-- `now()` como padrão, e não null: um restaurante já em produção tem meses de
-- feedback negativo no histórico, e nascer com a coluna vazia faria o primeiro
-- cálculo do badge contar tudo isso como "não lido" — um "500" no ícone no
-- primeiro carregamento depois do deploy, sem relação com o que de fato chegou
-- de novo.
alter table public.restaurantes
  add column if not exists feedbacks_visto_em timestamptz not null default now();

comment on column public.restaurantes.feedbacks_visto_em is
  'Quando o dono abriu a aba Feedbacks pela última vez. Usado só para contar quantos feedbacks negativos chegaram depois disso (numerozinho da barra lateral) — não é auditoria de leitura.';
