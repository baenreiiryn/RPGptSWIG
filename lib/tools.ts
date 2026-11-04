export type OracleTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const oracleTools: OracleTool[] = [
  {
    name: "scene_set",
    description: "Atualiza a cena/local físico atual quando o grupo entra em um ambiente significativamente diferente. Isso também solicita uma nova referência visual da web para o painel fixo da Sessão. Não use para pequenas ações dentro do mesmo local.",
    inputSchema: {
      type: "object",
      properties: {
        scene: {
          type: "string",
          minLength: 2,
          maxLength: 140,
          description: "Rótulo curto e visual do local atual, por exemplo 'Mercado de Varn · Rua dos Ferreiros'.",
        },
        reason: { type: "string", minLength: 1, maxLength: 240 },
      },
      required: ["scene", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "request_player_roll",
    description: "Solicita uma rolagem ao jogador e pausa a resolução da cena até o resultado ser fornecido ao OracleRPG.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", minLength: 1 },
        reason: { type: "string", minLength: 1 },
        formula: {
          type: "string",
          minLength: 1,
          description: "Fórmula de dados válida, por exemplo 1d20+2 ou 2d12. Em rolagens de Dualidade, inclua exatamente 2d12 positivos para Esperança e Medo; dados auxiliares e modificadores podem ser adicionados."
        },
        allowedDice: {
          type: "array",
          items: { type: "string", enum: ["d2", "d4", "d6", "d8", "d10", "d12", "d20", "d100"] },
          minItems: 1,
          uniqueItems: true,
          description: "Tipos de dado permitidos quando o jogador pode montar a própria rolagem."
        },
        target: { type: "number", description: "Valor-alvo ou CD, quando conhecido." },
        dc: { type: "number", description: "Alias de target para uma Classe de Dificuldade." },
        rollKind: {
          type: "string",
          enum: ["attack", "damage", "reaction", "check", "duality", "custom"],
          description: "Tipo da rolagem. duality exige formula com exatamente dois d12 positivos."
        }
      },
      required: ["label", "reason"],
      anyOf: [
        { required: ["formula"] },
        { required: ["allowedDice"] }
      ],
      additionalProperties: false
    }
  },
  {
    name: "campaign_milestone_level_up",
    description: "Declara que a campanha de Daggerheart alcançou um milestone narrativo que concede exatamente um nível. Cria um level-up pendente para o jogador escolher os dois avanços e a carta de domínio; não use XP de crafting nem qualquer XP genérico para subir o personagem.",
    inputSchema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          minLength: 1,
          maxLength: 300,
          description: "Motivo narrativo concreto do milestone alcançado.",
        },
        title: {
          type: "string",
          minLength: 1,
          maxLength: 120,
          description: "Título curto opcional do milestone para histórico da campanha.",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "character_adjust_resource",
    description: "Ajusta um recurso mecânico do personagem usando o command bus do OracleRPG. Para hp, o valor representa Pontos de Vida MARCADOS: amount positivo marca dano e amount negativo limpa dano; 0 significa intacto e maxHp dispara o movimento de morte.",
    inputSchema: {
      type: "object",
      properties: {
        resource: { type: "string", enum: ["hp", "hope", "stress", "armor"] },
        amount: { type: "integer" },
        reason: { type: "string" }
      },
      required: ["resource", "amount", "reason"],
      additionalProperties: false
    }
  },
  {
    name: "character_tracker_set",
    description: "Atualiza um tracker persistente de classe, subclasse, domínio ou habilidade. Use sempre que a regra/narração gastar, ganhar, ativar ou alterar um contador/dado exibido na ficha ou acima do chat.",
    inputSchema: {
      type: "object",
      properties: {
        trackerId: { type: "string", minLength: 1 },
        value: { type: "integer" },
        mode: { type: "string", enum: ["set", "adjust"] },
        dieIndex: { type: "integer", minimum: 0 },
        reason: { type: "string", minLength: 1 }
      },
      required: ["trackerId", "value", "mode", "reason"],
      additionalProperties: false
    }
  },
  {
    name: "character_long_rest",
    description: "Registra o início, conclusão ou interrupção real de um descanso longo em Daggerheart. start elimina recursos que antes expiravam no fim da sessão. finish renova usos por sessão e devolve efeitos de início de ciclo. interrupt não renova usos. Não use para descanso curto ou simples passagem de tempo. Reutilize o restId retornado para concluir/interromper o mesmo descanso.",
    inputSchema: {
      type: "object",
      properties: {
        phase: { type: "string", enum: ["start", "finish", "interrupt"] },
        restId: { type: "string", description: "Identificador do descanso iniciado, obrigatório em finish e interrupt." },
        reason: { type: "string", minLength: 1 },
      },
      required: ["phase", "reason"], additionalProperties: false,
    },
  },
  {
    name: "character_ability_use",
    description: "Consome um uso de habilidade ou item do personagem cujo limite era por sessão e agora renova ao terminar descanso longo. Forneça id ou sourceId de sessionAbilityUses. Recusa habilidades não possuídas e usos esgotados. Não consome custos de Esperança/Fadiga nem resolve os demais efeitos. Inspiração também pode ser ativada diretamente pelo tracker, sem duplicar a concessão.",
    inputSchema: {
      type: "object",
      properties: { abilityId: { type: "string", minLength: 1 }, reason: { type: "string", minLength: 1 } },
      required: ["abilityId", "reason"], additionalProperties: false,
    },
  },
  {
    name: "character_ability_refresh",
    description: "Aplica a exceção de Revigorar para recuperar UM uso gasto do personagem. Exige que o personagem possua Revigorar e uma nova rolagem registrada em rollHistory com pelo menos um d6 de resultado 6. A mesma rolagem não pode recarregar várias habilidades. Aplique o custo de Esperança e solicite a rolagem conforme a carta antes desta chamada.",
    inputSchema: {
      type: "object", properties: {
        abilityId: { type: "string", minLength: 1 }, rollId: { type: "string", minLength: 1 }, reason: { type: "string", minLength: 1 },
      }, required: ["abilityId", "rollId", "reason"], additionalProperties: false,
    },
  },
  {
    name: "character_transformation_set",
    description: "Ativa ou encerra uma transformação temporária do personagem sem sobrescrever os atributos-base. Use especialmente para Forma de Fera do Druida; ao encerrar, a ficha volta automaticamente aos valores normais.",
    inputSchema: {
      type: "object",
      properties: {
        active: { type: "boolean" },
        kind: { type: "string", enum: ["beastform", "other"] },
        name: { type: "string" },
        evasionBonus: { type: "integer" },
        agility: { type: "integer" },
        strength: { type: "integer" },
        finesse: { type: "integer" },
        instinct: { type: "integer" },
        presence: { type: "integer" },
        knowledge: { type: "integer" },
        notes: { type: "string" },
        reason: { type: "string", minLength: 1 }
      },
      required: ["active", "reason"],
      additionalProperties: false
    }
  },
  {
    name: "animal_companion_adjust_stress",
    description: "Marca ou limpa Fadiga do companheiro animal do Patrulheiro. Valores positivos marcam Fadiga; valores negativos limpam.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "integer" },
        reason: { type: "string", minLength: 1 }
      },
      required: ["amount", "reason"],
      additionalProperties: false
    }
  },
  {
    name: "inventory_adjust",
    description: "Adiciona ou consome quantidade de um item conhecido.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        amount: { type: "integer" },
        reason: { type: "string" }
      },
      required: ["itemId", "amount", "reason"],
      additionalProperties: false
    }
  },
  {
    name: "quest_add",
    description: "Registra uma nova missão aceita pelo grupo. Se houver prazo, também cria automaticamente o prazo correspondente no calendário.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        stage: { type: "string" },
        deadlineMinutes: { type: "integer", minimum: 1 },
        deadlineDescription: { type: "string" }
      },
      required: ["title", "stage"],
      additionalProperties: false
    }
  },
  {
    name: "quest_set_status",
    description: "Atualiza o estado de uma missão conhecida.",
    inputSchema: {
      type: "object",
      properties: {
        questId: { type: "string" },
        status: { type: "string", enum: ["active", "completed"] },
        reason: { type: "string" }
      },
      required: ["questId", "status", "reason"],
      additionalProperties: false
    }
  },
  {
    name: "condition_set",
    description: "Aplica ou remove uma condição do personagem.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        active: { type: "boolean" },
        reason: { type: "string" }
      },
      required: ["name", "active", "reason"],
      additionalProperties: false
    }
  },
  {
    name: "advance_time",
    description: "Avança o relógio da campanha pelo número de minutos transcorridos na ficção.",
    inputSchema: {
      type: "object",
      properties: {
        minutes: { type: "integer", minimum: 1 },
        reason: { type: "string" }
      },
      required: ["minutes"],
      additionalProperties: false
    }
  },
  {
    name: "set_weather",
    description: "Atualiza o clima atual persistido da campanha quando a narração estabelecer uma nova condição.",
    inputSchema: {
      type: "object",
      properties: {
        condition: {
          type: "string",
          enum: ["clear", "partly-cloudy", "cloudy", "rain", "storm", "snow", "fog", "wind", "custom"]
        },
        label: { type: "string" },
        description: { type: "string" },
        temperatureC: { type: "number" },
        intensity: { type: "string", enum: ["light", "moderate", "heavy"] }
      },
      required: ["condition", "label"],
      additionalProperties: false
    }
  },
  {
    name: "calendar_event_add",
    description: "Adiciona ao calendário um prazo, efeito temporário, compromisso ou acontecimento futuro. Pode usar minutos absolutos da campanha ou tempos relativos ao momento atual.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        startCampaignMinute: { type: "integer", minimum: 0 },
        startsInMinutes: { type: "integer", minimum: 0 },
        endCampaignMinute: { type: "integer", minimum: 0 },
        durationMinutes: { type: "integer", minimum: 1 },
        kind: { type: "string", enum: ["quest", "effect", "appointment", "world", "custom"] },
        sourceId: { type: "string" },
        description: { type: "string" },
        completed: { type: "boolean" }
      },
      required: ["title"],
      additionalProperties: false
    }
  },
  {
    name: "calendar_event_update",
    description: "Atualiza um evento de calendário já conhecido, inclusive prazo, duração ou conclusão.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        title: { type: "string" },
        startCampaignMinute: { type: "integer", minimum: 0 },
        endCampaignMinute: { type: "integer", minimum: 0 },
        kind: { type: "string", enum: ["quest", "effect", "appointment", "world", "custom"] },
        sourceId: { type: "string" },
        description: { type: "string" },
        completed: { type: "boolean" }
      },
      required: ["eventId"],
      additionalProperties: false
    }
  },
  {
    name: "calendar_event_remove",
    description: "Remove um evento persistido do calendário da campanha.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" }
      },
      required: ["eventId"],
      additionalProperties: false
    }
  },
  {
    name: "craft_recipe_learn",
    description: "Ensina ou registra UMA receita de crafting para o personagem. Use fromPendingAttempt=true quando a receita foi descoberta pela combinação atualmente no grid; para professor/livro/pergaminho forneça ingredients explicitamente. Não crie receitas-base Lendárias: Lendário só pode surgir por crítico.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
        discipline: { type: "string", enum: ["mundane", "enchantment", "alchemy"] },
        layout: { type: "string", enum: ["shaped", "shapeless"] },
        learnedFrom: { type: "string", enum: ["discovery", "teacher", "book", "scroll", "other"] },
        fromPendingAttempt: { type: "boolean" },
        baseSlot: { type: "integer", minimum: 0, maximum: 8 },
        ingredients: {
          type: "array",
          maxItems: 9,
          items: {
            type: "object",
            properties: {
              slot: { type: "integer", minimum: 0, maximum: 8 },
              sourceId: { type: "string" },
              itemId: { type: "string" },
              itemName: { type: "string", minLength: 1 },
              quantity: { type: "integer", minimum: 1 },
            },
            required: ["slot", "itemName", "quantity"],
            additionalProperties: false,
          },
        },
        result: {
          type: "object",
          properties: {
            sourceId: { type: "string" },
            name: { type: "string", minLength: 1 },
            detail: { type: "string" },
            icon: { type: "string" },
            art: { type: "string" },
            rarity: { type: "string", enum: ["common", "uncommon", "rare", "very-rare"] },
            quantity: { type: "integer", minimum: 1, maximum: 99 },
            patch: {
              type: "object",
              description: "Principalmente para Encantamentos: alterações explícitas a aplicar ao item-base (por exemplo detail, name, icon, art ou campos de efeito). id, sourceId, qty, rarity e crafted são protegidos pelo motor e não podem ser sobrescritos."
            },
          },
          required: ["name", "detail", "icon", "rarity", "quantity"],
          additionalProperties: false,
        },
      },
      required: ["name", "discipline", "layout", "learnedFrom", "result"],
      additionalProperties: false,
    },
  },
  {
    name: "craft_request_roll",
    description: "Solicita a rolagem da tentativa de crafting atual. O Oracle calcula automaticamente fórmula, CD e chance pelo nível e raridade; nunca invente esses números manualmente.",
    inputSchema: {
      type: "object",
      properties: {
        recipeId: { type: "string", minLength: 1 },
        reason: { type: "string" },
      },
      required: ["recipeId"],
      additionalProperties: false,
    },
  },
  {
    name: "craft_reject_attempt",
    description: "Rejeita a combinação desconhecida atualmente no grid quando ela não forma uma receita coerente. Nenhum material é consumido.",
    inputSchema: {
      type: "object",
      properties: {
        reason: { type: "string", minLength: 1 },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "craft_award_xp",
    description: "Concede experiência em uma disciplina de crafting quando professor, treino ou instrução narrativa justificar. Máximo de 200 XP por chamada.",
    inputSchema: {
      type: "object",
      properties: {
        discipline: { type: "string", enum: ["mundane", "enchantment", "alchemy"] },
        amount: { type: "integer", minimum: 1, maximum: 200 },
        reason: { type: "string", minLength: 1 },
      },
      required: ["discipline", "amount", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_search",
    description: "Busca fatos, eventos e segredos relevantes da campanha persistida no OracleRPG.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 20 }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "timeline_entry_add",
    description: "Registra UM acontecimento ou fato histórico importante no timeline do jogador. Use título e descrição curtos; nunca cole uma memória, gancho ou história inteira. Para fatos retroativos sem data exata, estipule uma data plausível com year/monthIndex/day. Eventos distintos podem compartilhar a mesma data. Não use para segredos ainda desconhecidos nem para eventos futuros.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 100 },
        description: { type: "string", minLength: 1, maxLength: 420 },
        kind: {
          type: "string",
          enum: ["discovery", "quest", "combat", "travel", "relationship", "world", "milestone", "other"]
        },
        tags: { type: "array", items: { type: "string" }, maxItems: 8 },
        importance: { type: "string", enum: ["normal", "major"] },
        visibility: { type: "string", enum: ["public", "hidden"] },
        image: { type: "string" },
        campaignMinute: { type: "integer", minimum: 0, description: "Compatibilidade: minuto do relógio da campanha. Prefira year/monthIndex/day para história antiga." },
        year: { type: "integer", description: "Ano histórico estipulado ou conhecido. Pode ser anterior ao epochYear do relógio atual." },
        monthIndex: { type: "integer", minimum: 0, description: "Índice zero-based do mês no calendário da campanha." },
        day: { type: "integer", minimum: 1 },
        hour: { type: "integer", minimum: 0, maximum: 23 },
        minute: { type: "integer", minimum: 0, maximum: 59 }
      },
      required: ["title", "description", "kind"],
      additionalProperties: false
    }
  },
  {
    name: "timeline_entry_set_visibility",
    description: "Revela ou oculta uma entrada já existente do timeline. Use para revelar ao jogador algo previamente registrado como oculto.",
    inputSchema: {
      type: "object",
      properties: {
        entryId: { type: "string" },
        visibility: { type: "string", enum: ["public", "hidden"] }
      },
      required: ["entryId", "visibility"],
      additionalProperties: false
    }
  },
  {
    name: "memory_record",
    description: "Registra uma nova memória persistente da campanha.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["fact", "event", "secret", "visual"] },
        text: { type: "string" }
      },
      required: ["kind", "text"],
      additionalProperties: false
    }
  }
];
