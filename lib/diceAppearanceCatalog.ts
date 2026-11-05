import {
  DEFAULT_DICE_APPEARANCES,
  type DiceAppearance,
  type DiceAppearanceOverrides,
  type DiceAppearanceRole,
  type DiceAppearanceSettings,
  type DiceFacePreset,
  type DiceMaterial,
  type DiceSurface,
} from "./dice";

export type DiceCatalogOption<T extends string> = {
  id: T;
  label: string;
  description: string;
};

export type DiceTextureOption = DiceCatalogOption<string> & {
  materialHint?: DiceMaterial;
  previewAsset?: string;
};

export type DiceFontOption = DiceCatalogOption<string> & {
  cssFamily: string;
  engineSupported: true;
  engineFont: DiceEngineFont;
};

export type DiceMaterialOption = DiceCatalogOption<DiceMaterial>;

export type DiceFacePresetOption = DiceCatalogOption<DiceFacePreset> & {
  compatibleWith: readonly string[];
  preview: string;
};

export type DiceSurfaceOption = DiceCatalogOption<DiceSurface> & {
  surfaceKind: "felt" | "wood" | "metal";
};

export type DiceAppearancePatch = Partial<Omit<DiceAppearance, "name">>;

export type DiceThemePreset = {
  id: string;
  label: string;
  description: string;
  fontId: DiceFontId;
  appearance: DiceAppearancePatch;
  roleOverrides?: Partial<Record<DiceAppearanceRole, DiceAppearancePatch>>;
};

export type DiceEngineFont = "Georgia" | "Times New Roman" | "Arial" | "Trebuchet MS" | "monospace";

export const DICE_ENGINE_SUPPORTS_CUSTOM_NUMBER_FONT = true;

export const DICE_TEXTURES = [
  {
    id: "edgerunners",
    label: "Edgerunners",
    description: "Faces originais amarelas e verdes do pacote Edgerunners, do d2 ao d20 e percentuais.",
    materialHint: "plastic",
    previewAsset: "/cyberpunk/dice/d6-6.webp",
  },
  { id: "none", label: "Sem textura", description: "Cor sólida, sem textura aplicada." },
  { id: "cloudy", label: "Nuvens translúcidas", description: "Nuvens suaves com recorte translúcido." },
  { id: "cloudy_2", label: "Nuvens", description: "Nuvens mescladas sobre a cor do dado." },
  { id: "fire", label: "Fogo", description: "Chamas sobre a superfície.", materialHint: "metal" },
  { id: "marble", label: "Mármore", description: "Veios de mármore polido.", materialHint: "glass" },
  { id: "water", label: "Água", description: "Textura aquática translúcida.", materialHint: "glass" },
  { id: "ice", label: "Gelo", description: "Superfície gelada translúcida.", materialHint: "glass" },
  { id: "paper", label: "Papel", description: "Fibra de papel com relevo sutil.", materialHint: "wood" },
  { id: "speckles", label: "Salpicado", description: "Pequenos pontos irregulares sobre a cor base." },
  { id: "glitter", label: "Glitter", description: "Brilho granulado sobre a cor base." },
  { id: "glitter_2", label: "Glitter translúcido", description: "Brilho com transparência no material." },
  { id: "stars", label: "Estrelas", description: "Campo de pequenas estrelas." },
  { id: "stainedglass", label: "Vitral", description: "Fragmentos de vitral com relevo.", materialHint: "glass" },
  { id: "wood", label: "Madeira", description: "Veios naturais de madeira.", materialHint: "wood" },
  { id: "metal", label: "Aço", description: "Metal escovado com relevo.", materialHint: "metal" },
  { id: "skulls", label: "Caveiras", description: "Padrão de caveiras sobre a cor base." },
  { id: "leopard", label: "Leopardo", description: "Padrão animal de leopardo.", materialHint: "wood" },
  { id: "tiger", label: "Tigre", description: "Padrão animal de tigre.", materialHint: "wood" },
  { id: "cheetah", label: "Guepardo", description: "Padrão animal de guepardo.", materialHint: "wood" },
  { id: "dragon", label: "Dragão", description: "Escamas de dragão com relevo." },
  { id: "lizard", label: "Lagarto", description: "Escamas finas de réptil." },
  { id: "bird", label: "Penas", description: "Padrão de penas com relevo.", materialHint: "wood" },
  { id: "astral", label: "Mar astral", description: "Nebulosa escura com estrelas." },
  { id: "bronze01", label: "Bronze I", description: "Primeira variação de bronze.", materialHint: "metal" },
  { id: "bronze02", label: "Bronze II", description: "Segunda variação de bronze.", materialHint: "metal" },
  { id: "bronze03", label: "Bronze III", description: "Terceira variação de bronze.", materialHint: "metal" },
  { id: "bronze03a", label: "Bronze III A", description: "Variação clara do bronze III.", materialHint: "metal" },
  { id: "bronze03b", label: "Bronze III B", description: "Variação escura do bronze III.", materialHint: "metal" },
  { id: "bronze04", label: "Bronze IV", description: "Quarta variação de bronze.", materialHint: "metal" },
] as const satisfies readonly DiceTextureOption[];

