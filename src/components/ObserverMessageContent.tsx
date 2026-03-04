import { memo } from 'react';
import Markdown from 'react-markdown';
import {
  type ObserverSection as ParsedSection,
  parseObserverSections,
} from '@/lib/observer-parser';

/**
 * Renders observer feedback with structured formatting.
 * Parses markdown-like headings (### 1. Title) into visually distinct
 * sections with construct headings and callout boxes, then renders
 * body text via react-markdown.
 */
export const ObserverMessageContent = memo(function ObserverMessageContent({
  content,
}: {
  content: string;
}) {
  const sections = parseObserverSections(content);

  // If no sections detected, render as plain markdown
  if (sections.length === 1 && !sections[0].heading) {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <Markdown>{content}</Markdown>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section, i) => (
        <SectionBlock
          key={section.heading ?? `section-${i}`}
          section={section}
        />
      ))}
    </div>
  );
});

function SectionBlock({ section }: { section: ParsedSection }) {
  if (!section.heading && !section.body) return null;

  // Revision/suggestion sections get a special callout style
  if (section.isRevision) {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        {section.heading && (
          <p className="mb-2 text-sm font-semibold text-primary">
            {section.heading}
          </p>
        )}
        {section.body && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <Markdown>{section.body}</Markdown>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {section.heading && (
        <p className="mb-1.5 text-sm font-semibold text-foreground">
          {section.heading}
        </p>
      )}
      {section.body && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <Markdown>{section.body}</Markdown>
        </div>
      )}
    </div>
  );
}
