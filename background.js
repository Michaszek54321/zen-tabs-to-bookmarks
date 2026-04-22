
// ==========================
// STATE
// ==========================
let saveTimer = null;
let lastSave = 0;

const DEBOUNCE_MS = 5000;
const MIN_INTERVAL = 15000;
const ROOT_TITLE = "Latest Autosave";

// ==========================
// EVENTS
// ==========================
browser.tabs.onCreated.addListener(scheduleSave);
browser.tabs.onRemoved.addListener(scheduleSave);
browser.tabs.onUpdated.addListener(scheduleSave);

browser.browserAction.onClicked.addListener(saveSession);

// ==========================
// SCHEDULER
// ==========================
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    const now = Date.now();
    if (now - lastSave > MIN_INTERVAL) {
      saveSession();
      lastSave = now;
    }
  }, DEBOUNCE_MS);
}

// ==========================
// BOOKMARK HELPERS
// ==========================
async function getRootFolder() {
  const found = await browser.bookmarks.search({ title: ROOT_TITLE });

  for (const item of found) {
    if (!item.url) return item;
  }

  return browser.bookmarks.create({ title: ROOT_TITLE });
}

async function getOrCreateFolder(parentId, title) {
  const children = await browser.bookmarks.getChildren(parentId);

  for (const c of children) {
    if (c.title === title && !c.url) return c;
  }

  return browser.bookmarks.create({ title, parentId });
}

async function clearFolder(folderId) {
  const children = await browser.bookmarks.getChildren(folderId);
  for (const c of children) {
    await browser.bookmarks.removeTree(c.id);
  }
}

// ==========================
// ESSENTIALS (FIRST 3 PINNED)
// ==========================
function getEssentials(tabs) {
  const sorted = [...tabs].sort((a, b) => a.index - b.index);

  return new Set(
    sorted
      .filter(t => t.pinned && t.url && t.url.startsWith("http"))
      .slice(0, 3)
      .map(t => t.url)
  );
}

// ==========================
// MAIN SAVE
// ==========================
async function saveSession() {
  console.log("Autosave started");

  const root = await getRootFolder();
  const windows = await browser.windows.getAll({ populate: true });

  for (const win of windows) {
    await saveWindow(win, root.id);
  }

  console.log("Autosave finished");
}

// ==========================
// WINDOW HANDLER
// ==========================
async function saveWindow(win, rootId) {
  const windowFolder = await getOrCreateFolder(
    rootId,
    `Window ${win.id}`
  );

  await clearFolder(windowFolder.id);

  const ESSENTIALS = getEssentials(win.tabs);

  const sortedTabs = [...win.tabs].sort((a, b) => a.index - b.index);

  const groups = new Map();
  const ungrouped = [];

  for (const tab of sortedTabs) {
    if (!tab.url || !tab.url.startsWith("http")) continue;
    if (ESSENTIALS.has(tab.url)) continue;

    if (tab.groupId && tab.groupId !== -1) {
      if (!groups.has(tab.groupId)) {
        groups.set(tab.groupId, []);
      }
      groups.get(tab.groupId).push(tab);
    } else {
      ungrouped.push(tab);
    }
  }

  // ==========================
  // UNGROUPED (LUŹNO)
  // ==========================
  for (const tab of ungrouped) {
    await browser.bookmarks.create({
      title: tab.title || tab.url,
      url: tab.url,
      parentId: windowFolder.id
    });
  }

  // ==========================
  // GROUPS
  // ==========================
  let i = 1;

  for (const tabs of groups.values()) {
    const groupFolder = await browser.bookmarks.create({
      title: `Group ${i}`,
      parentId: windowFolder.id
    });

    for (const tab of tabs) {
      await browser.bookmarks.create({
        title: tab.title || tab.url,
        url: tab.url,
        parentId: groupFolder.id
      });
    }

    i++;
  }
}