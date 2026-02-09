"""
Constraint Extractor for Legal Documents

Extracts logical constraints from investigation findings using LLM,
with full provenance tracking for court-ready explanations.
"""

import os
import re
import json
import httpx
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
from enum import Enum


class ConstraintType(str, Enum):
    """Types of logical constraints."""
    ASSERTION = "assertion"  # X is true
    NEGATION = "negation"  # X is not true
    IMPLICATION = "implication"  # X implies Y
    TEMPORAL = "temporal"  # X before/after Y
    EQUIVALENCE = "equivalence"  # X equals Y
    EXCLUSION = "exclusion"  # X excludes Y (can't both be true)


@dataclass
class Provenance:
    """Tracks source of a constraint for court-ready citations."""
    doc_id: str
    doc_title: str
    paragraph: Optional[int] = None
    page: Optional[int] = None
    quote: str = ""
    court: Optional[str] = None
    date: Optional[str] = None
    doc_type: Optional[str] = None


@dataclass
class Constraint:
    """A logical constraint extracted from findings."""
    id: str
    constraint_type: ConstraintType
    subject: str  # Primary entity/fact
    predicate: Optional[str] = None  # For implications/relations
    variables: List[str] = None  # Z3 variable names
    logic_form: str = ""  # Z3-compatible logic string
    natural_language: str = ""  # Human-readable version
    confidence: float = 0.8
    provenance: Provenance = None
    is_hard: bool = True  # Hard constraint (must be true) vs soft

    def __post_init__(self):
        if self.variables is None:
            self.variables = []

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d['constraint_type'] = self.constraint_type.value
        return d


