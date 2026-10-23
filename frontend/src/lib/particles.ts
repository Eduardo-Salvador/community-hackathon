// @ts-nocheck
export class ParticleField {
mode?: string;
constructor(canvas) { this.pCanvas = canvas; this.state = { live: false }; this.initParticles(); }
stop() { cancelAnimationFrame(this.raf); }
particleMode() {
if (this.mode) return this.mode;
if (this.state.live) return 'ouvindo';
const cycle = ['repouso', 'ouvindo', 'buscando', 'respondendo', 'mapa'];
const t = (performance.now() - (this.pStart || 0)) / 1000;
return cycle[Math.floor(t / 4.2) % cycle.length];
}
initParticles() {
this.N = 720;
this.pcols = { green: ['#1F6B47', '#5FA37C'], yellow: ['#C9A64A', '#E3C76A'], blue: ['#1E4FBF', '#3B6FD8'] };
this.particles = [];
for (let i = 0; i < this.N; i++) {
this.particles.push({ x: 260 + (Math.random() - 0.5) * 300, y: 260 + (Math.random() - 0.5) * 300, seed: Math.random(), cs: Math.random(), size: 1.1 + Math.random() * 1.7 });
}
const outline = [[-60,5],[-56,2],[-52,4],[-51,4],[-50,2],[-48,-1],[-44,-2],[-40,-3],[-37,-5],[-35,-6],[-35,-9],[-37,-11],[-39,-13],[-39,-17],[-40,-20],[-42,-23],[-45,-24],[-48,-26],[-49,-29],[-51,-31],[-53,-34],[-54,-33],[-57,-30],[-55,-27],[-54,-26],[-55,-24],[-58,-22],[-58,-20],[-58,-16],[-60,-15],[-62,-13],[-65,-11],[-69,-11],[-72,-10],[-74,-8],[-73,-5],[-70,-4],[-70,-1],[-69,1],[-67,2],[-64,4],[-62,4]].map((q) => [(q[0] + 54) * 6.4, -(q[1] + 14) * 6.4]);
const inside = (x, y) => {
let c = false;
for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
const xi = outline[i][0], yi = outline[i][1], xj = outline[j][0], yj = outline[j][1];
if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
}
return c;
};
const lens = outline.map((pt, i) => { const nx = outline[(i + 1) % outline.length]; return Math.hypot(nx[0] - pt[0], nx[1] - pt[1]); });
const total = lens.reduce((x, y) => x + y, 0);
this.mapPts = [];
for (let i = 0; i < this.N; i++) {
if (i % 5 < 3) {
let d = ((i * 0.618034) % 1) * total;
let k = 0;
while (d > lens[k]) { d -= lens[k]; k++; }
const pa = outline[k], pb = outline[(k + 1) % outline.length], f = d / lens[k];
this.mapPts.push([pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f, 1]);
} else {
let x = 0, y = 0, tries = 0;
do { x = -150 + Math.random() * 300; y = -150 + Math.random() * 300; tries++; } while (!inside(x, y) && tries < 200);
this.mapPts.push([x, y, 0]);
}
}
const raw = [[-60,5],[-56,2],[-52,4],[-51,4],[-50,2],[-48,-1],[-44,-2],[-40,-3],[-37,-5],[-35,-6],[-35,-9],[-37,-11],[-39,-13],[-39,-17],[-40,-20],[-42,-23],[-45,-24],[-48,-26],[-49,-29],[-51,-31],[-53,-34],[-54,-33],[-57,-30],[-55,-27],[-54,-26],[-55,-24],[-58,-22],[-58,-20],[-58,-16],[-60,-15],[-62,-13],[-65,-11],[-69,-11],[-72,-10],[-74,-8],[-73,-5],[-70,-4],[-70,-1],[-69,1],[-67,2],[-64,4],[-62,4]];
const inBr = (lon, lat) => {
let c = false;
for (let i = 0, j = raw.length - 1; i < raw.length; j = i++) {
const xi = raw[i][0], yi = raw[i][1], xj = raw[j][0], yj = raw[j][1];
if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
}
return c;
};
const D = Math.PI / 180;
this.globe = [];
let other = 0;
const others = this.N - Math.round(this.N * 0.55);
for (let i = 0; i < this.N; i++) {
if (i % 20 < 11) {
let lon = 0, lat = 0, tries = 0;
do { lon = -74 + Math.random() * 40; lat = -34 + Math.random() * 39; tries++; } while (!inBr(lon, lat) && tries < 300);
this.globe.push([lon * D, lat * D, 1]);
} else {
const k = (other + 0.5) / others;
const lat = Math.asin(1 - 2 * k);
const lon = (other * 2.39996) % (Math.PI * 2) - Math.PI;
other++;
this.globe.push([lon, lat, inBr(lon / D, lat / D) ? 1 : 0]);
}
}
}
startParticles() {
this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
this.pStart = performance.now();
const loop = () => {
this.drawParticles();
this.raf = requestAnimationFrame(loop);
};
this.raf = requestAnimationFrame(loop);
}
particleColor(p) {
const pc = (this.curP && this.curP.pcols) || this.pcols;
const shade = p.cs * 3 % 1 < 0.5 ? 0 : 1;
if (p.cs < 1 / 3) return pc.green[shade];
if (p.cs < 2 / 3) return pc.yellow[shade];
return pc.blue[shade];
}
particleTarget(i, p, t, mode, amp) {
const k = i / this.N;
if (mode === 'ouvindo') {
const y0 = 1 - 2 * k;
const rad = Math.sqrt(Math.max(0, 1 - y0 * y0));
const th = i * 2.39996 + t * 0.6;
const R = 150 * (1 + 0.1 * amp * Math.sin(i * 0.37 + t * 9));
return { x: Math.cos(th) * rad * R, y: y0 * R, z: Math.sin(th) * rad };
}
if (mode === 'buscando') {
if (p.seed < 0.3) {
const a = k * Math.PI * 2 * 3 + t * 1.6;
const r = 64 + 6 * Math.sin(t * 3 + i);
return { x: Math.cos(a) * r, y: Math.sin(a) * r, z: Math.sin(a) };
}
const u = (k + t * 0.06) % 1;
const v = [[0, -150], [230, 0], [0, 150], [-230, 0], [0, -150]];
const seg = Math.floor(u * 4);
const f = u * 4 - seg;
const a = v[seg];
const b = v[seg + 1];
const jitter = (p.seed - 0.5) * 10;
return { x: a[0] + (b[0] - a[0]) * f + jitter, y: a[1] + (b[1] - a[1]) * f + jitter, z: Math.sin(u * Math.PI * 8 - t * 4) };
}
if (mode === 'respondendo') {
const row = Math.floor(p.seed * 4);
const x = -240 + ((k * 4) % 1) * 480;
const y = (x * x) / 900 - 40 + row * 18 + Math.sin(x * 0.035 + t * 3.2 + row * 0.9) * (8 + 22 * amp);
return { x: x, y: y, z: Math.sin(x * 0.02 + t * 2) };
}
if (mode === 'mapa') {
const m = this.mapPts[i];
const breathe = 1 + 0.04 * Math.sin(t * 1.1);
return { x: m[0] * breathe + Math.sin(t * 1.3 + p.seed * 12) * 2, y: m[1] * breathe + Math.cos(t * 1.1 + p.seed * 9) * 2, z: m[2] ? 0.9 : Math.sin(t * 1.6 + p.seed * 6) * 0.6 };
}
const g = this.globe[i];
const D = Math.PI / 180;
const rot = 52 * D + t * 0.55;
const tilt = -15 * D;
const lon = g[0] + rot;
const x0 = Math.cos(g[1]) * Math.sin(lon);
const y0 = Math.sin(g[1]);
const z0 = Math.cos(g[1]) * Math.cos(lon);
const y1 = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
const z1 = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
let R = 170 * (g[2] ? 1 + 0.03 * Math.sin(t * 2 + p.seed * 6) : 1);
if (!g[2]) {
const env = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.7) * Math.sin(t * 0.83 + 1));
const ring = Math.sin(g[1] * 7 - t * 3.1) * 0.6 + Math.sin(g[0] * 5 + t * 2.3) * 0.4;
const spark = Math.sin(t * 9 + p.seed * 40) * 0.25;
R = 170 * (1 + 0.05 * env * (ring + spark));
}
return { x: x0 * R, y: -y1 * R, z: z1, br: g[2] };
}
drawParticles() {
const canvas = this.pCanvas;
if (!canvas) return;
const ctx = canvas.getContext('2d');
const t = (performance.now() - this.pStart) / 1000;
const mode = this.particleMode();
const talking = mode === 'ouvindo' || mode === 'respondendo';
const amp = talking ? Math.abs(Math.sin(t * 5.3) * Math.sin(t * 1.9)) * 0.8 + 0.2 : 0.2;
ctx.setTransform(2, 0, 0, 2, 0, 0);
ctx.globalCompositeOperation = 'destination-out';
ctx.fillStyle = this.reduced ? 'rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0.3)';
ctx.fillRect(0, 0, 520, 520);
ctx.globalCompositeOperation = 'source-over';
const ease = this.reduced ? 1 : 0.06;
for (let i = 0; i < this.N; i++) {
const p = this.particles[i];
const tg = this.particleTarget(i, p, this.reduced ? 0 : t, mode, amp);
p.x += (260 + tg.x - p.x) * ease;
p.y += (260 + tg.y - p.y) * ease;
const depth = 0.55 + 0.45 * (tg.z || 0);
ctx.globalAlpha = mode === 'repouso' ? (tg.z > 0 ? (tg.br ? 0.95 : 0.55) : 0.12) : 0.35 + 0.6 * depth;
ctx.fillStyle = tg.col ? tg.col : (mode === 'repouso' && !tg.br ? '#B9C4BD' : this.particleColor(p));
ctx.beginPath();
ctx.arc(p.x, p.y, p.size * (0.7 + 0.5 * depth), 0, Math.PI * 2);
ctx.fill();
}
ctx.globalAlpha = 1;
}
}
