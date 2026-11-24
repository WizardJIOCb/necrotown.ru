// Cinderwatch by Kevin Ngo, MIT. Adapted scene modules from 797234e. See LICENSE-cinderwatch.txt.
import * as THREE from './three.module.min.js';

// 00-util.js
const PI = Math.PI, TAU = Math.PI * 2, HPI = Math.PI / 2;
const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
const sat = x => x < 0 ? 0 : (x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (a, b, l, dt) => b + (a - b) * Math.exp(-l * dt);
const easeOut = t => 1 - Math.pow(1 - sat(t), 3);
const easeIn = t => { t = sat(t); return t * t * t; };
const easeInOut = t => { t = sat(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOutBack = t => { t = sat(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function angDiff(a, b) { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; }
function angDamp(a, b, l, dt) { return a + angDiff(a, b) * (1 - Math.exp(-l * dt)); }

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
const rnd = makeRng(0xC1DE5);
const rr = (a, b) => a + (b - a) * rnd();

function h2(x, y, s) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s = 0, oct = 4) {
  let a = .5, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= .5; f *= 2.03; }
  return sum / n;
}
function pnoise(x, y, per, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = k => ((k % per) + per) % per;
  const a = h2(m(xi), m(yi), s), b = h2(m(xi + 1), m(yi), s), c = h2(m(xi), m(yi + 1), s), d = h2(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pfbm(x, y, per, s = 0, oct = 3) {
  let a = .5, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) { sum += a * pnoise(x * f, y * f, per * f, s + i * 31); n += a; a *= .5; f *= 2; }
  return sum / n;
}
function n1(t, s = 0) { return vnoise(t, s * 7.31, 91) * 2 - 1; }

const _tc = new THREE.Color();
function C(hex, mul = 1) { _tc.set(hex); return [_tc.r * mul, _tc.g * mul, _tc.b * mul]; }
function mixC(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function mulC(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }

function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
function swapRemove(arr, i) { const last = arr.pop(); if (i < arr.length) arr[i] = last; }

const HASH = (() => {
  const o = {};
  try {
    for (const kv of location.hash.replace(/^#/, '').split('&')) { if (!kv) continue; const [k, v] = kv.split('='); o[k] = v === undefined ? '1' : decodeURIComponent(v); }
  } catch (e) {}
  return o;
})();


// 10-gfx.js

const L_DIRT = 0, L_ROCK = 1, L_MASON = 2, L_WOOD = 3, L_COBBLE = 4, L_METAL = 5, L_SLATE = 6, L_CLOTH = 7, L_PLAIN = 8, L_BONE = 9, L_THATCH = 10;
const TEX_LAYERS = 11, TEX_N = 64;

function pnoise2(x, y, perX, perY, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const mx = k => ((k % perX) + perX) % perX, my = k => ((k % perY) + perY) % perY;
  const a = h2(mx(xi), my(yi), s), b = h2(mx(xi + 1), my(yi), s), c = h2(mx(xi), my(yi + 1), s), d = h2(mx(xi + 1), my(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function makeDetailTextures() {
  const N = TEX_N, data = new Uint8Array(N * N * 4 * TEX_LAYERS);
  const put = (layer, x, y, r, g, b, h) => {
    const i = ((layer * N + y) * N + x) * 4;
    data[i] = clamp(r * 127.5, 0, 255); data[i + 1] = clamp(g * 127.5, 0, 255); data[i + 2] = clamp(b * 127.5, 0, 255); data[i + 3] = clamp(h * 255, 0, 255);
  };
  const CG = 8, CS = N / CG, sites = [];
  for (let j = 0; j < CG; j++) for (let i = 0; i < CG; i++) sites.push([(i + .2 + .6 * h2(i, j, 11)) * CS, (j + .2 + .6 * h2(i, j, 12)) * CS, h2(i, j, 13), h2(i, j, 14)]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    {
      const n = pfbm(x / 8, y / 8, 8, 1, 4), sp = h2(x, y, 3), n2 = pfbm(x / 16, y / 16, 4, 5, 2);
      let m = .78 + .34 * n + (n2 - .5) * .2, h = .35 + .35 * n;
      if (sp > .985) { m += .14; h += .4; } else if (sp < .03) { m -= .1; h -= .12; }
      put(L_DIRT, x, y, m * 1.02, m, m * .97, h);
    }
    {
      const n = pfbm(x / 8, y / 8, 8, 21, 4), n2 = pfbm(x / 16, y / 16, 4, 23, 3), n3 = pfbm(x / 16 + 9, y / 16 + 3, 4, 27, 3);
      const crack = (Math.abs(n2 - .5) < .022 || Math.abs(n3 - .52) < .016) ? 1 : 0;
      const strata = Math.sin((y + n2 * 26) * TAU / 16) * .05;
      const m = .74 + .42 * n + strata - crack * .34 + (h2(x, y, 29) - .5) * .08, h = .3 + .6 * n - crack * .4;
      put(L_ROCK, x, y, m, m, m * 1.03, h);
    }
    {
      const row = Math.floor(y / 8), ox = (row & 1) ? 8 : 0, bx = Math.floor((x + ox) / 16), lx = (x + ox) % 16, ly = y % 8;
      const id = h2(bx % 4, row, 31), id2 = h2(bx % 4, row, 32);
      const mortar = (ly === 0 || lx === 0);
      const n = pnoise2(x / 2, y / 2, 32, 32, 33) - .5;
      let m = .8 + .32 * id + n * .2, h = .66 + .2 * id2 + n * .15;
      if (id2 > .86) { m -= .12; h -= .22; }
      if (ly === 1 || lx === 1) { m += .09; }
      if (ly === 7 || lx === 15) { m -= .1; }
      let r = m * (1 + (id - .5) * .06), g = m, b = m * (1 - (id - .5) * .08);
      if (mortar) { r = g = b = .46 + n * .1; h = .12; }
      put(L_MASON, x, y, r, g, b, h);
    }
    {
      const pl = Math.floor(x / 8), lx = x % 8, id = h2(pl, 0, 41);
      const grain = pnoise2(x * 1.25, y / 7, 80, 9, 42 + pl), g2 = pnoise2(x * 2.5, y / 3, 160, 21, 44);
      let m = .8 + .28 * id + (grain - .5) * .34 + (g2 - .5) * .12, h = .55 + grain * .25;
      const joint = Math.floor(8 + id * 48);
      if (lx === 0 || y === joint) { m = .42; h = .1; }
      else if (lx === 1) m += .06; else if (lx === 7) m -= .08;
      if ((y === (joint + 3) % N || y === (joint + N - 3) % N) && (lx === 2 || lx === 6)) { m = .38; h = .8; }
      const knot = dist2(lx, y, 4, (joint + 29) % N); if (knot < 5 && id > .5) { m -= .2 * (1 - knot / 5); }
      put(L_WOOD, x, y, m * 1.03, m, m * .95, h);
    }
    {
      let d1 = 1e9, d2 = 1e9, s1 = null;
      for (const s of sites) {
        let dx = Math.abs(x + .5 - s[0]), dy = Math.abs(y + .5 - s[1]); if (dx > N / 2) dx = N - dx; if (dy > N / 2) dy = N - dy;
        const d = Math.sqrt(dx * dx * .85 + dy * dy * 1.15);
        if (d < d1) { d2 = d1; d1 = d; s1 = s; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1, n = pnoise2(x / 2, y / 2, 32, 32, 51) - .5;
      let m, h, r, g, b;
      if (edge < 1.15) { m = .36 + n * .1; h = .04; r = m * 1.04; g = m; b = m * .95; }
      else {
        const dome = smooth(1.15, 4.2, edge);
        m = .7 + .42 * s1[2] + n * .16 + dome * .1; h = .25 + .7 * dome + n * .1;
        const warm = (s1[3] - .5) * .12; r = m * (1 + warm); g = m; b = m * (1 - warm);
        if (s1[2] > .9) { r *= .8; g *= .8; b *= .82; h *= .7; }
      }
      put(L_COBBLE, x, y, r, g, b, h);
    }
    {
      const st = pnoise2(x / 3, y * 1.5, 21, 96, 61) - .5, rust = pfbm(x / 16, y / 16, 4, 63, 3), pit = h2(x, y, 65);
      let m = .92 + st * .22, r = m, g = m, b = m * 1.03, h = .5 + st * .12;
      if (rust > .58) { const k = smooth(.58, .72, rust); r = lerp(r, m * 1.05, k); g = lerp(g, m * .74, k); b = lerp(b, m * .55, k); h -= .08 * k; }
      if (pit < .03) { r *= .7; g *= .7; b *= .7; h -= .2; }
      if ((x % 16 === 2 || x % 16 === 13) && (y % 16 === 2 || y % 16 === 13)) { r *= 1.25; g *= 1.25; b *= 1.25; h = 1; }
      put(L_METAL, x, y, r, g, b, h);
    }
    {
      const row = Math.floor(y / 8), ox = (row & 1) ? 4 : 0, bx = Math.floor((x + ox) / 8), lx = (x + ox) % 8, ly = y % 8;
      const id = h2(bx % 8, row, 71), n = pnoise2(x / 2, y / 2, 32, 32, 73) - .5;
      let m = .78 + .34 * id + n * .14, h = .3 + .55 * (ly / 7);
      if (ly === 7) { m += .1; } if (ly === 0) { m -= .3; h = .1; } if (lx === 0) { m -= .2; h -= .2; }
      put(L_SLATE, x, y, m * .98, m, m * 1.05, h);
    }
    {
      const w = ((x + y) & 1) ? 1.05 : .95, n = pfbm(x / 16, y / 16, 4, 81, 3), st = pfbm(x / 8 + 3, y / 8, 8, 83, 2);
      let m = w * (.84 + .3 * n); if (st > .66) m *= .78;
      put(L_CLOTH, x, y, m, m, m, .5 + (w - 1) * .8);
    }
    { const n = pnoise2(x / 2, y / 2, 32, 32, 91) - .5; put(L_PLAIN, x, y, 1 + n * .07, 1 + n * .07, 1 + n * .07, .5 + n * .1); }
    {
      const st = pnoise2(x / 2, y / 6, 32, 11, 95) - .5, pit = h2(x, y, 97);
      let m = .96 + st * .2; if (pit < .04) m -= .22;
      put(L_BONE, x, y, m * 1.02, m, m * .94, .5 + st * .25);
    }
    {
      const st = pnoise2(x * 1.6, y / 5, 103, 13, 101), row = (y % 16);
      let m = .76 + .42 * st; if (row === 0) m -= .3; if (row === 1) m += .08;
      put(L_THATCH, x, y, m * 1.04, m, m * .88, .3 + st * .5 + (row / 16) * .2);
    }
  }
  const mk = (linear) => {
    const t = new THREE.DataArrayTexture(data, N, N, TEX_LAYERS);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t;
  };
  return { albedo: mk(false), height: mk(true) };
}

THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace('max( pow( lightDistance, decayExponent ), 0.01 )', '( pow( lightDistance, decayExponent ) + 1.6 )');
THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.split('RE_Direct( directLight,').join('if ( directLight.visible ) RE_Direct( directLight,');
const SH = {
  uTime: { value: 0 }, uTexA: { value: null }, uTexH: { value: null }, uBump: { value: 0.055 },
  uSky: { value: new THREE.Color(0.012, 0.022, 0.045) }, uWind: { value: 1 },
  uCover: { value: new THREE.Vector4(0, 0.55, 0.3, 0.5) }, uCoverCol: { value: new THREE.Vector3(1, 1, 1) }, uCoverP: { value: new THREE.Vector4(0.7, 0.6, 0.0, 0.0) },
  uWat: { value: new THREE.Vector4(0, 1, 1, 0) }, uWatA: { value: new THREE.Vector3(0.012, 0.02, 0.03) }, uWatB: { value: new THREE.Vector3(0.3, 0.4, 0.5) },
};

function litMaterial(kind, params = {}) {
  const mat = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: kind !== 'water', roughness: 1, metalness: 0 }, params));
  const inst = kind === 'inst', water = kind === 'water', world = !inst && !water;
  mat.customProgramCacheKey = () => 'cw-' + kind;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = SH.uTime; sh.uniforms.uTexA = SH.uTexA; sh.uniforms.uTexH = SH.uTexH; sh.uniforms.uBump = SH.uBump; sh.uniforms.uSky = SH.uSky; sh.uniforms.uWind = SH.uWind;
    sh.uniforms.uCover = SH.uCover; sh.uniforms.uCoverCol = SH.uCoverCol; sh.uniforms.uCoverP = SH.uCoverP; sh.uniforms.uWat = SH.uWat; sh.uniforms.uWatA = SH.uWatA; sh.uniforms.uWatB = SH.uWatB;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aSurf; varying vec4 vSurf; varying vec2 vTuv; uniform float uTime; uniform float uWind;
${world ? 'varying vec3 vWpos;' : ''}
${inst ? 'attribute float aFlash; varying float vFlash;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
${world ? 'vWpos = (modelMatrix * vec4(transformed, 1.0)).xyz;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSurf = aSurf; vTuv = uv;
${inst ? 'vFlash = aFlash;' : ''}
${world ? `if (aSurf.z > 0.0) {
  float ph = uTime * 1.6 + position.x * 0.9 + position.z * 0.7;
  float g = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.4;
  transformed.x += g * 0.07 * aSurf.z * uWind; transformed.z += cos(ph * 0.8) * 0.05 * aSurf.z * uWind; transformed.y += sin(ph * 1.9) * 0.02 * aSurf.z * uWind;
}` : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uTexA; uniform sampler2DArray uTexH; uniform float uBump; uniform float uTime; uniform vec3 uSky;
uniform vec4 uCover; uniform vec3 uCoverCol; uniform vec4 uCoverP; uniform vec4 uWat; uniform vec3 uWatA; uniform vec3 uWatB;
varying vec4 vSurf; varying vec2 vTuv;
${world ? 'varying vec3 vWpos;' : ''}
${inst ? 'varying float vFlash;' : ''}
vec3 cwBump(vec3 P, vec3 N, float dBx, float dBy, float sc) {
  vec3 dPdx = dFdx(P), dPdy = dFdy(P);
  vec3 R1 = cross(dPdy, N), R2 = cross(N, dPdx);
  float det = dot(dPdx, R1);
  vec3 grad = sign(det) * (dBx * R1 + dBy * R2);
  return normalize(abs(det) * N - sc * grad);
}
float cwH(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float cwN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cwH(i), cwH(i + vec2(1.0, 0.0)), f.x), mix(cwH(i + vec2(0.0, 1.0)), cwH(i + vec2(1.0, 1.0)), f.x), f.y); }
float cwRipple(vec2 p, float t, float flow) {
  float a = cwN(vec2(p.x * 2.6, p.y * 1.3 - t * flow * 1.0));
  float b = cwN(vec2(p.x * 5.2 + 3.7, p.y * 2.6 - t * (0.15 + flow * 1.4)));
  float c = cwN(vec2(p.x * 13.0 - t * 0.12, p.y * 9.0 - t * (0.2 + flow * 2.1)));
  return a * 1.0 + b * 0.9 + c * 0.15;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float cwL = floor(vSurf.x + 0.5);
${water ? `vec4 cwT = vec4(0.5);
float wMask = 0.0, wHeat = 0.0, wFlow = uTime * uWat.y;
float wn1 = cwN(vTuv * vec2(1.6, 0.8) + 3.0), wn2 = cwN(vTuv * vec2(5.0, 2.6) + 11.0);
diffuseColor.rgb = uWatA;
if (uWat.x > 0.5 && uWat.x < 1.5) {
  float frost = smoothstep(0.4, 0.74, wn1 * 0.65 + wn2 * 0.35);
  float ck = smoothstep(0.035, 0.0, abs(cwN(vTuv * vec2(2.3, 1.2) + 40.0) - 0.5)) + smoothstep(0.03, 0.0, abs(cwN(vTuv * vec2(1.2, 2.7) + 71.0) - 0.48));
  wMask = clamp(frost * 0.85 + ck * 0.7, 0.0, 1.0);
  diffuseColor.rgb = mix(uWatA * (0.7 + 0.6 * wn2), uWatB, wMask);
} else if (uWat.x > 1.5 && uWat.x < 2.5) {
  float t = wFlow * (0.16 + 0.34 * min(vSurf.z, 1.0));
  float c1 = cwN(vec2(vTuv.x * 2.1, vTuv.y * 1.1 - t)), c2 = cwN(vec2(vTuv.x * 4.6 + 7.0, vTuv.y * 2.4 - t * 1.7)), c3 = cwN(vec2(vTuv.x * 9.0 - 3.0, vTuv.y * 5.0 - t * 2.3));
  float ra = 1.0 - abs(2.0 * c1 - 1.0), rb = 1.0 - abs(2.0 * c2 - 1.0);
  float crack = max(pow(ra, 3.2), pow(rb, 4.4) * 0.8), pool = smoothstep(0.56, 0.74, c1 * 0.55 + c3 * 0.45);
  wHeat = clamp(crack * 0.85 + pool, 0.0, 1.0); wMask = 1.0 - smoothstep(0.38, 0.7, wHeat);
  diffuseColor.rgb = mix(uWatA, uWatB * (0.6 + 0.8 * c3), wMask);
} else if (uWat.x > 2.5) {
  wMask = smoothstep(0.56, 0.68, wn1 * 0.55 + wn2 * 0.45 + 0.12 * (1.0 - min(vSurf.z, 1.0))) * step(0.01, vSurf.z);
  diffuseColor.rgb = mix(uWatA, uWatB * (0.75 + 0.5 * wn2), wMask);
}` : 'vec4 cwT = texture(uTexA, vec3(vTuv, cwL)); diffuseColor.rgb *= cwT.rgb * 2.0;'}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(vSurf.y * (1.15 - 0.3 * cwT.a), 0.045, 1.0);
${water ? `if (uWat.x > 0.5 && uWat.x < 1.5) roughnessFactor = mix(0.09, 0.62, wMask);
else if (uWat.x > 1.5 && uWat.x < 2.5) roughnessFactor = mix(0.55, 0.96, wMask);
else if (uWat.x > 2.5) roughnessFactor = mix(roughnessFactor, 0.9, wMask);` : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${water ? `{
  float h0 = cwRipple(vTuv, wFlow, vSurf.z) + wMask * uWat.w;
  normal = cwBump(-vViewPosition, normal, dFdx(h0), dFdy(h0), (0.03 + 0.11 * min(vSurf.z, 1.0)) * uWat.z);
}` : `float cwH0 = texture(uTexH, vec3(vTuv, cwL)).a;
{
  vec2 cdx = dFdx(vTuv), cdy = dFdy(vTuv);
  float hx = texture(uTexH, vec3(vTuv + cdx, cwL)).a - cwH0;
  float hy = texture(uTexH, vec3(vTuv + cdy, cwL)).a - cwH0;
  normal = cwBump(-vViewPosition, normal, hx, hy, uBump);
}
${world ? `if (uCover.x > 0.001) {
  vec3 wn = inverseTransformDirection(normal, viewMatrix);
  float n1 = cwN(vWpos.xz * 0.8 + 17.0), n2 = cwN(vWpos.xz * 3.4 + vWpos.y * 1.3), nn = n1 * 0.62 + n2 * 0.38;
  float cv = smoothstep(uCover.y, uCover.y + 0.2, wn.y + (nn - 0.5) * uCover.z);
  if (cwL > 3.5 && cwL < 4.5) cv *= uCover.w * smoothstep(0.8, 0.25, cwH0 - (n1 - 0.5) * 0.9);
  cv *= uCover.x * (1.0 - clamp(vSurf.w * 40.0, 0.0, 1.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, uCoverCol * (0.9 + 0.2 * n1), cv);
  roughnessFactor = mix(roughnessFactor, uCoverP.x, cv);
  normal = normalize(mix(normal, nonPerturbedNormal, cv * uCoverP.y));
  float ch = nn * uCoverP.z + sin(dot(vWpos.xz, vec2(5.1, 3.3)) + n1 * 7.0) * uCoverP.w;
  normal = cwBump(-vViewPosition, normal, dFdx(ch), dFdy(ch), cv);
}` : ''}`}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vSurf.w * 6.0;
${water ? 'if (uWat.x > 1.5 && uWat.x < 2.5) totalEmissiveRadiance += mix(vec3(0.7, 0.07, 0.008), vec3(1.45, 0.42, 0.05), wHeat * wHeat) * (1.0 - wMask) + vec3(0.1, 0.012, 0.0) * wMask * (0.3 + wn2);' : ''}
${inst ? 'totalEmissiveRadiance += vec3(1.0, 0.8, 0.55) * vFlash * 0.55;' : ''}`)
      .replace('#include <opaque_fragment>', `${water ? 'outgoingLight += uSky * (0.4 + 4.0 * pow(1.0 - clamp(normal.z, 0.0, 1.0), 2.0)) * (1.5 - 0.6 * min(vSurf.z, 1.0)) * (1.0 - wMask * 0.8);' : ''}
#include <opaque_fragment>`);
  };
  return mat;
}

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


// 20-post.js

const R = {
  renderer: null, scene: null, cam: null, canvas: null,
  dw: 2, dh: 2, iw: 2, ih: 2, maxIH: 620, quality: 1,
  viewH: 27, fitW: 45, shiftY: 0, px: 0.04,
  sub: new THREE.Vector2(), ditherOfs: new THREE.Vector2(),
  focusZ: 60, fade: 0, exposure: 1.0,
  rt: {}, mats: {}, fsScene: null, fsCam: null, fsMesh: null,
  NL: 12, lightPos: [], lightCol: [],
};

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const GLSL_BAYER = `
float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

function fsMat(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
}

function initRenderer(canvas) {
  R.canvas = canvas;
  const r = R.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
  r.setPixelRatio(1);
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
  r.toneMapping = THREE.NoToneMapping;
  r.setClearColor(new THREE.Color(0.0035, 0.005, 0.011), 1);
  r.info.autoReset = false;
  R.scene = new THREE.Scene();
  R.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 220);
  R.scene.add(R.cam);
  for (let i = 0; i < R.NL; i++) { R.lightPos.push(new THREE.Vector3()); R.lightCol.push(new THREE.Vector3()); }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  R.fsScene = new THREE.Scene(); R.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  R.fsMesh = new THREE.Mesh(g, null); R.fsMesh.frustumCulled = false; R.fsScene.add(R.fsMesh);

  const M = R.mats;
  M.atmo = fsMat(`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform mat4 uInvVP; uniform vec3 uCamDir; uniform vec2 uPx; uniform float uTime;
uniform vec3 uLightPos[${R.NL}]; uniform vec3 uLightCol[${R.NL}];
uniform vec3 uMistAmb; uniform vec4 uMist;
uniform vec3 uAO;
uniform vec2 uDither; uniform vec2 uWind;
${GLSL_BAYER}
vec3 wpos(vec2 uv, float d){ vec4 p = uInvVP * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec3 col = texture2D(tColor, vUv).rgb;
  float d = texture2D(tDepth, vUv).x;
  if (d < 0.9999) {
    vec3 P = wpos(vUv, d);
    float dr = texture2D(tDepth, vUv + vec2(uPx.x, 0.0)).x, dl = texture2D(tDepth, vUv - vec2(uPx.x, 0.0)).x;
    float du = texture2D(tDepth, vUv + vec2(0.0, uPx.y)).x, dd = texture2D(tDepth, vUv - vec2(0.0, uPx.y)).x;
    vec3 ddx = abs(dr - d) < abs(d - dl) ? wpos(vUv + vec2(uPx.x, 0.0), dr) - P : P - wpos(vUv - vec2(uPx.x, 0.0), dl);
    vec3 ddy = abs(du - d) < abs(d - dd) ? wpos(vUv + vec2(0.0, uPx.y), du) - P : P - wpos(vUv - vec2(0.0, uPx.y), dd);
    vec3 N = normalize(cross(ddx, ddy)); if (dot(N, uCamDir) > 0.0) N = -N;
    float occ = 0.0, ang = bayer4(gl_FragCoord.xy + uDither) * 6.2831853;
    for (int i = 0; i < 10; i++) {
      float fi = (float(i) + 0.5) / 10.0, a = ang + float(i) * 2.39996;
      vec2 suv = vUv + vec2(cos(a), sin(a)) * uAO.y * sqrt(fi) * uPx;
      vec3 V = wpos(suv, texture2D(tDepth, suv).x) - P;
      float vv = dot(V, V);
      occ += max(0.0, dot(V, N) - 0.035) / (vv + 0.03) * step(vv, uAO.z);
    }
    float ao = clamp(1.0 - occ * uAO.x * 0.1, 0.0, 1.0);
    col *= ao;
    float n = vn(P.xz * 0.16 + uWind) * 0.65 + vn(P.xz * 0.47 - uWind * 1.7) * 0.35;
    float tau = min(uMist.z * exp(-(max(P.y, -1.0) - uMist.x) / uMist.y), 1.25) * smoothstep(0.34, 0.86, n) * smoothstep(-2.4, -1.1, P.y);
    float f = 1.0 - exp(-tau);
    vec3 L = uMistAmb; vec3 Pm = P + vec3(0.0, 0.35, 0.0);
    for (int i = 0; i < ${R.NL}; i++) { vec3 dv = uLightPos[i] - Pm; L += uLightCol[i] / (dot(dv, dv) + 2.0); }
    col = mix(col, L * uMist.w, f);
  }
  gl_FragColor = vec4(col, 1.0);
}`, {
    tColor: { value: null }, tDepth: { value: null }, uInvVP: { value: new THREE.Matrix4() }, uCamDir: { value: new THREE.Vector3() }, uPx: { value: new THREE.Vector2() }, uTime: SH.uTime,
    uLightPos: { value: R.lightPos }, uLightCol: { value: R.lightCol }, uMistAmb: { value: new THREE.Vector3(0.05, 0.08, 0.14) }, uMist: { value: new THREE.Vector4(-0.3, 0.42, 0.75, 0.1) },
    uAO: { value: new THREE.Vector3(1.0, 18, 0.7) }, uDither: { value: R.ditherOfs }, uWind: { value: new THREE.Vector2() },
  });

  M.dof = fsMat(`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uPx;
uniform vec4 uDof; uniform vec3 uNear;
uniform vec2 uDither;
${GLSL_BAYER}
float cocAt(float d){
  float z = d - uDof.x;
  const float farBlurScale = 0.65;
  if (z > 0.0) return clamp((z - uDof.y) / uDof.z, 0.0, 1.0) * uDof.w * farBlurScale;
  return clamp((-z - uNear.x) / uNear.y, 0.0, 1.0) * uDof.w * uNear.z;
}
void main(){
  float dc = texture2D(tDepth, vUv).x, cc = cocAt(dc);
  vec3 col = texture2D(tColor, vUv).rgb; float tot = 1.0;
  float rad = 0.75, ang = bayer4(gl_FragCoord.xy + uDither) * 6.2831853;
  for (int i = 0; i < 40; i++) {
    ang += 2.39996323;
    vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uPx * rad;
    float sd = texture2D(tDepth, tc).x, sc = cocAt(sd);
    if (sd > dc) sc = clamp(sc, 0.0, cc * 2.0);
    float m = smoothstep(rad - 0.5, rad + 0.5, sc);
    col += mix(col / tot, texture2D(tColor, tc).rgb, m); tot += 1.0;
    rad += 1.35 / rad; if (rad > uDof.w) break;
  }
  gl_FragColor = vec4(col / tot, 1.0);
}`, { tColor: { value: null }, tDepth: { value: null }, uPx: { value: new THREE.Vector2() }, uDof: { value: new THREE.Vector4(0.3, 0.02, 0.06, 9) }, uNear: { value: new THREE.Vector3(0.05, 0.04, 0.5) }, uDither: { value: R.ditherOfs } });

  M.bright = fsMat(`
precision highp float; varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uPx; uniform vec2 uThr;
void main(){
  vec3 c = texture2D(tColor, vUv + uPx * vec2(-0.5, -0.5)).rgb + texture2D(tColor, vUv + uPx * vec2(0.5, -0.5)).rgb + texture2D(tColor, vUv + uPx * vec2(-0.5, 0.5)).rgb + texture2D(tColor, vUv + uPx * vec2(0.5, 0.5)).rgb;
  c *= 0.25; float l = max(c.r, max(c.g, c.b));
  c *= smoothstep(uThr.x, uThr.x + uThr.y, l);
  gl_FragColor = vec4(min(c, vec3(24.0)), 1.0);
}`, { tColor: { value: null }, uPx: { value: new THREE.Vector2() }, uThr: { value: new THREE.Vector2(1.1, 1.6) } });
  M.blur = fsMat(`
precision highp float; varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uDir;
void main(){
  vec3 c = texture2D(tColor, vUv).rgb * 0.227027;
  c += (texture2D(tColor, vUv + uDir * 1.3846).rgb + texture2D(tColor, vUv - uDir * 1.3846).rgb) * 0.316216;
  c += (texture2D(tColor, vUv + uDir * 3.2308).rgb + texture2D(tColor, vUv - uDir * 3.2308).rgb) * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`, { tColor: { value: null }, uDir: { value: new THREE.Vector2() } });

  M.comp = fsMat(`
precision highp float; varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
uniform vec4 uGrade;
uniform vec3 uBloom;
uniform vec3 uLift; uniform vec2 uDither; uniform vec2 uRes;
${GLSL_BAYER}
vec3 filmic(vec3 x){ x = max(x, 0.0); return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec3 c = texture2D(tColor, vUv).rgb;
  c += texture2D(tBloomA, vUv).rgb * uBloom.x + texture2D(tBloomB, vUv).rgb * uBloom.y;
  c *= uGrade.x;
  vec2 q = (vUv - 0.5) * vec2(1.0, 0.92);
  float vig = smoothstep(0.9, 0.3, length(q) * 1.25);
  c *= mix(1.0 - uGrade.z, 1.0, vig);
  c = filmic(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGrade.y);
  c += uLift * (1.0 - smoothstep(0.0, 0.3, l)) * mix(0.55, 1.0, vig);
  c = pow(c, vec3(1.0 / 2.2)) * uGrade.w;
  float b = bayer8(gl_FragCoord.xy + uDither);
  c = floor(c * uBloom.z + b) / uBloom.z;
  gl_FragColor = vec4(c, 1.0);
}`, {
    tColor: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
    uGrade: { value: new THREE.Vector4(1.0, 0.92, 0.55, 1.0) }, uBloom: { value: new THREE.Vector3(0.35, 0.5, 28) },
    uLift: { value: new THREE.Vector3(0.010, 0.016, 0.030) }, uDither: { value: R.ditherOfs }, uRes: { value: new THREE.Vector2() },
  });

  M.up = fsMat(`
precision highp float; varying vec2 vUv;
uniform sampler2D tColor; uniform vec2 uTex; uniform vec2 uOut; uniform vec2 uSub; uniform float uGrain; uniform float uSeed;
${GLSL_BAYER}
void main(){
  vec2 texel = vUv * uTex + uSub, scale = max(uOut / uTex, vec2(1.0));
  vec2 tf = floor(texel), f = texel - tf, region = 0.5 - 0.5 / scale, cen = f - 0.5;
  vec2 off = (cen - clamp(cen, -region, region)) * scale + 0.5;
  vec3 c = texture2D(tColor, (tf + off) / uTex).rgb;
  float g = hash12(gl_FragCoord.xy + uSeed) - 0.5;
  c += g * uGrain * (0.35 + 0.65 * (1.0 - dot(c, vec3(0.333))));
  gl_FragColor = vec4(c, 1.0);
}`, { tColor: { value: null }, uTex: { value: new THREE.Vector2() }, uOut: { value: new THREE.Vector2() }, uSub: { value: R.sub }, uGrain: { value: 0.035 }, uSeed: { value: 0 } });
}

function resizeRenderer() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const dw = Math.max(8, Math.floor(R.canvas.clientWidth * dpr)), dh = Math.max(8, Math.floor(R.canvas.clientHeight * dpr));
  if (R.rt.scene && R.dw === dw && R.dh === dh && R.renderQuality === R.quality) return;
  R.renderQuality = R.quality; R.dw = dw; R.dh = dh; R.dpr = dpr;
  R.renderer.setSize(dw, dh, false);
  let ih = Math.round(Math.min(R.maxIH, dh / 2) * R.quality);
  ih = Math.max(ih, Math.min(dh, 240));
  let iw = Math.max(8, Math.round(dw * ih / dh));
  if (iw > 1500) { ih = Math.round(ih * 1500 / iw); iw = 1500; }
  R.iw = iw; R.ih = ih;
  for (const k in R.rt) { R.rt[k].dispose(); if (R.rt[k].depthTexture) R.rt[k].depthTexture.dispose(); }
  const mk = (w, h, type, filter, depth) => {
    const t = new THREE.WebGLRenderTarget(w, h, { type, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: !!depth, stencilBuffer: false, generateMipmaps: false });
    if (depth) { t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.type = THREE.UnsignedIntType; }
    return t;
  };
  const HF = THREE.HalfFloatType, NE = THREE.NearestFilter, LI = THREE.LinearFilter;
  R.rt.scene = mk(iw, ih, HF, NE, true);
  R.rt.atmo = mk(iw, ih, HF, NE, false);
  R.rt.dof = mk(iw, ih, HF, LI, false);
  const bw = Math.max(4, iw >> 1), bh = Math.max(4, ih >> 1), cw = Math.max(2, iw >> 2), ch = Math.max(2, ih >> 2);
  R.rt.bA = mk(bw, bh, HF, LI, false); R.rt.bA2 = mk(bw, bh, HF, LI, false);
  R.rt.bB = mk(cw, ch, HF, LI, false); R.rt.bB2 = mk(cw, ch, HF, LI, false);
  R.rt.final = mk(iw, ih, THREE.UnsignedByteType, LI, false);

}

function fsPass(mat, target) {
  R.fsMesh.material = mat; R.renderer.setRenderTarget(target); R.renderer.render(R.fsScene, R.fsCam);
}

const _ivp = new THREE.Matrix4();
function renderFrame() {
  const r = R.renderer, M = R.mats, T = R.rt, cam = R.cam;
  r.info.reset();
  r.setRenderTarget(T.scene); r.render(R.scene, cam);
  const px = M.atmo.uniforms.uPx.value.set(1 / R.iw, 1 / R.ih);
  let u = M.atmo.uniforms;
  u.tColor.value = T.scene.texture; u.tDepth.value = T.scene.depthTexture;
  _ivp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert(); u.uInvVP.value.copy(_ivp);
  cam.getWorldDirection(u.uCamDir.value);
  u.uAO.value.y = 0.85 / R.px;
  u.uWind.value.set(SH.uTime.value * 0.05, SH.uTime.value * 0.021);
  fsPass(M.atmo, T.atmo);
  u = M.dof.uniforms; u.tColor.value = T.atmo.texture; u.tDepth.value = T.scene.depthTexture; u.uPx.value.copy(px);
  const zr = cam.far - cam.near;
  const dsc = R.dofScale || 1;
  u.uDof.value.set((R.focusZ - cam.near) / zr, 3.2 * dsc / zr, 11.5 * dsc / zr, HASH.nodof ? 0.6 : Math.max(2, R.ih * 0.0145));
  const nd = R.dofD || 20;
  u.uNear.value.set(Math.max(4 * dsc, 0.55 * nd) / zr, Math.max(6, nd) / zr, 0.6);
  fsPass(M.dof, T.dof);
  u = M.bright.uniforms; u.tColor.value = T.dof.texture; u.uPx.value.copy(px); fsPass(M.bright, T.bA);
  u = M.blur.uniforms;
  u.tColor.value = T.bA.texture; u.uDir.value.set(1 / T.bA.width, 0); fsPass(M.blur, T.bA2);
  u.tColor.value = T.bA2.texture; u.uDir.value.set(0, 1 / T.bA.height); fsPass(M.blur, T.bA);
  u.tColor.value = T.bA.texture; u.uDir.value.set(1 / T.bB.width, 0); fsPass(M.blur, T.bB2);
  u.tColor.value = T.bB2.texture; u.uDir.value.set(0, 1 / T.bB.height); fsPass(M.blur, T.bB);
  u.tColor.value = T.bB.texture; u.uDir.value.set(1.6 / T.bB.width, 0); fsPass(M.blur, T.bB2);
  u.tColor.value = T.bB2.texture; u.uDir.value.set(0, 1.6 / T.bB.height); fsPass(M.blur, T.bB);
  u = M.comp.uniforms; u.tColor.value = T.dof.texture; u.tBloomA.value = T.bA.texture; u.tBloomB.value = T.bB.texture;
  u.uGrade.value.x = R.exposure; u.uGrade.value.w = R.fade; u.uRes.value.set(R.iw, R.ih);
  fsPass(M.comp, T.final);
  u = M.up.uniforms; u.tColor.value = T.final.texture; u.uTex.value.set(R.iw, R.ih); u.uOut.value.set(R.dw, R.dh); u.uSeed.value = (SH.uTime.value * 60 % 1000) * 7.13;
  fsPass(M.up, null);
}


// 29-biome.js

const COL0 = Object.assign({}, COL);
const BIOMES = [
  {
    key: 'ashen', name: 'Ashen Pass', col: {},
    strata: [0x8f8474, 0x3c3f4c, 0x66564a, 0x767a86, 0x70503f, 0x4c4f5c, 0x9a8e7c, 0x55483e],
    hemi: [0x6d83bd, 0x1c1f2a, 1.15], moon: [0xa9c0f6, 1.55], fill: [0x4a5f96, .3], moonPos: [14, 44, -34],
    clear: [.0035, .005, .011], mistAmb: [.05, .08, .14], mist: [-.3, .42, .75, .1], sky: [.012, .022, .045], lift: [.010, .016, .030], sat: .92, expo: 1, sprAmb: [.05, .065, .1],
    cover: [0, .55, .3, .5], coverCol: [1, 1, 1], coverP: [.7, .6, 0, 0],
    wat: [0, 1, 1, 0], watA: [.012, .02, .03], watB: [.3, .4, .5], fall: [0, 1, 1, 0], fallA: [.022, .034, .054], fallB: [.2, .27, .38], spray: 'water',
    relief: [1.7, .5, 1, 0], puddles: 11, ponds: 1, sway: 1, wind: 1,
    wx: { n: [.05, 0], velA: [.35, -.12, .18], swayA: [.5, .5], sizeA: [.03, .055], colA: [.75, .8, .95, 1], alA: [.5, 0, 0], yA: [-1, 9], velB: [0, 0, 0], swayB: [0, 0], sizeB: [.05, .05], colB: [1, 1, 1, 1], alB: [0, 0, 0], yB: [0, 1], amb: [.1, .14, .22] },
    mobs: { ghoul: 1.6, wraith: 1.6, necro: 1.5 }, early: { wraith: 3, necro: 5 }, boss: ['giant', 'ogre'], tints: { wisp: [.75, .6, 1.3] }, wispHex: 0xb090ff,
    trees: [['tree', 13, 2.6, 4.6]], stumps: 6, rocks: 70, tufts: 320, webs: 4,
  },
  {
    key: 'frost', name: 'Frostfall',
    col: { stone: 0x6f7b90, stoneD: 0x454e60, stoneL: 0x9aa7b8, earth: 0x4b4a50, earthD: 0x2f3038, grass: 0x5a6068, grassD: 0x40454e, moss: 0x55606a, road: 0x7a808c, roadD: 0x555a66, mud: 0x3a3e48, bark: 0x2e2a2a, tuftA: 0x6f7a80, tuftB: 0xa9b4bc, leaf: 0x1d382f, leafL: 0x2c4f42 },
    strata: [0x7d8aa0, 0x3a4254, 0x5d6678, 0x9fb4c8, 0x4b5468, 0x6a7890, 0xb8cadb, 0x475062],
    hemi: [0x86a8e0, 0x323c50, 1.1], moon: [0xc6dcff, 1.38], fill: [0x5f7fb4, .28], moonPos: [16, 42, -34],
    clear: [.0045, .0075, .015], mistAmb: [.1, .14, .21], mist: [-.3, .5, .7, .12], sky: [.03, .05, .085], lift: [.012, .02, .036], sat: .9, expo: .86, sprAmb: [.1, .125, .17],
    cover: [1, .5, .34, .8], coverCol: [.5, .56, .66], coverP: [.74, .85, .32, 0],
    wat: [1, 0, .3, .35], watA: [.03, .075, .12], watB: [.4, .48, .58], fall: [1, 0, .96, 0], fallA: [.1, .17, .27], fallB: [.46, .58, .72], spray: 'none',
    relief: [1.5, .4, 1.15, 0], puddles: 8, ponds: 2, sway: .8, wind: 1.25, beacon: .8,
    wx: { n: [.68, .16], velA: [.55, -1.5, .3], swayA: [.28, 1.1], sizeA: [.055, .1], colA: [1, 1.05, 1.15, 1], alA: [.95, 0, .12], yA: [-3, 15], velB: [2.6, -1.1, 1.3], swayB: [.5, 1.6], sizeB: [.035, .06], colB: [.95, 1, 1.1, 1], alB: [.6, 0, .5], yB: [-2, 9], amb: [.4, .48, .62] },
    mobs: { wolf: 2.4, golem: 1.8, wraith: 1.3, toad: 0, wisp: .5, slime: .6 }, early: { wolf: 2, golem: 6 }, boss: ['jotun'], tints: { wolf: [1.9, 2.0, 2.2], golem: [.8, 1.05, 1.5], wisp: [.5, .9, 1.5], gargoyle: [.9, 1.1, 1.4], toad: [.8, 1.1, 1.4], brute: [1.3, 1.25, 3.0] }, wispHex: 0x80c0ff,
    trees: [['pine', 17, 2.8, 5.4], ['tree', 4, 2.6, 4.2]], stumps: 4, rocks: 52, tufts: 110, webs: 0,
  },
  {
    key: 'fen', name: 'Mirefen',
    col: { stone: 0x5c6858, stoneD: 0x384234, stoneL: 0x84907a, earth: 0x3b3a28, earthD: 0x24261a, grass: 0x40582c, grassD: 0x2c3e22, moss: 0x4c682e, road: 0x6c6a56, roadD: 0x48483a, mud: 0x2a281c, bark: 0x2c2820, tuftA: 0x486a30, tuftB: 0x7a8a40, leaf: 0x2a4626, leafL: 0x4c6c34 },
    strata: [0x5a5a40, 0x2c3226, 0x4a4030, 0x66705a, 0x3a3020, 0x44503a, 0x777a5c, 0x33382a],
    hemi: [0x4f9482, 0x1a2218, 1.05], moon: [0xa6e6c4, 1.3], fill: [0x2f6f66, .3], moonPos: [10, 46, -32],
    clear: [.003, .007, .006], mistAmb: [.035, .1, .075], mist: [-.1, .62, 1.1, .12], sky: [.018, .05, .036], lift: [.008, .02, .016], sat: .94, expo: 1.02, sprAmb: [.04, .08, .065],
    cover: [.85, .8, 1.1, .55], coverCol: [.075, .125, .05], coverP: [.92, .3, .4, 0],
    wat: [3, .3, .55, 0], watA: [.012, .026, .012], watB: [.1, .2, .045], fall: [0, .8, .9, 0], fallA: [.016, .034, .018], fallB: [.17, .27, .18], spray: 'water',
    relief: [1.0, .3, .7, 0], puddles: 15, ponds: 4, sway: .6, wind: .7,
    wx: { n: [.045, .09], velA: [.12, .02, .08], swayA: [1.3, .45], sizeA: [.05, .085], colA: [1.3, 1.9, .4, 0], alA: [1, 1.3, 0], yA: [.3, 3.4], velB: [.2, -.07, .12], swayB: [.6, .4], sizeB: [.03, .05], colB: [.7, .95, .7, 1], alB: [.5, 0, 0], yB: [-1, 7], amb: [.09, .2, .15] },
    mobs: { toad: 3.5, wisp: 1.8, spider: 2, brood: 2, slime: 1.6, mummy: 0, bomber: .5 }, early: { toad: 2, wisp: 3, brood: 6 }, boss: ['queen'], tints: { golem: [.75, 1.0, .6], wisp: [.5, 1.4, .7], wolf: [.7, .75, .6], gargoyle: [.8, 1, .8] }, wispHex: 0x70ffa0,
    trees: [['willow', 9, 3.0, 4.6], ['tree', 5, 2.6, 4.4]], stumps: 8, rocks: 42, tufts: 420, webs: 3,
  },
  {
    key: 'ember', name: 'Emberscar',
    col: { stone: 0x403c42, stoneD: 0x242228, stoneL: 0x5e5a62, earth: 0x2e2728, earthD: 0x1c1819, grass: 0x3a2f2c, grassD: 0x261e1c, moss: 0x3a3230, road: 0x5e5652, roadD: 0x3c3634, mud: 0x1e1716, bark: 0x15110f, tuftA: 0x3a2c24, tuftB: 0x6a4a30 },
    strata: [0x3a363c, 0x1c1a20, 0x5a2a22, 0x2a262c, 0x6e3a24, 0x242026, 0x4a4650, 0x301a18],
    hemi: [0x5c5470, 0x2c140e, 1.18], moon: [0xc0b0d0, 1.32], fill: [0xd04a20, .2], moonPos: [18, 40, -32],
    clear: [.008, .004, .006], mistAmb: [.09, .05, .05], mist: [-.3, .5, .9, .1], sky: [.02, .006, .002], lift: [.02, .011, .012], sat: .96, expo: 1, sprAmb: [.09, .05, .04],
    cover: [.8, .74, 1.0, .6], coverCol: [.1, .092, .1], coverP: [.97, .4, .4, 0],
    wat: [2, 1, 1.5, .5], watA: [.22, .02, 0], watB: [.03, .026, .03], fall: [2, .45, 1.2, 0], fallA: [2.1, .56, .07], fallB: [.2, .02, .008], spray: 'lava',
    relief: [1.9, .7, 1.1, 0], puddles: 0, ponds: 2, sway: .7, wind: .9, bankGlow: 1, vein: 1,
    wx: { n: [.26, .12], velA: [.3, -.42, .16], swayA: [.5, .7], sizeA: [.035, .07], colA: [.3, .28, .3, 1], alA: [.85, 0, 0], yA: [-3, 14], velB: [.2, .85, .12], swayB: [.7, .9], sizeB: [.03, .05], colB: [2.6, .9, .14, 0], alB: [1, 2.2, .3], yB: [-2, 10], amb: [.5, .3, .26] },
    mobs: { bomber: 2.4, gargoyle: 2, golem: 1.8, toad: 0, slime: .5, wisp: 1.4 }, early: { bomber: 2, gargoyle: 4, golem: 6 }, boss: ['colossus'], tints: { golem: [1.5, .5, .26], wolf: [.75, .45, .4], wisp: [1.5, .6, .2], gargoyle: [1.2, .7, .6], toad: [1.2, .7, .5] }, wispHex: 0xff8030,
    trees: [['charred', 11, 2.6, 4.4]], stumps: 4, rocks: 80, tufts: 40, webs: 0,
  },
  {
    key: 'dunes', name: 'Duskmesa',
    col: { stone: 0xb08e6c, stoneD: 0x7a5c48, stoneL: 0xd4b48c, earth: 0xa88c66, earthD: 0x7c6448, grass: 0xbca27a, grassD: 0x927856, moss: 0x7a7444, road: 0xa89478, roadD: 0x786652, mud: 0x64503a, bark: 0x4c3a28, tuftA: 0x8a8048, tuftB: 0xc0a860, leaf: 0x38582e, leafL: 0x66863e },
    strata: [0xb8845c, 0x8e5a40, 0xd6b080, 0x744a38, 0xc89866, 0x9c6a4c, 0xe4cca0, 0x805640],
    hemi: [0x6a6fc0, 0x3c3040, 1.1], moon: [0xd6c8ff, 1.5], fill: [0x2f8f9a, .34], moonPos: [26, 24, -36],
    clear: [.006, .005, .014], mistAmb: [.07, .07, .13], mist: [-.3, .4, .5, .1], sky: [.03, .03, .06], lift: [.014, .012, .03], sat: .95, expo: .9, sprAmb: [.08, .075, .11],
    cover: [.9, .76, .9, .6], coverCol: [.42, .33, .22], coverP: [.95, .5, .25, .05],
    wat: [0, 1, 1, 0], watA: [.008, .04, .045], watB: [.3, .4, .4], fall: [0, 1, 1, 0], fallA: [.02, .06, .07], fallB: [.24, .36, .38], spray: 'water',
    relief: [1.4, .25, .8, .55], puddles: 0, ponds: 2, sway: 1.3, wind: 1.2, beacon: .62,
    wx: { n: [.1, .22], velA: [.5, -.05, .25], swayA: [.6, .5], sizeA: [.03, .05], colA: [.95, .78, .6, 1], alA: [.5, 0, 0], yA: [-1, 8], velB: [4.2, -.1, 1.9], swayB: [.25, 1.2], sizeB: [.025, .045], colB: [.9, .72, .55, 1], alB: [.42, 0, .9], yB: [-.5, 4.5], amb: [.3, .22, .3] },
    mobs: { mummy: 3, scarab: 2.4, spider: .6, bomber: 1.3, ghoul: 1.3, toad: 0, slime: .4 }, early: { mummy: 4, scarab: 2 }, boss: ['king'], tints: { golem: [1.5, 1.1, .72], wolf: [1.5, 1.2, .8], wisp: [1.4, 1.0, .4], gargoyle: [1.5, 1.2, .9], toad: [1.3, 1.1, .7] }, wispHex: 0xffc060,
    trees: [['palm', 9, 3.0, 4.6], ['tree', 2, 2.4, 3.4]], stumps: 2, rocks: 44, tufts: 150, webs: 0,
  },
];
const BIOME = { start: 0 };
function biomeFor(index) { return BIOMES[((BIOME.start + index) % BIOMES.length + BIOMES.length) % BIOMES.length]; }
function applyBiomePalette(b) { Object.assign(COL, COL0); for (const k in b.col) COL[k] = C(b.col[k]); }

const LOOK = { cur: null, to: null, bio: null };
function lookOf(b) {
  return { hs: C(b.hemi[0]), hg: C(b.hemi[1]), hi: [b.hemi[2]], mc: C(b.moon[0]), mi: [b.moon[1]], fc: C(b.fill[0]), fi: [b.fill[1]], clear: b.clear.slice(), mAmb: b.mistAmb.slice(), mist: b.mist.slice(), sky: b.sky.slice(), lift: b.lift.slice(), grade: [b.sat, b.expo], amb: b.sprAmb.slice(), wamb: b.wx.amb.slice() };
}
const _lc = new THREE.Color();
function applyLook(L) {
  LT.hemi.color.setRGB(L.hs[0], L.hs[1], L.hs[2]); LT.hemi.groundColor.setRGB(L.hg[0], L.hg[1], L.hg[2]); LT.hemi.intensity = L.hi[0];
  LT.moon.color.setRGB(L.mc[0], L.mc[1], L.mc[2]); LT.moon.intensity = L.mi[0]; LT.fill.color.setRGB(L.fc[0], L.fc[1], L.fc[2]); LT.fill.intensity = L.fi[0];
  R.renderer.setClearColor(_lc.setRGB(L.clear[0], L.clear[1], L.clear[2]), 1);
  const a = R.mats.atmo.uniforms, c = R.mats.comp.uniforms;
  a.uMistAmb.value.set(L.mAmb[0], L.mAmb[1], L.mAmb[2]); a.uMist.value.set(L.mist[0], L.mist[1], L.mist[2], L.mist[3]);
  SH.uSky.value.setRGB(L.sky[0], L.sky[1], L.sky[2]); c.uLift.value.set(L.lift[0], L.lift[1], L.lift[2]); c.uGrade.value.y = L.grade[0]; R.exposure = L.grade[1];
  FX.alpha.mesh.material.uniforms.uAmb.value.set(L.amb[0], L.amb[1], L.amb[2]); WX.u.uAmb.value.set(L.wamb[0], L.wamb[1], L.wamb[2]);
}
function setBiomeLook(B, instant) {
  const b = B.bio; LOOK.bio = b; LOOK.to = lookOf(b);
  if (instant || !LOOK.cur) LOOK.cur = lookOf(b);
  SH.uCover.value.fromArray(b.cover); SH.uCoverCol.value.fromArray(b.coverCol); SH.uCoverP.value.fromArray(b.coverP);
  SH.uWat.value.fromArray(b.wat); SH.uWatA.value.fromArray(b.watA); SH.uWatB.value.fromArray(b.watB); SH.uWind.value = b.sway;
  const f = MAT.fall.uniforms; f.uFP.value.fromArray(b.fall); f.uFA.value.fromArray(b.fallA); f.uFB.value.fromArray(b.fallB);
  setWeather(b.wx, instant);
  const m = B.mirrored, p = b.moonPos; LT.moon.position.set(m ? p[2] : p[0], p[1], m ? p[0] : p[2]); LT.moon.target.position.set(0, 0, 0);
  applyLook(LOOK.cur);
}
function updateBiomeLook(dt) {
  if (!LOOK.cur) return;
  const k = 1 - Math.exp(-dt * 1.6), a = LOOK.cur, b = LOOK.to;
  for (const key in a) { const x = a[key], y = b[key]; for (let i = 0; i < x.length; i++) x[i] += (y[i] - x[i]) * k; }
  applyLook(a); WX.fade = Math.min(1, WX.fade + dt * .5); WX.u.uFade.value = WX.fade;
}


// 30-layout.js

const BH = 18, CHUNK = 6, NCH = 6, CELL = 0.5, ROAD_HALF = 1.25, PATH_STEP = 0.3;

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = sat(t);
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}
function segInter(a, b, c, d) {
  const r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1], den = r0 * s1 - r1 * s0;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den, u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? t : -1;
}
function catmull(pts, step) {
  const raw = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  raw.push(pts[pts.length - 1].slice());
  return resample(raw, step);
}
function resample(raw, step) {
  const out = [raw[0].slice()]; let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    let ax = raw[i - 1][0], az = raw[i - 1][1]; const bx = raw[i][0], bz = raw[i][1];
    let seg = Math.hypot(bx - ax, bz - az);
    while (acc + seg >= step) {
      const t = (step - acc) / seg; ax = ax + (bx - ax) * t; az = az + (bz - az) * t; out.push([ax, az]);
      seg = Math.hypot(bx - ax, bz - az); acc = 0;
    }
    acc += seg;
  }
  const l = raw[raw.length - 1], o = out[out.length - 1];
  if (Math.hypot(l[0] - o[0], l[1] - o[1]) > step * 0.4) out.push(l.slice());
  return out;
}
function relax(poly, iters) {
  for (let k = 0; k < iters; k++) for (let i = 1; i < poly.length - 1; i++) {
    poly[i][0] = poly[i][0] * 0.5 + (poly[i - 1][0] + poly[i + 1][0]) * 0.25;
    poly[i][1] = poly[i][1] * 0.5 + (poly[i - 1][1] + poly[i + 1][1]) * 0.25;
  }
  return poly;
}
function polyMinDist(poly, x, z, i0 = 0, i1 = poly.length - 1) {
  let best = 1e9, bi = 0;
  for (let i = i0; i < i1; i++) { const d = segDist(x, z, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]); if (d < best) { best = d; bi = i; } }
  return [best, bi];
}

function tryRoad(rng) {
  const zc = rng.range(-6.5, 9), kx = rng.range(0.5, 10.5);
  const way = [[-17.6, zc], [-12.0, zc]];
  const endA = [kx, -6.2], endB = [kx, -11.4];
  let cur = way[1], dir = 0;
  const nMid = rng.int(4, 7);
  const clearOf = (p, upto) => { for (let i = 0; i < upto; i++) if (segDist(p[0], p[1], way[i][0], way[i][1], way[i + 1][0], way[i + 1][1]) < 6.2) return false; return true; };
  for (let k = 0; k < nMid; k++) {
    let ok = false;
    for (let t = 0; t < 30 && !ok; t++) {
      const a = dir + rng.range(-2.3, 2.3), len = rng.range(5.5, 11.5);
      const p = [cur[0] + Math.cos(a) * len, cur[1] + Math.sin(a) * len];
      if (p[0] < -10.5 || p[0] > 14.2 || p[1] < -6.5 || p[1] > 14.2) continue;
      if (p[0] + p[1] > 24) continue;
      if (Math.abs(p[0] - kx) < 6.5 && p[1] < -4) continue;
      if (!clearOf(p, way.length - 2)) continue;
      let bad = false;
      for (let i = 0; i < way.length - 2 && !bad; i++) {
        if (segInter(cur, p, way[i], way[i + 1]) >= 0) bad = true;
        for (let u = 0.25; u <= 1 && !bad; u += 0.25) if (segDist(cur[0] + (p[0] - cur[0]) * u, cur[1] + (p[1] - cur[1]) * u, way[i][0], way[i][1], way[i + 1][0], way[i + 1][1]) < 5.6) bad = true;
      }
      if (bad) continue;
      way.push(p); dir = Math.atan2(p[1] - cur[1], p[0] - cur[0]); cur = p; ok = true;
    }
    if (!ok) return null;
  }
  way.push(endA, endB);
  let poly = relax(catmull(way, PATH_STEP), 10);
  poly = resample(poly, PATH_STEP);
  poly[poly.length - 1] = [kx, -11.4];
  const n = poly.length, L = (n - 1) * PATH_STEP;
  if (L < 58 || L > 92) return null;
  const gap = Math.round(10 / PATH_STEP);
  for (let i = 0; i < n; i++) {
    const [x, z] = poly[i], s = i * PATH_STEP;
    if (x > 15.3 || z > 15.3 || z < -11.6 || x + z > 26) return null;
    if (s > 7 && x < -12.2) return null;
    if (s < L - 5.5 && Math.abs(x - kx) < 5.6 && z < -8.6) return null;
    if (s > 7 && s < L - 6 && (z < -9.2)) return null;
    for (let j = i + gap; j < n; j += 2) if (Math.hypot(poly[j][0] - x, poly[j][1] - z) < 6.0) return null;
    if (i >= 4 && i < n - 4) {
      const a = Math.atan2(poly[i][1] - poly[i - 4][1], poly[i][0] - poly[i - 4][0]), b = Math.atan2(poly[i + 4][1] - poly[i][1], poly[i + 4][0] - poly[i][0]);
      if (Math.abs(angDiff(a, b)) > 0.62) return null;
    }
  }
  return { poly, L, zc, kx, way };
}

function tryStream(rng, road) {
  const { poly, L, kx } = road;
  for (let t = 0; t < 60; t++) {
    const sx = rng.range(-10, 12), sz = rng.range(-12.5, 2);
    if (Math.abs(sx - kx) < 7 && sz < -7) continue;
    if (polyMinDist(poly, sx, sz)[0] < 3.6) continue;
    const front = rng.chance(0.6);
    const ex = front ? rng.range(-13, 13) : BH + 0.6, ez = front ? BH + 0.6 : rng.range(-7, 13);
    const mx = (sx + ex) / 2 + rng.range(-5, 5), mz = (sz + ez) / 2 + rng.range(-5, 5);
    const raw = [];
    for (let k = 0; k <= 40; k++) { const u = k / 40, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; raw.push([a * sx + b * mx + c * ex, a * sz + b * mz + c * ez]); }
    const sp = resample(raw, 0.5);
    if (sp.length < 20) continue;
    let cross = null, count = 0, bad = false;
    for (let i = 0; i < sp.length - 1 && !bad; i++) {
      for (let j = 0; j < poly.length - 1; j++) {
        const tt = segInter(sp[i], sp[i + 1], poly[j], poly[j + 1]);
        if (tt >= 0) {
          count++; if (count > 1) { bad = true; break; }
          const sa = Math.atan2(sp[i + 1][1] - sp[i][1], sp[i + 1][0] - sp[i][0]), ra = Math.atan2(poly[j + 1][1] - poly[j][1], poly[j + 1][0] - poly[j][0]);
          let rel = Math.abs(angDiff(sa, ra)); if (rel > HPI) rel = PI - rel;
          cross = { i, j, s: j * PATH_STEP, x: sp[i][0] + (sp[i + 1][0] - sp[i][0]) * tt, z: sp[i][1] + (sp[i + 1][1] - sp[i][1]) * tt, rel, ra };
        }
      }
    }
    if (bad || count !== 1) continue;
    if (cross.rel < 1.0 || cross.s < 9 || cross.s > L - 9) continue;
    for (let i = 0; i < sp.length && !bad; i++) {
      const [x, z] = sp[i];
      if (Math.hypot(x - cross.x, z - cross.z) > 3.4 && polyMinDist(poly, x, z)[0] < 3.3) bad = true;
      if (Math.abs(x - kx) < 6.2 && z < -9) bad = true;
      if (x < -12.8) bad = true;
    }
    if (bad) continue;
    return { pts: sp, cross, src: [sx, sz], front };
  }
  return null;
}

function choosePads(rng, road, stream) {
  const { poly, L, kx } = road, cand = [];
  const off = ROAD_HALF + 2.0;
  for (let s = 7.5; s < L - 3.5; s += 0.9) {
    const i = Math.round(s / PATH_STEP), a = poly[Math.max(0, i - 2)], b = poly[Math.min(poly.length - 1, i + 2)];
    const tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
    for (const side of [-1, 1]) {
      const x = poly[i][0] + nx * off * side, z = poly[i][1] + nz * off * side;
      if (Math.abs(x) > BH - 2.4 || Math.abs(z) > BH - 2.4 || x < -11.2) continue;
      if (Math.abs(x - kx) < 6.4 && z < -9.6) continue;
      if (z < -12.6 || x + z < -21) continue;
      if (polyMinDist(poly, x, z)[0] < off - 0.25) continue;
      if (stream && polyMinDist(stream.pts, x, z)[0] < 2.9) continue;
      let cov = 0; for (let j = 0; j < poly.length; j++) if (dist2(x, z, poly[j][0], poly[j][1]) < 36) cov += PATH_STEP;
      cand.push({ x, z, s, side, cov });
    }
  }
  if (cand.length < 8) return null;
  cand.sort((p, q) => q.cov - p.cov);
  const pads = [], thirds = [0, 0, 0];
  const far = (c, dmin) => pads.every(p => dist2(p.x, p.z, c.x, c.z) > dmin * dmin);
  for (let pass = 0; pass < 2; pass++) for (let third = 0; third < 3; third++) {
    const c = cand.find(c => Math.min(2, Math.floor(c.s / L * 3)) === third && far(c, 4.6));
    if (c) { pads.push(c); thirds[third]++; }
  }
  for (const c of cand) { if (pads.length >= 11) break; if (far(c, 4.6)) pads.push(c); }
  if (pads.length < 8) return null;
  pads.sort((p, q) => p.s - q.s);
  return pads;
}

function genLayout(seed) {
  const rng = makeRng(seed * 7919 + 13);
  let best = null;
  for (let attempt = 0; attempt < 2500; attempt++) {
    const road = tryRoad(rng); if (!road) continue;
    const stream = tryStream(rng, road); if (!stream) continue;
    const pads = choosePads(rng, road, stream); if (!pads) continue;
    let minx = 99, maxx = -99, minz = 99, maxz = -99;
    for (const p of road.poly) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
    let turn = 0; const pp = road.poly;
    for (let i = 6; i < pp.length - 6; i += 3) turn += Math.abs(angDiff(Math.atan2(pp[i][1] - pp[i - 3][1], pp[i][0] - pp[i - 3][0]), Math.atan2(pp[i + 3][1] - pp[i][1], pp[i + 3][0] - pp[i][0])));
    const score = Math.min(road.L, 84) * 0.55 + turn * 3.2 + pads.length * 2 + (maxx - Math.max(minx, -12)) * 0.3 + (maxz - minz) * 0.3 + rng() * 5;
    if (!best || score > best.score) best = { road, stream, pads, score, turn };
    if (attempt > 700 && best) break;
  }
  if (!best) return null;
  const { road, stream, pads } = best;
  return {
    seed, pts: road.poly, L: road.L, cave: { x: -14.6, z: road.zc }, gate: { x: road.kx, z: -11.4 }, kx: road.kx,
    stream: stream.pts, cross: stream.cross, streamFront: stream.front, pads, mirrored: false,
  };
}


// 31-terrain.js

const MAT = {};
function initMaterials() {
  const tex = makeDetailTextures(); SH.uTexA.value = tex.albedo; SH.uTexH.value = tex.height;
  MAT.world = litMaterial('world');
  MAT.inst = litMaterial('inst');
  MAT.water = litMaterial('water', { color: new THREE.Color(0.012, 0.02, 0.03), roughness: 0.1 });
  MAT.dark = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
  MAT.caster = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
  MAT.fall = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: SH.uTime, uFP: { value: new THREE.Vector4(0, 1, 1, 0) }, uFA: { value: new THREE.Vector3(.022, .034, .054) }, uFB: { value: new THREE.Vector3(.2, .27, .38) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `precision highp float; varying vec2 vUv; uniform float uTime; uniform vec4 uFP; uniform vec3 uFA; uniform vec3 uFB;
float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  float x = vUv.x, y = vUv.y, t = uTime * uFP.y;
  float edge = smoothstep(0.0, 0.14, x) * smoothstep(1.0, 0.86, x);
  if (uFP.x > 0.5 && uFP.x < 1.5) {
    float c1 = n(vec2(x * 7.0, 2.0)), c2 = n(vec2(x * 19.0 + 5.0, 7.0)), c3 = n(vec2(x * 4.0 + 1.0, y * 2.2));
    float len = 0.34 + 0.46 * c1 + 0.16 * c2, tip = smoothstep(len, len - 0.2, y);
    float rib = smoothstep(0.2, 0.8, c2 * 0.55 + n(vec2(x * 34.0, y * 1.3)) * 0.45);
    float ed = smoothstep(0.0, 0.07, x) * smoothstep(1.0, 0.93, x);
    gl_FragColor = vec4(mix(uFA, uFB, rib * (0.45 + 0.55 * c3)), ed * tip * uFP.z); return;
  }
  float s1 = n(vec2(x * 6.0, y * 5.0 - t * 2.4)), s2 = n(vec2(x * 13.0 + 3.1, y * 11.0 - t * 4.1)), s3 = n(vec2(x * 3.0 - 1.7, y * 2.2 - t * 1.3));
  float strand = smoothstep(0.34, 0.72, s1 * 0.6 + s2 * 0.4);
  float sheet = 1.0 - smoothstep(0.03, 0.3, y);
  float fade = 1.0 - smoothstep(0.4, 1.0, y);
  if (uFP.x > 1.5) {
    float body = mix(0.72 + 0.28 * s3, 1.0, sheet), crust = strand * smoothstep(0.05, 0.5, y);
    gl_FragColor = vec4(mix(uFA * (0.7 + 0.5 * s3), uFB, crust), clamp(edge * body * (1.0 - smoothstep(0.55, 1.0, y)) * uFP.z, 0.0, 1.0)); return;
  }
  float body = mix(strand * (0.55 + 0.45 * s3), 1.0, sheet);
  float foam = strand * smoothstep(0.02, 0.22, y);
  vec3 col = mix(uFA, uFB, foam * 0.85 + 0.06 * s3);
  gl_FragColor = vec4(col, clamp(edge * body * fade * (0.62 + 0.3 * foam) * uFP.z, 0.0, 1.0)); }`,
  });
}

function buildBoard(seed, index) {
  let lay = null, ls = seed;
  while (!lay) { lay = genLayout(ls); ls += 101; }
  const bio = biomeFor(index), RL = bio.relief; applyBiomePalette(bio);
  const rng = makeRng(seed * 9176 + 11); soupRng = makeRng(seed * 131 + 5);
  const sd = (seed * 53) % 997;
  const P = lay.pts, n = P.length, L = lay.L, kx = lay.kx, zc = lay.cave.z;
  const px = new Float32Array(n), pz = new Float32Array(n), py = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
  for (let i = 0; i < n; i++) { px[i] = P[i][0]; pz[i] = P[i][1]; }
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); const dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }

  const hBase = (x, z) => {
    let h = (fbm(x * .055 + sd, z * .055 + 3.1, sd, 3) - .5) * RL[0] + (fbm(x * .17 + 3, z * .17 + 7, sd + 5, 2) - .5) * RL[1] + .9 * smooth(7, -13, z);
    if (RL[3]) { const w = x * .42 + z * .2 + (fbm(x * .09, z * .09, sd + 70, 2) - .5) * 5, r = 1 - Math.abs(Math.sin(w)); h += RL[3] * r * r * (.4 + .9 * fbm(x * .07 + 9, z * .07, sd + 71, 2)); }
    return h;
  };

  { const raw = new Float32Array(n); for (let i = 0; i < n; i++) raw[i] = hBase(px[i], pz[i]) * .6;
    let a = raw, b = new Float32Array(n);
    for (let pass = 0; pass < 2; pass++) { for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -16; k <= 16; k++) { const j = clamp(i + k, 0, n - 1); s += a[j]; c++; } b[i] = s / c; } const t = a; a = b; b = t; }
    py.set(a); }

  const SP = lay.stream, sn = SP.length, swl = new Float32Array(sn);
  { const wlS = hBase(SP[0][0], SP[0][1]) - .5, wlE = Math.min(hBase(SP[sn - 1][0], SP[sn - 1][1]) - .5, wlS - .3);
    let k = 0; for (let u = 0; u < sn; u++) { swl[u] = lerp(wlS, wlE, u / (sn - 1)); k = Math.min(k, hBase(SP[u][0], SP[u][1]) - .38 - swl[u]); }
    for (let u = 0; u < sn; u++) swl[u] += k; }
  const ci0 = Math.round(lay.cross.s / PATH_STEP), wlc = swl[lay.cross.i];
  { const need = Math.max(.4, wlc + 1.0 - py[ci0]); for (let i = 0; i < n; i++) py[i] += need * smooth(3.6, .7, Math.abs(i - ci0) * PATH_STEP); }
  const keepY = py[n - 1];

  const DN = 145, DS = .25, dRoad = new Float32Array(DN * DN), iRoad = new Uint16Array(DN * DN), dStr = new Float32Array(DN * DN), iStr = new Uint16Array(DN * DN);
  for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) {
    const x = -BH + i * DS, z = -BH + j * DS; let b = 1e9, bi = 0;
    for (let k = 0; k < n; k++) { const dx = px[k] - x, dz = pz[k] - z, d = dx * dx + dz * dz; if (d < b) { b = d; bi = k; } }
    dRoad[j * DN + i] = Math.sqrt(b); iRoad[j * DN + i] = bi; b = 1e9; bi = 0;
    for (let k = 0; k < sn; k++) { const dx = SP[k][0] - x, dz = SP[k][1] - z, d = dx * dx + dz * dz; if (d < b) { b = d; bi = k; } }
    dStr[j * DN + i] = Math.sqrt(b); iStr[j * DN + i] = bi;
  }
  const dfAt = (arr, x, z) => {
    const fx = clamp((x + BH) / DS, 0, DN - 1.001), fz = clamp((z + BH) / DS, 0, DN - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * DN + i;
    return (arr[o] * (1 - u) + arr[o + 1] * u) * (1 - v) + (arr[o + DN] * (1 - u) + arr[o + DN + 1] * u) * v;
  };
  const idxAt = (arr, x, z) => arr[clamp(Math.round((z + BH) / DS), 0, DN - 1) * DN + clamp(Math.round((x + BH) / DS), 0, DN - 1)];

  const pads = lay.pads.map(p => ({ x: p.x, z: p.z, s: p.s, cov: p.cov, y: 0 }));
  for (const p of pads) p.y0 = py[clamp(Math.round(p.s / PATH_STEP), 0, n - 1)] + .05;

  const ponds = [];
  for (let t = 0; t < 700 && ponds.length < bio.ponds; t++) {
    const r = rng.range(1.2, 2.3), x = rng.range(-BH + 3.4 + r, BH - 3.4 - r), z = rng.range(-BH + 3.4 + r, BH - 3.4 - r);
    if (dfAt(dRoad, x, z) < ROAD_HALF + 2.6 + r || dfAt(dStr, x, z) < 3.9 + r) continue;
    if (x < -12 + r || z < -12 + r || (Math.abs(x - kx) < 6.5 + r && z < -8.5 + r)) continue;
    if (pads.some(p => Math.hypot(x - p.x, z - p.z) < 3.1 + r) || ponds.some(q => Math.hypot(x - q.x, z - q.z) < r + q.r + 3.2)) continue;
    let y = 1e9; for (let k = 0; k < 24; k++) { const a = k / 12 * TAU, d = r + (k < 12 ? 1.3 : 2.1); y = Math.min(y, hBase(x + Math.cos(a) * d, z + Math.sin(a) * d)); }
    ponds.push({ x, z, r, y: Math.min(y, hBase(x, z)) - .22 });
  }
  const pondD = (q, x, z) => Math.hypot(x - q.x, z - q.z) * (.82 + .36 * vnoise(x * .55 + q.x, z * .55 + q.z, sd + 60));
  let _cl = 0;
  const hAt = (x, z) => {
    let h = hBase(x, z);
    const ds = dfAt(dStr, x, z);
    if (ds < 3.6) { const wl = swl[idxAt(iStr, x, z)]; h = Math.max(h, lerp(h, wl + .3, smooth(3.6, 2.3, ds) * smooth(.8, 1.5, ds))); }
    if (ds < 2.3) h = lerp(h, swl[idxAt(iStr, x, z)] - .34, smooth(2.2, .6, ds));
    const dsrc = Math.hypot(x - SP[0][0], z - SP[0][1]); if (dsrc < 2.7) h = lerp(h, swl[0] - .34, smooth(2.7, 1.2, dsrc));
    const dr = dfAt(dRoad, x, z);
    if (dr < ROAD_HALF + 3.2) {
      const w = smooth(ROAD_HALF + 3.2, ROAD_HALF + .4, dr) * smooth(.9, 2.3, ds);
      h = lerp(h, py[idxAt(iRoad, x, z)], w); if (dr < ROAD_HALF - .15 && ds > 2.3) h -= .07;
    }
    for (const p of pads) { const d = Math.hypot(x - p.x, z - p.z); if (d < 2.7) h = lerp(h, p.y0, smooth(2.7, 1.5, d)); }
    for (const q of ponds) { const d = pondD(q, x, z); if (d < q.r + 1.5) h = lerp(h, q.y - .45, smooth(q.r + 1.5, q.r * .4, d)); }
    const dkx = Math.max(0, Math.abs(x - kx) - 5.2), dkz = Math.max(0, z + 11.7), dk = Math.hypot(dkx, dkz);
    if (dk < 1.8) h = lerp(h, keepY, smooth(1.8, .2, dk));
    const dcl = x + BH + (fbm(z * .23 + 1.7, x * .11, sd + 9, 2) - .5) * 2.6;
    let c = smooth(5.0, 1.3, dcl) * (3.4 + 2.6 * fbm(x * .21, z * .21, sd + 11, 2) + 1.4 * smooth(4, -15, z)) * RL[2];
    const dbr = z + BH + (fbm(x * .23 + 5.1, z * .11, sd + 13, 2) - .5) * 2.4;
    const c2 = smooth(4.4, 1.0, dbr) * (1.8 + 2.2 * fbm(x * .2 + 9, z * .2, sd + 15, 2)) * smooth(5.4, 7.6, Math.abs(x - kx)) * RL[2];
    c = Math.max(c, c2) + 1.5 * smooth(11, 1, Math.hypot(x + BH, z + BH)) * smooth(7, 2.5, Math.min(x + BH, z + BH));
    if (c > .02) { const v = c / 1.2, f = Math.floor(v); c = (f + smooth(.45, .9, v - f)) * 1.2; }
    if (x < -12.2) c *= 1 - smooth(2.6, 1.6, Math.abs(z - zc)) * smooth(-12.2, -13.2, x);
    _cl = c; return h + c;
  };

  const chunks = [];
  for (let j = 0; j < NCH; j++) for (let i = 0; i < NCH; i++) chunks.push({ i, j, soup: new Soup(), water: new Soup(), cx: -BH + (i + .5) * CHUNK, cz: -BH + (j + .5) * CHUNK, extras: [], kind: 'chunk' });
  const chunkAt = (x, z) => chunks[clamp(Math.floor((z + BH) / CHUNK), 0, NCH - 1) * NCH + clamp(Math.floor((x + BH) / CHUNK), 0, NCH - 1)];
  const structs = [];
  const fires = [], glows = [];

  const NV = Math.round(2 * BH / CELL) + 1, CPC = Math.round(CHUNK / CELL);
  const VX = new Float32Array(NV * NV), VZ = new Float32Array(NV * NV), VY = new Float32Array(NV * NV), VC = new Float32Array(NV * NV), HG = new Float32Array(NV * NV);
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    let x = -BH + i * CELL, z = -BH + j * CELL; const o = j * NV + i;
    HG[o] = hAt(x, z);
    if (i % CPC !== 0) x += (h2(i, j, sd) - .5) * .26; if (j % CPC !== 0) z += (h2(i, j, sd + 1) - .5) * .26;
    VX[o] = x; VZ[o] = z; VY[o] = hAt(x, z); VC[o] = _cl;
  }
  const heightAt = (x, z) => {
    const fx = clamp((x + BH) / CELL, 0, NV - 1.001), fz = clamp((z + BH) / CELL, 0, NV - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * NV + i;
    return (HG[o] * (1 - u) + HG[o + 1] * u) * (1 - v) + (HG[o + NV] * (1 - u) + HG[o + NV + 1] * u) * v;
  };
  const tcol = (x, z, ny, cl) => {
    const n1 = fbm(x * .3 + sd, z * .3, 3, 2), n2 = h2(Math.floor(x * 2 + 99), Math.floor(z * 2 + 99), sd + 2);
    if (cl > .5 || ny < .8) {
      let c = mixC(COL.stoneD, COL.stone, n1 * .9 + .1); if (ny > .93 && n1 > .5) c = mixC(c, COL.grassD, .4);
      return [mulC(c, .82 + .32 * n2), L_ROCK, .96];
    }
    let ds = dfAt(dStr, x, z); for (const q of ponds) ds = Math.min(ds, Math.max(0, pondD(q, x, z) - q.r) + .55);
    const glow = bio.bankGlow ? smooth(3.0, 1.1, ds) : 0;
    if (ds < 1.25) return [mixC(mulC(mixC(COL.mud, COL.earthD, n1), .6 + .25 * n2), [.42, .09, .02], glow * .16), L_DIRT, glow ? .9 : .5, glow * .012];
    let c = mixC(COL.earth, COL.grass, smooth(.4, .62, n1));
    c = mixC(c, COL.earthD, smooth(2.4, .5, dfAt(dRoad, x, z) - ROAD_HALF) * .55);
    return [mixC(mulC(c, .84 + .3 * n2), [.42, .09, .02], glow * .1), L_DIRT, .97, glow * .007];
  };
  const vtx = o => [VX[o], VY[o], VZ[o]];
  for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NV - 1; i++) {
    const S = chunks[Math.floor(j / CPC) * NCH + Math.floor(i / CPC)].soup;
    const oa = j * NV + i, a = vtx(oa), b = vtx(oa + 1), c = vtx(oa + NV + 1), d = vtx(oa + NV);
    const cl = Math.max(VC[oa], VC[oa + 1], VC[oa + NV], VC[oa + NV + 1]);
    const tris = ((i + j) & 1) ? [[a, d, c], [a, c, b]] : [[a, d, b], [b, d, c]];
    for (const t of tris) {
      _sa.set(t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]); _sb.set(t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]); _sn.crossVectors(_sa, _sb).normalize();
      const m = tcol((t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3, _sn.y, cl);
      S.tri(t[0], t[1], t[2], m[0], m[1], m[2], m[3] ? { emis: m[3] } : undefined);
    }
  }
  const facing = (S, a, b, c, d, ox, oz, col, layer, rough, o) => {
    _sa.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _sb.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _sn.crossVectors(_sa, _sb);
    if (_sn.x * ox + _sn.z * oz + _sn.y * 1e-3 >= 0) S.quad(a, b, c, d, col, layer, rough, o); else S.quad(a, d, c, b, col, layer, rough, o);
  };
  const SC = bio.strata.map(h => C(h));
  const strataCol = k => k === 0 ? mulC(COL.earthD, 1.1) : mulC(SC[(k * 3 + Math.floor(h2(k, 7, sd + 40) * 3)) % SC.length], .8 + .35 * h2(k, 3, sd + 41));
  const LV = []; { let y = 13, i = 0; while (y > -11) { LV.push(y); y -= .5 + .95 * h2(i++, 9, sd + 47); } LV.push(-99); }
  const insetBase = (y, k) => y > -.5 ? -(k & 1) * .1 : -(Math.min(1.0, (-.5 - y) * .2) + (k & 1) * .16) + (y < -4.0 ? (-4.0 - y) * .6 : 0);
  const inset = (y, k, t) => insetBase(y, k) + (vnoise(t * .8, k * 3.1, sd + 45) - .5) * .14;
  const wallReach = (top, y) => { const l0 = top - .32; if (y >= l0) return 0; let j = 0; while (LV[j] > l0 - .3) j++; while (LV[j] >= y) j++; return .07 - insetBase(LV[j] + .4, j + 1); };
  const wallColumn = (S, ax, az, ay, bx, bz, by, ox, oz, outer, t0, t1) => {
    if (!outer) { facing(S, [ax, ay, az], [ax, -4.6, az], [bx, -4.6, bz], [bx, by, bz], ox, oz, mulC(COL.stoneD, .7), L_ROCK, 1); return; }
    const bot = t => -5.0 - 2.2 * fbm(t * .45, 1.7, sd + 43, 2) - (h2(Math.floor(t * 2), 5, sd + 44) > .8 ? 1.3 : 0);
    const botA = bot(t0), botB = bot(t1);
    let yA = ay, yB = by, inA = 0, inB = 0, lvl = Math.min(ay, by) - .32, j = 0; while (LV[j] > lvl - .3) j++;
    for (let step = 0; step < 34; step++) {
      const wob = step ? .2 : 0;
      const loA = Math.max(lvl + wob * (vnoise(t0 * 1.3, j, sd + 46) - .5), botA), loB = Math.max(lvl + wob * (vnoise(t1 * 1.3, j, sd + 46) - .5), botB);
      const vk = bio.vein && step > 0 && (j % 6) === 2 ? smooth(.5, .68, vnoise(t0 * .35, j * 1.7, sd + 48)) : 0, vein = vk > .01;
      const col = vein ? mixC(strataCol(j + 3), [.5, .11, .02], vk) : strataCol(step === 0 ? 0 : j + 3);
      const a1 = [ax - ox * inA, yA, az - oz * inA], a2 = [ax - ox * inA, loA, az - oz * inA], b2 = [bx - ox * inB, loB, bz - oz * inB], b1 = [bx - ox * inB, yB, bz - oz * inB];
      const glow = { emis: vein ? .008 + .075 * vk : .03 * smooth(-7.5, -1, (loA + yA) * .5) + .008 };
      if (yA - loA > .01 || yB - loB > .01) facing(S, a1, a2, b2, b1, ox, oz, col, step === 0 ? L_DIRT : L_ROCK, .97, glow);
      if (lvl <= botA && lvl <= botB) break;
      const nl = LV[j++], nA = inset(nl + .4, j, t0), nB = inset(nl + .4, j, t1);
      const l1 = [ax - ox * nA, loA, az - oz * nA], l2 = [bx - ox * nB, loB, bz - oz * nB];
      S.quad(a2, l1, l2, b2, mulC(col, 1.3), L_ROCK, .97, glow); S.quad(a2, b2, l2, l1, mulC(col, .45), L_ROCK, .97);
      yA = loA; yB = loB; inA = nA; inB = nB; lvl = nl;
    }
  };
  for (const ch of chunks) {
    const S = ch.soup, i0 = ch.i * CPC, j0 = ch.j * CPC;
    for (let k = 0; k < CPC; k++) {
      let o1 = j0 * NV + i0 + k, o2 = o1 + 1;
      wallColumn(S, VX[o1], VZ[o1], VY[o1], VX[o2], VZ[o2], VY[o2], 0, -1, ch.j === 0, VX[o1], VX[o2]);
      o1 = (j0 + CPC) * NV + i0 + k; o2 = o1 + 1;
      wallColumn(S, VX[o1], VZ[o1], VY[o1], VX[o2], VZ[o2], VY[o2], 0, 1, ch.j === NCH - 1, VX[o1] + 50, VX[o2] + 50);
      o1 = (j0 + k) * NV + i0; o2 = o1 + NV;
      wallColumn(S, VX[o1], VZ[o1], VY[o1], VX[o2], VZ[o2], VY[o2], -1, 0, ch.i === 0, VZ[o1] + 100, VZ[o2] + 100);
      o1 = (j0 + k) * NV + i0 + CPC; o2 = o1 + NV;
      wallColumn(S, VX[o1], VZ[o1], VY[o1], VX[o2], VZ[o2], VY[o2], 1, 0, ch.i === NCH - 1, VZ[o1] + 150, VZ[o2] + 150);
    }
    const inx = (ch.i === 0 ? 2.1 : 0) - (ch.i === NCH - 1 ? 2.1 : 0), inz = (ch.j === 0 ? 2.1 : 0) - (ch.j === NCH - 1 ? 2.1 : 0), edge = inx || inz;
    S.rock(edge ? 2.3 : 3.3, ch.cx + inx, edge ? -6.4 : -4.8, ch.cz + inz, mulC(COL.stoneD, .7), { sq: edge ? .9 : .62, d: 1, jit: .1 });
  }

  const OFF = [-1.62, -1.25, -.85, -.45, 0, .45, .85, 1.25, 1.62];
  const roadVert = (i, k, ext) => {
    const off = OFF[k], s = i * PATH_STEP, wj = Math.abs(off) > 1.3 ? 1 + (fbm(s * .5, k, sd + 20, 2) - .5) * .28 : 1;
    const ii = clamp(i, 0, n - 1), x = px[ii] + tx[ii] * ext - tz[ii] * off * wj, z = pz[ii] + tz[ii] * ext + tx[ii] * off * wj;
    const onBridge = Math.abs(i - ci0) * PATH_STEP < 3.0;
    let y = py[ii] + .035 * (1 - (off / 1.25) * (off / 1.25));
    const nz = fbm(x * .45, z * .45, sd + 21, 2);
    let c = mulC(COL.road, .78 + .42 * nz), rough = .6;
    const rut = Math.abs(Math.abs(off) - .62) < .3 ? smooth(.38, .62, fbm(s * .22, off > 0 ? 3 : 9, sd + 23, 2)) : 0;
    c = mixC(c, COL.roadD, rut * .75); y -= rut * .025;
    const mud = onBridge ? 0 : smooth(.57, .7, fbm(x * .3 + 7, z * .3, sd + 25, 2));
    c = mixC(c, COL.mud, mud * .85); rough = lerp(rough, .3, mud) - rut * .12;
    if (Math.abs(off) > 1.3) { c = mixC(c, COL.earth, .8); rough = .95; y = onBridge ? py[ii] - .04 : heightAt(x, z) + .012; }
    return [x, y, z, c, rough];
  };
  const rows = []; for (let i = 0; i < n; i += 2) rows.push(i); if (rows[rows.length - 1] !== n - 1) rows.push(n - 1);
  const rv = rows.map(i => OFF.map((_, k) => roadVert(i, k, 0)));
  rv.push(OFF.map((_, k) => roadVert(n - 1, k, 1.3)));
  for (let r = 0; r < rv.length - 1; r++) for (let k = 0; k < OFF.length - 1; k++) {
    const a = rv[r][k], b = rv[r][k + 1], c = rv[r + 1][k + 1], d = rv[r + 1][k];
    const S = chunkAt((a[0] + c[0]) / 2, (a[2] + c[2]) / 2).soup;
    for (const v of [a, b, c, a, c, d]) S.v(v[0], v[1], v[2], 0, 1, 0, v[3][0], v[3][1], v[3][2], v[0] * .25, v[2] * .25, L_COBBLE, v[4]);
  }
  for (let q = 0; q < 16; q++) {
    const i = rng.int(20, n - 20); if (Math.abs(i - ci0) * PATH_STEP < 4) continue;
    let x = px[i] - tz[i] * rng.range(-.9, .9), z = pz[i] + tx[i] * rng.range(-.9, .9), a = rng.range(0, TAU); const y = py[i] + .045, S = chunkAt(x, z).soup;
    for (let sgm = 0; sgm < rng.int(3, 6); sgm++) {
      a += rng.range(-.9, .9); const l = rng.range(.18, .4), x2 = x + Math.cos(a) * l, z2 = z + Math.sin(a) * l, wx = -Math.sin(a) * .028, wz = Math.cos(a) * .028;
      const col = mulC(COL.black, 2.2);
      S.quad([x - wx, y, z - wz], [x + wx, y, z + wz], [x2 + wx, y, z2 + wz], [x2 - wx, y, z2 - wz], col, L_PLAIN, 1);
      S.quad([x - wx, y, z - wz], [x2 - wx, y, z2 - wz], [x2 + wx, y, z2 + wz], [x + wx, y, z + wz], col, L_PLAIN, 1);
      x = x2; z = z2;
    }
  }
  const waterV = (S, x, y, z, u, w, flow, rough) => S.v(x, y, z, 0, 1, 0, 1, 1, 1, u, w, 0, rough, flow, 0);
  for (let q = 0, made = 0; q < 60 && made < bio.puddles; q++) {
    const i = rng.int(18, n - 14); if (Math.abs(i - ci0) * PATH_STEP < 4.5) continue;
    const off = rng.sign() * rng.range(.25, .78), cx = px[i] - tz[i] * off, cz = pz[i] + tx[i] * off, r = rng.range(.36, .78), y = py[i] + .042, ph = rng() * 9, el = rng.range(.6, 1), ang = Math.atan2(tz[i], tx[i]);
    const ring = []; for (let k = 0; k < 11; k++) { const a = k / 11 * TAU, rr2 = r * (.72 + .5 * vnoise(Math.cos(a) * 1.4 + ph, Math.sin(a) * 1.4, sd)); const lx = Math.cos(a) * rr2, lz = Math.sin(a) * rr2 * el; ring.push([cx + lx * Math.cos(ang) - lz * Math.sin(ang), cz + lx * Math.sin(ang) + lz * Math.cos(ang)]); }
    const ch = chunkAt(cx, cz), mudc = mulC(COL.mud, .55);
    for (let k = 0; k < 11; k++) {
      const p = ring[k], q2 = ring[(k + 1) % 11];
      waterV(ch.water, cx, y, cz, cx, cz, 0, .16); waterV(ch.water, q2[0], y, q2[1], q2[0], q2[1], 0, .16); waterV(ch.water, p[0], y, p[1], p[0], p[1], 0, .16);
      const e = 1.28, m1 = [cx + (p[0] - cx) * e, y - .006, cz + (p[1] - cz) * e], m2 = [cx + (q2[0] - cx) * e, y - .006, cz + (q2[1] - cz) * e];
      for (const v of [[cx, y - .006, cz], m2, m1]) ch.soup.v(v[0], v[1], v[2], 0, 1, 0, mudc[0], mudc[1], mudc[2], v[0] * .25, v[2] * .25, L_COBBLE, .28);
    }
    made++;
  }
  for (const q of ponds) {
    const R2 = q.r + .5, x0 = Math.floor(q.x - R2), x1 = Math.ceil(q.x + R2), z0 = Math.floor(q.z - R2), z1 = Math.ceil(q.z + R2);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      if (Math.hypot(x + .5 - q.x, z + .5 - q.z) > R2 + .8) continue;
      const S = chunkAt(x + .5, z + .5).water;
      for (const [dx, dz] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) waterV(S, x + dx, q.y, z + dz, (x + dx) * .8, (z + dz) * .8, .02, .14);
    }
  }
  if (bio.key === 'ember') {
    for (let q = 0; q < 46; q++) {
      let x = rng.range(-BH + 1.5, BH - 1.5), z = rng.range(-BH + 1.5, BH - 1.5), a = rng.range(0, TAU);
      if (dfAt(dRoad, x, z) < ROAD_HALF + .6 || dfAt(dStr, x, z) < 1.4 || dfAt(dStr, x, z) > 9 || Math.abs(hAt(x + .6, z) - hAt(x - .6, z)) > .3) continue;
      for (let sgm = 0, m = rng.int(4, 8); sgm < m; sgm++) {
        a += rng.range(-.8, .8); const l = rng.range(.25, .6), x2 = x + Math.cos(a) * l, z2 = z + Math.sin(a) * l, wd = rng.range(.02, .05), wx = -Math.sin(a) * wd, wz = Math.cos(a) * wd;
        if (Math.abs(x2) > BH - .6 || Math.abs(z2) > BH - .6) break;
        const y1 = heightAt(x, z) + .03, y2 = heightAt(x2, z2) + .03, S = chunkAt(x, z).soup, o = { emis: rng.range(.12, .3) }, col = [.75, .2, .03];
        S.quad([x - wx, y1, z - wz], [x + wx, y1, z + wz], [x2 + wx, y2, z2 + wz], [x2 - wx, y2, z2 - wz], col, L_PLAIN, 1, o);
        S.quad([x - wx, y1, z - wz], [x2 - wx, y2, z2 - wz], [x2 + wx, y2, z2 + wz], [x + wx, y1, z + wz], col, L_PLAIN, 1, o);
        x = x2; z = z2;
      }
    }
  }
  let fallAt = null;
  { let last = sn - 1; for (let u = 1; u < sn; u++) if (Math.abs(SP[u][0]) > BH || Math.abs(SP[u][1]) > BH) { last = u; break; }
    const sv = [];
    for (let u = 0; u <= last; u++) {
      let x = SP[u][0], z = SP[u][1];
      if (u === last) { const a = SP[u - 1], t = Math.abs(x) > BH ? (BH - Math.abs(a[0])) / (Math.abs(x) - Math.abs(a[0])) : (BH - Math.abs(a[1])) / (Math.abs(z) - Math.abs(a[1])); x = a[0] + (x - a[0]) * t; z = a[1] + (z - a[1]) * t; }
      const a = SP[Math.max(0, u - 1)], b = SP[Math.min(sn - 1, u + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const w = .72 + .12 * Math.sin(u * .7) + .9 * smooth(3, 0, u * .5);
      sv.push([x, swl[u], z, -dz / l * w, dx / l * w, u * .5, w]);
    }
    for (let u = 0; u < sv.length - 1; u++) {
      const a = sv[u], b = sv[u + 1], S = chunkAt((a[0] + b[0]) / 2, (a[2] + b[2]) / 2).water;
      const q = [[a[0] - a[3], a[1], a[2] - a[4], -a[6], a[5]], [a[0] + a[3], a[1], a[2] + a[4], a[6], a[5]], [b[0] + b[3], b[1], b[2] + b[4], b[6], b[5]], [b[0] - b[3], b[1], b[2] - b[4], -b[6], b[5]]];
      for (const k of [0, 1, 2, 0, 2, 3]) waterV(S, q[k][0], q[k][1], q[k][2], q[k][3], q[k][4], 1.25, .24);
    }
    const e = sv[sv.length - 1], ox = Math.abs(e[0]) > BH - .01 ? Math.sign(e[0]) : 0, oz = ox ? 0 : Math.sign(e[2]);
    const bed = e[1] - .3, top = bed + .5, ax = Math.abs(oz), az = Math.abs(ox), w = e[6];
    let ext = .4; for (let d = 0; d <= 1.0; d += .1) ext = Math.max(ext, wallReach(top, bed - d) + .22);
    ext = Math.min(ext, .95);
    let v0 = 1.45; for (let r = 1; r <= 28; r++) { const tau = 1.6 * r / 28; v0 = Math.max(v0, (wallReach(top, e[1] - 4.5 * tau * tau) + .38 - ext) / tau); }
    v0 = Math.min(v0, 3.2);
    const S = chunkAt(e[0] - ox * .5, e[2] - oz * .5), rc = () => mulC(mixC(COL.stoneD, COL.stone, rng()), .9);
    const at = (o, a, y) => [e[0] + ox * o + ax * a, y, e[2] + oz * o + az * a];
    { const c = at((ext - .5) / 2, 0, bed - .26); S.soup.box(ox ? ext + .5 : w * 2 + 1.1, .5, ox ? w * 2 + 1.1 : ext + .5, c[0], c[1], c[2], rc(), { l: L_ROCK, jit: .04 }); }
    { const c = at(ext * .15, 0, bed - .6); S.soup.rock(w * .6 + .15, c[0], c[1], c[2], rc(), { sq: .55 }); }
    for (const sd2 of [-1, 1]) for (const [o, r, dy] of [[ext * .1, .44, .1], [ext * .62, .32, .02]]) { const c = at(o, sd2 * (w + .34), e[1] + dy); S.soup.rock(r, c[0], c[1], c[2], rc(), { sq: .72 }); }
    { const a0 = [e[0] - e[3], e[1], e[2] - e[4]], a1 = [e[0] + e[3], e[1], e[2] + e[4]], sg = (e[3] * ax + e[4] * az) >= 0 ? 1 : -1, b0 = at(ext + .06, -sg * w, e[1]), b1 = at(ext + .06, sg * w, e[1]), u1 = e[5] + (ext + .06);
      const q = [[a0, -w, e[5]], [a1, w, e[5]], [b1, w, u1], [b0, -w, u1]];
      for (const k of [0, 1, 2, 0, 2, 3]) waterV(S.water, q[k][0][0], q[k][0][1], q[k][0][2], q[k][1], q[k][2], 1.25, .24); }
    fallAt = { x: e[0], y: e[1], z: e[2], ox, oz, w, ext, v0 };
  }

  const B = {
    seed, index, lay, L, n, px, pz, py, tx, tz, pads, kx, zc, keepY, heightAt, hAt, chunks, structs, fires, glows, chunkAt, rng, sd, bio, ponds, env: [],
    dRoadAt: (x, z) => dfAt(dRoad, x, z), dStrAt: (x, z) => dfAt(dStr, x, z), cross: lay.cross, ci0, wlc, swl, SP, fallAt, mirrored: (index % 2) === 1,
    put(T, x, z, o = {}) { const y = o.y === undefined ? heightAt(x, z) + (o.dy || 0) : o.y; chunkAt(x, z).soup.merge(T, { p: [x, y, z], ry: o.ry || 0, r: o.r, s: o.s, tint: o.tint, ao: o.ao === undefined ? [0, .55, .6] : o.ao }); },
  };
  buildBridge(B); buildPads(B); buildKeep(B); buildCave(B); scatterProps(B);
  finalizeBoard(B);
  return B;
}

function pathAt(B, s, out) {
  const f = clamp(s / PATH_STEP, 0, B.n - 1.0001), i = Math.floor(f), t = f - i;
  out.x = lerp(B.px[i], B.px[i + 1], t); out.z = lerp(B.pz[i], B.pz[i + 1], t); out.y = lerp(B.py[i], B.py[i + 1], t);
  out.tx = lerp(B.tx[i], B.tx[i + 1], t); out.tz = lerp(B.tz[i], B.tz[i + 1], t);
  return out;
}
function pathNear(B, x, z, s0, win = 14) {
  const i0 = clamp(Math.round(s0 / PATH_STEP), 0, B.n - 1); let best = 1e9, bi = i0;
  for (let i = Math.max(0, i0 - win); i <= Math.min(B.n - 1, i0 + win); i++) { const d = dist2(x, z, B.px[i], B.pz[i]); if (d < best) { best = d; bi = i; } }
  let s = bi * PATH_STEP;
  const txx = B.tx[bi], tzz = B.tz[bi], along = (x - B.px[bi]) * txx + (z - B.pz[bi]) * tzz;
  s = clamp(s + clamp(along, -PATH_STEP, PATH_STEP), 0, B.L);
  const lat = -(x - B.px[bi]) * tzz + (z - B.pz[bi]) * txx;
  return { s, lat, i: bi };
}

function finalizeBoard(B) {
  const mir = B.mirrored;
  const sw = o => { const t = o.x; o.x = o.z; o.z = t; };
  B.pieces = [];
  B.group = new THREE.Group();
  const mkPiece = (soup, cx, cy, cz, kind, water, extras) => {
    if (mir) { soup.mirrorXZ(); if (water) water.mirrorXZ(); const t = cx; cx = cz; cz = t; }
    const P = soup.P; for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 1] -= cy; P[i + 2] -= cz; }
    const mesh = new THREE.Mesh(soup.build(), MAT.world); mesh.castShadow = kind !== 'beaconTower' && kind !== 'keep'; mesh.receiveShadow = true; mesh.position.set(cx, cy, cz);
    if (water && water.verts) {
      const W = water.P; for (let i = 0; i < W.length; i += 3) { W[i] -= cx; W[i + 1] -= cy; W[i + 2] -= cz; }
      const wm = new THREE.Mesh(water.build(), MAT.water); wm.receiveShadow = true; mesh.add(wm);
    }
    for (const ex of extras || []) {
      if (mir) ex.soup.mirrorXZ();
      const E = ex.soup.P; for (let i = 0; i < E.length; i += 3) { E[i] -= cx; E[i + 1] -= cy; E[i + 2] -= cz; }
      const em = new THREE.Mesh(ex.soup.build(), ex.mat); em.renderOrder = ex.order || 0; mesh.add(em);
    }
    B.group.add(mesh);
    const piece = { mesh, cx, cy, cz, kind, t: 0, delay: 0, spin: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)) };
    B.pieces.push(piece); return piece;
  };
  { let n = 0; for (const ch of B.chunks) n += ch.soup.P.length; const P = new Float32Array(n); let o = 0;
    for (const ch of B.chunks) { const sp = ch.soup.P; if (mir) { for (let i = 0; i < sp.length; i += 9) { for (const k of [0, 2, 1]) { P[o++] = sp[i + k * 3 + 2]; P[o++] = sp[i + k * 3 + 1]; P[o++] = sp[i + k * 3]; } } } else { P.set(sp, o); o += sp.length; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.computeBoundingSphere();
    B.caster = new THREE.Mesh(g, MAT.caster); B.caster.castShadow = true; B.caster.frustumCulled = false; B.group.add(B.caster); }
  for (const ch of B.chunks) mkPiece(ch.soup, ch.cx, 0, ch.cz, 'chunk', ch.water, ch.extras);
  for (const st of B.structs) mkPiece(st.soup, st.cx, st.cy, st.cz, st.kind, null, st.extras);
  if (mir) {
    const sa = (a, b) => { for (let i = 0; i < a.length; i++) { const t = a[i]; a[i] = b[i]; b[i] = t; } };
    sa(B.px, B.pz); sa(B.tx, B.tz);
    for (const p of B.pads) sw(p); for (const f of B.fires) sw(f); for (const g of B.glows) sw(g); for (const q of B.ponds) sw(q); for (const e of B.env) sw(e);
    sw(B.beacon); sw(B.gate); sw(B.cave); if (B.fallAt) { sw(B.fallAt); const t = B.fallAt.ox; B.fallAt.ox = B.fallAt.oz; B.fallAt.oz = t; }
    const h0 = B.heightAt; B.heightAt = (x, z) => h0(z, x);
    const d0 = B.dRoadAt; B.dRoadAt = (x, z) => d0(z, x);
    for (const sp of B.SP) { const t = sp[0]; sp[0] = sp[1]; sp[1] = t; }
    B.cross = Object.assign({}, B.cross, { x: B.cross.z, z: B.cross.x });
  }
  if (B.fallAt) {
    const f = B.fallAt, ex = -f.oz, ez = f.ox, w = f.w * 1.05, pc = B.pieces.reduce((a, b) => b.kind === 'chunk' && dist2(b.cx, b.cz, f.x, f.z) < dist2(a.cx, a.cz, f.x, f.z) ? b : a, B.pieces[0]);
    const NR = 14, pos = [], uv = [], idx = [];
    for (let r = 0; r <= NR; r++) {
      const v = r / NR, tau = 1.3 * v, out = f.ext + f.v0 * tau, dy = -4.5 * tau * tau, ww = w * (1 + .35 * v);
      for (const sd of [-1, 1]) { pos.push(f.x + f.ox * out + ex * ww * sd - pc.cx, f.y + dy - pc.cy, f.z + f.oz * out + ez * ww * sd - pc.cz); uv.push(sd * .5 + .5, v); }
    }
    for (let i = 0; i < NR; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2)); g.setIndex(idx);
    const fm = new THREE.Mesh(g, MAT.fall); fm.renderOrder = 2; pc.mesh.add(fm);
  }
  for (const p of B.pads) { p.y = p.y0 + .29; p.tower = null; p.face = 0; const q = pathNear(B, p.x, p.z, p.s, 30); p.s = q.s; p.face = Math.atan2(B.px[q.i] - p.x, B.pz[q.i] - p.z); }
  B.soupsDone = true; setBoardCasting(B, false);
  B.chunks.forEach(c => { c.soup = c.water = null; }); B.structs.forEach(s => { s.soup = null; });
}

function setBoardCasting(B, moving) { B.caster.visible = !moving; for (const p of B.pieces) if (p.kind === 'chunk' || p.kind === 'cave') p.mesh.castShadow = moving; }
function disposeBoard(B) {
  B.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  if (B.group.parent) B.group.parent.remove(B.group);
}


// 32-props.js

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

const PROP = {
  barrel(S, x, y, z, s = 1, rng) {
    const c = mulC(COL.wood, .8 + .3 * rng());
    S.cyl(.2 * s, .27 * s, x, y + .135 * s, z, c, { n: 8, l: L_WOOD, rt: 1.16 });
    S.cyl(.232 * s, .27 * s, x, y + .405 * s, z, c, { n: 8, l: L_WOOD, rt: .86 });
    for (const h of [.06, .27, .48]) S.cyl((h === .27 ? .242 : .215) * s, .035 * s, x, y + h * s, z, COL.iron, { n: 8, l: L_METAL, rough: .6 });
  },
  crate(S, x, y, z, s, rng, ry = 0) {
    const c = mulC(COL.woodL, .75 + .3 * rng()), o = () => ({ l: L_WOOD, r: [0, ry, 0] });
    S.box(s, s, s, x, y + s / 2, z, c, o());
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) S.box(s * .12, s * 1.04, s * .12, x + (dx * Math.cos(ry) + dz * Math.sin(ry)) * s * .47, y + s / 2, z + (-dx * Math.sin(ry) + dz * Math.cos(ry)) * s * .47, COL.woodD, o());
    S.box(s * 1.04, s * .1, s * 1.04, x, y + s * .97, z, COL.woodD, o());
  },
  tree(S, rng, h, o = {}) {
    const bark = o.bark || mulC(COL.bark, .8 + .4 * rng());
    const branch = (a, d, len, r, depth) => {
      const b = [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len], hot = o.tipEmis && depth >= 3;
      S.seg(a, b, r, r * .64, hot ? o.tip : bark, { l: L_WOOD, n: depth > 1 ? 4 : 6, sway: depth >= 2 ? .35 + depth * .15 : 0, emis: hot ? o.tipEmis : 0 });
      if (depth >= 4 || len < .3) return;
      const kids = depth === 0 ? rng.int(2, 3) : rng.int(1, 2);
      for (let k = 0; k < kids; k++) {
        const nd = [d[0] + rng.range(-1, 1), d[1] * .5 + rng.range(.05, .7), d[2] + rng.range(-1, 1)], l = Math.hypot(nd[0], nd[1], nd[2]);
        branch(b, [nd[0] / l, nd[1] / l, nd[2] / l], len * rng.range(.55, .8), r * .58, depth + 1);
      }
      if (depth < 2) { const nd = [d[0] + rng.range(-.3, .3), 1, d[2] + rng.range(-.3, .3)], l = Math.hypot(nd[0], nd[1], nd[2]); branch(b, [nd[0] / l, nd[1] / l, nd[2] / l], len * .72, r * .64, depth + 1); }
    };
    S.cyl(h * .12, .3, 0, .1, 0, bark, { n: 6, l: L_WOOD, rt: .7 });
    branch([0, .05, 0], [rng.range(-.15, .15), 1, rng.range(-.15, .15)], h * .42, h * .075, 0);
  },
  stump(S, rng) {
    S.cyl(.3, .45, 0, .2, 0, COL.bark, { n: 7, l: L_WOOD, rt: .8 }); S.cyl(.235, .04, 0, .44, 0, COL.woodL, { n: 7, l: L_WOOD });
    for (let k = 0; k < 3; k++) { const a = rng() * TAU; S.seg([Math.cos(a) * .2, .12, Math.sin(a) * .2], [Math.cos(a) * .6, -.05, Math.sin(a) * .6], .09, .04, COL.bark, { l: L_WOOD, n: 5 }); }
  },
  grave(S, rng) {
    const T = new Soup(), w = rng.range(.44, .62), h = rng.range(.62, 1.0), c = mixC(COL.stoneD, COL.stoneL, rng()), kind = rng.int(0, 3);
    if (kind === 0) { T.box(w, h * .8, .15, 0, h * .4, 0, c, { l: L_ROCK }); T.cyl(w / 2, .15, 0, h * .8, 0, c, { n: 8, l: L_ROCK, r: [HPI, 0, 0] }); }
    else if (kind === 1) { T.box(.15, h * 1.15, .14, 0, h * .57, 0, c, { l: L_ROCK }); T.box(w * 1.1, .15, .14, 0, h * .8, 0, c, { l: L_ROCK }); }
    else if (kind === 2) { T.box(w, h * .9, .16, 0, h * .45, 0, c, { l: L_ROCK }); T.box(w * .7, .14, .16, 0, h * .95, 0, c, { l: L_ROCK }); T.box(w * 1.2, .12, .3, 0, .06, 0, mulC(c, .8), { l: L_ROCK }); }
    else { T.box(w * .9, h * .55, .15, 0, h * .27, 0, c, { l: L_ROCK }); T.box(w * .5, h * .2, .15, -w * .18, h * .62, 0, c, { l: L_ROCK, r: [0, 0, .3] }); }
    S.merge(T, { r: [rng.range(-.2, .2), rng.range(-.3, .3), rng.range(-.16, .16)], ao: [0, .4, .55] });
    S.ico(.5, 0, .0, .62, mulC(COL.earthD, 1.1), { sc: [.75, .22, 1.25], l: L_DIRT, d: 1 });
  },
  cart(S, rng, broken) {
    const w = COL.wood, wd = COL.woodD, o = () => ({ l: L_WOOD });
    S.box(1.6, .08, .9, 0, .56, 0, w, o());
    for (const zz of [-.45, .45]) { S.box(1.6, .28, .06, 0, .74, zz, w, o()); for (const xx of [-.7, 0, .7]) S.box(.07, .4, .08, xx, .74, zz * 1.04, wd, o()); }
    S.box(.06, .28, .9, -.8, .74, 0, w, o());
    const wheel = (x, z, lean) => {
      const T = new Soup();
      T.add(gTorus(10, .13, 4), { s: .4, c: wd, l: L_WOOD }); T.cyl(.07, .14, 0, 0, 0, COL.iron, { n: 6, l: L_METAL, r: [HPI, 0, 0] });
      for (let k = 0; k < 4; k++) T.box(.74, .05, .05, 0, 0, 0, w, { l: L_WOOD, r: [0, 0, k * PI / 4] });
      S.merge(T, { p: [x, lean ? .12 : .4, z], r: [lean ? 1.35 : 0, 0, lean ? .3 : 0] });
    };
    wheel(-.25, .56, false); if (!broken) wheel(-.25, -.56, false); else wheel(.5, -1.0, true);
    S.box(.08, .08, 1.2, -.25, .4, 0, wd, o());
    for (const zz of [-.3, .3]) S.seg([.8, .54, zz], [2.0, broken ? .1 : .34, zz * 1.1], .04, .035, wd, { l: L_WOOD });
    S.ico(.26, .35, .74, .1, COL.clothT, { sc: [1.2, .7, 1], l: L_CLOTH, d: 1 }); S.ico(.24, -.05, .72, -.18, mulC(COL.clothT, .8), { sc: [1, .7, 1.2], l: L_CLOTH, d: 1 });
    PROP.barrel(S, -.5, .6, .12, .8, rng);
  },
  bones(S, rng, n = 5) {
    for (let k = 0; k < n; k++) { const a = rng() * TAU, l = rng.range(.2, .45), x = rng.range(-.4, .4), z = rng.range(-.4, .4); S.seg([x, .04, z], [x + Math.cos(a) * l, .05 + rng() * .08, z + Math.sin(a) * l], .03, .03, mulC(COL.bone, .7 + .3 * rng()), { l: L_BONE, n: 5 }); }
    if (rng() < .7) PROP.skull(S, rng.range(-.2, .2), .13, rng.range(-.2, .2), .15, rng() * TAU);
  },
  skull(S, x, y, z, r, ry) {
    const T = new Soup();
    T.sph(r, 0, 0, 0, COL.bone, { sc: [1, .95, 1.1], l: L_BONE, w: 7, h: 5 }); T.box(r * 1.1, r * .55, r * .8, 0, -r * .65, r * .32, COL.boneD, { l: L_BONE });
    for (const s of [-1, 1]) T.box(r * .42, r * .38, r * .2, s * r * .42, -r * .05, r * 1.0, COL.black, { jit: 0 });
    S.merge(T, { p: [x, y, z], ry, ao: null });
  },
  ribcage(S, rng) {
    const b = COL.bone;
    S.seg([-1.6, .5, 0], [1.6, .7, 0], .1, .08, b, { l: L_BONE });
    for (let k = 0; k < 6; k++) {
      const x = -1.3 + k * .5, s = 1 - Math.abs(k - 2.5) * .12;
      for (const side of [-1, 1]) {
        if (rng() < .15) continue;
        let p = [x, .55, 0]; const pts = [[x, .95 * s, side * .55 * s], [x + .05, 1.25 * s, side * .95 * s], [x + .1, .85 * s, side * 1.15 * s], [x + .12, .1, side * 1.05 * s]];
        for (const q of pts) { S.seg(p, q, .06, .05, mulC(b, .8 + .2 * rng()), { l: L_BONE, n: 5 }); p = q; }
      }
    }
    S.ico(.5, 2.15, .55, 0, b, { sc: [1.35, .8, .85], l: L_BONE, d: 1 }); S.ico(.3, 2.85, .4, 0, COL.boneD, { sc: [1.3, .6, .7], l: L_BONE, d: 1 });
    for (const side of [-1, 1]) { S.seg([2.0, .8, side * .3], [1.7, 1.4, side * .75], .1, .02, b, { l: L_BONE, n: 5 }); S.box(.2, .16, .08, 2.3, .62, side * .4, COL.black, { jit: 0 }); }
  },
  web(S, a, b, c) {
    const col = mulC(COL.stoneL, 1.5), th = .011;
    const lerp3 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
    for (let k = 0; k <= 4; k++) S.seg(a, lerp3(b, c, k / 4), th, th, col, { n: 3, emis: .015, jit: 0, sway: .25 });
    for (let r = 1; r <= 3; r++) for (let k = 0; k < 4; k++) S.seg(lerp3(a, lerp3(b, c, k / 4), r / 3.3), lerp3(a, lerp3(b, c, (k + 1) / 4), r / 3.3 - .04), th, th, col, { n: 3, emis: .015, jit: 0, sway: .25 });
  },
  banner(S, rng, col, h = 2.8) {
    S.seg([0, 0, 0], [0, h, 0], .055, .04, COL.woodD, { l: L_WOOD }); S.seg([-.08, h - .2, 0], [.82, h - .2, 0], .03, .03, COL.woodD, { l: L_WOOD, n: 5 });
    S.cone(.07, .2, 0, h + .1, 0, COL.iron, { n: 4, l: L_METAL });
    clothPanel(S, { x0: .04, x1: .78, yTop: h - .23, len: 1.45, z: 0, col, col2: mulC(COL.gold, .6), rng });
  },
  fence(S, rng, len) {
    const nP = Math.max(2, Math.round(len) + 1);
    for (let k = 0; k < nP; k++) {
      const x = -len / 2 + k * len / (nP - 1), lean = rng.range(-.14, .14), hh = rng.range(.72, .95);
      S.box(.1, hh, .1, x, hh / 2, 0, mulC(COL.wood, .7 + .3 * rng()), { l: L_WOOD, r: [lean, 0, rng.range(-.12, .12)] });
      if (k < nP - 1) for (const y of [.36, .68]) { if (rng() < .22) continue; const drop = rng() < .15 ? -.3 : 0; S.seg([x, y, 0], [x + len / (nP - 1), y + drop + rng.range(-.04, .04), 0], .035, .035, mulC(COL.woodL, .7 + .3 * rng()), { l: L_WOOD, n: 4 }); }
    }
  },
  palisade(S, rng, len) {
    for (let x = -len / 2; x < len / 2; x += .27) {
      if (rng() < .1) continue;
      const hh = rng.range(1.25, 1.75), lean = [rng.range(-.1, .1), 0, rng.range(-.12, .12)], c = mulC(COL.wood, .65 + .35 * rng()), T = new Soup();
      T.cyl(.12, hh, 0, hh / 2, 0, c, { n: 6, l: L_WOOD }); T.cone(.12, .3, 0, hh + .15, 0, mulC(c, 1.15), { n: 6, l: L_WOOD });
      S.merge(T, { p: [x, -.1, rng.range(-.04, .04)], r: lean, ao: [0, .5, .6] });
    }
    S.box(len, .09, .07, 0, .95, .13, COL.woodD, { l: L_WOOD });
  },
  well(S, rng) {
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; S.box(.44, .56, .26, Math.cos(a) * .68, .28, Math.sin(a) * .68, mixC(COL.stoneD, COL.stoneL, rng()), { l: L_MASON, r: [0, -a + HPI, 0] }); }
    S.cyl(.6, .06, 0, .3, 0, COL.black, { n: 10, jit: 0 });
    for (const s of [-1, 1]) S.box(.1, 1.7, .1, s * .72, .85, 0, COL.woodD, { l: L_WOOD });
    S.seg([-.8, 1.45, 0], [.8, 1.45, 0], .05, .05, COL.wood, { l: L_WOOD });
    for (const s of [-1, 1]) S.box(1.75, .05, .62, 0, 1.86, s * .26, COL.slate, { l: L_SLATE, r: [s * .62, 0, 0] });
    S.seg([.15, 1.45, 0], [.15, .75, 0], .012, .012, COL.rope, { n: 3 }); S.cyl(.12, .2, .15, .68, 0, COL.wood, { n: 7, l: L_WOOD, rt: 1.2 });
  },
  wallRun(S, rng, len, hMax) {
    let x = -len / 2, k = 0, h = hMax * rng.range(.5, 1);
    while (x < len / 2) {
      const w = rng.range(.9, 1.4); h = clamp(h + rng.range(-1.1, .7), .5, hMax);
      const edge = Math.min(1, (len / 2 - Math.abs(x + w / 2)) / 1.4 + .25), hh = h * edge, c = mixC(COL.stoneD, COL.stone, rng());
      S.box(w, hh, .62, x + w / 2, hh / 2, 0, c, { l: L_MASON });
      for (let j = 0; j < 3; j++) if (rng() < .6) S.box(w * rng.range(.25, .45), rng.range(.2, .5), .62, x + w * (.2 + j * .3), hh + .15, 0, mixC(COL.stoneD, COL.stoneL, rng()), { l: L_MASON });
      if (hh > 2.2 && rng() < .5) S.box(.3, .8, .7, x + w / 2, hh * .62, 0, COL.black, { jit: 0 });
      if (rng() < .5) S.rock(rng.range(.2, .4), x + rng.range(0, w), .1, rng.sign() * rng.range(.5, .9), mixC(COL.stoneD, COL.stone, rng()));
      x += w; k++;
    }
    S.box(len * .9, .22, .86, 0, .08, 0, COL.stoneD, { l: L_MASON });
  },
  towerRuin(S, rng) {
    const R = 1.35, n = 10, hs = [];
    for (let k = 0; k < n; k++) hs.push(clamp(4.4 - k * .42 + rng.range(-.4, .4), .7, 4.6));
    S.cyl(R + .35, .4, 0, .2, 0, COL.stoneD, { n: 10, l: L_MASON });
    for (let k = 0; k < n; k++) {
      if (k === n - 1) continue;
      const a = k / n * TAU, c = mixC(COL.stoneD, COL.stone, rng());
      S.box(.92, hs[k], .42, Math.cos(a) * R, hs[k] / 2 + .3, Math.sin(a) * R, c, { l: L_MASON, r: [0, -a + HPI, 0] });
      if (rng() < .7) S.box(.4, rng.range(.2, .5), .42, Math.cos(a + .1) * R, hs[k] + .5, Math.sin(a + .1) * R, mixC(COL.stoneD, COL.stoneL, rng()), { l: L_MASON, r: [0, -a + HPI, 0] });
      if (hs[k] > 2.6 && (k & 1)) S.box(.2, .6, .5, Math.cos(a) * R, hs[k] * .65, Math.sin(a) * R, COL.black, { jit: 0, r: [0, -a + HPI, 0] });
    }
    for (let k = 0; k < 3; k++) { const a = rng() * TAU; S.seg([Math.cos(a) * R, 2.1, Math.sin(a) * R], [Math.cos(a + 2.4) * R * .6, 2.0 - rng() * .8, Math.sin(a + 2.4) * R * .6], .07, .06, COL.woodD, { l: L_WOOD, n: 4 }); }
    for (let k = 0; k < 7; k++) { const a = rng() * TAU, d = rng.range(1.9, 3.0); S.box(rng.range(.3, .6), rng.range(.2, .4), rng.range(.3, .5), Math.cos(a) * d, .12, Math.sin(a) * d, mixC(COL.stoneD, COL.stone, rng()), { l: L_MASON, r: [rng() * .5, rng() * 3, rng() * .5] }); }
  },
  signpost(S, rng) {
    S.box(.1, 1.7, .1, 0, .85, 0, COL.woodD, { l: L_WOOD, r: [0, 0, .06] });
    S.box(.8, .2, .05, .28, 1.45, .06, COL.woodL, { l: L_WOOD, r: [0, .2, -.08] }); S.box(.7, .18, .05, -.22, 1.15, .06, COL.wood, { l: L_WOOD, r: [0, -.25, .1] });
  },
  gibbet(S, rng) {
    S.box(.16, 3.0, .16, 0, 1.5, 0, COL.woodD, { l: L_WOOD }); S.box(1.2, .13, .13, .5, 2.9, 0, COL.woodD, { l: L_WOOD }); S.seg([0, 2.2, 0], [.6, 2.85, 0], .05, .05, COL.wood, { l: L_WOOD, n: 4 });
    S.seg([.95, 2.85, 0], [.95, 2.3, 0], .015, .015, COL.iron, { n: 3 });
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; S.seg([.95 + Math.cos(a) * .2, 2.3, Math.sin(a) * .2], [.95 + Math.cos(a) * .2, 1.5, Math.sin(a) * .2], .014, .014, COL.iron, { n: 3, l: L_METAL, sway: .12 }); }
    for (const y of [2.3, 1.9, 1.5]) S.add(gTorus(8, .08, 3), { s: .2, p: [.95, y, 0], r: [HPI, 0, 0], c: COL.iron, l: L_METAL, sway: .12 });
    PROP.skull(S, .95, 1.72, 0, .11, 1);
  },
  cairn(S, rng) { let y = 0, r = rng.range(.3, .42); for (let k = 0; k < 4; k++) { S.rock(r, rng.range(-.05, .05), y + r * .45, rng.range(-.05, .05), mixC(COL.stoneD, COL.stoneL, rng()), { sq: .6 }); y += r * .72; r *= .74; } },
  statue(S, rng) {
    const c = COL.stone, m = () => ({ l: L_ROCK });
    S.box(1.1, .6, 1.1, 0, .3, 0, COL.stoneD, { l: L_MASON }); S.box(.9, .15, .9, 0, .67, 0, COL.stoneL, { l: L_MASON });
    for (const s of [-1, 1]) S.box(.2, .75, .22, s * .16, 1.1, 0, c, m());
    S.box(.62, .7, .34, 0, 1.8, 0, c, m()); S.box(.2, .7, .2, -.42, 1.75, .05, c, { l: L_ROCK, r: [.2, 0, .15] });
    S.box(.2, .35, .2, .42, 1.95, 0, c, m()); S.box(.1, 1.3, .08, -.5, 1.25, .2, COL.stoneL, m());
    S.rock(.2, .7, .1, .5, c); S.rock(.16, .5, .08, .75, c);
  },
  tuft(S, rng) {
    const c = mulC(mixC(COL.tuftA, COL.tuftB, rng() * .6), .8 + .5 * rng());
    for (let k = 0; k < rng.int(3, 5); k++) {
      const a = rng() * TAU, l = rng.range(.22, .42), bx = Math.cos(a) * .06, bz = Math.sin(a) * .06, tx = Math.cos(a) * l * .5, tz = Math.sin(a) * l * .5, w = .035;
      const A = [bx - Math.sin(a) * w, 0, bz + Math.cos(a) * w], Bp = [bx + Math.sin(a) * w, 0, bz - Math.cos(a) * w], T = [tx, l, tz];
      for (const [p, sw] of [[A, 0], [Bp, 0], [T, .7], [A, 0], [T, .7], [Bp, 0]]) S.v(p[0], p[1], p[2], 0, 1, 0, c[0], c[1], c[2], 0, 0, L_PLAIN, 1, sw, 0);
    }
  },
};

function buildBridge(B) {
  const i = B.ci0, x = B.px[i], z = B.pz[i], ang = Math.atan2(B.tz[i], B.tx[i]), rng = B.rng, T = new Soup();
  const y0 = B.py[i], bed = B.wlc - .5 - y0, spring = B.wlc + .08 - y0, wHalf = ROAD_HALF + .34, A = 1.3;
  const yd = u => B.py[clamp(Math.round(i + u / PATH_STEP), 0, B.n - 1)] - y0;
  const crown = yd(0) - .34;
  const yArch = u => spring + (crown - spring) * Math.sqrt(Math.max(0, 1 - (u / A) * (u / A)));
  const mc = () => mixC(COL.stoneD, COL.stoneL, rng());
  for (let k = -5; k < 5; k++) {
    const u = (k + .5) * .62, top = yd(u);
    T.box(.63, .26, wHalf * 2 - .1, u, top - .16, 0, COL.stoneD, { l: L_MASON });
    for (const side of [-1, 1]) {
      const zz = side * wHalf;
      T.box(.63, .52, .3, u, top + .22, zz, mc(), { l: L_MASON });
      if (k % 2 === 0) T.box(.3, .14, .36, u, top + .55, zz, mc(), { l: L_MASON });
      const bot = Math.abs(u) < A ? yArch(u) : bed - .3;
      if (top - .05 - bot > .04) T.box(.63, top - .05 - bot, .3, u, (top - .05 + bot) / 2, zz, mc(), { l: L_MASON });
    }
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 8; k++) { const th = PI * k / 8, u = Math.cos(th) * A; T.box(.42, .22, .38, u, spring + (crown - spring) * Math.sin(th) - .05, side * wHalf, COL.stoneL, { l: L_MASON, r: [0, 0, th - HPI] }); }
    for (const u of [-3.25, 3.25]) { const t = yd(u); T.box(.5, 1.25, .5, u, t + .3, side * wHalf, mc(), { l: L_MASON }); T.box(.62, .13, .62, u, t + .98, side * wHalf, COL.stoneL, { l: L_MASON }); T.cone(.2, .25, u, t + 1.15, side * wHalf, COL.stoneD, { n: 4, l: L_ROCK }); }
  }
  if (B.bio.key === 'frost') for (const side of [-1, 1]) for (let u = -1.15; u <= 1.16; u += .21) { const h = rng.range(.12, .55); T.cone(.04 + .03 * rng(), h, u, yArch(u) - h / 2 - .04, side * (wHalf + .03), COL.ice, { n: 5, r: [PI, 0, 0], rough: .14, emis: .012 }); }
  B.put(T, x, z, { y: y0, ry: -ang, ao: null });
  B.bridge = { x, z, y: y0 };
}

function buildPads(B) {
  for (const p of B.pads) {
    const T = new Soup(), rng = B.rng;
    T.cyl(1.36, .34, 0, .12, 0, mulC(COL.stoneD, .8), { n: 8, l: L_MASON, r: [0, PI / 8, 0] });
    T.cyl(1.16, .05, 0, .3, 0, mulC(COL.stoneD, 1.05), { n: 8, l: L_MASON, r: [0, PI / 8, 0] });
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; T.box(.46, .2, .28, Math.cos(a) * 1.34, .1 + rng() * .06, Math.sin(a) * 1.34, mixC(COL.stoneD, COL.stone, rng() * .6), { l: L_ROCK, r: [rng.range(-.1, .1), -a + HPI, 0] }); }
    B.put(T, p.x, p.z, { y: p.y0, ry: rng() * TAU, ao: [0, .3, .7] });
  }
}

function buildKeep(B) {
  const rng = B.rng, kx = B.kx, ky = B.keepY, oz = -12.35;
  const TG = new Soup(), TT = new Soup();
  const st = COL.stone, sdk = COL.stoneD, sl = COL.stoneL;
  const mc = () => mixC(sdk, sl, rng() * .8 + .1);
  const mas = (S, w, h, d, x, y, z, c, o = {}) => S.box(w, h, d, x, y, z, c || mc(), Object.assign({ l: L_MASON }, o));
  mas(TG, 10.6, .5, 6.0, 0, -.2, -2.9, sdk);
  for (let k = 0; k < 9; k++) mas(TG, 1.1, .16, .55, -4.4 + k * 1.1, .1, .25, mc());
  const tower = (x, z, w, h, broken) => {
    mas(TG, w + .34, .6, w + .34, x, .3, z, sdk); mas(TG, w, h, w, x, h / 2, z, st, { jit: .03 });
    for (let c = 0; c < 4; c++) mas(TG, w + .04, .22, w + .04, x, .9 + c * (h - 1.2) / 3.2, z, mc());
    mas(TG, w + .36, .3, w + .36, x, h + .12, z, sl);
    for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) { if (broken && rng() < .55) continue; mas(TG, .42, broken ? rng.range(.2, .5) : .48, .42, x + dx * (w / 2 - .05), h + .5, z + dz * (w / 2 - .05)); }
    TG.box(.14, .8, .1, x, h * .62, z + w / 2 + .01, COL.black, { jit: 0 }); TG.box(.1, .8, .14, x + w / 2 + .01, h * .5, z, COL.black, { jit: 0 });
    if (broken) for (let k = 0; k < 3; k++) TG.rock(rng.range(.22, .4), x + rng.range(-1.2, 1.4), .15, z + rng.range(.9, 1.6), mc());
  };
  tower(2.3, -.75, 1.95, 3.9, true);
  mas(TG, 2.7, 1.25, 1.3, 0, 3.2, -.75, st);
  for (let k = 0; k <= 8; k++) { const th = PI * k / 8; mas(TG, .4, .3, 1.4, Math.cos(th) * 1.12, 1.5 + Math.sin(th) * 1.12, -.75, sl, { r: [0, 0, th - HPI] }); }
  for (const s of [-1, 1]) { mas(TG, .5, .9, 1.3, s * 1.12, 2.3, -.75, st); mas(TG, .3, 1.5, 1.34, s * 1.2, .75, -.75, sl); }
  TG.box(2.2, 2.7, .2, 0, 1.35, -1.3, COL.black, { jit: 0 }); TG.box(2.2, .2, 1.2, 0, 2.75, -.8, COL.black, { jit: 0 });
  for (const bx of [-.8, -.4, 0, .4, .8]) { TG.box(.07, .95, .07, bx, 2.15, -.3, COL.iron, { l: L_METAL }); TG.cone(.06, .16, bx, 1.6, -.3, COL.iron, { n: 4, l: L_METAL, r: [PI, 0, 0] }); }
  for (const by of [1.95, 2.4]) TG.box(2.0, .07, .07, 0, by, -.3, COL.iron, { l: L_METAL });
  for (const bx of [-1.02, -.34, .34, 1.02]) mas(TG, .42, .44, .42, bx, 4.05, -.3);
  mas(TG, 2.9, .2, 1.5, 0, 3.9, -.75, sl);
  const run = (x0, dir, hs) => hs.forEach((h, k) => {
    const x = x0 + dir * (k + .5) * 1.35; mas(TG, 1.35, h, .95, x, h / 2, -.95, k & 1 ? st : mc());
    if (h > 2.4) { mas(TG, 1.45, .2, 1.1, x, h + .1, -.95, sl); for (const dx of [-.4, .4]) mas(TG, .4, .42, .3, x + dx, h + .4, -.55); }
    else for (let j = 0; j < 3; j++) if (rng() < .7) mas(TG, rng.range(.3, .55), rng.range(.2, .6), .9, x + rng.range(-.4, .4), h + .15, -.95);
    if (h < 1.6) for (let j = 0; j < 3; j++) TG.rock(rng.range(.2, .42), x + rng.range(-.7, .7), .12, rng.range(-.2, .9) - .5, mc());
  });
  run(-3.3, -1, [3.1, 3.1, 2.3, 1.3, .6]); run(3.3, 1, [3.0, 2.0, 1.1]);
  for (let k = 0; k < 5; k++) { const h = [3.4, 2.4, 3.6, 1.6, 2.8][k], x = -4.7 + k * 1.3; mas(TG, 1.3, h, .7, x, h / 2, -5.3); if (h > 3) TG.box(.36, 1.0, .74, x, h * .62, -5.3, COL.black, { jit: 0 }); }
  mas(TG, .7, 2.6, 3.4, -5.0, 1.3, -3.4); mas(TG, .7, 1.2, 1.0, -5.0, .6, -1.5);
  for (let k = 0; k < 4; k++) TG.seg([-4.6, 2.5 - k * .12, -4.9 + k * .7], [-1.6 + rng() * .8, 1.2 + rng(), -4.6 + k * .7], .08, .07, COL.woodD, { l: L_WOOD, n: 4 });
  PROP.barrel(TG, -3.6, .05, -2.2, 1.1, rng); PROP.barrel(TG, -3.1, .05, -2.6, 1, rng); PROP.crate(TG, -3.9, .05, -3.2, .55, rng, .4);
  clothPanel(TG, { x0: 1.85, x1: 2.75, yTop: 3.2, len: 1.6, z: .25, col: COL.clothR, col2: mulC(COL.gold, .6), rng, sway: .5, rag: .7 });
  for (const s of [-1, 1]) { TG.seg([s * 1.32, 1.9, -.08], [s * 1.32, 2.1, .32], .035, .03, COL.iron, { l: L_METAL, n: 4 }); TG.cyl(.09, .14, s * 1.32, 2.14, .34, COL.iron, { n: 6, l: L_METAL, rt: 1.4 }); B.fires.push({ x: kx + s * 1.32, y: ky + 2.3, z: oz + .34, size: .42, type: 'sconce' }); }
  TG.cyl(1.5, 2.4, 2.4, 1.2, -4.2, sdk, { n: 8, l: L_MASON, rt: .92 });
  for (let k = 0; k < 8; k++) { const a = (k + .5) / 8 * TAU, h = rng.range(.2, 1.3); if (rng() < .3) continue; mas(TG, .9, h, .4, 2.4 + Math.cos(a) * 1.2, 2.4 + h / 2, -4.2 + Math.sin(a) * 1.2, null, { r: [0, -a + HPI, 0] }); }
  const bx = -2.6, bz = -.95, bh = 7.3;
  TT.cyl(1.9, 1.3, bx, .65, bz, sdk, { n: 8, l: L_MASON, rt: .84 });
  TT.cyl(1.52, bh, bx, bh / 2, bz, st, { n: 8, l: L_MASON, rt: .9, jit: .03 });
  for (let c = 0; c < 6; c++) TT.cyl(1.54 - c * .027, .2, bx, 1.7 + c * 1.0, bz, mc(), { n: 8, l: L_MASON });
  TT.cyl(1.42, .55, bx, bh - .15, bz, sl, { n: 8, l: L_MASON, rt: 1.26 });
  TT.cyl(1.82, .22, bx, bh + .22, bz, st, { n: 8, l: L_MASON });
  for (let k = 0; k < 8; k++) { const a = (k + .5) / 8 * TAU; if (k === 1) continue; mas(TT, .6, .5, .32, bx + Math.cos(a) * 1.6, bh + .58, bz + Math.sin(a) * 1.6, null, { r: [0, -a + HPI, 0] }); }
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4; TT.box(.12, .9, .12, bx + Math.cos(a) * 1.45, bh * (.4 + (k & 1) * .22), bz + Math.sin(a) * 1.45, COL.black, { jit: 0, r: [0, -a, 0] }); }
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + .2; TT.seg([bx + Math.cos(a) * 1.4, bh - .55, bz + Math.sin(a) * 1.4], [bx + Math.cos(a) * 2.2, bh - .4, bz + Math.sin(a) * 2.2], .07, .06, COL.woodD, { l: L_WOOD, n: 4 }); }
  TT.cyl(.6, .55, bx, bh + .6, bz, sdk, { n: 8, l: L_MASON });
  TT.cyl(.72, .4, bx, bh + 1.06, bz, COL.iron, { n: 8, l: L_METAL, rt: 1.4, rough: .7 });
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .5; TT.seg([bx + Math.cos(a) * .72, bh + .35, bz + Math.sin(a) * .72], [bx + Math.cos(a) * .96, bh + 1.22, bz + Math.sin(a) * .96], .04, .04, COL.iron, { l: L_METAL, n: 4 }); }
  TT.cyl(.9, .1, bx, bh + 1.24, bz, COL.ember, { n: 8, emis: .5, jit: 0 });
  for (let k = 0; k < 4; k++) { const a = k * 1.3; TT.seg([bx + Math.cos(a) * .7, bh + 1.28, bz + Math.sin(a) * .7], [bx - Math.cos(a) * .6, bh + 1.48, bz - Math.sin(a) * .6], .1, .09, mulC(COL.bark, .7), { l: L_WOOD, n: 5, emis: .05 }); }
  clothPanel(TT, { x0: bx - .45, x1: bx + .45, yTop: 5.2, len: 2.3, z: bz + 1.5, col: COL.clothR, col2: mulC(COL.gold, .6), rng, sway: .45 });
  B.structs.push({ soup: new Soup().merge(TG, { p: [kx, ky, oz], ao: [0, .9, .7] }), cx: kx, cy: ky, cz: oz - 2.5, kind: 'keep' });
  B.structs.push({ soup: new Soup().merge(TT, { p: [kx, ky, oz], ao: [0, 1.4, .65] }), cx: kx + bx, cy: ky, cz: oz + bz, kind: 'beaconTower' });
  B.beacon = { x: kx + bx, y: ky + bh + 1.45, z: oz + bz };
  B.gate = { x: kx, y: ky, z: -11.4 };
}

function buildCave(B) {
  const rng = B.rng, zc = B.zc, T = new Soup(), D = new Soup();
  let i0 = 0; for (let i = 0; i < B.n; i++) if (B.px[i] >= -14.6) { i0 = i; break; }
  const y0 = B.py[i0], ox = -14.5;
  const rk = (r, x, y, z, o = {}) => T.rock(r, x, y, z, mixC(COL.stoneD, COL.stone, rng() * .7), o);
  for (const s of [-1, 1]) { rk(1.3, .1, .65, s * 2.45); rk(1.1, .2, 1.9, s * 2.3); rk(.95, .2, 2.95, s * 1.95); rk(.62, 1.0, .3, s * 2.15); rk(.45, 1.5, .2, s * 1.95); }
  rk(1.35, .15, 3.65, 0, { sq: .55 }); rk(1.05, .25, 3.55, -1.05, { sq: .6 }); rk(1.05, .25, 3.55, 1.05, { sq: .6 });
  for (let k = 0; k < 4; k++) rk(2.3, -1.2 - k * .85, 4.3 + k * .3, rng.range(-.6, .6), { sq: .58 });
  for (const zz of [-1.25, -.75, -.2, .35, .9, 1.3]) T.cone(.15 + rng() * .06, .45 + rng() * .5, .3 + rng() * .2, 2.85, zz, mulC(COL.stoneL, .9), { n: 5, l: L_ROCK, r: [PI, 0, 0] });
  if (B.bio.key === 'frost') for (let zz = -1.4; zz <= 1.41; zz += .2) { const h = rng.range(.2, .75); T.cone(.045 + .03 * rng(), h, .62 + rng() * .1, 2.9 - h / 2, zz, COL.ice, { n: 5, r: [PI, 0, 0], rough: .14, emis: .012 }); }
  T.box(3.8, .2, 3.7, -1.9, 3.05, 0, COL.black, { jit: 0 }); T.box(.2, 3.4, 3.7, -3.45, 1.5, 0, COL.black, { jit: 0 });
  for (const s of [-1, 1]) T.box(3.8, 3.2, .2, -1.9, 1.5, s * 1.82, mulC(COL.stoneD, .25), { l: L_ROCK, jit: 0 });
  for (const s of [-1, 1]) { T.seg([1.7, 0, s * 2.5], [1.78, 1.6, s * 2.55], .055, .035, COL.woodD, { l: L_WOOD }); PROP.skull(T, 1.78, 1.72, s * 2.55, .17, s * .5 + 1.2); }
  const Bn = new Soup(); PROP.bones(Bn, rng, 6); T.merge(Bn, { p: [2.2, .02, 2.2], ao: null }); const Bn2 = new Soup(); PROP.bones(Bn2, rng, 5); T.merge(Bn2, { p: [2.6, .02, -2.3], ao: null });
  for (const xx of [-.35, -.95, -1.55, -2.2, -2.85]) D.quad([xx, 0, 1.8], [xx, 0, -1.8], [xx, 3.0, -1.8], [xx, 3.0, 1.8], WHITE, L_PLAIN, 1);
  B.structs.push({ soup: new Soup().merge(T, { p: [ox, y0, zc], ao: null }), cx: ox - 1.2, cy: y0, cz: zc, kind: 'cave', extras: [{ soup: new Soup().merge(D, { p: [ox, y0, zc], ao: null }), mat: MAT.dark, order: 2 }] });
  B.cave = { x: ox, y: y0, z: zc, s: Math.max(.6, (i0 - 5) * PATH_STEP) };
}

function scatterProps(B) {
  const rng = B.rng, placed = [], H = B.heightAt;
  const free = (x, z, r, roadMin = .6) => {
    if (Math.abs(x) > BH - .7 - r || Math.abs(z) > BH - .7 - r) return false;
    if (B.dRoadAt(x, z) < ROAD_HALF + roadMin + r) return false;
    if (B.dStrAt(x, z) < 1.5 + r) return false;
    for (const p of B.pads) if (dist2(x, z, p.x, p.z) < (2.15 + r) * (2.15 + r)) return false;
    if (Math.abs(x - B.kx) < 5.7 + r && z < -11.2 + r) return false;
    if (x < -12.4 && Math.abs(z - B.zc) < 3.4 + r) return false;
    for (const q of B.ponds) if (dist2(x, z, q.x, q.z) < (q.r * 1.25 + .9 + r) * (q.r * 1.25 + .9 + r)) return false;
    for (const q of placed) if (dist2(x, z, q[0], q[1]) < (q[2] + r) * (q[2] + r)) return false;
    return true;
  };
  const waterD = (x, z) => { let d = B.dStrAt(x, z); for (const q of B.ponds) d = Math.min(d, Math.hypot(x - q.x, z - q.z) - q.r); return d; };
  const slope = (x, z) => Math.abs(H(x + .5, z) - H(x - .5, z)) + Math.abs(H(x, z + .5) - H(x, z - .5));
  const find = (r, o = {}) => {
    for (let t = 0; t < 90; t++) {
      const x = rng.range(-BH + 1, BH - 1), z = rng.range(-BH + 1, BH - 1);
      if (!free(x, z, r, o.roadMin)) continue;
      if (!o.steep && slope(x, z) > (o.maxSlope || .32)) continue;
      const dr = B.dRoadAt(x, z); if (o.near && dr > o.near) continue; if (o.far && dr < o.far) continue;
      if (o.water && waterD(x, z) > o.water) continue;
      return [x, z];
    }
    return null;
  };
  const drop = (build, r, o = {}) => { const p = o.at || find(r, o); if (!p) return null; const T = new Soup(); build(T); B.put(T, p[0], p[1], { ry: o.ry === undefined ? rng() * TAU : o.ry, s: o.s, r: o.r, dy: o.dy, ao: o.ao }); placed.push([p[0], p[1], r]); return p; };
  const beside = (smin, smax, d, r) => {
    for (let t = 0; t < 40; t++) {
      const i = clamp(Math.round(rng.range(smin, smax) / PATH_STEP), 2, B.n - 3), side = rng.sign();
      const x = B.px[i] - B.tz[i] * side * (ROAD_HALF + d), z = B.pz[i] + B.tx[i] * side * (ROAD_HALF + d);
      if (free(x, z, r, d - r - .05) && slope(x, z) < .4) return [x, z, Math.atan2(B.tz[i], B.tx[i]), side];
    }
    return null;
  };
  const bio = B.bio;
  const at = (x, z, build, r, T0) => { if (Math.abs(x) > BH - .8 || Math.abs(z) > BH - .8) return; const T = T0 || new Soup(); if (!T0) build(T); B.put(T, x, z, { ry: rng() * TAU }); if (r) placed.push([x, z, r]); };
  drop(T => PROP.towerRuin(T, rng), 2.9, { far: 3.6 });
  drop(T => PROP.well(T, rng), 1.3, { near: 5.5, far: 2.6 });
  drop(T => PROP.statue(T, rng), 1.2, { near: 6, far: 2.4 });
  drop(T => PROP.ribcage(T, rng), 2.4, { far: 2.8 });
  for (let k = 0; k < 3; k++) { const len = rng.range(4, 7); drop(T => PROP.wallRun(T, rng, len, rng.range(1.8, 3.2)), len * .5, { far: 1.6 }); }
  { const g = find(3.2, { far: 3.4 }); if (g) {
      const ry = rng() * TAU, cs = Math.cos(ry), sn = Math.sin(ry);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { if (rng() < .2) continue; const lx = (c - 1.5) * 1.15 + rng.range(-.15, .15), lz = (r - 1) * 1.5 + rng.range(-.15, .15), T = new Soup(); PROP.grave(T, rng); B.put(T, g[0] + lx * cs + lz * sn, g[1] - lx * sn + lz * cs, { ry: ry + rng.range(-.2, .2) }); }
      for (const [lx, lz, a, len] of [[0, -2.5, 0, 4.6], [-2.8, -.2, HPI, 4.2], [2.8, .5, HPI, 3]]) { const T = new Soup(); PROP.fence(T, rng, len); B.put(T, g[0] + lx * cs + lz * sn, g[1] - lx * sn + lz * cs, { ry: ry + a }); }
      const T = new Soup(); PROP.tree(T, rng, 3.6); B.put(T, g[0] + 2.3 * cs - 2.0 * sn, g[1] - 2.3 * sn - 2.0 * cs, {});
      placed.push([g[0], g[1], 3.2]);
    } }
  for (let k = 0; k < 2; k++) { const p = beside(10, B.L - 8, 1.25, 1.1); if (p) drop(T => PROP.cart(T, rng, k === 1), 1.1, { at: p, ry: -p[2] + rng.range(-.3, .3), r: k === 1 ? [0, -p[2] + .4, .22] : undefined }); }
  for (let k = 0; k < 4; k++) { const p = beside(8, B.L - 6, .75, .3); if (p) { const len = rng.range(2.6, 4.2); drop(T => PROP.palisade(T, rng, len), 1.0, { at: p, ry: -p[2] }); } }
  for (let k = 0; k < 4; k++) { const p = beside(8, B.L - 6, 1.0, .4); if (p) { const len = rng.range(2.5, 4.5); drop(T => PROP.fence(T, rng, len), 1.2, { at: p, ry: -p[2] + rng.range(-.15, .15) }); } }
  for (let k = 0; k < 4; k++) { const p = beside(8, B.L - 5, .8, .25); if (p) drop(T => PROP.banner(T, rng, k & 1 ? COL.clothR : COL.clothB), .3, { at: p, ry: -p[2] + HPI * p[3] }); }
  { const p = beside(B.L * .3, B.L * .7, .8, .3); if (p) drop(T => PROP.signpost(T, rng), .3, { at: p, ry: -p[2] }); }
  { const p = beside(12, B.L * .6, 1.3, .6); if (p) drop(T => PROP.gibbet(T, rng), .6, { at: p, ry: -p[2] + HPI }); }
  for (const pad of B.pads) {
    if (rng() < .35) continue;
    const a = rng() * TAU, x = pad.x + Math.cos(a) * 2.25, z = pad.z + Math.sin(a) * 2.25;
    if (B.dRoadAt(x, z) < ROAD_HALF + .7 || B.dStrAt(x, z) < 1.8) continue;
    const T = new Soup(); PROP.barrel(T, 0, 0, 0, 1, rng); if (rng() < .6) PROP.barrel(T, .5, 0, .15, .9, rng); if (rng() < .7) PROP.crate(T, -.1, 0, .55, .5, rng, rng()); if (rng() < .4) PROP.crate(T, -.12, .5, .55, .38, rng, rng());
    B.put(T, x, z, { ry: rng() * TAU }); placed.push([x, z, .8]);
  }
  for (let k = 0; k < 6; k++) { const x = B.lay.cave.x + rng.range(1.8, 7), z = B.zc + rng.sign() * rng.range(1.9, 5); if (free(x, z, .4, .2)) drop(T => PROP.bones(T, rng, rng.int(4, 7)), .5, { at: [x, z], ao: null }); }
  for (let k = 0; k < 5; k++) drop(T => PROP.bones(T, rng, rng.int(3, 5)), .45, { ao: null });
  for (let k = 0; k < 3; k++) drop(T => PROP.cairn(T, rng), .5, {});
  BIOME_DRESS[bio.key]({ B, rng, drop, find, beside, free, at, H, placed, slope });
  const trees = [];
  for (const [kind, cnt, h0, h1] of bio.trees) for (let k = 0; k < cnt; k++) { const h = rng.range(h0, h1), p = drop(T => PROP[kind](T, rng, h), kind === 'tree' || kind === 'charred' ? .55 : .8, { far: 1.0, water: kind === 'palm' && k < 6 ? 5.5 : 0 }); if (p && kind === 'tree') trees.push([p, h]); }
  for (let k = 0; k < bio.webs && k < trees.length; k++) {
    const [p, h] = trees[k], y = H(p[0], p[1]), a = rng() * TAU, T = new Soup();
    PROP.web(T, [0, h * .42, 0], [Math.cos(a) * .9, h * .55, Math.sin(a) * .9], [Math.cos(a) * .7, h * .18, Math.sin(a) * .7]);
    B.put(T, p[0], p[1], { y, ao: null });
  }
  for (let k = 0; k < bio.stumps; k++) drop(T => PROP.stump(T, rng), .4, {});
  for (let k = 0; k < bio.rocks; k++) { const r = rng() < .2 ? rng.range(.6, 1.25) : rng.range(.16, .5); drop(T => T.rock(r, 0, r * .28, 0, mixC(COL.stoneD, COL.stone, rng())), r * .8, { steep: true, roadMin: .25, ao: [0, r * .6, .6] }); }
  for (let k = 0; k < bio.tufts; k++) {
    const x = rng.range(-BH + .8, BH - .8), z = rng.range(-BH + .8, BH - .8);
    if (B.dRoadAt(x, z) < ROAD_HALF + .35 || waterD(x, z) < 1.1 || slope(x, z) > .5) continue;
    if (Math.abs(x - B.kx) < 5.4 && z < -11.6) continue;
    const T = new Soup(); PROP.tuft(T, rng); B.put(T, x, z, { ao: null, s: rng.range(.8, 1.5) });
  }
  for (let k = 0; k < 60; k++) {
    const i = rng.int(16, B.n - 12), side = rng.sign(), d = ROAD_HALF + rng.range(.1, .45), x = B.px[i] - B.tz[i] * side * d, z = B.pz[i] + B.tx[i] * side * d;
    if (B.dStrAt(x, z) < 2.4) continue;
    const r = rng.range(.08, .17), T = new Soup(); T.rock(r, 0, r * .3, 0, mixC(COL.roadD, COL.stone, rng())); B.put(T, x, z, { ao: null });
  }
}


// 33-flora.js

function ribbon(S, a, b, c, d, col, sw) {
  _sa.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _sb.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]); _sn.crossVectors(_sa, _sb);
  const l = _sn.length() || 1, nx = _sn.x / l, ny = _sn.y / l, nz = _sn.z / l, P = [a, b, c, d];
  for (const [order, s] of [[[0, 1, 2, 0, 2, 3], 1], [[0, 2, 1, 0, 3, 2], -1]]) for (const k of order) { const p = P[k]; S.v(p[0], p[1], p[2], nx * s, ny * s, nz * s, col[0], col[1], col[2], p[0] * .5, p[1] * .5, L_PLAIN, .8, sw[k], 0); }
}

Object.assign(PROP, {
  pine(S, rng, h) {
    const bark = mulC(COL.bark, .8 + .4 * rng()), lx = rng.range(-.05, .05), lz = rng.range(-.05, .05);
    S.seg([0, -.1, 0], [lx * h, h * .94, lz * h], h * .05, h * .012, bark, { l: L_WOOD, n: 6 });
    const tiers = Math.round(4 + h * .55);
    for (let k = 0; k < tiers; k++) {
      const u = k / (tiers - 1), y = h * (.2 + .66 * u), r = h * (.33 - .23 * u) * rng.range(.88, 1.1), hh = h * (.3 - .11 * u), ph = rng() * TAU;
      const c = mulC(mixC(COL.leaf, COL.leafL, rng() * .6 + u * .25), .8 + .35 * rng());
      S.add(gCyl(9, 0), {
        s: [r, hh, r], p: [lx * y + rng.range(-.03, .03), y + hh * .5, lz * y + rng.range(-.03, .03)], r: [rng.range(-.07, .07), ph, rng.range(-.07, .07)], c, l: L_THATCH, uvs: .5,
        deform: v => { if (v.y < 0) { const j = .8 + .4 * vnoise(Math.atan2(v.z, v.x) * 2.2 + ph, k * 3.1, 5); v.x *= j; v.z *= j; v.y -= hh * .25 * (j - .8); } },
        cf: v => .62 + .38 * sat(Math.hypot(v.x, v.z) / r), swayf: v => .14 * Math.hypot(v.x, v.z) / r * (.4 + u),
      });
    }
  },
  willow(S, rng, h) {
    const bark = mulC(COL.bark, .85 + .3 * rng());
    let p = [0, -.1, 0], d = [rng.range(-.25, .25), 1, rng.range(-.25, .25)], r = h * .085; const tips = [];
    for (let k = 0; k < 4; k++) {
      const l = h * rng.range(.15, .2), q = [p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l]; S.seg(p, q, r, r * .8, bark, { l: L_WOOD, n: 6 }); p = q; r *= .8;
      d = [d[0] + rng.range(-.4, .4), 1, d[2] + rng.range(-.4, .4)]; const dl = Math.hypot(d[0], d[1], d[2]); d = d.map(v => v / dl);
    }
    for (let k = 0; k < 4; k++) { const a = rng() * TAU + k * 1.6, len = h * rng.range(.28, .42), q = [p[0] + Math.cos(a) * len * .8, p[1] + len * rng.range(.1, .45), p[2] + Math.sin(a) * len * .8]; S.seg(p, q, r, r * .45, bark, { l: L_WOOD, n: 5, sway: .12 }); tips.push(q); }
    tips.push([p[0], p[1] + h * .08, p[2]]);
    for (const t of tips) for (let j = 0; j < 2; j++) {
      const rb = h * rng.range(.2, .29), c = mulC(mixC(COL.leaf, COL.leafL, rng()), .75 + .4 * rng()), cx = t[0] + rng.range(-.25, .25), cy = t[1] + rng.range(-.05, .3), cz = t[2] + rng.range(-.25, .25);
      S.ico(rb, cx, cy, cz, c, { sc: [1.15, .48, 1.15], d: 1, l: L_THATCH, sway: .2, r: [rng.range(-.2, .2), rng() * TAU, rng.range(-.2, .2)], cf: v => .6 + .4 * sat(v.y / (rb * .5) + .5) });
      for (let s = 0; s < 7; s++) {
        const a = rng() * TAU, rad = rb * rng.range(.45, 1.05), x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad, len = rng.range(.5, 1.5), y0 = cy - rb * .1, wa = rng() * TAU, wx = Math.cos(wa) * .045, wz = Math.sin(wa) * .045, cc = mulC(mixC(COL.leaf, COL.leafL, rng()), .6 + .3 * rng());
        ribbon(S, [x - wx, y0, z - wz], [x + wx, y0, z + wz], [x + wx * .4, y0 - len, z + wz * .4], [x - wx * .4, y0 - len, z - wz * .4], cc, [.2, .2, .95, .95]);
      }
    }
    for (let k = 0; k < 4; k++) { const a = k * 1.57 + rng(); S.seg([Math.cos(a) * h * .04, h * .17, Math.sin(a) * h * .04], [Math.cos(a) * h * .22, -.1, Math.sin(a) * h * .22], h * .03, h * .018, bark, { l: L_WOOD, n: 5 }); }
  },
  charred(S, rng, h) { PROP.tree(S, rng, h, { bark: mulC(COL.bark, .7 + .3 * rng()), tip: [.6, .16, .03], tipEmis: .09 }); },
  palm(S, rng, h) {
    const bark = mulC(C(0x6a5238), .85 + .3 * rng()), a0 = rng() * TAU, bend = rng.range(.1, .3), N = 7;
    let p = [0, -.1, 0];
    for (let k = 0; k < N; k++) { const u = (k + 1) / N, off = bend * h * u * u, q = [Math.cos(a0) * off, h * u, Math.sin(a0) * off], r = h * (.052 - .02 * u); S.seg(p, q, r * (k & 1 ? 1.1 : 1), r * .9, mulC(bark, k & 1 ? .82 : 1.05), { l: L_WOOD, n: 6, sway: u > .6 ? .06 : 0 }); p = q; }
    const top = p, nf = rng.int(8, 10);
    for (let f = 0; f < nf; f++) {
      const a = f / nf * TAU + rng.range(-.25, .25), len = h * rng.range(.34, .46), up = rng.range(.2, .62), c = mulC(mixC(COL.leaf, COL.leafL, rng()), .8 + .4 * rng()), M = 5;
      let prev = null;
      for (let k = 0; k <= M; k++) {
        const u = k / M, out = len * u, y = top[1] + len * (up * u - .95 * u * u), cx = top[0] + Math.cos(a) * out, cz = top[2] + Math.sin(a) * out, w = len * .2 * Math.sin(Math.min(1, u * 1.1 + .1) * PI) + .015, sx = -Math.sin(a) * w, sz = Math.cos(a) * w, sw = .2 + .8 * u;
        const cur = { c: [cx, y, cz], l: [cx + sx, y - w * .6, cz + sz], r: [cx - sx, y - w * .6, cz - sz], sw };
        if (prev) { ribbon(S, prev.c, cur.c, cur.l, prev.l, c, [prev.sw, sw, sw, prev.sw]); ribbon(S, prev.c, prev.r, cur.r, cur.c, mulC(c, .8), [prev.sw, prev.sw, sw, sw]); }
        prev = cur;
      }
    }
    for (let k = 0; k < 3; k++) S.ico(h * .03, top[0] + rng.range(-.12, .12), top[1] - .1, top[2] + rng.range(-.12, .12), C(0x3a2a1c), { d: 0 });
  },
  cactus(S, rng) {
    const c = mulC(C(0x4f6a3c), .8 + .3 * rng()), hh = rng.range(1.0, 1.9), r = .17;
    S.cyl(r, hh, 0, hh / 2 - .05, 0, c, { n: 7 }); S.sph(r, 0, hh - .05, 0, c, { sc: [1, .8, 1], w: 7, h: 4 });
    for (let k = 0, n = rng.int(0, 3); k < n; k++) {
      const a = rng() * TAU, y = hh * rng.range(.35, .6), l = rng.range(.26, .4), up = rng.range(.3, .7), x = Math.cos(a) * l, z = Math.sin(a) * l;
      S.seg([0, y, 0], [x, y + .04, z], r * .62, r * .62, c, { n: 6 }); S.seg([x, y, z], [x, y + up, z], r * .62, r * .58, c, { n: 6 }); S.sph(r * .6, x, y + up, z, c, { w: 6, h: 4 });
    }
    if (rng() < .4) S.ico(.06, 0, hh + .1, 0, C(0xe86a8a), { d: 0, emis: .03 });
  },
  reeds(S, rng) {
    for (let k = 0, n = rng.int(5, 9); k < n; k++) {
      const x = rng.range(-.3, .3), z = rng.range(-.3, .3), hh = rng.range(.6, 1.35), lx = rng.range(-.18, .18), lz = rng.range(-.18, .18), c = mulC(mixC(COL.tuftA, COL.tuftB, rng()), .8 + .4 * rng());
      S.seg([x, -.08, z], [x + lx * .4, hh * .5, z + lz * .4], .022, .018, c, { n: 3, jit: 0 });
      S.seg([x + lx * .4, hh * .5, z + lz * .4], [x + lx, hh, z + lz], .018, .008, c, { n: 3, sway: .5, jit: 0 });
      if (rng() < .45) S.seg([x + lx * .8, hh * .8, z + lz * .8], [x + lx * 1.02, hh * 1.02, z + lz * 1.02], .042, .038, C(0x4a3220), { n: 5, sway: .5 });
    }
  },
  lily(S, rng) {
    for (let k = 0, n = rng.int(2, 4); k < n; k++) {
      const x = rng.range(-.4, .4), z = rng.range(-.4, .4), r = rng.range(.13, .26);
      S.cyl(r, .012, x, .006, z, mulC(mixC(COL.leaf, COL.leafL, rng()), 1.1 + .4 * rng()), { n: 7, jit: .05, r: [0, rng() * TAU, 0] });
      if (rng() < .3) S.ico(.05, x + r * .3, .05, z, C(0xe8c8d8), { d: 0, emis: .03, sc: [1, .7, 1] });
    }
  },
  shroom(S, rng) {
    const col = rng() < .5 ? C(0x4fe0c0) : C(0x7fd0ff);
    for (let k = 0, n = rng.int(3, 6); k < n; k++) {
      const x = rng.range(-.3, .3), z = rng.range(-.3, .3), hh = rng.range(.14, .44), r = hh * rng.range(.45, .7);
      S.cyl(r * .22, hh, x, hh / 2, z, C(0xb8c8b8), { n: 5, emis: .02 });
      S.add(gDome(7, 3), { s: [r, r * .7, r], p: [x, hh - r * .1, z], c: mulC(col, .5), emis: .075, jit: .1, smooth: true });
    }
  },
  log(S, rng) {
    const len = rng.range(1.5, 2.6), r = rng.range(.14, .2), bark = mulC(COL.bark, .9 + .4 * rng());
    S.seg([-len / 2, r * .8, 0], [len / 2, r * .9, 0], r, r * .85, bark, { l: L_WOOD, n: 7 });
    for (const s of [-1, 1]) S.cyl(r * (s < 0 ? .98 : .83), .02, s * len / 2, r * (s < 0 ? .8 : .9), 0, mulC(COL.woodL, .7), { n: 7, l: L_WOOD, r: [0, 0, HPI] });
    for (let k = 0; k < 2; k++) { const x = rng.range(-len * .3, len * .3), a = rng.range(-1, 1); S.seg([x, r, 0], [x + rng.range(-.15, .15), r + .35 * Math.cos(a), .35 * Math.sin(a)], r * .35, r * .2, bark, { l: L_WOOD, n: 5 }); }
  },
  basalt(S, rng) {
    const n = rng.int(5, 10), R = .3, G = [[0, 0], [1, 0], [-1, 0], [.5, .87], [-.5, .87], [.5, -.87], [-.5, -.87], [1.5, .87], [-1.5, -.87], [0, 1.73]];
    for (let k = 0; k < n; k++) {
      const q = G[k], hh = rng.range(.35, 2.2) * (k < 3 ? 1.25 : .8), c = mulC(mixC(COL.stoneD, COL.stone, rng() * .7), .8 + .3 * rng());
      S.cyl(R * 1.04, hh, q[0] * R * 1.75, hh / 2 - .1, q[1] * R * 1.75, c, { n: 6, l: L_ROCK, r: [0, PI / 6, 0], grad: [-hh / 2, hh * .1, .65] });
      S.cyl(R * .9, .05, q[0] * R * 1.75, hh - .08, q[1] * R * 1.75, mulC(c, 1.3), { n: 6, l: L_ROCK, r: [0, PI / 6, 0] });
    }
  },
  spire(S, rng, hh, cols) {
    let y = 0, r = hh * rng.range(.2, .28), x = 0, z = 0, k = rng.int(0, 3);
    while (y < hh && r > .12) { S.rock(r, x, y + r * .4, z, mulC(cols[k % cols.length], .8 + .3 * rng()), { sq: .62, d: 1 }); y += r * .78; r *= rng.range(.8, .93); x += rng.range(-.08, .08); z += rng.range(-.08, .08); k++; }
  },
  vent(S, rng) {
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + rng() * .3, r = rng.range(.2, .34); S.rock(r, Math.cos(a) * .52, r * .3, Math.sin(a) * .52, mulC(mixC(COL.stoneD, COL.stone, rng()), .8), { sq: .8 }); }
    S.cyl(.4, .06, 0, .09, 0, [.8, .22, .03], { n: 8, emis: .3, jit: 0 });
  },
  jar(S, rng) {
    const c = mulC(C(0x9a5a3c), .8 + .35 * rng()), s = rng.range(.8, 1.25);
    S.cyl(.2 * s, .22 * s, 0, .11 * s, 0, c, { n: 8, rt: .62 }); S.cyl(.2 * s, .2 * s, 0, .32 * s, 0, c, { n: 8, rt: 1.0 }); S.cyl(.2 * s, .14 * s, 0, .49 * s, 0, c, { n: 8, rt: 2.0 });
    S.cyl(.09 * s, .1 * s, 0, .6 * s, 0, mulC(c, .9), { n: 8, rt: 1.25 }); S.cyl(.105 * s, .02 * s, 0, .655 * s, 0, COL.black, { n: 8, jit: 0 });
  },
  icicles(S, rng, len, n, maxH) {
    for (let k = 0; k < n; k++) { const x = (k + .5) / n * len - len / 2 + rng.range(-.05, .05), h = rng.range(.15, maxH) * (rng() < .2 ? 1.5 : 1); S.cone(.04 + .035 * rng(), h, x, -h / 2, rng.range(-.04, .04), COL.ice, { n: 5, r: [PI, 0, 0], rough: .14, emis: .012, jit: .1 }); }
  },
  drift(S, rng, r, col) { S.ico(r, 0, r * .04, 0, col, { sc: [1.25, .3, .85], d: 2, smooth: true, rough: .75, jit: .03 }); },
  crystal(S, rng, col, emis) {
    for (let k = 0, n = rng.int(3, 6); k < n; k++) { const hh = rng.range(.3, .9) * (k ? .7 : 1.25), a = rng() * TAU, d = k ? rng.range(.12, .32) : 0; S.add(gOct(), { s: [hh * .22, hh, hh * .22], p: [Math.cos(a) * d, hh * .5, Math.sin(a) * d], r: [rng.range(-.4, .4), rng() * TAU, rng.range(-.4, .4)], c: mulC(col, .8 + .4 * rng()), rough: .12, emis }); }
  },
});

const BIOME_DRESS = {
  ashen(X) { for (let k = 0; k < 3; k++) X.drop(T => PROP.log(T, X.rng), .9, { far: 1.2 }); },
  frost(X) {
    const { B, rng, drop } = X, snow = B.bio.coverCol;
    for (let k = 0; k < 30; k++) { const r = rng.range(.5, 1.25); drop(T => PROP.drift(T, rng, r, snow), r * .35, { roadMin: .5, ao: null, steep: true }); }
    for (const q of B.ponds) for (let k = 0; k < 2; k++) { const a = rng() * TAU, d = q.r + rng.range(.9, 1.3); X.at(q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, T => PROP.crystal(T, rng, COL.ice, .03), .5); }
    for (let k = 0; k < 5; k++) drop(T => PROP.crystal(T, rng, COL.ice, .03), .5, { water: 3.2 });
    for (let k = 0; k < 2; k++) drop(T => PROP.log(T, rng), .9, { far: 1.2 });
    if (B.ponds[0]) B.env.push({ x: B.ponds[0].x, y: B.ponds[0].y + .9, z: B.ponds[0].z, c: 0x7fc8ff, I: 6, d: 7 });
  },
  fen(X) {
    const { B, rng, drop } = X;
    for (let k = 0; k < 52; k++) {
      const u = rng.int(2, B.SP.length - 2), a = B.SP[u - 1], b = B.SP[u + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, off = rng.sign() * rng.range(.95, 1.9), x = B.SP[u][0] - dz / l * off, z = B.SP[u][1] + dx / l * off;
      if (Math.abs(x) > BH - .8 || Math.abs(z) > BH - .8 || B.dRoadAt(x, z) < ROAD_HALF + .9) continue;
      X.at(x, z, T => PROP.reeds(T, rng), 0);
    }
    for (const q of B.ponds) {
      for (let k = 0; k < 9; k++) { const a = rng() * TAU, d = q.r * rng.range(.75, 1.2); X.at(q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, T => PROP.reeds(T, rng), 0); }
      for (let k = 0; k < 4; k++) { const a = rng() * TAU, d = q.r * rng.range(0, .55), T = new Soup(); PROP.lily(T, rng); B.put(T, q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, { y: q.y + .012, ao: null }); }
    }
    const sh = [];
    for (let k = 0; k < 16; k++) { const p = drop(T => PROP.shroom(T, rng), .35, { ao: null }); if (p) sh.push(p); }
    for (let k = 0; k < Math.min(2, sh.length); k++) B.env.push({ x: sh[k][0], y: X.H(sh[k][0], sh[k][1]) + .7, z: sh[k][1], c: 0x45e0b8, I: 5, d: 6 });
    for (let k = 0; k < 5; k++) drop(T => PROP.log(T, rng), .9, { far: 1.2 });
  },
  ember(X) {
    const { B, rng, drop } = X, cols = [COL.stoneD, COL.stone, C(0x5a2a22), COL.stoneD];
    for (let k = 0; k < 9; k++) drop(T => PROP.basalt(T, rng), 1.0, { far: 1.4 });
    for (let k = 0; k < 6; k++) { const hh = rng.range(2.0, 4.2); drop(T => PROP.spire(T, rng, hh, cols), hh * .28, { far: 1.6, steep: true }); }
    for (let k = 0; k < 4; k++) { const p = drop(T => PROP.vent(T, rng), .8, { far: 2.2 }); if (p) B.fires.push({ x: p[0], y: X.H(p[0], p[1]) + .12, z: p[1], size: .5, fx: { layers: 0, smoke: 1.3, embers: 1.1, glow: .55 } }); }
    B.env.push({ x: B.bridge.x, y: B.wlc + .55, z: B.bridge.z, c: 0xff5a1e, I: 44, d: 9, flick: 1 });
    if (B.ponds[0]) { const q = B.ponds[0]; B.env.push({ x: q.x, y: q.y + .7, z: q.z, c: 0xff5a1e, I: 40, d: 9, flick: 1 }); }
    if (B.fallAt) B.env.push({ x: B.fallAt.x - B.fallAt.ox * 1.2, y: B.fallAt.y + .6, z: B.fallAt.z - B.fallAt.oz * 1.2, c: 0xff5a1e, I: 36, d: 8, flick: 1 });
  },
  dunes(X) {
    const { B, rng, drop } = X, cols = B.bio.strata.map(h => C(h));
    for (let k = 0; k < 11; k++) drop(T => PROP.cactus(T, rng), .4, { far: .9 });
    for (let k = 0; k < 6; k++) { const hh = rng.range(2.2, 4.6); drop(T => PROP.spire(T, rng, hh, cols), hh * .28, { far: 1.6, steep: true }); }
    for (const q of B.ponds) {
      for (let k = 0; k < 4; k++) { const a = rng() * TAU, d = q.r + rng.range(1.1, 1.9), h = rng.range(3, 4.4); X.at(q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, T => PROP.palm(T, rng, h), .5); }
      for (let k = 0; k < 7; k++) { const a = rng() * TAU, d = q.r * rng.range(.8, 1.2); X.at(q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, T => PROP.reeds(T, rng), 0); }
    }
    for (const pad of B.pads) {
      if (rng() < .5) continue;
      const a = rng() * TAU, x = pad.x + Math.cos(a) * 2.3, z = pad.z + Math.sin(a) * 2.3; if (!X.free(x, z, .5, .3)) continue;
      const T = new Soup(); PROP.jar(T, rng); if (rng() < .7) { const J = new Soup(); PROP.jar(J, rng); T.merge(J, { p: [.42, 0, .1] }); } if (rng() < .4) { const J = new Soup(); PROP.jar(J, rng); T.merge(J, { p: [.15, 0, .45], r: [1.3, rng() * 3, 0] }); }
      X.at(x, z, () => T, .7, T);
    }
  },
};


// 40-fx.js

const LT = {
  hemi: null, moon: null, fill: null, beacon: null, spots: [], towers: [], flashes: [], torches: [], env: [], envSrc: [], envK: 0,
  beaconBase: 1500, beaconMul: 1, beaconLevel: 1, beaconGutter: 0, beaconOn: 1, cold: 0, emitters: [], spotTimer: 0,
};
function initLights() {
  const S = R.scene;
  LT.hemi = new THREE.HemisphereLight(0x6d83bd, 0x1c1f2a, 1.15); S.add(LT.hemi);
  const moon = LT.moon = new THREE.DirectionalLight(0xa9c0f6, 1.55); moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera; sc.left = -31; sc.right = 31; sc.top = 31; sc.bottom = -31; sc.near = 5; sc.far = 130; moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.06;
  S.add(moon); S.add(moon.target);
  LT.fill = new THREE.DirectionalLight(0x4a5f96, 0.3); LT.fill.position.set(30, 14, 34); S.add(LT.fill);
  const b = LT.beacon = new THREE.PointLight(0xff8a3a, 0, 80, 2); b.castShadow = true; b.shadow.mapSize.set(1024, 1024);
  b.shadow.camera.near = .5; b.shadow.camera.far = 80; b.shadow.bias = -0.004; b.shadow.normalBias = 0.05; S.add(b);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.SpotLight(0xff9646, 0, 17, 1.12, .85, 2); s.castShadow = true; s.shadow.mapSize.set(1024, 1024);
    s.shadow.camera.near = .4; s.shadow.camera.far = 18; s.shadow.bias = -0.0025; s.shadow.normalBias = 0.04;
    s.position.set(0, 4, 0); S.add(s); S.add(s.target); LT.spots.push({ l: s, owner: null, fade: 0, want: null });
  }
  for (let i = 0; i < 12; i++) { const l = new THREE.PointLight(0xff9646, 0, 11, 2); S.add(l); LT.towers.push(l); }
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffc070, 0, 22, 2); S.add(l); LT.flashes.push({ l, t: 1, dur: 1, i0: 0 }); }
  for (let i = 0; i < 5; i++) { const l = new THREE.PointLight(0xff9a50, 0, 7, 2); S.add(l); LT.torches.push({ l, owner: null, cur: 0 }); }
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xff5a1e, 0, 9, 2); S.add(l); LT.env.push(l); }
}
function lightFlash(x, y, z, color, intensity, dur, range = 24) {
  let best = LT.flashes[0];
  for (const f of LT.flashes) { if (f.t >= 1) { best = f; break; } if (f.l.intensity < best.l.intensity) best = f; }
  best.l.position.set(x, y, z); best.l.color.set(color); best.l.distance = range; best.i0 = intensity; best.t = 0; best.dur = dur; best.l.intensity = intensity;
}
function updateLights(dt, t, focusX, focusZ) {
  LT.beaconGutter = Math.max(0, LT.beaconGutter - dt * 1.6);
  const flick = .86 + .1 * n1(t * 6.3, 1) + .06 * n1(t * 17, 2);
  const lvl = LT.beaconLevel * LT.beaconOn * (1 - .55 * LT.beaconGutter * (0.6 + .4 * Math.sin(t * 40)));
  LT.beacon.intensity = LT.beaconBase * LT.beaconMul * (.35 + .65 * lvl) * (lvl > 0.001 ? 1 : 0) * flick * LT.beaconOn;
  if (LT.beaconPos) LT.beacon.position.set(LT.beaconPos.x + n1(t * 5, 3) * .1, LT.beaconPos.y + .5 + n1(t * 4, 4) * .08, LT.beaconPos.z + n1(t * 5, 5) * .1);
  for (const f of LT.flashes) { if (f.t < 1) { f.t += dt / f.dur; const k = Math.max(0, 1 - f.t); f.l.intensity = f.i0 * k * k; } else f.l.intensity = 0; }
  LT.spotTimer -= dt;
  if (LT.spotTimer <= 0) {
    LT.spotTimer = .4;
    const lit = LT.emitters.filter(e => e && e.alive && e.on > .5 && e.spot);
    const key = e => dist2(e.x, e.z, focusX, focusZ) - (e._spot > .2 ? 12 : 0);
    lit.sort((a, b) => key(a) - key(b));
    const want = lit.slice(0, 3);
    for (const s of LT.spots) s.want = (s.owner && want.includes(s.owner)) ? s.owner : null;
    for (const e of want) if (!LT.spots.some(s => s.want === e)) { const s = LT.spots.find(s => !s.want); if (s) s.want = e; }
  }
  for (const e of LT.emitters) if (e) e._spot = 0;
  for (const s of LT.spots) {
    if (s.owner && (!s.owner.alive || s.owner.on < .05)) { if (s.want === s.owner) s.want = null; }
    if (s.owner !== s.want) { s.fade = Math.max(0, s.fade - dt * 4); if (s.fade <= 0) s.owner = s.want; }
    else if (s.owner) s.fade = Math.min(1, s.fade + dt * 3);
    const e = s.owner;
    if (e) {
      e._spot = s.fade;
      s.l.position.set(e.x, e.y + .25, e.z); s.l.target.position.set(e.x + (e.dx || 0) * 1.2, e.y - 3, e.z + (e.dz || 0) * 1.2);
      s.l.color.setRGB(e.r, e.g, e.b); s.l.intensity = e.I * e.on * (e.fl || 1) * s.fade * 1.25;
    } else s.l.intensity = 0;
  }
  for (let i = 0; i < LT.env.length; i++) {
    const l = LT.env[i], e = LT.envSrc[i];
    if (e && LT.envK > .01) { l.position.set(e.x, e.y, e.z); l.color.setHex(e.c); l.distance = e.d; l.intensity = e.I * LT.envK * (e.flick ? .82 + .18 * n1(t * 1.7 + i * 5, i + 11) : 1); } else l.intensity = 0;
  }
  for (let i = 0; i < LT.towers.length; i++) {
    const l = LT.towers[i], e = LT.emitters[i];
    if (e && e.alive) {
      e.fl = .86 + .1 * n1(t * 7 + e.seed, e.seed) + .05 * n1(t * 19 + e.seed, e.seed + 1);
      l.position.set(e.x, e.y, e.z); l.color.setRGB(e.r, e.g, e.b); l.distance = e.range;
      l.intensity = e.I * e.on * e.fl * (1 - .68 * (e._spot || 0));
    } else l.intensity = 0;
  }
}
function updateTorchLights(dt, cands, focusX, focusZ) {
  for (const c of cands) c._ls = c.lI / (1 + dist2(c.lx, c.lz, focusX, focusZ) * .03);
  cands.sort((a, b) => b._ls - a._ls);
  const top = cands.slice(0, 9);
  for (const s of LT.torches) if (s.owner && (!s.owner.alive || !top.includes(s.owner))) s.releasing = true;
  for (let i = 0; i < Math.min(5, top.length); i++) {
    const c = top[i]; if (LT.torches.some(s => s.owner === c)) continue;
    const s = LT.torches.find(s => !s.owner); if (s) { s.owner = c; s.releasing = false; s.cur = 0; }
  }
  for (const s of LT.torches) {
    const o = s.owner;
    if (!o) { s.l.intensity = 0; continue; }
    s.cur = damp(s.cur, s.releasing ? 0 : o.lI, s.releasing ? 20 : 12, dt);
    if (s.releasing && s.cur < .5) { s.owner = null; s.cur = 0; s.l.intensity = 0; continue; }
    if (o.alive) { s.l.position.set(o.lx, o.ly, o.lz); s.l.color.setHex(o.lCol || 0xff9a50); }
    s.l.intensity = s.cur * (.85 + .15 * n1(SH.uTime.value * 9, o.lseed || 0));
  }
}
function collectMistLights() {
  let k = 0; const put = (l, gain) => { if (k >= R.NL) return; R.lightPos[k].copy(l.position); R.lightCol[k].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity * gain); k++; };
  put(LT.beacon, .05);
  for (const f of LT.flashes) put(f.l, .06);
  const tw = LT.towers.filter(l => l.intensity > 0).sort((a, b) => b.intensity - a.intensity);
  for (const l of tw) put(l, .16);
  for (const l of LT.env) if (l.intensity > 0) put(l, .1);
  for (; k < R.NL; k++) R.lightCol[k].set(0, 0, 0);
}

const SPR_VERT = `
attribute vec3 iPos; attribute vec4 iSize; attribute vec4 iCol; attribute vec4 iMisc;
varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc;
#ifdef LIT
uniform vec3 uLightPos[${12}]; uniform vec3 uLightCol[${12}]; uniform vec3 uAmb;
#endif
void main(){
  vUv = position.xy; vCol = iCol; vMisc = iMisc;
  vec2 q = position.xy; q.y += iSize.w;
  float c = cos(iSize.z), s = sin(iSize.z); q = vec2(q.x * c - q.y * s, q.x * s + q.y * c) * iSize.xy * 0.5;
  #ifdef LIT
  vec3 L = uAmb; for (int i = 0; i < 12; i++) { vec3 d = uLightPos[i] - iPos; L += uLightCol[i] / (dot(d, d) + 3.0); }
  vCol.rgb *= L;
  #endif
  if (iMisc.w > 0.5) { gl_Position = projectionMatrix * viewMatrix * vec4(iPos + vec3(q.x, 0.0, q.y), 1.0); }
  else { vec4 mv = viewMatrix * vec4(iPos, 1.0); mv.xy += q; gl_Position = projectionMatrix * mv; }
}`;
const SPR_NOISE = `
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }`;
const SPR_FRAG_ADD = `
precision highp float; varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc; uniform float uTime;
${SPR_NOISE}
void main(){
  int type = int(vMisc.x + 0.5); float seed = vMisc.y, age = vMisc.z; vec2 p = vUv; float r = length(p);
  vec3 col = vCol.rgb; float a = 0.0;
  if (type == 0) { a = smoothstep(1.0, 0.0, r); a *= a; }
  else if (type == 1) {
    float y = p.y * 0.5 + 0.5, t = uTime * 1.5 + seed * 17.0;
    float n1 = noise(vec2(p.x * 2.6 + seed * 7.0, y * 3.2 - t * 2.3)), n2 = noise(vec2(p.x * 5.5 - seed * 3.0, y * 6.0 - t * 3.9));
    float x = p.x + (n1 - 0.5) * 0.55 * y;
    float w = mix(0.66, 0.02, pow(y, 0.85));
    float body = 1.0 - smoothstep(w * 0.35, w, abs(x));
    float d = body * (1.08 - y) + (n1 * 0.62 + n2 * 0.38 - 0.5) * (0.28 + 0.6 * y) - smoothstep(0.0, 0.07, 0.07 - y) * 0.6;
    a = smoothstep(0.1, 0.16, d);
    col *= mix(vec3(1.0, 0.24, 0.03), vec3(1.0, 0.56, 0.1), smoothstep(0.26, 0.3, d));
    col = mix(col, vCol.rgb * vec3(1.0, 0.86, 0.42), smoothstep(0.46, 0.52, d));
    col = mix(col, vCol.rgb * vec3(1.15, 1.05, 0.8), smoothstep(0.7, 0.78, d));
  }
  else if (type == 2) { a = pow(max(0.0, 1.0 - r), 2.4); }
  else if (type == 3) {
    float n = noise(p * 2.4 + seed * 13.0 + vec2(0.0, -age * 1.6)) * 0.6 + noise(p * 5.2 - seed * 7.0) * 0.4;
    float d = (1.0 - r) + (n - 0.5) * 0.95 - age * 0.95;
    a = smoothstep(0.02, 0.1, d);
    vec3 hot = mix(vec3(0.9, 0.2, 0.03), vec3(1.0, 0.62, 0.16), smoothstep(0.16, 0.24, d));
    hot = mix(hot, vec3(1.1, 0.95, 0.7), smoothstep(0.42, 0.52, d));
    col *= hot * (1.0 - age * 0.55);
  }
  else if (type == 4) { float R0 = 0.25 + 0.75 * sqrt(age); a = smoothstep(0.14, 0.0, abs(r - R0)) * (1.0 - age) * (1.0 - age); }
  else if (type == 5) { float th = atan(p.y, p.x); a = pow(max(0.0, 1.0 - r), 1.6) * (0.25 + 0.75 * pow(abs(cos(th * 2.5 + seed)), 6.0)) * (1.0 - age); a += pow(max(0.0, 1.0 - r * 2.2), 2.0); }
  else if (type == 6) { a = smoothstep(1.0, 0.0, abs(p.y)) * smoothstep(1.0, 0.3, abs(p.x)); }
  else if (type == 7) {
    float th = atan(p.y, p.x), front = mix(-1.5, 1.5, smoothstep(0.0, 0.55, age));
    float band = smoothstep(0.5, 0.74, r) * smoothstep(1.0, 0.9, r);
    float trail = smoothstep(front - 1.5, front, th) * step(th, front) * step(-1.6, th);
    a = band * trail * (1.0 - smoothstep(0.45, 1.0, age));
  }
  gl_FragColor = vec4(col * a * vCol.a, 1.0);
}`;
const SPR_FRAG_ALPHA = `
precision highp float; varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc; uniform float uTime;
${SPR_NOISE}
void main(){
  float seed = vMisc.y, age = vMisc.z; vec2 p = vUv; float r = length(p);
  float n = noise(p * 1.7 + seed * 9.0 + vec2(0.0, -age * 0.6)) * 0.65 + noise(p * 3.9 + seed * 5.0) * 0.35;
  float a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.9);
  a = floor(a * 4.0 + 0.5) / 4.0;
  gl_FragColor = vec4(vCol.rgb * (0.7 + 0.5 * n), a * vCol.a);
}`;

class SpriteBatch {
  constructor(cap, lit) {
    this.cap = cap; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (const a of [this.aPos, this.aSize, this.aCol, this.aMisc]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iSize', this.aSize); g.setAttribute('iCol', this.aCol); g.setAttribute('iMisc', this.aMisc);
    const uniforms = { uTime: SH.uTime };
    if (lit) { uniforms.uLightPos = { value: R.lightPos }; uniforms.uLightCol = { value: R.lightCol }; uniforms.uAmb = { value: new THREE.Vector3(.05, .065, .1) }; }
    const m = new THREE.ShaderMaterial({
      vertexShader: SPR_VERT, fragmentShader: lit ? SPR_FRAG_ALPHA : SPR_FRAG_ADD, uniforms, defines: lit ? { LIT: 1 } : {},
      transparent: true, depthWrite: false, depthTest: true,
      blending: lit ? THREE.NormalBlending : THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = lit ? 3 : 4; this.geo = g;
  }
  begin() { this.n = 0; }
  push(x, y, z, w, h, rot, anchor, r, g, b, a, type, seed, age, ground) {
    if (this.n >= this.cap) return; const i = this.n++;
    const P = this.aPos.array, S = this.aSize.array, C = this.aCol.array, M = this.aMisc.array;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; S[i * 4] = w; S[i * 4 + 1] = h; S[i * 4 + 2] = rot; S[i * 4 + 3] = anchor;
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a; M[i * 4] = type; M[i * 4 + 1] = seed; M[i * 4 + 2] = age; M[i * 4 + 3] = ground;
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const a of [this.aPos, this.aSize, this.aCol, this.aMisc]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
  }
}

class SegBatch {
  constructor(cap) {
    this.cap = cap; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (const a of [this.aA, this.aB, this.aCol]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.aA); g.setAttribute('iB', this.aB); g.setAttribute('iCol', this.aCol);
    const m = new THREE.ShaderMaterial({
      vertexShader: `attribute vec4 iA; attribute vec4 iB; attribute vec4 iCol; varying vec4 vCol; varying vec2 vUv;
void main(){ vec4 a = viewMatrix * vec4(iA.xyz, 1.0), b = viewMatrix * vec4(iB.xyz, 1.0); vec2 d = b.xy - a.xy; float l = max(length(d), 1e-4); vec2 nrm = vec2(-d.y, d.x) / l;
  vec4 p = mix(a, b, position.x); p.xy += nrm * position.y * mix(iA.w, iB.w, position.x); vCol = iCol; vUv = position.xy; gl_Position = projectionMatrix * p; }`,
      fragmentShader: `precision highp float; varying vec4 vCol; varying vec2 vUv; void main(){ float a = 1.0 - abs(vUv.y); a = a * a * (3.0 - 2.0 * a); gl_FragColor = vec4(vCol.rgb * vCol.a * (0.35 + 0.65 * a) * step(0.0, a), 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.geo = g;
  }
  begin() { this.n = 0; }
  push(ax, ay, az, aw, bx, by, bz, bw, r, g, b, a) {
    if (this.n >= this.cap) return; const i = this.n++ * 4;
    const A = this.aA.array, Bq = this.aB.array, C = this.aCol.array;
    A[i] = ax; A[i + 1] = ay; A[i + 2] = az; A[i + 3] = aw; Bq[i] = bx; Bq[i + 1] = by; Bq[i + 2] = bz; Bq[i + 3] = bw; C[i] = r; C[i + 1] = g; C[i + 2] = b; C[i + 3] = a;
  }
  end() { this.geo.instanceCount = this.n; for (const a of [this.aA, this.aB, this.aCol]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * 4); a.needsUpdate = true; } }
}

class DecalBatch {
  constructor(cap) {
    this.cap = cap; this.G = 4; this.next = 0; this.slots = [];
    const vps = (this.G + 1) * (this.G + 1), g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(cap * vps * 3), 3); this.uv = new THREE.BufferAttribute(new Float32Array(cap * vps * 2), 2); this.col = new THREE.BufferAttribute(new Float32Array(cap * vps * 4), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage); this.col.setUsage(THREE.DynamicDrawUsage);
    const idx = [];
    for (let s = 0; s < cap; s++) {
      this.slots.push({ life: 0, max: 1, a: 0, seed: 0 });
      for (let j = 0; j <= this.G; j++) for (let i = 0; i <= this.G; i++) { const o = s * vps + j * (this.G + 1) + i; this.uv.array[o * 2] = i / this.G * 2 - 1; this.uv.array[o * 2 + 1] = j / this.G * 2 - 1; }
      for (let j = 0; j < this.G; j++) for (let i = 0; i < this.G; i++) { const a = s * vps + j * (this.G + 1) + i, b = a + 1, c = a + this.G + 2, d = a + this.G + 1; idx.push(a, d, c, a, c, b); }
    }
    g.setAttribute('position', this.pos); g.setAttribute('uv', this.uv); g.setAttribute('aCol', this.col); g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      vertexShader: 'attribute vec4 aCol; varying vec4 vCol; varying vec2 vUv; void main(){ vCol = aCol; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `precision highp float; varying vec4 vCol; varying vec2 vUv; ${SPR_NOISE}
void main(){ float r = length(vUv); float sd = floor(vCol.a) ; float al = fract(vCol.a) * 1.02; float n = noise(vUv * 3.0 + sd * 3.7) * 0.6 + noise(vUv * 7.0 + sd) * 0.4;
  float a = smoothstep(1.0, 0.35, r + (n - 0.5) * 0.8); float th = atan(vUv.y, vUv.x); a *= 0.75 + 0.25 * noise(vec2(th * 3.0, sd));
  gl_FragColor = vec4(vCol.rgb, a * al); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.vps = vps;
  }
  add(heightAt, x, z, size, r, g, b, alpha, life) {
    const s = this.next; this.next = (this.next + 1) % this.cap; const sl = this.slots[s];
    sl.life = life; sl.max = life; sl.a = alpha; sl.seed = Math.floor(rnd() * 90) + 1; sl.r = r; sl.g = g; sl.b = b;
    const P = this.pos.array, rot = rnd() * TAU, cs = Math.cos(rot), sn = Math.sin(rot);
    for (let j = 0; j <= this.G; j++) for (let i = 0; i <= this.G; i++) {
      const o = (s * this.vps + j * (this.G + 1) + i) * 3, lx = (i / this.G * 2 - 1) * size, lz = (j / this.G * 2 - 1) * size, wx = x + lx * cs - lz * sn, wz = z + lx * sn + lz * cs;
      P[o] = wx; P[o + 1] = heightAt(wx, wz) + .05; P[o + 2] = wz;
    }
    this.pos.needsUpdate = true;
  }
  update(dt) {
    const C = this.col.array;
    for (let s = 0; s < this.cap; s++) {
      const sl = this.slots[s]; if (sl.life <= 0 && sl.dead) continue;
      sl.life -= dt; const k = sl.life <= 0 ? 0 : Math.min(1, sl.life / (sl.max * .25)) * sl.a; sl.dead = sl.life <= 0;
      for (let v = 0; v < this.vps; v++) { const o = (s * this.vps + v) * 4; C[o] = sl.r; C[o + 1] = sl.g; C[o + 2] = sl.b; C[o + 3] = sl.seed + Math.min(.97, k); }
    }
    this.col.needsUpdate = true;
  }
  clear() { for (const sl of this.slots) sl.life = 0; }
}

const FX = {
  add: null, alpha: null, segs: null, decals: null,
  parts: [], smokes: [], flames: [], timed: [], bolts: [], shake: 0, shakeX: 0, shakeY: 0, groundAt: () => 0,
};
function initFX() {
  FX.add = new SpriteBatch(2600, false); FX.alpha = new SpriteBatch(700, true); FX.segs = new SegBatch(600); FX.decals = new DecalBatch(40);
  R.scene.add(FX.add.mesh, FX.alpha.mesh, FX.segs.mesh, FX.decals.mesh);
}
function fxPart(x, y, z, vx, vy, vz, life, size, r, g, b, o) {
  if (FX.parts.length > 1700) return;
  FX.parts.push({ x, y, z, vx, vy, vz, life, max: life, size, r, g, b, grav: o && o.grav || 0, drag: o && o.drag || 0, streak: o && o.streak || 0, rise: o && o.rise || 0, bounce: o && o.bounce || 0, seed: rnd() * 100, wob: o && o.wob || 0 });
}
function fxSmoke(x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, o) {
  if (FX.smokes.length > 640) return;
  FX.smokes.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, r, g, b, a, drag: o && o.drag !== undefined ? o.drag : 1.2, seed: rnd() * 100, rise: o && o.rise || 0 });
}
function fxSparks(x, y, z, n, speed, r, g, b, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, e = rr(o.lo === undefined ? .1 : o.lo, o.hi === undefined ? 1.3 : o.hi), s = speed * rr(.4, 1);
    fxPart(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, rr(.25, .6) * (o.life || 1), o.size || .07, r, g, b, { grav: o.grav === undefined ? 9 : o.grav, drag: .6, streak: 1, bounce: .35 });
  }
}
function fxEmbers(x, y, z, n, spread, r = 1, g = .5, b = .12) {
  for (let i = 0; i < n; i++) fxPart(x + rr(-spread, spread), y + rr(0, spread), z + rr(-spread, spread), rr(-.25, .25), rr(.7, 1.9), rr(-.25, .25), rr(.9, 2.2), rr(.05, .09), r * rr(1.6, 3), g * rr(1.2, 2.4), b * 2, { drag: .3, wob: 1, rise: .25 });
}
function fxDust(x, y, z, n, size, o = {}) {
  const c = o.c || [.34, .3, .27];
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = rr(.3, 1) * (o.speed || 1.3); fxSmoke(x + Math.cos(a) * size * .3, y + rr(0, .15), z + Math.sin(a) * size * .3, Math.cos(a) * s, rr(.2, .7) * (o.up || 1), Math.sin(a) * s, rr(.5, 1.1) * (o.life || 1), size * rr(.5, .9), size * 1.2, c[0], c[1], c[2], o.a || .5, { drag: 2.4 }); }
}
function fxTimed(type, x, y, z, w, h, r, g, b, a, life, o = {}) {
  FX.timed.push({ type, x, y, z, w, h, r, g, b, a, life, max: life, rot: o.rot || 0, ground: o.ground ? 1 : 0, grow: o.grow || 0, seed: rnd() * 50, anchor: o.anchor || 0 });
}
function fxExplosion(x, y, z, sc = 1) {
  lightFlash(x, y + 1.1, z, 0xffb060, 520 * sc * sc, .4, 20 + sc * 6);
  fxTimed(3, x, y + .45 * sc, z, 2.6 * sc, 2.6 * sc, 5.0, 4.2, 3.2, 1, .42, { grow: 1.3 });
  fxTimed(5, x, y + .4 * sc, z, 4.2 * sc, 4.2 * sc, 3.5, 2.4, 1.2, 1, .12);
  fxTimed(4, x, y + .08, z, 5.4 * sc, 5.4 * sc, 1.6, 1.0, .5, .55, .4, { ground: true });
  fxSparks(x, y + .2, z, Math.round(22 * sc), 7.5 * sc, 3.2, 1.7, .5, { size: .08 });
  for (let i = 0; i < 9 * sc; i++) { const a = rnd() * TAU, s = rr(.4, 1.6) * sc; fxSmoke(x + Math.cos(a) * .3, y + rr(.2, .7), z + Math.sin(a) * .3, Math.cos(a) * s, rr(.6, 1.7), Math.sin(a) * s, rr(1.6, 3.4), rr(.7, 1.1) * sc, 1.5 * sc, .2, .19, .19, .62, { drag: 1.5, rise: .25 }); }
  fxDust(x, y, z, 6, .9 * sc, { speed: 2.6 });
  FX.shake = Math.min(1.2, FX.shake + .32 * sc);
}
function fxBolt(a, b, life = .22, col = [.55, .8, 1.6], width = .09) {
  FX.bolts.push({ a: a.slice(), b: b.slice(), life, max: life, col, width, seed: Math.floor(rnd() * 1000), re: 0, pts: null });
}
function addFlame(o) {
  const f = Object.assign({ size: 1, r: 1, g: 1, b: 1, embers: 1, glow: 1, on: 1, seed: rnd() * 10, acc: rnd(), layers: 1, alive: true, smoke: 0 }, o);
  FX.flames.push(f); return f;
}
function removeFlame(f) { if (!f) return; f.alive = false; const i = FX.flames.indexOf(f); if (i >= 0) swapRemove(FX.flames, i); }

function updateFX(dt, t) {
  const A = FX.add, AL = FX.alpha, SG = FX.segs, groundAt = FX.groundAt;
  A.begin(); AL.begin(); SG.begin();
  const rx = Math.cos(CAM.yaw), rz = -Math.sin(CAM.yaw), se = Math.sin(CAM.elev), ce = Math.cos(CAM.elev), ux = -se * Math.sin(CAM.yaw), uy = ce, uz = -se * Math.cos(CAM.yaw);
  for (const f of FX.flames) {
    const on = f.on; if (on <= .01) continue;
    const s = f.size * (.9 + .1 * on), fl = .88 + .12 * n1(t * 8 + f.seed * 3, f.seed);
    for (let k = 0; k < f.layers; k++) {
      const kk = k / Math.max(1, f.layers), w = s * (1 - kk * .28) * (.92 + .08 * fl), h = s * (1.55 - kk * .2) * (.75 + .25 * on);
      A.push(f.x + (k ? Math.sin(f.seed * 9 + k * 2.1) * s * .16 : 0), f.y - s * .08, f.z + (k ? Math.cos(f.seed * 5 + k * 1.7) * s * .16 : 0), w, h, 0, 1, f.r * 3.3, f.g * 3.3, f.b * 3.3, on, 1, f.seed + k * 3.7, 0, 0);
    }
    if (f.glow > 0) A.push(f.x, f.y + s * .5, f.z, s * 4.2, s * 4.2, 0, 0, f.r * 1.0, f.g * .5, f.b * .16, .2 * f.glow * on * fl, 2, 0, 0, 0);
    f.acc += dt * (2.2 + 5 * s) * f.embers * on;
    while (f.acc >= 1) {
      f.acc -= 1;
      fxPart(f.x + rr(-.25, .25) * s, f.y + s * rr(.3, 1.1), f.z + rr(-.25, .25) * s, rr(-.3, .3), rr(.8, 2.0) * (0.7 + s * .3), rr(-.3, .3), rr(.8, 2.0) * (.7 + s * .35), rr(.045, .085), f.r * rr(1.8, 3.2), f.g * rr(.7, 1.4), f.b * .25, { drag: .25, wob: 1, rise: .3 });
    }
    if (f.smoke > 0) { f.sacc = (f.sacc || 0) + dt * f.smoke * on; while (f.sacc >= 1) { f.sacc -= 1; fxSmoke(f.x + rr(-.2, .2) * s, f.y + s * 1.3, f.z + rr(-.2, .2) * s, rr(-.15, .15), rr(.9, 1.5), rr(-.15, .15), rr(2.5, 4.5), s * .7, s * 1.6, .16, .15, .16, .22, { drag: .25, rise: .1 }); } }
  }
  const P = FX.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i]; p.life -= dt; if (p.life <= 0) { swapRemove(P, i); continue; }
    p.vy += (p.rise - p.grav) * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
    if (p.wob) { p.vx += n1(t * 1.7 + p.seed, p.seed) * dt * 1.4; p.vz += n1(t * 1.3 + p.seed * 2, p.seed + 3) * dt * 1.4; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.bounce) { const gy = groundAt(p.x, p.z) + .03; if (p.y < gy) { p.y = gy; p.vy = -p.vy * p.bounce; p.vx *= .6; p.vz *= .6; } }
    const k = p.life / p.max, fade = Math.min(1, k * 2.5) * (p.wob ? (.7 + .3 * Math.sin(t * 30 + p.seed)) : 1);
    if (p.streak) {
      const sx = p.vx * rx + p.vz * rz, sy = p.vx * ux + p.vy * uy + p.vz * uz, sp = Math.hypot(sx, sy);
      A.push(p.x, p.y, p.z, p.size * (1 + sp * .22), p.size * .8, Math.atan2(sy, sx), 0, p.r, p.g * (.4 + .6 * k), p.b * k, fade, 6, 0, 0, 0);
    } else A.push(p.x, p.y, p.z, p.size, p.size, 0, 0, p.r, p.g * (.35 + .65 * k), p.b * k, fade, 0, 0, 0, 0);
  }
  const Sm = FX.smokes;
  for (let i = Sm.length - 1; i >= 0; i--) {
    const p = Sm[i]; p.life -= dt; if (p.life <= 0) { swapRemove(Sm, i); continue; }
    const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy = p.vy * dr + p.rise * dt; p.vz *= dr;
    p.x += (p.vx + .12) * dt; p.y += p.vy * dt; p.z += (p.vz + .05) * dt;
    const k = 1 - p.life / p.max, sz = p.size + p.grow * (1 - Math.exp(-k * 3));
    AL.push(p.x, p.y, p.z, sz, sz, p.seed, 0, p.r, p.g, p.b, p.a * Math.min(1, k * 8) * (1 - k) * (1 - k * .3), 0, p.seed, k, 0);
  }
  const Tm = FX.timed;
  for (let i = Tm.length - 1; i >= 0; i--) {
    const s = Tm[i]; s.life -= dt; if (s.life <= 0) { swapRemove(Tm, i); continue; }
    const k = 1 - s.life / s.max, g = 1 + s.grow * (1 - Math.exp(-k * 4));
    A.push(s.x, s.y, s.z, s.w * g, s.h * g, s.rot, s.anchor, s.r, s.g, s.b, s.a, s.type, s.seed, k, s.ground);
  }
  const Bo = FX.bolts;
  for (let i = Bo.length - 1; i >= 0; i--) {
    const b = Bo[i]; b.life -= dt; if (b.life <= 0) { swapRemove(Bo, i); continue; }
    b.re -= dt;
    if (!b.pts || b.re <= 0) {
      b.re = .045; const n = Math.max(3, Math.round(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]) / .45)), pts = [];
      for (let k = 0; k <= n; k++) { const u = k / n, j = Math.sin(u * PI) * .34; pts.push([lerp(b.a[0], b.b[0], u) + rr(-j, j), lerp(b.a[1], b.b[1], u) + rr(-j, j), lerp(b.a[2], b.b[2], u) + rr(-j, j)]); }
      b.pts = pts; b.fork = rnd() < .7 ? Math.floor(rr(1, n - 1)) : -1; b.fd = [rr(-1, 1), rr(-.2, .8), rr(-1, 1)];
    }
    const k = b.life / b.max, c = b.col, w = b.width * (.5 + .5 * k);
    for (let j = 0; j < b.pts.length - 1; j++) { const p = b.pts[j], q = b.pts[j + 1]; SG.push(p[0], p[1], p[2], w, q[0], q[1], q[2], w, c[0] * 4, c[1] * 4, c[2] * 4, k); SG.push(p[0], p[1], p[2], w * 3.5, q[0], q[1], q[2], w * 3.5, c[0], c[1], c[2], k * .35); }
    if (b.fork > 0) { const p = b.pts[b.fork]; SG.push(p[0], p[1], p[2], w * .7, p[0] + b.fd[0] * .7, p[1] + b.fd[1] * .7, p[2] + b.fd[2] * .7, w * .2, c[0] * 3, c[1] * 3, c[2] * 3, k); }
  }
  FX.decals.update(dt);
  FX.shake = Math.max(0, FX.shake - dt * 2.6);
  const sh = FX.shake * FX.shake; FX.shakeX = n1(t * 31, 7) * sh * .22; FX.shakeY = n1(t * 37, 9) * sh * .22;
}
function endFX() { FX.add.end(); FX.alpha.end(); FX.segs.end(); }
function clearFX() { FX.parts.length = 0; FX.smokes.length = 0; FX.timed.length = 0; FX.bolts.length = 0; FX.decals.clear(); }


// 41-weather.js

const WX = { mesh: null, u: null, fade: 1 };
function initWeather() {
  const N = 2600, g = new THREE.InstancedBufferGeometry(), rng = makeRng(4242), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng(); seed[i * 4 + 3] = (i + .5) / N; }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.instanceCount = N;
  const v2 = () => ({ value: new THREE.Vector2() }), v3 = () => ({ value: new THREE.Vector3() }), v4 = () => ({ value: new THREE.Vector4() });
  const u = WX.u = {
    uTime: SH.uTime, uLightPos: { value: R.lightPos }, uLightCol: { value: R.lightCol }, uAmb: v3(), uFade: { value: 1 }, uN: v2(),
    uVelA: v3(), uVelB: v3(), uSwayA: v2(), uSwayB: v2(), uSizeA: v2(), uSizeB: v2(), uColA: v4(), uColB: v4(), uAlA: v3(), uAlB: v3(), uYA: v2(), uYB: v2(),
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    vertexShader: `attribute vec4 iSeed; varying vec4 vCol; varying vec2 vUv; varying float vAdd;
uniform float uTime; uniform float uFade; uniform vec3 uLightPos[12]; uniform vec3 uLightCol[12]; uniform vec3 uAmb; uniform vec2 uN;
uniform vec3 uVelA; uniform vec3 uVelB; uniform vec2 uSwayA; uniform vec2 uSwayB; uniform vec2 uSizeA; uniform vec2 uSizeB; uniform vec4 uColA; uniform vec4 uColB; uniform vec3 uAlA; uniform vec3 uAlB; uniform vec2 uYA; uniform vec2 uYB;
void main(){
  float isB = step(iSeed.w, uN.y), show = step(iSeed.w, uN.x + uN.y);
  vec3 vel = mix(uVelA, uVelB, isB), al = mix(uAlA, uAlB, isB); vec2 sway = mix(uSwayA, uSwayB, isB), sz = mix(uSizeA, uSizeB, isB), yr = mix(uYA, uYB, isB); vec4 cp = mix(uColA, uColB, isB);
  float r1 = fract(iSeed.w * 91.7 + iSeed.x * 3.1), r2 = fract(iSeed.w * 357.3 + iSeed.z * 5.7), span = max(yr.y - yr.x, 0.01);
  vec3 p = vec3(iSeed.x * 48.0, iSeed.y * span, iSeed.z * 48.0) + vel * uTime * (0.65 + 0.7 * r1);
  p.x += sin(uTime * sway.y * (0.6 + r2) + iSeed.y * 40.0) * sway.x; p.z += cos(uTime * sway.y * (0.5 + r1) + iSeed.x * 40.0) * sway.x; p.y += sin(uTime * sway.y * 0.7 + r1 * 30.0) * sway.x * 0.3;
  p.x = mod(p.x, 48.0) - 24.0; p.z = mod(p.z, 48.0) - 24.0; p.y = mod(p.y, span) + yr.x;
  float size = mix(sz.x, sz.y, r2);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz; float vl = length(vv.xy); vec2 dir = vl > 0.0001 ? vv.xy / vl : vec2(0.0, 1.0);
  mv.xy += position.x * vec2(-dir.y, dir.x) * size + position.y * dir * size * (1.0 + al.z * vl);
  gl_Position = show > 0.5 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
  vec3 L = uAmb; for (int i = 0; i < 12; i++) { vec3 d = uLightPos[i] - p; L += uLightCol[i] / (dot(d, d) + 3.0); }
  float tw = al.y > 0.0 ? pow(max(0.0, sin(uTime * al.y * (0.5 + r1) + r2 * 60.0)), 4.0) : 1.0;
  float ef = smoothstep(24.0, 21.0, max(abs(p.x), abs(p.z))) * smoothstep(yr.x, yr.x + 0.5, p.y) * smoothstep(yr.y, yr.y - 1.2, p.y);
  vCol = vec4(cp.rgb * mix(vec3(1.0), L, cp.a), al.x * tw * ef * uFade); vAdd = 1.0 - cp.a; vUv = position.xy;
}`,
    fragmentShader: `precision highp float; varying vec4 vCol; varying vec2 vUv; varying float vAdd;
void main(){ float a = smoothstep(1.0, 0.25, length(vUv)) * vCol.a; gl_FragColor = vec4(vCol.rgb * a, a * (1.0 - vAdd)); }`,
  });
  WX.mesh = new THREE.Mesh(g, m); WX.mesh.frustumCulled = false; WX.mesh.renderOrder = 4; R.scene.add(WX.mesh);
}
function setWeather(w, instant) {
  const u = WX.u;
  u.uN.value.fromArray(w.n); u.uVelA.value.fromArray(w.velA); u.uVelB.value.fromArray(w.velB); u.uSwayA.value.fromArray(w.swayA); u.uSwayB.value.fromArray(w.swayB);
  u.uSizeA.value.fromArray(w.sizeA); u.uSizeB.value.fromArray(w.sizeB); u.uColA.value.fromArray(w.colA); u.uColB.value.fromArray(w.colB); u.uAlA.value.fromArray(w.alA); u.uAlB.value.fromArray(w.alB); u.uYA.value.fromArray(w.yA); u.uYB.value.fromArray(w.yB);
  WX.fade = instant ? 1 : 0; u.uFade.value = WX.fade;
}


