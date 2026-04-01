import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch, apiMutate, apiUpload } from '@/lib/api';
import { getUserFriendlyMessage } from '@/lib/error-messages';
import { queryKeys } from '@/lib/query-keys';
import type { UploadedFile } from '@/types/api';
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
} from './ui/alert-dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

type Props = {
  parentType: 'course' | 'scenario';
  parentId: string;
};

const ACCEPT = '.pdf,.docx,.doc,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType === 'application/pdf') return 'PDF';
  if (
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword'
  )
    return 'DOCX';
  if (mimeType === 'text/csv') return 'CSV';
  if (mimeType === 'text/markdown') return 'Markdown';
  if (mimeType === 'text/plain') return 'Text';
  if (mimeType === 'application/json') return 'JSON';
  return 'File';
}

export function FileManager({ parentType, parentId }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const apiBase =
    parentType === 'course'
      ? `/api/admin/courses/${parentId}/files`
      : `/api/admin/scenarios/${parentId}/files`;

  const queryKey =
    parentType === 'course'
      ? queryKeys.courseFiles(parentId)
      : queryKeys.scenarioFiles(parentId);

  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => apiFetch<{ data: UploadedFile[] }>(apiBase),
  });

  const files = data?.data ?? [];

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiUpload<UploadedFile>(apiBase, formData);
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey });
      toast.success('File uploaded');
    },
    onError(err) {
      toast.error(getUserFriendlyMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      apiMutate(`/api/admin/files/${fileId}`, { method: 'DELETE' }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey });
      toast.success('File deleted');
    },
    onError(err) {
      toast.error(getUserFriendlyMessage(err));
    },
  });

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      uploadMutation.mutate(file);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Files</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Drop zone / file list */}
      <section
        aria-label="File drop zone"
        className={`rounded-md border-2 border-dashed transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25'
        } ${files.length === 0 ? 'py-8' : 'p-2'}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {isPending ? (
          <p className="text-center text-sm text-muted-foreground">
            Loading files...
          </p>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <FileUp className="h-6 w-6" />
            <p className="text-sm">Drop files here or click Upload</p>
            <p className="text-xs">Documents (max 50MB) and images (max 5MB)</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {file.originalName}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-xs">
                      {mimeLabel(file.mimeType)}
                    </Badge>
                    <span>{formatSize(file.sizeBytes)}</span>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      aria-label={`Delete ${file.originalName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete file?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove "{file.originalName}" from
                        the AI context. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(file.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
