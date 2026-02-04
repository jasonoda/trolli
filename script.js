const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const gameOverElement = document.getElementById('gameOver');
const gameOverButtons = document.getElementById('gameOverButtons');
const playAgainBtn = document.getElementById('playAgainBtn');
const hsBtn = document.getElementById('hsBtn');
const startScreen = document.getElementById('startScreen');
const startPlayBtn = document.getElementById('startPlayBtn');
const startInstructionsBtn = document.getElementById('startInstructionsBtn');
const instructionsOverlay = document.getElementById('instructionsOverlay');
const instructionsCloseBtn = document.getElementById('instructionsCloseBtn');
const highScoreEntry = document.getElementById('highScoreEntry');
const hsEntryScore = document.getElementById('hsEntryScore');
const hsEntryInput = document.getElementById('hsEntryInput');
const bigHead = document.getElementById('bigHead');
const bigHeadGlow = document.getElementById('bigHeadGlow');
const eyeContainer = document.getElementById('eyeContainer');
const eyeLeft = document.getElementById('eyeLeft');
const eyeRight = document.getElementById('eyeRight');
const bigTail = document.getElementById('bigTail');
const fpsCounter = document.getElementById('fpsCounter');
const rainbowOverlay = document.getElementById('rainbowOverlay');

function playSound(src, options = {}) {
    if (typeof Howl === 'undefined') return null;
    const howl = new Howl({ src: [src], volume: options.volume ?? 1, loop: options.loop ?? false });
    howl.play();
    return howl;
}
let startMusicHowl = null;

// Mobile-first grid size
const GRID_SIZE = 35;
let cellSize;
let gridWidth, gridHeight;

// Device check (no dimension-based detection): mobile = 0.8x speed
function isMobileDevice() {
    if (typeof navigator === 'undefined') return false;
    if (navigator.userAgentData?.mobile === true) return true;
    const ua = navigator.userAgent || '';
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}
function getGameUpdateIntervalMs() {
    const base = 180; // 20% slower than 150
    return isMobileDevice() ? base / 0.8 : base;
}

// Game state
let snake = [
    { x: 10, y: 10, color: 'red' }, 
    { x: 10, y: 9, color: 'red' }, 
    { x: 10, y: 8, color: 'red' },
    { x: 10, y: 7, color: 'red' },
    { x: 10, y: 6, color: 'red' }
]; // Start with 5 segments
let direction = { x: 0, y: 1 }; // Pointing down
let nextDirection = { x: 0, y: 1 }; // Pointing down
let food = { x: 15, y: 15, color: 'red' };
let score = 0;
let gameRunning = false;
let gamePaused = false;
let gameLoop;
let animationFrameId;
let lastUpdateTime = 0;

function renderLoop() {
    draw();
    animationFrameId = requestAnimationFrame(renderLoop);
}
let lastFoodColor = null;
let pendingColorChange = false;
let newColor = null;
let growthPending = 0; // Track how many segments to grow

// Performance toggle: set to false to disable glow effect for better performance
let enableGlow = true;

// FPS counter
let fps = 0;
let lastTime = performance.now();
let frameCount = 0;
let fpsUpdateInterval = 0;

// Pulsating brightness state (used to subtly pulse the worm)
let pulsateFactor = 1;

// Ripple effect configuration for snake body scale
const rippleScaleAmplitude = 0.4;     // 0.2 => scales from 1.0 to 1.2
const rippleScaleFrequency = 0.01;  // lower = slower overall wave speed
const ripplePhaseOffset = 0.6;        // phase offset between segments (radians)

// Food colors
const foodColors = ['red', 'orange', 'green', 'yellow', 'cyan', 'pink'];
const foodColorValues = {
    red: '#ff0000',
    orange: '#ff8800',
    green: '#45d145',
    yellow: '#ffff00',
    cyan: '#00ffff',
    pink: '#ff69b4'
};

// Map snake/food colors to fruit images (initialized after image variables)
let fruitImages = {};

// Helper function to convert hex to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Touch/swipe detection
let touchStartX = 0;
let touchStartY = 0;
let touchTurnRegistered = false; // true after we fire a turn during this gesture
let touchStartedOnIcons = false;
const TURN_THRESHOLD_PX = 20;    // fire turn once finger moves this far from start


// Image assets
let sideImage = new Image();
let angleImage = new Image();
let endImage = new Image();
let headImage = new Image();
let halfSideImage = new Image();
let bigHeadImage = new Image();
let bigTailImage = new Image();
let eyeImage = new Image();
// Fruit images for food
let cherryImage = new Image();     // red
let orangeImage = new Image();     // orange
let limeImage = new Image();       // green (lime)
let grapeImage = new Image();      // blue/cyan (grape)
let strawberryImage = new Image(); // pink (strawberry)
let lemonImage = new Image();      // yellow (lemon)
let imagesLoaded = 0;

// Initialize fruit image map now that variables exist
fruitImages = {
    red: cherryImage,       // cherry
    orange: orangeImage,    // orange
    green: limeImage,       // lime
    yellow: lemonImage,     // lemon
    cyan: grapeImage,       // grape (blue)
    pink: strawberryImage   // strawberry
};

// Cache for tinted images (key: imageName_color, value: HTMLCanvasElement)
let tintedImageCache = {};
let gradientImageCache = {};
let glowImageCache = {}; // Cache for glow canvases
let gridCanvas = null; // Offscreen canvas for grid

// Pre-generate tinted images for all colors
function generateTintedImage(image, imageName, colorName, size) {
    const cacheKey = `${imageName}_${colorName}`;
    if (tintedImageCache[cacheKey]) {
        return tintedImageCache[cacheKey];
    }
    
    const colorValue = foodColorValues[colorName] || foodColorValues['red'];
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw the grey image to temp canvas (preserves alpha)
    tempCtx.drawImage(image, 0, 0, size, size);
    
    // Apply color using 'color' blend mode
    tempCtx.globalCompositeOperation = 'color';
    tempCtx.fillStyle = colorValue;
    tempCtx.fillRect(0, 0, size, size);
    
    // Use destination-in to restore the original alpha channel from the image
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.drawImage(image, 0, 0, size, size);
    tempCtx.globalCompositeOperation = 'source-over';
    
    tintedImageCache[cacheKey] = tempCanvas;
    return tempCanvas;
}

// Pre-generate gradient overlay images for all colors
function generateGradientImage(image, colorName, size) {
    const cacheKey = `gradient_${colorName}`;
    if (gradientImageCache[cacheKey]) {
        return gradientImageCache[cacheKey];
    }
    
    const colorValue = foodColorValues[colorName] || foodColorValues['red'];
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw the grey gradient mask first (preserves alpha gradient)
    tempCtx.drawImage(image, 0, 0, size, size);
    
    // Apply color using 'color' blend mode
    tempCtx.globalCompositeOperation = 'color';
    tempCtx.fillStyle = colorValue;
    tempCtx.fillRect(0, 0, size, size);
    
    // Now preserve the alpha channel by using the original gradient as a mask
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.drawImage(image, 0, 0, size, size);
    tempCtx.globalCompositeOperation = 'source-over';
    
    gradientImageCache[cacheKey] = tempCanvas;
    return tempCanvas;
}

// Pre-generate glow images for all colors (pre-blurred for performance)
function generateGlowImage(image, imageName, colorName, size) {
    const cacheKey = `glow_${imageName}_${colorName}`;
    if (glowImageCache[cacheKey]) {
        return glowImageCache[cacheKey];
    }
    
    const colorValue = foodColorValues[colorName] || foodColorValues['red'];
    
    // First create the colored version
    const coloredCanvas = document.createElement('canvas');
    coloredCanvas.width = size;
    coloredCanvas.height = size;
    const coloredCtx = coloredCanvas.getContext('2d');
    
    // Draw the grey image to temp canvas
    coloredCtx.drawImage(image, 0, 0, size, size);
    
    // Apply color using 'color' blend mode
    coloredCtx.globalCompositeOperation = 'color';
    coloredCtx.fillStyle = colorValue;
    coloredCtx.fillRect(0, 0, size, size);
    
    // Restore alpha channel
    coloredCtx.globalCompositeOperation = 'destination-in';
    coloredCtx.drawImage(image, 0, 0, size, size);
    coloredCtx.globalCompositeOperation = 'source-over';
    
    // Now create the blurred version (pre-blur for performance)
    const glowCanvas = document.createElement('canvas');
    // Add padding for blur to prevent cropping
    const blurPadding = 20;
    glowCanvas.width = size + blurPadding * 2;
    glowCanvas.height = size + blurPadding * 2;
    const glowCtx = glowCanvas.getContext('2d');
    
    // Apply blur filter and draw the colored image
    glowCtx.filter = 'blur(8px)';
    glowCtx.drawImage(coloredCanvas, blurPadding, blurPadding);
    glowCtx.filter = 'none';
    
    glowImageCache[cacheKey] = glowCanvas;
    return glowCanvas;
}

// Pre-generate all tinted images when images load
function pregenerateTintedImages() {
    // Only generate if cellSize is set (will be called after initCanvas)
    if (!cellSize) return;
    
    // Generate tinted versions for all base images and all colors
    foodColors.forEach(color => {
        generateTintedImage(sideImage, 'side', color, cellSize);
        generateTintedImage(angleImage, 'angle', color, cellSize);
        generateTintedImage(endImage, 'end', color, cellSize);
        generateTintedImage(headImage, 'head', color, cellSize);
        generateGradientImage(halfSideImage, color, cellSize);
        // Pre-generate glow images if glow is enabled
        if (enableGlow) {
            generateGlowImage(sideImage, 'side', color, cellSize);
            generateGlowImage(angleImage, 'angle', color, cellSize);
            generateGlowImage(endImage, 'end', color, cellSize);
            generateGlowImage(headImage, 'head', color, cellSize);
        }
    });
}

function loadImages() {
    return new Promise((resolve) => {
        const totalImages = 14;
        
        sideImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        angleImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        endImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        headImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        halfSideImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        bigHeadImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        bigTailImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        eyeImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
            // Set eye background images when loaded
            if (eyeLeft) eyeLeft.style.backgroundImage = `url(${eyeImage.src})`;
            if (eyeRight) eyeRight.style.backgroundImage = `url(${eyeImage.src})`;
        };
        
        // Fruit images
        cherryImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        orangeImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        limeImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        grapeImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        strawberryImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        lemonImage.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) resolve();
        };
        
        sideImage.src = 'src/img/worm/side.png';
        angleImage.src = 'src/img/worm/angle.png';
        endImage.src = 'src/img/worm/end.png';
        headImage.src = 'src/img/worm/head.png';
        halfSideImage.src = 'src/img/worm/halfSide.png';
        bigHeadImage.src = 'src/img/worm/bigHead.png';
        bigTailImage.src = 'src/img/worm/bigTail.png';
        // Fruit images
        cherryImage.src = 'src/img/fruit/cherry.png';
        orangeImage.src = 'src/img/fruit/orange.png';
        limeImage.src = 'src/img/fruit/lime.png';
        grapeImage.src = 'src/img/fruit/grape.png';
        strawberryImage.src = 'src/img/fruit/strawberry.png';
        lemonImage.src = 'src/img/fruit/lemon.png';
        
        eyeImage.src = 'src/img/worm/eye.png';
    });
}

// Visual state for fruit sprite (used for spawn scale animation)
let fruitVisual = { scale: 1.3 };
let fruitTween = null;

// Visual state for fruit background ring (behind the fruit)
let fruitRing = { scale: 1, alpha: 0 };
let fruitRingTween = null;

// Visual state for a one-off hit ring when fruit is collected
let fruitHitRing = { x: 0, y: 0, scale: 0, alpha: 0, color: '#ffffff', active: false };
let fruitHitTween = null;

// Floating color-bonus text at fruit position ("BONUS" / "+20" etc.)
let colorBonusFloat = null;

// Game over FX state
let fruitRainIntervalId = null;
let fruitRainTimeoutId = null;
let gameOverTimeoutId = null;
let startDelayTimeoutId = null;
let pendingHighScore = 0;

const HIGHSCORE_KEY = 'trolli_highscores';
const HIGHSCORE_MAX = 50;

