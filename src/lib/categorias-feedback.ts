/**
 * Estilo visual (ícone + cor) de cada categoria de feedback — PADRÃO ÚNICO pra
 * todo o sistema. Qualquer tela que precise mostrar/relacionar algo a uma
 * categoria usa este arquivo, pra nunca ter duas cores ou dois ícones
 * diferentes pro mesmo assunto em lugares diferentes do app.
 *
 * Estas são as 14 categorias PADRÃO dos clientes. Desde 15/10/2026 cada conta
 * edita e cria as suas (Configurações → Categorias; tabela `categorias`, e o
 * n8n classifica pela lista da conta). A categoria renomeada mantém a cor
 * oficial; a nova escolhe na paleta extra lá embaixo. Não crie cor/ícone fora
 * deste arquivo.
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
  Wine,
  Coffee,
  IceCreamCone,
  Users,
  Wallet,
  Car,
  Bike,
  HeartPulse,
  Wrench,
  MessagesSquare,
  Star,
  Wifi,
  Store,
} from 'lucide-react'
import { estiloCategoriaEquipe } from '@/lib/categorias-equipe'

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

// ── Categorias criadas pela conta (Configurações → Categorias) ──────────────
// Desde 15/10/2026 cada conta renomeia e cria categorias. As 14 acima continuam
// com a cor oficial (renomear "Comida" para "Pratos" mantém o laranja dela). A
// categoria NOVA escolhe uma cor desta paleta extra, também escrita por extenso
// para o Tailwind gerar as classes.
const ESTILOS_EXTRA: Record<string, Omit<EstiloCategoria, 'icon'> & { nome: string }> = {
  'extra:ameixa': { nome: 'Ameixa', corTexto: 'text-[#9333EA]', corSolida: 'bg-[#9333EA]', corFundo: 'bg-[#FAF5FF]', corBorda: 'border-[#E9D5FF]' },
  'extra:carmim': { nome: 'Carmim', corTexto: 'text-[#BE123C]', corSolida: 'bg-[#BE123C]', corFundo: 'bg-[#FFF1F2]', corBorda: 'border-[#FECDD3]' },
  'extra:oliva': { nome: 'Oliva', corTexto: 'text-[#4D7C0F]', corSolida: 'bg-[#4D7C0F]', corFundo: 'bg-[#F7FEE7]', corBorda: 'border-[#D9F99D]' },
  'extra:petroleo': { nome: 'Petróleo', corTexto: 'text-[#115E59]', corSolida: 'bg-[#115E59]', corFundo: 'bg-[#F0FDFA]', corBorda: 'border-[#99F6E4]' },
  'extra:marinho': { nome: 'Marinho', corTexto: 'text-[#1E3A8A]', corSolida: 'bg-[#1E3A8A]', corFundo: 'bg-[#EFF6FF]', corBorda: 'border-[#BFDBFE]' },
  'extra:terracota': { nome: 'Terracota', corTexto: 'text-[#9A3412]', corSolida: 'bg-[#9A3412]', corFundo: 'bg-[#FFF7ED]', corBorda: 'border-[#FED7AA]' },
  'extra:grafite': { nome: 'Grafite', corTexto: 'text-[#334155]', corSolida: 'bg-[#334155]', corFundo: 'bg-[#F8FAFC]', corBorda: 'border-[#CBD5E1]' },
  'extra:magenta': { nome: 'Magenta', corTexto: 'text-[#A21CAF]', corSolida: 'bg-[#A21CAF]', corFundo: 'bg-[#FDF4FF]', corBorda: 'border-[#F5D0FE]' },
  'extra:ocre': { nome: 'Ocre', corTexto: 'text-[#854D0E]', corSolida: 'bg-[#854D0E]', corFundo: 'bg-[#FEFCE8]', corBorda: 'border-[#FEF08A]' },
  'extra:esmeralda': { nome: 'Esmeralda', corTexto: 'text-[#047857]', corSolida: 'bg-[#047857]', corFundo: 'bg-[#ECFDF5]', corBorda: 'border-[#A7F3D0]' },
}

/** As cores que uma categoria pode ter: as oficiais (pelo nome padrão) e as da paleta extra. */
export const PALETA_EXTRA = Object.entries(ESTILOS_EXTRA).map(([chave, e]) => ({ chave, nome: e.nome }))

