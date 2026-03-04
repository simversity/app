import { Eye, EyeOff, Lightbulb, MoreVertical, RotateCcw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type ConversationHeaderActionsProps = {
  observerOpen: boolean;
  isStreaming: boolean;
  completing: boolean;
  canEnd: boolean;
  messagesRemaining: number;
  onToggleObserver: () => void;
  onEndConversation: () => void;
  onRestart: () => void;
};

export function ConversationHeaderActions({
  observerOpen,
  isStreaming,
  completing,
  canEnd,
  messagesRemaining,
  onToggleObserver,
  onEndConversation,
  onRestart,
}: ConversationHeaderActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleObserver}
            className={
              observerOpen
                ? 'border-observer/50 bg-observer/10 text-observer-foreground hover:bg-observer/20 hover:text-observer-foreground'
                : ''
            }
          >
            {observerOpen ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Observer</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {observerOpen
            ? 'Hide the observer panel'
            : 'Ask the observer for coaching feedback'}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  disabled={isStreaming || !canEnd || completing}
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {completing ? 'Completing...' : 'End Conversation'}
                  </span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>End this conversation?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The conversation will be marked as complete and you won't be
                    able to send more messages. You'll be taken to the observer
                    feedback view.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onEndConversation}>
                    End Conversation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {canEnd
            ? 'End the conversation and get observer feedback'
            : `Continue for ${messagesRemaining} more exchange${messagesRemaining === 1 ? '' : 's'} to receive feedback`}
        </TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>More options</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                disabled={isStreaming}
                className="text-destructive focus:text-destructive"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restart conversation
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restart this conversation?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will start a new conversation with the same scenario.
                  Your current conversation will be abandoned.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onRestart}>
                  Restart
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
