"""
Basin Analysis Core Implementation

This module implements the core basin analysis algorithm:
1. Run query multiple times through LLM
2. Embed each response with Voyage AI
3. Cluster the embeddings
4. Calculate stability metrics (epsilon, n_basins, coherence)
"""

import uuid
import re
import asyncio
from enum import Enum
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
import numpy as np
import httpx

# Clustering imports
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_similarity

try:
    import hdbscan
    HDBSCAN_AVAILABLE = True
except ImportError:
    HDBSCAN_AVAILABLE = False


class QueryType(Enum):
    """Classification of query types for basin analysis."""
    FACTUAL = "factual"
    INTERPRETIVE = "interpretive"
    COUNTERFACTUAL = "counterfactual"
    UNKNOWN = "unknown"


@dataclass
class BasinResult:
    """Result of basin analysis."""
    analysis_id: str
    query: str
    query_type: QueryType
    epsilon: float  # Output spread (lower = more confident)
    n_basins: int  # Number of distinct answer patterns
    coherence: float  # Semantic consistency (higher = more consistent)
    confidence_level: str  # HIGH, MEDIUM, LOW
    interpretation: str  # Human-readable explanation
    responses: List[str]  # Raw LLM responses
    embeddings: np.ndarray  # Response embeddings
    cluster_assignments: List[int]  # Which cluster each response belongs to


