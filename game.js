const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false; // Crisp pixel art rendering

// Detect mobile and resize canvas
const isMobile = window.innerWidth <= 1024;
if (isMobile) {
    canvas.width = 600;
    canvas.height = 800;
}

// ========================================
// POSITION CONTROLS - ADJUST THESE VALUES
// ========================================
const CAT_CONFIG = {
    startX: 200,              // Cat's horizontal starting position
    offsetY: 10,              // Fine-tune vertical offset from train roof (negative = higher, positive = lower)
    scale: 2,                 // Scale multiplier for cat size (2 = 2x size)

    // Idle animation sprite dimensions (12 frames)
    idleSpriteWidth: 32,
    idleSpriteHeight: 32,

    // Run animation sprite dimensions (6 frames)
    runSpriteWidth: 32,
    runSpriteHeight: 32
};

// Game state
const game = {
    score: 0,
    pigeonsCaught: 0,
    eaglesDodged: 0,
    trainSpeed: 2,
    trainX: 0,
    isRunning: false,
    countdown: 3,
    countdownTimer: 0,
    countdownInterval: 60, // frames per number (60 frames = 1 sec at 60fps)
    gameStarted: false,
    showLeftEnd: true  // Only show left end once at the beginning
};

// Assets to load
const assets = {
    background: new Image(),
    trainCenter: new Image(),
    trainRightEnd: new Image(),
    catIdle: new Image(),
    catRun: new Image(),
    pigeon: new Image(),
    eagle: new Image()
};

// Audio assets
const sounds = {
    jump: new Audio('assets/music/SFX_Jump_38.wav'),
    gameOver: new Audio('assets/music/game_over.wav'),
    coin: new Audio('assets/music/coin-recieved-230517.mp3')
};

// Load all assets
let assetsLoaded = 0;
const totalAssets = 7;

function assetLoaded() {
    assetsLoaded++;
    if (assetsLoaded === totalAssets) {
        // Calculate actual frame dimensions from loaded images
        CAT_CONFIG.idleSpriteWidth = assets.catIdle.width / 12;  // 12 frames in idle
        CAT_CONFIG.idleSpriteHeight = assets.catIdle.height;

        CAT_CONFIG.runSpriteWidth = assets.catRun.width / 6;     // 6 frames in run
        CAT_CONFIG.runSpriteHeight = assets.catRun.height;

        // Update cat dimensions
        cat.width = CAT_CONFIG.idleSpriteWidth * CAT_CONFIG.scale;
        cat.height = CAT_CONFIG.idleSpriteHeight * CAT_CONFIG.scale;

        // Set train dimensions from actual images
        train.centerWidth = assets.trainCenter.width;
        train.centerHeight = assets.trainCenter.height;
        train.endWidth = assets.trainRightEnd.width;
        train.endHeight = assets.trainRightEnd.height;

        // Position train so it's fully visible at bottom of canvas
        train.y = canvas.height - train.centerHeight;

        console.log('Idle sprite:', CAT_CONFIG.idleSpriteWidth, 'x', CAT_CONFIG.idleSpriteHeight);
        console.log('Run sprite:', CAT_CONFIG.runSpriteWidth, 'x', CAT_CONFIG.runSpriteHeight);
        console.log('Train center:', train.centerWidth, 'x', train.centerHeight);
        console.log('Train end:', train.endWidth, 'x', train.endHeight);
        console.log('Train Y position:', train.y);

        initGame();
    }
}

assets.background.onload = assetLoaded;
assets.trainCenter.onload = assetLoaded;
assets.trainRightEnd.onload = assetLoaded;
assets.catIdle.onload = assetLoaded;
assets.catRun.onload = assetLoaded;
assets.pigeon.onload = assetLoaded;
assets.eagle.onload = assetLoaded;

assets.background.src = 'assets/images/bg.jpg';
assets.trainCenter.src = 'assets/images/train/train_centre.png';
assets.trainRightEnd.src = 'assets/images/train/train_right_end.png';
assets.catIdle.src = 'assets/images/cat/OrangeTabby-Idle.png';
assets.catRun.src = 'assets/images/cat/OrangeTabby-Run.png';
assets.pigeon.src = 'assets/images/pigeon/pigeon_fiy-Sheet.png';
assets.eagle.src = 'assets/images/eagle/eagle.png';

