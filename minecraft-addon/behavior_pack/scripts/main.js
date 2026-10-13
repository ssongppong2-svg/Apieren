/*
 * APIEREN SKILL RELICS — Bedrock Script API
 * 아이템을 손에 들고 화면을 탭(PC는 우클릭)하면 스킬이 발동됩니다.
 *
 * 구성: 설정 → 유틸 → 연출(VFX) → 전투(타격·콤보·처치) → 스킬 6종 → 등록/쿨타임 → 지급
 */
import { world, system, ItemStack, EntityDamageCause, MolangVariableMap } from "@minecraft/server";

/* ─── 설정 ───────────────────────────────────────────────── */
const CONFIG = {
  starterKit: true,     // 월드에 처음 입장할 때 스킬 유물 6종 지급
  hitPlayers: false,    // true 로 바꾸면 스킬이 다른 플레이어에게도 피해를 줍니다
  damageNumbers: true,  // 데미지 숫자 팝업
  cameraShake: true,    // 카메라 흔들림
};

/* ─── 색상 (RGB 0~1) ─────────────────────────────────────── */
const C = {
  gold:   [1.00, 0.82, 0.28],
  volt:   [0.55, 0.80, 1.00],
  white:  [1.00, 1.00, 1.00],
  wind:   [0.40, 1.00, 0.88],
  fire:   [1.00, 0.40, 0.08],
  ember:  [1.00, 0.72, 0.25],
  frost:  [0.55, 0.82, 1.00],
  ice:    [0.90, 0.97, 1.00],
  meteor: [1.00, 0.50, 0.12],
  void:   [0.65, 0.30, 1.00],
  warn:   [1.00, 0.18, 0.12],
  holy:   [1.00, 0.94, 0.62],
  heal:   [0.50, 1.00, 0.55],
};

/* ─── 유틸 ───────────────────────────────────────────────── */
const rnd = (a, b) => a + Math.random() * (b - a);
const add = (a, b) => ({ x: a.x + (b.x ?? 0), y: a.y + (b.y ?? 0), z: a.z + (b.z ?? 0) });
const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (a) => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const around = (c, r) => {
  const a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
  return { x: c.x + Math.cos(a) * d, y: c.y, z: c.z + Math.sin(a) * d };
};

/** 엔티티가 언로드/사망해도 스킬 전체가 멈추지 않도록 감싼다 */
function guard(fn) {
  try { return fn(); } catch { return undefined; }
}
function after(ticks, fn) {
  if (ticks <= 0) return guard(fn);
  return system.runTimeout(() => guard(fn), ticks);
}
function cmd(dim, command) {
  guard(() => dim.runCommand(command));
}
const xyz = (l) => `${l.x.toFixed(2)} ${l.y.toFixed(2)} ${l.z.toFixed(2)}`;

/* ─── 연출 (VFX / SFX) ──────────────────────────────────── */

/** 바닐라 파티클 (보조 레이어) */
function fx(dim, id, loc) {
  guard(() => dim.spawnParticle(id, loc));
}
function vanillaBurst(dim, id, center, r, count) {
  for (let i = 0; i < count; i++) {
    fx(dim, id, { x: center.x + rnd(-r, r), y: center.y + rnd(0, r), z: center.z + rnd(-r, r) });
  }
}

/** 리소스 팩의 커스텀 파티클 (색·속도·크기를 스크립트에서 지정) */
function pfx(dim, id, loc, o) {
  guard(() => {
    const m = new MolangVariableMap();
    const c = o.color ?? C.white;
    m.setColorRGB("variable.color", { red: c[0], green: c[1], blue: c[2] });
    for (const k of ["count", "speed", "life", "size", "gravity", "drag", "spread", "up", "radius", "height"]) {
      if (o[k] !== undefined) m.setFloat(`variable.${k}`, o[k]);
    }
    dim.spawnParticle(id, loc, m);
  });
}
/** 사방으로 튀는 발광 입자 */
const spark = (dim, loc, color, o = {}) => pfx(dim, "apieren:spark", loc, {
  color, count: 6, speed: 3, life: 0.5, size: 0.12, gravity: 2, drag: 2, spread: 0.15, up: 0, ...o,
});
/** 바닥에 퍼지는 충격파 링 */
const wave = (dim, loc, color, radius, life = 0.45) =>
  pfx(dim, "apieren:shockwave", { x: loc.x, y: loc.y + 0.12, z: loc.z }, { color, radius, life });
/** 수직 빛기둥 */
const beam = (dim, loc, color, height, size = 0.6, life = 0.5) =>
  pfx(dim, "apieren:beam", { x: loc.x, y: loc.y + height / 2, z: loc.z }, { color, height: height / 2, size, life });