class BasinAnalyzer:
    """
    Analyzes LLM output stability to estimate confidence.

    Theory:
    - Certain answers produce consistent outputs across runs
    - Uncertain answers produce variable outputs
    - Cluster structure reveals confidence level
    """

    def __init__(
        self,
        voyage_api_key: str,
        deepseek_api_key: str,
        embedding_model: str = "voyage-law-2"
    ):
        self.voyage_api_key = voyage_api_key
        self.deepseek_api_key = deepseek_api_key
        self.embedding_model = embedding_model

        # Store analysis results for retrieval
        self._analysis_cache: Dict[str, Dict[str, Any]] = {}

    async def measure_confidence(
        self,
        query: str,
        context: Optional[str] = None,
        sample_count: int = 5,
        model: str = "deepseek-chat"
    ) -> Dict[str, Any]:
        """
        Measure confidence by analyzing output stability.

        Args:
            query: The query to analyze
            context: Optional context/documents
            sample_count: Number of times to run query
            model: LLM model to use

        Returns:
            Dict with epsilon, n_basins, coherence, confidence_level
        """
        # Generate analysis ID
        analysis_id = str(uuid.uuid4())[:8]

        # Classify query type
        query_classification = await self.classify_query_type(query)
        query_type = query_classification["query_type"]

        # Run query multiple times
        responses = await self._generate_responses(
            query=query,
            context=context,
            count=sample_count,
            model=model
        )

        # Embed all responses
        embeddings = await self._embed_texts(responses)

        # Cluster embeddings
        cluster_result = self._cluster_embeddings(embeddings)

        # Calculate metrics
        epsilon = self._calculate_epsilon(embeddings)
        n_basins = cluster_result["n_clusters"]
        coherence = self._calculate_coherence(embeddings)

        # Determine confidence level
        confidence_level = self._determine_confidence(
            epsilon=epsilon,
            n_basins=n_basins,
            coherence=coherence,
            query_type=query_type
        )

        # Generate interpretation
        interpretation = self._generate_interpretation(
            epsilon=epsilon,
            n_basins=n_basins,
            coherence=coherence,
            confidence_level=confidence_level,
            query_type=query_type
        )

        # Store for later retrieval
        result = {
            "analysis_id": analysis_id,
            "query": query,
            "query_type": query_type.value,
            "epsilon": epsilon,
            "n_basins": n_basins,
            "coherence": coherence,
            "confidence_level": confidence_level,
            "interpretation": interpretation,
            "sample_count": sample_count,
            "responses": responses,
            "embeddings": embeddings.tolist(),
            "cluster_assignments": cluster_result["labels"],
            "silhouette": cluster_result.get("silhouette"),
            "centroid_distances": cluster_result.get("centroid_distances", [])
        }

        self._analysis_cache[analysis_id] = result

        return result

    async def classify_query_type(self, query: str) -> Dict[str, Any]:
        """
        Classify query as factual, interpretive, or counterfactual.

        Uses pattern matching first, then LLM for ambiguous cases.
        """
        query_lower = query.lower()
        indicators = []

        # Factual patterns
        factual_patterns = [
            (r"when (was|did|is)", "temporal question"),
            (r"what (is|was) the (date|time|year)", "date question"),
            (r"who (is|was|are|were)", "identity question"),
            (r"what (is|was) the name", "name question"),
            (r"cite|citation|reference", "citation question"),
            (r"how many|how much", "quantity question"),
            (r"what (is|are) the charge", "charges question"),
        ]

        # Interpretive patterns
        interpretive_patterns = [
            (r"is (this|that|it) (a |an )?(brady|exculpatory|relevant)", "legal interpretation"),
            (r"what (is|are) the (legal )?(significance|implication)", "significance question"),
            (r"should|would|could this", "judgment question"),
            (r"how (strong|weak|credible)", "assessment question"),
            (r"what does this (mean|suggest|indicate)", "interpretation question"),
            (r"analyze|evaluate|assess", "analysis request"),
        ]

        # Counterfactual patterns
        counterfactual_patterns = [
            (r"what if", "hypothetical"),
            (r"what would (have )?happen", "alternative scenario"),
            (r"had (the |they |we )", "past hypothetical"),
            (r"suppose|assuming|imagine", "hypothetical premise"),
            (r"alternative|instead|otherwise", "alternative consideration"),
        ]

        # Score each type
        scores = {
            QueryType.FACTUAL: 0,
            QueryType.INTERPRETIVE: 0,
            QueryType.COUNTERFACTUAL: 0
        }

        for pattern, indicator in factual_patterns:
            if re.search(pattern, query_lower):
                scores[QueryType.FACTUAL] += 1
                indicators.append(f"Factual: {indicator}")

        for pattern, indicator in interpretive_patterns:
            if re.search(pattern, query_lower):
                scores[QueryType.INTERPRETIVE] += 1
                indicators.append(f"Interpretive: {indicator}")

        for pattern, indicator in counterfactual_patterns:
            if re.search(pattern, query_lower):
                scores[QueryType.COUNTERFACTUAL] += 1
                indicators.append(f"Counterfactual: {indicator}")

        # Determine winner
        max_score = max(scores.values())
        if max_score == 0:
            query_type = QueryType.UNKNOWN
            confidence = 0.3
        else:
            query_type = max(scores, key=scores.get)
            total = sum(scores.values())
            confidence = scores[query_type] / total if total > 0 else 0.5

        return {
            "query_type": query_type,
            "confidence": confidence,
            "indicators": indicators,
            "scores": {k.value: v for k, v in scores.items()}
        }

    async def compare_responses(
        self,
        response_a: str,
        response_b: str
    ) -> Dict[str, Any]:
        """Compare two responses for semantic similarity."""

        # Embed both responses
        embeddings = await self._embed_texts([response_a, response_b])

        # Calculate cosine similarity
        similarity = cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]

        # Interpret similarity
        if similarity > 0.9:
            interpretation = "Very high similarity - responses are essentially the same"
        elif similarity > 0.7:
            interpretation = "High similarity - responses convey the same core information"
        elif similarity > 0.5:
            interpretation = "Moderate similarity - responses share some common elements"
        elif similarity > 0.3:
            interpretation = "Low similarity - responses differ significantly"
        else:
            interpretation = "Very low similarity - responses may contradict each other"

        return {
            "similarity": float(similarity),
            "interpretation": interpretation,
            "differences": self._find_differences(response_a, response_b),
            "common_elements": self._find_common_elements(response_a, response_b)
        }

    def get_stored_analysis(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve stored analysis by ID."""
        return self._analysis_cache.get(analysis_id)

    async def _generate_responses(
        self,
        query: str,
        context: Optional[str],
        count: int,
        model: str
    ) -> List[str]:
        """Generate multiple responses for the same query."""

        # Build the prompt
        if context:
            full_prompt = f"""Context:
{context}

Question: {query}

Provide a thorough answer based on the context above."""
        else:
            full_prompt = query

        # Generate responses in parallel
        tasks = [
            self._call_llm(full_prompt, model)
            for _ in range(count)
        ]

        responses = await asyncio.gather(*tasks)
        return responses

    async def _call_llm(self, prompt: str, model: str) -> str:
        """Call the LLM API."""

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.deepseek_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.7,  # Allow some variance for basin analysis
                    "max_tokens": 1024
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def _embed_texts(self, texts: List[str]) -> np.ndarray:
        """Embed texts using Voyage AI."""

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.voyageai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {self.voyage_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": self.embedding_model,
                    "input": texts
                }
            )
            response.raise_for_status()
            data = response.json()

            embeddings = [item["embedding"] for item in data["data"]]
            return np.array(embeddings)

    def _cluster_embeddings(self, embeddings: np.ndarray) -> Dict[str, Any]:
        """Cluster embeddings to find basins."""

        n_samples = len(embeddings)

        if n_samples < 2:
            return {
                "n_clusters": 1,
                "labels": [0] * n_samples,
                "silhouette": 1.0,
                "centroid_distances": [0.0]
            }

        # Try HDBSCAN first if available (better for unknown cluster counts)
        if HDBSCAN_AVAILABLE and n_samples >= 5:
            clusterer = hdbscan.HDBSCAN(
                min_cluster_size=2,
                metric='cosine',
                cluster_selection_epsilon=0.1
            )
            labels = clusterer.fit_predict(embeddings)
            n_clusters = len(set(labels)) - (1 if -1 in labels else 0)

            # Handle noise points
            if n_clusters == 0:
                n_clusters = 1
                labels = [0] * n_samples
        else:
            # Fall back to K-means with elbow method
            best_k = self._find_optimal_k(embeddings)
            kmeans = KMeans(n_clusters=best_k, random_state=42, n_init=10)
            labels = kmeans.fit_predict(embeddings).tolist()
            n_clusters = best_k

        # Calculate silhouette score if more than 1 cluster
        if n_clusters > 1 and n_samples > n_clusters:
            try:
                sil_score = silhouette_score(embeddings, labels, metric='cosine')
            except:
                sil_score = 0.0
        else:
            sil_score = 1.0  # Perfect score for single cluster

        # Calculate centroid distances
        centroid_distances = self._calculate_centroid_distances(embeddings, labels)

        return {
            "n_clusters": n_clusters,
            "labels": labels if isinstance(labels, list) else labels.tolist(),
            "silhouette": float(sil_score),
            "centroid_distances": centroid_distances
        }

    def _find_optimal_k(self, embeddings: np.ndarray, max_k: int = 5) -> int:
        """Find optimal number of clusters using elbow method."""

        n_samples = len(embeddings)
        max_k = min(max_k, n_samples - 1)

        if max_k < 2:
            return 1

        inertias = []
        for k in range(1, max_k + 1):
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
            kmeans.fit(embeddings)
            inertias.append(kmeans.inertia_)

        # Find elbow (point of maximum curvature)
        if len(inertias) < 3:
            return 1

        # Simple elbow detection: find biggest drop
        drops = [inertias[i] - inertias[i+1] for i in range(len(inertias)-1)]

        # If first drop is biggest and significant, likely single cluster
        if drops[0] > 2 * drops[1] if len(drops) > 1 else True:
            return 1

        # Otherwise return k where drop becomes small
        for i, drop in enumerate(drops):
            if i > 0 and drop < drops[0] * 0.3:
                return i + 1

        return 2  # Default to 2 clusters

    def _calculate_centroid_distances(
        self,
        embeddings: np.ndarray,
        labels: List[int]
    ) -> List[float]:
        """Calculate average distance from each point to its cluster centroid."""

        unique_labels = set(labels)
        centroids = {}

        for label in unique_labels:
            if label == -1:  # Noise in HDBSCAN
                continue
            mask = np.array(labels) == label
            centroids[label] = embeddings[mask].mean(axis=0)

        distances = []
        for i, (emb, label) in enumerate(zip(embeddings, labels)):
            if label == -1:
                distances.append(1.0)  # Max distance for noise
            else:
                dist = 1 - cosine_similarity([emb], [centroids[label]])[0][0]
                distances.append(float(dist))

        return distances

    def _calculate_epsilon(self, embeddings: np.ndarray) -> float:
        """
        Calculate epsilon (output spread).

        Lower epsilon = more consistent outputs = higher confidence
        """
        if len(embeddings) < 2:
            return 0.0

        # Calculate centroid
        centroid = embeddings.mean(axis=0)

        # Calculate average cosine distance from centroid
        distances = []
        for emb in embeddings:
            sim = cosine_similarity([emb], [centroid])[0][0]
            dist = 1 - sim  # Convert similarity to distance
            distances.append(dist)

        return float(np.mean(distances))

    def _calculate_coherence(self, embeddings: np.ndarray) -> float:
        """
        Calculate coherence (semantic consistency).

        Higher coherence = more consistent outputs = higher confidence
        """
        if len(embeddings) < 2:
            return 1.0

        # Calculate pairwise similarities
        sim_matrix = cosine_similarity(embeddings)

        # Get upper triangle (excluding diagonal)
        n = len(embeddings)
        similarities = []
        for i in range(n):
            for j in range(i + 1, n):
                similarities.append(sim_matrix[i][j])

        return float(np.mean(similarities))

    def _determine_confidence(
        self,
        epsilon: float,
        n_basins: int,
        coherence: float,
        query_type: QueryType
    ) -> str:
        """Determine confidence level from metrics."""

        # Adjust thresholds based on query type
        if query_type == QueryType.FACTUAL:
            # Factual queries should have very low epsilon
            epsilon_high = 0.05
            epsilon_med = 0.15
        elif query_type == QueryType.COUNTERFACTUAL:
            # Counterfactual queries naturally have higher variance
            epsilon_high = 0.15
            epsilon_med = 0.30
        else:
            # Default thresholds
            epsilon_high = 0.10
            epsilon_med = 0.25

        # Score based on metrics
        score = 0

        if epsilon < epsilon_high:
            score += 2
        elif epsilon < epsilon_med:
            score += 1

        if n_basins == 1:
            score += 2
        elif n_basins == 2:
            score += 1

        if coherence > 0.85:
            score += 2
        elif coherence > 0.70:
            score += 1

        # Determine level
        if score >= 5:
            return "HIGH"
        elif score >= 3:
            return "MEDIUM"
        else:
            return "LOW"

    def _generate_interpretation(
        self,
        epsilon: float,
        n_basins: int,
        coherence: float,
        confidence_level: str,
        query_type: QueryType
    ) -> str:
        """Generate human-readable interpretation of results."""

        parts = []

        # Epsilon interpretation
        if epsilon < 0.05:
            parts.append("Output spread is very low, indicating highly consistent responses.")
        elif epsilon < 0.15:
            parts.append("Output spread is moderate, suggesting reasonable consistency.")
        else:
            parts.append("Output spread is high, indicating significant variance between responses.")

        # Basin interpretation
        if n_basins == 1:
            parts.append("All responses cluster into a single pattern, suggesting convergence on one answer.")
        elif n_basins == 2:
            parts.append(f"Responses split into {n_basins} distinct patterns, suggesting some ambiguity.")
        else:
            parts.append(f"Responses show {n_basins} distinct patterns, indicating high uncertainty or multiple valid interpretations.")

        # Query type context
        if query_type == QueryType.FACTUAL and confidence_level == "LOW":
            parts.append("Warning: Low confidence on a factual question may indicate the model lacks knowledge or the question is ambiguous.")
        elif query_type == QueryType.COUNTERFACTUAL and confidence_level == "HIGH":
            parts.append("Note: High confidence on a counterfactual question - results should still be treated as speculative.")

        return " ".join(parts)

    def _find_differences(self, text_a: str, text_b: str) -> List[str]:
        """Find key differences between two texts."""

        words_a = set(text_a.lower().split())
        words_b = set(text_b.lower().split())

        only_a = words_a - words_b
        only_b = words_b - words_a

        differences = []
        if only_a:
            key_words = [w for w in only_a if len(w) > 4][:3]
            if key_words:
                differences.append(f"First response uniquely mentions: {', '.join(key_words)}")

        if only_b:
            key_words = [w for w in only_b if len(w) > 4][:3]
            if key_words:
                differences.append(f"Second response uniquely mentions: {', '.join(key_words)}")

        return differences if differences else ["No major differences identified"]

    def _find_common_elements(self, text_a: str, text_b: str) -> List[str]:
        """Find common elements between two texts."""

        words_a = set(text_a.lower().split())
        words_b = set(text_b.lower().split())

        common = words_a & words_b

        # Filter to meaningful words
        meaningful = [w for w in common if len(w) > 4][:5]

        if meaningful:
            return [f"Both mention: {', '.join(meaningful)}"]
        return ["Common elements not clearly identifiable"]
