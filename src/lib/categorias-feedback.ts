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
 * ## Por que só 4 cores vivas (+ 2 neutras) pra 14 categorias
 * Cor NÃO pode ser: verde/esmeralda (sentimento positivo), vermelho/rosa
 * (sentimento negativo), âmbar/amarelo (banners de "atenção" em Relatórios/
 * Visão Geral) — em todo o app. Isso já apaga quase metade do círculo de cores.
 * Testei o resto com o validador da skill de dataviz (`validate_palette.js`,
 * ΔE em OKLab, com simulação de daltonismo) e a maioria dos pares "parecidos
 * o bastante pro olho, mas com nome Tailwind diferente" FALHA de verdade — até
 * cores que pareciam óbvias (azul vs violeta, azul vs índigo, verde vs lima)
 * são quase indistinguíveis pra quem tem daltonismo, e olhando só o texto,
 * também para visão normal. Só sobraram 4 tons realmente distintos entre si
 * e das cores reservadas: verde, ciano, azul, magenta (hex abaixo, testados).
 * Com 14 categorias e 4 cores, 3 categorias dividem cada cor — a diferença
 * entre elas fica por conta do ÍCONE (sempre diferente) e do nome, nunca só
 * da cor. Categorias que dividem cor foram agrupadas pra minimizar a chance
 * de aparecerem lado a lado na prática (ex.: as 3 mais comuns hoje — Comida,
 * Ambiente, Atendimento — estão em cores DIFERENTES entre si).
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

// As 4 cores vivas validadas (ver comentário acima) — hex fixo em vez de nome
// Tailwind, porque nenhum par de famílias Tailwind testado ficou realmente
// distinguível nas 4 posições que eu precisava.
const VERDE = { corTexto: 'text-[#3b9e1a]', corSolida: 'bg-[#3b9e1a]', corFundo: 'bg-[#d8f1d0]', corBorda: 'border-[#b7e6a8]' }
const CIANO = { corTexto: 'text-[#1f76c1]', corSolida: 'bg-[#1f76c1]', corFundo: 'bg-[#d0e2f1]', corBorda: 'border-[#a8c9e6]' }
const AZUL = { corTexto: 'text-[#1f3ac1]', corSolida: 'bg-[#1f3ac1]', corFundo: 'bg-[#d0d5f1]', corBorda: 'border-[#a8b2e6]' }
const MAGENTA = { corTexto: 'text-[#c11f8b]', corSolida: 'bg-[#c11f8b]', corFundo: 'bg-[#f1d0e6]', corBorda: 'border-[#e6a8d1]' }

const ESTILOS: Record<CategoriaFeedback, EstiloCategoria> = {
  // Verde — comida/bebida/higiene (tudo "consumo & limpo")
  Comida: { icon: UtensilsCrossed, ...VERDE },
  Bebidas: { icon: CupSoda, ...VERDE },
  Higiene: { icon: ShieldCheck, ...VERDE },

  // Ciano — ambiente/limpeza/reserva
  Ambiente: { icon: Armchair, ...CIANO },
  Limpeza: { icon: Sparkles, ...CIANO },
  Reserva: { icon: CalendarCheck, ...CIANO },

  // Azul — acessibilidade (é o padrão internacional — ISO 7001), preço, espera
  Acessibilidade: { icon: Accessibility, ...AZUL },
  'Preço': { icon: Tag, ...AZUL },
  'Tempo de Espera': { icon: Clock, ...AZUL },

  // Magenta — atendimento/música/cardápio (tudo "experiência")
  Atendimento: { icon: Handshake, ...MAGENTA },
  'Música/Som': { icon: Music, ...MAGENTA },
  'Cardápio/Variedade': { icon: BookOpen, ...MAGENTA },

  // Neutras — sem cor de identidade própria, de propósito
  Estacionamento: {
    icon: SquareParking,
    corTexto: 'text-slate-600',
    corSolida: 'bg-slate-500',
    corFundo: 'bg-slate-200',
    corBorda: 'border-slate-300',
  },
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
