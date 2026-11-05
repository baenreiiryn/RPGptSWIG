# Third-Party Notices

## Foundryborne Daggerheart domain icons

This repository includes the ten domain-card PNG icons synced from the Foundryborne Daggerheart project:

- Source: https://github.com/Foundryborne/daggerheart
- Upstream content: Daggerheart System Reference Document 1.0, © Critical Role, LLC
- License: Darrington Press Community Gaming License (DPCGL)
- License text referenced by upstream: https://darringtonpress.com/wp-content/uploads/2025/07/DPCGL-July-30th-2025.pdf

The upstream pack license and domain-icon trademark notice are preserved alongside the copied files in `public/compendium/daggerheart/foundryborne/`.

Only the DPCGL-permitted domain-card PNGs are copied by `scripts/sync-foundryborne-art.mjs`. Foundryborne logos, wheelchair images, other Daggerheart-specific images, and generic Foundry icon assets are not copied by this pipeline.

Darrington Press™, Daggerheart™, and their respective logos are trademarks of Critical Role, LLC. The Foundryborne source states that its Darrington Press authorized-work marks are used with permission; this repository does not copy those logos or marks.

## Timeline Builder reference

OracleRPG's vertical campaign timeline is an independent implementation inspired by the public interaction concepts of `brunocalado/timeline-builder`.

- Reference: https://github.com/brunocalado/timeline-builder
- Reference code license: GNU GPLv3

No Timeline Builder source code, templates, styles, images, or other assets are included in OracleRPG. The OracleRPG implementation uses its own React components, persistent game-state model, campaign calendar, filters, and GM tools.

## Cyberpunk campaign reference material

Cyberpunk reference records, maps, illustrations and d6/d10 dice faces were imported from the user-provided `edgerunners-mission-kit-v11FVTT.zip`. The archive metadata identifies R. Talsorian Games and Schism for the Foundry v11 Edgerunners module (v1.1.0); the exported world references Cyberpunk RED Core v0.88.2. Individual imported records retain their original book/page references where available.

Cyberpunk RED, Cyberpunk Edgerunners and their associated artwork and names remain the property of their respective rights holders. Importing this material does not transfer ownership or grant a new redistribution license. These notices do not represent permission from those rights holders.

The six Cyberpunk interface atlas crops come from an image generated for this OracleRPG implementation. They are distinct from the reference artwork imported from the archive.

## Night City detailed map reference

The optional online streets layer requests visible map tiles from Gamestegy's public Cyberpunk 2077 map CDN and credits the provider in the map UI. The local atlas remains available when the online layer fails. Tile artwork is not bundled or rehosted in this repository; availability depends on the provider. Cyberpunk 2077 artwork belongs to its respective rights holders, including CD PROJEKT RED.

`lib/cyberpunk/poi2077.json` contains a curated set of 32 location names and geographic coordinates referenced from https://gamestegy.com/cyberpunk-2077/maps/night-city on 2026-11-05. Original descriptions, icon assets, progression markers and implementation code are not imported. Atlas positions are approximate; the detailed layer uses the reference coordinates. Access-point markers can identify the approach to a venue rather than its building footprint. IGN's Night City map is also linked as a user-selected reference.
