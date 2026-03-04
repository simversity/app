import { useEffect } from 'react';
import { APP_NAME } from '@/lib/constants';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title === APP_NAME ? APP_NAME : `${title} — ${APP_NAME}`;
  }, [title]);
}
