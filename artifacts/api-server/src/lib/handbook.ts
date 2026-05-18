import { ReplitConnectors } from "@replit/connectors-sdk";
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

function extractTextFromGoogleDoc(doc: any): string {
  const lines: string[] = [];

  if (doc.title) {
    lines.push(doc.title);
    lines.push("");
  }

  const body = doc.body?.content ?? [];
  for (const element of body) {
    if (element.paragraph) {
      const para = element.paragraph;
      const style = para.paragraphStyle?.namedStyleType ?? "";
      const text = (para.elements ?? [])
        .map((e: any) => e.textRun?.content ?? "")
        .join("")
        .trimEnd();

      if (!text.trim()) {
        lines.push("");
        continue;
      }

      if (style.startsWith("HEADING_")) {
        lines.push(text);
      } else {
        lines.push(text);
      }
    } else if (element.table) {
      for (const row of element.table.tableRows ?? []) {
        const cells = (row.tableCells ?? []).map((cell: any) =>
          (cell.content ?? [])
            .flatMap((c: any) =>
              (c.paragraph?.elements ?? []).map((e: any) => e.textRun?.content ?? "")
            )
            .join("")
            .trim()
        );
        lines.push(cells.join(" | "));
      }
    }
  }

  return lines.join("\n");
}

export async function fetchHandbook(): Promise<HandbookCache> {
  const connectors = new ReplitConnectors();

  const response = await connectors.proxy(
    "google-docs",
    `/v1/documents/${GOOGLE_DOC_ID}`,
    { method: "GET" }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to fetch handbook: ${response.status} ${body}`);
  }

  const doc = (await response.json()) as { title?: string };
  const rawText = extractTextFromGoogleDoc(doc);
  const documentTitle = (doc.title ?? "Team Handbook").slice(0, 100);
  const sections = parseDocIntoSections(rawText);

  logger.info({ sectionCount: sections.length, documentTitle }, "Handbook fetched via Google Docs API");

  const result: HandbookCache = {
    sections,
    documentTitle,
    fetchedAt: new Date(),
    rawText,
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
