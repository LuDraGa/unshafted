/**
 * The settings form's relationship to stored settings.
 *
 * The form used to be re-seeded from `settings` by an effect. Two consequences, both fixed here and
 * both asserted below: an effect runs after the first render whatever its dependencies say, so the
 * `?provider=` deep link the popup opens for provider setup was overwritten before anyone could see
 * it; and any settings write re-seeded the whole form, so edits in progress were discarded.
 *
 * The module reads `window.location.search` at import time, so each test sets the URL and then
 * imports `Options` fresh.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@extension/unshafted-core';

const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openrouter',
  apiKey: 'or-key',
  quickModel: 'quick/model',
  deepModel: 'deep/model',
  openaiApiKey: 'oa-key',
  openaiQuickModel: 'oa-quick',
  openaiDeepModel: 'oa-deep',
  temperature: 0.2,
  monthlySoftLimit: 10,
  driveBackupEnabled: false,
} as AppSettings;

const settingsValue = { current: DEFAULT_SETTINGS };
const onboardingValue = {
  current: { currentStep: 'provider', dismissedAt: null, completedAt: null, seenResultGuidance: false },
};
const setSettings = vi.fn();

vi.mock('@src/Options.css', () => ({}));

vi.mock('@extension/shared', () => ({
  // The real hook suspends on its first read; these tests are about the form, not about suspense.
  useStorage: (storage: { __which: string }) =>
    storage.__which === 'settings' ? settingsValue.current : onboardingValue.current,
  withErrorBoundary: <T,>(component: T) => component,
  withSuspense: <T,>(component: T) => component,
}));

vi.mock('@extension/storage', () => ({
  unshaftedSettingsStorage: { __which: 'settings', set: (next: AppSettings) => setSettings(next) },
  unshaftedOnboardingStorage: { __which: 'onboarding', set: vi.fn() },
}));

vi.mock('@extension/ui', () => ({
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(' '),
  ErrorDisplay: () => null,
  LoadingSpinner: () => null,
  SpotlightTour: () => null,
}));

vi.mock('@extension/unshafted-core', () => ({
  APP_NAME: 'Unshafted',
  DEFAULT_DEEP_MODEL: 'default/deep',
  DEFAULT_QUICK_MODEL: 'default/quick',
  DEFAULT_OPENAI_DEEP_MODEL: 'default-oa-deep',
  DEFAULT_OPENAI_QUICK_MODEL: 'default-oa-quick',
  DEFAULT_TEMPERATURE: 0.1,
  OPENAI_API_KEYS_DOCS_URL: '#',
  OPENAI_API_KEYS_QUICKSTART_URL: '#',
  OPENAI_KEYS_URL: '#',
  OPENROUTER_API_KEYS_DOCS_URL: '#',
  OPENROUTER_KEYS_URL: '#',
  PRIVACY_POLICY_URL: '#',
  getActiveProviderConfig: () => ({ provider: 'openrouter', apiKey: '', model: '' }),
  getOnboardingKeyHash: async () => 'hash',
  testOpenRouterConnection: async () => 'model',
}));

/** Import fresh, so the module re-reads `window.location.search`. */
const mountOptions = async (search = '') => {
  window.history.replaceState({}, '', `/options/index.html${search}`);
  vi.resetModules();
  const { default: Options } = await import('@src/Options');
  const view = render(<Options />);
  // Flush the mount effects. The regression under test lived in exactly this gap.
  await act(async () => {});
  return { ...view, remount: () => view.rerender(<Options />) };
};

/**
 * Which provider the form is on, read the way a user reads it — the key field is labelled for the
 * selected provider and holds that provider's key.
 */
const shownProvider = () => (screen.queryByText('OpenAI API key') ? 'openai' : 'openrouter');
const keyField = () => screen.getByPlaceholderText(/^sk-/) as HTMLInputElement;

describe('settings form', () => {
  beforeEach(() => {
    settingsValue.current = DEFAULT_SETTINGS;
    setSettings.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('seeds every field from stored settings', async () => {
    await mountOptions();

    expect(shownProvider()).toBe('openrouter');
    expect(keyField().value).toBe('or-key');
  });

  it('honours the ?provider= deep link and keeps honouring it', async () => {
    await mountOptions('?onboarding=true&provider=openai');

    // The regression: an effect re-seeded `provider` from settings right after the first render,
    // so the popup's setup deep link survived exactly one frame. `mountOptions` flushes effects.
    expect(shownProvider()).toBe('openai');
    expect(keyField().value).toBe('oa-key');
  });

  it('ignores a ?provider= value that is not a provider', async () => {
    await mountOptions('?provider=not-a-provider');

    expect(shownProvider()).toBe('openrouter');
  });

  it('keeps an edit in progress when settings change underneath it', async () => {
    const { remount } = await mountOptions();

    await act(async () => {
      fireEvent.change(keyField(), { target: { value: 'sk-or-half-typ' } });
    });
    expect(keyField().value).toBe('sk-or-half-typ');

    /*
     * Something else writes settings. `quickModel` rather than `driveBackupEnabled` on purpose:
     * only fields the removed effect actually watched can demonstrate the difference, and the
     * property being held is "a write elsewhere does not discard my typing" whatever the field.
     */
    settingsValue.current = { ...DEFAULT_SETTINGS, quickModel: 'changed/elsewhere' };
    await act(async () => {
      remount();
    });

    // The old effect re-seeded the whole form on any settings write, discarding this.
    expect(keyField().value).toBe('sk-or-half-typ');
  });

  it('shows what was actually stored after a save', async () => {
    await mountOptions();

    await act(async () => {
      fireEvent.change(keyField(), { target: { value: '  sk-or-padded  ' } });
    });

    await act(async () => {
      screen.getByRole('button', { name: /save/i }).click();
    });

    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings.mock.calls[0]![0]).toMatchObject({ apiKey: 'sk-or-padded' });
    // Normalising used to be the one real job of the re-seeding effect; it happens in `save` now.
    expect(keyField().value).toBe('sk-or-padded');
  });
});
