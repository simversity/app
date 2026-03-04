import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '../ai-elements/prompt-input';

afterEach(cleanup);

describe('PromptInput (ChatInputForm foundation)', () => {
  test('renders textarea with placeholder', () => {
    render(
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="Type your response..." />
        <PromptInputFooter>
          <span>Press Enter to send</span>
          <PromptInputSubmit status="ready" />
        </PromptInputFooter>
      </PromptInput>,
    );
    const textarea = screen.getByPlaceholderText('Type your response...');
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
  });

  test('renders submit button with aria-label', () => {
    render(
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea />
        <PromptInputFooter>
          <PromptInputSubmit status="ready" />
        </PromptInputFooter>
      </PromptInput>,
    );
    expect(screen.getByLabelText('Submit')).toBeInstanceOf(HTMLButtonElement);
  });

  test('submit button shows Stop label when streaming', () => {
    render(
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea />
        <PromptInputFooter>
          <PromptInputSubmit status="streaming" />
        </PromptInputFooter>
      </PromptInput>,
    );
    expect(screen.getByLabelText('Stop')).toBeInstanceOf(HTMLButtonElement);
  });

  test('textarea has correct name attribute for FormData', () => {
    const { container } = render(
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="Type here" />
        <PromptInputFooter>
          <PromptInputSubmit status="ready" />
        </PromptInputFooter>
      </PromptInput>,
    );
    const textarea = container.querySelector('textarea');
    expect(textarea?.getAttribute('name')).toBe('message');
  });

  test('form wraps all children', () => {
    const { container } = render(
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="Type here" />
        <PromptInputFooter>
          <PromptInputSubmit status="ready" />
        </PromptInputFooter>
      </PromptInput>,
    );
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form?.querySelector('textarea')).not.toBeNull();
    expect(form?.querySelector('button[type="submit"]')).not.toBeNull();
  });

  test('calls onSubmit when textarea has input', async () => {
    // Bun's native FormData cannot read happy-dom form elements.
    // Patch it for this test so new FormData(form) picks up textarea values.
    const OrigFD = globalThis.FormData;
    globalThis.FormData = class PatchedFormData extends OrigFD {
      constructor(form?: HTMLFormElement) {
        super();
        if (form) {
          for (const el of form.querySelectorAll<
            HTMLTextAreaElement | HTMLInputElement
          >('[name]')) {
            if (el.name) this.set(el.name, el.value);
          }
        }
      }
    } as typeof FormData;

    try {
      const onSubmit = mock(() => {});
      render(
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea placeholder="Type here" />
          <PromptInputFooter>
            <PromptInputSubmit status="ready" />
          </PromptInputFooter>
        </PromptInput>,
      );
      const textarea = screen.getByPlaceholderText(
        'Type here',
      ) as HTMLTextAreaElement;
      textarea.value = 'Hello world';
      const form = textarea.closest('form');
      if (form) fireEvent.submit(form);
      // Flush the async submit handler
      await Promise.resolve();
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({ text: 'Hello world' });
    } finally {
      globalThis.FormData = OrigFD;
    }
  });

  test('does not call onSubmit when textarea is empty', () => {
    const onSubmit = mock(() => {});
    const { container } = render(
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea placeholder="Type here" />
        <PromptInputFooter>
          <PromptInputSubmit status="ready" />
        </PromptInputFooter>
      </PromptInput>,
    );
    const form = container.querySelector('form');
    if (form) fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('textarea respects disabled prop', () => {
    render(
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="Type here" disabled />
        <PromptInputFooter>
          <PromptInputSubmit status="ready" />
        </PromptInputFooter>
      </PromptInput>,
    );
    const textarea = screen.getByPlaceholderText('Type here');
    expect((textarea as HTMLTextAreaElement).disabled).toBe(true);
  });

  test('textarea respects maxLength prop', () => {
    render(
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="Type here" maxLength={100} />
        <PromptInputFooter>
          <PromptInputSubmit status="ready" />
        </PromptInputFooter>
      </PromptInput>,
    );
    const textarea = screen.getByPlaceholderText('Type here');
    expect((textarea as HTMLTextAreaElement).maxLength).toBe(100);
  });

  test('footer content is rendered', () => {
    render(
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea />
        <PromptInputFooter>
          <span>Press Enter to send</span>
          <PromptInputSubmit status="ready" />
        </PromptInputFooter>
      </PromptInput>,
    );
    expect(screen.getByText('Press Enter to send')).toBeInstanceOf(HTMLElement);
  });

  test('calls onStop when clicking submit during streaming', () => {
    const onStop = mock(() => {});
    render(
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea />
        <PromptInputFooter>
          <PromptInputSubmit status="streaming" onStop={onStop} />
        </PromptInputFooter>
      </PromptInput>,
    );
    fireEvent.click(screen.getByLabelText('Stop'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
