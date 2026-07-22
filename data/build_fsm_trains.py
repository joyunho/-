#!/usr/bin/env python3
"""Build a normalized ORD 2.305C FSM-train digest from the verified action AST.

The output is intentionally a digest, not a second copy of the 33 MiB action AST.
Every numeric expression and action is referenced back to the authoritative AST.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "deliverables" / "ORD_2305C_all_upper_skill_profiles_action_ast.json"
DEFAULT_OUTPUT = ROOT / "deliverables" / "ORD_2305C_all_upper_skill_profiles_fsm_trains.json"

CONTROL_KINDS = {
    "fsm_slot_write",
    "schedule_fsm_step",
    "fsm_terminate",
    "await_unit_event",
    "cancel_unit_event_wait",
}
SCHEDULE_OPS = {"BDw", "BDx", "BDz"}


class _Unknown:
    def __deepcopy__(self, memo: dict[int, Any]) -> "_Unknown":
        return self


UNKNOWN = _Unknown()


# Hand-traced regression fixtures are deliberately small and explicit.  They
# protect the abstract solver from looking authoritative on event/state cases
# that require inputs it cannot infer from a single invocation.
VERIFIED_TIMING_FIXTURES: dict[str, dict[str, Any]] = {
    "B01": {
        "unit": "센고쿠",
        "activation": "A16P 보유 시 공격당 독립 8%",
        "damageFrameOffsetsSeconds": [0.24, 0.33, 0.42],
        "tickCount": 3,
        "tickIntervalSeconds": 0.09,
        "totalDamageFormula": "3 * 300000 = 900000",
        "terminationOffsetSeconds": 0.51,
    },
    "B02": {
        "unit": "센고쿠",
        "activation": "life 카운터 증가 후 75 도달",
        "damageFrameOffsetsSeconds": [0.05, 0.17, 0.29, 0.41, 0.63],
        "tickGroups": [
            {"firstTickOffsetSeconds": 0.05, "tickIntervalSeconds": 0.12, "tickCount": 4, "damagePerTick": 500000},
            {"firstTickOffsetSeconds": 0.63, "tickCount": 1, "damagePerTick": 2000000},
        ],
        "totalDamageFormula": "4 * 500000 + 2000000 = 4000000",
        "terminationOffsetSeconds": 0.63,
        "deadScheduleRule": "state 2의 BDw(.12,2)는 직후 BDr로 취소",
    },
    "Bw0": {
        "unit": "보아 핸콕",
        "activation": "mana 카운터 175 도달",
        "firstDamageOffsetSeconds": 0.23,
        "lastDamageOffsetSeconds": 1.43,
        "damageFrameCount": 25,
        "tickIntervalSeconds": 0.05,
        "terminationOffsetSeconds": 1.90,
    },
    "B1a": {
        "unit": "드래곤",
        "activation": "mana 카운터 160 도달",
        "firstDamageOffsetSeconds": 0.14,
        "tickCount": 11,
        "tickIntervalDistribution": "U(0.1,0.4)",
        "expectedLastDamageOffsetSeconds": 2.64,
        "expectedTerminationOffsetSeconds": 2.89,
        "terminationRangeSeconds": [1.39, 4.39],
        "expectedTotalDamage": 4950000,
        "executionCountByActionRef": {"jass.B1a.L35447.A21": 11},
        "runtimeInputs": [],
    },
    "B3C": {
        "unit": "빅맘",
        "activation": "A117 보유 및 스택 15 도달",
        "damageFrameOffsetsSeconds": [0.60, 1.30, 2.00, 2.70],
        "tickGroups": [
            {"offsetsSeconds": [0.60, 1.30, 2.00], "tickCount": 3, "damageFormulaPerTick": "200000 + 5000*C"},
            {"offsetsSeconds": [2.70], "tickCount": 1, "damageFormulaPerTick": "600000 + 15000*C"},
        ],
        "totalDamageFormula": "1200000 + 30000*C (C=item charges)",
        "terminationOffsetSeconds": 4.00,
        "executionCountByActionRef": {
            "jass.B3C.L37108.A31": 3,
            "jass.B3C.L37127.A41": 1,
        },
        "overrideReason": "unit user-data alternates internal phases; abstract partial timeline is non-authoritative",
        "runtimeInputs": ["itemCharges:C"],
    },
    "BtD": {
        "unit": "도플라밍고 H09E",
        "activation": "매 공격 damage-event listener",
        "eventWindowSeconds": 0.45,
        "eventDamageFormula": "0.75*D + 75000",
        "eventDamageOffset": "tau",
        "timeoutDamage": 0,
        "executionCountByActionRefWhenEventHits": {"jass.BtD.L24902.A11": 1},
        "runtimeInputs": ["eventOccurredBeforeTimeout", "eventDamage:D", "eventArrivalOffset:tau"],
    },
    "BtE": {
        "unit": "도플라밍고 H09D",
        "activation": "매 공격 damage-event listener",
        "eventWindowSeconds": 0.45,
        "eventDamageFormula": "1.05*D + 105000",
        "eventDamageOffset": "tau",
        "timeoutDamage": 0,
        "executionCountByActionRefWhenEventHits": {"jass.BtE.L24920.A11": 1},
        "runtimeInputs": ["eventOccurredBeforeTimeout", "eventDamage:D", "eventArrivalOffset:tau"],
    },
    "BtH": {
        "unit": "도플라밍고 양 폼",
        "activation": "공격당 독립 10%",
        "damageFrameOffsetsSeconds": [0.12],
        "tickCount": 1,
        "directDamage": 200000,
        "terminationOffsetSeconds": 0.12,
    },
    "Bx4": {
        "unit": "미호크",
        "activation": "매 공격 damage-event listener",
        "eventWindowSeconds": 0.49,
        "eventResumeOffset": "tau",
        "criticalReachability": "state 59 무예약 자동 종료; state 60 도달 불가",
        "fixedDirectExpectedDamageGivenEvent": 378976,
        "spatialSweep": "12% 경로에서 적당 700000, 그룹 중복 방지, 별도 공간 항",
        "runtimeInputs": ["eventOccurredBeforeTimeout", "eventArrivalOffset:tau", "spatialPrimaryTargetHit"],
    },
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def literal_value(expr: Any) -> Any:
    if isinstance(expr, dict) and expr.get("node") == "literal":
        return expr.get("value", UNKNOWN)
    return UNKNOWN


def walk_expr(expr: Any) -> Iterable[dict[str, Any]]:
    if isinstance(expr, dict):
        if "node" in expr:
            yield expr
        for value in expr.values():
            yield from walk_expr(value)
    elif isinstance(expr, list):
        for value in expr:
            yield from walk_expr(value)


def contains_call(expr: Any, names: set[str]) -> bool:
    return any(node.get("node") == "call" and node.get("function") in names for node in walk_expr(expr))


def contains_array(expr: Any, name: str) -> bool:
    return any(node.get("node") == "array_ref" and node.get("array") == name for node in walk_expr(expr))


def expr_function_refs(value: Any) -> set[str]:
    return {
        node["function"]
        for node in walk_expr(value)
        if node.get("node") == "function_ref" and isinstance(node.get("function"), str)
    }


def as_number(value: Any) -> float | int | object:
    if isinstance(value, bool):
        return UNKNOWN
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return value
    return UNKNOWN


def slot_from_key(expr: Any, instance_var: str = "DR", stride_var: str = "EM") -> int | object:
    """Recognize DR*EM+slot (and the harmless commuted forms)."""

    def is_var(x: Any, name: str) -> bool:
        return isinstance(x, dict) and x.get("node") == "variable" and x.get("name") == name

    def is_product(x: Any) -> bool:
        if not isinstance(x, dict) or x.get("node") != "binary" or x.get("operator") != "*":
            return False
        return (is_var(x.get("left"), instance_var) and is_var(x.get("right"), stride_var)) or (
            is_var(x.get("right"), instance_var) and is_var(x.get("left"), stride_var)
        )

    if isinstance(expr, dict) and expr.get("node") == "binary" and expr.get("operator") == "+":
        for product, offset in ((expr.get("left"), expr.get("right")), (expr.get("right"), expr.get("left"))):
            value = literal_value(offset)
            if is_product(product) and isinstance(value, int):
                return value
    return UNKNOWN


def eval_expr(expr: Any, state: int, slots: dict[tuple[str, int], Any] | None) -> Any:
    if not isinstance(expr, dict):
        return UNKNOWN
    node = expr.get("node")
    if node == "literal":
        return expr.get("value", UNKNOWN)
    if node == "group":
        return eval_expr(expr.get("expression") or expr.get("value"), state, slots)
    if node == "variable":
        name = expr.get("name")
        if name in {"true", "bj_TRUE"}:
            return True
        if name in {"false", "bj_FALSE"}:
            return False
        return UNKNOWN
    if node == "array_ref" and expr.get("array") == "HN":
        index = expr.get("index")
        if isinstance(index, dict) and index.get("node") == "variable" and index.get("name") == "DR":
            return state
        return UNKNOWN
    if node == "unary":
        value = eval_expr(expr.get("operand") or expr.get("expression"), state, slots)
        if value is UNKNOWN:
            return UNKNOWN
        op = expr.get("operator")
        try:
            if op in {"-", "minus"}:
                return -value
            if op in {"+", "plus"}:
                return +value
            if op in {"not", "!"}:
                return not bool(value)
        except (TypeError, ValueError):
            return UNKNOWN
        return UNKNOWN
    if node == "binary":
        left = eval_expr(expr.get("left"), state, slots)
        right = eval_expr(expr.get("right"), state, slots)
        op = expr.get("operator")
        if op in {"and", "&&"}:
            if left is False or right is False:
                return False
            if left is True and right is True:
                return True
            return UNKNOWN
        if op in {"or", "||"}:
            if left is True or right is True:
                return True
            if left is False and right is False:
                return False
            return UNKNOWN
        if left is UNKNOWN or right is UNKNOWN:
            return UNKNOWN
        try:
            if op == "+":
                return left + right
            if op == "-":
                return left - right
            if op == "*":
                return left * right
            if op == "/":
                return left / right
            if op in {"mod", "%"}:
                return left % right
            if op == "==":
                return left == right
            if op == "!=":
                return left != right
            if op == "<":
                return left < right
            if op == "<=":
                return left <= right
            if op == ">":
                return left > right
            if op == ">=":
                return left >= right
        except (TypeError, ValueError, ZeroDivisionError):
            return UNKNOWN
        return UNKNOWN
    if node == "call":
        name = expr.get("function")
        args = expr.get("arguments", [])
        if name in {"I2R", "R2I"} and len(args) == 1:
            value = eval_expr(args[0], state, slots)
            if value is UNKNOWN:
                return UNKNOWN
            return float(value) if name == "I2R" else int(value)
        table_map = {
            "LoadInteger": "integer",
            "LoadReal": "real",
            "LoadBoolean": "boolean",
            "LoadUnitHandle": "unit",
            "LoadLocationHandle": "location",
            "LoadGroupHandle": "group",
            "LoadPlayerHandle": "player",
            "LoadEffectHandle": "effect",
            "LoadStr": "string",
        }
        if name in table_map and len(args) >= 3:
            slot = slot_from_key(args[2])
            if slot is not UNKNOWN:
                if slots is None:
                    return UNKNOWN
                default = {"integer": 0, "real": 0.0, "boolean": False}.get(table_map[name], UNKNOWN)
                return slots.get((table_map[name], slot), default)
        return UNKNOWN
    return UNKNOWN


def guard_known_result(action: dict[str, Any], state: int, slots: dict[tuple[str, int], Any] | None) -> bool | object:
    unresolved = False
    for guard in action.get("guards", []):
        value = eval_expr(guard.get("expression"), state, slots)
        if value is UNKNOWN:
            unresolved = True
        elif bool(value) != bool(guard.get("truth")):
            return False
    return UNKNOWN if unresolved else True


def guard_condition_payload(action: dict[str, Any], strip_state: bool = False) -> list[dict[str, Any]]:
    result = []
    for guard in action.get("guards", []):
        expr = guard.get("expression")
        if strip_state and contains_array(expr, "HN") and not contains_call(expr, {"LoadInteger", "LoadReal"}):
            continue
        item = {
            "truth": bool(guard.get("truth")),
            "expression": expr,
            "sourceLine": guard.get("sourceLine"),
        }
        if guard.get("randomGate"):
            item["randomGate"] = guard["randomGate"]
        result.append(item)
    return result


def random_probability(action: dict[str, Any]) -> float:
    probability = 1.0
    seen: set[str] = set()
    for guard in action.get("guards", []):
        gate = guard.get("randomGate")
        if not gate:
            continue
        roll_id = gate.get("rollId") or canonical(gate)
        if roll_id in seen:
            continue
        seen.add(roll_id)
        p = gate.get("probability")
        if isinstance(p, (int, float)):
            probability *= float(p) if guard.get("truth") else 1.0 - float(p)
    return probability


def expression_dependencies(expr: Any) -> list[str]:
    deps: set[str] = set()
    for node in walk_expr(expr):
        if node.get("node") == "variable":
            name = node.get("name")
            if isinstance(name, str) and name not in {"DR", "EM", "FP", "FW", "E2", "E9"}:
                deps.add(name)
        elif node.get("node") == "call":
            name = node.get("function")
            if name in {
                "GetEventDamage", "GetUnitStateSwap", "GetWidgetLife", "GetUnitAbilityLevel",
                "GetUnitAbilityLevelSwapped", "GetHeroStatBJ", "GetItemCharges", "zL", "zM",
            }:
                deps.add(name)
    return sorted(deps)


def state_literals_from_expr(expr: Any) -> set[int]:
    values: set[int] = set()
    if not isinstance(expr, dict):
        return values
    if expr.get("node") == "binary" and expr.get("operator") in {"==", "!=", "<", "<=", ">", ">="}:
        left, right = expr.get("left"), expr.get("right")
        if contains_array(left, "HN"):
            value = literal_value(right)
            if isinstance(value, int):
                values.add(value)
        if contains_array(right, "HN"):
            value = literal_value(left)
            if isinstance(value, int):
                values.add(value)
    for node in walk_expr(expr):
        if node is expr:
            continue
        if node.get("node") == "binary":
            values.update(state_literals_from_expr(node))
    return values


def candidate_states(actions: list[dict[str, Any]], initial: int) -> list[int]:
    values = {initial}
    for action in actions:
        for guard in action.get("guards", []):
            values.update(state_literals_from_expr(guard.get("expression")))
        if action.get("kind") == "schedule_fsm_step":
            target = literal_value(action.get("nextState"))
            if isinstance(target, int):
                values.add(target)
    maximum = max(values) if values else initial
    # Generated FSMs conventionally use dense state numbers. Dense enumeration also
    # captures else/range branches without inventing states above the largest anchor.
    if 0 <= maximum <= 256:
        values.update(range(0, maximum + 1))
    return sorted(v for v in values if -16 <= v <= 512)


def action_source_states(action: dict[str, Any], states: list[int]) -> list[int]:
    possible = []
    for state in states:
        # State topology must not assume an empty runtime frame slot is zero:
        # the slot may have been populated on an earlier state.  Only HN is
        # concrete in this structural pass; all Load* values remain UNKNOWN.
        result = guard_known_result(action, state, None)
        if result is not False:
            possible.append(state)
    return possible


def function_ref(expr: Any) -> str | None:
    if isinstance(expr, dict) and expr.get("node") == "function_ref":
        return expr.get("function")
    refs = sorted(expr_function_refs(expr))
    return refs[0] if len(refs) == 1 else None


def raw_callback_calls(function_record: dict[str, Any]) -> list[dict[str, Any]]:
    """Return function-ref calls that have no semantic action of their own."""
    result = []
    for node in walk_expr(function_record.get("body", [])):
        if node.get("node") != "call_statement":
            continue
        expression = node.get("expression")
        refs = sorted(expr_function_refs(expression))
        if not refs:
            continue
        result.append({
            "line": node.get("line"),
            "source": node.get("source"),
            "operation": expression.get("function") if isinstance(expression, dict) else None,
            "targetFunctions": refs,
        })
    return result


def trigger_targets(document: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for registration_key, registrations in document["actionAst"]["dispatch"]["registrations"].items():
        trigger_key = registration_key.split("::", 1)[-1]
        for registration in registrations:
            item = dict(registration)
            item["registrationKey"] = registration_key
            result[trigger_key].append(item)
    return result


def registered_trigger_runtime_sources(functions: dict[str, dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Recover runtime sources omitted from semantic ``TriggerExecute`` actions.

    Two generated-map patterns need this pass: a trigger registered directly to
    a Warcraft event, and ``BUk(frame, trigger)`` which resumes a prepared FSM
    frame through a trigger without calling ``TriggerExecute`` in user code.
    """
    event_calls: dict[str, list[dict[str, Any]]] = defaultdict(list)
    condition_refs: dict[tuple[str, str], list[str]] = defaultdict(list)
    resume_calls: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for function, record in functions.items():
        for node in walk_expr(record.get("body", [])):
            if node.get("node") != "call":
                continue
            name = node.get("function")
            args = node.get("arguments", [])
            if name == "TriggerAddCondition" and len(args) >= 2:
                trigger = args[0].get("name") if isinstance(args[0], dict) and args[0].get("node") == "variable" else None
                if trigger:
                    condition_refs[(function, trigger)].extend(sorted(expr_function_refs(args[1])))
            elif isinstance(name, str) and name.startswith("TriggerRegister") and args:
                trigger = args[0].get("name") if isinstance(args[0], dict) and args[0].get("node") == "variable" else None
                if trigger:
                    event_calls[trigger].append({
                        "callerFunction": function,
                        "mechanism": "registered_game_event",
                        "registrationCall": node,
                    })
            elif name == "BUk" and len(args) >= 2:
                trigger = args[1].get("name") if isinstance(args[1], dict) and args[1].get("node") == "variable" else None
                if trigger:
                    resume_calls[trigger].append({
                        "callerFunction": function,
                        "mechanism": "prepared_fsm_trigger_resume",
                        "resumeCall": node,
                    })

    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for trigger, entries in event_calls.items():
        for entry in entries:
            item = dict(entry)
            item["conditionFunctionRefs"] = sorted(set(condition_refs.get((entry["callerFunction"], trigger), [])))
            result[trigger].append(item)
    for trigger, entries in resume_calls.items():
        result[trigger].extend(entries)
    return result


