/* The maze automaton, run in plain JavaScript from its non-zero weights (js/model-data.js).
 *
 * One step, at every live cell (image value > 0.1), exactly as the TensorFlow.js graph in
 * web-demo-maze/public/model.json computes it:
 *   h1 = ReLU(3x3 conv of the 3-channel state [img, D, ON], zero padded, + b1)     32 units (28 used)
 *   h2 = ReLU(h1 W2 + b2)                                                         16 units (12 used)
 *   [D, ON] += (h2 W3 + b3 + noise) * fire-mask                                   channel 0 (the picture) never changes
 * Walls (image 0) are not cells: they are never updated and read as 0 by their neighbours.
 *
 * Also here: the page's maze helpers (seeded random mazes, breadth-first search), used only to make mazes and to
 * check the automaton's answer, never to compute it.
 */
(function () {
  'use strict';
  const NBR = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function pack(lists, idxOf) {              // sparse lists -> typed arrays, [start, end) per unit
    const start = new Int32Array(lists.length + 1);
    let n = 0;
    lists.forEach((l, i) => { start[i] = n; n += l.length; });
    start[lists.length] = n;
    const idx = new Int32Array(n), w = new Float64Array(n);
    let k = 0;
    lists.forEach(l => l.forEach(t => { idx[k] = idxOf(t); w[k] = t[t.length - 1]; k++; }));
    return { start, idx, w };
  }

  // ---------------------------------------------------------------- random numbers
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussFrom(rand) {
    return function () {
      let u = 0, v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
  }

  // ---------------------------------------------------------------- the automaton, for one weight file
  // (the published model, window.MAZE_MODEL, or the Maze-Hard edition with a pointer register, window.MAZE_HARD_MODEL)
  function makeCA(M) {
  const C = M.channels, H1 = M.hidden1, H2 = M.hidden2, NO = M.outputs;
  const BIG = M.constants.BIG, STEP = M.constants.STEP;
  const P1 = pack(M.l1, t => t[0] * C + t[1]);    // tap * C + channel, tap = (dy+1)*3 + (dx+1)
  const P2 = pack(M.l2, t => t[0]);
  const P3 = pack(M.l3, t => t[0]);
  const B1 = Float64Array.from(M.b1), B2 = Float64Array.from(M.b2), B3 = Float64Array.from(M.b3);
  class MazeCA {
    constructor(h, w, seed) {
      this.H = h; this.W = w === undefined ? h : w;
      const n = this.H * this.W;
      this.state = new Float32Array(n * C);
      this.next = new Float32Array(n * C);
      this.patch = new Float64Array(9 * C);
      this.h1 = new Float64Array(H1);
      this.h2 = new Float64Array(H2);
      this.out = new Float64Array(NO);
      this.noise = 0;          // sigma of the Gaussian added to every register update
      this.fire = 1;           // share of live cells updated per step
      this.steps = 0;
      this.rand = mulberry32(seed === undefined ? 12345 : seed);
      this.gauss = gaussFrom(this.rand);
    }
    idx(y, x) { return y * this.W + x; }
    img(y, x) { return this.state[(y * this.W + x) * C]; }
    D(y, x) { return this.state[(y * this.W + x) * C + 1]; }
    ON(y, x) { return this.state[(y * this.W + x) * C + 2]; }
    // set the picture (Float32Array h*w of the four levels); clear=true zeroes the two registers
    setImage(img, clear) {
      const n = this.H * this.W, s = this.state;
      for (let i = 0; i < n; i++) {
        s[i * C] = img[i];
        if (clear || !(img[i] > 0.1)) for (let c = 1; c < C; c++) s[i * C + c] = 0;
      }
      if (clear) this.steps = 0;
    }
    clearRegisters() { const n = this.H * this.W; for (let i = 0; i < n; i++) for (let c = 1; c < C; c++) this.state[i * C + c] = 0; this.steps = 0; }

    _gather(y, x) {
      const H = this.H, W = this.W, s = this.state, p = this.patch;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
        const yy = y + dy - 1, xx = x + dx - 1, base = (dy * 3 + dx) * C;
        if (yy < 0 || xx < 0 || yy >= H || xx >= W) { for (let c = 0; c < C; c++) p[base + c] = 0; continue; }
        const o = (yy * W + xx) * C;
        for (let c = 0; c < C; c++) p[base + c] = s[o + c];
      }
    }
    _layers() {
      const p = this.patch, h1 = this.h1, h2 = this.h2, out = this.out;
      for (let u = 0; u < H1; u++) {
        let a = B1[u];
        for (let k = P1.start[u]; k < P1.start[u + 1]; k++) a += P1.w[k] * p[P1.idx[k]];
        h1[u] = a > 0 ? a : 0;
      }
      for (let u = 0; u < H2; u++) {
        let a = B2[u];
        for (let k = P2.start[u]; k < P2.start[u + 1]; k++) a += P2.w[k] * h1[P2.idx[k]];
        h2[u] = a > 0 ? a : 0;
      }
      for (let j = 0; j < NO; j++) {
        let a = B3[j];
        for (let k = P3.start[j]; k < P3.start[j + 1]; k++) a += P3.w[k] * h2[P3.idx[k]];
        out[j] = a;
      }
    }
    // everything one cell computes this step, without changing the state (for the inspector)
    probe(y, x) {
      this._gather(y, x); this._layers();
      return { patch: Float64Array.from(this.patch), h1: Float64Array.from(this.h1), h2: Float64Array.from(this.h2),
               delta: Float64Array.from(this.out), live: this.img(y, x) > 0.1 };
    }
    step(n) {
      n = n || 1;
      let changed = 0;
      for (let r = 0; r < n; r++) changed = this._step();
      return changed;
    }
    // one step; returns the number of cells whose registers changed by more than 1e-3
    _step() {
      const H = this.H, W = this.W, s = this.state, nx = this.next;
      nx.set(s);
      let changed = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * C;
        if (!(s[o] > 0.1)) continue;
        if (this.fire < 1 && this.rand() > this.fire) continue;
        this._gather(y, x); this._layers();
        let ch = false;
        for (let j = 0; j < NO; j++) {
          let a = this.out[j];
          if (this.noise) a += this.noise * this.gauss();
          nx[o + 1 + j] = s[o + 1 + j] + a;
          if (Math.abs(a) > 1e-3) ch = true;
        }
        if (ch) changed++;
      }
      this.state = nx; this.next = s;
      this.steps++;
      return changed;
    }
    // what the registers say: the distance read at the start cell, and the cells on the path
    read(start) {
      const n = this.H * this.W, s = this.state;
      let on = 0, flooded = 0;
      for (let i = 0; i < n; i++) {
        if (!(s[i * C] > 0.1)) continue;
        if (s[i * C + 2] > 0.5) on++;
        if (s[i * C + 1] > STEP / 2) flooded++;
      }
      let len = null;
      if (start >= 0 && s[start * C + 1] > STEP / 2) len = Math.round((BIG - s[start * C + 1]) / STEP);
      return { on, flooded, len };
    }
  }
  MazeCA.BIG = BIG; MazeCA.STEP = STEP; MazeCA.C = C; MazeCA.H1 = H1; MazeCA.H2 = H2; MazeCA.model = M;
  return MazeCA;
  }
  const LV = window.MAZE_MODEL.levels;      // wall 0, corridor 0.4, start 0.7, goal 1.0

  // ---------------------------------------------------------------- maze helpers (not used by the automaton)
  function bfs(img, H, W, from) {         // distance in cells through non-wall cells, -1 where unreachable
    const d = new Int32Array(H * W).fill(-1);
    if (from < 0) return d;
    d[from] = 0; let q = [from];
    while (q.length) {
      const nq = [];
      for (const p of q) {
        const y = (p / W) | 0, x = p % W;
        for (const [dy, dx] of NBR) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || xx < 0 || yy >= H || xx >= W) continue;
          const j = yy * W + xx;
          if (img[j] > 0.1 && d[j] < 0) { d[j] = d[p] + 1; nq.push(j); }
        }
      }
      q = nq;
    }
    return d;
  }
  // the reference answer: distance to the goal, the cells on some shortest path, the length
  function solve(img, H, W, start, goal) {
    const dg = bfs(img, H, W, goal), ds = bfs(img, H, W, start);
    const L = start >= 0 && goal >= 0 ? dg[start] : -1;
    const on = new Uint8Array(H * W);
    if (L >= 0) { for (let i = 0; i < H * W; i++) if (dg[i] >= 0 && ds[i] >= 0 && dg[i] + ds[i] === L) on[i] = 1; }
    else if (start >= 0) on[start] = 1;
    return { dg, on, L };
  }
  // depth-first maze, corridors one cell wide (G odd); braid = share of dead ends knocked through (loops).
  // The goal sits at one end of the longest corridor and the start in the middle distance, as in the demo page.
  function randomMaze(G, seed, braid) {
    const rand = mulberry32(seed);
    const img = new Float32Array(G * G);
    const id = (y, x) => y * G + x;
    const ch = (G - 1) / 2;
    const seen = new Uint8Array(ch * ch);
    const stack = [[0, 0]]; seen[0] = 1; img[id(1, 1)] = LV.corridor;
    while (stack.length) {
      const [y, x] = stack[stack.length - 1];
      const opts = NBR.map(([dy, dx]) => [y + dy, x + dx]).filter(([a, b]) => a >= 0 && a < ch && b >= 0 && b < ch && !seen[a * ch + b]);
      if (!opts.length) { stack.pop(); continue; }
      const [a, b] = opts[Math.floor(rand() * opts.length)];
      img[id(1 + 2 * a, 1 + 2 * b)] = LV.corridor; img[id(1 + y + a, 1 + x + b)] = LV.corridor;
      seen[a * ch + b] = 1; stack.push([a, b]);
    }
    if (braid) {
      for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
        if (!(img[id(y, x)] > 0.1)) continue;
        let deg = 0; for (const [dy, dx] of NBR) if (img[id(y + dy, x + dx)] > 0.1) deg++;
        if (deg !== 1 || rand() >= braid) continue;
        const cand = NBR.filter(([dy, dx]) => y + 2 * dy > 0 && y + 2 * dy < G - 1 && x + 2 * dx > 0 && x + 2 * dx < G - 1 &&
          img[id(y + 2 * dy, x + 2 * dx)] > 0.1 && !(img[id(y + dy, x + dx)] > 0.1));
        if (cand.length) { const [dy, dx] = cand[Math.floor(rand() * cand.length)]; img[id(y + dy, x + dx)] = LV.corridor; }
      }
    }
    const far = from => { const d = bfs(img, G, G, from); let b = from, best = -1;
      for (let i = 0; i < G * G; i++) if (d[i] > best) { best = d[i]; b = i; } return b; };
    const goal = far(far(id(1, 1)));
    const d = bfs(img, G, G, goal);
    let best = 0; for (let i = 0; i < G * G; i++) if (d[i] > best) best = d[i];
    const mid = [];
    for (let i = 0; i < G * G; i++) if (d[i] >= 0.45 * best && d[i] <= 0.8 * best) mid.push(i);
    const start = mid.length ? mid[Math.floor(rand() * mid.length)] : far(goal);
    img[start] = LV.start; img[goal] = LV.goal;
    return { img, start, goal, G };
  }
  function emptyMaze(G) {
    const img = new Float32Array(G * G).fill(LV.corridor);
    for (let i = 0; i < G; i++) { img[i] = 0; img[(G - 1) * G + i] = 0; img[i * G] = 0; img[i * G + G - 1] = 0; }
    return img;
  }

  const MazeCA = makeCA(window.MAZE_MODEL);
  window.MazeCA = MazeCA;
  MazeCA.LV = LV; MazeCA.withModel = M => { const K = makeCA(M); K.LV = LV; return K; };
  MazeCA.bfs = bfs; MazeCA.solve = solve; MazeCA.randomMaze = randomMaze; MazeCA.emptyMaze = emptyMaze;
  MazeCA.rng = mulberry32;
})();
