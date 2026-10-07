/**
 * O painel do EasyFeed Influencers: o formato do que vem do banco
 * (`influencers_painel`) e as contas da tela. Sem React nem Supabase, para dar
 * para testar no Node.
 */

export type TipoPonto = 'reclamacao' | 'elogio' | 'sugestao' | 'neutro'

export interface TemaPainel {
  tipo: TipoPonto
  rotulo: string
  mencoes: number
  mencoes_anterior: number
  /** Citado em mais de um restaurante. */
  comum: boolean
}

export interface CategoriaPainel {
  nome: string
  reclamacoes: number
  elogios: number
  sugestoes: number
  neutros: number
  total: number
  total_anterior: number
}

export interface DadosPainel {
  periodo: { dias: number }
  culinaria: string | null
  culinarias: string[]
  totais: { pontos: number; reclamacoes: number; elogios: number; sugestoes: number; neutros: number; pontos_anterior: number }
  categorias: CategoriaPainel[]
  temas: TemaPainel[]
  em_alta: TemaPainel[]
  frases: { tipo: TipoPonto; texto: string; categoria: string }[]
  evolucao: { intervalo: 'dia' | 'semana'; pontos: { inicio: string; reclamacoes: number; elogios: number; sugestoes: number }[] }
}

/** "comida fria" → "Comida fria". */
export function rotuloBonito(rotulo: string): string {
  const t = rotulo.trim()
  return t ? t[0].toLocaleUpperCase('pt-BR') + t.slice(1) : t
}

/** Porcentagem inteira; 0 quando não há base. */
export function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0
}

/** Variação contra o período anterior: null quando não havia nada antes (não dá para comparar). */
export function variacao(atual: number, anterior: number): number | null {
  return anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : null
}

export const ROTULO_TIPO: Record<TipoPonto, string> = {
  reclamacao: 'Reclamações',
  elogio: 'Elogios',
  sugestao: 'Sugestões',
  neutro: 'Neutros',
}

// ── Ideias de pauta ───────────────────────────────────────────────────────────

export interface Pauta {
  titulo: string
  /** De onde veio a ideia, com o número. */
  porque: string
}

/** Uma pauta por assunto, para quando ele lidera as reclamações. */
const PAUTA_DO_ASSUNTO: Record<string, string> = {
  'Comida': 'O erro na cozinha que mais vira reclamação, e como evitar',
  'Bebidas': 'Bebida errada, quente ou demorada: o que o cliente não perdoa',
  'Atendimento': 'O que faz o cliente reclamar do atendimento, nas palavras dele',
  'Ambiente': 'O que o cliente repara no ambiente assim que entra',
  'Limpeza': 'O detalhe de limpeza que o cliente sempre repara',
  'Preço': 'Como mostrar que o seu preço é justo antes de o cliente reclamar',
  'Tempo de Espera': 'Cliente esperando demais? Como cortar a espera sem contratar ninguém',
  'Reserva': 'A reserva que falha e faz o cliente não voltar',
  'Estacionamento': 'Estacionamento: o problema fora da cozinha que afasta clientes',
  'Acessibilidade': 'Acessibilidade: o que os clientes pedem e quase ninguém faz',
  'Música/Som': 'Música alta espanta cliente? O que os comentários mostram',
  'Cardápio/Variedade': 'Cardápio confuso ou repetitivo: o que os clientes pedem',
  'Higiene': 'Higiene: a reclamação que mais derruba um restaurante',
}

const vezes = (n: number) => (n === 1 ? '1 vez' : `${n} vezes`)

export function ideiasDePauta(d: DadosPainel): Pauta[] {
  const pautas: Pauta[] = []
  const periodo = `nos últimos ${d.periodo.dias} dias`
  const emVarios = (t: TemaPainel) => (t.comum ? ', em mais de um restaurante' : '')
  const primeiro = (tipo: TipoPonto) => d.temas.filter((t) => t.tipo === tipo).sort((a, b) => b.mencoes - a.mencoes)[0]

  const assunto = [...d.categorias].filter((c) => c.reclamacoes > 0 && PAUTA_DO_ASSUNTO[c.nome]).sort((a, b) => b.reclamacoes - a.reclamacoes)[0]
  if (assunto) {
    pautas.push({
      titulo: PAUTA_DO_ASSUNTO[assunto.nome],
      porque: `${pct(assunto.reclamacoes, d.totais.reclamacoes)}% das reclamações ${periodo} são sobre ${assunto.nome}.`,
    })
  }

  const reclamacao = primeiro('reclamacao')
  if (reclamacao) {
    pautas.push({
      titulo: `“${rotuloBonito(reclamacao.rotulo)}”: a reclamação que mais aparece e como resolver`,
      porque: `Citada ${vezes(reclamacao.mencoes)} ${periodo}${emVarios(reclamacao)}.`,
    })
  }

  const elogio = primeiro('elogio')
  if (elogio) {
    pautas.push({
      titulo: `O que faz o cliente elogiar: “${rotuloBonito(elogio.rotulo).toLocaleLowerCase('pt-BR')}”`,
      porque: `O elogio mais repetido ${periodo}: ${vezes(elogio.mencoes)}${emVarios(elogio)}.`,
    })
  }

  const sugestao = primeiro('sugestao')
  if (sugestao) {
    pautas.push({
      titulo: `O que os clientes estão pedindo: “${rotuloBonito(sugestao.rotulo).toLocaleLowerCase('pt-BR')}”`,
      porque: `Sugestão que apareceu ${vezes(sugestao.mencoes)} ${periodo}.`,
    })
  }

  // O que mais cresceu e ainda não virou pauta acima (neutro não rende vídeo).
  const jaUsados = new Set([reclamacao?.rotulo, elogio?.rotulo, sugestao?.rotulo])
  const alta = d.em_alta.find((t) => t.tipo !== 'neutro' && !jaUsados.has(t.rotulo))
  if (alta) {
    pautas.push({
      titulo: `Está crescendo: “${rotuloBonito(alta.rotulo).toLocaleLowerCase('pt-BR')}”`,
      porque: alta.mencoes_anterior > 0
        ? `Passou de ${alta.mencoes_anterior} para ${alta.mencoes} menções, comparando com o período anterior.`
        : `Apareceu ${vezes(alta.mencoes)} ${periodo}, e não tinha aparecido no período anterior.`,
    })
  }

  // Sem repetir título.
  return pautas.filter((p, i) => pautas.findIndex((q) => q.titulo === p.titulo) === i)
}

// ── Valor em reais (painel do admin) ─────────────────────────────────────────

/** "12,50" ou "12.50" ou "R$ 12" → 12.5; vazio → null; inválido → NaN. */
export function lerValorEmReais(texto: string): number | null {
  const limpo = texto.replace(/r\$/i, '').replace(/\s/g, '')
  if (!limpo) return null
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(normalizado)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