// 50-rig.js

let RIG_CAPTURE = null;
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
    if (RIG_CAPTURE) { RIG_CAPTURE(this, mat, tint); return; }
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

function initKits() {
  const iron = COL.iron, rust = mixC(COL.ironL, C(0x7a4a2a), .45);
  KIT.skel = humanKit('skel', 96);
  KIT.foot = humanKit('foot', 40);
  KIT.giant = humanKit('giant', 8);
  KIT.ogre = humanKit('ogre', 30);
  for (const k of ['uArm', 'lArm', 'uLeg', 'lLeg']) KIT.giant[k].mesh.castShadow = true;
  const E = KIT.item = {};
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
  initBestiary();
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
const DEB = [];
const _dq = new THREE.Quaternion(), _dax = new THREE.Vector3(), _dp = new THREE.Vector3(), _ds = new THREE.Vector3(), _dm = new THREE.Matrix4();
function addDebris(batch, mat, tint, vx, vy, vz, spin, life, o = {}) {
  if (DEB.length > 520) return null;
  const d = { batch, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), vx, vy, vz, w: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(), ws: spin, life, max: life, tint: tint ? tint.slice() : null, rad: o.rad || batch.rad, rest: false, coin: o.coin || 0, bounce: o.bounce === undefined ? .32 : o.bounce, flash: o.flash || 0, goo: o.goo || 0, hold: o.hold || 0 };
  mat.decompose(d.p, d.q, d.s); d.rad *= Math.max(d.s.x, d.s.y); DEB.push(d); return d;
}
function shatter(rigFn, e, impulse, o = {}) {
  const ix = impulse[0], iy = impulse[1], iz = impulse[2], spread = o.spread === undefined ? 1.6 : o.spread;
  RIG_CAPTURE = (batch, mat, tint) => { addDebris(batch, mat, tint, ix + rr(-spread, spread), iy + rr(.4, 2.2) * (o.up || 1), iz + rr(-spread, spread), rr(3, 11), rr(3.2, 5.5) * (o.life || 1), { hold: o.hold ? rr(0, o.hold) : 0 }); };
  try { rigFn(e); } finally { RIG_CAPTURE = null; }
}
function updateDebris(dt, groundAt, onCoin) {
  for (let i = DEB.length - 1; i >= 0; i--) {
    const d = DEB[i]; d.life -= dt;
    if (d.life <= 0) { swapRemove(DEB, i); continue; }
    if (d.hold > 0) { d.hold -= dt; }
    else if (!d.rest) {
      d.vy -= 13 * dt; d.p.x += d.vx * dt; d.p.y += d.vy * dt; d.p.z += d.vz * dt;
      _dq.setFromAxisAngle(d.w, d.ws * dt); d.q.premultiply(_dq);
      const gy = groundAt(d.p.x, d.p.z) + d.rad;
      if (d.p.y < gy) {
        d.p.y = gy;
        if (d.goo) { d.life = 0; continue; }
        if (Math.abs(d.vy) < 1.2) { d.rest = true; d.vy = 0; } else { d.vy = -d.vy * d.bounce; }
        d.vx *= .55; d.vz *= .55; d.ws *= .5;
      }
    } else if (d.life < .9 && !d.coin) { d.p.y -= dt * .22; }
    if (d.coin && d.max - d.life > d.coin) { onCoin(d); swapRemove(DEB, i); continue; }
    let sc = 1; if (!d.coin && d.life < .5) sc = Math.max(.01, d.life / .5);
    _dm.compose(d.p, d.q, _ds.copy(d.s).multiplyScalar(sc));
    d.batch.put(_dm, d.flash, d.tint);
  }
}
function clearDebris() { DEB.length = 0; }


