let saveTimer = null;
let lastSave = 0;

const DEBOUNCE_MS = 5000;
const MIN_INTERVAL = 15000;
const ROOT_TITLE = "Latest Autosave";

browser.tabs.onCreated.addListener(scheduleSave);
browser.tabs.onRemoved.addListener(scheduleSave);
browser.tabs.onUpdated.addListener(scheduleSave);

browser.browserAction.onClicked.addListener(saveSession);

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

async function getRootFolder() {
  const existing = await browser.bookmarks.search({ title: ROOT_TITLE });

  for (const item of existing) {
    if (!item.url) return item;
  }

  return browser.bookmarks.create({ title: ROOT_TITLE });
}

async function clearFolder(folderId) {
  const children = await browser.bookmarks.getChildren(folderId);
  for (const child of children) {
    await browser.bookmarks.removeTree(child.id);
  }
}

async function saveSession() {
    console.log("Autosave started");

    const root = await getRootFolder();
    const windows = await browser.windows.getAll({ populate: true });

    for (const win of windows) {
        await updateWindow(win, root.id);
    }

    console.log("Autosave completed");
}

async function getOrCreateSubfolder(parentId, title) {
    const children = await browser.bookmarks.getChildren(parentId);

    for (const child of children) {
        if (child.title === title && !child.url) return child;
    }

    return browser.bookmarks.create({ title, parentId });
}

async function updateWindow(win, rootId) {
    const windowFolder = await getOrCreateSubfolder(
        rootId,
        `Window ${win.id}`
    );

    await clearFolder(windowFolder.id);

    // sortujemy taby dokładnie jak na ekranie
    const sortedTabs = [...win.tabs].sort((a, b) => a.index - b.index);

    const groups = new Map();
    const ungrouped = [];

    for (const tab of sortedTabs) {
        if (!tab.url || !tab.url.startsWith("http")) continue;

        if (tab.groupId && tab.groupId !== -1) {
        if (!groups.has(tab.groupId)) {
            groups.set(tab.groupId, []);
        }
        groups.get(tab.groupId).push(tab);
        } else {
        ungrouped.push(tab);
        }
    }

    // tworzymy grupy w KOLEJNOŚCI z paska kart
    let groupNumber = 1;

    for (const tabs of groups.values()) {
        const groupFolder = await browser.bookmarks.create({
        title: `Group ${groupNumber}`,
        parentId: windowFolder.id
        });

        for (const tab of tabs) {
        await browser.bookmarks.create({
            title: tab.title || tab.url,
            url: tab.url,
            parentId: groupFolder.id
        });
        }

        groupNumber++;
    }

    // ungrouped na końcu
    if (ungrouped.length > 0) {
        const ungroupedFolder = await browser.bookmarks.create({
        title: "Ungrouped Tabs",
        parentId: windowFolder.id
        });

        for (const tab of ungrouped) {
        await browser.bookmarks.create({
            title: tab.title || tab.url,
            url: tab.url,
            parentId: ungroupedFolder.id
        });
        }
    }
}