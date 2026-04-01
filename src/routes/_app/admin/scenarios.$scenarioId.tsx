import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { AgentListEditor, useAgentList } from '@/components/AgentListEditor';
import { AdminFormActions } from '@/components/admin/AdminFormActions';
import { AdminFormShell } from '@/components/admin/AdminFormShell';
import { MutationErrorAlert } from '@/components/admin/MutationErrorAlert';
import { FileManager } from '@/components/FileManager';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { useTypedSession } from '@/lib/auth-client';
import { queryKeys } from '@/lib/query-keys';
import { isAdmin } from '@/lib/utils';
import type { AdminScenario, ModelInfo, Persona } from '@/types/api';

const DEFAULT_MODEL_SENTINEL = '__default__';

export const Route = createFileRoute('/_app/admin/scenarios/$scenarioId')({
  component: ScenarioEditor,
});

function ScenarioEditor() {
  const { scenarioId } = Route.useParams();
  const { data: session } = useTypedSession();
  const role = session?.user?.role;
  const queryClient = useQueryClient();

  const {
    data: scenarioData,
    isPending: scenarioLoading,
    error: scenarioError,
  } = useQuery({
    queryKey: queryKeys.scenario(scenarioId),
    queryFn: () =>
      apiFetch<{ scenario: AdminScenario }>(
        `/api/admin/scenarios/${scenarioId}`,
      ),
    enabled: isAdmin(role),
  });
  const { data: personasData, isPending: personasLoading } = useQuery({
    queryKey: queryKeys.personas,
    queryFn: () => apiFetch<{ personas: Persona[] }>('/api/admin/personas'),
    enabled: isAdmin(role),
  });
  const { data: modelsData } = useQuery({
    queryKey: queryKeys.models,
    queryFn: () => apiFetch<{ models: ModelInfo[] }>('/api/models'),
    enabled: isAdmin(role),
  });

  const scenario = scenarioData?.scenario ?? null;
  const personas = personasData?.personas ?? [];
  const models = modelsData?.models ?? [];
  const loading = scenarioLoading || personasLoading;

  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedObserverModel, setSelectedObserverModel] = useState<
    string | null
  >(null);
  const [observerMode, setObserverMode] = useState<string>('panel');
  const { agents, setAgents, addAgent, removeAgent, updateAgent } =
    useAgentList();

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      apiMutate<{ scenario: AdminScenario }>(
        `/api/admin/scenarios/${scenarioId}`,
        { method: 'PATCH', body },
      ),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scenario(scenarioId),
      });
      if (scenario?.courseId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.courseScenarios(scenario.courseId),
        });
      }
    },
  });

  // Track whether we've already initialized from scenario data
  const initializedRef = useRef(false);

  usePageTitle('Edit Scenario');

  // Initialize agent list and model selections from fetched scenario data
  useEffect(() => {
    if (!scenario || initializedRef.current) return;
    initializedRef.current = true;
    setSelectedModel(scenario.model || null);
    setSelectedObserverModel(scenario.observerModel || null);
    setObserverMode(scenario.observerMode || 'panel');
    setAgents(
      (scenario.agents || []).map(
        (a: {
          personaId: string;
          openingMessage: string | null;
          maxResponseTokens?: number | null;
        }) => ({
          _key: crypto.randomUUID(),
          personaId: a.personaId,
          openingMessage: a.openingMessage || '',
          maxResponseTokens: a.maxResponseTokens ?? null,
        }),
      ),
    );
  }, [scenario, setAgents]);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!scenario) return;
    const form = new FormData(e.currentTarget);
    saveMutation.mutate({
      title: String(form.get('title') || ''),
      description: String(form.get('description') || ''),
      observerPrompt: String(form.get('observerPrompt') || '') || null,
      activityContext: String(form.get('activityContext') || '') || null,
      observerMode,
      model: selectedModel,
      observerModel: selectedObserverModel,
      agents: agents
        .filter((a) => a.personaId)
        .map((a, i) => ({
          personaId: a.personaId,
          openingMessage: a.openingMessage || undefined,
          sortOrder: i,
          maxResponseTokens: a.maxResponseTokens || null,
        })),
    });
  }

  return (
    <AdminFormShell
      title="Edit Scenario"
      backTo="/admin/courses/$courseId"
      backLabel="Back to course"
      backParams={{ courseId: scenario?.courseId ?? '' }}
      loading={loading}
      notFoundMessage={scenarioError?.message || 'Scenario not found'}
      dataLoaded={!!scenario}
    >
      <form onSubmit={handleSave} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={scenario?.title ?? ''}
            required
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={scenario?.description ?? ''}
            required
            rows={2}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="activityContext">Activity Context</Label>
          <Textarea
            id="activityContext"
            name="activityContext"
            defaultValue={scenario?.activityContext || ''}
            rows={2}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="observerPrompt">Observer Prompt</Label>
          <p className="text-xs text-muted-foreground">
            Custom observer system prompt. Leave empty for default.
          </p>
          <Textarea
            id="observerPrompt"
            name="observerPrompt"
            defaultValue={scenario?.observerPrompt || ''}
            rows={8}
            className="mt-1 font-mono text-sm"
          />
        </div>

        <div>
          <Label htmlFor="observerMode">Observer Mode</Label>
          <p className="text-xs text-muted-foreground">
            How the observer delivers feedback during conversations.
          </p>
          <Select value={observerMode} onValueChange={setObserverMode}>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="panel">Panel only (default)</SelectItem>
              <SelectItem value="inline">Inline nudges only</SelectItem>
              <SelectItem value="both">Panel + inline nudges</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Files */}
        <FileManager parentType="scenario" parentId={scenarioId} />

        {/* Model Selection */}
        <ModelSelector
          model={selectedModel}
          observerModel={selectedObserverModel}
          models={models}
          onChangeModel={setSelectedModel}
          onChangeObserverModel={setSelectedObserverModel}
        />

        <AgentListEditor
          agents={agents}
          personas={personas}
          onAdd={() => addAgent(personas)}
          onRemove={removeAgent}
          onUpdate={updateAgent}
        />

        <MutationErrorAlert error={saveMutation.error || scenarioError} />

        <AdminFormActions
          isPending={saveMutation.isPending}
          pendingLabel="Saving..."
          submitLabel="Save Changes"
        />
      </form>
    </AdminFormShell>
  );
}

function ModelSelector({
  model,
  observerModel,
  models,
  onChangeModel,
  onChangeObserverModel,
}: {
  model: string | null;
  observerModel: string | null;
  models: ModelInfo[];
  onChangeModel: (model: string | null) => void;
  onChangeObserverModel: (model: string | null) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="model">Student Model</Label>
        <p className="text-xs text-muted-foreground">
          AI model for the student agent.
        </p>
        <Select
          value={model || DEFAULT_MODEL_SENTINEL}
          onValueChange={(v) =>
            onChangeModel(v === DEFAULT_MODEL_SENTINEL ? null : v)
          }
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_MODEL_SENTINEL}>Default</SelectItem>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label} — {m.context} — {m.tier}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="observerModel">Observer Model</Label>
        <p className="text-xs text-muted-foreground">
          AI model for observer feedback.
        </p>
        <Select
          value={observerModel || DEFAULT_MODEL_SENTINEL}
          onValueChange={(v) =>
            onChangeObserverModel(v === DEFAULT_MODEL_SENTINEL ? null : v)
          }
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_MODEL_SENTINEL}>
              Same as student model
            </SelectItem>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label} — {m.context} — {m.tier}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
