/**
 * Modo demonstração: a conta de um vendedor aberta por código, por 2 h, no
 * computador de outra pessoa.
 *
 * Tudo acontece sob o prefixo /demo. O ENDEREÇO decide só duas coisas: o app
 * monta as rotas com esse prefixo, e o login fica guardado apenas nesta aba,
 * com uma chave própria (ver `client.ts` e `auth-storage.ts`). Quem decide o que
 * fica bloqueado é a SESSÃO (`meu_acesso` no banco): tirar o /demo da URL não
 * tira ninguém da demonstração.
 */
export const PREFIXO_DEMO = '/demo'

export function ehEnderecoDemo(pathname: string): boolean {
  return pathname === PREFIXO_DEMO || pathname.startsWith(`${PREFIXO_DEMO}/`)
}

/** Avaliado uma vez, no carregamento: entrar ou sair do modo sempre recarrega a página. */
export const MODO_DEMO = typeof window !== 'undefined' && ehEnderecoDemo(window.location.pathname)

/** Rotas que não abrem na demonstração: mexem na conta de verdade do vendedor. */
export const ROTAS_BLOQUEADAS_NA_DEMO = ['/minha-conta', '/assinatura', '/checkout', '/checkout/sucesso', '/admin']

/** Quanto antes do fim aparece o aviso: 5 min; numa demonstração encurtada para 5 min ou menos, 1 min. */
export function avisoAntesMs(duracaoMinutos: number): number {
  return (duracaoMinutos <= 5 ? 1 : 5) * 60_000
}
