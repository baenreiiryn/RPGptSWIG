# Ciclo de descanso longo

No OracleRPG, os limites mecânicos de sessão usam o ciclo do descanso longo:

- Usos por sessão são renovados ao **terminar** um descanso longo, preservando a quantidade original.
- Recursos e efeitos que expiravam ao fim da sessão expiram ao **iniciar** um descanso longo.
- Benefícios do início da sessão são concedidos ao **terminar** o descanso longo. Rolagens continuam sendo do jogador.
- Descanso interrompido mantém a perda dos recursos e não renova os usos gastos.
- Reabrir o app, trocar a cena, alterar o número da sessão, avançar o tempo ou fazer descanso curto não renova esse ciclo.

O importador aplica a adaptação às descrições e frequências e grava `sessionRest` nas 20 entradas afetadas (classes, ancestralidades, comunidades, subclasses, domínios e itens). Os arquivos externos de origem não são alterados. Reimportações preservam a adaptação.

O mestre registra `character_long_rest` com `start`, `finish` ou `interrupt`. A conclusão/interrupção exige o `restId` devolvido no início; repetir uma conclusão não concede benefícios novamente. O ciclo e os usos ficam no personagem e são salvos com a campanha.

`character_ability_use` registra usos limitados; `sessionAbilityUses` informa o saldo ao mestre. A concessão de Inspiração também registra o uso quando o tracker é ativado, inclusive por alterações manuais. Gastar o dado não recupera o uso. Personagens antigos com o dado ativo são tratados como tendo utilizado Inspiração no ciclo atual; gastos anteriores não registrados não são inventados.

No início do descanso, trackers de recursos que expiram são zerados. Dados de Matança ainda concedem Esperança pelos dados descartados. Efeitos sobre aliados e recursos sem tracker são devolvidos ao mestre para aplicar na ficção. Ao concluir, `refreshRequired` lista os benefícios que precisam ser resolvidos, como Dados de Oração e Fases Lunares. Cura e escolhas normais de repouso continuam seguindo suas próprias regras.

Contatos mantém três usos quando Reforços Confiáveis está presente. Revigorar pode recuperar um uso gasto via `character_ability_refresh`, exigindo a carta e uma rolagem registrada com um 6 em d6; uma rolagem não pode ser reutilizada.