def child_closure(
    root: str,
    functions: dict[str, dict[str, Any]],
    fsm_roots: set[str],
) -> tuple[set[str], set[str]]:
    """Reachable closure, stopping at other FSM roots to prevent double counting."""
    visited = {root}
    child_trains: set[str] = set()
    queue = deque([root])
    while queue:
        current = queue.popleft()
        for edge in functions.get(current, {}).get("callEdges", []):
            target = edge.get("target")
            if target not in functions:
                continue
            if target in fsm_roots and target != root:
                child_trains.add(target)
                continue
            if target not in visited:
                visited.add(target)
                queue.append(target)
    return visited, child_trains


def shortest_function_paths(
    start: str,
    target: str,
    functions: dict[str, dict[str, Any]],
    max_paths: int = 4,
) -> list[list[dict[str, str]]]:
    if start == target:
        return [[]]
    queue: deque[tuple[str, list[dict[str, str]], set[str]]] = deque([(start, [], {start})])
    found: list[list[dict[str, str]]] = []
    best_depth: int | None = None
    while queue and len(found) < max_paths:
        current, path, seen = queue.popleft()
        if best_depth is not None and len(path) >= best_depth:
            continue
        for edge in functions.get(current, {}).get("callEdges", []):
            nxt = edge.get("target")
            if not isinstance(nxt, str) or nxt in seen:
                continue
            step = {"from": current, "to": nxt, "edgeType": edge.get("edgeType", "unknown")}
            new_path = path + [step]
            if nxt == target:
                best_depth = len(new_path)
                found.append(new_path)
            elif nxt in functions:
                queue.append((nxt, new_path, seen | {nxt}))
    return found


