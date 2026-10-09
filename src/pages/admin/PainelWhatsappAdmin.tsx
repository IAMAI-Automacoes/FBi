import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronsUpDown, Eye, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { buscarRestaurantesWhatsapp, type RestauranteWhatsappAdmin } from '@/lib/queries/admin'
import { formatarTelefone, normalizarBusca } from '@/lib/whatsapp/formatacao'
import { TelaWhatsapp } from '@/components/whatsapp/TelaWhatsapp'
import { WhatsappDesconectado } from '@/components/whatsapp/WhatsappDesconectado'
import { Avatar, WA } from '@/components/whatsapp/pecas'

/**
 * Painel do admin, aba WhatsApp: escolhe um restaurante e vê a tela
 * WhatsApp dele exatamente como o dono vê — só leitura (TelaWhatsapp
 * modo 'admin': não marca como lida, sem sino, fixar ou "Enviar mensagem").
 *
 * A escolha fica na URL (?restaurante=<id>: recarregar mantém) e no aparelho
 * (o último escolhido abre sozinho ao voltar para a aba).
 */

const CHAVE_ULTIMO = 'easyfeed:admin-wa-restaurante'

function ultimoEscolhido(): string | null {
  try { return localStorage.getItem(CHAVE_ULTIMO) } catch { return null }
}

/** Pesquisa sem acento/maiúscula/pontuação ("mamas" acha "Mama's"); número também pelos dígitos. */
function filtrarRestaurante(valor: string, busca: string, palavras?: string[]): number {
  const termo = normalizarBusca(busca)
  if (!termo) return 1
  const alvo = normalizarBusca([valor, ...(palavras ?? [])].join(' '))
  const junto = (t: string) => t.replace(/\s+/g, '')
  if (alvo.includes(termo) || junto(alvo).includes(junto(termo))) return 1
  const digitos = busca.replace(/\D/g, '')
  return digitos.length >= 3 && (palavras ?? []).some((p) => p.replace(/\D/g, '').includes(digitos)) ? 1 : 0
}

