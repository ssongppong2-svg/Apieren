#!/usr/bin/env python3
"""APIEREN Skill Relics — Bedrock 애드온 빌더

behavior_pack/ · resource_pack/ 의 manifest, 아이템, 레시피, 엔티티, 파티클, 텍스처를 생성하고
downloads/Apieren-SkillRelics.mcaddon 으로 묶는다.
(behavior_pack/scripts/main.js 는 직접 작성한 파일이므로 건드리지 않는다)

사용법:  python3 minecraft-addon/build.py      (Pillow 필요)
"""
import json
import math
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
BP = ROOT / "behavior_pack"
RP = ROOT / "resource_pack"
OUT = ROOT.parent / "downloads" / "Apieren-SkillRelics.mcaddon"

VERSION = [1, 1, 0]
MIN_ENGINE = [1, 21, 50]
SERVER_API = "1.14.0"

# 고정 UUID (재빌드해도 팩 ID가 바뀌지 않아 업데이트 시 덮어쓰기 가능)
UUID = {
    "bp": "6f1c2a4e-3b7d-4c59-9a10-5d2e8b7f1a01",
    "bp_mod": "6f1c2a4e-3b7d-4c59-9a10-5d2e8b7f1a02",
    "bp_script": "6f1c2a4e-3b7d-4c59-9a10-5d2e8b7f1a03",
    "rp": "6f1c2a4e-3b7d-4c59-9a10-5d2e8b7f1a11",
    "rp_mod": "6f1c2a4e-3b7d-4c59-9a10-5d2e8b7f1a12",
}

# 팔레트: 어두운 → 기본 → 밝은 → 하이라이트
SKILLS = [
    dict(id="thunder", name="§e뇌신강림", glyph="bolt",
         pal=[(70, 52, 10), (214, 150, 10), (252, 211, 77), (255, 250, 210)],
         recipe=("minecraft:lightning_rod", "minecraft:copper_ingot")),
    dict(id="dash", name="§b질풍신뢰", glyph="wind",
         pal=[(8, 60, 74), (16, 160, 170), (110, 240, 220), (230, 255, 252)],
         recipe=("minecraft:feather", "minecraft:diamond")),
    dict(id="inferno", name="§c홍련폭염", glyph="flame",
         pal=[(74, 8, 8), (200, 34, 18), (250, 130, 30), (255, 230, 150)],
         recipe=("minecraft:blaze_rod", "minecraft:magma_cream")),
    dict(id="frost", name="§3빙결영역", glyph="snow",
         pal=[(16, 42, 96), (56, 128, 222), (150, 202, 255), (244, 251, 255)],
         recipe=("minecraft:packed_ice", "minecraft:amethyst_shard")),
    dict(id="meteor", name="§6천공유성", glyph="comet",
         pal=[(50, 14, 70), (150, 50, 160), (246, 128, 40), (255, 226, 160)],
         recipe=("minecraft:fire_charge", "minecraft:obsidian")),
    dict(id="holy", name="§f성광치유", glyph="star",
         pal=[(110, 84, 24), (220, 180, 70), (254, 236, 150), (255, 255, 248)],
         recipe=("minecraft:golden_apple", "minecraft:glowstone_dust")),
]

GLYPHS = {
    "bolt":  ["....##.", "...##..", "..##...", ".######", "...##..", "..##...", ".##...."],
    "wind":  [".####..", "#....#.", "..##..#", ".#..#.#", ".#...#.", "..###..", "......."],
    "flame": ["..#....", "..##...", ".####.#", ".#####.", "###.###", "##...##", ".##.##."],
    "snow":  ["#..#..#", ".#.#.#.", "..###..", "#######", "..###..", ".#.#.#.", "#..#..#"],
    "comet": ["......#", ".....#.", "..###..", ".####..", "#####..", "####...", ".##...."],
    "star":  ["...#...", "...#...", "..###..", "#######", "..###..", "...#...", "...#..."],
}

GOLD = [(92, 58, 12), (176, 118, 24), (236, 180, 52), (255, 236, 150)]
WOOD = [(50, 30, 18), (92, 58, 32), (128, 84, 46)]


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ramp(pal, t):
    """0~1 값을 팔레트 단계로 (픽셀아트 느낌을 위해 계단식)"""
    t = max(0.0, min(0.999, t))
    return pal[int(t * len(pal))]


