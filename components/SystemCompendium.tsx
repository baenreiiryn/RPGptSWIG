"use client";
import { useState } from "react";
import DaggerheartCompendium from "./DaggerheartCompendium";
import CyberpunkCompendium from "./CyberpunkCompendium";
export default function SystemCompendium({ onBack }: { onBack: () => void }) {
  const [system, setSystem] = useState<"dh" | 2045 | 2077 | null>(null);
  if (system === "dh")
    return <DaggerheartCompendium onBack={() => setSystem(null)} />;
  if (system)
    return (
      <main className="cpShell">
        <CyberpunkCompendium era={system} onBack={() => setSystem(null)} />
      </main>
    );
  return (
    <main className="cpShell cpSystemPicker">
      <button onClick={onBack}>← Tela principal</button>
      <h1>Compêndios</h1>
      <p>Escolha o sistema e a época.</p>
      <div className="cpSystemCards">
        <button
          className="cpSystemCard cpFantasy"
          onClick={() => setSystem("dh")}
        >
          <h2>Daggerheart</h2>
          <p>Classes, cartas, equipamentos e criaturas.</p>
        </button>
        <button className="cpSystemCard" onClick={() => setSystem(2045)}>
          <h2>Cyberpunk RED</h2>
          <p>2045 · Tempo do Vermelho</p>
        </button>
        <button
          className="cpSystemCard cpEdgerunners"
          onClick={() => setSystem(2077)}
        >
          <h2>Cyberpunk Edgerunners</h2>
          <p>2077 · RED + Mission Kit</p>
        </button>
      </div>
    </main>
  );
}
