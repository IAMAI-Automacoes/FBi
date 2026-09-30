# Stripe — assinaturas do EasyFeed

Conta Stripe da **IAMAI** (CNPJ), produto **EasyFeed**. Só o EasyFeed existe hoje;
toda entidade criada (Customer, Subscription, Checkout Session, Product) leva
`metadata.product_code = "easyfeed"` e todo lookup_key usa o prefixo `easyfeed_`.
Isso é o que deixa a porta aberta para um segundo produto na mesma conta.

SDK `stripe@22.6.2` com **`apiVersion: '2026-08-26.dahlia'`** fixada em
`supabase/functions/_shared/stripe/cliente.ts` e em `scripts/stripe/_comum.ts`.
Consequências práticas dessa versão que o código já respeita:

- `current_period_start/end` moram no **item** da assinatura (`items.data[0]`), não na assinatura;
- `invoice.subscription` não existe: é `invoice.parent.subscription_details.subscription`;
- `branding_settings` por Checkout Session existe (marca por sessão).

Itens marcados **VERIFICAR** não puderam ser confirmados na documentação durante a
implementação (a docs.stripe.com estava inacessível; o que está aqui vem do
OpenAPI oficial do Stripe e do comportamento conhecido). Conferir em test mode
antes de ir para live.

---

## 1. Modelo de dados

Migrations: `20260929000000_stripe_assinaturas.sql` (base) e
`20260930030000_stripe_faturas_repasses_afiliados.sql` (faturas, repasses, afiliados).
As duas ainda não foram aplicadas em produção; entram juntas.

```
restaurantes  (já existia: assinatura_status, stripe_customer_id, stripe_subscription_id,
   ▲            plano_ciclo, assinatura_expira_em, assinatura_cancelada_em — trigger só deixa
   │            service_role/admin escrever)
   │ aplicar_assinatura_stripe(restaurante_id)   ← projeção recalculada a cada evento
   │
stripe_clientes ──< stripe_assinaturas          espelho fiel do Stripe (fonte da verdade)
   restaurante_id      restaurante_id NULL até o vínculo
                       status cru (active, past_due, canceled…), ciclo, price atual,
                       current_period_end, cancel_at_period_end, ultimo_invoice

stripe_checkout_sessions   elo pagamento → conta
   stripe_session_id UNIQUE, email_pagador, restaurante_id_origem (JWT, quando logado),
   restaurante_id_vinculado (preenchido UMA vez), status criada→paga→vinculada|expirada

stripe_eventos_webhook     idempotência: event_id PK, status processando→ok|erro,
                           payload jsonb (apagado após 90 dias pelo cron
                           `limpar-payload-eventos-stripe` — LGPD)

stripe_faturas             histórico de cobranças: uma linha por invoice (número, status,
                           valor, período, pago_em, hosted_invoice_url, invoice_pdf,
                           charge de origem). Dono lê as suas (/minha-conta → "Cobranças").

stripe_repasses            livro-razão da divisão de receita: uma linha por
                           (fatura paga × destinatário). Destinatário = linha de
                           `divisao_receita` (sócio/empresa, pago por Pix) ou `afiliado`
                           (Stripe Connect automático, ou Pix se não conectado).

Reaproveitadas (já existiam): `afiliados` (comissão, chave Pix, stripe_account_id;
+ `stripe_connect_status`), `divisao_receita` (sócios: % ou valor fixo, chave Pix),
`integracao_config` (SITE_URL, STRIPE_PORTAL_CONFIGURATION_ID).
```

RLS: dono lê o próprio cliente/assinatura; admin da plataforma lê tudo; ninguém
além de service_role escreve. Sessões e log de webhook não têm policy (internos).

Mapeamento de status (SQL `aplicar_assinatura_stripe` e `mapeamento.ts`):

| Stripe | app |
|---|---|
| `active`, `trialing` | `ativa` |
| `past_due`, `unpaid` | `inadimplente` (Stripe ainda tenta cobrar; o gate manda para /assinatura) |
| `canceled`, `incomplete_expired`, `paused` | `cancelada` |
| `incomplete` | ignorado (pagamento inicial não concluiu) |

