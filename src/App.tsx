import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from 'next-themes';
import { router } from './lib/router';

export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
