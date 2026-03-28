import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/DRACOLoader.js';
import { ModelManager, MODEL_SCALES } from './model-manager.js';
import { SkeletonUtils } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/utils/SkeletonUtils.js';

// Check if Three.js loaded
if (typeof THREE === 'undefined') {
  document.body.innerHTML = '<div style="color: white; padding: 20px; font-family: Arial;">ERROR: Three.js failed to load. Check your internet connection.</div>';
  throw new Error('Three.js not loaded');
}

console.log('Three.js loaded successfully');

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 10, 100);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

console.log('Renderer created');

// Fireball system
const projectiles = [];
let flameTexture;
let flameMaterial;
const CAST_DELAY = 200; // Match animation timing

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

// Road (long white platform)
const roadWidth = 19;
const roadLength = 200;
// Road segments for infinite scrolling
const roadSegments = [];
const segmentLength = 40;
const segmentCount = 6;
const roadSpeed = 0.2;
const roadMaterial = new THREE.MeshStandardMaterial({
  color: 0x50545A,
  side: THREE.DoubleSide
});

for (let i = 0; i < segmentCount; i++) {
  const segment = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth, segmentLength),
    roadMaterial
  );
  segment.rotation.x = -Math.PI / 2;
  segment.position.y = 0;
  segment.position.z = -segmentLength / 2 + i * segmentLength;
  scene.add(segment);
  roadSegments.push(segment);

  // Add yellow lines to each segment
  segment.markings = [];
  for (let j = 0; j < 4; j++) {
    const marking = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 3),
      new THREE.MeshStandardMaterial({ color: 0xffff00 })
    );
    marking.rotation.x = -Math.PI / 2;
    marking.position.set(0, 0.01, segment.position.z - segmentLength / 2 + j * 10);
    scene.add(marking);
    segment.markings.push(marking);
  }
}

// Player container (empty Group that will hold the loaded model)
const player = new THREE.Group();
player.position.set(0, 1, 0);
scene.add(player);

// Initialize model manager and load player model
const modelManager = new ModelManager();
let modelLoaded = false;

// Load the model (choose one: 'assets/leib.glb', 'assets/katinka.glb', 'assets/marco.glb' or 'assets/enemy.glb')
modelManager.loadPlayerModel('assets/leib.glb', player, {
  onProgress: (type, message, color) => {
    console.log(message);
  },
  onLoaded: (type, message, color) => {
    console.log(message);
    modelLoaded = true;
  },
  onError: (type, message, color) => {
    console.warn(message);
    modelLoaded = true; // Continue anyway with fallback
  }
});

initFireballAssets();

// Fireball power level
let fireballPower = 1;

// Shoot speed (ms between volleys for the whole group)
let shootInterval = 600;
let lastShootTime = 0;
let speedLevel = 1;

// Power-up items
const powerUps = [];
const powerUpSpawnInterval = 5000;
let lastPowerUpSpawn = Date.now();

// Speed power-ups
const speedPowerUps = [];
const speedPowerUpSpawnInterval = 7000;
let lastSpeedPowerUpSpawn = Date.now();

// Player clones (for multiplication effect)
const playerClones = [];
const cloneMixers = [];

// Goal posts system
const goalPosts = [];
const goalSpawnInterval = 8000; // 8 seconds
let lastGoalSpawn = Date.now();

// Turrets
const turrets = [];
const enemyProjectiles = [];
const TURRET_HEALTH = 20;
const TURRET_FIRE_RATE = 3000; // ms

function createGoalPost(x, z, color, multiplier, label) {
  const post = new THREE.Group();

  // Left pillar
  const leftPillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 4, 0.5),
    new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.5 })
  );
  leftPillar.position.set(-3.5, 2, 0);
  post.add(leftPillar);

  // Right pillar
  const rightPillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 4, 0.5),
    new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.5 })
  );
  rightPillar.position.set(3.5, 2, 0);
  post.add(rightPillar);

  // Top bar
  const topBar = new THREE.Mesh(
    new THREE.BoxGeometry(7.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.5 })
  );
  topBar.position.set(0, 4, 0);
  post.add(topBar);

  // Add text label
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 128;

  // Draw text
  context.fillStyle = '#ffffff';
  context.font = 'bold 80px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label !== undefined ? label : '+' + multiplier, 128, 64);

  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  const labelMaterial = new THREE.SpriteMaterial({ map: texture });
  const labelSprite = new THREE.Sprite(labelMaterial);
  labelSprite.scale.set(3, 1.5, 1);
  labelSprite.position.set(0, 2.5, 0);
  post.add(labelSprite);

  post.position.set(x, 0, z);
  post.userData.multiplier = multiplier;
  post.userData.color = color;
  post.userData.triggered = false;

  scene.add(post);
  return post;
}

