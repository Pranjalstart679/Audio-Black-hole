let scene, camera, renderer;
let blackHoleCore, accretionDisk, particleSystem;
let particlesGeometry;

// Configuration handling the toggle
const canvas2d = document.getElementById('canvas');
const canvas3dContainer = document.getElementById('canvas-3d-container');
const modeToggleBtn = document.getElementById('mode-toggle');

modeToggleBtn.addEventListener('click', () => {
    if (window.currentMode === '2D') {
        window.currentMode = '3D';
        canvas2d.style.display = 'none';
        canvas3dContainer.style.display = 'block';
        modeToggleBtn.textContent = 'View 2D Version';
        
        // Ensure 3D canvas resizes correctly when manifested
        if (renderer) {
            renderer.setSize(window.innerWidth, window.innerHeight);
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }
    } else {
        window.currentMode = '2D';
        canvas3dContainer.style.display = 'none';
        canvas2d.style.display = 'block';
        modeToggleBtn.textContent = 'View 3D Version';
    }
});

let particleData = []; // Store state for true curves

// Wrap generation in a distinct function to allow recreating geometries when UI changes
function generate3DParticles() {
    if (particleSystem) {
        scene.remove(particleSystem);
        particlesGeometry.dispose();
    }

    // 6. Particle System (LineSegments mimicking true curves)
    const particleCount = window.CONFIG ? window.CONFIG.particleCount : 20000;
    particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 6);
    const colors = new Float32Array(particleCount * 6);
    particleData = [];
    
    for (let i = 0; i < particleCount; i++) {
        let theta = Math.random() * Math.PI * 2;
        let r = 40 + Math.pow(Math.random(), 1.5) * 800; // denser near center
        
        let x = r * Math.cos(theta);
        // Force fully flat Y for the 2D reference look
        let y = 0;
        let z = r * Math.sin(theta);

        // tail vertex
        positions[i * 6] = x;
        positions[i * 6 + 1] = y;
        positions[i * 6 + 2] = z;
        // head vertex
        positions[i * 6 + 3] = x;
        positions[i * 6 + 4] = y;
        positions[i * 6 + 5] = z;

        // Store persistent state for smooth orbital calculus
        particleData.push({
            angle: theta,
            distance: r,
            speedModifier: Math.random() * 0.5 + 0.5,
            intensity: 0.6 + Math.random() * 0.4 // Brighter overall
        });

        // Color intensity mostly white like the reference pictures
        for(let j=0; j<2; j++) {
            colors[i*6 + j*3] = particleData[i].intensity;
            colors[i*6 + j*3 + 1] = particleData[i].intensity;
            colors[i*6 + j*3 + 2] = particleData[i].intensity;
        }
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particlesMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.8, // More opaque for sharper lines
        blending: THREE.AdditiveBlending
    });

    particleSystem = new THREE.LineSegments(particlesGeometry, particlesMaterial);
    scene.add(particleSystem);
}

// Function to handle changes from UI config sliders specifically for 3D
function update3DFromUI() {
    if (!particleSystem) return;
    // Check if count changed and rebuild if necessary
    const currentCount = particlesGeometry.attributes.position.count / 2;
    if (currentCount !== window.CONFIG.particleCount) {
        generate3DParticles();
    }
}

function init3D() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.002);

    // 2. Camera Setup (Top-down view for that flat spiral galaxy look)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.z = 0;
    camera.position.y = 500;
    camera.lookAt(0, 0, 0);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    canvas3dContainer.appendChild(renderer.domElement);

    // 4. Black Hole Core (Event Horizon) - Pure Black
    const coreGeometry = new THREE.SphereGeometry(30, 64, 64);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    blackHoleCore = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(blackHoleCore);

    // Remove accretion disk completely to match reference image void
    // Generate particles
    generate3DParticles();

    window.addEventListener('resize', onWindowResize);
    animate3D();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate3D() {
    requestAnimationFrame(animate3D);

    // Only render if 3D mode is active
    if (window.currentMode !== '3D') return;

    // Update the particle system if the UI slider was adjusted
    update3DFromUI();

    const data = window.audioData;
    const config = window.CONFIG || { baseSpeed: 0.2, audioSensitivity: 1.0, streakLength: 2.0 };

    // React to Audio Data
    
    // Core event horizon pulse
    const coreScale = 1 + (data.bassAvg * 0.3 * config.audioSensitivity);
    blackHoleCore.scale.set(coreScale, coreScale, coreScale);

    // Update particle geometry positions (true spirals matching the 2D version)
    const positions = particlesGeometry.attributes.position.array;
    for (let i = 0; i < positions.length / 6; i++) {
        let idx = i * 6;
        let pData = particleData[i];

        // Filter audio influence (exponential thresholding just like 2D)
        let effectiveAudio = data.energy < 0.2 ? 0 : Math.pow(data.energy, 1.5);
        effectiveAudio *= config.audioSensitivity;

        // Gravity pull inward
        const pull = 1 + 500 / (pData.distance + 10);
        
        // Speed: base orbit speed + audio boost
        const speed = (config.baseSpeed * pData.speedModifier + effectiveAudio * 6) * pull;

        // Swirl factor (spin direction)
        const swirlAmount = 0.8 + effectiveAudio * 0.5;
        pData.angle += (speed * swirlAmount) / pData.distance;

        // Move inward
        pData.distance -= speed * 0.3;

        // Calculate new head position
        let newX = pData.distance * Math.cos(pData.angle);
        let newY = (Math.random() - 0.5) * 5 * (pData.distance/800); // Very flat disk
        let newZ = pData.distance * Math.sin(pData.angle);

        // Previous head position (to calculate velocity vector for the tail)
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

        // Set tail behind the head based on streak configuration
        positions[idx] = newX - velocityX * config.streakLength * 2.0;
        positions[idx + 1] = newY - velocityY * config.streakLength * 2.0;
        positions[idx + 2] = newZ - velocityZ * config.streakLength * 2.0;

        // Responsively respawn particles if eaten by black hole
        if (pData.distance < 30 * coreScale) {
            pData.distance = 600 + Math.random() * 400;
            pData.angle = Math.random() * Math.PI * 2;
            
            let sx = pData.distance * Math.cos(pData.angle);
            let sy = 0;
            let sz = pData.distance * Math.sin(pData.angle);
            
            // Re-initialize both tail and head at edge
            positions[idx] = sx;
            positions[idx+1] = sy;
            positions[idx+2] = sz;
            positions[idx+3] = sx;
            positions[idx+4] = sy;
            positions[idx+5] = sz;
        }
    }
    particlesGeometry.attributes.position.needsUpdate = true;
    
    // Slight camera shake for massive bass
    if (data.bassAvg > 0.8) {
        camera.position.x = (Math.random() - 0.5) * (data.bassAvg * 3);
        camera.position.y = 500 + (Math.random() - 0.5) * (data.bassAvg * 3);
    } else {
        // Slowly return camera to steady state
        camera.position.x += (0 - camera.position.x) * 0.1;
        camera.position.y += (500 - camera.position.y) * 0.1;
    }

    renderer.render(scene, camera);
}

// Initialize Three.js scene once DOM is ready
init3D();
