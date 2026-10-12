import { FileBarChart, LayoutDashboard, Lightbulb, MessageSquare, Users, Zap } from 'lucide-react'
import { SubNav, type Subpagina } from '@/components/SubNav'

/* As subpáginas da Equipe, no cabeçalho. Visão Geral, Feedbacks, Insights,
   Ações e Relatórios são as MESMAS telas dos clientes, mostrando só o que os
   funcionários falaram. Funcionários é o cadastro e os pedidos de feedback. */

export const SUBPAGINAS_DA_EQUIPE: Subpagina[] = [
  { nome: 'Visão Geral', href: '/equipe', icone: LayoutDashboard },
  { nome: 'Feedbacks', href: '/equipe/feedbacks', icone: MessageSquare },
  { nome: 'Insights', href: '/equipe/insights', icone: Lightbulb },
  { nome: 'Ações', href: '/equipe/acoes', icone: Zap },
  { nome: 'Relatórios', href: '/equipe/relatorios', icone: FileBarChart },
  { nome: 'Funcionários', href: '/equipe/funcionarios', icone: Users },
]

export function NavEquipe() {
  return <SubNav rotulo="Páginas da equipe" subpaginas={SUBPAGINAS_DA_EQUIPE} />
}
