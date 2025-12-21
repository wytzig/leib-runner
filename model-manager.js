import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/DRACOLoader.js';
const ASSET_BASE_URL = 'https://MaxTomahawk.github.io/leibgame-assets/assets/';

export const MODEL_SCALES = {
    'assets/katinka.glb': 1,
    'assets/marco.glb': 1,
    'assets/leib.glb': 1,
};

export class ModelManager {
    constructor() {
        this.mixer = null;
        this.animations = {};
        this.currentAction = null; // Houdt nu ALLEEN de base-layer bij (Idle, Walk, Run)
        this.currentAnimation = '';
        this.loader = new GLTFLoader();
        this.playerModel = null;
        this.isLanding = false;
        this.isAttacking = false; // Alleen voor cooldown
        this.loader = new GLTFLoader();

        // Setup Draco Loader
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.loader.setDRACOLoader(dracoLoader);
    }

    async loadPlayerModel(modelFile, player, callbacks = {}) {
        const { onProgress, onLoaded, onError } = callbacks;

        let quality = 'high';
        try {
            const saved = localStorage.getItem('leib_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.graphics) quality = parsed.graphics;
            }
        } catch (e) { console.warn("Could not read graphics setting", e); }

        // Construct URL: ${ASSET_BASE_URL}leib.glb -> https://.../leib_medium.glb
        const modelName = modelFile.split('/').pop().replace('.glb', '');
        const remoteUrl = `${ASSET_BASE_URL}${modelName}_${quality}.glb`;

        console.log(`🎨 Loading remote asset: ${remoteUrl}`);

        return new Promise((resolve, reject) => {
            if (onProgress) onProgress("model", "🎮 Loading Model... 0%", "purple");

            this.loader.load(
                remoteUrl,
                (gltf) => {
                    this.playerModel = gltf.scene;
                    this.animationClips = gltf.animations;

                    const scale = MODEL_SCALES[modelFile] || 1;
                    this.playerModel.scale.set(scale, scale, scale);
                    this.playerModel.rotation.y = Math.PI;
                    this.playerModel.position.y = -0.5;

                    player.add(this.playerModel);
                    player.userData.appearance = { model: modelFile, quality: quality, scale: scale };

                    if (gltf.animations && gltf.animations.length > 0) {
                        this.setupAnimations(gltf);
                    }

                    if (onLoaded) onLoaded("model", "✅ Model loaded!", "green");
                    resolve(this.playerModel);
                },
                (progress) => {
                    if (progress.total > 0 && onProgress) {
                        const percent = Math.round(progress.loaded / progress.total * 100);
                        onProgress("model", `🎮 Loading Model... ${percent}%`, "purple");
                    }
                },
                (error) => {
                    console.error(`Error loading model (${remoteUrl}):`, error);
                    const fallbackGeo = new THREE.BoxGeometry(1, 2, 1);
                    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
                    this.playerModel = new THREE.Mesh(fallbackGeo, fallbackMat);
                    player.add(this.playerModel);
                    this.addPlayerLights(player);
                    if (onError) onError("model", "⚠️ Model load failed", "yellow");
                    resolve(this.playerModel);
                }
            );
        });
    }

    createUpperBodyAction(clip) {
        // Excludeer benen en heupen zodat deze clip ze NIET overschrijft
        const excludedBones = [
            "Hips", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
            "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"
        ];

        const tracks = [];
        for (let i = 0; i < clip.tracks.length; i++) {
            const trackName = clip.tracks[i].name;
            let exclude = false;

            for (const boneName of excludedBones) {
                if (trackName.includes(boneName)) {
                    exclude = true;
                    break;
                }
            }

            if (!exclude) {
                tracks.push(clip.tracks[i]);
            }
        }

        const upperBodyClip = new THREE.AnimationClip(clip.name + '_UB', clip.duration, tracks);
        return this.mixer.clipAction(upperBodyClip);
    }

