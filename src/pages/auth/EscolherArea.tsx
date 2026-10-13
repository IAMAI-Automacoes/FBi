import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, Loader2, LogOut, Store, Users } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { BrandMark } from '@/components/auth/AuthLayout'
import { cores, orbe } from '@/components/vendas/tokens'
import { DEFINICOES, RECUSA_DA_ESCOLHA, type Area } from '@/lib/areas'
import { esquecerConviteDeArea, lerConviteDeArea } from '@/lib/convite-area'
import { buscarOpcoesDeArea, escolherArea } from '@/lib/queries/areas'

/* Logo depois de criar e-mail e senha: qual versão do EasyFeed a conta vai usar
   (Restaurante ou RH). Quem manda a pessoa para cá é o RotaProtegida, quando a
   conta ainda não tem área.

   Por enquanto o RH é por convite: sem o link do admin, o banco só oferece
   Restaurante, e esta tela escolhe sozinha, sem mostrar nada (o cadastro de
   sempre não ganha um passo). A escolha vale uma vez; depois, só o admin troca. */

const ICONE: Record<Area, typeof Store> = { restaurante: Store, rh: Users }

export default function EscolherArea() {
  const { usuario, logout } = useAuth()
  const location = useLocation()
  const [opcoes, setOpcoes] = useState<Area[] | null>(null)
  const [escolhendo, setEscolhendo] = useState<Area | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const ja = useRef(false)

  // Para onde a pessoa ia quando a trava a trouxe para cá (ex.: a volta da compra).
  const destino = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from
  const seguir = () => {
    // Recarrega de propósito: é o jeito mais simples de o app inteiro reler a
    // conta já com a versão (menu, rotas, textos). Acontece uma vez na vida da conta.
    const caminho = destino?.pathname && destino.pathname !== '/escolher-versao' ? `${destino.pathname}${destino.search ?? ''}` : '/'
    window.location.replace(caminho)
  }

  const escolher = async (area: Area) => {
    if (escolhendo) return
    setEscolhendo(area)
    setErro(null)
    try {
      const r = await escolherArea(area, lerConviteDeArea()?.convite ?? null)
      if (r.ok) {
        esquecerConviteDeArea()
        seguir()
        return
      }
      if (r.motivo === 'convite_invalido') {
        // O link venceu: sobra só a versão que não precisa de convite.
        esquecerConviteDeArea()
        setOpcoes(['restaurante'])
      }
      setErro(RECUSA_DA_ESCOLHA[r.motivo ?? ''] ?? 'Não foi possível salvar a escolha. Tente de novo.')
    } catch {
      setErro('Não foi possível salvar a escolha. Confira a internet e tente de novo.')
    }
    setEscolhendo(null)
  }

  useEffect(() => {
    if (ja.current || !usuario) return
    ja.current = true
    ;(async () => {
      try {
        const r = await buscarOpcoesDeArea(lerConviteDeArea()?.convite ?? null)
        if (r.atual) return seguir()
        // Uma opção só: não há o que perguntar.
        if (r.opcoes.length === 1) return escolher(r.opcoes[0])
        setOpcoes(r.opcoes)
      } catch {
        setErro('Não foi possível carregar as versões. Recarregue a página.')
        setOpcoes([])
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario])

  const carregando = opcoes === null || (opcoes.length <= 1 && !erro)

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', background: 'linear-gradient(165deg, #F5F9FF 0%, #EEF6FF 50%, #F0FBFF 100%)' }}>
      <div style={orbe('rgba(59,130,246,0.18)', 480, { top: '-150px', left: '-120px' })} />
      <div style={orbe('rgba(139,92,246,0.14)', 420, { bottom: '-140px', right: '-110px' })} />

      <div className="relative mx-auto" style={{ maxWidth: '880px', padding: 'clamp(32px, 6vw, 64px) 24px', zIndex: 10 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 'clamp(32px, 5vw, 48px)' }}>
          <BrandMark size={60} />
          <button
            onClick={() => logout()}
            className="inline-flex items-center"
            style={{ gap: '7px', height: '38px', padding: '0 14px', fontSize: '13.5px', fontWeight: 500, color: cores.corpo, background: 'rgba(255,255,255,0.7)', border: `1px solid ${cores.borda}`, borderRadius: '10px', cursor: 'pointer' }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>

        {carregando ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: '40vh' }} role="status" aria-live="polite">
            <Loader2 className="h-9 w-9 animate-spin" style={{ color: cores.azul }} />
            <p style={{ marginTop: '14px', fontSize: '14px', color: cores.corpoSuave }}>Preparando a sua conta...</p>
          </div>
        ) : (
          <>
            <div className="text-center" style={{ marginBottom: 'clamp(28px, 4vw, 40px)' }}>
              <h1 style={{ fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, color: cores.tinta, marginBottom: '12px' }}>
                Qual versão do EasyFeed você vai usar?
              </h1>
              <p className="mx-auto" style={{ fontSize: '15.5px', lineHeight: 1.65, color: cores.corpoSuave, maxWidth: '520px' }}>
                O EasyFeed se adapta à sua área. Escolha com calma: a versão fica valendo para esta conta.
              </p>
            </div>

            {erro && (
              <div role="alert" className="mx-auto text-center" style={{ maxWidth: '620px', marginBottom: '20px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: '12px', padding: '13px 15px', fontSize: '13.5px', color: '#B91C1C' }}>
                {erro}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {(opcoes ?? []).map((area) => {
                const d = DEFINICOES[area]
                const Icone = ICONE[area]
                const esta = escolhendo === area
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => escolher(area)}
                    disabled={!!escolhendo}
                    className="group text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 disabled:cursor-default"
                    style={{ background: 'rgba(255,255,255,0.92)', border: `1px solid ${esta ? cores.azul : cores.borda}`, borderRadius: '18px', padding: '26px 24px', boxShadow: '0 10px 30px -18px rgba(15,23,42,0.25)', opacity: escolhendo && !esta ? 0.55 : 1, cursor: escolhendo ? 'default' : 'pointer' }}
                  >
                    <span className="flex items-center justify-center" style={{ width: '46px', height: '46px', borderRadius: '13px', background: 'rgba(37,99,235,0.09)', color: cores.azul, marginBottom: '18px' }}>
                      <Icone className="h-[22px] w-[22px]" />
                    </span>
                    <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: cores.azul }}>{d.resumo}</p>
                    <p style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', color: cores.tinta, margin: '4px 0 10px' }}>{d.nome}</p>
                    <p style={{ fontSize: '14.5px', lineHeight: 1.6, color: cores.corpo }}>{d.descricao}</p>
                    <p style={{ fontSize: '13px', lineHeight: 1.5, color: cores.corpoSuave, marginTop: '10px' }}>{d.paraQuem}</p>
                    <span className="inline-flex items-center justify-center" style={{ gap: '7px', marginTop: '20px', height: '42px', width: '100%', borderRadius: '11px', fontSize: '14.5px', fontWeight: 600, color: '#fff', background: cores.azul }}>
                      {esta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {esta ? 'Salvando...' : `Usar a versão ${d.nome}`}
                    </span>
                  </button>
                )
              })}
            </div>

            {(opcoes ?? []).length > 1 && (
              <p className="text-center" style={{ marginTop: '22px', fontSize: '13px', color: cores.corpoSuave }}>
                Depois de escolher, a troca de versão é feita só pelo suporte.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
