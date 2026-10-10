// WebValo engine — Three.js first-person shooter.
// One file owns the whole match: world, player, weapons, abilities, bots, HUD.

import * as THREE from 'three';
import { getWeapon, BLADE_STORM } from './weapons.js';
import { CLIPS } from './models.js';
import { settings } from './settings.js';

const BOT_COUNT = 5;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;
const GRAVITY = 22;
const RESPAWN_DELAY = 3;

// ---------------------------------------------------------------- audio
// Per-weapon-class gunshot timbre (lowpass cutoff, length, level, low-end body).
const SHOT_PROFILES = {
  SIDEARM: { freq: 2600, len: 0.08, gain: 0.20, body: 0 },
  SMG:     { freq: 2200, len: 0.06, gain: 0.16, body: 0 },
  RIFLE:   { freq: 2900, len: 0.10, gain: 0.22, body: 150 },
  SNIPER:  { freq: 1500, len: 0.24, gain: 0.30, body: 90 },
  HEAVY:   { freq: 2050, len: 0.075, gain: 0.20, body: 120 },
  ULT:     { freq: 3400, len: 0.05, gain: 0.10, body: 0 },
};

class Sfx {
  constructor() { this.ctx = null; this.master = null; }
  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
  }
  play(type, arg = null) {
    try {
      this.ensure();
      this.master.gain.value = settings.volume; // live master volume
      const ctx = this.ctx, t = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(this.master);
      if (type === 'shot' || type === 'botshot') {
        const prof = type === 'botshot' ? { freq: 1100, len: 0.09, gain: 0.08, body: 0 }
          : (SHOT_PROFILES[arg && arg.type] || { freq: 2400, len: 0.09, gain: 0.22, body: 0 });
        const jitter = 0.92 + Math.random() * 0.16; // subtle per-shot variation
        const len = prof.len, buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * len)), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = prof.freq * jitter;
        src.connect(f); f.connect(gain);
        gain.gain.setValueAtTime(prof.gain, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + len);
        src.start(t);
        if (prof.body) {
          const o = ctx.createOscillator(); o.type = 'sine';
          o.frequency.setValueAtTime(prof.body * jitter, t);
          o.frequency.exponentialRampToValueAtTime(prof.body * 0.5, t + len);
          const bg = ctx.createGain(); bg.connect(this.master);
          bg.gain.setValueAtTime(prof.gain * 0.85, t); bg.gain.exponentialRampToValueAtTime(0.001, t + len * 1.4);
          o.connect(bg); o.start(t); o.stop(t + len * 1.5);
        }
      } else if (type === 'streak') {
        const count = Math.min(arg || 2, 6), base = 520;
        for (let i = 0; i < count; i++) {
          const tt = t + i * 0.07;
          const o = ctx.createOscillator(); o.type = 'triangle';
          o.frequency.setValueAtTime(base * Math.pow(1.18, i), tt);
          const og = ctx.createGain(); og.connect(this.master);
          og.gain.setValueAtTime(0.0001, tt);
          og.gain.exponentialRampToValueAtTime(0.12, tt + 0.01);
          og.gain.exponentialRampToValueAtTime(0.001, tt + 0.14);
          o.connect(og); o.start(tt); o.stop(tt + 0.16);
        }
      } else if (type === 'hit') {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(880, t);
        o.connect(gain); gain.gain.setValueAtTime(0.06, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        o.start(t); o.stop(t + 0.08);
      } else if (type === 'kill') {
        const o = ctx.createOscillator(); o.type = 'square';
        o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(990, t + 0.07);
        o.connect(gain); gain.gain.setValueAtTime(0.09, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.start(t); o.stop(t + 0.2);
      } else if (type === 'boom') {
        const len = 0.5, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
        src.connect(f); f.connect(gain);
        gain.gain.setValueAtTime(0.5, t); gain.gain.exponentialRampToValueAtTime(0.001, t + len);
        src.start(t);
      } else if (type === 'ability') {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(440, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.18);
        o.connect(gain); gain.gain.setValueAtTime(0.08, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.start(t); o.stop(t + 0.25);
      } else if (type === 'reload') {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t);
        o.connect(gain); gain.gain.setValueAtTime(0.07, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.start(t); o.stop(t + 0.13);
      }
    } catch { /* audio is best-effort */ }
  }
}

