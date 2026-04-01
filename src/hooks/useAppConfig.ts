import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

type AppConfig = {
  maxMessageChars: number;
  maxMessagesPerConversation: number;
  minMessagesToComplete: number;
};

const FALLBACK: AppConfig = {
  maxMessageChars: 5000,
  maxMessagesPerConversation: 100,
  minMessagesToComplete: 5,
};

export function useAppConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: queryKeys.appConfig,
    queryFn: () => apiFetch<AppConfig>('/api/config/app'),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return data ?? FALLBACK;
}
