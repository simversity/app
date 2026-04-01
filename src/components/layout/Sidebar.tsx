import { Link, useLocation, useMatchRoute } from '@tanstack/react-router';
import {
  BookOpen,
  History,
  LayoutDashboard,
  Moon,
  Settings,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTypedSession } from '@/lib/auth-client';
import { APP_NAME } from '@/lib/constants';
import { isAdmin as checkAdmin, cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/courses' as const, label: 'Courses', icon: BookOpen },
  { to: '/conversations' as const, label: 'History', icon: History },
  { to: '/profile' as const, label: 'Profile', icon: User },
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const matchRoute = useMatchRoute();
  const location = useLocation();
  const { data: session } = useTypedSession();
  const role = session?.user?.role;
  const isAdminUser = checkAdmin(role);

  // Don't highlight "Courses" when the user is deep in a conversation view
  const inConversation = location.pathname.includes('/conversation/');

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar-background transition-transform duration-200 motion-reduce:transition-none lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-sidebar-foreground"
          >
            <img
              src="/favicon.png"
              alt={APP_NAME}
              className="h-7 w-auto"
              width={28}
              height={28}
            />
            {APP_NAME}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close sidebar"
            className="text-sidebar-foreground/60 hover:bg-sidebar-accent lg:hidden"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav
          aria-label="Main navigation"
          className="flex-1 space-y-1 px-3 py-4"
        >
          {navItems.map((item) => {
            const fuzzyMatch = matchRoute({ to: item.to, fuzzy: true });
            const isActive =
              fuzzyMatch && !(item.to === '/courses' && inConversation);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {isAdminUser && (
            <>
              <div className="my-3 border-t border-sidebar-border" />
              <Link
                to="/admin"
                onClick={onClose}
                aria-current={
                  matchRoute({ to: '/admin', fuzzy: true }) ? 'page' : undefined
                }
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  matchRoute({ to: '/admin', fuzzy: true })
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                )}
              >
                <Settings className="h-4 w-4" />
                Admin
              </Link>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-sidebar-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Practice makes progress
          </p>
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      className="text-sidebar-foreground/60 hover:bg-sidebar-accent"
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
