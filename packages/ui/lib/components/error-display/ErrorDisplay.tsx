const WarningIcon = ({ className }: { className: string }) => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className={className}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

// `error` is `unknown` because that is what a throw actually gives you — react-error-boundary
// types it honestly, so narrow here instead of asserting an Error we may not have been handed.
export const ErrorDisplay = ({ error, resetErrorBoundary }: { error?: unknown; resetErrorBoundary?: () => void }) => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <div className="flex items-center justify-center bg-stone-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <WarningIcon className="mx-auto h-16 w-16 text-[var(--unshafted-danger-border)]" />
          <h2 className="mt-4 text-2xl font-semibold text-[var(--unshafted-text)]">
            Something broke while loading this view.
          </h2>
          <p className="mt-2 text-sm text-[var(--unshafted-text-muted)]">Check the details below, then try again.</p>
        </div>
        <div className="unshafted-danger-tone overflow-hidden rounded-2xl border shadow-xs">
          <div className="px-4 py-5">
            <p className="mb-2 text-sm font-medium text-[var(--unshafted-text-soft)]">Error details</p>
            <div className="overflow-auto rounded-xl bg-[var(--unshafted-selection-soft)] p-4">
              <p className="font-mono text-sm break-all text-[var(--unshafted-text)]">{message || 'Unknown error'}</p>
              {stack && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-[var(--unshafted-text-muted)]">Stack trace</summary>
                  <pre className="mt-2 overflow-auto text-xs whitespace-pre-wrap text-[var(--unshafted-text-muted)]">
                    {stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center">
          <button
            onClick={resetErrorBoundary}
            className="inline-flex items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700">
            Try again
          </button>
        </div>
      </div>
    </div>
  );
};
