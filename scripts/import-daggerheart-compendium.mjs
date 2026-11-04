import fs from "node:fs";
import path from "node:path";
import { applySessionRestRule } from "../lib/sessionRestRules.ts";
import { FOUNDRYBORNE_SOURCE_URL, normalizeSourceArtName } from "./sync-foundryborne-art.mjs";

const root = process.cwd();
const translationRoot = process.env.DAGGERHEART_TRANSLATION
  ? path.resolve(process.env.DAGGERHEART_TRANSLATION)
  : path.resolve(root, "..", "daggerheart-translation-pt-BR");
const artRoot = process.env.DAGGERHEART_ART
  ? path.resolve(process.env.DAGGERHEART_ART)
  : path.resolve(root, "..", "art-for-daggerheart");
const foundryborneDomainRoot = process.env.DAGGERHEART_FOUNDRYBORNE_DOMAINS
  ? path.resolve(process.env.DAGGERHEART_FOUNDRYBORNE_DOMAINS)
  : path.resolve(root, "..", "daggerheart-foundryborne", "src", "packs", "domains");

const compendiumRoot = path.join(translationRoot, "compendium");
const langPath = path.join(translationRoot, "lang", "pt-BR.json");
const outputPath = path.join(root, "lib", "compendium", "daggerheart.generated.json");
const artOutputRoot = path.join(root, "public", "compendium", "daggerheart", "adversaries");
const foundryborneManifestPath = path.join(root, "lib", "compendium", "foundryborne-art.manifest.json");
const foundryborneSubclassManifestPath = path.join(root, "lib", "compendium", "foundryborne-subclass-features.manifest.json");
const voidPtBrPath = path.join(root, "lib", "compendium", "void-unofficial.pt-BR.json");
const expansionSubclassSupplement = readJson(path.join(root, "lib", "compendium", "expansion-subclass-features.pt-BR.json"));

