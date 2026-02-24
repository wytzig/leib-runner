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

// Player clones (for multiplication effect)
const playerClones = [];
const cloneMixers = [];

// Goal posts system
const goalPosts = [];
const goalSpawnInterval = 8000; // 8 seconds
let lastGoalSpawn = Date.now();

function createGoalPost(x, z, color, multiplier) {
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
  context.fillText('+' + multiplier, 128, 64);

  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  const labelMaterial = new THREE.SpriteMaterial({ map: texture });
  const label = new THREE.Sprite(labelMaterial);
  label.scale.set(3, 1.5, 1);
  label.position.set(0, 2.5, 0);
  post.add(label);

  post.position.set(x, 0, z);
  post.userData.multiplier = multiplier;
  post.userData.color = color;
  post.userData.triggered = false;

  scene.add(post);
  return post;
}

function spawnGoalPosts() {
  const spawnZ = player.position.z - 50; // Spawn 50 units ahead

  // Blue goal on the left (+2)
  const blueGoal = createGoalPost(-5, spawnZ, 0x0088ff, 2);
  goalPosts.push(blueGoal);

  // Green goal on the right (+4)
  const greenGoal = createGoalPost(5, spawnZ, 0x00ff88, 4);
  goalPosts.push(greenGoal);
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

      // Add two overlapping flame sprites
      for (let i = 0; i < 2; i++) {
        const sprite = new THREE.Sprite(flameMaterial.clone());
        sprite.scale.set(0.5 + Math.random() * 0.3, 0.5 + Math.random() * 0.3, 1);
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
        velocity: dir.multiplyScalar(30),
        life: 2.0
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
    cameraRotationY += e.movementX * mouseSensitivity;
    cameraRotationX += e.movementY * mouseSensitivity;

    // Limit vertical rotation
    cameraRotationX = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraRotationX));
  }
});

// Mouse shooting
document.addEventListener('mousedown', (e) => {
  if (isDead) return;

  // Left mouse button = Shoot
  if (e.button === 0) {
    // Player shoots
    performShoot(player.position, true);

    // All clones shoot too
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
  document.getElementById('ui').innerHTML = `<div style="font-size: 24px;">Characters: ${totalCubes}</div>`;
}



// Game loop
function animate() {
  requestAnimationFrame(animate);

  const delta = 0.016;

  // move all playerclones
  for (const mixer of cloneMixers) {
    mixer.update(delta);
  }

  // Spawn goal posts periodically
  if (Date.now() - lastGoalSpawn > goalSpawnInterval) {
    spawnGoalPosts();
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
        document.getElementById('ui').innerHTML = `<div style="font-size: 24px;">Characters: ${totalCubes}</div>`;

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