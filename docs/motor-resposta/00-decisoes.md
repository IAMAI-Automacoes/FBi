# Motor de Resposta — Decisões tomadas

Registro das escolhas já fechadas, para não serem relitigadas na implementação.
Cada uma tem data e, quando houve verificação, a evidência.

---

## D1 — Divisão de responsabilidade: n8n só entrega
**2026-08-24.** Toda a lógica (fila, cooldown, lock, agrupamento, LLM) roda no Supabase.
O n8n recebe payload pronto e chama a uazapi.

Motivo: o motor tem estado que precisa sobreviver 72h e reinício de container; `Wait` em n8n auto-hospedado não
sobrevive. Agrupamento e lock precisam ser versionados e revisáveis. O projeto já tem `pg_cron` + `pg_net` +
Edge Function em produção (4 jobs).

Detalhe em [`03-n8n.md`](03-n8n.md).

## D2 — Auth do n8n → Supabase: Edge Function + secret
**2026-08-24.** O n8n **do motor** não recebe credencial de banco. Escreve de volta chamando
`motor-retorno-callback` com header `x-motor-secret`. Mesmo padrão do `x-cron-secret` dos crons existentes.

Nota: o workflow de **entrada** já escreve direto no banco (credencial `Feedback Restaurante`,
`J3N40FgVQE4DIL2U`). Isso permanece. A regra vale só para o motor, onde errar significa WhatsApp duplicado.

## D3 — Mecanismo de wake-up: `pg_cron` a cada 5 min
**2026-08-24.** Tick fixo → Edge Function worker. Não `pgmq` (não instalado, e o que precisamos é tabela de
estado, não broker). Não wake-up individual por contato (`pg_cron` agenda por expressão, não por timestamp).

A fórmula `max(criado_em + T_AGG, ultimo_envio_em + T_COOLDOWN)` é uma **consulta**, não um agendamento — o tick
só pergunta "quem venceu?". Custo: até 5 min de atraso numa janela de 30 min / 3 dias.

## D4 — Contato resolvido por trigger no Supabase
**2026-08-24.** `BEFORE INSERT` em `feedbacks_originais` faz upsert em `contatos` por
`(restaurante_id, telefone)` e preenche `contato_id`.

**Consequência: o workflow de entrada do n8n fica 100% intocado pela feature.** Zero nós novos.
Funciona também para qualquer origem futura de feedback.

## D5 — Não pedir o export do workflow consumidor de `status_açoes`
**2026-08-24.** O fluxo do motor é novo e separado; o antigo só precisa ser **desligado**, não entendido.

⚠️ **O desligamento é obrigatório.** O trigger `Status_feedback` está `active` em produção agora, disparando a
cada UPDATE de `acoes_operacionais`. Se sobreviver ao go-live, o cliente recebe duas mensagens por transição —
o bug que a feature existe para matar, voltando por outra porta.

Risco residual assumido: se algum outro workflow depender daqueles POSTs para algo que não seja mensagem ao
cliente, quebra em silêncio no corte.

## D6 — Bugs do fluxo de entrada: adiados
**2026-08-24.** Documentados na auditoria §1.3, tratados em tarefa própria. Nenhum bloqueia o motor.

### D6.1 — Sobre o token hardcoded (hipótese verificada e refutada)
Levantou-se que `469bb609-3ad1-4b77-b94d-c3e1b45025f1` seria um token universal da conta uazapi, e portanto não
seria bug. **Consultei `public.restaurantes`: não é universal.**

| id | restaurante | `whatsapp_token` | assinatura | é o hardcoded? |
|---|---|---|---|---|
| 11 | Camelo | `469bb609…` | ativa | **sim** |
| 12 | Ao Ponto | `null` | sem_assinatura | — |
| 13 | Meu Restaurante | `138e7e7e…` | ativa | **não** |
| 14 | Meu Restaurante | `null` | ativa | — |

Dois restaurantes ativos, dois tokens distintos. O `469bb609…` é a instância do restaurante 11 (Camelo), o
ambiente de teste.

O que **é** universal é `whatsapp_admin_token` = `YO3H6W6P…` (igual nos 4), e ele usa header **`admintoken:`**,
não `token:` — ver `whatsapp-instancia/index.ts:119` (admin) vs `:138` (instância). Escopos diferentes: admin
cria/destrói instâncias; token de instância envia mensagem por um número.

**Efeito hoje:** ack do restaurante 13 sai pela instância do 11 — número errado para o cliente.
**Efeito no motor: nenhum** — o fluxo novo lê `restaurantes.whatsapp_token` por restaurante e nasce correto.

Fica adiado por decisão sua, com o efeito registrado.

