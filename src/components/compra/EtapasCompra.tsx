import { Check } from 'lucide-react'
import { cores } from '@/components/vendas/tokens'
import { ETAPAS_COMPRA, type EtapaCompra } from './etapas'

interface EtapasCompraProps {
  etapa: EtapaCompra
  /** `undefined` usa a legenda padrão da etapa · uma string sobrescreve ·
      `null` não renderiza legenda alguma. */
  legenda?: string | null
  /** `compacto` cabe nos 340px do AuthLayout; `confortavel` serve 520px+. */
  densidade?: 'compacto' | 'confortavel'
  alinhamento?: 'inicio' | 'centro'
  marginBottom?: number
}

const MEDIDAS = {
  compacto: { circulo: 18, numero: 11, rotulo: 11.5, gap: 6, legenda: 12.5, check: 10 },
  confortavel: { circulo: 22, numero: 12, rotulo: 13, gap: 8, legenda: 13.5, check: 12 },
} as const

/* Trilha de progresso da compra.

   Puramente derivada de props: zero useState, zero useEffect. Não é preferência
   de estilo — a tela de auth já teve um bug em que o useState congelava entre
   /login e /cadastro (o React reconciliava em vez de remontar). Guardar a etapa
   em estado reintroduziria aquela mesma classe de falha, então a etapa sempre
   vem de um literal ou da rota. */
export function EtapasCompra({
  etapa,
  legenda,
  densidade = 'confortavel',
  alinhamento = 'inicio',
  marginBottom = 24,
}: EtapasCompraProps) {
  const m = MEDIDAS[densidade]
  const definicao = ETAPAS_COMPRA.find((e) => e.numero === etapa)
  const textoLegenda = legenda === undefined ? definicao?.legenda : legenda

  return (
    <div style={{ marginBottom: `${marginBottom}px` }}>
      <ol
        aria-label="Progresso da assinatura"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${m.gap}px`,
          listStyle: 'none',
          margin: alinhamento === 'centro' ? '0 auto' : 0,
          padding: 0,
          // Em telas largas (a de planos tem 880px) a trilha esticada vira
          // traços gigantes e perde densidade visual.
          maxWidth: alinhamento === 'centro' ? '420px' : undefined,
          // Rede de segurança para um rótulo que cresça além do contrato.
          overflow: 'hidden',
        }}
      >
        {ETAPAS_COMPRA.map((def, i) => {
          const concluida = def.numero < etapa
          const atual = def.numero === etapa
          const ultima = i === ETAPAS_COMPRA.length - 1

          return (
            <li
              key={def.numero}
              aria-current={atual ? 'step' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${m.gap}px`,
                flex: ultima ? 'none' : 1,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  width: `${m.circulo}px`,
                  height: `${m.circulo}px`,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `${m.numero}px`,
                  fontWeight: 700,
                  color: concluida || atual ? '#FFFFFF' : cores.corpoTenue,
                  backgroundColor: concluida
                    ? cores.verde
                    : atual
                      ? cores.azul
                      : 'transparent',
                  border: concluida || atual ? 'none' : `1.5px solid ${cores.bordaSuave}`,
                  transition: 'background-color 0.2s ease, border-color 0.2s ease',
                }}
              >
                {concluida ? (
                  <Check aria-hidden style={{ width: m.check, height: m.check }} strokeWidth={3} />
                ) : (
                  def.numero
                )}
              </span>

              <span
                style={{
                  fontSize: `${m.rotulo}px`,
                  fontWeight: atual ? 600 : 500,
                  color: atual ? cores.tinta : concluida ? cores.corpoSuave : cores.corpoTenue,
                  whiteSpace: 'nowrap',
                }}
              >
                {def.rotulo}
                {concluida && <span className="sr-only"> (concluído)</span>}
              </span>

              {/* O conector é o que faz a trilha parecer contínua entre telas:
                  ele vai ficando verde conforme as etapas são concluídas. Sem
                  isso, só a bolinha muda e parecem três indicadores distintos. */}
              {!ultima && (
                <span
                  aria-hidden
                  style={{
                    flex: 1,
                    height: '1.5px',
                    minWidth: '8px',
                    backgroundColor: concluida ? 'rgba(22,163,74,0.45)' : cores.borda,
                    transition: 'background-color 0.2s ease',
                  }}
                />
              )}
            </li>
          )
        })}
      </ol>

      {textoLegenda && (
        <p
          style={{
            fontSize: `${m.legenda}px`,
            color: cores.corpoSuave,
            lineHeight: 1.5,
            marginTop: '10px',
            textAlign: alinhamento === 'centro' ? 'center' : 'left',
          }}
        >
          {textoLegenda}
        </p>
      )}
    </div>
  )
}
