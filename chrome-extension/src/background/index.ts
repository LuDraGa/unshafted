import 'webextension-polyfill';
import { pendingActionStorage, usageSnapshotStorage } from '@extension/storage';

const syncUsage = () => {
  void usageSnapshotStorage.syncMonth();
};

chrome.runtime.onInstalled.addListener(() => {
  syncUsage();
  void pendingActionStorage.set({ type: 'none' });
});

chrome.runtime.onStartup.addListener(() => {
  syncUsage();
});

console.info('[Unshafted] background worker ready');
