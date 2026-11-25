/* Figures and interactions of the maze blog post. Plain script, no build step, works from disk.
 *
 * Needs, in this order:  models/model-data.js  [models/model-hard-data.js  maze-hard/maze-hard-data.js]  js/automaton.js  js/blog.js
 *
 * Every widget is a function that fills an empty container:   MazeBlog.mountLive('maze-live')  etc.
 * On DOMContentLoaded every container with one of the default ids (MazeBlog.DEFAULT_IDS) is mounted
 * automatically; put  <div id="maze-live"></div>  in the page and it appears. See README.md.
 */
(function () {
  'use strict';
  const MODEL = window.MAZE_MODEL, FIG = window.MAZE_FIG;
  const BIG = MazeCA.BIG, STEP = MazeCA.STEP, LV = MazeCA.LV, C = MazeCA.C;
  const NS = 'http://www.w3.org/2000/svg';
  const css = getComputedStyle(document.documentElement);
  const V = (n, d) => (css.getPropertyValue(n).trim() || d);
  const INK = V('--ink', '#1b1d21'), INK2 = V('--ink2', '#4a4f57'), DIM = V('--dim', '#6b7079'),
    FAINT = V('--faint', '#9aa0a8'), RULE = V('--rule', '#e4e6ea'), ACC = V('--accent', '#0f6e63');
  // categorical slots (checked for colour-blind separation), and the maze colours of the demo page
  const S1 = '#2b5fae', S2 = '#c2531b', S3 = '#0b8f7d', S4 = '#b07a10';
  const KIND_COL = { perfect: S1, braided: S2, rooms: S3, serpentine: S4, sealed: FAINT };
  const MC = { wall: [31, 36, 48], plain: [244, 245, 247], path: [249, 115, 22], start: [22, 163, 74], goal: [162, 28, 175], cold: [226, 228, 233] };
  const PART_COL = { markers: '#7a3fe0', flood: S1, pin: S4, path: S2, 'self-copy': S3, unused: '#c9ccd2' };
  const PART_TXT = {
    markers: 'reads the cell\'s own picture: is it the start, is it the goal',
    flood: 'max of the four neighbours\' D, minus 20 (the flood)',
    pin: 'holds the goal cell\'s D at 25,000',
    path: 'is a neighbour on the path and exactly one step further from the goal?',
    'self-copy': 'replaces the old path flag instead of adding to it',
  };
  const TAPS = ['NW', 'N', 'NE', 'W', 'C', 'E', 'SW', 'S', 'SE'];
  const TAPNAME = ['up-left', 'up', 'up-right', 'left', 'itself', 'right', 'down-left', 'down', 'down-right'];
  const fmt = v => {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    if (Number.isInteger(v)) return v.toLocaleString('en-US');
    const a = Math.abs(v);
    if (a >= 1000) return Math.round(v).toLocaleString('en-US');
    if (a >= 10) return v.toFixed(1).replace(/\.0$/, '');
    return (+v.toPrecision(3)).toString();
  };
  const cellsFrom = D => Math.round((BIG - D) / STEP);

  // ---------------------------------------------------------------- styles (scoped to .mz)
  const STYLE = `
.mz { font: 13px/1.45 var(--sans, -apple-system, "Helvetica Neue", Arial, sans-serif); color: ${INK}; }
.mz * { box-sizing: border-box; }
.mz .mz-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
.mz .mz-sp { flex: 1; }
.mz .pp { display: inline-grid; text-align: center; } .mz .pp > span { grid-area: 1 / 1; } .mz .pp > span.off { visibility: hidden; }
.mz button.mz-b { font-weight: 500; font-size: 12.5px; line-height: 1; font-family: inherit; border: 1px solid ${RULE}; background: #fff; color: ${INK}; border-radius: 8px; padding: 7px 10px; cursor: pointer; }
.mz button.mz-b:hover { border-color: ${FAINT}; }
.mz button.mz-b.yel { background: #fde68a; border-color: #f2c94c; }
.mz button.mz-b.yel:hover { background: #fcd34d; border-color: #d9a91a; }
.mz button.mz-b.blu { background: #dbeafe; border-color: #a9c8f0; }
.mz button.mz-b.blu:hover { background: #bfdbfe; border-color: #7fa6dc; }
.mz button.mz-b.on { background: ${INK}; border-color: ${INK}; color: #fff; }
.mz button.mz-b.acc { background: ${ACC}; border-color: ${ACC}; color: #fff; }
.mz .mz-seg { display: inline-flex; border: 1px solid ${RULE}; border-radius: 8px; overflow: hidden; }
.mz .mz-seg button { font-weight: 500; font-size: 12px; line-height: 1; font-family: inherit; border: 0; border-right: 1px solid ${RULE}; background: #fff; padding: 7px 9px; cursor: pointer; color: ${INK2}; }
.mz .mz-seg button:last-child { border-right: 0; }
.mz .mz-seg button.on { background: ${ACC}; color: #fff; }
.mz select.mz-sel { font-size: 12.5px; font-family: inherit; border: 1px solid ${RULE}; border-radius: 8px; padding: 5px 7px; background: #fff; color: ${INK}; }
.mz label.mz-l { font-size: 12px; color: ${DIM}; display: inline-flex; gap: 6px; align-items: center; }
.mz .mz-stage { position: relative; }
.mz canvas.mz-cv { width: 100%; aspect-ratio: 1; display: block; border-radius: 10px; border: 1px solid ${RULE}; background: #fff; touch-action: none; cursor: crosshair; image-rendering: pixelated; }
.mz .mz-hud { white-space: nowrap; font: 600 12px/1.2 var(--mono, ui-monospace, Menlo, monospace); background: rgba(255,255,255,.9); border: 1px solid ${RULE}; border-radius: 7px; padding: 5px 8px; }
.mz .mz-read { display: flex; gap: 10px; align-items: baseline; margin-top: 8px; min-height: 30px; }
.mz .mz-read b { font-weight: 700; font-size: 22px; line-height: 1.1; white-space: nowrap; }
.mz .mz-read span { font-size: 12px; color: ${DIM}; }
.mz .mz-check { font-size: 12px; color: ${DIM}; margin-top: 8px; }
.mz .mz-check .ok { color: ${S3}; font-weight: 600; } .mz .mz-check .bad { color: ${S2}; font-weight: 600; }
.mz .mz-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: ${INK2}; margin-top: 8px; }
.mz .mz-legend i { display: inline-block; width: 11px; height: 11px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; border: 1px solid rgba(0,0,0,.08); }
.mz-tip { position: fixed; pointer-events: none; z-index: 60; background: #fff; border: 1px solid ${RULE}; border-radius: 8px; box-shadow: 0 6px 22px rgba(0,0,0,.12); padding: 8px 11px; font: 12.5px/1.45 var(--sans, -apple-system, "Helvetica Neue", Arial, sans-serif); color: ${INK}; max-width: 340px; display: none; }
.mz-tip.big { max-width: min(760px, calc(100vw - 16px)); width: 760px; padding: 12px 14px; max-height: calc(100vh - 16px); overflow: hidden; }
.mz-tip.mz.mz-insp.big .mz-nb { max-width: 240px; } .mz-tip.mz.mz-insp.big .mz-nb div { min-height: 34px; padding: 2px; font-size: 10px; line-height: 1.2; }
.mz-tip.mz.mz-insp.big .mz-units { grid-template-columns: repeat(3, 1fr); gap: 0 12px; } .mz-tip.mz.mz-insp.big .mz-u { grid-template-columns: 112px 1fr 44px; gap: 4px; font-size: 10.5px; line-height: 1.35; }
.mz-tip.mz.mz-insp.big .mz-s { margin: 2px 0 0; }
.mz-tip.mz.mz-insp.big h4 { margin: 9px 0 4px; } .mz-tip.mz.mz-insp.big .mz-say { font-size: 12px; }
.mz-tip b { font-weight: 650; } .mz-tip .d { color: ${DIM}; }
.mz svg { display: block; width: 100%; height: auto; overflow: visible; }
.mz svg text { font-family: inherit; }
.mz .mz-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
@media (max-width: 760px) { .mz .mz-grid2 { grid-template-columns: 1fr; } }
.mz .mz-t { font-weight: 700; font-size: 13px; line-height: 1.3; margin: 0 0 2px; }
.mz .mz-s { font-size: 12px; color: ${DIM}; margin: 0 0 8px; }
.mz .mz-hgrid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; align-items: start; }
@media (max-width: 900px) { .mz .mz-hgrid { grid-template-columns: 1fr; } }
.mz .mz-readrow { display: flex; align-items: baseline; gap: 12px; } .mz .mz-readrow .mz-read { flex: 1; min-width: 0; }
.mz a.mz-src { white-space: nowrap; font-size: 12.5px; font-weight: 600; color: ${INK2}; text-decoration: none; border: 1px solid ${RULE}; border-radius: 999px; padding: 4px 10px 4px 11px; background: #fff; display: inline-flex; align-items: center; gap: 2px; }
.mz a.mz-src:hover { border-color: ${FAINT}; color: ${INK}; }
.mz a.mz-src svg { width: 9px; height: 9px; align-self: flex-start; margin: 1px 0 0 2px; }
.mz canvas.mz-mini { width: 100%; display: block; image-rendering: pixelated; cursor: pointer; border-radius: 6px; }
.mz .mz-two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 760px) { .mz .mz-two { grid-template-columns: 1fr; } }
.mz input.mz-num { width: 64px; font: inherit; font-size: 12.5px; padding: 6px 6px; border: 1px solid ${RULE}; border-radius: 8px; }
.mz .mz-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 12px; }
.mz .mz-tiles div { background: #fff; border: 1px solid ${RULE}; border-radius: 10px; padding: 10px 12px; font-size: 12px; color: ${DIM}; }
.mz .mz-tiles b { display: block; font-weight: 700; font-size: 22px; line-height: 1.2; color: ${INK}; }
/* inspector */
.mz.mz-insp .mz-empty { color: ${DIM}; font-style: italic; padding: 24px 6px; text-align: center; }
.mz.mz-insp h4 { font-weight: 700; font-size: 11px; line-height: 1.4; letter-spacing: .1em; text-transform: uppercase; color: ${FAINT}; margin: 12px 0 5px; }
.mz.mz-insp .mz-nb { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; max-width: 300px; }
.mz.mz-insp .mz-nb div { border-radius: 6px; padding: 5px 4px; font: 11px/1.3 var(--mono, ui-monospace, Menlo, monospace); text-align: center; min-height: 52px; display: flex; flex-direction: column; justify-content: center; }
.mz.mz-insp .mz-nb .corner { opacity: .38; }
.mz.mz-insp .mz-nb .me { outline: 2px solid ${S2}; outline-offset: -2px; }
.mz.mz-insp .mz-units { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; }
.mz.mz-insp .mz-u { display: grid; grid-template-columns: 118px 1fr 58px; gap: 6px; align-items: center; font: 11px/1.5 var(--mono, ui-monospace, Menlo, monospace); color: ${INK2}; cursor: default; }
.mz.mz-insp .mz-u .bar { height: 8px; background: #f1f2f4; border-radius: 4px; overflow: hidden; }
.mz.mz-insp .mz-u .bar i { display: block; height: 100%; border-radius: 4px; }
.mz.mz-insp .mz-u .v { text-align: right; }
.mz.mz-insp .mz-u.off { color: ${FAINT}; }
.mz.mz-insp .mz-say { background: #f7f8fa; border: 1px solid ${RULE}; border-radius: 8px; padding: 8px 10px; font-size: 12.5px; color: ${INK2}; }
@media (max-width: 760px) { .mz.mz-insp .mz-units { grid-template-columns: 1fr; } }
/* weights */
.mz.mz-w .mz-wrow { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
.mz.mz-w .mz-side { flex: 1; min-width: 240px; font-size: 12.5px; }
.mz.mz-w .mz-side table { border-collapse: collapse; width: 100%; font: 11.5px/1.4 var(--mono, ui-monospace, Menlo, monospace); }
.mz.mz-w .mz-side td { border-bottom: 1px solid ${RULE}; padding: 3px 4px; }
.mz.mz-w svg rect.cell { cursor: pointer; }
.mz.mz-w svg text.lab { cursor: pointer; }
/* viz */
.mz.mz-viz { position: relative; border-radius: 14px; overflow: hidden; border: 1px solid #25272b; background: #0c0d0f; height: 720px; }
.mz.mz-viz iframe { width: 100%; height: 100%; border: 0; display: block; }
.mz.mz-viz .cover { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; color: #d9d6cf; font-size: 14px; background: #0c0d0f; cursor: pointer; overflow: hidden; }
.mz.mz-viz .cover .poster { position: absolute; inset: -24px; background: #0c0d0f center / cover no-repeat; filter: blur(7px) saturate(1.1); opacity: .9; transition: filter .3s, opacity .3s; }
.mz.mz-viz .cover:hover .poster { filter: blur(4px) saturate(1.15); opacity: 1; }
.mz.mz-viz .cover .card { position: relative; background: rgba(12,13,15,.72); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,.12); border-radius: 18px; padding: 24px 30px 18px; box-shadow: 0 18px 50px rgba(0,0,0,.45); max-width: calc(100% - 40px); }
.mz.mz-viz .cover b { display: block; font-size: 22px; color: #fff; margin-bottom: 6px; }
.mz.mz-viz .cover span.go { display: inline-block; margin-top: 14px; background: #39e6b0; color: #0c0d0f; font-weight: 700; border-radius: 8px; padding: 8px 14px; }
.mz.mz-viz .cover:hover span.go { background: #5ff0c3; }
@media (max-width: 760px) { .mz.mz-viz { height: 600px; } }
`;
  function injectStyle() {
    if (document.getElementById('mz-style')) return;
    const s = document.createElement('style'); s.id = 'mz-style'; s.textContent = STYLE; document.head.appendChild(s);
  }

  // ---------------------------------------------------------------- small DOM / SVG helpers
  // a Play/Pause button whose width never changes: both labels sit in one grid cell, the unused one hidden
  function playLabel(btn, playing) {
    btn.innerHTML = '<span class="pp"><span' + (playing ? ' class="off"' : '') + '>▶ Play</span><span' + (playing ? '' : ' class="off"') + '>❚❚ Pause</span></span>';
  }
  function h(tag, attrs, parent, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k === 'style') e.style.cssText = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function s(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function root(id, cls) {
    injectStyle();
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) throw new Error('MazeBlog: no element #' + id);
    el.innerHTML = '';
    el.classList.add('mz');
    if (cls) cls.split(' ').forEach(c => el.classList.add(c));
    return el;
  }
  let tipEl = null;
  function tip(e, html, big) {
    if (!tipEl) { injectStyle(); tipEl = h('div', { class: 'mz-tip' }, document.body); }
    tipEl.className = big ? 'mz-tip mz mz-insp big' : 'mz-tip';
    tipEl.innerHTML = html; tipEl.style.display = 'block';
    const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 16;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + hh > innerHeight - 8) y = e.clientY - hh - 14;
    x = Math.max(8, x); y = Math.max(8, Math.min(y, innerHeight - hh - 8));
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  const untip = () => { if (tipEl) tipEl.style.display = 'none'; };
  function hover(el, html) {
    el.addEventListener('mousemove', e => tip(e, typeof html === 'function' ? html(e) : html));
    el.addEventListener('mouseleave', untip);
  }
  function seg(parent, items, value, onChange) {
    const box = h('div', { class: 'mz-seg' }, parent);
    items.forEach(([v, label, title]) => {
      const b = h('button', title ? { title } : null, box, label);
      if (v === value) b.classList.add('on');
      b.onclick = () => { box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); onChange(v); };
    });
    return box;
  }
  function legend(parent, items) {
    const l = h('div', { class: 'mz-legend' }, parent);
    items.forEach(([col, txt]) => h('span', null, l, '<i style="background:' + col + '"></i>' + txt));
    return l;
  }
  // scales and axes
  const lin = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
  const logs = (d0, d1, r0, r1) => v => r0 + (Math.log10(v) - Math.log10(d0)) / (Math.log10(d1) - Math.log10(d0)) * (r1 - r0);
  function niceTicks(lo, hi, n) {
    const span = hi - lo, raw = span / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const st = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => span / m <= (n || 5)) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(10));
    return out;
  }
  function axes(svg, o) {
    // o: x0 x1 y0 y1 (pixels), xs ys (scales), xt yt (tick values), xl yl (labels), xf yf (formatters)
    const g = s('g', null, svg);
    (o.yt || []).forEach(v => {
      const y = o.ys(v);
      s('line', { x1: o.x0, x2: o.x1, y1: y, y2: y, stroke: '#eef0f3' }, g);
      s('text', { x: o.x0 - 6, y: y + 3.5, 'text-anchor': 'end', 'font-size': 10.5, fill: DIM }, g, (o.yf || fmt)(v));
    });
    (o.xt || []).forEach(v => {
      const x = o.xs(v);
      s('line', { x1: x, x2: x, y1: o.y1, y2: o.y1 + 4, stroke: FAINT }, g);
      s('text', { x, y: o.y1 + 16, 'text-anchor': 'middle', 'font-size': 10.5, fill: DIM }, g, (o.xf || fmt)(v));
    });
    s('line', { x1: o.x0, x2: o.x1, y1: o.y1, y2: o.y1, stroke: FAINT }, g);
    if (o.xl) s('text', { x: (o.x0 + o.x1) / 2, y: o.y1 + 33, 'text-anchor': 'middle', 'font-size': 11.5, fill: INK2 }, g, o.xl);
    if (o.yl) s('text', { x: 12, y: (o.y0 + o.y1) / 2, transform: 'rotate(-90 12 ' + (o.y0 + o.y1) / 2 + ')', 'text-anchor': 'middle', 'font-size': 11.5, fill: INK2 }, g, o.yl);
    return g;
  }
  const pathD = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
  function visible(el, cb) {           // run cb(isVisible) when the element scrolls in or out of view
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), { threshold: 0.05 }).observe(el);
  }

  // ---------------------------------------------------------------- painting a maze state
  const RAMP = ['#0b3d7a', '#2b5fae', '#7fa6dc', '#dbe6f5'].map(x => [1, 3, 5].map(i => parseInt(x.substr(i, 2), 16)));
  function ramp(t) {
    t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
    const i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i;
    return [0, 1, 2].map(k => Math.round(RAMP[i][k] + (RAMP[i + 1][k] - RAMP[i][k]) * f));
  }
  const BANDS = []; for (let i = 0; i < 12; i++) { const l = 0.91 - 0.13 * (i / 12); BANDS.push([Math.round(255 * (l - 0.1)), Math.round(255 * (l - 0.02)), Math.round(255 * Math.min(1, l + 0.06))]); }
  function paintState(ctx, small, img, state, H, W, view, kmax, stride) {
    const C = stride || MazeCA.C;   // registers per cell: 3, or 4 for the Maze-Hard edition
    const sctx = small.getContext('2d');
    const id = sctx.createImageData(W, H), px = id.data;
    for (let i = 0; i < H * W; i++) {
      const im = img[i], D = state[i * C + 1], on = state[i * C + 2];
      let c;
      if (!(im > 0.1)) c = MC.wall;
      else if (im > 0.85) c = MC.goal;
      else if (im > 0.55) c = MC.start;
      else if (on > 0.5 && view !== 'field-only') c = MC.path;
      else if (view === 'path') c = MC.plain;
      else if (D > STEP / 2) {
        const k = (BIG - D) / STEP;
        c = view === 'bands' ? BANDS[Math.round(k) % 12] : ramp(k / Math.max(1, kmax));
      } else c = view === 'bands' ? MC.plain : MC.cold;
      px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
    }
    sctx.putImageData(id, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(small, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  const MAZE_LEGEND = [['rgb(31,36,48)', 'wall'], ['rgb(22,163,74)', 'start'], ['rgb(162,28,175)', 'goal'],
    ['rgb(249,115,22)', 'ON: on a shortest path'], ['linear-gradient(90deg,#0b3d7a,#dbe6f5)', 'D: near → far from the goal'],
    ['rgb(226,228,233)', 'no distance yet']];

  // =====================================================================================================
  // 1. live maze editor   mountLive(id, {size: 33, seed: 7, braid: 0.15, inspector: 'maze-inspector'})
  // =====================================================================================================
  const LIVE = [];
  function mountLive(id, opts) {
    opts = opts || {};
    const el = root(id, 'mz-live');
    const G = opts.size || 33;
    let seed = opts.seed || 7;
    const braid = opts.braid === undefined ? 0.15 : opts.braid;
    const ca = new MazeCA(G, G, 99);
    const L = { ca, G, img: null, start: -1, goal: -1, sel: null, listeners: [], ref: null, kmax: G * G / 2 };
    let tool = 'insp', playing = opts.autoplay === true, speed = opts.speed || 4, view = 'field', clearOnEdit = true, inView = true, dirty = true, finished = false;

    const stage = h('div', { class: 'mz-stage' }, el);
    const cv = h('canvas', { class: 'mz-cv', width: G * 16, height: G * 16, style: 'cursor:pointer' }, stage);
    const ctx = cv.getContext('2d');
    const small = document.createElement('canvas'); small.width = small.height = G;
    const rd = h('div', { class: 'mz-read' }, el);
    const b1 = h('div', { class: 'mz-bar' }, el);
    const bPlay = h('button', { class: 'mz-b acc' }, b1, '');
    const bStep = h('button', { class: 'mz-b' }, b1, '+1 step');
    const bRe = h('button', { class: 'mz-b yel', title: 'clear the two registers D and ON and start again from step 0' }, b1, '↺ Restart');
    const bNew = h('button', { class: 'mz-b blu' }, b1, 'New maze');
    const bEmpty = h('button', { class: 'mz-b' }, b1, 'Empty room');
    h('span', { class: 'mz-sp' }, b1);
    const lsp = h('label', { class: 'mz-l' }, b1, 'Speed ');
    const sel = h('select', { class: 'mz-sel' }, lsp);
    [1, 2, 4, 8, 16, 32].forEach(v => h('option', { value: v }, sel, v + ' step' + (v > 1 ? 's' : '') + ' / frame'));
    sel.value = speed; sel.onchange = () => { speed = +sel.value; };
    const b2 = h('div', { class: 'mz-bar' }, el);
    seg(b2, [['wall', '▮ Wall'], ['free', '⌫ Corridor'], ['start', '● Start'], ['goal', '◆ Goal'], ['insp', '⌕ Inspect']], tool, v => { tool = v; cv.style.cursor = v === 'insp' ? 'pointer' : 'crosshair'; });
    h('span', { class: 'mz-sp' }, b2);
    const lv = h('label', { class: 'mz-l' }, b2, 'Show ');
    const vsel = h('select', { class: 'mz-sel' }, lv);
    [['field', 'D as a heat map + path'], ['bands', 'D as contour bands + path'], ['field-only', 'D only'], ['path', 'path only']].forEach(([v, t]) => h('option', { value: v }, vsel, t));
    vsel.onchange = () => { view = vsel.value; dirty = true; };
    const b3 = h('div', { class: 'mz-bar' }, el);
    const tg = (label, on, set, title) => {
      const b = h('button', { class: 'mz-b' + (on ? ' on' : ''), title: title || '' }, b3, label);
      b.onclick = () => { on = !on; b.classList.toggle('on', on); set(on, b); };
      return b;
    };
    tg('Noise σ = 0.02', false, on => { ca.noise = on ? 0.02 : 0; }, 'add Gaussian noise to every register update, every step');
    tg('Only half the cells step', false, on => { ca.fire = on ? 0.5 : 1; }, 'each step, every cell updates with probability 1/2');
    tg('Clear registers on edit', true, on => { clearOnEdit = on; }, 'off: an edit keeps D and ON and the automaton repairs itself');
    const chk = h('div', { class: 'mz-check' }, el);
    legend(el, MAZE_LEGEND);

    function setMaze(m) { L.img = m.img; L.start = m.start; L.goal = m.goal; ca.setImage(L.img, true); edited(); }
    function newMaze() { setMaze(MazeCA.randomMaze(G, seed++, braid)); }
    function emptyRoom() {
      const img = MazeCA.emptyMaze(G);
      const st = (G >> 1) * G + 3, go = (G >> 1) * G + G - 4;
      img[st] = LV.start; img[go] = LV.goal; setMaze({ img, start: st, goal: go });
    }
    function edited() {
      L.ref = MazeCA.solve(L.img, G, G, L.start, L.goal);
      let mx = 1; for (let i = 0; i < G * G; i++) if (L.ref.dg[i] > mx) mx = L.ref.dg[i];
      L.kmax = mx; dirty = true; finished = false;
    }
    function paint(y, x) {
      if (y < 0 || x < 0 || y >= G || x >= G) return;
      const i = y * G + x, img = L.img;
      if (tool === 'start' || tool === 'goal') {
        const old = tool === 'start' ? L.start : L.goal;
        if (old >= 0 && old !== i) img[old] = LV.corridor;
        if (i === (tool === 'start' ? L.goal : L.start)) { if (tool === 'start') L.goal = -1; else L.start = -1; }
        img[i] = tool === 'start' ? LV.start : LV.goal;
        if (tool === 'start') L.start = i; else L.goal = i;
      } else {
        if (i === L.start) L.start = -1;
        if (i === L.goal) L.goal = -1;
        img[i] = tool === 'wall' ? LV.wall : LV.corridor;
      }
    }
    function line(y0, x0, y1, x1) {     // four-connected, so a dragged corridor stays connected
      let y = y0, x = x0; paint(y, x);
      while (y !== y1 || x !== x1) { if (Math.abs(y1 - y) >= Math.abs(x1 - x)) y += Math.sign(y1 - y); else x += Math.sign(x1 - x); paint(y, x); }
    }
    const cellOf = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientY - r.top) / r.height * G), Math.floor((e.clientX - r.left) / r.width * G)]; };
    let drawing = false, last = null;
    let hov = null, hoverT = 0, big = false, lastEv = null;   // the cell under the pointer; big = the inspector tooltip is open
    function endHover() { clearTimeout(hoverT); if (big) { L.sel = null; dirty = true; } hov = null; big = false; untip(); }
    L.listeners.push(() => { if (big && hov && lastEv) tip(lastEv, inspectorHTML(L, hov[0], hov[1]), true); });
    cv.addEventListener('pointerdown', e => {
      const [y, x] = cellOf(e);
      if (tool === 'insp') { select(y, x); return; }
      endHover();
      drawing = true; last = null; cv.setPointerCapture(e.pointerId); edit(e); e.preventDefault();
    });
    function edit(e) {
      const [y, x] = cellOf(e);
      if (last && (last[0] !== y || last[1] !== x)) line(last[0], last[1], y, x); else paint(y, x);
      last = [y, x];
      ca.setImage(L.img, clearOnEdit);
      edited();
    }
    cv.addEventListener('pointermove', e => {
      if (drawing) { edit(e); return; }
      const [y, x] = cellOf(e);
      if (y < 0 || x < 0 || y >= G || x >= G) { endHover(); return; }
      lastEv = e;
      if (hov && hov[0] === y && hov[1] === x) { tip(e, big ? inspectorHTML(L, y, x) : cellTip(L, y, x), big); return; }
      endHover(); hov = [y, x];
      tip(e, cellTip(L, y, x));
      hoverT = setTimeout(() => { big = true; L.sel = hov; dirty = true; tip(lastEv, inspectorHTML(L, hov[0], hov[1]), true); }, 500);
    });
    cv.addEventListener('pointerleave', endHover);
    const stop = () => { drawing = false; last = null; };
    cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
    function select(y, x) {
      L.sel = (y >= 0 && x >= 0 && y < G && x < G) ? [y, x] : null; dirty = true;
      L.listeners.forEach(f => f(true));
    }
    L.select = select;
    // the run stops on the step where the path first reaches the goal; Play after that starts again from step 0
    const reached = () => L.goal >= 0 && L.start >= 0 && ca.ON(L.goal / G | 0, L.goal % G) > 0.5;
    function syncPlay() { playLabel(bPlay, playing); }
    bPlay.onclick = () => {
      if (!playing && finished) { ca.clearRegisters(); finished = false; dirty = true; }
      playing = !playing; syncPlay();
    };
    bStep.onclick = () => { playing = false; finished = false; syncPlay(); ca.step(1); dirty = true; L.listeners.forEach(f => f(true)); };
    bRe.onclick = () => { ca.clearRegisters(); finished = false; dirty = true; };
    bNew.onclick = newMaze; bEmpty.onclick = emptyRoom;
    visible(el, v => { inView = v; });

    function readout() {
      const r = ca.read(L.start);
      let big = '–', small = '';
      if (L.goal < 0) small = 'place a goal (◆)';
      else if (L.start < 0) small = 'place a start (●)';
      else if (r.len !== null) {
        big = r.len + ' cells';
        small = 'distance to the goal, read off the start cell\'s D' + (ca.ON(L.goal / G | 0, L.goal % G) > 0.5 ? ' · the path reaches the goal' : ' · tracing the path…');
      } else if (ca.steps > 1260) small = 'no distance reached the start: no path, or longer than ' + Math.round(BIG / STEP) + ' cells';
      else small = 'the wave has not reached the start yet · ' + r.flooded + ' cells hold a distance';
      rd.innerHTML = '<span class="mz-hud">step ' + ca.steps + '</span><b>' + big + '</b><span>' + small + '</span>';
      // the check (breadth-first search, computed by the page, never fed to the automaton)
      if (L.ref && L.start >= 0 && L.goal >= 0) {
        const want = L.ref.on; let wrong = 0;
        for (let i = 0; i < G * G; i++) if (L.img[i] > 0.1 && ((ca.state[i * C + 2] > 0.5) !== !!want[i])) wrong++;
        const Lb = L.ref.L;
        chk.innerHTML = 'Check by breadth-first search (computed by the page, not given to the cells): ' +
          (Lb >= 0 ? 'shortest path <b>' + Lb + '</b> cells, ' : 'no path, ') +
          (wrong === 0 ? '<span class="ok">the ON cells are exactly the cells on a shortest path ✓</span>'
            : '<span class="bad">' + wrong + ' cells still differ</span>') +
          ' · ' + r.on + ' cells on';
      } else chk.textContent = '';
    }
    function draw() {
      paintState(ctx, small, L.img, ca.state, G, G, view, L.kmax);
      if (L.sel) {
        const c = cv.width / G, [y, x] = L.sel;
        ctx.strokeStyle = 'rgba(194,83,27,.85)'; ctx.lineWidth = 2; ctx.strokeRect((x - 1) * c + 1, (y - 1) * c + 1, 3 * c - 2, 3 * c - 2);
        ctx.strokeStyle = '#c2531b'; ctx.lineWidth = 3; ctx.strokeRect(x * c + 1.5, y * c + 1.5, c - 3, c - 3);
      }
      readout();
    }
    let fc = 0;
    function frame() {
      if (inView) {
        if (playing) {
          for (let k = 0; k < speed; k++) {
            const before = reached();
            ca.step(1);
            if (!before && reached()) { playing = false; finished = true; syncPlay(); break; }
          }
          dirty = true;
        }
        if (dirty) { draw(); dirty = false; if (++fc % 3 === 0 || !playing) L.listeners.forEach(f => f(false)); }
      }
      requestAnimationFrame(frame);
    }
    if (opts.maze) setMaze(opts.maze); else newMaze();
    // an interesting default selection for the inspector: a cell on the path, about half way
    const mid = L.ref && L.ref.L > 0 ? (() => { for (let i = 0; i < G * G; i++) if (L.ref.on[i] && L.ref.dg[i] === Math.floor(L.ref.L / 2)) return i; return -1; })() : -1;
    if (mid >= 0 && opts.inspector) L.sel = [mid / G | 0, mid % G];
    draw(); syncPlay();
    requestAnimationFrame(frame);
    L.el = el;
    L.api = { setMaze, newMaze, emptyRoom, select, ca, get state() { return ca.state; }, play: v => { playing = v; syncPlay(); } };
    LIVE.push(L);
    if (opts.inspector) mountInspector(opts.inspector, { source: L });
    return L.api;
  }
  function cellTip(L, y, x) {
    const i = y * L.G + x, im = L.img[i];
    if (!(im > 0.1)) return '<b>wall</b> (' + y + ', ' + x + ')<br><span class="d">not a cell: never computes, reads as 0 to its neighbours</span>';
    const D = L.ca.D(y, x), on = L.ca.ON(y, x);
    const kind = im > 0.85 ? 'goal' : im > 0.55 ? 'start' : 'corridor';
    return '<b>' + kind + '</b> (' + y + ', ' + x + ')<br>img ' + fmt(im) + ' · D ' + fmt(D) +
      (D > STEP / 2 ? ' <span class="d">= ' + cellsFrom(D) + ' cells from the goal</span>' : ' <span class="d">(no distance yet)</span>') +
      '<br>ON ' + fmt(on) + (L.ref && L.ref.dg[i] >= 0 ? '<br><span class="d">BFS: ' + L.ref.dg[i] + ' cells from the goal</span>' : '');
  }

  // =====================================================================================================
  // 2. cell inspector   mountInspector(id, {source})  - follows the live editor; makes its own if there is none
  // =====================================================================================================
  function mountInspector(id, opts) {
    opts = opts || {};
    const el = root(id, 'mz-insp');
    let L = opts.source || LIVE[0];
    if (!L) {           // no live editor on the page: a compact one inside the inspector
      const box = h('div', { style: 'max-width:420px;margin-bottom:12px' }, el);
      mountLive(box, { size: 21, seed: 3, speed: 2 });
      L = LIVE[LIVE.length - 1];
    }
    const body = h('div', null, el);
    let lastKey = '';
    function render(force) {
      if (!L.sel) { body.innerHTML = '<div class="mz-empty">Choose <b>⌕ Inspect</b> and click a cell to see what it reads and which units fire.</div>'; return; }
      const [y, x] = L.sel, ca = L.ca;
      const key = y + ',' + x + ',' + ca.steps + ',' + Array.from(ca.probe(y, x).patch).join(',');
      if (!force && key === lastKey) return;
      lastKey = key;
      body.innerHTML = inspectorHTML(L, y, x);
    }
    L.listeners.push(render);
    render(true);
    return { render };
  }
  // the inspector's content for one cell, as HTML (used by the side panel and the hover tooltip)
  function inspectorHTML(L, y, x) {
      const ca = L.ca, G = L.G;
      const p = ca.probe(y, x);
      const im = ca.img(y, x);
      const kind = !(im > 0.1) ? 'wall' : im > 0.85 ? 'goal' : im > 0.55 ? 'start' : 'corridor';
      let out = '<div class="mz-t">Cell (' + y + ', ' + x + ') · ' + kind + ' · step ' + ca.steps + '</div>';
      if (kind === 'wall') return out + '<div class="mz-empty">A wall is not a cell: it never computes, and its neighbours read 0 from it.</div>';
      out += '<h4>What it reads: its 3 × 3 neighbourhood</h4><div class="mz-nb">';
      for (let t = 0; t < 9; t++) {
        const pi = p.patch[t * 3], pD = p.patch[t * 3 + 1], pON = p.patch[t * 3 + 2];
        const corner = t === 0 || t === 2 || t === 6 || t === 8;
        const yy = y + ((t / 3) | 0) - 1, xx = x + (t % 3) - 1, outside = yy < 0 || xx < 0 || yy >= G || xx >= G;
        let bg, fg = INK;
        if (!(pi > 0.1)) { bg = 'rgb(31,36,48)'; fg = '#9aa0a8'; }
        else if (pi > 0.85) { bg = 'rgb(162,28,175)'; fg = '#fff'; }
        else if (pi > 0.55) { bg = 'rgb(22,163,74)'; fg = '#fff'; }
        else if (pON > 0.5) { bg = 'rgb(249,115,22)'; fg = '#fff'; }
        else bg = '#f4f5f7';
        const txt = !(pi > 0.1) ? (outside ? 'outside<br>reads 0' : 'wall<br>reads 0')
          : 'img ' + fmt(pi) + '<br>D ' + fmt(pD) + '<br>ON ' + fmt(pON);
        out += '<div class="' + (corner ? 'corner' : '') + (t === 4 ? ' me' : '') + '" style="background:' + bg + ';color:' + fg + '" title="' +
          (corner ? 'corner: no weight reads it' : TAPNAME[t]) + '">' + txt + '</div>';
      }
      out += '</div><div class="mz-s" style="margin-top:4px">Faded corners: no weight reads them. Only the cell and its four neighbours matter.</div>';
      out += '<h4>What it decides</h4><div class="mz-say">' + explain(p, ca, y, x, kind) + '</div>';
      const unitRows = (vals, names, parts, n) => {
        let r = '';
        for (let u = 0; u < n; u++) {
          if (!names[u]) continue;
          const v = vals[u], w = v > 0 ? Math.min(100, 12 + 88 * Math.log10(1 + v) / Math.log10(1 + 1.5e5)) : 0;
          r += '<div class="mz-u' + (v > 0 ? '' : ' off') + '" data-u="' + u + '" title="' + (PART_TXT[parts[u]] || '') + '"><span>' + u + ' ' + names[u] + '</span>' +
            '<span class="bar"><i style="width:' + w + '%;background:' + PART_COL[parts[u]] + '"></i></span><span class="v">' + (v > 0 ? fmt(v) : '0') + '</span></div>';
        }
        return r;
      };
      const n1 = MODEL.names1.filter(Boolean).length, n2 = MODEL.names2.filter(Boolean).length;
      const f1 = Array.from(p.h1).filter(v => v > 0).length, f2 = Array.from(p.h2).filter(v => v > 0).length;
      out += '<h4>Layer 1 (3 × 3 convolution, ReLU): ' + f1 + ' of ' + n1 + ' units fire</h4><div class="mz-units">' + unitRows(p.h1, MODEL.names1, MODEL.parts1, MODEL.hidden1) + '</div>';
      out += '<h4>Layer 2 (1 × 1, ReLU): ' + f2 + ' of ' + n2 + ' units fire</h4><div class="mz-units">' + unitRows(p.h2, MODEL.names2, MODEL.parts2, MODEL.hidden2) + '</div>';
      out += '<h4>Update added to the registers (before noise)</h4><div class="mz-units">' +
        '<div class="mz-u"><span>ΔD</span><span></span><span class="v">' + fmt(p.delta[0]) + '</span></div>' +
        '<div class="mz-u"><span>ΔON</span><span></span><span class="v">' + fmt(p.delta[1]) + '</span></div></div>';
      out += '<div class="mz-legend">' + Object.keys(PART_TXT).map(k => '<span><i style="background:' + PART_COL[k] + '"></i>' + k + '</span>').join('') + '</div>';
      return out;
  }
  // plain-language reading of one cell's computation, from the probe (all numbers come from the network)
  function explain(p, ca, y, x, kind) {
    const D = p.patch[4 * 3 + 1], dD = p.delta[0], dON = p.delta[1], ON = p.patch[4 * 3 + 2];
    const newD = D + dD, newON = ON + dON;
    const nb = [[1, 'up'], [7, 'down'], [3, 'left'], [5, 'right']];
    let txt = '';
    if (kind === 'goal') txt += 'The <b>goal</b>: the pin units (pin±) set D to ' + fmt(BIG) + ' and the max-of-four is muted here. ';
    else {
      const live = nb.filter(([t]) => p.patch[t * 3] > 0.1);
      const best = live.length ? live.reduce((a, b) => p.patch[b[0] * 3 + 1] > p.patch[a[0] * 3 + 1] ? b : a) : null;
      if (best) {
        const bv = p.patch[best[0] * 3 + 1];
        txt += 'Largest neighbouring D: <b>' + fmt(bv) + '</b> (' + best[1] + '), so the flood units give D ← ' + fmt(bv) + ' − 20 = <b>' + fmt(newD) + '</b>' +
          (newD > STEP / 2 ? ' = ' + cellsFrom(newD) + ' cells from the goal. ' : ': no distance has arrived here yet. ');
      } else txt += 'No live neighbour: D drops by 20 each step. ';
    }
    const adv = [6, 7, 8, 9].filter(u => p.h2[u] > 0.5);
    if (kind === 'start') txt += 'The <b>start</b> switches its own path flag on (is_start). ';
    else if (adv.length) txt += 'Path: neighbour ' + adv.map(u => ['up', 'down', 'left', 'right'][u - 6]).join(' and ') + ' is ON and exactly one step further from the goal, so ON ← <b>1</b>. ';
    else txt += 'Path: no neighbour is ON and one step further from the goal' + (D <= STEP / 2 ? ' (and this cell has no distance yet, which blocks the test)' : '') + ', so ON ← <b>' + fmt(Math.max(0, newON)) + '</b>. ';
    return txt;
  }

  // =====================================================================================================
  // 3. the wave, step by step   mountWave(id, {size: 33, seed: 11})
  // =====================================================================================================
  function mountWave(id, opts) {
    opts = opts || {};
    const el = root(id, 'mz-wave');
    const G = opts.size || 33;
    const m = MazeCA.randomMaze(G, opts.seed || 11, 0);
    const ref = MazeCA.solve(m.img, G, G, m.start, m.goal);
    const T = 2 * ref.L + 30;
    const ca = new MazeCA(G, G); ca.setImage(m.img, true);
    const n = G * G;
    const K = new Int16Array((T + 1) * n), O = new Uint8Array((T + 1) * n), known = [], onc = [];
    const rec = t => {
      let kn = 0, oc = 0;
      for (let i = 0; i < n; i++) {
        const D = ca.state[i * C + 1], on = ca.state[i * C + 2] > 0.5 && m.img[i] > 0.1;
        K[t * n + i] = (m.img[i] > 0.1 && D > STEP / 2) ? cellsFrom(D) : -1; O[t * n + i] = on ? 1 : 0;
        if (K[t * n + i] >= 0) kn++; if (on) oc++;
      }
      known.push(kn); onc.push(oc);
    };
    rec(0); for (let t = 1; t <= T; t++) { ca.step(1); rec(t); }
    let kmax = 1; for (let i = 0; i < n; i++) if (ref.dg[i] > kmax) kmax = ref.dg[i];
    const live = Array.from(m.img).filter(v => v > 0.1).length;
    const g = h('div', { class: 'mz-grid2' }, el);
    const left = h('div', null, g), right = h('div', null, g);
    const stage = h('div', { class: 'mz-stage' }, left);
    const cv = h('canvas', { class: 'mz-cv', width: G * 12, height: G * 12, style: 'cursor:default' }, stage);
    const ctx = cv.getContext('2d'), small = document.createElement('canvas'); small.width = small.height = G;
    h('div', { class: 'mz-t' }, right, 'What the cells know at step t');
    h('div', { class: 'mz-s' }, right, 'Maze ' + G + ' × ' + G + ', shortest path ' + ref.L + ' cells, ' + live + ' corridor cells. The marks on the time line are t = L + 1 (the wave reaches the start) and t = 2L + 1 (the path is complete).');
    const svg = s('svg', { viewBox: '0 0 440 230' }, right);
    const X0 = 50, X1 = 430, Y0 = 10, Y1 = 180;
    const xs = lin(0, T, X0, X1), ys = lin(0, live, Y1, Y0);
    axes(svg, { x0: X0, x1: X1, y0: Y0, y1: Y1, xs, ys, xt: niceTicks(0, T, 6), yt: niceTicks(0, live, 4), xl: 'step t', yl: 'cells' });
    s('path', { d: pathD(known.map((v, t) => [xs(t), ys(v)])), fill: 'none', stroke: S1, 'stroke-width': 2 }, svg);
    s('path', { d: pathD(onc.map((v, t) => [xs(t), ys(v)])), fill: 'none', stroke: 'rgb(249,115,22)', 'stroke-width': 2 }, svg);
    [[ref.L + 1, 'L + 1'], [2 * ref.L + 1, '2L + 1']].forEach(([t, lab]) => {
      s('line', { x1: xs(t), x2: xs(t), y1: Y0, y2: Y1, stroke: FAINT, 'stroke-dasharray': '3 3' }, svg);
      s('text', { x: xs(t) + 3, y: Y0 + 10, 'font-size': 10, fill: DIM }, svg, lab);
    });
    const cur = s('line', { y1: Y0, y2: Y1, stroke: INK, 'stroke-width': 1.2 }, svg);
    legend(right, [[S1, 'cells holding a distance'], ['rgb(249,115,22)', 'cells on the path']]);
    const bar = h('div', { class: 'mz-bar' }, el);
    const bp = h('button', { class: 'mz-b acc' }, bar, ''); playLabel(bp, false);
    const rg = h('input', { type: 'range', min: 0, max: T, value: 0, style: 'flex:1;min-width:200px;accent-color:' + ACC }, bar);
    const lab = h('span', { class: 'mz-l', style: 'min-width:240px' }, bar);
    let t = 0, playing = false, inView = true;
    function show() {
      const st = new Float32Array(n * C);
      for (let i = 0; i < n; i++) { const k = K[t * n + i]; st[i * C + 1] = k >= 0 ? BIG - STEP * k : 0; st[i * C + 2] = O[t * n + i]; }
      paintState(ctx, small, m.img, st, G, G, 'field', kmax);
      cur.setAttribute('x1', xs(t)); cur.setAttribute('x2', xs(t));
      rg.value = t;
      lab.innerHTML = '<b>step ' + t + '</b> · ' + known[t] + ' cells know their distance · ' + onc[t] + ' on the path' +
        (t >= 1 && t <= kmax + 1 ? ' · front at ' + (t - 1) + ' cells from the goal' : '');
    }
    rg.oninput = () => { t = +rg.value; playing = false; playLabel(bp, false); show(); };
    bp.onclick = () => { playing = !playing; if (playing && t >= T) t = 0; playLabel(bp, playing); };
    hover(svg, e => {
      const r = svg.getBoundingClientRect(), tt = Math.round((e.clientX - r.left) / r.width * 440 - X0) / (X1 - X0) * T;
      const k = Math.max(0, Math.min(T, Math.round(tt)));
      return '<b>step ' + k + '</b><br>' + known[k] + ' cells hold a distance<br>' + onc[k] + ' cells on the path';
    });
    svg.addEventListener('click', e => { const r = svg.getBoundingClientRect(); t = Math.max(0, Math.min(T, Math.round(((e.clientX - r.left) / r.width * 440 - X0) / (X1 - X0) * T))); show(); });
    visible(el, v => { inView = v; });
    (function loop() { if (playing && inView) { t = Math.min(T, t + 2); if (t >= T) { playing = false; playLabel(bp, false); } show(); } requestAnimationFrame(loop); })();
    show();
  }

  // =====================================================================================================
  // 4. settling time against path length   mountSettle(id)
  // =====================================================================================================
  function mountSettle(id) {
    const el = root(id, 'mz-chart');
    const S = FIG.settle, pts = S.points;
    let mode = 't_path';
    const bar = h('div', { class: 'mz-bar', style: 'margin:0 0 6px' }, el);
    seg(bar, [['t_path', 'path complete'], ['t_reach', 'wave reaches the start'], ['t_field', 'every D exact']], mode, v => { mode = v; draw(); });
    const svg = s('svg', { viewBox: '0 0 700 330' }, el);
    const cap = h('div', { class: 'mz-s', style: 'margin-top:4px' }, el);
    legend(el, Object.keys(KIND_COL).filter(k => k !== 'sealed').map(k => [KIND_COL[k], k]));
    function draw() {
      svg.innerHTML = '';
      const X0 = 60, X1 = 680, Y0 = 12, Y1 = 280;
      const xk = mode === 't_field' ? 'ecc' : 'L';
      const xmax = Math.max(...pts.map(p => p[xk])) * 1.03, ymax = Math.max(...pts.map(p => p[mode])) * 1.05;
      const xs = lin(0, xmax, X0, X1), ys = lin(0, ymax, Y1, Y0);
      axes(svg, { x0: X0, x1: X1, y0: Y0, y1: Y1, xs, ys, xt: niceTicks(0, xmax, 7), yt: niceTicks(0, ymax, 5),
        xl: mode === 't_field' ? 'farthest reachable cell from the goal (cells)' : 'shortest path length L (cells)', yl: 'steps' });
      const f = S.fits[mode], a = f.slope, b = f.intercept;
      s('line', { x1: xs(0), y1: ys(b), x2: xs(xmax), y2: ys(a * xmax + b), stroke: RULE, 'stroke-width': 7, 'stroke-linecap': 'round' }, svg);
      pts.forEach(p => {
        const c = s('circle', { cx: xs(p[xk]), cy: ys(p[mode]), r: 4.2, fill: KIND_COL[p.kind], stroke: '#fff', 'stroke-width': 1.2 }, svg);
        hover(c, '<b>' + p.kind + ' ' + p.size + ' × ' + p.size + '</b><br>shortest path <b>' + p.L + '</b> cells; farthest cell ' + p.ecc +
          '<br>wave reaches the start: step ' + p.t_reach + '<br>path complete: step ' + p.t_path + '<br>every D exact: step ' + p.t_field);
      });
      const v = mode === 't_field' ? 'd' : 'L';
      s('text', { x: X0 + 12, y: Y0 + 14, 'font-size': 12.5, fill: INK, 'font-weight': 600 }, svg,
        't = ' + a.toFixed(2) + ' ' + v + ' + ' + b.toFixed(2) + '   (largest deviation ' + f.max_residual.toExponential(0) + ' steps)');
      cap.textContent = S.n + ' solvable mazes, sizes 17 to 49 (perfect, braided, rooms, serpentine). ' +
        (mode === 't_path' ? 'The wave needs L steps to reach the start and the path another L to grow back to the goal.' :
          mode === 't_reach' ? 'A value travels exactly one corridor cell per step: the start learns its distance at step L + 1.' :
            'The last cell to learn its distance is the farthest one, one step per cell.');
    }
    draw();
  }

  // =====================================================================================================
  // 5. correctness against breadth-first search   mountCorrectness(id)
  // =====================================================================================================
  function mountCorrectness(id) {
    const el = root(id, 'mz-chart');
    const Cc = FIG.correctness;
    h('div', { class: 'mz-tiles', style: 'margin:0 0 12px' }, el,
      '<div><b>' + Cc.ok + ' / ' + Cc.n + '</b>mazes solved exactly: every D, the path set, the length read off the start</div>' +
      '<div><b>' + Cc.cells_ahead_of_wave + '</b>cells ever ahead of the breadth-first front</div>' +
      '<div><b>' + fmt(Cc.longest_path) + '</b>cells in the longest path solved (49 × 49 serpentine)</div>');
    const kinds = ['perfect', 'braided', 'rooms', 'serpentine', 'sealed'];
    const sizes = Cc.sizes;
    const svg = s('svg', { viewBox: '0 0 700 ' + (40 + kinds.length * 44) }, el);
    const X0 = 120, cw = (680 - X0) / sizes.length;
    sizes.forEach((z, j) => s('text', { x: X0 + cw * (j + 0.5), y: 18, 'text-anchor': 'middle', 'font-size': 11.5, fill: DIM }, svg, z + ' × ' + z));
    kinds.forEach((k, i) => {
      const y = 30 + i * 44;
      s('text', { x: X0 - 12, y: y + 24, 'text-anchor': 'end', 'font-size': 12, fill: INK }, svg, k === 'sealed' ? 'sealed goal' : k);
      sizes.forEach((z, j) => {
        const rows = Cc.rows.filter(r => r.kind === k && r.size === z);
        if (!rows.length) return;
        const ok = rows.filter(r => r.ok).length;
        const g = s('g', null, svg);
        s('rect', { x: X0 + cw * j + 3, y, width: cw - 6, height: 38, rx: 7, fill: ok === rows.length ? '#e3f1ee' : '#fbeee6', stroke: ok === rows.length ? '#bfe0d9' : '#f0c9b3' }, g);
        s('text', { x: X0 + cw * (j + 0.5), y: y + 24, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 650, fill: INK }, g, ok + ' / ' + rows.length + (ok === rows.length ? ' ✓' : ''));
        hover(g, '<b>' + k + ' ' + z + ' × ' + z + '</b><br>' + rows.map(r =>
          (r.path_len === null ? 'no path: ' + r.on_cells + ' cell on (the start)' : 'path ' + r.path_len + ', complete at step ' + r.t_path) + (r.ok ? ' ✓' : ' ✗')).join('<br>'));
      });
    });
    h('div', { class: 'mz-s', style: 'margin-top:6px' }, el, 'Each box: mazes whose distance field equals BFS everywhere, whose ON cells are exactly the cells on some shortest path, and whose start cell reads the exact length. Half of the start/goal pairs are placed far apart, half at random. Sealed goal: the goal is walled off, so only the start may be on.');
  }

  // =====================================================================================================
  // 6. noise against the tolerance   mountNoise(id)
  // =====================================================================================================
  function mountNoise(id) {
    const el = root(id, 'mz-chart');
    const N = FIG.noise, T = N.table;
    const g = h('div', { class: 'mz-grid2' }, el);
    const a = h('div', null, g), b = h('div', null, g);
    h('div', { class: 'mz-t' }, a, 'Worst error against the tolerance');
    h('div', { class: 'mz-s' }, a, 'Noise σ added to every register at every step, on ' + N.mazes.length + ' mazes of about 300 cells. Dots: mazes still solved exactly (of ' + T[0].of + ').');
    const svg = s('svg', { viewBox: '0 0 440 280' }, a);
    const X0 = 50, X1 = 430, Y0 = 10, Y1 = 220, smax = T[T.length - 1].sigma;
    const xs = lin(0, smax, X0, X1), ys = lin(0, 18, Y1, Y0);
    s('rect', { x: X0, y: ys(18), width: X1 - X0, height: ys(N.tol) - ys(18), fill: '#fbeee6' }, svg);
    axes(svg, { x0: X0, x1: X1, y0: Y0, y1: Y1, xs, ys, xt: [0, 0.05, 0.1, 0.15, 0.2], yt: [0, 3, 6, 9, 12, 15, 18], xl: 'noise σ', yl: 'potential units' });
    s('line', { x1: X0, x2: X1, y1: ys(N.tol), y2: ys(N.tol), stroke: S2, 'stroke-dasharray': '5 4' }, svg);
    s('text', { x: X1 - 4, y: ys(N.tol) + 14, 'text-anchor': 'end', 'font-size': 10.5, fill: S2 }, svg, 'TOL = ' + N.tol + ': the one-step path test fails above this line');
    s('text', { x: X0 - 6, y: Y1 + 46, 'text-anchor': 'end', 'font-size': 9.5, fill: DIM }, svg, 'solved');
    [['max_step_err', S1], ['max_drift', S3]].forEach(([k, col]) => {
      s('path', { d: pathD(T.map(r => [xs(r.sigma), ys(r[k])])), fill: 'none', stroke: col, 'stroke-width': 2 }, svg);
      T.forEach(r => s('circle', { cx: xs(r.sigma), cy: ys(r[k]), r: 3.6, fill: col, stroke: '#fff' }, svg));
    });
    T.forEach(r => {
      const x = xs(r.sigma);
      s('text', { x, y: Y1 + 46, 'text-anchor': 'middle', 'font-size': 9.5, fill: r.solved === r.of ? S3 : S2, 'font-weight': 600 }, svg, r.solved);
      const hit = s('rect', { x: x - 9, y: Y0, width: 18, height: Y1 - Y0, fill: 'transparent' }, svg);
      hover(hit, '<b>σ = ' + r.sigma + '</b><br>step error ' + fmt(r.max_step_err) + ' (TOL ' + N.tol + ')<br>drift of D ' + fmt(r.max_drift) +
        '<br>solved exactly: <b>' + r.solved + ' / ' + r.of + '</b><br><span class="d">share of the last 100 steps exact: ' + Math.round(100 * r.mean_exact_share) + '%</span>');
    });
    legend(a, [[S1, 'step error |D[u] − D[v] − 20| on the path'], [S3, 'drift |D − ideal|']]);
    const G = N.growth, P = G.profile;
    h('div', { class: 'mz-t' }, b, 'Why: the error grows like √distance');
    h('div', { class: 'mz-s' }, b, 'Each cell copies a neighbour that is already noisy, so the error at d cells from the goal is a sum of d noise draws. ' + G.maze + ', σ = ' + G.sigma + '. Grey: theory.');
    const sv2 = s('svg', { viewBox: '0 0 440 280' }, b);
    const dmax = P[P.length - 1].d * 1.03, ymax = Math.max(...P.map(p => Math.max(p.diff_std, p.theory_diff))) * 1.1;
    const xs2 = lin(0, dmax, X0, X1), ys2 = lin(0, ymax, Y1, Y0);
    axes(sv2, { x0: X0, x1: X1, y0: Y0, y1: Y1, xs: xs2, ys: ys2, xt: niceTicks(0, dmax, 5), yt: niceTicks(0, ymax, 5), xl: 'distance from the goal d (cells)', yl: 'std of the error' });
    [['theory_diff', 'diff_std', S1], ['theory_value', 'value_std', S3]].forEach(([th, me, col]) => {
      s('path', { d: pathD(P.map(p => [xs2(p.d), ys2(p[th])])), fill: 'none', stroke: RULE, 'stroke-width': 7, 'stroke-linecap': 'round' }, sv2);
      s('path', { d: pathD(P.map(p => [xs2(p.d), ys2(p[me])])), fill: 'none', stroke: col, 'stroke-width': 2 }, sv2);
      P.forEach(p => { const c = s('circle', { cx: xs2(p.d), cy: ys2(p[me]), r: 3.4, fill: col, stroke: '#fff' }, sv2);
        hover(c, '<b>d ≈ ' + Math.round(p.d) + '</b><br>measured ' + fmt(p[me]) + '<br>theory ' + fmt(p[th])); });
    });
    legend(b, [[S1, 'neighbour difference, theory σ√(2d)'], [S3, 'value, theory σ√d']]);
  }

  // =====================================================================================================
  // 7. update share (asynchronous cells)   mountFire(id)
  // =====================================================================================================
  function mountFire(id) {
    const el = root(id, 'mz-chart');
    const F = FIG.fire;
    const svg = s('svg', { viewBox: '0 0 440 230' }, el);
    const X0 = 60, X1 = 430, Y0 = 16, Y1 = 180, ymax = Math.max(...F.map(f => Math.max(...f.t_path))) * 1.05;
    const ys = lin(0, ymax, Y1, Y0), bw = (X1 - X0) / F.length;
    axes(svg, { x0: X0, x1: X1, y0: Y0, y1: Y1, xs: v => v, ys, xt: [], yt: niceTicks(0, ymax, 5), yl: 'steps to the exact path', xl: 'share of the cells updated at each step' });
    F.forEach((f, i) => {
      const cx = X0 + bw * (i + 0.5);
      s('rect', { x: cx - bw * 0.3, y: ys(f.median_t_path), width: bw * 0.6, height: Y1 - ys(f.median_t_path), rx: 4, fill: S1 }, svg);
      f.t_path.forEach((t, j) => s('circle', { cx: cx - bw * 0.22 + j * bw * 0.44 / 7, cy: ys(t), r: 2.4, fill: '#fff', stroke: INK2 }, svg));
      s('text', { x: cx, y: Y1 + 16, 'text-anchor': 'middle', 'font-size': 11, fill: DIM }, svg, Math.round(f.fire * 100) + '%');
      s('text', { x: cx, y: ys(Math.max(...f.t_path)) - 8, 'text-anchor': 'middle', 'font-size': 11, fill: INK, 'font-weight': 600 }, svg, f.solved + '/' + f.of + ' ✓');
      const hit = s('rect', { x: cx - bw / 2, y: Y0, width: bw, height: Y1 - Y0, fill: 'transparent' }, svg);
      hover(hit, '<b>update share ' + f.fire + '</b><br>median ' + fmt(f.median_t_path) + ' steps to the exact path<br>' + f.solved + ' of ' + f.of + ' mazes exact');
    });
    h('div', { class: 'mz-s' }, el, 'Bars: median steps until the path is exact, when each cell updates with this probability at each step (dots: the 8 mazes). The cells do not have to step together; they only take longer to agree.');
  }

  // =====================================================================================================
  // 8. self-repair after an edit   mountRepair(id)
  // =====================================================================================================
  function mountRepair(id) {
    const el = root(id, 'mz-chart');
    const Rp = FIG.repair, ex = Rp.example;
    const g = h('div', { class: 'mz-grid2' }, el);
    const a = h('div', null, g), b = h('div', null, g);
    h('div', { class: 'mz-t' }, a, 'Cells wrong after one edit (registers kept)');
    h('div', { class: 'mz-s' }, a, 'A settled braided 33 × 33 maze; one wall cell opened (shortcut) or one path cell walled (detour). Solid: path flags; dotted: distances.');
    const svg = s('svg', { viewBox: '0 0 440 260' }, a);
    const X0 = 50, X1 = 430, Y0 = 10, Y1 = 210;
    const tmax = Math.max(Rp.rows.filter(r => r.maze === ex.maze).reduce((m, r) => Math.max(m, r.t_path_keep, r.t_field_keep), 0) + 20, 60);
    const ymax = Math.max(...['open', 'close'].map(k => Math.max(...ex[k].wrong_on.slice(0, tmax), ...ex[k].wrong_d.slice(0, tmax)))) * 1.08;
    const xs = lin(0, tmax, X0, X1), ys = lin(0, ymax, Y1, Y0);
    axes(svg, { x0: X0, x1: X1, y0: Y0, y1: Y1, xs, ys, xt: niceTicks(0, tmax, 6), yt: niceTicks(0, ymax, 5), xl: 'steps after the edit', yl: 'cells wrong' });
    [['open', S1], ['close', S2]].forEach(([k, col]) => {
      const e = ex[k];
      s('path', { d: pathD(e.wrong_on.slice(0, tmax).map((v, t) => [xs(t + 1), ys(v)])), fill: 'none', stroke: col, 'stroke-width': 2 }, svg);
      s('path', { d: pathD(e.wrong_d.slice(0, tmax).map((v, t) => [xs(t + 1), ys(v)])), fill: 'none', stroke: col, 'stroke-width': 1.5, 'stroke-dasharray': '2 3' }, svg);
    });
    const cur = s('line', { y1: Y0, y2: Y1, stroke: INK, 'stroke-width': 1, opacity: 0 }, svg);
    hover(svg, e => {
      const r = svg.getBoundingClientRect(), t = Math.max(1, Math.min(tmax, Math.round(((e.clientX - r.left) / r.width * 440 - X0) / (X1 - X0) * tmax)));
      cur.setAttribute('x1', xs(t)); cur.setAttribute('x2', xs(t)); cur.setAttribute('opacity', 0.5);
      return '<b>' + t + ' steps after the edit</b><br>shortcut: ' + ex.open.wrong_on[t - 1] + ' path cells, ' + ex.open.wrong_d[t - 1] + ' distances wrong' +
        '<br>detour: ' + ex.close.wrong_on[t - 1] + ' path cells, ' + ex.close.wrong_d[t - 1] + ' distances wrong';
    });
    svg.addEventListener('mouseleave', () => cur.setAttribute('opacity', 0));
    legend(a, [[S1, 'shortcut: path ' + ex.open.L_before + ' → ' + ex.open.L_after], [S2, 'detour: path ' + ex.close.L_before + ' → ' + ex.close.L_after]]);
    h('div', { class: 'mz-t' }, b, 'Keep the old state, or start again?');
    h('div', { class: 'mz-s' }, b, 'Steps to the new exact path for ' + Rp.rows.length + ' edits on 12 mazes. Below the diagonal the old registers help.');
    const sv2 = s('svg', { viewBox: '0 0 440 260' }, b);
    const m = Math.max(...Rp.rows.map(r => Math.max(r.t_path_keep, r.t_path_cleared))) * 1.08;
    const xs2 = lin(0, m, X0, X1), ys2 = lin(0, m, Y1, Y0);
    axes(sv2, { x0: X0, x1: X1, y0: Y0, y1: Y1, xs: xs2, ys: ys2, xt: niceTicks(0, m, 5), yt: niceTicks(0, m, 5), xl: 'from cleared registers', yl: 'continuing from the old state' });
    s('line', { x1: xs2(0), y1: ys2(0), x2: xs2(m), y2: ys2(m), stroke: RULE, 'stroke-width': 6, 'stroke-linecap': 'round' }, sv2);
    Rp.rows.forEach(r => {
      const col = r.edit === 'open' ? S1 : S2;
      const mk = r.edit === 'open' ? s('circle', { cx: xs2(r.t_path_cleared), cy: ys2(r.t_path_keep), r: 4.5, fill: col, stroke: '#fff' }, sv2)
        : s('rect', { x: xs2(r.t_path_cleared) - 4, y: ys2(r.t_path_keep) - 4, width: 8, height: 8, fill: col, stroke: '#fff' }, sv2);
      hover(mk, '<b>maze ' + r.maze + ', ' + (r.edit === 'open' ? 'wall opened' : 'corridor closed') + ' at (' + r.cell.join(', ') + ')</b><br>path ' + r.L_before + ' → ' + r.L_after +
        '<br>kept registers: path exact after ' + r.t_path_keep + ' steps, every D after ' + r.t_field_keep +
        '<br>cleared registers: path exact after ' + r.t_path_cleared + ' steps');
    });
    legend(b, [[S1, 'wall opened (●)'], [S2, 'corridor closed (■)']]);
    const sm = Rp.summary, gm = Rp.goal_moved;
    h('div', { class: 'mz-tiles' }, el,
      '<div><b>' + (sm.open.exact + sm.close.exact) + ' / ' + (sm.open.n + sm.close.n) + '</b>edits repaired exactly, with no reset</div>' +
      '<div><b>' + fmt(sm.close.median_t_path_keep) + ' vs ' + fmt(sm.close.median_t_path_cleared) + '</b>median steps after a detour: kept vs cleared</div>' +
      '<div><b>' + fmt(sm.open.median_t_path_keep) + ' vs ' + fmt(sm.open.median_t_path_cleared) + '</b>median steps after a shortcut: kept vs cleared</div>' +
      '<div><b>' + gm.t_path_keep + ' vs ' + gm.t_path_cleared + '</b>goal moved: kept vs cleared (the old peak has to decay)</div>');
  }

  // =====================================================================================================
  // 9. cost: every cell every step vs a BFS frontier   mountCost(id)
  // =====================================================================================================
  function mountCost(id) {
    const el = root(id, 'mz-chart');
    const Cc = FIG.cost, S = Cc.series;
    h('div', { class: 'mz-t' }, el, 'Cells computed, cells that change, and the BFS frontier, step by step');
    h('div', { class: 'mz-s' }, el, S.maze + ' (shortest path ' + S.path + '). The automaton recomputes all ' + S.live + ' corridor cells at every step. The cells whose registers actually change are exactly the breadth-first frontier (' + Math.round(100 * S.changed_equals_frontier_share) + '% of steps), then the growing tip of the path; from step ' + S.first_quiet_step + ' nothing changes.');
    const svg = s('svg', { viewBox: '0 0 700 280' }, el);
    const X0 = 60, X1 = 680, Y0 = 10, Y1 = 230, T = S.computed.length;
    const xs = lin(1, T, X0, X1), ys = logs(0.8, S.live * 1.5, Y1, Y0);
    axes(svg, { x0: X0, x1: X1, y0: Y0, y1: Y1, xs, ys, xt: niceTicks(0, T, 8).filter(v => v >= 1), yt: [1, 10, 100, 1000].filter(v => v < S.live * 1.5), xl: 'step (BFS: depth + 1)', yl: 'cells (log scale)' });
    s('path', { d: pathD(S.computed.map((v, i) => [xs(i + 1), ys(v)])), fill: 'none', stroke: INK2, 'stroke-width': 1.6, 'stroke-dasharray': '6 4' }, svg);
    // the changing cells: draw only where > 0
    let seg1 = [], segs = [];
    S.changed.forEach((v, i) => { if (v > 0) seg1.push([xs(i + 1), ys(v)]); else if (seg1.length) { segs.push(seg1); seg1 = []; } });
    if (seg1.length) segs.push(seg1);
    segs.forEach(sg => s('path', { d: pathD(sg), fill: 'none', stroke: S1, 'stroke-width': 2.2 }, svg));
    S.bfs_frontier.forEach((v, i) => s('circle', { cx: xs(i + 1), cy: ys(v), r: 2, fill: S2 }, svg));
    const cur = s('line', { y1: Y0, y2: Y1, stroke: INK, opacity: 0 }, svg);
    hover(svg, e => {
      const r = svg.getBoundingClientRect(), t = Math.max(1, Math.min(T, Math.round(1 + ((e.clientX - r.left) / r.width * 700 - X0) / (X1 - X0) * (T - 1))));
      cur.setAttribute('x1', xs(t)); cur.setAttribute('x2', xs(t)); cur.setAttribute('opacity', 0.4);
      return '<b>step ' + t + '</b><br>computed: ' + S.computed[t - 1] + ' cells<br>changed: ' + S.changed[t - 1] + ' cells' +
        (t - 1 < S.bfs_frontier.length ? '<br>BFS frontier at depth ' + (t - 1) + ': ' + S.bfs_frontier[t - 1] + ' cells' : '<br><span class="d">BFS finished</span>');
    });
    svg.addEventListener('mouseleave', () => cur.setAttribute('opacity', 0));
    legend(el, [[INK2, 'cells computed (every corridor cell, every step)'], [S1, 'cells whose registers change'], [S2, 'BFS frontier']]);
    h('div', { class: 'mz-tiles' }, el,
      '<div><b>×' + fmt(Cc.median_ratio) + '</b>median cell updates until the path is right, over a BFS visiting each cell twice (' + Cc.rows.length + ' mazes; ×' + fmt(Cc.min_ratio) + ' to ×' + fmt(Cc.max_ratio) + ')</div>' +
      '<div><b>2L + 1</b>parallel steps: the time depends on the path, not on the number of cells</div>' +
      '<div><b>' + fmt(Cc.sparse_macs_per_cell) + ' vs ' + fmt(Cc.dense_macs_per_cell) + '</b>multiply-adds per cell update: non-zero weights vs the dense tensors</div>');
  }

  // =====================================================================================================
  // 10. sparsity   mountSparsity(id)
  // =====================================================================================================
  function mountSparsity(id) {
    const el = root(id, 'mz-chart');
    const Sp = FIG.sparsity, T = Sp.tensors;
    const names = ['W1', 'b1', 'W2', 'b2', 'W3', 'b3'];
    const desc = { W1: '3×3 convolution, 3 → 32', b1: 'layer-1 biases', W2: '1×1, 32 → 16', b2: 'layer-2 biases', W3: '1×1, 16 → 2', b3: 'output biases' };
    const svg = s('svg', { viewBox: '0 0 700 ' + (names.length * 34 + 30) }, el);
    const X0 = 200, X1 = 600, xs = logs(1, 1000, X0, X1);
    [1, 10, 100, 1000].forEach(v => { s('line', { x1: xs(v), x2: xs(v), y1: 0, y2: names.length * 34, stroke: '#eef0f3' }, svg); s('text', { x: xs(v), y: names.length * 34 + 16, 'text-anchor': 'middle', 'font-size': 10.5, fill: DIM }, svg, fmt(v)); });
    names.forEach((k, i) => {
      const y = i * 34 + 6, t = T[k];
      s('text', { x: X0 - 10, y: y + 15, 'text-anchor': 'end', 'font-size': 12, fill: INK }, svg, k + '  ' + desc[k]);
      s('rect', { x: X0, y, width: xs(t.size) - X0, height: 20, rx: 4, fill: '#eef0f3' }, svg);
      if (t.nonzero) s('rect', { x: X0, y, width: Math.max(3, xs(Math.max(1, t.nonzero)) - X0), height: 20, rx: 4, fill: S1 }, svg);
      s('text', { x: xs(t.size) + 8, y: y + 15, 'font-size': 11.5, fill: INK2 }, svg, t.nonzero + ' / ' + fmt(t.size));
      const hit = s('rect', { x: 0, y, width: 700, height: 22, fill: 'transparent' }, svg);
      hover(hit, '<b>' + k + '</b> (' + t.shape.join(' × ') + ')<br>' + t.nonzero + ' of ' + fmt(t.size) + ' non-zero (' + (100 * t.nonzero / t.size).toFixed(1) + '%)');
    });
    h('div', { class: 'mz-s' }, el, 'Blue: non-zero numbers; grey: all numbers in the tensor (log scale). In all, ' + Sp.nonzero + ' of ' + fmt(Sp.numbers) + ' are non-zero (' + (100 * Sp.nonzero / Sp.numbers).toFixed(1) + '%), taking ' + Sp.distinct_values + ' distinct values.');
    // the 115 by part of the program
    const parts = Object.keys(Sp.per_part).sort((a, b) => Sp.per_part[b] - Sp.per_part[a]);
    const sv2 = s('svg', { viewBox: '0 0 700 54' }, el);
    let x = 0; const tot = Sp.nonzero;
    parts.forEach(p => {
      const w = Sp.per_part[p] / tot * 700;
      const r = s('rect', { x: x + 1, y: 4, width: w - 2, height: 26, rx: 4, fill: PART_COL[p] }, sv2);
      if (w > 60) s('text', { x: x + w / 2, y: 21, 'text-anchor': 'middle', 'font-size': 11, fill: '#fff', 'font-weight': 600 }, sv2, p + ' ' + Sp.per_part[p]);
      hover(r, '<b>' + p + '</b>: ' + Sp.per_part[p] + ' weights<br><span class="d">' + PART_TXT[p] + '</span>');
      x += w;
    });
    legend(el, parts.map(p => [PART_COL[p], p + ' (' + Sp.per_part[p] + ')']));
  }

  // =====================================================================================================
  // 11. the 115 weights   mountWeights(id)
  // =====================================================================================================
  function mountWeights(id) {
    const el = root(id, 'mz-w');
    const H1 = MODEL.hidden1, H2 = MODEL.hidden2, NO = MODEL.outputs;
    // collect every non-zero number: {t, r, c, w, from, to, part}
    const W = [];
    MODEL.l1.forEach((terms, u) => terms.forEach(([tap, ch, w]) => W.push({ t: 'W1', r: tap * 3 + ch, c: u, w, tap, ch, unit1: u, part: MODEL.parts1[u] })));
    MODEL.b1.forEach((w, u) => { if (w) W.push({ t: 'b1', r: 0, c: u, w, unit1: u, part: MODEL.parts1[u] }); });
    MODEL.l2.forEach((terms, u) => terms.forEach(([i, w]) => W.push({ t: 'W2', r: i, c: u, w, unit1: i, unit2: u, part: MODEL.parts2[u] })));
    MODEL.b2.forEach((w, u) => { if (w) W.push({ t: 'b2', r: 0, c: u, w, unit2: u, part: MODEL.parts2[u] }); });
    MODEL.l3.forEach((terms, o) => terms.forEach(([u, w]) => W.push({ t: 'W3', r: u, c: o, w, unit2: u, out: o, part: MODEL.parts2[u] })));
    MODEL.b3.forEach((w, o) => { if (w) W.push({ t: 'b3', r: 0, c: o, w, out: o, part: 'flood' }); });
    let filter = 'all', selected = null;   // selected: {layer: 1|2, u}
    const bar = h('div', { class: 'mz-bar', style: 'margin:0 0 8px' }, el);
    seg(bar, [['all', 'all ' + W.length]].concat(Object.keys(PART_TXT).map(p => [p, p + ' ' + W.filter(x => x.part === p).length])), 'all', v => { filter = v; selected = null; paint(); side(); });
    h('span', { class: 'mz-sp' }, bar);
    const info = h('span', { class: 'mz-l' }, bar);
    const row = h('div', { class: 'mz-wrow' }, el);
    const cs = 13;                                         // cell size in the svg
    const L1 = 120, T0 = 46;                                // left label column, top margin
    const w1x = L1, w2x = L1 + H1 * cs + 150, w3x = w2x + H2 * cs + 130;
    const totalW = w3x + NO * cs + 20, totalH = T0 + Math.max(27, H1) * cs + 60;
    const svgBox = h('div', { style: 'flex:0 1 ' + totalW + 'px;min-width:320px;overflow-x:auto' }, row);
    const svg = s('svg', { viewBox: '0 0 ' + totalW + ' ' + totalH, style: 'min-width:640px' }, svgBox);
    const sideEl = h('div', { class: 'mz-side' }, row);
    const colOf = w => { const big = Math.abs(w) >= 100; return w > 0 ? (big ? S1 : '#86a8dc') : (big ? S2 : '#e9a27c'); };
    const rects = [];
    function grid(x0, y0, rows, cols, title, rowLab, colLab, t, biasT) {
      s('text', { x: x0, y: 14, 'font-size': 12, 'font-weight': 700, fill: INK }, svg, title);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s('rect', { x: x0 + c * cs, y: y0 + r * cs, width: cs - 1, height: cs - 1, fill: '#f1f2f4' }, svg);
      for (let r = 0; r < rows; r++) { const tx = s('text', { class: 'lab', x: x0 - 4, y: y0 + r * cs + cs - 3, 'text-anchor': 'end', 'font-size': 8.5, fill: DIM, 'font-family': 'ui-monospace,Menlo,monospace' }, svg, rowLab(r)); rowClick(tx, t, r); }
      for (let c = 0; c < cols; c++) { const tx = s('text', { class: 'lab', x: x0 + c * cs + cs / 2, y: y0 - 4, 'text-anchor': 'middle', 'font-size': 8, fill: DIM }, svg, colLab(c)); colClick(tx, t, c); }
      if (biasT) {      // bias row under the matrix
        const by = y0 + rows * cs + 8;
        for (let c = 0; c < cols; c++) s('rect', { x: x0 + c * cs, y: by, width: cs - 1, height: cs - 1, fill: '#f1f2f4' }, svg);
        s('text', { x: x0 - 4, y: by + cs - 3, 'text-anchor': 'end', 'font-size': 8.5, fill: DIM, 'font-family': 'ui-monospace,Menlo,monospace' }, svg, biasT);
      }
    }
    function rowClick(tx, t, r) {
      if (t === 'W2') tx.addEventListener('click', () => { selected = { layer: 1, u: r }; paint(); side(); });
      if (t === 'W3') tx.addEventListener('click', () => { selected = { layer: 2, u: r }; paint(); side(); });
    }
    function colClick(tx, t, c) {
      if (t === 'W1') tx.addEventListener('click', () => { selected = { layer: 1, u: c }; paint(); side(); });
      if (t === 'W2') tx.addEventListener('click', () => { selected = { layer: 2, u: c }; paint(); side(); });
    }
    grid(w1x, T0, 27, H1, 'W1 · 3×3 conv (rows: neighbour × channel)', r => TAPS[(r / 3) | 0] + ' ' + MODEL.channel_names[r % 3], c => c, 'W1', 'b1');
    grid(w2x, T0, H1, H2, 'W2 · layer 1 → layer 2', r => (MODEL.names1[r] || '') + ' ' + r, c => c, 'W2', 'b2');
    grid(w3x, T0, H2, NO, 'W3', r => (MODEL.names2[r] || '') + ' ' + r, c => ['D', 'ON'][c], 'W3', 'b3');
    const pos = x => {
      if (x.t === 'W1') return [w1x + x.c * cs, T0 + x.r * cs];
      if (x.t === 'b1') return [w1x + x.c * cs, T0 + 27 * cs + 8];
      if (x.t === 'W2') return [w2x + x.c * cs, T0 + x.r * cs];
      if (x.t === 'b2') return [w2x + x.c * cs, T0 + H1 * cs + 8];
      if (x.t === 'W3') return [w3x + x.c * cs, T0 + x.r * cs];
      return [w3x + x.c * cs, T0 + H2 * cs + 8];
    };
    W.forEach(x => {
      const [px, py] = pos(x);
      const r = s('rect', { class: 'cell', x: px, y: py, width: cs - 1, height: cs - 1, rx: 2, fill: colOf(x.w) }, svg);
      x.el = r; rects.push(r);
      hover(r, () => describe(x));
      r.addEventListener('click', () => { selected = x.unit2 !== undefined && x.t !== 'W2' ? { layer: 2, u: x.unit2 } : { layer: 1, u: x.unit1 !== undefined ? x.unit1 : x.unit2 }; if (x.t === 'W2' || x.t === 'b2') selected = { layer: 2, u: x.unit2 }; paint(); side(); });
    });
    const lg = h('div', null, el);
    legend(lg, [[S1, 'positive, 100 or more (the constants BIG, K, MPIN)'], ['#86a8dc', 'positive, below 100'], ['#e9a27c', 'negative, above −100'], [S2, 'negative, −100 or less (MUTE, MPIN)'], ['#f1f2f4', 'zero']]);
    h('div', { class: 'mz-s', style: 'margin-top:6px' }, el, 'Hover a square to read the weight; click a square or a unit label to follow one unit through the network. W1 rows NW, NE, SW, SE stay empty: no weight reads a diagonal neighbour.');
    function inSel(x) {
      if (!selected) return true;
      if (selected.layer === 1) return x.unit1 === selected.u && (x.t === 'W1' || x.t === 'b1' || x.t === 'W2');
      return x.unit2 === selected.u;
    }
    function paint() {
      let n = 0;
      W.forEach(x => { const on = (filter === 'all' || x.part === filter) && inSel(x); x.el.setAttribute('opacity', on ? 1 : 0.12); if (on) n++; });
      info.textContent = 'showing ' + n + ' of ' + W.length + ' non-zero numbers';
    }
    function describe(x) {
      const n1 = u => 'L1#' + u + ' <b>' + MODEL.names1[u] + '</b>', n2 = u => 'L2#' + u + ' <b>' + MODEL.names2[u] + '</b>';
      let t = '';
      if (x.t === 'W1') t = '<b>W1</b>: the ' + MODEL.channel_names[x.ch] + ' of ' + (x.tap === 4 ? 'the cell itself' : 'the ' + TAPNAME[x.tap] + ' neighbour') + ' → ' + n1(x.unit1);
      else if (x.t === 'b1') t = '<b>b1</b>: bias of ' + n1(x.unit1);
      else if (x.t === 'W2') t = '<b>W2</b>: ' + n1(x.unit1) + ' → ' + n2(x.unit2);
      else if (x.t === 'b2') t = '<b>b2</b>: bias of ' + n2(x.unit2);
      else if (x.t === 'W3') t = '<b>W3</b>: ' + n2(x.unit2) + ' → ' + ['ΔD', 'ΔON'][x.out];
      else t = '<b>b3</b>';
      return t + '<br>weight <b>' + fmt(x.w) + '</b><br><span class="d">part: ' + x.part + ' — ' + (PART_TXT[x.part] || '') + '</span>';
    }
    function side() {
      if (!selected) {
        sideEl.innerHTML = '<div class="mz-t">' + W.length + ' non-zero numbers out of ' + fmt(MODEL.total) + '</div>' +
          '<div class="mz-s">' + MODEL.names1.filter(Boolean).length + ' of ' + H1 + ' first-layer units and ' + MODEL.names2.filter(Boolean).length + ' of ' + H2 + ' second-layer units are used; the rest are zero. Click a unit to see its weights.</div>' +
          Object.keys(PART_TXT).map(p => '<div style="margin:6px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + PART_COL[p] + ';margin-right:6px"></span><b>' + p + '</b> (' + W.filter(x => x.part === p).length + '): ' + PART_TXT[p] + '</div>').join('');
        return;
      }
      const L1s = selected.layer === 1, u = selected.u, nm = L1s ? MODEL.names1[u] : MODEL.names2[u], part = L1s ? MODEL.parts1[u] : MODEL.parts2[u];
      const inc = W.filter(x => L1s ? (x.unit1 === u && (x.t === 'W1' || x.t === 'b1')) : (x.unit2 === u && (x.t === 'W2' || x.t === 'b2')));
      const outw = W.filter(x => L1s ? (x.unit1 === u && x.t === 'W2') : (x.unit2 === u && x.t === 'W3'));
      const src = x => x.t === 'W1' ? MODEL.channel_names[x.ch] + ' @ ' + TAPS[x.tap] : x.t === 'W2' ? 'L1#' + x.unit1 + ' ' + MODEL.names1[x.unit1] : 'bias';
      const dst = x => x.t === 'W2' ? 'L2#' + x.unit2 + ' ' + MODEL.names2[x.unit2] : ['ΔD', 'ΔON'][x.out];
      sideEl.innerHTML = '<div class="mz-t">Layer ' + selected.layer + ' unit ' + u + ': ' + (nm || '(unused)') + '</div>' +
        '<div class="mz-s">' + part + ' — ' + (PART_TXT[part] || 'all weights zero') + '</div>' +
        '<b>In</b> (' + inc.length + ')<table>' + inc.map(x => '<tr><td>' + src(x) + '</td><td style="text-align:right">' + fmt(x.w) + '</td></tr>').join('') + '</table>' +
        '<div style="height:8px"></div><b>Out</b> (' + outw.length + ')<table>' + outw.map(x => '<tr><td>' + dst(x) + '</td><td style="text-align:right">' + fmt(x.w) + '</td></tr>').join('') + '</table>' +
        '<div style="margin-top:8px"><button class="mz-b">Show all</button></div>';
      sideEl.querySelector('button').onclick = () => { selected = null; paint(); side(); };
    }
    paint(); side();
  }

  // =====================================================================================================
  // 12. the 3D network visualisation (iframe, loads on click)   mountViz(id, {src: '../viz/index.html', poster: '../assets/viz_cover.jpg'})
  // =====================================================================================================
  function mountViz(id, opts) {
    opts = opts || {};
    const el = root(id, 'mz-viz');
    const poster = opts.poster === undefined ? '../assets/viz_cover.jpg' : opts.poster;
    const cover = h('div', { class: 'cover' }, el, (poster ? '<div class="poster" style="background-image:url(' + poster + ')"></div>' : '') + '<div class="card"><b>Inside one cell, in 3D</b>The 28 + 12 units, the ' + MODEL.nonzero + ' non-zero weights,<br>and a maze solving itself beside them.<br><span class="go">▶ Load the network</span><div style="font-size:12px;opacity:.6;margin-top:10px">loads three.js from jsDelivr</div></div>');
    cover.onclick = () => { const f = h('iframe', { src: opts.src || '../viz/index.html', title: 'maze automaton network', loading: 'lazy' }); el.appendChild(f); cover.remove(); };
  }

  // =====================================================================================================
  // Maze-Hard   mountHard(id)  -  any of the 1,000 test mazes, run live, by either weight file
  //             mountHardBoard(id)  -  the score against the published results, and how many shortest paths a maze has
  // =====================================================================================================
  const HARD = window.MAZE_HARD;
  let HardCA = null;
  function hardMaze(k) {          // unpack: 2 bits per cell (0 open, 1 wall, 2 start, 3 goal) and the answer bits
    const m = HARD.mazes[k], b = atob(m.m), a = atob(m.a), img = new Float32Array(900), ans = new Uint8Array(900);
    let start = -1, goal = -1;
    for (let i = 0; i < 900; i++) {
      const v = (b.charCodeAt(i >> 2) >> (2 * (i & 3))) & 3;
      img[i] = [LV.corridor, LV.wall, LV.start, LV.goal][v];
      if (v === 2) start = i; if (v === 3) goal = i;
      ans[i] = (a.charCodeAt(i >> 3) >> (i & 7)) & 1;
    }
    return { img, ans, start, goal, L: HARD.L[k], npaths: HARD.npaths[k] };
  }
  const sci = n => n < 1e5 ? fmt(n) : (n / Math.pow(10, Math.floor(Math.log10(n)))).toFixed(1) + ' × 10' + String(Math.floor(Math.log10(n))).replace(/./g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  function mountHard(id) {
    const el = root(id, 'mz-hard');
    if (!HARD || !window.MAZE_HARD_MODEL) { el.textContent = 'Maze-Hard data not loaded.'; return; }
    HardCA = HardCA || MazeCA.withModel(window.MAZE_HARD_MODEL);
    const G = 30, P = HARD.pointer, B = HARD.base;
    let k = 0, mode = 'pointer', ca = null, m = null, playing = false, finished = false, speed = 4, showAns = false, inView = true, dirty = true;
    const grid = h('div', { class: 'mz-hgrid' }, el);
    const left = h('div', null, grid), right = h('div', null, grid);
    const stage = h('div', { class: 'mz-stage' }, left);
    const cv = h('canvas', { class: 'mz-cv', width: G * 16, height: G * 16 }, stage);
    const ctx = cv.getContext('2d'), small = document.createElement('canvas'); small.width = small.height = G;
    const rrow = h('div', { class: 'mz-readrow' }, left);
    const rd = h('div', { class: 'mz-read' }, rrow);
    h('a', { class: 'mz-src', href: 'https://huggingface.co/datasets/sapientinc/maze-30x30-hard-1k', target: '_blank', rel: 'noopener', title: 'the Maze-Hard test set on Hugging Face (opens in a new tab)' }, rrow,
      'Maze-Hard dataset<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    const b1 = h('div', { class: 'mz-bar' }, left);
    const bPlay = h('button', { class: 'mz-b acc' }, b1, '');
    const bStep = h('button', { class: 'mz-b' }, b1, '+1 step');
    const bRe = h('button', { class: 'mz-b yel', title: 'clear the registers and start again from step 0' }, b1, '↺ Restart');
    h('span', { class: 'mz-sp' }, b1);
    const bPrev = h('button', { class: 'mz-b', title: 'previous maze' }, b1, '◀');
    const num = h('input', { type: 'number', min: 1, max: HARD.n_test, value: 1, class: 'mz-num', title: 'test maze number' }, b1);
    const bNext = h('button', { class: 'mz-b', title: 'next maze' }, b1, '▶');
    const bRand = h('button', { class: 'mz-b blu' }, b1, 'Random maze');
    const b2 = h('div', { class: 'mz-bar' }, left);
    seg(b2, [['pointer', 'One path, as scored · ' + P.nonzero + ' weights'], ['all', 'Every shortest path · ' + B.nonzero + ' weights']], mode, v => { mode = v; load(k); });
    h('span', { class: 'mz-sp' }, b2);
    const bAns = h('button', { class: 'mz-b', title: 'ring the cells of the answer the dataset gives' }, b2, 'Show the dataset\'s answer');
    bAns.onclick = () => { showAns = !showAns; bAns.classList.toggle('on', showAns); dirty = true; };
    const lsp = h('label', { class: 'mz-l' }, b2, 'Speed ');
    const sel = h('select', { class: 'mz-sel' }, lsp);
    [1, 2, 4, 8, 16].forEach(v => h('option', { value: v }, sel, v + ' step' + (v > 1 ? 's' : '') + ' / frame'));
    sel.value = speed; sel.onchange = () => { speed = +sel.value; };
    const chk = h('div', { class: 'mz-check' }, left);
    legend(left, [['rgb(31,36,48)', 'wall'], ['rgb(22,163,74)', 'S'], ['rgb(162,28,175)', 'G'], ['rgb(249,115,22)', 'ON'], ['linear-gradient(90deg,#0b3d7a,#dbe6f5)', 'D: near → far from G'], ['#fff;border:2px solid #111', 'the dataset\'s answer']]);

    // right: the totals, and all 1,000 mazes as a grid you can click
    const noise = P.noise;
    h('div', { class: 'mz-tiles', style: 'margin:0 0 12px' }, right,
      '<div><b>' + P.clean.valid + ' / ' + HARD.n_test + '</b>solved: the lit cells are a shortest path from S to G</div>' +
      '<div><b>' + P.clean.exact + ' / ' + HARD.n_test + '</b>exact match of the dataset\'s answer grid</div>' +
      '<div><b>' + noise.exact + ' / ' + HARD.n_test + '</b>exact, with noise σ = 0.02 on every register, every step</div>' +
      '<div><b>' + B.ok + ' / ' + HARD.n_test + '</b>' + B.nonzero + ' weights: every shortest-path cell, every D, the length</div>');
    h('div', { class: 'mz-t' }, right, 'All ' + HARD.n_test + ' test mazes');
    h('div', { class: 'mz-s' }, right, 'One square per maze, green when its path matched the answer exactly. Click one to run it.');
    const mini = h('canvas', { class: 'mz-mini', width: 40 * 9, height: 25 * 9 }, right);
    const mctx = mini.getContext('2d');
    function drawMini() {
      mctx.clearRect(0, 0, mini.width, mini.height);
      for (let i = 0; i < HARD.n_test; i++) {
        const x = (i % 40) * 9, y = ((i / 40) | 0) * 9, ok = P.clean.t[i] > 0;
        mctx.fillStyle = i === k ? INK : (ok ? S3 : S2); mctx.fillRect(x + 1, y + 1, 7, 7);
      }
    }
    const miniAt = e => { const r = mini.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / r.width * 40), y = Math.floor((e.clientY - r.top) / r.height * 25); const i = y * 40 + x; return i >= 0 && i < HARD.n_test ? i : -1; };
    mini.addEventListener('mousemove', e => { const i = miniAt(e); if (i < 0) { untip(); return; }
      tip(e, '<b>Maze ' + (i + 1) + '</b><br>shortest path ' + HARD.L[i] + ' steps, ' + sci(HARD.npaths[i]) + ' shortest paths<br>answer matched exactly at step ' + P.clean.t[i] + ' (2L + 1 = ' + (2 * HARD.L[i] + 1) + ')'); });
    mini.addEventListener('mouseleave', untip);
    mini.addEventListener('click', e => { const i = miniAt(e); if (i >= 0) { load(i); playing = true; syncPlay(); } });
    h('div', { class: 'mz-s', style: 'margin-top:10px' }, right,
      'Every maze has between ' + sci(Math.min(...HARD.npaths)) + ' and ' + sci(Math.max(...HARD.npaths)) + ' shortest paths. The answer marks one of them, so the benchmark asks for one particular path, not just any.');

    function load(i) {
      k = (i + HARD.n_test) % HARD.n_test; num.value = k + 1;
      m = hardMaze(k); m.ref = MazeCA.solve(m.img, G, G, m.start, m.goal);
      let mx = 1; for (let j = 0; j < 900; j++) if (m.ref.dg[j] > mx) mx = m.ref.dg[j]; m.kmax = mx;
      ca = new (mode === 'pointer' ? HardCA : MazeCA)(G, G, 1); ca.setImage(m.img, true);
      finished = false; dirty = true; drawMini();
    }
    const reached = () => ca.ON(m.goal / G | 0, m.goal % G) > 0.5;
    // the ON cells as one string, to see when the path has stopped changing
    const onSig = () => { let t = ''; const CC = ca.constructor.C; for (let j = 0; j < 900; j++) t += ca.state[j * CC + 2] > 0.5 ? 1 : 0; return t; };
    function syncPlay() { playLabel(bPlay, playing); }
    bPlay.onclick = () => { if (!playing && finished) { ca.clearRegisters(); finished = false; } playing = !playing; syncPlay(); dirty = true; };
    bStep.onclick = () => { playing = false; finished = false; syncPlay(); ca.step(1); dirty = true; };
    bRe.onclick = () => { ca.clearRegisters(); finished = false; dirty = true; };
    bPrev.onclick = () => load(k - 1); bNext.onclick = () => load(k + 1);
    bRand.onclick = () => { load(Math.floor(Math.random() * HARD.n_test)); playing = true; syncPlay(); };
    num.onchange = () => load(Math.max(1, Math.min(HARD.n_test, +num.value || 1)) - 1);
    visible(el, v => { inView = v; });

    function draw() {
      paintState(ctx, small, m.img, ca.state, G, G, 'field', m.kmax, ca.constructor.C);
      if (showAns) {
        const c = cv.width / G; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
        for (let j = 0; j < 900; j++) if (m.ans[j]) ctx.strokeRect((j % G) * c + 3, (j / G | 0) * c + 3, c - 6, c - 6);
      }
      const r = ca.read(m.start);
      rd.innerHTML = '<span class="mz-hud">step ' + ca.steps + '</span><b>Maze ' + (k + 1) + '</b><span>' +
        (r.len !== null ? 'length read off S: ' + r.len + (reached() ? ' · reaches G' : ' · tracing…') : 'the flood has not reached S yet') + '</span>';
      // the check, computed by the page from the dataset (never given to the cells)
      let wrong = 0, lit = 0;
      for (let j = 0; j < 900; j++) {
        if (!(m.img[j] > 0.1)) continue;
        const on = ca.state[j * ca.constructor.C + 2] > 0.5; if (on) lit++;
        const want = mode === 'pointer' ? (j === m.start || j === m.goal || !!m.ans[j]) : !!m.ref.on[j];
        if (on !== want) wrong++;
      }
      chk.innerHTML = (mode === 'pointer' ? 'Check against the dataset\'s answer (' + m.L + ' steps, one of ' + sci(m.npaths) + ' shortest paths): ' : 'Check by breadth-first search (' + m.L + ' steps, ' + sci(m.npaths) + ' shortest paths): ') +
        (wrong === 0 ? '<span class="ok">' + (mode === 'pointer' ? 'the lit cells are exactly the answer ✓' : 'the lit cells are exactly every cell on a shortest path ✓') + '</span>'
          : '<span class="bad">' + wrong + ' cells still differ</span>') + ' · ' + lit + ' cells on';
    }
    function frame() {
      if (inView && m) {
        if (playing) {
          for (let s = 0; s < speed; s++) {
            // stop once the path has reached the goal and no longer changes (the pointer edition can light the goal a step
            // or two before its last cells settle, so the goal alone is not the end)
            const was = reached() ? onSig() : null; ca.step(1);
            if (was !== null && reached() && onSig() === was) { playing = false; finished = true; syncPlay(); break; }
          }
          dirty = true;
        }
        if (dirty) { draw(); dirty = false; }
      }
      requestAnimationFrame(frame);
    }
    load(0); syncPlay(); draw(); requestAnimationFrame(frame);
  }

  function mountHardBoard(id) {
    const el = root(id, 'mz-chart');
    if (!HARD) { el.textContent = 'Maze-Hard data not loaded.'; return; }
    const two = h('div', { class: 'mz-two' }, el);
    // left: score against size. Published scores as compiled in [14], Fig. 8 ("any shortest path counts").
    const a = h('div', null, two);
    h('div', { class: 'mz-t' }, a, 'Maze-Hard score against the number of weights');
    h('div', { class: 'mz-s' }, a, '1,000 test mazes, any shortest path counts. Hover a point for its source.');
    const pts = [
      { n: 'This work, pointer edition', w: HARD.pointer.nonzero, acc: 100 * HARD.pointer.clean.valid / HARD.n_test, c: ACC, us: true, src: 'written by an AI agent, no training; ' + HARD.pointer.nonzero + ' non-zero of ' + fmt(HARD.pointer.total) + ' numbers; measured here, all 1,000 also an exact match of the answer grid' },
      { n: 'Looped WSP, capped', w: 928, acc: 100, c: S2, src: 'written by an AI agent, 1,000-weight cap [14]' },
      { n: 'Looped WSP', w: 19936, acc: 100, c: S2, src: 'written by an AI agent [14]' },
      { n: 'LDT', w: 1.8e6, acc: 99.8, c: FAINT, src: 'trained [18], as compiled in [14]' },
      { n: 'EBR', w: 1.8e6, acc: 94.1, c: FAINT, src: 'trained [16], as compiled in [14]' },
      { n: 'TRM', w: 7e6, acc: 91.9, c: FAINT, src: 'trained [17], as compiled in [14]' },
      { n: 'HRM', w: 27e6, acc: 82.2, c: FAINT, src: 'trained [15], as compiled in [14]' },
    ];
    const svg = s('svg', { viewBox: '0 0 440 290' }, a);
    const X0 = 50, X1 = 425, Y0 = 18, Y1 = 250;
    const xs = v => X0 + (Math.log10(v) - 2) / 6 * (X1 - X0), ys = v => Y1 - (v - 80) / 21 * (Y1 - Y0);
    for (let e = 2; e <= 8; e++) { s('line', { x1: xs(Math.pow(10, e)), x2: xs(Math.pow(10, e)), y1: Y0, y2: Y1, stroke: RULE }, svg);
      s('text', { x: xs(Math.pow(10, e)), y: Y1 + 16, 'text-anchor': 'middle', 'font-size': 10.5, fill: DIM }, svg, ['100', '1k', '10k', '100k', '1M', '10M', '100M'][e - 2]); }
    [80, 85, 90, 95, 100].forEach(v => { s('line', { x1: X0, x2: X1, y1: ys(v), y2: ys(v), stroke: RULE }, svg);
      s('text', { x: X0 - 6, y: ys(v) + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: DIM }, svg, v + '%'); });
    s('text', { x: (X0 + X1) / 2, y: Y1 + 34, 'text-anchor': 'middle', 'font-size': 11, fill: DIM }, svg, 'weights (log scale)');
    pts.forEach(p => {
      const g = s('g', null, svg), x = xs(p.w), y = ys(p.acc);
      s('circle', { cx: x, cy: y, r: p.us ? 7 : 5, fill: p.c, stroke: '#fff', 'stroke-width': 1.5 }, g);
      const right = x < 330;
      s('text', { x: x + (right ? 10 : -10), y: y + (p.n === 'Looped WSP' ? 16 : p.n === 'EBR' ? 4 : -8), 'text-anchor': right ? 'start' : 'end', 'font-size': p.us ? 12 : 10.5, 'font-weight': p.us ? 700 : 500, fill: p.us ? ACC : INK2 }, g,
        p.n.replace('This work, pointer edition', 'This work') + ' · ' + (p.acc % 1 ? p.acc.toFixed(1) : p.acc) + '%');
      hover(g, '<b>' + p.n + '</b><br>' + fmt(p.w) + ' weights · ' + (p.acc % 1 ? p.acc.toFixed(1) : p.acc) + '% of 1,000<br><span class="d">' + p.src + '</span>');
    });
    // right: how many shortest paths a maze has
    const b = h('div', null, two);
    h('div', { class: 'mz-t' }, b, 'Shortest paths per maze');
    h('div', { class: 'mz-s' }, b, 'Counted by dynamic programming over the breadth-first layers. The answer marks one.');
    const sv = s('svg', { viewBox: '0 0 440 290' }, b);
    const lg = HARD.npaths.map(v => Math.log10(v)), lo = 1, hi = 12, nb = 22, bins = new Array(nb).fill(0);
    lg.forEach(v => bins[Math.min(nb - 1, Math.max(0, Math.floor((v - lo) / (hi - lo) * nb)))]++);
    const mx = Math.max(...bins), bx = i => X0 + i / nb * (X1 - X0), by = v => Y1 - v / mx * (Y1 - Y0);
    [0, 50, 100, 150].filter(v => v <= mx * 1.05).forEach(v => { s('line', { x1: X0, x2: X1, y1: by(v), y2: by(v), stroke: RULE }, sv); s('text', { x: X0 - 6, y: by(v) + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: DIM }, sv, v); });
    bins.forEach((v, i) => { if (!v) return; const g = s('g', null, sv);
      s('rect', { x: bx(i) + 1, y: by(v), width: (X1 - X0) / nb - 2, height: Y1 - by(v), fill: S1, rx: 2 }, g);
      hover(g, '<b>' + v + ' mazes</b><br>10<sup>' + (lo + i * (hi - lo) / nb).toFixed(1) + '</sup> to 10<sup>' + (lo + (i + 1) * (hi - lo) / nb).toFixed(1) + '</sup> shortest paths'); });
    for (let e = 2; e <= 12; e += 2) s('text', { x: X0 + (e - lo) / (hi - lo) * (X1 - X0), y: Y1 + 16, 'text-anchor': 'middle', 'font-size': 10.5, fill: DIM }, sv, e === 2 ? '100' : '10^' + e);
    s('text', { x: (X0 + X1) / 2, y: Y1 + 34, 'text-anchor': 'middle', 'font-size': 11, fill: DIM }, sv, 'number of shortest paths (log scale)');
    const sorted = HARD.npaths.slice().sort((x, y) => x - y);
    h('div', { class: 'mz-s', style: 'margin-top:4px' }, b, 'median ' + sci(sorted[sorted.length >> 1]) + ' · fewest ' + sci(sorted[0]) + ' · most ' + sci(sorted[sorted.length - 1]));
  }

  // ---------------------------------------------------------------- registry and auto-mount
  const DEFAULT_IDS = {
    'maze-live': mountLive, 'maze-inspector': mountInspector, 'fig-wave': mountWave, 'fig-settle': mountSettle,
    'fig-correct': mountCorrectness, 'fig-noise': mountNoise, 'fig-fire': mountFire, 'fig-repair': mountRepair,
    'fig-cost': mountCost, 'fig-sparsity': mountSparsity, 'weight-explorer': mountWeights, 'maze-viz': mountViz,
    'fig-hard': mountHard, 'fig-hard-board': mountHardBoard,
  };
  window.MazeBlog = { mountLive, mountInspector, mountWave, mountSettle, mountCorrectness, mountNoise, mountFire,
    mountRepair, mountCost, mountSparsity, mountWeights, mountViz, mountHard, mountHardBoard, DEFAULT_IDS, live: LIVE };
  function auto() {
    Object.keys(DEFAULT_IDS).forEach(k => {
      const e = document.getElementById(k);
      if (e && !e.dataset.mzManual && !e.classList.contains('mz')) {
        try { DEFAULT_IDS[k](k, k === 'maze-live' && document.getElementById('maze-inspector') ? {} : undefined); }
        catch (err) { console.error('MazeBlog: ' + k, err); }
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
