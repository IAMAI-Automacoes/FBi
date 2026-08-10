-- Garante que um número de WhatsApp pertence a no máximo 1 restaurante.
-- Parcial: só vale pra números preenchidos (NULL/'' de quem não conectou é livre).
-- Assim o "Verifica Restaurante" do n8n nunca retorna mais de um restaurante.
create unique index if not exists uq_restaurantes_numero_whatsapp
  on public.restaurantes (numero_whatsapp)
  where numero_whatsapp is not null and numero_whatsapp <> '';
