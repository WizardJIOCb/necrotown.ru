// Adapted from Kevin Ngo's Cinderwatch 797234e (MIT). See LICENSE-cinderwatch.txt.
import * as THREE from './three.module.min.js';
const PI = Math.PI, TAU = Math.PI * 2, HPI = Math.PI / 2;
const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
const sat = x => x < 0 ? 0 : (x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const easeOut = t => 1 - Math.pow(1 - sat(t), 3);
const easeIn = t => { t = sat(t); return t * t * t; };
const easeInOut = t => { t = sat(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const f = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.sign = () => f() < .5 ? -1 : 1;
  f.chance = p => f() < p;
  return f;
}

const _tc = new THREE.Color();
function C(hex, mul = 1) { _tc.set(hex); return [_tc.r * mul, _tc.g * mul, _tc.b * mul]; }
function mixC(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function mulC(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }


const L_DIRT = 0, L_ROCK = 1, L_MASON = 2, L_WOOD = 3, L_COBBLE = 4, L_METAL = 5, L_SLATE = 6, L_CLOTH = 7, L_PLAIN = 8, L_BONE = 9, L_THATCH = 10;

const ZERO3 = [0, 0, 0], WHITE = [1, 1, 1];
const GEO_CACHE = {};
function baseGeo(key, make) {
  let e = GEO_CACHE[key];
  if (!e) { let g = make(); if (g.index) g = g.toNonIndexed(); e = GEO_CACHE[key] = { pos: g.attributes.position.array, nrm: g.attributes.normal.array }; }
  return e;
}
const gBox = () => baseGeo('box', () => new THREE.BoxGeometry(1, 1, 1));
const gCyl = (n = 8, rt = 1, open = false) => baseGeo('cyl' + n + '_' + rt + (open ? 'o' : ''), () => new THREE.CylinderGeometry(rt, 1, 1, n, 1, open));
const gIco = (d = 1) => baseGeo('ico' + d, () => new THREE.IcosahedronGeometry(1, d));
const gSph = (w = 8, h = 6) => baseGeo('sph' + w + '_' + h, () => new THREE.SphereGeometry(1, w, h));
const gDome = (w = 8, h = 4) => baseGeo('dome' + w + '_' + h, () => new THREE.SphereGeometry(1, w, h, 0, TAU, 0, HPI));
const gOct = () => baseGeo('oct', () => new THREE.OctahedronGeometry(1, 0));
const gTorus = (n = 10, t = 0.2, m = 5) => baseGeo('tor' + n + '_' + t + '_' + m, () => new THREE.TorusGeometry(1, t, m, n));

const _sv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], _sn = new THREE.Vector3(), _snv = new THREE.Vector3();
const _sq = new THREE.Quaternion(), _se = new THREE.Euler(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _ss = new THREE.Vector3(), _sm = new THREE.Matrix4(), _sp = new THREE.Vector3();
let soupRng = makeRng(777);

class Soup {
  constructor() { this.P = []; this.N = []; this.K = []; this.U = []; this.S = []; }
  get verts() { return this.P.length / 3; }
  clear() { this.P.length = this.N.length = this.K.length = this.U.length = this.S.length = 0; return this; }
  v(x, y, z, nx, ny, nz, r, g, b, u, w, layer, rough, sway = 0, emis = 0) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.K.push(r, g, b); this.U.push(u, w); this.S.push(layer, rough, sway, emis);
  }
  tri(a, b, c, col, layer, rough, o) {
    _sa.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _sb.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _sn.crossVectors(_sa, _sb);
    const len = _sn.length(); if (len < 1e-10) return; _sn.multiplyScalar(1 / len);
    const ax = Math.abs(_sn.x), ay = Math.abs(_sn.y), az = Math.abs(_sn.z), mode = (ay >= ax && ay >= az) ? 0 : (ax >= az ? 1 : 2);
    const sw = o && o.sway || 0, em = o && o.emis || 0, uvs = o && o.uvs || 0.25;
    for (const p of [a, b, c]) {
      const u = mode === 0 ? p[0] : (mode === 1 ? p[2] : p[0]), w = mode === 0 ? p[2] : p[1];
      const cc = p.length > 3 ? p[3] : col;
      this.v(p[0], p[1], p[2], _sn.x, _sn.y, _sn.z, cc[0], cc[1], cc[2], u * uvs, w * uvs, layer, rough, sw, em);
    }
  }
  quad(a, b, c, d, col, layer, rough, o) { this.tri(a, b, c, col, layer, rough, o); this.tri(a, c, d, col, layer, rough, o); }
  add(src, o) {
    const sp = src.pos, sn = src.nrm, n = sp.length;
    let sx = 1, sy = 1, sz = 1; const s = o.s;
    if (s !== undefined) { if (typeof s === 'number') sx = sy = sz = s; else { sx = s[0]; sy = s[1]; sz = s[2]; } }
    const q = _sq; if (o.q) q.copy(o.q); else if (o.r) q.setFromEuler(_se.set(o.r[0], o.r[1], o.r[2], o.ro || 'XYZ')); else q.identity();
    const p = o.p || ZERO3, px = p[0], py = p[1], pz = p[2];
    const c = o.c || WHITE, jit = o.jit === undefined ? 0.07 : o.jit, k = 1 + (soupRng() * 2 - 1) * jit;
    const cr = c[0] * k, cg = c[1] * k, cb = c[2] * k;
    const layer = o.l === undefined ? L_PLAIN : o.l, rough = o.rough === undefined ? 0.92 : o.rough, sway = o.sway || 0, emis = o.emis || 0;
    const uvs = o.uvs === undefined ? 0.25 : o.uvs, uo = Math.floor(soupRng() * 64) / 16, vo = Math.floor(soupRng() * 64) / 16;
    const smoothN = !!o.smooth, deform = o.deform, grad = o.grad, cf = o.cf, swayf = o.swayf, c2 = o.c2;
    const P = this.P, N = this.N, K = this.K, U = this.U, S = this.S, start = P.length;
    for (let i = 0; i < n; i += 9) {
      for (let j = 0; j < 3; j++) { const v = _sv[j]; v.set(sp[i + j * 3] * sx, sp[i + j * 3 + 1] * sy, sp[i + j * 3 + 2] * sz); if (deform) deform(v); }
      _sa.subVectors(_sv[1], _sv[0]); _sb.subVectors(_sv[2], _sv[0]); _sn.crossVectors(_sa, _sb);
      const len = _sn.length(); if (len < 1e-12) continue; _sn.multiplyScalar(1 / len);
      const ax = Math.abs(_sn.x), ay = Math.abs(_sn.y), az = Math.abs(_sn.z), mode = (ay >= ax && ay >= az) ? 0 : (ax >= az ? 1 : 2);
      for (let j = 0; j < 3; j++) {
        const v = _sv[j];
        const u = mode === 0 ? v.x : (mode === 1 ? v.z : v.x), w = mode === 0 ? v.z : v.y;
        U.push(u * uvs + uo, w * uvs + vo);
        let g = 1; if (grad) g = lerp(grad[2], 1, smooth(grad[0], grad[1], v.y));
        if (cf) g *= cf(v);
        if (c2) { const t = c2[3](v); K.push(lerp(cr, c2[0], t) * g, lerp(cg, c2[1], t) * g, lerp(cb, c2[2], t) * g); }
        else K.push(cr * g, cg * g, cb * g);
        S.push(layer, rough, swayf ? swayf(v) : sway, emis);
        if (smoothN) _snv.set(sn[i + j * 3] / sx, sn[i + j * 3 + 1] / sy, sn[i + j * 3 + 2] / sz).normalize().applyQuaternion(q);
        else _snv.copy(_sn).applyQuaternion(q);
        N.push(_snv.x, _snv.y, _snv.z);
        v.applyQuaternion(q);
        P.push(v.x + px, v.y + py, v.z + pz);
      }
    }
    if (o.dbl) this._double(start);
    return this;
  }
  _double(start) {
    const P = this.P, N = this.N, K = this.K, U = this.U, S = this.S, end = P.length;
    for (let i = start; i < end; i += 9) {
      for (const j of [0, 2, 1]) {
        const a = i + j * 3, vi = a / 3;
        P.push(P[a], P[a + 1], P[a + 2]); N.push(-N[a], -N[a + 1], -N[a + 2]); K.push(K[a], K[a + 1], K[a + 2]);
        U.push(U[vi * 2], U[vi * 2 + 1]); S.push(S[vi * 4], S[vi * 4 + 1], S[vi * 4 + 2], S[vi * 4 + 3]);
      }
    }
  }
  box(w, h, d, x, y, z, c, o = {}) { o.s = [w, h, d]; o.p = [x, y, z]; o.c = c; return this.add(gBox(), o); }
  cyl(r, h, x, y, z, c, o = {}) { o.s = [r, h, o.rz === undefined ? r : o.rz]; o.p = [x, y, z]; o.c = c; return this.add(gCyl(o.n || 8, o.rt === undefined ? 1 : o.rt, o.open), o); }
  cone(r, h, x, y, z, c, o = {}) { o.s = [r, h, r]; o.p = [x, y, z]; o.c = c; return this.add(gCyl(o.n || 6, 0), o); }
  ico(r, x, y, z, c, o = {}) { o.s = o.sc ? [r * o.sc[0], r * o.sc[1], r * o.sc[2]] : r; o.p = [x, y, z]; o.c = c; return this.add(gIco(o.d === undefined ? 1 : o.d), o); }
  sph(r, x, y, z, c, o = {}) { o.s = o.sc ? [r * o.sc[0], r * o.sc[1], r * o.sc[2]] : r; o.p = [x, y, z]; o.c = c; if (o.smooth === undefined) o.smooth = true; return this.add(gSph(o.w || 8, o.h || 6), o); }
  rock(r, x, y, z, c, o = {}) {
    const sd = soupRng() * 100, f = 1.5 / r, sq = o.sq === undefined ? 0.75 : o.sq;
    o.deform = v => { const k = .72 + .56 * vnoise(v.x * f + v.y * f * .7 + sd, v.z * f - v.y * f * .6 + sd, 7); v.multiplyScalar(k); v.y *= sq; };
    if (o.l === undefined) o.l = L_ROCK; if (o.r === undefined) o.r = [soupRng() * .5, soupRng() * TAU, soupRng() * .5];
    o.s = r; o.p = [x, y, z]; o.c = c; return this.add(gIco(o.d === undefined ? 1 : o.d), o);
  }
  merge(o2, opt = {}) {
    const p = opt.p || ZERO3, s = opt.s === undefined ? 1 : opt.s, q = _sq;
    if (opt.q) q.copy(opt.q); else if (opt.r) q.setFromEuler(_se.set(opt.r[0], opt.r[1], opt.r[2])); else q.setFromEuler(_se.set(0, opt.ry || 0, 0));
    const tint = opt.tint, ao = opt.ao, nv = o2.P.length;
    const P = this.P, N = this.N, K = this.K;
    for (let i = 0; i < nv; i += 3) {
      const ly = o2.P[i + 1];
      _sp.set(o2.P[i] * s, ly * s, o2.P[i + 2] * s).applyQuaternion(q); P.push(_sp.x + p[0], _sp.y + p[1], _sp.z + p[2]);
      _sp.set(o2.N[i], o2.N[i + 1], o2.N[i + 2]).applyQuaternion(q); N.push(_sp.x, _sp.y, _sp.z);
      let g = 1; if (ao) g = lerp(ao[2], 1, smooth(ao[0], ao[1], ly));
      if (tint) K.push(o2.K[i] * tint[0] * g, o2.K[i + 1] * tint[1] * g, o2.K[i + 2] * tint[2] * g); else K.push(o2.K[i] * g, o2.K[i + 1] * g, o2.K[i + 2] * g);
    }
    for (let i = 0; i < o2.U.length; i++) this.U.push(o2.U[i]);
    for (let i = 0; i < o2.S.length; i++) this.S.push(o2.S[i]);
    return this;
  }
  mirrorXZ() {
    const P = this.P, N = this.N, K = this.K, U = this.U, S = this.S;
    for (let i = 0; i < P.length; i += 3) { let t = P[i]; P[i] = P[i + 2]; P[i + 2] = t; t = N[i]; N[i] = N[i + 2]; N[i + 2] = t; }
    const sw = (arr, a, b, n) => { for (let k = 0; k < n; k++) { const t = arr[a + k]; arr[a + k] = arr[b + k]; arr[b + k] = t; } };
    for (let v = 0; v < P.length / 3; v += 3) { sw(P, (v + 1) * 3, (v + 2) * 3, 3); sw(N, (v + 1) * 3, (v + 2) * 3, 3); sw(K, (v + 1) * 3, (v + 2) * 3, 3); sw(U, (v + 1) * 2, (v + 2) * 2, 2); sw(S, (v + 1) * 4, (v + 2) * 4, 4); }
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.K), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.U), 2));
    g.setAttribute('aSurf', new THREE.BufferAttribute(new Float32Array(this.S), 4));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

