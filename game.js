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

// Jump power-ups
const jumpPowerUps = [];
const jumpPowerUpSpawnInterval = 9000;
let lastJumpPowerUpSpawn = Date.now();

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
const TURRET_HEALTH = 60;
const damageNumbers = [];
const TURRET_FIRE_RATE = 3000; // ms
const PLATFORM_HALF = 8; // turret platform half-size, used for fence collision

// Side terrain patches (grass, water, road extensions)
const terrainPatches = [];
const TERRAIN_SPAWN_INTERVAL = 2500;
let lastTerrainSpawn = Date.now();

// Grass tufts (decorative, scroll with road)
const grassTufts = [];
const GRASS_SPAWN_INTERVAL = 800;
let lastGrassSpawn = Date.now();

// Roadside temples (decorative candle shrines, scroll with road)
const roadsideTemples = [];
const TEMPLE_SPAWN_INTERVAL = 14000;
let lastTempleSpawn = Date.now() - 12000; // spawn one soon after start
let nextTempleSide = 1;

// Stuck-safety tracking for player
let playerStuckTimer = 0;
const playerLastPos = new THREE.Vector3();

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

function showDamageNumber(position, amount) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const text = '-' + amount;
  ctx.font = 'bold 96px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 10;
  ctx.strokeText(text, 128, 64);
  ctx.fillStyle = amount >= 10 ? '#ffdd00' : '#ff2222';
  ctx.fillText(text, 128, 64);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
  }));
  // Scale proportional to damage magnitude
  const s = 1.5 + Math.min(amount * 0.08, 2.0);
  sprite.scale.set(s * 2, s, 1);
  sprite.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.5, 0));
  scene.add(sprite);
  damageNumbers.push({ sprite, life: 1.2 });
}

function createTurret(x, z, isRed = false) {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: isRed ? 0x7a2020 : 0x888880 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: isRed ? 0x4a1010 : 0x555550 });
  const roadMat  = new THREE.MeshStandardMaterial({ color: isRed ? 0x5a2010 : 0x50545A, side: THREE.DoubleSide });

  const addBox = (geo, mat, bx, by, bz) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(bx, by, bz);
    group.add(mesh);
    return mesh;
  };

  // Variable shaft height: between 5 and 11 units
  const shaftH = 5 + Math.random() * 6;
  const shaftTop = shaftH + 0.4; // top of shaft = foundation(0.4) + shaft

  // Large road patch under the tower
  const patchSize = 11;
  const patchHalf = patchSize / 2;
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(patchSize, patchSize), roadMat);
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(0, 0.01, 0);
  group.add(patch);

  // Fence on all 4 sides
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
  const postH = 1.4;
  const postY = postH / 2;

  const addFencePost = (fx, fz) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, postH, 0.18), fenceMat);
    post.position.set(fx, postY, fz);
    group.add(post);
  };
  const addRail = (rx, ry, rz, rw, rd) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.1, rd), fenceMat);
    rail.position.set(rx, ry, rz);
    group.add(rail);
  };

  // Along Z edges (front/back): posts stepping in X
  for (const fz of [-patchHalf, patchHalf]) {
    for (let fx = -patchHalf; fx <= patchHalf; fx += 2) addFencePost(fx, fz);
    addRail(0, postY * 1.5, fz, patchSize, 0.1);
    addRail(0, postY * 0.5, fz, patchSize, 0.1);
  }
  // Along X edges (left/right): posts stepping in Z, skip corners (already added)
  for (const fx of [-patchHalf, patchHalf]) {
    for (let fz = -patchHalf + 2; fz < patchHalf; fz += 2) addFencePost(fx, fz);
    addRail(fx, postY * 1.5, 0, 0.1, patchSize);
    addRail(fx, postY * 0.5, 0, 0.1, patchSize);
  }

  // Foundation slab
  addBox(new THREE.BoxGeometry(3.5, 0.4, 3.5), darkMat, 0, 0.2, 0);

  // Main tower shaft
  addBox(new THREE.BoxGeometry(1.8, shaftH, 1.8), stoneMat, 0, 0.4 + shaftH / 2, 0);

  // Watch room
  addBox(new THREE.BoxGeometry(3.2, 1.4, 3.2), stoneMat, 0, shaftTop + 0.7, 0);

  // Dark floor inset
  addBox(new THREE.BoxGeometry(2.7, 0.1, 2.7), darkMat, 0, shaftTop + 0.05, 0);

  // Battlements — 4 corner merlons
  const merlon = new THREE.BoxGeometry(0.6, 0.9, 0.6);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([mx, mz]) => {
    addBox(merlon, stoneMat, mx * 1.1, shaftTop + 1.85, mz * 1.1);
  });

  // Cannon orb
  const cannonColor = isRed ? 0xff6600 : 0xff2200;
  const cannon = new THREE.Mesh(
    new THREE.SphereGeometry(isRed ? 0.42 : 0.3, 8, 8),
    new THREE.MeshStandardMaterial({ color: cannonColor, emissive: cannonColor, emissiveIntensity: isRed ? 3 : 1.8 })
  );
  cannon.position.y = shaftTop + 0.75;
  group.add(cannon);

  // Health label — floats above battlements
  const healthCanvas = document.createElement('canvas');
  healthCanvas.width = 128;
  healthCanvas.height = 48;
  const healthLabel = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(healthCanvas),
    transparent: true,
    depthWrite: false,
  }));
  healthLabel.scale.set(2.5, 0.9, 1);
  healthLabel.position.y = shaftTop + 3.5;
  group.add(healthLabel);

  group.position.set(x, 0, z);
  const maxHp = isRed ? Math.round(TURRET_HEALTH * 1.5) : TURRET_HEALTH;
  group.userData.health = maxHp;
  group.userData.maxHealth = maxHp;
  group.userData.lastShot = Date.now() + 1500;
  group.userData.cannon = cannon;
  group.userData.healthLabel = healthLabel;
  group.userData.healthCanvas = healthCanvas;
  group.userData.towerTop = shaftTop + 2.5; // for hitbox upper bound
  group.userData.fireRate = isRed ? Math.round(TURRET_FIRE_RATE / 3) : TURRET_FIRE_RATE;
  group.userData.isRed = isRed;

  updateTurretHealthLabel(group);

  scene.add(group);
  return group;
}