export type DiceTextureId = (typeof DICE_TEXTURES)[number]["id"];

export const DICE_FONTS = [
  {
    id: "classic-serif",
    label: "Clássica",
    description: "Serifa tradicional para títulos e números na pré-visualização.",
    cssFamily: 'Georgia, "Times New Roman", serif',
    engineSupported: true,
    engineFont: "Georgia",
  },
  {
    id: "book-serif",
    label: "Livro antigo",
    description: "Serifa mais larga, inspirada em livros impressos.",
    cssFamily: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
    engineSupported: true,
    engineFont: "Times New Roman",
  },
  {
    id: "clean-sans",
    label: "Limpa",
    description: "Sans-serif neutra e legível.",
    cssFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    engineSupported: true,
    engineFont: "Arial",
  },
  {
    id: "humanist-sans",
    label: "Humanista",
    description: "Sans-serif arredondada para uma aparência mais suave.",
    cssFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
    engineSupported: true,
    engineFont: "Trebuchet MS",
  },
  {
    id: "mono",
    label: "Monoespaçada",
    description: "Traço técnico e uniforme.",
    cssFamily: 'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace',
    engineSupported: true,
    engineFont: "monospace",
  },
] as const satisfies readonly DiceFontOption[];

export type DiceFontId = (typeof DICE_FONTS)[number]["id"];

const DICE_FONTS_BY_ID = new Map<string, DiceFontOption>(
  DICE_FONTS.map((font) => [font.id, font]),
);

export function getDiceEngineFont(fontId: DiceFontId | string): DiceEngineFont | undefined {
  return DICE_FONTS_BY_ID.get(fontId)?.engineFont;
}

export const DICE_MATERIALS = [
  { id: "none", label: "Neutro", description: "Sem tratamento de material específico." },
  { id: "plastic", label: "Plástico", description: "Acabamento opaco padrão." },
  { id: "perfectmetal", label: "Metal polido", description: "Metal altamente refletivo e com baixa rugosidade." },
  { id: "metal", label: "Metal", description: "Reflexos fortes e aparência metálica." },
  { id: "wood", label: "Madeira", description: "Resposta de luz mais fosca, adequada a texturas orgânicas." },
  { id: "glass", label: "Vidro", description: "Acabamento brilhante e translúcido." },
] as const satisfies readonly DiceMaterialOption[];

export const DICE_MATERIAL_PRESETS = DICE_MATERIALS;

export const DICE_FACE_PRESETS = [
  {
    id: "standard",
    label: "Padrão",
    description: "Faces numéricas tradicionais em todos os dados.",
    compatibleWith: ["d2", "d4", "d6", "d8", "d10", "d12", "d20", "d100"],
    preview: "1 · 6 · 20",
  },
  {
    id: "pips",
    label: "Pontos",
    description: "Substitui as faces numéricas do d6 por pontos clássicos.",
    compatibleWith: ["d6"],
    preview: "⚄",
  },
  {
    id: "poker",
    label: "Pôquer",
    description: "Faces A, 9, 10, J, Q e K no d6, mantendo os valores lógicos de 1 a 6.",
    compatibleWith: ["d6"],
    preview: "A · Q · K",
  },
  {
    id: "spanish-poker",
    label: "Pôquer espanhol",
    description: "Faces A, 7, 8, 9, 10, J, Q e K no d8.",
    compatibleWith: ["d8"],
    preview: "A · 10 · K",
  },
  {
    id: "suits",
    label: "Naipes",
    description: "Usa ♠ ♥ ♦ ♣ nas quatro faces do d4.",
    compatibleWith: ["d4"],
    preview: "♠ ♥ ♦ ♣",
  },
] as const satisfies readonly DiceFacePresetOption[];