const COL = {
  stone: C(0x767b88), stoneD: C(0x4c505c), stoneL: C(0x9499a4), basalt: C(0x30323c), basaltL: C(0x454856),
  earth: C(0x54473c), earthD: C(0x352d27), grass: C(0x55583f), grassD: C(0x3f4231), moss: C(0x48553a),
  road: C(0x8a8176), roadD: C(0x5e574e), mud: C(0x43362b),
  wood: C(0x7a5c40), woodD: C(0x4e3a26), woodL: C(0x9a7a54), bark: C(0x3a3029), rope: C(0x8a7754),
  iron: C(0x3c4049), ironL: C(0x646b78), steel: C(0x8a93a2), brass: C(0x9a7b3a), bronze: C(0x7a5a34), gold: C(0xe2aa3c),
  bone: C(0xe0d7c0), boneD: C(0xa39a84), clothR: C(0x7c2c24), clothB: C(0x2f4c6c), clothD: C(0x2a2622), clothT: C(0x8a8068),
  slate: C(0x424a5a), thatch: C(0x8a7646), black: C(0x08090c), ember: C(0xff7a2a), crystal: C(0x7fc4ff),
  tuftA: C(0x55583f), tuftB: C(0x8a7646), snow: C(0xdfe8f4), ice: C(0x9fcfee), leaf: C(0x33492c), leafL: C(0x58703a), sand: C(0xb9976a), ash: C(0x4a4648),
  slime: C(0x4a6a44), slimeD: C(0x28402c), rat: C(0x51453c), ratD: C(0x372e28), bat: C(0x2e2a36), ogre: C(0x93a076), ogreD: C(0x63704e), leather: C(0x5a4030), skin: C(0xb98a6a),
};


