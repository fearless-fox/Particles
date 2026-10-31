import ParticleSystem from './modules/particle-system.js';
import UI from './modules/ui.js';

class App {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.particleSystem = null;
        this.ui = null;
        this.netMesh = null;
        this.animationId = null;
        this.isAnimating = true;
        // Audio properties (commented out for now)
        // this.pingPongDelay = null;
        // this.synth = null;
        // this.bassSynth = null;
        // this.guitarSynth = null;
        // this.fluidSynth = null;
        // this.glitchSynth = null;
        // this.distortion = null;
        // this.reverb = null;
        // this.feedbackDelay = null;
        // this.fluidLowPass = null;
        // this.fluidAutoFilter = null;
        // this.glitchBitCrusher = null;
        // this.glitchDistortion = null;
        // this.glitchChebyshev = null;
        // this.activeSynth = null;
        // this.currentPlayingNote = null;
        // this.releaseTimeout = null;
        // this.synthWaveNotes = [ ... ];
        // this.currentNoteIndex = 0;
        this.isAudioEnabled = false; // Permanently false for now

        this.physicsMode = 'zen';

        this.baseParams = {
            count: 30000,
            emissionRate: 69,
            initialSpeed: 2,
            spreadAngle: 133,
            startColor: new THREE.Color(0xffffff),
            endColor: new THREE.Color(0x00ffff),
            size: 0.5,
            sizeVariation: 3,
            opacity: 0.7,
            lifespan: 120,
            turbulence: 0.5,
            shape: 'cube',
            blendMode: 'subtractive',
            burstSize: 99,
            trailDensity: 33,
        };

        this.zenParams = {
            ...this.baseParams,
            gravity: -0.3,
            airResistance: 0.02,
            windX: -0.3,
            windY: 0.2,
            windZ: 0.1,
            zenMode: true,
            ghostDuration: 30,
            clearingMode: false,
            mode: 'zen',
        };

        this.fluidParams = {
            ...this.baseParams,
            gravity: 0,
            airResistance: 0.1,
            viscosity: 0.5,
            buoyancy: 0.1,
            diffusionRate: 0.2,
            swirlIntensity: 1,
            mode: 'fluid',
            zenMode: false,
        };

        this.glitchParams = {
            ...this.zenParams,
            anchorStrength: 0.5,
            damping: 0.96,
            glitchJitter: 3.0,
            influenceRadius: 15,
            snapSpeed: 6.0,
            // SWARM v2: particles LEAD, mesh FOLLOWS. swarmCenter is not a
            // target — it is the centroid computed from the particles
            // themselves each frame (see updateSwarm). There is no center
            // pull in particle.js bag mode anymore; that pull was the
            // "particles chase the sphere" bug. A click yanks only the
            // nearest hornets, and neighbour tethers drag the rest.
            netRadius: 4.5,
            swarmCount: 900,
            attractCount: 8,
            tetherCount: 6,
            tetherStrength: 6,
            tetherRest: 1.3,
            escapeStrength: 10,
            maxSpeed: 11,
            // Mesh is INVISIBLE by default in v3: the user only wants to
            // see the confinement when the few pull away and stretch it.
            // updateSwarmMeshVisual raises opacity during a yank.
            netOpacity: 0,
            // Legacy, no longer drives movement in v2 (kept so old saved
            // params / stream fallback references do not break).
            clusterDrift: 2.0,
            clusterGravity: 1.0,
            clusterCenter: new THREE.Vector3(),
            clusterVelocity: new THREE.Vector3(),
            swarmCenter: new THREE.Vector3(),
            mode: 'glitch',
            zenMode: false,
        };
        this.tetherTimer = 0;
        this.lastGlitchClickTime = 0;
        