const CORE_CLASSES = new Set([
  "Bard", "Druid", "Guardian", "Ranger", "Rogue", "Seraph", "Sorcerer", "Warrior", "Wizard",
]);
const EXPANSION_CLASSES = new Set(["Assassin", "Blood Hunter", "Brawler", "Warlock", "Witch"]);
const CORE_ANCESTRIES = new Set([
  "Dwarf", "Clank", "Drakona", "Elf", "Faerie", "Faun", "Firbolg", "Fungril", "Galapa",
  "Giant", "Goblin", "Human", "Infernis", "Katari", "Orc", "Halfling", "Ribbet", "Simiah",
]);
const EXPANSION_ANCESTRIES = new Set(["Aetheris", "Earthkin", "Emberkin", "Gnome", "Skykin", "Tidekin"]);
const CORE_COMMUNITIES = new Set([
  "Highborne", "Loreborne", "Orderborne", "Ridgeborne", "Seaborne", "Slyborne",
  "Underborne", "Wanderborne", "Wildborne",
]);
const EXPANSION_COMMUNITIES = new Set([
  "Duneborne", "Freeborne", "Frostborne", "Hearthborne", "Reborne", "Warborne",
]);
const EXPANSION_ANCESTRY_FEATURE_PARENT = {
  "Divine Countenance": "Aetheris",
  "Hallowed Aura": "Aetheris",
  Immovable: "Earthkin",
  Stoneskin: "Earthkin",
  Fireproof: "Emberkin",
  Ignition: "Emberkin",
  "Nimble Fingers": "Gnome",
  "True Sight": "Gnome",
  "Eye of the Storm": "Skykin",
  "Gale Force": "Skykin",
  Amphibious: "Tidekin",
  Lifespring: "Tidekin",
};
const COMMUNITY_FEATURE_PARENT = {
  "Know the Tide": "Seaborne",
  "Nomadic Pack": "Wanderborne",
  Dedicated: "Orderborne",
  Privilege: "Highborne",
  Steady: "Ridgeborne",
  "Well-Read": "Loreborne",
  Lightfoot: "Wildborne",
  Scoundrel: "Slyborne",
  "Low-Light Living": "Underborne",
  Oasis: "Duneborne",
  "Found Family": "Reborne",
  Hardy: "Frostborne",
  "Close-Knit": "Hearthborne",
  Unbound: "Freeborne",
  "Brave Face": "Warborne",
};
const CORE_SUBCLASSES = new Set([
  "Troubadour", "Wordsmith",
  "Warden of the Elements", "Warden of Renewal",
  "Stalwart", "Vengeance",
  "Beastbound", "Wayfinder",
  "Nightwalker", "Syndicate",
  "Divine Wielder", "Winged Sentinel",
  "Elementalist", "Primal Origin",
  "Call Of The Brave", "Call Of The Slayer",
  "School Of Knowledge", "School Of War",
]);
const CLASS_FEATURE_PARENT = {
  "Make a Scene": "Bard",
  Rally: "Bard",
  "Rally (Level 5)": "Bard",
  Evolution: "Druid",
  Beastform: "Druid",
  Wildtouch: "Druid",
  "Frontline Tank": "Guardian",
  Unstoppable: "Guardian",
  "Hold Them Off": "Ranger",
  "Ranger's Focus": "Ranger",
  "Rogue's Dodge": "Rogue",
  Cloaked: "Rogue",
  "Sneak Attack": "Rogue",
  "Life Support": "Seraph",
  "Prayer Dice": "Seraph",
  "Volatile Magic": "Sorcerer",
  "Arcane Sense": "Sorcerer",
  "Minor Illusion": "Sorcerer",
  "Channel Raw Power": "Sorcerer",
  "No Mercy": "Warrior",
  "Attack Of Opportunity": "Warrior",
  "Combat Training": "Warrior",
  "Not This Time": "Wizard",
  Prestidigitation: "Wizard",
  "Strange Patterns": "Wizard",
};
const SUBCLASS_CLASS_PARENT = {
  Troubadour: "Bard",
  Wordsmith: "Bard",
  "Warden of the Elements": "Druid",
  "Warden of Renewal": "Druid",
  Stalwart: "Guardian",
  Vengeance: "Guardian",
  Beastbound: "Ranger",
  Wayfinder: "Ranger",
  Nightwalker: "Rogue",
  Syndicate: "Rogue",
  "Divine Wielder": "Seraph",
  "Winged Sentinel": "Seraph",
  Elementalist: "Sorcerer",
  "Primal Origin": "Sorcerer",
  "Call Of The Brave": "Warrior",
  "Call Of The Slayer": "Warrior",
  "School Of Knowledge": "Wizard",
  "School Of War": "Wizard",
};
const EXPANSION_CLASS_FEATURE_PARENT = {
  "Blood Maledict": "Blood Hunter",
  "Grim Psychometry": "Blood Hunter",
  "Crimson Rite": "Blood Hunter",
  "Patron's Boon": "Warlock",
  "Warlock Patron": "Warlock",
  Favor: "Warlock",
};
const EXPANSION_SUBCLASS_PARENT = {
  "Executioners Guild": "Assassin",
  "Poisoners Guild": "Assassin",
  "Order of the Ghost Slayer": "Blood Hunter",
  "Order of the Lycan": "Blood Hunter",
  "Order of the Mutant": "Blood Hunter",
  Juggernaut: "Brawler",
  "Martial Artist": "Brawler",
  "Pact of the Endless": "Warlock",
  "Pact of the Wrathful": "Warlock",
  Hedge: "Witch",
  Moon: "Witch",
};
const EXPANSION_SUBCLASS_FEATURE_PARENT = {
  "Chasing Death": "Order of the Ghost Slayer",
  "Shadowed Grit": "Order of the Ghost Slayer",
  Veilwalker: "Order of the Ghost Slayer",
  "Spectral Form": "Order of the Ghost Slayer",
  Mutagens: "Order of the Mutant",
  "Improved Mutagens": "Order of the Mutant",
  "Volatile Toxins": "Order of the Mutant",
  "Mastered Mutagens": "Order of the Mutant",
  Werewolf: "Order of the Lycan",
  "Control the Beast": "Order of the Lycan",
  "Feral Hide": "Order of the Lycan",
  "Lycan Regeneration": "Order of the Lycan",
  "Master the Beast": "Order of the Lycan",
  "Patron's Mantle": "Pact of the Endless",
  "Deadly Devotion": "Pact of the Endless",
  "Draining Invocation": "Pact of the Endless",
  "Dark Aegis": "Pact of the Endless",
  "Draining Bane": "Pact of the Endless",
  "Favored Weapon": "Pact of the Wrathful",
  "Herald of Death": "Pact of the Wrathful",
  "Menacing Reach": "Pact of the Wrathful",
  "Diminish My Foes": "Pact of the Wrathful",
  "Fearsome Attack": "Pact of the Wrathful",
  "Divine Ire": "Pact of the Wrathful",
};
const EXPANSION_CLASS_DESCRIPTION_FALLBACK = {
  Warlock: "Ocultistas obtêm poder por meio de um pacto com uma entidade sobrenatural. Sua magia depende da relação que mantêm com esse patrono, pedindo favores, oferecendo tributos e recorrendo às esferas de influência da entidade para superar desafios. Esse poder pode ser extraordinário, mas sempre carrega o peso de uma dívida e de uma vontade externa.",
};
const EXPANSION_SUBCLASS_DESCRIPTION_FALLBACK = {
  "Executioners Guild": "Execute seus alvos com precisão letal e golpes decisivos.",
  "Poisoners Guild": "Debilite seus alvos usando venenos e aflições.",
  "Order of the Ghost Slayer": "Cace os mortos e caminhe perigosamente próximo ao véu entre a vida e a morte.",
  "Order of the Lycan": "Assuma uma forma lupina e transforme sua ferocidade em poder.",
  "Order of the Mutant": "Altere seu corpo com mutagênicos para adaptar suas capacidades à situação.",
  Juggernaut: "Esmague seus oponentes com força e resistência implacáveis.",
  "Martial Artist": "Use técnicas e posturas marciais variadas para dominar o combate desarmado.",
  "Pact of the Endless": "Resista aos inimigos e evite a morte com a proteção de seu patrono.",
  "Pact of the Wrathful": "Canalize a fúria de seu patrono para destruir aqueles que se opõem a você.",
  Hedge: "Use sua arte e seus rituais para fortalecer a si mesmo e seus aliados.",
  Moon: "Canalize poder celestial para ampliar e transformar sua magia.",
};
const EXPANSION_FALLBACK_CLASS_FEATURES = [
  {
    key: "Deadly Determination",
    parent: "Assassin",
    name: "Determinação Mortal",
    description: "Gaste 3 Pontos de Esperança para limpar 2 Pontos de Fadiga.",
  },
  {
    key: "Marked for Death",
    parent: "Assassin",
    name: "Marcado para Morrer",
    description: "Ao acertar um ataque com arma, você pode marcar 1 Ponto de Fadiga para deixar o alvo Marcado para Morrer. Quando causar dano a esse alvo, some à rolagem de dano uma quantidade de d4 igual ao seu Patamar. Você só pode manter um adversário Marcado para Morrer por vez. A marca termina quando você descansa, quando o alvo é derrotado ou quando o Mestre gasta uma quantidade de Pontos de Medo igual ao seu Patamar para removê-la.",
  },
  {
    key: "Get In & Get Out",
    parent: "Assassin",
    name: "Entrar e Sair",
    description: "Gaste 1 Ponto de Esperança para perguntar ao Mestre por uma maneira rápida ou discreta de entrar ou sair de um lugar que você possa ver. O próximo teste que fizer agindo com base nessa informação tem vantagem.",
  },
  {
    key: "Square Up",
    parent: "Brawler",
    name: "Partir pra Cima",
    description: "Gaste 3 Pontos de Esperança para intimidar um alvo em alcance Próximo, deixando-o temporariamente Vulnerável.",
  },
  {
    key: "I Am the Weapon",
    parent: "Brawler",
    name: "Eu Sou a Arma",
    description: "Seus ataques desarmados são tão perigosos quanto qualquer lâmina. Enquanto não tiver outra arma ativa, você possui uma arma principal chamada Golpe de Pugilista. Escolha um atributo para usá-la; ela tem alcance Corpo-a-Corpo e causa d8+d6 de dano físico usando sua Proficiência, com ambos os dados escalando pela Proficiência. Enquanto essa arma estiver ativa, sua Evasão recebe +1.",
  },
  {
    key: "Combo Strike",
    parent: "Brawler",
    name: "Golpe Combinado",
    description: "Depois de rolar o dano de um ataque corpo a corpo bem-sucedido, você pode marcar 1 Ponto de Fadiga para iniciar um combo. Role seu Dado de Combo e anote o resultado, continuando a rolá-lo até que o resultado mais recente seja menor que o anterior. Cause dano adicional igual à soma de todos os resultados do Dado de Combo. Esse dado começa como d4 e pode aumentar em um passo uma vez por Patamar como opção de avanço.",
  },
  {
    key: "Witch's Charm",
    parent: "Witch",
    name: "Encanto do Bruxo",
    description: "Quando você ou um aliado em alcance Distante falhar em um teste de ação, gaste 3 Pontos de Esperança para transformar o resultado em um sucesso com Medo.",
  },
  {
    key: "Hex",
    parent: "Witch",
    name: "Maldição",
    description: "Marque 1 Ponto de Fadiga para amaldiçoar temporariamente um alvo em alcance Distante. Enquanto estiver Amaldiçoado, o alvo sofre uma penalidade nas rolagens de dano e na Dificuldade igual ao seu Patamar. Você pode manter uma quantidade de criaturas Amaldiçoadas igual ao seu atributo de conjuração.",
  },
  {
    key: "Commune",
    parent: "Witch",
    name: "Comunhão",
    description: "Uma vez por descanso longo, durante um momento de calma, você pode comungar com um ancestral, divindade, espírito ou entidade de outro mundo. Faça uma pergunta e role uma quantidade de d6 igual ao seu atributo de conjuração. Escolha um resultado: com 1–3, você recebe uma sensação relevante; com 4–5, ouve sons ou vê uma visão; com 6, vivencia psiquicamente uma cena relacionada à resposta.",
  },
];
const CLASS_ITEMS = new Set([
  "Broken Compass", "Whispering Orb", "A Romance Novel", "Grappling Hook", "Drawing Of A Lover",
  "A Sharpening Stone", "Strange Dirty Penant", "Tiny Elemental Pet", "Secret Key",
  "Letter(Never Opened)", "Family Heirloom", "Bundle of Offerings", "Totem from Mentor",
  "Trophy from your First Kill", "Untranslated Book", "50ft of Rope", "Sigil of Your God",
  "Small Bag (Rocks & Bones)", "Basic Supplies", "Set of Forgery Tools", "Torch",
  "Steel Needle", "Vial of Blood", "Carving", "Ring",
]);