// Cat sprite animation
const cat = {
    x: CAT_CONFIG.startX,
    y: 0,
    width: CAT_CONFIG.idleSpriteWidth * CAT_CONFIG.scale,
    height: CAT_CONFIG.idleSpriteHeight * CAT_CONFIG.scale,
    velocityY: 0,
    gravity: 0.5,
    lowJumpPower: -9,      // Low jump (1 press)
    jumpPower: -11,        // Normal jump (2 presses)
    doubleJumpPower: -13,  // High jump (3 presses) - reduced to stay in frame
    isJumping: false,
    isCrouching: false,
    frameIndex: 0,
    frameCount: 12,
    runFrameCount: 6,
    frameTimer: 0,
    frameDelay: 6,  // Animation speed - higher = slower
    state: 'idle', // idle or run
    lastJumpTime: 0,
    doubleTapWindow: 300,  // milliseconds to detect double tap
    facingLeft: false  // Track which direction cat is facing
};

// Pigeon sprite animation
const pigeons = [];
const pigeonConfig = {
    width: 32,
    height: 32,
    frameCount: 7,
    spawnInterval: 120,
    spawnTimer: 0
};

// Score animations
const scoreAnimations = [];

// Eagle attack system
const eagles = [];
const eagleConfig = {
    spriteWidth: 100,    // Original sprite frame size
    spriteHeight: 100,
    width: 70,           // Display size (scaled down)
    height: 70,
    frameCount: 8,
    speed: 4,
    spawnInterval: 180,  // Spawn every 3 seconds (at 60fps)
    spawnTimer: 0,
    warningTime: 60,  // 1 second warning before attack
    spawnCount: 0     // Track how many eagles spawned
};

// Train configuration
const train = {
    y: 400,
    centerWidth: 0,    // Will be set from actual image
    centerHeight: 0,   // Will be set from actual image
    endWidth: 0,       // Will be set from actual image
    endHeight: 0,      // Will be set from actual image
    numCenterSections: 3,
    gapBetweenSections: 35
};

// Input handling
const keys = {};
let lastJumpPressTime = 0;
let jumpLevel = 0; // 0 = not jumped yet, 1 = low, 2 = normal, 3 = high

