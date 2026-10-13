"""Aplica a versão RH no workflow "Feedback Restaurante", em cima do export que o Raver mandou.

Uso: python -I wf_versao_rh.py <export.json> <saida.json> [<outra saida.json> ...]

O que muda (o resto do arquivo fica como está no n8n dele):
  - "Restaurante ativo?": leva a versão da conta (restaurantes.area);
  - "Junta quem escreveu": lê `ignorar`, `so_rh` e `ramo` de equipe_quem_e;
  - nó novo "É para ignorar?": conta só de RH e número que não é de funcionário
    param aqui, sem responder, sem marcar como lida e sem registrar (só limpa o buffer);
  - IA da equipe: na conta só de RH recebe o aviso de que é uma empresa;
  - textos da Helena para a equipe: sem "do restaurante" onde a conta pode ser uma empresa.
"""
import io, json, sys, uuid

origem, saidas = sys.argv[1], sys.argv[2:]
w = json.load(io.open(origem, encoding='utf-8'))
nos = {n['name']: n for n in w['nodes']}

def troca(no, campo, antigo, novo, vezes=1):
    alvo = nos[no]['parameters']
    texto = alvo[campo]
    achou = texto.count(antigo)
    if achou != vezes:
        raise SystemExit(f'{no}.{campo}: esperava {vezes}x, achei {achou}x: {antigo[:70]!r}')
    alvo[campo] = texto.replace(antigo, novo)

# ── 1. A versão da conta entra junto com o restaurante ─────────────────────
troca('Restaurante ativo?', 'jsCode',
      "    nomeRestaurante: String(r.nome_restaurante || '').trim(),\n",
      "    nomeRestaurante: String(r.nome_restaurante || '').trim(),\n"
      "    // A versão do EasyFeed da conta: 'restaurante' ou 'rh' (empresa que só ouve a equipe).\n"
      "    area: String(r.area || ''),\n")

# ── 2. Quem escreveu: funcionário, cliente ou ninguém (conta só de RH) ─────
troca('Junta quem escreveu', 'jsCode',
      "// Quem escreveu é da equipe do restaurante? (função equipe_quem_e)\n"
      "// Para o cliente nada muda: este nó só acrescenta `equipe` (nulo) e `escolha`\n"
      "// (nula) ao que o \"Sou a última mensagem?\" montou. Se a consulta falhar, trata\n"
      "// como cliente: o fluxo de sempre não pode parar por causa da equipe.\n",
      "// Quem escreveu é da equipe? (função equipe_quem_e)\n"
      "// Para o cliente nada muda: este nó só acrescenta `equipe` (nulo) e `escolha`\n"
      "// (nula) ao que o \"Sou a última mensagem?\" montou. Se a consulta falhar, trata\n"
      "// como cliente: o fluxo de sempre não pode parar por causa da equipe.\n"
      "//\n"
      "// Conta SÓ de RH (versão RH do EasyFeed: uma empresa que só ouve a equipe):\n"
      "// não existe conversa de cliente. Quem não é funcionário cadastrado é ignorado\n"
      "// em silêncio (o \"É para ignorar?\" para o fluxo). A conta do admin, que usa\n"
      "// as duas versões no mesmo número, nunca é \"só de RH\": nela o número de fora\n"
      "// é cliente do restaurante.\n")