export const DICE_SURFACES = [
  { id: "default", label: "Bandeja", description: "Superfície padrão da engine.", surfaceKind: "wood" },
  { id: "blue-felt", label: "Feltro azul", description: "Mesa revestida de feltro azul.", surfaceKind: "felt" },
  { id: "red-felt", label: "Feltro vermelho", description: "Mesa revestida de feltro vermelho.", surfaceKind: "felt" },
  { id: "green-felt", label: "Feltro verde", description: "Mesa revestida de feltro verde.", surfaceKind: "felt" },
  { id: "taverntable", label: "Mesa de taverna", description: "Madeira envelhecida de taverna.", surfaceKind: "wood" },
  { id: "mahogany", label: "Mogno", description: "Madeira escura e polida.", surfaceKind: "wood" },
  { id: "stainless", label: "Aço inox", description: "Superfície metálica de aço.", surfaceKind: "metal" },
  { id: "cyberpunk", label: "Cyberpunk", description: "Superfície metálica com ambiente neon.", surfaceKind: "metal" },
  { id: "cagetown", label: "Cage Town", description: "Superfície de madeira alternativa incluída na engine.", surfaceKind: "wood" },
] as const satisfies readonly DiceSurfaceOption[];

export const DICE_THEME_PRESETS = [
  {
    id: "edgerunners",
    label: "Edgerunners",
    description: "Conjunto original do ZIP, com faces amarelas e símbolos verdes.",
    fontId: "clean-sans",
    appearance: {
      foreground: "#32c92a", background: "#f0dc00", outline: "#32c92a", edge: "#f0dc00",
      texture: "edgerunners", material: "plastic", preset: "standard",
    },
  },
  {
    id: "oracle",
    label: "Oracle",
    description: "Paleta roxa escura usada como aparência base do OracleRPG.",
    fontId: "classic-serif",
    appearance: {
      foreground: "#f5efe1",
      background: "#2d2740",
      outline: "#100d18",
      texture: "none",
      material: "plastic",
      surface: "green-felt",
    },
    roleOverrides: {
      hope: {
        foreground: "#fff6cc",
        background: ["#c98a24", "#e1ad3d", "#f1c85a"],
        outline: "#6d4410",
        material: "glass",
      },
      fear: {
        foreground: "#f8dbe8",
        background: ["#41132e", "#65183f", "#82224f"],
        outline: "#1d0714",
        material: "glass",
      },
    },
  },
  {
    id: "ivory",
    label: "Marfim",
    description: "Dados claros com contraste de tinta escura.",
    fontId: "book-serif",
    appearance: {
      foreground: "#241f1a",
      background: ["#f7f0df", "#e9dcc1", "#fffaf0"],
      outline: "#b7a98b",
      texture: "paper",
      material: "wood",
      surface: "mahogany",
    },
  },
  {
    id: "obsidian",
    label: "Obsidiana",
    description: "Pedra negra com números claros e brilho discreto.",
    fontId: "classic-serif",
    appearance: {
      foreground: "#f5f2eb",
      background: ["#101014", "#22222a", "#08080b"],
      outline: "#000000",
      texture: "speckles",
      material: "glass",
      surface: "stainless",
    },
  },
  {
    id: "astral",
    label: "Astral",
    description: "Nebulosa azul-violeta com textura do Mar Astral.",
    fontId: "clean-sans",
    appearance: {
      foreground: "#f4f1ff",
      background: ["#17153c", "#252968", "#4f4b8b"],
      outline: "#0a0920",
      texture: "astral",
      material: "glass",
      surface: "blue-felt",
    },
    roleOverrides: {
      hope: {
        foreground: "#fff7c2",
        background: ["#5148a8", "#7666d3", "#b195ef"],
      },
      fear: {
        foreground: "#ffd9ec",
        background: ["#25102f", "#471447", "#722154"],
      },
    },
  },
  {
    id: "blood-moon",
    label: "Lua de sangue",
    description: "Vermelho profundo com veios de mármore.",
    fontId: "book-serif",
    appearance: {
      foreground: "#f6d7bd",
      background: ["#3b0808", "#671313", "#8f241a"],
      outline: "#160303",
      texture: "marble",
      material: "glass",
      surface: "red-felt",
    },
    roleOverrides: {
      hope: {
        foreground: "#fff1ba",
        background: ["#7a3512", "#a85e1b", "#d18a2e"],
      },
      fear: {
        foreground: "#ffe0e0",
        background: ["#2b0307", "#510714", "#7b0b1f"],
      },
    },
  },
  {
    id: "frost",
    label: "Geada",
    description: "Azuis frios com textura translúcida de gelo.",
    fontId: "clean-sans",
    appearance: {
      foreground: "#f8fdff",
      background: ["#6aa7c8", "#9bcbe0", "#d4eef8"],
      outline: "#345b70",
      texture: "ice",
      material: "glass",
      surface: "blue-felt",
    },
  },
  {
    id: "ember",
    label: "Brasa",
    description: "Tons quentes com textura de fogo e acabamento metálico.",
    fontId: "humanist-sans",
    appearance: {
      foreground: "#fff0c2",
      background: ["#421208", "#8b2c0b", "#d65a12"],
      outline: "#1c0702",
      texture: "fire",
      material: "metal",
      surface: "mahogany",
    },
  },
  {
    id: "verdant",
    label: "Verdante",
    description: "Verdes naturais com acabamento orgânico.",
    fontId: "book-serif",
    appearance: {
      foreground: "#eff8dc",
      background: ["#17351f", "#285536", "#477447"],
      outline: "#0b1c0e",
      texture: "paper",
      material: "wood",
      surface: "green-felt",
    },
  },
  {
    id: "bronze",
    label: "Bronze",
    description: "Metal envelhecido com variação de bronze.",
    fontId: "classic-serif",
    appearance: {
      foreground: "#ffe0a6",
      background: ["#5a350b", "#764712", "#93611f"],
      outline: "#2b1704",
      texture: "bronze03",
      material: "metal",
      surface: "taverntable",
    },
  },
] as const satisfies readonly DiceThemePreset[];