function createTurret(x, z) {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x888880 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x555550 });

  const addBox = (geo, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // Foundation slab
  addBox(new THREE.BoxGeometry(3, 0.4, 3), darkMat, 0, 0.2, 0);

  // Main tower shaft
  addBox(new THREE.BoxGeometry(1.6, 4.5, 1.6), stoneMat, 0, 2.65, 0);

  // Watch room (wider platform on top)
  addBox(new THREE.BoxGeometry(2.8, 1.2, 2.8), stoneMat, 0, 5.5, 0);

  // Floor of watch room (dark inset)
  addBox(new THREE.BoxGeometry(2.4, 0.1, 2.4), darkMat, 0, 4.95, 0);

  // Battlements — 4 corner merlons
  const merlon = new THREE.BoxGeometry(0.55, 0.8, 0.55);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([mx, mz]) => {
    addBox(merlon, stoneMat, mx * 1.0, 6.7, mz * 1.0);
  });

  // Cannon orb (sits in centre of watch room)
  const cannon = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 1.8 })
  );
  cannon.position.y = 5.55;
  group.add(cannon);

  group.position.set(x, 0, z);
  group.userData.health = TURRET_HEALTH;
  group.userData.lastShot = Date.now() + 1500;
  group.userData.cannon = cannon;

  scene.add(group);
  return group;
}

function spawnTurrets(z) {
  turrets.push(createTurret(-9, z));
  turrets.push(createTurret(9, z));
}

function randomGoalValue() {
  const options = [
    { value: 1, label: '+1' },
    { value: 2, label: '+2' },
    { value: 3, label: '+3' },
    { value: 5, label: '+5' },
    { value: -1, label: '-1' },
    { value: -2, label: '-2' },
  ];
  return options[Math.floor(Math.random() * options.length)];
}

function spawnGoalPosts() {
  const spawnZ = player.position.z - 50;

  const left = randomGoalValue();
  const right = randomGoalValue();

  const leftColor = left.value >= 0 ? 0x0088ff : 0xff4444;
  const rightColor = right.value >= 0 ? 0x00ff88 : 0xff4444;

  goalPosts.push(createGoalPost(-5, spawnZ, leftColor, left.value, left.label));
  goalPosts.push(createGoalPost(5, spawnZ, rightColor, right.value, right.label));
}

function createPowerUp(x, z) {
  const orb = new THREE.Group();

  const geo = new THREE.SphereGeometry(0.4, 12, 12);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff4400, emissiveIntensity: 1.5 });
  const mesh = new THREE.Mesh(geo, mat);
  orb.add(mesh);

  // Outer glow ring
  const ringGeo = new THREE.TorusGeometry(0.6, 0.08, 8, 24);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xffdd00, emissiveIntensity: 2 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  orb.add(ring);

  orb.position.set(x, 1.2, z);
  scene.add(orb);
  return orb;
}

function spawnPowerUp() {
  const spawnZ = player.position.z - 50;
  const x = (Math.random() * (roadWidth - 2)) - (roadWidth / 2 - 1);
  powerUps.push(createPowerUp(x, spawnZ));
}

function createSpeedPowerUp(x, z) {
  const orb = new THREE.Group();

  const geo = new THREE.SphereGeometry(0.4, 12, 12);
  const mat = new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x0044ff, emissiveIntensity: 1.5 });
  const mesh = new THREE.Mesh(geo, mat);
  orb.add(mesh);

  const ringGeo = new THREE.TorusGeometry(0.6, 0.08, 8, 24);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x44ddff, emissive: 0x44ddff, emissiveIntensity: 2 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  orb.add(ring);

  orb.position.set(x, 1.2, z);
  scene.add(orb);
  return orb;
}