function loadHighScores() {
    try {
        const raw = localStorage.getItem(HIGHSCORE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function saveHighScores(arr) {
    try {
        localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(arr));
    } catch (_) {}
}

function isNewHighScore(s) {
    const list = loadHighScores();
    if (list.length < HIGHSCORE_MAX) return true;
    const min = Math.min(...list.map((e) => e.score));
    return s > min;
}

function getRankForScore(s) {
    const list = loadHighScores();
    let count = 0;
    for (const e of list) {
        if (e.score > s) count++;
    }
    return count + 1;
}

function addHighScore(initials, s) {
    const list = loadHighScores();
    list.push({ initials: String(initials).toUpperCase().slice(0, 3), score: s });
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, HIGHSCORE_MAX);
    saveHighScores(top);
    return top;
}

// Fixed grid shape you like (15×23 at 540px height). Display scales down when viewport is smaller.
const FIXED_GRID_WIDTH = 15;
const FIXED_GRID_HEIGHT = 23;
const REF_DISPLAY_HEIGHT = 540;
const REF_DISPLAY_WIDTH = Math.round((FIXED_GRID_WIDTH * GRID_SIZE) * (REF_DISPLAY_HEIGHT / (FIXED_GRID_HEIGHT * GRID_SIZE)));

// Initialize canvas size based on mobile layout
function initCanvas() {
    gridWidth = FIXED_GRID_WIDTH;
    gridHeight = FIXED_GRID_HEIGHT;
    cellSize = GRID_SIZE;
    canvas.width = gridWidth * cellSize;
    canvas.height = gridHeight * cellSize;
    
    const availableWidth = Math.min(600, window.innerWidth - 40);
    const availableHeight = Math.max(200, window.innerHeight - 200);
    let scale = Math.min(availableWidth / REF_DISPLAY_WIDTH, availableHeight / REF_DISPLAY_HEIGHT, 1);
    scale = Math.max(0.3, scale);
    const displayW = Math.round(REF_DISPLAY_WIDTH * scale);
    const displayH = Math.round(REF_DISPLAY_HEIGHT * scale);
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';
    const container = canvas.closest('.container');
    if (container) container.style.setProperty('--game-display-width', displayW + 'px');
    
    // Clear grid cache when canvas size changes
    gridCanvas = null;
    
    // Regenerate tinted images with new cellSize if images are already loaded
    if (imagesLoaded >= 5) {
        tintedImageCache = {};
        gradientImageCache = {};
        glowImageCache = {};
        pregenerateTintedImages();
    }
    
    // Reset snake position to center, moved up 4 boxes (start with 5 segments, pointing down)
    const centerX = Math.floor(gridWidth / 2);
    const centerY = Math.floor(gridHeight / 2);
    snake = [
        { x: centerX, y: centerY - 4, color: 'red' },
        { x: centerX, y: centerY - 5, color: 'red' },
        { x: centerX, y: centerY - 6, color: 'red' },
        { x: centerX, y: centerY - 7, color: 'red' },
        { x: centerX, y: centerY - 8, color: 'red' }
    ];
    direction = { x: 0, y: 1 }; // Pointing down
    nextDirection = { x: 0, y: 1 }; // Pointing down
    
    lastFoodColor = null; // Reset last food color
    pendingColorChange = false; // Reset color change flag
    newColor = null;
    gamePaused = false; // Reset pause state
    growthPending = 0; // Reset growth counter
    
    // Set first food 4 cells below the head (reuse centerX and centerY)
    // Head is at centerY - 4, so food should be at centerY - 4 + 4 = centerY
    food = {
        x: centerX,
        y: centerY,
        color: 'red'
    };
    // Pick a color different from the last one
    let availableColors = foodColors.filter(color => color !== lastFoodColor);
    if (availableColors.length === 0) {
        availableColors = foodColors;
    }
    food.color = availableColors[Math.floor(Math.random() * availableColors.length)];
    lastFoodColor = food.color;
    animateFruitSpawn();

    // Initialize big head position (after canvas is rendered)
    if (bigHead && snake.length > 0 && typeof gsap !== 'undefined') {
        setTimeout(() => {
            // Set initial position without animation
            const canvasRect = canvas.getBoundingClientRect();
            const wrapperRect = canvas.parentElement.getBoundingClientRect();
            const borderWidth = 5;
            const canvasContentWidth = canvasRect.width - (borderWidth * 2);
            const canvasContentHeight = canvasRect.height - (borderWidth * 2);
            const actualScaleX = canvasContentWidth / canvas.width;
            const actualScaleY = canvasContentHeight / canvas.height;
            
            const currentHead = snake[0];
            const canvasX = currentHead.x * cellSize + cellSize / 2;
            const canvasY = currentHead.y * cellSize + cellSize / 2;
            const headX = canvasX * actualScaleX + borderWidth + (canvasRect.left - wrapperRect.left) - 2;
            const headY = canvasY * actualScaleY + borderWidth + (canvasRect.top - wrapperRect.top) - 2;
            const headColor = currentHead.color || 'red';
            
            // Update the tinted image
            updateBigHeadImage(headColor);
            
            // Use the same size function to ensure consistency, but increase by 20% before game starts
            const bigHeadSize = getBigHeadSize() * 1.2;
            bigHead.style.width = bigHeadSize + 'px';
            bigHead.style.height = bigHeadSize + 'px';
            
            // Update glow element to match big head
            if (bigHeadGlow) {
                bigHeadGlow.style.width = bigHeadSize + 'px';
                bigHeadGlow.style.height = bigHeadSize + 'px';
                bigHeadGlow.style.backgroundImage = bigHead.style.backgroundImage;
                bigHeadGlow.style.backgroundSize = '100% 100%';
                bigHeadGlow.style.backgroundPosition = 'center';
            }
            
            // Rotate eye container to match head direction
            let headRotation = 0;
            if (snake.length > 1) {
                const nextSeg = snake[1];
                const dir = getSegmentDirection(snake[0], nextSeg);
                if (dir) {
                    headRotation = getSideRotation(dir);
                }
            }
            if (eyeContainer) {
                eyeContainer.style.transform = `rotate(${headRotation - 90}deg)`;
            }
            
            // Calculate initial scale using the same ripple effect as snake body (head is index 0)
            const headScale = getSegmentRippleScale(0);
            
            gsap.set(bigHead, {
                x: headX,
                y: headY
            });
            
            // Apply transform with scale immediately
            bigHead.style.transform = `translate(calc(${headX}px - 50%), calc(${headY}px - 50%)) scale(${headScale})`;
            if (bigHeadGlow) {
                bigHeadGlow.style.transform = `translate(calc(${headX}px - 50%), calc(${headY}px - 50%)) scale(${headScale})`;
            }
        }, 0);
    }
    
    // Initialize big tail position (after canvas is rendered)
    if (bigTail && snake.length > 0 && typeof gsap !== 'undefined') {
        setTimeout(() => {
            updateBigTailPosition();
        }, 0);
    }
}

// Run fruit sprite + background ring spawn animation (used for first fruit and on each generateFood)
function animateFruitSpawn() {
    if (typeof gsap !== 'undefined') {
        if (fruitTween) {
            fruitTween.kill();
        }
        fruitVisual.scale = 0;
        fruitTween = gsap.to(fruitVisual, {
            scale: 1.3,
            duration: 1,
            ease: "back.out(1.7)"
        });
        if (fruitRingTween) {
            fruitRingTween.kill();
        }
        fruitRing.scale = 0;
        fruitRing.alpha = 0;
        fruitRingTween = gsap.to(fruitRing, {
            scale: 1,
            alpha: 0.6,
            duration: 1,
            ease: "back.out(1.7)"
        });
    } else {
        fruitVisual.scale = 1.3;
        fruitRing.scale = 1;
        fruitRing.alpha = 0.6;
    }
}

// Generate food at random position and color
function generateFood() {
    // Store old food position
    const oldFoodX = food ? food.x : -1;
    const oldFoodY = food ? food.y : -1;
    
    let attempts = 0;
    const maxAttempts = 1000; // Prevent infinite loop
    
    do {
        food = {
            x: Math.floor(Math.random() * gridWidth),
            y: Math.floor(Math.random() * gridHeight)
        };
        attempts++;
        
        // Check if position is valid (not on snake and not same as old position)
        let isValid = true;
        
        // Check if it's the same as old position
        if (food.x === oldFoodX && food.y === oldFoodY) {
            isValid = false;
            continue;
        }
        
        // Check if it's on any snake segment
        for (let segment of snake) {
            if (segment.x === food.x && segment.y === food.y) {
                isValid = false;
                break;
            }
        }
        
        if (isValid) {
            break;
        }
    } while (attempts < maxAttempts);
    
    // Pick a color different from the last one
    let availableColors = foodColors.filter(color => color !== lastFoodColor);
    if (availableColors.length === 0) {
        availableColors = foodColors; // Fallback if somehow all colors are excluded
    }
    food.color = availableColors[Math.floor(Math.random() * availableColors.length)];
    lastFoodColor = food.color;

    animateFruitSpawn();
}

// Calculate big head size (single source of truth)
function getBigHeadSize() {
    const canvasRect = canvas.getBoundingClientRect();
    // Account for canvas border (5px on all sides) - getBoundingClientRect includes border
    const borderWidth = 5;
    const canvasContentWidth = canvasRect.width - (borderWidth * 2);
    const actualScaleX = canvasContentWidth / canvas.width;
    // Make it slightly bigger than the actual head (head is cellSize, so use 1.15x for slight increase)
    return Math.max(cellSize * 1.15 * actualScaleX, 20);
}

// Calculate big tail size (same as big head)
function getBigTailSize() {
    return getBigHeadSize();
}

// Update big head image
function updateBigHeadImage(colorName) {
    if (!bigHead) return;
    
    // Wait for bigHead image to load
    if (!bigHeadImage || !bigHeadImage.complete || bigHeadImage.naturalWidth === 0) {
        if (bigHeadImage && !bigHeadImage.complete) {
            bigHeadImage.onload = () => updateBigHeadImage(colorName);
        }
        return;
    }
    
    const bigHeadSize = getBigHeadSize();
    
    // Get rotation exactly the same way as the canvas head
    // The canvas head uses: getSegmentDirection(snake[0], snake[1]) then getSideRotation(dir)
    let rotation = 0;
    if (snake.length > 1) {
        const nextSeg = snake[1];
        const dir = getSegmentDirection(snake[0], nextSeg);
        if (dir) {
            rotation = getSideRotation(dir);
        }
    }
    
    // Get color value for tinting (same as small head)
    const colorValue = foodColorValues[colorName] || foodColorValues['red'];
    
    // Render at 2x resolution for better quality, then scale down with CSS
    const resolutionMultiplier = 2;
    const canvasSize = bigHeadSize * resolutionMultiplier;
    
    // Create a canvas with the head image and blurred copy for glow
    const headCanvas = document.createElement('canvas');
    headCanvas.width = canvasSize;
    headCanvas.height = canvasSize;
    const headCtx = headCanvas.getContext('2d');
    headCtx.imageSmoothingEnabled = true;
    headCtx.imageSmoothingQuality = 'high';
    
    // First, create a temp canvas with the rotated image (for tinting)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasSize;
    tempCanvas.height = canvasSize;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';
    
    // Draw rotated head image to temp canvas at higher resolution
    tempCtx.translate(canvasSize / 2, canvasSize / 2);
    tempCtx.rotate((rotation * Math.PI) / 180);
    tempCtx.drawImage(bigHeadImage, -canvasSize / 2, -canvasSize / 2, canvasSize, canvasSize);
    tempCtx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Apply color tinting (same method as drawImageWithColorTint)
    tempCtx.globalCompositeOperation = 'color';
    tempCtx.fillStyle = colorValue;
    tempCtx.fillRect(0, 0, canvasSize, canvasSize);
    
    // Restore alpha channel
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.translate(canvasSize / 2, canvasSize / 2);
    tempCtx.rotate((rotation * Math.PI) / 180);
    tempCtx.drawImage(bigHeadImage, -canvasSize / 2, -canvasSize / 2, canvasSize, canvasSize);
    tempCtx.setTransform(1, 0, 0, 1, 0, 0);
    tempCtx.globalCompositeOperation = 'source-over';
    
    // Now draw to main canvas (no glow, just the tinted image)
    // Draw normal tinted image directly (glow removed)
    headCtx.filter = 'none';
    headCtx.globalAlpha = 1.0;
    headCtx.drawImage(tempCanvas, 0, 0);
    
    // Convert to data URL and set as background image
    const dataUrl = headCanvas.toDataURL();
    bigHead.style.backgroundImage = `url(${dataUrl})`;
    // Use 100% to fill the element size (which is set in updateBigHeadPosition)
    // The image is rendered at 2x resolution, so it will be automatically scaled down for better quality
    bigHead.style.backgroundSize = '100% 100%';
    bigHead.style.backgroundRepeat = 'no-repeat';
    bigHead.style.backgroundPosition = 'center';
    bigHead.style.backgroundColor = 'transparent';
    bigHead.style.boxShadow = 'none';
    
    // Update glow element background image to match
    if (bigHeadGlow) {
        bigHeadGlow.style.backgroundImage = `url(${dataUrl})`;
        bigHeadGlow.style.backgroundSize = '100% 100%';
        bigHeadGlow.style.backgroundRepeat = 'no-repeat';
        bigHeadGlow.style.backgroundPosition = 'center';
    }
}

// Update big head position
function updateBigHeadPosition() {
    if (bigHead && snake.length > 0 && typeof gsap !== 'undefined') {
        // Calculate position relative to canvas (accounting for canvas scaling and border)
        const canvasRect = canvas.getBoundingClientRect();
        const wrapperRect = canvas.parentElement.getBoundingClientRect();
        
        // Account for canvas border (5px on all sides) - getBoundingClientRect includes border
        const borderWidth = 5;
        const canvasContentWidth = canvasRect.width - (borderWidth * 2);
        const canvasContentHeight = canvasRect.height - (borderWidth * 2);
        const actualScaleX = canvasContentWidth / canvas.width;
        const actualScaleY = canvasContentHeight / canvas.height;
        
        // Get current head position
        const currentHead = snake[0];
        // Calculate position in canvas coordinates first, then convert to screen coordinates
        // This matches exactly how the canvas draws the snake head
        const canvasX = currentHead.x * cellSize + cellSize / 2;
        const canvasY = currentHead.y * cellSize + cellSize / 2;
        // Convert to screen coordinates relative to wrapper (accounting for border)
        const headX = canvasX * actualScaleX + borderWidth + (canvasRect.left - wrapperRect.left) - 2;
        const headY = canvasY * actualScaleY + borderWidth + (canvasRect.top - wrapperRect.top) - 2;
        
        // Update big head color to match snake head color
        const headColor = currentHead.color || 'red';
        
        // Update the image (this calculates and uses bigHeadSize internally)
        updateBigHeadImage(headColor);
        
        // Get the size using the same function (ensures consistency)
        const bigHeadSize = getBigHeadSize();
        bigHead.style.width = bigHeadSize + 'px';
        bigHead.style.height = bigHeadSize + 'px';
        
        // Update glow element to match big head
        if (bigHeadGlow) {
            bigHeadGlow.style.width = bigHeadSize + 'px';
            bigHeadGlow.style.height = bigHeadSize + 'px';
            bigHeadGlow.style.backgroundImage = bigHead.style.backgroundImage;
            bigHeadGlow.style.backgroundSize = '100% 100%';
            bigHeadGlow.style.backgroundPosition = 'center';
        }
        
        // Calculate scale using the same ripple effect as snake body (head is index 0)
        const headScale = getSegmentRippleScale(0);
        
        // Use GSAP to animate position
        gsap.to(bigHead, {
            x: headX,
            y: headY,
            duration: 0.15, // Match game loop speed
            ease: "power2.out",
            onUpdate: function() {
                // Get current position from GSAP
                const x = gsap.getProperty(bigHead, "x") || headX;
                const y = gsap.getProperty(bigHead, "y") || headY;
                // Recalculate scale each frame to match snake body ripple
                const currentHeadScale = getSegmentRippleScale(0);
                // Apply transform for positioning and scale (rotation is in the image)
                bigHead.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(${currentHeadScale})`;
                // Update glow element to match
                if (bigHeadGlow) {
                    bigHeadGlow.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(${currentHeadScale})`;
                }
                // Update eye container rotation in sync with head position
                if (snake.length > 1 && eyeContainer) {
                    const nextSeg = snake[1];
                    const dir = getSegmentDirection(snake[0], nextSeg);
                    if (dir) {
                        const headRotation = getSideRotation(dir);
                        eyeContainer.style.transform = `rotate(${headRotation - 90}deg)`;
                    }
                }
            }
        });
        
        // Also update scale immediately (in case GSAP animation hasn't started)
        const x = gsap.getProperty(bigHead, "x") || headX;
        const y = gsap.getProperty(bigHead, "y") || headY;
        bigHead.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(${headScale})`;
        if (bigHeadGlow) {
            bigHeadGlow.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(${headScale})`;
        }
    }
}