window.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    // Three-level jump with instant response
    if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && game.gameStarted) {
        const currentTime = Date.now();
        const timeSinceLastPress = currentTime - lastJumpPressTime;

        // First press - instant low jump
        if (!cat.isJumping) {
            cat.velocityY = cat.lowJumpPower;
            cat.isJumping = true;
            jumpLevel = 1;
            lastJumpPressTime = currentTime;
            sounds.jump.currentTime = 0;
            sounds.jump.play();
            console.log('Low jump (1 press)');
        }
        // Second press within 300ms - upgrade to normal jump
        else if (jumpLevel === 1 && timeSinceLastPress < 300) {
            cat.velocityY = cat.jumpPower;
            jumpLevel = 2;
            lastJumpPressTime = currentTime;
            sounds.jump.currentTime = 0;
            sounds.jump.play();
            console.log('Normal jump (2 presses)');
        }
        // Third press within 300ms - upgrade to high jump
        else if (jumpLevel === 2 && timeSinceLastPress < 300) {
            cat.velocityY = cat.doubleJumpPower;
            jumpLevel = 3;
            lastJumpPressTime = currentTime;
            sounds.jump.currentTime = 0;
            sounds.jump.play();
            console.log('HIGH JUMP! (3 presses)');
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Mobile touch controls
if (window.innerWidth <= 1024) {
    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');
    const btnJump = document.getElementById('btnJump');
    const btnCrouch = document.getElementById('btnCrouch');
    const btnRestart = document.getElementById('btnRestart');

    btnLeft.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys['ArrowLeft'] = true;
    });
    btnLeft.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys['ArrowLeft'] = false;
    });

    btnRight.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys['ArrowRight'] = true;
    });
    btnRight.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys['ArrowRight'] = false;
    });

    btnCrouch.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys['ArrowDown'] = true;
    });
    btnCrouch.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys['ArrowDown'] = false;
    });

    // Jump button with multi-tap support
    let jumpTapCount = 0;
    let jumpTapTimer = null;

    btnJump.addEventListener('touchstart', (e) => {
        e.preventDefault();

        if (!game.gameStarted) return;

        const currentTime = Date.now();
        const timeSinceLastPress = currentTime - lastJumpPressTime;

        // First tap - instant low jump
        if (!cat.isJumping) {
            cat.velocityY = cat.lowJumpPower;
            cat.isJumping = true;
            jumpLevel = 1;
            lastJumpPressTime = currentTime;
            sounds.jump.currentTime = 0;
            sounds.jump.play();
        }
        // Second tap - upgrade to normal jump
        else if (jumpLevel === 1 && timeSinceLastPress < 300) {
            cat.velocityY = cat.jumpPower;
            jumpLevel = 2;
            lastJumpPressTime = currentTime;
            sounds.jump.currentTime = 0;
            sounds.jump.play();
        }
        // Third tap - upgrade to high jump
        else if (jumpLevel === 2 && timeSinceLastPress < 300) {
            cat.velocityY = cat.doubleJumpPower;
            jumpLevel = 3;
            lastJumpPressTime = currentTime;
            sounds.jump.currentTime = 0;
            sounds.jump.play();
        }
    });

    // Restart button - reload the page
    btnRestart.addEventListener('touchstart', (e) => {
        e.preventDefault();
        location.reload();
    });
}

function initGame() {
    // Start with left end at left edge of screen (half visible)
    game.trainX = 0;

    // Position cat on top of train with offset
    cat.y = train.y - cat.height + CAT_CONFIG.offsetY;

    game.isRunning = true;
    game.countdown = 3;
    game.countdownTimer = 0;
    game.gameStarted = false;
    game.showLeftEnd = true;

    console.log('Game initialized. Train X:', game.trainX);

    gameLoop();
}

function spawnPigeon() {
    // Spawn pigeons higher up - they need high jump to catch
    const minHeight = 50;
    const maxHeight = train.y - 150; // Higher than normal cat jump can reach

    pigeons.push({
        x: canvas.width,
        y: Math.random() * (maxHeight - minHeight) + minHeight,
        velocityX: -3,
        frameIndex: 0,
        frameTimer: 0
    });
}

function spawnEagle() {
    eagleConfig.spawnCount++;

    // First 3 eagles spawn higher (easier to dodge)
    let minHeight, maxHeight;
    if (eagleConfig.spawnCount <= 3) {
        minHeight = 100;  // Top area
        maxHeight = 180;  // Only spawn in upper portion
    } else {
        // After first 3, eagles can spawn anywhere
        minHeight = 100;  // Top area
        maxHeight = train.y - cat.height + CAT_CONFIG.offsetY; // Cat level
    }

    const attackY = Math.random() * (maxHeight - minHeight) + minHeight;

    eagles.push({
        x: canvas.width + 150,  // Start off screen
        y: attackY,
        velocityX: -eagleConfig.speed,
        frameIndex: 0,
        frameTimer: 0,
        warning: true,  // Show warning first
        warningTimer: eagleConfig.warningTime
    });

    console.log('Eagle #' + eagleConfig.spawnCount + ' spawned at height:', attackY);
}

