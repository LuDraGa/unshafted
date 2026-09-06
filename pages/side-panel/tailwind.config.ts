import { withUI } from '@extension/ui';

export default withUI({
  /*
   * `.ts` is in here, not just `.tsx`, because the risk and severity tone maps live in
   * `src/lib/presentation.ts`. Tailwind only emits classes it can see as literal strings, and a
   * purged `bg-rose-50` fails silently — the panel renders with no risk colour at all.
   */
  content: ['index.html', 'src/**/*.{ts,tsx}'],
});
