# Leib Runner — Enemies & Obstacles

## Suggestions

### 1. Rolling Barrels
Classic runner obstacle. Barrels roll down the road toward Leib at varying speeds. Can't be destroyed — only dodged. Hit one and you lose a clone (or die if solo). Simple, readable, fits the road aesthetic.

### 2. Wall Slabs
A solid wall spanning part of the road width spawns ahead and slides toward you. Has a gap on one side — you must read which side and dodge through it in time. Lean into the lane-switching tension of the runner genre.

### 3. Zombie Leibs
Enemy characters that look like Leib but shuffling toward you down the road. Can be killed with fireballs (satisfying use of the shoot mechanic). If they reach you they drain one clone. Could have a health bar that scales with fireball power.

### 4. Fireball-Turret Pillars ✅ SELECTED
Stationary pillars on the road edges that shoot fireballs at Leib periodically. Can be destroyed with enough hits. Rewards aggressive shooting over just dodging.

#### Specs
- **Health:** 20 hits (designed to be configurable per turret in future)
- **Fire rate:** 1 shot every 3 seconds per turret
- **Spawn rate:** 1 pair per goal post interval (~8s), offset in Z so they don't overlap with goal posts
- **Placement:** Always 1 on each road edge (left: x = -9, right: x = +9)
- **Damage:** 1 clone removed per enemy fireball hit — the specific clone that is struck disappears. If the main Leib is hit directly (no clones left), it's game over.
- **Destruction:** Turret is removed from scene when health reaches 0. No drop/reward yet.
- **Enemy projectile color:** Yellow/orange, distinct from player fireballs
- **Visual:** Stone-grey pillar with a glowing red cannon tip

### 5. Pit Sections
Short gaps in the road that require a well-timed jump to cross. Clones that can't make the jump fall off (ties into the existing falling mechanic). No enemy — pure platformer obstacle.

### 6. Speed Bumps / Shockwave Ring
A shockwave pulse that travels down the road. If it hits you, it knocks back your clones — some may fall off the edge. Can be jumped over. Pairs well with the clone-count mechanic.

---

*Once you pick a direction, add full specs here (health, speed, spawn rate, damage, visual) before implementation.*