# ─── 아이템 아이콘 (32x32) ─────────────────────────────────
def draw_icon(skill: dict) -> Image.Image:
    dark, base, light, hi = skill["pal"]
    S = 32
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    px = img.load()
    cx, cy, R = 20.5, 11.5, 6.8

    def put(x, y, c, a=255):
        if 0 <= x < S and 0 <= y < S:
            px[x, y] = (*c, a)

    # 1) 후광
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - cx, y - cy)
            if R + 1.5 < d <= R + 4.5:
                a = int(110 * (1 - (d - R - 1.5) / 3.0) ** 1.6)
                if a > 8:
                    put(x, y, base, a)

    # 2) 지팡이 (좌하 → 우상, 2px 두께)
    for i in range(14):
        x, y = 5 + i, 27 - i
        band = i in (3, 4, 9)
        put(x, y, GOLD[1] if band else WOOD[0])
        put(x + 1, y, GOLD[3] if band else WOOD[2])
        put(x, y - 1, GOLD[2] if band else WOOD[1])
    # 손잡이 끝 장식
    for (x, y), c in {(3, 28): GOLD[1], (4, 28): GOLD[2], (3, 29): GOLD[0], (4, 29): GOLD[1],
                      (2, 29): GOLD[0], (3, 30): GOLD[0], (4, 27): GOLD[3], (5, 28): GOLD[1]}.items():
        put(x, y, c)

    # 3) 금장 받침 (보석을 감싸는 반원 + 발톱)
    toward = (-0.707, 0.707)  # 지팡이 방향
    for y in range(S):
        for x in range(S):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            if R - 0.2 < d <= R + 1.3:
                dot = (dx * toward[0] + dy * toward[1]) / (d or 1)
                if dot > -0.25:
                    shade = (-(dx + dy) / (d or 1) + 1) / 2  # 좌상단이 밝게
                    put(x, y, ramp(GOLD, 0.2 + shade * 0.75))
    for ang in (100, 170):  # 발톱
        a = math.radians(ang)
        for r in (R + 1.6, R + 2.5):
            put(round(cx + math.cos(a) * r), round(cy + math.sin(a) * r), GOLD[2] if r < R + 2 else GOLD[3])

    # 4) 보석 (구면 조명 + 계단식 음영)
    L = (-0.48, -0.62, 0.62)
    for y in range(S):
        for x in range(S):
            nx, ny = (x - cx) / R, (y - cy) / R
            dd = nx * nx + ny * ny
            if dd > 1:
                continue
            nz = math.sqrt(1 - dd)
            lum = max(0.0, nx * L[0] + ny * L[1] + nz * L[2])
            core = max(0.0, 1 - math.hypot(nx, ny) * 1.4) * 0.35  # 내부 발광
            c = ramp([dark, base, base, light, light, hi], lum * 0.72 + core)
            if dd > 0.78:
                c = mix(dark, (0, 0, 0), 0.35)  # 테두리
            put(x, y, c)
    # 반사광
    for (x, y) in ((16, 7), (17, 7), (16, 8)):
        put(x, y, (255, 255, 255))
    put(24, 15, hi)

    # 5) 문양 (그림자 + 본체)
    gx, gy = round(cx) - 3, round(cy) - 3
    glyph = GLYPHS[skill["glyph"]]
    on = {(gx + c, gy + r) for r, row in enumerate(glyph) for c, ch in enumerate(row) if ch == "#"}
    edge = mix(dark, (0, 0, 0), 0.45)
    for (x, y) in on:  # 문양이 보석 하이라이트에 묻히지 않도록 외곽선
        for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1)):
            if (x + ox, y + oy) not in on:
                put(x + ox, y + oy, edge)
    for (x, y) in on:
        put(x, y, hi)

    # 6) 반짝임
    for (x, y), a in {(27, 4): 255, (28, 4): 140, (26, 4): 140, (27, 3): 140, (27, 5): 140}.items():
        put(x, y, (255, 255, 240), a)
    return img


# ─── 파티클 텍스처 ────────────────────────────────────────
def soft_disc(size, inner, outer):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / c
            a = 1.0 if d <= inner else max(0.0, 1 - (d - inner) / (outer - inner))
            px[x, y] = (255, 255, 255, int(255 * a ** 1.8))
    return img


