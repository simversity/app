import { describe, expect, test } from 'bun:test';
import { parseObserverSections } from '../observer-parser';

describe('parseObserverSections', () => {
  test('empty input returns single section with empty body', () => {
    expect(parseObserverSections('')).toEqual([
      { heading: null, body: '', isRevision: false },
    ]);
  });

  test('text with no headings returns single section with null heading', () => {
    const result = parseObserverSections('Just some feedback text.');
    expect(result).toEqual([
      { heading: null, body: 'Just some feedback text.', isRevision: false },
    ]);
  });

  test('multiple ## headings produce multiple sections', () => {
    const text = '## Strengths\nGood job.\n## Weaknesses\nNeeds work.';
    const result = parseObserverSections(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      heading: 'Strengths',
      body: 'Good job.',
      isRevision: false,
    });
    expect(result[1]).toEqual({
      heading: 'Weaknesses',
      body: 'Needs work.',
      isRevision: false,
    });
  });

  test('recognizes heading levels 1-4', () => {
    const text = '# H1\nBody1\n## H2\nBody2\n### H3\nBody3\n#### H4\nBody4';
    const result = parseObserverSections(text);
    expect(result).toHaveLength(4);
    expect(result.map((s) => s.heading)).toEqual(['H1', 'H2', 'H3', 'H4']);
  });

  test('does not recognize ##### as heading', () => {
    const text = '##### Not a heading\nBody text';
    const result = parseObserverSections(text);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBeNull();
    expect(result[0].body).toContain('##### Not a heading');
  });

  test('detects revision heading: "Suggestion"', () => {
    const result = parseObserverSections('## Suggestion\nTry this approach.');
    expect(result[0].isRevision).toBe(true);
  });

  test('detects revision heading: "Try this"', () => {
    const result = parseObserverSections('## Try this instead\nDo it.');
    expect(result[0].isRevision).toBe(true);
  });

  test('detects revision heading: "Next time"', () => {
    const result = parseObserverSections(
      '## Next time\nConsider a different approach.',
    );
    expect(result[0].isRevision).toBe(true);
  });

  test('detects revision heading: "Alternative"', () => {
    const result = parseObserverSections(
      '## Alternative approach\nYou could try...',
    );
    expect(result[0].isRevision).toBe(true);
  });

  test('detects revision heading: "Revision"', () => {
    const result = parseObserverSections(
      '## Revision\nHere is a revised version.',
    );
    expect(result[0].isRevision).toBe(true);
  });

  test('revision detection is case-insensitive', () => {
    const result = parseObserverSections('## SUGGESTION FOR IMPROVEMENT\nTry.');
    expect(result[0].isRevision).toBe(true);
  });

  test('non-revision headings are not marked', () => {
    const result = parseObserverSections('## Analysis\nGood discussion.');
    expect(result[0].isRevision).toBe(false);
  });

  test('consecutive headings with no body between them', () => {
    const text = '## First\n## Second\nSome body';
    const result = parseObserverSections(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      heading: 'First',
      body: '',
      isRevision: false,
    });
    expect(result[1]).toEqual({
      heading: 'Second',
      body: 'Some body',
      isRevision: false,
    });
  });

  test('trailing newlines are trimmed from body', () => {
    const text = '## Section\nBody text\n\n\n';
    const result = parseObserverSections(text);
    expect(result[0].body).toBe('Body text');
  });

  test('text before first heading becomes a null-heading section', () => {
    const text = 'Intro text\n## Section\nBody';
    const result = parseObserverSections(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      heading: null,
      body: 'Intro text',
      isRevision: false,
    });
    expect(result[1].heading).toBe('Section');
  });
});
