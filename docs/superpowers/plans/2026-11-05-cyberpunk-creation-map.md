# Cyberpunk creation and Night City map

Goal: extend existing 2045/2077 creation with editable portrait/appearance/history, role suggestions, installed starting cyberware, and a Netrunner quickhack selection; make map navigation useful for campaign locations.

Architecture: retain the existing AI adapter and saved CharacterState fields. Keep starter budgets and implant validation in pure shared functions, used both by previews and final creation. CEMK quickhacks are Interface abilities, so selection records favorites, not invented paid software slots. Keep programs/cyberdeck hardware separate. Map stays local, using the source image at higher resolution with pan, pointer-anchored wheel zoom, pinch zoom, keyboard and searchable categorized POIs; merge defaults into existing campaigns without replacing their pins/events.

- [x] Tests for ten legal role attribute presets, shared-budget loadouts, installed bases/options/HL and portrait/favorite persistence.
- [x] Shared creation helpers and suggestions; wizard equipment/cyberware/quickhacks/story stages; AI errors and editable output; saved portrait rendered in sheet and supplied to GM.
- [x] High resolution map, curated sourced POIs, safe default merge, gesture geometry and UI filters. Preserve 2045 landmarks and custom addresses. Mark approximate positions honestly.
- [x] Run relevant tests, lint/build and browser flows at desktop/mobile, including image+AI, changing role/Neuroport, budget rejection, map pin placement after pan/zoom and existing-campaign migration.
- [ ] Save validated changes to the user's PC and Git repository; preserve unrelated files.
