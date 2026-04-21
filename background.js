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
  await clearFolder(root.id);

  const windows = await browser.windows.getAll({ populate: true });

  for (const win of windows) {
    const windowFolder = await browser.bookmarks.create({
      title: `Window ${win.id}`,
      parentId: root.id
    });

    const groups = {};
    const ungrouped = [];

    for (const tab of win.tabs) {
      if (!tab.url || !tab.url.startsWith("http")) continue;

      const gid = tab.groupId;

      if (gid && gid !== -1) {
        if (!groups[gid]) {
          groups[gid] = {
            title: `Group ${gid}`,
            tabs: []
          };
        }

        groups[gid].tabs.push(tab);
      } else {
        ungrouped.push(tab);
      }
    }

    // GROUPS
    for (const group of Object.values(groups)) {
      const groupFolder = await browser.bookmarks.create({
        title: group.title,
        parentId: windowFolder.id
      });

      for (const tab of group.tabs) {
        await browser.bookmarks.create({
          title: tab.title || tab.url,
          url: tab.url,
          parentId: groupFolder.id
        });
      }
    }

    // UNGROUPED
    if (ungrouped.length > 0) {
      const otherFolder = await browser.bookmarks.create({
        title: "Ungrouped Tabs",
        parentId: windowFolder.id
      });

      for (const tab of ungrouped) {
        await browser.bookmarks.create({
          title: tab.title || tab.url,
          url: tab.url,
          parentId: otherFolder.id
        });
      }
    }
  }

  console.log("Autosave completed");
}