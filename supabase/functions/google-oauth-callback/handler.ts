// Volta do Google depois que o dono escolhe a conta e autoriza (ou recusa).
// Sem nada do Deno nem do banco: o index.ts liga as dependências, e o teste
// roda isto com um Google e um banco de mentira.

import { ErroGoogle, ESCOPO, locaisDeTodasAsContas, type ClienteGoogle, type LocalGoogle } from '../_shared/google-perfil.ts'

/** O `state` vale por 10 minutos: protege contra quem forja a volta do Google. */
export const VALIDADE_ESTADO_MS = 10 * 60_000

export interface DepsCallback {
  google: Pick<ClienteGoogle, 'trocarCodigo' | 'revogar' | 'contas' | 'locais'>
  redirectUri: string
  /** URL do site, sem barra no fim. */
  site: string
  /** Lê e apaga o state (uso único). */
  consumirEstado: (state: string) => Promise<{ restauranteId: number; criadoEm: string } | null>
  guardarToken: (restauranteId: number, refreshToken: string) => Promise<void>
  aplicarLocais: (restauranteId: number, locais: LocalGoogle[]) => Promise<'conectado' | 'escolher_local' | 'sem_local'>
  marcarAguardandoGoogle: (restauranteId: number) => Promise<void>
  sincronizar: (restauranteId: number) => Promise<void>
  agora?: () => number
}

export function criarCallback(deps: DepsCallback) {
  const voltar = (p: Record<string, string>) => Response.redirect(`${deps.site}/google?${new URLSearchParams(p)}`, 302)

  return async (req: Request): Promise<Response> => {
    const q = new URL(req.url).searchParams
    const state = q.get('state') ?? ''
    if (!state) return voltar({ erro: 'estado' })

    const registro = await deps.consumirEstado(state)
    const agora = deps.agora?.() ?? Date.now()
    if (!registro || agora - new Date(registro.criadoEm).getTime() > VALIDADE_ESTADO_MS) return voltar({ erro: 'estado' })
    const restauranteId = registro.restauranteId

    const erroGoogle = q.get('error')
    if (erroGoogle) return voltar({ erro: erroGoogle === 'access_denied' ? 'negado' : 'google' })
    const codigo = q.get('code')
    if (!codigo) return voltar({ erro: 'google' })

    try {
      const tokens = await deps.google.trocarCodigo(codigo, deps.redirectUri)
      // O dono pode desmarcar a permissão na tela do Google.
      if (!tokens.escopos.includes(ESCOPO)) {
        await deps.google.revogar(tokens.accessToken)
        return voltar({ erro: 'permissao' })
      }
      if (!tokens.refreshToken) return voltar({ erro: 'sem_token' })
      await deps.guardarToken(restauranteId, tokens.refreshToken)

      let locais: LocalGoogle[]
      try {
        locais = await locaisDeTodasAsContas(deps.google, tokens.accessToken)
      } catch (e) {
        // Antes de o Google liberar a API (cota 0), a conexão fica esperando
        // com o token guardado; "Tentar de novo" na tela busca os locais.
        if (e instanceof ErroGoogle && e.motivo === 'acesso_nao_liberado') {
          await deps.marcarAguardandoGoogle(restauranteId)
          return voltar({ erro: 'acesso_nao_liberado' })
        }
        throw e
      }

      const status = await deps.aplicarLocais(restauranteId, locais)
      if (status === 'sem_local') return voltar({ erro: 'sem_local' })
      if (status === 'escolher_local') return voltar({ escolher: '1' })
      await deps.sincronizar(restauranteId).catch(() => {})
      return voltar({ conectado: '1' })
    } catch (e) {
      console.error('google-oauth-callback:', e)
      return voltar({ erro: e instanceof ErroGoogle && e.motivo === 'sem_permissao' ? 'sem_permissao' : 'google' })
    }
  }
}
