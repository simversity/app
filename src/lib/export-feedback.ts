import type { ChatMessage } from '@/hooks/useStreamingChat';

type ExportParams = {
  scenarioTitle: string;
  studentName: string;
  date: string;
  conversationMessages: ChatMessage[];
  observerMessages: ChatMessage[];
};

export function generateFeedbackMarkdown(params: ExportParams): string {
  const {
    scenarioTitle,
    studentName,
    date,
    conversationMessages,
    observerMessages,
  } = params;

  const parsed = new Date(date);
  const formattedDate = Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

  const lines: string[] = [
    `# Observer Feedback: ${scenarioTitle}`,
    '',
    `**Date**: ${formattedDate}`,
    `**Student**: ${studentName}`,
    '',
    '## Conversation Transcript',
    '',
  ];

  for (const msg of conversationMessages) {
    if (msg.role === 'nudge') continue;
    const speaker =
      msg.role === 'user'
        ? '**Teacher**'
        : `**${msg.agentName ?? studentName}**`;
    lines.push(`${speaker}: ${msg.content}`, '');
  }

  lines.push('## Observer Feedback', '');

  for (const msg of observerMessages) {
    const speaker = msg.role === 'user' ? '**Teacher**' : '**Observer**';
    lines.push(`${speaker}: ${msg.content}`, '');
  }

  return lines.join('\n');
}

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
