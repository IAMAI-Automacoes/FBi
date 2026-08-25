# Motor de Resposta — o que foi feito, em linguagem simples

Este documento explica o que existe hoje no banco e no código, sem jargão técnico.
Toda tabela e coluna aqui listada foi conferida direto no banco de produção — não é
plano, é o que já está lá.

---

## 1. As 6 tabelas novas

### `contatos` — quem é o cliente

Antes, o telefone do cliente era só um texto solto dentro do feedback. Agora ele
tem um "cadastro" próprio.

| Coluna | O que guarda |
|---|---|
| `id` | Código único do contato, gerado pelo Supabase (sua instrução original) |
| `restaurante_id` | De qual restaurante é esse cliente |
| `telefone` | O número, já limpo (só dígitos, formato `5511999999999`) |
| `nome` | Nome do cliente, se algum dia formos capturar |
| `opt_out_em` | Preenchido quando o cliente pede para não receber mais mensagem |
| `created_at` | Quando o contato foi criado |

**Por que existe:** o mesmo telefone pode mandar feedback pra dois restaurantes
diferentes — precisava de uma "ficha" por pessoa, por restaurante, pra saber pra
quem mandar o quê.

---

### `feedback_acao` — liga o comentário do cliente à tarefa que ele gerou

| Coluna | O que guarda |
|---|---|
| `feedback_original_id` | Qual mensagem do cliente |
| `acao_id` | Qual tarefa (ação) ela gerou |
| `restaurante_id` | De qual restaurante |
| `created_at` | Quando o vínculo foi criado |

**Por que existe:** antes essa ligação passava por dentro do "insight" (o
resumo que a IA gera), e se o insight fosse apagado, a ligação sumia — a ação
ficava sem saber quem reclamou daquilo. Agora a ligação é direta e sobrevive.

---

### `acao_status_historico` — registro de "essa tarefa já esteve em quais fases"

| Coluna | O que guarda |
|---|---|
| `id` | Número sequencial do registro |
| `acao_id` | Qual tarefa |
| `restaurante_id` | De qual restaurante |
| `status_de` | Fase anterior (ex: PENDENTE) |
| `status_para` | Fase nova (ex: EM_ANDAMENTO) |
| `criado_em` | Quando mudou |

**Por que existe:** antes, quando uma tarefa mudava de fase, o sistema
simplesmente sobrescrevia — perdia o "antes". Agora fica gravado, o que também é
o gatilho que avisa "essa tarefa mudou, alguém precisa saber".

---

### `aviso_pendente` — a fila de "preciso avisar esse cliente sobre isso"

| Coluna | O que guarda |
|---|---|
| `id` | Código único do aviso |
| `contato_id` | Quem vai receber |
| `restaurante_id` | De qual restaurante |
| `acao_id` | Sobre qual tarefa |
| `etapa` | `em_andamento` ou `concluida` — em que fase a tarefa estava quando o aviso nasceu |
| `status` | `na_fila`, `enviado`, `cancelado` ou `expirado` |
| `criado_em` | Quando o aviso entrou na fila |
| `expira_em` | Até quando ele é válido (padrão: 14 dias) |
| `mensagem_id` | Qual mensagem (da tabela abaixo) acabou levando este aviso |

**Por que existe:** é o "post-it" que segura a informação "o cliente X precisa
saber que a ação Y mudou" até chegar a hora certa de mandar a mensagem — sem
mandar na hora, pra não virar spam.

---

### `janela_contato` — controla o intervalo mínimo entre mensagens

| Coluna | O que guarda |
|---|---|
| `contato_id` | Qual cliente |
| `restaurante_id` | De qual restaurante |
| `ultimo_envio_em` | Quando foi a última mensagem enviada a essa pessoa |
| `lock_ate` | Até quando esse contato está "travado" (impede duas mensagens ao mesmo tempo) |
| `lock_dono` | Código de quem travou (evita que dois processos enviem juntos) |

**Por que existe:** é o "relógio" do intervalo mínimo (padrão 3 dias). Uma linha
por cliente — não uma por tipo de aviso, senão o cliente levaria uma mensagem
por "começou" e outra por "terminou", voltando ao problema original.

---

### `mensagem_enviada` — o histórico de tudo que foi mandado

| Coluna | O que guarda |
|---|---|
| `id` | Código único da mensagem |
| `contato_id` | Para quem |
| `restaurante_id` | De qual restaurante |
| `texto` | O conteúdo exato que foi/será enviado |
| `status` | `enviando`, `enviado`, `falhou` ou `simulado` (modo de teste) |
| `provider_message_id` | Id que o WhatsApp devolve quando entrega |
| `erro_codigo` / `erro_mensagem` | Se falhou, o motivo |
| `criado_em` | Quando foi montada |
| `enviado_em` | Quando foi confirmada como entregue |

**Por que existe:** antes não existia NENHUM registro do que era mandado ao
cliente. Agora há prova de tudo — inclusive se falhou, e por quê.

---

## 2. Colunas novas em tabelas que já existiam

