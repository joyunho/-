#!/usr/bin/env python3
"""Dependency-free validation for the ORD 2.305C FSM train digest."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIGEST = ROOT / "deliverables" / "ORD_2305C_all_upper_skill_profiles_fsm_trains.json"
DEFAULT_AST = ROOT / "deliverables" / "ORD_2305C_all_upper_skill_profiles_action_ast.json"


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def validate(digest_path: Path, ast_path: Path) -> dict[str, Any]:
    digest = json.loads(digest_path.read_text(encoding="utf-8"))
    ast = json.loads(ast_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    trains = digest.get("trains", [])
    train_by_function = {train.get("function"): train for train in trains}
    source_actions = {action["actionId"]: action for action in ast["actionAst"]["actions"]}
    source_damage = {ref for ref, action in source_actions.items() if action.get("kind") == "damage"}

    require(digest.get("schemaVersion") == "ord-fsm-train-digest/1.0", "schemaVersion mismatch", errors)
    require(len(trains) == 223, f"expected 223 trains, got {len(trains)}", errors)
    require(len(train_by_function) == len(trains), "duplicate train function", errors)

    all_damage_refs: list[str] = []
    timer_transition_refs: list[str] = []
    event_transition_refs: list[str] = []
    for train in trains:
        function = train["function"]
        require(len(train.get("owners", [])) == 1, f"{function}: owner count != 1", errors)
        alternatives = train["activation"]["alternatives"]
        require(
            all(site.get("runtimeActivation") is True for site in alternatives),
            f"{function}: non-runtime site leaked into activation alternatives",
            errors,
        )
        require(
            all(site.get("runtimeActivation") is False for site in train["activation"]["registrationProvenance"]),
            f"{function}: registration provenance marked runtime",
            errors,
        )

        timer_transitions = train["stateMachine"]["timerTransitions"]
        event_transitions = train["stateMachine"]["eventTransitions"]
        for transition in timer_transitions + event_transitions:
            require(bool(transition["fromStates"]), f"{function}: empty fromStates {transition['transitionRef']}", errors)
        timer_transition_refs.extend(transition["transitionRef"] for transition in timer_transitions)
        event_transition_refs.extend(transition["transitionRef"] for transition in event_transitions)

        damage_refs = train["damage"]["actionRefs"]
        term_refs = [term["actionRef"] for term in train["damage"]["terms"]]
        require(sorted(damage_refs) == sorted(term_refs), f"{function}: damage terms/ref mismatch", errors)
        require(all(ref in source_damage for ref in damage_refs), f"{function}: unknown damage action", errors)
        require(
            all(term["timingBinding"]["kind"] != "child_closure_timing_unresolved" for term in train["damage"]["terms"]),
            f"{function}: unresolved damage timing binding",
            errors,
        )
        all_damage_refs.extend(damage_refs)

        timeline = train["timeline"]
        if timeline["status"] == "exact_static" and not timeline["analysisTruncated"]:
            require(
                timeline["authority"] == "authoritative_resolved_timeline",
                f"{function}: exact timeline not authoritative",
                errors,
            )
        for variant in timeline["variants"]:
            offsets = variant["damageFrameOffsetsSeconds"]
            require(offsets == sorted(set(offsets)), f"{function}: damage frame offsets not unique/sorted", errors)
            require(variant["damageFrameCount"] == len(offsets), f"{function}: damageFrameCount mismatch", errors)
            require(
                variant["candidateDamageActionExecutionCount"] == variant["damageExecutionCount"],
                f"{function}: candidate action count alias mismatch",
                errors,
            )

    require(len(timer_transition_refs) == 635, f"expected 635 timer transitions, got {len(timer_transition_refs)}", errors)
    require(len(event_transition_refs) == 41, f"expected 41 event transitions, got {len(event_transition_refs)}", errors)
    damage_counts = Counter(all_damage_refs)
    require(len(damage_counts) == 486, f"expected 486 FSM damage refs, got {len(damage_counts)}", errors)
    require(all(count == 1 for count in damage_counts.values()), "damage ref assigned to multiple trains", errors)
    require(len(source_damage - set(damage_counts)) == 147, "non-FSM damage count != 147", errors)

    def sole(function: str) -> dict[str, Any]:
        variants = train_by_function[function]["timeline"]["variants"]
        require(len(variants) == 1, f"{function}: expected one regression variant", errors)
        return variants[0]

    b01 = sole("B01")
    b02 = sole("B02")
    bw0 = sole("Bw0")
    btl = sole("BtL")
    require(b01["damageFrameOffsetsSeconds"] == [0.24, 0.33, 0.42], "B01 tick regression", errors)
    require(b01["terminationAtSeconds"] == 0.51, "B01 terminal regression", errors)
    require(b02["damageFrameOffsetsSeconds"] == [0.05, 0.17, 0.29, 0.41, 0.63], "B02 tick regression", errors)
    require(b02["terminationAtSeconds"] == 0.63, "B02 terminal regression", errors)
    require(bw0["damageFrameCount"] == 25, "Bw0 frame-count regression", errors)
    require((bw0["firstDamageAtSeconds"], bw0["lastDamageAtSeconds"], bw0["terminationAtSeconds"]) == (0.23, 1.43, 1.9), "Bw0 timing regression", errors)
    require(btl["terminationAtSeconds"] == 6.08, "BtL terminal regression", errors)
    require(train_by_function["Bqo"]["activation"]["alternatives"][0]["mechanism"] == "registered_game_event", "Bqo activation regression", errors)
    require(train_by_function["Bqp"]["activation"]["alternatives"][0]["mechanism"] == "prepared_fsm_trigger_resume", "Bqp activation regression", errors)
    require(digest["validation"]["unresolvedRuntimeActivationTrains"] == ["BoG"], "unexpected unresolved activations", errors)
    require(train_by_function["B1a"]["skillDpsHook"]["executionCountSource"].endswith("executionCountByActionRef"), "B1a fixture hook regression", errors)
    require(train_by_function["B3C"]["skillDpsHook"]["executionCountSource"].endswith("executionCountByActionRef"), "B3C fixture hook regression", errors)
    require(train_by_function["BtD"]["skillDpsHook"]["executionCountSource"].endswith("executionCountByActionRefWhenEventHits"), "BtD fixture hook regression", errors)
    require(train_by_function["BtE"]["skillDpsHook"]["executionCountSource"].endswith("executionCountByActionRefWhenEventHits"), "BtE fixture hook regression", errors)
    require(train_by_function["Bx4"]["skillDpsHook"]["status"] == "requires_verified_fixture_interpreter_and_activation_period", "Bx4 fixture-interpreter regression", errors)
    require(train_by_function["BxG"]["timeline"]["authority"].startswith("partial_abstract_paths_only"), "BxG branch authority regression", errors)

    return {
        "ok": not errors,
        "errors": errors,
        "counts": {
            "trains": len(trains),
            "timerTransitions": len(timer_transition_refs),
            "eventTransitions": len(event_transition_refs),
            "fsmDamageActions": len(damage_counts),
            "nonFsmDamageActions": len(source_damage - set(damage_counts)),
            "timelineStatus": dict(sorted(Counter(train["timeline"]["status"] for train in trains).items())),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--digest", type=Path, default=DEFAULT_DIGEST)
    parser.add_argument("--action-ast", type=Path, default=DEFAULT_AST)
    args = parser.parse_args()
    result = validate(args.digest, args.action_ast)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
