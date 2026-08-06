-- World templates — concept prompts for AI-generated worlds
-- The Wizard NPC uses these prompts to build worlds on GitHub branches.

create table if not exists heights_cloud_world_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  icon text not null default '🌀',
  concept_prompt text not null,
  reference_doc text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Seed Erics Alley as the first world template
insert into heights_cloud_world_templates (name, description, icon, concept_prompt, reference_doc, sort_order)
values (
  'Erics Alley',
  'Gritty back alley world where agents smoke instead of type. Cardboard box stations, barrel fires, dumpsters as filing cabinets, van deliveries.',
  '🏚️',
  'Build a world called "Erics Alley" — a gritty urban back alley where the visual metaphor for AI agent management is street life instead of office work.

Key design decisions:
- When agents are "working", they lean against a wall and smoke. Smoke is tinted with their status color (green=working, amber=thinking, red=error/coughing, blue=done/blowing a ring). This replaces the typing-at-desk animation.
- A beat-up white van screeches in from the side of the screen, slams to a stop, agent gets tossed out the back door, van peels off. This replaces the helicopter delivery cinematic.
- Furniture: cardboard box stations with spray-painted monitors, crates as chairs, dumpsters as filing cabinets, barrel fires as coffee machines, mattresses as sofas, shopping carts as water coolers, weeds growing through cracks as plants, fuse boxes as server racks, steam vents as chimneys, puddles, trash cans, spray paint cans, dead plants.
- Biomes: alley → street → abandoned → undercity → sewer → hellmouth (replaces meadow → forest → ruins → wasteland → void → infernal)
- Status colors: gritty muted palette (idle=#6a6a78, thinking=#e8a838, working=#4cb866, done=#4a9cd8, error=#e05858, waiting=#b47ec4)

Implementation approach:
1. Create client/src/game/furniture-alley.ts with Canvas2D drawing functions for each furniture piece, registered via registerThemeFurniture()
2. Create client/public/assets/world-theme.json with the alley theme config (biomes, furniture mappings, status colors, asset paths)
3. Create client/public/assets/maps/erics-alley.json — a Tiled-format map with the alley layout
4. Modify client/src/game/agent.ts to add smoking work animation when workMetaphor === "smoking"
5. Modify client/src/game/scene.ts to add van delivery cinematic when arrivalMetaphor === "van_delivery"
6. Import furniture-alley.ts in client/src/game/boot.ts so furniture functions register at boot

Look at docs/WORLDS.md for the full design spec including the complete world-theme.json config, furniture tile ID mappings, and visual metaphor details.',
  'docs/WORLDS.md',
  1
)
on conflict do nothing;
