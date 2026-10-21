/**
 * Admin → Receita (sem React, para os testes rodarem no Node).
 *
 * Pedido do Raver (21/10/2026): acabou a divisão da receita entre pessoas.
 * Cada software tem UMA conta onde cai o dinheiro da empresa (tabela
 * `receita_contas`), e dá para trazer a conta de um software para o outro.
 */

export type Software = 'restaurante' | 'rh'

/** A conta onde cai o dinheiro de um software. */
export interface ContaDaReceita {
  area: Software
  titular: string | null
  cpf_cnpj: string | null
  chave_pix: string | null
  codigo_banco: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo_conta: 'corrente' | 'poupanca' | null
  observacoes: string | null
}

/** Os campos que se copiam de um software para o outro (tudo menos o software). */
export const CAMPOS_DA_CONTA = ['titular', 'cpf_cnpj', 'chave_pix', 'codigo_banco', 'banco', 'agencia', 'conta', 'tipo_conta', 'observacoes'] as const

export const contaVazia = (area: Software): ContaDaReceita => ({
  area, titular: null, cpf_cnpj: null, chave_pix: null, codigo_banco: null, banco: null, agencia: null, conta: null, tipo_conta: 'corrente', observacoes: null,
})

/** A conta do outro software trazida para este: os mesmos dados, o software continua o deste. */
export function trazerConta(de: ContaDaReceita, para: Software): ContaDaReceita {
  return { ...de, area: para }
}

/** A conta tem algum dado preenchido (para saber se vale trazer). */
export const contaPreenchida = (c: ContaDaReceita | null | undefined): boolean =>
  !!c && CAMPOS_DA_CONTA.some((campo) => campo !== 'tipo_conta' && !!String(c[campo] ?? '').trim())

/** O que falta para o dinheiro conseguir cair na conta. */
export function oQueFalta(r: Pick<ContaDaReceita, 'chave_pix' | 'conta' | 'agencia' | 'codigo_banco' | 'cpf_cnpj'>): string[] {
  const tem = (v: string | null) => !!v && !!v.trim()
  const falta: string[] = []
  const temConta = tem(r.conta) && tem(r.agencia) && tem(r.codigo_banco)
  if (!tem(r.chave_pix) && !temConta) falta.push('chave Pix ou conta bancária')
  if (!tem(r.cpf_cnpj)) falta.push('CPF ou CNPJ')
  return falta
}

/** A porcentagem digitada (aceita vírgula), entre 0 e 100; null se não serve. */
export function lerPorcentagem(texto: string): number | null {
  const n = Number(String(texto).trim().replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null
}

export const formatarPorcentagem = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')}%`

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
