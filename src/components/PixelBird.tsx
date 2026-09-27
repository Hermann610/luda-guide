import { useEffect, useRef } from "react";

// 像素小鸟：移植自开源像素小鸟源码（单文件 canvas 游戏）
// 适配：容器内渲染、React 生命周期管理、结束时回调分数
export default function PixelBird({ onGameOver }: { onGameOver?: (score: number) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef<HTMLDivElement>(null);
  const overRef = useRef<HTMLDivElement>(null);
  const finalScoreRef = useRef<HTMLDivElement>(null);
  const bestScoreRef = useRef<HTMLDivElement>(null);
  const newBestRef = useRef<HTMLDivElement>(null);
  const restartRef = useRef<HTMLButtonElement>(null);
  const muteRef = useRef<HTMLButtonElement>(null);
  const cbRef = useRef(onGameOver);
  cbRef.current = onGameOver;

  useEffect(() => {
    const wrap = wrapRef.current!;
    const cvs = cvsRef.current!;
    const ctx = cvs.getContext("2d")!;

    const buf = document.createElement("canvas");
    const bctx = buf.getContext("2d")!;
    bctx.imageSmoothingEnabled = false;

    let DPR = 1, cssW = 1, cssH = 1;
    let VW = 200, VH = 400, groundY = 0;
    const GROUND_H = 34;

    function resize() {
      cssW = wrap.clientWidth || 300;
      cssH = wrap.clientHeight || 500;
      DPR = Math.min(window.devicePixelRatio || 1, 3);

      VW = 200;
      VH = (cssH / cssW) * VW;
      if (VH < 300) { VH = 300; VW = (cssW / cssH) * VH; }
      if (VH > 520) { VH = 520; VW = (cssW / cssH) * VH; }

      VW = Math.round(VW); VH = Math.round(VH);
      buf.width = VW; buf.height = VH;
      bctx.imageSmoothingEnabled = false;

      cvs.width = Math.round(cssW * DPR);
      cvs.height = Math.round(cssH * DPR);

      groundY = VH - GROUND_H;

      for (const p of G.pipes) p.topH = clampTopH(p.topH + PIPE_GAP / 2) - PIPE_GAP / 2;
    }

    const GRAV = 0.40;
    const FLAP = -6.0;
    const MAXV = 9;
    const SPEED = 1.6;
    const PIPE_W = 34;
    const PIPE_GAP = 66;
    const SPACING = 118;
    const BIRD_X = 56;
    const BIRD_W = 17;
    const BIRD_H = 13;
    const BIRD_R = 6;

    const BEST_KEY = "pixelbird.best";

    const G = {
      state: "ready" as "ready" | "playing" | "over",
      birdY: 0, birdV: 0, rot: 0,
      pipes: [] as { x: number; topH: number; scored: boolean }[],
      score: 0, best: 0,
      T: 0, scrollX: 0, cloudX: 0,
      shake: 0, flash: 0, overLock: 0,
    };

    try { G.best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch { G.best = 0; }

    const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    function clampTopH(center: number) {
      const minC = 58 + PIPE_GAP / 2;
      const maxC = groundY - 46 - PIPE_GAP / 2;
      const c = clamp(center, minC, maxC);
      return c - PIPE_GAP / 2;
    }

    function makePipe(x: number) {
      const minC = 58 + PIPE_GAP / 2;
      const maxC = groundY - 46 - PIPE_GAP / 2;
      const c = minC + Math.random() * Math.max(1, maxC - minC);
      return { x, topH: c - PIPE_GAP / 2, scored: false };
    }

    function circleRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) {
      const nx = clamp(cx, rx, rx + rw);
      const ny = clamp(cy, ry, ry + rh);
      const dx = cx - nx, dy = cy - ny;
      return dx * dx + dy * dy < r * r;
    }

    /* ============ 音效 ============ */
    let actx: AudioContext | null = null, muted = false;
    function initAudio() {
      if (!actx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) { try { actx = new AC(); } catch { actx = null; } }
      }
      if (actx && actx.state === "suspended") actx.resume();
    }
    function tone(f1: number, f2: number, dur: number, type: OscillatorType, vol: number) {
      if (!actx || muted) return;
      try {
        const t = actx.currentTime;
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type || "square";
        o.frequency.setValueAtTime(f1, t);
        if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
        g.gain.setValueAtTime(vol || 0.07, t);
        g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
        o.connect(g); g.connect(actx.destination);
        o.start(t); o.stop(t + dur + 0.03);
      } catch { /* 忽略音频错误 */ }
    }
    const sfx = {
      flap: () => tone(520, 780, 0.075, "square", 0.055),
      score: () => { tone(880, 1240, 0.09, "square", 0.065); setTimeout(() => tone(1240, 1560, 0.08, "square", 0.05), 70); },
      hit: () => tone(200, 60, 0.22, "sawtooth", 0.11),
      fall: () => tone(320, 70, 0.40, "triangle", 0.08),
    };

    /* ============ 输入 ============ */
    function press() {
      initAudio();
      if (G.state === "ready") {
        G.state = "playing";
        G.birdV = FLAP;
        G.rot = -0.5;
        G.pipes = [makePipe(VW + 44)];
        sfx.flap();
        readyRef.current?.classList.add("hide");
        return;
      }
      if (G.state === "playing") {
        G.birdV = FLAP;
        sfx.flap();
        return;
      }
      if (G.state === "over") {
        if (G.overLock > 0) return;
        restart();
      }
    }

    function restart() {
      G.state = "playing";
      G.birdY = VH * 0.42;
      G.birdV = FLAP;
      G.rot = -0.5;
      G.pipes = [makePipe(VW + 44)];
      G.score = 0;
      G.shake = 0; G.flash = 0;
      overRef.current?.classList.add("hide");
      sfx.flap();
    }

    function gameOver() {
      G.state = "over";
      G.overLock = 22;
      G.shake = 7;
      G.flash = 1;
      sfx.hit();
      setTimeout(() => sfx.fall(), 90);

      const isNew = G.score > G.best;
      if (isNew) {
        G.best = G.score;
        try { localStorage.setItem(BEST_KEY, String(G.best)); } catch { /* 忽略 */ }
      }
      if (finalScoreRef.current) finalScoreRef.current.textContent = String(G.score);
      if (bestScoreRef.current) bestScoreRef.current.textContent = String(G.best);
      if (newBestRef.current) newBestRef.current.style.display = isNew ? "block" : "none";
      overRef.current?.classList.remove("hide");
      cbRef.current?.(G.score);
    }

    const onPointerDown = (e: PointerEvent) => { e.preventDefault(); press(); };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") { e.preventDefault(); press(); }
    };
    wrap.addEventListener("pointerdown", onPointerDown, { passive: false });
    window.addEventListener("keydown", onKeyDown);

    const restartBtn = restartRef.current!;
    const onRestartDown = (e: PointerEvent) => { e.stopPropagation(); };
    const onRestartClick = (e: MouseEvent) => { e.stopPropagation(); initAudio(); if (G.overLock <= 0) restart(); };
    restartBtn.addEventListener("pointerdown", onRestartDown);
    restartBtn.addEventListener("click", onRestartClick);

    const muteBtn = muteRef.current!;
    const onMuteDown = (e: PointerEvent) => { e.stopPropagation(); };
    const onMuteClick = (e: MouseEvent) => {
      e.stopPropagation();
      muted = !muted;
      muteBtn.classList.toggle("off", muted);
      muteBtn.textContent = muted ? "×" : "♪";
      if (!muted) initAudio();
    };
    muteBtn.addEventListener("pointerdown", onMuteDown);
    muteBtn.addEventListener("click", onMuteClick);

    /* ============ 更新 ============ */
    function update() {
      G.T++;

      G.cloudX += G.state === "playing" ? 0.30 : 0.12;
      if (G.state === "playing") G.scrollX += SPEED;

      if (G.shake > 0) G.shake *= 0.86;
      if (G.flash > 0) G.flash -= 0.08;
      if (G.overLock > 0) G.overLock--;

      if (G.state === "ready") {
        G.birdY = VH * 0.42 + Math.sin(G.T / 17) * 6;
        G.rot = Math.sin(G.T / 17) * 0.14;
        return;
      }

      if (G.state === "playing") {
        G.birdV = Math.min(G.birdV + GRAV, MAXV);
        G.birdY += G.birdV;

        const target = clamp(-0.5 + ((G.birdV + 6) / 15) * 1.65, -0.5, 1.15);
        G.rot = lerp(G.rot, target, 0.22);

        if (G.birdY - BIRD_R < 0) { G.birdY = BIRD_R; G.birdV = 0; }

        const ps = G.pipes;
        for (let i = 0; i < ps.length; i++) ps[i].x -= SPEED;
        while (ps.length && ps[0].x + PIPE_W + 6 < 0) ps.shift();

        const last = ps[ps.length - 1];
        if (!last || last.x < VW - SPACING) ps.push(makePipe(last ? last.x + SPACING : VW + 44));

        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          if (!p.scored && p.x + PIPE_W < BIRD_X - BIRD_R) {
            p.scored = true; G.score++; sfx.score();
          }
        }

        let dead = false;
        if (G.birdY + BIRD_R >= groundY) dead = true;
        if (!dead) {
          for (let i = 0; i < ps.length; i++) {
            const p = ps[i];
            if (p.x > BIRD_X + BIRD_R || p.x + PIPE_W < BIRD_X - BIRD_R) continue;
            if (circleRect(BIRD_X, G.birdY, BIRD_R, p.x, 0, PIPE_W, p.topH) ||
                circleRect(BIRD_X, G.birdY, BIRD_R, p.x, p.topH + PIPE_GAP, PIPE_W, groundY - (p.topH + PIPE_GAP) + 2)) {
              dead = true; break;
            }
          }
        }
        if (dead) { G.birdY = Math.min(G.birdY, groundY - BIRD_R); gameOver(); }
        return;
      }

      if (G.state === "over") {
        G.birdV = Math.min(G.birdV + GRAV, MAXV);
        G.birdY += G.birdV;
        if (G.birdY > groundY - BIRD_R + 1) { G.birdY = groundY - BIRD_R + 1; G.birdV = 0; }
        G.rot = lerp(G.rot, 1.5, 0.18);
      }
    }

    /* ============ 绘制：世界 ============ */
    function drawCloud(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
      c.fillStyle = "rgba(255,255,255,0.82)";
      c.beginPath();
      c.arc(x, y, 7.0 * s, 0, 6.2832);
      c.arc(x + 8 * s, y - 4 * s, 7.5 * s, 0, 6.2832);
      c.arc(x + 17 * s, y - 1 * s, 6.0 * s, 0, 6.2832);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.fillRect(x - 7 * s + 2 * s, y, 24 * s, 5 * s);
    }

    function drawHills(c: CanvasRenderingContext2D) {
      const off1 = (G.scrollX * 0.22) % 96;
      c.fillStyle = "#a9e2a2";
      for (let i = -1; i < Math.ceil(VW / 96) + 2; i++) {
        const bx = i * 96 - off1;
        c.beginPath(); c.arc(bx + 48, groundY + 8, 44, Math.PI, 0); c.fill();
      }
      const off2 = (G.scrollX * 0.40) % 70;
      c.fillStyle = "#8ed189";
      for (let i = -1; i < Math.ceil(VW / 70) + 2; i++) {
        const bx = i * 70 - off2;
        c.beginPath(); c.arc(bx + 35, groundY + 12, 32, Math.PI, 0); c.fill();
      }
    }

    function pipeBody(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, isTop: boolean) {
      if (h <= 0) return;
      const CAP = 12, CEXT = 4;

      c.fillStyle = "#73bf2e"; c.fillRect(x, y, w, h);
      c.fillStyle = "#a9e05a"; c.fillRect(x + 2, y, 5, h);
      c.fillStyle = "#4e8f1c"; c.fillRect(x + w - 7, y, 5, h);
      c.fillStyle = "#2f5c10"; c.fillRect(x, y, 1, h);
      c.fillStyle = "#2f5c10"; c.fillRect(x + w - 1, y, 1, h);

      const cy = isTop ? y + h - CAP : y;
      const cx = x - CEXT, cw = w + CEXT * 2;
      c.fillStyle = "#2f5c10"; c.fillRect(cx, cy - 1, cw, CAP + 2);
      c.fillStyle = "#7fcb33"; c.fillRect(cx + 1, cy, cw - 2, CAP);
      c.fillStyle = "#b4e766"; c.fillRect(cx + 3, cy + 1, 5, CAP - 2);
      c.fillStyle = "#4e8f1c"; c.fillRect(cx + cw - 8, cy + 1, 5, CAP - 2);
    }

    function drawPipes(c: CanvasRenderingContext2D) {
      for (let i = 0; i < G.pipes.length; i++) {
        const p = G.pipes[i];
        const x = Math.round(p.x), th = Math.round(p.topH);
        pipeBody(c, x, 0, PIPE_W, th, true);
        pipeBody(c, x, th + PIPE_GAP, PIPE_W, groundY - (th + PIPE_GAP), false);
      }
    }

    function drawGround(c: CanvasRenderingContext2D) {
      c.fillStyle = "#ded895"; c.fillRect(0, groundY, VW, GROUND_H);

      const off = G.scrollX % 24;
      c.fillStyle = "#cfc882";
      for (let x = -off - 24; x < VW + 24; x += 24) c.fillRect(x, groundY + 9, 12, GROUND_H - 9);
      c.fillStyle = "#c4bd75";
      for (let x = -off + 8 - 24; x < VW + 24; x += 48) c.fillRect(x, groundY + 20, 14, 6);

      c.fillStyle = "#73bf2e"; c.fillRect(0, groundY, VW, 5);
      c.fillStyle = "#5aa82a"; c.fillRect(0, groundY + 5, VW, 3);
      c.fillStyle = "#8fd94a"; c.fillRect(0, groundY, VW, 2);
      c.fillStyle = "#2f5c10"; c.fillRect(0, groundY, VW, 1);
    }

    function drawBird(c: CanvasRenderingContext2D) {
      const wingY = Math.sin(G.T * 0.35) * 2.0;
      c.save();
      c.translate(Math.round(BIRD_X), Math.round(G.birdY));
      c.rotate(G.rot);

      const hw = BIRD_W / 2, hh = BIRD_H / 2;

      c.fillStyle = "#2a1a10";
      c.beginPath(); c.ellipse(0, 0, hw, hh, 0, 0, 6.2832); c.fill();
      c.fillStyle = "#f8e8ac";
      c.beginPath(); c.ellipse(0, 0, hw - 1.2, hh - 1.2, 0, 0, 6.2832); c.fill();
      c.fillStyle = "#fff6cf";
      c.beginPath(); c.ellipse(-1.2, 1.6, hw - 3.4, hh - 3.6, 0, 0, 6.2832); c.fill();

      c.fillStyle = "#2a1a10";
      c.beginPath(); c.ellipse(-2.2, wingY + 0.6, 5.6, 4.0, -0.25, 0, 6.2832); c.fill();
      c.fillStyle = "#eab63e";
      c.beginPath(); c.ellipse(-2.2, wingY + 0.6, 4.6, 3.1, -0.25, 0, 6.2832); c.fill();
      c.fillStyle = "#f6d977";
      c.beginPath(); c.ellipse(-3.0, wingY - 0.2, 3.0, 1.7, -0.25, 0, 6.2832); c.fill();

      c.fillStyle = "#ffffff";
      c.beginPath(); c.arc(3.2, -2.6, 3.5, 0, 6.2832); c.fill();
      c.fillStyle = "#2a1a10";
      c.beginPath(); c.arc(4.1, -2.6, 1.9, 0, 6.2832); c.fill();
      c.fillStyle = "#ffffff";
      c.fillRect(4.4, -3.6, 1.2, 1.2);

      c.fillStyle = "#2a1a10";
      c.beginPath(); c.moveTo(6.4, -1.0); c.lineTo(11.4, 0.6); c.lineTo(6.4, 2.6); c.closePath(); c.fill();
      c.fillStyle = "#f2a23a";
      c.beginPath(); c.moveTo(6.8, -0.4); c.lineTo(10.6, 0.7); c.lineTo(6.8, 2.0); c.closePath(); c.fill();
      c.fillStyle = "#d47c1c";
      c.beginPath(); c.moveTo(6.8, 1.1); c.lineTo(10.6, 0.7); c.lineTo(6.8, 2.0); c.closePath(); c.fill();

      c.restore();
    }

    function drawWorld() {
      const c = bctx;
      c.clearRect(0, 0, VW, VH);

      const g = c.createLinearGradient(0, 0, 0, groundY);
      g.addColorStop(0, "#3fb8c9");
      g.addColorStop(0.55, "#7ad5cf");
      g.addColorStop(1, "#bde9d5");
      c.fillStyle = g; c.fillRect(0, 0, VW, groundY + 1);

      c.fillStyle = "rgba(255,246,207,0.55)";
      c.beginPath(); c.arc(VW - 34, 40, 20, 0, 6.2832); c.fill();
      c.fillStyle = "rgba(255,246,207,0.85)";
      c.beginPath(); c.arc(VW - 34, 40, 13, 0, 6.2832); c.fill();

      const SPAN = VW + 90;
      const baseCloud = [{ x: 10, y: 62, s: 1.0 }, { x: 96, y: 34, s: 0.72 }, { x: 168, y: 96, s: 1.15 }, { x: 236, y: 52, s: 0.85 }];
      const off = G.cloudX % SPAN;
      for (let rep = 0; rep < 2; rep++) {
        for (const b of baseCloud) {
          const x = b.x - off + rep * SPAN;
          if (x > -50 && x < VW + 50) drawCloud(c, x, b.y, b.s);
        }
      }

      drawHills(c);
      drawPipes(c);
      drawGround(c);
      drawBird(c);

      if (G.flash > 0) {
        c.fillStyle = "rgba(255,255,255," + G.flash * 0.6 + ")";
        c.fillRect(0, 0, VW, VH);
      }
    }

    /* ============ 绘制：像素数字 ============ */
    const FONT: Record<string, string[]> = {
      "0": ["111", "101", "101", "101", "111"],
      "1": ["010", "110", "010", "010", "111"],
      "2": ["111", "001", "111", "100", "111"],
      "3": ["111", "001", "111", "001", "111"],
      "4": ["101", "101", "111", "001", "001"],
      "5": ["111", "100", "111", "001", "111"],
      "6": ["111", "100", "111", "101", "111"],
      "7": ["111", "001", "001", "001", "001"],
      "8": ["111", "101", "111", "101", "111"],
      "9": ["111", "101", "111", "001", "111"],
    };

    function textW(txt: string, s: number) { return txt.length * 4 * s - s; }

    function pixelText(c: CanvasRenderingContext2D, txt: string, x: number, y: number, s: number, color: string, align: string) {
      const w = textW(txt, s);
      let sx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
      c.fillStyle = color;
      for (let i = 0; i < txt.length; i++) {
        const gl = FONT[txt[i]];
        if (gl) {
          for (let r = 0; r < 5; r++) {
            for (let col = 0; col < 3; col++) {
              if (gl[r][col] === "1") c.fillRect(Math.round(sx + col * s), Math.round(y + r * s), Math.ceil(s), Math.ceil(s));
            }
          }
        }
        sx += 4 * s;
      }
    }

    function drawUI() {
      if (G.state === "ready") return;

      const s = Math.max(4, Math.round(cssH / 105));
      const cx = cssW / 2;
      const y = Math.round(cssH * 0.055);
      const txt = String(G.score);

      const offs = [[-s, 0], [s, 0], [0, -s], [0, s]];
      for (const o of offs) pixelText(ctx, txt, cx + o[0], y + s + o[1], s, "rgba(42,26,16,0.85)", "center");
      pixelText(ctx, txt, cx, y + s, s, "#2a1a10", "center");
      pixelText(ctx, txt, cx, y, s, "#fff6cf", "center");
    }

    /* ============ 主循环 ============ */
    let lastT = 0, acc = 0;
    const STEP = 1000 / 60;
    let rafId = 0;

    function frame(t: number) {
      rafId = requestAnimationFrame(frame);
      if (!lastT) lastT = t;
      let dt = t - lastT; lastT = t;
      if (dt > 120) dt = 120;
      acc += dt;

      let guard = 0;
      while (acc >= STEP && guard < 5) { update(); acc -= STEP; guard++; }
      if (guard >= 5) acc = 0;

      drawWorld();

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const sh = G.shake > 0.4 ? G.shake : 0;
      const ox = sh ? (Math.random() - 0.5) * sh : 0;
      const oy = sh ? (Math.random() - 0.5) * sh : 0;
      ctx.fillStyle = "#3fb8c9";
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.drawImage(buf, 0, 0, buf.width, buf.height, ox, oy, cssW, cssH);

      drawUI();
    }

    resize();
    G.birdY = VH * 0.42;
    G.birdV = 0;
    rafId = requestAnimationFrame(frame);

    let rzTimer: ReturnType<typeof setTimeout> | null = null;
    function onResize() {
      if (rzTimer) clearTimeout(rzTimer);
      rzTimer = setTimeout(() => { resize(); }, 120);
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      wrap.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      restartBtn.removeEventListener("pointerdown", onRestartDown);
      restartBtn.removeEventListener("click", onRestartClick);
      muteBtn.removeEventListener("pointerdown", onMuteDown);
      muteBtn.removeEventListener("click", onMuteClick);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (rzTimer) clearTimeout(rzTimer);
      if (actx) { try { actx.close(); } catch { /* 忽略 */ } }
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ touchAction: "none", background: "#3fb8c9" }}
    >
      <canvas ref={cvsRef} className="absolute inset-0 w-full h-full block" style={{ imageRendering: "pixelated" }} />

      {/* 开始界面 */}
      <div
        ref={readyRef}
        className="bird-screen absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6 text-white"
        style={{ background: "radial-gradient(ellipse at 50% 42%, rgba(8,30,40,.18) 0%, rgba(8,30,40,.62) 100%)" }}
      >
        <div
          className="font-black tracking-widest leading-tight"
          style={{
            fontSize: "clamp(24px, 9%, 46px)",
            color: "#fff6cf",
            textShadow: "0 3px 0 #2a1a10, 3px 0 0 #2a1a10, -3px 0 0 #2a1a10, 0 -3px 0 #2a1a10",
            fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          }}
        >
          PIXEL BIRD
        </div>
        <div className="text-sm tracking-[.2em] text-sky-50" style={{ textShadow: "0 2px 0 rgba(20,50,60,.55)" }}>
          像素小鸟
        </div>
        <div className="text-xs tracking-[.3em] text-white animate-pulse" style={{ textShadow: "0 2px 0 rgba(20,50,60,.5)" }}>
          点击屏幕起飞
        </div>
      </div>

      {/* 结束界面 */}
      <div
        ref={overRef}
        className="bird-screen hide absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6 text-white"
        style={{ background: "radial-gradient(ellipse at 50% 42%, rgba(8,30,40,.18) 0%, rgba(8,30,40,.62) 100%)" }}
      >
        <div
          className="font-black tracking-widest"
          style={{
            fontSize: "clamp(20px, 7%, 36px)",
            color: "#fff6cf",
            textShadow: "0 3px 0 #2a1a10, 3px 0 0 #2a1a10, -3px 0 0 #2a1a10, 0 -3px 0 #2a1a10",
            fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          }}
        >
          GAME OVER
        </div>
        <div className="flex gap-6 rounded-xl border-[3px] border-[#f6e7ac] bg-[rgba(24,58,68,.86)] px-6 py-4 shadow-lg">
          <div className="flex flex-col gap-1 min-w-[64px]">
            <div className="text-[11px] tracking-[.22em] text-[#9fd8dd]">SCORE</div>
            <div ref={finalScoreRef} className="font-black text-[#fff6cf]" style={{ fontSize: "clamp(22px, 7vw, 32px)" }}>0</div>
          </div>
          <div className="flex flex-col gap-1 min-w-[64px]">
            <div className="text-[11px] tracking-[.22em] text-[#9fd8dd]">BEST</div>
            <div ref={bestScoreRef} className="font-black text-[#fff6cf]" style={{ fontSize: "clamp(22px, 7vw, 32px)" }}>0</div>
          </div>
        </div>
        <div ref={newBestRef} className="text-sm tracking-[.18em] text-[#f6c945]" style={{ display: "none" }}>
          ★ 新纪录 ★
        </div>
        <button
          ref={restartRef}
          className="mt-1 font-black tracking-widest text-[#2a1a10] bg-[#f6c945] border-[3px] border-[#2a1a10] rounded-lg px-7 py-3 shadow-[0_5px_0_#b5891f] active:translate-y-1 active:shadow-[0_1px_0_#b5891f] transition"
        >
          再来一次
        </button>
      </div>

      {/* 声音开关 */}
      <button
        ref={muteRef}
        aria-label="声音开关"
        className="absolute top-3 right-3 w-10 h-10 rounded-lg bg-[rgba(24,58,68,.55)] border-2 border-[rgba(246,231,172,.7)] text-[#fff6cf] text-lg flex items-center justify-center z-10 [&.off]:opacity-40"
      >
        ♪
      </button>
    </div>
  );
}
