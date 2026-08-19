/**
 * Estilo visual (ícone + cor) de cada categoria de feedback — PADRÃO ÚNICO pra
 * todo o sistema. Qualquer tela que precise mostrar/relacionar algo a uma
 * categoria usa este arquivo, pra nunca ter duas cores diferentes pro mesmo
 * assunto em lugares diferentes do app.
 *
 * Estas são as ÚNICAS 14 categorias que existem — o n8n foi instruído a só
 * classificar feedbacks dentro desta lista (2026-08-19), e os dados antigos
 * com nomes diferentes já foram migrados pras categorias corretas (ver
 * `supabase/migrations/20260819000000_normaliza_categorias_feedback.sql`).
 * Não crie cor/ícone pra nenhum nome fora desta lista.
 *
 * ## Regra de cor
 * Só são proibidos os tons EXATOS já usados pra sentimento/atenção em outro
 * lugar do app (`src/lib/sentimento.ts`): o verde `#059669`, o vermelho
 * `#dc2626`/`#e11d48` e o âmbar `#d97706`. Fora esses três tons específicos,
 * qualquer cor vale — inclusive matizes de verde/vermelho/laranja, desde que
 * claramente diferentes dos tons reservados.
 *
 * Testei cada cor abaixo com o validador da skill de dataviz
 * (`validate_palette.js`, ΔE em OKLab) pra garantir que: (1) nenhuma delas é
 * confundível com os 3 tons reservados, e (2) as 7 são diferenciáveis entre
 * si a olho nu. Sete é o teto real que consegui validar — com 14 categorias,
 * a maioria das cores é dividida por 2 categorias (nunca 2 categorias comuns
 * no mesmo restaurante dividem a mesma cor: Comida, Ambiente, Atendimento,
 * Preço, Reserva e Tempo de Espera — as mais frequentes — estão todas em
 * cores diferentes entre si). O ícone (sempre diferente) desambigua o resto.
 */
import type { LucideIcon } from 'lucide-react'
import {
  UtensilsCrossed,
  CupSoda,
  Handshake,
  Armchair,
  Sparkles,
  Tag,
  Clock,
  CalendarCheck,
  SquareParking,
  Accessibility,
  Music,
  BookOpen,
  ShieldCheck,
  MoreHorizontal,
} from 'lucide-react'

export interface EstiloCategoria {
  icon: LucideIcon
  /** Ícone/texto quando a categoria aparece "normal" (sem destaque). */
  corTexto: string
  /** Bolinha/selo sólido (ex.: contador com fundo cheio). */
  corSolida: string
  /** Fundo do card em destaque. */
  corFundo: string
  /** Borda do card em destaque (mesma família da corFundo). */
  corBorda: string
}

export const CATEGORIAS_FEEDBACK = [
  'Comida',
  'Bebidas',
  'Atendimento',
  'Ambiente',
  'Limpeza',
  'Preço',
  'Tempo de Espera',
  'Reserva',
  'Estacionamento',
  'Acessibilidade',
  'Música/Som',
  'Cardápio/Variedade',
  'Higiene',
  'Outros',
] as const

export type CategoriaFeedback = (typeof CATEGORIAS_FEEDBACK)[number]

// As 7 cores vivas validadas (ver comentário acima) — hex fixo em vez de nome
// Tailwind, porque nenhuma combinação de famílias Tailwind testada ficou
// realmente distinguível nas 7 posições que eu precisava.
const VERDE = { corTexto: 'text-[#9db620]', corSolida: 'bg-[#9db620]', corFundo: 'bg-[#eef2d9]', corBorda: 'border-[#dde6b3]' }
const CIANO = { corTexto: 'text-[#20aab6]', corSolida: 'bg-[#20aab6]', corFundo: 'bg-[#d9f0f2]', corBorda: 'border-[#b3e1e6]' }
const CELESTE = { corTexto: 'text-[#2066b6]', corSolida: 'bg-[#2066b6]', corFundo: 'bg-[#d9e5f2]', corBorda: 'border-[#b3cae6]' }
const AZUL = { corTexto: 'text-[#2b2eda]', corSolida: 'bg-[#2b2eda]', corFundo: 'bg-[#d9d9f2]', corBorda: 'border-[#b3b3e6]' }
const ROXO = { corTexto: 'text-[#6120b6]', corSolida: 'bg-[#6120b6]', corFundo: 'bg-[#e4d9f2]', corBorda: 'border-[#c9b3e6]' }
const VIOLETA = { corTexto: 'text-[#a520b6]', corSolida: 'bg-[#a520b6]', corFundo: 'bg-[#efd9f2]', corBorda: 'border-[#e0b3e6]' }
const MAGENTA = { corTexto: 'text-[#b62084]', corSolida: 'bg-[#b62084]', corFundo: 'bg-[#f2d9ea]', corBorda: 'border-[#e6b3d5]' }

const ESTILOS: Record<CategoriaFeedback, EstiloCategoria> = {
  // Verde — comida & higiene
  Comida: { icon: UtensilsCrossed, ...VERDE },
  Higiene: { icon: ShieldCheck, ...VERDE },

  // Ciano — ambiente & limpeza (tudo "espaço/frescor")
  Ambiente: { icon: Armchair, ...CIANO },
  Limpeza: { icon: Sparkles, ...CIANO },

  // Celeste — reserva & estacionamento (logística de chegada)
  Reserva: { icon: CalendarCheck, ...CELESTE },
  Estacionamento: { icon: SquareParking, ...CELESTE },

  // Azul — acessibilidade (padrão internacional, ISO 7001) & tempo de espera
  Acessibilidade: { icon: Accessibility, ...AZUL },
  'Tempo de Espera': { icon: Clock, ...AZUL },

  // Roxo — atendimento & cardápio
  Atendimento: { icon: Handshake, ...ROXO },
  'Cardápio/Variedade': { icon: BookOpen, ...ROXO },

  // Violeta — bebidas & música
  Bebidas: { icon: CupSoda, ...VIOLETA },
  'Música/Som': { icon: Music, ...VIOLETA },

  // Magenta — preço (sozinha: sobrou uma cor sem par)
  'Preço': { icon: Tag, ...MAGENTA },

  // Neutro — "outros" não tem identidade própria, de propósito
  Outros: {
    icon: MoreHorizontal,
    corTexto: 'text-gray-500',
    corSolida: 'bg-gray-400',
    corFundo: 'bg-gray-200',
    corBorda: 'border-gray-300',
  },
}

const ESTILO_PADRAO = ESTILOS.Outros

/**
 * Estilo de uma categoria pelo nome — só bate com as 14 categorias oficiais
 * (ignorando acento/caixa, pra não quebrar por causa de "preço" vs "Preço").
 * Qualquer outro nome cai no estilo neutro de "Outros" em vez de quebrar a tela.
 */
export function estiloCategoria(nome: string | null | undefined): EstiloCategoria {
  if (!nome) return ESTILO_PADRAO
  const alvo = nome.trim().toLowerCase()
  const cat = CATEGORIAS_FEEDBACK.find((c) => c.toLowerCase() === alvo)
  return cat ? ESTILOS[cat] : ESTILO_PADRAO
}
