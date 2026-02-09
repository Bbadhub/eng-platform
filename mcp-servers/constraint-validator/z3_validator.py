"""
Z3 Constraint Validator for Legal Reasoning

Uses Microsoft Z3 SMT solver to validate logical consistency of constraints
extracted from legal documents. Returns UNSAT cores mapped to source documents.
"""

import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from z3 import (
    Solver, Bool, And, Or, Not, Implies, sat, unsat, unknown,
    set_param
)

from constraint_extractor import Constraint, ConstraintType, Provenance
from authority_model import AuthorityRanker, AuthorityLevel


@dataclass
class ValidationResult:
    """Result of constraint validation."""
    satisfiable: bool
    status: str  # 'sat', 'unsat', 'unknown'
    model: Optional[Dict[str, bool]] = None  # Variable assignments if sat
    unsat_core: Optional[List[str]] = None  # Conflicting constraint IDs if unsat
    explanation: str = ""
    conflicts: Optional[List[Dict[str, Any]]] = None  # Detailed conflict info

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ConflictExplanation:
    """Detailed explanation of a constraint conflict."""
    constraint_a: Dict[str, Any]
    constraint_b: Dict[str, Any]
    conflict_type: str  # 'direct_contradiction', 'logical_impossibility', 'temporal_conflict'
    explanation: str
    authority_resolution: Optional[str] = None
    resolution_available: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class Z3Validator:
    """
    Validates logical consistency of legal constraints using Z3 SMT solver.

    Key features:
    - UNSAT core extraction to identify conflicting constraints
    - Provenance mapping for court-ready explanations
    - Authority hierarchy for conflict resolution
    """

    def __init__(self):
        self.constraint_db: Dict[str, Constraint] = {}
        self.authority_ranker = AuthorityRanker()

        # Set Z3 options for better UNSAT core extraction
        set_param('unsat_core', True)

    def validate_consistency(
        self,
        constraints: List[Constraint],
        include_soft: bool = False
    ) -> ValidationResult:
        """
        Check if constraints are logically consistent.

        Args:
            constraints: List of Constraint objects to validate
            include_soft: Whether to include soft constraints (default: hard only)

        Returns:
            ValidationResult with satisfiability status and conflict info
        """
        if not constraints:
            return ValidationResult(
                satisfiable=True,
                status='sat',
                explanation='No constraints to validate'
            )

        # Filter to hard constraints unless include_soft
        active_constraints = [
            c for c in constraints
            if include_soft or c.is_hard
        ]

        if not active_constraints:
            return ValidationResult(
                satisfiable=True,
                status='sat',
                explanation='No hard constraints to validate'
            )

        # Store constraints for provenance lookup
        for c in active_constraints:
            self.constraint_db[c.id] = c

        # Create Z3 solver with UNSAT core tracking
        solver = Solver()
        solver.set(':core.minimize', True)

        # Create variables
        z3_vars: Dict[str, Bool] = {}
        for c in active_constraints:
            for var_name in c.variables:
                if var_name not in z3_vars:
                    z3_vars[var_name] = Bool(var_name)

        # Add constraints with tracking
        for c in active_constraints:
            z3_expr = self._parse_logic_to_z3(c.logic_form, z3_vars)
            if z3_expr is not None:
                # Use constraint ID as tracking label for UNSAT core
                solver.assert_and_track(z3_expr, Bool(c.id))

        # Check satisfiability
        result = solver.check()

        if result == sat:
            # Extract model (variable assignments)
            model = solver.model()
            var_values = {}
            for var_name, z3_var in z3_vars.items():
                val = model.evaluate(z3_var, model_completion=True)
                var_values[var_name] = str(val) == 'True'

            return ValidationResult(
                satisfiable=True,
                status='sat',
                model=var_values,
                explanation='All constraints are logically consistent'
            )

        elif result == unsat:
            # Extract UNSAT core
            core = solver.unsat_core()
            core_ids = [str(c) for c in core]

            # Get detailed conflict explanation
            conflicts = self._explain_conflicts(core_ids)

            return ValidationResult(
                satisfiable=False,
                status='unsat',
                unsat_core=core_ids,
                conflicts=[c.to_dict() for c in conflicts],
                explanation=f'Found {len(core_ids)} conflicting constraints'
            )

        else:
            return ValidationResult(
                satisfiable=False,
                status='unknown',
                explanation='Z3 could not determine satisfiability (timeout or complexity)'
            )

    def _parse_logic_to_z3(
        self,
        logic_form: str,
        z3_vars: Dict[str, Bool]
    ) -> Optional[Any]:
        """
        Parse our logic form string into Z3 expression.

        Handles formats like:
        - "var_name == True"
        - "var_name == False"
        - "And(var_a, var_b)"
        - "Or(var_a, var_b)"
        - "Not(var_a)"
        - "Implies(var_a, var_b)"
        """
        if not logic_form:
            return None

        try:
            # Simple equality checks
            eq_match = re.match(r'(\w+)\s*==\s*(True|False)', logic_form)
            if eq_match:
                var_name = eq_match.group(1)
                value = eq_match.group(2) == 'True'

                if var_name not in z3_vars:
                    z3_vars[var_name] = Bool(var_name)

                if value:
                    return z3_vars[var_name]
                else:
                    return Not(z3_vars[var_name])

            # Inequality checks
            neq_match = re.match(r'(\w+)\s*!=\s*(True|False)', logic_form)
            if neq_match:
                var_name = neq_match.group(1)
                value = neq_match.group(2) == 'True'

                if var_name not in z3_vars:
                    z3_vars[var_name] = Bool(var_name)

                if value:
                    return Not(z3_vars[var_name])
                else:
                    return z3_vars[var_name]

            # Function-style expressions (And, Or, Not, Implies)
            # Not(var)
            not_match = re.match(r'Not\((\w+)\)', logic_form)
            if not_match:
                var_name = not_match.group(1)
                if var_name not in z3_vars:
                    z3_vars[var_name] = Bool(var_name)
                return Not(z3_vars[var_name])

            # And(var_a, var_b)
            and_match = re.match(r'And\((\w+),\s*(\w+)\)', logic_form)
            if and_match:
                var_a, var_b = and_match.groups()
                if var_a not in z3_vars:
                    z3_vars[var_a] = Bool(var_a)
                if var_b not in z3_vars:
                    z3_vars[var_b] = Bool(var_b)
                return And(z3_vars[var_a], z3_vars[var_b])

            # Or(var_a, var_b)
            or_match = re.match(r'Or\((\w+),\s*(\w+)\)', logic_form)
            if or_match:
                var_a, var_b = or_match.groups()
                if var_a not in z3_vars:
                    z3_vars[var_a] = Bool(var_a)
                if var_b not in z3_vars:
                    z3_vars[var_b] = Bool(var_b)
                return Or(z3_vars[var_a], z3_vars[var_b])

            # Implies(var_a, var_b)
            implies_match = re.match(r'Implies\((\w+),\s*(\w+)\)', logic_form)
            if implies_match:
                var_a, var_b = implies_match.groups()
                if var_a not in z3_vars:
                    z3_vars[var_a] = Bool(var_a)
                if var_b not in z3_vars:
                    z3_vars[var_b] = Bool(var_b)
                return Implies(z3_vars[var_a], z3_vars[var_b])

            # If nothing matched, try evaluating as Python (risky but fallback)
            # Create a safe namespace with Z3 functions and our variables
            safe_ns = {
                'And': And, 'Or': Or, 'Not': Not, 'Implies': Implies,
                'True': True, 'False': False,
                **z3_vars
            }
            return eval(logic_form, {"__builtins__": {}}, safe_ns)

        except Exception as e:
            print(f"[Z3Validator] Failed to parse logic: {logic_form} - {e}")
            return None

    def _explain_conflicts(self, core_ids: List[str]) -> List[ConflictExplanation]:
        """
        Generate detailed explanations for conflicting constraints.

        Maps UNSAT core back to source documents with provenance.
        """
        conflicts = []

        # Get constraint objects for core
        core_constraints = [
            self.constraint_db.get(cid)
            for cid in core_ids
            if cid in self.constraint_db
        ]

        # If we have pairs, explain each pair
        if len(core_constraints) >= 2:
            for i in range(len(core_constraints)):
                for j in range(i + 1, len(core_constraints)):
                    c_a = core_constraints[i]
                    c_b = core_constraints[j]

                    if c_a and c_b:
                        conflict = self._explain_pair_conflict(c_a, c_b)
                        if conflict:
                            conflicts.append(conflict)

        # If single constraint in core, it's self-contradictory
        elif len(core_constraints) == 1:
            c = core_constraints[0]
            if c:
                conflicts.append(ConflictExplanation(
                    constraint_a=c.to_dict(),
                    constraint_b=c.to_dict(),
                    conflict_type='self_contradiction',
                    explanation=f'Constraint "{c.natural_language}" is self-contradictory',
                    resolution_available=False
                ))

        return conflicts

    def _explain_pair_conflict(
        self,
        c_a: Constraint,
        c_b: Constraint
    ) -> Optional[ConflictExplanation]:
        """Explain why two constraints conflict."""
        # Determine conflict type
        conflict_type = 'logical_impossibility'

        # Check for direct assertion vs negation
        if c_a.constraint_type == ConstraintType.ASSERTION and c_b.constraint_type == ConstraintType.NEGATION:
            conflict_type = 'direct_contradiction'
        elif c_a.constraint_type == ConstraintType.NEGATION and c_b.constraint_type == ConstraintType.ASSERTION:
            conflict_type = 'direct_contradiction'
        elif c_a.constraint_type == ConstraintType.TEMPORAL or c_b.constraint_type == ConstraintType.TEMPORAL:
            conflict_type = 'temporal_conflict'

        # Try to resolve via authority
        authority_resolution = None
        resolution_available = False

        if c_a.provenance and c_b.provenance:
            auth_a = self.authority_ranker.detect_authority({
                'doc_title': c_a.provenance.doc_title,
                'court': c_a.provenance.court,
                'quote': c_a.provenance.quote,
                'doc_type': c_a.provenance.doc_type
            })
            auth_b = self.authority_ranker.detect_authority({
                'doc_title': c_b.provenance.doc_title,
                'court': c_b.provenance.court,
                'quote': c_b.provenance.quote,
                'doc_type': c_b.provenance.doc_type
            })

            if auth_a.level != auth_b.level:
                resolution_available = True
                winner = c_a if auth_a.level < auth_b.level else c_b
                loser = c_b if auth_a.level < auth_b.level else c_a
                winner_auth = auth_a if auth_a.level < auth_b.level else auth_b
                loser_auth = auth_b if auth_a.level < auth_b.level else auth_a

                authority_resolution = (
                    f"{winner_auth.level.name} ({winner.provenance.doc_title}) "
                    f"overrides {loser_auth.level.name} ({loser.provenance.doc_title})"
                )

        # Build explanation
        explanation = f"""Conflict between:
1. "{c_a.natural_language}" (from {c_a.provenance.doc_title if c_a.provenance else 'Unknown'})
2. "{c_b.natural_language}" (from {c_b.provenance.doc_title if c_b.provenance else 'Unknown'})

These statements cannot both be true simultaneously."""

        return ConflictExplanation(
            constraint_a=c_a.to_dict(),
            constraint_b=c_b.to_dict(),
            conflict_type=conflict_type,
            explanation=explanation,
            authority_resolution=authority_resolution,
            resolution_available=resolution_available
        )

    def explain_conflict(
        self,
        unsat_core: List[str],
        constraints: List[Constraint]
    ) -> List[Dict[str, Any]]:
        """
        Public method to explain conflicts from UNSAT core.

        Args:
            unsat_core: List of constraint IDs from UNSAT core
            constraints: Full list of constraints (for lookup)

        Returns:
            List of conflict explanation dicts
        """
        # Populate constraint DB
        for c in constraints:
            self.constraint_db[c.id] = c

        conflicts = self._explain_conflicts(unsat_core)
        return [c.to_dict() for c in conflicts]

    def get_model_as_facts(
        self,
        model: Dict[str, bool],
        constraints: List[Constraint]
    ) -> List[Dict[str, Any]]:
        """
        Convert Z3 model to list of facts with provenance.

        Useful for understanding what must be true for constraints to be consistent.
        """
        facts = []

        for var_name, value in model.items():
            # Find constraints that use this variable
            using_constraints = [
                c for c in constraints
                if var_name in c.variables
            ]

            fact = {
                'variable': var_name,
                'value': value,
                'natural_language': f"{var_name} is {value}",
                'sources': []
            }

            for c in using_constraints:
                if c.provenance:
                    fact['sources'].append({
                        'doc_title': c.provenance.doc_title,
                        'quote': c.provenance.quote[:200],
                        'constraint': c.natural_language
                    })

            facts.append(fact)

        return facts