`expirar_assinaturas()` (cron) passou a **ignorar** quem tem `stripe_subscription_id`:
a renovação do Stripe acontece no fim do período e o `invoice.paid` chega até ~1h
depois; o cron derrubaria quem está pagando.

---

## 2. Código, arquivo por arquivo

### Compartilhado — `supabase/functions/_shared/stripe/`

| Arquivo | O que faz |
|---|---|
| `cliente.ts` | Instância do SDK (`apiVersion` fixa, `createFetchHttpClient`), `LOOKUP_KEYS`, `PRODUCT_CODE`, `cryptoProvider()` para o webhook |
| `mapeamento.ts` | Regras puras, testadas em `__testes__/stripe-mapeamento.teste.ts`: ciclo a partir do price, preços públicos (equivalente mensal e desconto calculados no servidor), status, validação do descritor |
| `sincronizar.ts` | `sincronizarAssinatura()` **relê** a assinatura no Stripe e grava o espelho + projeção; `upsertCliente`, `registrarCheckoutSession` (nunca regride `vinculada`) |
| `emails.ts` | Gancho para e-mails próprios com marca EasyFeed (e NFS-e). Hoje só loga — não há provedor de e-mail no projeto |

### Edge Functions — `supabase/functions/`

| Função | JWT | Deploy | Papel |
|---|---|---|---|
| `get-prices` | não | `--no-verify-jwt` | `prices.list({lookup_keys})` → `{precos:[{ciclo,total_centavos,mensal_equivalente_centavos,desconto_percentual}]}`. Cache em memória 5 min + `Cache-Control`. Não devolve price ID |
| `create-checkout-session` | opcional | `--no-verify-jwt` | Zod `{ciclo, email?, chave_idempotencia?}`. Resolve o price pelo lookup_key, cria Session `mode=subscription`, `allow_promotion_codes`, `locale pt-BR`, metadata `product_code`. Com JWT: cria/reusa Customer e grava `restaurante_id` na metadata (webhook vincula). Sem JWT: `success_url=/cadastro?sessao={CHECKOUT_SESSION_ID}` |
| `stripe-webhook` | não | `--no-verify-jwt` | `constructEventAsync` + `STRIPE_WEBHOOK_SECRET`; idempotência por `event.id`; trata `checkout.session.completed/async_payment_succeeded/expired`, `customer.subscription.created/updated/deleted/paused/resumed`, `invoice.paid/payment_failed/payment_action_required/finalized` |
| `consultar-compra` | não | `--no-verify-jwt` | `{sessao_id}` → `{estado: paga|pendente|vinculada|expirada|nao_encontrada, email, ciclo}` — para a tela de cadastro pré-preencher e travar o e-mail |
| `vincular-compra` | sim | padrão | Liga a assinatura paga à conta. Ver §3 |
| `create-portal-session` | sim | padrão | `billingPortal.sessions.create` com `STRIPE_PORTAL_CONFIGURATION_ID`, `locale pt-BR`, `flow_data` opcional |
| `cancelar-assinatura` | sim | padrão | Stripe: `cancel_at_period_end: true` + sincroniza; legado (cupom/manual): regra antiga |

### Frontend — `src/`

| Arquivo | Mudança |
|---|---|
| `lib/queries/stripe.ts` | `buscarPrecos`, `criarCheckout` (uuid de idempotência por ciclo/aba/10 min), `consultarCompra`, `vincularCompra`, `abrirPortal`, `ErroStripe` tipado |
| `hooks/use-precos.ts` | Carrega preços do `get-prices`; enquanto carrega, esqueleto (nunca valor fixo) |
| `components/vendas/ciclos-plano.ts` | **Sem valores.** Só rótulos e formatação (`montarPlano`) |
| `components/vendas/Planos.tsx` | Card lê `usePrecos`; botão chama `criarCheckout(ciclo)` e redireciona ao Stripe |
| `components/compra/etapas.ts` | Trilha vira Pagamento → Conta → Acesso |
| `pages/auth/Autenticacao.tsx` | Lê `?sessao=`, consulta a compra, trava o e-mail do pagador, manda para `/checkout/sucesso?sessao=` |
| `pages/CheckoutSucesso.tsx` | Chama `vincular-compra`, faz polling até `ativa` (90 s), estados honestos: pendente (boleto/Pix), e-mail diferente, erro |
| `pages/Assinatura.tsx`, `pages/Checkout.tsx` | Conta sem plano: preços vivos + `criarCheckout` com JWT |
| `pages/MyAccount.tsx` | Botão "Gerenciar assinatura" → Customer Portal |

