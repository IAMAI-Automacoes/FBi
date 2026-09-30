import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { BrandMark, WhatsAppIcon } from '@/components/auth/AuthLayout'
import { CICLOS, RECURSOS_INCLUSOS, type Ciclo } from '@/components/vendas/ciclos-plano'
import { cores, orbe } from '@/components/vendas/tokens'
import { EtapasCompra } from '@/components/compra/EtapasCompra'
import { usePrecos } from '@/hooks/use-precos'
import { criarCheckout, ErroStripe, guardarCodigoIndicacao, lerCodigoIndicacao } from '@/lib/queries/stripe'
import { Check, Loader2, LogOut } from 'lucide-react'

/* Destino de toda conta sem plano ativo. Cobre três situações com uma tela só:
   nunca assinou, abandonou o checkout no meio, ou a assinatura venceu.
   O texto muda conforme o status; o resto é igual. */
export default function Assinatura() {
  const { usuario, logout, ehAdminPlataforma } = useAuth()
  const navigate = useNavigate()
  const status = usuario?.assinatura_status ?? 'sem_assinatura'
  const { planos, carregando, erro, porCiclo, recarregar } = usePrecos()
  const [abrindo, setAbrindo] = useState<Ciclo | null>(null)
  const [erroCheckout, setErroCheckout] = useState<string | null>(null)
  const [codigo, setCodigo] = useState(() => lerCodigoIndicacao())

  // Usuário logado: a função lê o JWT, grava o restaurante na metadata e o
  // webhook vincula sozinho. Volta em /checkout/sucesso.
  const assinar = async (ciclo: Ciclo) => {
    if (abrindo) return
    setAbrindo(ciclo)
    setErroCheckout(null)
    try {
      guardarCodigoIndicacao(codigo)
      const url = await criarCheckout(ciclo, { codigoAfiliado: codigo || undefined })
      window.location.assign(url)
    } catch (e) {
      const invalido = e instanceof ErroStripe && Boolean(e.corpo?.codigo_afiliado_invalido)
      setErroCheckout(
        invalido ? 'Código de indicação inválido. Confira ou deixe em branco.'
        : e instanceof Error ? e.message : 'Não foi possível iniciar o pagamento.',
      )
      setAbrindo(null)
    }
  }

  // Admin não é cliente: pode ver esta tela mas seguir sem pagar. A marca de
  // sessão libera o gate (RotaProtegida) até o fim da sessão; num novo login ele
  // vê a tela de novo. Cliente comum não tem este botão.
  const pularComoAdmin = () => {
    sessionStorage.setItem('admin_pulou_pagamento', '1')
    navigate('/', { replace: true })
  }

  const copy =
    status === 'inadimplente'
      ? {
          titulo: 'Não conseguimos renovar sua assinatura',
          texto:
            'O último pagamento não foi aprovado. Escolha um plano abaixo para regularizar e recuperar o acesso — seus dados continuam guardados.',
        }
      : status === 'cancelada'
        ? {
            titulo: 'Sua assinatura foi encerrada',
            texto:
              'Você pode reativar quando quiser — seus feedbacks, insights e configurações continuam salvos. Ao reativar, é só reconectar o WhatsApp em instantes para voltar a receber feedbacks.',
          }
        : {
            titulo: 'Escolha um plano para começar',
            texto:
              'Sua conta está criada. Falta ativar a assinatura para liberar o painel, os insights e o QR code do seu restaurante.',
          }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', background: 'linear-gradient(165deg, #F5F9FF 0%, #EEF6FF 50%, #F0FBFF 100%)' }}>
      <div style={orbe('rgba(59,130,246,0.18)', 480, { top: '-150px', left: '-120px' })} />
      <div style={orbe('rgba(139,92,246,0.14)', 420, { bottom: '-140px', right: '-110px' })} />

      <div className="relative mx-auto" style={{ maxWidth: '880px', padding: 'clamp(32px, 6vw, 64px) 24px', zIndex: 10 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 'clamp(32px, 5vw, 48px)' }}>
          <div className="flex items-center">
            <BrandMark size={60} />
          </div>
          <button
            onClick={() => logout()}
            className="inline-flex items-center"
            style={{ gap: '7px', height: '38px', padding: '0 14px', fontSize: '13.5px', fontWeight: 500, color: cores.corpo, background: 'rgba(255,255,255,0.7)', border: `1px solid ${cores.borda}`, borderRadius: '10px', cursor: 'pointer' }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>

        {/* Incondicional: esta tela só é alcançável por quem não tem plano
            ativo (gate em RotaProtegida), então todo mundo aqui está comprando.
            `legenda={null}` porque o parágrafo logo abaixo já explica — duas
            frases explicativas empilhadas viram ruído. */}
        <EtapasCompra etapa={1} alinhamento="centro" legenda={null} marginBottom={28} />

        <div className="text-center" style={{ marginBottom: 'clamp(28px, 4vw, 40px)' }}>
          <h1 style={{ fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, color: cores.tinta, marginBottom: '12px' }}>
            {copy.titulo}
          </h1>
          <p className="mx-auto" style={{ fontSize: '15.5px', lineHeight: 1.65, color: cores.corpoSuave, maxWidth: '520px' }}>
            {copy.texto}
          </p>
        </div>

        {(erro || (!carregando && planos.length === 0)) && (
          <div role="alert" className="text-center" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: '12px', padding: '13px 15px', fontSize: '13.5px', color: '#B91C1C', marginBottom: '20px' }}>
            Não conseguimos carregar os preços agora.{' '}
            <button type="button" onClick={recarregar} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              Tentar de novo
            </button>
          </div>
        )}
        {erroCheckout && (
          <p role="alert" className="text-center" style={{ fontSize: '13.5px', color: '#B91C1C', marginBottom: '16px' }}>
            {erroCheckout}
          </p>
        )}

        {/* Código de indicação (afiliado) — opcional, validado no servidor. */}
        <div className="mx-auto flex items-center" style={{ maxWidth: '420px', gap: '10px', marginBottom: '22px' }}>
          <label htmlFor="codigo-indicacao" style={{ fontSize: '13px', fontWeight: 600, color: cores.corpoSuave, whiteSpace: 'nowrap' }}>
            Código de indicação
          </label>
          <input
            id="codigo-indicacao"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="opcional"
            maxLength={30}
            disabled={abrindo !== null}
            autoComplete="off"
            style={{ flex: 1, height: '40px', padding: '0 12px', fontSize: '14px', fontWeight: 600, letterSpacing: '0.04em', color: cores.tinta, background: '#FFFFFF', border: `1px solid ${cores.borda}`, borderRadius: '10px', outline: 'none' }}
          />
        </div>

        {/* Ciclos — cada card abre o Stripe Checkout já com o plano escolhido.
            Valores vêm do Stripe (usePrecos); enquanto carregam, esqueleto. */}
        <div className="grid gap-4 sm:grid-cols-3" style={{ marginBottom: '32px' }}>
          {CICLOS.map((c) => {
            const plano = porCiclo(c.id)
            const ocupado = abrindo !== null
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => assinar(c.id)}
                disabled={ocupado || !plano}
                aria-busy={abrindo === c.id}
                style={{ display: 'block', textAlign: 'left', width: '100%', background: '#FFFFFF', border: `1px solid ${cores.borda}`, borderRadius: '18px', padding: '22px 20px', cursor: ocupado || !plano ? 'not-allowed' : 'pointer', opacity: ocupado && abrindo !== c.id ? 0.6 : 1, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
                onMouseEnter={(e) => {
                  if (ocupado || !plano) return
                  e.currentTarget.style.transform = 'translateY(-3px)'
                  e.currentTarget.style.boxShadow = '0 18px 40px rgba(37,99,235,0.14)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)'
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: cores.tinta }}>{c.rotulo}</span>
                  {plano?.descontoPercentual != null && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: cores.verde, background: 'rgba(22,163,74,0.12)', borderRadius: '999px', padding: '2px 8px' }}>
                      −{plano.descontoPercentual}%
                    </span>
                  )}
                </div>
                {plano ? (
                  <>
                    <div className="flex items-baseline" style={{ gap: '4px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: cores.corpoSuave }}>R$</span>
                      <span style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: cores.tinta }}>
                        {plano.mensalEquivalente}
                      </span>
                      <span style={{ fontSize: '13px', color: cores.corpoSuave }}>/mês</span>
                    </div>
                    <p style={{ fontSize: '12.5px', color: cores.corpoSuave }}>
                      {abrindo === c.id ? (
                        <span className="inline-flex items-center" style={{ gap: '6px' }}>
                          <Loader2 className="h-3 w-3 animate-spin" /> Abrindo pagamento...
                        </span>
                      ) : (
                        plano.descricao
                      )}
                    </p>
                  </>
                ) : (
                  <div aria-busy="true">
                    <div style={{ height: '30px', width: '110px', borderRadius: '8px', background: cores.superficieAlt, marginBottom: '8px' }} />
                    <div style={{ height: '12px', width: '150px', borderRadius: '6px', background: cores.superficieAlt }} />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div style={{ background: 'rgba(255,255,255,0.75)', border: `1px solid ${cores.borda}`, borderRadius: '18px', padding: '24px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: cores.tinta, marginBottom: '14px' }}>
            Incluso em qualquer plano
          </p>
          <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {RECURSOS_INCLUSOS.map((r) => (
              <li key={r} className="flex items-start" style={{ gap: '9px' }}>
                <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} style={{ color: cores.verde, marginTop: '3px' }} />
                <span style={{ fontSize: '13.5px', lineHeight: 1.5, color: cores.corpoForte }}>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center" style={{ marginTop: '28px' }}>
          <a
            href="https://wa.me/5511952138636"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
            style={{ gap: '7px', fontSize: '13.5px', fontWeight: 500, color: '#25D366', textDecoration: 'none' }}
          >
            <WhatsAppIcon size={15} />
            Falar com o suporte
          </a>
        </div>

        {/* Só admin: segue sem pagar (não é cliente). Discreto, fora do fluxo. */}
        {ehAdminPlataforma && (
          <div className="text-center" style={{ marginTop: '16px' }}>
            <button
              onClick={pularComoAdmin}
              style={{ fontSize: '13px', fontWeight: 500, color: cores.corpoSuave, background: 'transparent', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
            >
              Pular pagamento (admin) →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
