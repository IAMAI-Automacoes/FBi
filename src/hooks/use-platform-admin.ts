import { useAuth } from '@/hooks/use-auth'

/* Admin da plataforma (tabela `platform_admins`).

   Antes este hook fazia a própria consulta ao banco, e cada componente que o
   usava disparava mais uma — Admin, TopHeader, e agora o gate de rota e as
   permissões seriam quatro requisições idênticas por sessão. Pior: o `loading`
   dele corria por fora do fluxo de autenticação, então o gate de rota decidia
   no primeiro render com `isAdmin=false` e expulsava o admin antes da resposta
   chegar.

   Agora o estado vive no AuthProvider e resolve junto com o usuário. A
   assinatura `{ isAdmin, loading }` foi mantida para não mexer em quem já
   consome o hook. */
export function usePlatformAdmin() {
  const { ehAdminPlataforma, loading, buscandoUsuario } = useAuth()
  return { isAdmin: ehAdminPlataforma, loading: loading || buscandoUsuario }
}

/* Quem abre o Painel Admin: o admin da plataforma (tudo) ou o admin parceiro
   (só Suporte, WhatsApp e Contas, nas contas da versão Restaurante — quem
   garante é o banco, nas regras `parceiro_*`; aqui é só o que aparece). */
export function usePainelAdmin() {
  const { ehAdminPlataforma, ehAdminParceiro, loading, buscandoUsuario } = useAuth()
  return {
    podeAbrir: ehAdminPlataforma || ehAdminParceiro,
    /** Parceiro e não admin: o painel reduzido. */
    parceiro: !ehAdminPlataforma && ehAdminParceiro,
    loading: loading || buscandoUsuario,
  }
}
