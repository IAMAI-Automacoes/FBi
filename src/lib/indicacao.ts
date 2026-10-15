/* ── Código de indicação (afiliado ou conta EasyFeed que indica) ──
   Vem do link `?ref=CODIGO` divulgado por quem indica. Fica guardado por 30
   dias no navegador: a pessoa pode entrar pelo link hoje e assinar na semana
   que vem. Quem digitar outro código no campo sobrescreve. A validação de
   verdade é no servidor, contra `afiliados.codigo`. */
const CHAVE_REF = 'easyfeed_ref'
const REF_DIAS = 30

export function lerCodigoIndicacao(): string {
  const daUrl = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase()
  if (daUrl && /^[A-Z0-9_-]{2,30}$/.test(daUrl)) {
    guardarCodigoIndicacao(daUrl)
    return daUrl
  }
  try {
    const raw = localStorage.getItem(CHAVE_REF)
    if (!raw) return ''
    const { codigo, expira } = JSON.parse(raw) as { codigo: string; expira: number }
    if (Date.now() > expira) {
      localStorage.removeItem(CHAVE_REF)
      return ''
    }
    return codigo
  } catch {
    return ''
  }
}

export function guardarCodigoIndicacao(codigo: string) {
  try {
    const limpo = codigo.trim().toUpperCase()
    if (!limpo) localStorage.removeItem(CHAVE_REF)
    else
      localStorage.setItem(
        CHAVE_REF,
        JSON.stringify({ codigo: limpo, expira: Date.now() + REF_DIAS * 24 * 60 * 60 * 1000 }),
      )
  } catch {
    /* sem storage */
  }
}