function updateTurretHealthLabel(turret) {
  const canvas = turret.userData.healthCanvas;
  const ctx = canvas.getContext('2d');
  const hp = turret.userData.health;
  const pct = hp / turret.userData.maxHealth;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background box
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 128, 48);
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, 126, 46);

  // Health bar
  const barColor = pct > 0.5 ? '#00cc44' : pct > 0.25 ? '#ffaa00' : '#ff2222';
  ctx.fillStyle = barColor;
  ctx.fillRect(6, 28, Math.round(116 * pct), 13);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(6, 28, 116, 13);

  // HP text
  ctx.font = 'bold 14px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(`HP: ${hp}/${turret.userData.maxHealth}`, 64, 16);
  ctx.fillText(`HP: ${hp}/${turret.userData.maxHealth}`, 64, 16);

  turret.userData.healthLabel.material.map.needsUpdate = true;
}

const TURRET_SPAWN_MIN = 4000;
const TURRET_SPAWN_MAX = 10000;
let lastTurretSpawn = Date.now();
let nextTurretInterval = 5000;

// Zombie Leibs — shamble in from the grass toward the road
const zombies = [];
const ZOMBIE_HEALTH = 3;
const ZOMBIE_SPEED = 0.012; // lateral inward speed per frame
const ZOMBIE_SPAWN_MIN = 3000;
const ZOMBIE_SPAWN_MAX = 7000;
let lastZombieSpawn = Date.now();
let nextZombieInterval = 4000;

function spawnTurret() {
  const side = Math.random() < 0.5 ? -11 : 11;
  const isRed = Math.random() < 1 / 12;
  turrets.push(createTurret(side, player.position.z - 75, isRed));
  nextTurretInterval = TURRET_SPAWN_MIN + Math.random() * (TURRET_SPAWN_MAX - TURRET_SPAWN_MIN);
}

function createZombie(side, z) {
  const group = new THREE.Group();

  // Body
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1b, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4), bodyMat);
  body.position.y = 1.3;
  group.add(body);

  // Head
  const headMat = new THREE.MeshStandardMaterial({ color: 0x4a7a30, roughness: 0.8 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 7), headMat);
  head.position.y = 2.2;
  group.add(head);

  // Eyes (glowing red)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 5), eyeMat);
  eyeL.position.set(-0.13, 2.22, 0.28);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 5), eyeMat);
  eyeR.position.set(0.13, 2.22, 0.28);
  group.add(eyeL, eyeR);

  // Arms (outstretched toward road)
  const armMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1b, roughness: 0.9 });
  const armGeom = new THREE.BoxGeometry(0.25, 0.25, 0.8);
  const armL = new THREE.Mesh(armGeom, armMat);
  armL.position.set(-0.55, 1.5, 0.35);
  const armR = new THREE.Mesh(armGeom, armMat);
  armR.position.set(0.55, 1.5, 0.35);
  group.add(armL, armR);

  // Legs
  const legGeom = new THREE.BoxGeometry(0.28, 0.9, 0.3);
  const legL = new THREE.Mesh(legGeom, bodyMat);
  legL.position.set(-0.2, 0.45, 0);
  const legR = new THREE.Mesh(legGeom, bodyMat);
  legR.position.set(0.2, 0.45, 0);
  group.add(legL, legR);

  // Spawn on the grass, facing inward
  const spawnX = side * (roadHalfWidth + 8 + Math.random() * 12);
  group.position.set(spawnX, 0, z);
  group.rotation.y = side > 0 ? Math.PI : 0; // face the road

  group.userData = {
    health: ZOMBIE_HEALTH,
    side,       // -1 or +1 direction of inward movement
    legL, legR,
    legPhase: Math.random() * Math.PI * 2,
  };

  scene.add(group);
  return group;
}

