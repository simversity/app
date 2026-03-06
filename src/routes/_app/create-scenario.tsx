import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle, Sparkles, Users } from 'lucide-react';
import { useRef } from 'react';
import { ChatBubble } from '@/components/ai-elements/chat-bubble';
import { ChatInputForm } from '@/components/ChatInputForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useScenarioBuilder } from '@/hooks/useScenarioBuilder';
import { queryKeys } from '@/lib/query-keys';

export const Route = createFileRoute('/_app/create-scenario')({
  component: CreateScenario,
});

function CreateScenario() {
  usePageTitle('Create Scenario');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    status,
    error,
    parsedScenario,
    isCreating,
    sendMessage,
    createScenario,
  } = useScenarioBuilder();

  const prevCountRef = useRef(0);
  if (messages.length !== prevCountRef.current) {
    prevCountRef.current = messages.length;
    // Schedule scroll after render
    queueMicrotask(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  }

  const handleCreate = async () => {
    const result = await createScenario();
    if (result) {
      queryClient.invalidateQueries({ queryKey: queryKeys.courses });
      navigate({
        to: '/courses/$courseId',
        params: { courseId: result.courseId },
      });
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col px-4">
      <div className="flex items-center gap-3 border-b py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: '/courses' })}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Create a Scenario</h1>
          <p className="text-xs text-muted-foreground">
            Describe what you want to practice and the AI will build it for you
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-lg bg-primary/10 p-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">
              Design your practice scenario
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Tell me what subject and topic you'd like to practice, and I'll
              create a realistic student persona for you to interact with.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {[
                'I want to practice addressing evolution misconceptions',
                "Help me create a physics student who struggles with Newton's third law",
                'I need a group of students for a chemistry lab scenario',
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={{
                ...msg,
                agentName:
                  msg.role === 'assistant' ? 'Scenario Builder' : undefined,
              }}
            />
          ))}

        </div>

        {parsedScenario && (
          <Card className="mt-6 border-primary/30 bg-primary/5">
            <CardContent className="py-5">
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <h3 className="font-semibold">
                    {parsedScenario.scenarioTitle}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {parsedScenario.scenarioDescription}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 font-medium">
                      {parsedScenario.subject}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {parsedScenario.students.length} student
                      {parsedScenario.students.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {parsedScenario.students.map((s) => (
                      <div
                        key={s.name}
                        className="rounded-md border bg-card p-3"
                      >
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {s.description}
                        </p>
                        <p className="mt-2 text-xs italic text-muted-foreground">
                          "{s.openingMessage}"
                        </p>
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={handleCreate}
                    disabled={isCreating}
                    className="mt-4"
                  >
                    {isCreating ? 'Creating...' : 'Create & Start Practicing'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mx-0 mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="border-t py-3">
        <ChatInputForm
          onSend={sendMessage}
          placeholder={
            messages.length === 0
              ? 'Describe what you want to practice...'
              : 'Type your response...'
          }
          disabled={status === 'streaming' || isCreating}
          isStreaming={status === 'streaming'}
          streamingLabel="Building your scenario..."
        />
      </div>
    </div>
  );
}