function updateCat() {
    if (!game.isRunning) return; // Don't update if game is over

    // Check crouch
    cat.isCrouching = keys['ArrowDown'] || keys['s'] || keys['S'];

    // Apply gravity
    cat.velocityY += cat.gravity;
    cat.y += cat.velocityY;

    // Check if cat is over a gap or over train
    const isOverTrain = checkCatOverTrain();
    const groundY = train.y - cat.height + CAT_CONFIG.offsetY;

    if (isOverTrain) {
        // Ground collision (top of train)
        if (cat.y >= groundY) {
            cat.y = groundY;
            cat.velocityY = 0;
            cat.isJumping = false;
            jumpLevel = 0; // Reset jump level when landing
        }
    } else {
        // Cat is over a gap - keep falling!
        console.log('CAT FALLING! Cat Y:', cat.y, 'Ground Y:', groundY, 'Train Y:', train.y);

        // Game over when cat falls below where it should be standing
        if (cat.y >= groundY + 20) {  // 20px buffer to trigger game over
            console.log('GAME OVER TRIGGERED!');
            gameOver();
            return;
        }
    }

    // Update animation state
    if (cat.isJumping) {
        cat.state = 'run';
    } else if (keys['ArrowLeft'] || keys['a'] || keys['A'] || keys['ArrowRight'] || keys['d'] || keys['D']) {
        cat.state = 'run';
    } else {
        cat.state = 'idle';
    }

    // Handle horizontal movement
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
        cat.x -= 3;
        cat.facingLeft = true;  // Face left when moving left
    }
    if (keys['ArrowRight'] || keys['d'] || keys['D']) {
        cat.x += 3;
        cat.facingLeft = false;  // Face right when moving right
    }

    // Keep cat in bounds
    if (cat.x < 0) cat.x = 0;
    if (cat.x > canvas.width - cat.width) cat.x = canvas.width - cat.width;

    // Update animation frame
    cat.frameTimer++;
    if (cat.frameTimer >= cat.frameDelay) {
        cat.frameTimer = 0;
        if (cat.state === 'idle') {
            cat.frameIndex = (cat.frameIndex + 1) % cat.frameCount;
        } else {
            cat.frameIndex = (cat.frameIndex + 1) % cat.runFrameCount;
        }
    }
}

function checkCatOverTrain() {
    // Calculate cat's feet position (bottom center)
    const catCenterX = cat.x + cat.width / 2;

    // Check if cat is over the left end
    if (game.showLeftEnd) {
        const leftEndStart = game.trainX;
        const leftEndEnd = game.trainX + train.endWidth;

        if (catCenterX >= leftEndStart && catCenterX <= leftEndEnd) {
            return true;
        }
    }

    // Match the drawing logic exactly
    let startX = game.trainX + train.endWidth + train.gapBetweenSections;
    const totalGaps = train.numCenterSections * train.gapBetweenSections;
    const repeatWidth = (train.centerWidth * train.numCenterSections) + totalGaps;

    // Adjust start to cover screen (same as drawing)
    while (startX > 0) {
        startX -= repeatWidth;
    }

    // Check all sections across the screen
    let currentX = startX;
    while (currentX < canvas.width) {
        for (let i = 0; i < train.numCenterSections; i++) {
            const sectionStart = currentX;
            const sectionEnd = currentX + train.centerWidth;

            if (catCenterX >= sectionStart && catCenterX <= sectionEnd) {
                return true; // Cat is over a train section
            }

            // Move to next section (add width + gap)
            currentX += train.centerWidth + train.gapBetweenSections;
        }
    }

    // Cat is not over any section - must be over a gap!
    return false;
}

function gameOver() {
    game.isRunning = false;
    sounds.gameOver.play();
    console.log('Game Over! Final Score:', game.score);
}

function drawGameOverScreen() {
    ctx.save();

    // Game Over text
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 6;
    ctx.font = 'bold 50px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeText('GAME OVER!', canvas.width / 2, canvas.height / 2 - 40);
    ctx.fillText('GAME OVER!', canvas.width / 2, canvas.height / 2 - 40);

    // Score text
    ctx.font = 'bold 30px Arial';
    ctx.lineWidth = 4;
    ctx.strokeText(`Score: ${game.score}`, canvas.width / 2, canvas.height / 2 + 10);
    ctx.fillText(`Score: ${game.score}`, canvas.width / 2, canvas.height / 2 + 10);

    // Instruction text
    ctx.font = '18px Arial';
    ctx.fillText('Refresh to play again', canvas.width / 2, canvas.height / 2 + 50);

    ctx.restore();
}

