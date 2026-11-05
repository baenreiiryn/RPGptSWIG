"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  buildDiceBoxRenderPlan,
  applyDiceFacePresetToNotation,
  resolveDiceAppearance,
  rollDice,
  type DiceAppearance,
  type DiceAppearanceOverrides,
  type DiceAppearanceRole,
  type DieSides,
} from "@/lib/dice";
import {
  applyDiceBoxAppearance,
  applyDiceBoxFont,
  diceAppearanceSignature,
  vendorColorSet,
} from "@/lib/diceBoxAppearance";

import {
  diceEngineTexture,
  rollWithDiceFaceTexture,
} from "@/lib/edgerunnersDice";

type DiceBoxInstance = InstanceType<
  (typeof import("@3d-dice/dice-box-threejs"))["default"]
>;

export type DiceAppearancePreviewProps = {
  appearances?: DiceAppearanceOverrides;
  role: DiceAppearanceRole;
  selectedDie: DieSides;
  disabled?: boolean;
  className?: string;
  onError?: (error: Error) => void;
};

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export default function DiceAppearancePreview({
  appearances,
  role,
  selectedDie,
  disabled = false,
  className,
  onError,
}: DiceAppearancePreviewProps) {
  const reactId = useId();
  const containerId = `oracle-dice-preview-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const boxRef = useRef<DiceBoxInstance | null>(null);
  const boxPromiseRef = useRef<Promise<DiceBoxInstance> | null>(null);
  const appliedAppearanceRef = useRef("");
  const sequenceRef = useRef(0);
  const rollQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const onErrorRef = useRef(onError);
  const [rolling, setRolling] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const globalFont = resolveDiceAppearance("normal", appearances).font;
  const appearance = {
    ...resolveDiceAppearance(role, appearances),
    font: globalFont,
  };
  const signature = diceAppearanceSignature(appearance);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const ensureBox = useCallback(
    async (initialAppearance: DiceAppearance) => {
      if (boxRef.current) return boxRef.current;
      if (boxPromiseRef.current) return boxPromiseRef.current;

      const promise = (async () => {
        const { default: DiceBox } = await import("@3d-dice/dice-box-threejs");
        const box = new DiceBox(`#${containerId}`, {
          assetPath: "/",
          sounds: false,
          shadows: true,
          theme_surface: initialAppearance.surface,
          theme_customColorset: vendorColorSet(
            initialAppearance,
            "oracle-preview",
          ),
          theme_colorset: "white",
          theme_texture: diceEngineTexture(initialAppearance.texture),
          theme_material: initialAppearance.material,
          gravity_multiplier: 430,
          light_intensity: 0.85,
          baseScale: 100,
          strength: 1,
        });
        await box.initialize();
        applyDiceBoxFont(box, initialAppearance.font);
        boxRef.current = box;
        appliedAppearanceRef.current =
          diceAppearanceSignature(initialAppearance);
        return box;
      })();

      boxPromiseRef.current = promise;
      try {
        return await promise;
      } catch (error) {
        boxPromiseRef.current = null;
        throw error;
      }
    },
    [containerId],
  );

  const applyAppearance = useCallback(
    async (box: DiceBoxInstance, nextAppearance: DiceAppearance) => {
      const nextSignature = diceAppearanceSignature(nextAppearance);
      if (appliedAppearanceRef.current === nextSignature) return;
      await applyDiceBoxAppearance(box, nextAppearance, "oracle-preview");
      appliedAppearanceRef.current = nextSignature;
    },
    [],
  );

  const rollPreview = useCallback(
    async (nextAppearance: DiceAppearance, die: DieSides) => {
      const sequence = ++sequenceRef.current;
      if (mountedRef.current) {
        setRolling(true);
        setErrorMessage("");
      }

      const operation = rollQueueRef.current.then(async () => {
        if (sequence !== sequenceRef.current) return;
        const box = await ensureBox(nextAppearance);
        await applyAppearance(box, nextAppearance);
        if (sequence !== sequenceRef.current) return;

        const result = rollDice(`1d${die}`, { appearance: role });
        const [lane] = buildDiceBoxRenderPlan(result, role);
        if (!lane)
          throw new Error(`Não foi possível preparar o preview de d${die}.`);

        box.clearDice();
        const renderedNotation = applyDiceFacePresetToNotation(
          lane.roll.notation,
          nextAppearance.preset,
        );
        const forcedNotation = `${renderedNotation}@${lane.roll.outcomes.join(",")}`;
        await rollWithDiceFaceTexture(
          box.DiceFactory,
          nextAppearance.texture,
          renderedNotation,
          () => box.roll(forcedNotation),
        );
      });
      rollQueueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );

      try {
        await operation;
      } catch (error) {
        if (sequence !== sequenceRef.current) return;
        const normalizedError = asError(error);
        if (mountedRef.current)
          setErrorMessage("Não foi possível carregar o preview 3D.");
        onErrorRef.current?.(normalizedError);
      } finally {
        if (sequence === sequenceRef.current && mountedRef.current)
          setRolling(false);
      }
    },
    [applyAppearance, ensureBox, role],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void rollPreview(appearance, selectedDie);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [rollPreview, selectedDie, signature]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sequenceRef.current += 1;
      boxRef.current?.clearDice();
      boxRef.current = null;
      boxPromiseRef.current = null;
      appliedAppearanceRef.current = "";
      rollQueueRef.current = Promise.resolve();
    };
  }, []);

  const rootClassName = ["diceAppearancePreview", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} data-dice-preview-role={role}>
      <div
        className="diceAppearancePreviewStage"
        style={{ position: "relative", minHeight: 240, overflow: "hidden" }}
      >
        <div
          id={containerId}
          className="diceAppearancePreviewCanvas"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        />
        {errorMessage && (
          <div
            className="diceAppearancePreviewError"
            role="status"
            aria-live="polite"
          >
            {errorMessage}
          </div>
        )}
      </div>

      <div className="diceAppearancePreviewControls">
        <span
          className="diceAppearancePreviewDie"
          aria-label={`Dado selecionado: d${selectedDie}`}
        >
          d{selectedDie}
        </span>
        <button
          type="button"
          className="diceAppearancePreviewRoll"
          disabled={disabled || rolling}
          onClick={() => void rollPreview(appearance, selectedDie)}
        >
          {rolling ? "Rolando…" : "Rolar preview"}
        </button>
      </div>
    </div>
  );
}
