let scene, camera, renderer;
let playerGroup, playerCube, weaponTurret, playerMat;
let gridHelper;

let gameStarted = false;
let isGameOver = false;
let currentLevel = 1;
let score = 0;
let targetKills = 10;
let playerLives = 3;
let activePetColor = 0x00ff88;

let enemiesArray = [];
let projectilesArray = [];
let particlesArray = [];
let decorationCubes = [];

let lastFireTime = 0;
const fireCooldown = 150; 
let isFiringPressed = false;

// Better balanced overhead isometric camera angles
const cameraOffset = new THREE.Vector3(0, 10.0, 7.5);
let moveVector = { x: 0, z: 0 };

let joystickActive = false;
let joystickStartPos = { x: 0, y: 0 };
const joystickMaxRange = 35; 

// SYNTH TRACK GENERATOR MATRIX
let audioCtx = null;
let musicGainNode = null;
let audioSequenceTimer = null;

const STAGE_CONFIGS = [
    { gridColor: 0x00ff88, fogColor: 0x020206, speedBonus: 0.0 },
    { gridColor: 0x00ffff, fogColor: 0x01050a, speedBonus: 0.015 },
    { gridColor: 0xff00ff, fogColor: 0x06010a, speedBonus: 0.025 }
];

initEngine();
setupSkinSelectors();
loadHighScore();
buildMenuDecorations();
setupInputs();
animateLoop();

function initEngine() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(STAGE_CONFIGS[0].fogColor);
    scene.fog = new THREE.FogExp2(STAGE_CONFIGS[0].fogColor, 0.05);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 15, 5);
    scene.add(directionalLight);

    playerGroup = new THREE.Group();
    playerMat = new THREE.MeshStandardMaterial({ color: activePetColor, roughness: 0.2 });
    playerCube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), playerMat);
    playerCube.position.y = 0.5;
    playerGroup.add(playerCube);

    weaponTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    weaponTurret.rotation.x = Math.PI / 2;
    weaponTurret.position.set(0, 0.5, -0.4);
    playerGroup.add(weaponTurret);

    scene.add(playerGroup);
    buildLevelGrid(STAGE_CONFIGS[0].gridColor);

    window.addEventListener('resize', onWindowResize);
}

function buildMenuDecorations() {
    for(let i=0; i<10; i++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x00ff88, wireframe: true }));
        mesh.position.set((Math.random()-0.5)*25, Math.random()*5, (Math.random()-0.5)*25);
        scene.add(mesh);
        decorationCubes.push(mesh);
    }
}

function buildLevelGrid(hexColor) {
    if (gridHelper) scene.remove(gridHelper);
    gridHelper = new THREE.GridHelper(80, 80, hexColor, 0x111118);
    scene.add(gridHelper);
}

// LEGENDARY RETRO SYNTH TRACK GENERATOR LOOP
function runLegendaryAudioEngine() {
    let step = 0;
    // Energetic driving progressions (A Minor variant chords)
    const bassNotes = [110, 110, 98, 98, 87, 87, 130, 110]; 
    const leadNotes = [220, 261, 293, 329, 392, 329, 440, 392];

    audioSequenceTimer = setInterval(() => {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;

        // Base Heavy Rhythm Track
        const bassOsc = audioCtx.createOscillator();
        const bassGain = audioCtx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(bassNotes[step % bassNotes.length], now);
        bassGain.gain.setValueAtTime(0.25, now);
        bassGain.gain.linearRampToValueAtTime(0, now + 0.2);
        bassOsc.connect(bassGain); bassGain.connect(musicGainNode);
        bassOsc.start(now); bassOsc.stop(now + 0.22);

        // Arpeggiated Melody Lead
        if (step % 2 === 0) {
            const leadOsc = audioCtx.createOscillator();
            const leadGain = audioCtx.createGain();
            leadOsc.type = 'square';
            leadOsc.frequency.setValueAtTime(leadNotes[(step + 3) % leadNotes.length], now);
            leadGain.gain.setValueAtTime(0.05, now);
            leadGain.gain.linearRampToValueAtTime(0, now + 0.3);
            leadOsc.connect(leadGain); leadGain.connect(musicGainNode);
            leadOsc.start(now); leadOsc.stop(now + 0.32);
        }
        step++;
    }, 200); // Fast, energetic pacing
}

