-- Impede tema duplicado (mesmo rótulo, por restaurante) — trava a condição de
-- corrida quando dois feedbacks iguais chegam no mesmo instante. A edge function
-- classificar-feedback reusa o tema existente quando bate nesta restrição.
create unique index if not exists uq_feedback_temas_rotulo
  on public.feedback_temas (restaurante_id, lower(rotulo));