function spawnSpeedPowerUp() {
  const spawnZ = player.position.z - 50;
  const x = (Math.random() * (roadWidth - 2)) - (roadWidth / 2 - 1);
  speedPowerUps.push(createSpeedPowerUp(x, spawnZ));
}

function updatePowerUiLabel() {
  const ui = document.getElementById('ui');
  const charDiv = ui.querySelector('.char-count');
  const powerDiv = ui.querySelector('.power-level');
  const speedDiv = ui.querySelector('.speed-level');
  if (charDiv) charDiv.textContent = `Characters: ${1 + playerClones.length}`;
  if (powerDiv) powerDiv.textContent = `Power: ${fireballPower}`;
  if (speedDiv) speedDiv.textContent = `Speed: ${speedLevel}`;
}

// Tier 1: power 1-7  (orange), Tier 2: power 8-22 (blue), Tier 3: power 23+ (purple)
function getFireballTier() {
  if (fireballPower <= 7)  return { color: 0xff3300, posInTier: fireballPower };
  if (fireballPower <= 22) return { color: 0x0088ff, posInTier: fireballPower - 7 };
  return                          { color: 0x8800ff, posInTier: fireballPower - 22 };
}

function initFireballAssets() {
  const ASSET_BASE_URL = 'https://MaxTomahawk.github.io/leibgame-assets/assets/';

  // Load flame sprite texture ONCE
  flameTexture = new THREE.TextureLoader().load(`${ASSET_BASE_URL}fire.png`);
  flameTexture.encoding = THREE.sRGBEncoding;

  flameMaterial = new THREE.SpriteMaterial({
    map: flameTexture,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xff3300
  });
}

function performShoot(shooterPosition, shooterIsPlayer = true) {
  // Cooldown check for player only
  if (shooterIsPlayer && modelManager.isAttacking) return;

  const triggered = shooterIsPlayer ? modelManager.triggerThrowAnimation() : true;

  if (triggered) {
    setTimeout(() => {
      if (isDead) return;

      const fireball = new THREE.Object3D();

      // Size resets each tier; color reflects current tier
      const { color, posInTier } = getFireballTier();
      const sizeScale = 0.5 + (posInTier - 1) * 0.25;
      for (let i = 0; i < 2; i++) {
        const mat = flameMaterial.clone();
        mat.color.setHex(color);
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(sizeScale + Math.random() * 0.3, sizeScale + Math.random() * 0.3, 1);
        sprite.position.set(0, 0, 0);
        fireball.add(sprite);
      }

      // Spawn position
      let spawnPos;
      if (shooterIsPlayer) {
        spawnPos = modelManager.getProjectileSpawnPosition(player.position);
      } else {
        // For clones, spawn at their position + offset
        spawnPos = shooterPosition.clone();
        spawnPos.y += 1.5; // Chest height
      }

      fireball.position.copy(spawnPos);
      scene.add(fireball);

      // Direction - always shoot forward based on camera
      let dir = new THREE.Vector3(0, 0, -1);

      projectiles.push({
        mesh: fireball,
        velocity: dir.multiplyScalar(30 + fireballPower * 5),
        life: 2.0 + fireballPower * 0.2
      });

    }, shooterIsPlayer ? CAST_DELAY : 0); // Clones shoot instantly, player waits for animation
  }
}

console.log('Scene objects created');

// Mouse look controls with pointer lock
let cameraRotationX = 0;
let cameraRotationY = 0;
const mouseSensitivity = 0.002;

// Request pointer lock on click
document.addEventListener('click', () => {
  document.body.requestPointerLock();
});

// Mouse movement when locked
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === document.body) {
    cameraRotationY -= e.movementX * mouseSensitivity;
    cameraRotationX -= e.movementY * mouseSensitivity;

    // Limit vertical rotation
    cameraRotationX = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraRotationX));
  }
});

// Mouse shooting
document.addEventListener('mousedown', (e) => {
  if (isDead) return;

  // Left mouse button = Shoot
  if (e.button === 0) {
    const now = Date.now();
    if (now - lastShootTime < shootInterval) return;
    lastShootTime = now;

    performShoot(player.position, true);
    for (const clone of playerClones) {
      performShoot(clone.position, false);
    }
  }
});

// Prevent right-click context menu
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Game state
let velocity = { x: 0, z: 0, y: 0 };
let isJumping = false;
let isDead = false;
const moveSpeed = 0.15;
const jumpForce = 0.3;
const gravity = 0.015;
const roadHalfWidth = roadWidth / 2;