/** 중심으로 빨려 들어오는 입자 (차징) */
const gather = (dim, loc, color, spread = 2.5, life = 0.4, count = 10) =>
  pfx(dim, "apieren:converge", loc, { color, spread, life, count, speed: spread / life, size: 0.1 });

function sparkRing(dim, center, color, r, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    spark(dim, { x: center.x + Math.cos(a) * r, y: center.y + 0.2, z: center.z + Math.sin(a) * r }, color, { count: 1, ...o });
  }
}
function line(dim, a, b, color, step = 0.4, o = {}) {
  const n = Math.max(1, Math.ceil(dist(a, b) / step));
  for (let i = 0; i <= n; i++) {
    spark(dim, lerp(a, b, i / n), color, { count: 1, speed: 0.15, life: 0.3, size: 0.08, gravity: 0, ...o });
  }
}
/** 지그재그 전격 아크 */
function arc(dim, a, b, color) {
  const pts = [a];
  const seg = 5;
  for (let i = 1; i < seg; i++) {
    pts.push(add(lerp(a, b, i / seg), { x: rnd(-0.6, 0.6), y: rnd(-0.6, 0.6), z: rnd(-0.6, 0.6) }));
  }
  pts.push(b);
  for (let i = 0; i < pts.length - 1; i++) line(dim, pts[i], pts[i + 1], color, 0.35, { size: 0.09 });
  for (let i = 0; i < pts.length - 1; i++) line(dim, pts[i], pts[i + 1], C.white, 0.7, { size: 0.05, life: 0.2 });
}

function snd(dim, id, loc, vol = 1, pitch = 1) {
  cmd(dim, `playsound ${id} @a ${xyz(loc)} ${vol} ${pitch.toFixed(2)}`);
}
function shake(dim, loc, intensity, sec, r = 14) {
  if (!CONFIG.cameraShake) return;
  cmd(dim, `camerashake add @a[x=${loc.x.toFixed(1)},y=${loc.y.toFixed(1)},z=${loc.z.toFixed(1)},r=${r}] ${intensity} ${sec} positional`);
}

function banner(p, title, sub) {
  guard(() => p.onScreenDisplay.setTitle(title, {
    subtitle: sub, fadeInDuration: 2, stayDuration: 18, fadeOutDuration: 10,
  }));
}

/* 액션바: 스킬 상태 표시를 잠시 덮어쓰는 안내 메시지 */
const noticeUntil = new Map();
function notice(p, msg, ticks = 30) {
  noticeUntil.set(p.id, system.currentTick + ticks);
  guard(() => p.onScreenDisplay.setActionBar(msg));
}

/* 데미지 숫자 팝업 (apieren:float_text 엔티티의 이름표) */
const popups = [];
function popup(dim, loc, text) {
  if (!CONFIG.damageNumbers || popups.length >= 32) return;
  const e = guard(() => dim.spawnEntity("apieren:float_text", {
    x: loc.x + rnd(-0.35, 0.35), y: loc.y, z: loc.z + rnd(-0.35, 0.35),
  }));
  if (!e) return;
  guard(() => { e.nameTag = text; });
  popups.push({ e, age: 0, vy: 0.14 });
}
system.runInterval(() => {
  for (let i = popups.length - 1; i >= 0; i--) {
    const pp = popups[i];
    pp.age++;
    const alive = guard(() => {
      if (pp.age >= 18) { pp.e.remove(); return false; }
      const l = pp.e.location;
      pp.e.teleport({ x: l.x, y: l.y + pp.vy, z: l.z });
      pp.vy *= 0.84;
      return true;
    });
    if (!alive) popups.splice(i, 1);
  }
}, 1);

/* ─── 대상 선정 ──────────────────────────────────────────── */
const NO_LIGHTNING = new Set([
  "minecraft:villager", "minecraft:villager_v2", "minecraft:wandering_trader",
  "minecraft:pig", "minecraft:mooshroom", "minecraft:turtle", "minecraft:creeper",
]);

/** 시전자 주변의 적 목록 (플레이어·주민·NPC·반려동물 제외) */
function foes(dim, center, radius, self) {
  const list = guard(() => dim.getEntities({
    location: center,
    maxDistance: radius,
    excludeFamilies: ["inanimate", "villager", "npc"],
    excludeTypes: ["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:armor_stand"],
  })) ?? [];
  return list.filter((e) => {
    if (e.id === self.id) return false;
    if (!CONFIG.hitPlayers && e.typeId === "minecraft:player") return false;
    if (guard(() => !!e.getComponent("minecraft:is_tamed"))) return false;
    return guard(() => !!e.getComponent("minecraft:health")) === true;
  });
}

