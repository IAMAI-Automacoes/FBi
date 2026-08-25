import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const EXPIRACAO_MIN = 1
export const EXPIRACAO_MAX = 365
export const EXPIRACAO_PADRAO = 14

/**
 * Ciclo de vida do feedback.
 *
 * Fica com o dono (e não no painel da plataforma) porque é escolha de negócio:
 * um restaurante que muda o cardápio toda semana quer uma janela curta; um que
 * opera estável o ano inteiro aguenta uma janela longa. Já os parâmetros do
 * envio de mensagem (intervalo mínimo, horário de silêncio) são de operação e
 * ficam no admin — dono ansioso reduzindo o intervalo derrubaria o próprio
 * número por spam.
 */
export function FeedbacksTab({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <Card className="shadow-subtle animate-fade-in-up">
      <CardHeader>
        <CardTitle>Feedbacks</CardTitle>
        <CardDescription>
          Defina por quanto tempo um feedback continua sendo considerado nas análises da IA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="expiracao-feedback">Validade do feedback (dias)</Label>
          <Input
            id="expiracao-feedback"
            type="number"
            min={EXPIRACAO_MIN}
            max={EXPIRACAO_MAX}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange(Number.isFinite(n) ? n : EXPIRACAO_PADRAO)
            }}
          />
          <p className="text-xs text-muted-foreground">
            Padrão: {EXPIRACAO_PADRAO} dias. Feedbacks mais antigos que isso deixam de virar novos
            insights e ações — o restaurante provavelmente já mudou, e agir hoje sobre uma
            reclamação antiga gera tarefa sem contexto.
          </p>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
          <p className="text-xs text-blue-900 leading-relaxed">
            <strong>O feedback não é apagado.</strong> Ele continua visível na página de Feedbacks e
            nos relatórios — a validade só define até quando ele alimenta a geração automática de
            insights.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
