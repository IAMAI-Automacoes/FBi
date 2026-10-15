import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Ticket } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { cores } from '@/components/vendas/tokens'
import { resgatarCupom } from '@/lib/queries/cupom'
import { textoDoDesconto } from '@/lib/cupons'

/* Cupom de acesso — libera sem depender do pagamento (o resgate é no servidor,
   função `resgatar-cupom`). Usado no /checkout e no /assinatura.
   Cupom de acesso: atualiza o usuário e entra no app. Cupom só de desconto:
   fica guardado na conta e a pessoa continua na tela para assinar. */
export function CaixaCupom({ marginBottom = '22px' }: { marginBottom?: string }) {
  const navigate = useNavigate()
  const { refetchUsuario } = useAuth()
  const [cupom, setCupom] = useState('')
  const [aplicandoCupom, setAplicandoCupom] = useState(false)
  const [erroCupom, setErroCupom] = useState<string | null>(null)
  // Cupom só de desconto: ficou guardado na conta (não libera o acesso agora).
  const [descontoGuardado, setDescontoGuardado] = useState<string | null>(null)

  const aplicarCupom = async () => {
    const codigo = cupom.trim()
    if (!codigo || aplicandoCupom) return
    setAplicandoCupom(true)
    setErroCupom(null)
    try {
      const r = await resgatarCupom(codigo)
      // Só desconto: fica guardado e entra na cobrança quando o pagamento novo
      // chegar. A pessoa continua aqui para assinar.
      if (!r.acesso) {
        setDescontoGuardado(r.desconto ? textoDoDesconto(r.desconto) : 'O desconto')
        setCupom('')
        setAplicandoCupom(false)
        return
      }
      // Atualiza o usuário (assinatura_status vira "ativa") e entra no app.
      // O RotaProtegida encaminha para o onboarding ou para o painel.
      await refetchUsuario()
      navigate('/', { replace: true })
    } catch (e) {
      setErroCupom(e instanceof Error ? e.message : 'Não foi possível aplicar o cupom.')
      setAplicandoCupom(false)
    }
  }

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
      <div className="flex items-center" style={{ gap: '7px', marginBottom: '10px' }}>
        <Ticket className="h-4 w-4" style={{ color: cores.azul }} />
        <span style={{ fontSize: '13.5px', fontWeight: 600, color: cores.corpoForte }}>
          Tem um cupom de acesso?
        </span>
      </div>
      <div className="flex" style={{ gap: '8px' }}>
        <input
          value={cupom}
          onChange={(e) => { setCupom(e.target.value); setErroCupom(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') aplicarCupom() }}
          placeholder="Digite o código"
          disabled={aplicandoCupom}
          aria-label="Código do cupom"
          style={{
            flex: 1,
            minWidth: 0,
            height: '44px',
            padding: '0 14px',
            fontSize: '14px',
            fontWeight: 600,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: cores.tinta,
            background: '#FFFFFF',
            border: `1px solid ${cores.borda}`,
            borderRadius: '11px',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={aplicarCupom}
          disabled={aplicandoCupom || !cupom.trim()}
          className="flex items-center justify-center"
          style={{
            height: '44px',
            padding: '0 18px',
            gap: '7px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#FFFFFF',
            background: cores.azul,
            border: 'none',
            borderRadius: '11px',
            cursor: aplicandoCupom || !cupom.trim() ? 'not-allowed' : 'pointer',
            opacity: aplicandoCupom || !cupom.trim() ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {aplicandoCupom ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
        </button>
      </div>
      {erroCupom && (
        <p role="alert" style={{ fontSize: '12.5px', color: '#B91C1C', marginTop: '9px' }}>
          {erroCupom}
        </p>
      )}
      {descontoGuardado && (
        <p role="status" style={{ fontSize: '12.5px', color: '#047857', marginTop: '9px', lineHeight: 1.5 }}>
          Cupom guardado na sua conta: {descontoGuardado}. Ele entra na sua mensalidade quando o novo sistema de
          pagamento começar; por enquanto a cobrança segue o valor normal.
        </p>
      )}
      <p style={{ fontSize: '11.5px', color: cores.corpoSuave, marginTop: '9px', lineHeight: 1.5 }}>
        Cupom de acesso libera na hora, sem passar pelo pagamento. Cupom de desconto fica guardado para a cobrança.
      </p>
    </div>
  )
}