function spawnZombie() {
  // Spawn 1–2 zombies on random or both sides
  const count = Math.random() < 0.4 ? 2 : 1;
  const z = player.position.z - 80;
  if (count === 2) {
    zombies.push(createZombie(-1, z));
    zombies.push(createZombie(1, z + (Math.random() - 0.5) * 20));
  } else {
    const side = Math.random() < 0.5 ? -1 : 1;
    zombies.push(createZombie(side, z));
  }
  nextZombieInterval = ZOMBIE_SPAWN_MIN + Math.random() * (ZOMBIE_SPAWN_MAX - ZOMBIE_SPAWN_MIN);
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

  // Skip if a turret is too close at this Z
  const nearTurret = turrets.some(t => Math.abs(t.position.z - spawnZ) < PLATFORM_HALF + 6);
  if (nearTurret) return;

  // Gate half-width is 3.5; keep pillars inside road (±9.5), so centers in [-6, 6].
  // Split road into left [-6, -1] and right [1, 6] halves so 2 gates never overlap.
  const GATE_HALF = 3.75; // slight buffer beyond pillar offset
  const leftX  = -(GATE_HALF + Math.random() * (6 - GATE_HALF));   // ~[-6, -3.75]
  const rightX =   GATE_HALF + Math.random() * (6 - GATE_HALF);    // ~[3.75,  6]

  const count = Math.random() < 0.35 ? 1 : 2; // 35% chance for single gate
  const singleX = (Math.random() - 0.5) * (12 - GATE_HALF * 2); // centered on road

  if (count === 1) {
    const v = randomGoalValue();
    goalPosts.push(createGoalPost(singleX, spawnZ, v.value >= 0 ? 0x00ffcc : 0xff4444, v.value, v.label));
  } else {
    const left = randomGoalValue();
    const right = randomGoalValue();
    goalPosts.push(createGoalPost(leftX,  spawnZ, left.value  >= 0 ? 0x0088ff : 0xff4444, left.value,  left.label));
    goalPosts.push(createGoalPost(rightX, spawnZ, right.value >= 0 ? 0x00ff88 : 0xff4444, right.value, right.label));
  }
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

function createJumpPowerUp(x, z) {
  const orb = new THREE.Group();

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x00ee44, emissive: 0x00aa22, emissiveIntensity: 1.5 })
  );
  orb.add(mesh);

  // Ring tilted 45° to distinguish from other orbs
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.08, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x88ff44, emissive: 0x88ff44, emissiveIntensity: 2 })
  );
  ring.rotation.x = Math.PI / 4;
  orb.add(ring);

  orb.position.set(x, 1.2, z);
  scene.add(orb);
  return orb;
}

function spawnJumpPowerUp() {
  const spawnZ = player.position.z - 50;
  const x = (Math.random() * (roadWidth - 2)) - (roadWidth / 2 - 1);
  jumpPowerUps.push(createJumpPowerUp(x, spawnZ));
}


function updatePowerUiLabel() {
  const ui = document.getElementById('ui');
  const q = (cls) => ui.querySelector(cls + ' span');
  if (q('.char-count'))  q('.char-count').textContent  = isGiant ? `GIANT (${giantHp}hp)` : 1 + playerClones.length;
  if (q('.power-level')) q('.power-level').textContent = fireballPower;
  if (q('.speed-level')) q('.speed-level').textContent = speedLevel;
  if (q('.jump-level'))  q('.jump-level').textContent  = maxJumps;
}

