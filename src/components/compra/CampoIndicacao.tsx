import { Gift } from 'lucide-react'
import { cores } from '@/components/vendas/tokens'
import { guardarCodigoIndicacao } from '@/lib/indicacao'
import { registrarIndicacao } from '@/lib/queries/indicacoes'
import { RECUSA_QUE_TRAVA } from '@/lib/indicacoes'

/* Código de indicação — o campo principal das telas de compra (/assinatura e
   /checkout). Começa sempre vazio: o código de um link `?ref=` fica guardado no
   navegador e é registrado sem aparecer aqui. Quem confere é o banco. */
export function CampoIndicacao({
  valor,
  onChange,
  disabled,
  marginBottom = '22px',
}: {
  valor: string
  onChange: (v: string) => void
  disabled?: boolean
  marginBottom?: string
}) {
  return (
    <div
      style={{
        background: cores.superficie,
        border: `1px solid ${cores.borda}`,
        borderRadius: '14px',
        padding: '16px',
        marginBottom,
      }}
    >
      <label htmlFor="codigo-indicacao" className="flex items-center" style={{ gap: '7px', marginBottom: '10px' }}>
        <Gift className="h-4 w-4" style={{ color: cores.azul }} />
        <span style={{ fontSize: '13.5px', fontWeight: 600, color: cores.corpoForte }}>
          Tem um código de indicação?
        </span>
      </label>
      <input
        id="codigo-indicacao"
        value={valor}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="Digite o código (opcional)"
        maxLength={30}
        disabled={disabled}
        autoComplete="off"
        style={{
          width: '100%',
          height: '44px',
          padding: '0 14px',
          fontSize: '14px',
          fontWeight: 600,
          letterSpacing: '0.02em',
          color: cores.tinta,
          background: '#FFFFFF',
          border: `1px solid ${cores.borda}`,
          borderRadius: '11px',
          outline: 'none',
        }}
      />
      <p style={{ fontSize: '11.5px', color: cores.corpoSuave, marginTop: '9px', lineHeight: 1.5 }}>
        Se alguém indicou o EasyFeed para você, digite o código dessa pessoa.
      </p>
    </div>
  )
}

/** Guarda e registra o código digitado. Devolve a mensagem que trava a compra
    (hoje só o próprio código) ou null para seguir. Campo vazio: segue sem mexer
    no código guardado de um link. */
export async function conferirCodigoIndicacao(codigo: string): Promise<string | null> {
  if (!codigo.trim()) return null
  guardarCodigoIndicacao(codigo)
  const r = await registrarIndicacao(codigo)
  return r.motivo ? RECUSA_QUE_TRAVA[r.motivo] ?? null : null
}
