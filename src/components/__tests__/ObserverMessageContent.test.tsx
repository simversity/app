import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { ObserverMessageContent } from '../ObserverMessageContent';

afterEach(cleanup);

describe('ObserverMessageContent', () => {
  test('renders plain text as markdown', () => {
    const { container } = render(
      <ObserverMessageContent content="Great job engaging the student." />,
    );
    expect(screen.getByText('Great job engaging the student.')).toBeDefined();
    // Renders inside a prose div with a <p>
    const prose = container.querySelector('.prose');
    expect(prose).toBeDefined();
    const p = prose?.querySelector('p');
    expect(p).toBeDefined();
    expect(p?.textContent).toBe('Great job engaging the student.');
  });

  test('renders structured sections when headings are present', () => {
    const content = [
      '### 1. Questioning Technique',
      'You asked a probing question.',
      '',
      '### 2. Suggestion',
      'Try asking the student to explain further.',
    ].join('\n');

    render(<ObserverMessageContent content={content} />);
    expect(screen.getByText('1. Questioning Technique')).toBeDefined();
    expect(screen.getByText('2. Suggestion')).toBeDefined();
    expect(screen.getByText('You asked a probing question.')).toBeDefined();
    expect(
      screen.getByText('Try asking the student to explain further.'),
    ).toBeDefined();
  });

  test('applies revision styling to suggestion headings', () => {
    const content = [
      '### Suggestion',
      'Consider rephrasing your response.',
    ].join('\n');

    const { container } = render(<ObserverMessageContent content={content} />);
    // Revision sections get a special callout with border-primary/20
    const callout = container.querySelector('.border-primary\\/20');
    expect(callout).toBeDefined();
    expect(callout?.textContent).toContain('Suggestion');
    expect(callout?.textContent).toContain(
      'Consider rephrasing your response.',
    );
  });

  test('renders bold inline formatting', () => {
    const content = [
      '### Feedback',
      'You showed **excellent** listening skills.',
    ].join('\n');

    const { container } = render(<ObserverMessageContent content={content} />);
    const strong = container.querySelector('strong');
    expect(strong).toBeDefined();
    expect(strong?.textContent).toBe('excellent');
  });

  test('renders blockquote for transcript references', () => {
    const content = [
      '### Analysis',
      '> Student said: I think photosynthesis happens at night.',
      '',
      'This reveals a common misconception.',
    ].join('\n');

    const { container } = render(<ObserverMessageContent content={content} />);
    const blockquote = container.querySelector('blockquote');
    expect(blockquote).toBeDefined();
    expect(blockquote?.textContent).toContain(
      'Student said: I think photosynthesis happens at night.',
    );
  });

  test('handles empty content gracefully', () => {
    const { container } = render(<ObserverMessageContent content="" />);
    // Empty content renders an empty prose div
    const prose = container.querySelector('.prose');
    expect(prose).toBeDefined();
  });

  test('renders multiple paragraphs separated by blank lines', () => {
    const content = [
      '### Observation',
      'First paragraph of feedback.',
      '',
      'Second paragraph with more detail.',
    ].join('\n');

    render(<ObserverMessageContent content={content} />);
    expect(screen.getByText('First paragraph of feedback.')).toBeDefined();
    expect(
      screen.getByText('Second paragraph with more detail.'),
    ).toBeDefined();
  });
});
