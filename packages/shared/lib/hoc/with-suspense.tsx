import { Suspense } from 'react';
import type { ComponentType, ReactElement } from 'react';

export const withSuspense = <T extends Record<string, unknown>>(
  Component: ComponentType<T>,
  SuspenseComponent: ReactElement,
) => {
  const WithSuspense = (props: T) => (
    <Suspense fallback={SuspenseComponent}>
      <Component {...props} />
    </Suspense>
  );
  /*
   * Without this every wrapped component shows up as `Anonymous` in React DevTools, which is
   * exactly the surface where you go looking for which one is suspended.
   */
  WithSuspense.displayName = `withSuspense(${Component.displayName || Component.name || 'Component'})`;
  return WithSuspense;
};
