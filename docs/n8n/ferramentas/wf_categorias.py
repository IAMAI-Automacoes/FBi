"""Categorias da CONTA no workflow "Feedback Restaurante" (cliente e equipe).

Uso: python -I wf_categorias.py <entrada.json> <saida.json> [<outra saida.json> ...]

Desde 15/10/2026 cada conta edita e cria as categorias (Configurações →
Categorias). A IA que separa a mensagem em pontos precisa usar a lista da
conta, e não mais a fixa:
  - nós novos "Categorias do cliente" e "Categorias da equipe": chamam
    categorias_da_conta (banco) logo antes de cada análise. Se a consulta
    falhar, o fluxo segue com a lista padrão;
  - os prompts "Analisa a mensagem" e "Analisa a equipe" listam as categorias
    da conta com a explicação de cada uma (a explicação ajuda a IA a escolher);
  - "Monta a resposta" e "Monta a resposta da equipe" validam contra a lista da
    conta; o que não bate vira "Outros".
"""
import io, json, sys, uuid

origem, saidas = sys.argv[1], sys.argv[2:]
w = json.load(io.open(origem, encoding='utf-8'))
nos = {n['name']: n for n in w['nodes']}

CLIENTE = ['Comida', 'Bebidas', 'Atendimento', 'Ambiente', 'Limpeza', 'Preço', 'Tempo de Espera',
           'Reserva', 'Estacionamento', 'Acessibilidade', 'Música/Som', 'Cardápio/Variedade', 'Higiene', 'Outros']
EQUIPE = ['Liderança e gestão', 'Salário e benefícios', 'Escala e horários', 'Carga de trabalho', 'Clima e colegas',
          'Estrutura e equipamentos', 'Treinamento e crescimento', 'Reconhecimento', 'Comunicação', 'Segurança e saúde', 'Clientes', 'Outros']

def js_lista(nomes):
    return '[' + ', '.join(json.dumps(n, ensure_ascii=False) for n in nomes) + ']'

def troca_texto(texto, antigo, novo, onde):
    if texto.count(antigo) != 1:
        raise SystemExit(f'{onde}: esperava 1x, achei {texto.count(antigo)}x: {antigo[:70]!r}')
    return texto.replace(antigo, novo)

def no_categorias(nome, publico, perto):
    """O nó HTTP que chama categorias_da_conta (mesmo molde de "Quem escreveu?")."""
    molde = nos['Quem escreveu?']
    x, y = nos[perto]['position']
    return {
        'parameters': {
            'method': 'POST',
            'url': 'https://lixrcruilisncfhfhndo.supabase.co/rest/v1/rpc/categorias_da_conta',
            'authentication': 'predefinedCredentialType',
            'nodeCredentialType': 'supabaseApi',
            'sendBody': True,
            'specifyBody': 'json',
            'jsonBody': "={{ JSON.stringify({ p_restaurante_id: $('Restaurante ativo?').first().json.restauranteId, p_publico: '" + publico + "' }) }}",
            'options': {'timeout': 15000},
        },
        'type': 'n8n-nodes-base.httpRequest',
        'typeVersion': molde['typeVersion'],
        'position': [x - 220, y - 180],
        'id': str(uuid.uuid4()),
        'name': nome,
        'retryOnFail': True,
        'maxTries': 2,
        'waitBetweenTries': 1500,
        'executeOnce': True,
        'credentials': molde['credentials'],
        # Falhou? Segue com a lista padrão (o "Monta a resposta" cuida disso).
        'onError': 'continueRegularOutput',
    }

def ligar_antes(de, saida, novo, alvo):
    """`de` (saída `saida`) passa a ir para `novo`, e `novo` vai para `alvo`."""
    lista = w['connections'][de]['main'][saida]
    assert [c['node'] for c in lista] == [alvo], (de, saida, lista)
    lista[0] = {'node': novo, 'type': 'main', 'index': 0}
    w['connections'][novo] = {'main': [[{'node': alvo, 'type': 'main', 'index': 0}]]}

def prompt(no, nome_no, padrao):
    msg = nos[no]['parameters']['messages']['messageValues'][0]
    texto = msg['message']
    if '{{' in texto or texto.startswith('='):
        raise SystemExit(f'{no}: o prompt já é uma expressão; confira antes de mexer')
    antiga = ('- "categoria": SOMENTE uma destas, escrita exatamente assim: '
              + ', '.join(f'"{c}"' for c in padrao) + '. Nunca invente outra.')
    nova = ('- "categoria": SOMENTE uma destas, escrita exatamente assim (depois dos dois-pontos, o que entra em cada uma):\n'
            "{{ $('" + nome_no + "').first().json.prompt || " + js_lista(padrao) + ".map((c) => '- \"' + c + '\"').join('\\n') }}\n"
            'Nunca invente outra. Se nenhuma servir, use "Outros". (Os exemplos abaixo usam as categorias padrão: na resposta, use sempre as da lista acima.)')
    msg['message'] = '=' + troca_texto(texto, antiga, nova, no)

def validacao(no, nome_no, padrao):
    codigo = nos[no]['parameters']['jsCode']
    antiga_inicio = codigo.index('const CATEGORIAS = [')
    antiga_fim = codigo.index('];', antiga_inicio) + 2
    nova = ("// As categorias da CONTA (nó \"" + nome_no + "\", função categorias_da_conta). Se a\n"
            "// consulta falhou ou não rodou, as de padrão: o fluxo não para por isso.\n"
            "const CATEGORIAS = (() => {\n"
            "  try {\n"
            "    const nomes = $('" + nome_no + "').first().json.nomes;\n"
            "    if (Array.isArray(nomes) && nomes.length) return nomes.map((n) => String(n));\n"
            "  } catch (e) { /* a consulta não rodou */ }\n"
            "  return " + js_lista(padrao) + ";\n"
            "})();")
    nos[no]['parameters']['jsCode'] = codigo[:antiga_inicio] + nova + codigo[antiga_fim:]

# ── Cliente ────────────────────────────────────────────────────────────────
w['nodes'].append(no_categorias('Categorias do cliente', 'cliente', 'Analisa a mensagem'))
nos = {n['name']: n for n in w['nodes']}
ligar_antes('É da equipe?', 1, 'Categorias do cliente', 'Analisa a mensagem')
prompt('Analisa a mensagem', 'Categorias do cliente', CLIENTE)
validacao('Monta a resposta', 'Categorias do cliente', CLIENTE)

# ── Equipe ─────────────────────────────────────────────────────────────────
w['nodes'].append(no_categorias('Categorias da equipe', 'equipe', 'Analisa a equipe'))
nos = {n['name']: n for n in w['nodes']}
ligar_antes('Respondeu a pergunta?', 1, 'Categorias da equipe', 'Analisa a equipe')
prompt('Analisa a equipe', 'Categorias da equipe', EQUIPE)
validacao('Monta a resposta da equipe', 'Categorias da equipe', EQUIPE)

for s in saidas:
    io.open(s, 'w', encoding='utf-8', newline='\n').write(json.dumps(w, ensure_ascii=False, indent=2) + '\n')
    print('gravado:', s)
