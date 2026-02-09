"""
Authority Model for Legal Constraint Validation

Implements legal authority hierarchy for resolving conflicting constraints.
Higher authority sources take precedence when constraints conflict.
"""

from enum import IntEnum
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import re


class AuthorityLevel(IntEnum):
    """
    Legal authority hierarchy (lower number = higher authority).

    Based on U.S. federal court system precedent hierarchy.
    """
    SUPREME_COURT = 1
    CIRCUIT_COURT = 2
    STATE_SUPREME = 2  # Same level as Circuit for state matters
    DISTRICT_COURT = 3
    STATE_APPEALS = 3
    TRIAL_COURT = 4
    ADMINISTRATIVE = 5
    SECONDARY_SOURCE = 6  # Treatises, law reviews
    WITNESS_STATEMENT = 7
    DOCUMENT_EVIDENCE = 7
    UNKNOWN = 10


@dataclass
class AuthorityInfo:
    """Information about a source's legal authority."""
    level: AuthorityLevel
    court_name: Optional[str] = None
    jurisdiction: Optional[str] = None
    date: Optional[str] = None
    binding: bool = True  # Is this binding precedent?
    overruled: bool = False  # Has this been overruled?


# Patterns for detecting court types from document text
COURT_PATTERNS = {
    AuthorityLevel.SUPREME_COURT: [
        r'supreme\s+court\s+of\s+the\s+united\s+states',
        r'u\.?\s*s\.?\s+supreme\s+court',
        r'scotus',
        r'\d+\s+u\.?\s*s\.?\s+\d+',  # U.S. Reports citation
    ],
    AuthorityLevel.CIRCUIT_COURT: [
        r'(\d+)(st|nd|rd|th)\s+circuit',
        r'court\s+of\s+appeals?\s+for\s+the\s+(\d+)(st|nd|rd|th)\s+circuit',
        r'\d+\s+f\.\s*\d*d?\s+\d+',  # Federal Reporter citation
    ],
    AuthorityLevel.DISTRICT_COURT: [
        r'district\s+court',
        r'u\.?\s*s\.?\s*d\.?\s*c\.?',
        r'\d+\s+f\.\s*supp',  # Federal Supplement citation
    ],
    AuthorityLevel.STATE_SUPREME: [
        r'supreme\s+court\s+of\s+\w+',
        r'\w+\s+supreme\s+court',
    ],
    AuthorityLevel.TRIAL_COURT: [
        r'trial\s+court',
        r'superior\s+court',
        r'county\s+court',
    ],
}


