# APIEREN Skill Relics (Bedrock 애드온)

아이템을 들고 화면을 탭하면 스킬이 발동되는 모바일 친화형 마인크래프트 Bedrock 애드온입니다.

| 아이템 | 스킬 | 쿨타임 |
|---|---|---|
| 뇌신강림 | 주변 적 최대 6체 연쇄 낙뢰 | 10초 |
| 질풍신뢰 | 전방 돌진 + 경로 피해 | 6초 |
| 홍련폭염 | 화염 파동, 점화·넉백 | 12초 |
| 빙결영역 | 5초 빙결 장판, 둔화·약화 | 14초 |
| 천공유성 | 조준 지점에 유성 5개 | 20초 |
| 성광치유 | 아군 회복·보호막, 언데드 정화 | 16초 |

## 구조
- `behavior_pack/scripts/main.js` — 스킬 로직 (직접 수정하는 파일)
- `build.py` — manifest · 아이템 · 레시피 · 텍스처를 생성하고 `downloads/Apieren-SkillRelics.mcaddon` 으로 패키징
- 사이트(`index.html`)의 "마크 모드" 페이지가 이 `.mcaddon` 파일을 내려받도록 연결되어 있습니다.

## 수정 후 재빌드
```bash
pip install pillow
python3 minecraft-addon/build.py
```

## 설정 (`main.js` 상단 `CONFIG`)
- `starterKit` — 첫 입장 시 스킬 아이템 6종 지급 여부
- `hitPlayers` — 스킬이 다른 플레이어에게도 피해를 줄지 여부 (기본 `false`)

## 참고
- 요구 사양: Minecraft Bedrock 1.21.50 이상, `@minecraft/server` 1.14.0 (안정 버전, 실험적 기능 불필요)
- 분실 시 재지급: 채팅창에 `/scriptevent apieren:kit`
- 주민·NPC·길들인 동물은 스킬 대상에서 제외됩니다.
