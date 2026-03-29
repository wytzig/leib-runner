# Leib Runner — Context Compact
> **AGENT INSTRUCTION:** Upon reading this file at the start of a new session, delete it after loading its contents into memory. It is a one-time bootstrap — do not carry it forward across further compacts.

---

## What this project is
Browser-based 3D endless runner, Three.js r128, no build step. Player controls "Leib" down a scrolling road, shoots fireballs, collects power-ups, survives by staying on road/avoiding holes. Entry point: `index.html` → `game.js` (ES module).

## File map
- `index.html` — entry point + UI overlays (was `main.html`, renamed)
- `style.css` — page + HUD styles
- `game.js` — all game logic (~1800+ lines)
- `model-manager.js` — GLTF/DRACO loading, animation state machine
- `world.md` — design doc for future asset/visual upgrades
- `CLAUDE.md` — permanent agent instructions (canonical, always read)
- `Abyss Bounce.wav` — background music (loops)

## Architecture
- Road: 6 `PlaneGeometry` segments recycle (teleport behind player)
- Grass: 2 wide flat planes either side of road, same recycle pattern
- Grass tufts: clusters of small box blade meshes, spawn every 800ms, scroll and despawn
- Clones: `SkeletonUtils.clone()`, arranged in concentric rings
- Animation: Two-layer blending (base legs + upper-body attack mask)
- Ground: `isOnSolidGround(x,z)` — true everywhere except over active `hole` terrain patches
- Fixed delta: `0.016` per frame (not real elapsed time)

## Key constants (game.js)
| Name | Value | Purpose |
|---|---|---|
| `roadWidth` | 19 | Total road width |
| `roadHalfWidth` | 9.5 | Fall boundary |
| `roadSpeed` | 0.2 | Units/frame road scrolls |
| `moveSpeed` | 0.15 | Lateral speed |
| `jumpForce` | 0.3 | Initial jump velocity |
| `gravity` | 0.015 | Per frame |
| `goalSpawnInterval` | 8000ms | Goal post interval |
| `CAST_DELAY` | 200ms | Fireball spawn delay after anim |
| `TURRET_HEALTH` | 60 | Hits to destroy a turret |
| `TURRET_FIRE_RATE` | 3000ms | ms between turret shots (grey) |
| `GIANT_THRESHOLD` | 10 | Total Leibs (player+clones) to trigger merge |

## Power-up systems
- **Fireball power** (`fireballPower`): Tier 1 (1–7) red, Tier 2 (8–22) blue, Tier 3 (23+) purple. Controls fireball size.
- **Speed** (`speedLevel`): Increases `roadSpeed` and `moveSpeed`.
- **Jump** (`jumpLevel`): Grants extra jumps (`maxJumps`). Double-jump etc.
- HUD shows: 👥 clones | 🔥 power | ⚡ speed | 🟢 jumps

## Goal posts
- Random values: +1, +2, +3, +5 (blue/teal), or -1, -2 (red)
- 1 or 2 gates per spawn, random X positions within road half-widths
- Negative gates remove clones

## Enemies — Turrets
- Stone tower structure on road edge (random side per spawn)
- **Grey turret**: 60 HP, fires every 3000ms
- **Red turret**: 90 HP (1.5×), fires every 1000ms (3× rate), dark red stone, spawns ~1/12 chance
- Hit detection: cylindrical AABB (horizDist < 1.8, y 0 to towerTop)
- Fires yellow/orange fireballs toward player with random spread
- Health bar canvas sprite above turret; damage numbers flash on hit
- Surrounded by fence on all 4 sides; fence has AABB push-out collision for player + clones
- Destroyed (removed from scene) at 0 HP
- Hitting a turret fireball removes 1 clone; hitting player directly with no clones → game over

## Enemies — Zombie Leibs
- Green box-body + sphere-head shambling figures with glowing red eyes
- Spawn in the grass (both sides), 1–2 at a time every 3–7s
- 3 HP; track toward player's exact XZ position (not just road center)
- Rotate to face Leib as they shamble; `ZOMBIE_SPEED = 0.018` (much less than `roadSpeed`)
- Killed by fireballs; touching player or a clone removes the clone (or kills if no clones)

## Giant Leib
- Triggers when total Leibs (1 + clones) reaches `GIANT_THRESHOLD` (10)
- All clones are absorbed, player scales to **1.4×**
- `giantMaxHp = 10` (fixed); each hit reduces scale by 0.04 (10 hits: 1.4 → 1.0)
- **Ground snap adjusts with scale**: `groundSnap = 0.5 * player.scale.y` — prevents model clipping into road
- Hits handled by `takeDamageGiant()` — no game-over, just shrinks; deactivates at 1.0 (normal size)
- Power / speed / jumps are **not reset** by giant activation or deactivation
- "⚡ GIANT MODE! ⚡" flash message on activation
- HUD shows `👥 GIANT (Xhp)` while active
- Enemy fireballs and zombies use larger hit radius (2.5) against giant

## Road hazards
- **Potholes**: `createHolePatch(x, z, w, d)` — dark plane + 4 orange cones + yellow warning sign. Random size 2–9 units. Player and clones fall in. `isOnSolidGround()` check controls fall trigger.

## Decorative world
- **Grass tufts**: clusters of 6–14 blade box meshes (varied greens), spawn every 800ms in grass zone both sides, scroll and despawn
- **Roadside temples**: small stone shrine (platform + pillars + mossy roof + altar), 2–4 wax candles with emissive flame cones, spawn every 14s alternating sides just outside road edge

## Music
- `new Audio('Leib Weissman Adventure Run.wav')`, loop, volume 0.5
- Starts on first click or keydown (browser autoplay policy)
- `window.toggleMusic()` flips mute, persists to `localStorage('leib_music_muted')`
- 🔊/🔇 button fixed bottom-right area (`#music-btn`, `right: 64px` to avoid itch.io fullscreen button)
- ☕ Buy Me a Coffee button at bottom-left (`#coffee-btn`), links to `https://buymeacoffee.com/wytzig`
- Both buttons also appear on the game-over screen (coffee button is large yellow styled button)

## Coding conventions
- Plain ES2020 JS, no TypeScript, no framework, no bundler
- Assets from `https://MaxTomahawk.github.io/leibgame-assets/assets/`
- Keep logic in `game.js` / `model-manager.js`
- ES modules are strict — duplicate `function` declarations = SyntaxError → black screen
- `const` TDZ: never reference before declaration
- `isDead` guard at top of animate loop — new logic must respect it
- Clone mixers stored in both `cloneMixers[]` and `clone.userData.mixer` — keep in sync
- Shared `lastShootTime`/`shootInterval` gate at mousedown level (fixes clone fire-rate bug)
- Ground snap is `0.5 * player.scale.y` (not hardcoded 0.5) — needed for giant mode

## Controls
- WASD — move | Space — jump | Click — shoot | Mouse — camera (pointer lock) | R — restart