/** 실제 번개가 주민 변이·크리퍼 충전·플레이어 감전을 일으키지 않을 위치인가 */
function lightningSafe(dim, at) {
  const near = guard(() => dim.getEntities({ location: at, maxDistance: 5 })) ?? [];
  return !near.some((e) =>
    e.typeId === "minecraft:player" || NO_LIGHTNING.has(e.typeId) ||
    guard(() => !!e.getComponent("minecraft:is_tamed")));
}

/** 시선이 닿는 지점 (없으면 정면 maxDist 앞) */
function aimPoint(p, maxDist) {
  const hit = guard(() => p.getBlockFromViewDirection({ maxDistance: maxDist }));
  if (hit?.faceLocation) {
    return { x: hit.faceLocation.x, y: hit.faceLocation.y + 0.05, z: hit.faceLocation.z };
  }
  const eye = guard(() => p.getHeadLocation()) ?? p.location;
  return add(eye, mul(p.getViewDirection(), maxDist));
}

function passable(dim, loc) {
  return guard(() => {
    const feet = dim.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
    const head = dim.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y) + 1, z: Math.floor(loc.z) });
    return !!feet && !!head && !feet.isSolid && !head.isSolid;
  }) === true;
}

/* ─── 전투: 타격 · 크리티컬 · 콤보 · 처치 ───────────────── */
const lastHit = new Map(); // entityId → { tick, color }
const combos = new Map();  // playerId → { n, tick }
const COMBO_WINDOW = 60;

function bumpCombo(p) {
  const now = system.currentTick;
  const c = combos.get(p.id);
  combos.set(p.id, { n: c && now - c.tick <= COMBO_WINDOW ? c.n + 1 : 1, tick: now });
}

/**
 * 스킬 피해. ±10% 편차, 크리티컬 시 1.6배.
 * 피격 무적 시간 등으로 피해가 들어가지 않으면 false.
 */
function strike(target, base, p, color, critChance = 0.15) {
  const crit = Math.random() < critChance;
  const dmg = Math.max(1, Math.round(base * rnd(0.9, 1.1) * (crit ? 1.6 : 1)));
  const ok = guard(() => target.applyDamage(dmg, { cause: EntityDamageCause.entityAttack, damagingEntity: p }));
  if (!ok) return false;

  guard(() => {
    const dim = target.dimension;
    const head = guard(() => target.getHeadLocation()) ?? add(target.location, { y: 1.6 });
    spark(dim, head, color, { count: crit ? 14 : 8, speed: crit ? 5 : 3.5, size: 0.1, life: 0.35 });
    if (crit) {
      spark(dim, head, C.gold, { count: 10, speed: 6, size: 0.14, life: 0.3, gravity: 0 });
      snd(dim, "random.anvil_land", head, 0.35, 1.9);
    } else {
      snd(dim, "item.trident.hit", head, 0.8, rnd(1.1, 1.4));
    }
    popup(dim, add(head, { y: 0.45 }), crit ? `§6§l${dmg}!` : `§f${dmg}`);
  });
  lastHit.set(target.id, { tick: system.currentTick, color });
  bumpCombo(p);
  return true;
}

function ignite(target, sec) {
  guard(() => target.setOnFire(sec, true));
}
function knock(target, from, power, lift) {
  guard(() => {
    const dx = target.location.x - from.x;
    const dz = target.location.z - from.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = dx / l, nz = dz / l;
    if (target.typeId === "minecraft:player") {
      try { target.applyKnockback(nx, nz, power, lift); }
      catch { target.applyKnockback({ x: nx * power, z: nz * power }, lift); }
    } else {
      target.applyImpulse({ x: nx * power * 0.5, y: lift * 0.5, z: nz * power * 0.5 });
    }
  });
}
function effect(target, id, ticks, amp = 0, particles = true) {
  guard(() => target.addEffect(id, ticks, { amplifier: amp, showParticles: particles }));
}

/* 스킬로 쓰러뜨린 적: 영혼 폭발 + "처치" */
world.afterEvents.entityDie.subscribe((ev) => {
  const e = ev.deadEntity;
  const rec = guard(() => lastHit.get(e.id));
  if (!rec) return;
  lastHit.delete(e.id);
  if (system.currentTick - rec.tick > COMBO_WINDOW) return;
  guard(() => {
    const dim = e.dimension;
    const at = add(e.location, { y: 0.8 });
    spark(dim, at, rec.color, { count: 26, speed: 4.5, gravity: -1, life: 0.8, size: 0.14, drag: 3 });
    spark(dim, at, C.white, { count: 10, speed: 2, gravity: -2, life: 0.6, size: 0.08 });
    vanillaBurst(dim, "minecraft:soul_particle", at, 0.6, 5);
    snd(dim, "random.orb", at, 0.9, 0.6);
    popup(dim, add(at, { y: 1.3 }), "§c§l처치");
  });
});