// Keyboard controls
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;

  // Restart on R key if dead
  if (e.key.toLowerCase() === 'r' && isDead) {
    location.reload();
  }
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// Check if player is on the road
function isOnRoad() {
  return Math.abs(player.position.x) <= roadHalfWidth;
}
// check if the position is on the road or not
function isPositionOnRoad(x) {
  return Math.abs(x) <= roadHalfWidth;
}

function checkGoalCollision() {
  for (let goal of goalPosts) {
    if (goal.userData.triggered) continue;

    // Check if player has passed through the goal
    const distanceX = Math.abs(player.position.x - goal.position.x);
    const distanceZ = Math.abs(player.position.z - goal.position.z);

    // Player is within goal width (4 units) and has crossed it
    if (distanceX < 3 && distanceZ < 2) {
      goal.userData.triggered = true;
      multiplyPlayer(goal.userData.multiplier);

      // Visual feedback - make goal flash
      goal.children.forEach(child => {
        child.material.emissiveIntensity = 1;
        setTimeout(() => {
          if (child.material) child.material.emissiveIntensity = 0.5;
        }, 300);
      });
    }
  }
}

function multiplyPlayer(multiplier) {
  console.log('🎯 Multiplying player by', multiplier);

  // Remove clones for negative values
  if (multiplier < 0) {
    const toRemove = Math.min(-multiplier, playerClones.length);
    for (let i = 0; i < toRemove; i++) {
      const clone = playerClones.pop();
      scene.remove(clone);
      const mixerIndex = cloneMixers.indexOf(clone.userData.mixer);
      if (mixerIndex > -1) cloneMixers.splice(mixerIndex, 1);
    }
    const totalCubes = 1 + playerClones.length;
    updatePowerUiLabel();
    return;
  }

  // Add new clones by loading fresh model instances
  for (let i = 0; i < multiplier; i++) {
    const clone = new THREE.Group();
    clone.position.copy(player.position);
    scene.add(clone);
    playerClones.push(clone);

    // Load a fresh instance of the model for this clone
    if (modelLoaded && modelManager.playerModel) {
      const cloneModel = SkeletonUtils.clone(modelManager.playerModel);
      cloneModel.scale.set(1, 1, 1);
      cloneModel.position.y = -0.5;
      clone.add(cloneModel);

      clone.userData.isFalling = false;
      clone.userData.fallSpeed = 0;

      const mixer = new THREE.AnimationMixer(cloneModel);

      // Store the mixer and setup animations for this clone
      clone.userData.mixer = mixer;
      clone.userData.animations = {};

      // Create all animation actions for the clone
      modelManager.animationClips.forEach((clip) => {
        let cleanName = clip.name;
        if (cleanName.includes('|')) cleanName = cleanName.split('|').pop();
        cleanName = cleanName.split('.')[0];

        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat);
        clone.userData.animations[cleanName] = action;
      });

      // Start with idle animation
      if (clone.userData.animations['idle']) {
        clone.userData.animations['idle'].play();
      }

      cloneMixers.push(mixer);
    } else {
      // Fallback box
      const fallbackGeo = new THREE.BoxGeometry(1, 2, 1);
      const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
      const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
      clone.add(fallbackMesh);
      clone.userData.isFalling = false;
      clone.userData.fallSpeed = 0;
    }
  }

  const totalClones = playerClones.length;
  const clonesPerRing = 8;

  for (let i = 0; i < totalClones; i++) {
    const ringIndex = Math.floor(i / clonesPerRing);
    const posInRing = i % clonesPerRing;
    const clonesInThisRing = Math.min(clonesPerRing, totalClones - ringIndex * clonesPerRing);

    const radius = 1.5 + ringIndex * 1.0;
    const angle = (posInRing / clonesInThisRing) * Math.PI * 2;
    const randomOffset = (Math.random() - 0.5) * 0.3;

    playerClones[i].targetX = Math.cos(angle) * radius + randomOffset;
    playerClones[i].targetZ = Math.sin(angle) * radius + randomOffset;
  }

  const totalCubes = 1 + playerClones.length;
  updatePowerUiLabel();
}



