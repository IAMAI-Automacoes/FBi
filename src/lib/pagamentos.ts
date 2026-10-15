/**
 * Admin → Pagamentos (sem React, para os testes rodarem no Node).
 *
 * Pedido do Raver (15/10/2026): Caio, Raver e Guilherme são os donos de todos
 * os softwares (40% / 40% / 20% de padrão). Os dados de cada pessoa valem para
 * todos os softwares; a % é de cada software. A receita de um software se divide
 * entre as pessoas DELE (gerar_repasses_da_fatura, no banco).
 */

export interface Recebedor {
  id: string
  nome: string
  email: string | null
  cpf_cnpj: string | null
  chave_pix: string | null
  codigo_banco: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo_conta: 'corrente' | 'poupanca' | null
  observacoes: string | null
}

/** A parte de uma pessoa num software. */
export interface ParteDaDivisao {
  id: string
  recebedor_id: string | null
  /** O nome que aparece (o da pessoa; nas linhas antigas sem pessoa, o da linha). */
  nome: string
  valor: number
  ativo: boolean
}

/** Os donos de padrão, com a % de cada um em todo software novo. */
export const DONOS_PADRAO: readonly { nome: string; porcentagem: number }[] = [
  { nome: 'Caio', porcentagem: 40 },
  { nome: 'Raver', porcentagem: 40 },
  { nome: 'Guilherme', porcentagem: 20 },
]

/** A soma das partes ligadas, com duas casas (evita 99,99999). */
export const somaDasPartes = (partes: readonly ParteDaDivisao[]) =>
  Math.round(partes.filter((p) => p.ativo).reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100

/** Como está a soma: certa (100%), faltando ou passando. */
export function situacaoDaSoma(partes: readonly ParteDaDivisao[]): { soma: number; ok: boolean; texto: string } {
  const soma = somaDasPartes(partes)
  if (Math.abs(soma - 100) < 0.01) return { soma, ok: true, texto: 'Soma 100%.' }
  return soma < 100
    ? { soma, ok: false, texto: `Soma ${formatarPorcentagem(soma)}: faltam ${formatarPorcentagem(100 - soma)} para dar 100%.` }
    : { soma, ok: false, texto: `Soma ${formatarPorcentagem(soma)}: passou ${formatarPorcentagem(soma - 100)} de 100%.` }
}

export const formatarPorcentagem = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')}%`

/** A porcentagem digitada (aceita vírgula), entre 0 e 100; null se não serve. */
export function lerPorcentagem(texto: string): number | null {
  const n = Number(String(texto).trim().replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null
}

/** O que falta para conseguir pagar a pessoa. */
export function oQueFalta(r: Pick<Recebedor, 'chave_pix' | 'conta' | 'agencia' | 'codigo_banco' | 'cpf_cnpj'>): string[] {
  const tem = (v: string | null) => !!v && !!v.trim()
  const falta: string[] = []
  const temConta = tem(r.conta) && tem(r.agencia) && tem(r.codigo_banco)
  if (!tem(r.chave_pix) && !temConta) falta.push('chave Pix ou conta bancária')
  if (!tem(r.cpf_cnpj)) falta.push('CPF ou CNPJ')
  return falta
}

// ── Bancos: digitar o código preenche o nome, e o contrário ──────────────────
/** Os bancos mais usados (código COMPE de 3 dígitos). */
export const BANCOS: readonly { codigo: string; nome: string }[] = [
  { codigo: '001', nome: 'Banco do Brasil' },
  { codigo: '033', nome: 'Santander' },
  { codigo: '041', nome: 'Banrisul' },
  { codigo: '070', nome: 'BRB' },
  { codigo: '077', nome: 'Banco Inter' },
  { codigo: '104', nome: 'Caixa Econômica Federal' },
  { codigo: '197', nome: 'Stone' },
  { codigo: '208', nome: 'BTG Pactual' },
  { codigo: '212', nome: 'Banco Original' },
  { codigo: '237', nome: 'Bradesco' },
  { codigo: '260', nome: 'Nubank' },
  { codigo: '290', nome: 'PagBank' },
  { codigo: '323', nome: 'Mercado Pago' },
  { codigo: '336', nome: 'C6 Bank' },
  { codigo: '341', nome: 'Itaú' },
  { codigo: '380', nome: 'PicPay' },
  { codigo: '403', nome: 'Cora' },
  { codigo: '422', nome: 'Safra' },
  { codigo: '748', nome: 'Sicredi' },
  { codigo: '756', nome: 'Sicoob' },
]

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** O nome do banco pelo código ("260" ou "0260" → "Nubank"); null se não conhece. */
export function nomeDoBanco(codigo: string | null | undefined): string | null {
  const so = String(codigo ?? '').replace(/\D/g, '')
  if (!so) return null
  const tres = so.slice(-3).padStart(3, '0')
  return BANCOS.find((b) => b.codigo === tres)?.nome ?? null
}

/** O código pelo nome ("itau", "Itaú Unibanco" → "341"); null se não conhece ou se é ambíguo. */
export function codigoDoBanco(nome: string | null | undefined): string | null {
  const alvo = semAcento(String(nome ?? ''))
  if (alvo.length < 2) return null
  const exato = BANCOS.find((b) => semAcento(b.nome) === alvo)
  if (exato) return exato.codigo
  const parecidos = BANCOS.filter((b) => alvo.includes(semAcento(b.nome)) || semAcento(b.nome).startsWith(alvo))
  return parecidos.length === 1 ? parecidos[0].codigo : null
}
