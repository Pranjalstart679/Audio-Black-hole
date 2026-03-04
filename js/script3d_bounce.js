// 2.5D Audio Reactive Particle System
let scene3d, camera3d, renderer3d;
let blackHoleCore3d, particleSystem3d;
let particlesGeometry3d;
let particleData3d = [];

function init3D() {
    scene3d = new THREE.Scene();
    scene3d.fog = new THREE.FogExp2(0x020108, 0.0012);

    // Set up an angled perspective for a 2.5D look
    camera3d = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera3d.position.set(0, 250, 400); 
    camera3d.lookAt(0, 0, 0);

    const canvasContainer = document.getElementById('canvas-3d-container');
    renderer3d = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer3d.setSize(window.innerWidth, window.innerHeight);
    renderer3d.setPixelRatio(window.devicePixelRatio);
    canvasContainer.appendChild(renderer3d.domElement);

    // Singularity Core
    const coreGeometry = new THREE.SphereGeometry(30, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    blackHoleCore3d = new THREE.Mesh(coreGeometry, coreMaterial);
    
    // Core Aura
    const auraGeo = new THREE.SphereGeometry(38, 32, 32);
    const auraMat = new THREE.MeshBasicMaterial({ 
        color: 0x9d4edd, 
        transparent: true, 
        opacity: 0.15, 
        blending: THREE.AdditiveBlending 
    });
    const coreAura = new THREE.Mesh(auraGeo, auraMat);
    blackHoleCore3d.add(coreAura);
    
    scene3d.add(blackHoleCore3d);

    generate3DParticles();

    window.addEventListener('resize', () => {
        camera3d.aspect = window.innerWidth / window.innerHeight;
        camera3d.updateProjectionMatrix();
        renderer3d.setSize(window.innerWidth, window.innerHeight);
    });

    animate3D();
}

function generate3DParticles() {
    if (particleSystem3d) {
        scene3d.remove(particleSystem3d);
        particlesGeometry3d.dispose();
    }

    // Multiply count slightly for depth volume
    const particleCount = (window.CONFIG ? window.CONFIG.particleCount : 2000) * 3; 
    particlesGeometry3d = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 6);
    const colors = new Float32Array(particleCount * 6);
    particleData3d = [];
    
    for (let i = 0; i < particleCount; i++) {
        let theta = Math.random() * Math.PI * 2;
        let r = 40 + Math.pow(Math.random(), 1.5) * 800; // density near center
        
        let x = r * Math.cos(theta);
        // Vertical thickness (2.5D layering effect)
        let y = (Math.random() - 0.5) * (r * 0.15); 
        let z = r * Math.sin(theta);

        // Tail
        positions[i * 6] = x;
        positions[i * 6 + 1] = y;
        positions[i * 6 + 2] = z;
        // Head
        positions[i * 6 + 3] = x;
        positions[i * 6 + 4] = y;
        positions[i * 6 + 5] = z;

        particleData3d.push({
            angle: theta,
            distance: r,
            baseYOffset: y,
            speedModifier: Math.random() * 0.5 + 0.5,
            intensity: 0.5 + Math.random() * 0.5,
            hue: 0.70 + (Math.random() * 0.15) // purple to blue variations
        });

        const color = new THREE.Color();
        color.setHSL(particleData3d[i].hue, 0.8, particleData3d[i].intensity);

        for(let j=0; j<2; j++) {
            colors[i*6 + j*3] = color.r;
            colors[i*6 + j*3 + 1] = color.g;
            colors[i*6 + j*3 + 2] = color.b;
        }
    }

    particlesGeometry3d.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry3d.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particlesMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.7, 
        blending: THREE.AdditiveBlending
    });

    particleSystem3d = new THREE.LineSegments(particlesGeometry3d, particlesMaterial);
    scene3d.add(particleSystem3d);
}

