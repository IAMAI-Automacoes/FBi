/**
 * Categorias do feedback da EQUIPE (o que os funcionários falam do trabalho) e
 * o estilo de cada uma. São outras que as 14 do feedback dos clientes
 * (`categorias-feedback.ts`, de paleta fixa): aqui o assunto é salário,
 * escala, liderança… A lista é a mesma de
 * `supabase/functions/_shared/equipe.ts` (a IA só classifica dentro dela).
 */
import type { LucideIcon } from 'lucide-react'
import {
  Activity, Award, CalendarClock, GraduationCap, HeartPulse, MessagesSquare, MoreHorizontal, UserCog, Users, UtensilsCrossed,
  Wallet, Wrench,
} from 'lucide-react'

export const CATEGORIAS_EQUIPE = [
  'Liderança e gestão',
  'Salário e benefícios',
  'Escala e horários',
  'Carga de trabalho',
  'Clima e colegas',
  'Estrutura e equipamentos',
  'Treinamento e crescimento',
  'Reconhecimento',
  'Comunicação',
  'Segurança e saúde',
  'Clientes',
  'Outros',
] as const
export type CategoriaEquipe = (typeof CATEGORIAS_EQUIPE)[number]

export interface EstiloCategoriaEquipe {
  icon: LucideIcon
  /** Ícone e texto. */
  cor: string
  /** Fundo suave do selo. */
  fundo: string
  borda: string
}

const ESTILOS: Record<CategoriaEquipe, EstiloCategoriaEquipe> = {
  'Liderança e gestão': { icon: UserCog, cor: '#4F46E5', fundo: '#EEF2FF', borda: '#C7D2FE' },
  'Salário e benefícios': { icon: Wallet, cor: '#059669', fundo: '#ECFDF5', borda: '#A7F3D0' },
  'Escala e horários': { icon: CalendarClock, cor: '#B45309', fundo: '#FFFBEB', borda: '#FDE68A' },
  'Carga de trabalho': { icon: Activity, cor: '#E11D48', fundo: '#FFF1F2', borda: '#FECDD3' },
  'Clima e colegas': { icon: Users, cor: '#0284C7', fundo: '#F0F9FF', borda: '#BAE6FD' },
  'Estrutura e equipamentos': { icon: Wrench, cor: '#475569', fundo: '#F8FAFC', borda: '#CBD5E1' },
  'Treinamento e crescimento': { icon: GraduationCap, cor: '#7C3AED', fundo: '#F5F3FF', borda: '#DDD6FE' },
  'Reconhecimento': { icon: Award, cor: '#A16207', fundo: '#FEFCE8', borda: '#FEF08A' },
  'Comunicação': { icon: MessagesSquare, cor: '#0E7490', fundo: '#ECFEFF', borda: '#A5F3FC' },
  'Segurança e saúde': { icon: HeartPulse, cor: '#DC2626', fundo: '#FEF2F2', borda: '#FECACA' },
  'Clientes': { icon: UtensilsCrossed, cor: '#C2410C', fundo: '#FFF7ED', borda: '#FED7AA' },
  'Outros': { icon: MoreHorizontal, cor: '#6B7280', fundo: '#F9FAFB', borda: '#E5E7EB' },
}

/** O estilo da categoria; nome desconhecido cai em "Outros". */
export function estiloCategoriaEquipe(categoria: string | null | undefined): EstiloCategoriaEquipe {
  return ESTILOS[categoria as CategoriaEquipe] ?? ESTILOS.Outros
}
