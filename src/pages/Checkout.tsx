import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { BrandMark } from '@/components/auth/AuthLayout'
import { cores, orbe, TRANSICAO } from '@/components/vendas/tokens'
import { buscarCiclo, ehCiclo, recursosDaArea } from '@/components/vendas/ciclos-plano'
import { EtapasCompra } from '@/components/compra/EtapasCompra'
import { CaixaCupom } from '@/components/compra/CaixaCupom'
import { CampoIndicacao, conferirCodigoIndicacao } from '@/components/compra/CampoIndicacao'
import { usePrecos } from '@/hooks/use-precos'
import { useArea } from '@/lib/area'
import { buscarDocumentoSalvo, criarCheckout, ErroCobranca, type Modalidade } from '@/lib/queries/cobranca'
import { buscarDescontoDoCodigo } from '@/lib/queries/indicacoes'
import { documentoValido, somenteDigitos } from '../../supabase/functions/_shared/asaas/regras.ts'

/** 52998224725 → 529.982.247-25; 14 dígitos → 00.000.000/0000-00. */
function mascaraDocumento(v: string): string {
  const d = somenteDigitos(v).slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/* Confirmação do plano antes de ir para o pagamento. Rota protegida: quem
   chega aqui está autenticado (a landing manda criar a conta antes).
   O botão cria a cobrança no Asaas (`criar-cobranca`) e leva para a fatura,
   onde a pessoa põe o cartão. Semestral e anual podem ser à vista (renova
   sozinho) ou parcelados com o acréscimo do cartão parcelado (não renova). O
   cupom de acesso continua funcionando. */
export default function Checkout() {
  const [params] = useSearchParams()
  const { usuario, logout } = useAuth()
  const { area, ehRh } = useArea()
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Fatura vencida de uma assinatura atrasada: o caminho é pagar essa.
  const [regularizarUrl, setRegularizarUrl] = useState<string | null>(null)

  const cicloParam = params.get('ciclo')
  const ciclo = ehCiclo(cicloParam) ? cicloParam : 'mensal'
  const definicao = buscarCiclo(ciclo)
  const { porCiclo, carregando: carregandoPreco } = usePrecos(ehRh ? 'rh' : 'restaurante')
  const plano = porCiclo(ciclo)
  const [modalidade, setModalidade] = useState<Modalidade>('recorrente')
  const parcelado = modalidade === 'parcelado' && Boolean(plano?.parcelas)

  // CPF/CNPJ de quem paga — o Asaas exige. Preenche com o da última compra.
  const [documento, setDocumento] = useState('')
  // Código de indicação: começa vazio (o do link fica guardado sem aparecer).
  const [codigoIndicacao, setCodigoIndicacao] = useState('')
  // O desconto que o código digitado dá (código de vendedor); entra sozinho na fatura.
  const [descontoCodigo, setDescontoCodigo] = useState<{ pct: number; cobrancas: number } | null>(null)
  useEffect(() => {
    setDescontoCodigo(null)
    if (codigoIndicacao.trim().length < 2) return
    let vivo = true
    const t = setTimeout(() => {
      buscarDescontoDoCodigo(codigoIndicacao).then((d) => { if (vivo) setDescontoCodigo(d.pct > 0 ? d : null) })
    }, 400)
    return () => { vivo = false; clearTimeout(t) }
  }, [codigoIndicacao])
  const [aceite, setAceite] = useState(false)
  useEffect(() => {
    let vivo = true
    buscarDocumentoSalvo()
      .then((d) => { if (vivo && d) setDocumento((atual) => atual || mascaraDocumento(d)) })
      .catch(() => { /* só preenchimento */ })
    return () => { vivo = false }
  }, [])
  const documentoOk = documentoValido(documento) !== null
  const documentoErrado = somenteDigitos(documento).length >= 11 && !documentoOk && somenteDigitos(documento).length !== 12 && somenteDigitos(documento).length !== 13
  const podePagar = !enviando && Boolean(plano) && documentoOk && aceite

  const irParaPagamento = async () => {
    if (!podePagar) return
    setEnviando(true)
    setErro(null)
    setRegularizarUrl(null)
    try {
      const trava = await conferirCodigoIndicacao(codigoIndicacao)
      if (trava) {
        setErro(trava)
        setEnviando(false)
        return
      }
      const url = await criarCheckout(ciclo, {
        modalidade: parcelado ? 'parcelado' : 'recorrente',
        cpfCnpj: somenteDigitos(documento),
      })
      window.location.assign(url)
    } catch (e) {
      const url = e instanceof ErroCobranca && typeof e.corpo?.regularizar_url === 'string' ? e.corpo.regularizar_url : null
      setRegularizarUrl(url)
      setErro(e instanceof Error ? e.message : 'Não foi possível iniciar o pagamento.')
      setEnviando(false)
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(165deg, #F5F9FF 0%, #EEF6FF 50%, #F0FBFF 100%)',
      }}
    >
      <div style={orbe('rgba(59,130,246,0.18)', 480, { top: '-150px', left: '-120px' })} />
      <div style={orbe('rgba(139,92,246,0.14)', 420, { bottom: '-140px', right: '-110px' })} />

      {/* Cabeçalho enxuto — sem navegação que tire a pessoa do fluxo de pagamento */}
      <div
        className="relative mx-auto flex items-center justify-between"
        style={{ maxWidth: '760px', padding: '22px 24px', zIndex: 10 }}
      >
        <Link to="/assinatura" className="flex items-center" style={{ textDecoration: 'none' }}>
          <BrandMark size={60} />
        </Link>

        <button
          type="button"
          onClick={() => logout()}
          className="inline-flex items-center"
          style={{
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
            color: cores.corpoSuave,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </button>
      </div>

      <div
        className="relative mx-auto"
        style={{ maxWidth: '520px', padding: '12px 24px 64px', zIndex: 10 }}
      >
        {/* Volta para a lista de planos, não para a landing pública: quem está
            aqui já tem conta e só quer trocar de ciclo. */}
        <Link
          to="/assinatura"
          className="inline-flex items-center"
          style={{
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
            color: cores.corpoSuave,
            textDecoration: 'none',
            marginBottom: '18px',
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Escolher outro plano
        </Link>

        {/* Fora do card: dentro competiria com a pílula do plano e o h1. */}
        <EtapasCompra etapa={2} marginBottom={20} />

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.9)',
            borderRadius: '24px',
            padding: 'clamp(26px, 4vw, 36px)',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.9) inset, 0 30px 70px rgba(37,99,235,0.16), 0 12px 28px rgba(15,23,42,0.08)',
          }}
        >
          <div
            className="inline-flex items-center"
            style={{
              gap: '6px',
              background: 'rgba(37,99,235,0.08)',
              borderRadius: '999px',
              padding: '5px 12px',
              marginBottom: '18px',
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: cores.azul }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: cores.azul }}>
              Plano {definicao.rotulo.toLowerCase()}
            </span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(22px, 3vw, 27px)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: cores.tinta,
              marginBottom: '8px',
            }}
          >
            Confirme sua assinatura
          </h1>
          {usuario?.email && (
            <p style={{ fontSize: '14px', color: cores.corpoSuave, marginBottom: '24px' }}>
              A conta <strong style={{ color: cores.corpoForte }}>{usuario.email}</strong> terá
              acesso liberado assim que o pagamento for confirmado.
            </p>
          )}

          {/* Resumo do valor */}
          <div
            style={{
              background: cores.superficie,
              border: `1px solid ${cores.borda}`,
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '22px',
            }}
          >
            {plano ? (
              <>
                <div className="flex items-baseline" style={{ gap: '7px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: cores.corpoSuave }}>R$</span>
                  <span
                    style={{
                      fontSize: '40px',
                      fontWeight: 700,
                      letterSpacing: '-0.03em',
                      lineHeight: 1,
                      color: cores.tinta,
                    }}
                  >
                    {parcelado ? plano.valorParcela : plano.mensalEquivalente}
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 500, color: cores.corpoSuave }}>
                    {parcelado ? `× ${plano.parcelas}` : '/mês'}
                  </span>
                </div>
                <p style={{ fontSize: '13.5px', color: cores.corpoSuave, marginTop: '8px' }}>
                  {parcelado
                    ? `${plano.parcelas}x no cartão · total ${plano.totalParcelado} · não renova sozinho`
                    : plano.descricao}
                  {plano.descontoPercentual !== null && (
                    <span style={{ color: cores.verde, fontWeight: 600 }}>
                      {' '}
                      · economia de {plano.descontoPercentual}%
                    </span>
                  )}
                </p>
              </>
            ) : carregandoPreco ? (
              <div aria-busy="true">
                <div style={{ height: '40px', width: '150px', borderRadius: '10px', background: cores.superficieAlt, marginBottom: '10px' }} />
                <div style={{ height: '13px', width: '200px', borderRadius: '6px', background: cores.superficieAlt }} />
              </div>
            ) : (
              <p style={{ fontSize: '13.5px', color: '#B91C1C' }}>
                O valor exato aparece na tela de pagamento.
              </p>
            )}
          </div>

          {/* À vista (renova) ou parcelado (com acréscimo, não renova) */}
          {plano?.parcelas && (
            <div role="radiogroup" aria-label="Forma de pagamento" style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
              {[
                {
                  id: 'recorrente' as const,
                  titulo: `À vista · ${plano.totalCobrado}`,
                  texto: `No cartão, renova sozinho a cada ${ciclo === 'anual' ? '12' : '6'} meses`,
                },
                {
                  id: 'parcelado' as const,
                  titulo: `${plano.parcelas}x de R$ ${plano.valorParcela} (total ${plano.totalParcelado})`,
                  texto: 'No cartão · não renova sozinho',
                },
              ].map((op) => {
                const marcado = modalidade === op.id
                return (
                  <button
                    key={op.id}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    onClick={() => setModalidade(op.id)}
                    disabled={enviando}
                    className="flex items-start text-left"
                    style={{
                      gap: '10px',
                      width: '100%',
                      padding: '13px 14px',
                      background: marcado ? 'rgba(37,99,235,0.06)' : '#FFFFFF',
                      border: `1.5px solid ${marcado ? cores.azul : cores.borda}`,
                      borderRadius: '13px',
                      cursor: enviando ? 'not-allowed' : 'pointer',
                      transition: TRANSICAO,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: '16px',
                        height: '16px',
                        marginTop: '2px',
                        flexShrink: 0,
                        borderRadius: '50%',
                        border: `2px solid ${marcado ? cores.azul : cores.borda}`,
                        boxShadow: marcado ? 'inset 0 0 0 3px #FFFFFF' : 'none',
                        background: marcado ? cores.azul : '#FFFFFF',
                      }}
                    />
                    <span>
                      <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: cores.tinta }}>{op.titulo}</span>
                      <span style={{ display: 'block', fontSize: '12.5px', color: cores.corpoSuave, marginTop: '2px' }}>{op.texto}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <CampoIndicacao
            valor={codigoIndicacao}
            onChange={(v) => { setCodigoIndicacao(v); setErro(null) }}
            disabled={enviando}
            marginBottom={descontoCodigo ? '8px' : '18px'}
          />
          {descontoCodigo && (
            <p style={{ fontSize: '12.5px', fontWeight: 600, color: '#047857', margin: '0 0 18px 4px' }}>
              Este código dá {String(descontoCodigo.pct).replace('.', ',')}% de desconto
              {descontoCodigo.cobrancas > 1 ? ` nas ${descontoCodigo.cobrancas} primeiras cobranças` : ' na primeira cobrança'}. Já sai na fatura.
            </p>
          )}

          <label htmlFor="documento" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: cores.corpoForte, marginBottom: '6px' }}>
            CPF ou CNPJ de quem paga
          </label>
          <input
            id="documento"
            value={documento}
            onChange={(e) => { setDocumento(mascaraDocumento(e.target.value)); setErro(null) }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            disabled={enviando}
            aria-invalid={documentoErrado}
            style={{
              width: '100%',
              height: '46px',
              padding: '0 14px',
              fontSize: '15px',
              fontWeight: 500,
              color: cores.tinta,
              background: '#FFFFFF',
              border: `1px solid ${documentoErrado ? 'rgba(239,68,68,0.6)' : cores.borda}`,
              borderRadius: '11px',
              outline: 'none',
              marginBottom: '6px',
            }}
          />
          <p style={{ fontSize: '12px', lineHeight: 1.5, color: documentoErrado ? '#B91C1C' : cores.corpoSuave, marginBottom: '16px' }}>
            {documentoErrado
              ? 'Confira os números: este CPF ou CNPJ não é válido.'
              : 'Vai na fatura. O cartão você informa na próxima tela, no ambiente seguro do Asaas.'}
          </p>

          <label className="flex items-start" style={{ gap: '9px', fontSize: '13px', lineHeight: 1.5, color: cores.corpo, marginBottom: '18px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={aceite}
              onChange={(e) => setAceite(e.target.checked)}
              disabled={enviando}
              style={{ marginTop: '3px', width: '15px', height: '15px', accentColor: cores.azul, flexShrink: 0 }}
            />
            <span>
              Concordo com a cobrança descrita acima e com a{' '}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" style={{ color: cores.azul, textDecoration: 'underline' }}>
                política de privacidade
              </a>
              .
            </span>
          </label>

          {erro && (
            <div
              role="alert"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.22)',
                borderRadius: '12px',
                padding: '13px 15px',
                fontSize: '13.5px',
                lineHeight: 1.55,
                color: '#B91C1C',
                marginBottom: '18px',
              }}
            >
              {erro}
              {regularizarUrl && (
                <a
                  href={regularizarUrl}
                  className="flex items-center justify-center"
                  style={{ marginTop: '10px', height: '42px', borderRadius: '10px', background: '#B91C1C', color: '#FFFFFF', fontWeight: 600, textDecoration: 'none' }}
                >
                  Pagar fatura em aberto
                </a>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={irParaPagamento}
            disabled={!podePagar}
            className="flex items-center justify-center"
            style={{
              width: '100%',
              height: '54px',
              gap: '8px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#FFFFFF',
              background: cores.azul,
              border: 'none',
              borderRadius: '13px',
              cursor: podePagar ? 'pointer' : 'not-allowed',
              opacity: podePagar ? 1 : 0.6,
              boxShadow: '0 12px 30px rgba(37,99,235,0.30)',
              transition: TRANSICAO,
            }}
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecionando...
              </>
            ) : (
              'Ir para o pagamento'
            )}
          </button>

          <p
            className="text-center"
            style={{ fontSize: '12.5px', color: cores.corpoSuave, margin: '10px 0 22px' }}
          >
            {parcelado
              ? 'Pagamento seguro pelo Asaas · parcelado no cartão'
              : 'Pagamento seguro pelo Asaas · cancele quando quiser'}
          </p>

          {/* Cupom de acesso — em segundo plano, recolhido */}
          <CaixaCupom />

          <div style={{ height: '1px', background: cores.borda, marginBottom: '20px' }} />

          <ul style={{ display: 'grid', gap: '10px', listStyle: 'none', padding: 0, margin: 0 }}>
            {recursosDaArea(area).map((r) => (
              <li key={r} className="flex items-start" style={{ gap: '9px' }}>
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '6px',
                    background: 'rgba(22,163,74,0.12)',
                    color: cores.verde,
                    marginTop: '1px',
                  }}
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                <span style={{ fontSize: '13.5px', lineHeight: 1.5, color: cores.corpoForte }}>
                  {r}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
