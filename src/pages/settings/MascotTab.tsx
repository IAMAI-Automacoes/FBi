import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ASSISTANT_PERSONALITIES } from '@/lib/mascote-config'
import { cn } from '@/lib/utils'

export interface MascoteForm {
  nome: string
  personalidade: string
  /** Mantido no modelo (o chat usa como avatar quando existe), mas não é mais
      editável pelas configurações — o padrão é a inicial do nome. */
  foto_url: string
  /** 'perguntar' = confirma antes de mexer | 'automatico' = já faz e permite desfazer */
  modo_acao: 'perguntar' | 'automatico'
}

export function MascotTab({
  value,
  onChange,
}: {
  restauranteId: number | null
  value: MascoteForm
  onChange: (v: MascoteForm) => void
  onUploadingChange?: (v: boolean) => void
}) {
  return (
    <Card className="shadow-subtle animate-fade-in-up">
      <CardHeader>
        <CardTitle>Assistente de IA</CardTitle>
        <CardDescription>
          Configure a identidade e personalidade do assistente virtual que analisa os feedbacks do
          seu restaurante. O nome e a personalidade aparecem no chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-5 max-w-sm">
          <div className="space-y-2">
            <Label htmlFor="assistente-nome">Nome do Assistente</Label>
            <Input
              id="assistente-nome"
              value={value.nome}
              onChange={(e) => onChange({ ...value, nome: e.target.value })}
              placeholder="Ex: Ana, Max, Aria..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assistente-personalidade">Personalidade</Label>
            <Select
              value={value.personalidade}
              onValueChange={(v) => onChange({ ...value, personalidade: v })}
            >
              <SelectTrigger id="assistente-personalidade">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {ASSISTANT_PERSONALITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {value.personalidade === 'direto_objetivo' &&
                'Respostas curtas e focadas no que o gestor precisa agir imediatamente.'}
              {value.personalidade === 'detalhado_analitico' &&
                'Análises aprofundadas com padrões, tendências e correlações dos dados.'}
              {value.personalidade === 'motivador_positivo' &&
                'Apresenta dados de forma construtiva, destacando oportunidades de melhoria.'}
              {value.personalidade === 'formal_profissional' &&
                'Linguagem técnica e estruturada para comunicações executivas.'}
            </p>
          </div>
        </div>

        <div className="border-t pt-6 space-y-3">
          <div>
            <Label>Quando a IA precisar mexer no sistema</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Ela pode criar e editar ações e insights, e atualizar o perfil do restaurante.
              Toda alteração fica registrada e pode ser desfeita.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              {
                v: 'perguntar' as const,
                titulo: 'Perguntar antes',
                desc: 'Ela propõe e você confirma num popup. Recomendado.',
              },
              {
                v: 'automatico' as const,
                titulo: 'Fazer sozinha',
                desc: 'Ela já aplica e mostra um botão para desfazer.',
              },
            ]).map((op) => (
              <button
                key={op.v}
                type="button"
                onClick={() => onChange({ ...value, modo_acao: op.v })}
                className={cn(
                  'rounded-lg border-2 p-3 text-left transition-all',
                  value.modo_acao === op.v
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:bg-muted',
                )}
              >
                <p className="text-sm font-semibold">{op.titulo}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{op.desc}</p>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Excluir algo sempre pede confirmação, mesmo no modo automático.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
