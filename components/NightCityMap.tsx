"use client";
import { useEffect, useRef, useState } from "react";
import {
  clampView,
  mapPoint,
  zoomAt,
  type MapView,
  type Point,
} from "@/lib/cyberpunk/mapGeometry";
import { PLACE_GLYPHS } from "@/lib/cyberpunk/places";
import type { CyberpunkEra, Place } from "@/lib/cyberpunk/types";
export type CityMapLayer = "atlas" | "streets";
export default function NightCityMap({
  era,
  places,
  selected,
  counts,
  adding,
  position,
  layer,
  onLayer,
  onSelect,
  onPosition,
}: {
  era: CyberpunkEra;
  places: Place[];
  selected: string;
  counts: Record<string, number>;
  adding: boolean;
  position: Point;
  layer: CityMapLayer;
  onLayer: (v: CityMapLayer) => void;
  onSelect: (id: string) => void;
  onPosition: (p: Point) => void;
}) {
  const pane = useRef<HTMLDivElement>(null),
    pointers = useRef(new Map<number, Point>()),
    moved = useRef(false),
    down = useRef<Point | undefined>(undefined);
  const [size, setSize] = useState({ x: 600, y: 600 }),
    [view, setView] = useState<MapView>({ x: 0, y: 0, scale: 1 }),
    [expanded, setExpanded] = useState(false),
    [failed, setFailed] = useState(false);
  const dimensions =
    layer === "streets"
      ? { x: 256, y: 256 }
      : {
          x: 1000,
          y: era === 2077 ? (1000 * 2588) / 1972 : (1000 * 1015) / 1042,
        };
  const fit =
    layer === "streets"
      ? Math.min(size.x / 115, size.y / 145)
      : Math.min(size.x / dimensions.x, size.y / dimensions.y);
  const current = useRef({ view, fit, size, dimensions });
  current.current = { view, fit, size, dimensions };
  function reset(w = size.x, h = size.y) {
    const scale =
      layer === "streets"
        ? Math.min(w / 115, h / 145)
        : Math.min(w / dimensions.x, h / dimensions.y);
    setView(
      layer === "streets"
        ? { scale, x: w / 2 - 108 * scale, y: h / 2 - 88 * scale }
        : {
            scale,
            x: (w - dimensions.x * scale) / 2,
            y: (h - dimensions.y * scale) / 2,
          },
    );
  }
  function zoom(multiplier: number, anchor?: Point) {
    const c = current.current;
    setView((v) =>
      clampView(
        zoomAt(
          v,
          anchor ?? { x: c.size.x / 2, y: c.size.y / 2 },
          Math.max(c.fit, Math.min(c.fit * 12, v.scale * multiplier)),
        ),
        c.size,
        c.dimensions,
      ),
    );
  }
  useEffect(() => {
    const node = pane.current;
    if (!node) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ x: width, y: height });
      reset(width, height);
    });
    obs.observe(node);
    return () => obs.disconnect();
    // Layer changes intentionally reset its coordinate system.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, era]);
  useEffect(() => {
    const node = pane.current;
    if (!node) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = node.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0018), {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const p = places.find((p) => p.id === selected);
    if (!p) return;
    const point =
      layer === "streets"
        ? p.streetPosition
        : p.mapLayer === "streets"
          ? undefined
          : p;
    if (!point) return;
    setView((v) =>
      clampView(
        {
          ...v,
          x: size.x / 2 - (point.x / 100) * dimensions.x * v.scale,
          y: size.y / 2 - (point.y / 100) * dimensions.y * v.scale,
        },
        size,
        dimensions,
      ),
    );
    // Center only when selecting a place, not during pan or zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = pane.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const tiles = [];
  if (layer === "streets") {
    const z = Math.max(2, Math.min(6, Math.ceil(Math.log2(view.scale)))),
      extent = 256 / 2 ** z;
    const x0 = Math.max(0, Math.floor(-view.x / view.scale / extent)),
      x1 = Math.min(
        Math.ceil(220 / extent) - 1,
        Math.floor((size.x - view.x) / view.scale / extent),
      );
    const y0 = Math.max(0, Math.floor(-view.y / view.scale / extent)),
      y1 = Math.min(
        Math.ceil(220 / extent) - 1,
        Math.floor((size.y - view.y) / view.scale / extent),
      );
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        tiles.push(
          <img
            alt=""
            draggable={false}
            key={`${z}-${x}-${y}`}
            className="cpStreetTile"
            style={{
              left: x * extent,
              top: y * extent,
              width: extent + 0.02,
              height: extent + 0.02,
            }}
            src={`https://cdn.gamestegy.com/interactive-maps/cyberpunk-2077/night-city-v5/${z}/${x}/${y}.png`}
            onError={() => {
              setFailed(true);
              onLayer("atlas");
            }}
          />,
        );
  }
  const controls = (
    <div className="cpButtonRow cpMapControls">
      <button aria-label="Diminuir mapa" onClick={() => zoom(1 / 1.4)}>
        −
      </button>
      <button aria-label="Ampliar mapa" onClick={() => zoom(1.4)}>
        +
      </button>
      <button onClick={() => reset()}>Enquadrar</button>
      <small aria-live="polite">{Math.round((view.scale / fit) * 100)}%</small>
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? "Sair da tela cheia" : "Tela cheia"}
      </button>
      {era === 2077 && (
        <select
          aria-label="Camada do mapa"
          value={layer}
          onChange={(e) => {
            setFailed(false);
            onLayer(e.target.value as CityMapLayer);
          }}
        >
          <option value="streets">Ruas e edifícios (online)</option>
          <option value="atlas">Atlas da campanha (local)</option>
        </select>
      )}
    </div>
  );
  return (
    <div
      className={`cpMapExplorer ${expanded ? "cpMapFullscreen" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") setExpanded(false);
      }}
    >
      {controls}
      {failed && (
        <p className="cpError" role="status">
          A camada online não carregou. O atlas local continua disponível.
        </p>
      )}
      <div
        ref={pane}
        className="cpMapViewport"
        tabIndex={0}
        role="region"
        aria-label="Mapa interativo de Night City"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            zoom(1.4);
          } else if (e.key === "-") {
            e.preventDefault();
            zoom(1 / 1.4);
          } else if (e.key === "0") {
            e.preventDefault();
            reset();
          } else if (e.key.startsWith("Arrow")) {
            e.preventDefault();
            setView((v) =>
              clampView(
                {
                  ...v,
                  x:
                    v.x +
                    (e.key === "ArrowLeft"
                      ? 60
                      : e.key === "ArrowRight"
                        ? -60
                        : 0),
                  y:
                    v.y +
                    (e.key === "ArrowUp"
                      ? 60
                      : e.key === "ArrowDown"
                        ? -60
                        : 0),
                },
                size,
                dimensions,
              ),
            );
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const p = local(e);
          pointers.current.set(e.pointerId, p);
          if (pointers.current.size === 1) {
            down.current = p;
            moved.current = false;
          } else moved.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          const before = [...pointers.current.values()],
            old = pointers.current.get(e.pointerId)!,
            p = local(e);
          pointers.current.set(e.pointerId, p);
          if (
            down.current &&
            Math.hypot(p.x - down.current.x, p.y - down.current.y) > 5
          )
            moved.current = true;
          if (pointers.current.size === 2) {
            const after = [...pointers.current.values()],
              middle = (ps: Point[]) => ({
                x: (ps[0].x + ps[1].x) / 2,
                y: (ps[0].y + ps[1].y) / 2,
              }),
              distance = (ps: Point[]) =>
                Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
            const a = middle(before),
              b = middle(after),
              ratio = distance(after) / Math.max(1, distance(before));
            setView((v) => {
              const n = zoomAt(
                v,
                a,
                Math.max(fit, Math.min(fit * 12, v.scale * ratio)),
              );
              return clampView(
                { ...n, x: n.x + b.x - a.x, y: n.y + b.y - a.y },
                size,
                dimensions,
              );
            });
          } else
            setView((v) =>
              clampView(
                { ...v, x: v.x + p.x - old.x, y: v.y + p.y - old.y },
                size,
                dimensions,
              ),
            );
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          moved.current = true;
        }}
        onClick={(e) => {
          if (!adding || moved.current) return;
          const p = mapPoint(local(e), view);
          onPosition({
            x: Math.max(0, Math.min(100, (p.x / dimensions.x) * 100)),
            y: Math.max(0, Math.min(100, (p.y / dimensions.y) * 100)),
          });
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          if (!adding) zoom(2, local(e));
        }}
      >
        <div
          className="cpMapTransform"
          style={{
            width: dimensions.x,
            height: dimensions.y,
            transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
          }}
        >
          {layer === "streets" ? (
            tiles
          ) : (
            <img
              className="cpAtlasImage"
              draggable={false}
              src={`/cyberpunk/night-city-${era}.${era === 2045 ? "png" : "webp"}`}
              alt={`Mapa de Night City em ${era}`}
            />
          )}
          {places.map((p) => {
            const point =
              layer === "streets"
                ? p.streetPosition
                : p.mapLayer === "streets"
                  ? undefined
                  : p;
            if (!point) return null;
            const category =
              p.category ??
              (p.precision === "custom"
                ? "custom"
                : p.precision === "district"
                  ? "district"
                  : "landmark");
            return (
              <button
                key={p.id}
                className={`cpMapPin ${selected === p.id ? "selected" : ""} ${counts[p.id] ? "hasEvents" : ""}`}
                style={{
                  left: point.x + "%",
                  top: point.y + "%",
                  transform: `translate(-50%,-50%) scale(${1 / view.scale})`,
                }}
                title={p.name}
                aria-label={`${p.name}, ${counts[p.id] ?? 0} acontecimentos`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(p.id);
                }}
              >
                {counts[p.id] || PLACE_GLYPHS[category] || "·"}
                {(view.scale / fit > 1.8 || p.id === selected) && (
                  <span className="cpPinLabel">{p.name}</span>
                )}
              </button>
            );
          })}
          {adding && (
            <span
              className="cpMapCross"
              style={{
                left: position.x + "%",
                top: position.y + "%",
                transform: `translate(-50%,-50%) scale(${1 / view.scale})`,
              }}
            >
              +
            </span>
          )}
        </div>
      </div>
      <small className="cpMapHelp">
        Arraste para explorar · roda do mouse ou dois dedos para zoom · teclado:
        setas, +, − e 0.{adding ? " Toque sem arrastar para marcar." : ""}
      </small>
      <small className="cpMapAttribution">
        {layer === "streets" ? (
          <>
            Camada online e posições:{" "}
            <a
              href="https://gamestegy.com/cyberpunk-2077/maps/night-city"
              target="_blank"
              rel="noreferrer"
            >
              Gamestegy
            </a>{" "}
            · Cyberpunk 2077 © CD PROJEKT RED.
          </>
        ) : (
          <>
            Atlas do material da campanha. Posições dos estabelecimentos em 2077
            são aproximadas neste atlas.
          </>
        )}{" "}
        <a
          href="https://www.ign.com/maps/cyberpunk-2077/night-city"
          target="_blank"
          rel="noreferrer"
        >
          Consultar IGN
        </a>
      </small>
    </div>
  );
}