function showGameOver() {
  const overlay = document.getElementById('gameover-overlay');
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div style="text-align:center;">
      <div style="font-family:'Courier New',monospace;font-size:72px;font-weight:bold;
                  color:#fff;text-shadow:0 0 30px rgba(255,60,60,0.8),0 4px 12px rgba(0,0,0,0.9);
                  letter-spacing:0.04em;">GAME OVER</div>
      <div style="font-family:'Courier New',monospace;font-size:28px;color:rgba(255,255,255,0.75);
                  margin-top:24px;letter-spacing:0.08em;">PRESS R TO RESET</div>
      <a href="https://buymeacoffee.com/wytzig" target="_blank"
         style="display:inline-block;margin-top:36px;padding:14px 28px;
                background:#FFDD00;color:#1a0a00;
                font-family:'Courier New',monospace;font-size:20px;font-weight:bold;
                border-radius:10px;text-decoration:none;letter-spacing:0.04em;
                box-shadow:0 0 24px rgba(255,220,0,0.7),0 4px 12px rgba(0,0,0,0.5);
                pointer-events:all;cursor:pointer;">
        ☕ Buy me a coffee
      </a>
    </div>`;
}

// --- Fence collision ---
// Returns true if the position was pushed (entity was inside a fence box)
function applyFenceCollision(pos) {
  // Only applies when off the main road
  if (Math.abs(pos.x) <= roadHalfWidth) return false;

  let pushed = false;
  for (const turret of turrets) {
    const tx = turret.position.x;
    const tz = turret.position.z;
    const inX = pos.x > tx - PLATFORM_HALF && pos.x < tx + PLATFORM_HALF;
    const inZ = pos.z > tz - PLATFORM_HALF && pos.z < tz + PLATFORM_HALF;
    if (!inX || !inZ) continue;

    // Find the wall with least penetration and push out through it
    const walls = [
      { axis: 'x', target: tx - PLATFORM_HALF, depth: pos.x - (tx - PLATFORM_HALF) },
      { axis: 'x', target: tx + PLATFORM_HALF, depth: (tx + PLATFORM_HALF) - pos.x },
      { axis: 'z', target: tz - PLATFORM_HALF, depth: pos.z - (tz - PLATFORM_HALF) },
      { axis: 'z', target: tz + PLATFORM_HALF, depth: (tz + PLATFORM_HALF) - pos.z },
    ];
    const nearest = walls.reduce((a, b) => a.depth < b.depth ? a : b);
    pos[nearest.axis] = nearest.target;
    pushed = true;
  }
  return pushed;
}

// --- Terrain patch creation ---
function createHolePatch(x, z, w, d) {
  const group = new THREE.Group();

  // Dark hole surface (slightly above road so it visually overwrites it)
  const holeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: 0x080808 })
  );
  holeMesh.rotation.x = -Math.PI / 2;
  holeMesh.position.y = 0.06;
  group.add(holeMesh);

  // Road works: orange cones at corners
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 0.4 });
  const coneGeo = new THREE.ConeGeometry(0.18, 0.55, 6);
  const corners = [
    [-w / 2 - 0.3, -d / 2 - 0.3],
    [ w / 2 + 0.3, -d / 2 - 0.3],
    [-w / 2 - 0.3,  d / 2 + 0.3],
    [ w / 2 + 0.3,  d / 2 + 0.3],
  ];
  corners.forEach(([cx, cz]) => {
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(cx, 0.28, cz);
    group.add(cone);
  });

  // Warning sign (yellow board on a stick)
  const stickMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), stickMat);
  stick.position.set(0, 0.45, -d / 2 - 0.5);
  group.add(stick);

  const signMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.5 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.06), signMat);
  sign.position.set(0, 1.05, -d / 2 - 0.5);
  group.add(sign);

  group.position.set(x, 0, z);
  scene.add(group);

  return { mesh: group, holeMesh, type: 'hole', w, d };
}

function createGrassTuftCluster(cx, cz) {
  const group = new THREE.Group();
  const count = 6 + Math.floor(Math.random() * 8);
  const greenShades = [0x2e7d22, 0x3a9630, 0x4db840, 0x256b1a, 0x61c44d];
  for (let i = 0; i < count; i++) {
    const h = 0.25 + Math.random() * 0.45;
    const w = 0.06 + Math.random() * 0.07;
    const mat = new THREE.MeshStandardMaterial({ color: greenShades[Math.floor(Math.random() * greenShades.length)] });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.5), mat);
    blade.position.set(
      (Math.random() - 0.5) * 2.2,
      h / 2,
      (Math.random() - 0.5) * 2.2
    );
    blade.rotation.y = Math.random() * Math.PI;
    blade.rotation.z = (Math.random() - 0.5) * 0.4;
    group.add(blade);
  }
  group.position.set(cx, 0, cz);
  scene.add(group);
  return group;
}

function spawnGrassTufts() {
  const spawnZ = player.position.z - 70;
  const clusterCount = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < clusterCount; i++) {
    // Place clusters in the grass zones on both sides
    const side = Math.random() < 0.5 ? -1 : 1;
    const cx = side * (roadHalfWidth + 3 + Math.random() * 55);
    const cz = spawnZ + (Math.random() - 0.5) * 30;
    grassTufts.push(createGrassTuftCluster(cx, cz));
  }
}

function createRoadsideTemple(side, z) {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9e8d7a, roughness: 0.95 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x6b5c4e, roughness: 0.9 });
  const mossyMat = new THREE.MeshStandardMaterial({ color: 0x5c7545, roughness: 1.0 });

  // Base platform
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.25, 3.5), stoneMat);
  base.position.y = 0.125;
  group.add(base);

  // Step up
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 2.8), stoneMat);
  step.position.y = 0.35;
  group.add(step);

  // 4 corner pillars
  const pillarGeo = new THREE.BoxGeometry(0.28, 1.4, 0.28);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([px, pz]) => {
    const p = new THREE.Mesh(pillarGeo, stoneMat);
    p.position.set(px * 1.0, 0.35 + 0.7, pz * 1.0);
    group.add(p);
  });

  // Roof slab (mossy top)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 3.0), mossyMat);
  roof.position.y = 0.35 + 1.4 + 0.1;
  group.add(roof);

  // Small altar stone in center
  const altar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.7), darkMat);
  altar.position.y = 0.35 + 0.175;
  group.add(altar);

  // Candles (2–4 on the platform)
  const candleCount = 2 + Math.floor(Math.random() * 3);
  const candlePositions = [
    [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7], [0, 0.5]
  ];
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xff8800, emissive: 0xff6600, emissiveIntensity: 3,
    transparent: true, opacity: 0.9
  });
  const waxMat = new THREE.MeshStandardMaterial({ color: 0xf0e8c8 });
  for (let i = 0; i < candleCount; i++) {
    const [cpx, cpz] = candlePositions[i];
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 6), waxMat);
    candle.position.set(cpx, 0.35 + 0.175, cpz);
    group.add(candle);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), flameMat);
    flame.position.set(cpx, 0.35 + 0.36, cpz);
    group.add(flame);
  }

  const xPos = side * (roadHalfWidth + 3.5);
  group.position.set(xPos, 0, z);
  scene.add(group);
  return group;
}

function spawnRoadsideTemple() {
  const z = player.position.z - 80;
  roadsideTemples.push(createRoadsideTemple(nextTempleSide, z));
  nextTempleSide *= -1;
}

function spawnTerrainPatches() {
  const spawnZ = player.position.z - 60;

  // Road hole only — skip if near a turret platform
  if (Math.random() < 0.15) {
    const nearTurret = turrets.some(t => Math.abs(t.position.z - spawnZ) < PLATFORM_HALF + 5);
    if (!nearTurret) {
      const holeW = 2 + Math.random() * 7;
      const holeD = 2 + Math.random() * 7;
      const holeX = (Math.random() - 0.5) * (roadWidth - holeW - 2);
      terrainPatches.push(createHolePatch(holeX, spawnZ, holeW, holeD));
    }
  }
}

/// Tier 1: power 1-7  (orange), Tier 2: power 8-22 (blue), Tier 3: power 23+ (purple)
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
let maxJumps = 1;
let jumpsRemaining = 1;
let spaceWasDown = false;
let isDead = false;
let isGiant = false;
let giantHp = 0;
let giantMaxHp = 0;
const GIANT_THRESHOLD = 10; // total Leibs (player + clones) to trigger merge
const moveSpeed = 0.15;
const jumpForce = 0.3;
const gravity = 0.015;
const roadHalfWidth = roadWidth / 2;

// Continuous grass on both sides (recycles like road segments)
const grassSegments = [];
const grassMat = new THREE.MeshStandardMaterial({ color: 0x3a7d2c });
const grassWidth = 160;
for (let i = 0; i < segmentCount; i++) {
  [-1, 1].forEach(side => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(grassWidth, segmentLength), grassMat);
    g.rotation.x = -Math.PI / 2;
    g.position.set(side * (roadHalfWidth + grassWidth / 2), -0.01, -segmentLength / 2 + i * segmentLength);
    scene.add(g);
    grassSegments.push(g);
  });
}

// --- Music ---
const bgMusic = new Audio('Abyss Bounce.wav');
bgMusic.loop = true;
bgMusic.volume = 0.5;

let musicMuted = false;
try {
  const saved = localStorage.getItem('leib_music_muted');
  if (saved === 'true') { musicMuted = true; bgMusic.muted = true; }
} catch(e) {}
// Sync button label once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('music-btn');
  if (btn) btn.textContent = musicMuted ? '🔇' : '🔊';
});

function startMusic() {
  bgMusic.play().catch(() => {});
}

window.toggleMusic = function toggleMusic() {
  musicMuted = !musicMuted;
  bgMusic.muted = musicMuted;
  try { localStorage.setItem('leib_music_muted', musicMuted); } catch(e) {}
  const btn = document.getElementById('music-btn');
  if (btn) btn.textContent = musicMuted ? '🔇' : '🔊';
};

// Start music on first user interaction (browser autoplay policy)
document.addEventListener('click', startMusic, { once: true });
document.addEventListener('keydown', startMusic, { once: true });

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
  return isOnSolidGround(player.position.x, player.position.z);
}
function isPositionOnRoad(x) {
  return Math.abs(x) <= roadHalfWidth;
}

// Grass covers everything — only holes break the ground
function isOnSolidGround(x, z) {
  for (const p of terrainPatches) {
    if (p.type !== 'hole') continue;
    const px = p.mesh.position.x;
    const pz = p.mesh.position.z;
    if (Math.abs(x - px) < p.w / 2 && Math.abs(z - pz) < p.d / 2) return false;
  }
  return true;
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

  // Check if giant threshold reached
  if (!isGiant && 1 + playerClones.length >= GIANT_THRESHOLD) {
    activateGiantMode();
  }
}

function activateGiantMode() {
  const mergedCount = playerClones.length;

  // Remove all clones
  for (const clone of playerClones) {
    scene.remove(clone);
  }
  playerClones.length = 0;
  cloneMixers.length = 0;

  // Scale up player
  player.scale.set(1.4, 1.4, 1.4);

  isGiant = true;
  giantMaxHp = 10; // always 10 hits to shrink back
  giantHp = 10;

  updatePowerUiLabel();
  showGiantMessage();
}

function deactivateGiantMode() {
  isGiant = false;
  giantHp = 0;
  giantMaxHp = 0;
  player.scale.set(1, 1, 1);
  updatePowerUiLabel();
}

function takeDamageGiant() {
  giantHp--;
  const s = 1 + 0.04 * giantHp; // 10 hits → 1.4 down to 1.0
  player.scale.set(s, s, s);
  updatePowerUiLabel();
  if (giantHp <= 0) {
    deactivateGiantMode();
  }
}

function showGiantMessage() {
  const msg = document.createElement('div');
  msg.textContent = '⚡ GIANT MODE! ⚡';
  msg.style.cssText = `
    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    font-family:'Courier New',monospace; font-size:42px; font-weight:bold;
    color:#ffdd00; text-shadow:0 0 20px #ff8800, 0 0 40px #ff4400;
    z-index:300; pointer-events:none; white-space:nowrap;
    animation: giantFade 2s ease-out forwards;
  `;
  document.body.appendChild(msg);
  // Inject keyframe if not already present
  if (!document.getElementById('giant-keyframe')) {
    const style = document.createElement('style');
    style.id = 'giant-keyframe';
    style.textContent = `@keyframes giantFade { 0%{opacity:1;transform:translate(-50%,-50%) scale(1)} 60%{opacity:1;transform:translate(-50%,-60%) scale(1.15)} 100%{opacity:0;transform:translate(-50%,-80%) scale(1.2)} }`;
    document.head.appendChild(style);
  }
  setTimeout(() => msg.remove(), 2000);
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
    lastGoalSpawn = Date.now();
  }

  if (Date.now() - lastTurretSpawn > nextTurretInterval) {
    spawnTurret();
    lastTurretSpawn = Date.now();
  }

  if (Date.now() - lastZombieSpawn > nextZombieInterval) {
    spawnZombie();
    lastZombieSpawn = Date.now();
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

  // Scroll grass segments
  for (const g of grassSegments) {
    g.position.z += roadSpeed;
    if (g.position.z > camera.position.z + segmentLength * 2) {
      g.position.z -= segmentLength * segmentCount;
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
      isGrounded: player.position.y <= 0.5 * player.scale.y,
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

  // Update floating damage numbers
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const dn = damageNumbers[i];
    dn.life -= delta;
    dn.sprite.position.y += 0.04;
    dn.sprite.material.opacity = dn.life;
    if (dn.life <= 0) {
      scene.remove(dn.sprite);
      damageNumbers.splice(i, 1);
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

    // Check hits from player projectiles — full tower body hitbox
    for (let j = projectiles.length - 1; j >= 0; j--) {
      const proj = projectiles[j];
      const dx = proj.mesh.position.x - turret.position.x;
      const dz = proj.mesh.position.z - turret.position.z;
      const horizDist = Math.sqrt(dx*dx + dz*dz);
      const projY = proj.mesh.position.y - turret.position.y;
      const hitsBody = horizDist < 1.8 && projY >= 0 && projY <= turret.userData.towerTop;
      if (hitsBody) {
        turret.userData.health--;
        showDamageNumber(proj.mesh.position.clone(), 1);
        updateTurretHealthLabel(turret);
        scene.remove(proj.mesh);
        projectiles.splice(j, 1);

        // Flash cannon on hit
        turret.userData.cannon.material.emissiveIntensity = 4;
        setTimeout(() => {
          if (turret.userData.cannon.material) turret.userData.cannon.material.emissiveIntensity = 1.8;
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
    if (now - turret.userData.lastShot > turret.userData.fireRate) {
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
    const playerHitRadius = isGiant ? 2.5 : 1.0;
    if (Math.sqrt(pdx*pdx + pdy*pdy + pdz*pdz) < playerHitRadius) {
      scene.remove(proj.mesh);
      enemyProjectiles.splice(i, 1);
      if (isGiant) {
        takeDamageGiant();
      } else if (playerClones.length > 0) {
        // Absorb the hit with a clone
        const clone = playerClones.pop();
        scene.remove(clone);
        const mixerIndex = cloneMixers.indexOf(clone.userData.mixer);
        if (mixerIndex > -1) cloneMixers.splice(mixerIndex, 1);
        updatePowerUiLabel();
      } else {
        isDead = true;
        showGameOver();
      }
    }
  }

  // Update zombie leibs
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];

    // Scroll with road
    z.position.z += roadSpeed;

    // Shamble inward (toward road center)
    z.position.x -= z.userData.side * ZOMBIE_SPEED;

    // Animate legs (rock back and forth)
    z.userData.legPhase += 0.12;
    z.userData.legL.rotation.x = Math.sin(z.userData.legPhase) * 0.5;
    z.userData.legR.rotation.x = -Math.sin(z.userData.legPhase) * 0.5;
    // Slight body bob
    z.position.y = Math.abs(Math.sin(z.userData.legPhase)) * 0.08;

    // Remove if scrolled past player or wandered too far past road center
    if (z.position.z > player.position.z + 25 || Math.abs(z.position.x) > roadHalfWidth + 80) {
      scene.remove(z);
      zombies.splice(i, 1);
      continue;
    }

    // Check if zombie is hit by player projectiles
    let destroyed = false;
    for (let j = projectiles.length - 1; j >= 0; j--) {
      const proj = projectiles[j];
      const dx = proj.mesh.position.x - z.position.x;
      const dy = proj.mesh.position.y - z.position.y - 1.3;
      const dz = proj.mesh.position.z - z.position.z;
      if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 1.1) {
        z.userData.health--;
        showDamageNumber(proj.mesh.position.clone(), 1);
        scene.remove(proj.mesh);
        projectiles.splice(j, 1);
        if (z.userData.health <= 0) {
          scene.remove(z);
          zombies.splice(i, 1);
          destroyed = true;
          break;
        }
        // Flash red on hit
        z.traverse(child => {
          if (child.isMesh && child.material.color) {
            child.material.emissive = new THREE.Color(0xff0000);
            child.material.emissiveIntensity = 2;
            setTimeout(() => {
              if (child.material) { child.material.emissive.set(0x000000); child.material.emissiveIntensity = 0; }
            }, 120);
          }
        });
        break;
      }
    }
    if (destroyed) continue;

    // Check if zombie touches player or a clone
    const targets = isGiant ? [player] : [player, ...playerClones];
    for (let t = targets.length - 1; t >= 0; t--) {
      const tgt = targets[t];
      const dx = z.position.x - tgt.position.x;
      const dz2 = z.position.z - tgt.position.z;
      const zombieHitRadius = isGiant ? 2.5 : 1.2;
      if (Math.sqrt(dx*dx + dz2*dz2) < zombieHitRadius) {
        scene.remove(z);
        zombies.splice(i, 1);
        destroyed = true;
        if (isGiant) {
          takeDamageGiant();
        } else if (t === 0 && playerClones.length === 0) {
          isDead = true;
          showGameOver();
        } else if (t === 0) {
          const clone = playerClones.pop();
          scene.remove(clone);
          const mixerIdx = cloneMixers.indexOf(clone.userData.mixer);
          if (mixerIdx > -1) cloneMixers.splice(mixerIdx, 1);
          updatePowerUiLabel();
        } else {
          const clone = playerClones[t - 1];
          scene.remove(clone);
          const mixerIdx = cloneMixers.indexOf(clone.userData.mixer);
          if (mixerIdx > -1) cloneMixers.splice(mixerIdx, 1);
          playerClones.splice(t - 1, 1);
          updatePowerUiLabel();
        }
        break;
      }
    }
    if (destroyed) continue;
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

  // Spawn and update jump power-ups
  if (Date.now() - lastJumpPowerUpSpawn > jumpPowerUpSpawnInterval) {
    spawnJumpPowerUp();
    lastJumpPowerUpSpawn = Date.now();
  }

  for (let i = jumpPowerUps.length - 1; i >= 0; i--) {
    const orb = jumpPowerUps[i];
    orb.position.z += roadSpeed;
    orb.rotation.y += 0.04;

    const collectors = [player, ...playerClones];
    const collected = collectors.some(c => {
      const dx = c.position.x - orb.position.x;
      const dz = c.position.z - orb.position.z;
      return Math.sqrt(dx * dx + dz * dz) < 1.2;
    });

    if (collected) {
      maxJumps++;
      jumpsRemaining = maxJumps;
      updatePowerUiLabel();
      scene.remove(orb);
      jumpPowerUps.splice(i, 1);
      continue;
    }

    if (orb.position.z > player.position.z + 20) {
      scene.remove(orb);
      jumpPowerUps.splice(i, 1);
    }
  }

  // Spawn and update terrain patches
  if (Date.now() - lastTerrainSpawn > TERRAIN_SPAWN_INTERVAL) {
    spawnTerrainPatches();
    lastTerrainSpawn = Date.now();
  }

  for (let i = terrainPatches.length - 1; i >= 0; i--) {
    const p = terrainPatches[i];
    p.mesh.position.z += roadSpeed;

    // Holes: isOnSolidGround handles the fall trigger via player movement logic.
    // Nothing extra needed here — the hole group just scrolls.

    if (p.mesh.position.z > player.position.z + 30) {
      scene.remove(p.mesh);
      terrainPatches.splice(i, 1);
    }
  }

  // Spawn and scroll grass tufts
  if (Date.now() - lastGrassSpawn > GRASS_SPAWN_INTERVAL) {
    spawnGrassTufts();
    lastGrassSpawn = Date.now();
  }
  for (let i = grassTufts.length - 1; i >= 0; i--) {
    grassTufts[i].position.z += roadSpeed;
    if (grassTufts[i].position.z > player.position.z + 30) {
      scene.remove(grassTufts[i]);
      grassTufts.splice(i, 1);
    }
  }

  // Spawn and scroll roadside temples
  if (Date.now() - lastTempleSpawn > TEMPLE_SPAWN_INTERVAL) {
    spawnRoadsideTemple();
    lastTempleSpawn = Date.now();
  }
  for (let i = roadsideTemples.length - 1; i >= 0; i--) {
    roadsideTemples[i].position.z += roadSpeed;
    if (roadsideTemples[i].position.z > player.position.z + 30) {
      scene.remove(roadsideTemples[i]);
      roadsideTemples.splice(i, 1);
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

    // Fence collision for clone
    applyFenceCollision(clone.position);

    // Stuck safety: remove clone if it hasn't moved in 3s
    if (!clone.userData.lastPos) clone.userData.lastPos = clone.position.clone();
    if (!clone.userData.stuckTimer) clone.userData.stuckTimer = 0;
    if (clone.position.distanceTo(clone.userData.lastPos) > 0.05) {
      clone.userData.lastPos.copy(clone.position);
      clone.userData.stuckTimer = 0;
    } else {
      clone.userData.stuckTimer += delta;
      if (clone.userData.stuckTimer > 3) {
        // Remove stuck clone
        scene.remove(clone);
        const mi = cloneMixers.indexOf(clone.userData.mixer);
        if (mi > -1) cloneMixers.splice(mi, 1);
        playerClones.splice(i, 1);
        updatePowerUiLabel();
        continue;
      }
    }

    // Check if clone is off solid ground
    if (!isOnSolidGround(clone.position.x, clone.position.z) && clone.position.y <= 0.6) {
      clone.userData.isFalling = true;
      clone.userData.fallSpeed = 0.05;
    }
  }
  // Movement
  velocity.x = 0;
  velocity.z = 0;

  if (keys['w']) velocity.z = -moveSpeed;
  if (keys['s']) velocity.z = moveSpeed;
  if (keys['a']) velocity.x = -moveSpeed;
  if (keys['d']) velocity.x = moveSpeed;

  // Jump (edge-triggered so holding space doesn't consume all jumps instantly)
  const spaceDown = keys[' '];
  if (spaceDown && !spaceWasDown && jumpsRemaining > 0) {
    velocity.y = jumpForce;
    jumpsRemaining--;
    isJumping = true;
  }
  spaceWasDown = spaceDown;

  // Apply gravity
  velocity.y -= gravity;
  player.position.y += velocity.y;

  // Apply movement
  player.position.x += velocity.x;
  player.position.z += velocity.z;

  // Fence collision for player
  applyFenceCollision(player.position);

  // Stuck safety: if player hasn't moved in 3s, push back toward road center
  if (player.position.distanceTo(playerLastPos) > 0.05) {
    playerLastPos.copy(player.position);
    playerStuckTimer = 0;
  } else {
    playerStuckTimer += delta;
    if (playerStuckTimer > 3) {
      player.position.x *= 0.85; // nudge toward x=0
      playerStuckTimer = 0;
    }
  }

  // Check if on solid ground (snap height scales with player to avoid model clipping into road)
  const groundSnap = 0.5 * player.scale.y;
  const onGround = isOnSolidGround(player.position.x, player.position.z);
  if (!onGround && player.position.y <= groundSnap) {
    velocity.y = -0.1;
  }

  if (player.position.y <= groundSnap && player.position.y > -0.4 && onGround) {
    player.position.y = groundSnap;
    velocity.y = 0;
    isJumping = false;
    jumpsRemaining = maxJumps;
  }

  // Death (fell below ground)
  if (player.position.y < -5) {
    isDead = true;
    showGameOver();
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