def ring_tex(size=64):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / c
            a = math.exp(-((d - 0.9) / 0.06) ** 2) + 0.25 * math.exp(-((d - 0.75) / 0.12) ** 2)
            px[x, y] = (255, 255, 255, int(255 * min(1.0, a)))
    return img


def beam_tex(w=16, h=64):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        fy = 1 - abs(y - (h - 1) / 2) / ((h - 1) / 2)
        for x in range(w):
            fx = 1 - abs(x - (w - 1) / 2) / ((w - 1) / 2)
            px[x, y] = (255, 255, 255, int(255 * (fx ** 2) * min(1, fy * 3)))
    return img


# ─── 파티클 정의 ─────────────────────────────────────────
def billboard(size_expr, mode, tw, th):
    return {
        "size": [size_expr[0], size_expr[1]],
        "facing_camera_mode": mode,
        "uv": {"texture_width": tw, "texture_height": th, "uv": [0, 0], "uv_size": [tw, th]},
    }


def particle(identifier, texture, components):
    return {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": identifier,
                "basic_render_parameters": {"material": "particles_add", "texture": texture},
            },
            "components": components,
        },
    }


FADE = "(1 - v.particle_age / v.particle_lifetime)"
COLOR_FADE = [f"v.color.r * {FADE}", f"v.color.g * {FADE}", f"v.color.b * {FADE}", "1"]

PARTICLES = {
    # 사방으로 튀는 발광 입자: count / speed / life / size / gravity / drag / spread / up
    "spark": particle("apieren:spark", "textures/particle/apieren_glow", {
        "minecraft:emitter_rate_instant": {"num_particles": "math.max(1, v.count)"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {
            "radius": "v.spread",
            "direction": ["math.random(-1, 1)", "math.random(-1, 1) + v.up", "math.random(-1, 1)"],
        },
        "minecraft:particle_initial_speed": "v.speed * (0.45 + v.particle_random_1 * 0.8)",
        "minecraft:particle_lifetime_expression": {
            "max_lifetime": "math.max(0.1, v.life) * (0.6 + v.particle_random_2 * 0.6)"},
        "minecraft:particle_motion_dynamic": {
            "linear_acceleration": [0, "-v.gravity", 0], "linear_drag_coefficient": "v.drag"},
        "minecraft:particle_appearance_billboard": billboard(
            [f"math.max(0.02, v.size) * {FADE}", f"math.max(0.02, v.size) * {FADE}"], "rotate_xyz", 16, 16),
        "minecraft:particle_appearance_tinting": {"color": ["v.color.r", "v.color.g", "v.color.b", "1"]},
    }),
    # 바닥 충격파 링: radius / life
    "shockwave": particle("apieren:shockwave", "textures/particle/apieren_ring", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.max(0.15, v.life)"},
        "minecraft:particle_appearance_billboard": billboard(
            ["math.max(0.5, v.radius) * math.pow(v.particle_age / v.particle_lifetime, 0.55)",
             "math.max(0.5, v.radius) * math.pow(v.particle_age / v.particle_lifetime, 0.55)"],
            "emitter_transform_xz", 64, 64),
        "minecraft:particle_appearance_tinting": {"color": COLOR_FADE},
    }),
    # 수직 빛기둥: height(절반 높이) / size(절반 폭) / life
    "beam": particle("apieren:beam", "textures/particle/apieren_beam", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.max(0.15, v.life)"},
        "minecraft:particle_appearance_billboard": billboard(
            [f"math.max(0.05, v.size) * {FADE}", "math.max(0.5, v.height)"], "lookat_y", 16, 64),
        "minecraft:particle_appearance_tinting": {"color": ["v.color.r", "v.color.g", "v.color.b", "1"]},
    }),
    # 중심으로 모이는 입자 (차징): spread / speed / life / count / size
    "converge": particle("apieren:converge", "textures/particle/apieren_glow", {
        "minecraft:emitter_rate_instant": {"num_particles": "math.max(1, v.count)"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "math.max(0.5, v.spread)", "surface_only": True,
                                           "direction": "inwards"},
        "minecraft:particle_initial_speed": "v.speed",
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.max(0.1, v.life)"},
        "minecraft:particle_appearance_billboard": billboard(
            ["math.max(0.03, v.size) * (0.4 + v.particle_age / v.particle_lifetime)",
             "math.max(0.03, v.size) * (0.4 + v.particle_age / v.particle_lifetime)"], "rotate_xyz", 16, 16),
        "minecraft:particle_appearance_tinting": {"color": ["v.color.r", "v.color.g", "v.color.b", "1"]},
    }),
}