---

## 3. Vínculo pagamento → conta (segurança)

Nada vindo do navegador decide o vínculo. `vincular-compra` (com o JWT da conta nova):

1. `checkout.sessions.retrieve(sessao_id)` **no Stripe** (chave secreta): precisa ser
   `mode=subscription`, `product_code=easyfeed`, `status=complete` e
   `payment_status ∈ {paid, no_payment_required}`;
2. `customer_details.email` da sessão **== e-mail da conta** (case-insensitive). Ter só o
   link de retorno não basta — é preciso ter o e-mail digitado no Checkout;
3. reserva atômica: `UPDATE stripe_checkout_sessions SET restaurante_id_vinculado=…
   WHERE stripe_session_id=… AND restaurante_id_vinculado IS NULL`. Dois cadastros
   com o mesmo `session_id` → só um passa; o outro recebe 409 "já foi usado";
4. a assinatura não pode pertencer a outro restaurante, e o restaurante não pode
   ter outra assinatura Stripe ativa (dupla cobrança).

Casos cobertos:

- **Pagou e fechou a aba antes de criar a conta.** O webhook já gravou cliente e
  assinatura com `restaurante_id NULL`. Se a pessoa voltar pelo link do Stripe
  (ele mostra a página de sucesso de novo ao reabrir), o fluxo normal segue. Sem o
  link, existe o **modo B** de `vincular-compra`: procura assinatura pendente pelo
  e-mail da conta — **só** com `STRIPE_VINCULO_POR_EMAIL=true`, que deve ser ligado
  apenas com "Confirm email" ativo no Supabase Auth. Com autoconfirm, qualquer um
  criaria uma conta com o e-mail do pagador e levaria a assinatura.
- **Reutilizar o mesmo `session_id`.** Bloqueado pela reserva atômica (3). Repetir
  com a MESMA conta é idempotente (recarregar a página não quebra).
- **Boleto/Pix (pagamento assíncrono).** A sessão volta `complete` com
  `payment_status=unpaid`; `vincular-compra` responde 409 `pendente` e a tela de
  sucesso fica em polling. `checkout.session.async_payment_succeeded` completa.
- **Usuário logado sem plano.** A metadata `restaurante_id` veio do JWT no servidor;
  o webhook vincula direto e marca a sessão como `vinculada`.

---

## 4. Preços: nunca fixos

- Fonte da verdade = Stripe. Código só conhece `easyfeed_mensal`, `easyfeed_semestral`,
  `easyfeed_anual`. Nenhum `price_…` em código, `.env` ou tabela.
- Landing lê `get-prices` (escolha: consulta ao vivo com cache de 5 min, não tabela
  sincronizada por webhook — uma fonte só, sem risco de defasagem silenciosa; a
  justificativa completa está no cabeçalho de `get-prices/index.ts`).

### Trocar o preço (sem deploy)

Price é imutável → cria-se um novo e move-se o lookup_key:

```bash
export STRIPE_SECRET_KEY=sk_test_...          # ou sk_live_...
export STRIPE_PORTAL_CONFIGURATION_ID=bpc_...
deno run -A scripts/stripe/trocar-preco.ts --ciclo=anual --valor=1764,00 --dry-run
deno run -A scripts/stripe/trocar-preco.ts --ciclo=anual --valor=1764,00
```

