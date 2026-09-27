/**
 * Opening the full report in its own tab (plan §7, "Opening it"), from the *Open full report*
 * button and from a detailed report in History.
 *
 * One tab per report: if one already shows this report, it and its window come forward instead of
 * a second one opening. `tabs` is already declared, so reading tab URLs costs no new permission. A
 * double click is caught before either click reaches Chrome, because the first `create` has not
 * resolved when the second click looks for an existing tab.
 */

/** The report page for a history record. The id is only ever a lookup key into local history. */
const reportUrl = (historyId: string): string =>
  chrome.runtime.getURL(`report/index.html?${new URLSearchParams({ id: historyId }).toString()}`);

const showsReport = (url: string | undefined, historyId: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.href.startsWith(chrome.runtime.getURL('report/index.html')) && parsed.searchParams.get('id') === historyId
    );
  } catch {
    return false;
  }
};

const inFlight = new Map<string, Promise<void>>();

const open = async (historyId: string) => {
  const url = reportUrl(historyId);
  try {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find(tab => showsReport(tab.url, historyId));
    if (existing?.id !== undefined) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
      return;
    }
    await chrome.tabs.create({ url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

const openReportTab = (historyId: string): Promise<void> => {
  const pending = inFlight.get(historyId);
  if (pending) return pending;
  const opening = open(historyId).finally(() => inFlight.delete(historyId));
  inFlight.set(historyId, opening);
  return opening;
};

export { openReportTab, reportUrl };
