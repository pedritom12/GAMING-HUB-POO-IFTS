const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const levelEl = document.getElementById('level');
const restartBtn = document.getElementById('restart');

let best = Number(localStorage.getItem('neon_dodger_best') || 0);
bestEl.textContent = best;

let player, obstacles, orbs, keys, score, level, frame, gameOver, animId;

function init() {
  player = { x: canvas.width / 2 - 18, y: canvas.height - 36, w: 36, h: 18, speed: 6 };
  obstacles = [];
  orbs = [];
  keys = {};
  score = 0;
  level = 1;
  frame = 0;
  gameOver = false;
  scoreEl.textContent = 0;
  levelEl.textContent = 1;
  restartBtn.style.display = 'none';
  if (animId) cancelAnimationFrame(animId);
  loop();
}

window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });
restartBtn.addEventListener('click', init);

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function loop() {
  frame++;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!gameOver) {
    if ((keys['ArrowLeft'] || keys['KeyA']) && player.x > 6) player.x -= player.speed;
    if ((keys['ArrowRight'] || keys['KeyD']) && player.x + player.w < canvas.width - 6) player.x += player.speed;

    level = 1 + Math.floor(score / 250);
    levelEl.textContent = level;

    const spawnRate = Math.max(18, 46 - level * 3);
    if (frame % spawnRate === 0) {
      const w = 24 + Math.random() * 34;
      obstacles.push({
        x: Math.random() * (canvas.width - w),
        y: -20,
        w,
        h: 16,
        vy: 2.6 + level * 0.55 + Math.random() * 1.2
      });
    }

    if (frame % 95 === 0) {
      orbs.push({
        x: 20 + Math.random() * (canvas.width - 40),
        y: -15,
        r: 8,
        vy: 2.4 + level * 0.3
      });
    }

    if (frame % 8 === 0) {
      score += 1;
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        localStorage.setItem('neon_dodger_best', best);
      }
    }
  }

  ctx.fillStyle = '#00f5d4';
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.fillStyle = '#f0305a';
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const ob = obstacles[i];
    if (!gameOver) ob.y += ob.vy;
    ctx.fillRect(ob.x, ob.y, ob.w, ob.h);

    if (!gameOver && rectsOverlap(player, ob)) {
      gameOver = true;
      restartBtn.style.display = 'inline-block';
    }
    if (ob.y > canvas.height + 30) obstacles.splice(i, 1);
  }

  ctx.fillStyle = '#ffd166';
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    if (!gameOver) o.y += o.vy;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();

    const orbBox = { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 };
    if (!gameOver && rectsOverlap(player, orbBox)) {
      score += 50;
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        localStorage.setItem('neon_dodger_best', best);
      }
      orbs.splice(i, 1);
      continue;
    }
    if (o.y > canvas.height + 30) orbs.splice(i, 1);
  }

  if (gameOver) {
    ctx.fillStyle = 'rgba(11, 12, 21, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#00f5d4';
    ctx.fillText('Puntaje final: ' + score, canvas.width / 2, canvas.height / 2 + 20);
  }

  animId = requestAnimationFrame(loop);
}

init();