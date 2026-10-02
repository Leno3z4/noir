const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const W = canvas.width;
const H = canvas.height;

const CONFIG = {
  gravity: 1500,
  bounce: -570,
  playerSize: 28,
  platformTile: 30,
  platformTiles: 4,
  platformGap: 108,
  cameraTrigger: 220,
  deathMargin: 90,
};

const ui = {
  menu: document.querySelector('#menu'),
  over: document.querySelector('#game-over'),
  start: document.querySelector('#start'),
  restart: document.querySelector('#restart'),
  height: document.querySelector('#height'),
  best: document.querySelector('#best'),
  speed: document.querySelector('#speed'),
  final: document.querySelector('#final-height'),
  newBest: document.querySelector('#new-best'),
  seed: document.querySelector('#seed'),
};

const input = { left: false, right: false };

const player = {
  x: 0,
  y: 0,
  previousY: 0,
  vx: 0,
  vy: 0,
  visible: true,
};

const state = {
  mode: 'menu',
  time: 0,
  cameraY: 0,
  height: 0,
  best: Number(localStorage.getItem('dlicom-best') || 0),
  seed: 0,
  routeIndex: 0,
  nextId: 0,
};

const platforms = [];

ui.best.textContent = String(state.best);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function platform(id, x, y, tiles = CONFIG.platformTiles, starter = false) {
  return {
    id,
    x,
    y,
    width: tiles * CONFIG.platformTile,
    height: 12,
    active: true,
    starter,
  };
}

function reset(seed = Math.floor(Math.random() * 0x7fffffff)) {
  state.mode = 'playing';
  state.time = 0;
  state.cameraY = 0;
  state.height = 0;
  state.seed = seed;
  state.routeIndex = 0;
  state.nextId = 0;

  platforms.length = 0;

  // The opening route is deliberately authored to match the supplied reference:
  // bottom-left starter, then alternating right / left wall platforms.
  const width = CONFIG.platformTiles * CONFIG.platformTile;
  const left = 0;
  const right = W - width;
  const startY = H - 35;
  const gap = CONFIG.platformGap;

  const opening = [
    [left, startY],
    [right, startY - gap],
    [left, startY - gap * 2],
    [right, startY - gap * 3],
    [left, startY - gap * 4],
    [right, startY - gap * 5],
    [left, startY - gap * 6],
  ];

  for (let i = 0; i < opening.length; i += 1) {
    platforms.push(platform(i, opening[i][0], opening[i][1], CONFIG.platformTiles, i === 0));
  }

  // Continue the route with the same structure until the real generator is added.
  for (let i = opening.length; i < 28; i += 1) {
    const previous = platforms[i - 1];
    const side = i % 2 === 0 ? left : right;
    platforms.push(
      platform(
        i,
        side,
        previous.y - gap,
        CONFIG.platformTiles
      )
    );
  }

  state.nextId = platforms.length;
  state.routeIndex = 0;

  const starter = platforms[0];

  // The character is explicitly placed on the starter platform.
  player.x = starter.x + starter.width / 2;
  player.y = starter.y - CONFIG.playerSize / 2;
  player.previousY = player.y;
  player.vx = 0;
  player.vy = 0;
  player.visible = true;

  ui.menu.classList.add('hidden');
  ui.over.classList.add('hidden');
  ui.height.textContent = '0';
  ui.speed.textContent = '1.00x';
}

function currentPlatform() {
  return platforms[state.routeIndex];
}

function nextPlatform() {
  return platforms[state.routeIndex + 1];
}

function horizontalDirection() {
  return (input.right ? 1 : 0) - (input.left ? 1 : 0);
}

function bounceFromNextPlatform() {
  const next = nextPlatform();
  if (!next || !next.active) return false;

  const playerHalf = CONFIG.playerSize / 2;
  const wasAbove = player.previousY + playerHalf <= next.y + 2;
  const crossed = player.y + playerHalf >= next.y;
  const overlaps =
    player.x + playerHalf > next.x &&
    player.x - playerHalf < next.x + next.width;

  if (!wasAbove || !crossed || !overlaps) return false;

  player.y = next.y - playerHalf;
  player.vy = CONFIG.bounce;

  // Once we land on a tile, the previous tile is no longer a valid safety net.
  const previous = currentPlatform();
  previous.active = false;
  state.routeIndex += 1;

  state.height = Math.max(
    state.height,
    Math.floor((startWorldY() - next.y) / 0.92)
  );

  return true;
}

function startWorldY() {
  return H - 35;
}