const RANGE_TERMS = [
  "Pessoal", "Corpo-a-Corpo", "Adjacente", "Muito Próximo", "Muito Perto", "Próximo", "Perto",
  "Distante", "Longe", "Muito Distante", "Muito Longe",
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanText(value = "") {
  return decodeEntities(String(value))
    .replace(/\[\[\/r\s+([^\]]+)\]\]/gi, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const CLASS_FEATURE_ART_ROOT = "/compendium/daggerheart/class-features";
const CLASS_ART_ROOT = "/compendium/daggerheart/classes";
const CLASS_ART_SLUGS = new Map(Object.entries({
  Bard: "bardo",
  Druid: "druida",
  Guardian: "guardiao",
  Ranger: "patrulheiro",
  Rogue: "ladino",
  Seraph: "serafim",
  Sorcerer: "feiticeiro",
  Warrior: "guerreiro",
  Wizard: "mago",
  Assassin: "assassino",
  Brawler: "pugilista",
  Warlock: "ocultista",
  Witch: "bruxo",
  "Blood Hunter": "cacador-de-sangue",
  Summoner: "invocador",
}));
const CLASS_FEATURE_ART_SLUGS = new Set([
  "alicerce-da-vida", "ataque-de-oportunidade", "ataque-furtivo", "auxilio-dos-espiritos", "bencao-do-patrono",
  "canalizar-poder-bruto", "comunhao", "dadiva-da-natureza", "dados-de-oracao",
  "determinacao", "determinacao-mortal", "encanto-do-bruxo", "entrar-e-sair", "esquiva-de-ladino",
  "eu-sou-a-arma", "evolucao", "favor", "fazer-uma-cena", "forma-de-fera",
  "golpe-combinado", "ilusao-menor", "inspiracao", "inspiracao-nivel-5", "invocar-entidade", "linha-de-frente", "magia-volatil",
  "maldicao", "maldicao-de-sangue", "marca-da-presa", "marcado-para-morrer",
  "nao-dessa-vez", "oculto", "padroes-estranhos", "partir-pra-cima", "patrono-oculto",
  "prestidigitacao", "psicometria-sombria", "ritual-carmesim", "segurem-eles",
  "sem-piedade", "sentido-arcano", "treinamento-de-combate",
]);
const CLASS_FEATURE_ART_ALIASES = new Map([
  ["determinacao-moral", "determinacao-mortal"],
  ["ritual-carmessim", "ritual-carmesim"],
  ["ritual-carmesin", "ritual-carmesim"],
]);

function classFeatureArtFor(data, key) {
  const displaySlug = slug(cleanText(data.name || key));
  const artSlug = CLASS_FEATURE_ART_ALIASES.get(displaySlug) || displaySlug;
  return CLASS_FEATURE_ART_SLUGS.has(artSlug) ? `${CLASS_FEATURE_ART_ROOT}/${artSlug}.webp` : null;
}

function classArtFor(key) {
  const file = CLASS_ART_SLUGS.get(key);
  return file ? `${CLASS_ART_ROOT}/${file}.webp` : null;
}

const ANCESTRY_ART_SLUGS = new Set([
  "anao",
  "angelis",
  "calidar",
  "celestino",
  "clank",
  "drakona",
  "elfo",
  "fada",
  "fauno",
  "firbolg",
  "fungril",
  "galapa",
  "gigante",
  "gnomo",
  "goblin",
  "humano",
  "infernis",
  "katari",
  "maresial",
  "orc",
  "pequenino",
  "quacho",
  "simio",
  "terrenal"
]);
const ANCESTRY_FEATURE_ART_SLUGS = new Set([
  "a-prova-de-fogo",
  "adaptabilidade",
  "agil",
  "alcance",
  "anfibio",
  "asas",
  "aspecto-apavorante",
  "aura-sagrada",
  "carapaca",
  "cheiro-de-perigo",
  "coice",
  "conexao-fungril",
  "dedos-ageis",
  "destemido",
  "duro-feito-pedra",
  "eficiente",
  "escalador-natural",
  "escamas",
  "fonte-vital",
  "garras-retrateis",
  "ignicao",
  "inabalavel",
  "instinto-felino",
  "investida",
  "irremovivel",
  "linguarudo",
  "olho-da-tempestade",
  "passo-firme",
  "pele-espessa",
  "presas",
  "projeto-intencional",
  "reacao-rapida",
  "resiliencia",
  "resistencia",
  "retracao",
  "robusto",
  "salto-caprino",
  "semblante-divino",
  "senso-de-direcao",
  "sopro-elemental",
  "talisma-da-sorte",
  "testar-a-sorte",
  "transe-celestial",
  "vendaval",
  "vigoroso",
  "vinculo-mortal",
  "visao-verdadeira"
]);

function ancestryArtFor(data, key, isAncestry) {
  const artSlug = slug(cleanText(data.name || key));
  const allowed = isAncestry ? ANCESTRY_ART_SLUGS : ANCESTRY_FEATURE_ART_SLUGS;
  const directory = isAncestry ? "ancestries" : "ancestry-features";
  return allowed.has(artSlug) ? `/compendium/daggerheart/${directory}/${artSlug}.webp` : null;
}

const COMMUNITY_ART_SLUGS = new Set([
  "aristocratica", "desertica", "devastada", "disciplinada", "erudita",
  "fora-da-lei", "gelida", "liberta", "maritima", "montanhesa", "nomade",
  "pacata", "sem-comunidade", "silvestre", "subterranea",
]);
const COMMUNITY_FEATURE_ART_SLUGS = new Set([
  "a-uniao-faz-a-forca", "conhecer-a-mare", "culto", "desgarrado",
  "familia-adotada", "firme", "habituado-a-penumbra", "malandro",
  "mochila-de-nomade", "oasis", "pes-leves", "principios", "privilegio",
  "resistente", "semblante-corajoso",
]);

function communityArtFor(data, key, isCommunity) {
  const artSlug = slug(cleanText(data.name || key));
  const allowed = isCommunity ? COMMUNITY_ART_SLUGS : COMMUNITY_FEATURE_ART_SLUGS;
  const directory = isCommunity ? "communities" : "community-features";
  return allowed.has(artSlug) ? `/compendium/daggerheart/${directory}/${artSlug}.webp` : null;
}

const SUBCLASS_ART_SLUGS = new Set([
  "artista-marcial", "beletrista", "baluarte", "cerca-viva",
  "discipulo-da-guerra", "discipulo-do-conhecimento", "elementalismo", "escolhido-da-bravura",
  "escolhido-da-matanca", "executor", "gatuno", "implacavel",
  "intoxicante", "lunar", "mafioso", "necromancia",
  "ordem-do-espectro", "ordem-do-licantropo", "ordem-do-mutante", "pacto-do-colerico",
  "pacto-do-perpetuo", "portador-divino", "primordialista", "protetor-da-renovacao",
  "protetor-dos-elementos", "rastreador", "sentinela-alada", "teurgia",
  "treinador", "trovador", "vingador",
]);
const SUBCLASS_FEATURE_ART_SLUGS = new Set([
  "2-circulo-anjo", "2-circulo-cadaver-cambaleante", "3-circulo-arcanjo", "3-circulo-fantasmas",
  "4-circulo-cavaleiro-da-morte", "4-circulo-manifestacao-divina", "a-fera-interior", "adepto",
  "adrenalina", "alcance-ameacador", "alma-de-poeta", "amigo-leal",
  "arauto-da-morte", "arma-espiritual", "arma-favorita", "artista-talentoso",
  "asas-de-luz", "ascensao", "ataque-temivel", "aura-elemental",
  "auxilio-celestial", "auxilio-encantado", "avante", "baluarte-do-cavaleiro",
  "bem-vivido", "brilhante", "cacador-do-veu", "camaradagem",
  "caminhante-do-veu", "carga-arcana", "colheita-sombria", "comandante-divino",
  "companheiro-animal", "conexoes", "conjurar-escudo", "contatos",
  "coragem", "defensor", "desaparecimento", "desprezo-pelo-inimigo",
  "determinacao-sombria", "devocao", "devocao-morbida", "discurso-inspirador",
  "egide-sombria", "elementalista", "eloquente", "encare-o-medo",
  "encarnacao-elemental", "enfrentar-o-desafio", "especialista-em-armas", "esperanca-consagrada",
  "evasao-natural", "foco-bestial", "fome-da-sepultura", "forma-espectral",
  "forma-hibrida", "fortalecimento-feral", "golpe-de-esperanca", "guerreiro-mortal",
  "horror-lapidado", "impavido", "invocacao-sugadora", "ira-divina",
  "irmaos-de-armas", "irrefreavel", "maestro", "mago-de-batalha",
  "maldicao-drenadora", "manipular-magia", "manto-do-patrono", "matanca",
  "mestre-dos-mutagenicos", "movido-por-medo", "mutagenicos", "mutagenicos-aprimorados",
  "nao-tenha-medo", "nemesis", "nuvem-de-escuridao", "passo-sombrio",
  "poder-dos-deuses", "poesia-epica", "predador-apex", "predador-implacavel",
  "predador-supremo", "predador-veloz", "preparacao-marcial", "presenca-angelical",
  "presenca-curativa", "promissor", "protecao-druidica", "protetor-leal",
  "protetores-fantasmagoricos", "reforcos-confiaveis", "regeneracao", "represalia",
  "resoluto", "ressonancia-sagrada", "revanche", "ritual-de-batalha",
  "serenidade-da-natureza", "soberania-elemental", "sombra-fugaz", "talentoso",
  "terror-espectral", "toque-piedoso", "toxinas-volateis", "transcendencia",
  "treinamento-avancado", "treinamento-especializado", "triunfo-do-caos", "troca-perfeita",
  "unidos-na-batalha", "vem-tranquilo", "virtuoso", "visagem-eterea",
  "vontade-de-ferro",
]);

function subclassArtFor(data, key, isSubclass) {
  const artSlug = slug(cleanText(data.name || key));
  const allowed = isSubclass ? SUBCLASS_ART_SLUGS : SUBCLASS_FEATURE_ART_SLUGS;
  const directory = isSubclass ? "subclasses" : "subclass-features";
  return allowed.has(artSlug) ? `/compendium/daggerheart/${directory}/${artSlug}.webp` : null;
}

function wordNumber(value) {
  const normalized = value && value.toLocaleLowerCase("pt-BR");
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return ({ um: 1, uma: 1, dois: 2, duas: 2, três: 3, quatro: 4, cinco: 5 })[normalized] ?? null;
}

function extractMechanics(description) {
  const costs = [];
  const seenCosts = new Set();
  const costRegex = /\b(?:gaste|gastar|gastando|marque|marcar|marcando)\s+(?:até\s+)?(\d+|um|uma|dois|duas|três|qualquer quantidade)?\s*(?:Pontos?\s+de\s+|Ponto\s+de\s+|de\s+)?(Esperança|Fadiga|Armadura|Vida|Medo)\b/giu;
  for (const match of description.matchAll(costRegex)) {
    const resource = match[2] === "Vida" ? "Ponto de Vida" : match[2];
    const amount = wordNumber(match[1]);
    const labelAmount = amount || match[1] || "variável";
    const key = resource + ":" + labelAmount;
    if (seenCosts.has(key)) continue;
    seenCosts.add(key);
    costs.push({ resource, amount, label: labelAmount + " " + resource });
  }

  const damage = [];
  const seenDamage = new Set();
  const damageRegex = /\b(\d*d\d+(?:(?:\s*[+-]\s*)(?:\d*d\d+|\d+))*)\s+(?:de\s+)?dano(?:\s+(físico|mágico))?/giu;
  for (const match of description.matchAll(damageRegex)) {
    const formula = match[1].replace(/\s+/g, "");
    const type = match[2] ? match[2].toLocaleLowerCase("pt-BR") : undefined;
    const key = formula + ":" + (type || "");
    if (!seenDamage.has(key)) {
      seenDamage.add(key);
      damage.push({ formula, type });
    }
  }

  const tests = [];
  const seenTests = new Set();
  const testRegex = /\bteste de (Conjuração|Reação|Agilidade|Força|Acuidade|Instinto|Presença|Conhecimento)\b/giu;
  for (const match of description.matchAll(testRegex)) {
    const label = "Teste de " + match[1];
    const normalized = label.toLocaleLowerCase("pt-BR");
    if (!seenTests.has(normalized)) {
      seenTests.add(normalized);
      tests.push(label);
    }
  }

  const difficulties = [];
  for (const match of description.matchAll(/\b(?:Dificuldade|teste(?: de [\p{L}]+)?)\s*\((\d{1,2})\)/giu)) {
    const value = Number(match[1]);
    if (!difficulties.includes(value)) difficulties.push(value);
  }

  const lowerDescription = description.toLocaleLowerCase("pt-BR");
  const ranges = RANGE_TERMS
    .slice()
    .sort((a, b) => b.length - a.length)
    .filter((term, index, terms) => {
      const normalized = term.toLocaleLowerCase("pt-BR");
      if (!lowerDescription.includes(normalized)) return false;
      return !terms.slice(0, index).some((longer) => {
        const longerNormalized = longer.toLocaleLowerCase("pt-BR");
        return longerNormalized.includes(normalized) && lowerDescription.includes(longerNormalized);
      });
    });
  const frequencyMatches = description.match(/\b(?:uma vez por (?:sessão|descanso(?: longo| curto)?)|no início de cada sessão|após um descanso longo|por sessão)\b/giu) || [];
  const frequency = [...new Set(frequencyMatches.map((value) => value.replace(/^./, (c) => c.toUpperCase())))];
  const reaction = /\bteste de reação\b/iu.test(description);

  return {
    costs,
    damage,
    tests,
    difficulties,
    ranges,
    frequency,
    reaction,
    hope: /\bEsperança\b/iu.test(description),
    fear: /\bMedo\b/iu.test(description),
  };
}

function makeEntry({ key, data, type, category, source = "core", parent = null, tier = null, art = null, artSource = null, artLicense = null, level = null, domain = null, recallCost = null }) {
  const description = cleanText(data.description || "");
  const entry = {
    id: source + "-" + type + "-" + slug(key),
    sourceId: key,
    name: cleanText(data.name || key),
    originalName: key,
    type,
    category,
    source,
    parent,
    description,
    mechanics: extractMechanics(description),
    art,
  };
  if (tier) entry.tier = tier;
  if (level !== null && level !== undefined) entry.level = Number(level);
  if (domain) entry.domain = domain;
  if (recallCost !== null && recallCost !== undefined) entry.recallCost = Number(recallCost);
  if (artSource) entry.artSource = artSource;
  if (artLicense) entry.artLicense = artLicense;
  return entry;
}

function loadEntries(file) {
  const data = readJson(path.join(compendiumRoot, file));
  return Object.entries(data.entries || {});
}

const foundryborneManifest = fs.existsSync(foundryborneManifestPath)
  ? readJson(foundryborneManifestPath)
  : { entries: [] };
const foundryborneDomainArt = new Map();
for (const entry of foundryborneManifest.entries || []) {
  if (entry.type !== "domainCard") continue;
  const normalizedName = normalizeSourceArtName(entry.name);
  if (!normalizedName || entry.normalizedName !== normalizedName) {
    throw new Error(`Invalid Foundryborne art manifest entry: ${entry.name || "<unnamed>"}`);
  }
  foundryborneDomainArt.set(normalizedName, entry);
}

function domainArtFor(key) {
  return foundryborneDomainArt.get(normalizeSourceArtName(key)) || null;
}

const foundryborneDomainMetadata = new Map();
if (fs.existsSync(foundryborneDomainRoot)) {
  for (const file of fs.readdirSync(foundryborneDomainRoot)) {
    if (!file.endsWith(".json")) continue;
    const source = readJson(path.join(foundryborneDomainRoot, file));
    if (source?.type !== "domainCard" || !source?.name) continue;
    foundryborneDomainMetadata.set(normalizeSourceArtName(source.name), {
      level: Number(source.system?.level) || 1,
      domain: source.system?.domain ? String(source.system.domain) : null,
      recallCost: Number.isFinite(Number(source.system?.recallCost)) ? Number(source.system.recallCost) : null,
    });
  }
}

function domainMetadataFor(key) {
  return foundryborneDomainMetadata.get(normalizeSourceArtName(key)) || null;
}

if (!fs.existsSync(foundryborneSubclassManifestPath)) {
  throw new Error(`Missing subclass metadata manifest: ${foundryborneSubclassManifestPath}. Run npm run sync:foundryborne-subclasses.`);
}
const foundryborneSubclassManifest = readJson(foundryborneSubclassManifestPath);
const subclassFeatureMetadata = new Map();
for (const entry of foundryborneSubclassManifest.entries || []) {
  if (entry.type !== "subclassFeature") continue;
  if (!entry.normalizedName || entry.normalizedName !== normalizeSourceArtName(entry.name)) {
    throw new Error(`Invalid Foundryborne subclass manifest feature: ${entry.name || "<unnamed>"}`);
  }
  if (!entry.normalizedParent || entry.normalizedParent !== normalizeSourceArtName(entry.parent)) {
    throw new Error(`Invalid Foundryborne subclass manifest parent: ${entry.parent || "<unnamed>"}`);
  }
  if (!["foundation", "specialization", "mastery"].includes(entry.tier)) {
    throw new Error(`Invalid Foundryborne subclass tier for ${entry.name}: ${entry.tier || "<missing>"}`);
  }
  const list = subclassFeatureMetadata.get(entry.normalizedName) || [];
  list.push(entry);
  subclassFeatureMetadata.set(entry.normalizedName, list);
}

const subclassFeatureAliases = new Map([
  [normalizeSourceArtName("Elemental Origin"), normalizeSourceArtName("Elementalist")],
]);
const coreSubclassByNormalizedName = new Map(
  [...CORE_SUBCLASSES].map((name) => [normalizeSourceArtName(name), name]),
);
const expansionSubclassByNormalizedName = new Map(
  Object.keys(EXPANSION_SUBCLASS_PARENT).map((name) => [normalizeSourceArtName(name), name]),
);
const subclassParentAliases = new Map([
  [normalizeSourceArtName("Elemental Origin"), "Elementalist"],
]);
const legacyExpansionSubclassTiers = new Map(Object.entries({
  // Blood Hunter · The Void v1.5
  "Chasing Death": "foundation",
  "Shadowed Grit": "foundation",
  Veilwalker: "specialization",
  "Spectral Form": "mastery",
  Mutagens: "foundation",
  "Improved Mutagens": "specialization",
  "Volatile Toxins": "specialization",
  "Mastered Mutagens": "mastery",
  Werewolf: "foundation",
  "Control the Beast": "foundation",
  "Feral Hide": "specialization",
  "Lycan Regeneration": "specialization",
  "Master the Beast": "mastery",
  // Warlock · The Void v1.5 names retained by the PT-BR translation.
  "Deadly Devotion": "foundation",
  "Draining Invocation": "specialization",
  "Favored Weapon": "foundation",
  "Herald of Death": "foundation",
  "Divine Ire": "mastery",
}).map(([name, tier]) => [normalizeSourceArtName(name), tier]));

function localSubclassSourceId(parent) {
  const normalized = normalizeSourceArtName(parent);
  return subclassParentAliases.get(normalized)
    || coreSubclassByNormalizedName.get(normalized)
    || expansionSubclassByNormalizedName.get(normalized)
    || parent;
}

function subclassFeatureMetaFor(key, expectedParent = null) {
  const rawNormalized = normalizeSourceArtName(key);
  const normalized = subclassFeatureAliases.get(rawNormalized) || rawNormalized;
  const candidates = subclassFeatureMetadata.get(normalized) || [];
  if (!expectedParent) return candidates.length === 1 ? candidates[0] : null;
  const expected = normalizeSourceArtName(expectedParent);
  return candidates.find((entry) => entry.normalizedParent === expected) || null;
}

const entries = [];

let currentCoreAncestry = null;
for (const [key, data] of loadEntries("daggerheart.ancestries.json")) {
  const isAncestry = CORE_ANCESTRIES.has(key);
  if (isAncestry) currentCoreAncestry = key;
  entries.push(makeEntry({
    key,
    data,
    type: isAncestry ? "ancestry" : "ancestryFeature",
    category: "ancestries",
    parent: isAncestry ? null : currentCoreAncestry,
    art: ancestryArtFor(data, key, isAncestry),
  }));
}
for (const [key, data] of loadEntries("daggerheart-expansion-content.ancestries.json")) {
  const isAncestry = EXPANSION_ANCESTRIES.has(key);
  entries.push(makeEntry({
    key,
    data,
    type: isAncestry ? "ancestry" : "ancestryFeature",
    category: "ancestries",
    source: "expansion",
    parent: isAncestry ? null : EXPANSION_ANCESTRY_FEATURE_PARENT[key] || null,
    art: ancestryArtFor(data, key, isAncestry),
  }));
}
for (const [key, data] of loadEntries("daggerheart.communities.json")) {
  const isCommunity = CORE_COMMUNITIES.has(key);
  entries.push(makeEntry({
    key,
    data,
    type: isCommunity ? "community" : "communityFeature",
    category: "communities",
    parent: isCommunity ? null : COMMUNITY_FEATURE_PARENT[key] || null,
    art: communityArtFor(data, key, isCommunity),
  }));
}
for (const [key, data] of loadEntries("daggerheart-expansion-content.communities.json")) {
  const isCommunity = EXPANSION_COMMUNITIES.has(key);
  entries.push(makeEntry({
    key,
    data,
    type: isCommunity ? "community" : "communityFeature",
    category: "communities",
    source: "expansion",
    parent: isCommunity ? null : COMMUNITY_FEATURE_PARENT[key] || null,
    art: communityArtFor(data, key, isCommunity),
  }));
}
for (const [key, data] of loadEntries("daggerheart.classes.json")) {
  if (!CLASS_ITEMS.has(key)) {
    const isClass = CORE_CLASSES.has(key);
    entries.push(makeEntry({
      key,
      data,
      type: isClass ? "class" : "classFeature",
      category: "classes",
      parent: isClass ? null : CLASS_FEATURE_PARENT[key] || null,
      art: isClass ? classArtFor(key) : classFeatureArtFor(data, key),
    }));
  }
}
const expansionClassSourceEntries = loadEntries("daggerheart-expansion-content.classes.json");
const expansionClassSourceKeys = new Set(expansionClassSourceEntries.map(([key]) => key));
for (const [key, rawData] of expansionClassSourceEntries) {
  if (!key.trim() || CLASS_ITEMS.has(key)) continue;
  const isClass = EXPANSION_CLASSES.has(key);
  const subclassParent = EXPANSION_SUBCLASS_FEATURE_PARENT[key];
  const subclassMeta = subclassParent ? subclassFeatureMetaFor(key, subclassParent) : null;
  const legacySubclassTier = subclassParent
    ? legacyExpansionSubclassTiers.get(normalizeSourceArtName(key)) || null
    : null;
  const data = {
    ...rawData,
    description: rawData.description || EXPANSION_CLASS_DESCRIPTION_FALLBACK[key] || "",
  };
  entries.push(makeEntry({
    key,
    data,
    type: isClass ? "class" : subclassParent ? "subclassFeature" : "classFeature",
    category: subclassParent ? "subclasses" : "classes",
    source: "expansion",
    parent: isClass ? null : subclassParent || EXPANSION_CLASS_FEATURE_PARENT[key] || null,
    tier: subclassMeta?.tier || legacySubclassTier,
    art: isClass ? classArtFor(key) : subclassParent ? subclassArtFor(data, key, false) : classFeatureArtFor(data, key),
  }));
}
for (const fallback of EXPANSION_FALLBACK_CLASS_FEATURES) {
  if (expansionClassSourceKeys.has(fallback.key)) continue;
  entries.push(makeEntry({
    key: fallback.key,
    data: { name: fallback.name, description: fallback.description },
    type: "classFeature",
    category: "classes",
    source: "srd2",
    parent: fallback.parent,
    art: classFeatureArtFor(fallback, fallback.key),
  }));
}
for (const [key, data] of loadEntries("daggerheart.subclasses.json")) {
  const isSubclass = CORE_SUBCLASSES.has(key);
  const subclassMeta = isSubclass ? null : subclassFeatureMetaFor(key);
  if (!isSubclass && !subclassMeta) throw new Error(`Missing subclass metadata for core feature ${key}.`);
  const subclassParent = subclassMeta ? localSubclassSourceId(subclassMeta.parent) : null;
  if (subclassParent && !CORE_SUBCLASSES.has(subclassParent)) {
    throw new Error(`Core subclass feature ${key} resolved to unknown parent ${subclassParent}.`);
  }
  entries.push(makeEntry({
    key,
    data,
    type: isSubclass ? "subclass" : "subclassFeature",
    category: "subclasses",
    parent: isSubclass ? SUBCLASS_CLASS_PARENT[key] || null : subclassParent,
    tier: subclassMeta?.tier || null,
    art: subclassArtFor(data, key, isSubclass),
  }));
}
for (const [key, rawData] of loadEntries("daggerheart-expansion-content.subclasses.json")) {
  if (!key.trim()) continue;
  const data = {
    ...rawData,
    description: rawData.description || EXPANSION_SUBCLASS_DESCRIPTION_FALLBACK[key] || "",
  };
  entries.push(makeEntry({
    key,
    data,
    type: "subclass",
    category: "subclasses",
    source: "expansion",
    parent: EXPANSION_SUBCLASS_PARENT[key] || null,
    art: subclassArtFor(data, key, true),
  }));
}
for (const feature of expansionSubclassSupplement.entries) {
  const metadata = subclassFeatureMetaFor(feature.sourceId, feature.parent);
  const parent = entries.find((entry) => entry.type === "subclass" && entry.sourceId === feature.parent);
  if (!metadata || metadata.tier !== feature.tier || !parent || !feature.description?.trim()) {
    throw new Error(`Invalid supplemental subclass feature: ${feature.parent} / ${feature.sourceId}`);
  }
  const existing = entries.find((entry) =>
    entry.type === "subclassFeature"
      && entry.sourceId === feature.sourceId
      && entry.parent === feature.parent,
  );
  if (existing) continue;
  entries.push(makeEntry({
    key: feature.sourceId,
    data: feature,
    type: "subclassFeature",
    category: "subclasses",
    source: "srd2",
    parent: feature.parent,
    tier: metadata.tier,
    art: subclassArtFor(feature, feature.sourceId, false) || parent.art,
  }));
}

for (const [key, data] of loadEntries("daggerheart.domains.json")) {
  const sourceArt = domainArtFor(key);
  const metadata = domainMetadataFor(key);
  entries.push(makeEntry({
    key,
    data,
    type: "domainCard",
    category: "domains",
    art: sourceArt?.art || null,
    artSource: sourceArt?.artSource || null,
    artLicense: sourceArt?.artLicense || null,
    level: metadata?.level,
    domain: metadata?.domain,
    recallCost: metadata?.recallCost,
  }));
}
for (const [key, data] of loadEntries("daggerheart-expansion-content.domains.json")) {
  if (key.trim()) {
    const sourceArt = domainArtFor(key);
    const metadata = domainMetadataFor(key);
    entries.push(makeEntry({
      key,
      data,
      type: "domainCard",
      category: "domains",
      source: "expansion",
      art: sourceArt?.art || null,
      artSource: sourceArt?.artSource || null,
      artLicense: sourceArt?.artLicense || null,
      level: metadata?.level,
      domain: metadata?.domain,
      recallCost: metadata?.recallCost,
    }));
  }
}

for (const [file, type] of [
  ["daggerheart.weapons.json", "weapon"],
  ["daggerheart.armors.json", "armor"],
  ["daggerheart.consumables.json", "consumable"],
  ["daggerheart.loot.json", "loot"],
]) {
  for (const [key, data] of loadEntries(file)) {
    entries.push(makeEntry({ key, data, type, category: "equipment" }));
  }
}

const voidContent = readJson(voidPtBrPath);
for (const metadata of voidContent.domainMetadata || []) {
  const existing = entries.find((entry) => entry.type === "domainCard" && entry.sourceId === metadata.sourceId);
  if (!existing) continue;
  existing.domain = metadata.domain;
  existing.level = Number(metadata.level);
  existing.recallCost = Number(metadata.recallCost);
}
const voidReplacedSourceIds = new Set([
  "Order of the Ghost Slayer",
  "Chasing Death",
  "Shadowed Grit",
  "Veilwalker",
  "Spectral Form",
  "Werewolf",
  "Control the Beast",
  "Feral Hide",
  "Lycan Regeneration",
  "Master the Beast",
  "Vitality Manipulation",
  "Burning Blood",
  "Mutual Suffering",
  "Life Leash",
  "Runic Adrenaline",
  "Bloodbath",
  "Glyph of Hermorrhaging",
  "Crimson Adamance",
]);
for (let index = entries.length - 1; index >= 0; index -= 1) {
  if (voidReplacedSourceIds.has(entries[index].sourceId)) entries.splice(index, 1);
}
for (const item of voidContent.entries || []) {
  const key = item.sourceId || item.name;
  entries.push(makeEntry({
    key,
    data: { name: item.name, description: item.description || "" },
    type: item.type,
    category: item.category,
    source: "void-unofficial",
    parent: item.parent || null,
    tier: item.tier || null,
    art: item.art || (item.type === "class" ? classArtFor(key) : item.type === "classFeature" ? classFeatureArtFor(item, key) : item.type === "subclass" || item.type === "subclassFeature" ? subclassArtFor(item, key, item.type === "subclass") : null),
    level: item.level,
    domain: item.domain,
    recallCost: item.recallCost,
  }));
}

// Apply after the Void replacements so every Blood card shares the local icon.
// Keep project artwork outside the directory regenerated by the Foundryborne sync.
for (const entry of entries) {
  if (entry.type !== "domainCard" || normalizeSourceArtName(entry.domain) !== "blood") continue;
  entry.art = "/compendium/daggerheart/domains/blood.png";
  delete entry.artSource;
  delete entry.artLicense;
}

const beastformArtSlugs = new Map([
  ["Agile Scout", "explorador-agil"],
  ["Aquatic Scout", "explorador-aquatico"],
  ["Household Friend", "animal-domestico"],
  ["Nimble Grazer", "ruminante-arisco"],
  ["Pack Predator", "predador-de-bando"],
  ["Stalking Arachnid", "aracnideo-espreitador"],
  ["Armored Sentry", "carapaca-vigilante"],
  ["Mighty Strider", "trotador-robusto"],
  ["Pouncing Predator", "predador-furtivo"],
  ["Powerful Beast", "fera-poderosa"],
  ["Striking Serpent", "serpente-traicoeira"],
  ["Winged Beast", "fera-alada"],
  ["Aquatic Predator", "predador-aquatico"],
  ["Great Predator", "grande-predador"],
  ["Great Winged Beast", "grande-fera-alada"],
  ["Legendary Beast", "fera-lendaria"],
  ["Legendary Hybrid", "hibrido-lendario"],
  ["Mighty Lizard", "lagarto-poderoso"],
  ["Epic Aquatic Beast", "fera-aquatica-epica"],
  ["Massive Behemoth", "gigante-massiva"],
  ["Mythic Aerial Hunter", "cacador-aereo-mitico"],
  ["Mythic Beast", "fera-mitica"],
  ["Mythic Hybrid", "hibrido-mitico"],
  ["Terrible Lizard", "lagarto-terrivel"],
]);
const beastformManifest = readJson(path.join(root, "lib", "compendium", "beastforms.manifest.json"));
const beastformTranslations = new Map(loadEntries("daggerheart.beastforms.json"));
const beastformTerms = {
  agility: "Agilidade", strength: "Força", finesse: "Finesse", instinct: "Instinto", presence: "Presença", knowledge: "Conhecimento",
  Deceive: "enganar", Locate: "localizar", Sneak: "esgueirar-se", Navigate: "navegar", Swim: "nadar", Climb: "escalar", Protect: "proteger", Leap: "saltar", Sprint: "correr", Attack: "atacar", Track: "rastrear", Dig: "cavar", Scare: "assustar", Distract: "distrair",
  melee: "Corpo-a-Corpo", veryClose: "Muito Próximo", close: "Próximo", far: "Distante", veryFar: "Muito Distante",
};
const signed = (n) => n >= 0 ? `+${n}` : String(n);
for (const form of beastformManifest.forms) {
  const translated = beastformTranslations.get(form.name);
  if (!translated) throw new Error(`Missing beastform translation: ${form.name}`);
  const paragraphs = [`Patamar ${form.tier}`, `Exemplos: ${translated.examples}`];
  if (form.kind === "evolved") {
    const e = form.evolved;
    paragraphs.push(`Escolha uma forma de até o patamar ${e.maximumTier}. Mantenha suas vantagens e habilidades e acrescente os seguintes bônus aos da forma escolhida: atributo de ataque ${signed(e.mainTraitBonus)}, Evasão ${signed(e.evasionBonus)} e dano ${signed(e.damageBonus)}.${e.increaseDamageDice ? " Aumente o dado de dano em um passo." : ""}`);
  } else {
    for (const change of form.changes) {
      if (change.key?.startsWith("system.traits.")) {
        const trait = change.key.split(".")[2];
        paragraphs.push(`${beastformTerms[trait] || trait} ${signed(change.value)}`);
      } else if (change.key === "system.evasion") {
        paragraphs.push(`Evasão ${signed(change.value)}`);
      } else if (change.type === "standardAttack") {
        const a = change.value;
        paragraphs.push(`Ataque: ${beastformTerms[a.trait] || a.trait} · ${beastformTerms[a.attackRange] || a.attackRange} · ${a.damageFormula.replace(/@prof/g, "")} de dano físico usando sua Proficiência.`);
      }
    }
    if (form.kind === "hybrid") {
      const h = form.hybrid;
      paragraphs.push(`Combine ${h.beastformOptions} formas de até o patamar ${h.maximumTier}. Escolha um total de ${h.advantages} vantagens e ${h.features} habilidades dessas formas.`);
    }
  }
  if (form.advantages.length) paragraphs.push(`Vantagem em testes para: ${form.advantages.map((v) => beastformTerms[v] || v).join(", ")}.`);
  for (const name of form.features) {
    const feature = beastformTranslations.get(name);
    if (!feature?.description) throw new Error(`Missing beastform feature translation: ${name}`);
    // Foundry inline-roll labels duplicate the formula; render only the label.
    const description = name === "Carrier" && form.carrierCapacity
      ? `Você pode carregar até ${form.carrierCapacity} aliados voluntários com você enquanto se movimenta.`
      : feature.description.replace(/\[\[[^\]]+\]\]\{([^}]+)\}/g, "$1");
    paragraphs.push(`${feature.name}: ${cleanText(description)}`);
  }
  const entry = makeEntry({ key: form.name, data: { name: translated.name, description: paragraphs.join("\n\n") }, type: "beastform", category: "beastforms", source: "srd", parent: "Beastform" });
  const artSlug = beastformArtSlugs.get(form.name);
  if (!artSlug) throw new Error(`Missing beastform artwork mapping: ${form.name}`);
  entry.art = `/compendium/daggerheart/beastforms/${artSlug}.webp`;
  entry.beastformTier = form.tier;
  entries.push(entry);
}

