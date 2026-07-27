import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RestaurantTab, RestauranteForm } from './settings/RestaurantTab'
import { MascotTab, MascoteForm } from './settings/MascotTab'
import { PerfilNegocioTab, PerfilNegocioForm, PERFIL_VAZIO } from './settings/PerfilNegocioTab'
import { ConhecimentoTab } from './settings/ConhecimentoTab'
import { WhatsAppTab } from './settings/WhatsAppTab'
import { useUserProfile } from '@/hooks/use-user-profile'
import { useRestauranteConfig } from '@/hooks/use-restaurante-config'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const RESTAURANTE_VAZIO: RestauranteForm = { nome_restaurante: '', logo_url: '' }
const MASCOTE_VAZIO: MascoteForm = { nome: '', personalidade: 'direto_objetivo', foto_url: '', modo_acao: 'perguntar' }

/**
 * O que vai para a coluna jsonb. Fica de fora o que já tem coluna própria
 * (tipo_culinaria, numero_mesas, detalhes) para não guardar o dado em dois lugares.
 */
function perfilParaJson(p: PerfilNegocioForm) {
  const { tipo_culinaria, numero_mesas, detalhes, ...resto } = p
  const limpo: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(resto)) {
    if (Array.isArray(valor) ? valor.length : String(valor ?? '').trim()) limpo[chave] = valor
  }
  return limpo
}

