"use client";

import { useMemo, useState } from "react";
import DiceAppearancePreview from "@/components/DiceAppearancePreview";
import {
  DICE_FONTS,
  DICE_FACE_PRESETS,
  DICE_MATERIALS,
  DICE_TEXTURES,
  DICE_THEME_PRESETS,
  applyPresetToRole,
  getDiceEngineFont,
  type DiceThemePreset,
  type DiceTextureOption,
} from "@/lib/diceAppearanceCatalog";
import {
  DEFAULT_DICE_APPEARANCES,
  resolveDiceAppearance,
  type DiceAppearance,
  type DiceAppearanceOverrides,
  type DiceAppearanceRole,
  type DiceMaterial,
  type DiceFacePreset,
  type DieSides,
} from "@/lib/dice";

const PREVIEW_DICE: DieSides[] = [2, 4, 6, 8, 10, 12, 20, 100];

const ROLE_LABEL: Record<DiceAppearanceRole, string> = {
  normal: "Normal",
  hope: "Esperança",
  fear: "Medo",
};

const ROLE_DESCRIPTION: Record<DiceAppearanceRole, string> = {
  normal: "Aparência usada por todos os dados comuns.",
  hope: "Aparência exclusiva do d12 de Esperança em Daggerheart.",
  fear: "Aparência exclusiva do d12 de Medo em Daggerheart.",
};