def activation_call_sites(
    root: str,
    actions: list[dict[str, Any]],
    functions: dict[str, dict[str, Any]],
    dispatch_targets: dict[str, list[dict[str, Any]]],
    registered_runtime_sources: dict[str, list[dict[str, Any]]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    sites: list[dict[str, Any]] = []
    registrations = [
        registration
        for trigger_registrations in dispatch_targets.values()
        for registration in trigger_registrations
        if registration.get("targetFunction") == root
    ]
    registration_callers = {registration.get("registrationFunction") for registration in registrations}
    for registration in registrations:
        trigger = str(registration.get("registrationKey", "")).split("::", 1)[-1]
        for source in registered_runtime_sources.get(trigger, []):
            sites.append({
                "callSiteActionRef": None,
                **source,
                "conditions": [],
                "randomProbability": 1.0,
                "runtimeActivation": True,
                "resolution": "verified_raw_jass_trigger_runtime_source",
            })
    for action in actions:
        target_match = False
        mechanism = None
        if action.get("kind") == "trigger_dispatch":
            for registration in dispatch_targets.get(action.get("dispatchKey"), []):
                if registration.get("targetFunction") == root:
                    target_match = True
                    mechanism = "trigger_dispatch"
                    break
        elif root in expr_function_refs(action):
            target_match = True
            mechanism = action.get("kind")
        if target_match:
            sites.append({
                "callSiteActionRef": action["actionId"],
                "callerFunction": action["function"],
                "mechanism": mechanism,
                "conditions": guard_condition_payload(action),
                "randomProbability": random_probability(action),
                "runtimeActivation": True,
            })
    # Some direct generated calls do not have their own semantic action. Preserve
    # their inbound graph edge as an unresolved-but-verified activation source.
    known_callers = {site["callerFunction"] for site in sites}
    for caller, record in functions.items():
        for edge in record.get("callEdges", []):
            if (
                edge.get("target") == root
                and caller not in known_callers
                and caller not in registration_callers
            ):
                sites.append({
                    "callSiteActionRef": None,
                    "callerFunction": caller,
                    "mechanism": edge.get("edgeType", "unknown"),
                    "conditions": [],
                    "randomProbability": 1.0,
                    "runtimeActivation": True,
                    "resolution": "inbound_function_edge_without_semantic_call_action",
                })
    provenance = [
        {
            "registrationFunction": registration.get("registrationFunction"),
            "registrationKey": registration.get("registrationKey"),
            "mode": registration.get("mode"),
            "source": registration.get("source"),
            "runtimeActivation": False,
            "purpose": "callback registration provenance only; never aggregate as a proc",
        }
        for registration in registrations
    ]
    return (
        sorted(sites, key=lambda x: (x["callerFunction"], x.get("callSiteActionRef") or "")),
        sorted(provenance, key=lambda x: (x.get("registrationFunction") or "", x.get("source") or "")),
    )


def damage_term(action: dict[str, Any], timing_binding: dict[str, Any]) -> dict[str, Any]:
    amount = action.get("amount", {})
    conditions = guard_condition_payload(action, strip_state=True)
    return {
        "actionRef": action["actionId"],
        "function": action["function"],
        "primitive": action.get("source", "").split("(", 1)[0].replace("call ", ""),
        "targeting": action.get("targeting"),
        "amountExpectedExpression": amount.get("expectedExpression"),
        "amountDistribution": amount.get("distribution"),
        "conditions": conditions,
        "guardRandomProbability": random_probability(action),
        "dependencies": amount.get("dependencies", []),
        "symbolDependencies": expression_dependencies(amount.get("expectedExpression")),
        "timingBinding": timing_binding,
        "primaryTargetPolicy": (
            "one_if_inside_area" if action.get("targeting") == "point_area" else "one_if_target_matches"
        ),
    }


@dataclass
class SimContext:
    state: int
    time: float
    slots: dict[tuple[str, int], Any] = field(default_factory=dict)
    stable_decisions: dict[str, bool] = field(default_factory=dict)
    local_decisions: dict[str, bool] = field(default_factory=dict)
    probability: float = 1.0
    pending: dict[str, Any] | None = None
    event_waits: list[dict[str, Any]] = field(default_factory=list)
    terminated: bool = False
    termination: str | None = None
    damage_events: list[dict[str, Any]] = field(default_factory=list)
    invocations: list[dict[str, Any]] = field(default_factory=list)
    seen: set[str] = field(default_factory=set)
    uncertainty: set[str] = field(default_factory=set)
    effective_schedules: list[str] = field(default_factory=list)
    cancelled_schedules: list[str] = field(default_factory=list)


def copy_context(ctx: SimContext) -> SimContext:
    """Clone a path without recursively copying immutable AST payloads.

    ``copy.deepcopy`` used to dominate the train builder once an invocation had
    accumulated a few hundred damage/timeline records.  The simulator only
    mutates the outer containers (AST dictionaries stored inside them are
    read-only), so explicit shallow copies are both safe and substantially
    cheaper.
    """
    return SimContext(
        state=ctx.state,
        time=ctx.time,
        slots=dict(ctx.slots),
        stable_decisions=dict(ctx.stable_decisions),
        local_decisions=dict(ctx.local_decisions),
        probability=ctx.probability,
        pending=dict(ctx.pending) if ctx.pending else None,
        event_waits=[dict(wait) for wait in ctx.event_waits],
        terminated=ctx.terminated,
        termination=ctx.termination,
        damage_events=list(ctx.damage_events),
        invocations=list(ctx.invocations),
        seen=set(ctx.seen),
        uncertainty=set(ctx.uncertainty),
        effective_schedules=list(ctx.effective_schedules),
        cancelled_schedules=list(ctx.cancelled_schedules),
    )


def decision_key(guard: dict[str, Any]) -> tuple[str, bool]:
    gate = guard.get("randomGate")
    if gate:
        return "rng:" + str(gate.get("rollId") or canonical(gate)), False
    expr = guard.get("expression")
    stable_calls = {"GetUnitAbilityLevel", "GetUnitAbilityLevelSwapped", "GetUnitTypeId", "GetItemCharges"}
    calls = {node.get("function") for node in walk_expr(expr) if node.get("node") == "call"}
    stable = bool(calls) and calls.issubset(stable_calls) and not contains_array(expr, "HN")
    # sourceLine identifies one JASS branch evaluation.  Every semantic action
    # nested under that branch repeats the guard in the flattened action list;
    # it must observe the value captured when the branch was first entered,
    # even if an earlier action in the body subsequently mutates a BPO/BQN
    # slot used by the expression (B01 is the canonical off-by-one regression).
    source_line = guard.get("sourceLine")
    return f"expr:{source_line}:" + canonical(expr), stable


def guard_paths(ctx: SimContext, action: dict[str, Any]) -> list[tuple[SimContext, bool]]:
    paths: list[tuple[SimContext, bool]] = [(ctx, True)]
    for guard in action.get("guards", []):
        next_paths: list[tuple[SimContext, bool]] = []
        for current, active in paths:
            if not active:
                next_paths.append((current, False))
                continue
            expected = bool(guard.get("truth"))
            key, stable = decision_key(guard)
            decisions = current.stable_decisions if stable else current.local_decisions
            if key in decisions:
                next_paths.append((current, decisions[key] == expected))
                continue
            value = eval_expr(guard.get("expression"), current.state, current.slots)
            if value is not UNKNOWN:
                # Cache known results too.  Re-evaluating after an in-branch
                # counter update changes the meaning of the already selected
                # JASS branch and under-counts its last iteration.
                decisions[key] = bool(value)
                next_paths.append((current, bool(value) == expected))
                continue
            # Branch only for control flow. The caller never invokes this for damage.
            for choice in (False, True):
                branch = copy_context(current)
                target_decisions = branch.stable_decisions if stable else branch.local_decisions
                target_decisions[key] = choice
                gate = guard.get("randomGate")
                if gate and isinstance(gate.get("probability"), (int, float)):
                    p = float(gate["probability"])
                    branch.probability *= p if choice else 1.0 - p
                else:
                    branch.uncertainty.add(key)
                next_paths.append((branch, choice == expected))
        paths = next_paths
    return paths


def cached_guard_result(ctx: SimContext, action: dict[str, Any]) -> bool | object:
    """Evaluate a non-control action against the invocation's branch cache.

    Damage actions must not create simulator paths, but they still belong to
    the exact JASS branch selected earlier in the invocation.  Looking only at
    the mutated slot values here drops the final tick of pre-test counter loops
    (B01/B02), so consult and populate the same cache used by ``guard_paths``.
    """
    unresolved = False
    for guard in action.get("guards", []):
        expected = bool(guard.get("truth"))
        key, stable = decision_key(guard)
        decisions = ctx.stable_decisions if stable else ctx.local_decisions
        if key in decisions:
            value = decisions[key]
        else:
            evaluated = eval_expr(guard.get("expression"), ctx.state, ctx.slots)
            if evaluated is UNKNOWN:
                unresolved = True
                continue
            value = bool(evaluated)
            decisions[key] = value
        if value != expected:
            return False
    return UNKNOWN if unresolved else True


def merge_conditional_slot_write(ctx: SimContext, action: dict[str, Any]) -> None:
    """Join execute/skip for an unresolved conditional slot write.

    Forking on every cosmetic/target-dependent BPO/BQN write is the main source
    of exponential growth (Bw0 repeats such branches for 25 states).  Setting
    the destination to UNKNOWN is the conservative abstract join.  A later
    timing expression that actually depends on the slot will then become a
    runtime-dependent transition instead of inheriting a guessed value.
    """
    slot = literal_value(action.get("slot"))
    if isinstance(slot, int):
        ctx.slots[(action.get("valueType", "unknown"), slot)] = UNKNOWN


def apply_control(ctx: SimContext, action: dict[str, Any]) -> None:
    kind = action.get("kind")
    if kind == "fsm_slot_write":
        slot = literal_value(action.get("slot"))
        if isinstance(slot, int):
            value = eval_expr(action.get("value"), ctx.state, ctx.slots)
            ctx.slots[(action.get("valueType", "unknown"), slot)] = value
        return
    if kind == "schedule_fsm_step":
        delay = eval_expr(action.get("delaySeconds"), ctx.state, ctx.slots)
        operation = action.get("operation")
        target: Any = UNKNOWN
        if operation == "BDw":
            target = eval_expr(action.get("nextState"), ctx.state, ctx.slots)
        elif operation == "BDx":
            target = ctx.state + 1
        elif operation == "BDz":
            delta = eval_expr(action.get("stateDelta"), ctx.state, ctx.slots)
            if delta is not UNKNOWN:
                target = ctx.state + int(delta)
        if ctx.pending:
            ctx.cancelled_schedules.append(ctx.pending["actionRef"])
        ctx.pending = {
            "actionRef": action["actionId"],
            "delay": delay,
            "targetState": target,
            "operation": operation,
        }
        return
    if kind == "await_unit_event":
        ctx.event_waits.append({
            "actionRef": action["actionId"],
            "event": action.get("event"),
            "resumeState": eval_expr(action.get("resumeState"), ctx.state, ctx.slots),
            "filter": action.get("filter"),
        })
        return
    if kind == "cancel_unit_event_wait":
        ctx.event_waits.clear()
        return
    if kind == "fsm_terminate":
        if ctx.pending:
            ctx.cancelled_schedules.append(ctx.pending["actionRef"])
        ctx.pending = None
        ctx.event_waits.clear()
        ctx.terminated = True
        ctx.termination = "explicit_BDr"


def aggregate_damage_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, float, str], dict[str, Any]] = {}
    for event in events:
        key = (event["actionRef"], round(event["timeSeconds"], 9), canonical(event.get("conditions", [])))
        if key not in grouped:
            grouped[key] = dict(event)
            grouped[key]["executionCount"] = 1
        else:
            grouped[key]["executionCount"] += 1
    return sorted(grouped.values(), key=lambda x: (x["timeSeconds"], x["actionRef"]))


