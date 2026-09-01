import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { AlertTriangle, Loader2, Pencil } from 'lucide-react'
import { AcaoAgente, ACOES_DESTRUTIVAS, CAMPOS_CONFIG } from '@/lib/queries/agente-ia'
import { cn } from '@/lib/utils'

const ROTULO_TIPO: Record<string, string> = {
  atualizar_config: 'Alterar configuração',
  criar_anotacao: 'Guardar anotação',
  excluir_anotacao: 'Apagar anotação',
}

// Só os campos das alterações que sobraram: anotação e perfil do restaurante.
// Os de ação e insight saíram junto com a capacidade de criá-las pelo chat.
const ROTULO_CAMPO: Record<string, string> = {
  fato: 'O que guardar',
  valor: 'Novo valor',
}

const OPCOES: Record<string, string[]> = {}

/** Campos longos ganham textarea. */
const LONGOS = new Set(['fato'])

export function ConfirmacaoAcao({
  acao,
  onConfirmar,
  onCancelar,
}: {
  acao: AcaoAgente
  /** Recebe os dados possivelmente editados pelo dono. */
  onConfirmar: (dados: Record<string, any>) => Promise<void>
  onCancelar: () => void
}) {
  const [dados, setDados] = useState<Record<string, any>>({ ...(acao.dados || {}) })
  const [salvando, setSalvando] = useState(false)
  const destrutiva = ACOES_DESTRUTIVAS.includes(acao.tipo)

  const set = (k: string, v: string) => setDados((p) => ({ ...p, [k]: v }))

  // id nunca é editável; nas exclusões não há o que ajustar
  const editaveis = Object.keys(dados).filter((k) => k !== 'id' && k !== 'campo')

  const confirmar = async () => {
    setSalvando(true)
    try {
      await onConfirmar(dados)
    } finally {
      setSalvando(false)
    }
  }

  const rotulo = (k: string) =>
    acao.tipo === 'atualizar_config' && k === 'valor'
      ? CAMPOS_CONFIG[dados.campo] || 'Novo valor'
      : ROTULO_CAMPO[k] || k.replace(/_/g, ' ')

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onCancelar() }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destrutiva && <AlertTriangle className="h-4 w-4 text-rose-500" />}
            {ROTULO_TIPO[acao.tipo] || 'Confirmar alteração'}
          </DialogTitle>
          <DialogDescription>{acao.descricao}</DialogDescription>
        </DialogHeader>

        {!destrutiva && editaveis.length > 0 && (
          <>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground -mb-1">
              <Pencil className="h-3 w-3" /> Você pode ajustar antes de confirmar
            </p>
            <div className="space-y-4 max-h-[50vh] overflow-y-auto sem-barra pr-1">
              {editaveis.map((k) => (
                <div key={k} className="space-y-1.5">
                  <Label className="text-xs">{rotulo(k)}</Label>

                  {OPCOES[k] ? (
                    <div className="flex flex-wrap gap-1.5">
                      {OPCOES[k].map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => set(k, o)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                            String(dados[k]).toUpperCase() === o
                              ? 'bg-primary text-white border-primary'
                              : 'bg-white text-muted-foreground border-gray-200 hover:border-primary/40',
                          )}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  ) : LONGOS.has(k) ? (
                    <Textarea
                      rows={3}
                      className="resize-none text-sm"
                      value={String(dados[k] ?? '')}
                      onChange={(e) => set(k, e.target.value)}
                    />
                  ) : (
                    <Input
                      className="text-sm"
                      value={String(dados[k] ?? '')}
                      onChange={(e) => set(k, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {destrutiva && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
            Essa alteração remove um item. Você poderá desfazer depois, mas confira antes.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button
            onClick={confirmar}
            disabled={salvando}
            className={destrutiva ? 'bg-rose-600 hover:bg-rose-700' : ''}
          >
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {salvando ? 'Aplicando…' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