// Update big tail image
function updateBigTailImage(colorName) {
    if (!bigTail) return;
    
    // Wait for bigTail image to load
    if (!bigTailImage || !bigTailImage.complete || bigTailImage.naturalWidth === 0) {
        if (bigTailImage && !bigTailImage.complete) {
            bigTailImage.onload = () => updateBigTailImage(colorName);
        }
        return;
    }
    
    const bigTailSize = getBigTailSize();
    
    // Get rotation for second-to-last segment
    // Use direction from second-to-last to last segment
    let rotation = 0;
    if (snake.length > 2) {
        const secondToLastIndex = snake.length - 2;
        const lastIndex = snake.length - 1;
        const dir = getSegmentDirection(snake[secondToLastIndex], snake[lastIndex]);
        if (dir) {
            rotation = getSideRotation(dir);
        }
    } else if (snake.length > 1) {
        // If only 2 segments, use direction from first to second
        const dir = getSegmentDirection(snake[0], snake[1]);
        if (dir) {
            rotation = getSideRotation(dir);
        }
    }
    
    // Get color value for tinting (same as small tail)
    const colorValue = foodColorValues[colorName] || foodColorValues['red'];
    
    // Canvas size matches image size
    const canvasSize = bigTailSize;
    
    // Create a canvas with the tail image
    const tailCanvas = document.createElement('canvas');
    tailCanvas.width = canvasSize;
    tailCanvas.height = canvasSize;
    const tailCtx = tailCanvas.getContext('2d');
    
    // First, create a temp canvas with the rotated image (for tinting)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bigTailSize;
    tempCanvas.height = bigTailSize;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw rotated tail image to temp canvas
    tempCtx.translate(bigTailSize / 2, bigTailSize / 2);
    tempCtx.rotate((rotation * Math.PI) / 180);
    tempCtx.drawImage(bigTailImage, -bigTailSize / 2, -bigTailSize / 2, bigTailSize, bigTailSize);
    tempCtx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Apply color tinting (same method as drawImageWithColorTint)
    tempCtx.globalCompositeOperation = 'color';
    tempCtx.fillStyle = colorValue;
    tempCtx.fillRect(0, 0, bigTailSize, bigTailSize);
    
    // Restore alpha channel
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.translate(bigTailSize / 2, bigTailSize / 2);
    tempCtx.rotate((rotation * Math.PI) / 180);
    tempCtx.drawImage(bigTailImage, -bigTailSize / 2, -bigTailSize / 2, bigTailSize, bigTailSize);
    tempCtx.setTransform(1, 0, 0, 1, 0, 0);
    tempCtx.globalCompositeOperation = 'source-over';
    
    // Draw normal tinted image
    tailCtx.filter = 'none';
    tailCtx.globalAlpha = 1.0;
    tailCtx.drawImage(tempCanvas, 0, 0);
    
    // Convert to data URL and set as background image
    const dataUrl = tailCanvas.toDataURL();
    bigTail.style.backgroundImage = `url(${dataUrl})`;
    bigTail.style.backgroundSize = '100% 100%';
    bigTail.style.backgroundRepeat = 'no-repeat';
    bigTail.style.backgroundPosition = 'center';
    bigTail.style.backgroundColor = 'transparent';
    bigTail.style.boxShadow = 'none';
}

