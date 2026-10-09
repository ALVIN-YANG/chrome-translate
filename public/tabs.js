const isTranslationPage = (url, pageUrl) => typeof url === 'string' && url.split(/[?#]/u)[0] === pageUrl;

export function createTranslationTabOpener(api, pageUrl) {
  let pending = Promise.resolve();
  let createdId;
  return (clickedTab = {}) => {
    pending = pending.catch(() => {}).then(async () => {
      // runtime 只返回本扩展的页面，不需要读取其他网页或增加 tabs 权限。
      const contexts = await api.runtime.getContexts({ contextTypes: ['TAB'] });
      const pages = contexts.filter(context => isTranslationPage(context.documentUrl, pageUrl));
      let existing = pages.find(context => context.windowId === clickedTab.windowId) || pages[0];
      if (!existing && createdId !== undefined) {
        try {
          const tab = await api.tabs.get(createdId);
          if (isTranslationPage(tab.pendingUrl || tab.url, pageUrl)) existing = { tabId: tab.id, windowId: tab.windowId };
        } catch { createdId = undefined; }
      }
      if (existing) {
        let activated = false;
        try {
          await api.tabs.update(existing.tabId, { active: true });
          activated = true;
        } catch { /* 页面可能在查找后关闭，重新打开即可。 */ }
        if (activated) {
          await api.windows.update(existing.windowId, { focused: true }).catch(() => {});
          return existing.tabId;
        }
      }
      const tab = await api.tabs.create({ url: pageUrl });
      createdId = tab.id;
      return tab.id;
    });
    return pending;
  };
}
