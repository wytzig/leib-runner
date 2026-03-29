# Leib Runner — World & Asset Design Notes

This file is for thinking through visual improvements, asset upgrades, and world-building ideas.
Current assets are procedural Three.js geometry (no external models). This doc tracks what needs upgrading and what direction to go.

---

## Current visual state

| Element | What it is now | Quality |
|---|---|---|
| Road | 6 recycled `PlaneGeometry` segments, grey | ✅ functional |
| Grass | Flat green planes either side, no detail | ❌ placeholder |
| Grass tufts | Small box clusters spawned on grass | ⚠️ minimal |
| Turrets (grey) | Procedural stone tower, fence, cannon orb | ⚠️ recognizable but blocky |
| Turrets (red) | Same structure, dark red palette | ⚠️ recognizable but blocky |
| Zombie Leibs | Box body + sphere head + glowing eyes | ⚠️ charming but very simple |
| Goal posts | Thin arch + label | ⚠️ minimal |
| Fireballs | Colored spheres | ⚠️ minimal |
| Power-ups | Orb + torus ring, floating | ⚠️ minimal |
| Potholes | Dark plane + cones + sign | ⚠️ minimal |
| Roadside temples | Procedural stone shrine + candles | ⚠️ charming, but blocky |
| Sky | Plain `scene.background` color | ❌ placeholder |

---

## Priority improvements

### 1. Road surface
- Texture: cracked asphalt or ancient stone road (tiling texture, bump map)
- Road markings: faint center line or edge stripes
- Option: worn cobblestone would fit the fantasy/ancient vibe better than asphalt

### 2. Grass & environment
- Replace flat plane with a scrolling grass texture (repeating UV, normal map)
- Add denser tuft clusters using `InstancedMesh` for performance
- Wildflowers: tiny colored dots/planes scattered among tufts (pink, yellow, white)
- Distant tree line: low-poly silhouette meshes on far sides that loop slowly

### 3. Turrets (grey & red)
- Current: all `BoxGeometry` blocks — needs tapered/cylindrical tower shape
- Upgrade path: `CylinderGeometry` for shaft, `TorusGeometry` for battlements detail
- Add texture or normal maps to the stone (even a canvas-generated noise texture)
- Red turret: glowing runes carved into stone (emissive decal planes)
- Fire effect on cannon: particle system or animated emissive rings
- Consider loading a GLTF model from the game's asset CDN (`MaxTomahawk.github.io`)

### 4. Zombie Leibs
- Currently box + sphere — very Minecraft-esque
- Upgrade: use `SkeletonUtils.clone()` on a green-tinted version of the player model
  (the player GLTF is already loaded; could re-use with a color override shader or vertex color)
- Add shambling walk animation using the player's animation clips with a sickly speed modifier

### 5. Roadside temples
- Current: plain stone box shrine with cylinder candles
- Upgrade ideas:
  - Add a carved idol/statue in the center (stylized cylinder stack or a simple imported mesh)
  - Animated flame: oscillate flame cone scale in Y in the animate loop (flicker effect)
  - Chains hanging between pillars: `TubeGeometry` along a catenary curve
  - Moss/vines: thin green planes draped on stone surfaces
  - Incense smoke: tiny ascending particles above altar
  - Stone arch framing the road occasionally (spans from left temple to right temple)

### 6. Sky & atmosphere
- Replace solid background with a gradient sky (custom shader or `THREE.Sky` from examples)
- Fog: `THREE.FogExp2` with a dark colour to obscure draw distance naturally and add mood
- Time of day: start at dusk, slowly shift to night as distance increases
  (adjust `scene.background`, ambient light color/intensity over time)
- Stars: simple `Points` geometry at large radius, visible at night phase

### 7. Goal posts
- Currently thin green/blue arches — barely readable
- Upgrade: glowing neon archway with emissive inner glow
- Label (+2, +4 etc.) replaced with 3D extruded text geometry or billboard sprite

### 8. Fireballs
- Upgrade: `PointLight` attached to fireball for dynamic lighting on surroundings
- Trail: leave behind a short line of fading sphere instances

### 9. Player model (Leib)
- Model is loaded from CDN — improving it requires updating the source asset
- Giant mode: add a glowing outline or emissive aura around the giant player
  (could overlay a slightly larger, transparent, emissive clone mesh)

---

## World theme / lore direction

The road feels like an ancient cursed highway through a haunted grassland. Possible direction:
- **"Temple Run through cursed ruins"** — crumbling stone road, overgrown grass, scattered idol shrines
- Turrets = cursed watchtowers left by a forgotten civilization
- Zombie Leibs = past players/clones that failed and were corrupted
- Goal posts = magical gates that multiply your soul

This theme supports: stone textures, candles, fog, glowing runes, moonlight sky.

---

## Implementation notes

- No build step — all assets must be loadable from CDN or the existing GitHub Pages asset server
- New GLTF models should go to `MaxTomahawk.github.io/leibgame-assets/assets/` before referencing
- `InstancedMesh` is the right tool for grass blades, particles, and any repeated small geometry
- `THREE.PointLight` per fireball is expensive at scale — use `SpotLight` sparingly or bake glow with emissive materials + bloom (post-processing is not currently in the pipeline)
