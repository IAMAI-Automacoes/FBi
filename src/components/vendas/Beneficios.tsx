import { AlertTriangle, KanbanSquare, FileText, Users, Bot, Palette } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ancora, cores, orbe, rotuloSecao, tituloSecao, TRANSICAO } from './tokens'

interface Beneficio {
  icone: LucideIcon
  titulo: string
  texto: string
  cor: string
  fundo: string
}

/* Todos os itens correspondem a funcionalidades que já existem no produto —
   insights com prioridade, quadro de ações, relatórios em PDF, avaliação por
   garçom, assistente de IA e personalização do QR. Nada aqui é promessa. */
const BENEFICIOS: Beneficio[] = [
  {
    icone: AlertTriangle,
    titulo: 'Insights por prioridade',
    texto:
      'Cada achado chega marcado como urgente, importante ou observação. Você sabe o que olhar primeiro num dia corrido.',
    cor: '#B45309',
    fundo: 'rgba(245,158,11,0.14)',
  },
  {
    icone: KanbanSquare,
    titulo: 'Ações sugeridas pela IA',
    texto:
      'Um quadro que vai de "sugerida" até "concluída". A IA propõe, você aprova, a equipe executa — sem planilha paralela.',
    cor: cores.azul,
    fundo: 'rgba(37,99,235,0.10)',
  },
  {
    icone: FileText,
    titulo: 'Relatórios em PDF',
    texto:
      'Resumo executivo escrito pela IA, com números e recomendação. Pronto para mandar ao sócio ou levar para a reunião.',
    cor: cores.violeta,
    fundo: 'rgba(139,92,246,0.12)',
  },
  {
    icone: Users,
    titulo: 'Avaliação por garçom',
    texto:
      'Descubra quem puxa a nota para cima e quem precisa de treino, com base no que o cliente falou — não no achismo.',
    cor: '#0D9488',
    fundo: 'rgba(20,184,166,0.12)',
  },
  {
    icone: Bot,
    titulo: 'Um assistente que conhece sua casa',
    texto:
      'Pergunte "por que a nota caiu semana passada?" e receba a resposta apoiada nos seus próprios feedbacks.',
    cor: cores.indigo,
    fundo: 'rgba(99,102,241,0.12)',
  },
  {
    icone: Palette,
    titulo: 'QR code com a sua cara',
    texto:
      'Cartaz personalizável com o logo, as cores e o tema do seu restaurante. Gere quantos quiser e baixe em PDF.',
    cor: '#DB2777',
    fundo: 'rgba(219,39,119,0.10)',
  },
]

export function Beneficios() {
  return (
    <section
      id="beneficios"
      style={{
        ...ancora,
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F7FAFF 42%, #F5F9FF 100%)',
        borderTop: `1px solid ${cores.borda}`,
      }}
    >
      <div style={orbe('rgba(139,92,246,0.13)', 460, { top: '8%', left: '-150px' })} />
      <div style={orbe('rgba(20,184,166,0.11)', 400, { bottom: '-120px', right: '-110px' })} />

      <div
        className="relative mx-auto"
        style={{ maxWidth: '1180px', padding: 'clamp(64px, 8vw, 104px) 24px', zIndex: 10 }}
      >
        <div style={{ maxWidth: '640px', marginBottom: 'clamp(40px, 5vw, 60px)' }}>
          <span style={rotuloSecao}>Benefícios</span>
          <h2 style={{ ...tituloSecao, marginTop: '12px', marginBottom: '14px' }}>
            O que você passa a enxergar
          </h2>
          <p style={{ fontSize: '16px', lineHeight: 1.65, color: cores.corpoSuave }}>
            A diferença entre saber que "teve reclamação" e saber exatamente qual turno, qual
            categoria e o que fazer a respeito.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFICIOS.map((b) => {
            const Icone = b.icone
            return (
              <div
                key={b.titulo}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = '0 22px 48px rgba(37,99,235,0.12)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)'
                }}
                style={{
                  background: 'rgba(255,255,255,0.86)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.9)',
                  borderRadius: '18px',
                  padding: '26px 24px 28px',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                  transition: TRANSICAO,
                }}
              >
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '13px',
                    background: b.fundo,
                    color: b.cor,
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
                  {b.titulo}
                </h3>
                <p style={{ fontSize: '14px', lineHeight: 1.6, color: cores.corpoSuave }}>
                  {b.texto}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