troca('Junta quem escreveu', 'jsCode',
      "  : null;\n\n// A pessoa respondeu POR ESCRITO",
      "  : null;\n\n"
      "const soRh = q.ok === true && q.so_rh === true;\n"
      "// A consulta falhou numa conta de RH: sem saber quem é, não trata como\n"
      "// cliente de restaurante (seria responder e gravar o que não é). Para.\n"
      "const semResposta = q.ok !== true && base.area === 'rh';\n"
      "const ignorar = !equipe && ((q.ok === true && q.ignorar === true) || semResposta);\n"
      "// Só na conta de RH: o aviso que vai na frente das mensagens para a IA que\n"
      "// separa o feedback em pontos (o treinamento dela fala de restaurante).\n"
      "const ramo = String(q.ramo || '').replace(/\\s+/g, ' ').trim().slice(0, 80);\n"
      "const contextoIA = soRh\n"
      "  ? 'CONTEXTO: quem escreve trabalha em uma EMPRESA' + (ramo ? ' do ramo \"' + ramo + '\"' : '')\n"
      "    + ', que NÃO é um restaurante. Onde as instruções falarem de restaurante, cozinha, salão ou garçom, entenda como a empresa e o trabalho dela. Use as mesmas categorias e o mesmo formato.\\n\\nMENSAGENS:\\n'\n"
      "  : '';\n\n"
      "// A pessoa respondeu POR ESCRITO")
troca('Junta quem escreveu', 'jsCode',
      "return [{ json: { ...base, equipe, escolha } }];",
      "return [{ json: { ...base, equipe, escolha, soRh, ignorar, contextoIA } }];")

# ── 3. O desvio: conta só de RH + número de fora ───────────────────────────
junta = nos['Junta quem escreveu']
limpa = nos['Limpa o buffer']
# Abre espaço no canvas: os três nós antes do desvio andam para a esquerda.
nos['Sou a última mensagem?']['position'] = [-560, 1520]
nos['Quem escreveu?']['position'] = [-368, 1520]
junta['position'] = [-176, 1520]

ignorar = {
    'parameters': {
        'conditions': {
            'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict', 'version': 2},
            'conditions': [{
                'id': str(uuid.uuid4()),
                'leftValue': '={{ $json.ignorar === true }}',
                'rightValue': '',
                'operator': {'type': 'boolean', 'operation': 'true', 'singleValue': True},
            }],
            'combinator': 'and',
        },
        'options': {},
    },
    'type': 'n8n-nodes-base.if',
    'typeVersion': 2.2,
    'position': [0, 1520],
    'id': str(uuid.uuid4()),
    'name': 'É para ignorar?',
}
limpa_ignorada = json.loads(json.dumps(limpa))   # mesmo apagar, mesma credencial
limpa_ignorada.update({'id': str(uuid.uuid4()), 'name': 'Limpa o buffer do ignorado', 'position': [0, 1744]})
limpa_ignorada.pop('alwaysOutputData', None)   # é o fim do caminho: não precisa seguir vazio
w['nodes'].extend([ignorar, limpa_ignorada])

con = w['connections']
depois_de_juntar = con['Junta quem escreveu']['main'][0]
assert sorted(c['node'] for c in depois_de_juntar) == ['Limpa buffer antigo', 'Limpa o buffer', 'Marca como lida', 'Pediu para parar?'], depois_de_juntar
con['Junta quem escreveu'] = {'main': [[{'node': 'É para ignorar?', 'type': 'main', 'index': 0}]]}
con['É para ignorar?'] = {'main': [
    [{'node': 'Limpa o buffer do ignorado', 'type': 'main', 'index': 0}],   # sim: só limpa o buffer e acaba
    depois_de_juntar,                                                        # não: o fluxo de sempre
]}

# ── 4. IA da equipe: sabe quando é uma empresa ─────────────────────────────
alvo = nos['Analisa a equipe']['parameters']
assert alvo['text'] == "={{ $('Sou a última mensagem?').first().json.textoParaIA }}", alvo['text']
alvo['text'] = "={{ ($('Junta quem escreveu').first().json.contextoIA || '') + $('Sou a última mensagem?').first().json.textoParaIA }}"