const portraitDir = path.join(artRoot, "adversaries", "portraits");
const portraitFiles = fs.existsSync(portraitDir) ? fs.readdirSync(portraitDir).filter((file) => file.toLowerCase().endsWith(".webp")) : [];
const portraitMap = new Map(portraitFiles.map((file) => [
  path.parse(file).name.toLocaleLowerCase("en").replace(/:/g, "").replace(/\s+/g, " ").trim(),
  file,
]));

for (const [key, data] of loadEntries("daggerheart.adversaries.json")) {
  const normalizedKey = key.toLocaleLowerCase("en").replace(/:/g, "").replace(/\s+/g, " ").trim();
  const file = portraitMap.get(normalizedKey);
  const item = makeEntry({
    key,
    data,
    type: "adversary",
    category: "adversaries",
    art: file ? "/compendium/daggerheart/adversaries/" + encodeURIComponent(file) : null,
  });
  item.motivesAndTactics = cleanText(data.motivesAndTactics || "");
  entries.push(item);
}

const lang = readJson(langPath);
const config = (lang.DAGGERHEART && lang.DAGGERHEART.CONFIG) || {};
const emptyMechanics = () => ({
  costs: [],
  damage: [],
  tests: [],
  difficulties: [],
  ranges: [],
  frequency: [],
  reaction: false,
  hope: false,
  fear: false,
});