// Game loop
function animate() {
  requestAnimationFrame(animate);

  const delta = 0.016;

  // move all playerclones
  for (const mixer of cloneMixers) {
    mixer.update(delta);
  }

  // Spawn goal posts and turrets periodically (turrets offset 25 units behind goal posts)
  if (Date.now() - lastGoalSpawn > goalSpawnInterval) {
    spawnGoalPosts();
    spawnTurrets(player.position.z - 75);
    lastGoalSpawn = Date.now();
  }

  // Move road segments backward (creating forward motion)
  for (let segment of roadSegments) {
    segment.position.z += roadSpeed;

    // Move markings with segment
    if (segment.markings) {
      for (let marking of segment.markings) {
        marking.position.z += roadSpeed;
      }
    }

    // Recycle segment when it goes behind camera
    if (segment.position.z > camera.position.z + segmentLength * 2) {
      segment.position.z -= segmentLength * segmentCount;

      // Move markings too
      if (segment.markings) {
        for (let marking of segment.markings) {
          marking.position.z -= segmentLength * segmentCount;
        }
      }
    }
  }

  if (isDead) return;

  // Update model animations
  if (modelLoaded && modelManager.mixer) {
    const delta = 0.016; // Approximately 60fps
    modelManager.update(delta);

    // Determine animation state
    const isMoving = velocity.x !== 0 || velocity.z !== 0;
    const isSprinting = keys['shift'];

    modelManager.updateAnimation({
      isMoving: isMoving,
      isGrounded: player.position.y <= 0.5,
      isSprinting: isSprinting,
      verticalVelocity: velocity.y,
      isGliding: false,
      localVelocity: { x: velocity.x, z: velocity.z }
    });
  }

  // Sync clone animations with player
  const currentPlayerAnim = modelManager.currentAnimation;
  for (const clone of playerClones) {
    if (clone.userData.animations && currentPlayerAnim) {
      const cloneAction = clone.userData.animations[currentPlayerAnim];

      if (cloneAction && !cloneAction.isRunning()) {
        // Stop all other animations
        for (const anim in clone.userData.animations) {
          if (anim !== currentPlayerAnim) {
            clone.userData.animations[anim].stop();
          }
        }
        // Play the matching animation
        cloneAction.reset();
        cloneAction.play();
      }
    }
  }

  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];

    proj.mesh.position.add(proj.velocity.clone().multiplyScalar(delta));
    proj.life -= delta;

    // Animate the flame sprites
    proj.mesh.children.forEach(sprite => {
      sprite.rotation.z += 0.1;
      sprite.material.opacity = proj.life / 2.0; // Fade out
    });

    // Remove old projectiles
    if (proj.life <= 0) {
      scene.remove(proj.mesh);
      proj.mesh.children.forEach(child => {
        if (child.material) child.material.dispose();
      });
      projectiles.splice(i, 1);
    }
  }

  // Check goal collisions
  checkGoalCollision();

  // Update goal posts (move with road)
  for (let i = goalPosts.length - 1; i >= 0; i--) {
    const goal = goalPosts[i];
    goal.position.z += roadSpeed;

    // Remove goals that are far behind
    if (goal.position.z > player.position.z + 20) {
      scene.remove(goal);
      goalPosts.splice(i, 1);
    }
  }

  // Spawn power-ups periodically
  if (Date.now() - lastPowerUpSpawn > powerUpSpawnInterval) {
    spawnPowerUp();
    lastPowerUpSpawn = Date.now();
  }

  // Update power-ups: move with road, check collection, remove if behind
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const orb = powerUps[i];
    orb.position.z += roadSpeed;
    orb.rotation.y += 0.03;

    // Collection check — player or any clone
    const collectors = [player, ...playerClones];
    const collected = collectors.some(c => {
      const dx = c.position.x - orb.position.x;
      const dz = c.position.z - orb.position.z;
      return Math.sqrt(dx * dx + dz * dz) < 1.2;
    });
    if (collected) {
      fireballPower++;
      scene.remove(orb);
      powerUps.splice(i, 1);
      updatePowerUiLabel();
      continue;
    }

    // Remove if behind player
    if (orb.position.z > player.position.z + 20) {
      scene.remove(orb);
      powerUps.splice(i, 1);
    }
  }

  // Update turrets
  const now = Date.now();
  for (let i = turrets.length - 1; i >= 0; i--) {
    const turret = turrets[i];
    turret.position.z += roadSpeed;

    // Remove if behind player
    if (turret.position.z > player.position.z + 20) {
      scene.remove(turret);
      turrets.splice(i, 1);
      continue;
    }

    // Check hits from player projectiles
    for (let j = projectiles.length - 1; j >= 0; j--) {
      const proj = projectiles[j];
      const dx = proj.mesh.position.x - turret.position.x;
      const dy = proj.mesh.position.y - (turret.position.y + 5.2);
      const dz = proj.mesh.position.z - turret.position.z;
      if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 1.0) {
        turret.userData.health--;
        scene.remove(proj.mesh);
        projectiles.splice(j, 1);

        // Flash cannon red on hit
        turret.userData.cannon.material.emissiveIntensity = 3;
        setTimeout(() => {
          if (turret.userData.cannon.material) turret.userData.cannon.material.emissiveIntensity = 1.5;
        }, 100);

        if (turret.userData.health <= 0) {
          scene.remove(turret);
          turrets.splice(i, 1);
          break;
        }
      }
    }

    if (!turrets[i]) continue; // was destroyed above

    // Fire at player
    if (now - turret.userData.lastShot > TURRET_FIRE_RATE) {
      turret.userData.lastShot = now;

      const fb = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xff8800, emissiveIntensity: 2 })
      );
      const cannonWorld = new THREE.Vector3();
      turret.userData.cannon.getWorldPosition(cannonWorld);
      fb.position.copy(cannonWorld);
      scene.add(fb);

      const dir = new THREE.Vector3().subVectors(player.position, cannonWorld).normalize();
      dir.x += (Math.random() - 0.5) * 0.5;
      dir.y += (Math.random() - 0.5) * 0.25;
      dir.normalize();
      enemyProjectiles.push({ mesh: fb, velocity: dir.multiplyScalar(12), life: 4.0 });
    }
  }

  // Update enemy projectiles
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const proj = enemyProjectiles[i];
    proj.mesh.position.add(proj.velocity.clone().multiplyScalar(delta));
    proj.life -= delta;

    if (proj.life <= 0) {
      scene.remove(proj.mesh);
      enemyProjectiles.splice(i, 1);
      continue;
    }

    // Check hit against each clone individually
    let hit = false;
    for (let j = playerClones.length - 1; j >= 0; j--) {
      const clone = playerClones[j];
      const dx = proj.mesh.position.x - clone.position.x;
      const dy = proj.mesh.position.y - clone.position.y;
      const dz = proj.mesh.position.z - clone.position.z;
      if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 1.0) {
        // Remove this specific clone
        scene.remove(clone);
        const mixerIndex = cloneMixers.indexOf(clone.userData.mixer);
        if (mixerIndex > -1) cloneMixers.splice(mixerIndex, 1);
        playerClones.splice(j, 1);
        updatePowerUiLabel();
        scene.remove(proj.mesh);
        enemyProjectiles.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // Check hit against main player
    const pdx = proj.mesh.position.x - player.position.x;
    const pdy = proj.mesh.position.y - player.position.y;
    const pdz = proj.mesh.position.z - player.position.z;
    if (Math.sqrt(pdx*pdx + pdy*pdy + pdz*pdz) < 1.0) {
      scene.remove(proj.mesh);
      enemyProjectiles.splice(i, 1);
      if (playerClones.length > 0) {
        // Absorb the hit with a clone
        const clone = playerClones.pop();
        scene.remove(clone);
        const mixerIndex = cloneMixers.indexOf(clone.userData.mixer);
        if (mixerIndex > -1) cloneMixers.splice(mixerIndex, 1);
        updatePowerUiLabel();
      } else {
        isDead = true;
        document.getElementById('ui').innerHTML = '<div style="font-size: 30px; color: red;">YOU DIED!</div><div style="font-size: 18px; margin-top: 10px;">Press R to restart</div>';
      }
    }
  }

  // Spawn and update speed power-ups
  if (Date.now() - lastSpeedPowerUpSpawn > speedPowerUpSpawnInterval) {
    spawnSpeedPowerUp();
    lastSpeedPowerUpSpawn = Date.now();
  }

  for (let i = speedPowerUps.length - 1; i >= 0; i--) {
    const orb = speedPowerUps[i];
    orb.position.z += roadSpeed;
    orb.rotation.y -= 0.05; // spin opposite direction to distinguish from fireball orb

    const collectors = [player, ...playerClones];
    const collected = collectors.some(c => {
      const dx = c.position.x - orb.position.x;
      const dz = c.position.z - orb.position.z;
      return Math.sqrt(dx * dx + dz * dz) < 1.2;
    });

    if (collected) {
      shootInterval = Math.max(100, shootInterval - 75);
      speedLevel++;
      updatePowerUiLabel();
      scene.remove(orb);
      speedPowerUps.splice(i, 1);
      continue;
    }

    if (orb.position.z > player.position.z + 20) {
      scene.remove(orb);
      speedPowerUps.splice(i, 1);
    }
  }

  // Update player clones to follow in circle formation
  for (let i = playerClones.length - 1; i >= 0; i--) {
    const clone = playerClones[i];

    // Check if clone is falling
    if (clone.userData.isFalling) {
      // Apply gravity
      clone.userData.fallSpeed += gravity;
      clone.position.y -= clone.userData.fallSpeed;

      // Remove clone if it falls too far
      if (clone.position.y < -10) {
        scene.remove(clone);

        // Remove mixer if exists
        const mixerIndex = cloneMixers.indexOf(clone.userData.mixer);
        if (mixerIndex > -1) {
          cloneMixers.splice(mixerIndex, 1);
        }

        playerClones.splice(i, 1);

        // Update UI
        const totalCubes = 1 + playerClones.length;
        updatePowerUiLabel();

        console.log('💀 Clone fell off! Remaining:', playerClones.length);
      }
      continue; // Skip normal movement for falling clones
    }

    // Target position relative to player
    const targetX = player.position.x + clone.targetX;
    const targetZ = player.position.z + clone.targetZ;
    const targetY = player.position.y;

    // Smoothly move to target position
    clone.position.x += (targetX - clone.position.x) * 0.15;
    clone.position.y += (targetY - clone.position.y) * 0.15;
    clone.position.z += (targetZ - clone.position.z) * 0.15;

    // Check if clone is off the road and on the ground
    if (!isPositionOnRoad(clone.position.x) && clone.position.y <= 0.6) {
      clone.userData.isFalling = true;
      clone.userData.fallSpeed = 0.05; // Start with a small initial fall speed
      console.log('⚠️ Clone is off road and starting to fall!');
    }
  }
  // Movement
  velocity.x = 0;
  velocity.z = 0;

  if (keys['w']) velocity.z = -moveSpeed;
  if (keys['s']) velocity.z = moveSpeed;
  if (keys['a']) velocity.x = -moveSpeed;
  if (keys['d']) velocity.x = moveSpeed;

  // Jump
  if (keys[' '] && !isJumping && player.position.y <= 0.5) {
    velocity.y = jumpForce;
    isJumping = true;
  }

  // Apply gravity
  velocity.y -= gravity;
  player.position.y += velocity.y;

  // Apply movement
  player.position.x += velocity.x;
  player.position.z += velocity.z;

  // Check if on road
  if (!isOnRoad() && player.position.y <= 0.5) {
    // Start falling
    velocity.y = -0.1;
  }

  // Ground collision (only if on road)
  if (player.position.y <= 0.5 && isOnRoad()) {
    player.position.y = 0.5;
    velocity.y = 0;
    isJumping = false;
  }

  // Death (fell below ground)
  if (player.position.y < -5) {
    isDead = true;
    document.getElementById('ui').innerHTML = '<div style="font-size: 30px; color: red;">YOU DIED!</div><div style="font-size: 18px; margin-top: 10px;">Press R to restart</div>';
  }

  // Camera follows player with FPS-style rotation
  const cameraDistance = 10;
  camera.position.x = player.position.x + Math.sin(cameraRotationY) * cameraDistance * Math.cos(cameraRotationX);
  camera.position.y = player.position.y + 5 + Math.sin(cameraRotationX) * cameraDistance;
  camera.position.z = player.position.z + Math.cos(cameraRotationY) * cameraDistance * Math.cos(cameraRotationX);
  camera.lookAt(player.position.x, player.position.y, player.position.z);

  renderer.render(scene, camera);
}

console.log('Starting animation loop');
animate();