O script: (1) `prices.create({lookup_key, transfer_lookup_key: true})` — o Stripe tira
a chave do price antigo e põe no novo atomicamente; (2) `prices.update(antigo,
{active:false})`; (3) re-aponta a configuração do Customer Portal para os três
prices atuais. Landing e checkout passam a usar o valor novo em até 5 min.

### Assinantes existentes quando o preço muda

**Opção A — manter o valor (grandfathering).** É o padrão: quem assina o price
antigo continua sendo cobrado nele para sempre; desativar o price não afeta
assinaturas. Custo zero, nenhuma ação.

**Opção B — migrar para o novo.** `scripts/stripe/migrar-assinantes.ts`:

```bash
deno run -A scripts/stripe/migrar-assinantes.ts --de=price_ANTIGO --para=easyfeed_anual --proration=none --dry-run
deno run -A scripts/stripe/migrar-assinantes.ts --de=price_ANTIGO --para=easyfeed_anual --proration=none --sim
```

Por assinatura: `subscriptions.update(id, { items:[{id: item.id, price: novo}],
proration_behavior })`. Escolha de `proration_behavior`:

| valor | efeito | quando |
|---|---|---|
| `none` | novo valor a partir da **próxima renovação**; nada cobrado agora | **reajuste de preço (recomendado)** |
| `create_prorations` | diferença proporcional do que resta do ciclo entra na próxima fatura | redução de preço (crédito) / upgrade |
| `always_invoice` | igual, mas emite e cobra a fatura na hora | quando a diferença precisa ser paga já |

Aviso ao cliente: e-mail com **≥ 30 dias** de antecedência citando valor atual, novo
valor e a data da primeira cobrança no novo valor; só depois rodar o script. Ele
grava `metadata.migrado_em/migrado_de` em cada assinatura para auditoria. **VERIFICAR**
regras do CDC/Procon para reajuste de contrato recorrente no seu enquadramento.

### Promoções sem novo Price

`allow_promotion_codes: true` já está no Checkout. No Dashboard → *Product catalog →
Coupons*: criar o **Coupon** (percentual ou valor fixo; `duration` = `once` /
`repeating` N meses / `forever`) e, dentro dele, um **Promotion code** (o texto que o
cliente digita; pode ter validade, limite de usos, "só primeira compra", valor
mínimo). O cliente digita no Checkout. Para aplicar sem digitar, passe
`discounts: [{ coupon }]` na sessão (não implementado; basta acrescentar em
`create-checkout-session`). Cupom de 100% → `payment_status=no_payment_required`,
já tratado no vínculo. Não confundir com a tabela `cupons` do app (cupom de ACESSO,
sem Stripe).

---

## 5. Configuração no Dashboard

### Secrets (Supabase) e configuração

Segredos, só em `supabase secrets`:

```bash
supabase secrets set --project-ref lixrcruilisncfhfhndo \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_...            # endpoint da conta
  STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...    # endpoint "contas conectadas" (afiliados)
# opcional, só com "Confirm email" ligado no Auth:
supabase secrets set STRIPE_VINCULO_POR_EMAIL=true
```

Configuração NÃO secreta, em `integracao_config` (padrão da casa; a migration já
cria as chaves; as funções leem daqui e caem na env se estiver vazio):

```sql
update public.integracao_config set valor = 'https://easyfeed.com.br' where chave = 'SITE_URL';
update public.integracao_config set valor = 'bpc_...' where chave = 'STRIPE_PORTAL_CONFIGURATION_ID';
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pela plataforma. Nenhuma
destas vai para o `.env` do Vite.

### Deploy

```bash
supabase db push
supabase functions deploy get-prices create-checkout-session stripe-webhook consultar-compra --no-verify-jwt
supabase functions deploy vincular-compra create-portal-session cancelar-assinatura conectar-afiliado
```

### Catálogo e portal (scripts, test mode primeiro)

```bash
deno run -A scripts/stripe/bootstrap.ts --mensal=197 --semestral=1002 --anual=1764 --descritor=EASYFEED
deno run -A scripts/stripe/configurar-portal.ts --criar --site=https://easyfeed.com.br \
  --termos=https://easyfeed.com.br/termos --privacidade=https://easyfeed.com.br/privacidade
