"use client";
import { useState } from "react";
import NewCampaignWizard, {
  type NewCampaignAiAdapter,
  type NewCampaignResult,
} from "./NewCampaignWizard";
import CyberpunkCampaignWizard from "./CyberpunkCampaignWizard";
import type { GameState } from "@/lib/game";
export default function CampaignSystemPicker({
  ai,
  onBack,
  onDaggerheart,
  onCyberpunk,
}: {
  ai: NewCampaignAiAdapter;
  onBack: () => void;
  onDaggerheart: (r: NewCampaignResult) => void | Promise<void>;
  onCyberpunk: (g: GameState) => void;
}) {
  const [system, setSystem] = useState<"dh" | 2045 | 2077 | null>(null);
  if (system === "dh")
    return (
      <NewCampaignWizard
        ai={ai}
        onBack={() => setSystem(null)}
        onComplete={onDaggerheart}
      />
    );
  if (system)
    return (
      <CyberpunkCampaignWizard
        era={system}
        ai={ai}
        onBack={() => setSystem(null)}
        onComplete={onCyberpunk}
      />
    );
  return (
    <main className="cpShell cpSystemPicker">
      <button onClick={onBack}>← Tela principal</button>
      <header>
        <small>ORACLERPG // NOVA CAMPANHA</small>
        <h1>Escolha seu mundo.</h1>
        <p>Cada sistema tem sua ficha, regras, memória e compêndio.</p>
      </header>
      <div className="cpSystemCards">
        <button
          className="cpSystemCard cpFantasy"
          onClick={() => setSystem("dh")}
        >
          <span>FANTASIA</span>
          <h2>Daggerheart</h2>
          <p>Esperança e Medo. Heróis, magia e grandes jornadas.</p>
          <b>INICIAR →</b>
        </button>
        <button className="cpSystemCard" onClick={() => setSystem(2045)}>
          <span>TEMPO DO VERMELHO // 2045</span>
          <h2>Cyberpunk RED</h2>
          <p>
            Night City em reconstrução. Papéis, cyberware e arquiteturas NET.
          </p>
          <b>INICIAR →</b>
        </button>
        <button
          className="cpSystemCard cpEdgerunners"
          onClick={() => setSystem(2077)}
        >
          <span>EDGERUNNERS // 2077</span>
          <h2>Cyberpunk Edgerunners</h2>
          <p>Neuroports, quickhacks e tecnologia do Mission Kit.</p>
          <b>INICIAR →</b>
        </button>
      </div>
    </main>
  );
}
