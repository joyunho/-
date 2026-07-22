# ORD 2.305C JASS FSM 트레인 정규화 감사 보고서

## 결과

`BD1` 실행 프레임을 트레인 루트로 정의해 전체 상위(초월·불멸·영원·제한)의 FSM을 정규화했다.

- 전체 FSM 실행단위: **223개**
  - `BDw`/`BDx`/`BDz` 지연 트레인: **210개**
  - 지연 없는 즉시 FSM: **13개**
- 타이머 상태 전이: **635개**
  - `BDw` 320개 / `BDx` 226개 / `BDz` 89개
- 전체 피해 액션: **633개**
  - FSM 트레인에 중복 없이 귀속: **486개**
  - 공격·스펠 핸들러의 비FSM 즉시 피해: **147개**
- 이벤트 대기(`BEF`) 트레인: **35개**
- 타임라인 판정:
  - 정적 단일 경로 확정: **143개**
  - 정적 분기 열거(조건 해소 후 사용): **1개**
  - 이벤트·외부 상태·동적 반복 입력 필요: **79개**

분류별 트레인/귀속 피해는 다음과 같다.

| 분류 | 트레인 | FSM 피해 액션 |
|---|---:|---:|
| 초월 | 112 | 226 |
| 불멸 | 46 | 104 |
| 영원 | 40 | 103 |
| 제한 | 25 | 53 |

## 정규화 단위

각 `trains[]` 레코드에는 다음 항목이 들어 있다.

- `activation.alternatives`: 실제 발동 경로의 OR 목록, JASS guard와 RNG 확률 포함
- `activation.registrationProvenance`: `TriggerAddAction` 등록 근거. 발동 확률로 합산 금지
- `stateMachine.timerTransitions`: 상태별 `BDw`/`BDx`/`BDz`, 지연식, 목적 상태, 조건
- `stateMachine.eventTransitions`: `BEF` 이벤트와 타임아웃 경쟁 경로
- `timeline.variants[].damageFrames`: 실제 피해 시각별 프레임
- `timeline.variants[].tickGroups`: 피해 항별 첫 틱·간격·틱 수·마지막 틱
- `damage.terms`: 검증된 피해식, 조건, 확률, 대상 정책, 타이밍 바인딩
- `damage.perPrimaryTargetExpectedDamagePerActivationAst`: 발동 1회당 피해 합산 AST
- `skillDpsHook`: `options.skillDps` 연결 계약

`damageExecutionCount`는 피해 액션 후보 실행 수이지 틱 수가 아니다. 트레인의 피해 프레임 수는
`damageFrameCount`, 개별 피해 항 반복 수는 `tickGroups[].tickCount`를 사용해야 한다. 서로 배타적인
피해 분기는 반드시 각 `damage.terms[].conditions`를 평가한 뒤 합산한다.

## 런타임 의미

- `BD1(initialState)`: 최초 진입에서만 프레임을 만들고 초기 상태를 쓴다. 타이머·이벤트 재진입에서는 상태를 보존한다.
- `BDw(frame, delay, state)`: 같은 프레임의 단발 타이머를 다시 시작한다. 한 실행 경로에서 마지막 예약만 유효하다.
- `BDx`: 현재 상태 `+1`, `BDz`: 현재 상태 `+delta`로 `BDw`를 호출한다.
- `BDr`: 예약 타이머와 이벤트 대기를 즉시 취소하고 슬롯을 정리한다.
- 재진입 함수가 유효한 예약 없이 끝나면 `BDu`가 자동으로 `BDr`를 호출한다.
- `BEF` 이벤트가 타임아웃보다 먼저 오면 타이머를 멈추고 선언 상태로 즉시 재진입한다.

따라서 `BDw(...); BDr(...)`는 죽은 예약이며 지속시간에 더하지 않는다. 센고쿠 `B02`의 마지막
`BDw(.12,2)`가 대표 사례다.

## DPS 훅 계약

트레인 지속시간을 DPS 분모로 사용하면 안 된다. 서로 다른 발동은 독립 FSM 프레임으로 겹칠 수 있다.

```text
skillDps(train)
  = E[damagePerActivation]
  / activationPeriodSeconds

동일식:
  = E[damagePerActivation] * activationRatePerSecond
```

발동 주기는 다음 상위 트리거 계층에서 공급한다.

- 공격 시작: 공격주기 × JASS 발동 확률
- 스펠: 실제 쿨다운·시전률
- N타·스택: 카운터 상태기계와 체젠·마젠을 함께 반영한 주기
- 이벤트 대기: 이벤트 도착률과 타임아웃 경쟁

`childTrainRefs`는 별도 트레인이므로 부모와 자식에 같은 피해를 이중 합산하지 않는다. 범위 콜백도
주 대상 적중 지시자를 평가하며, 유닛 수를 무조건 곱하지 않는다.

훅은 `executionCountSource`를 반드시 따른다. 정적 확정 트레인은 `timeline.variants`, 수동 검증된
동적 트레인은 `timeline.verifiedTimingFixture.executionCountByActionRef`를 사용한다. 이벤트 적중형은
`executionCountByActionRefWhenEventHits`와 `requiredRuntimeInputs`를 함께 평가한다. 부분 추상 경로는
`abstractTimelinePolicy=do_not_use_abstract_variant_counts_as_DPS_inputs`이므로 후보 실행 수를 DPS에 넣지 않는다.

## 대표 회귀검사

- `B01` 센고쿠: `.24/.33/.42`초에 30만 3틱, 총 90만, `.51`초 종료
- `B02` 센고쿠: `.05/.17/.29/.41`초에 50만 4틱, `.63`초에 200만, 총 400만
- `Bw0` 보아 핸콕: `.23`초 시작, `.05`초 간격 25프레임, 마지막 `1.43`초, `1.90`초 종료
- `BtL` 도플라밍고: 피해 없음, `6.08`초 종료
- `B3C` 빅맘: `.60/1.30/2.00`초 소형 3틱, `2.70`초 대형 1틱, `4.00`초 종료

빅맘처럼 유닛 user-data 교대 상태가 필요한 사례, 이벤트 트레인, 분기형 `BxG`는 추상 실행의 일부 경로를 DPS에
직접 사용하지 않도록 `timeline.authority`를 비권위 부분 경로로 표시했다. 수동 JASS 추적이 끝난 대표
트레인은 `timeline.verifiedTimingFixture`가 우선한다.

## 검증 결과와 남은 런타임 입력

- FSM 루트 223개, 전이 635개, 귀속 피해 486개 모두 일치
- 각 FSM은 정확히 한 상위 프로필에 귀속
- 피해 액션 중복 귀속 없음
- 상태가 빈 타이머·이벤트 전이 없음
- 콜백 피해 타이밍 미바인딩 없음
- 등록 provenance를 발동으로 잘못 합산하지 않음
- 실제 발동원이 확인되지 않은 등록 전용 후보: `BoG` 1개
- 추상 실행 제한 도달: `B1F`, `BqH`, `BuQ`, `Byd`, `Byj`, `BzQ` 6개

위 6개와 나머지 `event_or_runtime_dependent` 트레인은 상태 그래프·피해식 자체는 보존되어 있다.
`options.skillDps`에서는 `requires_runtime_timeline_inputs_and_activation_period` 상태를 확인해 실제 버프,
대상 생존·거리, 스택, 이벤트 도착값을 넣은 뒤 계산해야 한다.
