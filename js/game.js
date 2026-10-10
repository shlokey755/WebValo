// WebValo engine — Three.js first-person shooter (Fully Fixed & Optimized)
import * as THREE from 'three';
import { getWeapon, BLADE_STORM } from './weapons.js';
import { CLIPS } from './models.js';
import { settings } from './settings.js';

const BOT_COUNT = 5;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;
const GRAVITY = 22;
const RESPAWN_DELAY = 3;

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
      this.master.gain.value = settings.volume;
      const ctx = this.ctx, t = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(this.master);
      if (type === 'shot' || type === 'botshot') {
        const prof = type === 'botshot' ? { freq: 1100, len: 0.09, gain: 0.08, body: 0 }
          : (SHOT_PROFILES[arg && arg.type] || { freq: 2400, len: 0.09, gain: 0.22, body: 0 });
        const jitter = 0.92 + Math.random() * 0.16;
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
    } catch {}
  }
}

function buildMap(scene) {
  const colliders = [];
  const shootables = [];

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

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  shootables.push(floor);

  const grid = new THREE.GridHelper(120, 60, 0x00f5ff, 0x243447);
  grid.position.y = 0.01;
  scene.add(grid);

  const W = 30, H = 6;
  box(2 * W + 2, H, 1, 0, H / 2, -W, matWall);
  box(2 * W + 2, H, 1, 0, H / 2, W, matWall);
  box(1, H, 2 * W + 2, -W, H / 2, 0, matWall);
  box(1, H, 2 * W + 2, W, H / 2, 0, matWall);

  box(1, 3.4, 18, -6, 1.7, 0, matWall);
  box(1, 3.4, 18, 6, 1.7, 0, matWall);
  box(10, 3.4, 1, 0, 1.7, -14, matWall);
  box(10, 3.4, 1, 0, 1.7, 14, matWall);

  box(8, 2.6, 8, -18, 1.3, -18, matDark);
  box(2.2, 2.2, 2.2, -12, 1.1, -20, matCrate);
  box(2.2, 2.2, 2.2, -22, 1.1, -12, matCrate);
  box(2.2, 1.1, 2.2, -12, 0.55, -12, matCrate);
  box(6, 0.4, 6, -18, 0.2, -18, matAccent, false);

  box(8, 2.6, 8, 18, 1.3, 18, matDark);
  box(2.2, 2.2, 2.2, 12, 1.1, 20, matCrate);
  box(2.2, 2.2, 2.2, 22, 1.1, 12, matCrate);
  box(2.2, 1.1, 2.2, 12, 0.55, 12, matCrate);
  box(6, 0.4, 6, 18, 0.2, 18, matTeal, false);

  const coverSpots = [
    [-14, 6], [14, -6], [-20, 8], [20, -8], [0, -22], [0, 22],
    [-8, -8], [8, 8], [-24, -2], [24, 2], [10, -18], [-10, 18],
  ];
  for (const [x, z] of coverSpots) box(2, 1.6, 2, x, 0.8, z, matCrate);

  box(1.6, 5, 1.6, -15, 2.5, 2, matWall);
  box(1.6, 5, 1.6, 15, 2.5, -2, matWall);

  for (let i = -2; i <= 2; i++) {
    box(6, 0.18, 0.12, i * 12, 3.4, -W + 0.6, i % 2 ? matAccent : matTeal, false);
    box(6, 0.18, 0.12, i * 12, 3.4, W - 0.6, i % 2 ? matTeal : matAccent, false);
  }

  scene.fog = new THREE.FogExp2(0x0a111a, 0.013);
  scene.background = new THREE.Color(0x0a111a);
  
  const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1a2634, 1.9);
  scene.add(hemi);
  
  const sun = new THREE.DirectionalLight(0xfff6ea, 4.0);
  sun.position.set(25, 35, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
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

const BOT_NAMES = ['REYNA-BOT', 'PHX-UNIT', 'OMEN-77', 'CYPHER.EXE', 'KAYO-MK2', 'VIPER-X', 'SAGE-9000'];
const BOT_MODEL_YAW = 0;
const BOT_MODEL_H = 1.75;

class Bot {
  constructor(scene, spawn, name, asset = null) {
    this.name = name;
    this.hp = 100;
    this.alive = true;
    this.respawnAt = 0;
    this.hideAt = 0;
    this.shootCooldown = 0;
    this.speed = 3.2 + Math.random() * 1.2;
    const hasModel = !!(asset && asset.model);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff3848, roughness: 0.5, emissive: 0x7f111a, emissiveIntensity: 0.7 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffe8e1, roughness: 0.3, emissive: 0xff3848, emissiveIntensity: 0.4 });

    this.group = new THREE.Group();
    
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 10), bodyMat);
    this.body.position.y = 0.85;
    this.body.castShadow = true;

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), headMat);
    this.head.position.y = 1.55;
    this.head.castShadow = true;

    this.visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.06, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 1.6 })
    );
    this.visor.position.set(0, 1.56, 0.18);

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
      
      m.traverse((o) => { 
        if (o.isMesh) {
          this.skinMeshes.push(o);
          o.userData.bot = this;
          const isHead = o.position.y > BOT_MODEL_H * 0.65;
          o.userData.part = isHead ? 'head' : 'body';
        }
      });

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
  }
}