const rules = [
  {
    id: "rule-action-rolls",
    name: "Testes de Ação e Dados de Dualidade",
    category: "rules",
    type: "rule",
    source: "srd",
    description: "Quando uma ação arriscada ou incerta exige um teste, role dois d12 distintos: o Dado de Esperança e o Dado de Medo. Some os resultados e os modificadores aplicáveis e compare o total à Dificuldade. Se o total igualar ou superar a Dificuldade, a ação tem sucesso; caso contrário, falha. O dado mais alto determina se o resultado vem com Esperança ou com Medo.",
    mechanics: { ...emptyMechanics(), tests: ["Teste de Ação"], hope: true, fear: true },
  },
  {
    id: "rule-roll-results",
    name: "Esperança, Medo e Sucesso Crítico",
    category: "rules",
    type: "rule",
    source: "srd",
    description: "Em um resultado com Esperança, o jogador recebe 1 Esperança. Em um resultado com Medo, o Mestre recebe 1 Medo e pode introduzir custo ou complicação conforme o resultado. Se os dois Dados de Dualidade mostrarem o mesmo valor, é um Sucesso Crítico: a ação tem sucesso automaticamente, o personagem recebe 1 Esperança e limpa 1 Fadiga. Em ataques, um crítico também causa dano crítico.",
    mechanics: { ...emptyMechanics(), hope: true, fear: true },
  },
  {
    id: "rule-reaction-rolls",
    name: "Testes de Reação",
    category: "rules",
    type: "rule",
    source: "srd",
    description: "Testes de Reação funcionam de forma semelhante aos testes de ação, mas não geram Esperança, Medo nem movimentos adicionais do Mestre. Eles são usados quando o personagem reage a um perigo ou efeito que especifica esse tipo de teste.",
    mechanics: { ...emptyMechanics(), tests: ["Teste de Reação"], reaction: true },
  },
  {
    id: "rule-damage",
    name: "Dano e Limiares",
    category: "rules",
    type: "rule",
    source: "srd",
    description: "Depois de acertar um ataque, role os dados de dano da arma em quantidade igual à sua Proficiência e some os modificadores aplicáveis. Compare o total aos limiares de dano do alvo para determinar quantos Pontos de Vida são marcados. Em um ataque com Sucesso Crítico, some primeiro o valor máximo possível dos dados de dano da arma e depois faça a rolagem normal.",
    mechanics: { ...emptyMechanics(), tests: ["Teste de Ataque"] },
  },
  {
    id: "rule-armor",
    name: "Armadura",
    category: "rules",
    type: "rule",
    source: "srd",
    description: "Sua Pontuação de Armadura indica quantos Espaços de Armadura estão disponíveis. Ao sofrer dano, você pode marcar 1 Espaço de Armadura para reduzir a gravidade do dano em um limiar. Apenas 1 Espaço de Armadura pode ser marcado por ataque recebido, salvo quando uma regra disser o contrário.",
    mechanics: { ...emptyMechanics(), costs: [{ resource: "Armadura", amount: 1, label: "1 Armadura" }] },
  },
  {
    id: "rule-stress",
    name: "Fadiga",
    category: "rules",
    type: "rule",
    source: "srd",
    description: "Fadiga representa pressão física, emocional ou mágica. Características e consequências podem mandar marcar Fadiga; descansos e habilidades podem limpá-la. O número de espaços disponíveis é definido pela ficha e por características do personagem.",
    mechanics: emptyMechanics(),
  },
];

