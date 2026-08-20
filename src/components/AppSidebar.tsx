import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  Lightbulb,
  Zap,
  FileBarChart,
  QrCode,
  Users,
  HelpCircle,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useRestauranteConfig } from '@/hooks/use-restaurante-config'
import { getIniciais } from '@/lib/iniciais'
import { usePermissoes } from '@/hooks/use-permissoes'
import { buscarTotalNaoLidasCliente } from '@/lib/queries/sugestoes'
import { supabase } from '@/lib/supabase/client'

const navigation = [
  { name: 'Visão Geral', href: '/', icon: LayoutDashboard, modulo: 'visao_geral' },
  { name: 'Feedbacks', href: '/feedbacks', icon: MessageSquare, modulo: 'feedbacks' },
  { name: 'Insights', href: '/insights', icon: Lightbulb, modulo: 'insights' },
  { name: 'Ações', href: '/acoes', icon: Zap, modulo: 'acoes' },
  { name: 'Relatórios', href: '/relatorios', icon: FileBarChart, modulo: 'relatorios' },
  { name: 'QR Code', href: '/qrcode', icon: QrCode, modulo: 'qrcodes' },
  { name: 'Garçons', href: '/garcons', icon: Users, modulo: 'qrcodes' },
]

export function AppSidebar() {
  const location = useLocation()
  const { nomeRestaurante, logoUrl } = useRestauranteConfig()
  const { podeVer } = usePermissoes()

  const isSugestoesActive = location.pathname === '/sugestoes'

  // Badge de mensagens não lidas do suporte (novas + editadas)
  const [naoLidas, setNaoLidas] = useState(0)
  useEffect(() => {
    const atualizar = () => buscarTotalNaoLidasCliente().then(setNaoLidas).catch(() => {})
    atualizar()
    const ch = supabase
      .channel('sidebar-sugestoes-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'respostas_sugestoes' }, atualizar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'respostas_sugestoes' }, atualizar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sugestoes_plataforma' }, atualizar)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Zera na hora ao entrar na página de sugestões (a própria página marca como lido no banco)
  useEffect(() => {
    if (isSugestoesActive) setNaoLidas(0)
  }, [isSugestoesActive])

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border bg-white text-sidebar-foreground">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt={nomeRestaurante} className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-bold">{getIniciais(nomeRestaurante, 2)}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="fonte-marca text-lg font-semibold text-foreground leading-tight">
              {nomeRestaurante}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarMenu>
          {navigation
            .filter((item) => podeVer(item.modulo))
            .map((item) => {
              const isActive = location.pathname === item.href
              return (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    className={
                      isActive
                        ? 'h-10 text-[15px] font-medium transition-colors bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#EFF6FF] hover:text-[#1D4ED8]'
                        : 'h-10 text-[15px] font-medium transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }
                  >
                    <Link to={item.href}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Link
          to="/sugestoes"
          className={
            isSugestoesActive
              ? 'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium bg-[#EFF6FF] text-[#1D4ED8]'
              : 'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors'
          }
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          <span>Sugestões e Dúvidas</span>
          {naoLidas > 0 && !isSugestoesActive && (
            <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
              {naoLidas > 99 ? '99+' : naoLidas}
            </span>
          )}
        </Link>
      </SidebarFooter>
    </Sidebar>
  )
}