function updatePigeons() {
    pigeonConfig.spawnTimer++;
    if (pigeonConfig.spawnTimer >= pigeonConfig.spawnInterval) {
        pigeonConfig.spawnTimer = 0;
        spawnPigeon();
    }

    for (let i = pigeons.length - 1; i >= 0; i--) {
        const pigeon = pigeons[i];
        pigeon.x += pigeon.velocityX;

        // Animate pigeon
        pigeon.frameTimer++;
        if (pigeon.frameTimer >= 5) {
            pigeon.frameTimer = 0;
            pigeon.frameIndex = (pigeon.frameIndex + 1) % pigeonConfig.frameCount;
        }

        // Check collision with cat
        if (checkCollision(cat, pigeon)) {
            const scoreAdded = 10;

            // Play coin sound
            sounds.coin.currentTime = 0;
            sounds.coin.play();

            // Create floating score animation
            scoreAnimations.push({
                x: pigeon.x + pigeonConfig.width / 2,
                y: pigeon.y,
                text: '+' + scoreAdded,
                alpha: 1,
                velocityY: -2,
                timer: 0,
                maxTimer: 60 // 1 second at 60fps
            });

            pigeons.splice(i, 1);
            game.score += scoreAdded;
            game.pigeonsCaught++;
            document.getElementById('score').textContent = game.score;
            document.getElementById('pigeonsCaught').textContent = game.pigeonsCaught;
            continue;
        }

        // Remove if off screen
        if (pigeon.x < -pigeonConfig.width) {
            pigeons.splice(i, 1);
        }
    }
}

function updateScoreAnimations() {
    for (let i = scoreAnimations.length - 1; i >= 0; i--) {
        const anim = scoreAnimations[i];

        // Move upward
        anim.y += anim.velocityY;

        // Increment timer
        anim.timer++;

        // Fade out over time
        anim.alpha = 1 - (anim.timer / anim.maxTimer);

        // Remove when animation is complete
        if (anim.timer >= anim.maxTimer) {
            scoreAnimations.splice(i, 1);
        }
    }
}

function updateEagles() {
    eagleConfig.spawnTimer++;
    if (eagleConfig.spawnTimer >= eagleConfig.spawnInterval) {
        eagleConfig.spawnTimer = 0;
        spawnEagle();
    }

    for (let i = eagles.length - 1; i >= 0; i--) {
        const eagle = eagles[i];

        // Handle warning phase
        if (eagle.warning) {
            eagle.warningTimer--;
            if (eagle.warningTimer <= 0) {
                eagle.warning = false;
            }
        } else {
            // Move eagle
            eagle.x += eagle.velocityX;
        }

        // Animate eagle
        eagle.frameTimer++;
        if (eagle.frameTimer >= 4) {
            eagle.frameTimer = 0;
            eagle.frameIndex = (eagle.frameIndex + 1) % eagleConfig.frameCount;
        }

        // Check collision with cat (only when not in warning phase)
        if (!eagle.warning && checkEagleCollision(cat, eagle)) {
            console.log('Eagle caught the cat! Game Over!');
            gameOver();
            return;
        }

        // Remove if off screen
        if (eagle.x < -eagleConfig.width - 200) {
            eagles.splice(i, 1);
            console.log('Eagle missed! +5 points');
            game.score += 5;  // Bonus for dodging eagle
            game.eaglesDodged++;
            document.getElementById('score').textContent = game.score;
            document.getElementById('eaglesDodged').textContent = game.eaglesDodged;
        }
    }
}

function checkEagleCollision(cat, eagle) {
    const catBox = {
        x: cat.x + 10,  // Smaller hitbox for fairness
        y: cat.isCrouching ? cat.y + cat.height / 2 : cat.y + 10,
        width: cat.width - 20,
        height: cat.isCrouching ? cat.height / 2 - 10 : cat.height - 20
    };

    const eagleBox = {
        x: eagle.x + 20,
        y: eagle.y + 20,
        width: eagleConfig.width - 40,
        height: eagleConfig.height - 40
    };

    return catBox.x < eagleBox.x + eagleBox.width &&
           catBox.x + catBox.width > eagleBox.x &&
           catBox.y < eagleBox.y + eagleBox.height &&
           catBox.y + catBox.height > eagleBox.y;
}