# ─── 팩 아이콘 ───────────────────────────────────────────
def pack_icon(icons) -> Image.Image:
    S = 256
    img = Image.new("RGBA", (S, S), (10, 9, 8, 255))
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([40, 40, 216, 216], fill=(251, 191, 36, 110))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(38)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([6, 6, S - 7, S - 7], radius=26, outline=(251, 191, 36, 255), width=5)
    d.rounded_rectangle([16, 16, S - 17, S - 17], radius=18, outline=(120, 86, 20, 255), width=2)
    # 중앙 문장
    c = S // 2
    d.polygon([(c, 74), (c + 30, c), (c, S - 74), (c - 30, c)], fill=(251, 191, 36, 255))
    d.polygon([(c, 92), (c + 16, c), (c, S - 92), (c - 16, c)], fill=(255, 245, 200, 255))
    # 유물 6종을 육각형으로 배치
    for i, ic in enumerate(icons):
        a = math.radians(-90 + i * 60)
        x, y = c + math.cos(a) * 82, c + math.sin(a) * 82
        big = ic.resize((64, 64), Image.NEAREST)
        img.alpha_composite(big, (round(x - 32), round(y - 32)))
    return img


# ─── 리소스 팩 ───────────────────────────────────────────
def build_resource_pack() -> list:
    write_json(RP / "manifest.json", {
        "format_version": 2,
        "header": {
            "name": "APIEREN Skill Relics RP",
            "description": "스킬 유물 아이콘 · 파티클 리소스",
            "uuid": UUID["rp"], "version": VERSION, "min_engine_version": MIN_ENGINE,
        },
        "modules": [{"type": "resources", "uuid": UUID["rp_mod"], "version": VERSION}],
    })
    write_json(RP / "textures" / "item_texture.json", {
        "resource_pack_name": "apieren",
        "texture_name": "atlas.items",
        "texture_data": {
            f"apieren_skill_{s['id']}": {"textures": f"textures/items/skill_{s['id']}"} for s in SKILLS
        },
    })
    (RP / "textures" / "items").mkdir(parents=True, exist_ok=True)
    icons = []
    for s in SKILLS:
        ic = draw_icon(s)
        ic.save(RP / "textures" / "items" / f"skill_{s['id']}.png")
        icons.append(ic)

    tex = RP / "textures" / "particle"
    tex.mkdir(parents=True, exist_ok=True)
    soft_disc(16, 0.15, 1.0).save(tex / "apieren_glow.png")
    ring_tex().save(tex / "apieren_ring.png")
    beam_tex().save(tex / "apieren_beam.png")
    for name, data in PARTICLES.items():
        write_json(RP / "particles" / f"apieren_{name}.json", data)

    # 데미지 숫자용 엔티티: 모델 없이 이름표만 보인다
    (RP / "textures" / "entity").mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (16, 16), (0, 0, 0, 0)).save(RP / "textures" / "entity" / "apieren_blank.png")
    write_json(RP / "models" / "entity" / "apieren_empty.geo.json", {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {"identifier": "geometry.apieren.empty", "texture_width": 16, "texture_height": 16},
            "bones": [{"name": "root", "pivot": [0, 0, 0]}],
        }],
    })
    write_json(RP / "entity" / "float_text.entity.json", {
        "format_version": "1.10.0",
        "minecraft:client_entity": {
            "description": {
                "identifier": "apieren:float_text",
                "materials": {"default": "entity_alphatest"},
                "textures": {"default": "textures/entity/apieren_blank"},
                "geometry": {"default": "geometry.apieren.empty"},
                "render_controllers": ["controller.render.default"],
            },
        },
    })
    pack_icon(icons).save(RP / "pack_icon.png")
    return icons