function animate3D() {
    requestAnimationFrame(animate3D);

    if (window.currentMode !== '3D') return;

    // Monitor for UI slider changes
    const currentCount = particlesGeometry3d.attributes.position.count / 2;
    const targetCount = (window.CONFIG ? window.CONFIG.particleCount : 2000) * 3;
    if (currentCount !== targetCount) {
        generate3DParticles();
    }

    const data = window.audioData || { bassAvg: 0, trebleAvg: 0, energy: 0 };
    const config = window.CONFIG || { baseSpeed: 0.2, audioSensitivity: 1.0, streakLength: 2.0 };

    // Pulse core
    const coreScale = 1 + (data.bassAvg * 0.5 * config.audioSensitivity);
    blackHoleCore3d.scale.set(coreScale, coreScale, coreScale);

    const positions = particlesGeometry3d.attributes.position.array;
    for (let i = 0; i < particleData3d.length; i++) {
        let idx = i * 6;
        let pData = particleData3d[i];

        let effectiveAudio = data.energy < 0.2 ? 0 : Math.pow(data.energy, 1.5);
        effectiveAudio *= config.audioSensitivity;

        const pull = 1 + 600 / (pData.distance + 10);
        const speed = (config.baseSpeed * pData.speedModifier + effectiveAudio * 5) * pull;
        
        const swirlAmount = 0.8 + effectiveAudio * 0.4;
        pData.angle += (speed * swirlAmount) / pData.distance;
        pData.distance -= speed * 0.25;

        // 2.5D Audio reactivity: Particles bounce vertically on the Y axis 
        // depending on distance and audio frequencies
        let verticalBounce = 0;
        if (pData.distance > 50) {
            let frequencyResponse = pData.distance < 300 ? data.bassAvg : data.trebleAvg;
            verticalBounce = (Math.sin(pData.angle * 4 + Date.now() * 0.005) * 40 * frequencyResponse * config.audioSensitivity);
        }
        
        let newY = pData.baseYOffset + verticalBounce;
        let newX = pData.distance * Math.cos(pData.angle);
        let newZ = pData.distance * Math.sin(pData.angle);

        let oldX = positions[idx + 3];
        let oldY = positions[idx + 4];
        let oldZ = positions[idx + 5];

        let velocityX = newX - oldX;
        let velocityY = newY - oldY;
        let velocityZ = newZ - oldZ;

        // Advance head
        positions[idx + 3] = newX;
        positions[idx + 4] = newY;
        positions[idx + 5] = newZ;

        // Drag tail behind
        positions[idx] = newX - velocityX * config.streakLength * 1.5;
        positions[idx + 1] = newY - velocityY * config.streakLength * 1.5;
        positions[idx + 2] = newZ - velocityZ * config.streakLength * 1.5;

        // Respawn horizon
        if (pData.distance < 32 * coreScale) {
            pData.distance = 600 + Math.random() * 300;
            pData.angle = Math.random() * Math.PI * 2;
            pData.baseYOffset = (Math.random() - 0.5) * (pData.distance * 0.15);
            
            let sx = pData.distance * Math.cos(pData.angle);
            let sy = pData.baseYOffset;
            let sz = pData.distance * Math.sin(pData.angle);
            
            // set tail and head immediately to new spawn to prevent long drag line crossing the void
            positions[idx] = sx;
            positions[idx+1] = sy;
            positions[idx+2] = sz;
            positions[idx+3] = sx;
            positions[idx+4] = sy;
            positions[idx+5] = sz;
        }
    }
    particlesGeometry3d.attributes.position.needsUpdate = true;

    // Cinematic 2.5D Camera Drift
    let time = Date.now() * 0.0002;
    camera3d.position.x = Math.sin(time) * 150;
    camera3d.position.z = 400 + Math.cos(time) * 100;
    
    // Slight vertical shift
    camera3d.position.y = 250 + Math.sin(time * 0.5) * 50;
    camera3d.lookAt(0, 0, 0);

    // Camera shake on heavy bass
    if (data.bassAvg > 0.8) {
        let shake = (data.bassAvg - 0.8) * 20 * config.audioSensitivity;
        camera3d.position.x += (Math.random() - 0.5) * shake;
        camera3d.position.y += (Math.random() - 0.5) * shake;
    }

    renderer3d.render(scene3d, camera3d);
}

// Start 3D environment
init3D();
