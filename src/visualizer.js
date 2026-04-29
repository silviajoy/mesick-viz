import * as THREE from 'three';

export class Visualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x020205);
        this.renderer.autoClear = false;
        
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x020205, 0.002);
        this.backgroundScene = new THREE.Scene();
        const initialAspect = window.innerWidth / window.innerHeight;
        this.backgroundCamera = new THREE.OrthographicCamera(-initialAspect, initialAspect, 1, -1, 0, 10);
        this.backgroundCamera.position.z = 1;
        
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
        this.camera.position.z = 200;
        this.camera.rotation.x = 1.16;
        this.camera.position.y = -100;
        this.camera.position.x = 0;

        this.ambientLight = new THREE.AmbientLight(0x555555);
        this.scene.add(this.ambientLight);

        this.flashLight = new THREE.PointLight(0x0066ff, 50, 500, 1.7);
        this.flashLight.position.set(0, 50, 100);
        this.scene.add(this.flashLight);

        this.initClouds();
        this.initRain();
        this.initOrganicShapes();
        
        this.palettes = {
            neon: { hues: [0.8, 0.9, 0.6, 0.4, 0.1, 0.2, 0.3], bgColor: 0x050015, veil: 'rgba(48,8,64,0.6)' },
            fire: { hues: [0.0, 0.05, 0.1, 0.12, 0.15, 0.02, 0.08], bgColor: 0x0c0105, veil: 'rgba(80,16,8,0.7)' },
            ocean: { hues: [0.55, 0.6, 0.5, 0.65, 0.45, 0.7, 0.58], bgColor: 0x050110, veil: 'rgba(7, 21, 52, 0.6)' },
            aurora: { hues: [0.42, 0.48, 0.55, 0.62, 0.38, 0.72, 0.58], bgColor: 0x020915, veil: 'rgba(10,42,48,0.6)' },
            sunset: { hues: [0.02, 0.05, 0.09, 0.14, 0.92, 0.98, 0.11], bgColor: 0x150806, veil: 'rgba(72,24,12,0.6)' },
            mono: { hues: [0.0, 0.02, 0.04, 0.08, 0.14, 0.18, 0.22], bgColor: 0x06070a, veil: 'rgba(18,18,24,0.6)' },
            acid: { hues: [0.2, 0.25, 0.3, 0.33, 0.36, 0.42, 0.45], bgColor: 0x07110b, veil: 'rgba(18,60,20,0.6)' }
        };
        this.currentPalette = 'neon';
        this.backgroundImage = null;
        this.backgroundTexture = null;
        this.backgroundPlane = null;
        this.backgroundVeil = null;
        this.shapeStyles = {
            spikey: { displacement: 1.35, morph: 2.5, scale: 1.05, opacity: 1.0, wobble: 2.0, jitter: 0.85, shade: 0.10 },
            fluid: { displacement: 0.72, morph: 1.0, scale: 0.85, opacity: 0.68, wobble: 0.75, jitter: 0.18, shade: 0.04 },
            unstable: { displacement: 1.55, morph: 1.55, scale: 1.0, opacity: 0.86, wobble: 3.0, jitter: 1.25, shade: 0.16 },
            crystalline: { displacement: 0.95, morph: 1.8, scale: 0.92, opacity: 0.9, wobble: 0.55, jitter: 0.24, shade: 0.08 }
        };
        this.currentShapeStyle = 'spikey';
    }
    
    setPalette(name) {
        const palette = this.palettes[name];
        if (palette) {
            this.currentPalette = name;

            const hasBackgroundImage = !!this.backgroundTexture;
            this.renderer.setClearColor(palette.bgColor, 1);
            this.scene.fog.color.setHex(palette.bgColor);
            
            // Reassign hues per shape pool to map pitch -> palette logic
            this.shapePools.forEach((pool, index) => {
                const paletteHues = palette.hues;
                // Lower pitch stems to the beginning of the palette, higher to the end
                const mappedHue = paletteHues[index % paletteHues.length];
                
                pool.forEach(s => {
                    s.hue = mappedHue;
                });
            });
            // If a background image is currently applied via CSS, update the veil color
            if (hasBackgroundImage) {
                this._applyBackgroundLayers();
            }
        }
    }

    setShapeStyle(name) {
        if (this.shapeStyles[name]) {
            this.currentShapeStyle = name;
        }
    }
    
    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.backgroundCamera.left = -(width / height);
        this.backgroundCamera.right = width / height;
        this.backgroundCamera.top = 1;
        this.backgroundCamera.bottom = -1;
        this.backgroundCamera.updateProjectionMatrix();
        this._updateBackgroundScale();
        
        const isMobile = width < height;
        
        // Rethink the spatial orientation of elements based on aspect ratio
        if (this.shapePools) {
            this.shapePools.forEach((pool) => {
                pool.forEach(s => {
                    if (isMobile) {
                        s.baseX = Math.random() * 300 - 150; // Narrow horizontal
                        s.baseY = Math.random() * 800 - 300; // Tall vertical
                        s.baseZ = Math.random() * 600 - 300;
                    } else {
                        s.baseX = Math.random() * 800 - 400; // Wide horizontal
                        s.baseY = Math.random() * 400 - 150; // Normal vertical
                        s.baseZ = Math.random() * 600 - 300;
                    }
                });
            });
        }
    }

    initClouds() {
        this.cloudParticles = [];
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        function drawSoftCircle(x, y, r) {
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        
        drawSoftCircle(256, 256, 130); drawSoftCircle(170, 270, 100); drawSoftCircle(340, 250, 110);
        drawSoftCircle(230, 170, 95); drawSoftCircle(310, 330, 90); drawSoftCircle(160, 180, 75);
        
        const texture = new THREE.CanvasTexture(canvas);
        const cloudGeo = new THREE.PlaneGeometry(400, 400);
        const cloudMaterial = new THREE.MeshLambertMaterial({
                    map: texture, transparent: true, opacity: 0.6, color: 0x666688,
            depthWrite: false, blending: THREE.AdditiveBlending
        });

                const cloudColumns = 9;
                const cloudRows = 5;
                const xStep = 800 / (cloudColumns - 1);
                const yStep = 300 / (cloudRows - 1);

        for (let p = 0; p < 45; p++) {
            const cloud = new THREE.Mesh(cloudGeo, cloudMaterial);
                    const column = p % cloudColumns;
                    const row = Math.floor(p / cloudColumns) % cloudRows;
                    const centeredX = -400 + (column * xStep);
                    const centeredY = -50 + (row * yStep);
                    const jitterX = (Math.random() * 50) - 25;
                    const jitterY = (Math.random() * 30) - 15;
                    const jitterZ = (Math.random() * 80) - 40;

                    cloud.position.set(centeredX + jitterX, centeredY + jitterY, -350 + (row * 50) + jitterZ);
            cloud.rotation.x = 1.16; cloud.rotation.y = -0.12; cloud.rotation.z = Math.random() * 2 * Math.PI;
                    cloud.material.opacity = 0.38;
            this.cloudParticles.push(cloud);
            this.scene.add(cloud);
        }
    }

    initRain() {
        this.rainCount = 10000;
        const rainGeo = new THREE.BufferGeometry();
        const rainPos = new Float32Array(this.rainCount * 3);
        const rainVel = [];
        
        for(let i=0;i<this.rainCount;i++) {
            rainPos[i*3] = Math.random() * 800 - 400;
            rainPos[i*3+1] = Math.random() * 800 - 400;
            rainPos[i*3+2] = Math.random() * 800 - 400;
            rainVel.push(Math.random() * 0.1 + 0.1); 
        }
        rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
        
        const rainCanvas = document.createElement('canvas');
        rainCanvas.width = 8; rainCanvas.height = 64;
        const rainCtx = rainCanvas.getContext('2d');
        const rainGrad = rainCtx.createLinearGradient(0, 0, 0, 64);
        rainGrad.addColorStop(0, 'rgba(255, 255, 255, 0)'); rainGrad.addColorStop(0.5, 'rgba(255, 255, 255, 1)'); rainGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        rainCtx.fillStyle = rainGrad; rainCtx.fillRect(3, 0, 2, 64);
        
        this.rainSystem = new THREE.Points(rainGeo, new THREE.PointsMaterial({
            color: 0x88ccff, size: 4.0, map: new THREE.CanvasTexture(rainCanvas),
            transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        this.rainVel = rainVel;
        this.scene.add(this.rainSystem);
    }

    // Helper: Make organic blob geometry
    createBlobGeometry(poolIdx) {
        let geo;
        switch(poolIdx % 12) {
            case 0: geo = new THREE.SphereGeometry(2, 32, 32); break;
            case 1: geo = new THREE.TorusGeometry(1.5, 0.6, 16, 32); break;
            case 2: geo = new THREE.IcosahedronGeometry(2, 4); break;
            case 3: geo = new THREE.CylinderGeometry(1.5, 1.5, 3, 32, 16); break;
            case 4: geo = new THREE.TorusKnotGeometry(1.5, 0.4, 64, 8); break;
            case 5: geo = new THREE.OctahedronGeometry(2, 4); break;
            case 6: geo = new THREE.BoxGeometry(3, 3, 3, 8, 8, 8); break;
            case 7: geo = new THREE.DodecahedronGeometry(2, 4); break;
            case 8: geo = new THREE.ConeGeometry(2, 4, 32, 16); break;
            case 9: geo = new THREE.CapsuleGeometry(1.5, 2, 16, 32); break;
            case 10: geo = new THREE.TorusGeometry(2.5, 0.2, 16, 64); break; // thin ring
            case 11: geo = new THREE.TetrahedronGeometry(2, 4); break;
            default: geo = new THREE.SphereGeometry(2, 32, 32); break;
        }
        
        // Store original vertices for morphing
        const posAttribute = geo.attributes.position;
        geo.userData.originalVertices = [];
        for (let i = 0; i < posAttribute.count; i++) {
            geo.userData.originalVertices.push(new THREE.Vector3(
                posAttribute.getX(i),
                posAttribute.getY(i),
                posAttribute.getZ(i)
            ));
        }
        return geo;
    }

    initOrganicShapes() {
        this.shapePools = [];
        
        const orbCanvas = document.createElement('canvas');
        orbCanvas.width = 128; orbCanvas.height = 128;
        const octx = orbCanvas.getContext('2d');
        const ograd = octx.createRadialGradient(64, 64, 0, 64, 64, 64);
        ograd.addColorStop(0, 'rgba(255, 255, 255, 1)');
        ograd.addColorStop(0.2, 'rgba(200, 220, 255, 0.8)');
        ograd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        octx.fillStyle = ograd; octx.fillRect(0,0,128,128);
        const orbTexture = new THREE.CanvasTexture(orbCanvas);
        
        // 12 unique pools that map a distinct geometry to each stem
        for (let poolIdx = 0; poolIdx < 12; poolIdx++) {
            const pool = [];
            const hue = poolIdx / 12;
            
            for(let i=0; i<25; i++) {
                let mesh;
                
                const mat = new THREE.MeshPhongMaterial({ 
                    color: new THREE.Color().setHSL(hue, 1, 0.6), 
                    shininess: 100, 
                    transparent: true, opacity: 0.7, 
                    blending: THREE.AdditiveBlending, depthWrite: false 
                });
                const geo = this.createBlobGeometry(poolIdx);
                mesh = new THREE.Mesh(geo, mat);

                mesh.position.set(Math.random() * 800 - 400, Math.random() * 400 - 150, Math.random() * 600 - 300);
                const baseScale = (Math.random() * 3 + 1.5);
                mesh.scale.set(baseScale, baseScale, baseScale);
                mesh.visible = false;
                
                this.scene.add(mesh);
                pool.push({
                    mesh,
                    baseX: mesh.position.x, baseY: mesh.position.y, baseZ: mesh.position.z,
                    baseScale, 
                    offset: Math.random() * Math.PI * 2, 
                    hue, noiseSeed: Math.random() * 100
                });
            }
            this.shapePools.push(pool);
        }
    }

    update(freqs) {
        if (freqs.lows > 0.6) {
            this.flashLight.intensity = Math.random() * 2000 * freqs.lows;
            this.flashLight.position.set(Math.random() * 200 - 100, 50 + Math.random() * 100, 100);
        } else {
            this.flashLight.intensity = this.flashLight.intensity * 0.9;
        }

        const positions = this.rainSystem.geometry.attributes.position.array;
        const rainBoost = 1 + (freqs.highs * 10);
        this.rainSystem.material.opacity = 0.3 + (freqs.highs * 0.7);

        for(let i=0; i<this.rainCount; i++) {
            this.rainVel[i] -= 0.001; 
            if (this.rainVel[i] < -2) this.rainVel[i] = -2;
            positions[i*3+1] -= (0.5 * rainBoost);
            if (positions[i*3+1] < -200) positions[i*3+1] = 400;
        }
        this.rainSystem.geometry.attributes.position.needsUpdate = true;

        this.cloudParticles.forEach(p => p.rotation.z -= 0.001);

        const activeValues = (freqs.stems && freqs.stems.length > 0) ? freqs.stems : [freqs.mids];
        const time = Date.now() * 0.001;
        
        this.shapePools.forEach((pool, poolIdx) => {
            const isActive = poolIdx < activeValues.length;
            const style = this.shapeStyles[this.currentShapeStyle] || this.shapeStyles.spikey;
            
            // To make reactivity obvious, we square the value.
            // Smoothing makes it look organic instead of robotic/jittery
            const targetFreqVal = isActive ? activeValues[poolIdx] : 0;
            
            // Add easing for less robotic feel
            if (!this.smoothedValues) this.smoothedValues = [];
            if (this.smoothedValues[poolIdx] === undefined) this.smoothedValues[poolIdx] = targetFreqVal;
            this.smoothedValues[poolIdx] += (targetFreqVal - this.smoothedValues[poolIdx]) * 0.12; // smooth lerp
            
            const freqVal = this.smoothedValues[poolIdx];
            const intenseVal = freqVal * freqVal; 

            pool.forEach(s => {
                s.mesh.visible = isActive;
                if (!isActive) return;

                // Lock base position with strong displacement based ONLY on music volume
                const displacement = intenseVal * 100 * style.displacement;
                s.mesh.position.y = s.baseY + (Math.sin((time * style.wobble) + s.offset) * displacement);
                s.mesh.position.x = s.baseX + (Math.cos((time * 0.8 * style.wobble) + s.offset) * displacement);
                s.mesh.position.z = s.baseZ + (Math.sin((time * 1.2 * style.wobble) + s.offset) * displacement);
                s.mesh.position.x += (Math.sin(time * 2.4 + s.noiseSeed) * style.jitter * intenseVal * 20);
                s.mesh.position.y += (Math.cos(time * 2.0 + s.noiseSeed) * style.jitter * intenseVal * 15);
                
                // Color intensity shift based on audio
                s.mesh.material.color.setHSL(s.hue, 1.0, 0.45 + (intenseVal * 0.55) + style.shade);

                // Blob vertex morphing purely driven by frequency
                const geo = s.mesh.geometry;
                const posAttribute = geo.attributes.position;
                const original = geo.userData.originalVertices;
                
                for (let i = 0; i < posAttribute.count; i++) {
                    const origVert = original[i];
                    
                    // Calculate a direction vector from center
                    const dir = origVert.clone().normalize();
                    
                    // Push vertex outward drastically if music is loud
                    const spike = style.displacement * 0.25;
                    const wobble = Math.sin((time * 5 * style.wobble) + i + s.noiseSeed) * intenseVal * (1 + style.morph * 0.8);
                    const pulse = intenseVal * style.morph * 2.5;
                    const push = pulse + (wobble * style.morph) + (dir.x + dir.y + dir.z) * spike;
                    
                    posAttribute.setXYZ(
                        i,
                        origVert.x + dir.x * push,
                        origVert.y + dir.y * push,
                        origVert.z + dir.z * push
                    );
                }
                
                posAttribute.needsUpdate = true;
                
                // Scale whole shape based on music hit
                const pulse = 1 + (intenseVal * 5 * style.scale);
                const size = s.baseScale * pulse;
                s.mesh.scale.set(size, size, size);
                
                s.mesh.material.opacity = Math.max(0.08, Math.min(1, style.opacity * (0.12 + (intenseVal * 0.88))));
            });
        });

        this.renderer.clear();
        if (this.backgroundTexture) {
            this.renderer.render(this.backgroundScene, this.backgroundCamera);
        }
        this.renderer.render(this.scene, this.camera);
    }

    // Set a background from an HTMLImageElement. Places it behind the scene.
    setBackgroundImage(image) {
        if (!image) return;

        this.backgroundImage = image;

        if (this.backgroundTexture) {
            this.backgroundTexture.dispose();
        }

        this.backgroundTexture = new THREE.Texture(image);
        this.backgroundTexture.needsUpdate = true;
        this.backgroundTexture.colorSpace = THREE.SRGBColorSpace;
        this.backgroundTexture.minFilter = THREE.LinearFilter;
        this.backgroundTexture.magFilter = THREE.LinearFilter;
        this.backgroundTexture.generateMipmaps = false;

        this._ensureBackgroundLayers();
        this._applyBackgroundLayers();
    }

    _ensureBackgroundLayers() {
        if (!this.backgroundPlane) {
            const geometry = new THREE.PlaneGeometry(2, 2);
            const material = new THREE.MeshBasicMaterial({
                map: this.backgroundTexture,
                transparent: false,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false
            });
            this.backgroundPlane = new THREE.Mesh(geometry, material);
            this.backgroundPlane.renderOrder = -20;
            this.backgroundScene.add(this.backgroundPlane);
        }

        if (!this.backgroundVeil) {
            const geometry = new THREE.PlaneGeometry(2, 2);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false
            });
            this.backgroundVeil = new THREE.Mesh(geometry, material);
            this.backgroundVeil.renderOrder = -19;
            this.backgroundScene.add(this.backgroundVeil);
        }
    }

    _applyBackgroundLayers() {
        if (!this.backgroundTexture) return;

        if (this.backgroundPlane) {
            this.backgroundPlane.visible = true;
        }

        if (this.backgroundVeil) {
            this.backgroundVeil.visible = true;
        }

        const palette = this.palettes[this.currentPalette];
        const veil = (palette && palette.veil) || 'rgba(0,0,0,0.3)';
        const match = veil.match(/rgba?\(([^)]+)\)/i);
        const parts = match ? match[1].split(',').map(part => parseFloat(part.trim())) : [0, 0, 0, 0.3];

        if (this.backgroundVeil && this.backgroundVeil.material) {
            const color = new THREE.Color(
                Math.max(0, Math.min(1, (parts[0] || 0) / 255)),
                Math.max(0, Math.min(1, (parts[1] || 0) / 255)),
                Math.max(0, Math.min(1, (parts[2] || 0) / 255))
            );
            this.backgroundVeil.material.color = color;
            this.backgroundVeil.material.opacity = parts.length > 3 ? parts[3] : 0.3;
        }

        if (this.backgroundPlane && this.backgroundPlane.material) {
            this.backgroundPlane.material.map = this.backgroundTexture;
            this.backgroundPlane.material.map.wrapS = THREE.ClampToEdgeWrapping;
            this.backgroundPlane.material.map.wrapT = THREE.ClampToEdgeWrapping;
            this.backgroundPlane.material.map.repeat.set(1, 1);
            this.backgroundPlane.material.map.offset.set(0, 0);
            this.backgroundPlane.material.needsUpdate = true;
        }

        this._updateBackgroundScale();
    }

    _updateBackgroundScale() {
        if (!this.backgroundImage || !this.backgroundPlane || !this.backgroundVeil) return;

        const viewportAspect = this.camera.aspect;
        const imageAspect = this.backgroundImage.width / this.backgroundImage.height;

        // Base scale to fill ortho camera bounds (2x2 plane fills 2*aspect x 2 viewport)
        let scaleX = viewportAspect;
        let scaleY = 1;

        // Apply cover scaling on top
        if (imageAspect > viewportAspect) {
            scaleX *= imageAspect / viewportAspect;
        } else {
            scaleY *= viewportAspect / imageAspect;
        }

        this.backgroundPlane.scale.set(scaleX, scaleY, 1);
        this.backgroundVeil.scale.set(scaleX, scaleY, 1);
    }

    // Clear any background image and restore palette-based background
    clearBackground() {
        if (this.backgroundTexture) {
            this.backgroundTexture.dispose();
            this.backgroundTexture = null;
        }

        this.backgroundImage = null;

        if (this.backgroundPlane) {
            this.backgroundPlane.visible = false;
        }

        if (this.backgroundVeil) {
            this.backgroundVeil.visible = false;
        }

        // Reset clear color and fog to match current palette (opaque)
        this.setPalette(this.currentPalette);
    }
}