        this.particleParams = this.zenParams;
    }

    async init() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 15);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('container').appendChild(this.renderer.domElement);

        this.particleSystem = new ParticleSystem(this.scene, this.particleParams);
        this.scene.add(this.createGradientSphere());

        // The mesh v2: an ORGANIC BLOB, not a perfect sphere. Vertices are
        // displaced by direction-based noise, so the wireframe is lumpy
        // before any scaling. In animate it is positioned at the swarm
        // centroid and scaled to hug the swarm's actual extent, so it
        // follows the particles and never leads them.
        const netGeometry = new THREE.SphereGeometry(1, 28, 20);
        {
            const pos = netGeometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
                const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
                const dx = vx / len, dy = vy / len, dz = vz / len;
                const disp = 1
                    + 0.18 * Math.sin(dx * 3 + 1.7) * Math.sin(dy * 4 + 0.5)
                    + 0.12 * Math.cos(dz * 5 + 2.0)
                    + 0.08 * Math.sin(dy * 6 + dx * 2);
                pos.setXYZ(i, vx * disp, vy * disp, vz * disp);
            }
            pos.needsUpdate = true;
        }
        const netMaterial = new THREE.LineBasicMaterial({ color: 0xC13E1B, transparent: true, opacity: 0 });
        this.netMesh = new THREE.LineSegments(new THREE.WireframeGeometry(netGeometry), netMaterial);
        this.netMesh.visible = false;
        this.scene.add(this.netMesh);

        this.ui = new UI(this);
        this.ui.setupControls();
        
        this.animate();
        this.setupMouseInteraction();

        // No start button logic needed as the app starts immediately
    }

    switchMode(mode) {
        this.physicsMode = mode;
        this.ui.updateModeUI(mode); // Call UI to handle visibility of controls
        
        switch (mode) {
            case 'fluid':
                this.particleParams = this.fluidParams;
                // this.activeSynth = this.fluidSynth; // Commented out
                break;
            case 'glitch':
                this.particleParams = this.glitchParams;
                // Fresh hive every time you enter glitch mode: centered, at rest.
                this.glitchParams.clusterCenter.set(0, 0, 0);
                this.glitchParams.clusterVelocity.set(0, 0, 0);
                this.glitchParams.swarmCenter.set(0, 0, 0);
                this.tetherTimer = 1; // force an immediate tether build
                // this.activeSynth = this.glitchSynth; // Commented out
                break;
            case 'zen':
            default:
                this.particleParams = this.zenParams;
                // this.activeSynth = this.synth; // Commented out
                break;
        }
        // The net only shows in glitch mode.
        if (this.netMesh) {
            this.netMesh.visible = (mode === 'glitch');
        }
        // Update particle system with new parameters
        this.particleSystem.particleParams = this.particleParams;
        // Re-initialize particle system to apply new parameters and clear old particles
        this.particleSystem.clearParticles();
        this.particleSystem.updateBlendMode();
        // Glitch mode starts with a full swarm already trapped in the bag.
        // Without this, the first click had to spawn the particles, which is
        // exactly the "particles appear at click" bug the user reported.
        if (mode === 'glitch') {
            this.seedGlitchSwarm();
        }
    }

    // Random point uniformly inside the net sphere around the swarm center.
    randomPointInNet() {
        const params = this.glitchParams;
        const center = params.swarmCenter || new THREE.Vector3();
        const radius = params.netRadius || 4.5;
        const r = radius * Math.cbrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        return new THREE.Vector3(
            center.x + r * Math.sin(phi) * Math.cos(theta),
            center.y + r * Math.sin(phi) * Math.sin(theta),
            center.z + r * Math.cos(phi)
        );
    }

    seedGlitchSwarm(count) {
        if (!this.particleSystem) return;
        const target = count !== undefined ? count : (this.glitchParams.swarmCount || 900);
        const missing = target - this.particleSystem.particles.length;
        if (missing <= 0) return;
        for (let i = 0; i < missing; i++) {
            this.particleSystem.emit(1, this.randomPointInNet());
        }
    }

    // Keep the swarm full as hornets age out (lifespan expiry). Topping up
    // inside the net, never at a click point.
    maintainGlitchSwarm() {
        if (this.physicsMode !== 'glitch' || !this.particleSystem) return;
        const target = this.glitchParams.swarmCount || 900;
        if (this.particleSystem.particles.length < target) {
            this.seedGlitchSwarm(target);
        }
    }

    createGradientSphere() {
        const sphereGeometry = new THREE.SphereGeometry(500, 100, 100);
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 128;
        const context = canvas.getContext('2d');

        const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#000000'); 
        gradient.addColorStop(1, '#310342'); 

        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const gradientTexture = new THREE.CanvasTexture(canvas);
        gradientTexture.needsUpdate = true;

        const sphereMaterial = new THREE.MeshBasicMaterial({
            map: gradientTexture,
            side: THREE.BackSide,
            depthWrite: false
        });

        return new THREE.Mesh(sphereGeometry, sphereMaterial);
    }

    setupMouseInteraction() {
        let isDragging = false;
        let lastEmissionTime = 0;
        let previousMouseX = 0, previousMouseY = 0;
        let cameraRotationX = 0, cameraRotationY = 0;
        let touchStartTime = 0;
        let lastNotePlaybackTime = 0;

        // New variable for Glitch mode interaction target
        let glitchTarget = new THREE.Vector3();

        const getPositionNoteFromClient = (clientX, clientY) => {
            // const normalizedX = Math.max(0, Math.min(1, clientX / window.innerWidth)); // Commented out
            // const normalizedY = Math.max(0, Math.min(1, clientY / window.innerHeight)); // Commented out

            // const minorScaleNotes = [ // Commented out
            //     'A2','B2','C3','D3','E3','F3','G3', // Commented out
            //     'A3','B3','C4','D4','E4','F4','G4', // Commented out
            //     'A4','B4','C5','D5','E5','F5','G5', // Commented out
            //     'A5','B5','C6','D6','E6' // Commented out
            // ]; // Commented out

            // const baseIndex = Math.floor(normalizedX * 16); // Commented out
            // const yVariation = Math.floor(normalizedY * 4); // Commented out
            // const finalIndex = Math.min(baseIndex + yVariation * 4, minorScaleNotes.length - 1); // Commented out
            // return minorScaleNotes[finalIndex] || 'A3'; // Commented out
            return 'C4'; // Placeholder
        }

        const playNoteStartAt = (clientX, clientY) => {
            // if (!this.isAudioEnabled || !this.activeSynth) return; // Commented out
            // const note = getPositionNoteFromClient(clientX, clientY); // Commented out
            // if (this.currentPlayingNote !== note) { // Commented out
            //     if (this.currentPlayingNote && this.activeSynth) { // Commented out
            //         try { this.activeSynth.triggerRelease(); } catch (e) {} // Commented out
            //     } // Commented out
            //     try { this.activeSynth.triggerAttack(note); } catch (e) {} // Commented out
            //     this.currentPlayingNote = note; // Commented out
            // } // Commented out
            // if (this.releaseTimeout) { clearTimeout(this.releaseTimeout); this.releaseTimeout = null; } // Commented out
        }

        const stopPlayingSoon = () => {
            // if (this.releaseTimeout) clearTimeout(this.releaseTimeout); // Commented out
            // this.releaseTimeout = setTimeout(() => { // Commented out
            //     if (this.currentPlayingNote && this.activeSynth) { // Commented out
            //         try { this.activeSynth.triggerRelease(); } catch (e) {} // Commented out
            //     } // Commented out
            //     this.currentPlayingNote = null; // Commented out
            // }, 250); // Commented out
        }

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const getWorldPosition = (clientX, clientY) => {
            mouse.x = (clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, this.camera);
            const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
            const intersectPoint = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, intersectPoint);

            return intersectPoint;
        }

        const emitAtPosition = (worldPos) => {
            const currentTime = Date.now();
            if (currentTime - lastEmissionTime > 50) {
                const burstCount = Math.min(this.particleParams.trailDensity, this.particleParams.emissionRate);
                if (this.particleSystem) {
                    this.particleSystem.emit(burstCount, worldPos);
                }
                lastEmissionTime = currentTime;
            }
        }

        document.addEventListener('mousemove', (event) => {
            if (!event.target.closest('#controls') && !event.target.closest('.toggle-controls') ) { // Updated to remove startButton check, as it's not removed
                const worldPos = getWorldPosition(event.clientX, event.clientY);
                
                if (this.physicsMode === 'fluid' && isDragging) {
                    emitAtPosition(worldPos);
                } else if (this.physicsMode === 'glitch') {
                    // In Glitch mode, mousemove just updates the target, no continuous emit
                    glitchTarget.copy(worldPos);
                }

                if (isDragging && Date.now() - lastNotePlaybackTime > 100) {
                    // if (this.activeSynth) { // Commented out
                    //     playNoteStartAt(event.clientX, event.clientY); // Commented out
                    // } // Commented out
                    lastNotePlaybackTime = Date.now();
                }
            }
        });

        document.addEventListener('mousedown', (event) => {
            if (!event.target.closest('#controls') && !event.target.closest('.toggle-controls') ) { // Updated
                isDragging = true;
                previousMouseX = event.clientX;
                previousMouseY = event.clientY;
                touchStartTime = Date.now();
                event.preventDefault();

                if (this.physicsMode === 'glitch') {
                    const worldPos = getWorldPosition(event.clientX, event.clientY);
                    glitchTarget.copy(worldPos);
                    this.applyGlitchForce(glitchTarget); // New method to apply force
                } else {
                    // playNoteStartAt(previousMouseX, previousMouseY); // Commented out
                }
            }
        });

        document.addEventListener('mouseup', (event) => {
            if (isDragging) {
                isDragging = false;
                const duration = Date.now() - touchStartTime;
                const deltaX = event.clientX - previousMouseX;
                const deltaY = event.clientY - previousMouseY;
                const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                // Glitch mode: a click NEVER spawns. The swarm already exists
                // (seeded at mode switch); a click only yanks it, via mousedown.
                // Spawning here was the "particles appear at click" bug.
                if (duration < 300 && moveDistance < 5 && this.physicsMode !== 'glitch') {
                    const worldPos = getWorldPosition(previousMouseX, previousMouseY);
                    if (this.particleSystem) {
                        this.particleSystem.emit(this.particleParams.burstSize, worldPos);
                    }
                    // if (this.activeSynth) { // Commented out
                    //    playChord(); // Commented out
                    // } // Commented out
                }

                // stopPlayingSoon(); // Commented out
            }
            lastNotePlaybackTime = 0;
        });

        document.addEventListener('touchstart', (event) => {
            if (!event.target.closest('#controls') && !event.target.closest('.toggle-controls') ) { // Updated
                if (event.touches.length === 1) {
                    isDragging = true;
                    previousMouseX = event.touches[0].clientX;
                    previousMouseY = event.touches[0].clientY;
                    touchStartTime = Date.now();
                    event.preventDefault();
                } else if (event.touches.length > 1) {
                    previousMouseX = event.touches[0].clientX;
                    previousMouseY = event.touches[0].clientY;
                    event.preventDefault();
                }
            }
        }, { passive: false });

        document.addEventListener('touchmove', (event) => {
            if (!event.target.closest('#controls') && !event.target.closest('.toggle-controls') ) { // Updated
                if (isDragging && event.touches.length === 1) {
                    const touch = event.touches[0];
                    const worldPos = getWorldPosition(touch.clientX, touch.clientY);
                    // No spawning in glitch mode on touch either (see mouseup).
                    if (this.physicsMode !== 'glitch') {
                        emitAtPosition(worldPos);
                    }

                    if (Date.now() - lastNotePlaybackTime > 100) {
                        // if (this.activeSynth) { // Commented out
                        //     playNoteStartAt(touch.clientX, touch.clientY); // Commented out
                        // } // Commented out
                        lastNotePlaybackTime = Date.now();
                    }

                    previousMouseX = touch.clientX;
                    previousMouseY = touch.clientY;
                    event.preventDefault();
                } else if (event.touches.length > 1) {
                    const touch1 = event.touches[0];
                    const deltaX = touch1.clientX - previousMouseX;
                    const deltaY = touch1.clientY - previousMouseY;

                    cameraRotationY += deltaX * 0.005;
                    cameraRotationX += deltaY * 0.005;
                    cameraRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotationX));

                    previousMouseX = touch1.clientX;
                    previousMouseY = touch1.clientY;
                    event.preventDefault();
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', (event) => {
            if (!event.target.closest('#controls') && !event.target.closest('.toggle-controls') ) { // Updated
                if (isDragging && event.touches.length === 0) {
                    isDragging = false;
                    const duration = Date.now() - touchStartTime;
                    const touch = event.changedTouches[0];
                    const deltaX = touch.clientX - previousMouseX;
                    const deltaY = touch.clientY - previousMouseY;
                    const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                    // Glitch mode: a tap NEVER spawns (see mouseup).
                    if (duration < 300 && moveDistance < 5 && this.physicsMode !== 'glitch') {
                        const worldPos = getWorldPosition(previousMouseX, previousMouseY);
                        if (this.particleSystem) {
                            this.particleSystem.emit(this.particleParams.burstSize, worldPos);
                        }
                        // if (this.activeSynth) { // Commented out
                        //     playChord(); // Commented out
                        // } // Commented out
                    }
                    // stopPlayingSoon(); // Commented out
                }
            }
        });

        document.addEventListener('mouseup', () => stopPlayingSoon());
        document.addEventListener('touchend', () => stopPlayingSoon(), { passive: true });

        const updateCamera = () => {
            const radius = 15;
            this.camera.position.x = radius * Math.sin(cameraRotationY) * Math.cos(cameraRotationX);
            this.camera.position.y = radius * Math.sin(cameraRotationX);
            this.camera.position.z = radius * Math.cos(cameraRotationY) * Math.cos(cameraRotationX);
            this.camera.lookAt(0, 0, 0);
        }

        const originalAnimate = this.animate.bind(this);
        this.animate = () => {
            updateCamera();
            originalAnimate();
        };

        const playChord = () => {
            // const noteIndex = Math.floor(Math.random() * this.synthWaveNotes.length); // Commented out
            // const root = this.synthWaveNotes[noteIndex]; // Commented out
            // const chord = Tone.Frequency(root).harmonize([0, 4, 7]); // Commented out
            // if (this.activeSynth) { // Commented out
            //     this.activeSynth.triggerAttackRelease(chord, "0.5"); // Commented out
            // } // Commented out
        }
    }

    applyGlitchForce(target) {
        if (!this.particleSystem || this.physicsMode !== 'glitch') return;

        const params = this.particleParams;
        // v3: a click is seen ACROSS THE WHOLE FIELD. No influence-radius
        // cutoff and no side filter anymore — those were why clicks far
        // from the swarm did nothing. The few nearest hornets to the click
        // point, wherever the swarm is, are the ones that break away.
        this.lastGlitchClickTime = Date.now();
        const candidates = [];
        this.particleSystem.particles.forEach(particle => {
            candidates.push({ particle, distSq: particle.position.distanceToSquared(target) });
        });
        candidates.sort((a, b) => a.distSq - b.distSq);
        const few = candidates.slice(0, Math.max(1, Math.round(params.attractCount || 8)));
        // Yank the PARTICLES, hard and held: impulse 3x snapSpeed (default
        // 18, with the click-boost speed cap in particle.js), plus a
        // sustained escape-direction toward the click for 1.5s, plus a
        // clickTimer that lets them stretch their tethers and break the
        // boundary before the rest get dragged after them.
        few.forEach(({ particle }) => {
            const dir = target.clone().sub(particle.position);
            if (dir.lengthSq() < 0.0001) return;
            dir.normalize();
            particle.velocity.add(dir.clone().multiplyScalar((params.snapSpeed || 6) * 3));
            if (particle.escapeDir) {
                particle.escapeDir.copy(dir);
                particle.escapeTimer = 1.5;
            }
            particle.clickTimer = 1.5;
            particle.isAffectedByInteraction = true;
        });
    }

    // Centroid of the current swarm, or null if there is no swarm yet.
    computeSwarmCentroid() {
        if (!this.particleSystem || this.particleSystem.particles.length === 0) return null;
        const sum = new THREE.Vector3();
        this.particleSystem.particles.forEach(p => sum.add(p.position));
        return sum.multiplyScalar(1 / this.particleSystem.particles.length);
    }

    // Rebuild neighbour tethers: for each hornet, its nearest tetherCount
    // neighbours. Rebuilt every ~0.6s, so chains break and reattach as the
    // swarm churns. O(n^2) with a tiny top-k insertion, not a full sort
    // per particle, and only on a timer, not every frame.
    recomputeTethers() {
        if (!this.particleSystem) return;
        const particles = this.particleSystem.particles;
        const k = Math.max(3, Math.round(this.glitchParams.tetherCount || 6));
        for (let i = 0; i < particles.length; i++) {
            const pi = particles[i];
            const best = []; // [{p, dSq}] ascending
            for (let j = 0; j < particles.length; j++) {
                if (i === j) continue;
                const dSq = pi.position.distanceToSquared(particles[j].position);
                let at = 0;
                while (at < best.length && best[at].dSq < dSq) at++;
                if (at < k) {
                    best.splice(at, 0, { p: particles[j], dSq });
                    if (best.length > k) best.pop();
                }
            }
            pi.tetherNeighbors = best.map(b => b.p);
        }
    }

    // Physics-side swarm update, run BEFORE particleSystem.update: refresh
    // the centroid (the physics boundary center), rebuild tethers on a
    // timer, and apply a soft leash to the PARTICLES themselves if the
    // whole swarm has drifted too far from home. Nothing here moves a
    // leader sphere; the mesh is drawn after the particles move.
    updateSwarm(deltaTime) {
        if (this.physicsMode !== 'glitch') return;
        const params = this.particleParams;
        if (!params.swarmCenter || !this.particleSystem) return;
        const dt = Math.min(deltaTime, 0.05);

        const centroid = this.computeSwarmCentroid();
        if (centroid) {
            params.swarmCenter.copy(centroid);
            // Leash on the particles, not on a center object.
            const LEASH_RADIUS = 6;
            const distFromHome = centroid.length();
            if (distFromHome > LEASH_RADIUS) {
                const pull = centroid.clone().normalize()
                    .multiplyScalar(-(distFromHome - LEASH_RADIUS) * 1.0 * dt);
                this.particleSystem.particles.forEach(p => p.velocity.add(pull));
            }
        }

        this.tetherTimer += dt;
        if (this.tetherTimer >= 0.6) {
            this.tetherTimer = 0;
            this.recomputeTethers();
        }
    }

    // Visual-side swarm update, run AFTER particleSystem.update: the blob
    // mesh follows the particles. Position = new centroid, scale = hug
    // the swarm's actual extent, slow rotation for organic morphing.
    // This is why the mesh can never lead: it is drawn from where the
    // particles already are.
    updateSwarmMeshVisual(deltaTime) {
        if (this.physicsMode !== 'glitch' || !this.netMesh) return;
        const params = this.particleParams;
        const centroid = this.computeSwarmCentroid();
        if (!centroid) return;
        if (params.swarmCenter) params.swarmCenter.copy(centroid);

        let maxDist = 0;
        this.particleSystem.particles.forEach(p => {
            const d = p.position.distanceTo(centroid);
            if (d > maxDist) maxDist = d;
        });
        const meshRadius = Math.max(
            (params.netRadius || 4.5) * 0.7,
            Math.min(maxDist * 1.05, (params.netRadius || 4.5) * 1.3)
        );
        this.netMesh.position.copy(centroid);
        this.netMesh.scale.setScalar(meshRadius);
        this.netMesh.rotation.y += deltaTime * 0.25;
        this.netMesh.rotation.x += deltaTime * 0.12;
        // Mesh visibility v3: invisible by default (slider netOpacity,
        // default 0). It only appears when the few pull away: for 3s
        // after a click it fades in to 0.35 and back out, and it also
        // shows while the swarm is stretched past its normal radius.
        // That is the "see the confinement only when it is being yanked"
        // rule, not a mesh that is always on display.
        if (this.netMesh.material) {
            const baseOpacity = params.netOpacity !== undefined ? params.netOpacity : 0;
            let opacity = baseOpacity;
            const sinceClick = this.lastGlitchClickTime ? (Date.now() - this.lastGlitchClickTime) / 1000 : 999;
            if (sinceClick < 3) {
                opacity = Math.max(opacity, baseOpacity + (0.35 - baseOpacity) * (1 - sinceClick / 3));
            }
            if (maxDist > (params.netRadius || 4.5) * 0.95) {
                opacity = Math.max(opacity, 0.20);
            }
            this.netMesh.material.opacity = opacity;
            this.netMesh.visible = opacity > 0.01;
        }
    }

    // Backwards-compatible name, now just the visual step.
    updateCluster(deltaTime) {
        this.updateSwarmMeshVisual(deltaTime);
    }

    animate() {
        if (!this.isAnimating) return;

        this.animationId = requestAnimationFrame(() => this.animate());

        const currentTime = performance.now();
        const deltaTime = (this.lastTime ? (currentTime - this.lastTime) : 0) / 1000;
        this.lastTime = currentTime;

        if (this.particleSystem) {
            // Particles first: centroid + tethers for physics, then move
            // the particles, then draw the mesh from their new positions.
            this.updateSwarm(deltaTime);
            this.maintainGlitchSwarm();
            this.particleSystem.update(deltaTime);
            this.updateSwarmMeshVisual(deltaTime);
        }

        this.frameCount = (this.frameCount || 0) + 1;
        this.fpsTimer = (this.fpsTimer || 0) + deltaTime;

        if (this.fpsTimer >= 1) {
            document.getElementById('fps').textContent = Math.round(this.frameCount / this.fpsTimer);
            document.getElementById('activeParticles').textContent = this.particleSystem ? this.particleSystem.particles.length : 0;
            this.frameCount = 0;
            this.fpsTimer = 0;
        }

        this.renderer.render(this.scene, this.camera);
    }
}

window.onload = () => {
    const app = new App();
    app.init();

    const notification = document.getElementById('control-notification');
    if (notification) {
        setTimeout(() => {
            notification.style.opacity = '0';
        }, 5000);

        notification.addEventListener('transitionend', () => {
            notification.style.display = 'none';
        });
    }
};