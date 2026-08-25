# Motor de Resposta — Status da implementação

Atualizado: 2026-08-25. Ambiente: produção (`lixrcruilisncfhfhndo`) — não há staging.

## Onde parou

**Passos 1 a 6 concluídos e verificados no banco real.** O motor está instalado,
rodando a cada 5 minutos, e **desligado em todos os restaurantes** (`ativo = false`).
Nenhuma mensagem é enviada a ninguém até você ligar.

Os passos 7 e 8 dependem de você (webhook do n8n) e estão descritos no fim.

## O que já está em produção

| Item | Estado | Como foi verificado |
|---|---|---|
| `contatos` + resolução automática | ✅ | 22 contatos, 71 feedbacks com `contato_id`, 0 órfãos |
| Normalização de telefone | ✅ | `+55 (11) 99999-0001@s.whatsapp.net` e `5511999990001` → 1 contato só |
| `feedback_acao` (N:N) | ✅ | Apagar o insight zera `insight_id` mas **os vínculos sobrevivem** |
| E2 — feedback usado/livre | ✅ | Criar insight marca 6; apagar libera os 6 |
| Histórico de status | ✅ | Grava `PENDENTE->EM_ANDAMENTO` |
| Fila de avisos | ✅ | T-D: 3 feedbacks/1 ação = **1 aviso** |
| Regressão cancela em cascata | ✅ | Ação que volta cancela só os avisos dela; as outras seguem |
| `SUGERIDA` não comunica | ✅ | 0 avisos gerados |
| Lock por contato | ✅ | 1º worker pega, 2º é barrado |
| Confirmar/falhar envio | ✅ | Falha devolve à fila e **não** avança cooldown; sucesso avança |
| Config por restaurante | ✅ | 4 restaurantes com `motor_resposta`, todos `ativo: false` |
| Worker + `pg_cron` | ✅ | `pg_cron → pg_net → edge function`, HTTP 200 às 13:30 |
| UI admin / dono / selo | ✅ | Build passa, 0 erros de lint |
| Agrupamento (blocos) | ✅ | 25 testes automatizados — `npm test` |

## Testes de aceitação do SPEC

| Teste | Onde foi verificado | Estado |
|---|---|---|
| T-A rajada inicial | fórmula, Node + SQL | ✅ |
| T-B represamento | fórmula, Node + SQL | ✅ |
| T-C esvaziamento total | fórmula (mesma conta do T-B) | ✅ |
| T-D dedup N feedbacks → 1 ação | banco real | ✅ |
| T-E 1 feedback → N ações | banco real + agrupamento | ✅ |
| T-F anti-spam (cooldown único) | fórmula, Node + SQL | ✅ |
| T-G ordenação no bloco | agrupamento (Node) | ✅ |
| T-H ack intacto | nenhum nó do n8n foi tocado (D4) | ✅ por construção |

`npm test` roda os 25 testes de agrupamento, disparo e quiet hours. Antes deste
trabalho o script era um stub (`echo "there are no tests"`).

## Dois bugs encontrados pelos testes

Ambos teriam passado despercebidos em revisão de código e quebrado em produção:

1. **`AFTER DELETE` não liberava o feedback.** A FK `ON DELETE SET NULL` zera a
   coluna *antes* de um `AFTER DELETE` rodar, então o `where usado_por_insight_id
   = old.id` não achava nada. Resultado observado: 6 feedbacks presos com
   `usado_em` preenchido e nenhum dono — invisíveis para sempre. Corrigido para
   `BEFORE DELETE`.

2. **Cooldown não avançava se a linha de janela não existisse.** `motor_confirmar_envio`
   fazia `UPDATE`, que não falha nem afeta nada quando não há linha. A pessoa
   receberia outra mensagem na janela seguinte — I1 quebrada, sem erro nenhum
   aparecendo. Corrigido para `INSERT ... ON CONFLICT`.

## Uma constatação sobre o dado histórico

O backfill de `feedback_acao` encontrou **zero** vínculos: das 17 ações existentes,
16 estão com `insight_id` nulo e a única que sobrou aponta para um insight com
`feedback_ids` vazio.

Não é falha do backfill — é o dano que a auditoria previu, já consumado. O
`ON DELETE SET NULL` apagou esses vínculos ao longo do tempo e **eles são
irrecuperáveis**. Não afeta o motor (que só olha transições futuras) e reforça a
decisão de não enviar nada retroativo.

## O que falta

### Passo 7 — envio real (depende de você)

1. Criar o workflow `easyfeed-enviar-retorno` no n8n — contrato em [`03-n8n.md`](03-n8n.md)
2. Me passar (ou configurar como secrets do projeto):
   - `MOTOR_RETORNO_WEBHOOK_URL` — a URL **de produção** (`/webhook/`, não `/webhook-test/`)
   - `MOTOR_RETORNO_SECRET` — o mesmo segredo nos dois lados
3. Ligar num restaurante de teste: no `/admin` → aba **Motor de resposta**
4. Para testar sem esperar 3 dias, baixar o cooldown por SQL:
   ```sql
   update public.restaurantes
   set config_insights = jsonb_set(config_insights, '{motor_resposta,cooldown_dias}', '0')
   where id = 11;
   ```
   (a UI aceita mínimo 1 dia; o banco aceita 0 — assimetria proposital)

### Passo 8 — corte do disparo antigo

**Ainda não foi feito, de propósito**: o disparo antigo só sai depois que o novo
estiver provado. Hoje `Status_feedback` continua vivo e disparando.

