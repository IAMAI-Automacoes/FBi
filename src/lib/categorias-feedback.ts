/**
 * Estilo visual (ícone + cor) de cada categoria de feedback — PADRÃO ÚNICO pra
 * todo o sistema. Qualquer tela que precise mostrar/relacionar algo a uma
 * categoria usa este arquivo, pra nunca ter duas cores ou dois ícones
 * diferentes pro mesmo assunto em lugares diferentes do app.
 *
 * Estas são as ÚNICAS 14 categorias que existem — o n8n foi instruído a só
 * classificar feedbacks dentro desta lista (2026-08-19), e os dados antigos
 * com nomes diferentes já foram migrados pras categorias corretas (ver
 * `supabase/migrations/20260819000000_normaliza_categorias_feedback.sql`).
 * Não crie cor/ícone pra nenhum nome fora desta lista.
 *
 * ## Cores — paleta oficial (fixa)
 * As cores abaixo (`corTexto`/`corSolida` = HEX PRINCIPAL, `corFundo` = FUNDO
 * SOFT) vêm literalmente do documento `Paleta_de_Cores_Categorias_Feedback.pdf`
 * (fornecido pelo Raver em 2026-08-23) — cada uma das 14 categorias tem sua
 * própria cor única (sem mais divisão de cor entre categorias, diferente da
 * versão anterior deste arquivo). `corBorda` não vem do PDF (ele só define
 * hex principal + fundo soft): é o tom -200 da mesma família Tailwind da cor
 * principal, pra ficar entre o fundo soft e o hex principal.
 *
 * Estas são as cores OFICIAIS do produto a partir de agora. Não trocar
 * nenhuma delas por conta própria — só mudar se o Raver pedir explicitamente
 * de novo.
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

// Classes escritas por extenso (não montadas por interpolação): o Tailwind
// escaneia o código-fonte procurando o NOME LITERAL da classe pra gerar o CSS
// dela — uma classe montada em runtime via template string (`text-[${hex}]`)
// não aparece no arquivo como texto e o Tailwind nunca a gera, resultando em
// categoria sem cor nenhuma na tela. Por isso cada cor abaixo é 4 strings
// literais completas, mesmo que isso repita o hex.
const ESTILOS: Record<CategoriaFeedback, EstiloCategoria> = {
  Comida: {
    icon: UtensilsCrossed,
    corTexto: 'text-[#EA580C]', corSolida: 'bg-[#EA580C]',
    corFundo: 'bg-[#FFF7ED]', corBorda: 'border-[#FED7AA]',
  },
  Bebidas: {
    icon: CupSoda,
    corTexto: 'text-[#0284C7]', corSolida: 'bg-[#0284C7]',
    corFundo: 'bg-[#F0F9FF]', corBorda: 'border-[#BAE6FD]',
  },
  Atendimento: {
    icon: Handshake,
    corTexto: 'text-[#7C3AED]', corSolida: 'bg-[#7C3AED]',
    corFundo: 'bg-[#F5F3FF]', corBorda: 'border-[#DDD6FE]',
  },
  Ambiente: {
    icon: Armchair,
    corTexto: 'text-[#65A30D]', corSolida: 'bg-[#65A30D]',
    corFundo: 'bg-[#F7FEE7]', corBorda: 'border-[#D9F99D]',
  },
  Limpeza: {
    icon: Sparkles,
    corTexto: 'text-[#0D9488]', corSolida: 'bg-[#0D9488]',
    corFundo: 'bg-[#F0FDFA]', corBorda: 'border-[#99F6E4]',
  },
  'Preço': {
    icon: Tag,
    corTexto: 'text-[#059669]', corSolida: 'bg-[#059669]',
    corFundo: 'bg-[#ECFDF5]', corBorda: 'border-[#A7F3D0]',
  },
  'Tempo de Espera': {
    icon: Clock,
    corTexto: 'text-[#D97706]', corSolida: 'bg-[#D97706]',
    corFundo: 'bg-[#FFFBEB]', corBorda: 'border-[#FDE68A]',
  },
  Reserva: {
    icon: CalendarCheck,
    corTexto: 'text-[#4F46E5]', corSolida: 'bg-[#4F46E5]',
    corFundo: 'bg-[#EEF2FF]', corBorda: 'border-[#C7D2FE]',
  },
  Estacionamento: {
    icon: SquareParking,
    corTexto: 'text-[#475569]', corSolida: 'bg-[#475569]',
    corFundo: 'bg-[#F8FAFC]', corBorda: 'border-[#E2E8F0]',
  },
  Acessibilidade: {
    icon: Accessibility,
    corTexto: 'text-[#2563EB]', corSolida: 'bg-[#2563EB]',
    corFundo: 'bg-[#EFF6FF]', corBorda: 'border-[#BFDBFE]',
  },
  'Música/Som': {
    icon: Music,
    corTexto: 'text-[#DB2777]', corSolida: 'bg-[#DB2777]',
    corFundo: 'bg-[#FDF2F8]', corBorda: 'border-[#FBCFE8]',
  },
  'Cardápio/Variedade': {
    icon: BookOpen,
    corTexto: 'text-[#CA8A04]', corSolida: 'bg-[#CA8A04]',
    corFundo: 'bg-[#FEFCE8]', corBorda: 'border-[#FEF08A]',
  },
  Higiene: {
    icon: ShieldCheck,
    corTexto: 'text-[#0891B2]', corSolida: 'bg-[#0891B2]',
    corFundo: 'bg-[#ECFEFF]', corBorda: 'border-[#A5F3FC]',
  },
  Outros: {
    icon: MoreHorizontal,
    corTexto: 'text-[#64748B]', corSolida: 'bg-[#64748B]',
    corFundo: 'bg-[#F1F5F9]', corBorda: 'border-[#E2E8F0]',
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