// Update big tail position
function updateBigTailPosition() {
    if (bigTail && snake.length > 0 && typeof gsap !== 'undefined') {
        // Calculate position relative to canvas (accounting for canvas scaling and border)
        const canvasRect = canvas.getBoundingClientRect();
        const wrapperRect = canvas.parentElement.getBoundingClientRect();
        const scaleX = canvasRect.width / canvas.width;
        const scaleY = canvasRect.height / canvas.height;
        
        // Account for canvas border (5px on all sides)
        const borderWidth = 5;
        const canvasContentWidth = canvasRect.width - (borderWidth * 2);
        const canvasContentHeight = canvasRect.height - (borderWidth * 2);
        const actualScaleX = canvasContentWidth / canvas.width;
        const actualScaleY = canvasContentHeight / canvas.height;
        
        // Get current position (second-to-last segment)
        const secondToLastIndex = snake.length - 2;
        if (secondToLastIndex < 0) return; // Need at least 2 segments
        
        const currentSegment = snake[secondToLastIndex];
        // Calculate position in canvas coordinates first, then convert to screen coordinates
        const canvasX = currentSegment.x * cellSize + cellSize / 2;
        const canvasY = currentSegment.y * cellSize + cellSize / 2;
        // Convert to screen coordinates relative to wrapper (accounting for border)
        const tailX = canvasX * actualScaleX + borderWidth + (canvasRect.left - wrapperRect.left);
        const tailY = canvasY * actualScaleY + borderWidth + (canvasRect.top - wrapperRect.top);
        
        // Update big tail color to match segment color
        const tailColor = currentSegment.color || 'red';
        
        // Update the image
        updateBigTailImage(tailColor);
        
        // Get the size using the same function (ensures consistency)
        const bigTailSize = getBigTailSize();
        bigTail.style.width = bigTailSize + 'px';
        bigTail.style.height = bigTailSize + 'px';
        
        // Set the transform for positioning
        bigTail.style.transform = `translate(calc(${tailX}px - 50%), calc(${tailY}px - 50%))`;
        
        // Use GSAP to animate position only
        gsap.to(bigTail, {
            x: tailX,
            y: tailY,
            duration: 0.15, // Match game loop speed
            ease: "power2.out",
            onUpdate: function() {
                // Recalculate position based on current second-to-last segment
                const currentSecondToLastIndex = snake.length - 2;
                if (currentSecondToLastIndex < 0) return;
                const currentSegmentPos = snake[currentSecondToLastIndex];
                const currentCanvasX = currentSegmentPos.x * cellSize + cellSize / 2;
                const currentCanvasY = currentSegmentPos.y * cellSize + cellSize / 2;
                const currentX = currentCanvasX * actualScaleX + borderWidth + (canvasRect.left - wrapperRect.left);
                const currentY = currentCanvasY * actualScaleY + borderWidth + (canvasRect.top - wrapperRect.top);
                // Get current position from GSAP
                const x = gsap.getProperty(bigTail, "x") || currentX;
                const y = gsap.getProperty(bigTail, "y") || currentY;
                // Apply transform for positioning
                bigTail.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`;
            }
        });
    }
}

// Draw functions
function drawCell(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * cellSize, y * cellSize, cellSize - 2, cellSize - 2);
}

// Get direction from one segment to the next
function getSegmentDirection(segment, nextSegment) {
    if (!nextSegment) return null;
    return {
        x: nextSegment.x - segment.x,
        y: nextSegment.y - segment.y
    };
}

// Calculate rotation angle for side image based on direction
function getSideRotation(dir) {
    if (dir.x === 1) return 0;      // Right
    if (dir.x === -1) return 180;   // Left
    if (dir.y === -1) return 270;   // Up
    if (dir.y === 1) return 90;     // Down
    return 0;
}

// Draw blurred glow version of image (using pre-blurred cached version)
function drawImageGlow(image, x, y, width, height, colorName) {
    // Early return if glow is disabled for performance
    if (!enableGlow) {
        return;
    }
    
    // Determine image name for cache lookup
    let imageName = 'unknown';
    if (image === sideImage) imageName = 'side';
    else if (image === angleImage) imageName = 'angle';
    else if (image === endImage) imageName = 'end';
    else if (image === headImage) imageName = 'head';
    
    // Get cached pre-blurred glow canvas
    const cacheKey = `glow_${imageName}_${colorName}`;
    let glowCanvas = glowImageCache[cacheKey];
    
    // If not cached, generate it (shouldn't happen if pregenerateTintedImages worked)
    if (!glowCanvas) {
        glowCanvas = generateGlowImage(image, imageName, colorName, width);
    }
    
    // Draw pre-blurred glow (no filter needed, already blurred)
    // Adjust position to account for blur padding
    const blurPadding = 20;
    const previousAlpha = ctx.globalAlpha;
    // First layer (stronger) with pulsating brightness
    ctx.globalAlpha = 0.9 * pulsateFactor;
    ctx.drawImage(glowCanvas, x - blurPadding, y - blurPadding);
    // Second layer for extra intensity
    ctx.globalAlpha = 0.6 * pulsateFactor;
    ctx.drawImage(glowCanvas, x - blurPadding, y - blurPadding);
    // Restore previous alpha
    ctx.globalAlpha = previousAlpha;
}

// Draw image with color tint at high saturation (using cached version)
function drawImageWithColorTint(image, x, y, width, height, colorName) {
    // Determine image name for cache lookup
    let imageName = 'unknown';
    if (image === sideImage) imageName = 'side';
    else if (image === angleImage) imageName = 'angle';
    else if (image === endImage) imageName = 'end';
    else if (image === headImage) imageName = 'head';
    
    // Get cached tinted image
    const cacheKey = `${imageName}_${colorName}`;
    let tintedCanvas = tintedImageCache[cacheKey];
    
    // If not cached, generate it (shouldn't happen if pregenerateTintedImages worked)
    if (!tintedCanvas) {
        tintedCanvas = generateTintedImage(image, imageName, colorName, width);
    }
    
    // Draw the cached tinted image (base)
    ctx.drawImage(tintedCanvas, x, y);

    // Add a second additive pass based on pulsateFactor to brighten (never dim)
    const extra = Math.max(0, pulsateFactor - 1); // 0..0.4
    if (extra > 0.001) {
        const previousAlpha = ctx.globalAlpha;
        const previousComposite = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, extra); // cap to avoid overblown
        ctx.drawImage(tintedCanvas, x, y);
        ctx.globalAlpha = previousAlpha;
        ctx.globalCompositeOperation = previousComposite;
    }
}

// Draw gradient overlay for color transitions (using cached version)
function drawGradientOverlay(image, x, y, width, height, colorName) {
    // Get cached gradient image
    const cacheKey = `gradient_${colorName}`;
    let gradientCanvas = gradientImageCache[cacheKey];
    
    // If not cached, generate it (shouldn't happen if pregenerateTintedImages worked)
    if (!gradientCanvas) {
        gradientCanvas = generateGradientImage(image, colorName, width);
    }
    
    // Draw the cached gradient image
    ctx.drawImage(gradientCanvas, x, y);
}

// Calculate per-segment ripple scale based on time and index
function getSegmentRippleScale(index) {
    const t = performance.now();
    const phase = t * rippleScaleFrequency - index * ripplePhaseOffset;
    // Map sin(-1..1) -> 0..1, then to 1..1+amplitude
    const wave = (Math.sin(phase) + 1) / 2;
    return 1 + rippleScaleAmplitude * wave;
}

// Calculate rotation angle for angle image based on turn
// angle.png goes from top to right (0° base orientation)
// prevDir: direction coming INTO this segment  
// currDir: direction going OUT OF this segment
function getAngleRotation(prevDir, currDir) {
    // Base image shows: Top (y=-1) → Right (x=1)
    // For each turn, we rotate so the "from" direction aligns with top, then check if we need to flip
    
    // Clockwise turns (no flip needed):
    // Up → Right: matches base exactly
    if (prevDir.y === -1 && currDir.x === 1) return 0;
    // Right → Down: rotate 90° so right→top becomes right→down
    if (prevDir.x === 1 && currDir.y === 1) return 90;
    // Down → Left: rotate 180° so down→top becomes down→left  
    if (prevDir.y === 1 && currDir.x === -1) return 180;
    // Left → Up: rotate 270° so left→top becomes left→up
    if (prevDir.x === -1 && currDir.y === -1) return 270;
    
    // Counter-clockwise turns (need horizontal flip):
    // Up → Left: base shows Up→Right, flip to get Up→Left
    if (prevDir.y === -1 && currDir.x === -1) return { angle: 0, flip: 'horizontal' };
    // Right → Up: rotate 90° gives Right→Down, but we want Right→Up, so flip
    // Actually: rotate -90° (270°) gives Right→Up direction, then flip
    if (prevDir.x === 1 && currDir.y === -1) return { angle: 270, flip: 'horizontal' };
    // Down → Right: rotate 180° gives Down→Left, but we want Down→Right, so flip  
    // Actually: rotate -180° (180°) gives Down→Left, flip to get Down→Right
    if (prevDir.y === 1 && currDir.x === 1) return { angle: 180, flip: 'horizontal' };
    // Left → Down: rotate 270° gives Left→Up, but we want Left→Down, so flip
    // Actually: rotate -270° (90°) gives Left→Down direction
    if (prevDir.x === -1 && currDir.y === 1) return { angle: 90, flip: 'horizontal' };
    
    return 0;
}

function drawSnake() {
    // Reset all drawing state before drawing snake
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.globalCompositeOperation = 'source-over';
    
    if (!imagesLoaded || imagesLoaded < 5) {
        // Fallback to colored rectangles if images not loaded
        snake.forEach((segment, index) => {
            if (index === 0) {
                drawCell(segment.x, segment.y, '#4ecdc4');
            } else {
                drawCell(segment.x, segment.y, '#45b7b8');
            }
        });
        return;
    }
    
    snake.forEach((segment, index) => {
        const x = segment.x * cellSize + cellSize / 2;
        const y = segment.y * cellSize + cellSize / 2;
        
        ctx.save();
        ctx.translate(x, y);
        
        // Apply ripple scale effect (time-based wave with per-segment phase offset)
        const segmentScale = getSegmentRippleScale(index);
        ctx.scale(segmentScale, segmentScale);
        
        // Get the segment's color (default to 'red' if not set)
        const segmentColor = segment.color || 'red';
        
        // Check if there's a color transition from the previous segment (toward head)
        // But don't show transition on tail/angle if there's a pending color change (wait for first side piece)
        const hasColorTransition = index > 0 && snake[index - 1].color !== segmentColor && !pendingColorChange;
        const transitionColor = hasColorTransition ? (snake[index - 1].color || 'red') : null;
        
        if (index === 0) {
            // Head - use head image
            const nextSeg = snake[1];
            const dir = getSegmentDirection(segment, nextSeg);
            if (dir && imagesLoaded >= 5) {
                const rotation = getSideRotation(dir);
                ctx.rotate((rotation * Math.PI) / 180);
                // Draw glow first, then normal image
                drawImageGlow(headImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, segmentColor);
                drawImageWithColorTint(headImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, segmentColor);
            } else {
                // Fallback if image not loaded
                drawCell(segment.x, segment.y, '#4ecdc4');
            }
        } else if (index === snake.length - 1) {
            // Tail - use end image
            const prevSeg = snake[index - 1];
            const dir = getSegmentDirection(prevSeg, segment);
            if (dir && imagesLoaded >= 5) {
                const rotation = getSideRotation(dir);
                ctx.rotate((rotation * Math.PI) / 180);
                // Draw glow first, then normal image
                drawImageGlow(endImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, segmentColor);
                drawImageWithColorTint(endImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, segmentColor);
                
                // Add gradient overlay if color transition
                if (hasColorTransition && transitionColor && imagesLoaded >= 5) {
                    // We're already in the transformed coordinate system from drawing the end image
                    // Just flip horizontally so gradient flows from tail (transparent) to head (opaque)
                    ctx.scale(-1, 1);
                    drawGradientOverlay(halfSideImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, transitionColor);
                }
            } else {
                // Fallback if image not loaded
                drawCell(segment.x, segment.y, '#45b7b8');
            }
        } else {
            // Body segment - check if it's a turn
            const prevSeg = snake[index - 1];
            const nextSeg = snake[index + 1];
            const prevDir = getSegmentDirection(prevSeg, segment);
            const nextDir = getSegmentDirection(segment, nextSeg);
            
            if (prevDir && nextDir && (prevDir.x !== nextDir.x || prevDir.y !== nextDir.y)) {
                // It's a turn - use angle image
                const rotationData = getAngleRotation(prevDir, nextDir);
                if (typeof rotationData === 'object' && rotationData.flip) {
                    // Apply transformations in reverse order (canvas applies them backwards)
                    // We want: rotate, then flip horizontally
                    // So we do: flip first, then rotate (canvas reverses it)
                    if (rotationData.flip === 'horizontal') {
                        ctx.scale(-1, 1);
                    }
                    ctx.rotate((rotationData.angle * Math.PI) / 180);
                } else {
                    // Clockwise turn - just rotate
                    const rotation = typeof rotationData === 'number' ? rotationData : 0;
                    ctx.rotate((rotation * Math.PI) / 180);
                }
                // Draw glow first, then normal image
                drawImageGlow(angleImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, segmentColor);
                drawImageWithColorTint(angleImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, segmentColor);
                
                // Add gradient overlay if color transition (for straight segments in the turn)
                if (hasColorTransition && transitionColor && imagesLoaded >= 5) {
                    // We're already in the transformed coordinate system from drawing the angle image
                    // Just flip horizontally so gradient flows from tail (transparent) to head (opaque)
                    ctx.scale(-1, 1);
                    drawGradientOverlay(halfSideImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, transitionColor);
                }
            } else {
                // Straight segment - use side image
                if (prevDir) {
                    const rotation = getSideRotation(prevDir);
                    ctx.rotate((rotation * Math.PI) / 180);
                }
                
                const currentSegmentColor = segment.color || 'red';
                // Draw glow first, then normal image
                drawImageGlow(sideImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, currentSegmentColor);
                drawImageWithColorTint(sideImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, currentSegmentColor);
                
                // Add gradient overlay if this segment is marked for gradient or if there's an existing color transition
                if (segment.needsGradient && segment.gradientColor && imagesLoaded >= 5) {
                    // Show gradient from old color (this segment) to new color (head)
                    ctx.scale(-1, 1);
                    drawGradientOverlay(halfSideImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, segment.gradientColor);
                } else {
                    // Check for existing color transition (but not if there's a pending change)
                    const hasTransition = index > 0 && snake[index - 1].color !== currentSegmentColor && !pendingColorChange;
                    const transitionCol = hasTransition ? (snake[index - 1].color || 'red') : null;
                    if (hasTransition && transitionCol && imagesLoaded >= 5) {
                        ctx.scale(-1, 1);
                        drawGradientOverlay(halfSideImage, -cellSize / 2, -cellSize / 2, cellSize, cellSize, transitionCol);
                    }
                }
            }
        }
        
        ctx.restore();
    });
}

function drawFood() {
    const img = fruitImages[food.color];
    const baseSize = cellSize;
    const spriteScale = typeof fruitVisual.scale === 'number' ? fruitVisual.scale : 1.3; // animate from 0 → 1.3
    const drawSize = baseSize * spriteScale;
    const centerX = food.x * baseSize + baseSize / 2;
    const centerY = food.y * baseSize + baseSize / 2;
    const drawX = centerX - drawSize / 2;
    const drawY = centerY - drawSize / 2;

    ctx.save();

    // --- Background ring behind the fruit ---
    const ringRadiusBase = 30; // 60px across (2x bigger)
    const t = performance.now();
    const wave = (Math.sin(t * 0.008) + 1) / 2; // same pace as fruit brightness
    const pulseScale = 0.85 + 0.3 * wave;       // slight scale breathing
    const ringRadius = ringRadiusBase * (fruitRing.scale || 1) * pulseScale;
    const ringAlpha = (fruitRing.alpha || 0) * (0.5 + 0.5 * wave); // opacity pulsates with same wave

    if (ringAlpha > 0.01 && ringRadius > 0.5) {
        const prevAlpha = ctx.globalAlpha;
        const prevComp = ctx.globalCompositeOperation;
        const prevLineWidth = ctx.lineWidth;
        const fruitColor = foodColorValues[food.color] || '#ffffff';
        const rgb = hexToRgb(fruitColor) || { r: 255, g: 255, b: 255 };
        
        // Outer glow ring (larger, more transparent)
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = ringAlpha * 0.3;
        const glowGradient = ctx.createRadialGradient(
            centerX, centerY, ringRadius * 0.7,
            centerX, centerY, ringRadius * 1.3
        );
        glowGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`);
        glowGradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius * 1.3, 0, Math.PI * 2);
        ctx.fillStyle = glowGradient;
        ctx.fill();
        
        // Main radial gradient circle (bright center fading to edges)
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = ringAlpha;
        const mainGradient = ctx.createRadialGradient(
            centerX, centerY, ringRadius * 0.3,
            centerX, centerY, ringRadius
        );
        mainGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`);
        mainGradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`);
        mainGradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx.fillStyle = mainGradient;
        ctx.fill();
        
        // Bright inner core
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = ringAlpha * 0.8;
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, 0.5)`;
        ctx.fill();
        
        // Outer ring outline for definition
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = ringAlpha * 0.6;
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.globalAlpha = prevAlpha;
        ctx.globalCompositeOperation = prevComp;
        ctx.lineWidth = prevLineWidth;
    }

    // --- Fruit sprite & brightness flash (pixel-art styling) ---
    if (img && img.complete && img.naturalWidth > 0) {
        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, drawX, drawY, drawSize, drawSize);

        const flashAlpha = 0.3 + 0.7 * wave;
        const prevAlpha = ctx.globalAlpha;
        const prevComp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flashAlpha;
        ctx.drawImage(img, drawX, drawY, drawSize, drawSize);
        ctx.globalAlpha = prevAlpha;
        ctx.globalCompositeOperation = prevComp;
        ctx.imageSmoothingEnabled = prevSmoothing;
    } else {
        const color = foodColorValues[food.color] || '#ff6b6b';
        const flashAlpha = 0.3 + 0.7 * wave;

        const prevAlpha = ctx.globalAlpha;
        const prevComp = ctx.globalCompositeOperation;

        // Base circle
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, drawSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Bright overlay
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flashAlpha;
        ctx.beginPath();
        ctx.arc(centerX, centerY, drawSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.globalAlpha = prevAlpha;
        ctx.globalCompositeOperation = prevComp;
    }

    ctx.restore();
}

// Create grid on offscreen canvas (only once)
function createGridCanvas() {
    if (gridCanvas && gridCanvas.width === canvas.width && gridCanvas.height === canvas.height) {
        return; // Already created and size matches
    }
    
    gridCanvas = document.createElement('canvas');
    gridCanvas.width = canvas.width;
    gridCanvas.height = canvas.height;
    const gridCtx = gridCanvas.getContext('2d');
    
    gridCtx.strokeStyle = '#251049';
    gridCtx.lineWidth = 2;
    for (let i = 0; i <= gridWidth; i++) {
        gridCtx.beginPath();
        gridCtx.moveTo(i * cellSize, 0);
        gridCtx.lineTo(i * cellSize, canvas.height);
        gridCtx.stroke();
    }
    for (let i = 0; i <= gridHeight; i++) {
        gridCtx.beginPath();
        gridCtx.moveTo(0, i * cellSize);
        gridCtx.lineTo(canvas.width, i * cellSize);
        gridCtx.stroke();
    }
}

function drawGrid() {
    if (!gridCanvas || gridCanvas.width !== canvas.width || gridCanvas.height !== canvas.height) {
        createGridCanvas();
    }
    
    ctx.drawImage(gridCanvas, 0, 0);
}

function draw() {
    // Update FPS counter
    frameCount++;
    fpsUpdateInterval++;
    const currentTime = performance.now();
    if (currentTime >= lastTime + 1000) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        frameCount = 0;
        lastTime = currentTime;
        if (fpsCounter) {
            fpsCounter.textContent = `FPS: ${fps}`;
        }
    }

    // Update pulsating brightness factor for the worm (regular → bright, slower pulse)
    // Uses time so it stays smooth even if FPS changes.
    const pulseTime = performance.now();
    // wave goes from 0 → 1 → 0 (slower cycle)
    const wave = (Math.sin(pulseTime * 0.0035) + 1) / 2;
    // Brightness factor ranges from 1x (normal) up to 1.4x
    pulsateFactor = 1 + 0.4 * wave;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Reset all drawing state
    ctx.strokeStyle = '#3d2863';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'transparent';
    ctx.globalCompositeOperation = 'source-over';
    
    // Draw grid
    drawGrid();
    
    // Reset state after grid
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.globalCompositeOperation = 'source-over';
    
    // Draw food
    drawFood();
    
    // Update big head scale continuously (matches snake body ripple effect)
    if (bigHead && snake.length > 0) {
        const x = gsap.getProperty(bigHead, "x");
        const y = gsap.getProperty(bigHead, "y");
        if (x !== undefined && y !== undefined) {
            const headScale = getSegmentRippleScale(0);
            bigHead.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(${headScale})`;
            // Update glow element to match
            if (bigHeadGlow) {
                bigHeadGlow.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(${headScale})`;
            }
            
            // Rotate eye container to match head direction
            if (snake.length > 1 && eyeContainer) {
                const nextSeg = snake[1];
                const dir = getSegmentDirection(snake[0], nextSeg);
                if (dir) {
                    const headRotation = getSideRotation(dir);
                    eyeContainer.style.transform = `rotate(${headRotation - 90}deg)`;
                }
            }
        }
    }

    // Draw fruit hit ring explosion (if active)
    if (fruitHitRing.active && fruitHitRing.alpha > 0.01 && fruitHitRing.scale > 0.01) {
        const prevAlpha = ctx.globalAlpha;
        const prevComp = ctx.globalCompositeOperation;
        const prevLineWidth = ctx.lineWidth;
        
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, fruitHitRing.alpha);
        
        // Big explosion radius target ~300px at max scale
        const baseRadius = 100; // 100 * scale(≈3) ≈ 300px
        const radius = baseRadius * fruitHitRing.scale;
        
        // Build a radial gradient based on fruit color
        const rgb = hexToRgb(fruitHitRing.color) || { r: 255, g: 255, b: 255 };
        const centerColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
        const midColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.7)`;
        const edgeColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`;
        
        const gradient = ctx.createRadialGradient(
            fruitHitRing.x, fruitHitRing.y, 0,
            fruitHitRing.x, fruitHitRing.y, radius
        );
        gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.25, centerColor);
        gradient.addColorStop(0.7, midColor);
        gradient.addColorStop(1.0, edgeColor);
        
        // Main glowing disk
        ctx.beginPath();
        ctx.arc(fruitHitRing.x, fruitHitRing.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Thin bright outer ring for extra punch
        ctx.lineWidth = 4;
        ctx.strokeStyle = centerColor;
        ctx.beginPath();
        ctx.arc(fruitHitRing.x, fruitHitRing.y, radius * 1.05, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.lineWidth = prevLineWidth;
        ctx.globalAlpha = prevAlpha;
        ctx.globalCompositeOperation = prevComp;
    }
    
    // Draw snake
    drawSnake();
    
    // Floating color-bonus text: "BONUS" then "+20" (or whatever) at fruit position
    if (colorBonusFloat) {
        const age = performance.now() - colorBonusFloat.startTime;
        if (age > 1000) {
            colorBonusFloat = null;
        } else {
            const fadeDur = 200;
            const t = Math.min(1, age / fadeDur);
            const opacity = t;
            const offsetY = 15 * t;
            const fontSize = 16;   // 25% smaller (was 24)
            const lineHeight = 22;
            const cx = colorBonusFloat.x;
            const cy = colorBonusFloat.y - offsetY;
            ctx.save();
            ctx.font = `${fontSize}px "Press Start 2P"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = opacity;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            const y1 = cy - lineHeight / 2;
            const y2 = cy + lineHeight / 2;
            ctx.strokeText('BONUS', cx, y1);
            ctx.strokeText(`+${colorBonusFloat.bonus}`, cx, y2);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('BONUS', cx, y1);
            ctx.fillText(`+${colorBonusFloat.bonus}`, cx, y2);
            ctx.restore();
        }
    }
}

