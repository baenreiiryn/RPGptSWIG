"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { CompendiumEntry } from "@/lib/compendium/daggerheart";

type ArtEntry = Pick<CompendiumEntry, "art" | "name" | "category" | "type">;

export function compendiumGlyph(entry?: Pick<CompendiumEntry, "category" | "type"> | null) {
  if (!entry) return "◇";
  if (entry.category === "domains") return "◈";
  if (entry.category === "classes") return entry.type === "subclass" || entry.type === "subclassFeature" ? "△" : "✦";
  if (entry.category === "subclasses") return "△";
  if (entry.category === "beastforms") return "♧";
  if (entry.category === "transformations") return "◭";
  if (entry.category === "ancestries") return "◐";
  if (entry.category === "communities") return "⌂";
  if (entry.category === "equipment") return "⚔";
  if (entry.category === "adversaries") return "♜";
  return "◇";
}

export default function CompendiumArt({
  entry,
  className,
  alt,
  fallback = null,
  loading = "lazy",
}: {
  entry?: ArtEntry | null;
  className?: string;
  alt?: string;
  fallback?: ReactNode;
  loading?: "eager" | "lazy";
}) {
  const src = entry?.art || "";
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return <>{fallback}</>;

  const imageClassName = [
    className,
    entry?.type === "class" ? "classIconArt" : "",
    entry?.type === "classFeature" ? "classFeatureIconArt" : "",
    entry?.category === "ancestries" ? "ancestryIconArt" : "",
    entry?.category === "communities" ? "communityIconArt" : "",
    entry?.category === "subclasses" ? "subclassIconArt" : "",
    entry?.category === "beastforms" ? "beastformIconArt" : "",
    entry?.category === "transformations" ? "transformationIconArt" : "",
    entry?.category === "equipment" ? "equipmentIconArt" : "",
  ].filter(Boolean).join(" ");

  return (
    <img
      className={imageClassName}
      src={src}
      alt={alt ?? entry?.name ?? ""}
      loading={loading}
      onError={() => setFailed(true)}
    />
  );
}