function update(dt) {
  if (state.mode !== 'playing') return;

  state.time += dt;

  const direction = horizontalDirection();

  if (direction !== 0) {
    player.vx += direction * 950 * dt;
  } else {
    player.vx *= Math.max(0, 1 - 9 * dt);
  }

  player.vx = clamp(player.vx, -220, 220);

  player.previousY = player.y;
  player.vy += CONFIG.gravity * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Seamless horizontal wrap.
  const half = CONFIG.playerSize / 2;
  if (player.x < -half) player.x = W + half;
  if (player.x > W + half) player.x = -half;

  bounceFromNextPlatform();

  // Camera follows upward progress.
  const targetCamera = player.y - CONFIG.cameraTrigger;
  if (targetCamera < state.cameraY) {
    state.cameraY += (targetCamera - state.cameraY) * Math.min(1, dt * 7);
  }

  if (state.routeIndex > 0) {
    const landed = currentPlatform();
    state.height = Math.max(
      state.height,
      Math.floor((startWorldY() - landed.y) / 0.92)
    );
  }

  ui.height.textContent = String(Math.max(0, state.height));
  ui.speed.textContent = (1 + Math.min(0.35, Math.abs(player.vx) / 650)).toFixed(2) + 'x';

  // Falling below the active viewport is an immediate loss. Old platforms
  // are inactive, so falling backward cannot save the run.
  if (player.y > state.cameraY + H + CONFIG.deathMargin) {
    endRun();
  }

  // Keep enough authored route ahead of the camera.
  const top = platforms[platforms.length - 1];
  if (top && top.y - state.cameraY > -900) {
    const side = top.id % 2 === 0 ? rightSideFor(top.width) : 0;
    platforms.push(
      platform(
        state.nextId,
        side,
        top.y - CONFIG.platformGap,
        CONFIG.platformTiles
      )
    );
    state.nextId += 1;
  }
}

function rightSideFor(width) {
  return W - width;
}

function endRun() {
  state.mode = 'gameover';

  const score = Math.max(0, state.height);
  const isNewBest = score > state.best;

  if (isNewBest) {
    state.best = score;
    localStorage.setItem('dlicom-best', String(state.best));
  }

  ui.final.textContent = score + 'm';
  ui.newBest.classList.toggle('hidden', !isNewBest);
  ui.seed.textContent = 'RUN SEED · ' + state.seed;
  ui.best.textContent = String(state.best);
  ui.over.classList.remove('hidden');
}

function drawBackground() {
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, W, H);

  const shift = (state.cameraY * 0.08) % H;

  for (let i = 0; i < 26; i += 1) {
    const x = (i * 137) % W;
    const y = (i * 53 - shift + H * 2) % H;

    ctx.fillStyle = i % 5 === 0 ? '#333333' : '#1b1b1b';
    ctx.fillRect(x, y, i % 4 === 0 ? 3 : 2, i % 4 === 0 ? 3 : 2);
  }
}

function drawPlatform(p) {
  const screenY = Math.round(p.y - state.cameraY);

  if (screenY < -30 || screenY > H + 30) return;

  ctx.fillStyle = p.active ? '#f0f0f0' : '#8a8a8a';
  ctx.fillRect(
    Math.round(p.x),
    screenY,
    Math.round(p.width),
    10
  );

  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(
    Math.round(p.x),
    screenY + 10,
    Math.round(p.width),
    3
  );

  // Tile seams/motifs.
  ctx.fillStyle = '#171717';

  for (let i = 0; i < CONFIG.platformTiles; i += 1) {
    const tileX = p.x + i * CONFIG.platformTile;
    ctx.fillRect(Math.round(tileX + 5), screenY + 3, 4, 2);

    if (i < CONFIG.platformTiles - 1) {
      ctx.fillRect(
        Math.round(tileX + CONFIG.platformTile - 2),
        screenY,
        2,
        10
      );
    }
  }
}

function drawPlayer() {
  // This is deliberately large and drawn last so there is never ambiguity
  // about where the playable character is during prototype testing.
  const half = CONFIG.playerSize / 2;
  const x = Math.round(player.x - half);
  const y = Math.round(player.y - half - state.cameraY);

  ctx.fillStyle = '#b8ff36';
  ctx.fillRect(x, y, CONFIG.playerSize, CONFIG.playerSize);

  ctx.fillStyle = '#080808';
  ctx.fillRect(x + 6, y + 8, 5, 5);
  ctx.fillRect(x + CONFIG.playerSize - 11, y + 8, 5, 5);
  ctx.fillRect(x + 8, y + 20, CONFIG.playerSize - 16, 3);

  // Small position marker beneath the character.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(player.x - 2), Math.round(player.y + half + 2 - state.cameraY), 4, 3);
}

function draw() {
  drawBackground();

  for (const p of platforms) {
    drawPlatform(p);
  }

  drawPlayer();
}

function setKey(key, active) {
  const value = key.toLowerCase();

  if (value === 'a' || key === 'arrowleft') input.left = active;
  if (value === 'd' || key === 'arrowright') input.right = active;
}

window.addEventListener('keydown', (event) => {
  setKey(event.key, true);

  if (['ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
    event.preventDefault();
  }

  if (event.key === 'Enter' && state.mode === 'gameover') {
    reset();
  }
});

window.addEventListener('keyup', (event) => {
  setKey(event.key, false);
});

function bindTouch(selector, direction) {
  const zone = document.querySelector(selector);

  const press = (event) => {
    event.preventDefault();
    input[direction] = true;
  };

  const release = (event) => {
    event.preventDefault();
    input[direction] = false;
  };

  ['pointerdown', 'pointerenter'].forEach((type) => {
    zone.addEventListener(type, press);
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
    zone.addEventListener(type, release);
  });
}

bindTouch('#touch-left', 'left');
bindTouch('#touch-right', 'right');

ui.start.addEventListener('click', () => reset());
ui.restart.addEventListener('click', () => reset());

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min(0.032, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);
  draw();

  requestAnimationFrame(frame);
}

draw();
requestAnimationFrame(frame);
