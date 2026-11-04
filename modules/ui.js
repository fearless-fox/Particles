export default class UI {
    constructor(app) {
        this.app = app;
        this.controlsVisible = false;
    }

    setupControls() {
        const controls = document.querySelectorAll('input, select');

        controls.forEach(control => {
            control.addEventListener('input', (e) => {
                this.updateParameter(e.target.id, e.target.value, e.target.type);
            });

            if (control.type === 'range') {
                this.updateValueDisplay(control.id, control.value);
            }
        });

        document.querySelectorAll('.control-group-header').forEach(header => {
            header.addEventListener('click', () => {
                const body = header.nextElementSibling;
                header.classList.toggle('collapsed');
                if (header.classList.contains('collapsed')) {
                    body.style.maxHeight = '0';
                } else {
                    body.style.maxHeight = body.scrollHeight + 'px';
                }
            });
        });

        document.getElementById('physicsMode').addEventListener('input', (e) => {
            this.app.switchMode(e.target.value);
            this.updateModeUI(e.target.value);
        });


        const toggleBtn = document.querySelector('.toggle-controls');
        if (toggleBtn) {
            let hoverRestoreTimer = null;
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleControls();
                toggleBtn.classList.add('dimmed');
            });

            toggleBtn.addEventListener('mouseenter', () => {
                if (toggleBtn.classList.contains('dimmed')) {
                    hoverRestoreTimer = setTimeout(() => {
                        toggleBtn.classList.remove('dimmed');
                    }, 1000);
                }
            });

            toggleBtn.addEventListener('mouseleave', () => {
                if (hoverRestoreTimer) { clearTimeout(hoverRestoreTimer); hoverRestoreTimer = null; }
            });

            toggleBtn.addEventListener('touchstart', (e) => {
                this.toggleControls();
                toggleBtn.classList.add('dimmed');
            }, { passive: true });

            toggleBtn.addEventListener('touchend', () => {
                setTimeout(() => toggleBtn.classList.remove('dimmed'), 1000);
            });
        }
    }

    updateParameter(id, value, type) {
        // Selects carry strings, not numbers: parseFloat('subtractive')
        // is NaN, which used to overwrite blendMode with NaN and then
        // make updateBlendMode assign an undefined blending mode.
        const numValue = (type === 'color' || type === 'select-one') ? value : parseFloat(value);

        if (id.includes('Color')) {
            this.app.particleParams[id] = new THREE.Color(value);
        } else if (id === 'zenMode') {
            this.app.particleParams.zenMode = (value === 'true');
        } else if (this.app.particleParams.hasOwnProperty(id)) {
            this.app.particleParams[id] = numValue;
        }

        let displayValue = value;
        if (id === 'emissionRate' || id === 'lifespan' || id === 'ghostDuration') {
            displayValue += 's';
        } else if (id === 'spreadAngle') {
            displayValue += '°';
        }
        this.updateValueDisplay(id, displayValue);

        if (id === 'blendMode') {
            this.app.particleSystem.updateBlendMode();
        }
    }

    updateValueDisplay(id, value) {
        const display = document.getElementById(id + 'Value');
        if (display) {
            display.textContent = value;
        }
    }

    toggleControls() {
        const controls = document.getElementById('controls');
        this.controlsVisible = !this.controlsVisible;

        if (this.controlsVisible) {
            controls.classList.remove('hidden');
        } else {
            controls.classList.add('hidden');
        }
        const toggleBtn = document.querySelector('.toggle-controls');
        if (toggleBtn) {
            try { toggleBtn.setAttribute('aria-expanded', this.controlsVisible ? 'true' : 'false'); } catch (e) {}
        }
    }

    updateModeUI(mode) {
        document.getElementById('fluid-controls').classList.toggle('hidden', mode !== 'fluid');
        document.getElementById('glitch-controls').classList.toggle('hidden', mode !== 'glitch');
    }
}