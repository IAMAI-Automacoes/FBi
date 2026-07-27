import { useState, useEffect } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { LogOut, Settings as SettingsIcon, User as UserIcon, ShieldCheck } from 'lucide-react'
import { usePlatformAdmin } from '@/hooks/use-platform-admin'
import { buscarTotalNaoLidas } from '@/lib/queries/admin'
import { supabase } from '@/lib/supabase/client'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/use-auth'
import { useUserProfile } from '@/hooks/use-user-profile'
import { getIniciais } from '@/lib/iniciais'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const routeTitles: Record<string, string> = {
  '/': 'Visão Geral',
  '/feedbacks': 'Feedbacks',
  '/insights': 'Insights',
  '/acoes': 'Ações',
  '/relatorios': 'Relatórios',
  '/qrcode': 'QR Codes',
  '/garcons': 'Garçons',
}

export function TopHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const { usuario, logout } = useAuth()
  const { profile } = useUserProfile()
  const title = routeTitles[location.pathname] || 'Dashboard'

  const { isAdmin } = usePlatformAdmin()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [adminUnread, setAdminUnread] = useState(0)

  // Busca do banco ao montar (Admin e TopHeader nunca ficam montados juntos)
  useEffect(() => {
    if (!isAdmin) return
    buscarTotalNaoLidas().then(setAdminUnread).catch(() => {})
  }, [isAdmin])

  // Atualização via evento (quando Admin.tsx está montado e despacha a contagem)
  useEffect(() => {
    const handler = (e: Event) => {
      setAdminUnread((e as CustomEvent<{ count: number }>).detail.count)
    }
    window.addEventListener('fib-unread-update', handler)
    return () => window.removeEventListener('fib-unread-update', handler)
  }, [])

  // Realtime: atualiza badge quando chegam mensagens novas ou leituras mudam (funciona em qualquer rota)
  useEffect(() => {
    if (!isAdmin) return
    const ch = supabase
      .channel('topheader-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'respostas_sugestoes' },
        () => { buscarTotalNaoLidas().then(setAdminUnread).catch(() => {}) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sugestoes_plataforma' },
        () => { buscarTotalNaoLidas().then(setAdminUnread).catch(() => {}) })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [isAdmin])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-white px-4 shadow-sm sm:px-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        </div>

        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link
              to="/admin"
              title="Painel Admin"
              className="relative flex items-center justify-center h-9 w-9 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors border border-amber-200"
            >
              <ShieldCheck className="h-4 w-4" />
              {adminUnread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 leading-none pointer-events-none">
                  {adminUnread > 99 ? '99+' : adminUnread}
                </span>
              )}
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-9 w-9 border border-border cursor-pointer hover:opacity-80 transition-opacity ring-offset-2 hover:ring-2 ring-primary/20">
                {(usuario?.avatar_url || profile?.avatar_url) && (
                  <AvatarImage src={usuario?.avatar_url || profile?.avatar_url} alt={usuario?.nome || 'Usuário'} />
                )}
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                  {getIniciais(usuario?.nome, 2)}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[260px] mt-1.5 p-0 border-border/60 shadow-lg rounded-xl overflow-hidden"
              align="end"
              sideOffset={8}
            >
              <div className="p-3 bg-secondary/20">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-border/50 shadow-sm">
                    {(usuario?.avatar_url || profile?.avatar_url) && (
                      <AvatarImage src={usuario?.avatar_url || profile?.avatar_url} alt={usuario?.nome || 'Usuário'} />
                    )}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                      {getIniciais(usuario?.nome, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col space-y-0.5 overflow-hidden">
                    <p className="text-sm font-semibold leading-none text-foreground truncate">
                      {usuario?.nome || 'Usuário'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {usuario?.email || 'email@exemplo.com'}
                    </p>
                  </div>
                </div>
              </div>
              <DropdownMenuSeparator className="m-0" />
              <DropdownMenuGroup className="p-1.5">
                <DropdownMenuItem
                  asChild
                  className="cursor-pointer py-2 px-3 text-[13px] font-medium rounded-md transition-colors focus:bg-secondary"
                >
                  <Link to="/minha-conta">
                    <UserIcon className="mr-2.5 h-[15px] w-[15px] text-muted-foreground" />
                    <span>Perfil</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild
                  className="cursor-pointer py-2 px-3 text-[13px] font-medium rounded-md transition-colors focus:bg-secondary"
                >
                  <Link to="/configuracoes">
                    <SettingsIcon className="mr-2.5 h-[15px] w-[15px] text-muted-foreground" />
                    <span>Seu Restaurante</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="m-0" />
              <div className="p-1.5 bg-secondary/5">
                <DropdownMenuItem
                  className="cursor-pointer py-2 px-3 text-[13px] font-medium text-red-600 focus:text-red-700 focus:bg-red-50/80 rounded-md transition-colors"
                  onSelect={() => setShowLogoutDialog(true)}
                >
                  <LogOut className="mr-2.5 h-[15px] w-[15px]" />
                  <span>Sair da conta</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent className="sm:max-w-[420px] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Sair da conta?</AlertDialogTitle>
            <AlertDialogDescription className="text-base mt-2">
              Você precisará fazer login novamente para acessar o painel de insights e feedbacks do
              seu restaurante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm"
            >
              Sair da conta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
