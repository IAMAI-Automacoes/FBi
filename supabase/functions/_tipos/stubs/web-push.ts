// Stub de npm:web-push@3.6.7 para o tsc: só a parte que enviar-push usa.
// (web-push não está instalado na raiz; o tipo real vem do Deno em produção.)
const webpush: {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload?: string,
  ): Promise<unknown>
} = null as never
export default webpush
