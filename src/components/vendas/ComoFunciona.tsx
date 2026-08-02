import { QrCode, MessageSquare, Brain, ListChecks } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ancora, cores, gridSutil, orbe, rotuloSecao, tituloSecao, TRANSICAO } from './tokens'

interface Passo {
  icone: LucideIcon
  titulo: string
  texto: string
  cor: string
  fundo: string
}

const PASSOS: Passo[] = [
  {
    icone: QrCode,
    titulo: 'QR code na mesa',
    texto:
      'Coloque no cardápio, na mesa ou junto da conta. O cliente aponta a câmera — e pronto.',
    cor: cores.azul,
    fundo: 'rgba(37,99,235,0.10)',
  },
  {
    icone: MessageSquare,
    titulo: 'Ele responde no WhatsApp',
    texto:
      'Sem baixar app, sem cadastro, sem formulário de dez perguntas. Ele escreve (ou manda áudio) como já fala com um amigo.',
    cor: '#0D9488',
    fundo: 'rgba(20,184,166,0.12)',
  },
  {
    icone: Brain,
    titulo: 'A IA lê e classifica',
    texto:
      'Cada mensagem vira sentimento, categoria e prioridade automaticamente. Reclamação de espera não se mistura com elogio ao prato.',
    cor: cores.violeta,
    fundo: 'rgba(139,92,246,0.12)',
  },
  {
    icone: ListChecks,
    titulo: 'Você recebe a ação pronta',
    texto:
      'Não é mais um gráfico bonito: é "reforce o turno da noite" — com o motivo e os feedbacks que sustentam aquilo.',
    cor: '#B45309',
    fundo: 'rgba(245,158,11,0.14)',
  },
]

export function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      style={{ ...ancora, position: 'relative', overflow: 'hidden', background: '#FFFFFF' }}
    >
      <div style={orbe('rgba(59,130,246,0.10)', 420, { top: '-140px', right: '-100px' })} />
      <div style={gridSutil} />

      <div
        className="relative mx-auto"
        style={{ maxWidth: '1180px', padding: 'clamp(64px, 8vw, 104px) 24px', zIndex: 10 }}
      >
        <div style={{ maxWidth: '620px', marginBottom: 'clamp(40px, 5vw, 60px)' }}>
          <span style={rotuloSecao}>Como funciona</span>
          <h2 style={{ ...tituloSecao, marginTop: '12px', marginBottom: '14px' }}>
            Do prato à decisão, em quatro passos
          </h2>
          <p style={{ fontSize: '16px', lineHeight: 1.65, color: cores.corpoSuave }}>
            Você não precisa mudar nada na operação. O cliente responde pelo canal que já usa todo
            dia, e o trabalho de ler, cruzar e priorizar fica com a IA.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PASSOS.map((passo, i) => {
            const Icone = passo.icone
            return (
              <div
                key={passo.titulo}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = '0 20px 44px rgba(15,23,42,0.09)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)'
                }}
                style={{
                  position: 'relative',
                  background: '#FFFFFF',
                  border: `1px solid ${cores.borda}`,
                  borderRadius: '18px',
                  padding: '24px 22px 26px',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                  transition: TRANSICAO,
                }}
              >
                {/* Numeração discreta — reforça a ordem sem competir com o título */}
                <span
                  style={{
                    position: 'absolute',
                    top: '20px',
                    right: '22px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'rgba(100,116,139,0.32)',
                  }}
                >
                  0{i + 1}
                </span>

                <div
                  className="flex items-center justify-center"
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '13px',
                    background: passo.fundo,
                    color: passo.cor,
                    marginBottom: '18px',
                  }}
                >
                  <Icone className="h-5 w-5" />
                </div>

                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    color: cores.tinta,
                    marginBottom: '8px',
                  }}
                >
                  {passo.titulo}
                </h3>
                <p style={{ fontSize: '14px', lineHeight: 1.6, color: cores.corpoSuave }}>
                  {passo.texto}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
