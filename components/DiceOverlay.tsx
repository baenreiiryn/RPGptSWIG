"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  buildDiceBoxRenderPlan,
  applyDiceFacePresetToNotation,
  resolveDiceAppearance,
  runDiceBoxRenderPlan,
  type DiceAppearance,
  type DiceAppearanceOverrides,
  type DiceAppearanceRole,
  type DiceRollResult,
} from "@/lib/dice";
import {
  applyDiceBoxAppearance,
  applyDiceBoxFont,
  diceAppearanceSignature,
  vendorColorSet,
} from "@/lib/diceBoxAppearance";

import {withEdgerunnersFaces} from "@/lib/cyberpunk/diceFaces";

type DiceBoxInstance = InstanceType<(typeof import("@3d-dice/dice-box-threejs"))["default"]>;

export type DiceOverlayProps = {
  result: DiceRollResult | null;
  faceSet?: "edgerunners";
  appearances?: DiceAppearanceOverrides;
  appearance?: DiceAppearanceRole;
  lingerMs?: number;
  onComplete?: (result: DiceRollResult) => void;
  onError?: (error: Error, result: DiceRollResult) => void;
};

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export default function DiceOverlay({
  result,
  faceSet,
  appearances,
  appearance,
  lingerMs = 1000,
  onComplete,
  onError,
}: DiceOverlayProps) {
  const reactId = useId();
  const containerBaseId = `oracle-dice-overlay-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const boxRefs = useRef<Partial<Record<DiceAppearanceRole, DiceBoxInstance>>>({});
  const boxPromiseRefs = useRef<Partial<Record<DiceAppearanceRole, Promise<DiceBoxInstance>>>>({});
  const appliedAppearanceRefs = useRef<Partial<Record<DiceAppearanceRole, string>>>({});
  const playSequenceRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const lingerMsRef = useRef(lingerMs);
  const [visible, setVisible] = useState(false);

  const normalAppearance = resolveDiceAppearance("normal", appearances);
  const resolvedAppearances = {
    normal: normalAppearance,
    hope: { ...resolveDiceAppearance("hope", appearances), font: normalAppearance.font },
    fear: { ...resolveDiceAppearance("fear", appearances), font: normalAppearance.font },
  };
  const resolvedAppearancesSignature = diceAppearanceSignature({
    ...resolvedAppearances.normal,
    name: [
      diceAppearanceSignature(resolvedAppearances.normal),
      diceAppearanceSignature(resolvedAppearances.hope),
      diceAppearanceSignature(resolvedAppearances.fear),
    ].join("|"),
  });

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    lingerMsRef.current = Math.max(0, lingerMs);
  }, [lingerMs]);

  useEffect(() => {
    if (!result) {
      setVisible(false);
      return;
    }

    const currentResult = result;
    const currentAppearances = resolvedAppearances;
    const sequence = ++playSequenceRef.current;

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setVisible(true);

    function appearanceForRole(role: DiceAppearanceRole) {
      return currentAppearances[role];
    }

    function containerIdForRole(role: DiceAppearanceRole) {
      return `${containerBaseId}-${role}`;
    }

    async function ensureBox(role: DiceAppearanceRole, initialAppearance: DiceAppearance) {
      const existing = boxRefs.current[role];
      if (existing) return existing;
      const pending = boxPromiseRefs.current[role];
      if (pending) return pending;

      const promise = (async () => {
        const { default: DiceBox } = await import("@3d-dice/dice-box-threejs");
        const box = new DiceBox(`#${containerIdForRole(role)}`, {
          assetPath: "/",
          sounds: false,
          shadows: true,
          theme_surface: initialAppearance.surface,
          theme_customColorset: vendorColorSet(initialAppearance),
          theme_colorset: "white",
          theme_texture: initialAppearance.texture,
          theme_material: initialAppearance.material,
          gravity_multiplier: 430,
          light_intensity: 0.85,
          baseScale: 100,
          strength: 1,
        });
        await box.initialize();
        applyDiceBoxFont(box, initialAppearance.font);
        boxRefs.current[role] = box;
        appliedAppearanceRefs.current[role] = diceAppearanceSignature(initialAppearance);
        return box;
      })();
      boxPromiseRefs.current[role] = promise;

      try {
        return await promise;
      } catch (error) {
        delete boxPromiseRefs.current[role];
        throw error;
      }
    }

    async function applyAppearance(role: DiceAppearanceRole, box: DiceBoxInstance, nextAppearance: DiceAppearance) {
      const nextSignature = diceAppearanceSignature(nextAppearance);
      if (appliedAppearanceRefs.current[role] === nextSignature) return;
      await applyDiceBoxAppearance(box, nextAppearance);
      appliedAppearanceRefs.current[role] = nextSignature;
    }

    async function play() {
      try {
        const plan = buildDiceBoxRenderPlan(currentResult, appearance);
        if (!plan.length) return;

        Object.values(boxRefs.current).forEach((box) => box?.clearDice());

        const prepared = await Promise.all(plan.map(async (lane) => {
          const laneAppearance = appearanceForRole(lane.role);
          const box = await ensureBox(lane.role, laneAppearance);
          await applyAppearance(lane.role, box, laneAppearance);
          return { lane, box };
        }));
        if (sequence !== playSequenceRef.current) return;

        const boxesByRole = new Map(prepared.map(({ lane, box }) => [lane.role, box]));
        await runDiceBoxRenderPlan(plan, async (lane) => {
          const box = boxesByRole.get(lane.role);
          if (!box) throw new Error(`Dice box lane ${lane.role} was not initialized.`);
          const laneAppearance = appearanceForRole(lane.role);
          const renderedNotation = applyDiceFacePresetToNotation(lane.roll.notation, laneAppearance.preset);
          const forcedNotation = `${renderedNotation}@${lane.roll.outcomes.join(",")}`;
          if(faceSet === "edgerunners") await withEdgerunnersFaces(box.DiceFactory, () => box.roll(forcedNotation));
          else await box.roll(forcedNotation);
        });
        if (sequence !== playSequenceRef.current) return;

        onCompleteRef.current?.(currentResult);
        hideTimerRef.current = setTimeout(() => {
          if (sequence === playSequenceRef.current) setVisible(false);
        }, lingerMsRef.current);
      } catch (error) {
        if (sequence !== playSequenceRef.current) return;
        setVisible(false);
        onErrorRef.current?.(asError(error), currentResult);
      }
    }

    void play();

    return () => {
      if (sequence === playSequenceRef.current) playSequenceRef.current += 1;
    };
  }, [appearance, faceSet, containerBaseId, result?.id, resolvedAppearancesSignature]);

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    Object.values(boxRefs.current).forEach((box) => box?.clearDice());
    boxRefs.current = {};
    boxPromiseRefs.current = {};
    appliedAppearanceRefs.current = {};
  }, []);

  return (
    <div
      aria-hidden="true"
      data-dice-overlay="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 10000,
        pointerEvents: "none",
        overflow: "hidden",
        opacity: visible ? 1 : 0,
        visibility: visible ? "visible" : "hidden",
        transition: "opacity 180ms ease",
      }}
    >
      {(["normal", "hope", "fear"] as DiceAppearanceRole[]).map((role) => (
        <div
          id={`${containerBaseId}-${role}`}
          key={role}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      ))}
    </div>
  );
}