class AuthorityRanker:
    """
    Ranks legal sources by authority level and resolves conflicts.
    """

    def __init__(self):
        self.court_cache: Dict[str, AuthorityInfo] = {}

    def detect_authority(self, source: Dict[str, Any]) -> AuthorityInfo:
        """
        Detect the authority level of a source document.

        Args:
            source: Source document with 'doc_title', 'court', 'quote' fields

        Returns:
            AuthorityInfo with detected authority level
        """
        doc_title = source.get('doc_title', '').lower()
        court = source.get('court', '').lower()
        quote = source.get('quote', '').lower()
        doc_type = source.get('doc_type', '').lower()

        # Check cache
        cache_key = f"{doc_title}:{court}"
        if cache_key in self.court_cache:
            return self.court_cache[cache_key]

        # Detect from court field first
        level = self._detect_from_text(court)

        # If not found, try document title
        if level == AuthorityLevel.UNKNOWN:
            level = self._detect_from_text(doc_title)

        # If still unknown, try the quote itself
        if level == AuthorityLevel.UNKNOWN:
            level = self._detect_from_text(quote)

        # Special handling for document types
        if level == AuthorityLevel.UNKNOWN:
            if any(x in doc_type for x in ['fd-302', 'fbi', 'interview', 'statement']):
                level = AuthorityLevel.WITNESS_STATEMENT
            elif any(x in doc_type for x in ['indictment', 'motion', 'filing']):
                level = AuthorityLevel.TRIAL_COURT
            elif any(x in doc_type for x in ['email', 'memo', 'document']):
                level = AuthorityLevel.DOCUMENT_EVIDENCE

        # Default to unknown if still not detected
        if level == AuthorityLevel.UNKNOWN:
            level = AuthorityLevel.DOCUMENT_EVIDENCE

        info = AuthorityInfo(
            level=level,
            court_name=court or doc_title,
            jurisdiction=self._detect_jurisdiction(court or doc_title),
            binding=level <= AuthorityLevel.DISTRICT_COURT
        )

        self.court_cache[cache_key] = info
        return info

    def _detect_from_text(self, text: str) -> AuthorityLevel:
        """Detect authority level from text using patterns."""
        text = text.lower()

        for level, patterns in COURT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    return level

        return AuthorityLevel.UNKNOWN

    def _detect_jurisdiction(self, text: str) -> Optional[str]:
        """Detect jurisdiction from court text."""
        # Federal circuits
        circuit_match = re.search(r'(\d+)(st|nd|rd|th)\s+circuit', text, re.I)
        if circuit_match:
            return f"{circuit_match.group(1)}th Circuit"

        # State names
        states = [
            'alabama', 'alaska', 'arizona', 'arkansas', 'california',
            'colorado', 'connecticut', 'delaware', 'florida', 'georgia',
            'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
            'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts',
            'michigan', 'minnesota', 'mississippi', 'missouri', 'montana',
            'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico',
            'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma',
            'oregon', 'pennsylvania', 'rhode island', 'south carolina',
            'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
            'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'
        ]

        text_lower = text.lower()
        for state in states:
            if state in text_lower:
                return state.title()

        return None

    def rank_constraints(self, constraints: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Rank constraints by authority level.

        Args:
            constraints: List of constraint dicts with 'source' field

        Returns:
            Constraints sorted by authority (highest authority first)
        """
        def get_authority_key(constraint: Dict) -> tuple:
            source = constraint.get('source', {})
            auth = self.detect_authority(source)
            # Sort by: level (asc), binding (desc), date (desc)
            return (
                auth.level,
                not auth.binding,
                source.get('date', '9999')  # Unknown dates sort last
            )

        return sorted(constraints, key=get_authority_key)

    def resolve_conflict(
        self,
        conflicting_constraints: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Resolve a conflict between constraints using authority hierarchy.

        Args:
            conflicting_constraints: List of constraints that conflict

        Returns:
            Resolution info including winner, authority explanation
        """
        if not conflicting_constraints:
            return {'resolved': False, 'reason': 'No constraints provided'}

        if len(conflicting_constraints) == 1:
            return {
                'resolved': True,
                'winner': conflicting_constraints[0],
                'reason': 'Only one constraint'
            }

        # Rank by authority
        ranked = self.rank_constraints(conflicting_constraints)
        winner = ranked[0]
        loser = ranked[-1]

        winner_auth = self.detect_authority(winner.get('source', {}))
        loser_auth = self.detect_authority(loser.get('source', {}))

        # Check if same authority level
        if winner_auth.level == loser_auth.level:
            return {
                'resolved': False,
                'reason': f'Same authority level ({winner_auth.level.name})',
                'constraints': ranked,
                'recommendation': 'Manual review required - same authority level'
            }

        return {
            'resolved': True,
            'winner': winner,
            'loser': loser,
            'reason': f'{winner_auth.level.name} ({winner_auth.court_name}) overrides {loser_auth.level.name} ({loser_auth.court_name})',
            'authority_hierarchy': [
                {
                    'constraint': c,
                    'authority': self.detect_authority(c.get('source', {})).level.name
                }
                for c in ranked
            ]
        }

    def explain_authority(self, source: Dict[str, Any]) -> str:
        """
        Generate a human-readable explanation of a source's authority.

        Args:
            source: Source document dict

        Returns:
            Explanation string
        """
        auth = self.detect_authority(source)

        level_explanations = {
            AuthorityLevel.SUPREME_COURT: "Supreme Court decisions are binding on all lower courts",
            AuthorityLevel.CIRCUIT_COURT: "Circuit Court decisions are binding within their circuit",
            AuthorityLevel.STATE_SUPREME: "State Supreme Court decisions are authoritative for state law",
            AuthorityLevel.DISTRICT_COURT: "District Court decisions may be persuasive but not binding",
            AuthorityLevel.STATE_APPEALS: "State Appeals Court decisions are persuasive within the state",
            AuthorityLevel.TRIAL_COURT: "Trial court filings are evidence, not precedent",
            AuthorityLevel.ADMINISTRATIVE: "Administrative rulings may guide but don't bind courts",
            AuthorityLevel.SECONDARY_SOURCE: "Secondary sources inform but don't create law",
            AuthorityLevel.WITNESS_STATEMENT: "Witness statements are factual claims, not legal authority",
            AuthorityLevel.DOCUMENT_EVIDENCE: "Documentary evidence is factual, not legal authority",
            AuthorityLevel.UNKNOWN: "Authority level could not be determined",
        }

        base_explanation = level_explanations.get(auth.level, "Unknown authority level")

        if auth.court_name:
            return f"{base_explanation}. Source: {auth.court_name}"

        return base_explanation