// ---------------------------------------------------------------- map
// FORGE — industrial district. Two sites, a mid corridor, crates and ramps.
function buildMap(scene) {
  const colliders = []; // AABB boxes for player + bullet collision
  const shootables = []; // meshes raycast for bullets

  // Vibrant, saturated, high-contrast Valorant-inspired palette & materials
  const matFloor = new THREE.MeshStandardMaterial({ color: 0x1a2634, roughness: 0.8, metalness: 0.15 });
  const matWall = new THREE.MeshStandardMaterial({ color: 0x2e3f52, roughness: 0.75, metalness: 0.1 });
  const matCrate = new THREE.MeshStandardMaterial({ color: 0x4a5d73, roughness: 0.65, metalness: 0.25 });
  const matAccent = new THREE.MeshStandardMaterial({ color: 0xff3848, emissive: 0xff3848, emissiveIntensity: 0.95, roughness: 0.25 });
  const matTeal = new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.9, roughness: 0.2 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x0f1722, roughness: 0.95 });

  function box(w, h, d, x, y, z, mat = matCrate, solid = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    if (solid) {
      m.geometry.computeBoundingBox();
      const bb = new THREE.Box3().setFromObject(m);
      colliders.push(bb);
      shootables.push(m);
    }
    return m;
  }

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  shootables.push(floor);

  // floor grid helper with vibrant cyan accent
  const grid = new THREE.GridHelper(120, 60, 0x00f5ff, 0x243447);
  grid.position.y = 0.01;
  scene.add(grid);

  // perimeter walls (60 x 60 play area)
  const W = 30, H = 6;
  box(2 * W + 2, H, 1, 0, H / 2, -W, matWall);
  box(2 * W + 2, H, 1, 0, H / 2, W, matWall);
  box(1, H, 2 * W + 2, -W, H / 2, 0, matWall);
  box(1, H, 2 * W + 2, W, H / 2, 0, matWall);

  // mid corridor walls
  box(1, 3.4, 18, -6, 1.7, 0, matWall);
  box(1, 3.4, 18, 6, 1.7, 0, matWall);
  box(10, 3.4, 1, 0, 1.7, -14, matWall);
  box(10, 3.4, 1, 0, 1.7, 14, matWall);

  // A site (north-west)
  box(8, 2.6, 8, -18, 1.3, -18, matDark);            // raised platform block
  box(2.2, 2.2, 2.2, -12, 1.1, -20, matCrate);
  box(2.2, 2.2, 2.2, -22, 1.1, -12, matCrate);
  box(2.2, 1.1, 2.2, -12, 0.55, -12, matCrate);
  box(6, 0.4, 6, -18, 0.2, -18, matAccent, false);  // glowing site pad

  // B site (south-east)
  box(8, 2.6, 8, 18, 1.3, 18, matDark);
  box(2.2, 2.2, 2.2, 12, 1.1, 20, matCrate);
  box(2.2, 2.2, 2.2, 22, 1.1, 12, matCrate);
  box(2.2, 1.1, 2.2, 12, 0.55, 12, matCrate);
  box(6, 0.4, 6, 18, 0.2, 18, matTeal, false);

  // scattered cover
  const coverSpots = [
    [-14, 6], [14, -6], [-20, 8], [20, -8], [0, -22], [0, 22],
    [-8, -8], [8, 8], [-24, -2], [24, 2], [10, -18], [-10, 18],
  ];
  for (const [x, z] of coverSpots) box(2, 1.6, 2, x, 0.8, z, matCrate);

  // tall pillars
  box(1.6, 5, 1.6, -15, 2.5, 2, matWall);
  box(1.6, 5, 1.6, 15, 2.5, -2, matWall);

  // accent strips on perimeter
  for (let i = -2; i <= 2; i++) {
    box(6, 0.18, 0.12, i * 12, 3.4, -W + 0.6, i % 2 ? matAccent : matTeal, false);
    box(6, 0.18, 0.12, i * 12, 3.4, W - 0.6, i % 2 ? matTeal : matAccent, false);
  }

  // Atmospheric lighting & vibrant fog
  scene.fog = new THREE.FogExp2(0x0a111a, 0.013);
  scene.background = new THREE.Color(0x0a111a);
  
  const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1a2634, 1.9);
  scene.add(hemi);
  
  const sun = new THREE.DirectionalLight(0xfff6ea, 4.0);
  sun.position.set(25, 35, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  scene.add(sun);

  const redGlow = new THREE.PointLight(0xff3848, 9, 28);
  redGlow.position.set(-18, 4, -18);
  scene.add(redGlow);

  const tealGlow = new THREE.PointLight(0x00f5ff, 9, 28);
  tealGlow.position.set(18, 4, 18);
  scene.add(tealGlow);

  const spawnPoints = [
    new THREE.Vector3(-18, 0, -10), new THREE.Vector3(18, 0, 10),
    new THREE.Vector3(-22, 0, 14), new THREE.Vector3(22, 0, -14),
    new THREE.Vector3(0, 0, -24), new THREE.Vector3(0, 0, 24),
    new THREE.Vector3(-10, 0, 24), new THREE.Vector3(10, 0, -24),
  ];

  return { colliders, shootables, spawnPoints };
}

// ---------------------------------------------------------------- bots
const BOT_NAMES = ['REYNA-BOT', 'PHX-UNIT', 'OMEN-77', 'CYPHER.EXE', 'KAYO-MK2', 'VIPER-X', 'SAGE-9000'];
const BOT_MODEL_YAW = 0;
const BOT_MODEL_H = 1.45;

