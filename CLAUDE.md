# Leib Runner — Agent Instructions

## What this project is
A browser-based 3D endless runner built with Three.js (r128). The player controls "Leib" running down a scrolling road, collecting goal posts to multiply clones, shooting fireballs, and surviving by staying on the road.

## File map
- `main.html` — entry point, loads `game.js` as an ES module; UI overlays defined here
- `style.css` — minimal page styles
- `game.js` — all game logic: scene setup, road scrolling, player movement, clones, goal posts, projectiles, camera, animation loop
- `model-manager.js` — `ModelManager` class: GLTF/DRACO model loading, animation state machine, projectile spawn position resolution

## Architecture notes
- **No build step.** Everything runs directly in the browser via ES module imports from CDN (Three.js r128 from jsdr.delivr.net).
- **Assets are remote.** Models and textures are fetched from `https://MaxTomahawk.github.io/leibgame-assets/assets/`. Do not try to reference local asset paths.
- **Road is infinite.** Six `PlaneGeometry` segments recycle by teleporting behind the player when they pass the camera.
- **Clone system.** Passing through a goal post triggers `multiplyPlayer(n)`, which clones the model via `SkeletonUtils.clone()` and arranges them in concentric rings around the player. Clones that drift off-road start falling and are removed.
- **Animation layering.** `ModelManager` uses Two-layer blending: base layer (idle/walk/run/jump) always runs; attack animations (cast/throw) run on an upper-body masked layer and do not interrupt leg movement.
- **No score.** The "Characters" counter in the UI is the only progression metric currently.

## Key constants (game.js)
| Name | Value | Purpose |
|---|---|---|
| `roadWidth` | 19 | Total road width; half = fall boundary |
| `roadSpeed` | 0.2 | Units/frame the road moves toward player |
| `moveSpeed` | 0.15 | Player lateral/forward speed |
| `jumpForce` | 0.3 | Initial jump velocity |
| `gravity` | 0.015 | Applied every frame |
| `goalSpawnInterval` | 8000ms | Time between goal post pairs |
| `CAST_DELAY` | 200ms | Delay between throw animation start and fireball spawn |

## Goal post layout
Two goals spawn simultaneously 50 units ahead:
- Left (x=-5): blue, `+2` multiplier
- Right (x=+5): green, `+4` multiplier

## Controls
- WASD — move
- Space — jump
- Left click — shoot fireball (player + all clones shoot)
- Mouse — camera rotation (pointer lock)
- R — restart after death

## Coding conventions
- Plain ES2020 JS, no TypeScript, no framework.
- Keep everything in `game.js` and `model-manager.js` unless a new concern clearly warrants a new file.
- Do not introduce a bundler or package manager.
- Prefer modifying existing functions over adding new ones for small changes.
- The animation loop runs at a fixed `delta = 0.016` (not real elapsed time) — keep this in mind for time-sensitive additions.

## Things to watch out for
- `isDead` guard at top of animate loop — new game logic that should be skipped on death must respect this.
- Clone mixers are stored in both `cloneMixers[]` (for update) and `clone.userData.mixer` (for removal). Keep both in sync.
- Goal posts are removed when `goal.position.z > player.position.z + 20` — spawning logic relies on player Z staying roughly constant (player moves in X/Z but road scrolls, not player Z).
- The `updateAnimation` fallback when not moving is `'run'` (line ~258 in game.js) — this looks like a bug worth discussing before fixing.
