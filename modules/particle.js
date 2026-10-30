// Shared zero vector for the glitch anchor fallback (never mutated, only copied from).
const ZERO_CENTER = new THREE.Vector3(0, 0, 0);
// Net spring strength: how hard the net pushes a stray particle back inside.
const NET_STRENGTH = 8;

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

            case 'glitch':
                // Anchor to the hive's cluster center, which drifts (see app.js).
                // Falls back to the origin so stream.js, which carries no cluster
                // state, keeps working exactly as before.
                const center = this.particleParams.clusterCenter || ZERO_CENTER;
                const toCenter = new THREE.Vector3().copy(center).sub(this.position);
                this.velocity.add(toCenter.multiplyScalar(this.particleParams.anchorStrength * deltaTime));

                // Net containment: a soft spring that pushes the particle back
                // inside netRadius of the cluster center. No hard clamp, so the
                // hive never pops — it just can't leave the net.
                const netRadius = this.particleParams.netRadius;
                if (netRadius !== undefined) {
                    const distFromCenter = this.position.distanceTo(center);
                    if (distFromCenter > netRadius) {
                        const backInside = new THREE.Vector3().copy(center).sub(this.position).normalize()
                            .multiplyScalar((distFromCenter - netRadius) * NET_STRENGTH * deltaTime);
                        this.velocity.add(backInside);
                    }
                }

                // Jitter
                this.velocity.x += (Math.random() - 0.5) * this.particleParams.glitchJitter * deltaTime;
                this.velocity.y += (Math.random() - 0.5) * this.particleParams.glitchJitter * deltaTime;
                this.velocity.z += (Math.random() - 0.5) * this.particleParams.glitchJitter * deltaTime;

                // Damping (frame-rate independent: 0.92 ~= per-frame at 60fps)
                this.velocity.multiplyScalar(Math.pow(this.particleParams.damping, deltaTime * 60));

                break;

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