// Game logic
function update() {
    if (!gameRunning || gamePaused) return;
    
    // Update direction from queued direction (allows rapid input queuing)
    if (nextDirection.x !== direction.x || nextDirection.y !== direction.y) {
        const canChange = (nextDirection.x === 0 && direction.x !== 0) || 
                         (nextDirection.y === 0 && direction.y !== 0) ||
                         (nextDirection.x !== 0 && direction.x === 0) ||
                         (nextDirection.y !== 0 && direction.y === 0);
        if (canChange && !checkImmediateCollision(nextDirection)) {
            direction = { ...nextDirection };
        }
    }
    
    // Move snake head
    // New head gets the color of the current head (which will change if food is eaten)
    const currentHeadColor = snake[0].color || 'red';
    const head = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y,
        color: currentHeadColor
    };
    
    // Check wall collision
    if (head.x < 0 || head.x >= gridWidth || head.y < 0 || head.y >= gridHeight) {
        gameOver();
        return;
    }
    
    // Check food collision before adding head
    const ateFood = head.x === food.x && head.y === food.y;
    
    if (ateFood) {
        playSound('src/sounds/score.mp3');
        const baseSize = cellSize;
        const centerX = food.x * baseSize + baseSize / 2;
        const centerY = food.y * baseSize + baseSize / 2;
        // Trigger a hit ring explosion at the current fruit position/color
        if (typeof gsap !== 'undefined') {
            if (fruitHitTween) {
                fruitHitTween.kill();
            }
            fruitHitRing.x = centerX;
            fruitHitRing.y = centerY;
            fruitHitRing.scale = fruitRing.scale || 1;
            fruitHitRing.alpha = fruitRing.alpha || 0.6;
            fruitHitRing.color = foodColorValues[food.color] || '#ffffff';
            fruitHitRing.active = true;
            
            // Dramatic expansion & fade over 0.5s
            fruitHitTween = gsap.to(fruitHitRing, {
                scale: fruitHitRing.scale * 3,
                alpha: 0,
                duration: 0.5,
                ease: "power2.out",
                onComplete: () => {
                    fruitHitRing.active = false;
                }
            });
        }

        // Flag for color change instead of changing head immediately
        pendingColorChange = true;
        newColor = food.color;
        score += 100;
        // Color bonus: distinct colors in worm (including new fruit color) 3→+20, 4→+50, 5→+75, 6→+100
        const colors = new Set(snake.map(s => s.color || 'red'));
        colors.add(food.color);
        const n = colors.size;
        const bonusMap = { 3: 20, 4: 50, 5: 75, 6: 100 };
        const bonus = bonusMap[n];
        if (bonus) {
            score += bonus;
            colorBonusFloat = {
                bonus,
                x: centerX,
                y: centerY,
                startTime: performance.now()
            };
        }
        scoreElement.textContent = score;
        generateFood();
    }
    
    snake.unshift(head);
    
    // Update big head position with GSAP tween (use new head position)
    if (bigHead && typeof gsap !== 'undefined') {
        updateBigHeadPosition();
    }
    
    // Update big tail position
    if (bigTail && typeof gsap !== 'undefined') {
        updateBigTailPosition();
    }
    
    // Handle growth: don't pop tail if growth is pending
    if (growthPending > 0) {
        growthPending--;
    } else if (!ateFood) {
        snake.pop();
    }
    
    // If food was eaten, grow by 3 segments
    if (ateFood) {
        growthPending = 2; // We already added 1 segment (the head), so we need 2 more
    }
    
    // Check if we need to apply pending color change
    // This happens when the first side piece (not corner) is created
    if (pendingColorChange && newColor && snake.length >= 3) {
        // Check if segment at index 1 (old head, now first body segment) is a side piece
        // A side piece is straight - direction from 0->1 matches direction from 1->2
        const seg0 = snake[0];
        const seg1 = snake[1];
        const seg2 = snake[2];
        
        const dir0to1 = getSegmentDirection(seg0, seg1);
        const dir1to2 = getSegmentDirection(seg1, seg2);
        
        // It's a side piece if directions are the same (straight, not a corner)
        if (dir0to1 && dir1to2 && dir0to1.x === dir1to2.x && dir0to1.y === dir1to2.y) {
            // Apply the color change: update head to new color
            snake[0].color = newColor;
            // Mark this side piece to show gradient overlay
            seg1.needsGradient = true;
            seg1.gradientColor = newColor;
            // Clear the flag
            pendingColorChange = false;
            newColor = null;
        }
    }
    
    // Check self collision (after adding head and potentially removing tail)
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            gameOver();
            return;
        }
    }
}

