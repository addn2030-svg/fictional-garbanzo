"""Weighted scorecard for reviewing a clinical plan.

Revised Sept 2026. Package conformity dropped from 30% to 20% and a
clinical-appropriateness criterion added at 20%, closing the hole where
a fully labelled but clinically wrong plan could score PASS.

The gate in clinical_gate.py runs first and is absolute. This scorecard
grades quality; it never overrides a BLOCK.
"""

from dataclasses import dataclass

# criterion key -> (weight, human label)
CRITERIA: dict[str, tuple[int, str]] = {
    "soap_complete": (10, "SOAP complete in all four sections"),
    "stage_correct": (10, "Clinical stage correctly identified"),
    "red_flags": (10, "Red flags screened and documented"),
    "within_package": (20, "Every item inside the active package"),
    "clinically_appropriate": (
        20,
        "Interventions suit the stage and the documented findings",
    ),
    "logical_sequence": (
        15,
        "Sequence respects assessment then release then remap then mobilise",
    ),
    "dosage_and_contraindications": (
        10,
        "Dosage stated and contraindications addressed",
    ),
    "measurable_goals": (5, "Goals numeric and tied to retest"),
}

PASS_THRESHOLD = 80
REVISE_THRESHOLD = 50

# Criteria that cannot be traded away for points. Failing any of these
# caps the verdict at REVISE even on a numerically passing score: a
# plan that is well formed but wrong for the patient is not a pass.
MANDATORY = frozenset({"clinically_appropriate", "red_flags"})

@dataclass
class ScoreResult:
    total: int
    verdict: str
    failed: list[str]
    forced: bool = False

    def report(self) -> str:
        lines = [f"SCORE {self.total}/100 -> {self.verdict}"]
        if self.forced:
            lines.append("  (forced by gate verdict, score not decisive)")
        for label in self.failed:
            lines.append(f"  missed: {label}")
        return "\n".join(lines)

def score(marks: dict[str, bool], gate_verdict: str = "PASS") -> ScoreResult:
    """Grade a plan.

    marks maps each criterion key to whether it was met. A missing key
    counts as not met, so an incomplete review never inflates the score.

    gate_verdict comes from clinical_gate.gate(). Anything other than
    PASS forces REJECT_AND_REWRITE regardless of points: framework
    isolation and consent are not tradeable against quality points.
    """
    unknown = set(marks) - set(CRITERIA)
    if unknown:
        raise ValueError(f"unknown criteria: {', '.join(sorted(unknown))}")

    total = sum(w for key, (w, _) in CRITERIA.items() if marks.get(key))
    failed = [label for key, (_, label) in CRITERIA.items() if not marks.get(key)]

    if gate_verdict != "PASS":
        return ScoreResult(total, "REJECT_AND_REWRITE", failed, forced=True)

    missed_mandatory = sorted(k for k in MANDATORY if not marks.get(k))
    if missed_mandatory:
        verdict = "REVISE" if total >= REVISE_THRESHOLD else "REJECT_AND_REWRITE"
        return ScoreResult(total, verdict, failed, forced=True)

    if total >= PASS_THRESHOLD:
        verdict = "PASS"
    elif total >= REVISE_THRESHOLD:
        verdict = "REVISE"
    else:
        verdict = "REJECT_AND_REWRITE"

    return ScoreResult(total, verdict, failed)
