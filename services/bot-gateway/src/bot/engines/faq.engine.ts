export interface FaqPair {
  keywords: string[];
  answer: string;
}

export interface EngineResult {
  answer: string;
  confidence: number;
}

export function matchFaq(
  text: string,
  pairs: FaqPair[],
  threshold = 0.6,
): EngineResult | null {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  let best: { answer: string; score: number } | null = null;

  for (const pair of pairs) {
    if (!pair.keywords?.length) continue;
    const hits = pair.keywords.filter(kw =>
      words.some(w => w.includes(kw.toLowerCase()) || kw.toLowerCase().includes(w)),
    ).length;
    const score = hits / pair.keywords.length;
    if (score >= threshold && (!best || score > best.score)) {
      best = { answer: pair.answer, score };
    }
  }

  return best ? { answer: best.answer, confidence: best.score } : null;
}
