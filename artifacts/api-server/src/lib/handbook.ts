import { logger } from "./logger";

const GOOGLE_DOC_ID = "1KF52xpcvrJBWA-LJbIZs4LGwWa-sW9IR5AeLjey4LgE";
const CACHE_TTL_MS = 60 * 1000;

export interface HandbookSection {
  heading: string;
  content: string;
}

interface HandbookCache {
  sections: HandbookSection[];
  documentTitle: string;
  fetchedAt: Date;
  rawText: string;
}

let cache: HandbookCache | null = null;

function parseDocIntoSections(text: string): HandbookSection[] {
  const lines = text.split("\n");
  const sections: HandbookSection[] = [];
  let currentHeading = "Introduction";
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isHeading =
      /^#{1,4}\s/.test(trimmed) ||
      /^[A-Z][A-Z\s&\-:,]{3,}$/.test(trimmed) ||
      (trimmed.length < 80 && trimmed.endsWith(":") && !trimmed.includes("."));

    if (isHeading && currentContent.length > 0) {
      sections.push({
        heading: currentHeading,
        content: currentContent.join("\n").trim(),
      });
      currentHeading = trimmed.replace(/^#{1,4}\s+/, "").replace(/:$/, "").trim();
      currentContent = [];
    } else if (isHeading) {
      currentHeading = trimmed.replace(/^#{1,4}\s+/, "").replace(/:$/, "").trim();
    } else {
      currentContent.push(trimmed);
    }
  }

  if (currentContent.length > 0) {
    sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
  }

  return sections.filter((s) => s.content.length > 20);
}

export async function fetchHandbook(): Promise<HandbookCache> {
  const exportUrl = `https://docs.google.com/document/d/${GOOGLE_DOC_ID}/export?format=txt`;
  const resp = await fetch(exportUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch handbook: ${resp.status} ${resp.statusText}`);
  }
  const text = await resp.text();
  const firstLine = text.split("\n").find((l) => l.trim().length > 0) ?? "Team Handbook";
  const documentTitle = firstLine.trim().slice(0, 100);

  const sections = parseDocIntoSections(text);
  logger.info({ sectionCount: sections.length }, "Handbook fetched and parsed");

  const result: HandbookCache = {
    sections,
    documentTitle,
    fetchedAt: new Date(),
    rawText: text,
  };
  cache = result;
  return result;
}

export async function getHandbook(): Promise<HandbookCache> {
  if (cache && Date.now() - cache.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cache;
  }
  return fetchHandbook();
}

export function getHandbookStatus() {
  if (!cache) {
    return { lastFetchedAt: null, sectionCount: 0, documentTitle: null, isLoaded: false };
  }
  return {
    lastFetchedAt: cache.fetchedAt.toISOString(),
    sectionCount: cache.sections.length,
    documentTitle: cache.documentTitle,
    isLoaded: true,
  };
}

export function findRelevantSections(
  sections: HandbookSection[],
  query: string,
  maxSections = 8
): HandbookSection[] {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/).filter((w) => w.length > 2);

  const scored = sections.map((section) => {
    const text = (section.heading + " " + section.content).toLowerCase();
    let score = 0;
    for (const word of words) {
      const count = (text.match(new RegExp(word, "g")) ?? []).length;
      score += count;
      if (section.heading.toLowerCase().includes(word)) score += 5;
    }
    return { section, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxSections).filter((s) => s.score > 0);

  if (top.length === 0) {
    return sections.slice(0, 4);
  }

  return top.map((s) => s.section);
}
