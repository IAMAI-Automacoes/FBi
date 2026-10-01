import { memo, useMemo, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { BotaoSino, MarcasConversa, MenuConversa, useSeguraParaMenu } from '@/components/ControlesConversa'
import {
  horarioLista, nomeConversa, previaMensagem, type ConversaWa,
} from '@/lib/whatsapp/formatacao'
import { Avatar, Tiques, WA } from './pecas'

type Filtro = 'tudo' | 'nao_lidas' | 'grupos'

const ItemConversa = memo(function ItemConversa({ c, ativa, aoAbrir, aoFixar, aoSilenciar }: {
  c: ConversaWa
  ativa: boolean
  aoAbrir: (chatId: string) => void
  aoFixar: (chatId: string) => void
  aoSilenciar: (chatId: string) => void
}) {
  const [menu, setMenu] = useState(false)
  const segurar = useSeguraParaMenu(() => setMenu(true))
  const nome = nomeConversa(c)
  const previa = previaMensagem({
    tipo: c.ultima_tipo, texto: c.ultima_texto, midia_nome: c.ultima_midia_nome,
    reacao: c.ultima_reacao, status: c.ultima_status, de_mim: c.ultima_de_mim,
  })
  const remetente = c.grupo && !c.ultima_de_mim && c.ultima_remetente ? `${c.ultima_remetente}: ` : ''
  const naoLida = c.nao_lidas > 0
  const fixada = !!c.fixada_em
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!segurar.engolirClique()) aoAbrir(c.chat_id) }}
      onKeyDown={(e) => { if (e.key === 'Enter') aoAbrir(c.chat_id) }}
      onPointerDown={segurar.onPointerDown}
      onPointerUp={segurar.onPointerUp}
      onPointerLeave={segurar.onPointerLeave}
      onPointerMove={segurar.onPointerMove}
      onContextMenu={segurar.onContextMenu}
      className={cn('group flex w-full cursor-pointer select-none items-center gap-3 px-3 text-left transition-colors', ativa ? 'bg-[#F0F2F5]' : 'hover:bg-[#F5F6F6]')}
    >
      <Avatar nome={nome} grupo={c.grupo} foto={c.foto_url} tamanho={48} />
      <div className="min-w-0 flex-1 border-b border-gray-100 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[16px] text-[#111b21]">{nome}</span>
          <span className={cn('shrink-0 text-[12px]', naoLida && !c.silenciada ? 'font-medium text-[#1FA855]' : 'text-gray-500')}>
            {horarioLista(c.ultima_enviada_em)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="flex min-w-0 flex-1 items-center gap-1 text-[14px] text-gray-500">
            {c.ultima_de_mim && c.ultima_tipo !== 'reaction' && <Tiques status={c.ultima_status} />}
            <span className={cn('truncate', c.ultima_status === 'DELETED' && 'italic')}>{remetente}{previa}</span>
          </p>
          <MarcasConversa fixada={fixada} silenciada={c.silenciada} />
          {naoLida && (
            <span
              className="shrink-0 min-w-[20px] rounded-full px-1.5 text-center text-[12px] font-semibold leading-5 text-white"
              // Silenciada: contador cinza, como no WhatsApp.
              style={{ background: c.silenciada ? '#A5B0B7' : WA.VERDE }}
            >
              {c.nao_lidas > 99 ? '99+' : c.nao_lidas}
            </span>
          )}
          <MenuConversa
            fixada={fixada}
            silenciada={c.silenciada}
            aoFixar={() => aoFixar(c.chat_id)}
            aoSilenciar={() => aoSilenciar(c.chat_id)}
            aberto={menu}
            aoMudarAberto={setMenu}
            className="-mr-1"
          />
        </div>
      </div>
    </div>
  )
})