# ── 5. Textos da Helena para a equipe ──────────────────────────────────────
troca('Monta a resposta da equipe', 'jsCode',
      "  'pamonharia', 'brasa', 'vila', 'toca', 'esquina', 'fazenda', 'quinta', 'barraca', 'tenda', 'cabana'];\n",
      "  'pamonharia', 'brasa', 'vila', 'toca', 'esquina', 'fazenda', 'quinta', 'barraca', 'tenda', 'cabana',\n"
      "  // Versão RH: a conta pode ser de qualquer empresa.\n"
      "  'empresa', 'loja', 'clinica', 'farmacia', 'drogaria', 'escola', 'creche', 'faculdade', 'universidade', 'academia',\n"
      "  'oficina', 'imobiliaria', 'construtora', 'incorporadora', 'transportadora', 'distribuidora', 'agencia', 'industria',\n"
      "  'fabrica', 'metalurgica', 'grafica', 'editora', 'produtora', 'consultoria', 'corretora', 'seguradora', 'otica',\n"
      "  'livraria', 'papelaria', 'barbearia', 'boutique', 'pousada', 'lavanderia', 'floricultura', 'mercearia',\n"
      "  'cooperativa', 'associacao', 'fundacao', 'autoescola', 'startup'];\n"
      "// Conta só de RH: é uma empresa, não um restaurante.\n"
      "let soRh = false;\n"
      "try { soRh = $('Junta quem escreveu').first().json.soRh === true; } catch (e) { soRh = false; }\n")
troca('Monta a resposta da equipe', 'jsCode',
      "  ? (FEMININOS.includes(primeiraPalavra) ? 'da ' : 'do ') + restaurante\n  : 'do restaurante';\n",
      "  ? (FEMININOS.includes(primeiraPalavra) ? 'da ' : 'do ') + restaurante\n  : (soRh ? 'da empresa' : 'do restaurante');\n")
troca('Monta a resposta da equipe', 'jsCode',
      "Se ficar, no sistema do restaurante aparece o que você disse, sem o seu nome.",
      "Se ficar, no sistema aparece o que você disse, sem o seu nome.")
troca('Respostas da equipe', 'jsCode',
      "Se ficar, no sistema do restaurante aparece o que você disse, mas não o seu nome.",
      "Se ficar, no sistema aparece o que você disse, mas não o seu nome.")
troca('Confirma a escolha', 'jsCode',
      "'Combinado!\\nNo sistema do restaurante sua resposta aparece sem o seu nome.'",
      "'Combinado!\\nNo sistema sua resposta aparece sem o seu nome.'")
troca('Confirma a escolha', 'jsCode',
      "'Tá certo!\\nSua resposta fica sem o seu nome no sistema do restaurante.'",
      "'Tá certo!\\nSua resposta fica sem o seu nome no sistema.'")

# ── 6. As notas do canvas ──────────────────────────────────────────────────
troca('Nota - Visão geral', 'content',
      "O cliente não passa por ele.",
      "O cliente não passa por ele.\n\n8. **Conta só de RH** (versão RH do EasyFeed: uma empresa que só ouve a equipe): quem não é funcionário cadastrado é **ignorado em silêncio** (**É para ignorar?**): não responde, não marca como lida e não registra. A conta do admin, que usa as duas versões no mesmo número, continua atendendo cliente e funcionário.")
nos['Nota - Visão geral']['parameters']['height'] = 480
nos['Nota - Visão geral']['position'] = [-3392, 788]
troca('Nota - Buffer', 'content',
      "Sobras com mais de 10 min são limpas.",
      "Sobras com mais de 10 min são limpas.\n**É para ignorar?**: conta só de RH e número que não é de funcionário param aqui (só limpa o buffer).")
troca('Nota - Equipe', 'content',
      "se a consulta falhar, segue como cliente.",
      "se a consulta falhar, segue como cliente (numa conta de RH, para: lá não existe cliente). Na **conta só de RH** a IA recebe o aviso de que é uma empresa, com o ramo, e a Helena diz \"da empresa\" quando a conta não tem nome.")

for saida in saidas:
    io.open(saida, 'w', encoding='utf-8', newline='\n').write(json.dumps(w, ensure_ascii=False, indent=2) + '\n')
print('ok:', len(w['nodes']), 'nos ->', len(saidas), 'arquivo(s)')
