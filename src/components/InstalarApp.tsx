import { useEffect, useState } from 'react'
import { Check, Copy, Download, EllipsisVertical, Menu, Share, SquarePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BOTAO_PILULA_AZUL } from '@/lib/estilos-botao'
import { useToast } from '@/hooks/use-toast'
import {
  abertoComoApp, ehAppInstalado, enderecoDoApp, existePedidoDeInstalar, instalar, jaInstalado,
  jeitoDeInstalar, podeInstalarAqui, type AppInstalavel,
} from '@/lib/instalar-app'

type Jeito = ReturnType<typeof jeitoDeInstalar>

const Passo = ({ icone, children }: { icone: React.ReactNode; children: React.ReactNode }) => (
  <li className="flex items-center gap-3">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">{icone}</span>
    <span>{children}</span>
  </li>
)

/**
 * Passo a passo para instalar quando o navegador não oferece com um toque:
 * no iPhone (lá não existe), no Android sem o pedido do Chrome, ou dentro de
 * OUTRO app já instalado (`endereco`: lá só dá para instalar pelo navegador).
 */
export function PassoAPassoInstalar({ aoFechar, nome, jeito = jeitoDeInstalar(), endereco }: {
  aoFechar: () => void
  nome: string
  jeito?: Jeito
  endereco?: string
}) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    if (!endereco) return
    try { await navigator.clipboard.writeText(endereco); setCopiado(true) } catch { /* sem área de transferência: o link fica à vista */ }
  }
  const ultimo = (
    <li className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-[13px] font-bold text-white">✓</span>
      <span>Abra pelo ícone: você já entra logado, e as notificações passam a funcionar.</span>
    </li>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={aoFechar} role="dialog" aria-modal="true" aria-label={`Instalar ${nome}`}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[16px] font-semibold text-gray-900">
            Instalar o {nome}{jeito === 'iphone' ? ' no iPhone' : jeito === 'outro' ? '' : ' no celular'}
          </p>
          <button type="button" onClick={aoFechar} className="-m-2 p-2 text-gray-400 hover:text-gray-600" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        {endereco && (
          <div className="mt-3 space-y-2 text-[14px] text-gray-700">
            <p>Você está dentro de outro app. Abra este endereço no navegador ({jeito === 'iphone' ? 'Safari' : 'Chrome'}):</p>
            <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{endereco}</span>
              <button type="button" onClick={copiar} className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-white px-3 text-[13px] font-semibold text-[#128C7E] shadow-sm">
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p>Depois, lá:</p>
          </div>
        )}
        <ol className="mt-3 space-y-3 text-[14px] text-gray-700">
          {jeito === 'iphone' ? (
            <>
              <Passo icone={<Share className="h-4 w-4 text-[#027EB5]" />}>Toque em <b>Compartilhar</b> na barra do Safari.</Passo>
              <Passo icone={<SquarePlus className="h-4 w-4 text-gray-700" />}>Escolha <b>Adicionar à Tela de Início</b>.</Passo>
            </>
          ) : jeito === 'samsung' ? (
            <>
              <Passo icone={<Menu className="h-4 w-4 text-gray-700" />}>Toque no menu <b>≡</b>, embaixo.</Passo>
              <Passo icone={<SquarePlus className="h-4 w-4 text-gray-700" />}>Escolha <b>Adicionar página a</b> → <b>Tela inicial</b>.</Passo>
            </>
          ) : jeito === 'android' ? (
            <>
              <Passo icone={<EllipsisVertical className="h-4 w-4 text-gray-700" />}>Toque no menu <b>⋮</b> do Chrome, no canto de cima.</Passo>
              <Passo icone={<SquarePlus className="h-4 w-4 text-gray-700" />}>Escolha <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</Passo>
            </>
          ) : (
            <>
              <Passo icone={<Download className="h-4 w-4 text-gray-700" />}>No Chrome ou no Edge, clique no ícone de <b>instalar</b>, no fim da barra de endereço.</Passo>
              <Passo icone={<EllipsisVertical className="h-4 w-4 text-gray-700" />}>Não aparece? Menu <b>⋮</b> → <b>Transmitir, salvar e compartilhar</b> → <b>Instalar página como app</b> (no Edge: <b>Apps</b> → <b>Instalar este site como app</b>).</Passo>
            </>
          )}
          {ultimo}
        </ol>
      </div>
    </div>
  )
}

/**
 * O clique de "instalar" de um app: pede ao navegador quando ele oferece;
 * senão (ou dentro de outro app instalado), mostra o passo a passo.
 * Devolve o clique e o passo a passo para renderizar.
 */
