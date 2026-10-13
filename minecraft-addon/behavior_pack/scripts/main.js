/*
 * APIEREN SKILL RELICS — Bedrock Script API
 * 아이템을 손에 들고 화면을 탭(길게 누르기)하면 스킬이 발동됩니다.
 * 모바일/콘솔/PC 모두 동일하게 "아이템 사용" 입력으로 동작합니다.
 */
import { world, system, ItemStack, EntityDamageCause } from "@minecraft/server";

/* ─── 설정 ───────────────────────────────────────────────── */
const CONFIG = {
  starterKit: true,   // 월드에 처음 입장할 때 스킬 아이템 6종 지급
  hitPlayers: false,  // true 로 바꾸면 스킬이 다른 플레이어에게도 피해를 줍니다
};

/* ─── 유틸 ───────────────────────────────────────────────── */
const rnd = (a, b) => a + Math.random() * (b - a);
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (a) => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** 엔티티가 언로드/사망해도 스킬 전체가 멈추지 않도록 감싼다 */
function guard(fn) {
  try { return fn(); } catch { return undefined; }
}
function after(ticks, fn) {
  return system.runTimeout(() => guard(fn), Math.max(1, ticks));
}

function fx(dim, id, loc) {
  guard(() => dim.spawnParticle(id, loc));
}
function snd(dim, id, loc, vol = 1, pitch = 1) {
  guard(() => dim.runCommand(
    `playsound ${id} @a ${loc.x.toFixed(1)} ${loc.y.toFixed(1)} ${loc.z.toFixed(1)} ${vol} ${pitch}`
  ));
}
function ring(dim, id, center, r, y = 0.2, count) {
  const n = count ?? Math.max(14, Math.round(r * 9));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    fx(dim, id, { x: center.x + Math.cos(a) * r, y: center.y + y, z: center.z + Math.sin(a) * r });
  }
}
function burst(dim, id, center, r, count) {
  for (let i = 0; i < count; i++) {
    fx(dim, id, {
      x: center.x + rnd(-r, r),
      y: center.y + rnd(0, r),
      z: center.z + rnd(-r, r),
    });
  }
}

function banner(p, title, sub) {
  guard(() => p.onScreenDisplay.setTitle(title, {
    subtitle: sub, fadeInDuration: 2, stayDuration: 18, fadeOutDuration: 10,
  }));
}
function notice(p, msg) {
  guard(() => p.onScreenDisplay.setActionBar(msg));
}

/** 시전자 주변의 적 목록 */
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
    if (guard(() => !!e.getComponent("minecraft:is_tamed"))) return false; // 길들인 반려동물 보호
    return guard(() => !!e.getComponent("minecraft:health")) === true;
  });
}

