// Lightweight board renderer for chess and checkers.
// Squares are algebraic names ("e4"). Pieces are codes mapped to image URLs by opts.pieceUrl.
const FILES = 'abcdefgh';
const SVGNS = 'http://www.w3.org/2000/svg';

export class Board {
  constructor(el, opts = {}) {
    this.el = el;
    this.opts = Object.assign({
      orientation: 'white', coords: true, pieceUrl: (c) => c,
      canDrag: () => false, targets: () => [], onMove: () => false, onSquare: null,
      darkOnly: false,
    }, opts);
    this.position = {};
    this.selected = null;
    this.highlights = {};
    this.arrows = [];
    this.build();
  }

  build() {
    this.el.classList.add('board');
    this.el.innerHTML = '';
    this.grid = document.createElement('div');
    this.grid.className = 'board-grid';
    this.squares = {};
    for (let i = 0; i < 64; i++) {
      const sq = document.createElement('div');
      sq.className = 'sq';
      this.grid.appendChild(sq);
    }
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('viewBox', '0 0 800 800');
    this.svg.setAttribute('class', 'board-arrows');
    this.svg.setAttribute('aria-hidden', 'true');
    this.el.append(this.grid, this.svg);
    this.layout();
    this.bindPointer();
  }

  layout() {
    const flip = this.opts.orientation === 'black';
    const cells = this.grid.children;
    this.squares = {};
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8), c = i % 8;
      const file = flip ? 7 - c : c;
      const rank = flip ? r + 1 : 8 - r;
      const name = FILES[file] + rank;
      const cell = cells[i];
      cell.dataset.sq = name;
      const dark = (file + rank) % 2 === 1;
      cell.className = 'sq ' + (dark ? 'dark' : 'light');
      cell.innerHTML = '';
      if (this.opts.coords) {
        if (c === 0) cell.insertAdjacentHTML('beforeend', `<span class="coord rank">${rank}</span>`);
        if (r === 7) cell.insertAdjacentHTML('beforeend', `<span class="coord file">${FILES[file]}</span>`);
      }
      this.squares[name] = cell;
    }
    this.render();
  }

  setOrientation(o) { this.opts.orientation = o; this.layout(); }
  flip() { this.setOrientation(this.opts.orientation === 'white' ? 'black' : 'white'); }

  setPosition(pos) { this.position = Object.assign({}, pos); this.selected = null; this.render(); }

  setHighlights(h) { this.highlights = h || {}; this.render(); }

  setArrows(arrows) { this.arrows = arrows || []; this.drawArrows(); }

  render() {
    for (const [name, cell] of Object.entries(this.squares)) {
      const existing = cell.querySelector('.piece');
      const code = this.position[name];
      if (code) {
        const url = this.opts.pieceUrl(code);
        if (existing) {
          if (existing.dataset.code !== code) { existing.src = url; existing.dataset.code = code; }
        } else {
          const img = document.createElement('img');
          img.className = 'piece'; img.src = url; img.alt = ''; img.draggable = false; img.dataset.code = code;
          cell.appendChild(img);
        }
      } else if (existing) existing.remove();
      cell.classList.remove('hl-last', 'hl-sel', 'hl-check', 'hl-target', 'hl-capture', 'hl-hint');
      const h = this.highlights[name];
      if (h) for (const k of h.split(' ')) cell.classList.add('hl-' + k);
    }
    if (this.selected) {
      this.squares[this.selected]?.classList.add('hl-sel');
      for (const t of this.opts.targets(this.selected)) {
        const cell = this.squares[t];
        if (cell) cell.classList.add(this.position[t] ? 'hl-capture' : 'hl-target');
      }
    }
    this.drawArrows();
  }

  center(name) {
    const flip = this.opts.orientation === 'black';
    const file = FILES.indexOf(name[0]);
    const rank = parseInt(name.slice(1), 10);
    const c = flip ? 7 - file : file;
    const r = flip ? rank - 1 : 8 - rank;
    return [c * 100 + 50, r * 100 + 50];
  }

  drawArrows() {
    this.svg.innerHTML = '';
    const defs = document.createElementNS(SVGNS, 'defs');
    this.svg.appendChild(defs);
    this.arrows.forEach((a, idx) => {
      const pts = (a.path || [a.from, a.to]).map((s) => this.center(s));
      const color = a.color || 'var(--arrow-best)';
      const id = 'ah' + idx;
      const marker = document.createElementNS(SVGNS, 'marker');
      marker.setAttribute('id', id);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '5'); marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '3.2'); marker.setAttribute('markerHeight', '3.2');
      marker.setAttribute('orient', 'auto-start-reverse');
      const tip = document.createElementNS(SVGNS, 'path');
      tip.setAttribute('d', 'M0,0 L10,5 L0,10 z');
      tip.setAttribute('fill', color);
      marker.appendChild(tip);
      defs.appendChild(marker);
      // shorten last segment so the head lands inside the target square
      const last = pts[pts.length - 1], prev = pts[pts.length - 2];
      const dx = last[0] - prev[0], dy = last[1] - prev[1];
      const len = Math.hypot(dx, dy) || 1;
      const end = [last[0] - dx / len * 28, last[1] - dy / len * 28];
      const start = pts[0];
      const sdx = pts[1][0] - start[0], sdy = pts[1][1] - start[1], sl = Math.hypot(sdx, sdy) || 1;
      const begin = [start[0] + sdx / sl * 18, start[1] + sdy / sl * 18];
      const all = [begin, ...pts.slice(1, -1), end];
      const line = document.createElementNS(SVGNS, 'polyline');
      line.setAttribute('points', all.map((p) => p.join(',')).join(' '));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', a.width || 16);
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');
      line.setAttribute('opacity', a.opacity ?? 0.85);
      line.setAttribute('marker-end', `url(#${id})`);
      this.svg.appendChild(line);
    });
  }

  squareAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest && el.closest('.sq');
    return cell && this.grid.contains(cell) ? cell.dataset.sq : null;
  }

  bindPointer() {
    let drag = null;
    this.grid.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.sq');
      if (!cell) return;
      const name = cell.dataset.sq;
      if (this.opts.onSquare) { e.preventDefault(); this.painting = true; this.opts.onSquare(name, 'down'); return; }
      if (this.selected && this.selected !== name && this.opts.targets(this.selected).includes(name)) {
        const from = this.selected; this.selected = null;
        this.opts.onMove(from, name); this.render();
        return;
      }
      if (this.position[name] && this.opts.canDrag(name)) {
        e.preventDefault();
        this.selected = name; this.render();
        const img = cell.querySelector('.piece');
        const rect = cell.getBoundingClientRect();
        drag = { from: name, img, size: rect.width, moved: false, x0: e.clientX, y0: e.clientY };
        this.grid.setPointerCapture(e.pointerId);
      } else {
        this.selected = null; this.render();
      }
    });
    this.grid.addEventListener('pointermove', (e) => {
      if (this.painting && this.opts.onSquare) {
        const n = this.squareAt(e.clientX, e.clientY);
        if (n) this.opts.onSquare(n, 'move');
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        drag.ghost = drag.img.cloneNode();
        drag.ghost.className = 'piece ghost';
        drag.ghost.style.width = drag.ghost.style.height = drag.size + 'px';
        document.body.appendChild(drag.ghost);
        drag.img.style.opacity = '0.25';
      }
      drag.ghost.style.left = (e.clientX - drag.size / 2) + 'px';
      drag.ghost.style.top = (e.clientY - drag.size / 2) + 'px';
    });
    const end = (e) => {
      this.painting = false;
      if (!drag) return;
      const d = drag; drag = null;
      if (!d.moved) return; // simple click: keep selection
      d.ghost.remove();
      d.img.style.opacity = '';
      const to = this.squareAt(e.clientX, e.clientY);
      this.selected = null;
      if (to && to !== d.from && this.opts.targets(d.from).includes(to)) this.opts.onMove(d.from, to);
      this.render();
    };
    this.grid.addEventListener('pointerup', end);
    this.grid.addEventListener('pointercancel', end);
  }
}
