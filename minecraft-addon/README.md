# APIEREN Skill Relics (Bedrock 애드온)

아이템을 들고 화면을 탭하면 스킬이 발동되는 모바일 친화형 마인크래프트 Bedrock 애드온입니다.

| 아이템 | 스킬 | 쿨타임 |
|---|---|---|
| 뇌신강림 | 공중 차징 → 전격 아크로 이어지는 연쇄 낙뢰 (최대 6체) | 10초 |
| 질풍신뢰 | 잔상 돌진 + 경로 피해, 적중 시 쿨타임 50% 감소 | 6초 |
| 홍련폭염 | 차징 → 화염 대폭발, 불씨 잔류 | 12초 |
| 빙결영역 | 5초 빙결 장판 → 종료 시 얼어붙은 적 산산조각 | 14초 |
| 천공유성 | 경고 표식 후 유성 5개 낙하 | 20초 |
| 성광치유 | 하늘의 빛기둥, 아군 회복·보호막·디버프 정화, 언데드 소멸 | 16초 |

**전투 연출:** 데미지 숫자 팝업, 크리티컬(15%, 1.6배), 콤보 카운터, 처치 연출, 카메라 흔들림,
쿨타임 게이지, 유물을 들면 손에 맺히는 오라.

## 구조
- `behavior_pack/scripts/main.js` — 스킬 로직 (직접 수정하는 파일)
- `build.py` — manifest · 아이템 · 레시피 · 엔티티 · 커스텀 파티클 · 텍스처를 생성하고
  `downloads/Apieren-SkillRelics.mcaddon` 으로 패키징
- 커스텀 파티클 (`resource_pack/particles/`)
  - `apieren:spark` — 발광 입자
  - `apieren:shockwave` — 바닥 충격파
  - `apieren:beam` — 빛기둥
  - `apieren:converge` — 차징 입자
  - 색과 크기는 스크립트에서 Molang 변수로 지정합니다.
- `apieren:float_text` — 데미지 숫자용 투명 엔티티 (1.5초 뒤 자동 소멸)
- 사이트(`index.html`)의 "마크 모드" 페이지가 이 `.mcaddon` 파일을 내려받도록 연결되어 있습니다.

## 수정 후 재빌드
```bash
pip install pillow
python3 minecraft-addon/build.py
```

## 설정 (`main.js` 상단 `CONFIG`)
- `starterKit` — 첫 입장 시 스킬 유물 6종 지급
- `hitPlayers` — 다른 플레이어에게도 피해 (기본 `false`)
- `damageNumbers` — 데미지 숫자 팝업
- `cameraShake` — 카메라 흔들림

## 참고
- 요구 사양: Minecraft Bedrock 1.21.50 이상, `@minecraft/server` 1.14.0 (안정 버전, 실험적 기능 불필요)
- 분실 시 재지급: 채팅창에 `/scriptevent apieren:kit`
- 주민·NPC·길들인 동물은 스킬 대상에서 제외되며, 주민·크리퍼·플레이어 근처에서는 실제 번개 대신 연출만 나옵니다.