    setupAnimations(gltf) {
        this.mixer = new THREE.AnimationMixer(this.playerModel);
        this.mixer.addEventListener('finished', (e) => this.onAnimationFinished(e));
        this.animations = {};

        if (!gltf.animations || gltf.animations.length === 0) return;

        gltf.animations.forEach((clip) => {
            let cleanName = clip.name;
            if (cleanName.includes('|')) cleanName = cleanName.split('|').pop();
            cleanName = cleanName.split('.')[0];

            const upperBodyAnims = ['cast', 'throw', 'attack'];

            if (upperBodyAnims.includes(cleanName)) {
                // 🔥 Gebruik de gemaskeerde clip voor aanvallen
                const action = this.createUpperBodyAction(clip);
                this.animations[cleanName] = action;
            } else {
                const action = this.mixer.clipAction(clip);
                this.animations[cleanName] = action;
            }
        });

        for (const [name, action] of Object.entries(this.animations)) {
            const oneShotAnims = ['jump_up', 'landing', 'throw', 'cast', 'jump', 'attack'];

            if (['cast', 'throw', 'attack'].includes(name)) {
                action.timeScale = 1.5;
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = false;
                // Zorg dat deze laag 'bovenop' de basislaag ligt
                action.setEffectiveWeight(1);
            } else if (oneShotAnims.includes(name)) {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = false;
            } else {
                action.setLoop(THREE.LoopRepeat);
            }
        }

        this.playAnimation('idle');
    }

    onAnimationFinished(e) {
        if (this.animations['landing'] && e.action === this.animations['landing']) {
            this.isLanding = false;
        }

        const attackAnims = [this.animations['cast'], this.animations['throw'], this.animations['attack']];
        const isAttackAction = attackAnims.some(anim => anim === e.action);

        if (isAttackAction) {
            this.isAttacking = false;
            // 🔥 GEEN reset van currentAction, want de benen liepen al die tijd al door
        }
    }

    playAnimation(name, fadeDuration = 0.2) {
        if (!this.mixer || !this.animations[name]) return;

        const nextAction = this.animations[name];

        if (this.currentAction === nextAction && nextAction.isRunning()) return;

        if (this.currentAction) {
            this.currentAction.fadeOut(fadeDuration);
        }

        nextAction.reset();
        nextAction.fadeIn(fadeDuration).play();

        this.currentAction = nextAction;
        this.currentAnimation = name;
    }

    triggerThrowAnimation() {
        const animName = this.animations['cast'] ? 'cast' : 'throw';
        const action = this.animations[animName];

        if (action) {
            this.isAttacking = true;

            // 🔥 CRUCIAAL VERSCHIL:
            // We roepen NIET this.playAnimation() aan, want die stopt het lopen.
            // We spelen deze actie direct af. De Mixer mengt hem met het lopen.
            action.reset();
            action.setEffectiveTimeScale(1.5);
            action.setEffectiveWeight(1);
            action.play();

            return true;
        }
        return false;
    }

    updateAnimation(state) {
        const { isMoving, isGrounded, isSprinting, verticalVelocity, isGliding, localVelocity } = state;

        // Let op: we hebben de "if (isAttacking) return" hier verwijderd.
        // We willen dat de benen ALTIJD geüpdatet worden naar Idle/Run/Walk.

        let nextAnim = 'idle';

        if (isGliding && !isGrounded) {
            nextAnim = 'glide';
        }
        else if (!isGrounded) {
            if (verticalVelocity > 0.5) nextAnim = 'jump_up';
            else nextAnim = 'falling_idle';
        }
        else if (['falling_idle', 'jump_up', 'glide'].includes(this.currentAnimation)) {
            nextAnim = 'landing';
            this.isLanding = true;
            this.playAnimation('landing', 0.05);
            return 'landing';
        }
        else if (this.isLanding) {
            return 'landing';
        }
        else if (isMoving) {
            const vx = localVelocity ? localVelocity.x : 0;
            const vz = localVelocity ? localVelocity.z : 0;

            if (Math.abs(vx) > Math.abs(vz)) {
                if (vx > 0) nextAnim = 'strafe_right';
                else nextAnim = 'strafe_left';
            } else {
                if (vz > 0.1) {
                    nextAnim = 'walk_backwards';
                } else {
                    if (isSprinting) nextAnim = 'run';
                    else nextAnim = 'walk';
                }
            }
        }
        else {
            nextAnim = 'idle';
        }

        if (nextAnim !== this.currentAnimation) {
            let fadeTime = 0.2;
            if (nextAnim === 'jump_up') fadeTime = 0.1;

            this.playAnimation(nextAnim, fadeTime);
        }

        return this.currentAnimation;
    }