def timing_groups(events: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    frames: dict[float, list[dict[str, Any]]] = defaultdict(list)
    by_term: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        at = round(float(event["timeSeconds"]), 9)
        frames[at].append(event)
        by_term[(event["actionRef"], canonical(event.get("conditions", [])))].append(event)

    damage_frames = [
        {
            "atSeconds": at,
            "actionRefs": sorted({event["actionRef"] for event in frame_events}),
            "actionExecutionCount": sum(event.get("executionCount", 1) for event in frame_events),
        }
        for at, frame_events in sorted(frames.items())
    ]
    groups = []
    for (action_ref, _), term_events in sorted(by_term.items()):
        ordered = sorted(term_events, key=lambda event: event["timeSeconds"])
        times = [round(float(event["timeSeconds"]), 9) for event in ordered]
        intervals = [round(times[index] - times[index - 1], 9) for index in range(1, len(times))]
        uniform = intervals[0] if intervals and all(abs(value - intervals[0]) < 1e-9 for value in intervals) else None
        groups.append({
            "actionRef": action_ref,
            "firstTickOffsetSeconds": times[0],
            "lastTickOffsetSeconds": times[-1],
            "tickCount": sum(event.get("executionCount", 1) for event in ordered),
            "tickIntervalSeconds": uniform,
            "tickIntervalSequenceSeconds": None if uniform is not None else intervals,
            "damageWindowSeconds": round(times[-1] - times[0], 9),
            "conditions": ordered[0].get("conditions", []),
        })
    return damage_frames, groups


def simulate_train(
    root: str,
    initial_state: int,
    root_actions: list[dict[str, Any]],
    callback_bindings: dict[str, list[dict[str, Any]]],
    max_variants: int = 32,
    max_steps: int = 1024,
) -> dict[str, Any]:
    active: list[SimContext] = [SimContext(state=initial_state, time=0.0)]
    finished: list[SimContext] = []
    truncated = False

    while active:
        seed = active.pop()
        if len(finished) + len(active) >= max_variants or len(seed.invocations) >= max_steps:
            seed.termination = "analysis_limit"
            seed.terminated = True
            seed.uncertainty.add("analysis_limit")
            finished.append(seed)
            truncated = True
            continue

        signature = canonical({
            "state": seed.state,
            "slots": sorted((kind, slot, None if value is UNKNOWN else value) for (kind, slot), value in seed.slots.items()),
            "stable": seed.stable_decisions,
        })
        if signature in seed.seen:
            seed.termination = "dynamic_or_unbounded_cycle"
            seed.terminated = True
            seed.uncertainty.add("cycle_requires_runtime_state")
            finished.append(seed)
            continue
        seed.seen.add(signature)
        seed.local_decisions = {}
        seed.pending = None
        seed.event_waits = []
        seed.invocations.append({"state": seed.state, "atSeconds": round(seed.time, 9)})
        contexts = [seed]

        for action in root_actions:
            if action.get("kind") == "fsm_start_or_set_state":
                continue
            new_contexts: list[SimContext] = []
            for ctx in contexts:
                if ctx.terminated:
                    new_contexts.append(ctx)
                    continue
                kind = action.get("kind")
                if kind == "damage" or kind == "for_each_unit":
                    known = cached_guard_result(ctx, action)
                    if known is not False:
                        condition_payload = [] if known is True else guard_condition_payload(action, strip_state=True)
                        if kind == "damage":
                            ctx.damage_events.append({
                                "actionRef": action["actionId"],
                                "timeSeconds": round(ctx.time, 9),
                                "conditions": condition_payload,
                                "guardRandomProbability": random_probability(action),
                                "timingBinding": "direct_fsm_state",
                            })
                        else:
                            for bound in callback_bindings.get(action["actionId"], []):
                                callback_action = bound["action"]
                                callback_conditions = condition_payload + guard_condition_payload(callback_action, strip_state=True)
                                ctx.damage_events.append({
                                    "actionRef": callback_action["actionId"],
                                    "timeSeconds": round(ctx.time, 9),
                                    "conditions": callback_conditions,
                                    "guardRandomProbability": random_probability(action) * random_probability(callback_action),
                                    "timingBinding": "synchronous_for_each_callback",
                                    "enumerationActionRef": action["actionId"],
                                })
                    new_contexts.append(ctx)
                    continue
                if kind not in CONTROL_KINDS:
                    new_contexts.append(ctx)
                    continue
                if kind == "fsm_slot_write":
                    known = cached_guard_result(ctx, action)
                    if known is True:
                        apply_control(ctx, action)
                    elif known is UNKNOWN:
                        merge_conditional_slot_write(ctx, action)
                    new_contexts.append(ctx)
                    continue
                for branch, executes in guard_paths(ctx, action):
                    if executes:
                        apply_control(branch, action)
                    new_contexts.append(branch)
            contexts = new_contexts[:max_variants]
            if len(new_contexts) > max_variants:
                truncated = True

        for ctx in contexts:
            if ctx.terminated:
                finished.append(ctx)
                continue
            # BEF races the pending timeout. Preserve the event edge as a symbolic
            # alternate; continue only the deterministic timeout path.
            if ctx.event_waits:
                for wait in ctx.event_waits:
                    ctx.uncertainty.add("event_race:" + wait["actionRef"])
            if ctx.pending:
                pending = ctx.pending
                delay, target = pending["delay"], pending["targetState"]
                if as_number(delay) is UNKNOWN or not isinstance(target, int):
                    ctx.termination = "runtime_dependent_transition"
                    ctx.terminated = True
                    ctx.uncertainty.add("dynamic_delay_or_state:" + pending["actionRef"])
                    finished.append(ctx)
                else:
                    ctx.effective_schedules.append(pending["actionRef"])
                    ctx.state = target
                    ctx.time = round(ctx.time + float(delay), 12)
                    ctx.pending = None
                    active.append(ctx)
            else:
                ctx.terminated = True
                ctx.termination = "implicit_no_reschedule"
                finished.append(ctx)

    variants = []
    for index, ctx in enumerate(finished, 1):
        damage_events = aggregate_damage_events(ctx.damage_events)
        damage_frames, tick_groups = timing_groups(damage_events)
        damage_times = [event["timeSeconds"] for event in damage_events]
        variants.append({
            "variantId": f"{root}.v{index}",
            "pathProbabilityFromInternalRng": round(ctx.probability, 12),
            "externalConditionKeys": sorted(ctx.uncertainty),
            "invocations": ctx.invocations,
            "damageEvents": damage_events,
            "damageFrames": damage_frames,
            "damageFrameOffsetsSeconds": sorted({event["timeSeconds"] for event in damage_events}),
            "tickGroups": tick_groups,
            "damageFrameCount": len(damage_frames),
            "candidateDamageActionExecutionCount": sum(event["executionCount"] for event in damage_events),
            "damageExecutionCount": sum(event["executionCount"] for event in damage_events),
            "damageExecutionCountSemantics": "candidate action occurrences; not train tick count; evaluate mutually exclusive term conditions",
            "firstDamageAtSeconds": min(damage_times) if damage_times else None,
            "lastDamageAtSeconds": max(damage_times) if damage_times else None,
            "terminationAtSeconds": round(ctx.time, 9),
            "activeDurationSeconds": round(ctx.time, 9),
            "terminationKind": ctx.termination,
            "effectiveScheduleRefs": ctx.effective_schedules,
            "cancelledOrOverriddenScheduleRefs": ctx.cancelled_schedules,
        })

    exact = [v for v in variants if not v["externalConditionKeys"] and v["terminationKind"] not in {
        "analysis_limit", "dynamic_or_unbounded_cycle", "runtime_dependent_transition"
    }]
    return {
        "status": (
            "exact_static" if len(variants) == 1 and len(exact) == 1
            else "branched_static" if variants and len(exact) == len(variants)
            else "event_or_runtime_dependent"
        ),
        "variants": variants,
        "tickCountPolicy": "use damageFrameCount for train frames or tickGroups[].tickCount per damage term; never use damageExecutionCount as ticks",
        "analysisTruncated": truncated,
    }


def expression_sum(terms: list[dict[str, Any]]) -> dict[str, Any]:
    if not terms:
        return {"node": "literal", "valueType": "integer", "value": 0, "raw": "0"}
    return {"node": "sum", "terms": terms}


def build_document(source: Path) -> dict[str, Any]:
    with source.open("r", encoding="utf-8") as fh:
        document = json.load(fh)
    ast = document["actionAst"]
    functions = ast["functions"]
    actions = ast["actions"]
    action_by_id = {action["actionId"]: action for action in actions}
    actions_by_function: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for action in actions:
        actions_by_function[action["function"]].append(action)
    for function_actions in actions_by_function.values():
        function_actions.sort(key=lambda a: (a["line"], a["actionId"]))

    fsm_roots = {
        function
        for function, function_actions in actions_by_function.items()
        if any(action.get("kind") == "fsm_start_or_set_state" for action in function_actions)
    }
    profile_for_function: dict[str, list[dict[str, str]]] = defaultdict(list)
    for profile in document["profiles"]:
        for function in profile["actionProgram"]["functionRefs"]:
            profile_for_function[function].append({
                "profileId": profile["profileId"],
                "displayName": profile["displayName"],
                "classification": profile["tier"],
            })

    dispatch = trigger_targets(document)
    registered_runtime_sources = registered_trigger_runtime_sources(functions)
    activation_sites_by_root = {
        root: activation_call_sites(root, actions, functions, dispatch, registered_runtime_sources)
        for root in fsm_roots
    }
    all_damage_ids = {action["actionId"] for action in actions if action.get("kind") == "damage"}
    trains: list[dict[str, Any]] = []

    for root in sorted(fsm_roots):
        root_actions = list(actions_by_function[root])
        closure, child_trains = child_closure(root, functions, fsm_roots)
        closure_damage_functions = {
            function
            for function in closure
            if any(action.get("kind") == "damage" for action in actions_by_function.get(function, []))
        }
        semantic_callback_lines = {
            action["line"] for action in root_actions if action.get("kind") == "for_each_unit"
        }
        # BWk and a few generated enumeration wrappers were not normalized as
        # semantic for_each actions in the base AST.  Recover their callback at
        # the verified raw call line and borrow the enclosing branch guards from
        # the nearest semantic action.  This closes the sole BpI timing gap.
        for raw_call in raw_callback_calls(functions[root]):
            line = raw_call.get("line")
            if not isinstance(line, int) or line in semantic_callback_lines:
                continue
            damage_targets = [target for target in raw_call["targetFunctions"] if target in closure_damage_functions]
            if not damage_targets:
                continue
            guarded_anchors = [action for action in root_actions if action.get("guards")]
            if not guarded_anchors:
                continue
            anchor = min(
                guarded_anchors,
                key=lambda action: (abs(action["line"] - line), 0 if action["line"] >= line else 1),
            )
            for target in damage_targets:
                root_actions.append({
                    "actionId": f"rawcall.{root}.L{line}.{target}",
                    "function": root,
                    "line": line,
                    "source": raw_call.get("source"),
                    "guards": copy.deepcopy(anchor.get("guards", [])),
                    "loopContexts": [],
                    "kind": "for_each_unit",
                    "shape": "raw_wrapper_enumeration",
                    "callback": {"node": "function_ref", "function": target},
                    "verification": "verified_raw_jass_callback_call",
                })
        root_actions.sort(key=lambda action: (action["line"], action["actionId"]))
        start_action = next(action for action in root_actions if action.get("kind") == "fsm_start_or_set_state")
        initial = literal_value(start_action.get("initialState"))
        if not isinstance(initial, int):
            initial = 0
        states = candidate_states(root_actions, initial)
        closure_damage = sorted(
            action["actionId"]
            for function in closure
            for action in actions_by_function.get(function, [])
            if action.get("kind") == "damage"
        )

        callback_bindings: dict[str, list[dict[str, Any]]] = defaultdict(list)
        timing_binding_by_damage: dict[str, dict[str, Any]] = {}
        for action in root_actions:
            if action.get("kind") == "damage":
                timing_binding_by_damage[action["actionId"]] = {
                    "kind": "direct_fsm_state",
                    "sourceStates": action_source_states(action, states),
                }
            elif action.get("kind") == "for_each_unit":
                callback = function_ref(action.get("callback"))
                if not callback:
                    continue
                callback_closure, _ = child_closure(callback, functions, fsm_roots)
                for callback_function in callback_closure:
                    for child_action in actions_by_function.get(callback_function, []):
                        if child_action.get("kind") != "damage" or child_action["actionId"] not in closure_damage:
                            continue
                        binding = {
                            "kind": "synchronous_for_each_callback",
                            "enumerationActionRef": action["actionId"],
                            "sourceStates": action_source_states(action, states),
                            "targetMultiplicity": "eligible_units_enumerated; per-primary-target multiplier=1",
                        }
                        callback_bindings[action["actionId"]].append({"action": child_action, "binding": binding})
                        timing_binding_by_damage.setdefault(child_action["actionId"], binding)

        damage_terms = []
        for damage_id in closure_damage:
            binding = timing_binding_by_damage.get(damage_id, {
                "kind": "child_closure_timing_unresolved",
                "reason": "reachable child action without direct state callback binding",
            })
            damage_terms.append(damage_term(action_by_id[damage_id], binding))

        transitions = []
        for action in root_actions:
            if action.get("kind") == "schedule_fsm_step":
                from_states = action_source_states(action, states)
                operation = action.get("operation")
                if operation == "BDw":
                    target = {"kind": "explicit", "expression": action.get("nextState")}
                elif operation == "BDx":
                    target = {"kind": "relative", "delta": 1}
                else:
                    target = {"kind": "relative", "deltaExpression": action.get("stateDelta")}
                transitions.append({
                    "transitionRef": action["actionId"],
                    "operation": operation,
                    "fromStates": from_states,
                    "toState": target,
                    "delaySecondsExpression": action.get("delaySeconds"),
                    "conditions": guard_condition_payload(action, strip_state=True),
                    "runtimeSemantics": "last_schedule_on_executed_path_wins; BDr cancels pending timer",
                })

        event_transitions = []
        for action in root_actions:
            if action.get("kind") == "await_unit_event":
                event_transitions.append({
                    "transitionRef": action["actionId"],
                    "fromStates": action_source_states(action, states),
                    "event": action.get("event"),
                    "filter": action.get("filter"),
                    "resumeStateExpression": action.get("resumeState"),
                    "conditions": guard_condition_payload(action, strip_state=True),
                    "runtimeSemantics": "event_vs_timeout_race; event pauses timer and resumes immediately",
                })

        terminators = [
            {
                "actionRef": action["actionId"],
                "fromStates": action_source_states(action, states),
                "conditions": guard_condition_payload(action, strip_state=True),
                "kind": "explicit_BDr",
            }
            for action in root_actions
            if action.get("kind") == "fsm_terminate"
        ]

        state_nodes = []
        for state in states:
            refs = [
                action["actionId"] for action in root_actions
                if action.get("kind") != "fsm_start_or_set_state" and state in action_source_states(action, [state])
            ]
            if refs or state == initial:
                state_nodes.append({
                    "state": state,
                    "actionRefs": refs,
                    "damageActionRefs": [ref for ref in refs if ref in all_damage_ids],
                    "runtimeDefault": "implicit_BDr_if_no_effective_BDw_BDx_BDz_on_path",
                })

        simulation = simulate_train(root, initial, root_actions, callback_bindings)
        timing_kind = (
            "instant_fsm" if not transitions
            else "event_race_or_delayed" if event_transitions
            else "delayed_train"
        )
        simulation["timingKind"] = timing_kind
        simulation["authority"] = (
            "authoritative_resolved_timeline"
            if simulation["status"] == "exact_static" and not simulation["analysisTruncated"]
            else "partial_abstract_paths_only; use stateMachine graph plus runtime inputs for DPS"
        )
        verified_fixture = VERIFIED_TIMING_FIXTURES.get(root)
        if verified_fixture:
            simulation["verifiedTimingFixture"] = {
                "verification": "verified_jass_manual_trace",
                **verified_fixture,
            }
        effective_refs = {
            ref for variant in simulation["variants"] for ref in variant["effectiveScheduleRefs"]
        }
        cancelled_refs = {
            ref for variant in simulation["variants"] for ref in variant["cancelledOrOverriddenScheduleRefs"]
        }
        for transition in transitions:
            ref = transition["transitionRef"]
            transition["staticPathClassification"] = (
                "effective_on_at_least_one_analyzed_path" if ref in effective_refs
                else "cancelled_or_overridden_on_all_analyzed_paths" if ref in cancelled_refs
                else "not_reached_or_runtime_dependent"
            )

        owners = profile_for_function.get(root, [])
        entrypoint_paths = []
        for owner in owners:
            profile = next(p for p in document["profiles"] if p["profileId"] == owner["profileId"])
            for entrypoint in profile["actionProgram"]["entryPoints"]:
                paths = shortest_function_paths(entrypoint["function"], root, functions)
                if not paths:
                    continue
                entrypoint_paths.append({
                    "entryPointId": entrypoint["entryPointId"],
                    "kind": entrypoint["kind"],
                    "unitRawcode": entrypoint.get("unitRawcode"),
                    "paths": paths,
                    "runtimeActivation": entrypoint["kind"] != "initialization",
                })

        activation_sites, registration_provenance = activation_sites_by_root[root]
        if not activation_sites:
            for entrypoint in entrypoint_paths:
                if not entrypoint["runtimeActivation"]:
                    continue
                if any(len(path) == 0 for path in entrypoint["paths"]):
                    activation_sites.append({
                        "callSiteActionRef": None,
                        "callerFunction": root,
                        "mechanism": "direct_runtime_entrypoint",
                        "entryPointId": entrypoint["entryPointId"],
                        "entryPointKind": entrypoint["kind"],
                        "conditions": [],
                        "randomProbability": 1.0,
                        "runtimeActivation": True,
                    })
        activation_status = (
            "resolved_runtime_activation" if any(site.get("runtimeActivation") is True for site in activation_sites)
            else "registration_only_or_custom_callback_unresolved"
        )
        total_term_nodes = []
        for term in damage_terms:
            total_term_nodes.append({
                "node": "product",
                "factors": [
                    term["amountExpectedExpression"],
                    {"node": "literal", "valueType": "real", "value": term["guardRandomProbability"]},
                    {"node": "execution_count_from_timeline", "actionRef": term["actionRef"]},
                    {"node": "primary_target_hit_indicator", "actionRef": term["actionRef"]},
                ],
                "conditions": term["conditions"],
            })

        if not closure_damage:
            hook_status = "no_damage_train"
            execution_count_source: Any = None
            hook_runtime_inputs: list[str] = []
        elif simulation["authority"] == "authoritative_resolved_timeline":
            hook_status = "ready_with_activation_period"
            execution_count_source = "#/timeline/variants (select the applicable authoritative variant)"
            hook_runtime_inputs = []
        elif verified_fixture and verified_fixture.get("executionCountByActionRef"):
            hook_status = "ready_with_verified_execution_counts_and_activation_period"
            execution_count_source = "#/timeline/verifiedTimingFixture/executionCountByActionRef"
            hook_runtime_inputs = list(verified_fixture.get("runtimeInputs", []))
        elif verified_fixture and verified_fixture.get("executionCountByActionRefWhenEventHits"):
            hook_status = "requires_event_runtime_inputs_with_verified_execution_counts"
            execution_count_source = "#/timeline/verifiedTimingFixture/executionCountByActionRefWhenEventHits"
            hook_runtime_inputs = list(verified_fixture.get("runtimeInputs", []))
        elif verified_fixture:
            hook_status = "requires_verified_fixture_interpreter_and_activation_period"
            execution_count_source = "#/timeline/verifiedTimingFixture"
            hook_runtime_inputs = list(verified_fixture.get("runtimeInputs", []))
        else:
            hook_status = "requires_runtime_timeline_inputs_and_activation_period"
            execution_count_source = "runtime state/event simulator"
            hook_runtime_inputs = ["state-dependent execution counts"]

        trains.append({
            "trainId": f"fsm.{root}",
            "function": root,
            "owners": owners,
            "source": functions[root]["source"],
            "initialState": initial,
            "timingKind": timing_kind,
            "activation": {
                "status": activation_status,
                "alternatives": activation_sites,
                "registrationProvenance": registration_provenance,
                "entryPointPaths": entrypoint_paths,
                "aggregation": "OR over alternatives where runtimeActivation=true; never aggregate registrationProvenance",
            },
            "stateMachine": {
                "states": state_nodes,
                "timerTransitions": transitions,
                "eventTransitions": event_transitions,
                "explicitTerminations": terminators,
                "implicitTerminationRule": "BDu automatically calls BDr when the path returns without an effective schedule",
                "childTrainRefs": [f"fsm.{name}" for name in sorted(child_trains)],
            },
            "damage": {
                "actionRefs": closure_damage,
                "terms": damage_terms,
                "perPrimaryTargetExpectedDamagePerActivationAst": expression_sum(total_term_nodes),
                "note": "Evaluate every term.conditions branch before summing. AoE enumeration and spatial overlap stay as hit indicators and are never silently multiplied by unit count.",
            },
            "timeline": simulation,
            "skillDpsHook": {
                "status": hook_status,
                "numerator": {"ref": "#/trains/*/damage/perPrimaryTargetExpectedDamagePerActivationAst"},
                "executionCountSource": execution_count_source,
                "requiredRuntimeInputs": hook_runtime_inputs,
                "abstractTimelinePolicy": (
                    "authoritative" if simulation["authority"] == "authoritative_resolved_timeline"
                    else "do_not_use_abstract_variant_counts_as_DPS_inputs"
                ),
                "requiredInput": "activationPeriodSeconds or activationRatePerSecond from attack/spell/counter model",
                "formula": "E[damagePerActivation] / activationPeriodSeconds",
                "equivalentFormula": "E[damagePerActivation] * activationRatePerSecond",
                "forbiddenDenominator": "train duration (FSM instances can overlap)",
            },
        })

    classification_counts = Counter()
    classification_damage: dict[str, set[str]] = defaultdict(set)
    for train in trains:
        classification = train["owners"][0]["classification"] if train["owners"] else "unresolved"
        classification_counts[classification] += 1
        classification_damage[classification].update(train["damage"]["actionRefs"])

    schedule_actions = [action for action in actions if action.get("kind") == "schedule_fsm_step" and action["function"] in fsm_roots]
    schedule_ops = Counter(action.get("operation") for action in schedule_actions)
    fsm_damage_ids = {damage_id for train in trains for damage_id in train["damage"]["actionRefs"]}
    timeline_status = Counter(train["timeline"]["status"] for train in trains)
    activation_alternative_counts = Counter(len(train["activation"]["alternatives"]) for train in trains)

    result = {
        "$schema": "ORD_2305C_fsm_trains.schema.json",
        "schemaVersion": "ord-fsm-train-digest/1.0",
        "generatedBy": "shared_map/build_fsm_trains.py",
        "map": document["map"],
        "sourceActionAst": {
            "file": source.name,
            "sha256": sha256_file(source),
            "schemaVersion": document["schemaVersion"],
            "numericAuthority": "verified_jass_only",
        },
        "runtimeSemantics": {
            "BD1": "create frame and set initial state only on first entry; timer/event reentry preserves state",
            "BDw": "restart one-shot frame timer; last executed schedule wins",
            "BDx": "BDw(delay, HN+1)",
            "BDz": "BDw(delay, HN+delta)",
            "BDr": "immediately cancel timer/event waits, clear slots, and terminate",
            "BDu": "set auto-terminate flag before handler; BDw clears it; no schedule causes implicit BDr",
            "BEF": "event races timer; winning event pauses timer and resumes at declared state",
            "BEY": "cancel outstanding event wait",
            "overlapPolicy": "different FSM activations may coexist; train duration is not a DPS denominator",
        },
        "counts": {
            "trains": len(trains),
            "trainsWithSchedule": sum(bool(t["stateMachine"]["timerTransitions"]) for t in trains),
            "trainsWithoutSchedule": sum(not t["stateMachine"]["timerTransitions"] for t in trains),
            "damageTrains": sum(bool(t["damage"]["actionRefs"]) for t in trains),
            "noDamageTrains": sum(not t["damage"]["actionRefs"] for t in trains),
            "eventWaitTrains": sum(bool(t["stateMachine"]["eventTransitions"]) for t in trains),
            "timerTransitions": len(schedule_actions),
            "timerTransitionOperations": dict(sorted(schedule_ops.items())),
            "allDamageActions": len(all_damage_ids),
            "fsmOwnedDamageActions": len(fsm_damage_ids),
            "nonFsmDamageActions": len(all_damage_ids - fsm_damage_ids),
            "classificationTrainCounts": dict(sorted(classification_counts.items())),
            "classificationFsmDamageCounts": {k: len(v) for k, v in sorted(classification_damage.items())},
            "timelineStatusCounts": dict(sorted(timeline_status.items())),
            "activationAlternativeCountHistogram": {str(k): v for k, v in sorted(activation_alternative_counts.items())},
        },
        "trains": trains,
        "profileIndex": {
            profile["profileId"]: sorted(
                train["trainId"] for train in trains
                if any(owner["profileId"] == profile["profileId"] for owner in train["owners"])
            )
            for profile in document["profiles"]
        },
        "integrationContract": {
            "options.skillDps": {
                "perTrain": "evaluate damage AST per activation, then multiply by activation rate",
                "activationRateSources": [
                    "attack interval × verified activation probability",
                    "spell cooldown/cast rate",
                    "counter or stack state machine including regen",
                    "external event arrival rate for BEF races",
                ],
                "never": [
                    "divide by FSM active duration",
                    "double count childTrainRefs",
                    "assume every AoE callback hits the primary target more than once",
                ],
            }
        },
        "verifiedTimingFixtureFunctions": sorted(VERIFIED_TIMING_FIXTURES),
        "validation": {},
    }

    duplicate_damage = Counter(damage_id for train in trains for damage_id in train["damage"]["actionRefs"])
    train_by_function = {train["function"]: train for train in trains}

    def sole_variant(function: str) -> dict[str, Any] | None:
        variants = train_by_function[function]["timeline"]["variants"]
        return variants[0] if len(variants) == 1 else None

    b01 = sole_variant("B01")
    b02 = sole_variant("B02")
    bw0 = sole_variant("Bw0")
    btl = sole_variant("BtL")
    result["validation"] = {
        "fsmRootCountIs223": len(trains) == 223,
        "scheduleCountIs635": len(schedule_actions) == 635,
        "fsmDamageCountIs486": len(fsm_damage_ids) == 486,
        "profileOwnershipExactlyOne": all(len(train["owners"]) == 1 for train in trains),
        "damageAssignedAtMostOnce": all(count == 1 for count in duplicate_damage.values()),
        "missingFsmRoots": sorted(fsm_roots - {train["function"] for train in trains}),
        "unexpectedDuplicateDamageRefs": sorted(ref for ref, count in duplicate_damage.items() if count != 1),
        "unboundTimingDamageRefs": sorted(
            term["actionRef"]
            for train in trains for term in train["damage"]["terms"]
            if term["timingBinding"]["kind"] == "child_closure_timing_unresolved"
        ),
        "analysisTruncatedTrains": sorted(train["function"] for train in trains if train["timeline"]["analysisTruncated"]),
        "emptyTimerTransitionStateRefs": sorted(
            transition["transitionRef"]
            for train in trains for transition in train["stateMachine"]["timerTransitions"]
            if not transition["fromStates"]
        ),
        "emptyEventTransitionStateRefs": sorted(
            transition["transitionRef"]
            for train in trains for transition in train["stateMachine"]["eventTransitions"]
            if not transition["fromStates"]
        ),
        "unresolvedRuntimeActivationTrains": sorted(
            train["function"]
            for train in trains
            if not any(site.get("runtimeActivation") is True for site in train["activation"]["alternatives"])
        ),
        "syntheticRawCallbackBindingRefs": sorted({
            term["timingBinding"]["enumerationActionRef"]
            for train in trains for term in train["damage"]["terms"]
            if str(term["timingBinding"].get("enumerationActionRef", "")).startswith("rawcall.")
        }),
        "representativeRegressions": {
            "B01_three_ticks_024_033_042_terminal_051": bool(
                b01 and b01["damageFrameOffsetsSeconds"] == [0.24, 0.33, 0.42]
                and b01["terminationAtSeconds"] == 0.51
            ),
            "B02_four_small_plus_finisher_terminal_063": bool(
                b02 and b02["damageFrameOffsetsSeconds"] == [0.05, 0.17, 0.29, 0.41, 0.63]
                and b02["terminationAtSeconds"] == 0.63
            ),
            "Bw0_25_frames_023_to_143_terminal_190": bool(
                bw0 and bw0["damageFrameCount"] == 25
                and bw0["firstDamageAtSeconds"] == 0.23 and bw0["lastDamageAtSeconds"] == 1.43
                and bw0["terminationAtSeconds"] == 1.9
            ),
            "BtL_terminal_608": bool(btl and btl["terminationAtSeconds"] == 6.08),
        },
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    result = build_document(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "counts": result["counts"], "validation": result["validation"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