```

### Webhook

*Developers → Webhooks → Add endpoint* → `https://lixrcruilisncfhfhndo.supabase.co/functions/v1/stripe-webhook`.
Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `customer.subscription.paused`,
`customer.subscription.resumed`, `invoice.finalized`, `invoice.paid`,
`invoice.payment_failed`, `invoice.payment_action_required`. Copiar o *Signing secret*
para `STRIPE_WEBHOOK_SECRET` (o do `stripe listen` local é outro).

Segundo endpoint, mesma URL, com **"Listen to events on Connected accounts"** marcado e
os eventos `account.updated` e `capability.updated` (qualquer um dos dois basta; o
segundo dispara quando a capacidade `transfers` do afiliado fica ativa e aparece mesmo
onde o Dashboard não lista `account.updated`). É por eles que o status Connect do
afiliado muda para `ativo`. O segredo vai em `STRIPE_CONNECT_WEBHOOK_SECRET`. Sem
esse endpoint, o botão "Atualizar status" no painel admin faz o mesmo manualmente.

### Descritor na fatura do cartão ("IAMAI* EASYFEED")

Mecanismo para **assinaturas** (Checkout `mode=subscription` não aceita
`payment_intent_data`): o descritor vem da **Invoice**, e a Invoice herda o
`statement_descriptor` do **Product** do primeiro item da assinatura (confirmado no
OpenAPI: *"If not specified and this invoice is part of a subscription, the default
statement_descriptor will be set to the first subscription item's product's
statement_descriptor"*; e em `Product.statement_descriptor`: *"Only used for
subscription payments"*). O `bootstrap.ts` já grava esse campo no Product.

Regras do campo (OpenAPI): até **22 caracteres**, **ao menos uma letra**, proibidos
`< > \ " '`, aparece em **MAIÚSCULAS**, **não-ASCII é removido** (acentos somem).
`validarDescritor()` em `mapeamento.ts` aplica isso e o script recusa valor inválido.

Conta (Dashboard → *Settings → Business → Public details*):

- **Statement descriptor** da conta: 5–22 caracteres, mesmas proibições. Ex.: `IAMAI AUTOMACOES`.
- **Shortened descriptor** (prefixo): 2–10 caracteres. Ex.: `IAMAI`. É o que precede
  um sufixo dinâmico em pagamentos avulsos (`IAMAI* SUFIXO`, total ≤ 22 com o `* `).

Como combinar para `IAMAI* EASYFEED` numa assinatura: **VERIFICAR** se o Stripe trata
o descritor da Invoice/Product como descritor **completo** (substitui o da conta) ou
como **sufixo** do prefixo curto. Pelo comportamento conhecido de descritores
dinâmicos em invoices, ele é o texto completo; nesse caso grave no Product
literalmente `IAMAI* EASYFEED` (15 caracteres). Teste definitivo em test mode: após
o primeiro pagamento, abra o Charge e leia `calculated_statement_descriptor` — é o
texto final que o banco emissor recebe. Se vier duplicado (`IAMAI* IAMAI* …`), o
Stripe está prefixando: troque o Product para só `EASYFEED`.

Brasil: **VERIFICAR** com o adquirente. Bancos brasileiros costumam truncar o
descritor (alguns apps mostram ~13 caracteres) — deixe o nome do produto no início
do texto. Pix e boleto **não usam** descritor de cartão: o pagador vê o beneficiário
(a entidade brasileira do Stripe, com o nome da empresa em `Public details`) e a
descrição do boleto/QR (**VERIFICAR** qual campo aparece).

### Marca (branding)

| Onde | Escopo | Como |
|---|---|---|
| Checkout hospedado | **por sessão** | `branding_settings` na Session (já enviado: `display_name`, `button_color`, `border_style`; `logo`/`icon` exigem arquivo enviado via *Files API* — **VERIFICAR** se `display_name` sem `icon` é aceito; se o Stripe recusar, a função recria a sessão sem o bloco) |
| Checkout hospedado | conta | *Settings → Branding* (logo, ícone, cores) — hoje é IAMAI |
| Customer Portal | conta + configuração | Logo/cores vêm da conta; headline e links de termos/privacidade vêm da **configuração** (`configurar-portal.ts`) |
| Faturas (PDF / página hospedada) | conta | Logo e cor da conta. Por cliente dá para `Customer.invoice_settings.footer/custom_fields` (não implementado) |
| **E-mails** (recibo, fatura, falha, lembrete de renovação) | **conta apenas** | Não há marca por produto. Alternativa concreta abaixo |

**E-mails com marca EasyFeed.** Desligar em *Settings → Emails* ("Successful
payments", "Refunds") e em *Settings → Billing → Subscriptions and emails*
("Send emails about upcoming renewals", "Send reminders if a recurring payment
fails", "Send finalized invoices and credit notes"). Enviar os nossos a partir do
webhook: `invoice.finalized` (fatura disponível — relevante para boleto/Pix),
`invoice.paid` (recibo), `invoice.payment_failed` (falha; o Smart Retries continua
tentando), usando `invoice.hosted_invoice_url` (página com pagar/baixar) e
`invoice.invoice_pdf`. O gancho é `_shared/stripe/emails.ts::notificarFatura`; falta
só o provedor de e-mail. Manter ligado no Stripe apenas o que a lei exige e não
personalizamos (nada, no caso do recibo — o hosted_invoice_url já serve de recibo).

### Termos de uso no Checkout

`consent_collection.terms_of_service: 'required'` exige a URL dos termos em
*Settings → Public details*. Sem ela o Stripe recusa o parâmetro e a função recria a
sessão sem ele (o mesmo vale para `branding_settings`).

---

## 5b. Divisão de receita: sócios por Pix, afiliados por Stripe Connect

Decisão fechada: a receita entra **inteira** na conta da IAMAI. Sócios/empresa não
recebem pelo Stripe (a receita é da PJ; lucro só existe depois de imposto e custo; o
contador fecha a distribuição). Afiliados são terceiros prestando serviço e recebem
comissão automática pelo Connect.

**A cada `invoice.paid`** o webhook:

1. espelha a fatura em `stripe_faturas` (com o `charge` de origem);
2. chama `gerar_repasses_da_fatura(fatura)`: comissão do afiliado da assinatura
   (`afiliados.comissao_tipo/valor`) sobre o valor pago; depois, sobre o que sobrou,
   cada linha ativa de `divisao_receita` (% ou valor fixo por fatura). Idempotente;
   valores congelados no momento do cálculo;
3. para repasses `metodo = stripe_connect` (afiliado com `stripe_connect_status =
   'ativo'`): `transfers.create({ amount, destination: acct_..., source_transaction:
   charge, transfer_group: invoice })`, `idempotencyKey = repasse-<id>`. Sucesso →
   `pago`/`pago_por = stripe`; erro → `falhou` com o motivo (o admin pode "Pagar por
   Pix", que troca o método e volta a `pendente`);
4. repasses `pix` ficam `pendente` no painel admin (aba Pagamentos → Repasses) até o
   admin fazer o Pix pela conta da empresa e clicar "Marcar pago".

**Atribuição da venda ao afiliado.** Campo "Código de indicação" na landing e em
`/assinatura`, pré-preenchido pelo link `https://easyfeed.com.br/?ref=CODIGO`
(guardado 30 dias no navegador) e editável. `create-checkout-session` resolve o
código em `afiliados` (ativo) e grava só o **id** na metadata da Session e da
Subscription; código inválido devolve erro visível ("Código de indicação inválido").
`sincronizarAssinatura` copia `metadata.afiliado_id` para `stripe_assinaturas.afiliado_id`.

**Conectar o afiliado.** Painel admin → Afiliados → abrir o afiliado → "Gerar link de
cadastro" (`conectar-afiliado`: `accounts.create({ type: 'express', country: 'BR',
capabilities: { transfers } })` + `accountLinks.create({ type: 'account_onboarding' })`).
O admin envia o link; o afiliado preenche identidade e conta bancária no Stripe.
`account.updated` (endpoint de contas conectadas) ou o botão "Atualizar status" gravam
`stripe_connect_status` (`pendente` → `ativo` quando `payouts_enabled`; `restrito` se
houver pendência). **VERIFICAR** na conta da IAMAI: Connect habilitado (Dashboard →
Connect → Get started), tipo Express disponível para plataforma no Brasil, e taxas de
Connect (por conta ativa e por saque). Transferência só BR → BR.

**Teste (test mode).** Criar afiliado `JOAO10` (10%) e duas linhas em Divisão de
Receita (ex.: Empresa 40%, Sócio A 30%, Sócio B 30%). Gerar link Connect e concluir
o cadastro com os dados de teste do Stripe (CPF/valores de teste na doc do Connect) →
status `ativo`. Assinar pela landing com `?ref=JOAO10`, pagar com `4242…` →
`stripe_repasses`: 1 linha `afiliado/stripe_connect/pago` com `stripe_transfer_id`
(ver em Dashboard → Connect → Transfers) e 3 linhas `divisao/pix/pendente`; marcar uma
como paga no painel → `pago_por` = seu e-mail. Falha de transferência: apagar a conta
conectada no Dashboard e pagar de novo → linha `falhou` com erro → "Pagar por Pix".

## 6. Brasil (comentários)

- **NFS-e.** O Stripe não emite nota. Plugar o emissor (ENotas, NFE.io, Focus NFe,
  Nuvem Fiscal…) em **`invoice.paid`** — é o único momento em que há pagamento
  confirmado. Usar `invoice.id` como chave de idempotência do emissor e guardar o
  número da nota numa tabela própria (`notas_fiscais`, a criar). CNPJ/CPF do cliente:
  `customer.tax_ids` (o Checkout coleta com `tax_id_collection: { enabled: true }` —
  não ativado; adicionar quando o emissor entrar). O gancho já existe em
  `emails.ts` (TODO(nfse)).
- **Pix e boleto em assinatura.** Cartão é o único meio totalmente automático.
  **Boleto**: suportado em assinaturas, mas não há cobrança automática — a cada ciclo
  o Stripe emite a fatura e o cliente precisa pagar o boleto (por isso
  `invoice.finalized` importa e o vencimento entra em `payment_method_options.boleto.expires_after_days`).
  **Pix**: historicamente só pagamento avulso; o OpenAPI atual já traz
  `payment_method_options.pix.mandate_options` (Pix Automático, com
  `payment_schedule`), **VERIFICAR** se está liberado para esta conta e em Checkout
  `mode=subscription`. Sem isso, Pix em assinatura funciona como o boleto: fatura por
  ciclo, pagamento manual. Em ambos, o fluxo muda: o retorno do Checkout vem com
  `payment_status=unpaid`, o acesso só libera no
  `checkout.session.async_payment_succeeded`, e a tela de sucesso já mostra
  "pagamento em processamento". Nada a mudar no código para habilitar: os meios são
  ligados em *Settings → Payment methods* (a função não fixa `payment_method_types`).

---

## 7. Roteiro de testes (test mode, Stripe CLI)

Pré: `stripe login`; secrets de test; `bootstrap.ts` e `configurar-portal.ts` rodados.

```bash
# 0) Webhook local (segredo diferente do endpoint do Dashboard!)
stripe listen --forward-to https://lixrcruilisncfhfhndo.supabase.co/functions/v1/stripe-webhook
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_do_listen
```

1. **Preços.** `curl $SUPABASE_URL/functions/v1/get-prices -H "apikey: $ANON"` → três
   ciclos, `desconto_percentual` coerente. Landing mostra os valores; nenhum número
   vem de código (`grep -rn "197" src/` deve achar só coincidências).
2. **Compra na landing (pay-first).** `/vendas` → Assinar → cartão `4242 4242 4242 4242`
   → volta em `/cadastro?sessao=cs_test_…` com e-mail travado → cria a conta →
   `/checkout/sucesso` → "Pagamento confirmado" → `/onboarding`. Conferir:
   `stripe_checkout_sessions.status='vinculada'`, `stripe_assinaturas.restaurante_id`,
   `restaurantes.assinatura_status='ativa'`, `stripe_eventos_webhook` com `ok`.
3. **Reuso do session_id.** Em outra janela anônima, abrir a mesma URL
   `/cadastro?sessao=…` → aviso "já está ligado a uma conta". Forçar:
   `POST vincular-compra {sessao_id}` com o JWT de OUTRA conta → 409.
4. **E-mail diferente.** Repetir (2) mas, no `/cadastro`, editar a URL para trocar o
   e-mail (o campo é travado; usar devtools) → `/checkout/sucesso` mostra "E-mail
   diferente do pagamento" com botão para sair e criar com o e-mail certo.
5. **Aba fechada.** Pagar e fechar antes do cadastro. `stripe_assinaturas` fica com
   `restaurante_id NULL`. Reabrir o link de sucesso do Stripe → fluxo normal. Com
   `STRIPE_VINCULO_POR_EMAIL=true` e e-mail confirmado: criar a conta em `/cadastro`
   sem `?sessao` → `POST vincular-compra {}` → liga pelo e-mail.
6. **Usuário logado sem plano.** Conta com `assinatura_status='sem_assinatura'` →
   `/assinatura` → card → Stripe → `/checkout/sucesso` → ativa. A sessão nasce com
   `restaurante_id_origem` e o webhook a marca `vinculada` sozinho.
7. **Falha de pagamento.** Dashboard → *Customers* → criar cliente com **test clock**;
   assinatura no price mensal com cartão `4000 0000 0000 0341` (anexa, mas falha ao
   cobrar); avançar o relógio para depois de `current_period_end` → `invoice.payment_failed`
   → `stripe_assinaturas.status='past_due'` → `restaurantes.assinatura_status='inadimplente'`
   → o app manda para `/assinatura`. Atalho sem test clock (fixture genérica, não
   liga a nenhum restaurante): `stripe trigger invoice.payment_failed`.
8. **Troca de ciclo.** `/minha-conta` → Gerenciar assinatura → *Update plan* → anual →
   `customer.subscription.updated` → `stripe_assinaturas.ciclo='anual'`,
   `restaurantes.plano_ciclo='anual'`, fatura de proração emitida (`always_invoice`).
9. **Troca de preço com assinante ativo.**
   `trocar-preco.ts --ciclo=mensal --valor=219 --dry-run` → plano; sem `--dry-run` →
   price novo, antigo inativo, portal sincronizado. Landing mostra 219 em ≤ 5 min. O
   assinante de (2) continua no price antigo (`stripe_assinaturas.stripe_price_id`
   inalterado; após o próximo evento, `price_lookup_key` fica `NULL`). No portal, "Update
   plan" oferece só os prices novos. `migrar-assinantes.ts --de=price_antigo
   --para=easyfeed_mensal --dry-run` lista o assinante; com `--sim`, migra e o webhook
   atualiza o espelho.
10. **Cupom.** Dashboard test → Coupon 50% `once` + Promotion code `TESTE50`. Checkout
    → "Add promotion code" → `invoice.paid` com `amount_paid` pela metade. Cupom 100%
    → sessão `no_payment_required` → vínculo funciona igual.
11. **Cancelamento.** `/minha-conta` → Cancelar → Stripe `cancel_at_period_end=true` →
    `assinatura_cancelada_em` preenchido, acesso até `assinatura_expira_em`;
    `stripe trigger customer.subscription.deleted` ou avançar o test clock → `cancelada`.
12. **Idempotência.** `stripe events resend evt_…` de um evento já processado → 200
    `duplicado`, nada muda no banco.
13. **Segurança.** Com o JWT de usuário comum: `PATCH restaurantes.assinatura_status`
    pelo client → trigger recusa. `npm run build && grep -r "sk_\|whsec_" dist/` → vazio.