// 51-bestiary.js
function initBestiary() {
  const I = KIT.item, cloth = C(0x3b3048), clothL = C(0x6a4a78), wrap = C(0xcdbf9a), N = { rad: .2, shadow: false };

  I.hood = new PartBatch(S => {
    S.add(gDome(8, 4), { s: [.2, .17, .21], p: [0, .19, -.03], c: cloth, l: L_CLOTH });
    S.box(.34, .24, .1, 0, .1, -.15, cloth, { l: L_CLOTH }); S.box(.3, .05, .05, 0, .2, .15, clothL, { l: L_CLOTH });
    for (const s of [-1, 1]) S.box(.06, .26, .2, s * .18, .1, -.04, mulC(cloth, .8), { l: L_CLOTH });
  }, 12, N);
  I.robe = new PartBatch(S => {
    S.add(gCyl(8, .5, true), { s: [.3, 1.12, .27], p: [0, -.12, 0], c: cloth, l: L_CLOTH, dbl: true, deform: v => { if (v.y < 0) { const j = .85 + .3 * vnoise(Math.atan2(v.z, v.x) * 2 + 3, 1, 7); v.x *= j; v.z *= j; v.y += (j - 1) * .25; } }, cf: v => .7 + .3 * sat(v.y / .56 + .5) });
    S.box(.46, .1, .28, 0, .4, 0, clothL, { l: L_CLOTH }); S.cyl(.2, .05, 0, .02, 0, COL.rope, { n: 8 });
  }, 12, N);
  I.staff = new PartBatch(S => {
    S.seg([0, -.55, 0], [0, .95, 0], .028, .024, COL.woodD, { l: L_WOOD, n: 5 });
    for (let a = 0; a < 3; a++) S.seg([0, .9, 0], [Math.cos(a * 2.1) * .09, 1.08, Math.sin(a * 2.1) * .09], .02, .008, COL.bone, { l: L_BONE, n: 4 });
    S.ico(.075, 0, 1.06, 0, [.35, 1, .5], { d: 1, emis: .2, jit: 0 });
  }, 12, N);
  I.drum = new PartBatch(S => {
    const T = new Soup(); T.cyl(.2, .2, 0, 0, 0, C(0x7a2c24), { n: 10, l: L_WOOD }); T.cyl(.205, .03, 0, .1, 0, C(0xc9b28a), { n: 10 }); T.cyl(.212, .025, 0, -.09, 0, COL.brass, { n: 10, l: L_METAL }); T.cyl(.212, .025, 0, .08, 0, COL.brass, { n: 10, l: L_METAL });
    S.merge(T, { p: [0, .1, .28], r: [.5, 0, 0], ao: null }); S.box(.05, .5, .03, .05, .26, .13, COL.leather, { r: [0, 0, .55] });
  }, 8, N);
  I.standard = new PartBatch(S => {
    S.seg([0, .1, -.14], [0, 1.55, -.2], .022, .018, COL.woodD, { l: L_WOOD, n: 4 }); S.seg([-.2, 1.42, -.2], [.2, 1.42, -.2], .016, .016, COL.woodD, { l: L_WOOD, n: 4 });
    clothPanel(S, { x0: -.18, x1: .18, yTop: 1.41, len: .56, z: -.2, col: COL.clothR, col2: mulC(COL.gold, .6), rng: makeRng(21), sway: 0, nx: 3, ny: 5 });
    PROP.skull(S, 0, 1.62, -.2, .07, 0);
  }, 8, { rad: .3, shadow: false });
  I.stick = new PartBatch(S => { S.seg([0, -.05, 0], [0, .3, 0], .02, .018, COL.bone, { l: L_BONE, n: 4 }); S.ico(.04, 0, .32, 0, COL.boneD, { d: 0, l: L_BONE }); }, 8, N);
  I.keg = new PartBatch(S => {
    const T = new Soup(); PROP.barrel(T, 0, 0, 0, .8, makeRng(3)); S.merge(T, { p: [.215, .26, -.24], r: [0, 0, HPI], ao: null });
    S.seg([0, .4, -.24], [.05, .52, -.22], .012, .01, COL.rope, { n: 3 }); S.ico(.035, .05, .53, -.22, COL.ember, { d: 0, emis: .6, jit: 0 });
    S.box(.05, .5, .03, 0, .22, .12, COL.leather, { r: [0, 0, .5] });
  }, 12, N);
  I.wraps = new PartBatch(S => {
    let k = 0; for (const [y, w, rz] of [[.12, .3, .1], [.2, .33, -.12], [.29, .35, .08], [.37, .37, -.06]]) S.box(w, .05, .25, 0, y, 0, mulC(wrap, .8 + .1 * (k++ & 1) * 3), { l: L_CLOTH, r: [0, 0, rz] });
    S.box(.05, .3, .02, .1, -.08, .12, wrap, { l: L_CLOTH, r: [0, 0, .15] });
  }, 12, N);
  I.wrapHead = new PartBatch(S => { S.cyl(.16, .07, 0, .26, 0, wrap, { n: 8, l: L_CLOTH }); S.cyl(.158, .05, 0, .09, .01, mulC(wrap, .85), { n: 8, l: L_CLOTH }); S.box(.04, .22, .02, .1, .06, -.15, wrap, { l: L_CLOTH, r: [.3, 0, .2] }); }, 12, N);
  I.crown = new PartBatch(S => {
    const g = mulC(COL.gold, .9);
    S.cyl(.165, .07, 0, .3, 0, g, { n: 8, l: L_METAL, rough: .35, emis: .03 });
    for (let a = 0; a < 6; a++) S.cone(.03, .12, Math.cos(a * 1.047) * .15, .39, Math.sin(a * 1.047) * .15, g, { n: 4, l: L_METAL, rough: .35, emis: .03 });
    for (const s of [-1, 1]) S.box(.05, .3, .16, s * .17, .12, -.02, C(0x2a4a8a), { l: L_CLOTH });
    S.ico(.03, 0, .31, .16, [.2, .9, .8], { d: 0, emis: .3, jit: 0 });
  }, 2, N);
  I.khopesh = new PartBatch(S => {
    const g = mulC(COL.gold, .85); S.box(.04, .2, .04, 0, 0, 0, COL.leather, {}); S.box(.14, .03, .05, 0, .11, 0, g, { l: L_METAL });
    let p = [.24, 0]; for (const [y, z] of [[.4, .03], [.52, .1], [.62, .2], [.66, .32]]) { const dy = y - p[0], dz = z - p[1], l = Math.hypot(dy, dz); S.box(.02, l + .02, .075, 0, (y + p[0]) / 2, (z + p[1]) / 2, g, { l: L_METAL, rough: .35, r: [Math.atan2(dz, dy), 0, 0] }); p = [y, z]; }
    S.box(.02, .14, .07, 0, .18, 0, g, { l: L_METAL, rough: .35 });
  }, 2, N);
  I.iceclub = new PartBatch(S => {
    S.seg([0, -.12, 0], [0, .5, 0], .045, .06, COL.wood, { l: L_WOOD, n: 6 });
    for (let a = 0; a < 5; a++) S.add(gOct(), { s: [.09, .25, .09], p: [Math.cos(a * 1.26) * .07, .6 + (a & 1) * .06, Math.sin(a * 1.26) * .07], r: [Math.sin(a * 1.26) * .5, a, -Math.cos(a * 1.26) * .5], c: COL.ice, rough: .15, emis: .05 });
  }, 2, { rad: .1, shadow: false });


}