function playSoundFX(type) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);

    if (type === 'laser') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);
        gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.08);
        osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'explosion') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.15);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    }
}

function setupInputs() {
    document.getElementById('play-btn').addEventListener('click', () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            musicGainNode = audioCtx.createGain();
            musicGainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
            musicGainNode.connect(audioCtx.destination);
            runLegendaryAudioEngine();
        }
        
        document.getElementById('play-btn').style.display = 'none';
        const loaderContainer = document.getElementById('boot-loader-container');
        const loaderBar = document.getElementById('boot-loader-bar');
        loaderContainer.style.display = 'flex';

        let pct = 0;
        const interval = setInterval(() => {
            pct += 10;
            loaderBar.style.width = pct + '%';
            if (pct >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    loaderContainer.style.display = 'none';
                    document.getElementById('play-btn').style.display = 'inline-block';
                    startGameApp();
                }, 150);
            }
        }, 30);
    });

    const joyZone = document.getElementById('joystick-zone');
    const joyStick = document.getElementById('joystick-stick');
    const fireButton = document.getElementById('fire-btn');

    joyZone.addEventListener('touchstart', (e) => {
        joystickActive = true;
        const rect = joyZone.getBoundingClientRect();
        joystickStartPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!joystickActive) return;
        let touch = null;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].clientX < window.innerWidth / 2) { touch = e.touches[i]; break; }
        }
        if (!touch) return;

        const dx = touch.clientX - joystickStartPos.x;
        const dz = touch.clientY - joystickStartPos.y;
        const dist = Math.sqrt(dx * dx + dz * dz);
        let limit = Math.min(dist, joystickMaxRange);
        let angle = Math.atan2(dz, dx);
        
        const fx = Math.cos(angle) * limit;
        const fz = Math.sin(angle) * limit;
        joyStick.style.transform = `translate(${fx}px, ${fz}px)`;

        moveVector.x = fx / joystickMaxRange;
        moveVector.z = fz / joystickMaxRange;
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
        let leftTouchActive = false;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].clientX < window.innerWidth / 2) leftTouchActive = true;
        }
        if (!leftTouchActive && joystickActive) {
            joystickActive = false;
            moveVector = { x: 0, z: 0 };
            joyStick.style.transform = `translate(0px, 0px)`;
        }
    }, { passive: true });

    fireButton.addEventListener('touchstart', (e) => { e.preventDefault(); isFiringPressed = true; });
    window.addEventListener('touchend', (e) => { if (isFiringPressed && e.touches.length === 0) isFiringPressed = false; });
}

function startGameApp() {
    document.getElementById('start-menu').style.opacity = '0';
    document.getElementById('start-menu').style.visibility = 'hidden';
    
    enemiesArray.forEach(e => scene.remove(e));
    projectilesArray.forEach(p => scene.remove(p.mesh));
    enemiesArray = []; projectilesArray = [];
    decorationCubes.forEach(c => scene.remove(c));
    decorationCubes = [];

    gameStarted = true; isGameOver = false;
    score = 0; currentLevel = 1; targetKills = 10; playerLives = 3;
    
    playerGroup.position.set(0, 0, 0);
    buildLevelGrid(STAGE_CONFIGS[0].gridColor);
    updateInterfaceLayout();
    spawnEnemyWave();
}

function spawnEnemy() {
    if (isGameOver || !gameStarted) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), new THREE.MeshStandardMaterial({ color: 0xff0055 }));
    mesh.position.y = 0.45;

    const rad = Math.random() * Math.PI * 2;
    mesh.position.x = playerGroup.position.x + Math.cos(rad) * 22;
    mesh.position.z = playerGroup.position.z + Math.sin(rad) * 22;

    scene.add(mesh);
    enemiesArray.push(mesh);
}

function spawnEnemyWave() {
    for (let i = 0; i < 6; i++) spawnEnemy();
}