const _segq = new THREE.Quaternion(), _segd = new THREE.Vector3(), _upv = new THREE.Vector3(0, 1, 0);
Soup.prototype.seg = function (a, b, r0, r1, c, o = {}) {
  _segd.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _segd.length(); if (len < 1e-5) return this; _segd.multiplyScalar(1 / len);
  _segq.setFromUnitVectors(_upv, _segd);
  o.q = _segq; o.s = [r0, len, r0]; o.p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; o.c = c;
  return this.add(gCyl(o.n || 6, Math.round(clamp(r1 / r0, 0, 2.5) * 10) / 10), o);
};

function clothPanel(S, o) {
  const nx = o.nx || 4, ny = o.ny || 6, rng = o.rng, sway = o.sway === undefined ? .8 : o.sway;
  const yAt = j => o.yTop - o.len * j / ny, sw = j => Math.pow(j / ny, 1.3) * sway;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (j >= ny - 2 && rng() < (o.rag === undefined ? .4 : o.rag)) continue;
    if (j === ny - 1 && (i & 1)) continue;
    const xa = lerp(o.x0, o.x1, i / nx), xb = lerp(o.x0, o.x1, (i + 1) / nx);
    const emblem = o.col2 && i >= 1 && i < nx - 1 && j >= 1 && j <= 2;
    const c = mulC(emblem ? o.col2 : o.col, .78 + .3 * rng());
    const q = [[xa, yAt(j), sw(j)], [xb, yAt(j), sw(j)], [xb, yAt(j + 1), sw(j + 1)], [xa, yAt(j + 1), sw(j + 1)]];
    for (const [order, nz] of [[[0, 3, 2, 0, 2, 1], 1], [[0, 1, 2, 0, 2, 3], -1]]) for (const k of order) S.v(q[k][0], q[k][1], o.z, 0, 0, nz, c[0], c[1], c[2], q[k][0] * .5, q[k][1] * .5, L_CLOTH, .95, q[k][2], 0);
  }
}


