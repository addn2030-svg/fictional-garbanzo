"""Deterministic gate for clinical plan output.

Framework isolation, consent and measurability are enforced in code,
not in prompt instructions. A language model cannot talk its way past
this module.

Active package decided Sept 2026 and unified across MedAssess Pro and
the AI OS clinical mode. VISCERAL is dormant, not deleted: move it from
DORMANT to APPROVED_PACKAGE when credentialing is complete.

Clinical decision support only. Final clinical decisions remain with
the treating clinician.
"""

from dataclasses import dataclass, field
from typing import Literal

APPROVED_PACKAGE = frozenset(
    {"NKT", "ANF", "MYOFASCIAL", "DRY_NEEDLING", "MANUAL"}
)

# Certified or known, deliberately not active. Kept explicit so that an
# item naming one of these is blocked with a clear reason rather than
# silently treated as an unknown label.
DORMANT = frozenset({"VISCERAL", "IMTAF_IDS", "PELVIC", "MULLIGAN"})

CONSENT_REQUIRED = frozenset({"DRY_NEEDLING", "ANF"})

Verdict = Literal["PASS", "RECLASSIFY", "BLOCK"]

# Reason codes keep downstream handling deterministic. Never reword a
# code string; add a new one instead.
R_EMPTY = "G00"
R_NO_LABEL = "G01"
R_DORMANT = "G02"
R_OUTSIDE = "G03"
R_NO_SCREEN = "G04"
R_NO_CONSENT = "G05"
R_NO_CRITERION = "G06"

BLOCKING_CODES = frozenset(
    {R_EMPTY, R_NO_LABEL, R_DORMANT, R_NO_SCREEN, R_NO_CONSENT}
)

@dataclass
class PlanItem:
    """One line of a treatment plan."""

    intervention: str
    modality: str | None = None
    success_criterion: str | None = None
    contraindications_cleared: bool = False
    consent_documented: bool = False

@dataclass
class Reason:
    code: str
    item_index: int | None
    message: str

    def __str__(self) -> str:
        where = f"item {self.item_index}" if self.item_index else "plan"
        return f"[{self.code}] {where}: {self.message}"

@dataclass
class GateResult:
    verdict: Verdict
    reasons: list[Reason] = field(default_factory=list)

    def __bool__(self) -> bool:
        return self.verdict == "PASS"

    def report(self) -> str:
        head = f"GATE {self.verdict}"
        if not self.reasons:
            return head
        body = "\n".join(f"  {r}" for r in self.reasons)
        return f"{head}\n{body}"

def _check_item(idx: int, item: PlanItem) -> list[Reason]:
    reasons: list[Reason] = []
    label = item.intervention.strip()[:48] or "unnamed intervention"

    if not item.modality:
        reasons.append(
            Reason(R_NO_LABEL, idx, f"'{label}' carries no modality label")
        )
        return reasons

    mod = item.modality.strip().upper()

    if mod in DORMANT:
        reasons.append(
            Reason(
                R_DORMANT,
                idx,
                f"'{mod}' is dormant and outside the active package",
            )
        )
        return reasons

    if mod not in APPROVED_PACKAGE:
        reasons.append(
            Reason(
                R_OUTSIDE,
                idx,
                f"'{mod}' is outside the package - reclassify under MANUAL "
                "with written justification, or remove",
            )
        )
        return reasons

    if mod in CONSENT_REQUIRED:
        if not item.contraindications_cleared:
            reasons.append(
                Reason(R_NO_SCREEN, idx, f"{mod} without contraindication screen")
            )
        if not item.consent_documented:
            reasons.append(
                Reason(R_NO_CONSENT, idx, f"{mod} without documented consent")
            )

    if not item.success_criterion:
        reasons.append(
            Reason(R_NO_CRITERION, idx, f"'{label}' has no measurable criterion")
        )

    return reasons

def gate(items: list[PlanItem]) -> GateResult:
    """Evaluate a plan before it is shown to anyone.

    PASS        every item labelled, in package, gated, measurable
    RECLASSIFY  only fault is an out-of-package label that can be remapped
    BLOCK       anything unlabelled, dormant, or missing consent screening
    """
    if not items:
        return GateResult("BLOCK", [Reason(R_EMPTY, None, "plan is empty")])

    reasons: list[Reason] = []
    for idx, item in enumerate(items, start=1):
        reasons.extend(_check_item(idx, item))

    if not reasons:
        return GateResult("PASS")

    codes = {r.code for r in reasons}
    if codes & BLOCKING_CODES:
        return GateResult("BLOCK", reasons)
    if R_OUTSIDE in codes:
        return GateResult("RECLASSIFY", reasons)
    return GateResult("BLOCK", reasons)