function checkCollision(cat, pigeon) {
    const catBox = {
        x: cat.x,
        y: cat.isCrouching ? cat.y + cat.height / 2 : cat.y,
        width: cat.width,
        height: cat.isCrouching ? cat.height / 2 : cat.height
    };

    return catBox.x < pigeon.x + pigeonConfig.width &&
           catBox.x + catBox.width > pigeon.x &&
           catBox.y < pigeon.y + pigeonConfig.height &&
           catBox.y + catBox.height > pigeon.y;
}

function drawBackground() {
    // Draw background image - cover mode to avoid squeezing
    const bgAspect = assets.background.width / assets.background.height;
    const canvasAspect = canvas.width / canvas.height;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (canvasAspect > bgAspect) {
        // Canvas is wider than background
        drawWidth = canvas.width;
        drawHeight = canvas.width / bgAspect;
        offsetX = 0;
        offsetY = (canvas.height - drawHeight) / 2;
    } else {
        // Canvas is taller than background
        drawHeight = canvas.height;
        drawWidth = canvas.height * bgAspect;
        offsetX = (canvas.width - drawWidth) / 2;
        offsetY = 0;
    }

    ctx.drawImage(assets.background, offsetX, offsetY, drawWidth, drawHeight);
}

function drawTrain() {
    // Draw left end (flipped right end) - only once at the beginning
    if (game.showLeftEnd) {
        ctx.save();
        ctx.translate(game.trainX + train.endWidth, train.y);
        ctx.scale(-1, 1);
        ctx.drawImage(assets.trainRightEnd, 0, 0, train.endWidth, train.endHeight);
        ctx.restore();

        // Hide left end once it's off screen
        if (game.trainX + train.endWidth < -train.endWidth) {
            game.showLeftEnd = false;
        }
    }

    // Draw infinite repeating center sections
    // Start position for first center section
    let startX = game.trainX + train.endWidth + train.gapBetweenSections;

    // Calculate how far to offset based on movement
    const totalGaps = train.numCenterSections * train.gapBetweenSections;
    const repeatWidth = (train.centerWidth * train.numCenterSections) + totalGaps;

    // Adjust start to always cover the screen
    while (startX > 0) {
        startX -= repeatWidth;
    }

    // Draw enough repeating sections to cover screen width
    let currentX = startX;
    while (currentX < canvas.width) {
        for (let i = 0; i < train.numCenterSections; i++) {
            ctx.drawImage(
                assets.trainCenter,
                currentX,
                train.y,
                train.centerWidth,
                train.centerHeight
            );
            currentX += train.centerWidth + train.gapBetweenSections;
        }
    }
}

function drawCat() {
    const isIdle = cat.state === 'idle';
    const spriteSheet = isIdle ? assets.catIdle : assets.catRun;
    const spriteWidth = isIdle ? CAT_CONFIG.idleSpriteWidth : CAT_CONFIG.runSpriteWidth;
    const spriteHeight = isIdle ? CAT_CONFIG.idleSpriteHeight : CAT_CONFIG.runSpriteHeight;

    ctx.save();

    // Flip horizontally if facing left
    if (cat.facingLeft) {
        ctx.translate(cat.x + cat.width, cat.y);
        ctx.scale(-1, 1);
    } else {
        ctx.translate(cat.x, cat.y);
    }

    // Draw crouched (scaled down vertically)
    if (cat.isCrouching && !cat.isJumping) {
        ctx.drawImage(
            spriteSheet,
            cat.frameIndex * spriteWidth,             // Source x from sprite sheet
            0,                                         // Source y (always 0 for horizontal strips)
            spriteWidth,                               // Source width
            spriteHeight,                              // Source height
            0,                                         // Destination x (0 because we translated)
            cat.height / 2,                           // Destination y (lowered for crouch)
            cat.width,                                 // Destination width (scaled)
            cat.height / 2                            // Destination height (half for crouch)
        );
    } else {
        ctx.drawImage(
            spriteSheet,
            cat.frameIndex * spriteWidth,             // Source x from sprite sheet
            0,                                         // Source y (always 0 for horizontal strips)
            spriteWidth,                               // Source width
            spriteHeight,                              // Source height
            0,                                         // Destination x (0 because we translated)
            0,                                         // Destination y
            cat.width,                                 // Destination width (scaled)
            cat.height                                // Destination height (scaled)
        );
    }

    ctx.restore();
}

