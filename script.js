(() => {
  const canvas = document.querySelector('#sky');
  const ctx = canvas.getContext('2d');
  const message = document.querySelector('#message');
  const subMessage = document.querySelector('#subMessage');
  const phaseLabel = document.querySelector('#phaseLabel');
  const progress = document.querySelector('#progress');
  const timeReadout = document.querySelector('#timeReadout');
  const pauseButton = document.querySelector('#pauseButton');
  const soundButton = document.querySelector('#soundButton');
  const burstButton = document.querySelector('#burstButton');
  const copy = document.querySelector('.center-copy');
  const audio = document.querySelector('#ambientAudio');

  const DURATION = 150000;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const phases = [
    { until: .20, name: 'FIRST LIGHT', title: 'You are still becoming.', sub: 'Let the world move softly beneath you.' },
    { until: .43, name: 'OVER WILDFLOWERS', title: 'There is room for joy today.', sub: 'Even a small bright thing can change the whole view.' },
    { until: .67, name: 'FOLLOWING THE RIVER', title: 'Keep going. Gently counts.', sub: 'You do not have to rush to be moving forward.' },
    { until: .84, name: 'OPEN MEADOW', title: 'The good is already finding you.', sub: 'Look how much beauty is still in motion.' },
    { until: 1, name: 'THE WIDE SKY', title: 'You are allowed to feel hopeful.', sub: 'Stay here a little longer. The light is coming with you.' }
  ];
  const palette = ['#3f806c', '#4e9172', '#36745f', '#5e986b', '#6a9e67', '#2f705f'];
  const flowers = ['#e1ff79', '#ff8fa3', '#a9d6ff', '#f6cc7a'];
  let width = 0, height = 0, dpr = 1, startedAt = performance.now(), pausedAt = 0, paused = false;
  let pointer = { x: 0, y: 0 }, particles = [], lastPhase = -1, lastBurstAt = 0, lastElapsed = 0;
  const MUSIC_VOLUME = .42;
  audio.volume = 0;
  let soundOn = false;
  let fallbackContext = null;
  let fallbackGain = null;
  let fallbackTimer = null;

  // Tiny deterministic generator keeps the landscape consistent from one loop to the next.
  const random = (seed) => {
    const x = Math.sin(seed * 127.1 + seed * seed * .0001) * 43758.5453123;
    return x - Math.floor(x);
  };
  const range = (seed, min, max) => min + random(seed) * (max - min);
  const riverXAt = y => Math.sin(y * .0014) * 480 + Math.sin(y * .0041) * 115;
  const trees = Array.from({ length: 720 }, (_, i) => ({
    x: range(i * 7 + 1, -1800, 1800),
    y: range(i * 11 + 2, -300, 10800),
    r: range(i * 13 + 3, 15, 48),
    hue: range(i * 17 + 4, 135, 168),
    glow: random(i * 19) > .9
  }));
  const flowerPatches = Array.from({ length: 190 }, (_, i) => ({
    x: range(i * 37, -1600, 1600), y: range(i * 31, -300, 10700),
    r: range(i * 41, 12, 43), color: flowers[i % flowers.length]
  }));
  const hills = Array.from({ length: 145 }, (_, i) => {
    const y = range(i * 53 + 6, -400, 10800);
    const rx = range(i * 59 + 7, 80, 175);
    let x = range(i * 47 + 5, -1850, 1850);
    const clearance = rx + 105;
    if (Math.abs(x - riverXAt(y)) < clearance) x = riverXAt(y) + (x < riverXAt(y) ? -clearance : clearance);
    return { x, y, rx, ry: range(i * 61 + 8, 34, 82), hue: range(i * 67 + 9, 105, 145), rotation: range(i * 71 + 10, -.22, .22), seed: i * 73 + 11 };
  });

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth; height = innerHeight;
    canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function worldPoint(x, y, cameraY, scale, tilt) {
    return {
      x: width / 2 + (x + Math.sin(y * .0017) * 35) * scale + pointer.x * 18,
      y: height * .52 + (y - cameraY) * scale + (x * tilt) + pointer.y * 14
    };
  }

  function polygon(x, y, radius, sides, rotation, fill, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rotation + (i / sides) * Math.PI * 2;
      const px = x + Math.cos(a) * radius;
      const py = y + Math.sin(a) * radius;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawRiver(cameraY, scale, tilt, elapsed) {
    ctx.save();
    ctx.beginPath();
    for (let y = cameraY - height / scale; y < cameraY + height / scale; y += 45) {
      const riverX = riverXAt(y);
      const p = worldPoint(riverX, y, cameraY, scale, tilt);
      y === cameraY - height / scale ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = 'rgba(91, 193, 192, .32)'; ctx.lineWidth = 95 * scale; ctx.stroke();
    ctx.strokeStyle = 'rgba(170, 255, 230, .19)'; ctx.lineWidth = 2.4; ctx.setLineDash([12, 18]); ctx.lineDashOffset = -elapsed * .018; ctx.stroke();
    ctx.restore();
  }

  function drawFields(cameraY, scale, tilt) {
    const startRow = Math.floor((cameraY - height / scale) / 370) * 370;
    for (let y = startRow; y < cameraY + height / scale + 370; y += 370) {
      for (let x = -2100; x < 2100; x += 430) {
        const p = worldPoint(x, y, cameraY, scale, tilt);
        const seed = Math.floor(x / 430) * 99 + Math.floor(y / 370);
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate((random(seed) - .5) * .12);
        ctx.fillStyle = palette[Math.floor(random(seed * 4) * palette.length)];
        ctx.globalAlpha = .83;
        ctx.fillRect(-235 * scale, -205 * scale, 430 * scale, 370 * scale);
        ctx.strokeStyle = 'rgba(207, 255, 204, .05)'; ctx.lineWidth = 1;
        ctx.strokeRect(-235 * scale, -205 * scale, 430 * scale, 370 * scale);
        ctx.restore();
      }
    }
  }

  function hillPath(rx, ry, seed, inset = 1) {
    const points = 18;
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const unevenness = .86 + random(seed + i * 17) * .20;
      const x = Math.cos(angle) * rx * unevenness * inset;
      const y = Math.sin(angle) * ry * (1 + Math.sin(angle * 3 + seed) * .075) * inset;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function drawHills(cameraY, scale, tilt) {
    hills.forEach(hill => {
      const p = worldPoint(hill.x, hill.y, cameraY, scale, tilt);
      const rx = hill.rx * scale;
      const ry = hill.ry * scale;
      if (p.x < -rx * 2 || p.x > width + rx * 2 || p.y < -ry * 2 || p.y > height + ry * 2) return;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(hill.rotation + tilt * .8);
      ctx.save();
      ctx.translate(rx * .22, ry * .32);
      ctx.filter = `blur(${Math.max(2, ry * .13)}px)`;
      ctx.fillStyle = 'rgba(17, 68, 50, .23)';
      hillPath(rx * .94, ry * .72, hill.seed, 1); ctx.fill();
      ctx.restore();
      const shade = ctx.createRadialGradient(-rx * .28, -ry * .46, 1, 0, 0, rx * 1.2);
      shade.addColorStop(0, `hsla(${hill.hue}, 52%, 63%, .82)`);
      shade.addColorStop(.42, `hsla(${hill.hue}, 42%, 48%, .79)`);
      shade.addColorStop(1, `hsla(${hill.hue + 10}, 37%, 31%, .66)`);
      ctx.fillStyle = shade;
      hillPath(rx, ry, hill.seed); ctx.fill();
      ctx.save(); hillPath(rx, ry, hill.seed); ctx.clip();
      const light = ctx.createLinearGradient(-rx, -ry, rx, ry);
      light.addColorStop(0, 'rgba(232, 255, 178, .18)'); light.addColorStop(.5, 'rgba(255, 255, 255, 0)'); light.addColorStop(1, 'rgba(10, 56, 38, .17)');
      ctx.fillStyle = light; ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
      ctx.strokeStyle = `hsla(${hill.hue + 24}, 52%, 75%, .18)`;
      ctx.lineWidth = Math.max(.7, scale);
      for (let contour = 0; contour < 3; contour++) {
        const y = (-.36 + contour * .25) * ry;
        ctx.beginPath();
        ctx.moveTo(-rx * .9, y + ry * .10);
        ctx.quadraticCurveTo(-rx * .12, y - ry * (.12 + contour * .04), rx * .82, y + ry * .08);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    });
  }

  function drawTree(tree, cameraY, scale, tilt, elapsed) {
    const p = worldPoint(tree.x, tree.y, cameraY, scale, tilt);
    const r = tree.r * scale;
    if (p.x < -r * 2 || p.x > width + r * 2 || p.y < -r * 2 || p.y > height + r * 2) return;
    const pulse = 1 + Math.sin(elapsed * .002 + tree.x) * .035;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(tree.x * .003 + elapsed * .00009);
    ctx.shadowBlur = tree.glow ? 15 : 0; ctx.shadowColor = '#b5ff78';
    polygon(0, 0, r * 1.26 * pulse, 7, .2, `hsla(${tree.hue}, 34%, 22%, .38)`);
    polygon(0, 0, r * pulse, 6, .4, `hsla(${tree.hue}, 38%, 34%, .94)`);
    polygon(-r * .18, -r * .2, r * .47, 5, .1, `hsla(${tree.hue + 10}, 45%, 45%, .85)`);
    ctx.restore();
  }

  function drawFlowers(cameraY, scale, tilt, elapsed) {
    flowerPatches.forEach((flower, i) => {
      const p = worldPoint(flower.x, flower.y, cameraY, scale, tilt);
      if (p.x < -80 || p.x > width + 80 || p.y < -80 || p.y > height + 80) return;
      const r = flower.r * scale;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = .42 + Math.sin(elapsed * .002 + i) * .12;
      polygon(p.x, p.y, r, 4, elapsed * .0007 + i, flower.color);
      ctx.restore();
    });
  }

  function drawGlyphs(cameraY, scale, tilt, elapsed) {
    const count = 22;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < count; i++) {
      const orbit = (elapsed * .00010 + i / count) * Math.PI * 2;
      const x = width * .5 + Math.cos(orbit * (1.6 + (i % 3) * .2) + i) * (width * (.12 + (i % 7) * .055));
      const y = height * .48 + Math.sin(orbit * (1.15 + (i % 4) * .13) + i * 3) * (height * (.10 + (i % 6) * .057));
      const r = 4 + (i % 4) * 3;
      const worldY = cameraY + (y - height * .52 - pointer.y * 14) / scale;
      const riverPoint = worldPoint(riverXAt(worldY), worldY, cameraY, scale, tilt);
      if (Math.abs(x - riverPoint.x) < 76 + r) continue;
      ctx.strokeStyle = i % 3 ? 'rgba(213, 255, 121, .20)' : 'rgba(126, 197, 255, .19)';
      ctx.lineWidth = 1; ctx.translate(x, y); ctx.rotate(-orbit * 3); ctx.strokeRect(-r, -r, r * 2, r * 2); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.restore();
  }

  function celebration(x = width * .5, y = height * .47, strength = 1) {
    const count = Math.round(75 * strength);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * .13;
      const speed = (1.5 + Math.random() * 4.7) * strength;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.1, life: 1, decay: .006 + Math.random() * .009, size: 3 + Math.random() * 8, color: flowers[i % flowers.length], spin: (Math.random() - .5) * .28, a: Math.random() * Math.PI });
    }
  }

  function drawParticles() {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += .023; p.vx *= .993; p.life -= p.decay; p.a += p.spin;
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life) * .9; ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .62); ctx.restore();
    });
    ctx.restore();
  }

  function updateCopy(fraction) {
    const phase = phases.findIndex(p => fraction <= p.until);
    if (phase === lastPhase) return;
    lastPhase = phase;
    const current = phases[phase];
    copy.classList.remove('visible');
    setTimeout(() => { message.textContent = current.title; subMessage.textContent = current.sub; phaseLabel.textContent = current.name; copy.classList.add('visible'); }, 350);
    if (phase > 0) setTimeout(() => celebration(width * (.38 + Math.random() * .24), height * (.36 + Math.random() * .18), .7), 880);
  }

  function draw(now) {
    if (paused) return;
    const elapsed = (now - startedAt) % DURATION;
    const fraction = elapsed / DURATION;
    const cameraY = fraction * 10000;
    const scale = Math.min(width, height) / 900;
    const tilt = Math.sin(elapsed * .00019) * .065;
    const sky = ctx.createLinearGradient(0, 0, width, height);
    sky.addColorStop(0, '#2d665a'); sky.addColorStop(.52, '#4d937c'); sky.addColorStop(1, '#245c51');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    drawFields(cameraY, scale, tilt);
    drawHills(cameraY, scale, tilt);
    drawRiver(cameraY, scale, tilt, elapsed);
    drawFlowers(cameraY, scale, tilt, elapsed);
    trees.forEach(tree => drawTree(tree, cameraY, scale, tilt, elapsed));
    drawGlyphs(cameraY, scale, tilt, elapsed);
    drawParticles();

    if (elapsed < lastElapsed) lastBurstAt = 0;
    lastElapsed = elapsed;
    progress.style.width = `${fraction * 100}%`;
    timeReadout.textContent = `0${Math.floor(elapsed / 60000)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}`;
    updateCopy(fraction);
    if (elapsed - lastBurstAt > 6000) {
      celebration(width * (.22 + Math.random() * .56), height * (.22 + Math.random() * .48), .72 + Math.random() * .35);
      if (Math.random() > .48) {
        setTimeout(() => celebration(width * (.25 + Math.random() * .5), height * (.26 + Math.random() * .42), .48), 280);
      }
      lastBurstAt = elapsed;
    }
    requestAnimationFrame(draw);
  }

  function setPaused(next) {
    paused = next;
    pauseButton.textContent = paused ? 'RESUME' : 'PAUSE';
    pauseButton.setAttribute('aria-pressed', String(paused));
    if (!paused) { startedAt = performance.now() - pausedAt; requestAnimationFrame(draw); }
    else pausedAt = (performance.now() - startedAt) % DURATION;
  }

  function startFallbackSound() {
    if (fallbackContext) {
      fallbackContext.resume();
      fallbackGain.gain.cancelScheduledValues(fallbackContext.currentTime);
      fallbackGain.gain.setTargetAtTime(.045, fallbackContext.currentTime, .35);
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    fallbackContext = new AudioContext();
    fallbackGain = fallbackContext.createGain();
    fallbackGain.gain.value = .0001;
    const lowPass = fallbackContext.createBiquadFilter();
    lowPass.type = 'lowpass'; lowPass.frequency.value = 850;
    fallbackGain.connect(lowPass); lowPass.connect(fallbackContext.destination);
    [146.83, 220, 293.66].forEach((frequency, index) => {
      const oscillator = fallbackContext.createOscillator();
      oscillator.type = index === 1 ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(fallbackGain);
      oscillator.start();
    });
    const lfo = fallbackContext.createOscillator();
    const lfoGain = fallbackContext.createGain();
    lfo.frequency.value = .09; lfoGain.gain.value = .012;
    lfo.connect(lfoGain); lfoGain.connect(fallbackGain.gain); lfo.start();
    fallbackGain.gain.setTargetAtTime(.045, fallbackContext.currentTime, .45);
  }

  function stopFallbackSound() {
    if (!fallbackContext) return;
    fallbackGain.gain.cancelScheduledValues(fallbackContext.currentTime);
    fallbackGain.gain.setTargetAtTime(.0001, fallbackContext.currentTime, .12);
    setTimeout(() => { if (!soundOn) fallbackContext.suspend(); }, 180);
  }

  function fadeAudioTo(target, duration = 500) {
    const initial = audio.volume;
    const started = performance.now();
    const update = now => {
      const amount = Math.min(1, (now - started) / duration);
      audio.volume = initial + (target - initial) * amount;
      if (amount < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  audio.addEventListener('playing', () => {
    if (!soundOn) return;
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    stopFallbackSound();
    fadeAudioTo(MUSIC_VOLUME, 650);
  });

  function toggleSound() {
    if (soundOn) {
      soundOn = false;
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
      fadeAudioTo(0, 180);
      setTimeout(() => { if (!soundOn) audio.pause(); }, 190);
      stopFallbackSound();
      soundButton.innerHTML = 'SOUND <span>OFF</span>';
      soundButton.setAttribute('aria-pressed', 'false');
      return;
    }
    const startingTime = audio.currentTime;
    soundOn = true;
    soundButton.innerHTML = 'SOUND <span>ON</span>';
    soundButton.setAttribute('aria-pressed', 'true');
    audio.play().catch(() => {});
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (soundOn && (audio.paused || audio.readyState < 2 || audio.currentTime <= startingTime + .01)) {
        audio.pause();
        startFallbackSound();
      }
    }, 1800);
  }

  addEventListener('resize', resize);
  addEventListener('pointermove', event => { pointer.x = (event.clientX / width - .5) * 2; pointer.y = (event.clientY / height - .5) * 2; });
  pauseButton.addEventListener('click', () => setPaused(!paused));
  soundButton.addEventListener('click', toggleSound);
  burstButton.addEventListener('click', () => celebration(width * .5, height * .5, 1.45));
  reduceMotion.addEventListener('change', event => { if (event.matches) setPaused(true); });

  resize();
  setTimeout(() => copy.classList.add('visible'), 700);
  if (reduceMotion.matches) setPaused(true); else requestAnimationFrame(draw);
})();
