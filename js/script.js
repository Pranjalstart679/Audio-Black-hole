const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const audioUpload = document.getElementById("audio-upload");
const audioElement = document.getElementById("audio-element");
const statusMessage = document.getElementById("status-message");

let audioContext;
let analyser;
let source;
let dataArray;
let bufferLength;

let particles = [];
let width, height, cx, cy;
let animationId;
let isAudioPlaying = false;

// Audio Features - Exported for 3D script
window.audioData = {
    bassAvg: 0,
    midAvg: 0,
    trebleAvg: 0,
    energy: 0
};

// Global Configuration settings controlled by UI
window.CONFIG = {
    particleCount: 2000,
    baseSpeed: 0.2, // Very slow idle rotation
    audioSensitivity: 1.0, // Multiplier for audio reactions
    streakLength: 2.0 // How long the particle trails are
};

// Local variables referenced by 2D canvas functions
let bassAvg = 0;
let midAvg = 0;
let trebleAvg = 0;

// Mode tracking
window.currentMode = '2D'; // '2D' or '3D'

// Resize canvas
function resize() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  cx = width / 2;
  cy = height / 2;
}

window.addEventListener("resize", resize);
resize();

// Handle Audio Upload
audioUpload.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;

  statusMessage.textContent = "Loading audio...";

  const fileURL = URL.createObjectURL(file);
  audioElement.src = fileURL;

  setupAudioAPI();

  audioElement
    .play()
    .then(() => {
      statusMessage.textContent = file.name;
      isAudioPlaying = true;
    })
    .catch((err) => {
      statusMessage.textContent = "Click play to start";
    });
});

audioElement.addEventListener("play", () => {
  isAudioPlaying = true;
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }
});

audioElement.addEventListener("pause", () => {
  isAudioPlaying = false;
});

audioElement.addEventListener("ended", () => {
  isAudioPlaying = false;
});

function setupAudioAPI() {
  if (audioContext) return; // Already setup

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();

  source = audioContext.createMediaElementSource(audioElement);
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  analyser.fftSize = 512;
  bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
}

class Particle {
  constructor() {
    this.reset(true);
  }

  reset(initial = false) {
    // Start particles from outside the screen or randomly inside
    const angle = Math.random() * Math.PI * 2;
    const dist = initial
      ? Math.random() * Math.max(width, height)
      : Math.max(width, height) / 2 + Math.random() * 200;

    this.x = cx + Math.cos(angle) * dist;
    this.y = cy + Math.sin(angle) * dist;

    this.angle = angle;
    this.distance = dist;

    // Slight variance in base speed, relative to global config
    this.speedModifier = Math.random() * 0.5 + 0.5;

    // Mostly white, varying opacity
    let intensity = 0.4 + Math.random() * 0.6;
    if (Math.random() < 0.1) intensity = 1.0;
    
    // Pure/nearly pure white for reference styling
    const r = 255;
    const g = 255;
    const b = 255;
    
    this.colorTemplate = `rgba(${r}, ${g}, ${b}, OPACITY)`;
    this.opacity = Math.random() * 0.5 + 0.1;
  }

  update(audioInfluence) {
    // Record old position for line streak rendering
    this.prevX = this.x;
    this.prevY = this.y;

    const dx = cx - this.x;
    const dy = cy - this.y;
    this.distance = Math.sqrt(dx * dx + dy * dy);

    // Filter audio influence so it only reacts to loud kicks/snares
    // Square the influence to make it exponential rather than linear
    let effectiveAudio = audioInfluence < 0.2 ? 0 : Math.pow(audioInfluence, 1.5);
    // Apply UI sensitivity scaling
    effectiveAudio *= window.CONFIG.audioSensitivity;

    // Gravity pull inward
    const pull = 1 + 500 / (this.distance + 10); 
    
    // Constant slow orbit (standby mode) + Audio acceleration bump
    const speed = (window.CONFIG.baseSpeed * this.speedModifier + effectiveAudio * 6) * pull;

    // Swirl factor (spin direction)
    const swirlAmount = 0.8 + effectiveAudio * 0.5;
    this.angle += (speed * swirlAmount) / this.distance;

    // Move inward - relatively slowly so the vortex stays dense like a galaxy
    this.distance -= speed * 0.3; 

    // Calculate actual new position
    let newX = cx + Math.cos(this.angle) * this.distance;
    let newY = cy + Math.sin(this.angle) * this.distance;

    // Streak length: calculate where we *should* fall behind visually based on velocity and setting
    let velocityX = newX - this.prevX;
    let velocityY = newY - this.prevY;
    
    this.x = newX;
    this.y = newY;
    
    // Set the tail (prevX/Y) further back based on streak configuration
    this.prevX = this.x - velocityX * window.CONFIG.streakLength;
    this.prevY = this.y - velocityY * window.CONFIG.streakLength;

    // Opacity gently boosts with the beat, clamped down slightly as they approach the center void
    this.activeOpacity = Math.min(
      1,
      this.opacity + effectiveAudio * 0.5 + 100 / (this.distance + 10),
    );

    // Reset if it hits the black hole event horizon
    if (this.distance < 40) {
      this.reset();
      this.prevX = this.x;
      this.prevY = this.y;
    }
  }