function gameOver() {
    gameRunning = false;
    clearInterval(gameLoop);
    if (startMusicHowl) {
        startMusicHowl.stop();
        startMusicHowl = null;
    }
    playSound('src/sounds/death.mp3');
    
    // Kill GSAP animations and set big head to final position
    if (bigHead && typeof gsap !== 'undefined' && snake.length > 0) {
        gsap.killTweensOf(bigHead);
        
        // Calculate final position
        const canvasRect = canvas.getBoundingClientRect();
        const wrapperRect = canvas.parentElement.getBoundingClientRect();
        const borderWidth = 5;
        const canvasContentWidth = canvasRect.width - (borderWidth * 2);
        const canvasContentHeight = canvasRect.height - (borderWidth * 2);
        const actualScaleX = canvasContentWidth / canvas.width;
        const actualScaleY = canvasContentHeight / canvas.height;
        
        const currentHead = snake[0];
        const canvasX = currentHead.x * cellSize + cellSize / 2;
        const canvasY = currentHead.y * cellSize + cellSize / 2;
        const headX = canvasX * actualScaleX + borderWidth + (canvasRect.left - wrapperRect.left) - 2;
        const headY = canvasY * actualScaleY + borderWidth + (canvasRect.top - wrapperRect.top) - 2;
        
        // Set position directly without animation (no tween)
        const headScale = getSegmentRippleScale(0);
        bigHead.style.transform = `translate(calc(${headX}px - 50%), calc(${headY}px - 50%)) scale(${headScale})`;
        if (bigHeadGlow) {
            bigHeadGlow.style.transform = `translate(calc(${headX}px - 50%), calc(${headY}px - 50%)) scale(${headScale})`;
        }
    }
    
    // Kill GSAP animations for big tail too
    if (bigTail && typeof gsap !== 'undefined') {
        gsap.killTweensOf(bigTail);
    }
    
    draw();

    // Flash overlay: pop to 0.5 then fade to 0
    const flashEl = document.getElementById('flashOverlay');
    if (flashEl && typeof gsap !== 'undefined') {
        gsap.set(flashEl, { opacity: 0.5 });
        gsap.to(flashEl, { opacity: 0, duration: 1, ease: 'power1.out' });
    }

    // Game wrapper (canvas container): grow then shrink + dizzy rotation
    const gameWrapper = canvas ? canvas.parentElement : null;
    if (gameWrapper && typeof gsap !== 'undefined') {
        gsap.fromTo(gameWrapper, { scale: 1 }, {
            keyframes: [
                { scale: 1.12, duration: 0.28, ease: 'power2.out' },
                { scale: 1, duration: 0.65, ease: 'power2.in' }
            ],
            overwrite: true
        });
        gsap.fromTo(gameWrapper, { rotation: 0 }, {
            keyframes: [
                { rotation: 6, duration: 0.18 },
                { rotation: -6, duration: 0.28 },
                { rotation: 5, duration: 0.22 },
                { rotation: -5, duration: 0.26 },
                { rotation: 3, duration: 0.18 },
                { rotation: -2, duration: 0.14 },
                { rotation: 0, duration: 0.18 }
            ],
            ease: 'power2.inOut',
            overwrite: true
        });
    }

    // Flash rainbow overlay: start fully opaque, then fade to 0 in 1 second
    if (rainbowOverlay && typeof gsap !== 'undefined') {
        gsap.set(rainbowOverlay, { opacity: 1 });
        gsap.to(rainbowOverlay, { opacity: 0, duration: 1, ease: 'power1.out' });
    }

    startFruitRain();
    if (gameOverTimeoutId) {
        clearTimeout(gameOverTimeoutId);
    }
    const finalScore = score;
    gameOverTimeoutId = setTimeout(() => {
        gameOverElement.classList.remove('hidden');
        if (isNewHighScore(finalScore)) {
            pendingHighScore = finalScore;
            const rank = getRankForScore(finalScore);
            if (gameOverButtons) gameOverButtons.classList.add('hidden');
            const hsOverlayEl = document.getElementById('highScoreOverlay');
            if (hsOverlayEl) {
                populateHighScoreList();
                hsOverlayEl.classList.add('visible');
            }
            if (highScoreEntry) highScoreEntry.classList.remove('hidden');
            playSound('src/sounds/highscore.mp3');
            if (highScoreEntry && typeof gsap !== 'undefined') {
                gsap.fromTo(highScoreEntry, { scale: 1, xPercent: -50, yPercent: -50 }, {
                    keyframes: [
                        { scale: 1.2, xPercent: -50, yPercent: -50, duration: 0.5, ease: 'power2.out' },
                        { scale: 1, xPercent: -50, yPercent: -50, duration: 0.8, ease: 'power2.inOut' }
                    ]
                });
            }
            const flashElHs = document.getElementById('flashOverlay');
            if (flashElHs && typeof gsap !== 'undefined') {
                gsap.set(flashElHs, { opacity: 0.5 });
                gsap.to(flashElHs, { opacity: 0, duration: 2, ease: 'power1.out' });
            }
            if (hsEntryScore) hsEntryScore.textContent = '#' + String(rank);
            if (hsEntryInput) {
                hsEntryInput.value = '';
                requestAnimationFrame(() => {
                    hsEntryInput.focus();
                });
            }
        } else {
            if (highScoreEntry) highScoreEntry.classList.add('hidden');
            if (gameOverButtons) gameOverButtons.classList.remove('hidden');
        }
    }, 2000);
}

function startFruitRain(durationMs = 2000) {
    const outer = document.querySelector('.game-outer-container');
    if (!outer) return;

    // Clear any previous rain
    if (fruitRainIntervalId) {
        clearInterval(fruitRainIntervalId);
        fruitRainIntervalId = null;
    }
    if (fruitRainTimeoutId) {
        clearTimeout(fruitRainTimeoutId);
        fruitRainTimeoutId = null;
    }

    const fruitKeys = Object.keys(fruitImages);

    function spawnFruit() {
        if (!fruitKeys.length) return;
        const el = document.createElement('div');
        el.className = 'fruit-rain-item';
        const key = fruitKeys[Math.floor(Math.random() * fruitKeys.length)];
        const img = fruitImages[key];
        if (img && img.src) {
            el.style.backgroundImage = `url('${img.src}')`;
        }
        const left = 5 + Math.random() * 90; // avoid extreme edges
        const scale = 0.7 + Math.random() * 0.8;
        el.style.left = `${left}%`;
        
        // Add rotation animation with different intervals (0.3s to 1.2s)
        const rotationDuration = 0.3 + Math.random() * 0.9;
        el.style.setProperty('--fruit-scale', scale);
        // Set initial transform with scale, animation will add rotation
        el.style.transform = `translateX(-50%) scale(${scale}) rotate(0deg)`;
        el.style.animation = `fruitFall 0.55s linear forwards, fruitSpin ${rotationDuration}s linear infinite`;
        
        outer.appendChild(el);
        el.addEventListener('animationend', (e) => {
            if (e.animationName === 'fruitFall') {
                el.remove();
            }
        });
    }

    // Burst of fruit over the duration
    spawnFruit();
    // 3x as many fruit over the same time → spawn more frequently
    fruitRainIntervalId = setInterval(spawnFruit, 40);
    fruitRainTimeoutId = setTimeout(() => {
        if (fruitRainIntervalId) {
            clearInterval(fruitRainIntervalId);
            fruitRainIntervalId = null;
        }
    }, durationMs);
}