function fireProjectile() {
    const now = Date.now();
    if (now - lastFireTime < fireCooldown) return;
    lastFireTime = now;

    playSoundFX('laser');
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(playerGroup.position).y = 0.5;

    let dir = new THREE.Vector3(0, 0, -1);
    if (enemiesArray.length > 0) {
        let nearest = enemiesArray[0], minDist = playerGroup.position.distanceTo(nearest.position);
        for(let i=1; i<enemiesArray.length; i++) {
            let d = playerGroup.position.distanceTo(enemiesArray[i].position);
            if(d < minDist) { minDist = d; nearest = enemiesArray[i]; }
        }
        dir.subVectors(nearest.position, playerGroup.position).y = 0; dir.normalize();
    } else {
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerGroup.rotation.y).normalize();
    }

    mesh.lookAt(playerGroup.position.clone().add(dir).add(new THREE.Vector3(0,0.5,0)));
    scene.add(mesh);
    projectilesArray.push({ mesh: mesh, velocity: dir.multiplyScalar(0.6), life: 60 });
}

function updateGamePhysics() {
    if (moveVector.x !== 0 || moveVector.z !== 0) {
        playerGroup.position.x += moveVector.x * 0.14;
        playerGroup.position.z += moveVector.z * 0.14;
        playerGroup.rotation.y = Math.atan2(-moveVector.x, -moveVector.z);
    }

    if (isFiringPressed) fireProjectile();

    for (let i = projectilesArray.length - 1; i >= 0; i--) {
        const p = projectilesArray[i]; p.mesh.position.add(p.velocity); p.life--;
        if (p.life <= 0) { scene.remove(p.mesh); projectilesArray.splice(i, 1); }
    }

    const speed = 0.04 + (currentLevel * 0.005);
    for (let i = enemiesArray.length - 1; i >= 0; i--) {
        const enemy = enemiesArray[i];
        const heading = new THREE.Vector3().subVectors(playerGroup.position, enemy.position);
        heading.y = 0; heading.normalize();
        enemy.position.addScaledVector(heading, speed);

        if (enemy.position.distanceTo(playerGroup.position) < 0.9) {
            scene.remove(enemy); enemiesArray.splice(i, 1);
            playerLives--;
            updateInterfaceLayout();
            if (playerLives <= 0) runGameOverState();
            continue;
        }

        for (let j = projectilesArray.length - 1; j >= 0; j--) {
            const b = projectilesArray[j];
            if (b.mesh.position.distanceTo(enemy.position) < 0.7) {
                playSoundFX('explosion');
                scene.remove(enemy); enemiesArray.splice(i, 1);
                scene.remove(b.mesh); projectilesArray.splice(j, 1);
                score++; updateInterfaceLayout();
                if (score >= targetKills) {
                    currentLevel++; score = 0; targetKills += 5;
                    updateInterfaceLayout();
                }
                break;
            }
        }
    }
    if (enemiesArray.length < 4 && !isGameOver) spawnEnemy();
}

function runGameOverState() {
    isGameOver = true; gameStarted = false;
    const titleNode = document.getElementById('menu-title');
    titleNode.innerText = "GAME OVER";
    titleNode.classList.add('game-over-active');
    document.getElementById('play-btn').innerText = "RESTART";
    document.getElementById('start-menu').style.visibility = 'visible';
    document.getElementById('start-menu').style.opacity = '1';
}

function updateInterfaceLayout() {
    document.getElementById('level-num').innerText = currentLevel;
    document.getElementById('score-num').innerText = score;
    document.getElementById('target-num').innerText = targetKills;
    let livesStr = "";
    for (let i = 0; i < playerLives; i++) livesStr += "❤️";
    document.getElementById('lives-display').innerText = livesStr || "💥";
    document.getElementById('progress-bar').style.width = `${(score / targetKills) * 100}%`;
}

function setupSkinSelectors() {
    const palOptions = document.querySelectorAll('.colorOption');
    palOptions.forEach(box => {
        box.addEventListener('click', (e) => {
            palOptions.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            activePetColor = parseInt(e.target.getAttribute('data-color'));
            if (playerMat) playerMat.color.setHex(activePetColor);
        });
    });
}

function loadHighScore() {
    document.getElementById('high-score-val').innerText = "2";
}

function animateLoop() {
    requestAnimationFrame(animateLoop);
    if (gameStarted && !isGameOver) { updateGamePhysics(); }
    
    if (!gameStarted) {
        decorationCubes.forEach(c => { c.rotation.x += 0.01; c.rotation.y += 0.01; });
    }

    if (playerGroup) {
        camera.position.copy(playerGroup.position).add(cameraOffset);
        camera.lookAt(playerGroup.position);
    }
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}