# Cyberpunk RED 2045 e Edgerunners 2077

OracleRPG oferece três sistemas na criação de campanha: Daggerheart, Cyberpunk RED (2045) e Cyberpunk Edgerunners (2077). O estado, as ferramentas do Mestre, a criação de personagem e os compêndios Cyberpunk são separados dos de Daggerheart.

## Material importado

A importação reproduzível em `scripts/import-cyberpunk.py` lê o arquivo fornecido `edgerunners-mission-kit-v11FVTT.zip`: 612 entradas no arquivo, 1.118 registros base, 47 registros do Mission Kit, 188 fichas de referência e 60 locais (43 em 2045 e 17 em 2077). Os registros preservam referências de livro/página e descrições originais em inglês. A interface e as instruções do Mestre usam português.

O mundo Foundry exportado tem ambientação em 2055 e referencia Cyberpunk RED Core v0.88.2. Suas fichas são modelos opcionais para o Mestre adaptar à campanha, sem importar automaticamente sua trama. Contas, macros, históricos de conversa e jornais privados não são importados.

O visual reutiliza seis recortes do atlas cibernético já gerado, mapas e ilustrações do material fornecido. Dezesseis faces de dados d6/d10 do pacote Edgerunners são usadas no rolador.

## Fluxos implementados

- Criação por pontos: dez atributos, perícias e custos dobrados, papel de nível 4, idioma nativo, verba inicial e crédito de moda separado; Neuroport de infância opcional em 2077.
- Ficha com PV restantes, Humanidade/EMP, armadura, ferimentos, dinheiro, inventário, munição, recarga e limites de ações físicas/NET.
- Testes d10 com explosão/implosão única e dificuldade estrita, dano e salvaguarda contra morte. Rolagens pedidas pelo Mestre continuam a narração automaticamente.
- Cyberware por região do corpo, bases e capacidade de opções; validação de instalação, perda de Humanidade rolada e redução do máximo. Sandevistan/Berserk têm controle de duração.
- Hacking de Neuroport em 2077: requisitos de papel e equipamento, alcance/visibilidade, Self-ICE, Jack In/Out, tentativas por alvo/turno, ações NET e bloqueio após ejeção.
- Sessão com tema Cyberpunk, contatos e missões, importação opcional das fichas de referência e compêndios filtrados por época.
- Memória geográfica com mapa interativo, zoom, local atual, endereços personalizados e acontecimentos datados vinculáveis a contatos e missões.
- Persistência da campanha, resultados de ferramentas e recuperação de respostas; repetição de uma resposta não reaplica uma operação já concluída.

## Limites de automação

Os compêndios são referências; a presença de um registro não significa que todo efeito descrito esteja automatizado. Exploração de andares NET em 2045, combate com Black ICE/programas, efeitos complexos de alguns quickhacks, habilidades de papéis, terapia, tabela completa de lesões e progressão por IP ainda dependem da adjudicação do Mestre.

O mapa de 2045 traz os 43 pontos numerados da fonte. O de 2077 inicia com 17 marcadores de bairros/distritos e aceita endereços cadastrados sobre o mapa; não é uma base completa e geocodificada de todas as ruas de Night City.

## Verificação

- `npm run lint` e `npm run build`: aprovados.
- Suíte completa: 216 testes aprovados, incluindo 29 testes Cyberpunk.
- Navegador com ponte do Mestre simulada: criação em 2045/2077, pedido de rolagem e continuação, importação de contato, mapas, endereços, memória, persistência e fechamento do rolador.
- Larguras verificadas: 1440, 390 e 320 pixels; sem erros JavaScript ou transbordamento horizontal da página. Integração real com o provedor do Mestre depende da conexão já configurada pelo usuário.

Para executar a suíte com as referências Daggerheart locais, configure `DAGGERHEART_FOUNDRYBORNE_DOMAINS` para os packs de domínios antes de `npm test`.

## Criação de personagem e mapa detalhado

O criador tem sugestões editáveis de atributos e equipamentos para os dez papéis. Cyberware possui etapa própria, com o mesmo orçamento inicial, bases instaladas, capacidade e prévia de Humanidade. Na criação usa-se a perda fixa de Humanidade da ficha de referência; compras e instalações posteriores mantêm o fluxo de rolagens. As sugestões substituem somente a categoria da etapa e não gastam o saldo duas vezes. Armas compradas iniciam descarregadas, com munição no inventário quando incluída no pacote.

A etapa de história aceita retrato local comprimido, análise visual e geração de história pela conexão ChatGPT existente. Ambos os textos são editáveis e a análise não inventa características ocultas. O retrato é salvo na ficha e na biblioteca de campanhas; a aparência acompanha o contexto do Mestre. A geração foi verificada com respostas simuladas, sem consumo de chamadas reais.

Netrunners de 2077 escolhem quickhacks preferidos na criação, destacados com estrela na aba NET. Conforme o Mission Kit (seção de adaptação a RED), Interface 4 libera todos os quickhacks incluídos. A escolha organiza o acesso, sem inventar preços, RAM ou slots de programas. Programas e cyberdeck continuam como equipamento separado.

O mapa de 2077 tem 49 locais padrão: 17 áreas e 32 pontos de interesse selecionados. A camada online mostra ruas e edifícios com tiles de detalhe carregados somente para a região visível, com crédito à referência e retorno ao atlas local em caso de falha. Há pan por arraste, zoom na posição do cursor, pinça com dois dedos, teclas, enquadramento, tela cheia, busca e categorias. Os pontos de acesso da referência não equivalem a endereços postais exatos.

Endereços antigos permanecem vinculados ao atlas. Novos endereços marcados na camada de ruas guardam também suas coordenadas nessa camada. As campanhas existentes recebem os novos pontos por ID sem perder seus endereços, acontecimentos, datas ou vínculos. Marcadores do atlas de 2077 são aproximações; os pontos de interesse usam coordenadas da referência na camada detalhada.

A atualização de locais preserva a identidade do estado quando não há novos dados, evitando ciclos de normalização e sobrescrita de edições. O teste de regressão cobre campanhas novas e migração de campanhas antigas.

Verificação desta extensão: 216 testes, TypeScript e build de produção (`npm run build -- --webpack`) aprovados. O navegador verificou retrato/análise/história com IA simulada, escolha de quickhacks, zoom/arraste/pinça real, endereços após transformações, memória e reabertura nas larguras 1440/390/320 px. Os tiles reais foram repassados pelo proxy do ambiente de teste; falha simulada da camada externa confirmou o retorno ao atlas sem perda dos dados.