function hurt(target, amount, src) {
  guard(() => target.applyDamage(amount, { cause: EntityDamageCause.entityAttack, damagingEntity: src }));
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
function effect(target, id, ticks, amp = 0) {
  guard(() => target.addEffect(id, ticks, { amplifier: amp, showParticles: true }));
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

/* ─── 스킬 6종 ───────────────────────────────────────────── */

/** ⚡ 뇌신강림 — 주변 적 최대 6체에 연쇄 낙뢰 */
function thunder(p, dim) {
  const origin = p.location;
  const targets = foes(dim, origin, 18, p)
    .sort((a, b) => dist(a.location, origin) - dist(b.location, origin))
    .slice(0, 6);

  banner(p, "§e§l뇌신강림", "§7하늘이 그대의 부름에 응답한다");
  snd(dim, "ambient.weather.thunder", origin, 3, 0.9);
  ring(dim, "minecraft:electric_spark_particle", origin, 2.5, 0.3);

  const strike = (pt, victim, delay) => after(delay, () => {
    const at = victim ? victim.location : pt;
    guard(() => dim.spawnEntity("minecraft:lightning_bolt", at));
    burst(dim, "minecraft:electric_spark_particle", at, 1.6, 22);
    fx(dim, "minecraft:huge_explosion_emitter", at);
    snd(dim, "item.trident.thunder", at, 3, 1);
    if (victim) { hurt(victim, 9, p); ignite(victim, 3); }
  });

  if (targets.length === 0) {
    const pt = aimPoint(p, 22);
    for (let i = 0; i < 3; i++) strike({ x: pt.x + rnd(-3, 3), y: pt.y, z: pt.z + rnd(-3, 3) }, null, 6 + i * 5);
  } else {
    targets.forEach((t, i) => strike(t.location, t, 6 + i * 4));
  }
  return true;
}

/** 🌪 질풍신뢰 — 전방 돌진, 경로상의 적에게 피해 */
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
  effect(p, "speed", 80, 2);
  effect(p, "slow_falling", 60, 0);
  effect(p, "resistance", 40, 1);

  const hit = new Set();
  const perTick = Math.ceil(path.length / 4);
  let idx = 0;
  const loop = system.runInterval(() => {
    const ok = guard(() => {
      const upto = Math.min(path.length, idx + perTick);
      for (; idx < upto; idx++) {
        const pos = path[idx];
        burst(dim, "minecraft:critical_hit_emitter", pos, 0.6, 4);
        fx(dim, "minecraft:cauldron_explosion_emitter", pos);
        for (const e of foes(dim, pos, 2.4, p)) {
          if (hit.has(e.id)) continue;
          hit.add(e.id);
          hurt(e, 7, p);
          knock(e, pos, 1.4, 0.5);
          burst(dim, "minecraft:critical_hit_emitter", e.location, 0.8, 10);
        }
      }
      p.teleport(path[Math.min(idx, path.length) - 1], { dimension: dim, keepVelocity: false });
      return idx < path.length;
    });
    if (!ok) {
      system.clearRun(loop);
      guard(() => {
        const end = p.location;
        snd(dim, "random.explode", end, 1, 1.8);
        ring(dim, "minecraft:cauldron_explosion_emitter", end, 1.8, 0.2, 12);
      });
    }
  }, 1);
  return true;
}

/** 🔥 홍련폭염 — 주변 폭발, 화염 확산 */
function inferno(p, dim) {
  const c = p.location;
  banner(p, "§c§l홍련폭염", "§7모든 것을 불사른다");
  snd(dim, "mob.blaze.shoot", c, 3, 0.7);
  fx(dim, "minecraft:huge_explosion_emitter", c);

  for (let r = 1; r <= 8; r++) {
    after(r, () => {
      ring(dim, "minecraft:basic_flame_particle", c, r, 0.3);
      if (r % 2 === 0) ring(dim, "minecraft:lava_particle", c, r - 0.5, 0.6, 10);
    });
  }
  for (let i = 0; i < 8; i++) {
    after(i * 2, () => burst(dim, "minecraft:basic_flame_particle", add(c, { x: 0, y: i * 0.5, z: 0 }), 1.2, 10));
  }
  after(3, () => {
    snd(dim, "random.explode", c, 3, 0.8);
    for (const e of foes(dim, c, 7.5, p)) {
      hurt(e, 11, p);
      ignite(e, 6);
      knock(e, c, 2.2, 0.7);
    }
  });
  return true;
}

/** ❄ 빙결영역 — 5초간 이어지는 빙결 장판 */
function frost(p, dim) {
  const c = p.location;
  banner(p, "§3§l빙결영역", "§7시간마저 얼어붙는다");
  snd(dim, "random.glass", c, 2, 0.5);
  snd(dim, "mob.polar_bear.warning", c, 1, 0.6);

  for (let pulse = 0; pulse < 6; pulse++) {
    after(pulse * 10, () => {
      ring(dim, "minecraft:snowball_poof_particle", c, 8, 0.3, 36);
      ring(dim, "minecraft:snowball_poof_particle", c, 4, 0.3, 20);
      for (let i = 0; i < 22; i++) {
        const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 8;
        const pos = { x: c.x + Math.cos(a) * r, y: c.y + rnd(0.1, 2.5), z: c.z + Math.sin(a) * r };
        fx(dim, "minecraft:snowball_poof_particle", pos);
        if (i % 3 === 0) fx(dim, "minecraft:white_smoke_particle", pos);
      }
      for (const e of foes(dim, c, 8, p)) {
        hurt(e, 3, p);
        effect(e, "slowness", 70, 3);
        effect(e, "weakness", 70, 1);
      }
    });
  }
  after(60, () => {
    snd(dim, "random.glass", c, 2, 1.4);
    burst(dim, "minecraft:snowball_poof_particle", c, 6, 60);
  });
  return true;
}

/** ☄ 천공유성 — 조준 지점에 유성 5개 낙하 */
function meteor(p, dim) {
  const center = aimPoint(p, 40);
  banner(p, "§6§l천공유성", "§7별이 떨어진다");
  snd(dim, "mob.wither.spawn", p.location, 1.5, 1.5);
  ring(dim, "minecraft:villager_angry", center, 5, 0.3, 24);

  for (let i = 0; i < 5; i++) {
    const a = rnd(0, Math.PI * 2), r = i === 0 ? 0 : rnd(1.5, 5);
    const impact = { x: center.x + Math.cos(a) * r, y: center.y, z: center.z + Math.sin(a) * r };
    const t0 = 14 + i * 6;
    const fall = 10;

    for (let t = 0; t < fall; t++) {
      after(t0 + t, () => {
        const k = 1 - t / fall;
        const pos = { x: impact.x + k * 9, y: impact.y + k * 30, z: impact.z + k * 5 };
        burst(dim, "minecraft:basic_flame_particle", pos, 0.5, 6);
        burst(dim, "minecraft:lava_particle", pos, 0.4, 2);
        fx(dim, "minecraft:basic_smoke_particle", pos);
      });
    }
    after(t0 + fall, () => {
      fx(dim, "minecraft:huge_explosion_emitter", impact);
      ring(dim, "minecraft:basic_flame_particle", impact, 3.5, 0.3, 24);
      snd(dim, "random.explode", impact, 4, 0.7);
      for (const e of foes(dim, impact, 4.5, p)) {
        const falloff = 1 - Math.min(1, dist(e.location, impact) / 6);
        hurt(e, 8 + 8 * falloff, p);
        ignite(e, 4);
        knock(e, impact, 1.8, 0.6);
      }
    });
  }
  return true;
}

/** ✨ 성광치유 — 아군 회복 · 보호막, 언데드 정화 */
function holy(p, dim) {
  const c = p.location;
  banner(p, "§f§l성광치유", "§7빛이 상처를 씻어낸다");
  snd(dim, "beacon.activate", c, 2, 1.2);
  snd(dim, "random.levelup", c, 2, 0.8);

  for (const ally of guard(() => dim.getPlayers({ location: c, maxDistance: 9 })) ?? []) {
    effect(ally, "instant_health", 1, 1);
    effect(ally, "regeneration", 160, 2);
    effect(ally, "absorption", 600, 1);
    effect(ally, "resistance", 160, 0);
  }

  for (let t = 0; t < 20; t++) {
    after(t, () => {
      for (let s = 0; s < 3; s++) {
        const a = (t / 20) * Math.PI * 4 + (s * Math.PI * 2) / 3;
        const r = 2.4 - (t / 20) * 1.2;
        const pos = { x: c.x + Math.cos(a) * r, y: c.y + (t / 20) * 4, z: c.z + Math.sin(a) * r };
        fx(dim, "minecraft:totem_particle", pos);
        fx(dim, "minecraft:villager_happy", pos);
      }
    });
  }
  after(20, () => {
    burst(dim, "minecraft:totem_particle", add(c, { x: 0, y: 1, z: 0 }), 3, 50);
    ring(dim, "minecraft:villager_happy", c, 7, 0.3, 36);
    const undead = guard(() => dim.getEntities({ location: c, maxDistance: 9, families: ["undead"] })) ?? [];
    for (const e of undead) { hurt(e, 12, p); ignite(e, 5); knock(e, c, 1.2, 0.4); }
  });
  return true;
}

/* ─── 스킬 등록 ──────────────────────────────────────────── */
const SKILLS = {
  "apieren:skill_thunder": { name: "§e뇌신강림", cd: 10, run: thunder },
  "apieren:skill_dash":    { name: "§b질풍신뢰", cd: 6,  run: dash },
  "apieren:skill_inferno": { name: "§c홍련폭염", cd: 12, run: inferno },
  "apieren:skill_frost":   { name: "§3빙결영역", cd: 14, run: frost },
  "apieren:skill_meteor":  { name: "§6천공유성", cd: 20, run: meteor },
  "apieren:skill_holy":    { name: "§f성광치유", cd: 16, run: holy },
};

/* ─── 쿨타임 ─────────────────────────────────────────────── */
const readyAt = new Map(); // `${playerId}|${itemId}` → tick

function remaining(p, itemId) {
  return Math.max(0, (readyAt.get(`${p.id}|${itemId}`) ?? 0) - system.currentTick);
}

world.afterEvents.itemUse.subscribe((ev) => {
  const p = ev.source;
  const skill = SKILLS[ev.itemStack?.typeId];
  if (!skill || p.typeId !== "minecraft:player") return;

  const left = remaining(p, ev.itemStack.typeId);
  if (left > 0) {
    notice(p, `${skill.name} §c쿨타임 ${(left / 20).toFixed(1)}초`);
    return;
  }
  const ok = guard(() => skill.run(p, p.dimension));
  if (ok !== false) {
    readyAt.set(`${p.id}|${ev.itemStack.typeId}`, system.currentTick + skill.cd * 20);
  }
});

/* 손에 든 스킬 아이템의 상태를 액션바에 표시 (모바일에서 쿨타임 확인용) */
function heldItem(p) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  const slot = p.selectedSlotIndex ?? p.selectedSlot ?? 0;
  return inv?.getItem(slot);
}
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    guard(() => {
      const item = heldItem(p);
      const skill = item && SKILLS[item.typeId];
      if (!skill) return;
      const left = remaining(p, item.typeId);
      notice(p, left > 0
        ? `${skill.name} §c쿨타임 ${(left / 20).toFixed(1)}초`
        : `${skill.name} §a사용 가능 §7(화면을 탭해서 발동)`);
    });
  }
}, 5);

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
