import ParticleSystem from './modules/particle-system.js';
import UI from './modules/ui.js';

class App {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.particleSystem = null;
        this.ui = null;
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
            damping: 0.92,
            glitchJitter: 1.0,
            influenceRadius: 15,
            snapSpeed: 3.0,
            mode: 'glitch',
            zenMode: false,
        };
        
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
                // this.activeSynth = this.glitchSynth; // Commented out
                break;
            case 'zen':
            default:
                this.particleParams = this.zenParams;
                // this.activeSynth = this.synth; // Commented out
                break;
        }
        // Update particle system with new parameters
        this.particleSystem.particleParams = this.particleParams;
        // Re-initialize particle system to apply new parameters and clear old particles
        this.particleSystem.clearParticles(); 
        this.particleSystem.updateBlendMode();
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

                if (duration < 300 && moveDistance < 5) {
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
                    emitAtPosition(worldPos);

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

                    if (duration < 300 && moveDistance < 5) {
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

        const influenceRadiusSq = this.particleParams.influenceRadius * this.particleParams.influenceRadius;

        this.particleSystem.particles.forEach(particle => {
            const distSq = particle.position.distanceToSquared(target);

            if (distSq < influenceRadiusSq) {
                const force = target.clone().sub(particle.position).normalize().multiplyScalar(this.particleParams.snapSpeed);
                particle.velocity.add(force);
            }
        });
    }

    animate() {
        if (!this.isAnimating) return;

        this.animationId = requestAnimationFrame(() => this.animate());

        const currentTime = performance.now();
        const deltaTime = (this.lastTime ? (currentTime - this.lastTime) : 0) / 1000;
        this.lastTime = currentTime;

        if (this.particleSystem) {
            this.particleSystem.update(deltaTime);
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