/* ─── 스킬 6종 ───────────────────────────────────────────── */

/** ⚡ 뇌신강림 — 공중으로 떠올라 기를 모은 뒤, 적 최대 6체를 잇는 연쇄 낙뢰 */
function thunder(p, dim) {
  banner(p, "§e§l뇌신강림", "§7하늘이 그대의 부름에 응답한다");
  snd(dim, "item.trident.riptide_1", p.location, 1.5, 0.8);
  snd(dim, "beacon.power", p.location, 1.5, 1.6);
  effect(p, "levitation", 10, 1, false);
  effect(p, "slow_falling", 70, 0, false);

  for (let t = 0; t < 10; t += 2) {
    after(t, () => {
      const c = add(p.location, { y: 1 });
      gather(dim, c, C.volt, 2.8, 0.35, 8);
      spark(dim, c, C.gold, { count: 3, speed: 1.5, life: 0.3, size: 0.08, gravity: 0 });
    });
  }

  after(10, () => {
    const from = add(p.location, { y: 1.2 });
    wave(dim, p.location, C.gold, 4, 0.4);
    spark(dim, from, C.volt, { count: 22, speed: 6, life: 0.35, size: 0.1, gravity: 0 });
    snd(dim, "ambient.weather.thunder", from, 3, 0.9);
    shake(dim, from, 0.35, 0.4);

    // 연쇄: 시전자 → 가장 가까운 적 → 그 적에서 가장 가까운 적 …
    const pool = foes(dim, p.location, 18, p);
    const chain = [];
    let cur = from;
    while (chain.length < 6 && pool.length) {
      let best = -1, bestD = chain.length ? 10 : 18;
      pool.forEach((e, i) => { const d = dist(e.location, cur); if (d < bestD) { best = i; bestD = d; } });
      if (best < 0) break;
      const [e] = pool.splice(best, 1);
      chain.push(e);
      cur = e.location;
    }

    if (!chain.length) {
      const pt = aimPoint(p, 22);
      for (let i = 0; i < 3; i++) after(i * 5, () => bolt(p, dim, null, around(pt, 3)));
      return;
    }
    let prevPos = from;
    chain.forEach((t, i) => {
      after(i * 4, () => {
        const at = t.location;
        const src = i === 0 ? add(p.location, { y: 1.2 }) : prevPos;
        arc(dim, src, add(at, { y: 1 }), C.volt);
        bolt(p, dim, t, at);
        prevPos = add(at, { y: 1 });
      });
    });
  });
  return true;
}

function bolt(p, dim, target, at) {
  if (target) strike(target, 9, p, C.volt); // 번개보다 먼저 (피격 무적 시간 회피)
  beam(dim, at, C.volt, 18, 0.4, 0.35);
  beam(dim, at, C.white, 18, 0.14, 0.25);
  wave(dim, at, C.volt, 3, 0.35);
  spark(dim, add(at, { y: 0.5 }), C.volt, { count: 18, speed: 5, life: 0.4, size: 0.1, gravity: 3 });
  vanillaBurst(dim, "minecraft:electric_spark_particle", add(at, { y: 0.5 }), 1.2, 8);
  if (lightningSafe(dim, at)) guard(() => dim.spawnEntity("minecraft:lightning_bolt", at));
  else snd(dim, "ambient.weather.thunder", at, 2, 1.2);
  snd(dim, "item.trident.thunder", at, 2.5, rnd(0.9, 1.1));
  shake(dim, at, 0.25, 0.25, 10);
}