class Bot {
  constructor(scene, spawn, name, asset = null) {
    this.name = name;
    this.hp = 100;
    this.alive = true;
    this.respawnAt = 0;
    this.hideAt = 0;
    this.shootCooldown = 0;
    this.wanderTarget = null;
    this.flashUntil = 0;
    this.speed = 3.2 + Math.random() * 1.2;
    const hasModel = !!(asset && asset.model);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff3848, roughness: 0.5, emissive: 0x7f111a, emissiveIntensity: 0.7 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffe8e1, roughness: 0.3, emissive: 0xff3848, emissiveIntensity: 0.4 });

    this.group = new THREE.Group();
    const H = BOT_MODEL_H;
    const bodyR = hasModel ? 0.235 * H : 0.38, bodyCyl = hasModel ? 0.31 * H : 0.85, bodyY = hasModel ? 0.31 * H : 0.85;
    const headR = hasModel ? 0.30 * H : 0.24, headY = hasModel ? 0.70 * H : 1.62;
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, bodyCyl, 4, 10), bodyMat);
    this.body.position.y = bodyY;
    this.body.castShadow = true;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(headR, 12, 12), headMat);
    this.head.position.y = headY;
    this.head.castShadow = true;
    this.visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.07, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 1.6 })
    );
    this.visor.position.set(0, 1.64, 0.2);
    this.group.add(this.body, this.head, this.visor);
    this.body.userData.bot = this; this.body.userData.part = 'body';
    this.head.userData.bot = this; this.head.userData.part = 'head';
    this.group.position.copy(spawn);

    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.skinMeshes = [];
    if (hasModel) {
      const m = asset.model;
      const h = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).y || 1.7;
      m.scale.setScalar(BOT_MODEL_H / h);
      m.position.y -= new THREE.Box3().setFromObject(m).min.y;
      m.traverse((o) => { if (o.isMesh) this.skinMeshes.push(o); });
      this.modelWrap = new THREE.Group();
      this.modelWrap.rotation.y = BOT_MODEL_YAW;
      this.modelWrap.add(m);
      this.group.add(this.modelWrap);
      for (const hb of [this.body, this.head, this.visor]) { hb.material.visible = false; hb.castShadow = false; }
      this.mixer = new THREE.AnimationMixer(m);
      for (const [key, clipName] of Object.entries(CLIPS)) {
        const clip = asset.animations.find((a) => a.name === clipName);
        if (clip) this.actions[key] = this.mixer.clipAction(clip);
      }
      this.playAction('idle');
    }
    scene.add(this.group);
  }

  playAction(key, { once = false } = {}) {
    const a = this.actions[key];
    if (!a || a === this.current) return;
    a.reset().setEffectiveWeight(1);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = once;
    a.fadeIn(0.18).play();
    if (this.current) this.current.fadeOut(0.18);
    this.current = a;
  }

  setRevealed(on) {
    if (this.skinMeshes.length) {
      for (const o of this.skinMeshes) {
        o.material.depthTest = !on;
        o.material.emissiveIntensity = on ? 2.8 : 0.5;
        o.renderOrder = on ? 999 : 0;
      }
      return;
    }
    for (const m of [this.body, this.head]) {
      m.material.depthTest = !on;
      m.material.emissiveIntensity = on ? 2.5 : (m === this.head ? 0.4 : 0.7);
      m.renderOrder = on ? 999 : 0;
    }
  }

  damage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  die() {
    this.alive = false;
    const now = performance.now() / 1000;
    this.respawnAt = now + RESPAWN_DELAY + Math.random() * 2;
    if (this.mixer) {
      this.current = null;
      this.playAction('death', { once: true });
      this.hideAt = now + 1.6;
    } else {
      this.group.visible = false;
    }
  }

  respawn(spawn) {
    this.hp = 100;
    this.alive = true;
    this.group.position.copy(spawn);
    this.group.visible = true;
    if (this.mixer) { this.current = null; this.playAction('idle'); }
    this.setRevealed(false);
  }
}

// ---------------------------------------------------------------- engine
export class Game {
  constructor(canvas, agent, callbacks, models = null) {
    this.canvas = canvas;
    this.agent = agent;
    this.cb = callbacks;
    this.models = models;
    this.mixers = [];
    this.sfx = new Sfx();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4; // High vibrancy & glow

    this.scene = new THREE.Scene();
    this.baseFov = settings.fov;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.05, 300);

    const { colliders, shootables, spawnPoints } = buildMap(this.scene);
    this.colliders = colliders;
    this.shootables = shootables;
    this.spawnPoints = spawnPoints;
    this.wallBlockers = shootables.filter((s) => s.geometry.type !== 'PlaneGeometry');

