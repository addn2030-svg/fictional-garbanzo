"""Tests for the clinical gate and reviewer scorecard.

Run: python test_clinical_gate.py
"""

from clinical_gate import PlanItem, gate
from reviewer_scorecard import score

PASSES = 0
FAILURES: list[str] = []

def check(name: str, condition: bool) -> None:
    global PASSES
    if condition:
        PASSES += 1
        print(f"  ok   {name}")
    else:
        FAILURES.append(name)
        print(f"  FAIL {name}")

def good_manual() -> PlanItem:
    return PlanItem(
        intervention="Graded GH capsular mobilisation toward ER deficit",
        modality="MANUAL",
        success_criterion="ER to 30 degrees, IR to 25 degrees",
    )

def good_needling() -> PlanItem:
    return PlanItem(
        intervention="DN to subscapularis trigger points",
        modality="DRY_NEEDLING",
        success_criterion="IR or ER gain of 10 degrees on immediate retest",
        contraindications_cleared=True,
        consent_documented=True,
    )

print("gate")
check("empty plan blocks", gate([]).verdict == "BLOCK")

check("clean single item passes", bool(gate([good_manual()])))

check(
    "clean mixed plan passes",
    gate([good_manual(), good_needling()]).verdict == "PASS",
)

check(
    "unlabelled item blocks",
    gate([PlanItem("Scapular setting", None, "no winging on retest")]).verdict
    == "BLOCK",
)

check(
    "dormant modality blocks",
    gate(
        [PlanItem("Visceral release", "VISCERAL", "reduced guarding")]
    ).verdict
    == "BLOCK",
)

check(
    "outside package reclassifies rather than blocks",
    gate(
        [PlanItem("Mulligan MWM into flexion", "MULLIGAN_MWM", "flex +10 deg")]
    ).verdict
    == "RECLASSIFY",
)

check(
    "needling without consent blocks",
    gate(
        [
            PlanItem(
                "DN to infraspinatus",
                "DRY_NEEDLING",
                "pain drop on movement",
                contraindications_cleared=True,
                consent_documented=False,
            )
        ]
    ).verdict
    == "BLOCK",
)

check(
    "ANF without contraindication screen blocks",
    gate(
        [
            PlanItem(
                "ANF shoulder protocol",
                "ANF",
                "pain stays at or below 2/10 between sessions",
                contraindications_cleared=False,
                consent_documented=True,
            )
        ]
    ).verdict
    == "BLOCK",
)

check(
    "missing success criterion blocks",
    gate([PlanItem("Posterior capsule release", "MYOFASCIAL")]).verdict
    == "BLOCK",
)

check(
    "lowercase modality is accepted",
    gate(
        [PlanItem("NKT screen of lower trap", "nkt", "weak flips to strong")]
    ).verdict
    == "PASS",
)

check(
    "blocking beats reclassify when both present",
    gate(
        [
            PlanItem("Codman pendulums", "CODMAN", "tolerated"),
            PlanItem("Unlabelled item", None, "something"),
        ]
    ).verdict
    == "BLOCK",
)

print("\nscorecard")
all_met = {k: True for k in
           ["soap_complete", "stage_correct", "red_flags", "within_package",
            "clinically_appropriate", "logical_sequence",
            "dosage_and_contraindications", "measurable_goals"]}

check("perfect marks score 100 and PASS", score(all_met).total == 100)

labelled_but_wrong = dict(all_met, clinically_appropriate=False)
check(
    "labelled but clinically wrong cannot reach PASS",
    score(labelled_but_wrong).verdict == "REVISE",
)

check(
    "gate BLOCK forces rewrite regardless of points",
    score(all_met, gate_verdict="BLOCK").verdict == "REJECT_AND_REWRITE",
)

check(
    "missing key counts as not met",
    score({"soap_complete": True}).total == 10,
)

try:
    score({"invented_criterion": True})
    check("unknown criterion raises", False)
except ValueError:
    check("unknown criterion raises", True)

print(f"\n{PASSES} passed, {len(FAILURES)} failed")
if FAILURES:
    for name in FAILURES:
        print(f"  - {name}")
    raise SystemExit(1)
