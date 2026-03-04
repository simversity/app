import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AgentEntry, Persona } from '@/types/api';
import { AgentListEditor } from '../AgentListEditor';

afterEach(cleanup);

const personas: Persona[] = [
  {
    id: 'p1',
    name: 'Confused Student',
    description: 'Has misconceptions about photosynthesis',
  },
  {
    id: 'p2',
    name: 'Quiet Student',
    description: 'Rarely participates in class',
  },
];

function makeAgent(overrides: Partial<AgentEntry> = {}): AgentEntry {
  return {
    _key: crypto.randomUUID(),
    personaId: 'p1',
    openingMessage: '',
    maxResponseTokens: null,
    ...overrides,
  };
}

type EditorProps = Parameters<typeof AgentListEditor>[0];

const defaultProps: EditorProps = {
  agents: [],
  personas,
  onAdd: mock(() => {}),
  onRemove: mock(() => {}),
  onUpdate: mock(() => {}),
};

function renderEditor(overrides: Partial<EditorProps> = {}) {
  return render(<AgentListEditor {...defaultProps} {...overrides} />);
}

describe('AgentListEditor', () => {
  test('renders Student Personas heading', () => {
    renderEditor();
    expect(screen.getByText('Student Personas')).toBeDefined();
  });

  test('shows empty message when no agents', () => {
    renderEditor();
    expect(screen.getByText('No personas assigned.')).toBeDefined();
  });

  test('shows custom empty message', () => {
    renderEditor({ emptyMessage: 'Add a student to begin.' });
    expect(screen.getByText('Add a student to begin.')).toBeDefined();
  });

  test('renders agent entries with persona select triggers', () => {
    const agents = [
      makeAgent({ personaId: 'p1' }),
      makeAgent({ personaId: 'p2' }),
    ];
    renderEditor({ agents });
    // Should render two persona select triggers
    expect(screen.getByLabelText('Select persona 1')).toBeDefined();
    expect(screen.getByLabelText('Select persona 2')).toBeDefined();
  });

  test('renders opening message input for each agent', () => {
    const agents = [makeAgent()];
    renderEditor({ agents });
    expect(
      screen.getByLabelText('Opening message for persona 1'),
    ).toBeDefined();
  });

  test('Add button calls onAdd when clicked', () => {
    const onAdd = mock(() => {});
    renderEditor({ onAdd });
    const addButton = screen.getByText('Add Persona');
    fireEvent.click(addButton);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test('Remove button calls onRemove with correct index', () => {
    const onRemove = mock(() => {});
    const agents = [makeAgent(), makeAgent()];
    renderEditor({ agents, onRemove });
    const removeButtons = screen.getAllByLabelText('Remove persona');
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[1]);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  test('hides empty message when agents exist', () => {
    const agents = [makeAgent()];
    renderEditor({ agents });
    expect(screen.queryByText('No personas assigned.')).toBeNull();
  });

  test('renders max response tokens input for each agent', () => {
    const agents = [makeAgent()];
    renderEditor({ agents });
    expect(screen.getByText('Max response tokens')).toBeDefined();
  });

  test('calls onUpdate when opening message changes', () => {
    const onUpdate = mock(() => {});
    const agents = [makeAgent()];
    renderEditor({ agents, onUpdate });
    const input = screen.getByLabelText('Opening message for persona 1');
    fireEvent.change(input, { target: { value: 'Hello class!' } });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(0, 'openingMessage', 'Hello class!');
  });
});
