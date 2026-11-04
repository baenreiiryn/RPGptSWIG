"use client";

import type { GameState } from "@/lib/game";
import { expansionState } from "@/lib/expansionTransformations";

export default function DivinityChoice({ state, disabled, onChoose }: {
  state: GameState;
  disabled: boolean;
  onChoose: (action: string, args: Record<string, unknown>) => void;
}) {
  const rollId = expansionState(state.character, "demigod")?.divinityPendingRollIds?.[0];
  if (!rollId) return null;
  return <div className="expansionTransformationControls divinityChoice" role="group" aria-label="O Peso da Divindade">
    <h3>O Peso da Divindade</h3>
    <p>Você teve um fracasso com Medo. Escolha uma consequência:</p>
    <button type="button" disabled={disabled || state.character.stress >= state.character.maxStress} onClick={() => onChoose("divinity-stress", { rollId })}>Marcar 1 Fadiga</button>
    <button type="button" disabled={disabled} onClick={() => onChoose("divinity-fear", { rollId })}>Conceder 1 Medo adicional</button>
  </div>;
}
