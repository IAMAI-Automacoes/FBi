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
  Star,
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
import { useAuth } from '@/hooks/use-auth'
import { buscarTotalNaoLidasCliente } from '@/lib/queries/sugestoes'
import { contarGarconsPendentes } from '@/lib/queries/bonificacao-garcons'
import { contarFeedbacksNaoLidos, marcarFeedbacksVistos } from '@/lib/queries/feedbacks'
import { supabase } from '@/lib/supabase/client'
import { listarConversas } from '@/lib/queries/whatsapp'
import { WhatsappIcon } from './WhatsappIcon'

const navigation = [
  { name: 'Visão Geral', href: '/', icon: LayoutDashboard, modulo: 'visao_geral' },
  { name: 'Feedbacks', href: '/feedbacks', icon: MessageSquare, modulo: 'feedbacks' },
  { name: 'WhatsApp', href: '/whatsapp', icon: WhatsappIcon, modulo: 'whatsapp' },
  { name: 'Insights', href: '/insights', icon: Lightbulb, modulo: 'insights' },
  { name: 'Ações', href: '/acoes', icon: Zap, modulo: 'acoes' },
  { name: 'Relatórios', href: '/relatorios', icon: FileBarChart, modulo: 'relatorios' },
  // Avaliações do Google: só o admin da plataforma vê enquanto o Google não
  // libera a API para o EasyFeed. Para liberar aos clientes: apague `soAdmin`,
  // o SoAdminPlataforma da rota (App.tsx) e o SO_ADMIN da função google-perfil.
  { name: 'Google', href: '/google', icon: Star, modulo: 'relatorios', soAdmin: true },
  { name: 'QR Code', href: '/qrcode', icon: QrCode, modulo: 'qrcodes' },
  { name: 'Garçons', href: '/garcons', icon: Users, modulo: 'qrcodes' },
]