/** 🌪 질풍신뢰 — 잔상을 남기며 돌진. 적중 시 쿨타임 50% 감소 */
function dash(p, dim) {
  const look = p.getViewDirection();
  const dir = norm({ x: look.x, y: Math.max(-0.15, Math.min(0.3, look.y * 0.5)), z: look.z });
  const start = p.location;
  const path = [];
  for (let d = 0.8; d <= 11; d += 0.8) {
    const next = add(start, mul(dir, d));
    if (!passable(dim, next)) break;
    path.push(next);
  }
  if (path.length < 2) {
    notice(p, "§c앞이 막혀 있어 돌진할 수 없습니다.");
    return false; // 쿨타임 소모 안 함
  }

  banner(p, "§b§l질풍신뢰", "§7바람보다 빠르게");
  snd(dim, "mob.enderdragon.flap", start, 2, 1.6);
  snd(dim, "item.trident.riptide_3", start, 1.2, 1.3);
  wave(dim, start, C.wind, 2.5, 0.3);
  effect(p, "speed", 80, 2, false);
  effect(p, "slow_falling", 60, 0, false);
  effect(p, "resistance", 40, 1, false);

  const hit = new Set();
  const perTick = Math.ceil(path.length / 4);
  let idx = 0;
  const loop = system.runInterval(() => {
    const more = guard(() => {
      const upto = Math.min(path.length, idx + perTick);
      for (; idx < upto; idx++) {
        const pos = path[idx];
        spark(dim, add(pos, { y: 1 }), C.wind, { count: 4, speed: 0.4, life: 0.55, size: 0.17, gravity: 0, spread: 0.35 });
        spark(dim, add(pos, { y: 0.3 }), C.white, { count: 2, speed: 1.2, life: 0.3, size: 0.06, gravity: 0 });
        fx(dim, "minecraft:critical_hit_emitter", add(pos, { y: 1 }));
        for (const e of foes(dim, pos, 2.4, p)) {
          if (hit.has(e.id)) continue;
          hit.add(e.id);
          strike(e, 7, p, C.wind);
          knock(e, pos, 1.4, 0.5);
          line(dim, add(e.location, { x: -0.8, y: 0.4, z: -0.8 }), add(e.location, { x: 0.8, y: 1.6, z: 0.8 }), C.wind, 0.15, { size: 0.1 });
        }
      }
      p.teleport(path[Math.min(idx, path.length) - 1], { dimension: dim, keepVelocity: false });
      return idx < path.length;
    });
    if (more) return;
    system.clearRun(loop);
    guard(() => {
      const end = p.location;
      wave(dim, end, C.wind, 3.5, 0.35);
      sparkRing(dim, end, C.wind, 1.6, 16, { speed: 2.5, life: 0.4, gravity: 0, size: 0.1 });
      snd(dim, "random.explode", end, 0.6, 1.9);
      if (hit.size > 0) {
        reduceCooldown(p, "apieren:skill_dash", 0.5);
        notice(p, `§b명중 ${hit.size}! §f쿨타임 50% 감소`);
        shake(dim, end, 0.2, 0.2, 6);
      }
    });
  }, 1);
  return true;
}

/** 🔥 홍련폭염 — 기를 모은 뒤 화염 파동 폭발, 불씨가 남는다 */
function inferno(p, dim) {
  const c = p.location;
  banner(p, "§c§l홍련폭염", "§7모든 것을 불사른다");
  snd(dim, "mob.blaze.breathe", c, 2, 0.6);
  snd(dim, "fire.ignite", c, 2, 0.6);
  effect(p, "slowness", 8, 4, false);
  effect(p, "fire_resistance", 120, 0, false);

  for (let t = 0; t < 8; t += 2) {
    after(t, () => {
      gather(dim, add(c, { y: 1 }), C.fire, 4, 0.35, 12);
      spark(dim, c, C.ember, { count: 4, speed: 1.2, gravity: -3, life: 0.6, size: 0.12, spread: 0.6 });
    });
  }

  after(8, () => {
    fx(dim, "minecraft:huge_explosion_emitter", c);
    wave(dim, c, C.fire, 8, 0.5);
    wave(dim, c, C.ember, 5, 0.35);
    beam(dim, c, C.fire, 5, 1.1, 0.35);
    spark(dim, add(c, { y: 1 }), C.ember, { count: 30, speed: 7, life: 0.5, size: 0.14, gravity: 4 });
    snd(dim, "random.explode", c, 3, 0.8);
    snd(dim, "mob.blaze.shoot", c, 3, 0.7);
    shake(dim, c, 0.6, 0.5);
    for (const e of foes(dim, c, 7.5, p)) {
      const falloff = 1 - Math.min(1, dist(e.location, c) / 7.5);
      strike(e, 8 + 6 * falloff, p, C.fire);
      ignite(e, 6);
      knock(e, c, 2.2, 0.7);
    }
  });

  for (let r = 1; r <= 8; r++) {
    after(8 + r, () => {
      sparkRing(dim, c, C.fire, r, Math.round(r * 4), { count: 2, speed: 1.2, life: 0.45, size: 0.18, gravity: -2, spread: 0.2 });
      if (r % 2 === 0) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          fx(dim, "minecraft:basic_flame_particle", { x: c.x + Math.cos(a) * r, y: c.y + 0.4, z: c.z + Math.sin(a) * r });
        }
      }
    });
  }
  for (let t = 18; t < 50; t += 3) {
    after(t, () => {
      for (let i = 0; i < 6; i++) {
        spark(dim, add(around(c, 6), { y: 0.1 }), C.ember, { count: 1, speed: 0.4, gravity: -1.5, life: 1.2, size: 0.07, drag: 1 });
      }
    });
  }
  return true;
}