function firstColor(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function texturePreviewAsset(id: string) {
  if (id === "none") return null;
  if (id === "cloudy") return "/textures/cloudy.webp";
  if (id === "cloudy_2") return "/textures/cloudy.alt.webp";
  if (id === "glitter_2") return "/textures/glitter-alpha.webp";
  if (id === "bird") return "/textures/feather.webp";
  return `/textures/${id}.webp`;
}

function presetSwatch(preset: (typeof DICE_THEME_PRESETS)[number], role: DiceAppearanceRole) {
  const typedPreset = preset as DiceThemePreset;
  const patch = {
    ...typedPreset.appearance,
    ...(typedPreset.roleOverrides?.[role] ?? {}),
  };
  const background = patch.background ?? DEFAULT_DICE_APPEARANCES[role].background;
  const colors = Array.isArray(background) ? background : [background];
  return colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.join(", ")})`;
}

export type DiceAppearanceSettingsProps = {
  daggerheart: boolean;
  appearances: DiceAppearanceOverrides;
  onChange: (next: DiceAppearanceOverrides) => void;
  onBack: () => void;
};

export default function DiceAppearanceSettings({
  daggerheart,
  appearances,
  onChange,
  onBack,
}: DiceAppearanceSettingsProps) {
  const [role, setRole] = useState<DiceAppearanceRole>("normal");
  const [previewDie, setPreviewDie] = useState<DieSides>(daggerheart ? 12 : 20);
  const [previewError, setPreviewError] = useState("");

  const roles = useMemo<DiceAppearanceRole[]>(
    () => daggerheart ? ["normal", "hope", "fear"] : ["normal"],
    [daggerheart],
  );
  const current = resolveDiceAppearance(role, appearances);

  function updateRole(patch: Partial<DiceAppearance>) {
    onChange({
      ...appearances,
      [role]: {
        ...(appearances[role] ?? {}),
        ...patch,
      },
    });
  }

  function applyPreset(preset: (typeof DICE_THEME_PRESETS)[number]) {
    const next = applyPresetToRole(appearances, role, preset);
    const engineFont = getDiceEngineFont(preset.fontId);
    const previousSurface = current.surface;
    const withRole = {
      ...next,
      [role]: {
        ...next[role],
        surface: previousSurface,
      },
    };
    if (engineFont) {
      onChange({
        ...withRole,
        normal: { ...withRole.normal, font: engineFont },
        hope: { ...withRole.hope, font: engineFont },
        fear: { ...withRole.fear, font: engineFont },
      });
      return;
    }
    onChange(withRole);
  }

  function updateGlobalFont(font: string) {
    onChange({
      ...appearances,
      normal: { ...(appearances.normal ?? {}), font },
      hope: { ...(appearances.hope ?? {}), font },
      fear: { ...(appearances.fear ?? {}), font },
    });
  }

  function resetRole() {
    const next = { ...appearances };
    delete next[role];
    onChange(next);
  }

  return (
    <main className="appShell menuPageShell diceSettingsShell">
      <div className="ambient ambientOne" />
      <div className="ambient ambientTwo" />
      <header className="menuPageHeader">
        <button className="backButton" onClick={onBack}>‹</button>
        <div><small>CONFIGURAÇÕES</small><strong>Aparência dos dados</strong></div>
      </header>

      <section className="diceSettingsContent">
        <div className="diceSettingsIntro">
          <div>
            <small>DADOS 3D</small>
            <h1>Monte seu conjunto.</h1>
            <p>Escolha tema, textura, fonte, material e cores. As alterações são salvas neste dispositivo e usadas nas rolagens da Sessão.</p>
          </div>
          <button type="button" className="diceSettingsReset" onClick={resetRole}>Restaurar padrão</button>
        </div>

        <div className="diceSettingsRoleTabs">
          {roles.map((item) => (
            <button
              type="button"
              className={role === item ? "active" : ""}
              onClick={() => {
                setRole(item);
                if (item !== "normal") setPreviewDie(12);
              }}
              key={item}
            >
              <span>{item === "normal" ? "◆" : item === "hope" ? "☀" : "◈"}</span>
              <div><strong>{ROLE_LABEL[item]}</strong><small>{ROLE_DESCRIPTION[item]}</small></div>
            </button>
          ))}
        </div>

        <div className="diceSettingsLayout">
          <aside className="diceSettingsPreviewCard">
            <div className="diceSettingsSectionTitle">
              <div><small>PRÉ-VISUALIZAÇÃO</small><strong>{ROLE_LABEL[role]}</strong></div>
              <span style={{ fontFamily: current.font }}>123</span>
            </div>
            <DiceAppearancePreview
              appearances={appearances}
              role={role}
              selectedDie={previewDie}
              onError={() => setPreviewError("O preview 3D não pôde ser carregado.")}
            />
            {previewError && <p className="diceSettingsPreviewNote">{previewError}</p>}
            <div className="dicePreviewDiePicker">
              {PREVIEW_DICE.map((sides) => (
                <button
                  type="button"
                  className={previewDie === sides ? "active" : ""}
                  onClick={() => setPreviewDie(sides)}
                  key={sides}
                >
                  d{sides}
                </button>
              ))}
            </div>
            <div className="diceCurrentSummary">
              <div><small>TEXTURA</small><strong>{DICE_TEXTURES.find((item) => item.id === current.texture)?.label ?? current.texture}</strong></div>
              <div><small>MATERIAL</small><strong>{DICE_MATERIALS.find((item) => item.id === current.material)?.label ?? current.material}</strong></div>
              <div><small>FONTE</small><strong>{DICE_FONTS.find((item) => item.engineFont === current.font)?.label ?? current.font}</strong></div>
            </div>
          </aside>

          <div className="diceSettingsControls">
            <section className="diceConfigSection">
              <div className="diceSettingsSectionTitle">
                <div><small>CATÁLOGO</small><strong>Temas</strong></div>
                <span>{DICE_THEME_PRESETS.length}</span>
              </div>
              <div className="dicePresetGrid">
                {DICE_THEME_PRESETS.map((preset) => (
                  <button type="button" className="dicePresetCard" onClick={() => applyPreset(preset)} key={preset.id}>
                    <span className="dicePresetSwatch" style={{ background: presetSwatch(preset, role) }}>
                      <i style={{ fontFamily: DICE_FONTS.find((font) => font.id === preset.fontId)?.cssFamily }}>20</i>
                    </span>
                    <div><strong>{preset.label}</strong><small>{preset.description}</small></div>
                  </button>
                ))}
              </div>
            </section>

            <section className="diceConfigSection">
              <div className="diceSettingsSectionTitle">
                <div><small>FACES</small><strong>Presets dos dados</strong></div>
                <span>{DICE_FACE_PRESETS.length}</span>
              </div>
              <p className="diceConfigHelp">Presets de faces são aplicados apenas aos dados compatíveis; os demais continuam numéricos.</p>
              <div className="diceFacePresetGrid">
                {DICE_FACE_PRESETS.map((preset) => {
                  const compatibleWith = preset.compatibleWith as readonly string[];
                  const disabled = role !== "normal" && !compatibleWith.includes("d12");
                  return (
                  <button
                    type="button"
                    className={current.preset === preset.id ? "active" : ""}
                    onClick={() => {
                      updateRole({ preset: preset.id as DiceFacePreset,...(current.texture==="edgerunners" && preset.id!=="standard"?{texture:"none"}:{}) });
                      if (preset.id !== "standard") {
                        const firstCompatible = compatibleWith[0];
                        const sides = Number(firstCompatible.replace("d", "")) as DieSides;
                        if (PREVIEW_DICE.includes(sides)) setPreviewDie(sides);
                      }
                    }}
                    disabled={disabled}
                    key={preset.id}
                  >
                    <b>{preset.preview}</b>
                    <span>
                      <strong>{preset.label}</strong>
                      <small>{preset.description}</small>
                      <em>{preset.compatibleWith.join(" · ")}</em>
                    </span>
                  </button>
                  );
                })}
              </div>
            </section>

            <section className="diceConfigSection">
              <div className="diceSettingsSectionTitle">
                <div><small>SUPERFÍCIE DO DADO</small><strong>Texturas</strong></div>
                <span>{DICE_TEXTURES.length}</span>
              </div>
              {current.texture === "edgerunners" && <p className="diceConfigHelp">O pacote tem cores e símbolos próprios. O símbolo Edgerunners representa o maior valor do dado.</p>}
              <div className="diceTextureGrid">
                {DICE_TEXTURES.map((texture) => {
                  const typedTexture = texture as DiceTextureOption;
                  const selected = current.texture === texture.id;
                  const image = typedTexture.previewAsset ?? texturePreviewAsset(texture.id);
                  return (
                    <button
                      type="button"
                      className={selected ? "active" : ""}
                      onClick={() => updateRole({
                        texture: texture.id,
                        ...(texture.id === "edgerunners" ? {preset:"standard" as DiceFacePreset} : {}),
                        ...(typedTexture.materialHint ? { material: typedTexture.materialHint } : {}),
                      })}
                      title={texture.description}
                      key={texture.id}
                    >
                      <span
                        className="diceTextureThumb"
                        style={{
                          backgroundColor: firstColor(current.background),
                          ...(image ? { backgroundImage: `url("${image}")` } : {}),
                        }}
                      />
                      <small>{texture.label}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="diceConfigSection">
              <div className="diceSettingsSectionTitle">
                <div><small>TIPOGRAFIA</small><strong>Fonte dos números · conjunto inteiro</strong></div>
                <span>{DICE_FONTS.length}</span>
              </div>
              <p className="diceConfigHelp">A fonte é global para manter todos os dados 3D — inclusive Esperança e Medo — consistentes na mesma rolagem.</p>
              <div className="diceFontGrid">
                {DICE_FONTS.map((font) => {
                  const selected = current.font === font.engineFont;
                  return (
                    <button
                      type="button"
                      className={selected ? "active" : ""}
                      onClick={() => updateGlobalFont(font.engineFont)}
                      key={font.id}
                    >
                      <b style={{ fontFamily: font.cssFamily }}>123</b>
                      <span><strong>{font.label}</strong><small>{font.description}</small></span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="diceConfigSection">
              <div className="diceSettingsSectionTitle">
                <div><small>ACABAMENTO</small><strong>Materiais</strong></div>
                <span>{DICE_MATERIALS.length}</span>
              </div>
              <div className="diceMaterialGrid">
                {DICE_MATERIALS.map((material) => (
                  <button
                    type="button"
                    className={current.material === material.id ? "active" : ""}
                    onClick={() => updateRole({ material: material.id as DiceMaterial })}
                    key={material.id}
                  >
                    <span className={`materialOrb material-${material.id}`} />
                    <div><strong>{material.label}</strong><small>{material.description}</small></div>
                  </button>
                ))}
              </div>
            </section>

            <section className="diceConfigSection diceColorSection">
              <div className="diceSettingsSectionTitle">
                <div><small>AJUSTE FINO</small><strong>Cores</strong></div>
              </div>
              <div className="diceColorControls">
                <label>
                  <span>Cor do dado</span>
                  <input type="color" value={firstColor(current.background)} onChange={(event) => updateRole({ background: event.target.value })} />
                </label>
                <label>
                  <span>Números</span>
                  <input type="color" value={current.foreground} onChange={(event) => updateRole({ foreground: event.target.value })} />
                </label>
                <label>
                  <span>Contorno</span>
                  <input type="color" value={current.outline} onChange={(event) => updateRole({ outline: event.target.value })} />
                </label>
                <label>
                  <span>Bordas</span>
                  <input type="color" value={current.edge} onChange={(event) => updateRole({ edge: event.target.value })} />
                </label>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