const R = {scene:null}, MAT = {inst:null};
class PartBatch {
  constructor(build, cap, o = {}) {
    const S = new Soup(); build(S); const geo = S.build();
    this.cap = cap; this.n = 0;
    const m = this.mesh = new THREE.InstancedMesh(geo, MAT.inst, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.flash = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.flash.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aFlash', this.flash);
    m.frustumCulled = false; m.castShadow = o.shadow !== false; m.receiveShadow = true; m.count = 0;
    this.rad = o.rad || .1;
    R.scene.add(m); PartBatch.all.push(this);
  }
  put(mat, flash = 0, tint = null) {
    
    if (this.n >= this.cap) return; const i = this.n++;
    mat.toArray(this.mesh.instanceMatrix.array, i * 16);
    const c = this.mesh.instanceColor.array;
    if (tint) { c[i * 3] = tint[0]; c[i * 3 + 1] = tint[1]; c[i * 3 + 2] = tint[2]; } else { c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 1; }
    this.flash.array[i] = flash;
  }
  end() {
    const m = this.mesh; m.count = this.n; m.visible = this.n > 0;
    if (this.n) {
      for (const a of [m.instanceMatrix, m.instanceColor, this.flash]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
    }
  }
}
PartBatch.all = [];
function beginParts() { for (const b of PartBatch.all) b.n = 0; }
function endParts() { for (const b of PartBatch.all) b.end(); }

const _rq = new THREE.Quaternion(), _re = new THREE.Euler(), _rv = new THREE.Vector3(), _rs = new THREE.Vector3(), _rm = new THREE.Matrix4();
const _M = []; for (let i = 0; i < 28; i++) _M.push(new THREE.Matrix4());
function xf(out, parent, px, py, pz, rx, ry, rz, sx = 1, sy = 1, sz = 1) {
  _rq.setFromEuler(_re.set(rx, ry, rz, 'XYZ')); _rm.compose(_rv.set(px, py, pz), _rq, _rs.set(sx, sy, sz));
  if (parent) out.multiplyMatrices(parent, _rm); else out.copy(_rm); return out;
}

const KIT = {};
function humanKit(style, cap) {
  const k = {}, limb = cap * 2;
  if (style === 'skel' || style === 'giant') {
    const G = style === 'giant', bone = G ? mulC(COL.bone, .82) : COL.bone, bd = G ? mulC(COL.boneD, .8) : COL.boneD, o = () => ({ l: L_BONE, jit: .05 });
    k.pelvis = new PartBatch(S => { S.box(.27, .1, .15, 0, 0, 0, bd, o()); S.box(.08, .13, .08, 0, .09, -.01, bone, o()); if (G) { for (const s of [-1, 1]) S.box(.1, .16, .17, s * .14, -.02, 0, bone, o()); clothPanel(S, { x0: -.13, x1: .13, yTop: -.03, len: .3, z: .09, col: mulC(COL.clothD, 1.4), rng: makeRng(5), sway: 0, nx: 3, ny: 4 }); } }, cap, { rad: .1 });
    k.torso = new PartBatch(S => {
      S.box(.07, .43, .07, 0, .21, -.03, bd, o());
      const ribs = G ? [.1, .16, .22, .28, .34] : [.15, .24, .33];
      for (const y of ribs) { S.box(.31 - (.34 - y) * .25, G ? .04 : .055, .21, 0, y, .01, bone, o()); }
      S.box(.39, .07, .12, 0, .43, 0, bone, o()); S.box(.06, .25, .03, 0, .25, .11, bone, o());
      if (G) { for (const s of [-1, 1]) { S.cone(.05, .16, s * .2, .52, 0, bone, { n: 4, l: L_BONE }); S.cone(.04, .12, s * .13, .5, -.04, bd, { n: 4, l: L_BONE }); } for (let v = 0; v < 4; v++) S.box(.05, .03, .06, 0, .1 + v * .09, -.08, bone, o()); }
    }, cap, { rad: .16 });
    k.head = new PartBatch(S => {
      S.sph(.15, 0, .17, 0, bone, { sc: [1, .95, 1.08], l: L_BONE, w: 7, h: 5, smooth: false }); S.box(.17, .08, .14, 0, .04, .035, bd, o());
      for (const s of [-1, 1]) S.box(.066, .062, .05, s * .058, .185, .132, COL.black, { jit: 0 });
      S.box(.03, .04, .04, 0, .12, .152, COL.black, { jit: 0 });
      if (G) { for (const s of [-1, 1]) { S.seg([s * .12, .24, 0], [s * .27, .36, .03], .05, .035, bd, { l: L_BONE, n: 5 }); S.seg([s * .27, .36, .03], [s * .3, .52, .1], .035, .008, bone, { l: L_BONE, n: 5 }); } for (let t = -2; t <= 2; t++) S.box(.022, .04, .02, t * .032, .005, .1, bone, { jit: 0 }); }
    }, cap, { rad: .15 });
    k.uArm = new PartBatch(S => { S.box(.062, .25, .062, 0, -.125, 0, bone, o()); S.box(.085, .06, .085, 0, -.26, 0, bd, o()); }, limb, { rad: .06, shadow: false });
    k.lArm = new PartBatch(S => { S.box(.052, .25, .052, 0, -.125, 0, bone, o()); S.box(.08, .08, .08, 0, -.28, 0, bd, o()); }, limb, { rad: .06, shadow: false });
    k.uLeg = new PartBatch(S => { S.box(.076, .27, .076, 0, -.135, 0, bone, o()); S.box(.09, .06, .09, 0, -.28, 0, bd, o()); }, limb, { rad: .07, shadow: false });
    k.lLeg = new PartBatch(S => { S.box(.062, .28, .062, 0, -.14, 0, bone, o()); S.box(.09, .05, .19, 0, -.295, .05, bd, o()); }, limb, { rad: .07, shadow: false });
  } else if (style === 'foot') {
    const mail = COL.steel, cloth = mulC(COL.clothB, 1.75), lea = COL.leather;
    k.pelvis = new PartBatch(S => { S.box(.28, .14, .19, 0, 0, 0, mulC(COL.clothD, 1.6), { l: L_CLOTH }); S.box(.3, .05, .2, 0, .06, 0, lea, {}); }, cap, { rad: .12 });
    k.torso = new PartBatch(S => {
      S.box(.34, .4, .22, 0, .21, 0, cloth, { l: L_CLOTH, jit: 0 }); S.box(.12, .34, .23, 0, .2, 0, mulC(cloth, .62), { l: L_CLOTH, jit: 0 });
      S.box(.42, .1, .25, 0, .4, 0, mail, { l: L_METAL, rough: .5 }); S.box(.16, .08, .16, 0, .45, 0, COL.skin, {});
    }, cap, { rad: .17 });
    k.head = new PartBatch(S => {
      S.box(.19, .2, .19, 0, .12, .0, COL.skin, { jit: .04 }); S.box(.2, .08, .1, 0, .06, -.06, mulC(COL.leather, .7), {});
      S.add(gDome(8, 3), { s: [.155, .13, .155], p: [0, .19, 0], c: mail, l: L_METAL, rough: .42 }); S.cyl(.21, .03, 0, .19, 0, mulC(mail, .85), { n: 8, l: L_METAL, rough: .42 });
      for (const s of [-1, 1]) S.box(.03, .03, .02, s * .05, .14, .098, COL.black, { jit: 0 });
    }, cap, { rad: .14 });
    k.uArm = new PartBatch(S => { S.box(.1, .26, .1, 0, -.13, 0, mail, { l: L_METAL, rough: .5 }); S.box(.13, .09, .13, 0, -.03, 0, mulC(mail, 1.1), { l: L_METAL, rough: .45 }); }, limb, { rad: .07, shadow: false });
    k.lArm = new PartBatch(S => { S.box(.085, .24, .085, 0, -.12, 0, lea, {}); S.box(.09, .08, .09, 0, -.27, 0, COL.skin, {}); }, limb, { rad: .07, shadow: false });
    k.uLeg = new PartBatch(S => { S.box(.115, .28, .115, 0, -.14, 0, mulC(COL.clothD, 1.5), { l: L_CLOTH }); }, limb, { rad: .08, shadow: false });
    k.lLeg = new PartBatch(S => { S.box(.1, .28, .1, 0, -.14, 0, mulC(lea, .7), {}); S.box(.11, .06, .2, 0, -.29, .045, mulC(lea, .6), {}); }, limb, { rad: .08, shadow: false });
  } else {
    const sk = COL.ogre, sdk = COL.ogreD, o = () => ({ jit: .06, d: 1 });
    k.pelvis = new PartBatch(S => { S.ico(.2, 0, 0, 0, sdk, { sc: [1.15, .6, .95], d: 1 }); clothPanel(S, { x0: -.15, x1: .15, yTop: .02, len: .3, z: .17, col: COL.leather, rng: makeRng(3), sway: 0, nx: 3, ny: 4 }); clothPanel(S, { x0: -.14, x1: .14, yTop: .02, len: .24, z: -.17, col: mulC(COL.leather, .7), rng: makeRng(4), sway: 0, nx: 3, ny: 3 }); S.box(.44, .05, .36, 0, .03, 0, mulC(COL.leather, .6), {}); }, cap, { rad: .2 });
    k.torso = new PartBatch(S => {
      S.ico(.27, 0, .17, .04, sk, { sc: [1.1, .9, 1.05], d: 1 }); S.ico(.25, 0, .37, -.01, sk, { sc: [1.2, .75, .85], d: 1 });
      for (const s of [-1, 1]) S.ico(.11, s * .27, .45, 0, sdk, { d: 1 });
      S.sph(.1, -.27, .5, 0, COL.iron, { l: L_METAL, w: 6, h: 4, smooth: false }); for (let a = 0; a < 3; a++) S.cone(.03, .1, -.27 + Math.cos(a * 2.1) * .08, .6, Math.sin(a * 2.1) * .08, COL.ironL, { n: 4, l: L_METAL });
      S.box(.07, .5, .03, .08, .25, .29, mulC(COL.leather, .7), { r: [0, 0, .5] });
    }, cap, { rad: .28 });
    k.head = new PartBatch(S => {
      S.ico(.13, 0, .1, .02, sk, { sc: [1.05, .95, 1.0], d: 1 }); S.box(.19, .07, .13, 0, .03, .08, sdk, { jit: 0 }); S.box(.22, .04, .08, 0, .15, .09, sdk, { jit: 0 });
      for (const s of [-1, 1]) { S.cone(.022, .09, s * .07, .08, .15, COL.bone, { n: 4, l: L_BONE }); S.box(.045, .03, .03, s * .055, .125, .125, COL.black, { jit: 0 }); S.box(.04, .09, .03, s * .15, .12, 0, sdk, { r: [0, 0, s * -.4] }); }
    }, cap, { rad: .13 });
    k.uArm = new PartBatch(S => { S.ico(.1, 0, -.12, 0, sk, { sc: [1, 1.5, 1], d: 1 }); }, limb, { rad: .1, shadow: false });
    k.lArm = new PartBatch(S => { S.ico(.09, 0, -.12, 0, sk, { sc: [1, 1.5, 1], d: 1 }); S.ico(.085, 0, -.27, 0, sdk, { d: 1 }); S.box(.2, .06, .2, 0, -.18, 0, COL.leather, {}); }, limb, { rad: .1, shadow: false });
    k.uLeg = new PartBatch(S => { S.ico(.11, 0, -.1, 0, sk, { sc: [1, 1.35, 1.05], d: 1 }); }, limb, { rad: .1, shadow: false });
    k.lLeg = new PartBatch(S => { S.ico(.095, 0, -.1, 0, sk, { sc: [1, 1.3, 1], d: 1 }); S.box(.17, .07, .26, 0, -.21, .05, sdk, {}); }, limb, { rad: .1, shadow: false });
  }
  return k;
}


const SPEC = {
  skel: { hip: .6, pelvisH: .12, torsoH: .46, shX: .21, shY: .42, uArm: .27, lArm: .29, hipX: .085, uLeg: .29, lLeg: .3, stride: .62, lean: .12, stoop: .1, eyeX: .058, eyeY: .185, eyeZ: .15, top: 1.42 },
  foot: { hip: .59, pelvisH: .1, torsoH: .46, shX: .23, shY: .4, uArm: .27, lArm: .27, hipX: .09, uLeg: .29, lLeg: .29, stride: .55, lean: .06, stoop: 0, eyeX: 0, eyeY: 0, eyeZ: 0, top: 1.4 },
  ogre: { hip: .43, pelvisH: .08, torsoH: .5, shX: .3, shY: .43, uArm: .25, lArm: .3, hipX: .12, uLeg: .21, lLeg: .21, stride: .5, lean: .1, stoop: .14, eyeX: .055, eyeY: .125, eyeZ: .15, top: 1.2 },
};
const RIGOUT = { headM: _M[3], handR: new THREE.Vector3(), handL: new THREE.Vector3(), tip: new THREE.Vector3(), torch: new THREE.Vector3() };
function rigHuman(kit, sp, e) {
  const s = e.scale || 1, mv = e.mv, ph = e.ph, fl = e.flash || 0, tint = e.tint || null, fz = e.flinch || 0;
  const sw = Math.sin(ph) * sp.stride * mv, cw = Math.cos(ph);
  let twist = Math.sin(ph) * .12 * mv, lean = sp.lean * mv + sp.stoop, lunge = 0, dip = 0;
  let shR = .25 * sw - .15, elR = -.35, bladeA = .55, shL = -.7 * sw - .1, elL = -.3, rzR = -.1, rzL = .1;
  if (e.shamble) { shR = -1.0 + .12 * Math.sin(ph); elR = -.7; shL = -.75 + .2 * Math.sin(ph + 1); elL = -.5; bladeA = .2; }
  if (e.shield) { shL = -.55; elL = -1.25; rzL = .2; }
  if (e.torch) { shL = -1.25 + .06 * Math.sin(ph * 2); elL = -.5; }
  if (e.heavy) { shR = -.3 + .3 * sw; elR = -.5; bladeA = 1.9; shL = -.2 - .5 * sw; elL = -.6; }
  if (e.claw) { shR = -1.25 + .45 * sw; elR = -.55; shL = -1.25 - .45 * sw; elL = -.55; }
  if (e.staff) { shR = -.75; elR = -.95; bladeA = .12; }
  if (e.cast > 0) { const u = easeInOut(Math.min(1, e.cast * 1.6)); shR = lerp(shR, -2.7, u); elR = lerp(elR, -.25, u); shL = lerp(shL, -2.3, u); elL = lerp(elL, -.4, u); }
  if (e.drum) { const b = Math.sin(e.beat || 0); shR = -.95 - .5 * Math.max(0, b); elR = -1.15; shL = -.95 - .5 * Math.max(0, -b); elL = -1.15; bladeA = .9; }
  let atk = e.atk;
  if (e.bow) {
    const d = e.draw || 0; shL = -HPI + (e.pitch || 0); elL = -.05; rzL = .05; shR = -HPI + (e.pitch || 0) + .1; elR = -.2 - d * 1.9; twist = .2 + d * .25; atk = -1;
  }
  if (atk >= 0) {
    const t = atk;
    if (t < .38) { const u = easeInOut(t / .38); shR = lerp(shR, -3.35, u); elR = lerp(elR, -.95, u); bladeA = lerp(bladeA, -2.95, u); twist = lerp(twist, -.42, u); lean = lerp(lean, -.12, u); }
    else if (t < .52) { const u = easeIn((t - .38) / .14); shR = lerp(-3.35, -.85, u); elR = lerp(-.95, -.12, u); bladeA = lerp(-2.95, 1.75, u); twist = lerp(-.42, .42, u); lean = lerp(-.12, .26, u); lunge = .14 * u; dip = .05 * u; }
    else { const u = easeOut((t - .52) / .48); shR = lerp(-.85, shR, u); elR = lerp(-.12, elR, u); bladeA = lerp(1.75, bladeA, u); twist = lerp(.42, twist, u); lean = lerp(.26, lean, u); lunge = .14 * (1 - u); dip = .05 * (1 - u); }
  }
  const bob = -sp.uLeg * (1 - Math.cos(sw)) - dip + (e.heavy ? Math.abs(Math.sin(ph)) * .035 * mv : Math.abs(Math.sin(ph)) * .02 * mv);
  const M0 = xf(_M[0], null, e.x, e.y, e.z, 0, e.yaw, 0, s, s, s);
  const M1 = xf(_M[1], M0, 0, sp.hip + sp.uLeg * 0 + bob, lunge - fz * .06, lean * .4 - fz * .18, twist * .5, (e.shamble ? Math.sin(ph) * .05 * mv : 0));
  kit.pelvis.put(M1, fl, tint);
  const M2 = xf(_M[2], M1, 0, sp.pelvisH, 0, lean * .6 - fz * .4, twist, 0);
  kit.torso.put(M2, fl, tint);
  const M3 = xf(_M[3], M2, 0, sp.torsoH, 0, -lean * .6 - fz * .35 + (e.shamble ? Math.sin(ph * 2) * .05 : 0), -twist * .8, e.shamble ? Math.sin(ph) * .1 * mv : 0);
  kit.head.put(M3, fl, tint);
  const M4 = xf(_M[4], M2, sp.shX, sp.shY, 0, shL + fz * .5, 0, rzL + fz * .3), M5 = xf(_M[5], M4, 0, -sp.uArm, 0, elL, 0, 0);
  kit.uArm.put(M4, fl, tint); kit.lArm.put(M5, fl, tint);
  const M6 = xf(_M[6], M2, -sp.shX, sp.shY, 0, shR + fz * .4, 0, rzR - fz * .3), M7 = xf(_M[7], M6, 0, -sp.uArm, 0, elR, 0, 0);
  kit.uArm.put(M6, fl, tint); kit.lArm.put(M7, fl, tint);
  RIGOUT.handR.set(0, -sp.lArm, 0).applyMatrix4(M7); RIGOUT.handL.set(0, -sp.lArm, 0).applyMatrix4(M5);
  const I = KIT.item, psiR = shR + elR + fz * .4, psiL = shL + elL + fz * .5;
  if (e.weapon) { const M8 = xf(_M[8], M7, 0, -sp.lArm, 0, bladeA - psiR, 0, 0, e.wScale || 1, e.wScale || 1, e.wScale || 1); e.weapon.put(M8, fl, null); RIGOUT.tip.set(0, .6, 0).applyMatrix4(M8); }
  if (e.shield) { const M9 = xf(_M[9], M5, .04, -sp.lArm * .6, .06, -psiL + .05, .25, 0); e.shield.put(M9, fl, e.shieldTint || null); }
  if (e.torch) { const M9 = xf(_M[9], M5, 0, -sp.lArm, 0, .25 - psiL, 0, 0); I.torch.put(M9, 0, null); RIGOUT.torch.set(0, .46, 0).applyMatrix4(M9); }
  if (e.bow) { const M9 = xf(_M[9], M5, 0, -sp.lArm, 0, HPI + .0, 0, 0); I.bow.put(M9, fl, null); }
  if (e.helm) I.helm.put(M3, fl, null);
  if (e.plate) I.plate.put(M2, fl, null);
  if (e.hood) I.hood.put(M3, fl, null); if (e.robe) I.robe.put(M2, fl, null); if (e.drum) I.drum.put(M2, fl, null); if (e.standard) I.standard.put(M2, 0, null);
  if (e.keg) I.keg.put(M2, fl, null); if (e.wraps) { I.wraps.put(M2, fl, null); I.wrapHead.put(M3, fl, null); } if (e.crown) I.crown.put(M3, fl, null);
  const kL = Math.max(0, cw) * 1.0 * mv, kR = Math.max(0, -cw) * 1.0 * mv;
  const M10 = xf(_M[10], M1, sp.hipX, 0, 0, -sw - kL * .25, 0, 0), M11 = xf(_M[11], M10, 0, -sp.uLeg, 0, kL, 0, 0);
  const M12 = xf(_M[12], M1, -sp.hipX, 0, 0, sw - kR * .25, 0, 0), M13 = xf(_M[13], M12, 0, -sp.uLeg, 0, kR, 0, 0);
  kit.uLeg.put(M10, fl, tint); kit.lLeg.put(M11, fl, tint); kit.uLeg.put(M12, fl, tint); kit.lLeg.put(M13, fl, tint);
  return M3;
}

export function initFigures(scene) {
  R.scene = scene;
  MAT.inst = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.78});
  const iron = COL.iron, rust = mixC(COL.ironL, C(0x7a4a2a), .45);
  KIT.skel = humanKit('skel', 96);
  KIT.foot = humanKit('foot', 40);
  KIT.giant = humanKit('giant', 2);
  KIT.ogre = humanKit('ogre', 30);
  for (const k of ['uArm', 'lArm', 'uLeg', 'lLeg']) KIT.giant[k].mesh.castShadow = true;
  const E = KIT.item = {};
  E.hood = new PartBatch(S => {
    const velvet=C(0x466858);
    S.add(gDome(7,4),{s:[.20,.24,.18],p:[0,.18,-.015],c:velvet});
    for(const side of [-1,1]) S.box(.064,.22,.17,side*.165,.13,-.015,velvet);
    S.box(.28,.18,.08,0,.12,-.12,velvet);
  },8);
  E.crown = new PartBatch(S => {
    S.cyl(.20,.08,0,.29,0,COL.gold,{n:8});
    for(let i=0;i<8;i++){const a=i*TAU/8;S.cone(.045,.15,Math.cos(a)*.17,.38,Math.sin(a)*.17,COL.gold,{n:4});}
    S.ico(.052,0,.31,.18,C(0xc0413b),{d:0});
  },3);
  E.sword = new PartBatch(S => { S.box(.035, .13, .035, 0, 0, 0, COL.woodD, {}); S.box(.17, .03, .05, 0, .075, 0, iron, { l: L_METAL }); S.box(.055, .5, .018, 0, .34, 0, rust, { l: L_METAL, rough: .5 }); S.cone(.03, .08, 0, .63, 0, rust, { n: 4, l: L_METAL, rough: .5, rz: .012 }); }, 100, { rad: .05, shadow: false });
  E.blade = new PartBatch(S => { S.box(.04, .13, .04, 0, 0, 0, COL.leather, {}); S.box(.2, .035, .055, 0, .075, 0, COL.brass, { l: L_METAL, rough: .4 }); S.box(.06, .52, .02, 0, .35, 0, mulC(COL.steel, 1.15), { l: L_METAL, rough: .3 }); S.cone(.032, .09, 0, .655, 0, mulC(COL.steel, 1.15), { n: 4, l: L_METAL, rough: .3 }); }, 40, { rad: .05, shadow: false });
  E.torch = new PartBatch(S => { S.box(.04, .42, .04, 0, .1, 0, COL.woodD, { l: L_WOOD }); S.cyl(.06, .1, 0, .34, 0, mulC(COL.black, 3), { n: 6 }); S.cyl(.05, .03, 0, .4, 0, COL.ember, { n: 6, emis: .5, jit: 0 }); }, 80, { rad: .05, shadow: false });
  E.shieldR = new PartBatch(S => { S.cyl(.27, .05, 0, 0, 0, COL.woodD, { n: 8, r: [HPI, 0, 0], l: L_WOOD }); S.add(gTorus(8, .13, 4), { s: .25, p: [0, 0, .01], c: iron, l: L_METAL }); S.sph(.075, 0, 0, .04, COL.ironL, { l: L_METAL, w: 6, h: 4, smooth: false }); for (let a = 0; a < 4; a++) S.box(.03, .42, .012, 0, 0, .03, iron, { l: L_METAL, r: [0, 0, a * PI / 4] }); }, 60, { rad: .2, shadow: false });
  E.shieldH = new PartBatch(S => { const sc = mulC(COL.clothB, 1.6); S.box(.36, .3, .045, 0, .08, 0, sc, { l: L_WOOD, jit: 0 }); S.box(.26, .12, .045, 0, -.12, 0, sc, { l: L_WOOD, jit: 0 }); S.box(.14, .1, .045, 0, -.22, 0, sc, { l: L_WOOD, jit: 0 }); S.box(.07, .5, .05, 0, -.02, .004, mulC(COL.gold, .8), { l: L_METAL, rough: .45, jit: 0 }); S.box(.36, .06, .05, 0, .1, .004, mulC(COL.gold, .8), { l: L_METAL, rough: .45, jit: 0 }); }, 40, { rad: .2, shadow: false });
  E.helm = new PartBatch(S => { S.add(gDome(8, 3), { s: [.18, .175, .195], p: [0, .16, 0], c: iron, l: L_METAL, rough: .5 }); S.box(.035, .13, .03, 0, .15, .185, COL.ironL, { l: L_METAL }); for (const s of [-1, 1]) S.box(.03, .14, .13, s * .165, .1, .03, iron, { l: L_METAL }); S.cone(.03, .16, 0, .4, 0, COL.ironL, { n: 4, l: L_METAL }); }, 60, { rad: .16, shadow: false });
  E.plate = new PartBatch(S => { S.box(.35, .31, .25, 0, .27, 0, iron, { l: L_METAL, rough: .5 }); S.box(.2, .2, .26, 0, .29, .005, COL.ironL, { l: L_METAL, rough: .45 }); for (const s of [-1, 1]) S.sph(.1, s * .21, .44, 0, COL.ironL, { l: L_METAL, w: 6, h: 4, smooth: false, sc: [1, .8, 1.1] }); }, 60, { rad: .2, shadow: false });
  E.bow = new PartBatch(S => { let p = [0, -.36, 0]; for (let i = 1; i <= 6; i++) { const t = i / 6 * 2 - 1, q = [0, t * .36, (1 - t * t) * .12]; S.seg(p, q, .016, .016, COL.woodL, { n: 4, l: L_WOOD }); p = q; } S.seg([0, -.36, 0], [0, .36, 0], .005, .005, COL.bone, { n: 3, jit: 0 }); }, 40, { rad: .1, shadow: false });
  E.club = new PartBatch(S => { S.seg([0, -.12, 0], [0, .62, 0], .045, .11, COL.wood, { l: L_WOOD, n: 6 }); S.cyl(.12, .1, 0, .6, 0, iron, { n: 6, l: L_METAL }); for (let a = 0; a < 6; a++) S.cone(.03, .12, Math.cos(a * 1.05) * .13, .45 + (a % 2) * .14, Math.sin(a * 1.05) * .13, COL.ironL, { n: 4, l: L_METAL, r: [Math.sin(a * 1.05) * 1.57, 0, -Math.cos(a * 1.05) * 1.57] }); }, 10, { rad: .1 });
  E.boneclub = new PartBatch(S => { S.seg([0, -.1, 0], [0, .6, 0], .04, .055, COL.bone, { l: L_BONE, n: 5 }); S.ico(.11, .05, .66, 0, COL.bone, { l: L_BONE, d: 1 }); S.ico(.1, -.06, .64, .03, COL.boneD, { l: L_BONE, d: 1 }); S.ico(.07, 0, -.12, 0, COL.boneD, { l: L_BONE, d: 1 }); }, 2, { rad: .1 });
}
export {KIT, SPEC, rigHuman, beginParts, endParts, makeRng};
