-- Uma conta de auth = no máximo uma linha em restaurantes.
--
-- Sem isso existia um caminho de duplicação em cascata: `use-auth` busca o
-- cadastro com .single(), e o PostgREST devolve o MESMO código de erro
-- (PGRST116) tanto para "nenhuma linha" quanto para "mais de uma". O tratamento
-- desse erro insere uma linha nova — ou seja, a partir da primeira duplicata
-- cada login criaria mais uma.
--
-- Índice parcial: as 2 linhas legadas com auth_user_id nulo continuam válidas.

create unique index if not exists idx_restaurantes_auth_user_id_unico
  on public.restaurantes (auth_user_id)
  where auth_user_id is not null;
