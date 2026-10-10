# Project Memory: WebValo

This document records the architectural structure, implemented changes, and future enhancement roadmap for the WebValo project.

---

## 1. Implemented Features & Changes

### Core Engine & Game Loop (`js/game.js`)

* **Optimized High-Performance Loop**: Refactored the core render and physics loop to avoid per-frame garbage collection (GC) by pre-allocating reusable scratch vectors (`_v1`, `_v2`, `_v3`) and bounds objects.
* **Hitscan Ballistics & Shooting Engine**: Fully functional raycasting system supporting movement inaccuracy penalties, recoil kick recovery, muzzle flash lighting, bullet tracer object pooling, and impact decal generation.
* **Combat & Bot AI**: Integrated 5 dynamic bot instances featuring pathfinding toward the player, line-of-sight checks, attack cooldowns, responsive animation state switching (idle/run/death), and respawn timers.
* **Audio Synthesizer (`Sfx`)**: Procedural Web Audio API sound generator tailored for per-weapon gunshot timbre, kill confirms, hitmarkers, ability cues, reloads, and multi-kill stinger chords.
* **Agent Abilities & Ultimate System**: Implemented tactical ability charge tracking, cooldown management, and ultimate ability execution (e.g., Jett Blade Storm, Yoru invisibility/gatecrash).

### User Interface & Styling (`css/style.css`)

* **Valorant Aesthetic**: Ink-navy (`#0f1923`), signal-red (`#ff3848`), electric cyan (`#00f5ff`), and bone-white palette with angular clip-path containers and Google Fonts (*Anton*, *Rajdhani*, *JetBrains Mono*).
* **Vibrant Visual Polish**: Upgraded HUD panels, electric cyan background grid overlays, high-contrast radial glowing backdrops, crosshairs, hitmarkers, killfeeds, buy menus, and pause/death overlays.

---

## 2. Further Change Suggestion: Introducing `js/maps.js`

To scale the game beyond the single procedural `FORGE` arena without cluttering the main engine file, the next recommended step is implementing a modular map registry (`js/maps.js`) combined with dynamic GLTF environment loading.

### Why implement `js/maps.js`?

1. **Modular Architecture**: Separates map configurations (spawn points, lighting profiles, names, and environment `.glb` file paths) from game logic.
2. **Infinite Map Variety**: Enables players to switch between different tactical arenas (e.g., industrial districts, desert ruins, sci-fi facilities) directly from the Agent Select screen.
3. **Automated Colliders**: Allows the engine to parse external GLTF map geometry automatically to generate bounding box colliders for walls and cover.

### Proposed Structure for `js/maps.js`:

```javascript
// js/maps.js
export const MAPS = [
  {
    id: 'forge',
    name: 'FORGE',
    subtitle: 'INDUSTRIAL DISTRICT — 2 SITES',
    file: null, // Procedural fallback
    spawnPoints: [
      [-18, 0, -10], [18, 0, 10], [-22, 0, 14], [22, 0, -14],
      [0, 0, -24], [0, 0, 24], [-10, 0, 24], [10, 0, -24]
    ]
  },
  {
    id: 'ascent',
    name: 'ASCENT',
    subtitle: 'ANCIENT COURTYARD — OPEN SITE',
    file: 'ascent_map.glb',
    spawnPoints: [
      [-20, 0, -15], [20, 0, 15], [-25, 0, 20], [25, 0, -20],
      [0, 0, -28], [0, 0, 28]
    ]
  }
];

export const getMap = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

```