for (const [key, value] of Object.entries(config.Traits || {})) {
  rules.push({
    id: "rule-trait-" + key,
    name: value.name,
    category: "rules",
    type: "trait",
    source: "translation",
    description: Object.values(value.verb || {}).join(" · "),
    mechanics: { ...emptyMechanics(), tests: ["Teste de " + value.name] },
  });
}
for (const [key, value] of Object.entries(config.Range || {})) {
  rules.push({
    id: "rule-range-" + key,
    name: "Alcance: " + value.name,
    category: "rules",
    type: "range",
    source: "translation",
    description: cleanText(value.description),
    mechanics: { ...emptyMechanics(), ranges: [value.name] },
  });
}
for (const [key, value] of Object.entries(config.Condition || {})) {
  if (["dead", "defeated"].includes(key)) continue;
  rules.push({
    id: "rule-condition-" + key,
    name: "Condição: " + value.name,
    category: "rules",
    type: "condition",
    source: "translation",
    description: cleanText(value.description),
    mechanics: emptyMechanics(),
  });
}
for (const [key, value] of Object.entries(config.DeathMoves || {})) {
  const description = cleanText(value.description);
  rules.push({
    id: "rule-death-" + key,
    name: "Morte: " + value.name,
    category: "rules",
    type: "deathMove",
    source: "translation",
    description,
    mechanics: extractMechanics(description),
  });
}