export type DiceThemePresetId = (typeof DICE_THEME_PRESETS)[number]["id"];

const THEME_PRESETS_BY_ID = new Map<string, DiceThemePreset>(
  DICE_THEME_PRESETS.map((preset) => [preset.id, preset]),
);

type DiceAppearanceSource = DiceAppearanceSettings | DiceAppearanceOverrides;
type DiceThemePresetRef = DiceThemePresetId | DiceThemePreset;

function cloneAppearance(appearance: DiceAppearance): DiceAppearance {
  return {
    ...appearance,
    background: Array.isArray(appearance.background) ? [...appearance.background] : appearance.background,
  };
}

function resolvePreset(preset: DiceThemePresetRef): DiceThemePreset {
  if (typeof preset !== "string") return preset;
  const match = THEME_PRESETS_BY_ID.get(preset);
  if (!match) throw new RangeError(`Unknown dice theme preset: ${preset}`);
  return match;
}

export function getDiceThemePreset(id: string): DiceThemePreset | undefined {
  return THEME_PRESETS_BY_ID.get(id);
}

export function mergedRoleAppearance(
  role: DiceAppearanceRole,
  overrides: Partial<DiceAppearance> = {},
  preset?: DiceThemePresetRef,
): DiceAppearance {
  const selectedPreset = preset ? resolvePreset(preset) : undefined;
  const presetFont = selectedPreset ? getDiceEngineFont(selectedPreset.fontId) : undefined;
  const presetAppearance = selectedPreset
    ? { ...selectedPreset.appearance, ...(selectedPreset.roleOverrides?.[role] ?? {}) }
    : undefined;
  const presetEdge = presetAppearance?.edge ?? presetAppearance?.outline;
  const merged: DiceAppearance = {
    ...DEFAULT_DICE_APPEARANCES[role],
    ...(selectedPreset?.appearance ?? {}),
    ...(selectedPreset?.roleOverrides?.[role] ?? {}),
    ...(presetEdge ? { edge: presetEdge } : {}),
    ...(presetFont ? { font: presetFont } : {}),
    ...overrides,
  };
  return cloneAppearance(merged);
}

export function applyPresetToRole(
  settings: DiceAppearanceSource,
  role: DiceAppearanceRole,
  preset: DiceThemePresetRef,
): DiceAppearanceSettings {
  const selectedPreset = resolvePreset(preset);
  const roles: DiceAppearanceRole[] = ["normal", "hope", "fear"];
  const next = Object.fromEntries(
    roles.map((currentRole) => [
      currentRole,
      mergedRoleAppearance(currentRole, settings[currentRole] ?? {}),
    ]),
  ) as DiceAppearanceSettings;

  const currentName = next[role].name;
  const selectedRoleAppearance = {
    ...selectedPreset.appearance,
    ...(selectedPreset.roleOverrides?.[role] ?? {}),
  };
  next[role] = mergedRoleAppearance(role, {
    ...next[role],
    ...selectedRoleAppearance,
    edge: selectedRoleAppearance.edge ?? selectedRoleAppearance.outline ?? next[role].edge,
    ...(getDiceEngineFont(selectedPreset.fontId) ? { font: getDiceEngineFont(selectedPreset.fontId)! } : {}),
    name: currentName,
  });
  return next;
}