function useInstalar(app: AppInstalavel, nome: string) {
  const { toast } = useToast()
  const [, renovar] = useState(0)
  const [passo, setPasso] = useState<{ endereco?: string } | null>(null)
  useEffect(() => {
    const f = () => renovar((n) => n + 1)
    window.addEventListener('easyfeed:pode-instalar', f)
    return () => window.removeEventListener('easyfeed:pode-instalar', f)
  }, [])

  const clicar = async () => {
    if (ehAppInstalado()) { setPasso({ endereco: enderecoDoApp(app) }); return }
    if (!existePedidoDeInstalar()) { setPasso({}); return }
    const r = await instalar(app)
    if (r === 'aceito') toast({ title: `${nome} instalado`, description: 'Abra pelo ícone na tela inicial.' })
    else if (r === 'indisponivel') setPasso({})
  }
  const passoAPasso = passo && <PassoAPassoInstalar nome={nome} endereco={passo.endereco} aoFechar={() => setPasso(null)} />
  return { clicar, passoAPasso }
}

/**
 * Botão "Instalar …" de um dos apps do site (Easy Feed no cabeçalho, ZapFeed
 * na tela WhatsApp). Some dentro do próprio app e depois de instalado. No
 * celular e no computador aparece sempre: sem o pedido do navegador, mostra o
 * passo a passo (no computador, o ícone da barra de endereço). (Instalar de novo, mesmo
 * depois de sumir daqui: Perfil → `CartaoInstalarApps`.)
 *
 * `variante`: 'claro' para fundo colorido (cabeçalho verde do WhatsApp),
 * 'escuro' para fundo branco (cabeçalho do painel, com o azul padrão do site).
 */
export function BotaoInstalarApp({ app, nome, rotulo, destacar = false, variante = 'claro' }: {
  app: AppInstalavel
  nome: string
  rotulo: string
  destacar?: boolean
  variante?: 'claro' | 'escuro'
}) {
  const { clicar, passoAPasso } = useInstalar(app, nome)

  if (abertoComoApp(app)) return null
  // Fora de um app instalado, "já instalado" esconde: o Chrome para de
  // oferecer e o botão cairia no passo a passo à toa.
  if (!ehAppInstalado() && jaInstalado(app)) return null

  const forte = destacar || podeInstalarAqui(app)
  return (
    <>
      <button
        type="button"
        onClick={clicar}
        className={cn(
          'flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-colors',
          // Fundo branco: a pílula azul padrão do site (BOTAO_PILULA_AZUL).
          variante === 'escuro'
            ? cn(BOTAO_PILULA_AZUL, 'px-3 text-[13px] font-semibold')
            : forte ? 'bg-white text-[#128C7E] hover:bg-white/90' : 'text-white/90 hover:bg-white/10 hover:text-white',
          destacar && 'animate-pulse',
        )}
        title={`Instalar o ${nome} na tela inicial`}
      >
        <Download className="h-4 w-4" />
        <span>{rotulo}</span>
      </button>
      {passoAPasso}
    </>
  )
}

/** Uma linha do cartão do Perfil: o app, para que serve e o botão (sempre à mostra). */
function LinhaInstalar({ app, nome, descricao }: { app: AppInstalavel; nome: string; descricao: string }) {
  const { clicar, passoAPasso } = useInstalar(app, nome)
  const aberto = abertoComoApp(app)
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{nome}</p>
        <p className="text-[13px] text-gray-600">{aberto ? 'Você está usando este app agora.' : descricao}</p>
      </div>
      <button
        type="button"
        onClick={clicar}
        className="flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
      >
        <Download className="h-4 w-4" />
        Instalar {nome}
      </button>
      {passoAPasso}
    </li>
  )
}

/**
 * Perfil → "Instalar o app": fica SEMPRE aqui, mesmo depois que os botões do
 * cabeçalho e da tela WhatsApp somem (app já instalado). É por onde a pessoa
 * instala de novo, noutro aparelho ou depois de apagar o ícone.
 */
export function CartaoInstalarApps({ comZapFeed }: { comZapFeed: boolean }) {
  return (
    <ul className="divide-y divide-gray-100">
      <LinhaInstalar app="easyfeed" nome="Easy Feed" descricao="O painel inteiro na tela inicial, com notificações." />
      {comZapFeed && (
        <LinhaInstalar app="whatsapp" nome="ZapFeed" descricao="Só as conversas do WhatsApp do restaurante, num app à parte." />
      )}
    </ul>
  )
}
