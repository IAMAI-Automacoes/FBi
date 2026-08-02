/* Destino para onde mandar o usuário depois de logar ou criar conta.

   `RotaProtegida` guarda o `location` inteiro em `state.from` ao barrar uma
   rota protegida. Ler só o `pathname` de lá perde a query string — e é
   justamente nela que viaja o ciclo escolhido no fluxo de assinatura
   (`/checkout?ciclo=anual`). Sem isso, quem escolhe o plano anual na landing
   cairia no checkout sem plano nenhum. */

interface OrigemNavegacao {
  pathname?: string
  search?: string
}

export function destinoPosAuth(state: unknown, padrao = '/'): string {
  const origem = (state as { from?: OrigemNavegacao } | null | undefined)?.from
  if (!origem?.pathname) return padrao
  return `${origem.pathname}${origem.search ?? ''}`
}