| Tabela | Coluna nova | Pra quê |
|---|---|---|
| `feedbacks_originais` | `contato_id` | Liga o feedback ao cadastro do cliente |
| `feedbacks_restaurante` | `usado_em` | Data em que esse pedaço de feedback virou insight ou ação |
| `feedbacks_restaurante` | `usado_por_insight_id` | Qual insight "usou" esse feedback |
| `feedbacks_restaurante` | `usado_por_acao_id` | Qual ação "usou" esse feedback |
| `restaurantes` | `config_insights.motor_resposta` (dentro do campo já existente) | Configurações do motor: ligado/desligado, intervalo entre mensagens, etc |
| `restaurantes` | `config_insights.expiracao_feedback_dias` | Por quantos dias um feedback continua valendo para gerar insight (o dono configura) |

**A ideia do `usado_em`:** antes um mesmo feedback podia virar insight várias
vezes, gerando tarefa duplicada. Agora, quando um feedback "vira" alguma coisa,
ele fica marcado e some da lista de disponíveis — e se você apagar o insight ou
a ação, ele volta a ficar disponível automaticamente.

---

## 3. As "funções" novas do banco (automatismos)

São rotinas que rodam sozinhas quando algo acontece — você não precisa chamar
nenhuma delas manualmente.

| Função | Quando roda | O que faz |
|---|---|---|
| `normalizar_telefone` | Sempre que um telefone é gravado | Limpa o número: tira `+`, espaço, parênteses, `@whatsapp...` |
| `resolver_contato_feedback` | Quando chega um feedback novo | Acha (ou cria) o contato daquele telefone e liga o feedback a ele |
| `vincular_feedbacks_da_acao` | Quando uma ação nasce a partir de um insight | Copia os feedbacks do insight para a ação, de forma permanente |
| `marcar_feedbacks_usados_insight` | Quando um insight é criado | Marca os feedbacks usados como "ocupados" |
| `liberar_feedbacks_insight` | Quando um insight é apagado | Libera os feedbacks dele de volta pra disponíveis |
| `marcar_feedback_usado_por_vinculo` | Quando o vínculo feedback↔ação é criado | Marca o feedback como usado pela ação |
| `liberar_feedbacks_acao` | Quando uma ação é apagada | Libera os feedbacks dela de volta pra disponíveis |
| `processar_transicao_acao` | Sempre que uma ação muda de status | Grava o histórico e, se avançou (em andamento/concluída), cria os avisos pendentes para os clientes certos |
| `cancelar_avisos_acao_removida` | Quando uma ação é apagada | Cancela os avisos pendentes que ainda não foram enviados |
| `aplicar_config_motor_padrao` | Quando um restaurante novo é criado | Já nasce com as configurações padrão do motor |
| `motor_tomar_lock_contato` | Chamada pelo worker (a cada 5 min) | "Trava" um cliente pra evitar que duas mensagens saiam ao mesmo tempo pra ele |
| `motor_soltar_lock_contato` | Chamada pelo worker | Destrava o cliente depois de processar |
| `motor_confirmar_envio` | Chamada quando o WhatsApp confirma entrega | Marca a mensagem como enviada e reinicia o "relógio" dos 3 dias |
| `motor_falhar_envio` | Chamada quando o envio falha | Devolve os avisos pra fila (não perde nada) sem reiniciar o relógio |

---

## 4. As 2 rotinas novas ("Edge Functions") — o cérebro do motor

Diferente das funções acima (que moram dentro do banco), estas são programas
próprios que rodam a cada 5 minutos e conversam com o WhatsApp.

### `motor-retorno-worker`
A cada 5 minutos, olha pra fila de avisos de cada restaurante e decide:
- "já deu o tempo mínimo de espera? manda agora"
- "ainda não? deixa acumulando"
- Se decidir mandar: junta tudo que tem pra aquele cliente numa mensagem só,
  escreve o texto usando IA, e entrega pro WhatsApp (via n8n).

### `motor-retorno-callback`
Recebe a confirmação do n8n depois que a mensagem foi (ou não) entregue, e
atualiza o status: "enviado" ou "falhou".

---

## 5. Duas rotinas existentes que foram ajustadas

- **`gerar-insights`** (já existia): agora ignora feedback já usado, respeita o
  prazo de validade configurado pelo dono, e — a correção mais recente — passou
  a ligar corretamente cada insight aos feedbacks que o originaram.
- **`sugerir-acoes`** (já existia): mesma correção — agora liga corretamente
  cada ação ao insight (e por consequência aos feedbacks) que a gerou.

---

## 6. O que aparece pra você usar

- **Painel Admin → aba "Motor de resposta"**: liga/desliga o motor por
  restaurante, ajusta intervalo mínimo entre mensagens, horário de silêncio, etc.
- **Configurações do restaurante → aba "Feedbacks"**: o dono define por quantos
  dias um feedback continua valendo.
- **Quadro de tarefas**: cada card agora mostra um selinho tipo "2 clientes serão
  avisados" quando você move a tarefa de fase.

---

## 7. Estado atual (2026-08-25)

O motor está **instalado e funcionando, mas desligado** em todos os
restaurantes. Nada é enviado a ninguém ainda. Falta:

1. Criar o fluxo de envio no n8n (o "braço" que realmente manda pro WhatsApp)
2. Ligar o motor restaurante por restaurante
3. Desligar o sistema antigo de aviso (que hoje ainda está ativo e pode mandar
   mensagem duplicada se o motor novo for ligado antes)