/** ❄ 빙결영역 — 5초간 얼어붙는 영역. 끝날 때 얼어 있던 적이 산산조각 */
function frost(p, dim) {
  const c = p.location;
  banner(p, "§3§l빙결영역", "§7시간마저 얼어붙는다");
  snd(dim, "random.glass", c, 2, 0.5);
  snd(dim, "mob.polar_bear.warning", c, 1, 0.6);
  wave(dim, c, C.frost, 8, 0.6);
  shake(dim, c, 0.2, 0.3);

  const frozen = new Set();
  for (let pulse = 0; pulse < 6; pulse++) {
    after(pulse * 11, () => {
      sparkRing(dim, c, C.frost, 8, 30, { speed: 0.1, life: 0.9, size: 0.12, gravity: 0 });
      for (let i = 0; i < 10; i++) {
        spark(dim, add(around(c, 8), { y: 3.5 }), C.ice, { count: 1, speed: 0.1, gravity: 0.8, drag: 1, life: 1.6, size: 0.07 });
      }
      for (let i = 0; i < 3; i++) beam(dim, around(c, 7), C.frost, 1.6, 0.12, 0.9);
      for (let i = 0; i < 6; i++) fx(dim, "minecraft:snowball_poof_particle", add(around(c, 8), { y: rnd(0.2, 2) }));
      if (pulse > 0) snd(dim, "random.glass", c, 0.6, rnd(1.4, 1.8));

      for (const e of foes(dim, c, 8, p)) {
        strike(e, 3, p, C.frost, 0.05);
        effect(e, "slowness", 70, 3);
        effect(e, "weakness", 70, 1);
        frozen.add(e.id);
        spark(dim, add(e.location, { y: 1 }), C.ice, { count: 6, speed: 0.6, life: 0.6, size: 0.08, gravity: 0, spread: 0.5 });
      }
    });
  }

  after(68, () => {
    wave(dim, c, C.ice, 9, 0.45);
    snd(dim, "random.glass", c, 3, 0.6);
    snd(dim, "random.explode", c, 1.5, 1.6);
    shake(dim, c, 0.4, 0.35);
    for (const e of foes(dim, c, 8.5, p)) {
      if (!frozen.has(e.id)) continue;
      const at = add(e.location, { y: 1 });
      spark(dim, at, C.ice, { count: 22, speed: 5, gravity: 9, life: 0.6, size: 0.12, drag: 1 });
      spark(dim, at, C.frost, { count: 10, speed: 3, gravity: 0, life: 0.4, size: 0.18 });
      strike(e, 10, p, C.ice, 0.3);
    }
  });
  return true;
}

/** ☄ 천공유성 — 경고 표식 후 조준 지점에 유성 5개 낙하 */
function meteor(p, dim) {
  const center = aimPoint(p, 40);
  banner(p, "§6§l천공유성", "§7별이 떨어진다");
  snd(dim, "mob.enderdragon.growl", p.location, 1.2, 1.2);
  effect(p, "slowness", 10, 2, false);
  for (let t = 0; t < 10; t += 2) {
    after(t, () => gather(dim, add(p.location, { y: 1.2 }), C.void, 2.2, 0.3, 8));
  }

  for (let i = 0; i < 5; i++) {
    const impact = i === 0 ? center : around(center, 5);
    impact.y = center.y;
    const t0 = 12 + i * 11;
    const fall = 12;

    for (let t = 0; t < t0 + fall; t += 6) {
      after(t, () => wave(dim, impact, C.warn, 2.6, 0.3));
    }
    for (let t = 0; t < fall; t++) {
      after(t0 + t, () => {
        const k = 1 - t / fall;
        const pos = { x: impact.x + k * 10, y: impact.y + k * 32, z: impact.z + k * 6 };
        spark(dim, pos, C.meteor, { count: 4, speed: 0.6, life: 0.3, size: 0.5, gravity: 0 });
        spark(dim, pos, C.void, { count: 2, speed: 0.3, life: 0.25, size: 0.3, gravity: 0 });
        spark(dim, pos, C.ember, { count: 3, speed: 0.4, life: 0.9, size: 0.18, gravity: -0.5, spread: 0.4 });
        fx(dim, "minecraft:basic_smoke_particle", pos);
        if (t === 0) snd(dim, "mob.ghast.fireball", pos, 3, 0.5);
      });
    }
    after(t0 + fall, () => {
      fx(dim, "minecraft:huge_explosion_emitter", impact);
      wave(dim, impact, C.meteor, 6, 0.45);
      wave(dim, impact, C.void, 3.5, 0.3);
      beam(dim, impact, C.meteor, 5, 1.0, 0.3);
      spark(dim, add(impact, { y: 0.4 }), C.ember, { count: 32, speed: 8, gravity: 12, life: 0.8, size: 0.13, drag: 1 });
      snd(dim, "random.explode", impact, 4, 0.7);
      shake(dim, impact, 0.7, 0.6, 20);
      for (const e of foes(dim, impact, 4.5, p)) {
        const falloff = 1 - Math.min(1, dist(e.location, impact) / 6);
        strike(e, 8 + 10 * falloff, p, C.meteor);
        ignite(e, 4);
        knock(e, impact, 1.8, 0.6);
      }
    });
  }
  return true;
}

