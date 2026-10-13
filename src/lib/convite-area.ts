import { conviteDoEndereco, type ConviteDeArea } from '@/lib/areas'

/* O convite de versão (`?area=rh&convite=CODIGO`), guardado no navegador.
   A pessoa chega pelo link, cria e-mail e senha (às vezes confirma o e-mail em
   outra aba, às vezes paga antes) e só depois cai na tela de escolha: o convite
   precisa sobreviver a esse caminho. Mesmo desenho do código de indicação
   (`lerCodigoIndicacao` em queries/stripe.ts). Quem confere o código é o banco. */

const CHAVE = 'easyfeed_convite_area'
const DIAS = 30

/** O convite do endereço (que passa a ficar guardado) ou o que já estava guardado. */
export function lerConviteDeArea(): ConviteDeArea | null {
  const doEndereco = typeof window !== 'undefined' ? conviteDoEndereco(window.location.search) : null
  if (doEndereco) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ ...doEndereco, expira: Date.now() + DIAS * 24 * 60 * 60 * 1000 }))
    } catch { /* sem storage */ }
    return doEndereco
  }
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return null
    const { area, convite, expira } = JSON.parse(bruto) as ConviteDeArea & { expira: number }
    if (Date.now() > expira) {
      localStorage.removeItem(CHAVE)
      return null
    }
    return conviteDoEndereco(`?area=${area}&convite=${convite}`)
  } catch {
    return null
  }
}

/** Depois de escolher (ou de o banco recusar o código), o convite não serve mais. */
export function esquecerConviteDeArea() {
  try { localStorage.removeItem(CHAVE) } catch { /* sem storage */ }
}
