/**
 * Browser APIs the report page leans on and jsdom lacks. The observers are fakes the tests can
 * drive: each records what it observes, and `fire` delivers entries as the browser would.
 */
import { vi } from 'vitest';

type Entry = { target: Element; isIntersecting: boolean; boundingClientRect: { top: number } };

class FakeIntersectionObserver {
  static all: FakeIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  constructor(
    private readonly callback: (entries: Entry[]) => void,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeIntersectionObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    FakeIntersectionObserver.all = FakeIntersectionObserver.all.filter(o => o !== this);
  }
  fire(entries: Entry[]) {
    this.callback(entries.filter(e => this.targets.has(e.target)));
  }
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Deliver to every live observer watching the target. */
const intersect = (target: Element, isIntersecting: boolean, top = isIntersecting ? 100 : -100) => {
  for (const observer of [...FakeIntersectionObserver.all]) {
    if (observer.targets.has(target)) observer.fire([{ target, isIntersecting, boundingClientRect: { top } }]);
  }
};

// Drive is never reached from a test; the delete suite asserts it was asked.
vi.mock('@extension/supabase', () => ({ deleteFromDrive: vi.fn(async () => {}) }));

vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
// Suites that assert on these replace them; everywhere else they only need to exist.
Element.prototype.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};
window.matchMedia = (query: string) => ({ matches: false, media: query }) as MediaQueryList;
vi.stubGlobal('ResizeObserver', FakeResizeObserver);

export { FakeIntersectionObserver, intersect };
