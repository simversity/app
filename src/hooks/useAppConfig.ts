import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

type AppConfig = {
  maxMessageChars: number;
  minMessagesToComplete: number;
};

const FALLBACK: AppConfig = {
  maxMessageChars: 5000,
  minMessagesToComplete: 5,
};

export function useAppConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: ['config', 'app'],
    queryFn: () => apiFetch<AppConfig>('/api/config/app'),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return data ?? FALLBACK;
}