function EscolherRestaurante({ lista, escolhido, aoEscolher, aberto, aoMudarAberto, compacto }: {
  lista: RestauranteWhatsappAdmin[]
  escolhido: RestauranteWhatsappAdmin | null
  aoEscolher: (id: number) => void
  aberto: boolean
  aoMudarAberto: (v: boolean) => void
  /** No topo com um restaurante escolhido (celular): só o botão "Trocar". */
  compacto?: boolean
}) {
  return (
    <Popover open={aberto} onOpenChange={aoMudarAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={aberto}
          aria-label={escolhido ? 'Trocar restaurante' : 'Escolher restaurante'}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-full border border-gray-300 bg-white text-[13.5px] font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50',
            compacto ? 'px-3 py-1.5' : 'w-full max-w-sm justify-between px-4 py-2.5',
          )}
        >
          <span className="truncate">
            {escolhido ? (<><span className="sm:hidden">Trocar</span><span className="hidden sm:inline">Trocar restaurante</span></>) : 'Escolher restaurante'}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))] p-0">
        <Command filter={filtrarRestaurante}>
          <CommandInput placeholder="Pesquisar nome, e-mail ou número" />
          <CommandList className="max-h-[min(380px,60vh)]">
            <CommandEmpty>Nenhum restaurante com isso.</CommandEmpty>
            <CommandGroup>
              {lista.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`${r.nome ?? ''} #${r.id}`}
                  keywords={[r.email ?? '', r.numero_whatsapp ?? '', formatarTelefone(r.numero_whatsapp)]}
                  onSelect={() => aoEscolher(r.id)}
                  className="flex items-center gap-3 py-2"
                >
                  <Avatar nome={r.nome} foto={r.logo_url} tamanho={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-gray-900">
                      {r.nome || `Restaurante ${r.id}`}
                      {r.excluida_em && <span className="ml-1.5 text-[11px] font-normal text-red-500">(excluída)</span>}
                    </p>
                    <p className="truncate text-[12px] text-gray-500">
                      {[r.email, r.numero_whatsapp ? formatarTelefone(r.numero_whatsapp) : null].filter(Boolean).join(' · ') || 'sem e-mail'}
                    </p>
                  </div>
                  {!r.conectado && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">desconectado</span>
                  )}
                  {escolhido?.id === r.id && <Check className="h-4 w-4 shrink-0 text-[#128C7E]" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function PainelWhatsappAdmin() {
  const [params, setParams] = useSearchParams()
  const idUrl = Number(params.get('restaurante')) || null
  const [lista, setLista] = useState<RestauranteWhatsappAdmin[] | null>(null)
  const [erro, setErro] = useState(false)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    let ativo = true
    buscarRestaurantesWhatsapp()
      .then((l) => { if (ativo) setLista(l) })
      .catch(() => { if (ativo) setErro(true) })
    return () => { ativo = false }
  }, [])

  // Voltou para a aba sem ?restaurante=: abre o último escolhido neste aparelho.
  useEffect(() => {
    if (idUrl) return
    const salvo = ultimoEscolhido()
    if (salvo) setParams({ restaurante: salvo }, { replace: true })
  }, [idUrl, setParams])

  const escolher = useCallback((id: number) => {
    try { localStorage.setItem(CHAVE_ULTIMO, String(id)) } catch { /* sem armazenamento */ }
    setAberto(false)
    // Troca de restaurante: começa da lista (sem conversa aberta).
    setParams({ restaurante: String(id) })
  }, [setParams])

  const escolhido = useMemo(() => lista?.find((r) => r.id === idUrl) ?? null, [lista, idUrl])
  const paramsBase = useMemo(() => (escolhido ? { restaurante: String(escolhido.id) } : undefined), [escolhido])
  const restauranteDaTela = useMemo(() => (escolhido
    ? { id: escolhido.id, nome: escolhido.nome, conectado: escolhido.conectado, whatsappDono: escolhido.whatsapp_dono }
    : null), [escolhido])

  if (erro) {
    return <p className="m-auto px-6 text-center text-sm text-gray-500">Não consegui carregar os restaurantes. Recarregue a página.</p>
  }
  if (!lista) {
    return <div className="m-auto"><Loader2 className="h-6 w-6 animate-spin" style={{ color: WA.TEAL }} /></div>
  }

  // Nenhum escolhido (ou o da URL não existe mais): a escolha no meio da tela.
  if (!escolhido || !restauranteDaTela) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#F0F2F5] px-6 text-center">
        <Eye className="h-10 w-10 text-[#128C7E] opacity-80" />
        <div>
          <p className="text-[18px] font-semibold text-gray-800">Escolha um restaurante</p>
          <p className="mt-1 max-w-sm text-[13.5px] text-gray-500">
            Você vê a tela WhatsApp dele exatamente como o dono vê — só leitura.
          </p>
        </div>
        <EscolherRestaurante lista={lista} escolhido={null} aoEscolher={escolher} aberto={aberto} aoMudarAberto={setAberto} />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Topo: qual restaurante está sendo visto, e a troca */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5">
        <Avatar nome={escolhido.nome} foto={escolhido.logo_url} tamanho={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-gray-900">{escolhido.nome || `Restaurante ${escolhido.id}`}</p>
          {/* No celular, o número desce para a linha de baixo em vez de ser cortado. */}
          <p className="flex flex-wrap gap-x-1.5 text-[12.5px] leading-snug text-gray-500">
            <span className="max-w-full truncate">{escolhido.email || 'sem e-mail'}</span>
            <span className="hidden sm:inline" aria-hidden>·</span>
            <span className="whitespace-nowrap">{escolhido.numero_whatsapp ? formatarTelefone(escolhido.numero_whatsapp) : 'sem WhatsApp conectado'}</span>
          </p>
        </div>
        <span
          className={cn(
            'hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium sm:flex',
            escolhido.conectado ? 'bg-[#D9FDD3] text-[#0A6E46]' : 'bg-red-50 text-red-600',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', escolhido.conectado ? 'bg-[#25D366]' : 'bg-red-500')} />
          {escolhido.conectado ? 'Conectado' : 'Desconectado'}
        </span>
        <EscolherRestaurante lista={lista} escolhido={escolhido} aoEscolher={escolher} aberto={aberto} aoMudarAberto={setAberto} compacto />
      </div>

      <div className="min-h-0 flex-1">
        {/* Só com o WhatsApp conectado de verdade; senão, o mesmo aviso que o dono vê. */}
        {escolhido.conectado ? (
          <TelaWhatsapp
            key={escolhido.id}
            modo="admin"
            restaurante={restauranteDaTela}
            paramsBase={paramsBase}
            className="relative flex h-full overflow-hidden bg-white"
          />
        ) : (
          <WhatsappDesconectado modo="admin" className="flex h-full" />
        )}
      </div>
    </div>
  )
}
