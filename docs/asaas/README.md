# Asaas: testes no sandbox e passagem para a produção

Roteiro para provar, no sandbox, que cada real vai para onde deve, e depois
ligar a conta de produção. Regras e código: `CLAUDE.md` (seção Cobrança) e
`supabase/functions/_shared/asaas/`.

Atalhos da API do sandbox: [`sandbox.ts`](sandbox.ts) (pagar com o cartão de
teste, gerar a próxima mensalidade, virar Pix, estornar, ver o split).

```powershell
$env:ASAAS_SANDBOX_KEY = '<chave do sandbox>'   # aspas simples: a chave começa com $
deno run --allow-net --allow-env docs/asaas/sandbox.ts webhook
```

A cada cenário, o Claude confere o banco (status, valores, comissão, acesso)
pelo Supabase. Os ids `sub_…` e `pay_…` aparecem no painel do sandbox e no
`cobrancas`.

---

## 0. Preparação (uma vez)

| # | Onde | O quê |
|---|---|---|
| 0.1 | Sandbox → Minha Conta → Informações | **Site: `https://easyfeed.com.br`**. Sem isso o Asaas recusa a volta automática ("Não há nenhum domínio configurado em sua conta") e a pessoa fica parada na fatura. |
| 0.2 | Sandbox → Integrações → Webhooks | URL `https://lixrcruilisncfhfhndo.supabase.co/functions/v1/asaas-webhook?conta=mei`, token = o do secret `ASAAS_CONTA_MEI_WEBHOOK_TOKEN`, **todos** os eventos de Cobrança (inclusive os de split) e de Assinatura. `sandbox.ts webhook` mostra se a fila está pausada. |
| 0.3 | 2ª conta sandbox (o "vendedor") | Criar outra conta no sandbox, rodar `sandbox.ts carteira` com a chave **dela** e anotar o `walletId`. |
| 0.4 | Admin → Vendedores | Vendedor "Teste Split" com o walletId da 0.3, **desconto 10% nas 3 primeiras cobranças**. Em Custos, um custo de teste de **10%** (para provar que a comissão sai do que sobra). Anotar o código. |
| 0.5 | Admin → Cupons | Cupom `TESTE5` (5%) e cupom `TESTE20` (20%). |

Contas de teste do EasyFeed: e-mails falsos (o sandbox manda e-mail de verdade),
CPF válido gerado (ex.: 4devs). Cartão aprovado: `4444 4444 4444 4444`, CCV `123`,
validade futura.

## 1. Cenários

Preços de hoje (`planos_precos`): mensal R$ 197,00; semestral R$ 1.002,00
à vista ou R$ 1.008,00 em 6x; anual R$ 1.764,00 à vista ou R$ 1.782,00 em 12x.

### T1. Mensal pelo vendedor, com cupom menor (conta A)

1. Abrir `easyfeed.com.br/cadastro?ref=<CÓDIGO DO VENDEDOR>`, criar a conta A.
2. Comprar o **mensal**, usando o cupom `TESTE5`. Pagar com o cartão de teste.
3. **Esperado:**
   - fatura de **R$ 177,30** (vale o desconto do vendedor, 10%, maior que o cupom; o cupom NÃO é gasto);
   - depois de pagar, o navegador volta sozinho para `/checkout/sucesso`, e de lá para **`/onboarding`**;
   - nenhuma comissão (mês 1).
4. `proxima <sub_ da A>` → 2ª mensalidade em **R$ 177,30**, com split para o vendedor de
   **100% × (líquido − 10%)**. `pagar <pay_>`.
5. Ver o dinheiro chegar ao vendedor (no cartão isso leva ~30 dias): `proxima <sub_> 2` →
   3ª em **R$ 177,30**, split de **15% × (líquido − 10%)**. Sem pagar no cartão, rodar
   `pix <pay_ da 3ª>` e **Confirmar pagamento** no painel. **Esperado:** split `DONE`, o valor
   no saldo da conta do vendedor, comissão `repassado` em Admin → Vendedores. O split é
   recalculado sobre o líquido do Pix.
6. `proxima <sub_> 3` → 4ª em **R$ 197,00** (as 3 com desconto acabaram), split 15%.

### T2. Mensal com cupom e depois cancelar (conta B)

1. Conta B sem link de ninguém. Mensal com `TESTE20`. **Esperado:** **R$ 157,60**; cupom gasto.
2. `proxima` → 2ª em **R$ 197,00**, sem split.
3. Na Assinatura, **cancelar**. **Esperado:** assinatura removida no Asaas; acesso até o fim do período pago.

### T3. Semestral parcelado pelo vendedor (conta D)

1. `cadastro?ref=<CÓDIGO DO VENDEDOR>`, conta D. Semestral **6x**. Pagar em 6x na fatura.
2. **Esperado:** total **R$ 907,20** (1.008 − 10%), 6 parcelas de **R$ 151,20**; acesso por 6 meses.
3. `cobrancas <id do parcelamento>`. **Esperado:** parcela 1 sem split; **parcela 2 com 100%**
   da base; parcelas 3 a 6 com **15%**. (A correção de 23/10/2026 garante isso mesmo com os eventos fora de ordem.)

### T4. Anual à vista com saldo de vídeo, e estorno (conta E)

1. Conta E com um vídeo aprovado no admin (com os 50% de hoje, R$ 98,50 = metade da mensalidade cheia).
2. Anual à vista. **Esperado:** **R$ 1.665,50** (1.764 − 98,50); o saldo de vídeo vira `aplicado`.
3. `estornar <pay_>`. **Esperado:** assinatura removida no Asaas, acesso cai na hora.

### T5. Indicação entre clientes (conta F, indicada pela A)

