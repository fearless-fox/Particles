import Particle from './particle.js';

export default class ParticleSystem {
    constructor(scene, particleParams) {
        this.scene = scene;
        this.particleParams = particleParams;
        this.particles = [];
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.particleParams.count * 3);
        this.colors = new Float32Array(this.particleParams.count * 3);
        this.sizes = new Float32Array(this.particleParams.count);
        this.alphas = new Float32Array(this.particleParams.count);

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
        this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                pointTexture: { value: this.createParticleTexture() }
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                varying float vAlpha;
                varying vec3 vColor;

                void main() {
                    vAlpha = alpha;
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (150.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D pointTexture;
                varying float vAlpha;
                varying vec3 vColor;

                void main() {
                    gl_FragColor = vec4(vColor, vAlpha);
                    gl_FragColor = gl_FragColor * texture2D(pointTexture, gl_PointCoord);
                }
            `,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            transparent: true,
            vertexColors: true
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.points);

        // Apply the params' blend mode at startup, not just on mode
        // switch: the material above defaults to Additive, while the
        // params default to Subtractive, so Zen on load used to render
        // with the wrong blend until the first mode switch.
        this.updateBlendMode();

        this.emissionTimer = 0;
    }

    createParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');

        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    emit(count, position = new THREE.Vector3(0, 0, 0)) {
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.particleParams.count) break;

            const angle = (Math.random() - 0.5) * this.particleParams.spreadAngle * Math.PI / 180;
            const elevation = (Math.random() - 0.5) * this.particleParams.spreadAngle * Math.PI / 180;

            const velocity = new THREE.Vector3(
                Math.sin(angle) * Math.cos(elevation),
                Math.sin(elevation),
                Math.cos(angle) * Math.cos(elevation)
            ).multiplyScalar(this.particleParams.initialSpeed * (0.5 + Math.random() * 0.5));

            this.particles.push(new Particle(position, velocity, this.particleParams));
        }
    }

    update(deltaTime) {
        // Update existing particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            if (!this.particles[i].update(deltaTime)) {
                this.particles.splice(i, 1);
            }
        }

        // Update geometry
        this.updateGeometry();
    }

    updateGeometry() {
        const positions = this.geometry.attributes.position.array;
        const colors = this.geometry.attributes.color.array;
        const sizes = this.geometry.attributes.size.array;
        const alphas = this.geometry.attributes.alpha.array;

        for (let i = 0; i < this.particleParams.count; i++) {
            if (i < this.particles.length) {
                const particle = this.particles[i];
                const lifeRatio = particle.getLifeRatio();

                positions[i * 3] = particle.position.x;
                positions[i * 3 + 1] = particle.position.y;
                positions[i * 3 + 2] = particle.position.z;

                // Color interpolation - only start changing color in last 30% of life
                let colorLerp = 0;
                if (lifeRatio < 0.3) {
                    colorLerp = 1 - (lifeRatio / 0.3);
                }
                const color = this.particleParams.startColor.clone().lerp(this.particleParams.endColor, colorLerp);
                colors[i * 3] = color.r;
                colors[i * 3 + 1] = color.g;
                colors[i * 3 + 2] = color.b;

                // Size stays consistent until ghost phase
                const sizeMultiplier = Math.max(0.3, Math.abs(lifeRatio) > 0 ? 1 : (1 + lifeRatio / this.particleParams.ghostDuration));
                sizes[i] = particle.size * sizeMultiplier;
                alphas[i] = particle.getAlpha();
            } else {
                // Hide unused particles
                positions[i * 3] = 0;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = 0;
                alphas[i] = 0;
                sizes[i] = 0;
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.attributes.size.needsUpdate = true;
        this.geometry.attributes.alpha.needsUpdate = true;
    }

    updateBlendMode() {
        const blendModes = {
            'normal': THREE.NormalBlending,
            'additive': THREE.AdditiveBlending,
            'multiply': THREE.MultiplyBlending,
            'subtractive': THREE.SubtractiveBlending
        };
        // Never assign an undefined blending mode (e.g. from a typo'd
        // or NaN blendMode value): keep the current mode instead.
        const next = blendModes[this.particleParams.blendMode];
        if (next !== undefined) {
            this.material.blending = next;
        }
    }

    gentleClear() {
        // Set clearing mode flag
        this.particleParams.clearingMode = true;
        
        // Reset after 6 seconds (time for all particles to fade)
        setTimeout(() => {
            this.particleParams.clearingMode = false;
        }, 6000);
    }

    clearParticles() {
        this.particles = [];
        const positions = this.geometry.attributes.position.array;
        const alphas = this.geometry.attributes.alpha.array;
        for (let i = 0; i < this.particleParams.count; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
            alphas[i] = 0;
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.alpha.needsUpdate = true;
    }
}