# Leib Runner — Context Compact
> **AGENT INSTRUCTION:** Upon reading this file at the start of a new session, delete it after loading its contents into memory. It is a one-time bootstrap — do not carry it forward across further compacts.

---

## What this project is
Browser-based 3D endless runner, Three.js r128, no build step. Player controls "Leib" down a scrolling road, shoots fireballs, collects power-ups, survives by staying on road/avoiding holes. Entry point: `main.html` → `game.js` (ES module).

## File map
- `main.html` — entry point + UI overlays
- `style.css` — page + HUD styles
- `game.js` — all game logic (~1500+ lines)
- `model-manager.js` — GLTF/DRACO loading, animation state machine
- `enemy.md` — enemy design doc (turrets selected)
- `CLAUDE.md` — permanent agent instructions (canonical, always read)
- `Abyss Bounce.wav` — background music (loops)

## Architecture
- Road: 6 `PlaneGeometry` segments recycle (teleport behind player)
- Grass: 2 wide planes either side of road, same recycle pattern
- Clones: `SkeletonUtils.clone()`, arranged in concentric rings
- Animation: Two-layer blending (base legs + upper-body attack mask)
- Ground: `isOnSolidGround(x,z)` — true everywhere except over active `hole` terrain patches
- Fixed delta: `0.016` per frame (not real elapsed time)

## Key constants (game.js)
| Name | Value | Purpose |
|---|---|---|
| `roadWidth` | 19 | Total road width |
| `roadHalfWidth` | 9.5 | Fall boundary (declared ~line 776) |
| `roadSpeed` | 0.2 | Units/frame road scrolls |
| `moveSpeed` | 0.15 | Lateral speed |
| `jumpForce` | 0.3 | Initial jump velocity |
| `gravity` | 0.015 | Per frame |
| `goalSpawnInterval` | 8000ms | Goal post interval |
| `CAST_DELAY` | 200ms | Fireball spawn delay after anim |
| `TURRET_HEALTH` | 20 | Hits to destroy a turret |
| `TURRET_FIRE_RATE` | 3000ms | ms between turret shots |

## Power-up systems
- **Fireball power** (`fireballPower`): Tier 1 (1–7) red, Tier 2 (8–22) blue, Tier 3 (23+) purple. Controls fireball size.
- **Speed** (`speedLevel`): Increases `roadSpeed` and `moveSpeed`.
- **Jump** (`jumpLevel`): Grants extra jumps (`maxJumps`). Double-jump etc.
- HUD shows: 👥 clones | 🔥 power | ⚡ speed | 🟢 jumps

## Enemies — Turrets
- Stone pillar + watch-tower structure on road edge, random side per spawn
- 20 HP, hit detection: cylindrical AABB (horizDist < 1.8, y 0 to towerTop)
- Fires yellow/orange fireballs toward player every 3s with random spread
- Health bar canvas sprite above turret; damage numbers flash on hit
- Surrounded by fence on all 4 sides; fence has AABB push-out collision for player + clones
- Destroyed (removed from scene) at 0 HP
- Hitting a turret fireball removes 1 clone; if no clones → game over

## Road hazards
- **Potholes**: `createHolePatch(x, z, w, d)` — dark plane + 4 orange cones + yellow warning sign. Random size 2–9 units. Clones that step over fall + die. Player now also falls (ground-snap only fires if `player.position.y > -0.4`).

## Music (added last session)
- `new Audio('Abyss Bounce.wav')`, loop, volume 0.5
- Starts on first click or keydown (browser autoplay policy)
- `window.toggleMusic()` flips mute, persists to `localStorage('leib_music_muted')`
- 🔊/🔇 button fixed bottom-right corner (`#music-btn`)

## Known bugs fixed this session
- **Player not dying in pothole**: ground-snap code `player.position.y <= 0.5 && onGround` was snapping player back as hole scrolled away. Fixed: added `player.position.y > -0.4` guard so snap only fires near ground level.

## Coding conventions
- Plain ES2020 JS, no TypeScript, no framework, no bundler
- Assets from `https://MaxTomahawk.github.io/leibgame-assets/assets/`
- Keep logic in `game.js` / `model-manager.js`
- ES modules are strict — duplicate `function` declarations = SyntaxError → black screen
- `const` TDZ: never reference before declaration (caused `roadHalfWidth` crash before)
- `isDead` guard at top of animate loop — new logic must respect it
- Clone mixers stored in both `cloneMixers[]` and `clone.userData.mixer` — keep in sync
- Shared `lastShootTime`/`shootInterval` gate at mousedown level (fixes clone fire-rate bug)

## Controls
- WASD — move | Space — jump | Click — shoot | Mouse — camera (pointer lock) | R — restart
