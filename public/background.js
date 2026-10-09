import { createTranslationTabOpener } from './tabs.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
});

const openTranslationPage = createTranslationTabOpener(chrome, chrome.runtime.getURL('index.html'));
chrome.action.onClicked.addListener(tab => { openTranslationPage(tab).catch(() => {}); });