export default function Settings() {
  const { profile, loading } = useUserProfile()
  const { refetch: refetchConfig } = useRestauranteConfig()
  const { refetchUsuario } = useAuth()
  const { toast } = useToast()
  const [activeSection, setActiveSection] = useState('restaurante')
  const isManualScroll = useRef(false)

  const [carregandoDados, setCarregandoDados] = useState(true)
  const [restaurante, setRestaurante] = useState<RestauranteForm>(RESTAURANTE_VAZIO)
  const [mascote, setMascote] = useState<MascoteForm>(MASCOTE_VAZIO)
  const [perfil, setPerfil] = useState<PerfilNegocioForm>(PERFIL_VAZIO)
  const [salvo, setSalvo] = useState({ restaurante: RESTAURANTE_VAZIO, mascote: MASCOTE_VAZIO, perfil: PERFIL_VAZIO })
  // Guarda o mascote_config original para não apagar campos que não estão no
  // formulário (ex: "focos", gravado no onboarding e usado no contexto da IA)
  const mascoteBruto = useRef<Record<string, unknown>>({})
  const [salvando, setSalvando] = useState(false)
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)

  const restauranteId = profile?.restaurante_id ?? null

  // Carrega tudo de uma vez — as abas viraram formulários controlados
  useEffect(() => {
    if (loading) return
    if (!restauranteId) {
      setCarregandoDados(false)
      return
    }
    const carregar = async () => {
      const { data } = await supabase
        .from('restaurantes')
        .select('nome_restaurante, detalhes, logo_url, mascote_config, perfil_restaurante, tipo_culinaria, numero_mesas, ia_modo_acao')
        .eq('id', restauranteId)
        .single()

      if (data) {
        const cfg = (data.mascote_config as any) || {}
        mascoteBruto.current = cfg
        const r: RestauranteForm = {
          nome_restaurante: data.nome_restaurante || '',
          logo_url: (data as any).logo_url || '',
        }
        const pf = ((data as any).perfil_restaurante as any) || {}
        const p: PerfilNegocioForm = {
          ...PERFIL_VAZIO,
          ...pf,
          servicos: Array.isArray(pf.servicos) ? pf.servicos : [],
          tipo_culinaria: (data as any).tipo_culinaria || pf.tipo_culinaria || '',
          numero_mesas: (data as any).numero_mesas != null ? String((data as any).numero_mesas) : '',
          detalhes: (data as any).detalhes || '',
        }
        const m: MascoteForm = {
          nome: cfg.nome || '',
          personalidade: cfg.personalidade || 'direto_objetivo',
          foto_url: cfg.foto_url || '',
          modo_acao: (data as any).ia_modo_acao === 'automatico' ? 'automatico' : 'perguntar',
        }
        setRestaurante(r)
        setMascote(m)
        setPerfil(p)
        setSalvo({ restaurante: r, mascote: m, perfil: p })
      }
      setCarregandoDados(false)
    }
    carregar()
  }, [loading, restauranteId])

  const alterado =
    JSON.stringify({ restaurante, mascote, perfil }) !== JSON.stringify(salvo)

  const handleSalvar = async () => {
    // Antes isto era um `return` mudo: o botão parecia não fazer nada.
    if (!restauranteId) {
      toast({
        title: 'Não consegui identificar seu restaurante',
        description: 'Recarregue a página e tente novamente.',
        variant: 'destructive',
      })
      return
    }
    setSalvando(true)
    // .select('id'): o Supabase devolve 200 sem erro mesmo quando a RLS bloqueia
    // e não altera nada. Sem checar as linhas retornadas, mostrávamos "Salvo" falso.
    const { data, error } = await supabase
      .from('restaurantes')
      .update({
        nome_restaurante: restaurante.nome_restaurante,
        logo_url: restaurante.logo_url || null,
        mascote_config: { ...mascoteBruto.current, nome: mascote.nome, personalidade: mascote.personalidade, foto_url: mascote.foto_url },
        ia_modo_acao: mascote.modo_acao,
        // campos que já existem como coluna continuam nelas
        detalhes: perfil.detalhes,
        tipo_culinaria: perfil.tipo_culinaria || null,
        numero_mesas: perfil.numero_mesas ? Number(perfil.numero_mesas) : null,
        perfil_restaurante: perfilParaJson(perfil),
      } as any)
      .eq('id', restauranteId)
      .select('id')
    setSalvando(false)

    if (error) {
      // Mostra o motivo real em vez de esconder atrás de um texto genérico
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
      return
    }
    if (!data || data.length === 0) {
      toast({
        title: 'Não foi salvo',
        description: 'Sem permissão para editar este restaurante ou a sessão expirou. Recarregue a página e entre de novo.',
        variant: 'destructive',
      })
      return
    }
    setSalvo({ restaurante, mascote, perfil })
    // Atualiza os caches persistentes (sem F5): o contexto (sidebar/banner/chat) e
    // os dados do restaurante no useAuth. As telas que buscam do banco já vêm
    // frescas ao navegar por causa do cache: 'no-store'.
    refetchConfig()
    refetchUsuario()
    toast({ title: 'Salvo', description: 'Configurações atualizadas.' })
  }

  const handleDescartar = () => {
    setRestaurante(salvo.restaurante)
    setMascote(salvo.mascote)
    setPerfil(salvo.perfil)
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isManualScroll.current) return
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: '-20% 0px -40% 0px', threshold: [0.2, 0.5, 0.8] },
    )
    const sections = document.querySelectorAll('section[id]')
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [loading, carregandoDados])

  const scrollTo = (id: string) => {
    isManualScroll.current = true
    setActiveSection(id)
    const element = document.getElementById(id)
    if (element) {
      const y = element.getBoundingClientRect().top + window.scrollY - 100
      window.scrollTo({ top: y, behavior: 'smooth' })
      setTimeout(() => {
        isManualScroll.current = false
      }, 800)
    }
  }

  if (loading || carregandoDados) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white px-6 shadow-sm">
          <div className="p-2 rounded-md bg-gray-100 h-9 w-9" />
          <div className="h-6 w-32 bg-gray-100 rounded" />
        </header>
        <main className="flex-1 p-6 md:p-10">
          <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-fade-in">
            <Skeleton className="h-10 w-1/3 mb-6" />
            <div className="flex gap-10">
              <Skeleton className="h-[400px] w-64 hidden md:block rounded-xl" />
              <Skeleton className="h-[600px] w-full rounded-xl" />
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!profile) return null

  const navItems = [
    { id: 'restaurante', label: 'Restaurante' },
    { id: 'perfil', label: 'Sobre o restaurante' },
    { id: 'conhecimento', label: 'Base de conhecimento' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'mascote', label: 'Assistente de IA' },
  ]

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white px-6 shadow-sm">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground hover:bg-secondary p-2 rounded-md transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold text-foreground">Configurações do Restaurante</h1>
      </header>

      <main className="flex-1 p-6 md:p-10">
        <div className="max-w-6xl mx-auto space-y-10 animate-fade-in-up">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Configurações</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Gerencie o perfil do seu restaurante, a conexão do WhatsApp e o assistente de IA.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-10 items-start relative">
            <nav className="hidden md:flex flex-col w-64 flex-shrink-0 sticky top-28 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={cn(
                    'text-left px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200',
                    activeSection === item.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="flex-1 space-y-16 pb-40 w-full min-w-0">
              <section id="restaurante" className="scroll-mt-28">
                <RestaurantTab
                  restauranteId={restauranteId}
                  value={restaurante}
                  onChange={setRestaurante}
                  onUploadingChange={setEnviandoArquivo}
                />
              </section>
              <section id="perfil" className="scroll-mt-28">
                <PerfilNegocioTab value={perfil} onChange={setPerfil} />
              </section>
              <section id="conhecimento" className="scroll-mt-28">
                <ConhecimentoTab restauranteId={restauranteId} />
              </section>
              <section id="whatsapp" className="scroll-mt-28">
                <WhatsAppTab restauranteId={restauranteId} />
              </section>
              <section id="mascote" className="scroll-mt-28">
                <MascotTab
                  restauranteId={restauranteId}
                  value={mascote}
                  onChange={setMascote}
                  onUploadingChange={setEnviandoArquivo}
                />
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Barra única de salvar — aparece quando há alterações pendentes */}
      {alterado && (
        <div className="sticky bottom-0 z-30 border-t bg-white/95 backdrop-blur shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.15)]">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-6 md:px-10 py-4">
            <p className="text-sm text-muted-foreground">Você tem alterações não salvas.</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={handleDescartar} disabled={salvando}>
                Descartar
              </Button>
              <Button onClick={handleSalvar} disabled={!alterado || salvando || enviandoArquivo} className="min-w-[160px]">
                {salvando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : enviandoArquivo ? (
                  'Aguarde o upload...'
                ) : (
                  'Salvar alterações'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