export function AppSidebar() {
  const location = useLocation()
  const { nomeRestaurante, logoUrl } = useRestauranteConfig()
  const { podeVer } = usePermissoes()
  const { usuario, ehAdminPlataforma } = useAuth()

  const isSugestoesActive = location.pathname === '/sugestoes'
  const isFeedbacksActive = location.pathname === '/feedbacks'

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

  // Numerozinho de "tem garçom pra pagar" — mesmo desenho do badge de
  // Sugestões, só que aqui não some sozinho ao entrar na página: some só
  // quando o bônus for de fato marcado como pago (é dinheiro, não
  // notificação — visitar a tela não resolve a pendência). Reage na hora a
  // escaneamento novo (meta batida; `qr_scans` não tem restaurante_id, então
  // a RLS é quem limita aos QR deste restaurante) e a qualquer mudança em
  // `garcons` ("acabei de marcar como pago", garçom novo ou removido). O
  // minuto a minuto fica para a virada de período das regras.
  const restauranteId = usuario?.restaurante_id ?? null
  const [pendentes, setPendentes] = useState(0)
  useEffect(() => {
    if (!restauranteId) { setPendentes(0); return }
    const atualizar = () => contarGarconsPendentes(restauranteId).then(setPendentes).catch(() => {})
    atualizar()
    const intervalo = setInterval(atualizar, 60_000)
    const ch = supabase
      .channel('sidebar-garcons-pendentes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'garcons', filter: `restaurante_id=eq.${restauranteId}` },
        atualizar,
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qr_scans' }, atualizar)
      .subscribe()
    return () => { clearInterval(intervalo); supabase.removeChannel(ch) }
  }, [restauranteId])

  // Numerozinho de "chegou feedback negativo ou sugestão" (Negativo,
  // Positivo e Negativo ou Sugestão) — conta desde a última vez que a aba
  // Feedbacks foi aberta (`restaurantes.feedbacks_visto_em`). Ao
  // contrário do badge de Garçons (que só some quando o bônus é pago), este é
  // notificação pura: visitar a página já resolve, então zera e marca como
  // visto no banco assim que a rota fica ativa.
  const [feedbacksNaoLidos, setFeedbacksNaoLidos] = useState(0)
  useEffect(() => {
    if (!restauranteId) { setFeedbacksNaoLidos(0); return }
    const atualizar = () => contarFeedbacksNaoLidos(restauranteId).then(setFeedbacksNaoLidos).catch(() => {})
    atualizar()
    // A mensagem já chega gravada com o sentimento geral: basta ouvir ela.
    const ch = supabase
      .channel('sidebar-feedbacks-nao-lidos')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'feedbacks_originais', filter: `restaurante_id=eq.${restauranteId}` },
        atualizar,
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [restauranteId])

  // Numerozinho do WhatsApp: quantas CONVERSAS (contatos e grupos) têm
  // mensagem não lida — mesma conta da tela. Abrir a página não zera nada;
  // cada conversa aberta e lida tira 1, na hora (evento da tela), e o banco
  // confirma em seguida.
  const podeVerWhatsapp = podeVer('whatsapp')
  const [chatsNaoLidos, setChatsNaoLidos] = useState<Set<string>>(new Set())
  const conversasNaoLidas = chatsNaoLidos.size
  useEffect(() => {
    if (!restauranteId || !podeVerWhatsapp) { setChatsNaoLidos(new Set()); return }
    let espera: ReturnType<typeof setTimeout> | null = null
    const atualizar = () => listarConversas(restauranteId)
      .then((lista) => setChatsNaoLidos(new Set(lista.filter((c) => c.nao_lidas > 0).map((c) => c.chat_id))))
      .catch(() => {})
    const agendar = () => { if (espera) clearTimeout(espera); espera = setTimeout(atualizar, 800) }
    atualizar()
    const ch = supabase
      .channel('sidebar-whatsapp-nao-lidas')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_whatsapp', filter: `restaurante_id=eq.${restauranteId}` }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_whatsapp_leitura', filter: `restaurante_id=eq.${restauranteId}` }, agendar)
      .subscribe()
    // A tela abriu uma conversa: tira ela da conta na hora.
    const aoAbrirConversa = (e: Event) => {
      const chat = (e as CustomEvent<{ chatId: string }>).detail?.chatId
      if (chat) setChatsNaoLidos((atual) => { if (!atual.has(chat)) return atual; const n = new Set(atual); n.delete(chat); return n })
    }
    window.addEventListener('easyfeed:preferencias', agendar)
    window.addEventListener('easyfeed:whatsapp-conversa-lida', aoAbrirConversa)
    return () => {
      if (espera) clearTimeout(espera)
      supabase.removeChannel(ch)
      window.removeEventListener('easyfeed:preferencias', agendar)
      window.removeEventListener('easyfeed:whatsapp-conversa-lida', aoAbrirConversa)
    }
  }, [restauranteId, podeVerWhatsapp])

  useEffect(() => {
    if (isFeedbacksActive && restauranteId) {
      setFeedbacksNaoLidos(0)
      marcarFeedbacksVistos(restauranteId)
    }
  }, [isFeedbacksActive, restauranteId])

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

      <SidebarContent className="px-3 py-1">
        {/* `gap-0.5`/`h-8`: só o espaçamento entre as linhas do menu (e a
            altura de cada uma) encolhe aqui — o texto continua `text-[15px]`
            e o ícone `h-5 w-5`, do tamanho de sempre, sem diminuir (pedido
            explícito do Raver). É o espaço em volta que fica menor, sobrando
            mais altura pra rodapé/resto da barra lateral. */}
        <SidebarMenu className="gap-0.5">
          {navigation
            .filter((item) => podeVer(item.modulo) && (!('soAdmin' in item) || ehAdminPlataforma))
            .map((item) => {
              const isActive = location.pathname === item.href
              return (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    className={
                      isActive
                        ? 'h-8 text-[15px] font-medium transition-colors bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#EFF6FF] hover:text-[#1D4ED8]'
                        : 'h-8 text-[15px] font-medium transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }
                  >
                    <Link to={item.href}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                      {/* Mesmo numerozinho vermelho do badge de Sugestões —
                          aqui é "tem bônus pra pagar", não "tem mensagem pra
                          ler": continua aparecendo mesmo na própria página
                          de Garçons, e só some quando o bônus for pago de
                          verdade (pedido explícito). */}
                      {item.name === 'Garçons' && pendentes > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                          {pendentes > 99 ? '99+' : pendentes}
                        </span>
                      )}
                      {/* "Chegou feedback negativo" — notificação pura: some
                          assim que a rota fica ativa (efeito acima zera e
                          marca como visto no banco). */}
                      {item.name === 'WhatsApp' && conversasNaoLidas > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-[#25D366] text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                          {conversasNaoLidas > 99 ? '99+' : conversasNaoLidas}
                        </span>
                      )}
                      {item.name === 'Feedbacks' && feedbacksNaoLidos > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                          {feedbacksNaoLidos > 99 ? '99+' : feedbacksNaoLidos}
                        </span>
                      )}
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