function resetGame() {
    if (startMusicHowl) {
        startMusicHowl.stop();
        startMusicHowl = null;
    }
    startMusicHowl = playSound('src/sounds/startMusic.mp3', { loop: false });
    if (canvas && typeof gsap !== 'undefined') {
        gsap.killTweensOf(canvas, 'scale,rotation');
        gsap.set(canvas, { scale: 1, rotation: 0 });
    }
    const gameWrapper = canvas ? canvas.parentElement : null;
    if (gameWrapper && typeof gsap !== 'undefined') {
        gsap.killTweensOf(gameWrapper);
        gsap.set(gameWrapper, { scale: 1, rotation: 0 });
    }
    colorBonusFloat = null;
    // Clear any pending game over FX
    if (fruitRainIntervalId) {
        clearInterval(fruitRainIntervalId);
        fruitRainIntervalId = null;
    }
    if (fruitRainTimeoutId) {
        clearTimeout(fruitRainTimeoutId);
        fruitRainTimeoutId = null;
    }
    if (gameOverTimeoutId) {
        clearTimeout(gameOverTimeoutId);
        gameOverTimeoutId = null;
    }
    if (startDelayTimeoutId) {
        clearTimeout(startDelayTimeoutId);
        startDelayTimeoutId = null;
    }

    const centerX = Math.floor(gridWidth / 2);
    const centerY = Math.floor(gridHeight / 2);
    snake = [
        { x: centerX, y: centerY - 4, color: 'red' },
        { x: centerX, y: centerY - 5, color: 'red' },
        { x: centerX, y: centerY - 6, color: 'red' },
        { x: centerX, y: centerY - 7, color: 'red' },
        { x: centerX, y: centerY - 8, color: 'red' }
    ];
    direction = { x: 0, y: 1 }; // Pointing down
    nextDirection = { x: 0, y: 1 }; // Pointing down
    
    // Initialize big head position
    if (bigHead && snake.length > 0 && typeof gsap !== 'undefined') {
        setTimeout(() => {
            // Calculate position relative to canvas (accounting for canvas scaling and border)
            const canvasRect = canvas.getBoundingClientRect();
            const wrapperRect = canvas.parentElement.getBoundingClientRect();
            const borderWidth = 5;
            const canvasContentWidth = canvasRect.width - (borderWidth * 2);
            const canvasContentHeight = canvasRect.height - (borderWidth * 2);
            const actualScaleX = canvasContentWidth / canvas.width;
            const actualScaleY = canvasContentHeight / canvas.height;
            
            const canvasX = snake[0].x * cellSize + cellSize / 2;
            const canvasY = snake[0].y * cellSize + cellSize / 2;
            const headX = canvasX * actualScaleX + borderWidth + (canvasRect.left - wrapperRect.left) - 2;
            const headY = canvasY * actualScaleY + borderWidth + (canvasRect.top - wrapperRect.top) - 2;
            const headColor = snake[0].color || 'red';
            
            // Update the tinted image
            updateBigHeadImage(headColor);
            
            // Use the same size function to ensure consistency
            const bigHeadSize = getBigHeadSize();
            bigHead.style.width = bigHeadSize + 'px';
            bigHead.style.height = bigHeadSize + 'px';
            
            // Update glow element to match big head
            if (bigHeadGlow) {
                bigHeadGlow.style.width = bigHeadSize + 'px';
                bigHeadGlow.style.height = bigHeadSize + 'px';
                bigHeadGlow.style.backgroundImage = bigHead.style.backgroundImage;
                bigHeadGlow.style.backgroundSize = '100% 100%';
                bigHeadGlow.style.backgroundPosition = 'center';
            }
            
            // Rotate eye container to match head direction
            let headRotation = 0;
            if (snake.length > 1) {
                const nextSeg = snake[1];
                const dir = getSegmentDirection(snake[0], nextSeg);
                if (dir) {
                    headRotation = getSideRotation(dir);
                }
            }
            if (eyeContainer) {
                eyeContainer.style.transform = `rotate(${headRotation - 90}deg)`;
            }
            
            // Calculate initial scale using the same ripple effect as snake body (head is index 0)
            const headScale = getSegmentRippleScale(0);
            
            gsap.set(bigHead, {
                x: headX,
                y: headY
            });
            
            // Apply transform with scale immediately
            bigHead.style.transform = `translate(calc(${headX}px - 50%), calc(${headY}px - 50%)) scale(${headScale})`;
            if (bigHeadGlow) {
                bigHeadGlow.style.transform = `translate(calc(${headX}px - 50%), calc(${headY}px - 50%)) scale(${headScale})`;
            }
        }, 0);
    }
    
    // Initialize big tail position
    if (bigTail && snake.length > 0 && typeof gsap !== 'undefined') {
        setTimeout(() => {
            updateBigTailPosition();
        }, 0);
    }
    
    // Initialize big tail position
    if (bigTail && snake.length > 0 && typeof gsap !== 'undefined') {
        setTimeout(() => {
            updateBigTailPosition();
        }, 0);
    }
    
    score = 0;
    scoreElement.textContent = score;
    gameOverElement.classList.add('hidden');
    if (gameOverButtons) gameOverButtons.classList.add('hidden');
    if (highScoreEntry) highScoreEntry.classList.add('hidden');
    pendingHighScore = 0;
    pendingColorChange = false; // Reset color change flag
    newColor = null;
    gamePaused = false; // Reset pause state
    growthPending = 0; // Reset growth counter
    
    // Set first food 4 cells below the head (reuse centerX and centerY)
    // Head is at centerY - 4, so food should be at centerY - 4 + 4 = centerY
    // Preserve existing food color if food is already at the correct position (initial game start)
    const existingFoodColor = (food && food.x === centerX && food.y === centerY) ? food.color : null;
    
    food = {
        x: centerX,
        y: centerY,
        color: existingFoodColor || 'red'
    };
    
    // Only pick a new color if we don't have an existing one to preserve
    if (!existingFoodColor) {
        // Reset last food color on new game (only if regenerating)
        lastFoodColor = null;
        // Pick a color different from the last one
        let availableColors = foodColors.filter(color => color !== lastFoodColor);
        if (availableColors.length === 0) {
            availableColors = foodColors;
        }
        food.color = availableColors[Math.floor(Math.random() * availableColors.length)];
        lastFoodColor = food.color;
    }
    animateFruitSpawn();

    // Initialize big head position
    if (bigHead && snake.length > 0 && typeof gsap !== 'undefined') {
        setTimeout(() => {
            // Set initial position without animation
            const canvasRect = canvas.getBoundingClientRect();
            const wrapperRect = canvas.parentElement.getBoundingClientRect();
            const borderWidth = 5;
            const canvasContentWidth = canvasRect.width - (borderWidth * 2);
            const canvasContentHeight = canvasRect.height - (borderWidth * 2);
            const actualScaleX = canvasContentWidth / canvas.width;
            const actualScaleY = canvasContentHeight / canvas.height;
            
            const currentHead = snake[0];
            const canvasX = currentHead.x * cellSize + cellSize / 2;
            const canvasY = currentHead.y * cellSize + cellSize / 2;
            const headX = canvasX * actualScaleX + borderWidth + (canvasRect.left - wrapperRect.left) - 2;
            const headY = canvasY * actualScaleY + borderWidth + (canvasRect.top - wrapperRect.top) - 2;
            const headColor = currentHead.color || 'red';
            
            // Update the tinted image
            updateBigHeadImage(headColor);
            
            // Use the same size function to ensure consistency
            const bigHeadSize = getBigHeadSize();
            bigHead.style.width = bigHeadSize + 'px';
            bigHead.style.height = bigHeadSize + 'px';
            
            // Update glow element to match big head
            if (bigHeadGlow) {
                bigHeadGlow.style.width = bigHeadSize + 'px';
                bigHeadGlow.style.height = bigHeadSize + 'px';
                bigHeadGlow.style.backgroundImage = bigHead.style.backgroundImage;
                bigHeadGlow.style.backgroundSize = '100% 100%';
                bigHeadGlow.style.backgroundPosition = 'center';
            }
            
            gsap.set(bigHead, {
                x: headX,
                y: headY
            });
            
            // Apply transform immediately
            const headScale = getSegmentRippleScale(0);
            bigHead.style.transform = `translate(calc(${headX}px - 50%), calc(${headY}px - 50%)) scale(${headScale})`;
            if (bigHeadGlow) {
                bigHeadGlow.style.transform = `translate(calc(${headX}px - 50%), calc(${headY}px - 50%)) scale(${headScale})`;
            }
        }, 0);
    }
    
    // Initialize big tail position
    if (bigTail && snake.length > 0 && typeof gsap !== 'undefined') {
        setTimeout(() => {
            updateBigTailPosition();
        }, 0);
    }
    
    gameRunning = false;
    if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = null;
    }
    lastUpdateTime = performance.now();
    const intervalMs = getGameUpdateIntervalMs();
    startDelayTimeoutId = setTimeout(() => {
        startDelayTimeoutId = null;
        gameRunning = true;
        gameLoop = setInterval(() => {
            if (!gamePaused) {
                update();
            }
        }, intervalMs);
    }, 2000);
}

function checkImmediateCollision(nextDir) {
    if (!gameRunning || !snake.length) return false;
    const nx = snake[0].x + nextDir.x;
    const ny = snake[0].y + nextDir.y;
    return snake.some((seg, i) => i > 0 && seg.x === nx && seg.y === ny);
}

// Keyboard controls
function handleKeyPress(e) {
    if (document.activeElement === hsEntryInput) return;

    const key = e.key.toLowerCase();
    
    // Pause/unpause with 'p' key
    if (key === 'p') {
        if (gameRunning) {
            gamePaused = !gamePaused;
        }
        return;
    }
    
    // Don't process movement keys when paused
    if (gamePaused) {
        return;
    }
    
    // Prevent default for arrow keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
    }
    
    // Arrow keys or ASDF (A=Left, S=Down, D=Right, F=Right) or WASD
    // Queue direction changes for immediate processing (allows rapid input)
    if (key === 'arrowup' || key === 'w') {
        if (direction.y === 0) {
            nextDirection = { x: 0, y: -1 };
            if (direction.x !== 0 && !checkImmediateCollision(nextDirection)) {
                direction = { x: 0, y: -1 };
            }
        }
    } else if (key === 'arrowdown' || key === 's') {
        if (direction.y === 0) {
            nextDirection = { x: 0, y: 1 };
            if (direction.x !== 0 && !checkImmediateCollision(nextDirection)) {
                direction = { x: 0, y: 1 };
            }
        }
    } else if (key === 'arrowleft' || key === 'a') {
        if (direction.x === 0) {
            nextDirection = { x: -1, y: 0 };
            if (direction.y !== 0 && !checkImmediateCollision(nextDirection)) {
                direction = { x: -1, y: 0 };
            }
        }
    } else if (key === 'arrowright' || key === 'd' || key === 'f') {
        if (direction.x === 0) {
            nextDirection = { x: 1, y: 0 };
            if (direction.y !== 0 && !checkImmediateCollision(nextDirection)) {
                direction = { x: 1, y: 0 };
            }
        }
    }
}

// Touch/swipe controls — turn fires when finger moves 20px from start (during drag), not on release
function handleTouchStart(e) {
    if (e.target.closest('.icons-top-right')) {
        touchStartedOnIcons = true;
        return; // e.g. tapping hs_icon to open high scores
    }
    if (document.getElementById('highScoreOverlay')?.classList.contains('visible')) {
        return; // don't start game or swipe when HS board is up
    }
    if (e.target.closest('.game-over-buttons')) {
        return; // let button taps fire click (don't preventDefault)
    }
    if (e.target.closest('.start-screen')) {
        return; // let play / instructions taps fire click
    }
    if (e.target.closest('.instructions-overlay')) {
        return; // let close button tap work
    }
    if (e.target.closest('.high-score-entry')) {
        return; // let initials input work (keyboard on mobile)
    }
    touchStartedOnIcons = false;
    e.preventDefault();
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchTurnRegistered = false;
}

function handleTouchMove(e) {
    if (touchStartedOnIcons) return;
    if (e.target.closest('.high-score-overlay')) return;
    if (e.target.closest('.game-over-buttons')) return;
    if (e.target.closest('.start-screen')) return;
    if (e.target.closest('.instructions-overlay')) return;
    if (e.target.closest('.high-score-entry')) return;
    e.preventDefault();
    if (touchTurnRegistered || !e.touches?.length) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (Math.max(absX, absY) < TURN_THRESHOLD_PX) return;
    touchTurnRegistered = true;
    applySwipeDirection(deltaX, deltaY);
}

function handleTouchEnd(e) {
    if (touchStartedOnIcons) {
        touchStartedOnIcons = false;
        return;
    }
    if (e.target.closest('.high-score-overlay')) return;
    if (e.target.closest('.game-over-buttons')) return;
    if (e.target.closest('.start-screen')) return;
    if (e.target.closest('.instructions-overlay')) return;
    if (e.target.closest('.high-score-entry')) return;
    e.preventDefault();
}

function applySwipeDirection(deltaX, deltaY) {
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    if (absDeltaX > absDeltaY) {
        if (deltaX > 0 && direction.x === 0) {
            nextDirection = { x: 1, y: 0 };
            if (direction.y !== 0 && !checkImmediateCollision(nextDirection)) {
                direction = { x: 1, y: 0 };
            }
        } else if (deltaX < 0 && direction.x === 0) {
            nextDirection = { x: -1, y: 0 };
            if (direction.y !== 0 && !checkImmediateCollision(nextDirection)) {
                direction = { x: -1, y: 0 };
            }
        }
    } else {
        if (deltaY > 0 && direction.y === 0) {
            nextDirection = { x: 0, y: 1 };
            if (direction.x !== 0 && !checkImmediateCollision(nextDirection)) {
                direction = { x: 0, y: 1 };
            }
        } else if (deltaY < 0 && direction.y === 0) {
            nextDirection = { x: 0, y: -1 };
            if (direction.x !== 0 && !checkImmediateCollision(nextDirection)) {
                direction = { x: 0, y: -1 };
            }
        }
    }
}

// Event listeners
document.addEventListener('keydown', handleKeyPress);
window.addEventListener('touchstart', handleTouchStart, { passive: false });
window.addEventListener('touchmove', handleTouchMove, { passive: false });
window.addEventListener('touchend', handleTouchEnd, { passive: false });
let lastGameOverButtonTouch = 0;
function onPlayAgain() {
    resetGame();
}
function onHsFromGameOver() {
    const overlay = document.getElementById('highScoreOverlay');
    if (!overlay) return;
    populateHighScoreList();
    overlay.classList.add('visible');
    playSound('src/sounds/beep1.mp3');
}
function gameOverButtonClickDebounce() {
    if (Date.now() - lastGameOverButtonTouch < 400) return true;
    return false;
}
if (playAgainBtn) {
    playAgainBtn.addEventListener('click', (e) => {
        if (gameOverButtonClickDebounce()) return;
        onPlayAgain();
    });
    playAgainBtn.addEventListener('touchend', (e) => {
        lastGameOverButtonTouch = Date.now();
        onPlayAgain();
    }, { passive: true });
}
if (hsBtn) {
    hsBtn.addEventListener('click', (e) => {
        if (gameOverButtonClickDebounce()) return;
        onHsFromGameOver();
    });
    hsBtn.addEventListener('touchend', (e) => {
        lastGameOverButtonTouch = Date.now();
        onHsFromGameOver();
    }, { passive: true });
}

// Prevent scrolling on touch (except inside HS overlay / game-over buttons)
document.addEventListener('touchmove', (e) => {
    if (e.target.closest('.high-score-overlay')) return;
    if (e.target.closest('.game-over-buttons')) return;
    if (e.target.closest('.start-screen')) return;
    if (e.target.closest('.instructions-overlay')) return;
    if (e.target.closest('.high-score-entry')) return;
    e.preventDefault();
}, { passive: false });

