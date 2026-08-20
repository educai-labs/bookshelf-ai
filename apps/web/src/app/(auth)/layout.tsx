import type { ReactNode } from "react";

/**
 * Layout público del route group `(auth)`: sin sidebar/header,
 * centrado vertical para formularios de login/register.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
