import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AgentEntry, Persona } from '@/types/api';

export function useAgentList(initial: AgentEntry[] = []) {
  const [agents, setAgents] = useState<AgentEntry[]>(initial);

  function addAgent(personas: Persona[]) {
    if (personas.length === 0) return;
    setAgents((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        personaId: personas[0].id,
        openingMessage: '',
        maxResponseTokens: null,
      },
    ]);
  }

  function removeAgent(index: number) {
    setAgents((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAgent(
    index: number,
    field: keyof AgentEntry,
    value: string | number | null,
  ) {
    setAgents((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    );
  }

  return { agents, setAgents, addAgent, removeAgent, updateAgent };
}

export function AgentListEditor({
  agents,
  personas,
  onAdd,
  onRemove,
  onUpdate,
  emptyMessage = 'No personas assigned.',
}: {
  agents: AgentEntry[];
  personas: Persona[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (
    index: number,
    field: keyof AgentEntry,
    value: string | number | null,
  ) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Student Personas</span>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-3 w-3" />
          Add Persona
        </Button>
      </div>

      {agents.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {agents.map((agent, i) => (
            <div
              key={agent._key}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center gap-2">
                <Select
                  value={agent.personaId}
                  onValueChange={(v) => onUpdate(i, 'personaId', v)}
                >
                  <SelectTrigger
                    className="flex-1"
                    size="sm"
                    aria-label={`Select persona ${i + 1}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label="Remove persona"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                className="mt-2"
                placeholder="Opening message (optional)"
                aria-label={`Opening message for persona ${i + 1}`}
                value={agent.openingMessage}
                onChange={(e) => onUpdate(i, 'openingMessage', e.target.value)}
              />
              <div className="mt-2 flex items-center gap-2">
                <label
                  htmlFor={`maxTokens-${agent._key}`}
                  className="text-xs text-muted-foreground whitespace-nowrap"
                >
                  Max response tokens
                </label>
                <Input
                  id={`maxTokens-${agent._key}`}
                  type="number"
                  min={1}
                  max={4096}
                  className="w-24"
                  placeholder="Default"
                  value={agent.maxResponseTokens ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const parsed = val ? Number.parseInt(val, 10) : null;
                    const clamped =
                      parsed !== null && !Number.isNaN(parsed) && parsed < 1
                        ? 1
                        : parsed;
                    onUpdate(
                      i,
                      'maxResponseTokens',
                      Number.isNaN(clamped) ? null : clamped,
                    );
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
