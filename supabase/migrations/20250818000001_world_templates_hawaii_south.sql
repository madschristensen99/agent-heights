-- Add Hawaii and Old South world templates

insert into heights_cloud_world_templates (name, description, icon, concept_prompt, reference_doc, sort_order)
values
(
  'Hawaii',
  'Tropical beach pavilion where agents fire-spin instead of type. Tiki torch stations, surfboard desks, outrigger canoe deliveries, volcano exploration.',
  '🌋',
  'Build a world called "Hawaii" — a tropical beach pavilion where the visual metaphor for AI agent management is fire spinning (poi / fire knife dancing) instead of office work.

Key design decisions:
- When agents are "working", they spin fire poi. The fire itself IS the status indicator — green flames = working, amber = thinking, red sputtering = error, blue = done. This replaces the typing-at-desk animation and the monitor glow system.
- An outrigger canoe paddles in from the ocean, agent steps off onto the beach, walks to a tiki torch marking their station. This replaces the helicopter delivery cinematic.
- Furniture: tiki torch stations, log stools, treasure chests (filing cabinets), tiki bars (coffee machines), rain catchments (water coolers), prep tables (kitchen counters), lava rock grills (microwaves), hammocks (sofas), hibiscus and plumeria (plants), palm trees (large plants), tiki totems (server racks), volcano vents (chimneys).
- Biomes: beach → jungle → volcanic ridge → lava tubes → underwater cave → volcano summit (replaces meadow → forest → ruins → wasteland → void → infernal)
- Status colors: tropical palette (idle=#6d0e00, thinking=#d38e18, working=#4ca866, done=#4a9cd8, error=#e05858, waiting=#b47ec4)
- Dialect: Hawaiian Pidgin English — agents speak with "brah", "da kine", "pau", "mahalo"

Implementation approach:
1. client/src/game/furniture-hawaii.ts — Canvas2D drawing functions for each furniture piece, registered via registerThemeFurniture()
2. client/src/game/hawaii-tiles.ts — Procedural tileset generation for sand floors, bamboo walls, lava rock, coral, etc.
3. client/public/assets/maps/hawaii.json — Tiled-format map with the beach pavilion layout
4. client/src/game/scene.ts — fire_spinning work animation (spinning fire particles with ADD blend mode) and outrigger_delivery arrival cinematic
5. client/src/game/boot.ts — import furniture-hawaii, generate hawaii procedural tilesets
6. client/public/assets/world-theme.json — full Hawaii theme config with furniture mappings, biomes, status colors, dialect

Look at docs/WORLDS.md section 15 for the full design spec including the complete world-theme.json config, furniture tile ID mappings, biome details, and creature lists.',
  'docs/WORLDS.md',
  2
),
(
  'Old South',
  'Antebellum plantation mansion where agents harvest crops instead of type. Field plot stations, horse-drawn carriage deliveries, Battle of New Orleans outside world.',
  '🏛️',
  'Build a world called "Old South" — an antebellum Southern plantation themed around the Battle of New Orleans (War of 1812). The visual metaphor for AI agent management is harvesting — agents tend crops and work the land. The outside world is the Battle of New Orleans — American and British forces clashing across the map.

Key design decisions:
- When agents are "working", they bend over crop rows harvesting. Status-colored particles rise from the crops — green cotton bolls when working, amber leaves when thinking, red when error (blight), blue when done (harvested). This replaces the typing-at-desk animation and monitor glow.
- A horse-drawn carriage trots up the oak-lined drive, agent steps out at the mansion gate, walks to their field station. This replaces the helicopter delivery cinematic.
- Furniture: field plots (desks), wooden stools (chairs), storage chests (filing cabinets), sweet tea pitchers (coffee machines), well pumps (water coolers), smokehouses (server racks), cast iron stoves (microwaves), porch swings (sofas), shutter windows, cotton sprigs and magnolias (plants), live oaks with Spanish moss (large plants), brick chimneys, horseshoe pits.
- Biomes: garden → cotton field → pine forest → bayou → battlefield → infernal (replaces meadow → forest → ruins → wasteland → void → infernal)
- Status colors: muted Southern palette (idle=#7a8a6a, thinking=#d4a838, working=#5a8a4a, done=#4a9cd8, error=#b83a38, waiting=#9a8a6a)
- Dialect: refined Southern drawl appropriate to early 1800s Louisiana territory — agents use "I do declare", "reckon", "yonder"
- Conflict: Battle of New Orleans — American vs. British redcoats fighting in the outside world

Implementation approach:
1. client/src/game/furniture-south.ts — Canvas2D drawing functions for each furniture piece, registered via registerThemeFurniture()
2. client/src/game/south-tiles.ts — Procedural tileset generation for garden soil, wooden walls, cotton field tiles, bayou water, etc.
3. client/public/assets/maps/old-south.json — Tiled-format map with the plantation mansion layout
4. client/src/game/scene.ts — harvesting work animation (crop particles rising from agents) and carriage_delivery arrival cinematic
5. client/src/game/boot.ts — import furniture-south, generate south procedural tilesets
6. client/public/assets/world-theme.json — full Old South theme config with furniture mappings, biomes, status colors, dialect

Look at docs/WORLDS.md section 16 for the full design spec including the complete world-theme.json config, furniture tile ID mappings, biome details, creature lists, and the War Outside concept.',
  'docs/WORLDS.md',
  3
)
on conflict do nothing;