Quando o passo 7 estiver validado:
1. `DROP TRIGGER "Status_feedback" ON public.acoes_operacionais;`
2. Remover o bloco em `TaskBoard.tsx` que chama `webhook-n8n`
3. Você desativa (não deleta) o workflow que escutava `status_açoes`

O `CREATE TRIGGER` original está guardado em [`00-decisoes.md`](00-decisoes.md) (D14)
para rollback.

⚠️ Enquanto os dois coexistirem, ligar o motor causa **mensagem duplicada**. Por isso
o motor nasce desligado.

## Notas de operação

- **Migrations dessincronizadas**: dezenas de migrations locais constam como não
  aplicadas e dezenas de remotas não existem localmente — o banco foi alterado por
  fora ao longo do tempo. Por isso as 6 migrations do motor foram aplicadas
  individualmente, e **não** por `supabase db push` (que tentaria reaplicar ~50
  migrations antigas). Vale um `db pull` para reconciliar, em tarefa própria.
- **Segredos no `cron.job`**: o job do worker embute o anon key e o `CRON_SECRET`
  no comando, como os 4 jobs que já existiam. O ideal seria `current_setting`, mas
  `ALTER DATABASE ... SET` é negado neste projeto.
- **`@dnd-kit/sortable` faltava** em `node_modules` e quebrava o build (falha
  pré-existente, não relacionada a esta tarefa). Resolvido com `npm install`.

---

# Correção: feedbacks não se associavam a insights nem a ações

Reportado e corrigido em 2026-08-25, depois dos passos 1–6.

## O sintoma

Nenhum insight tinha feedback ligado, e nenhuma ação tinha insight:

```
insights: 15   |  com feedback_ids: 0
acoes:    17   |  com insight_id:   0
```

Isso quebrava o botão "Feedbacks relacionados" — e, mais grave, deixaria o motor
de resposta **sem destinatário nenhum**: sem a cadeia `ação → feedback → contato`,
não há a quem enviar. O passo 7 nasceria inútil.

Não era dano antigo: um insight criado às 13:40 daquele mesmo dia também nasceu vazio.

## A causa

`gerar-insights` mandava ao modelo o `origem_id` (uuid de 36 caracteres) e pedia
que ele repetisse esses ids em `feedback_ids`. A validação seguinte descartava
todo id que não batesse exatamente — proteção correta contra alucinação.

O modelo ativo é `google/gemini-2.5-flash-lite`. Modelos pequenos truncam ou
reescrevem uuid longo em saída JSON. Como todo id vinha "errado", o filtro
esvaziava o array e gravava `feedback_ids: []` **sem erro nenhum** — nem exceção,
nem log. Falha silenciosa, 15 vezes seguidas.

`sugerir-acoes` tinha exatamente o mesmo defeito com `insight_id`, e como o
fallback era `null`, a ação nascia órfã.

## A correção

**Números curtos em vez de uuid.** O modelo recebe `n: 1, 2, 3…` e devolve
`refs: [1, 4]`. A tradução de volta para uuid acontece no código, pela posição —
onde não há como errar. Um inteiro de um dígito o modelo copia certo.

Três camadas, da mais confiável para a menos:

1. `refs` (números) — o caminho normal;
2. `feedback_ids` / `insight_id` (uuid) — mantido para prompts sobrescritos em
   `prompts_editaveis` que ainda peçam o formato antigo;
3. **fallback**: insight sem referência aproveitável é ligado aos feedbacks da
   mesma categoria que ele próprio classificou; ação órfã ancora no insight mais
   prioritário do lote. Um vínculo aproximado é melhor que nenhum — sem vínculo,
   o cliente que reclamou nunca fica sabendo que agimos. O fallback registra
   `console.warn`, então dá para notar se virar regra em vez de exceção.

## Verificação

Ciclo real rodado em produção (restaurante 11), 5 insights gerados:

| Insight | Categoria | Feedbacks |
|---|---|---|
| Cabelo encontrado na comida | Limpeza | 1 |
| Demora excessiva no preparo | Tempo de Espera | 2 |
| Garçons pouco atenciosos | Atendimento | 2 |
| Pratos inconsistentes | Comida | 1 |
| Ruído excessivo | Ambiente | 1 |

**5 de 5 vinculados** (antes: 0 de 15), e os vínculos batem semanticamente.

Cadeia completa, criando uma ação a partir de um insight:

```
ação 35 "Padronizar receitas…"
  ├─ insight_id preenchido      ✅
  ├─ 1 feedback vinculado       ✅
  └─ 1 cliente a avisar         ✅
```

`npm test` passou de 25 para **40 testes** — os 15 novos cobrem tradução de ref,
ref fora da faixa, ref repetida, uuid alucinado, formato antigo e fallback.

## O que não foi tocado

O motor seguiu intacto: 0 avisos, 0 mensagens, cron ativo, **0 restaurantes com
o motor ligado**. Build, lint e os 40 testes passam. As mudanças ficaram
inteiramente dentro de `gerar-insights` e `sugerir-acoes`.

## Nota sobre os insights antigos

Os 15 insights anteriores continuam sem vínculo — o dado de qual feedback os
originou nunca foi gravado e não é recuperável. Eles vão sendo desativados
naturalmente pelos ciclos seguintes. Os novos nascem corretos.

Também vale saber: `sugerir-acoes` não gera sugestões automáticas enquanto houver
ação em `SUGERIDA` aguardando aprovação (trava proposital, `index.ts:58-68`).
Havia 4 na fila do restaurante 11, e é por isso que o ciclo automático não criou
ações — o caminho manual ("Criar Ação" num insight) ignora a trava e funcionou.