/** ✨ 성광치유 — 하늘의 빛기둥, 아군 회복·보호막·정화, 언데드 소멸 */
const DEBUFFS = ["poison", "wither", "slowness", "weakness", "blindness", "nausea", "hunger", "mining_fatigue", "darkness"];
function holy(p, dim) {
  const c = p.location;
  banner(p, "§f§l성광치유", "§7빛이 상처를 씻어낸다");
  snd(dim, "beacon.activate", c, 2, 1.2);
  snd(dim, "random.levelup", c, 2, 0.8);
  beam(dim, c, C.holy, 24, 1.4, 1.0);
  beam(dim, c, C.white, 24, 0.5, 0.8);
  wave(dim, c, C.holy, 3, 0.5);

  for (let t = 0; t < 20; t++) {
    after(t, () => {
      for (let s = 0; s < 3; s++) {
        const a = (t / 20) * Math.PI * 4 + (s * Math.PI * 2) / 3;
        const r = 2.4 - (t / 20) * 1.2;
        const pos = { x: c.x + Math.cos(a) * r, y: c.y + (t / 20) * 4, z: c.z + Math.sin(a) * r };
        spark(dim, pos, C.holy, { count: 2, speed: 0.2, life: 0.7, size: 0.14, gravity: -0.5 });
        if (t % 4 === 0) fx(dim, "minecraft:totem_particle", pos);
      }
    });
  }

  after(20, () => {
    wave(dim, c, C.holy, 9, 0.7);
    wave(dim, c, C.white, 6, 0.45);
    spark(dim, add(c, { y: 1.5 }), C.holy, { count: 40, speed: 5, life: 0.8, size: 0.12, gravity: -1, drag: 3 });
    snd(dim, "random.orb", c, 2, 1.4);
    shake(dim, c, 0.15, 0.3);

    for (const ally of guard(() => dim.getPlayers({ location: c, maxDistance: 9 })) ?? []) {
      effect(ally, "instant_health", 1, 1);
      effect(ally, "regeneration", 160, 2);
      effect(ally, "absorption", 600, 1);
      effect(ally, "resistance", 160, 0);
      for (const d of DEBUFFS) guard(() => ally.removeEffect(d));
      const at = add(ally.location, { y: 2.2 });
      spark(dim, at, C.heal, { count: 12, speed: 1, gravity: -2, life: 0.8, size: 0.1 });
      popup(dim, at, "§a§l+ 회복");
    }

    const undead = guard(() => dim.getEntities({ location: c, maxDistance: 9, families: ["undead"] })) ?? [];
    for (const e of undead) {
      beam(dim, e.location, C.holy, 10, 0.5, 0.4);
      strike(e, 12, p, C.holy);
      ignite(e, 5);
      knock(e, c, 1.2, 0.4);
    }
  });
  return true;
}

/* ─── 스킬 등록 ──────────────────────────────────────────── */
const SKILLS = {
  "apieren:skill_thunder": { name: "§e뇌신강림", cd: 10, color: C.volt,  run: thunder },
  "apieren:skill_dash":    { name: "§b질풍신뢰", cd: 6,  color: C.wind,  run: dash },
  "apieren:skill_inferno": { name: "§c홍련폭염", cd: 12, color: C.fire,  run: inferno },
  "apieren:skill_frost":   { name: "§3빙결영역", cd: 14, color: C.frost, run: frost },
  "apieren:skill_meteor":  { name: "§6천공유성", cd: 20, color: C.meteor, run: meteor },
  "apieren:skill_holy":    { name: "§f성광치유", cd: 16, color: C.holy,  run: holy },
};