entries.unshift(...rules);

const transformationTranslations = new Map(loadEntries("daggerheart-expansion-content.transformations.json"));
const transformationFamilies = [
  ["Werewolf", "Lobisomem", "werewolf", ["Wolf Form", "Frenzy"]],
  ["Vampire", "Vampiro", "vampire", ["Fangs", "Feed"]],
  ["Ghost", "Fantasma", "ghost", ["Spirit Form", "Ephemeral"]],
  ["Reanimated", "Reanimado", "reanimated", ["Corpse", "Stitch Up"]],
  ["Shapeshifter", "Metamorfo", "shapeshifter", ["Change Shape", "Only Skin Deep"]],
  ["Demigod", "Semi-Deus", "demigod", ["Ichor of the Gods", "Weight of Divinity"]],
];
for (const [key, name, transformationKey, features] of transformationFamilies) {
  const descriptions = features.map(feature => {
    const data = transformationTranslations.get(feature);
    if (!data?.description) throw new Error(`Missing expansion transformation feature: ${feature}`);
    const entry = makeEntry({ key: feature, data, type: "transformationFeature", category: "transformations", source: "expansion", parent: key });
    entry.transformationKey = transformationKey;
    entry.art = `/compendium/daggerheart/transformations/${transformationKey}.webp`;
    entries.push(entry);
    return `${cleanText(data.name)}\n${cleanText(data.description)}`;
  });
  const parent = makeEntry({ key, data: { name, description: descriptions.join("\n\n") }, type: "transformation", category: "transformations", source: "expansion" });
  parent.transformationKey = transformationKey;
  parent.art = `/compendium/daggerheart/transformations/${transformationKey}.webp`;
  entries.push(parent);
}

