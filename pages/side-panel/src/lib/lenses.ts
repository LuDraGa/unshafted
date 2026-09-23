import type { AvailableAction, Exposure, RequiredDisclosure, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * The site read by the reader's concern, not by the document.
 *
 * A person on a site is not asking "what does the cookie policy say" — they are asking what
 * happens to their data, what else they gave up, and whether anything is on a clock. Every
 * document on the site answers a piece of each of those, so the panel reads ACROSS documents and
 * sorts by concern, the way the popup's quick analysis sorts one contract into Blockers, Asks,
 * Obligations and the rest. The documents themselves become one lens among the others.
 *
 * The split is measured, not guessed. Across the corpus (82 analyses, 37 sites) 410 of 682
 * exposures are `Data/Privacy`; the rest are disputes, payment, IP, termination, liability and a
 * short tail — which is why the two exposure lenses are "your data" and "everything else you gave
 * up", and not ten category tabs, most of them holding one row. 19 of 37 sites name at least one
 * window, which is why Windows is its own lens and appears only when there is one.
 *
 * Every item keeps the analysis it came from. Aggregating across documents does not make the
 * document stop being the real unit (D3): a finding from a changed document still has to say so,
 * and the reader still has to be able to tell the privacy policy's claim from the terms'.
 */

type Windowed = AvailableAction & { deadline: NonNullable<AvailableAction['deadline']> };

const SEVERITY_RANK: Record<Exposure['severity'], number> = { low: 0, medium: 1, high: 2 };

const isWindowed = (action: AvailableAction): action is Windowed =>
  action.deadline !== undefined && action.deadline.kind !== 'none';

type Collected<T> = { analysis: SitePolicyAnalysis; value: T; index: number };

/** `analyses` arrives worst document first, so document order is already the right tie-break. */
const collect = <T>(
  analyses: readonly SitePolicyAnalysis[],
  pick: (analysis: SitePolicyAnalysis) => readonly T[],
): Collected<T>[] => analyses.flatMap(analysis => pick(analysis).map((value, index) => ({ analysis, value, index })));

/**
 * Severity first, then the document order it arrived in. `Array.prototype.sort` is stable, so
 * within one severity the worst document's findings still lead.
 */
const bySeverity = (exposures: Collected<Exposure>[]) =>
  [...exposures].sort((a, b) => SEVERITY_RANK[b.value.severity] - SEVERITY_RANK[a.value.severity]);

const exposureItems = (exposures: Collected<Exposure>[]): LensItem[] =>
  bySeverity(exposures).map(({ analysis, value, index }) => ({
    kind: 'exposure',
    key: `${analysis.contentHash}:exposure:${index}`,
    analysis,
    exposure: value,
  }));

const topSeverity = (lens: Lens | undefined): number => {
  const first = lens?.items[0];
  return first?.kind === 'exposure' ? SEVERITY_RANK[first.exposure.severity] : -1;
};

export type LensId = 'windows' | 'data' | 'rights' | 'actions' | 'missing' | 'documents';

export type LensItem =
  | { kind: 'exposure'; key: string; analysis: SitePolicyAnalysis; exposure: Exposure }
  | { kind: 'window'; key: string; analysis: SitePolicyAnalysis; action: Windowed }
  | { kind: 'action'; key: string; analysis: SitePolicyAnalysis; action: AvailableAction }
  | { kind: 'missing'; key: string; analysis: SitePolicyAnalysis; disclosure: RequiredDisclosure }
  | { kind: 'document'; key: string; analysis: SitePolicyAnalysis };

export type Lens = {
  id: LensId;
  label: string;
  /** One sentence saying what the lens holds. It is the section heading the old eyebrows were. */
  intro: string;
  /**
   * Null means the lens shows no number at all, which is a decision rather than a missing value.
   * See `missing` below.
   */
  count: number | null;
  items: LensItem[];
};

export const buildLenses = (
  analyses: readonly SitePolicyAnalysis[],
  { readBy = 'unshafted' }: { readBy?: 'unshafted' | 'you' } = {},
): Lens[] => {
  const exposures = collect(analyses, analysis => analysis.exposures);
  const actions = collect(analyses, analysis => analysis.availableActions);
  const windows = actions.filter((entry): entry is Collected<Windowed> => isWindowed(entry.value));
  const plain = actions.filter(({ value }) => !isWindowed(value));
  const data = exposureItems(exposures.filter(({ value }) => value.category === 'Data/Privacy'));
  const rights = exposureItems(exposures.filter(({ value }) => value.category !== 'Data/Privacy'));
  const absent = collect(analyses, analysis =>
    analysis.requiredDisclosures.filter(disclosure => disclosure.status === 'absent'),
  );

  const lenses: Lens[] = [
    {
      id: 'windows',
      label: 'Windows',
      /*
       * D14, said once at the top of the lens rather than on every row. A window is a property of
       * the document and we have it; the reader's position against it is a property of their life
       * and we do not. Nothing in this lens may say a window is open.
       */
      intro:
        'Each window runs from an event the document names, and whether yours is open depends on your own circumstances, which we do not know.',
      count: windows.length,
      items: windows.map(({ analysis, value, index }) => ({
        kind: 'window',
        key: `${analysis.contentHash}:action:${index}`,
        analysis,
        action: value,
      })),
    },
    {
      id: 'data',
      label: 'Data',
      intro: 'What these documents let the site do with your data.',
      count: data.length,
      items: data,
    },
    {
      id: 'rights',
      label: 'Rights',
      intro:
        'What else you give up by agreeing — how disputes are settled, what you pay, what happens to your content and your account.',
      count: rights.length,
      items: rights,
    },
    {
      id: 'actions',
      label: 'Can do',
      intro: 'What you can still do about it. Anything on a clock is under Windows.',
      count: plain.length,
      items: plain.map(({ analysis, value, index }) => ({
        kind: 'action',
        key: `${analysis.contentHash}:action:${index}`,
        analysis,
        action: value,
      })),
    },
    {
      id: 'missing',
      label: 'Missing',
      /*
       * NO COUNT, on the same grounds browse has none. `requiredDisclosures` records what each
       * analysis found worth recording, not a systematic checklist, so a number here is a lower
       * bound dressed as a measurement — and the reader carries it from this site's panel to the
       * next one's, which is exactly the comparison between real companies the data cannot back.
       * Named findings are honest; a tally is not.
       */
      intro:
        'Disclosures the law expects and these documents do not make — the ones the analysis found, not a full checklist.',
      count: null,
      items: absent.map(({ analysis, value, index }) => ({
        kind: 'missing',
        key: `${analysis.contentHash}:missing:${index}`,
        analysis,
        disclosure: value,
      })),
    },
    {
      id: 'documents',
      label: 'Documents',
      intro: readBy === 'you' ? 'The documents you analysed.' : 'The documents these findings come from.',
      count: analyses.length,
      items: analyses.map(analysis => ({ kind: 'document', key: analysis.contentHash, analysis })),
    },
  ];

  return lenses.filter(lens => lens.items.length > 0);
};

/**
 * Which lens a reader lands on — and, because its first item opens on arrival, what they read
 * first. That is the old "one thing" (D10) exactly: a window if the site names one, otherwise the
 * highest-severity exposure. It is no longer a separate card; it is the first block of the lens
 * that holds it, already open.
 *
 * A window outranks any exposure, however severe, because it is the only finding that expires: an
 * arbitration opt-out a reader learns about too late was worth nothing, and a licence term they
 * learn about late is still true tomorrow. `kind: 'none'` is not a window — it describes timing
 * that is unbounded, and treating it as a clock would put "you can leave at any time" first.
 *
 * Between the two exposure lenses: the higher top severity wins, then the larger lens, then Data —
 * which is where 60% of the corpus's exposures live.
 */
export const pickInitialLens = (lenses: readonly Lens[]): LensId => {
  const find = (id: LensId) => lenses.find(lens => lens.id === id);

  if (find('windows')) return 'windows';

  const data = find('data');
  const rights = find('rights');
  if (data || rights) {
    const dataRank = topSeverity(data);
    const rightsRank = topSeverity(rights);
    if (rightsRank > dataRank) return 'rights';
    if (dataRank > rightsRank) return 'data';
    return (rights?.items.length ?? 0) > (data?.items.length ?? 0) ? 'rights' : 'data';
  }

  if (find('actions')) return 'actions';
  return 'documents';
};
