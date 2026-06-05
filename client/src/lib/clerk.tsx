import { ClerkProvider } from '@clerk/clerk-react';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

export function VoltClerkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!CLERK_KEY) {
    // Clerk not configured — render children without auth.
    // This lets the app work in local dev without Clerk keys.
    return <>{children}</>;
  }
  return <ClerkProvider publishableKey={CLERK_KEY}>{children}</ClerkProvider>;
}
