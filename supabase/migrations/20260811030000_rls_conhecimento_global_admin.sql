-- Base de conhecimento GLOBAL da plataforma (documentos_ia/documento_trechos com
-- restaurante_id = NULL, escopo = 'global'). É compartilhada com TODOS os
-- restaurantes pela busca da IA (buscar_conhecimento_para inclui restaurante_id IS NULL).
--
-- As policies existentes (documentos_* / trechos_*) prendem cada restaurante aos
-- seus próprios documentos. Aqui damos ao ADMIN DA PLATAFORMA (tabela
-- platform_admins, casada por email) o direito de criar/editar/apagar os globais
-- pela tela do painel admin. Leitura dos globais já é liberada a todos pelas
-- policies de SELECT existentes (… OR restaurante_id IS NULL).

create policy admins_docs_global_insert on public.documentos_ia
  for insert to authenticated
  with check (
    restaurante_id is null
    and exists (select 1 from public.platform_admins pa where pa.email = auth.email())
  );

create policy admins_docs_global_update on public.documentos_ia
  for update to authenticated
  using (
    restaurante_id is null
    and exists (select 1 from public.platform_admins pa where pa.email = auth.email())
  )
  with check (
    restaurante_id is null
    and exists (select 1 from public.platform_admins pa where pa.email = auth.email())
  );

create policy admins_docs_global_delete on public.documentos_ia
  for delete to authenticated
  using (
    restaurante_id is null
    and exists (select 1 from public.platform_admins pa where pa.email = auth.email())
  );

-- documento_trechos: o DELETE dos trechos é feito por CASCADE (FK documento_id
-- ON DELETE CASCADE), que ignora RLS do filho — basta liberar o INSERT global.
create policy admins_trechos_global_insert on public.documento_trechos
  for insert to authenticated
  with check (
    restaurante_id is null
    and exists (select 1 from public.platform_admins pa where pa.email = auth.email())
  );