# ─── 비헤이비어 팩 ───────────────────────────────────────
def build_behavior_pack(icons) -> None:
    write_json(BP / "manifest.json", {
        "format_version": 2,
        "header": {
            "name": "APIEREN Skill Relics",
            "description": "§6아이템을 들고 화면을 탭하면 웅장한 스킬이 발동됩니다.",
            "uuid": UUID["bp"], "version": VERSION, "min_engine_version": MIN_ENGINE,
        },
        "modules": [
            {"type": "data", "uuid": UUID["bp_mod"], "version": VERSION},
            {"type": "script", "language": "javascript", "uuid": UUID["bp_script"],
             "version": VERSION, "entry": "scripts/main.js"},
        ],
        "dependencies": [
            {"uuid": UUID["rp"], "version": VERSION},
            {"module_name": "@minecraft/server", "version": SERVER_API},
        ],
    })

    write_json(BP / "entities" / "float_text.json", {
        "format_version": "1.20.0",
        "minecraft:entity": {
            "description": {"identifier": "apieren:float_text", "is_spawnable": False, "is_summonable": True},
            "component_groups": {"apieren:despawn": {"minecraft:instant_despawn": {}}},
            "components": {
                "minecraft:type_family": {"family": ["inanimate", "apieren_fx"]},
                "minecraft:collision_box": {"width": 0.1, "height": 0.1},
                "minecraft:physics": {"has_gravity": False, "has_collision": False},
                "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
                "minecraft:damage_sensor": {"triggers": {"cause": "all", "deals_damage": False}},
                "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": False},
                "minecraft:health": {"value": 1, "max": 1},
                # 스크립트가 제거하지 못해도 1.5초 뒤 스스로 사라진다
                "minecraft:timer": {"looping": False, "time": 1.5,
                                    "time_down_event": {"event": "apieren:despawn", "target": "self"}},
            },
            "events": {"apieren:despawn": {"add": {"component_groups": ["apieren:despawn"]}}},
        },
    })

    for s in SKILLS:
        write_json(BP / "items" / f"skill_{s['id']}.json", {
            "format_version": "1.21.0",
            "minecraft:item": {
                "description": {
                    "identifier": f"apieren:skill_{s['id']}",
                    "menu_category": {"category": "equipment"},
                },
                "components": {
                    "minecraft:icon": {"textures": {"default": f"apieren_skill_{s['id']}"}},
                    "minecraft:display_name": {"value": s["name"]},
                    "minecraft:max_stack_size": 1,
                    "minecraft:hand_equipped": True,
                    "minecraft:glint": True,
                },
            },
        })
        rod, gem = s["recipe"]
        write_json(BP / "recipes" / f"skill_{s['id']}.json", {
            "format_version": "1.20.10",
            "minecraft:recipe_shaped": {
                "description": {"identifier": f"apieren:recipe_skill_{s['id']}"},
                "tags": ["crafting_table"],
                "pattern": [" GN", " SG", "S  "],
                "key": {
                    "G": {"item": gem},
                    "N": {"item": "minecraft:nether_star"} if s["id"] == "meteor" else {"item": rod},
                    "S": {"item": "minecraft:stick"},
                },
                "unlock": [{"item": gem}],
                "result": {"item": f"apieren:skill_{s['id']}"},
            },
        })
    pack_icon(icons).save(BP / "pack_icon.png")


def package() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for folder, arc in ((BP, "Apieren_SkillRelics_BP"), (RP, "Apieren_SkillRelics_RP")):
            for f in sorted(folder.rglob("*")):
                if f.is_file():
                    z.write(f, f"{arc}/{f.relative_to(folder).as_posix()}")
    print(f"built {OUT} ({OUT.stat().st_size:,} bytes)")

    # .mcaddon 연결이 안 되는 기기를 위한 개별 팩 (.mcpack, manifest가 zip 루트에 위치)
    for folder, name in ((BP, "Apieren-SkillRelics-BP.mcpack"), (RP, "Apieren-SkillRelics-RP.mcpack")):
        out = OUT.parent / name
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            for f in sorted(folder.rglob("*")):
                if f.is_file():
                    z.write(f, f.relative_to(folder).as_posix())
        print(f"built {out} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    icons = build_resource_pack()
    build_behavior_pack(icons)
    package()
