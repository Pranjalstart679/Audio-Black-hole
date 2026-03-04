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

// Audio Features
let bassAvg = 0;
let midAvg = 0;
let trebleAvg = 0;

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

    // Random size and opacity
    this.size = Math.random() * 2 + 0.5;
    this.baseSpeed = Math.random() * 2 + 0.5;

    // Coloring: shades of purple, blue, pink, white
    const colors = [
      "rgba(123, 44, 191, OPACITY)", // deep purple
      "rgba(224, 170, 255, OPACITY)", // light purple
      "rgba(157, 78, 221, OPACITY)", // bright purple
      "rgba(100, 223, 223, OPACITY)", // cyan
      "rgba(255, 255, 255, OPACITY)", // white
    ];
    this.colorTemplate = colors[Math.floor(Math.random() * colors.length)];
    this.opacity = Math.random() * 0.5 + 0.1;
  }

  update(audioInfluence) {
    // Calculate vector to center
    const dx = cx - this.x;
    const dy = cy - this.y;
    this.distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate tangent vector for swirling effect
    const pull = 1 + 1000 / (this.distance + 10); // Gravitational pull increases as it gets closer
    const speed = (this.baseSpeed + audioInfluence * 5) * pull;

    // Move towards center but with a swirl (tangential movement)
    // Swirl factor increases as audio influence increases
    const swirlAmount = 0.5 + audioInfluence * 0.5;
    this.angle += (speed * swirlAmount) / this.distance;

    // Move inward
    this.distance -= speed;

    this.x = cx + Math.cos(this.angle) * this.distance;
    this.y = cy + Math.sin(this.angle) * this.distance;

    // Change size and opacity based on distance and audio
    this.activeSize =
      this.size * (1 + audioInfluence * 2) * (1 + 300 / (this.distance + 100));
    this.activeOpacity = Math.min(
      1,
      this.opacity + audioInfluence * 0.5 + 100 / (this.distance + 10),
    );

    // Reset if it hits the black hole event horizon
    if (this.distance < 40) {
      this.reset();
    }
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.activeSize, 0, Math.PI * 2);
    ctx.fillStyle = this.colorTemplate.replace("OPACITY", this.activeOpacity);

    // Add glow for larger/closer particles
    if (this.activeSize > 2 || this.distance < 150) {
      ctx.shadowBlur = this.activeSize * 4;
      ctx.shadowColor = this.colorTemplate.replace("OPACITY", "1");
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.fill();
    ctx.shadowBlur = 0; // Reset
  }
}

// Initialize particles
const particleCount = 1000;
for (let i = 0; i < particleCount; i++) {
  particles.push(new Particle());
}

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
}

function drawBlackHole() {
  // Event horizon (pure black)
  const eventHorizonRadius = 40 + bassAvg * 15;

  // Accretion disk (glowing ring)
  const accretionDiskRadius = eventHorizonRadius * 1.5;

  // Outer glow
  let gradient = ctx.createRadialGradient(
    cx,
    cy,
    eventHorizonRadius * 0.8,
    cx,
    cy,
    accretionDiskRadius * 3,
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(0.2, `rgba(123, 44, 191, ${0.8 + bassAvg * 0.5})`);
  gradient.addColorStop(0.5, `rgba(157, 78, 221, ${0.3 + midAvg * 0.4})`);
  gradient.addColorStop(1, "rgba(3, 3, 3, 0)");

  ctx.beginPath();
  ctx.arc(cx, cy, accretionDiskRadius * 3, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // The void (Black hole center)
  ctx.beginPath();
  ctx.arc(cx, cy, eventHorizonRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.shadowBlur = 20 + bassAvg * 30;
  ctx.shadowColor = "#e0aaff";
  ctx.fill();
  ctx.shadowBlur = 0; // Reset

  // Jet beams based on treble
  if (trebleAvg > 0.2) {
    ctx.save();
    ctx.translate(cx, cy);
    // Rotate slowly
    ctx.rotate(Date.now() * 0.0005);

    ctx.beginPath();
    // Top jet
    ctx.moveTo(-10, -eventHorizonRadius);
    ctx.lineTo(10, -eventHorizonRadius);
    ctx.lineTo(0, -eventHorizonRadius - 200 - trebleAvg * 400);

    let jetGradient = ctx.createLinearGradient(
      0,
      -eventHorizonRadius,
      0,
      -eventHorizonRadius - 400,
    );
    jetGradient.addColorStop(0, `rgba(224, 170, 255, ${trebleAvg * 0.8})`);
    jetGradient.addColorStop(1, "rgba(224, 170, 255, 0)");

    ctx.fillStyle = jetGradient;
    ctx.fill();

    ctx.beginPath();
    // Bottom jet
    ctx.moveTo(-10, eventHorizonRadius);
    ctx.lineTo(10, eventHorizonRadius);
    ctx.lineTo(0, eventHorizonRadius + 200 + trebleAvg * 400);

    // Need to recreate gradient for bottom jet since it goes in opposite direction
    let jetGradient2 = ctx.createLinearGradient(
      0,
      eventHorizonRadius,
      0,
      eventHorizonRadius + 400,
    );
    jetGradient2.addColorStop(0, `rgba(224, 170, 255, ${trebleAvg * 0.8})`);
    jetGradient2.addColorStop(1, "rgba(224, 170, 255, 0)");
    ctx.fillStyle = jetGradient2;
    ctx.fill();

    ctx.restore();
  }
}

function animate() {
  // Clear canvas with deep black trail effect
  ctx.fillStyle = "rgba(3, 3, 3, 0.2)"; // creates trails
  ctx.fillRect(0, 0, width, height);

  updateAudioData();

  drawBlackHole();

  // Combine audio frequencies for different particle behaviors
  // Overall energy based heavily on bass and mid
  const energy = bassAvg * 0.6 + midAvg * 0.3 + trebleAvg * 0.1;

  // Dynamically emit new particles based on sudden volume peaks (treble/mid)
  if (trebleAvg > 0.5 && Math.random() < trebleAvg) {
    // Spawn burst of particles
    const burstCount = Math.floor(trebleAvg * 20);
    for (let i = 0; i < burstCount; i++) {
      particles.push(new Particle());
      // Keep array size manageable
      if (particles.length > 3000) {
        particles.shift();
      }
    }
  }

  particles.forEach((p) => {
    p.update(energy);
    p.draw();
  });

  animationId = requestAnimationFrame(animate);
}

animate();