export function ListaConversas({
  conversas, carregando, ativa, aoAbrir, aoFixar, aoSilenciar, tudoSilenciado, aoAlternarTudo, aviso,
}: {
  conversas: ConversaWa[]
  carregando: boolean
  ativa: string | null
  aoAbrir: (chatId: string) => void
  aoFixar: (chatId: string) => void
  aoSilenciar: (chatId: string) => void
  /** Sino do topo: todas as notificações do WhatsApp (push e som). */
  tudoSilenciado: boolean
  aoAlternarTudo: () => void
  /** Avisos no topo (notificações, WhatsApp desconectado). */
  aviso?: React.ReactNode
}) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('tudo')

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return conversas.filter((c) => {
      if (filtro === 'nao_lidas' && c.nao_lidas === 0) return false
      if (filtro === 'grupos' && !c.grupo) return false
      if (!termo) return true
      return nomeConversa(c).toLowerCase().includes(termo)
        || (digitos.length >= 3 && (c.telefone ?? '').includes(digitos))
        || (c.ultima_texto ?? '').toLowerCase().includes(termo)
    })
  }, [conversas, busca, filtro])

  const totalNaoLidas = conversas.filter((c) => c.nao_lidas > 0).length

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 px-3 py-3" style={{ background: WA.TEAL, paddingTop: 'max(env(safe-area-inset-top, 0px), 0.75rem)' }}>
        <SidebarTrigger className="text-white hover:bg-white/10 hover:text-white md:hidden" />
        <p className="flex-1 text-[17px] font-semibold text-white">WhatsApp</p>
        <BotaoSino claro silenciado={tudoSilenciado} aoAlternar={aoAlternarTudo} rotulo="notificações do WhatsApp" />
      </div>

      {aviso}

      <div className="shrink-0 space-y-2 px-3 py-2">
        <label className="flex items-center gap-2 rounded-lg bg-[#F0F2F5] px-3 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-gray-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar conversa, nome ou telefone"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-gray-800 placeholder:text-gray-500 focus:outline-none"
            aria-label="Pesquisar conversa"
          />
          {busca && (
            <button type="button" onClick={() => setBusca('')} aria-label="Limpar pesquisa" className="text-gray-500 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        <div className="flex gap-2" role="tablist" aria-label="Filtrar conversas">
          {([['tudo', 'Tudo'], ['nao_lidas', totalNaoLidas ? `Não lidas ${totalNaoLidas}` : 'Não lidas'], ['grupos', 'Grupos']] as [Filtro, string][]).map(([chave, rotulo]) => (
            <button
              key={chave}
              type="button"
              role="tab"
              aria-selected={filtro === chave}
              onClick={() => setFiltro(chave)}
              className={cn(
                'rounded-full px-3 py-1 text-[13px] font-medium transition-colors',
                filtro === chave ? 'bg-[#D9FDD3] text-[#0A6E46]' : 'bg-[#F0F2F5] text-gray-600 hover:bg-gray-200',
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="sem-barra min-h-0 flex-1 overflow-y-auto">
        {carregando ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: WA.TEAL }} /></div>
        ) : visiveis.length === 0 ? (
          <div className="px-6 py-10 text-center text-[14px] text-gray-500">
            {conversas.length === 0
              ? 'Nenhuma conversa ainda. As mensagens que chegarem no WhatsApp do restaurante aparecem aqui na hora.'
              : busca
                ? `Nenhuma conversa com "${busca}".`
                : filtro === 'nao_lidas' ? 'Tudo lido por aqui.' : 'Nenhum grupo.'}
          </div>
        ) : (
          visiveis.map((c) => (
            <ItemConversa key={c.chat_id} c={c} ativa={ativa === c.chat_id} aoAbrir={aoAbrir} aoFixar={aoFixar} aoSilenciar={aoSilenciar} />
          ))
        )}
        {!carregando && conversas.length > 0 && (
          <p className="px-6 py-6 text-center text-[12px] text-gray-400">
            Mostrando as conversas do número conectado ao EasyFeed.
          </p>
        )}
      </div>
    </div>
  )
}
