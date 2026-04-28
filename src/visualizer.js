import * as THREE from 'three';

export class Visualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x020205);
        
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x020205, 0.002);
        
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
            neon: [0.8, 0.9, 0.6, 0.4, 0.1, 0.2, 0.3], // Purple, Pink, Blue, Cyan
            fire: [0.0, 0.05, 0.1, 0.12, 0.15, 0.02, 0.08], // Red, Orange, Gold, Yellow
            ocean: [0.55, 0.6, 0.5, 0.65, 0.45, 0.7, 0.58] // Deep blue, Seafoam, Teal
        };
        this.currentPalette = 'neon';
    }
    
    setPalette(name) {
        if (this.palettes[name]) {
            this.currentPalette = name;
            
            let bgColor = 0x050015; // neon (dark violet/blue contrast)
            if (name === 'fire') bgColor = 0x0c0105; // fire (dark maroon/plum contrast)
            else if (name === 'ocean') bgColor = 0x050110; // ocean (deep cool space blue/purple contrast)

            this.renderer.setClearColor(bgColor);
            this.scene.fog.color.setHex(bgColor);
            
            // Reassign hues per shape pool to map pitch -> palette logic
            this.shapePools.forEach((pool, index) => {
                const paletteHues = this.palettes[this.currentPalette];
                // Lower pitch stems to the beginning of the palette, higher to the end
                const mappedHue = paletteHues[index % paletteHues.length];
                
                pool.forEach(s => {
                    s.hue = mappedHue;
                });
            });
        }
    }
    
    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
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

        for (let p = 0; p < 45; p++) {
            const cloud = new THREE.Mesh(cloudGeo, cloudMaterial);
            cloud.position.set(Math.random() * 800 - 400, Math.random() * 300 - 50, Math.random() * 500 - 350);
            cloud.rotation.x = 1.16; cloud.rotation.y = -0.12; cloud.rotation.z = Math.random() * 2 * Math.PI;
            cloud.material.opacity = 0.55;
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
            const useBlob = true; // Force all to use full 3D organic meshes
            
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
                    mesh, useBlob, 
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
                const displacement = intenseVal * 100;
                s.mesh.position.y = s.baseY + (Math.sin(time + s.offset) * displacement);
                s.mesh.position.x = s.baseX + (Math.cos(time * 0.8 + s.offset) * displacement);
                s.mesh.position.z = s.baseZ + (Math.sin(time * 1.2 + s.offset) * displacement);
                
                // Color intensity shift based on audio
                s.mesh.material.color.setHSL(s.hue, 1.0, 0.45 + (intenseVal * 0.55));

                if (s.useBlob) {
                    // Blob vertex morphing purely driven by frequency
                    const geo = s.mesh.geometry;
                    const posAttribute = geo.attributes.position;
                    const original = geo.userData.originalVertices;
                    
                    for (let i = 0; i < posAttribute.count; i++) {
                        const origVert = original[i];
                        
                        // Calculate a direction vector from center
                        const dir = origVert.clone().normalize();
                        
                        // Push vertex outward drastically if music is loud
                        const push = intenseVal * 4 + (Math.sin(time * 5 + i + s.noiseSeed) * intenseVal * 2);
                        
                        posAttribute.setXYZ(
                            i,
                            origVert.x + dir.x * push,
                            origVert.y + dir.y * push,
                            origVert.z + dir.z * push
                        );
                    }
                    posAttribute.needsUpdate = true;
                    // Scale whole blob based on music hit
                    const pulse = 1 + (intenseVal * 5);
                    const size = s.baseScale * pulse;
                    s.mesh.scale.set(size, size, size);
                } else {
                    // Sprites just pulse in scale aggressively
                    const pulse = 1 + (intenseVal * 8);
                    const size = s.baseScale * pulse;
                    s.mesh.scale.set(size, size, 1);
                }
                
                s.mesh.material.opacity = 0.1 + (intenseVal * 0.9);
            });
        });

        this.renderer.render(this.scene, this.camera);
    }
}