    this.raycaster = new THREE.Raycaster();
    this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3();
    this._collBox = new THREE.Box3();
    this._rayTargets = []; this._losTargets = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.9 });
    this.tracerPool = [];
    this.impactGeo = new THREE.SphereGeometry(0.045, 6, 6);
    this.impactMat = new THREE.MeshBasicMaterial({ color: 0xff3848 });
    this.impactPool = [];

    this.pos = new THREE.Vector3(0, PLAYER_HEIGHT, 24);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = true;
    this.hp = 100; this.armor = 50;
    this.money = 800;
    this.dead = false; this.deadUntil = 0;
    this.kills = 0; this.deaths = 0;
    this.killStreak = 0; this.lastKillTime = -99;
    this.ultPoints = 0;
    this.fireRateMult = 1;
    this.invisible = false;

    this.weapon = getWeapon('classic');
    this.preUltWeapon = null;
    this.mag = this.weapon.mag;
    this.reloading = false; this.reloadEnd = 0;
    this.lastShot = 0;
    this.recoilKick = 0;
    this.shake = { until: 0, power: 0, dur: 0.001 };

    this.abilityState = {};
    this.cooldowns = { C: 0, Q: 0, E: 0 };
    for (const slot of ['C', 'Q', 'E']) {
      const ab = agent.abilities[slot];
      const max = (ab && ab.charges) || 1;
      this.abilityState[slot] = { count: max, max, cd: (ab && ab.cd) || 0, pending: [] };
    }
    this.effects = [];
    this.projectiles = [];
    this.zones = [];
    this.gateMarker = null;
    this.ultActiveUntil = 0;
    this.reveal = { until: 0 };

    this.keys = {};
    this.mouseDown = false;
    this.paused = false;
    this.running = false;
    this.clock = new THREE.Clock();

    this.bots = [];
    for (let i = 0; i < BOT_COUNT; i++) {
      const asset = this.models ? this.models.skeleton(0x7f111a) : null;
      const bot = new Bot(this.scene, this.randomSpawn(), BOT_NAMES[i % BOT_NAMES.length], asset);
      if (bot.mixer) this.mixers.push(bot.mixer);
      this.bots.push(bot);
    }

    this.buildViewmodel();
    this.bindEvents();
    this.resize();
  }

  buildViewmodel() {
    this.viewmodel = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x1e2d3d, roughness: 0.4, metalness: 0.6, emissive: 0x0f1722, emissiveIntensity: 1 });
    const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.agent.color), emissive: new THREE.Color(this.agent.color), emissiveIntensity: 1.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.5), gunMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), gunMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.38);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.02, 0.3), accent);
    stripe.position.set(0, 0.045, -0.05);
    
    this.procGun = new THREE.Group();
    this.procGun.add(body, barrel, stripe);
    this.gunMount = new THREE.Group();
    this.muzzle = new THREE.PointLight(0x00f5ff, 0, 4);
    this.muzzle.position.set(0, 0.03, -0.55);
    this.viewmodel.add(this.procGun, this.gunMount, this.muzzle);
    this.viewmodel.scale.setScalar(0.62);
    this.viewmodel.traverse((o) => { o.frustumCulled = false; });
    
    this.vmZ = -0.45;
    this.viewmodel.position.set(0.26, -0.22, this.vmZ);
    this.vmScene = new THREE.Scene();
    this.vmScene.add(this.viewmodel);
    this.vmScene.add(new THREE.HemisphereLight(0xdbeafe, 0x1a2634, 2.6));
    const vmKey = new THREE.DirectionalLight(0xffffff, 3.2);
    vmKey.position.set(0.6, 0.8, 0.4);
    this.vmScene.add(vmKey);
    this.vmCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.setGunModel(this.weapon.id);
  }

  async setGunModel(weaponId) {
    if (!this.models) return;
    let mount = null;
    try { mount = await this.models.gun(weaponId); } catch { mount = null; }
    if (!this.gunMount) return;
    this.gunMount.clear();
    if (mount) {
      this.gunMount.add(mount);
      this.gunMount.traverse((o) => { o.frustumCulled = false; });
      this.procGun.visible = false;
    } else {
      this.procGun.visible = true;
    }
  }

  bindEvents() {
    this._onKeyDown = (e) => this.onKey(e, true);
    this._onKeyUp = (e) => this.onKey(e, false);
    this._onMouseMove = (e) => {
      if (!this.locked() || this.paused) return;
      const s = 0.0021 * settings.sens;
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    };
    this._onMouseDown = (e) => { if (e.button === 0) { this.mouseDown = true; this.tryShoot(); } };
    this._onMouseUp = (e) => { if (e.button === 0) this.mouseDown = false; };
    this._onLockChange = () => {
      if (!this.locked() && this.running && !this.dead) this.setPaused(true);
    };
    this._onResize = () => this.resize();

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('resize', this._onResize);
  }

  destroy() {
    this.running = false;
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('resize', this._onResize);
    if (this.locked()) document.exitPointerLock();
    this.renderer.dispose();
  }

  locked() { return document.pointerLockElement === this.canvas; }
  lock() { try { this.canvas.requestPointerLock()?.catch?.(() => {}); } catch {} }

  onKey(e, down) {
    if (!this.running) return;
    this.keys[e.code] = down;
    if (!down) return;
    if (e.code === 'KeyB') { this.toggleBuy(); return; }
    if (this.paused || this.dead) return;
    if (e.code === 'KeyR') this.startReload();
    if (e.code === 'KeyC') this.useAbility('C');
    if (e.code === 'KeyQ') this.useAbility('Q');
    if (e.code === 'KeyE') this.useAbility('E');
    if (e.code === 'KeyX') this.useAbility('X');
    if (/^Digit[1-9]$/.test(e.code) && !document.getElementById('buy-menu').classList.contains('hidden')) {
      this.cb.onQuickBuy(parseInt(e.code.slice(5), 10) - 1);
    }
  }

  setPaused(p) {
    this.paused = p;
    document.getElementById('pause-menu').classList.toggle('hidden', !p);
    if (!p) this.lock();
  }

  toggleBuy() {
    const menu = document.getElementById('buy-menu');
    const open = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !open);
    if (open) { document.exitPointerLock(); this.paused = true; document.getElementById('pause-menu').classList.add('hidden'); }
    else { this.paused = false; this.lock(); }
  }

  start() {
    this.running = true;
    this.lock();
    this.clock.start();
    this.applySettings();
    this.loop();
    this.announce('MATCH START', false);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.vmCamera) {
      this.vmCamera.aspect = w / h;
      this.vmCamera.updateProjectionMatrix();
    }
  }

  applySettings() {
    this.baseFov = settings.fov;
    if (!this.aiming) { this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix(); }
    const fpsEl = document.getElementById('fps-meter');
    if (fpsEl) fpsEl.classList.toggle('hidden', !settings.showFps);
  }

  randomSpawn() {
    return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)].clone();
  }

  equip(weapon) {
    this.weapon = weapon;
    this.mag = weapon.mag;
    this.reloading = false;
    this.setGunModel(weapon.id);
    this.sfx.play('reload');
    this.updateHud();
  }

  tryBuy(weapon) {
    if (!weapon || weapon.id === this.weapon.id) return false;
    if (this.money < weapon.price) { this.sfx.play('hit'); return false; }
    this.money -= weapon.price;
    this.equip(weapon);
    return true;
  }

  startReload() {
    if (this.reloading || this.mag === this.weapon.mag || this.weapon === BLADE_STORM) return;
    this.reloading = true;
    this.reloadEnd = this.now() + 1.4;
    this.sfx.play('reload');
  }

  now() { return performance.now() / 1000; }

  tryShoot() {
    if (!this.running || this.paused || this.dead || !this.locked()) return;
    const t = this.now();
    const interval = 1 / (this.weapon.fireRate * this.fireRateMult);
    if (t - this.lastShot < interval) return;
    if (this.reloading) return;
    if (this.mag <= 0) { this.startReload(); return; }
    this.lastShot = t;
    if (this.weapon !== BLADE_STORM) this.mag--;

    const pellets = this.weapon.pellets || 1;
    for (let i = 0; i < pellets; i++) this.fireRay();

    this.recoilKick = Math.min(this.recoilKick + this.weapon.recoil, 0.09);
    this.muzzle.intensity = 14;
    this.vmZ = -0.38;
    this.sfx.play('shot', this.weapon);
    this.updateHud();
  }

  fireRay() {
    const moving = this.vel.lengthSq() > 4;
    const spread = this.weapon.spread * (moving ? 2.6 : 1) + this.recoilKick * 0.35;
    const dir = this._v1.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const jit = this._v2.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, 0).applyQuaternion(this.camera.quaternion);
    dir.add(jit).normalize();

    this.raycaster.set(this.camera.getWorldPosition(this._v3), dir);
    this.raycaster.near = 0; this.raycaster.far = 200;
    const targets = this._rayTargets; targets.length = 0;
    for (let i = 0; i < this.shootables.length; i++) targets.push(this.shootables[i]);
    for (const b of this.bots) if (b.alive) { targets.push(b.body, b.head); }
    const hits = this.raycaster.intersectObjects(targets, false);
    const hit = hits[0];

    const end = hit ? hit.point : this.raycaster.ray.at(120, this._v2);
    this.spawnTracer(this.raycaster.ray.origin, end);

    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const isHead = hit.object.userData.part === 'head';
      const dmg = Math.round(this.weapon.dmg * (isHead ? this.weapon.head : 1));
      const killed = bot.damage(dmg);
      this.showHitmarker(killed);
      this.sfx.play(killed ? 'kill' : 'hit');
      if (killed) this.onKill(bot, isHead);
    } else if (hit) {
      this.spawnImpact(hit.point);
    }
  }

  onKill(bot, headshot) {
    this.kills++;
    this.ultPoints = Math.min(this.ultPoints + 1, this.agent.abilities.X.pts);
    this.money = Math.min(this.money + (headshot ? 400 : 300), 9000);
    this.addShake(headshot ? 0.05 : 0.035, 0.16);
    const now = this.now();
    this.killStreak = (now - this.lastKillTime < 4.5) ? this.killStreak + 1 : 1;
    this.lastKillTime = now;
    if (this.killStreak >= 2) {
      this.sfx.play('streak', this.killStreak);
      this.cb.onStreak?.(this.killStreak);
    }
    this.cb.onKillFeed(`YOU`, bot.name, headshot, false);
    this.cb.onScore(this.kills, this.deaths);
    this.updateHud();
  }

  spawnTracer(from, to) {
    let line = this.tracerPool.pop();
    if (!line) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      line = new THREE.Line(geo, this.tracerMat);
      line.frustumCulled = false;
      this.scene.add(line);
    }
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y - 0.06, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    line.visible = true;
    this.effects.push({ mesh: line, until: this.now() + 0.05, pool: this.tracerPool });
  }

  spawnImpact(point) {
    let m = this.impactPool.pop();
    if (!m) { m = new THREE.Mesh(this.impactGeo, this.impactMat); this.scene.add(m); }
    m.position.copy(point);
    m.visible = true;
    this.effects.push({ mesh: m, until: this.now() + 0.18, pool: this.impactPool });
  }

  showHitmarker(kill) {
    const hm = document.getElementById('hitmarker');
    hm.classList.remove('show', 'kill');
    void hm.offsetWidth;
    hm.classList.add('show');
    if (kill) hm.classList.add('kill');
  }

  useAbility(slot) {
    const ab = this.agent.abilities[slot];
    if (!ab) return;
    const t = this.now();
    if (slot === 'X') {
      if (this.ultPoints < ab.pts) return;
      this.ultPoints = 0;
      this.castUlt();
      this.sfx.play('ability');
      this.updateHud();
      return;
    }
    const st = this.abilityState[slot];
    if (st.count <= 0) return;
    const used = this.castBasic(slot);
    if (used === false) return;
    st.count--;
    const rechargeUntil = t + ab.cd;
    st.pending.push(rechargeUntil);
    st.pending.sort((a, b) => a - b);
    this.sfx.play('ability');
    this.updateHud();
  }

  castBasic(slot) {
    const forward = this._v1.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const pos = this.camera.getWorldPosition(this._v2);

    if (this.agent.id === 'jett') {
      if (slot === 'C') { // Cloudburst smoke
        const smokePos = pos.clone().add(forward.clone().multiplyScalar(6));
        this.spawnSmoke(smokePos);
      } else if (slot === 'Q') { // Updraft
        this.vel.y = 9.5;
        this.onGround = false;
      } else if (slot === 'E') { // Tailwind dash
        this.vel.copy(forward.multiplyScalar(18));
        this.vel.y = 2;
      }
    } else if (this.agent.id === 'raze') {
      if (slot === 'C') { // Blast Pack
        this.spawnProjectile('blastpack', pos, forward.multiplyScalar(12).add(new THREE.Vector3(0, 4, 0)));
      } else if (slot === 'Q') { // Paint Shells
        this.spawnProjectile('nade', pos, forward.multiplyScalar(16).add(new THREE.Vector3(0, 6, 0)));
      } else if (slot === 'E') { // Boom Bot
        this.spawnBoomBot(pos, forward);
      }
    } else if (this.agent.id === 'yoru') {
      if (slot === 'C') { // Fakeout decoy
        this.spawnDecoy(pos, forward);
      } else if (slot === 'Q') { // Blindside flash
        this.spawnProjectile('flash', pos, forward.multiplyScalar(22));
      } else if (slot === 'E') { // Gatecrash teleport marker
        if (!this.gateMarker) {
          this.gateMarker = pos.clone();
          this.announce('GATECRASH PLACED', false);
        } else {
          this.pos.copy(this.gateMarker);
          this.gateMarker = null;
          this.sfx.play('boom');
        }
      }
    } else if (this.agent.id === 'brimstone') {
      if (slot === 'C') { // Stim Beacon
        this.spawnZone(pos, 8, 4.5, { buff: 'fireRate', val: 1.35 });
      } else if (slot === 'Q') { // Incendiary molly
        this.spawnProjectile('molly', pos, forward.multiplyScalar(15).add(new THREE.Vector3(0, 5, 0)));
      } else if (slot === 'E') { // Sky Smoke anywhere
        const hit = this.raycastGround();
        if (hit) this.spawnSmoke(hit);
      }
    } else if (this.agent.id === 'sova') {
      if (slot === 'C') { // Owl Drone
        this.announce('DRONE DEPLOYED', false);
      } else if (slot === 'Q') { // Shock Bolt
        this.spawnProjectile('shock', pos, forward.multiplyScalar(20));
      } else if (slot === 'E') { // Recon Bolt
        this.spawnReconBolt(pos, forward.multiplyScalar(22));
      }
    }
  }

  castUlt() {
    const t = this.now();
    if (this.agent.id === 'jett') {
      this.preUltWeapon = this.weapon;
      this.equip(BLADE_STORM);
      this.ultActiveUntil = t + 12;
    } else if (this.agent.id === 'raze') {
      this.spawnProjectile('showstopper', this.camera.getWorldPosition(this._v1), this._v2.set(0, 0, -1).applyQuaternion(this.camera.quaternion).multiplyScalar(28), true);
    } else if (this.agent.id === 'yoru') {
      this.ultActiveUntil = t + 8;
      this.invisible = true;
      document.getElementById('ult-overlay').classList.add('yoru');
    } else if (this.agent.id === 'brimstone') {
      const hit = this.raycastGround();
      if (hit) this.spawnZone(hit, 7, 5, { dps: 45, hostile: true });
    } else if (this.agent.id === 'sova') {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => { if (this.running) this.fireHunterFury(); }, i * 350);
      }
    }
  }

  fireHunterFury() {
    this.sfx.play('shot', { type: 'ULT' });
    this.addShake(0.04, 0.2);
    for (const b of this.bots) {
      if (b.alive) {
        b.damage(80);
        if (!b.alive) this.onKill(b, false);
      }
    }
  }

  raycastGround() {
    const dir = this._v1.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.raycaster.set(this.camera.getWorldPosition(this._v2), dir);
    const hits = this.raycaster.intersectObjects(this.shootables, false);
    return hits[0] ? hits[0].point : null;
  }

  spawnSmoke(pos) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.85, roughness: 1 })
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.effects.push({ mesh: m, until: this.now() + 8 });
  }

  spawnZone(pos, radius, duration, opts) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.9, radius, 24),
      new THREE.MeshBasicMaterial({ color: opts.hostile ? 0xff3848 : 0x00f5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).y = 0.05;
    this.scene.add(m);
    this.zones.push({ pos: pos.clone(), r: radius, ...opts, until: this.now() + duration });
    this.effects.push({ mesh: m, until: this.now() + duration });
  }

  spawnProjectile(type, pos, vel, direct = false) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff5ea })
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.projectiles.push({ type, mesh: m, vel: vel.clone(), pos: pos.clone(), direct, until: this.now() + 4 });
  }

  spawnBoomBot(pos, fwd) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.3, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xff3848, roughness: 0.3 })
    );
    m.position.copy(pos).y = 0.15;
    this.scene.add(m);
    this.projectiles.push({ type: 'boombot', mesh: m, vel: fwd.multiplyScalar(6), pos: m.position, until: this.now() + 5 });
  }

  spawnDecoy(pos, fwd) {
    const asset = this.models ? this.models.character() : null;
    if (!asset) return;
    const m = asset.model;
    m.position.copy(pos);
    this.scene.add(m);
    const mixer = new THREE.AnimationMixer(m);
    const clip = asset.animations.find((a) => a.name === CLIPS.run);
    if (clip) mixer.clipAction(clip).play();
    this.mixers.push(mixer);
    this.projectiles.push({ type: 'decoy', mesh: m, mixer, vel: fwd.multiplyScalar(5), pos: m.position, until: this.now() + 4 });
  }

  spawnReconBolt(pos, vel) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6),
      new THREE.MeshBasicMaterial({ color: 0x00f5ff })
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.projectiles.push({ type: 'recon', mesh: m, vel: vel.clone(), pos: pos.clone(), until: this.now() + 6 });
  }

  addShake(pow, dur) {
    if (settings.reducedMotion) return;
    this.shake.power = Math.max(this.shake.power, pow);
    this.shake.dur = dur;
    this.shake.until = this.now() + dur;
  }

  updateHud() {
    document.getElementById('hp-num').textContent = Math.max(0, Math.round(this.hp));
    const hpPct = Math.max(0, this.hp) / 100;
    const hpFill = document.getElementById('hp-fill');
    hpFill.style.width = `${hpPct * 100}%`;
    hpFill.classList.toggle('low', this.hp <= 30);
    document.getElementById('armor-fill').style.width = `${(this.armor / 50) * 100}%`;
    document.getElementById('weapon-name').textContent = this.weapon.name;
    document.getElementById('ammo-mag').textContent = this.mag;
    document.getElementById('ammo-reserve').textContent = this.weapon.mag === Infinity ? '/ ∞' : '/ 🡞';
    this.cb.onMoney(this.money, this.weapon.id);
  }

  announce(txt, red) {
    const el = document.getElementById('announce');
    el.textContent = txt;
    el.classList.remove('show', 'red');
    void el.offsetWidth;
    el.classList.add('show');
    if (red) el.classList.add('red');
  }

  // ---------------- loop / physics / AI
  loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.now();

    if (this.mixers.length) {
      for (let i = 0; i < this.mixers.length; i++) this.mixers[i].update(dt);
    }

    // ability cooldown updates
    for (const slot of ['C', 'Q', 'E']) {
      const st = this.abilityState[slot];
      while (st.pending.length && st.pending[0] <= t) {
        st.pending.shift();
        st.count = Math.min(st.count + 1, st.max);
      }
    }

    // Ult / invisibility timers
    if (this.ultActiveUntil && t > this.ultActiveUntil) {
      if (this.agent.id === 'jett' && this.weapon === BLADE_STORM) {
        this.equip(this.preUltWeapon || getWeapon('classic'));
      }
      if (this.agent.id === 'yoru') {
        this.invisible = false;
        document.getElementById('ult-overlay').classList.remove('yoru');
      }
      this.ultActiveUntil = 0;
    }

    // Reload timer
    if (this.reloading && t >= this.reloadEnd) {
      this.reloading = false;
      this.mag = this.weapon.mag;
      this.updateHud();
    }

    // Player Movement Physics
    if (!this.paused && !this.dead && this.locked()) {
      const speed = this.keys['ShiftLeft'] ? 3.6 : 6.4;
      const fwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
      const side = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);

      const moveDir = this._v1.set(side, 0, fwd).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.vel.x = moveDir.x * speed;
      this.vel.z = moveDir.z * speed;

      if (this.keys['Space'] && this.onGround) {
        this.vel.y = 7.5;
        this.onGround = false;
      }
      this.vel.y -= GRAVITY * dt;

      this.pos.addScaledVector(this.vel, dt);

      // Floor collision
      if (this.pos.y <= PLAYER_HEIGHT) {
        this.pos.y = PLAYER_HEIGHT;
        this.vel.y = 0;
        this.onGround = true;
      }

      // AABB Colliders with obstacles
      this._collBox.makeCentered(this.pos, new THREE.Vector3(PLAYER_RADIUS * 2, PLAYER_HEIGHT * 2, PLAYER_RADIUS * 2));
      for (const box of this.colliders) {
        if (box.intersectsBox(this._collBox)) {
          this.pos.x -= this.vel.x * dt * 1.2;
          this.pos.z -= this.vel.z * dt * 1.2;
        }
      }
    }

    this.camera.position.copy(this.pos);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    // Recoil recovery
    this.recoilKick = Math.max(0, this.recoilKick - dt * 0.12);
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 60);

    // Viewmodel bob & sway
    if (this.vmCamera) {
      this.vmZ += (-0.45 - this.vmZ) * 0.1;
      this.viewmodel.position.set(0.26, -0.22 + Math.sin(t * 12) * (this.vel.lengthSq() > 2 ? 0.008 : 0.002), this.vmZ);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.clearDepth();
      this.renderer.render(this.vmScene, this.vmCamera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Screen Shake
    if (t < this.shake.until && !settings.reducedMotion) {
      this.camera.position.add(new THREE.Vector3((Math.random()-0.5)*this.shake.power, (Math.random()-0.5)*this.shake.power, 0));
    }

    // Effect cleanup
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      if (t >= fx.until) {
        fx.mesh.visible = false;
        if (fx.pool) fx.pool.push(fx.mesh);
        else this.scene.remove(fx.mesh);
        this.effects.splice(i, 1);
      }
    }

    // Projectile updates
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      if (t >= p.until || p.pos.y <= 0) {
        if (p.type === 'nade' || p.type === 'molly' || p.type === 'shock' || p.type === 'blastpack' || p.type === 'showstopper') {
          this.sfx.play('boom');
          this.spawnZone(p.pos, 4.5, 2.5, { dps: 30, hostile: true });
        }
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // Bot AI Loop
    for (const bot of this.bots) {
      if (!bot.alive) {
        if (t >= bot.respawnAt) {
          bot.respawn(this.randomSpawn());
        } else if (bot.hideAt && t >= bot.hideAt) {
          bot.group.visible = false;
          bot.hideAt = 0;
        }
        continue;
      }

      const dist = bot.group.position.distanceTo(this.pos);
      if (dist < 22 && !this.invisible) {
        bot.group.lookAt(this.pos.x, bot.group.position.y, this.pos.z);
        if (bot.mixer) bot.playAction('run');
        
        const dir = this._v1.subVectors(this.pos, bot.group.position).normalize();
        bot.group.position.addScaledVector(dir, bot.speed * dt);

        if (dist < 16 && t >= bot.shootCooldown) {
          bot.shootCooldown = t + 0.9 + Math.random() * 0.8;
          this.sfx.play('botshot');
          if (Math.random() < 0.65) {
            this.hp -= 18;
            this.addShake(0.04, 0.15);
            this.updateHud();
            if (this.hp <= 0 && !this.dead) {
              this.dead = true;
              this.deaths++;
              document.getElementById('death-screen').classList.remove('hidden');
              document.exitPointerLock();
              setTimeout(() => {
                this.hp = 100;
                this.dead = false;
                this.pos.copy(this.randomSpawn());
                document.getElementById('death-screen').classList.add('hidden');
                this.lock();
                this.updateHud();
              }, RESPAWN_DELAY * 1000);
            }
          }
        }
      } else {
        if (bot.mixer) bot.playAction('idle');
      }
    }
  }
}
