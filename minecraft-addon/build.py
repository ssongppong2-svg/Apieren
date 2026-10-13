#!/usr/bin/env python3
"""APIEREN Skill Relics — Bedrock 애드온 빌더

behavior_pack/ · resource_pack/ 의 manifest, 아이템, 레시피, 텍스처를 생성하고
downloads/Apieren-SkillRelics.mcaddon 으로 묶는다.
(behavior_pack/scripts/main.js 는 직접 작성한 파일이므로 건드리지 않는다)

사용법:  python3 minecraft-addon/build.py      (Pillow 필요)
"""
import json
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
BP = ROOT / "behavior_pack"
RP = ROOT / "resource_pack"
OUT = ROOT.parent / "downloads" / "Apieren-SkillRelics.mcaddon"

VERSION = [1, 0, 0]
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

# id, 이름(게임 내), 설명, 색상(어두운 → 밝은), 문양, 레시피 재료
SKILLS = [
    dict(id="thunder", name="§e뇌신강림", glyph="bolt",
         pal=[(92, 64, 6), (202, 138, 4), (251, 191, 36), (255, 245, 170)],
         recipe=("minecraft:lightning_rod", "minecraft:copper_ingot")),
    dict(id="dash", name="§b질풍신뢰", glyph="wind",
         pal=[(10, 70, 90), (14, 150, 170), (94, 234, 212), (220, 255, 250)],
         recipe=("minecraft:feather", "minecraft:diamond")),
    dict(id="inferno", name="§c홍련폭염", glyph="flame",
         pal=[(80, 10, 10), (190, 30, 20), (249, 115, 22), (254, 215, 120)],
         recipe=("minecraft:blaze_rod", "minecraft:magma_cream")),
    dict(id="frost", name="§3빙결영역", glyph="snow",
         pal=[(20, 50, 100), (59, 130, 220), (147, 197, 253), (240, 249, 255)],
         recipe=("minecraft:packed_ice", "minecraft:amethyst_shard")),
    dict(id="meteor", name="§6천공유성", glyph="comet",
         pal=[(60, 20, 70), (140, 50, 30), (234, 120, 20), (255, 220, 140)],
         recipe=("minecraft:fire_charge", "minecraft:obsidian")),
    dict(id="holy", name="§f성광치유", glyph="cross",
         pal=[(110, 90, 30), (214, 180, 70), (253, 230, 138), (255, 255, 245)],
         recipe=("minecraft:golden_apple", "minecraft:glowstone_dust")),
]

GLYPHS = {
    "bolt":  ["..##.", ".##..", ".###.", "..##.", ".##.."],
    "wind":  [".###.", "#...#", "..##.", "....#", ".###."],
    "flame": ["..#..", ".###.", "#####", "#####", ".###."],
    "snow":  ["#.#.#", ".###.", "#####", ".###.", "#.#.#"],
    "comet": ["....#", "...#.", "..###", ".###.", "###.."],
    "cross": ["..#..", "..#..", "#####", "..#..", "..#.."],
}


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def draw_icon(skill: dict) -> Image.Image:
    """16x16 스킬 유물 아이콘: 금장 지팡이 + 빛나는 보석 + 문양"""
    dark, base, light, spark = skill["pal"]
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()

    # 지팡이 (좌하 → 우상)
    shaft = [(2, 14), (3, 13), (4, 12), (5, 11), (6, 10), (7, 9)]
    for i, (x, y) in enumerate(shaft):
        px[x, y] = (88, 58, 28, 255) if i % 2 else (116, 78, 38, 255)
    px[1, 15] = (214, 160, 40, 255)
    px[2, 15] = (150, 108, 30, 255)
    px[1, 14] = (150, 108, 30, 255)
    px[7, 10] = (233, 181, 52, 255)
    px[8, 9] = (233, 181, 52, 255)
    px[8, 10] = (160, 112, 28, 255)

    # 후광 (반투명)
    cx, cy = 10.5, 5.5
    for y in range(16):
        for x in range(16):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if 4.2 < d <= 5.6 and px[x, y][3] == 0:
                px[x, y] = (*base, 70)

    # 보석 본체
    for y in range(16):
        for x in range(16):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d <= 4.2:
                if d > 3.3:
                    c = dark
                else:
                    t = ((x - cx) + (y - cy)) / 6.0  # 좌상(−) → 우하(+)
                    c = light if t < -0.25 else base if t < 0.35 else dark
                px[x, y] = (*c, 255)

    # 문양 (5x5)
    gx, gy = 8, 3
    for r, row in enumerate(GLYPHS[skill["glyph"]]):
        for c, ch in enumerate(row):
            if ch == "#":
                px[gx + c, gy + r] = (*spark, 255)

    # 하이라이트
    px[8, 3] = (255, 255, 255, 255)
    return img


def pack_icon(rgb) -> Image.Image:
    img = Image.new("RGBA", (64, 64), (13, 13, 13, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([2, 2, 61, 61], outline=(251, 191, 36, 255), width=2)
    d.polygon([(32, 10), (50, 32), (32, 54), (14, 32)], fill=(*rgb, 255), outline=(255, 245, 170, 255))
    d.polygon([(32, 20), (42, 32), (32, 44), (22, 32)], fill=(20, 16, 6, 255))
    return img


def build_resource_pack() -> None:
    write_json(RP / "manifest.json", {
        "format_version": 2,
        "header": {
            "name": "APIEREN Skill Relics RP",
            "description": "스킬 유물 아이콘 리소스",
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
    for s in SKILLS:
        draw_icon(s).save(RP / "textures" / "items" / f"skill_{s['id']}.png")
    pack_icon((251, 191, 36)).save(RP / "pack_icon.png")


def build_behavior_pack() -> None:
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
    pack_icon((233, 181, 52)).save(BP / "pack_icon.png")


def package() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for folder, arc in ((BP, "Apieren_SkillRelics_BP"), (RP, "Apieren_SkillRelics_RP")):
            for f in sorted(folder.rglob("*")):
                if f.is_file():
                    z.write(f, f"{arc}/{f.relative_to(folder).as_posix()}")
    print(f"built {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build_resource_pack()
    build_behavior_pack()
    package()
