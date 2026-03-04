export type ObserverSection = {
  heading: string | null;
  body: string;
  isRevision: boolean;
};

export function parseObserverSections(text: string): ObserverSection[] {
  const lines = text.split('\n');
  const sections: ObserverSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  let isRevision = false;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (currentLines.length > 0 || currentHeading) {
        sections.push({
          heading: currentHeading,
          body: currentLines.join('\n').trim(),
          isRevision,
        });
      }
      currentHeading = headingMatch[1];
      isRevision = /revision|suggestion|try this|next time|alternative/i.test(
        currentHeading,
      );
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Save last section
  if (currentLines.length > 0 || currentHeading) {
    sections.push({
      heading: currentHeading,
      body: currentLines.join('\n').trim(),
      isRevision,
    });
  }

  return sections;
}
