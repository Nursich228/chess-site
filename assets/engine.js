// Stockfish 19 (lite, single-threaded WASM) wrapper running in a Web Worker.
const ENGINE_URL = new URL('../engine/stockfish-19-lite-single.js', import.meta.url).href;

export class Engine {
  constructor() {
    this.listeners = [];
    this.searching = false;
    this.pending = null;
    this.ready = new Promise((resolve) => {
      this.worker = new Worker(ENGINE_URL);
      this.worker.onmessage = (e) => this.onLine(String(e.data));
      this.readyResolve = resolve;
      this.send('uci');
      this.send('setoption name Hash value 32');
      this.send('isready');
    });
    this.lines = {};
  }

  send(cmd) { this.worker.postMessage(cmd); }

  onLine(line) {
    if (line === 'readyok' && this.readyResolve) { this.readyResolve(); this.readyResolve = null; return; }
    if (!this.current) return;
    if (line.startsWith('info') && line.includes(' pv ')) {
      const info = parseInfo(line);
      if (info) {
        this.lines[info.multipv] = info;
        this.current.onInfo && this.current.onInfo(info, this.lines);
      }
    } else if (line.startsWith('bestmove')) {
      const best = line.split(' ')[1];
      const job = this.current;
      this.current = null;
      this.searching = false;
      if (!job.cancelled) job.resolve({ bestmove: best, lines: Object.values(this.lines).sort((a, b) => a.multipv - b.multipv) });
      else job.resolve(null);
      if (this.pending) { const p = this.pending; this.pending = null; this.start(p); }
    }
  }

  // opts: {depth, movetime, multipv, skill, onInfo}
  analyse(fen, opts = {}) {
    return new Promise((resolve) => {
      const job = { fen, opts, resolve, onInfo: opts.onInfo };
      if (this.searching) {
        if (this.pending) { this.pending.cancelled = true; this.pending.resolve(null); }
        if (this.current) this.current.cancelled = true;
        this.pending = job;
        this.send('stop');
      } else this.start(job);
    });
  }

  async start(job) {
    await this.ready;
    this.current = job;
    this.searching = true;
    this.lines = {};
    const o = job.opts;
    this.send(`setoption name MultiPV value ${o.multipv || 1}`);
    this.send(`setoption name Skill Level value ${o.skill ?? 20}`);
    this.send(`position fen ${job.fen}`);
    if (o.movetime) this.send(`go movetime ${o.movetime}${o.depth ? ' depth ' + o.depth : ''}`);
    else this.send(`go depth ${o.depth || 16}`);
  }

  stop() {
    if (this.pending) { this.pending.cancelled = true; this.pending.resolve(null); this.pending = null; }
    if (this.searching) { if (this.current) this.current.cancelled = true; this.send('stop'); }
  }
}

function parseInfo(line) {
  const t = line.split(' ');
  const get = (k) => { const i = t.indexOf(k); return i >= 0 ? t[i + 1] : null; };
  const depth = parseInt(get('depth'), 10);
  const multipv = parseInt(get('multipv') || '1', 10);
  const si = t.indexOf('score');
  if (si < 0) return null;
  if (t[si + 3] === 'lowerbound' || t[si + 3] === 'upperbound') return null;
  const type = t[si + 1], val = parseInt(t[si + 2], 10);
  const pv = t.slice(t.indexOf('pv') + 1);
  return { depth, multipv, cp: type === 'cp' ? val : null, mate: type === 'mate' ? val : null, pv };
}