export class Game {
  constructor(canvas, agent, callbacks, models = null) {
    this.canvas = canvas;
    this.agent = agent;
    this.cb = callbacks;
    this.models = models;
    this.mixers = [];
    this.sfx = new Sfx();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    this.scene = new THREE.Scene();
    this.baseFov = settings.fov;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.05, 300);

    const { colliders, shootables, spawnPoints } = buildMap(this.scene);
    this.colliders = colliders;
    this.shootables = shootables;
    this.spawnPoints = spawnPoints;

    this.raycaster = new THREE.Raycaster();
    this._v1 = new THREE.Vector3(); 
    this._v2 = new THREE.Vector3(); 
    this._v3 = new THREE.Vector3();
    this._collBox = new THREE.Box3();
    this._rayTargets = [];

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
    this.dead = false;
    this.kills = 0; this.deaths = 0;
    this.killStreak = 0; this.lastKillTime = -99;
    this.ultPoints = 0;
    this.fireRateMult = 1;
    this.invisible = false;

    this.weapon = getWeapon('classic');
    this.mag = this.weapon.mag;
    this.reloading = false; this.reloadEnd = 0;
    this.lastShot = 0;
    this.recoilKick = 0;
    this.shake = { until: 0, power: 0, dur: 0.001 };

    this.abilityState = {};
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
      if (!this.locked() && this.running && !this.dead && document.getElementById('buy-menu').classList.contains('hidden')) {
        this.setPaused(true);
      }
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

    const buyMenuOpen = !document.getElementById('buy-menu').classList.contains('hidden');
    if (buyMenuOpen) {
      if (e.code === 'Escape') { this.toggleBuy(); return; }
      if (/^Digit[1-9]$/.test(e.code)) {
        this.cb.onQuickBuy(parseInt(e.code.slice(5), 10) - 1);
        return;
      }
    }

    if (this.paused || this.dead) return;
    if (e.code === 'KeyR') this.startReload();
    if (e.code === 'KeyC') this.useAbility('C');
    if (e.code === 'KeyQ') this.useAbility('Q');
    if (e.code === 'KeyE') this.useAbility('E');
    if (e.code === 'KeyX') this.useAbility('X');
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
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.paused = true;
      document.getElementById('pause-menu').classList.add('hidden');
    } else {
      this.paused = false;
      this.lock();
    }
  }

  start() {
    this.running = true;
    this.lock();
    this.clock.start();
    this.applySettings();
    this.loop();
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
    
    const targets = this._rayTargets; 
    targets.length = 0;
    for (let i = 0; i < this.shootables.length; i++) targets.push(this.shootables[i]);
    for (let i = 0; i < this.bots.length; i++) {
      if (this.bots[i].alive) {
        if (this.bots[i].modelWrap) {
          for (const m of this.bots[i].skinMeshes) targets.push(m);
        } else {
          targets.push(this.bots[i].body, this.bots[i].head);
        }
      }
    }

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