## D7 — Config do motor: só no painel de admin da plataforma
**2026-08-24.** Cooldown, T_AGG, quiet hours e teto de itens vivem em `/admin`, visíveis só para
`platform_admins`, com seletor de restaurante.

O dono do restaurante **não** ajusta o próprio cooldown. Motivo: dono ansioso põe 0 e volta o spam — banindo o
próprio número, que é o problema que a feature resolve.

### Unidade: dias
`T_COOLDOWN` é editado **em dias**, não em horas. Default 3 dias (= as 72h do SPEC).

### Faixa
- **UI:** `1` a `30` dias (input `min=1`).
- **Banco:** CHECK aceita `>= 0`.

A assimetria é intencional: você desce para `0` por SQL direto quando for testar, sem eu precisar afrouxar
constraint depois. `0` significa "sem cooldown" — a mensagem sai assim que o T_AGG vence.

### Onde persiste
Reusa o padrão existente: uma chave nova no jsonb `restaurantes.config_insights`, com **read-merge-write** para
preservar as outras chaves — exatamente como `src/pages/Insights.tsx:90-120` faz com `feedbacks_por_analise`.

## D8 — Expiração de feedback: essa sim, o dono configura
**2026-08-24 (da tarefa original).** Default 14 dias, editável pelo dono em `/configuracoes`.

Não conflita com D7: são coisas distintas.
- **Cooldown** = ritmo de mensagem ao cliente → parâmetro de operação → admin.
- **Expiração de feedback** = por quanto tempo um feedback continua elegível para virar insight/ação →
  escolha de negócio do restaurante → dono.

## D9 — Sem ambiente de staging
**2026-08-24.** Só produção (um projeto Supabase, sem branches, sem testes — `package.json:22`).
O teste dos 8 casos de aceitação roda em produção, num restaurante de teste (id 11, Camelo), com o cooldown
baixado por SQL.

## D10 — Base atual é só teste: nenhum envio retroativo
**2026-08-24.** Os 63 feedbacks / 11 contatos existentes são **dados de teste**, não clientes reais.

Consequências:
- **Nenhum cliente antigo recebe mensagem.** O motor só age sobre transições que ocorrerem depois do go-live.
- O backfill de `contatos` (M1) continua, mas como **dado histórico** — para o `contato_id` de feedbacks
  antigos não ficar nulo. Não é base de envio.
- `janela_contato` não precisa de backfill defensivo: sem cliente real, não há ninguém para represar.
- Some o risco "mandar mensagem estranha para alguém que não esperava" no go-live.

## D11 — Quiet hours em horário de Brasília, fixo
**2026-08-24.** `America/Sao_Paulo` cravado. Todos os 4 restaurantes são BR.

⚠️ O banco roda em **UTC**. Aplicar 22h–9h sem converter silenciaria 19h–6h de Brasília — o pico do restaurante,
exatamente o contrário do desejado. A conversão é obrigatória, não detalhe.

Coluna `timezone` em `restaurantes` fica como trabalho futuro, se entrar cliente de outro fuso.

## D12 — Opt-out manual
**2026-08-24.** Coluna `contatos.opt_out_em` criada agora; sem mecanismo automático.
Se alguém pedir para sair, marca-se por SQL e a fila inteira daquele contato é cancelada.

Motivo: detectar "PARAR" exigiria mexer no workflow de entrada do n8n, que está funcional e que D4 preserva
intacto. Com 11 contatos de teste, não se justifica.

## D13 — Selo "cliente será avisado" no card de ação
**2026-08-24.** O card em `/acoes` mostra quantos clientes serão avisados por aquela ação.

Motivo: hoje o dono arrasta um card e dispara WhatsApp para cliente real **sem saber**. Com o motor isso passa a
ser deliberado, então precisa ser visível. Entra no passo 4 da ordem de implementação.

## D14 — Trigger `Status_feedback` autorizado a ser removido
**2026-08-24.** Confirmado por você. Remoção no **passo 8**, junto com `TaskBoard.tsx:363-376`, só depois do
motor novo testado.

O `CREATE TRIGGER` original fica guardado aqui para rollback:

```sql
CREATE TRIGGER "Status_feedback" AFTER UPDATE ON public.acoes_operacionais
FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
  'https://n8n-n8n-main.tikvpg.easypanel.host/webhook-test/status_açoes',
  'POST', '{"Content-type":"application/json"}', '{}', '5000');
```

---

## Ainda em aberto

1. Como você faz deploy das Edge Functions (CLI manual?).
2. Existe outro projeto/ambiente Supabase além de `lixrcruilisncfhfhndo`?
3. Segredo e URL de produção do webhook `easyfeed-enviar-retorno`, quando você criar (necessário só no passo 7).