/* ─── 쿨타임 ─────────────────────────────────────────────── */
const readyAt = new Map(); // `${playerId}|${itemId}` → tick

function remaining(p, itemId) {
  return Math.max(0, (readyAt.get(`${p.id}|${itemId}`) ?? 0) - system.currentTick);
}
function reduceCooldown(p, itemId, factor) {
  const left = remaining(p, itemId);
  if (left > 0) readyAt.set(`${p.id}|${itemId}`, system.currentTick + Math.round(left * factor));
}

world.afterEvents.itemUse.subscribe((ev) => {
  const p = ev.source;
  const id = ev.itemStack?.typeId;
  const skill = SKILLS[id];
  if (!skill || p.typeId !== "minecraft:player") return;

  const left = remaining(p, id);
  if (left > 0) {
    notice(p, `${skill.name} §c쿨타임 ${(left / 20).toFixed(1)}초`, 20);
    snd(p.dimension, "note.bass", p.location, 0.5, 0.6);
    return;
  }
  // 쿨타임을 먼저 걸어 연타 중복 발동을 막고, 실패(false)하면 되돌린다
  readyAt.set(`${p.id}|${id}`, system.currentTick + skill.cd * 20);
  const ok = guard(() => skill.run(p, p.dimension));
  if (ok === false) readyAt.delete(`${p.id}|${id}`);
});

/* ─── HUD: 쿨타임 게이지 · 콤보 · 유물 오라 ─────────────── */
function heldItem(p) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  const slot = p.selectedSlotIndex ?? p.selectedSlot ?? 0;
  return inv?.getItem(slot);
}
function gauge(left, total) {
  const n = 14;
  const filled = Math.round((1 - left / total) * n);
  return `§a${"|".repeat(filled)}§8${"|".repeat(n - filled)}`;
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const p of world.getAllPlayers()) {
    guard(() => {
      const item = heldItem(p);
      const skill = item && SKILLS[item.typeId];
      if (!skill) return;

      // 손에 든 유물이 은은하게 빛난다
      const v = p.getViewDirection();
      const hand = add(p.location, { x: -v.z * 0.45 + v.x * 0.3, y: 1.15, z: v.x * 0.45 + v.z * 0.3 });
      spark(p.dimension, hand, skill.color, { count: 1, speed: 0.3, gravity: -0.6, life: 0.7, size: 0.06, spread: 0.12 });

      if ((noticeUntil.get(p.id) ?? 0) > now) return;
      const left = remaining(p, item.typeId);
      const c = combos.get(p.id);
      const combo = c && c.n >= 2 && now - c.tick <= COMBO_WINDOW ? `   §6§l${c.n} COMBO` : "";
      p.onScreenDisplay.setActionBar(left > 0
        ? `${skill.name}  ${gauge(left, skill.cd * 20)}  §c${(left / 20).toFixed(1)}s${combo}`
        : `${skill.name}  §a§lREADY §r§7· 탭하여 발동${combo}`);
    });
  }
}, 4);

/* 오래된 기록 정리 */
system.runInterval(() => {
  const now = system.currentTick;
  for (const [k, v] of lastHit) if (now - v.tick > COMBO_WINDOW * 2) lastHit.delete(k);
  for (const [k, v] of readyAt) if (v < now) readyAt.delete(k);
}, 200);

/* ─── 스킬 지급 ──────────────────────────────────────────── */
function giveAll(p) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  for (const id of Object.keys(SKILLS)) {
    if (inv.emptySlotsCount === 0) { p.dimension.spawnItem(new ItemStack(id, 1), p.location); continue; }
    inv.addItem(new ItemStack(id, 1));
  }
}

if (CONFIG.starterKit) {
  world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (!initialSpawn || player.hasTag("apieren_kit")) return;
    guard(() => {
      giveAll(player);
      player.addTag("apieren_kit");
      player.sendMessage("§6[APIEREN] §f스킬 유물 6종이 지급되었습니다. 손에 들고 화면을 탭하세요!");
    });
  });
}

/* 분실 시 재지급: 채팅창에 /scriptevent apieren:kit */
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== "apieren:kit" || ev.sourceType !== "Entity" || ev.sourceEntity?.typeId !== "minecraft:player") return;
  guard(() => {
    giveAll(ev.sourceEntity);
    ev.sourceEntity.sendMessage("§6[APIEREN] §f스킬 유물 6종을 다시 지급했습니다.");
  });
});
