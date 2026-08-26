// Stub de https://deno.land/std/http/server.ts, só para o tsc conseguir
// resolver o import remoto. Não é usado em runtime.
export function serve(_h: (req: Request) => Response | Promise<Response>): void {}
