import { Link } from 'react-router-dom'
import {
  ArrowLeft, BookOpen, Bot, Briefcase, Building2, Gauge, Handshake, LifeBuoy, Megaphone, ShieldCheck, Ticket, Wallet, Workflow,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { WhatsappIcon } from '@/components/WhatsappIcon'

export type AbaAdmin =
  | 'suporte' | 'whatsapp' | 'contas' | 'vendedores' | 'influenciadores' | 'pagamentos' | 'cupons'
  | 'afiliados' | 'agentes' | 'conhecimento' | 'uso_ia' | 'motor'

export const ABAS_ADMIN: { key: AbaAdmin; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'suporte', label: 'Suporte', icon: LifeBuoy },
  { key: 'whatsapp', label: 'WhatsApp', icon: WhatsappIcon },
  { key: 'contas', label: 'Contas', icon: Building2 },
  { key: 'vendedores', label: 'Vendedores', icon: Briefcase },
  { key: 'influenciadores', label: 'Influenciadores', icon: Megaphone },
  { key: 'pagamentos', label: 'Pagamentos', icon: Wallet },
  { key: 'cupons', label: 'Cupons', icon: Ticket },
  { key: 'afiliados', label: 'Afiliados', icon: Handshake },
  { key: 'agentes', label: 'Agentes de IA', icon: Bot },
  { key: 'conhecimento', label: 'Conhecimento', icon: BookOpen },
  { key: 'uso_ia', label: 'Uso de IA', icon: Gauge },
  { key: 'motor', label: 'Motor de resposta', icon: Workflow },
]

export const ROTULO_ABA_ADMIN = Object.fromEntries(ABAS_ADMIN.map((a) => [a.key, a.label])) as Record<AbaAdmin, string>

/** Largura do menu do admin: mais estreito que o do cliente (16rem). */
export const LARGURA_MENU_ADMIN = '12.5rem'

/* Menu lateral do Painel Admin — o mesmo componente e o mesmo jeito do menu do
   cliente (AppSidebar): fixo à esquerda no computador e gaveta no celular,
   aberta pelo botão de menu da barra do topo (`TopoAdminCelular`). */
export function MenuAdmin({ aba, onTrocar }: { aba: AbaAdmin; onTrocar: (aba: AbaAdmin) => void }) {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border bg-white text-sidebar-foreground">
      <SidebarHeader className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 ring-1 ring-amber-200">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
          </div>
          <span className="text-[15px] font-semibold leading-tight text-gray-800">Painel Admin</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-1">
        <SidebarMenu className="gap-0.5">
          {ABAS_ADMIN.map((item) => {
            const ativa = aba === item.key
            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  isActive={ativa}
                  onClick={() => {
                    onTrocar(item.key)
                    if (isMobile) setOpenMobile(false)
                  }}
                  className={
                    ativa
                      ? 'h-8 text-[14px] font-medium transition-colors bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#EFF6FF] hover:text-[#1D4ED8]'
                      : 'h-8 text-[14px] font-medium transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span>Dashboard</span>
        </Link>
      </SidebarFooter>
    </Sidebar>
  )
}

/* No celular o menu vira gaveta: esta barra fina abre a gaveta e diz em que
   aba você está. No computador ela some (o menu já está à vista). */
export function TopoAdminCelular({ aba }: { aba: AbaAdmin }) {
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 md:hidden"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)' }}
    >
      <SidebarTrigger className="-ml-1" />
      <ShieldCheck className="h-4 w-4 text-amber-500" />
      <span className="text-[14px] font-semibold text-gray-800">{ROTULO_ABA_ADMIN[aba]}</span>
    </div>
  )
}