    getProjectileSpawnPosition(playerPosition) {
        let spawnPos = new THREE.Vector3();

        if (this.playerModel) {
            // STAP 1: Probeer het originele punt (voor als je die later weer toevoegt)
            let projectileNode = this.playerModel.getObjectByName('projectile_point');

            // STAP 2: Probeer de standaard namen
            if (!projectileNode) {
                projectileNode = this.playerModel.getObjectByName('mixamorig:RightHand') ||
                    this.playerModel.getObjectByName('RightHand') ||
                    this.playerModel.getObjectByName('mixamorigRightHand');
            }

            // STAP 3: "Slimme" zoektocht (als de naam iets afwijkt)
            if (!projectileNode) {
                this.playerModel.traverse((child) => {
                    // Zoek naar iets met 'righthand' in de naam (hoofdletterongevoelig)
                    // We stoppen bij de eerste match
                    if (!projectileNode && child.name && child.name.toLowerCase().includes('righthand')) {
                        console.log("🎯 Hand gevonden via scan:", child.name);
                        projectileNode = child;
                    }
                });
            }

            // STAP 4: Positie bepalen
            if (projectileNode) {
                projectileNode.getWorldPosition(spawnPos);

                // Optioneel: De 'RightHand' bone zit vaak in de pols.
                // We kunnen hem iets verplaatsen zodat het lijkt alsof het uit de vingers komt.
                // Dit doen we door lokaal over de Y-as van het bot te schuiven.
                /*
                const offset = new THREE.Vector3(0, 0.15, 0); // Pas 0.15 aan naar wens (meters/units)
                const quat = new THREE.Quaternion();
                projectileNode.getWorldQuaternion(quat);
                offset.applyQuaternion(quat);
                spawnPos.add(offset);
                */

                return spawnPos;
            } else {
                console.warn("⚠️ Echt geen hand gevonden! Model namen:", this.playerModel);
            }
        }

        // FALLBACK: Als alles faalt, spawn gewoon voor de speler (borsthoogte)
        if (this.playerModel) {
            const box = new THREE.Box3().setFromObject(this.playerModel);
            const height = box.max.y - box.min.y;
            const fallbackY = box.min.y + (height * 0.7); // 70% van hoogte

            const forward = new THREE.Vector3(0, 0, 1);
            // Pak de rotatie van de speler container (parent van het model)
            if (this.playerModel.parent) {
                forward.applyQuaternion(this.playerModel.parent.quaternion);
            }

            return new THREE.Vector3(playerPosition.x, fallbackY, playerPosition.z).add(forward);
        }

        // Ultieme fallback
        return playerPosition.clone().add(new THREE.Vector3(0, 1.5, 0));
    }

    update(delta) {
        if (this.mixer) this.mixer.update(delta);
    }

    addPlayerLights(player) {
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(5, 10, 5);
        player.add(keyLight);
        const pointLight = new THREE.PointLight(0xffffff, 1, 10);
        pointLight.position.set(0, 3, 0);
        player.add(pointLight);
    }

    loadPreviewModel(element, modelFile) {
        if (element.previewRenderer) element.removeChild(element.previewRenderer.domElement);
        const scene = new THREE.Scene();
        const modelName = modelFile.split('/').pop().replace('.glb', '');
        const previewUrl = `${ASSET_BASE_URL}${modelName}_medium.glb`;
        const camera = new THREE.PerspectiveCamera(50, element.clientWidth / element.clientHeight, 0.1, 100);
        camera.position.set(0, 1.5, 3);
        camera.lookAt(0, 1, 0);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(element.clientWidth, element.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        element.appendChild(renderer.domElement);
        const light = new THREE.DirectionalLight(0xffffff, 2.2);
        light.position.set(5, 10, 5);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        this.loader.load(previewUrl, (gltf) => {
            const container = new THREE.Object3D();
            container.add(gltf.scene);
            const scale = 1;
            container.scale.set(scale, scale, scale);
            container.rotation.y = Math.PI;
            scene.add(container);
            element.previewRenderer = renderer;
            element.previewModel = container;
            element.previewScene = scene;
            element.previewCamera = camera;
            this.animatePreview(element);
        }, undefined, (error) => console.warn(`Preview failed:`, error));
    }

    animatePreview(element) {
        if (!element.previewModel) return;
        element.previewModel.rotation.y += 0.01;
        element.previewRenderer.render(element.previewScene, element.previewCamera);
        requestAnimationFrame(() => this.animatePreview(element));
    }

    dispose() {
        if (this.mixer) this.mixer.stopAllAction();
        if (this.playerModel) {
            this.playerModel.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material) child.material.dispose();
                }
            });
        }
    }
}