  draw() {
    ctx.beginPath();
    ctx.moveTo(this.prevX, this.prevY);
    ctx.lineTo(this.x, this.y);
    // Add visual crispness
    ctx.strokeStyle = this.colorTemplate.replace("OPACITY", this.activeOpacity);
    ctx.lineWidth = 0.5; // Thin elegant streaks like the reference

    ctx.stroke();
  }
}

// Global initialization
function initParticles() {
  particles = [];
  for (let i = 0; i < window.CONFIG.particleCount; i++) {
    particles.push(new Particle());
  }
}

initParticles();

function updateAudioData() {
  if (!analyser || !isAudioPlaying) {
    bassAvg = Math.max(0, bassAvg - 0.05); // Decay
    midAvg = Math.max(0, midAvg - 0.05);
    trebleAvg = Math.max(0, trebleAvg - 0.05);
    return;
  }

  analyser.getByteFrequencyData(dataArray);

  // Calculate averages for bass, mid, treble
  let bassSum = 0,
    midSum = 0,
    trebleSum = 0;

  // Divide the frequency spectrum into 3 parts
  const bassEnd = Math.floor(bufferLength * 0.1);
  const midEnd = Math.floor(bufferLength * 0.5);

  for (let i = 0; i < bufferLength; i++) {
    const val = dataArray[i] / 255.0; // Normalize 0-1
    if (i < bassEnd) {
      bassSum += val;
    } else if (i < midEnd) {
      midSum += val;
    } else {
      trebleSum += val;
    }
  }

  // Smooth transitions
  const newBass = bassSum / bassEnd;
  const newMid = midSum / (midEnd - bassEnd);
  const newTreble = trebleSum / (bufferLength - midEnd);

  bassAvg = bassAvg * 0.8 + newBass * 0.2;
  midAvg = midAvg * 0.8 + newMid * 0.2;
  trebleAvg = trebleAvg * 0.8 + newTreble * 0.2;

  // Update global data for 3D script
  window.audioData.bassAvg = bassAvg;
  window.audioData.midAvg = midAvg;
  window.audioData.trebleAvg = trebleAvg;
  window.audioData.energy = bassAvg * 0.6 + midAvg * 0.3 + trebleAvg * 0.1;
}

function drawBlackHole() {
  // Event horizon (pure black)
  const eventHorizonRadius = 40 + bassAvg * 15;

  // The void (Black hole center) - Pure black, no colorful accretion disk to match the reference
  ctx.beginPath();
  ctx.arc(cx, cy, eventHorizonRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  
  // Slight white glow around the edges
  ctx.shadowBlur = 10 + bassAvg * 20;
  ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
  
  ctx.fill();
  ctx.shadowBlur = 0; // Reset
}

function animate() {
  updateAudioData();

  animationId = requestAnimationFrame(animate);

  if (window.currentMode === '3D') return;

  // Clear canvas with deep black trail effect
  ctx.fillStyle = "rgba(3, 3, 3, 0.2)"; // creates trails
  ctx.fillRect(0, 0, width, height);

  drawBlackHole();

  // Combine audio frequencies for different particle behaviors
  // Overall energy based heavily on bass and mid
  const energy = bassAvg * 0.6 + midAvg * 0.3 + trebleAvg * 0.1;

  // Dynamically emit new particles based on sudden volume peaks (treble/mid)
  if (trebleAvg > 0.5 && Math.random() < trebleAvg * window.CONFIG.audioSensitivity) {
    // Spawn burst of particles
    const burstCount = Math.floor(trebleAvg * 20 * window.CONFIG.audioSensitivity);
    for (let i = 0; i < burstCount; i++) {
      particles.push(new Particle());
      // Keep array size to configured max
      if (particles.length > window.CONFIG.particleCount) {
        particles.shift();
      }
    }
  }

  particles.forEach((p) => {
    p.update(energy);
    p.draw();
  });
}

animate();

// --- UI Settings Event Listeners ---
document.getElementById('particle-count').addEventListener('input', (e) => {
  const newCount = parseInt(e.target.value);
  window.CONFIG.particleCount = newCount;
  
  // Adjust particle array if needed immediately
  if (particles.length > newCount) {
    particles.splice(0, particles.length - newCount);
  } else if (particles.length < newCount) {
    const diff = newCount - particles.length;
    for(let i=0; i<diff; i++) particles.push(new Particle());
  }
});

document.getElementById('base-speed').addEventListener('input', (e) => {
  window.CONFIG.baseSpeed = parseFloat(e.target.value);
});

document.getElementById('audio-sensitivity').addEventListener('input', (e) => {
  window.CONFIG.audioSensitivity = parseFloat(e.target.value);
});

document.getElementById('streak-length').addEventListener('input', (e) => {
  window.CONFIG.streakLength = parseFloat(e.target.value);
});

// --- UI Collapse Toggle ---
const uiContainer = document.getElementById('ui-container');
const uiToggleBtn = document.getElementById('ui-toggle-btn');
uiToggleBtn.addEventListener('click', () => {
  uiContainer.classList.toggle('collapsed');
});
