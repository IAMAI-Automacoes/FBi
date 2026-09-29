// Stub de npm:stripe@22.6.2 para o tsc (o pacote real só existe no Deno e
// os tipos não vêm no tarball). Perde a tipagem do SDK — tudo vira `any` —
// mas mantém a checagem do resto do código das funções.
/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
declare class Stripe {
  constructor(chave: string, opcoes?: any)
  static createFetchHttpClient(): any
  static createSubtleCryptoProvider(): any
  [recurso: string]: any
}
declare namespace Stripe {
  type Event = any
  type Metadata = any
  type Customer = any
  type DeletedCustomer = any
  type Subscription = any
  type Invoice = any
  type Price = any
  type Product = any
  namespace Checkout {
    type Session = any
    type SessionCreateParams = any
  }
  namespace BillingPortal {
    type SessionCreateParams = any
  }
  namespace errors {
    type StripeError = any
  }
}
export default Stripe
