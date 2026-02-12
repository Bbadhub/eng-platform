/**
 * Knowledge Sharing Analyzer
 * Analyzes team-memory.json contributions
 */

import fs from 'fs/promises';

export class KnowledgeAnalyzer {
  constructor(memoryPath) {
    this.memoryPath = memoryPath;
  }

  async analyze(engineerName, timeframe = 30) {
    const memory = await this.loadMemory();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeframe);

    // Filter observations by engineer and timeframe
    // Check both 'observer' (team-memory.json format) and 'author' (legacy format)
    const engineerObservations = memory.observations.filter(obs => {
      const obsDate = new Date(obs.observedAt || obs.timestamp);
      const obsAuthor = obs.observer || obs.author;
      return obsAuthor === engineerName && obsDate >= cutoffDate;
    });

    // Calculate metrics
    const orgContributions = engineerObservations.filter(o => o.scope === 'org').length;
    const projectContributions = engineerObservations.filter(o => o.scope !== 'org').length;

    const avgConfidence = engineerObservations.length > 0
      ? engineerObservations.reduce((sum, o) => sum + (o.classification?.confidence || 0.8), 0) / engineerObservations.length
      : 0;

    // Count how often their memories are referenced (simplified - count unique content matches)
    const memoryReferences = this.countReferences(engineerName, memory);

    // Count corrections (memories with low confidence or reclassified)
    const corrections = engineerObservations.filter(o =>
      (o.classification?.confidence || 1.0) < 0.6 ||
      o.classification?.method === 'corrected'
    ).length;

    // Calculate score (0-100)
    const score = Math.max(0, Math.min(100,
      (orgContributions * 10) +
      (projectContributions * 5) +
      (avgConfidence * 30) +
      (memoryReferences * 5) -
      (corrections * 3)
    ));

    return {
      score: Math.round(score),
      metrics: {
        org_contributions: orgContributions,
        project_contributions: projectContributions,
        total_contributions: engineerObservations.length,
        avg_confidence: Math.round(avgConfidence * 100) / 100,
        memory_references: memoryReferences,
        corrections_received: corrections
      },
      trending: this.calculateTrend(engineerName, memory, timeframe)
    };
  }

  async loadMemory() {
    try {
      const data = await fs.readFile(this.memoryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { observations: [], entities: {} };
    }
  }

  countReferences(engineerName, memory) {
    // Count how many times this engineer's content appears in other contexts
    // Simplified: count observations that mention their patterns
    const engineerContent = memory.observations
      .filter(o => (o.observer || o.author) === engineerName)
      .map(o => o.content.toLowerCase());

    let references = 0;
    for (const obs of memory.observations) {
      if ((obs.observer || obs.author) !== engineerName) {
        for (const content of engineerContent) {
          // Check if other observations reference this content (partial match)
          const contentWords = content.split(' ').filter(w => w.length > 4);
          const matchingWords = contentWords.filter(w =>
            obs.content.toLowerCase().includes(w)
          );
          if (matchingWords.length >= 2) {
            references++;
            break;
          }
        }
      }
    }

    return references;
  }

  calculateTrend(engineerName, memory, timeframe) {
    const now = new Date();
    const midpoint = new Date(now.getTime() - (timeframe * 24 * 60 * 60 * 1000) / 2);

    const recentObs = memory.observations.filter(o => {
      const obsDate = new Date(o.observedAt || o.timestamp);
      return (o.observer || o.author) === engineerName && obsDate >= midpoint;
    }).length;

    const olderObs = memory.observations.filter(o => {
      const obsDate = new Date(o.observedAt || o.timestamp);
      return (o.observer || o.author) === engineerName &&
             obsDate < midpoint &&
             obsDate >= new Date(now.getTime() - timeframe * 24 * 60 * 60 * 1000);
    }).length;

    if (olderObs === 0) return 'stable';
    const change = (recentObs - olderObs) / olderObs;

    if (change > 0.2) return 'improving';
    if (change < -0.2) return 'declining';
    return 'stable';
  }
}
