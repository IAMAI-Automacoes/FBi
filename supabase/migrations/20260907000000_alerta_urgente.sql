-- Aviso imediato ao dono quando chega um feedback grave.
--
-- ## O dedup é do banco, não do código
--
-- Uma mensagem de cliente vira VÁRIOS pontos em `feedbacks_restaurante`, e
-- cada ponto dispara o seu próprio `classificar-feedback` → `vincular-feedback`.
-- Eles rodam em PARALELO. Se dois pontos da mesma mensagem forem graves — o
-- cliente que achou um inseto E passou mal é um caso só, contado duas vezes —,
-- os dois chegariam aqui ao mesmo tempo.
--
-- Um "consulta se já existe, senão insere" no código não resolve: as duas
-- execuções consultam antes de qualquer uma inserir, as duas veem vazio e as
-- duas mandam. A única barreira que vale é a UNIQUE em
-- `feedback_original_id` — quem perder a corrida recebe conflito do Postgres e
-- desiste, e o dono recebe UMA mensagem.
--
-- Por isso a linha é criada ANTES de mandar a mensagem: ela é a reserva do
-- direito de enviar, não o registro de que enviou. `enviado_em` e `erro`
-- contam o que aconteceu depois.

alter table public.restaurantes
  add column if not exists whatsapp_dono text;

comment on column public.restaurantes.whatsapp_dono is
  'Número do DONO, para os avisos urgentes. Diferente de `numero_whatsapp`, que é a linha por onde o cliente manda o feedback. Sem este número o aviso não é enviado.';

create table if not exists public.alerta_urgente (
  id bigint generated always as identity primary key,
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  -- A UNIQUE abaixo é o mecanismo inteiro de "uma mensagem por atendimento".
  feedback_original_id uuid not null unique references public.feedbacks_originais(id) on delete cascade,
  /** Ponto que levantou a suspeita. Serve para auditar o que disparou. */
  feedback_restaurante_id bigint references public.feedbacks_restaurante(id) on delete set null,
  motivo text,
  termos text[] not null default '{}',
  enviado_em timestamptz,
  erro text,
  created_at timestamptz not null default now()
);

create index if not exists idx_alerta_urgente_restaurante
  on public.alerta_urgente (restaurante_id, created_at desc);

-- Pendentes de envio: o que reservou o direito e ainda não conseguiu mandar.
create index if not exists idx_alerta_urgente_pendente
  on public.alerta_urgente (created_at)
  where enviado_em is null;

alter table public.alerta_urgente enable row level security;

-- Só leitura para o dono: quem escreve é a edge function, com a chave de
-- serviço. Um alerta criado pelo navegador não teria como ser confiável.
drop policy if exists tenant_isolation_select on public.alerta_urgente;
create policy tenant_isolation_select on public.alerta_urgente
  for select using (restaurante_id = public.get_user_restaurante_id());
