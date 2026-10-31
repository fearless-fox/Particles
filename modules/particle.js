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
        // Hornet escape attempts: a random direction, re-picked every
        // 0.4-1.2s, so each hornet keeps trying a new way out on its own.
        this.escapeDir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        this.escapeTimer = 0.4 + Math.random() * 0.8;
        // Tether neighbours, recomputed by app.js (nearest 5-7, breaking
        // and reattaching over time). References to other Particle objects.
        this.tetherNeighbors = [];
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
                // PLAYGROUND v2: the swarm LEADS. swarmCenter is the centroid
                // computed from the particles themselves (app.js, after the
                // last update), never a leader the particles chase. There is
                // deliberately NO pull toward a center here — that pull was
                // the "particles chase the sphere" bug.
                const center = this.particleParams.swarmCenter || this.particleParams.clusterCenter || ZERO_CENTER;
                const netRadius = this.particleParams.netRadius;

                if (netRadius !== undefined) {
                    // HORNET SWARM v2 (playground only): seeded at mode switch,
                    // never spawned by clicks. Each hornet constantly tries to
                    // break free in a random direction, is tethered to its
                    // nearest neighbours, and bounces off an invisible blob
                    // boundary that follows the swarm, not the other way round.
                    const toCenter = new THREE.Vector3().copy(center).sub(this.position);
                    const distFromCenter = toCenter.length();
                    const outward = distFromCenter > 0.0001
                        ? new THREE.Vector3().copy(this.position).sub(center).normalize()
                        : new THREE.Vector3(1, 0, 0);
                    const jitter = this.particleParams.glitchJitter || 1;

                    // 1. Escape attempts: a fresh random direction every
                    // 0.4-1.2s, plus a constant push along it, with no input.
                    // This is the "trying to get out, all directions, always"
                    // motion, not a tremble around a center.
                    this.escapeTimer -= deltaTime;
                    if (this.escapeTimer <= 0) {
                        this.escapeDir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
                        this.escapeTimer = 0.4 + Math.random() * 0.8;
                    }
                    const escapeStrength = this.particleParams.escapeStrength || (jitter * 4);
                    this.velocity.add(this.escapeDir.clone().multiplyScalar(escapeStrength * deltaTime));

                    // Angry buzz: erratic per-hornet sine + random kicks.
                    const buzz = jitter * deltaTime * 8;
                    this.velocity.x += (Math.sin(time * 3.1 + this.turbulenceOffset) + (Math.random() - 0.5) * 2) * buzz;
                    this.velocity.y += (Math.cos(time * 2.7 + this.turbulenceOffset * 1.3) + (Math.random() - 0.5) * 2) * buzz;
                    this.velocity.z += (Math.sin(time * 3.7 + this.turbulenceOffset * 0.7) + (Math.random() - 0.5) * 2) * buzz;

                    // Occasional glitch spike: a sudden burst in a random
                    // direction, so the swarm flickers angry even at rest.
                    if (Math.random() < 0.002) {
                        this.velocity.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(3));
                    }

                    // 2. Tethers: pull toward / push away from only the nearest
                    // neighbours, with a rest length, so the swarm holds
                    // together as chains, not as a collapse to a point and not
                    // as everyone-to-everyone. Neighbour lists are recomputed
                    // by app.js every ~0.6s, so chains break and reattach.
                    const tetherStrength = this.particleParams.tetherStrength || 6;
                    const restLength = this.particleParams.tetherRest || 1.3;
                    if (this.tetherNeighbors) {
                        for (let n = 0; n < this.tetherNeighbors.length; n++) {
                            const nb = this.tetherNeighbors[n];
                            if (!nb || !nb.position || nb === this) continue;
                            const delta = new THREE.Vector3().copy(nb.position).sub(this.position);
                            const d = delta.length();
                            if (d < 0.0001) continue;
                            const dir = delta.normalize();
                            if (d > restLength) {
                                this.velocity.add(dir.clone().multiplyScalar((d - restLength) * tetherStrength * deltaTime));
                            } else if (d < restLength * 0.5) {
                                this.velocity.add(dir.clone().multiplyScalar(-(restLength * 0.5 - d) * tetherStrength * deltaTime));
                            }
                        }
                    }

                    // 3. Invisible blob boundary: the radius in a given
                    // direction wobbles organically over time, so the wall is
                    // not a perfect sphere. Hornets press outward, hit it,
                    // bounce off, and pick a new escape direction.
                    const dirX = outward.x, dirY = outward.y, dirZ = outward.z;
                    let blobFactor = 1
                        + 0.18 * Math.sin(dirX * 4 + time * 0.6)
                        + 0.12 * Math.cos(dirY * 5 - time * 0.4)
                        + 0.10 * Math.sin(dirZ * 3 + time * 0.8);
                    blobFactor = Math.max(0.78, Math.min(1.22, blobFactor));
                    const boundaryRadius = netRadius * blobFactor;
                    if (distFromCenter > boundaryRadius) {
                        const backInside = new THREE.Vector3().copy(center).sub(this.position).normalize()
                            .multiplyScalar((distFromCenter - boundaryRadius) * NET_STRENGTH * deltaTime);
                        this.velocity.add(backInside);
                        const outwardSpeed = this.velocity.dot(outward);
                        if (outwardSpeed > 0) {
                            this.velocity.add(outward.clone().multiplyScalar(-outwardSpeed * 0.9));
                        }
                        if (distFromCenter > boundaryRadius * 1.5) {
                            this.position.copy(center).add(outward.multiplyScalar(boundaryRadius));
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

                // Speed cap for the bag only: angry, not exploding.
                if (netRadius !== undefined) {
                    const maxSpeed = this.particleParams.maxSpeed || 11;
                    const speed = this.velocity.length();
                    if (speed > maxSpeed) {
                        this.velocity.multiplyScalar(maxSpeed / speed);
                    }
                }

                // Damping (frame-rate independent: 0.96 in glitch v2, so
                // motion persists longer than the old 0.92 tremble)
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