function drawPigeons() {
    pigeons.forEach(pigeon => {
        ctx.save();

        // Flip pigeon horizontally to face left
        ctx.translate(pigeon.x + pigeonConfig.width, pigeon.y);
        ctx.scale(-1, 1);

        ctx.drawImage(
            assets.pigeon,
            pigeon.frameIndex * pigeonConfig.width,
            0,
            pigeonConfig.width,
            pigeonConfig.height,
            0,
            0,
            pigeonConfig.width,
            pigeonConfig.height
        );

        ctx.restore();
    });
}

function drawEagles() {
    eagles.forEach(eagle => {
        ctx.save();

        // Draw eagle (don't flip - sprite already faces left)
        ctx.drawImage(
            assets.eagle,
            eagle.frameIndex * eagleConfig.spriteWidth,  // Source x from sprite sheet
            0,
            eagleConfig.spriteWidth,                     // Source width (100)
            eagleConfig.spriteHeight,                    // Source height (100)
            eagle.x,                                      // Destination x
            eagle.y,                                      // Destination y
            eagleConfig.width,                           // Destination width (70 - scaled)
            eagleConfig.height                           // Destination height (70 - scaled)
        );

        ctx.restore();
    });
}

function drawScoreAnimations() {
    scoreAnimations.forEach(anim => {
        ctx.save();

        ctx.globalAlpha = anim.alpha;
        ctx.fillStyle = '#00FF00';  // Bright green
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw fill
        ctx.fillText(anim.text, anim.x, anim.y);

        ctx.restore();
    });
}

function update() {
    // Handle countdown
    if (!game.gameStarted) {
        game.countdownTimer++;
        if (game.countdownTimer >= game.countdownInterval) {
            game.countdownTimer = 0;
            game.countdown--;
            if (game.countdown <= 0) {
                game.gameStarted = true;
                console.log('Countdown finished! Train starting to move.');
            }
        }
        return; // Don't update game until countdown finishes
    }

    // Stop updating game logic if game over
    if (!game.isRunning) return;

    // Move train from RIGHT to LEFT (subtract to move left)
    game.trainX -= game.trainSpeed;

    updateCat();
    updatePigeons();
    updateEagles();
    updateScoreAnimations();
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();
    drawTrain();
    drawPigeons();
    drawEagles();
    drawCat();
    drawScoreAnimations();

    // Draw countdown if game hasn't started
    if (!game.gameStarted) {
        drawCountdown();
    }

    // Draw game over screen on top of everything
    if (!game.isRunning && game.gameStarted) {
        drawGameOverScreen();
    }
}

function drawCountdown() {
    if (game.countdown <= 0) return;

    ctx.save();

    // Flash effect - make number bigger and fade during each second
    const progress = game.countdownTimer / game.countdownInterval;
    const scale = 1 + (Math.sin(progress * Math.PI * 2) * 0.2); // Pulsing effect
    const alpha = 1 - (progress * 0.3); // Slight fade

    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 8;
    ctx.font = `bold ${120 * scale}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = game.countdown.toString();

    // Draw stroke (outline)
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    // Draw fill
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    ctx.restore();
}

function gameLoop() {
    update();
    draw();

    requestAnimationFrame(gameLoop);
}

// Start message
ctx.fillStyle = 'white';
ctx.font = '30px Arial';
ctx.textAlign = 'center';
ctx.fillText('Loading assets...', canvas.width / 2, canvas.height / 2);