Antes: Admin → Descontos → Indicação, "quem compra com o código de um restaurante
ganha **10%** nas **2** primeiras cobranças".

1. Na conta A, em Indicações, copiar o link. Criar a conta F por ele. Mensal.
   **Esperado:** a tela de compra mostra o desconto do código; fatura de **R$ 177,30**; sem split.
2. `proxima <sub_ da F>` → **R$ 177,30** (2ª com desconto). `pagar` (2º mês pago da F).
3. **Esperado:** a conta A ganha 1 mês grátis (`indicacao_premios` pendente).
4. `proxima <sub_ da A>` para o mês seguinte. **Esperado:** essa cobrança da A é **removida** no
   Asaas (mês grátis) e o período da A anda 1 mês. O desconto do vendedor da A **não** é
   gasto nesse mês (não acumula): volta na cobrança seguinte.
5. `proxima <sub_ da F>` de novo → **R$ 197,00** (as 2 com desconto acabaram).

Se o mês grátis estiver abaixo de 100% (Admin → Descontos → "cada indicado vale"),
a cobrança da A sai só com ele: sem desconto de código e sem vídeo naquele mês.

### T6. Robustez

- **Reenvio de evento:** no painel do sandbox, reenviar um evento já processado. **Esperado:** nada muda (idempotente).
- **Compra abandonada:** abrir uma compra e não pagar. No dia seguinte: pedido `expirada`, nada cobrando no Asaas. ✅ já visto em 22/10/2026.
- **Excluir conta:** excluir a conta F (ativa). **Esperado:** assinatura removida no Asaas antes de a conta sumir.
- **Inadimplência da recorrente** (ativa → atrasada → pagar a fatura): o sandbox não adianta vencimento. Fica para o 1º mês de produção, acompanhando pelo admin.

---

## 2. Passagem para a produção

Na ordem:

1. **Conta de produção aprovada** (documentos do Guilherme aceitos) e taxas conferidas.
2. **Produção → Minha Conta → Informações → Site: `https://easyfeed.com.br`** (o mesmo da 0.1, na conta real).
3. **Webhook de produção:** mesma URL da 0.2, **token novo** (32+ caracteres), todos os eventos de Cobrança e Assinatura, fila ativa, e-mail de aviso.
4. **Desligar o webhook do sandbox** (senão ele bate com o token antigo e gera ruído).
5. **Vendedores:** cada um precisa de conta Asaas **de produção**; trocar o walletId no admin. O walletId do sandbox não existe na produção e o split dá erro.
6. **Custos reais** em Admin → Vendedores (tirar o de teste de 10%).
7. **Excluir as contas de teste** A–F pelo admin **antes** de trocar a chave (assim o sandbox ainda remove as assinaturas delas).
8. **Limpeza do banco** (SQL abaixo) no SQL Editor.
9. **Secrets** (PowerShell, no terminal do dono):
   ```powershell
   supabase secrets set --project-ref lixrcruilisncfhfhndo ASAAS_CONTA_MEI_API_KEY='<chave de produção>' ASAAS_CONTA_MEI_AMBIENTE=producao ASAAS_CONTA_MEI_WEBHOOK_TOKEN='<token novo>'
   ```
   Nenhum código muda nem precisa de deploy.
10. **Venda real de fumaça:** cupom de produção que deixa o mensal em R$ 5,00, pagar com
    cartão de verdade, conferir volta → onboarding, acesso ativo e o evento no banco. Depois
    estornar pelo painel.
11. Avisar o Claude para conferir o banco e os logs do `asaas-webhook` nas primeiras vendas.

### Limpeza do banco (rodar à parte, uma vez)

Versão completa da limpeza que está no fim de `20261029100000_cobranca_asaas.sql`,
com o que a fase 2 grava (comissões e saldo de vídeo).

```sql
begin;
  update public.restaurantes
     set assinatura_status = 'sem_assinatura', assinatura_origem = null,
         plano_ciclo = null, assinatura_expira_em = null, assinatura_cancelada_em = null
   where assinatura_origem like 'asaas_%';
  update public.cupons_usos set aplicado_em = null, aplicado_pagamento = null
   where aplicado_em is not null;
  -- Benefícios de indicação nascidos de pagamento de teste: conferir à mão
  -- (select * from public.indicacao_premios) e apagar os dos testes.
  update public.indicacao_premios
     set status = 'pendente', aplicado_em = null, aplicado_por = null,
         aplicado_pagamento = null, reservado_pagamento = null
   where aplicado_por = 'asaas' or reservado_pagamento is not null;
  update public.video_premios
     set status = 'pendente', aplicado_em = null, aplicado_por = null,
         aplicado_pagamento = null, reservado_pagamento = null
   where aplicado_por = 'asaas' or reservado_pagamento is not null;
  update public.indicacoes i set pagou_em = null
   where exists (select 1 from public.cobranca_pagamentos p where p.restaurante_id = i.indicado_restaurante_id);
  delete from public.cobranca_comissoes;
  delete from public.cobranca_pagamentos;
  delete from public.cobranca_assinaturas;
  delete from public.cobranca_clientes;
  delete from public.cobranca_eventos_webhook;
  update public.contas_cobranca set ambiente = 'producao' where id = 'mei';
commit;
```

## 3. Em aberto (decisão, não teste)

- **Sócios (40/40/20):** não há repasse automático. Tudo que não é comissão de
  vendedor fica na conta do MEI. Para automatizar, é preciso decidir: split
  (cada sócio com conta Asaas) ou Pix mensal.
- **Contador:** o split do vendedor conta no teto do MEI? O vendedor emite nota?
- **NFS-e:** desligada até o código de serviço.
