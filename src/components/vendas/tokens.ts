import type { CSSProperties } from 'react'

/* Tokens visuais da landing de vendas.
   Espelham o que já é usado em `components/auth/AuthLayout.tsx` — o visitante
   sai daqui e cai no /login, então as duas telas precisam parecer a mesma marca.
   Padrão do arquivo: Tailwind para layout/responsivo, inline para o visual
   sob medida (gradientes, vidro, sombras coloridas). */

export const cores = {
  azul: '#2563EB',
  azulClaro: '#3B82F6',
  violeta: '#8B5CF6',
  indigo: '#6366F1',
  teal: '#14B8A6',
  tealEscuro: '#0D9488',
  tinta: '#0F172A',
  corpoForte: '#334155',
  corpo: '#475569',
  corpoSuave: '#64748B',
  /** Texto e números de elementos ainda não alcançados (etapa futura). */
  corpoTenue: '#94A3B8',
  borda: '#E9EEF5',
  /** Borda de elemento desativado — um pouco mais densa que `borda`. */
  bordaSuave: '#E2E8F0',
  superficie: '#F8FAFC',
  superficieAlt: '#F1F5F9',
  verde: '#16A34A',
  ambar: '#F59E0B',
} as const

/** Gradiente de assinatura da marca. Usar no máximo uma vez por seção. */
export const GRADIENTE_MARCA = 'linear-gradient(95deg, #3B82F6 0%, #8B5CF6 55%, #14B8A6 100%)'

/** Aplica o gradiente da marca como preenchimento do texto. */
export const textoGradiente: CSSProperties = {
  background: GRADIENTE_MARCA,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
}

/** Card de vidro fosco. `sombra` recebe um rgba tingido — nunca cinza puro. */
export function vidro(opacidade = 0.78, sombra = 'rgba(37,99,235,0.14)'): CSSProperties {
  return {
    background: `rgba(255,255,255,${opacidade})`,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.9)',
    borderRadius: '18px',
    boxShadow: `0 24px 60px ${sombra}, 0 2px 8px rgba(15,23,42,0.04)`,
  }
}

/** Orbe desfocado de fundo. Sempre decorativo — fica atrás e não captura clique. */
export function orbe(
  cor: string,
  tamanho: number,
  posicao: Pick<CSSProperties, 'top' | 'right' | 'bottom' | 'left'>,
): CSSProperties {
  return {
    position: 'absolute',
    width: `${tamanho}px`,
    height: `${tamanho}px`,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${cor} 0%, transparent 65%)`,
    filter: 'blur(26px)',
    pointerEvents: 'none',
    ...posicao,
  }
}

/** Grid translúcido com máscara radial — textura de fundo das seções claras. */
export const gridSutil: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(rgba(37,99,235,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.04) 1px, transparent 1px)',
  backgroundSize: '44px 44px',
  maskImage: 'radial-gradient(circle at 50% 40%, black 0%, transparent 78%)',
  WebkitMaskImage: 'radial-gradient(circle at 50% 40%, black 0%, transparent 78%)',
}

/** Rótulo curto em caixa alta que abre as seções. */
export const rotuloSecao: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: cores.azul,
}

/** Título de seção. Fluido: dispensa media query em estilo inline. */
export const tituloSecao: CSSProperties = {
  fontSize: 'clamp(26px, 3.4vw, 38px)',
  fontWeight: 700,
  lineHeight: 1.15,
  letterSpacing: '-0.025em',
  color: cores.tinta,
}

/** Compensa o header fixo quando se navega por âncora. */
export const ancora: CSSProperties = { scrollMarginTop: '84px' }

export const TRANSICAO = 'transform 0.3s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease'
