import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import {
  autorizarDivulgacao, buscarMinhaAutorizacao, revogarDivulgacao,
  type MinhaAutorizacao, type OpcoesDivulgacao,
} from '@/lib/queries/autorizacao-marketing'

const OPCOES: { chave: keyof OpcoesDivulgacao; titulo: string; detalhe: string }[] = [
  { chave: 'pode_nome', titulo: 'Citar o nome do restaurante', detalhe: 'Ex.: "A Cantina X saiu de 58 para 81 pontos de satisfação."' },
  { chave: 'pode_numeros', titulo: 'Mostrar os números do restaurante', detalhe: 'Satisfação, avaliações e melhorias concluídas, medidas pelo EasyFeed.' },
  { chave: 'pode_logo', titulo: 'Usar a logo', detalhe: 'A mesma logo cadastrada aqui em Configurações.' },
  { chave: 'pode_depoimento', titulo: 'Publicar um depoimento meu', detalhe: 'Só com um texto que eu mesmo enviar ou aprovar.' },
]

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const opcoesDe = (a: MinhaAutorizacao | null): OpcoesDivulgacao => ({
  pode_nome: a?.status === 'autorizado' ? a.pode_nome : false,
  pode_numeros: a?.status === 'autorizado' ? a.pode_numeros : false,
  pode_logo: a?.status === 'autorizado' ? a.pode_logo : false,
  pode_depoimento: a?.status === 'autorizado' ? a.pode_depoimento : false,
})

/**
 * Configurações → Divulgação: o dono autoriza (ou não) o EasyFeed a usar os
 * resultados do restaurante no marketing.
 *
 * Salva sozinha, fora da barra "Salvar alterações" da página: autorizar é um
 * ato explícito, não pode ir junto com uma troca de logo. Sem autorização, o
 * restaurante só entra em números anônimos da base.
 */
export function DivulgacaoTab() {
  const { toast } = useToast()
  const { acessoAdmin } = useAuth()
  const [atual, setAtual] = useState<MinhaAutorizacao | null>(null)
  const [opcoes, setOpcoes] = useState<OpcoesDivulgacao>(opcoesDe(null))
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const a = await buscarMinhaAutorizacao()
      setAtual(a)
      setOpcoes(opcoesDe(a))
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const autorizado = atual?.status === 'autorizado'
  const algumaMarcada = Object.values(opcoes).some(Boolean)
  const mudou = OPCOES.some((o) => opcoes[o.chave] !== opcoesDe(atual)[o.chave])
  // O admin dentro da conta vê a seção, mas quem decide é o dono (o banco também recusa).
  const bloqueado = !!acessoAdmin || (atual !== null && !atual.eh_dono)
  const textoMudou = autorizado && atual?.versao_aceita !== atual?.versao_atual

  const autorizar = async () => {
    if (!atual) return
    setSalvando(true)
    try {
      await autorizarDivulgacao(opcoes, atual.versao_atual)
      await carregar()
      toast({ title: 'Autorização salva', description: 'Obrigado! Só usamos o que você marcou.' })
    } catch (e) {
      toast({ title: 'Não foi possível salvar', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  const revogar = async () => {
    setSalvando(true)
    try {
      await revogarDivulgacao()
      await carregar()
      toast({ title: 'Autorização revogada', description: 'Não publicamos mais material novo com o nome do restaurante.' })
    } catch (e) {
      toast({ title: 'Não foi possível revogar', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card className="shadow-subtle border-gray-200/75 rounded-xl overflow-hidden">
      <CardHeader className="bg-white pb-6 border-b border-gray-300">
        <CardTitle className="text-xl">Divulgação dos resultados</CardTitle>
        <CardDescription className="text-sm mt-1">
          Podemos contar a história do seu restaurante no marketing do EasyFeed? É opcional e você muda quando quiser.
          Sem autorização, seus números só entram somados aos de outros restaurantes, sem identificar ninguém.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-6 sm:p-8 bg-white">
        {carregando ? (
          <p className="text-sm text-gray-400">Carregando…</p>
        ) : erro || !atual ? (
          <p className="text-sm text-rose-600">{erro ?? 'Não foi possível carregar.'}</p>
        ) : (
          <>
            {autorizado ? (
              <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Autorizado
                  {atual.autorizado_em ? ` em ${dataHora(atual.autorizado_em)}` : ''}
                  {atual.origem === 'admin' ? ' (registrado pela equipe do EasyFeed a seu pedido)' : ''}.
                </span>
              </p>
            ) : atual.status === 'revogado' ? (
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
                Revogado{atual.revogado_em ? ` em ${dataHora(atual.revogado_em)}` : ''}. Nada novo com o nome do restaurante é publicado.
              </p>
            ) : null}

            <blockquote className="rounded-lg border-l-4 border-primary/40 bg-gray-50 px-4 py-3 text-[13px] leading-relaxed text-gray-700">
              {atual.texto_atual}
            </blockquote>
            {textoMudou && (
              <p className="text-[12.5px] text-amber-700">
                O texto foi atualizado desde a sua autorização. Leia acima e salve de novo para continuar valendo pelo texto novo.
              </p>
            )}

            <div className="space-y-3">
              {OPCOES.map((o) => (
                <label key={o.chave} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={opcoes[o.chave]}
                    disabled={bloqueado || salvando}
                    onChange={(e) => setOpcoes({ ...opcoes, [o.chave]: e.target.checked })}
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{o.titulo}</span>
                    <span className="block text-[12.5px] text-gray-500">{o.detalhe}</span>
                  </span>
                </label>
              ))}
            </div>

            {bloqueado ? (
              <p className="text-[12.5px] text-amber-700">
                {acessoAdmin
                  ? 'Você está dentro da conta do cliente. Esta autorização só pode ser marcada pelo próprio dono.'
                  : 'Só o dono da conta pode decidir a divulgação do restaurante.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={autorizar} disabled={salvando || !algumaMarcada || (autorizado && !mudou && !textoMudou)}>
                  {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {autorizado ? 'Salvar opções' : 'Autorizar'}
                </Button>
                {autorizado && (
                  <Button variant="outline" onClick={revogar} disabled={salvando} className="text-rose-700 hover:text-rose-800">
                    Revogar autorização
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
