-- O número do dono (avisos urgentes) nunca pode ser o WhatsApp do restaurante.
--
-- O aviso urgente SAI do WhatsApp do restaurante (a instância da uazapi) e VAI
-- para o número do dono. Se os dois forem o mesmo, o restaurante manda
-- mensagem para si mesmo e o aviso some no "Você" do WhatsApp. E quando o
-- restaurante passar para a API oficial, o número de feedbacks deixa de existir
-- em qualquer celular: o do dono é o único por onde ele fala com o cliente.
--
-- Três camadas, e esta é a última: a tela avisa ao digitar, a função
-- whatsapp-instancia recusa conectar o número do dono, e este gatilho garante
-- mesmo para quem gravar por fora da tela.

-- Chave de comparação do WhatsApp: muitos celulares têm o JID sem o 9 da
-- frente (5511 52138636), e o dono digita com ele (5511 9 52138636). Para o
-- WhatsApp é o mesmo número. A mesma regra está em src/lib/telefone.ts
-- (chaveWhatsapp) e em whatsapp-instancia — as três precisam concordar.
create or replace function public.telefone_chave(valor text)
returns text
language sql
immutable
as $$
  select case
    when d ~ '^55[0-9]{2}9[0-9]{8}$' then substr(d, 1, 4) || substr(d, 6)
    else nullif(d, '')
  end
  from (select regexp_replace(coalesce(valor, ''), '[^0-9]', '', 'g') as d) x
$$;

-- Pedido do Raver (01/10): onde já estava igual, o número do dono sai, como
-- se nunca tivesse sido configurado. O dono cadastra o pessoal de novo.
-- Na data: restaurantes 26 e 30.
update public.restaurantes
   set whatsapp_dono = null
 where public.telefone_chave(whatsapp_dono) = public.telefone_chave(numero_whatsapp);

create or replace function public.restaurantes_numero_dono_diferente()
returns trigger
language plpgsql
as $$
begin
  if public.telefone_chave(new.whatsapp_dono) = public.telefone_chave(new.numero_whatsapp) then
    raise exception 'O número dos avisos urgentes precisa ser diferente do WhatsApp do restaurante (o que recebe os feedbacks).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restaurantes_numero_dono_diferente on public.restaurantes;
create trigger trg_restaurantes_numero_dono_diferente
  before insert or update of whatsapp_dono, numero_whatsapp on public.restaurantes
  for each row execute function public.restaurantes_numero_dono_diferente();

comment on column public.restaurantes.whatsapp_dono is
  'Número do DONO, para os avisos urgentes e para falar com o cliente. Sempre diferente de numero_whatsapp (gatilho trg_restaurantes_numero_dono_diferente). Sem este número o aviso não é enviado.';