class ConstraintExtractor:
    """
    Extracts logical constraints from investigation findings.

    Uses LLM to convert natural language findings into formal logic,
    while preserving full provenance for explainability.
    """

    def __init__(self, litellm_url: str = None, api_key: str = None):
        self.litellm_url = litellm_url or os.environ.get('LITELLM_URL', 'http://litellm:4000')
        self.api_key = api_key or os.environ.get('LITELLM_API_KEY', 'sk-1234')
        self.constraint_counter = 0

    async def extract_constraints(
        self,
        findings: List[Dict[str, Any]],
        sources: List[Dict[str, Any]] = None
    ) -> List[Constraint]:
        """
        Extract logical constraints from investigation findings.

        Args:
            findings: List of finding dicts with 'quote', 'document', 'significance'
            sources: Optional list of source documents for context

        Returns:
            List of Constraint objects with provenance
        """
        constraints = []

        for finding in findings:
            # Extract constraints from this finding
            finding_constraints = await self._extract_from_finding(finding)
            constraints.extend(finding_constraints)

        # Deduplicate by logic form
        seen_logic = set()
        unique_constraints = []
        for c in constraints:
            if c.logic_form not in seen_logic:
                seen_logic.add(c.logic_form)
                unique_constraints.append(c)

        return unique_constraints

    async def _extract_from_finding(self, finding: Dict[str, Any]) -> List[Constraint]:
        """Extract constraints from a single finding."""
        quote = finding.get('quote', finding.get('Quote', ''))
        document = finding.get('document', finding.get('Document', 'Unknown'))
        significance = finding.get('significance', finding.get('Significance', ''))
        entities = finding.get('entities', finding.get('Entities', []))
        finding_type = finding.get('type', 'DIRECT')

        if not quote:
            return []

        # Build provenance
        provenance = Provenance(
            doc_id=finding.get('doc_id', ''),
            doc_title=document,
            paragraph=finding.get('paragraph'),
            page=finding.get('page'),
            quote=quote[:500],  # Truncate for storage
            court=finding.get('court'),
            date=finding.get('date'),
            doc_type=finding.get('doc_type')
        )

        # Use LLM to extract logical constraints
        constraints = await self._llm_extract(quote, significance, entities, provenance)

        # If LLM fails, fall back to pattern matching
        if not constraints:
            constraints = self._pattern_extract(quote, entities, provenance)

        return constraints

    async def _llm_extract(
        self,
        quote: str,
        significance: str,
        entities: List[str],
        provenance: Provenance
    ) -> List[Constraint]:
        """Use LLM to extract logical constraints from text."""
        prompt = f"""Extract logical constraints from this legal finding. Return JSON array.

Quote: "{quote}"

Significance: {significance}

Entities mentioned: {', '.join(entities) if entities else 'None specified'}

For each constraint, provide:
1. type: "assertion", "negation", "implication", "temporal", "equivalence", or "exclusion"
2. subject: The main entity or fact being asserted
3. predicate: For implications/relations, what it implies or relates to
4. variables: List of variable names for formal logic (snake_case)
5. logic_form: Z3-compatible logic (use And, Or, Not, Implies, ==, !=)
6. natural_language: Human-readable version
7. confidence: 0.0-1.0 confidence in extraction accuracy
8. is_hard: true if this must be true, false if it's a soft constraint

Example output:
[
  {{
    "type": "assertion",
    "subject": "McNeal met Blackman",
    "predicate": null,
    "variables": ["mcneal_met_blackman"],
    "logic_form": "mcneal_met_blackman == True",
    "natural_language": "McNeal met Blackman during the presentation",
    "confidence": 0.95,
    "is_hard": true
  }},
  {{
    "type": "negation",
    "subject": "McNeal recalled Blackman's name",
    "predicate": null,
    "variables": ["mcneal_recalled_name"],
    "logic_form": "mcneal_recalled_name == False",
    "natural_language": "McNeal did not recall Blackman's name",
    "confidence": 0.9,
    "is_hard": true
  }}
]

Return ONLY the JSON array, no other text."""

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.litellm_url}/v1/chat/completions",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}"
                    },
                    json={
                        "model": "deepseek-chat",
                        "messages": [
                            {"role": "system", "content": "You are a legal logic extraction assistant. Extract formal logical constraints from legal text."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.1,
                        "max_tokens": 1000
                    }
                )
                response.raise_for_status()
                data = response.json()

            content = data['choices'][0]['message']['content']

            # Parse JSON from response
            # Handle markdown code blocks
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0]
            elif '```' in content:
                content = content.split('```')[1].split('```')[0]

            constraint_dicts = json.loads(content.strip())

            constraints = []
            for cd in constraint_dicts:
                self.constraint_counter += 1
                c = Constraint(
                    id=f"c_{self.constraint_counter}",
                    constraint_type=ConstraintType(cd.get('type', 'assertion')),
                    subject=cd.get('subject', ''),
                    predicate=cd.get('predicate'),
                    variables=cd.get('variables', []),
                    logic_form=cd.get('logic_form', ''),
                    natural_language=cd.get('natural_language', ''),
                    confidence=cd.get('confidence', 0.8),
                    provenance=provenance,
                    is_hard=cd.get('is_hard', True)
                )
                constraints.append(c)

            return constraints

        except Exception as e:
            print(f"[ConstraintExtractor] LLM extraction failed: {e}")
            return []

    def _pattern_extract(
        self,
        quote: str,
        entities: List[str],
        provenance: Provenance
    ) -> List[Constraint]:
        """Fallback pattern-based extraction when LLM fails."""
        constraints = []
        quote_lower = quote.lower()

        # Negation patterns
        negation_patterns = [
            (r'did not (\w+)', 'negation'),
            (r'never (\w+)', 'negation'),
            (r"didn't (\w+)", 'negation'),
            (r'was not (\w+)', 'negation'),
            (r'no (\w+) was', 'negation'),
        ]

        for pattern, ctype in negation_patterns:
            match = re.search(pattern, quote_lower)
            if match:
                self.constraint_counter += 1
                var_name = f"fact_{self.constraint_counter}"
                constraints.append(Constraint(
                    id=f"c_{self.constraint_counter}",
                    constraint_type=ConstraintType.NEGATION,
                    subject=match.group(0),
                    variables=[var_name],
                    logic_form=f"{var_name} == False",
                    natural_language=match.group(0),
                    confidence=0.6,
                    provenance=provenance,
                    is_hard=True
                ))

        # Assertion patterns
        assertion_patterns = [
            (r'(\w+) confirmed that', 'assertion'),
            (r'(\w+) stated that', 'assertion'),
            (r'(\w+) was (\w+)', 'assertion'),
            (r'(\w+) met (\w+)', 'assertion'),
        ]

        for pattern, ctype in assertion_patterns:
            match = re.search(pattern, quote_lower)
            if match:
                self.constraint_counter += 1
                var_name = f"fact_{self.constraint_counter}"
                constraints.append(Constraint(
                    id=f"c_{self.constraint_counter}",
                    constraint_type=ConstraintType.ASSERTION,
                    subject=match.group(0),
                    variables=[var_name],
                    logic_form=f"{var_name} == True",
                    natural_language=match.group(0),
                    confidence=0.5,
                    provenance=provenance,
                    is_hard=True
                ))

        return constraints

    def format_for_z3(self, constraints: List[Constraint]) -> str:
        """
        Format constraints for Z3 solver input.

        Returns Python code that can be executed to create Z3 constraints.
        """
        lines = ["from z3 import *", "", "# Variable declarations"]

        # Collect all unique variables
        all_vars = set()
        for c in constraints:
            all_vars.update(c.variables)

        for var in sorted(all_vars):
            lines.append(f"{var} = Bool('{var}')")

        lines.append("")
        lines.append("# Constraints")
        lines.append("solver = Solver()")

        for c in constraints:
            comment = f"# {c.id}: {c.natural_language[:60]}..."
            lines.append(comment)

            # Convert logic_form to Z3
            z3_expr = self._to_z3_expression(c.logic_form)
            lines.append(f"solver.add({z3_expr})  # From: {c.provenance.doc_title}")

        lines.append("")
        lines.append("# Check satisfiability")
        lines.append("result = solver.check()")
        lines.append("print(f'Result: {result}')")

        return "\n".join(lines)

    def _to_z3_expression(self, logic_form: str) -> str:
        """Convert our logic form to Z3 expression."""
        # Already in Z3 format mostly, just clean up
        expr = logic_form.replace('==', '==').replace('!=', '!=')

        # Convert True/False to Z3 boolean
        expr = re.sub(r'\bTrue\b', 'True', expr)
        expr = re.sub(r'\bFalse\b', 'False', expr)

        return expr
