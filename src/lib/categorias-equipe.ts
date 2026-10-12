/**
 * Categorias do feedback da EQUIPE (o que os funcionários falam do trabalho) e
 * o estilo de cada uma. São outras que as 14 do feedback dos clientes
 * (`categorias-feedback.ts`, de paleta fixa): aqui o assunto é salário,
 * escala, liderança… A lista é a mesma de
 * `supabase/functions/_shared/publico.ts` e do workflow do n8n (a IA só
 * classifica dentro dela).
 *
 * Mesmo formato de `EstiloCategoria`: as telas pedem o estilo pelo nome com
 * `estiloCategoria()` (de `categorias-feedback.ts`), que cai aqui quando o
 * nome é de uma categoria da equipe. Assim o cartão, o filtro e o quadro de
 * ações são os mesmos para os dois públicos.
 */
import {
  Activity, Award, CalendarClock, GraduationCap, HeartPulse, MessagesSquare, MoreHorizontal, UserCog, Users, UtensilsCrossed,
  Wallet, Wrench,
} from 'lucide-react'
import type { EstiloCategoria } from '@/lib/categorias-feedback'

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

// Classes por extenso (o Tailwind só gera o que acha escrito no código).
const ESTILOS: Record<CategoriaEquipe, EstiloCategoria> = {
  'Liderança e gestão': {
    icon: UserCog,
    corTexto: 'text-[#4F46E5]', corSolida: 'bg-[#4F46E5]',
    corFundo: 'bg-[#EEF2FF]', corBorda: 'border-[#C7D2FE]',
  },
  'Salário e benefícios': {
    icon: Wallet,
    corTexto: 'text-[#059669]', corSolida: 'bg-[#059669]',
    corFundo: 'bg-[#ECFDF5]', corBorda: 'border-[#A7F3D0]',
  },
  'Escala e horários': {
    icon: CalendarClock,
    corTexto: 'text-[#B45309]', corSolida: 'bg-[#B45309]',
    corFundo: 'bg-[#FFFBEB]', corBorda: 'border-[#FDE68A]',
  },
  'Carga de trabalho': {
    icon: Activity,
    corTexto: 'text-[#E11D48]', corSolida: 'bg-[#E11D48]',
    corFundo: 'bg-[#FFF1F2]', corBorda: 'border-[#FECDD3]',
  },
  'Clima e colegas': {
    icon: Users,
    corTexto: 'text-[#0284C7]', corSolida: 'bg-[#0284C7]',
    corFundo: 'bg-[#F0F9FF]', corBorda: 'border-[#BAE6FD]',
  },
  'Estrutura e equipamentos': {
    icon: Wrench,
    corTexto: 'text-[#475569]', corSolida: 'bg-[#475569]',
    corFundo: 'bg-[#F8FAFC]', corBorda: 'border-[#CBD5E1]',
  },
  'Treinamento e crescimento': {
    icon: GraduationCap,
    corTexto: 'text-[#7C3AED]', corSolida: 'bg-[#7C3AED]',
    corFundo: 'bg-[#F5F3FF]', corBorda: 'border-[#DDD6FE]',
  },
  'Reconhecimento': {
    icon: Award,
    corTexto: 'text-[#A16207]', corSolida: 'bg-[#A16207]',
    corFundo: 'bg-[#FEFCE8]', corBorda: 'border-[#FEF08A]',
  },
  'Comunicação': {
    icon: MessagesSquare,
    corTexto: 'text-[#0E7490]', corSolida: 'bg-[#0E7490]',
    corFundo: 'bg-[#ECFEFF]', corBorda: 'border-[#A5F3FC]',
  },
  'Segurança e saúde': {
    icon: HeartPulse,
    corTexto: 'text-[#DC2626]', corSolida: 'bg-[#DC2626]',
    corFundo: 'bg-[#FEF2F2]', corBorda: 'border-[#FECACA]',
  },
  'Clientes': {
    icon: UtensilsCrossed,
    corTexto: 'text-[#C2410C]', corSolida: 'bg-[#C2410C]',
    corFundo: 'bg-[#FFF7ED]', corBorda: 'border-[#FED7AA]',
  },
  'Outros': {
    icon: MoreHorizontal,
    corTexto: 'text-[#64748B]', corSolida: 'bg-[#64748B]',
    corFundo: 'bg-[#F1F5F9]', corBorda: 'border-[#E2E8F0]',
  },
}

/** O estilo de uma categoria da equipe pelo nome (sem ligar para a caixa); null = não é da equipe. */
export function estiloCategoriaEquipe(nome: string | null | undefined): EstiloCategoria | null {
  if (!nome) return null
  const alvo = nome.trim().toLowerCase()
  const cat = CATEGORIAS_EQUIPE.find((c) => c.toLowerCase() === alvo)
  return cat ? ESTILOS[cat] : null
}