// Toggle high-score overlay when clicking/tapping the HS icon (listener on #hsIcon only)
let lastHsTouchToggle = 0;
function populateHighScoreList() {
    const list = document.getElementById('highScoreList');
    if (!list) return;
    list.innerHTML = '';
    const data = loadHighScores();
    for (let i = 0; i < data.length; i++) {
        const row = document.createElement('div');
        row.className = 'high-score-row';
        const { initials: init, score: sc } = data[i];
        row.innerHTML = `<div class="col-rank">${i + 1}</div><div class="col-initials">${init}</div><div class="col-score">${sc}</div>`;
        list.appendChild(row);
    }
}
function setupHsIconToggle() {
    const hsIcon = document.getElementById('hsIcon');
    const overlay = document.getElementById('highScoreOverlay');
    console.log('[HS] setupHsIconToggle: hsIcon=', !!hsIcon, 'overlay=', !!overlay);
    if (!hsIcon || !overlay) return;
    populateHighScoreList();
    function toggle(e) {
        e.preventDefault();
        e.stopPropagation();
        const wasVisible = overlay.classList.contains('visible');
        if (e.type === 'touchend') lastHsTouchToggle = Date.now();
        if (!wasVisible) populateHighScoreList();
        overlay.classList.toggle('visible');
        const nowVisible = overlay.classList.contains('visible');
        if (nowVisible) playSound('src/sounds/beep1.mp3');
        // if (!nowVisible) playSound('src/sounds/close.mp3');
        console.log('[HS] toggle', e.type, 'visible', wasVisible, '->', nowVisible, 'display=', getComputedStyle(overlay).display);
    }
    function onClick(e) {
        if (Date.now() - lastHsTouchToggle < 400) {
            console.log('[HS] onClick skipped (recent touchend)');
            return;
        }
        console.log('[HS] onClick');
        toggle(e);
    }
    function onKeydown(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        console.log('[HS] onKeydown', e.key);
        if (!overlay.classList.contains('visible')) populateHighScoreList();
        overlay.classList.toggle('visible');
        if (overlay.classList.contains('visible')) playSound('src/sounds/beep1.mp3');
        // if (!overlay.classList.contains('visible')) playSound('src/sounds/close.mp3');
        console.log('[HS] keydown visible ->', overlay.classList.contains('visible'), 'display=', getComputedStyle(overlay).display);
    }
    hsIcon.addEventListener('click', onClick);
    hsIcon.addEventListener('touchend', toggle, { passive: false });
    hsIcon.addEventListener('keydown', onKeydown);
    console.log('[HS] listeners attached to #hsIcon');
}

let lastInsTouchOpen = 0;
let lastInstructionsClose = 0;
function openInstructions() {
    if (Date.now() - lastInstructionsClose < 300) return;
    if (instructionsOverlay) instructionsOverlay.classList.add('visible');
    playSound('src/sounds/beep3.mp3');
}
function setupInsIconInstructions() {
    const insIcon = document.getElementById('insIcon');
    if (!insIcon || !instructionsOverlay) return;
    function open() {
        openInstructions();
    }
    function onClick(e) {
        if (Date.now() - lastInsTouchOpen < 400) return;
        open();
    }
    function onTouchend(e) {
        e.preventDefault();
        e.stopPropagation();
        lastInsTouchOpen = Date.now();
        open();
    }
    function onKeydown(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        open();
    }
    insIcon.addEventListener('click', onClick);
    insIcon.addEventListener('touchend', onTouchend, { passive: false });
    insIcon.addEventListener('keydown', onKeydown);
}

function setupHsCloseOnClickOutside() {
    const overlay = document.getElementById('highScoreOverlay');
    const hsCloseBtn = document.getElementById('hsCloseBtn');
    if (!overlay) return;
    if (hsCloseBtn) {
        hsCloseBtn.addEventListener('click', () => {
            overlay.classList.remove('visible');
        });
        hsCloseBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            overlay.classList.remove('visible');
        }, { passive: false });
    }
    function closeIfOutside(e) {
        if (!overlay.classList.contains('visible')) return;
        const t = e.target;
        if (t.closest('.high-score-overlay')) return;  // keep open when clicking overlay/list
        if (t.closest('.icons-top-right')) return;     // icon toggles, don't close here
        if (t.closest('.game-over-buttons')) return;   // HS button opens overlay, don't close here
        if (t.closest('.instructions-overlay')) return;
        if (t.closest('.high-score-entry')) return;    // initials entry over overlay
        // playSound('src/sounds/close.mp3');
        overlay.classList.remove('visible');
    }
    document.addEventListener('click', closeIfOutside);
    document.addEventListener('touchend', closeIfOutside, { passive: true });
}

// Debug: show current window size in upper right
function updateDebugWindowSize() {
    const el = document.getElementById('debugWindowSize');
    if (!el) return;
    el.textContent = `${window.innerWidth} × ${window.innerHeight}`;
}

// Check outer container dimensions and add border if smaller than max
function updateOuterContainerBorder() {
    const outerContainer = document.querySelector('.game-outer-container');
    if (!outerContainer) return;
    
    const rect = outerContainer.getBoundingClientRect();
    const maxWidth = 800;
    const maxHeight = 700;
    
    // Show border if actual size is less than max dimensions
    // if (rect.width < maxWidth - 1 || rect.height < maxHeight - 1) {
    //     outerContainer.style.border = '2px solid #0a0015';
    // } else {
    //     outerContainer.style.border = 'none';
    // }
}

// Load overlay: fade out when ready (after init or after 2s)
let loadOverlayFaded = false;
function fadeLoadOverlay() {
    if (loadOverlayFaded) return;
    loadOverlayFaded = true;
    const el = document.getElementById('loadOverlay');
    if (el) el.classList.add('faded');
}
setTimeout(fadeLoadOverlay, 2000);

// Initialize
window.addEventListener('load', async () => {
    await loadImages();
    initCanvas();
    pregenerateTintedImages(); // Generate tinted images after cellSize is set
    draw();
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(renderLoop);
    }
    setTimeout(updateOuterContainerBorder, 200);
    updateDebugWindowSize();
    const instructionsMove = document.getElementById('instructionsMove');
    if (instructionsMove) {
        instructionsMove.textContent = isMobileDevice()
            ? 'SWIPE TO MOVE WORM'
            : 'USE ARROW KEYS OR ASDF TO MOVE WORM';
    }
    setupHsIconToggle();
    setupInsIconInstructions();
    setupHsEntryInput();
    setupHsCloseOnClickOutside();

    // Single rainbow cycle; one tween per property, all targets share it for identical timing
    if (typeof gsap !== 'undefined') {
        const gameOverBox = document.getElementById('gameOver');
        const hsOverlay = document.getElementById('highScoreOverlay');

        const rainbowBorderKeyframes = [
            { borderColor: '#ff0000', duration: 0.5 },
            { borderColor: '#ff7f00', duration: 0.5 },
            { borderColor: '#ffff00', duration: 0.5 },
            { borderColor: '#00ff00', duration: 0.5 },
            { borderColor: '#00ffff', duration: 0.5 },
            { borderColor: '#0000ff', duration: 0.5 },
            { borderColor: '#4b0082', duration: 0.5 },
            { borderColor: '#8b00ff', duration: 0.5 },
            { borderColor: '#ff00ff', duration: 0.5 },
            { borderColor: '#ff0000', duration: 0.5 }
        ];
        const rainbowColorKeyframes = [
            { color: '#ff0000', duration: 0.5 },
            { color: '#ff7f00', duration: 0.5 },
            { color: '#ffff00', duration: 0.5 },
            { color: '#00ff00', duration: 0.5 },
            { color: '#00ffff', duration: 0.5 },
            { color: '#0000ff', duration: 0.5 },
            { color: '#4b0082', duration: 0.5 },
            { color: '#8b00ff', duration: 0.5 },
            { color: '#ff00ff', duration: 0.5 },
            { color: '#ff0000', duration: 0.5 }
        ];
        const rainbowBgKeyframes = [
            { backgroundColor: '#ff0000', duration: 0.5 },
            { backgroundColor: '#ff7f00', duration: 0.5 },
            { backgroundColor: '#ffff00', duration: 0.5 },
            { backgroundColor: '#00ff00', duration: 0.5 },
            { backgroundColor: '#00ffff', duration: 0.5 },
            { backgroundColor: '#0000ff', duration: 0.5 },
            { backgroundColor: '#4b0082', duration: 0.5 },
            { backgroundColor: '#8b00ff', duration: 0.5 },
            { backgroundColor: '#ff00ff', duration: 0.5 },
            { backgroundColor: '#ff0000', duration: 0.5 }
        ];

        const hsCloseBtn = document.getElementById('hsCloseBtn');
        const borderTargets = [canvas, hsOverlay, playAgainBtn, hsBtn, instructionsOverlay, highScoreEntry, hsCloseBtn].filter(Boolean);
        const scoreContainer = document.querySelector('.score');
        const hsEntryLabel = document.getElementById('hsEntryLabel');
        const colorTargets = [scoreContainer, hsOverlay, startInstructionsBtn, instructionsOverlay, hsEntryScore, hsEntryLabel].filter(Boolean);
        const bgTargets = [gameOverBox, startPlayBtn, instructionsCloseBtn, rainbowOverlay, hsEntryInput].filter(Boolean);

        const initialRed = '#ff0000';
        gsap.set(borderTargets, { borderColor: initialRed });
        gsap.set(colorTargets, { color: initialRed });
        gsap.set(bgTargets, { backgroundColor: initialRed });

        gsap.to(borderTargets, { keyframes: rainbowBorderKeyframes, repeat: -1, ease: 'none' });
        gsap.to(colorTargets, { keyframes: rainbowColorKeyframes, repeat: -1, ease: 'none' });
        gsap.to(bgTargets, { keyframes: rainbowBgKeyframes, repeat: -1, ease: 'none' });
    }
    fadeLoadOverlay();
});

// On resize, only re-init layout if the game hasn't started yet
// so we don't reset an in-progress game.
window.addEventListener('resize', () => {
    updateOuterContainerBorder();
    updateDebugWindowSize();
    if (!gameStarted) {
        initCanvas();
        draw();
    }
});

// Start game on first interaction
let gameStarted = false;
function startGame() {
    const hsOverlay = document.getElementById('highScoreOverlay');
    if (hsOverlay?.classList.contains('visible')) return;
    // Only start if game hasn't started yet and game over menu is not visible
    if (!gameStarted && gameOverElement.classList.contains('hidden')) {
        gameStarted = true;
        resetGame();
    }
}

// Start game only via PLAY button (start screen) or PLAY AGAIN (game over)
if (startPlayBtn) {
    startPlayBtn.addEventListener('click', () => {
        if (startScreen) startScreen.classList.add('hidden');
        startGame();
    });
    startPlayBtn.addEventListener('touchend', (e) => {
        if (startScreen) startScreen.classList.add('hidden');
        startGame();
    }, { passive: true });
}
if (startInstructionsBtn) {
    startInstructionsBtn.addEventListener('click', () => openInstructions());
    startInstructionsBtn.addEventListener('touchend', (e) => {
        openInstructions();
    }, { passive: true });
}
if (instructionsCloseBtn) {
    instructionsCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (instructionsOverlay) instructionsOverlay.classList.remove('visible');
        lastInstructionsClose = Date.now();
        // playSound('src/sounds/close.mp3');
    });
    instructionsCloseBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (instructionsOverlay) instructionsOverlay.classList.remove('visible');
        lastInstructionsClose = Date.now();
        // playSound('src/sounds/close.mp3');
    }, { passive: false });
}

function setupHsEntryInput() {
    const input = document.getElementById('hsEntryInput');
    const entry = document.getElementById('highScoreEntry');
    if (!input || !entry) return;
    function submitInitials() {
        const initials = input.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'AAA';
        addHighScore(initials, pendingHighScore);
        populateHighScoreList();
        entry.classList.add('hidden');
        input.value = '';
        input.blur();
        if (gameOverButtons) gameOverButtons.classList.remove('hidden');
    }
    input.addEventListener('input', () => {
        let v = input.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
        input.value = v;
        if (v.length === 3) submitInitials();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        submitInitials();
    });
}