// 60-towers.js
function blueprint(kind, lvl) {
  const pieces = [], mounts = {};
  const piece = (id, order, fn) => {
    const S = new Soup(); fn(S); if (!S.verts) return; let minY = 1e9; for (let i = 1; i < S.P.length; i += 3) minY = Math.min(minY, S.P[i]);
    for (let i = 1; i < S.P.length; i += 3) S.P[i] -= minY; pieces.push({ id, order, y: minY, soup: S });
  };
  const w = COL.wood, wd = COL.woodD, wl = COL.woodL, st = COL.stone, sdk = COL.stoneD, sl = COL.stoneL, iron = COL.iron, rng = soupRng;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const brazier = (S, x, y, z, bs) => {
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + .5; S.seg([x + Math.cos(a) * bs * .42, y, z + Math.sin(a) * bs * .42], [x + Math.cos(a) * bs * .2, y + bs * .5, z + Math.sin(a) * bs * .2], .028, .028, iron, { l: L_METAL, n: 4 }); }
    S.cyl(bs * .3, bs * .22, x, y + bs * .56, z, iron, { n: 8, l: L_METAL, rt: 1.5, rough: .6 });
    S.cyl(bs * .4, .04, x, y + bs * .68, z, COL.ember, { n: 8, emis: .55, jit: 0 });
  };
  if (kind === 'archer') {
    const bH = [.25, 1.0, 1.9][lvl], H = [2.0, 2.7, 3.35][lvl], W = [.75, .85, .93][lvl], bs = [.5, .62, .8][lvl];
    piece('base', 0, S => {
      if (lvl === 0) { S.box(1.6, .25, 1.6, 0, .125, 0, sdk, { l: L_MASON }); for (const [a, b] of corners) S.box(.3, .32, .3, a * .66, .16, b * .66, sl, { l: L_MASON }); }
      else {
        S.box(1.8, .3, 1.8, 0, .15, 0, sdk, { l: L_MASON });
        S.cyl(1.02, bH - .3, 0, .3 + (bH - .3) / 2, 0, st, { n: 4, l: L_MASON, rt: .9, r: [0, PI / 4, 0] });
        S.box(1.42, .14, 1.42, 0, bH - .04, 0, sl, { l: L_MASON });
        S.box(.3, .5, .06, 0, .56, .71, COL.black, { jit: 0 });
        if (lvl === 2) { for (const [a, b] of corners) for (let q = 0; q < 3; q++) S.box(.22, .2, .22, a * (.7 - q * .025), .5 + q * .5, b * (.7 - q * .025), sl, { l: L_MASON }); for (const sg of [-1, 1]) S.box(.06, .5, .12, sg * .7, 1.1, 0, COL.black, { jit: 0 }); }
      }
    });
    piece('posts', 1, S => {
      for (const [a, b] of corners) S.seg([a * .62, bH, b * .62], [a * (W - .1), H, b * (W - .1)], .085, .075, wd, { l: L_WOOD });
      const ym = (bH + H) / 2, r = lerp(.62, W - .1, .5);
      for (let k = 0; k < 4; k++) { const [a, b] = corners[k], [c, d] = corners[(k + 1) % 4]; S.seg([a * r, ym, b * r], [c * r, ym, d * r], .05, .05, w, { l: L_WOOD, n: 4 }); }
    });
    piece('brace', 2, S => {
      for (let k = 0; k < 4; k++) { const [a, b] = corners[k], [c, d] = corners[(k + 1) % 4]; S.seg([a * .62, bH + .1, b * .62], [c * (W - .12), H - .15, d * (W - .12)], .035, .035, w, { l: L_WOOD, n: 4 }); S.seg([c * .62, bH + .1, d * .62], [a * (W - .12), H - .15, b * (W - .12)], .035, .035, wl, { l: L_WOOD, n: 4 }); }
    });
    piece('deck', 3, S => {
      S.box(W * 2 + .16, .1, W * 2 + .16, 0, H + .05, 0, w, { l: L_WOOD }); for (const sg of [-1, 1]) S.box(W * 2 + .3, .09, .1, 0, H - .04, sg * (W - .1), wd, { l: L_WOOD });
      for (const sg of [-1, 1]) S.box(.1, .09, W * 2 + .3, sg * (W - .1), H - .04, 0, wd, { l: L_WOOD });
      if (lvl >= 1) for (const [a, b] of corners) S.seg([a * (W - .1), H - .55, b * (W - .1)], [a * (W + .06), H - .02, b * (W + .06)], .04, .04, wd, { l: L_WOOD, n: 4 });
    });
    piece('rail', 4, S => {
      const y0 = H + .1;
      for (let k = 0; k < 4; k++) {
        const ang = k * HPI, cs = Math.cos(ang), sn = Math.sin(ang);
        for (let j = 0; j < 5; j++) {
          if (k === 2 && (j === 1 || j === 2)) continue;
          const u = (j - 2) * W * .42, hh = (j & 1) ? .34 : .5, x = u * cs + (W + .02) * sn, z = -u * sn + (W + .02) * cs;
          S.box(W * .4, hh, .06, x, y0 + hh / 2, z, (j & 1) ? w : wl, { l: L_WOOD, r: [0, ang, 0] });
        }
      }
      for (const [a, b] of corners) S.box(.1, .66, .1, a * (W + .02), y0 + .33, b * (W + .02), wd, { l: L_WOOD });
      if (lvl >= 1) for (const u of lvl === 2 ? [-.5, 0, .5] : [-.35, .35]) { S.cyl(.2, .04, u, y0 + .22, W + .08, lvl === 2 ? COL.ironL : COL.clothB, { n: 8, r: [HPI, 0, 0], l: lvl === 2 ? L_METAL : L_WOOD }); S.sph(.05, u, y0 + .22, W + .11, COL.ironL, { l: L_METAL, w: 5, h: 3, smooth: false }); }
      if (lvl === 2) for (const sg of [-1, 1]) S.cyl(.2, .04, sg * (W + .08), y0 + .22, .1, COL.clothR, { n: 8, r: [0, 0, HPI], l: L_WOOD });
    });
    piece('ladder', 5, S => {
      for (const sg of [-1, 1]) S.seg([sg * .17, 0, -W - .5], [sg * .17, H + .15, -W - .06], .035, .035, wd, { l: L_WOOD, n: 4 });
      for (let y = .3; y < H; y += .34) { const u = y / (H + .15); S.box(.36, .04, .05, 0, y, lerp(-W - .5, -W - .06, u), wl, { l: L_WOOD }); }
    });
    const bx = -W + .34, bz = -W + .36, by = H + .1 + (lvl === 2 ? .35 : 0);
    piece('brazier', 6, S => { if (lvl === 2) S.cyl(.2, .38, bx, H + .29, bz, sdk, { n: 6, l: L_MASON }); brazier(S, bx, by, bz, bs); });
    if (lvl >= 1) piece('flag', 7, S => { S.seg([W - .08, H + .1, -W + .08], [W - .08, H + 1.75, -W + .08], .035, .025, wd, { l: L_WOOD, n: 4 }); const T = new Soup(); clothPanel(T, { x0: 0, x1: .62, yTop: 0, len: .36, z: 0, col: COL.clothR, rng, nx: 3, ny: 2, rag: 0, sway: 1.2 }); S.merge(T, { p: [W - .06, H + 1.7, -W + .08], ao: null }); });
    mounts.flame = [bx, by + bs * .7, bz]; mounts.flameSize = bs; mounts.top = H + 1.7;
    mounts.archers = [[[.12, H + .1, .28]], [[-.3, H + .1, .42], [.42, H + .1, .1]], [[-.35, H + .1, .5], [.5, H + .1, .3], [.25, H + .1, -.4]]][lvl];
  } else if (kind === 'bombard') {
    const Rr = [1.0, 1.08, 1.15][lvl], H = [1.1, 1.5, 1.9][lvl];
    piece('plinth', 0, S => { S.cyl(Rr + .22, .26, 0, .13, 0, sdk, { n: 10, l: L_MASON }); if (lvl === 2) S.cyl(Rr + .12, .2, 0, .36, 0, st, { n: 10, l: L_MASON }); });
    piece('drum', 1, S => {
      S.cyl(Rr, H, 0, H / 2, 0, st, { n: 10, l: L_MASON, rt: .93, jit: .03 });
      for (let c = 0; c < 2 + lvl; c++) S.cyl(Rr * (1 - .05 * (.5 + c) / (2 + lvl)) + .012, .16, 0, .35 + c * (H - .5) / (1.5 + lvl), 0, mixC(sdk, sl, rng()), { n: 10, l: L_MASON });
      S.box(.34, .55, .1, 0, .3, Rr * .97, COL.black, { jit: 0 });
    });
    if (lvl >= 1) piece('butt', 2, S => { for (let k = 0; k < 4; k++) { const a = k * HPI + PI / 4; S.box(.36, H * .8, .5, Math.cos(a) * (Rr + .06), H * .36, Math.sin(a) * (Rr + .06), sdk, { l: L_MASON, r: [0, -a + HPI, 0] }); S.box(.4, .12, .56, Math.cos(a) * (Rr + .06), H * .78, Math.sin(a) * (Rr + .06), sl, { l: L_MASON, r: [0, -a + HPI, 0] }); } });
    if (lvl >= 1) piece('bands', 3, S => { for (const y of lvl === 2 ? [H * .45, H * .8] : [H * .65]) S.cyl(Rr * .965 + .02, .07, 0, y, 0, iron, { n: 10, l: L_METAL, rough: .55 }); });
    piece('deck', 4, S => { S.cyl(Rr * .93 + .14, .16, 0, H + .02, 0, sl, { n: 10, l: L_MASON }); S.cyl(Rr * .8, .06, 0, H + .12, 0, w, { n: 10, l: L_WOOD }); });
    piece('rim', 5, S => { for (let k = 0; k < 10; k++) { if (k % 5 === 0) continue; const a = (k + .5) / 10 * TAU + HPI; S.box(.46, .34, .22, Math.cos(a) * Rr * .96, H + .27, Math.sin(a) * Rr * .96, lvl === 2 && (k & 1) ? iron : mixC(sdk, sl, rng()), { l: lvl === 2 && (k & 1) ? L_METAL : L_MASON, r: [0, -a + HPI, 0] }); } });
    piece('ammo', 6, S => { for (const [x, z] of [[-.42, -.5], [-.24, -.52], [-.33, -.36]]) S.sph(.09, x, H + .22, z, mulC(iron, .8), { l: L_METAL, w: 6, h: 4, smooth: false }); S.sph(.09, -.33, H + .36, -.46, mulC(iron, .8), { l: L_METAL, w: 6, h: 4, smooth: false }); PROP.barrel(S, .45, H + .13, -.5, .75, rng); });
    const lx = -Rr * .78, lz = .2, lh = H + 1.25 + lvl * .12;
    piece('lantern', 7, S => {
      for (const sg of lvl === 2 ? [-1, 1] : [1]) {
        const x = lx * sg;
        S.seg([x, H + .1, lz], [x, lh, lz], .04, .035, iron, { l: L_METAL, n: 4 }); S.seg([x, lh, lz], [x - sg * -.0, lh, lz + .32], .03, .03, iron, { l: L_METAL, n: 4 });
        S.box(.2, .05, .2, x, lh - .08, lz + .32, iron, { l: L_METAL }); S.box(.16, .2, .16, x, lh - .22, lz + .32, COL.ember, { emis: .8, jit: 0 }); S.box(.2, .04, .2, x, lh - .34, lz + .32, iron, { l: L_METAL });
        for (const [a, b] of corners) S.box(.025, .22, .025, x + a * .09, lh - .22, lz + .32 + b * .09, iron, { l: L_METAL });
      }
    });
    mounts.flame = [lx, lh - .3, lz + .32]; mounts.flameSize = .26 + lvl * .05; mounts.flame2 = lvl === 2 ? [-lx, lh - .3, lz + .32] : null; mounts.top = H + 1.6;
    mounts.gun = [0, H + .15, .05]; mounts.gunLen = [.95, 1.12, 1.25][lvl]; mounts.gunR = [.15, .18, .215][lvl];
  } else if (kind === 'spire') {
    const H = [2.7, 3.4, 4.1][lvl], bas = COL.basalt, basL = COL.basaltL, cu = C(0x8a5a3a);
    piece('plinth', 0, S => { S.box(1.55, .22, 1.55, 0, .11, 0, basL, { l: L_ROCK }); S.box(1.18, .2, 1.18, 0, .32, 0, bas, { l: L_ROCK }); if (lvl >= 1) for (const [a, b] of corners) S.cone(.16, .5, a * .62, .5, b * .62, basL, { n: 4, l: L_ROCK }); });
    piece('shaft', 1, S => {
      S.cyl(.62, H - .42, 0, .42 + (H - .42) / 2, 0, bas, { n: 4, l: L_ROCK, rt: .52, r: [0, PI / 4, 0], jit: .03 });
      for (let k = 0; k < 4; k++) { const a = k * HPI, n = 3 + lvl; for (let j = 0; j < n; j++) { const u = (j + .7) / (n + .6), y = .42 + u * (H - .42), rr2 = lerp(.62, .32, u) * .7072 + .012; S.box(.07, .2, .02, Math.sin(a) * rr2, y, Math.cos(a) * rr2, COL.crystal, { emis: .5, jit: 0, r: [-.12, a, 0], ro: 'YXZ' }); } }
    });
    if (lvl >= 1) piece('bands', 2, S => { for (const u of lvl === 2 ? [.3, .58, .82] : [.4, .75]) S.cyl(lerp(.62, .32, u) + .03, .09, 0, .42 + u * (H - .42), 0, cu, { n: 4, l: L_METAL, r: [0, PI / 4, 0], rough: .45 }); });
    piece('claws', 3, S => { for (let k = 0; k < 4; k++) { const a = k * HPI + PI / 4, cs = Math.cos(a), sn = Math.sin(a); S.seg([cs * .22, H - .12, sn * .22], [cs * .46, H + .26, sn * .46], .06, .045, basL, { l: L_ROCK, n: 4 }); S.seg([cs * .46, H + .26, sn * .46], [cs * .26, H + .74, sn * .26], .045, .012, lvl ? cu : basL, { l: lvl ? L_METAL : L_ROCK, n: 4 }); } S.cyl(.34, .12, 0, H - .02, 0, basL, { n: 4, l: L_ROCK, r: [0, PI / 4, 0] }); });
    mounts.crystal = [0, H + .42, 0]; mounts.crystalS = [.2, .24, .29][lvl]; mounts.shards = [0, 2, 4][lvl]; mounts.rings = lvl === 2; mounts.top = H + 1.2; mounts.flame = null; mounts.lightAt = [0, H + .45, 0];
  } else {
    const W = [1.5, 1.7, 1.9][lvl], D = [1.3, 1.4, 1.5][lvl], wh = [1.05, 1.25, 1.5][lvl], stoneWalls = lvl === 2;
    piece('floor', 0, S => { S.box(W + .5, .16, D + .7, 0, .08, .1, sdk, { l: L_MASON }); S.box(.7, .1, .4, 0, .05, D / 2 + .55, st, { l: L_MASON }); });
    piece('walls', 1, S => {
      const wc = stoneWalls ? st : C(0x8f8468), wlay = stoneWalls ? L_MASON : L_PLAIN;
      if (lvl === 1) S.box(W + .04, .5, D + .04, 0, .41, 0, st, { l: L_MASON });
      S.box(W, wh, D, 0, .16 + wh / 2, 0, wc, { l: wlay, jit: .03 });
      if (!stoneWalls) { for (const [a, b] of corners) S.box(.12, wh + .04, .12, a * W / 2, .16 + wh / 2, b * D / 2, wd, { l: L_WOOD }); for (const sg of [-1, 1]) { S.box(W, .1, .08, 0, .16 + wh * .55, sg * D / 2, wd, { l: L_WOOD }); S.seg([sg * W * .5, .2, D / 2 + .01], [sg * W * .22, .16 + wh, D / 2 + .01], .04, .04, wd, { l: L_WOOD, n: 4 }); } S.box(.08, .1, D, W / 2, .16 + wh * .55, 0, wd, { l: L_WOOD }); S.box(.08, .1, D, -W / 2, .16 + wh * .55, 0, wd, { l: L_WOOD }); }
      S.box(.5, .82, .12, 0, .57, D / 2, COL.black, { jit: 0 }); S.box(.66, .1, .16, 0, 1.02, D / 2 + .02, wd, { l: L_WOOD }); for (const sg of [-1, 1]) S.box(.09, .86, .16, sg * .29, .59, D / 2 + .02, wd, { l: L_WOOD });
      S.box(.24, .24, .08, W * .32, .16 + wh * .62, D / 2 + .01, COL.black, { jit: 0 }); S.box(.08, .3, .3, W / 2 + .01, .16 + wh * .6, 0, COL.black, { jit: 0 });
    });
    piece('roof', 2, S => {
      const rl = lvl === 0 ? L_THATCH : L_SLATE, rc = lvl === 0 ? COL.thatch : COL.slate, y0 = .16 + wh, rh = [.75, .85, .9][lvl], sl2 = Math.atan2(rh, D / 2 + .2), len = Math.hypot(rh, D / 2 + .2) + .12;
      for (const sg of [-1, 1]) S.box(W + .36, .09, len, 0, y0 + rh / 2 - .02, sg * (D / 4 + .1), rc, { l: rl, r: [sg * sl2, 0, 0] });
      for (const sg of [-1, 1]) { const T = [[sg * W / 2, y0, -D / 2], [sg * W / 2, y0, D / 2], [sg * W / 2, y0 + rh, 0]]; const gc = stoneWalls ? st : C(0x8f8468); if (sg > 0) S.tri(T[0], T[2], T[1], gc, stoneWalls ? L_MASON : L_PLAIN, .95); else S.tri(T[0], T[1], T[2], gc, stoneWalls ? L_MASON : L_PLAIN, .95); }
      S.box(W + .44, .1, .14, 0, y0 + rh + .02, 0, wd, { l: L_WOOD });
      S.box(.26, .5, .26, -W * .3, y0 + rh * .7 + .1, -D * .2, sdk, { l: L_MASON });
    });
    piece('rack', 3, S => { const x = -W / 2 - .28; S.box(.06, .7, .06, x, .5, -.3, wd, { l: L_WOOD }); S.box(.06, .7, .06, x, .5, .3, wd, { l: L_WOOD }); S.box(.05, .05, .7, x, .78, 0, w, { l: L_WOOD }); for (const z of [-.2, 0, .2]) { S.seg([x + .06, .12, z], [x - .04, 1.5, z], .018, .018, wl, { l: L_WOOD, n: 4 }); S.cone(.035, .14, x - .045, 1.56, z, COL.steel, { n: 4, l: L_METAL }); } if (lvl >= 1) { S.cyl(.2, .04, W / 2 + .03, .75, -.25, COL.clothB, { n: 8, r: [0, 0, HPI], l: L_WOOD }); } });
    if (lvl === 2) piece('turret', 4, S => { const x = W / 2 - .2, z = -D / 2 + .2, th = 2.7; S.box(.8, th, .8, x, th / 2 + .16, z, st, { l: L_MASON }); S.box(.94, .16, .94, x, th + .2, z, sl, { l: L_MASON }); for (const [a, b] of corners) S.box(.24, .26, .24, x + a * .35, th + .4, z + b * .35, mixC(sdk, sl, rng()), { l: L_MASON }); S.box(.1, .4, .06, x, th * .7, z + .41, COL.black, { jit: 0 }); });
    const fx = W / 2 + .12, fz = D / 2 + .5, bs = [.34, .46, .6][lvl];
    piece('fire', 5, S => { if (lvl === 0) { S.seg([fx, 0, fz], [fx, 1.05, fz], .04, .035, wd, { l: L_WOOD, n: 4 }); S.cyl(.07, .12, fx, 1.1, fz, iron, { n: 6, l: L_METAL, rt: 1.4 }); } else brazier(S, fx, .08, fz, bs + .1); });
    piece('flag', 6, S => { const x = lvl === 2 ? W / 2 - .2 : -W / 2 + .1, z = lvl === 2 ? -D / 2 + .2 : -D / 2 + .1, y0 = lvl === 2 ? 3.1 : .2, y1 = lvl === 2 ? 4.5 : 2.9; S.seg([x, y0, z], [x, y1, z], .04, .028, wd, { l: L_WOOD, n: 4 }); const T = new Soup(); clothPanel(T, { x0: 0, x1: .7, yTop: 0, len: .46, z: 0, col: COL.clothB, col2: mulC(COL.gold, .6), rng, nx: 4, ny: 3, rag: .2, sway: 1.1 }); S.merge(T, { p: [x + .03, y1 - .06, z], ao: null }); });
    mounts.flame = lvl === 0 ? [fx, 1.2, fz] : [fx, .08 + (bs + .1) * .72, fz]; mounts.flameSize = bs; mounts.door = [0, 0, D / 2 + .45]; mounts.top = lvl === 2 ? 3.4 : 2.2;
  }
  pieces.sort((a, b) => a.order - b.order);
  return { pieces, mounts };
}