/** Os ícones que a pessoa pode escolher para uma categoria. */
export const ICONES_DE_CATEGORIA: { chave: string; nome: string; icon: LucideIcon }[] = [
  { chave: 'prato', nome: 'Prato', icon: UtensilsCrossed },
  { chave: 'bebida', nome: 'Bebida', icon: CupSoda },
  { chave: 'vinho', nome: 'Vinho', icon: Wine },
  { chave: 'cafe', nome: 'Café', icon: Coffee },
  { chave: 'sobremesa', nome: 'Sobremesa', icon: IceCreamCone },
  { chave: 'atendimento', nome: 'Atendimento', icon: Handshake },
  { chave: 'pessoas', nome: 'Pessoas', icon: Users },
  { chave: 'ambiente', nome: 'Ambiente', icon: Armchair },
  { chave: 'limpeza', nome: 'Limpeza', icon: Sparkles },
  { chave: 'preco', nome: 'Preço', icon: Tag },
  { chave: 'dinheiro', nome: 'Dinheiro', icon: Wallet },
  { chave: 'tempo', nome: 'Tempo', icon: Clock },
  { chave: 'agenda', nome: 'Agenda', icon: CalendarCheck },
  { chave: 'carro', nome: 'Carro', icon: Car },
  { chave: 'entrega', nome: 'Entrega', icon: Bike },
  { chave: 'acessibilidade', nome: 'Acessibilidade', icon: Accessibility },
  { chave: 'musica', nome: 'Música', icon: Music },
  { chave: 'cardapio', nome: 'Cardápio', icon: BookOpen },
  { chave: 'seguranca', nome: 'Segurança', icon: ShieldCheck },
  { chave: 'saude', nome: 'Saúde', icon: HeartPulse },
  { chave: 'ferramenta', nome: 'Ferramenta', icon: Wrench },
  { chave: 'conversa', nome: 'Conversa', icon: MessagesSquare },
  { chave: 'estrela', nome: 'Estrela', icon: Star },
  { chave: 'wifi', nome: 'Internet', icon: Wifi },
  { chave: 'loja', nome: 'Loja', icon: Store },
  { chave: 'outros', nome: 'Outros', icon: MoreHorizontal },
]

/**
 * O estilo de uma CHAVE de cor (o nome de uma categoria padrão, dos clientes ou
 * da equipe, ou "extra:…") com o ícone escolhido. É o que a tela de
 * Configurações mostra enquanto a pessoa escolhe.
 */
export function estiloDaCor(cor: string | null | undefined, icone?: string | null): EstiloCategoria {
  const chave = (cor ?? '').trim()
  const padrao = CATEGORIAS_FEEDBACK.find((c) => c.toLowerCase() === chave.toLowerCase())
  const extra = ESTILOS_EXTRA[chave]
  const base: EstiloCategoria = padrao
    ? ESTILOS[padrao]
    : extra
      ? { icon: MoreHorizontal, corTexto: extra.corTexto, corSolida: extra.corSolida, corFundo: extra.corFundo, corBorda: extra.corBorda }
      : estiloCategoriaEquipe(chave) ?? ESTILO_PADRAO
  const escolhido = icone ? ICONES_DE_CATEGORIA.find((i) => i.chave === icone)?.icon : undefined
  return escolhido ? { ...base, icon: escolhido } : base
}

/** As categorias da conta logada, pelo nome (sem ligar para a caixa). Preenchido por `use-categorias.ts`. */
const DA_CONTA = new Map<string, EstiloCategoria>()

/** Guarda a cor e o ícone das categorias da conta (todas, inclusive as desligadas). */
export function registrarCategoriasDaConta(itens: readonly { nome: string; cor: string | null; icone: string | null }[]): void {
  DA_CONTA.clear()
  for (const c of itens) {
    if (!c.nome) continue
    // Sem cor escolhida, a categoria padrão fica com a dela; a nova, com a de Outros.
    DA_CONTA.set(c.nome.trim().toLowerCase(), estiloDaCor(c.cor || c.nome, c.icone))
  }
}

/**
 * Estilo de uma categoria pelo nome. Primeiro as da conta (renomeadas e
 * criadas nas Configurações), depois as 14 oficiais (ignorando acento/caixa,
 * pra não quebrar por causa de "preço" vs "Preço") e as da equipe. Qualquer
 * outro nome cai no estilo neutro de "Outros" em vez de quebrar a tela.
 */
export function estiloCategoria(nome: string | null | undefined): EstiloCategoria {
  if (!nome) return ESTILO_PADRAO
  const alvo = nome.trim().toLowerCase()
  const daConta = DA_CONTA.get(alvo)
  if (daConta) return daConta
  const cat = CATEGORIAS_FEEDBACK.find((c) => c.toLowerCase() === alvo)
  if (cat) return ESTILOS[cat]
  // Não é uma das 14 dos clientes: pode ser do feedback da equipe (páginas
  // /equipe), que tem a paleta dela em `categorias-equipe.ts`.
  return estiloCategoriaEquipe(nome) ?? ESTILO_PADRAO
}
