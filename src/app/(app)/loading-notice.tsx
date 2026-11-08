/** Shown while a signed-in page checks the session. */
export function LoadingNotice({ children }: { children: string }) {
  return (
    <p role="status" aria-busy="true" className="text-muted">
      {children}
    </p>
  );
}
