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

export const ErrorDisplay = ({ error, resetErrorBoundary }: { error?: Error; resetErrorBoundary?: () => void }) => (
  <div className="flex items-center justify-center bg-stone-50 px-4 py-6 sm:px-6 lg:px-8">
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <WarningIcon className="mx-auto h-16 w-16 text-red-600" />
        <h2 className="mt-4 text-2xl font-semibold text-stone-900">Something broke while loading this view.</h2>
        <p className="mt-2 text-sm text-stone-600">Check the details below, then try again.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
        <div className="px-4 py-5">
          <p className="mb-2 text-sm font-medium text-stone-700">Error details</p>
          <div className="overflow-auto rounded-xl bg-red-50 p-4">
            <p className="break-all font-mono text-sm text-red-800">{error?.message || 'Unknown error'}</p>
            {error?.stack && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-red-700">Stack trace</summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-red-900">{error.stack}</pre>
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
