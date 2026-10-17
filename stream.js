import ParticleSystem from './modules/particle-system.js';

// ---------------------------------------------------------------------------
// NEURAL GLITCH — stream background
// Fullscreen, audio-reactive particle field. Click once to enable the mic;
// if the mic is denied it falls back to ambient auto-pilot.
// Use as an OBS Browser Source: <site>/stream.html @ 1920x1080.
// ---------------------------------------------------------------------------

const params = {
    count: 20000,
    emissionRate: 69,
    initialSpeed: 2,
    spreadAngle: 133,
    startColor: new THREE.Color(0xEDEDE6), // bone
    endColor: new THREE.Color(0xC13E1B),   // fox red
    size: 0.5,
    sizeVariation: 3,
    opacity: 0.7,
    lifespan: 120,
    anchorStrength: 0.5,
    damping: 0.92,
    glitchJitter: 1.0, // modulated live by audio
    influenceRadius: 15,
    snapSpeed: 3.0,
    mode: 'glitch',
    zenMode: false,
    blendMode: 'additive',
    burstSize: 250,
    trailDensity: 33,
};

let scene, camera, renderer, particleSystem;
let lastTime = 0, elapsed = 0;
let emitAcc = 0;
let audioMode = 'pending'; // 'live' | 'ambient'

// --- audio ---------------------------------------------------------------
let analyser = null;
let freqData = null;
const level = { bass: 0, mid: 0, treble: 0, all: 0 };

async function initAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        src.connect(analyser);
        freqData = new Uint8Array(analyser.frequencyBinCount);
        audioMode = 'live';
    } catch (e) {
        audioMode = 'ambient';
    }
}

function sampleAudio(dt) {
    if (audioMode === 'live' && analyser) {
        analyser.getByteFrequencyData(freqData);
        const avg = (a, b) => {
            let s = 0;
            for (let i = a; i < b && i < freqData.length; i++) s += freqData[i];
            return s / Math.max(1, Math.min(b, freqData.length) - a) / 255;
        };
        const k = Math.min(1, dt * 10);
        level.bass   += (avg(1, 12)   - level.bass)   * k;
        level.mid    += (avg(12, 48)  - level.mid)    * k;
        level.treble += (avg(48, 110) - level.treble) * k;
        level.all    += ((level.bass + level.mid + level.treble) / 3 - level.all) * k;
    } else {
        // ambient auto-pilot: slow breathing waves
        const t = elapsed;
        level.bass   = 0.30 + 0.22 * Math.sin(t * 0.7);
        level.mid    = 0.30 + 0.22 * Math.sin(t * 0.45 + 1.7);
        level.treble = 0.25 + 0.20 * Math.sin(t * 1.1 + 3.1);
        level.all    = (level.bass + level.mid + level.treble) / 3;
    }
}

// --- scene ---------------------------------------------------------------
function initScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 4, 16);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('container').appendChild(renderer.domElement);

    // dark vignette backdrop
    const geo = new THREE.SphereGeometry(500, 32, 32);
    const cv = document.createElement('canvas');
    cv.width = 2; cv.height = 128;
    const cx = cv.getContext('2d');
    const grad = cx.createLinearGradient(0, 0, 0, cv.height);
    grad.addColorStop(0, '#050505');
    grad.addColorStop(1, '#1c0a12');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, cv.width, cv.height);
    const tex = new THREE.CanvasTexture(cv);
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: tex, side: THREE.BackSide, depthWrite: false,
    })));

    particleSystem = new ParticleSystem(scene, params);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

let prevBass = 0;
function onBeat() {
    // bass hit: burst + the field snaps toward a random near-center point
    const p = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 8
    );
    particleSystem.emit(params.burstSize, p);
}

// --- main loop -------------------------------------------------------------
function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, lastTime ? (now - lastTime) / 1000 : 0.016);
    lastTime = now;
    elapsed += dt;

    sampleAudio(dt);

    // audio -> physics
    params.glitchJitter = 0.7 + level.bass * 3.5 + level.mid * 1.2;
    params.anchorStrength = 0.30 + level.mid * 0.45;

    // beat detection on rising bass edge
    if (level.bass > 0.55 && prevBass <= 0.55) onBeat();
    prevBass = level.bass;

    // auto-pilot emission: slow trickle from an orbiting emitter
    emitAcc += params.emissionRate * dt * (0.4 + level.all);
    const n = Math.floor(emitAcc);
    emitAcc -= n;
    if (n > 0) {
        const a = elapsed * 0.25;
        particleSystem.emit(n, new THREE.Vector3(
            Math.cos(a) * 9, Math.sin(a * 1.3) * 5, Math.sin(a * 0.7) * 4
        ));
    }

    particleSystem.update(dt);

    // slow cinematic camera drift
    camera.position.set(
        Math.sin(elapsed * 0.05) * 3.5,
        4 + Math.sin(elapsed * 0.07) * 1.6,
        16 + Math.sin(elapsed * 0.04) * 2
    );
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
}

// --- boot ------------------------------------------------------------------
initScene();
requestAnimationFrame(animate);

document.getElementById('start-overlay').addEventListener('click', async (e) => {
    e.currentTarget.classList.add('hidden');
    await initAudio();
}, { once: true });