// 90-main.js
const CAM = { yaw: PI / 4, elev: 38 * PI / 180, dist: 90, x: 0, y: 0, z: 0, zoom: 1, fx: 0, fz: 0, sx: 0, sz: 0 };
const _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _cd = new THREE.Vector3(), _ct = new THREE.Vector3();
function applyCamera() {
  const cam = R.cam, e = CAM.elev, sy = Math.sin(CAM.yaw), cy = Math.cos(CAM.yaw);
  _cd.set(Math.cos(e) * sy, Math.sin(e), Math.cos(e) * cy); _cr.set(cy, 0, -sy); _cu.set(-Math.sin(e) * sy, Math.cos(e), -Math.sin(e) * cy);
  const aspect = R.dw / R.dh, base = Math.max(R.viewH, R.fitW / aspect), vh = base / CAM.zoom;
  R.px = vh / R.ih; R.viewW = vh * aspect; R.dofScale = base / R.viewH / CAM.zoom;
  _ct.set(CAM.x, CAM.y, CAM.z).addScaledVector(_cr, FX.shakeX).addScaledVector(_cu, FX.shakeY - R.shiftY);
  const u = _ct.dot(_cr), v = _ct.dot(_cu), us = Math.round(u / R.px) * R.px, vs = Math.round(v / R.px) * R.px;
  R.sub.set((u - us) / R.px, (v - vs) / R.px);
  R.ditherOfs.set(((Math.round(us / R.px) % 8) + 8) % 8, ((Math.round(vs / R.px) % 8) + 8) % 8);
  _ct.addScaledVector(_cr, us - u).addScaledVector(_cu, vs - v);
  cam.left = -vh * aspect / 2; cam.right = vh * aspect / 2; cam.top = vh / 2; cam.bottom = -vh / 2; cam.near = 1; cam.far = 210;
  cam.position.copy(_ct).addScaledVector(_cd, CAM.dist); cam.up.set(0, 1, 0); cam.lookAt(_ct);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  R.focusZ = CAM.dist;
  R.dofD = (BH - _ct.x) * _cd.x - _ct.y * _cd.y + (BH - _ct.z) * _cd.z;
}

export {THREE,R,CAM,FX,LT,SH,MAT,BIOMES,BIOME,KIT,SPEC,Soup,buildBoard,disposeBoard,blueprint,pathAt,beginParts,endParts,rigHuman,shatter,updateDebris,clearDebris,initRenderer,initMaterials,resizeRenderer,initLights,initFX,initWeather,initKits,setBiomeLook,addFlame,clearFX,updateFX,endFX,updateLights,updateTorchLights,collectMistLights,applyCamera,renderFrame,lightFlash,fxBolt,fxExplosion,fxSparks,fxDust,fxEmbers,fxSmoke};
