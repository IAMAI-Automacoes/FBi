// Globais do runtime Deno/Supabase, declarados só para a checagem de tipos.
declare const Deno: {
  env: { get(k: string): string | undefined }
  serve(h: (req: Request) => Response | Promise<Response>): void
}
// `Supabase.ai` existe no runtime das edge functions (ver perfil.ts).
// deno-lint-ignore no-explicit-any
declare const Supabase: any
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any