const categories = [
  { id: "rules", name: "Regras", icon: "◇", description: "Mecânicas essenciais e referência rápida" },
  { id: "classes", name: "Classes", icon: "✦", description: "Classes e características de classe" },
  { id: "ancestries", name: "Ancestralidades", icon: "◐", description: "Ancestralidades e características" },
  { id: "communities", name: "Comunidades", icon: "⌂", description: "Origens culturais e características" },
  { id: "subclasses", name: "Subclasses", icon: "△", description: "Caminhos e características de subclasse" },
  { id: "beastforms", name: "Formas de Fera", icon: "♧", description: "Formas do Druida, atributos, ataques e habilidades por patamar" },
  { id: "transformations", name: "Transformações", icon: "◭", description: "Lobisomem, Vampiro, Fantasma, Reanimado, Metamorfo e Semi-Deus da expansão" },
  { id: "domains", name: "Domínios", icon: "◈", description: "Cartas, feitiços e habilidades de domínio" },
  { id: "equipment", name: "Equipamentos", icon: "⚔", description: "Armas, armaduras, consumíveis e itens de saque" },
  { id: "adversaries", name: "Adversários", icon: "♜", description: "Criaturas e oponentes para o Mestre" },
];

const featureParentTypes = {
  transformationFeature: "transformation",
  classFeature: "class",
  ancestryFeature: "ancestry",
  communityFeature: "community",
  subclassFeature: "subclass",
};
const equipmentManifest = readJson(path.join(root, "lib", "compendium", "equipment.manifest.json"));
const equipmentMetadata = new Map(equipmentManifest.entries.map((item) => [item.type + ":" + item.normalizedName, item]));
const equipmentArtManifest = readJson(path.join(root, "lib", "compendium", "equipment-art.manifest.json"));
const equipmentArtwork = new Map(equipmentArtManifest.entries.map((item) => [item.id, item]));
for (const entry of entries.filter((item) => item.category === "equipment")) {
  const metadata = equipmentMetadata.get(entry.type + ":" + normalizeSourceArtName(entry.sourceId));
  if (!metadata || !["common", "uncommon", "rare", "very-rare"].includes(metadata.rarity)) throw new Error(`Missing equipment rarity for ${entry.sourceId}. Run npm run sync:foundryborne-equipment.`);
  for (const field of ["rarity", "equipmentTier", "weaponSlot", "hands", "equipmentDetail", "creationRestricted"]) {
    if (metadata[field] !== undefined) entry[field] = metadata[field];
  }
  const artwork = equipmentArtwork.get(entry.id);
  if (!artwork || artwork.type !== entry.type || artwork.sourceId !== entry.sourceId
    || !fs.existsSync(path.join(root, "public", artwork.art))) {
    throw new Error(`Missing equipment artwork for ${entry.id}.`);
  }
  entry.art = artwork.art;
}
const seenEntryIds = new Set();
for (const entry of entries) {
  if (seenEntryIds.has(entry.id)) throw new Error(`Duplicate compendium entry: ${entry.id}`);
  seenEntryIds.add(entry.id);
  const parentType = featureParentTypes[entry.type];
  if (parentType && !entries.some((parent) => parent.type === parentType && parent.sourceId === entry.parent)) {
    throw new Error(`Unresolved parent for ${entry.type} ${entry.sourceId}: ${entry.parent}`);
  }
  if (entry.type === "domainCard" && (!entry.domain || !Number.isInteger(entry.level) || entry.level < 1 || entry.level > 10)) {
    throw new Error(`Invalid domain metadata for ${entry.sourceId}`);
  }
}
for (const parent of entries.filter((entry) => ["class", "ancestry", "community", "subclass"].includes(entry.type))) {
  const children = entries.filter((entry) => entry.type === parent.type + "Feature" && entry.parent === parent.sourceId);
  if (!children.length) throw new Error(`Missing features for ${parent.type} ${parent.sourceId}`);
  if (parent.type === "ancestry" && children.length !== 2) throw new Error(`Expected two ancestry features for ${parent.sourceId}`);
  if (parent.type === "community" && children.length !== 1) throw new Error(`Expected one community feature for ${parent.sourceId}`);
  if (parent.type === "subclass") {
    for (const tier of ["foundation", "specialization", "mastery"]) {
      if (!children.some((entry) => entry.tier === tier)) {
        throw new Error(`Missing ${tier} card for subclass ${parent.sourceId}`);
      }
    }
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  sources: {
    translation: "https://github.com/etiagoabreu/daggerheart-translation-pt-BR",
    art: "https://github.com/mordachai/art-for-daggerheart",
    foundryborne: FOUNDRYBORNE_SOURCE_URL,
    srd: "https://www.daggerheart.com/srd/",
    expansionSubclassSupplement: expansionSubclassSupplement.source.url,
    voidUnofficial: voidContent.source,
  },
  categories,
  entries: entries.map(applySessionRestRule),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

if (fs.existsSync(portraitDir)) {
  fs.mkdirSync(artOutputRoot, { recursive: true });
  for (const file of portraitFiles) {
    fs.copyFileSync(path.join(portraitDir, file), path.join(artOutputRoot, file));
  }
}

const counts = Object.fromEntries(categories.map((category) => [
  category.id,
  entries.filter((item) => item.category === category.id).length,
]));
console.log(JSON.stringify({ outputPath, artOutputRoot, entries: entries.length, counts }, null, 2));
