-- Sobra da fusão `usuarios` + `config_restaurantes` -> `restaurantes`.
--
-- O gatilho `on_auth_user_deleted` chamava `handle_auth_user_delete()`, que
-- executa `DELETE FROM public.usuarios` — tabela que deixou de existir naquela
-- refatoração. Resultado: TODA exclusão de usuário em auth.users falhava com
-- "relation public.usuarios does not exist", inclusive pelo painel do Supabase.
--
-- Não recriamos o gatilho apontando para `restaurantes`: metade das tabelas
-- filhas (feedbacks_restaurante, insights, categorias, relatorios,
-- acoes_operacionais, notificacoes) tem FK sem CASCADE, então apagar a linha
-- quebraria em qualquer conta com dados. A FK restaurantes_auth_user_id_fkey
-- já é ON DELETE SET NULL: a linha do restaurante sobrevive desacoplada e os
-- dados ficam preservados.

drop trigger if exists on_auth_user_deleted on auth.users;
drop function if exists public.handle_auth_user_delete();
