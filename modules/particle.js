// Shared zero vector for the glitch anchor fallback (never mutated, only copied from).
const ZERO_CENTER = new THREE.Vector3(0, 0, 0);
// Net spring strength: how hard the net pushes a stray particle back inside.
// Strong on purpose: the bag wall is what the hornets bounce off, not a
// suggestion they can drift through.
const NET_STRENGTH = 24;

export default class Particle {
    constructor(position, velocity, particleParams) {
        this.position = position.clone();
        this.velocity = velocity.clone();
        this.life = particleParams.lifespan;
        this.maxLife = particleParams.lifespan;
        this.size = particleParams.size + (Math.random() - 0.5) * particleParams.sizeVariation;
        this.turbulenceOffset = Math.random() * 1000;
        this.clearing = false;
        this.clearStartLife = null;
        this.particleParams = particleParams;
        this.isAffectedByInteraction = false; // New flag for Glitch mode
    }

    update(deltaTime) {
        if (this.particleParams.clearingMode && !this.clearing) {
            this.clearing = true;
            this.clearStartLife = this.life;
            this.life = Math.min(this.life, 5);
        }

        const time = Date.now() * 0.001;

        switch (this.particleParams.mode) {
            case 'fluid':
                this.velocity.y += this.particleParams.buoyancy * deltaTime;
                this.velocity.multiplyScalar(1 - (1 - this.particleParams.viscosity) * deltaTime);
                this.velocity.x += (Math.random() - 0.5) * this.particleParams.diffusionRate * deltaTime;
                this.velocity.y += (Math.random() - 0.5) * this.particleParams.diffusionRate * deltaTime;
                this.velocity.z += (Math.random() - 0.5) * this.particleParams.diffusionRate * deltaTime;
                const swirl = this.particleParams.swirlIntensity;
                this.velocity.x += Math.sin(time + this.turbulenceOffset) * swirl * deltaTime;
                this.velocity.z += Math.cos(time + this.turbulenceOffset * 1.1) * swirl * deltaTime;
                break;

            case 'glitch': {
                // Falls back to the origin so stream.js, which carries no cluster
                // state, keeps working exactly as before.
                const center = this.particleParams.clusterCenter || ZERO_CENTER;
                const netRadius = this.particleParams.netRadius;

                if (netRadius !== undefined) {
                    // HORNET BAG (playground only): the swarm is seeded inside
                    // the net at mode switch (see app.js) and never spawned by
                    // clicks. Every hornet constantly tests the mesh in all
                    // directions, bounces off the wall, and gets shoved back in.
                    const toCenter = new THREE.Vector3().copy(center).sub(this.position);
                    const distFromCenter = toCenter.length();
                    const outward = distFromCenter > 0.0001
                        ? new THREE.Vector3().copy(this.position).sub(center).normalize()
                        : new THREE.Vector3(1, 0, 0);
                    const jitter = this.particleParams.glitchJitter || 1;

                    // Angry buzz: erratic per-hornet sine + random kicks, strong
                    // enough to actually cross the bag, not just tremble in place.
                    const buzz = jitter * deltaTime * 8;
                    this.velocity.x += (Math.sin(time * 3.1 + this.turbulenceOffset) + (Math.random() - 0.5) * 2) * buzz;
                    this.velocity.y += (Math.cos(time * 2.7 + this.turbulenceOffset * 1.3) + (Math.random() - 0.5) * 2) * buzz;
                    this.velocity.z += (Math.sin(time * 3.7 + this.turbulenceOffset * 0.7) + (Math.random() - 0.5) * 2) * buzz;

                    // Near the wall, hornets press outward harder: that is the
                    // mesh-testing. The wall spring below shoves them back, so
                    // they oscillate against the mesh instead of escaping.
                    if (distFromCenter > netRadius * 0.75) {
                        this.velocity.add(outward.clone().multiplyScalar(jitter * deltaTime * 4));
                    }

                    // Weak cohesion only: enough that the swarm follows the
                    // bag when it is yanked, not enough to collapse it to a point.
                    this.velocity.add(toCenter.multiplyScalar(this.particleParams.anchorStrength * 0.25 * deltaTime));

                    // The bag wall: spring back in, and kill outward velocity
                    // so the hornet bounces off the mesh instead of leaking out.
                    if (distFromCenter > netRadius) {
                        const backInside = new THREE.Vector3().copy(center).sub(this.position).normalize()
                            .multiplyScalar((distFromCenter - netRadius) * NET_STRENGTH * deltaTime);
                        this.velocity.add(backInside);
                        const outwardSpeed = this.velocity.dot(outward);
                        if (outwardSpeed > 0) {
                            this.velocity.add(outward.clone().multiplyScalar(-outwardSpeed * 0.9));
                        }
                        // Extreme safety only: a lag spike must never let a
                        // hornet end up far outside the bag.
                        if (distFromCenter > netRadius * 1.5) {
                            this.position.copy(center).add(outward.multiplyScalar(netRadius));
                        }
                    }
                } else {
                    // stream.js path, unchanged: anchor to center + jitter.
                    const toCenter = new THREE.Vector3().copy(center).sub(this.position);
                    this.velocity.add(toCenter.multiplyScalar(this.particleParams.anchorStrength * deltaTime));
                    this.velocity.x += (Math.random() - 0.5) * this.particleParams.glitchJitter * deltaTime;
                    this.velocity.y += (Math.random() - 0.5) * this.particleParams.glitchJitter * deltaTime;
                    this.velocity.z += (Math.random() - 0.5) * this.particleParams.glitchJitter * deltaTime;
                }

                // Damping (frame-rate independent: 0.92 ~= per-frame at 60fps)
                this.velocity.multiplyScalar(Math.pow(this.particleParams.damping, deltaTime * 60));

                break;
            }

            case 'zen':
            default:
                this.velocity.y += this.particleParams.gravity * deltaTime;
                this.velocity.multiplyScalar(1 - this.particleParams.airResistance * deltaTime);
                this.velocity.x += this.particleParams.windX * deltaTime;
                this.velocity.y += this.particleParams.windY * deltaTime;
                this.velocity.z += this.particleParams.windZ * deltaTime;
                const turbulence = this.particleParams.turbulence;
                this.velocity.x += Math.sin(time + this.turbulenceOffset) * turbulence * deltaTime;
                this.velocity.z += Math.cos(time + this.turbulenceOffset * 1.1) * turbulence * deltaTime;
                break;
        }

        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        this.life -= deltaTime;

        if (this.particleParams.mode === 'zen') {
            const ghostPhase = this.particleParams.ghostDuration;
            return this.life > -ghostPhase;
        } else {
            return this.life > 0;
        }
    }

    getLifeRatio() {
        return this.life / this.maxLife;
    }

    getAlpha() {
        const lifeRatio = this.getLifeRatio();
        
        if (this.particleParams.mode !== 'zen') {
            return this.particleParams.opacity * Math.max(0, lifeRatio);
        }
        
        if (lifeRatio > 0.2) {
            return this.particleParams.opacity;
        } else if (lifeRatio > 0) {
            const fadeRatio = lifeRatio / 0.2;
            return this.particleParams.opacity * fadeRatio;
        } else {
            const ghostRatio = Math.max(0, 1 + (this.life / this.particleParams.ghostDuration));
            const easedGhost = Math.pow(ghostRatio, 0.33);
            return this.particleParams.opacity * 0.6 * easedGhost;
        }
    }
}