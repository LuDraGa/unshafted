/**
 * Proves the React test harness itself, not a component.
 *
 * Every other suite in the workspace runs under `node --import tsx --test` against pure modules.
 * These packages need a DOM and a renderer, so they run under vitest instead — and this file is
 * what fails, loudly and in one place, if that chain breaks: the jsdom environment, the RTL
 * renderer, the jest-dom matchers, and the root `vitest.setup.ts` the config reaches by relative
 * path. Without it a setup-file typo would surface as a confusing failure inside whichever real
 * suite happened to run first.
 *
 * `LoadingSpinner` is the subject only because it is the smallest real component in the workspace.
 * It is queried through the rendered container rather than a `data-testid`, so proving the harness
 * costs the shipped component nothing.
 */
import { LoadingSpinner } from '../lib/components/LoadingSpinner';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('React test harness', () => {
  it('renders a component into a DOM', () => {
    const { container } = render(<LoadingSpinner size={24} />);

    const spinner = container.querySelector('.animate-spin');
    // `toBeInTheDocument` comes from jest-dom, so asserting with it also proves the setup file ran.
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveStyle({ width: '24px', height: '24px' });
  });

  it('cleans the DOM between tests', () => {
    // Nothing rendered in this test. If the shared `afterEach` cleanup were missing, the previous
    // test's tree would still be mounted here.
    expect(document.body).toBeEmptyDOMElement();
  });
});
