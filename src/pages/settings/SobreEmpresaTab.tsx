import { Building2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LIMITES_DA_EMPRESA, RAMOS_DE_EMPRESA, type SobreAEmpresa } from '@/lib/areas'

/* Configurações da versão RH → "Sobre a empresa". É o lugar de "Sobre o
   restaurante" na outra versão: o que a IA precisa saber do negócio para ler o
   feedback da equipe e sugerir ações que façam sentido ali. Quem salva é a
   barra da página (Settings.tsx), junto com o resto. */
export function SobreEmpresaTab({ value, onChange }: { value: SobreAEmpresa; onChange: (v: SobreAEmpresa) => void }) {
  // Um ramo que não está na lista (escrito antes, ou trocado pelo admin) continua aparecendo.
  const ramos = value.ramo && !RAMOS_DE_EMPRESA.includes(value.ramo) ? [value.ramo, ...RAMOS_DE_EMPRESA] : RAMOS_DE_EMPRESA

  return (
    <Card className="shadow-subtle border-gray-200/75 rounded-xl overflow-hidden">
      <CardHeader className="bg-white pb-6 border-b border-gray-300">
        <CardTitle className="text-xl">Sobre a empresa</CardTitle>
        <CardDescription className="text-sm mt-1">
          O que a IA leva em conta ao ler o que a equipe fala e ao sugerir ações. Quanto mais ela souber do dia a dia, menos genérica fica a sugestão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-6 sm:p-8 bg-white">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-gray-900">O negócio</h3>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="empresa_ramo" className="text-gray-700">Ramo</Label>
            <Select value={value.ramo} onValueChange={(v) => onChange({ ...value, ramo: v })}>
              <SelectTrigger id="empresa_ramo"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {ramos.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="empresa_funcionarios" className="text-gray-700">Número de funcionários</Label>
            <Input
              id="empresa_funcionarios"
              inputMode="numeric"
              value={value.numero_funcionarios}
              onChange={(e) => onChange({ ...value, numero_funcionarios: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              placeholder="Ex: 35"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="empresa_o_que_faz" className="text-gray-700">O que a empresa faz</Label>
          <Textarea
            id="empresa_o_que_faz"
            value={value.o_que_faz}
            onChange={(e) => onChange({ ...value, o_que_faz: e.target.value.slice(0, LIMITES_DA_EMPRESA.o_que_faz) })}
            rows={3}
            placeholder="Ex: Loja de materiais de construção com entrega própria. A equipe se divide entre balcão, estoque e motoristas."
          />
          <p className="text-xs text-muted-foreground tabular-nums">{value.o_que_faz.length}/{LIMITES_DA_EMPRESA.o_que_faz}</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="empresa_turnos" className="text-gray-700">Turnos de trabalho</Label>
            <Input
              id="empresa_turnos"
              value={value.turnos}
              onChange={(e) => onChange({ ...value, turnos: e.target.value.slice(0, LIMITES_DA_EMPRESA.turnos) })}
              placeholder="Ex: Segunda a sábado, 8h às 18h, com escala no sábado"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="empresa_unidades" className="text-gray-700">Unidades</Label>
            <Input
              id="empresa_unidades"
              value={value.unidades}
              onChange={(e) => onChange({ ...value, unidades: e.target.value.slice(0, LIMITES_DA_EMPRESA.unidades) })}
              placeholder="Ex: Matriz no Centro e filial na Zona Sul"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
