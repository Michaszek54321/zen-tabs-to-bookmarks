// ==============================
// CONFIG
// ==============================
const ROOT_TITLE = "Latest Autosave";
const DEBOUNCE_MS = 5000;
const MIN_INTERVAL_MS = 15000;

let saveTimer = null;
let lastSaveTime = 0;

// ==============================
// EVENTS (autosave)
// ==============================
browser.tabs.onCreated.addListener(scheduleSave);
browser.tabs.onRemoved.addListener(scheduleSave);
browser.tabs.onUpdated.addListener(scheduleSave);
browser.browserAction.onClicked.addListener(saveSession);

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    const now = Date.now();
    if (now - lastSaveTime > MIN_INTERVAL_MS) {
      saveSession();
      lastSaveTime = now;
    }
  }, DEBOUNCE_MS);
}

// ==============================
// BOOKMARK HELPERS
// ==============================
async function getRootFolder() {
  const found = await browser.bookmarks.search({ title: ROOT_TITLE });

  for (const f of found) {
    if (!f.url) return f;
  }

  return browser.bookmarks.create({ title: ROOT_TITLE });
}

async function clearFolder(folderId) {
  const children = await browser.bookmarks.getChildren(folderId);
  for (const c of children) {
    await browser.bookmarks.removeTree(c.id);
  }
}

// ==============================
// ESSENTIALS = FIRST 3 PINNED
// ==============================
function getEssentialUrls(tabs) {
  const sorted = [...tabs].sort((a, b) => a.index - b.index);

  return new Set(
    sorted
      .filter(t => t.pinned && t.url && t.url.startsWith("http"))
      .slice(0, 3)
      .map(t => t.url)
  );
}

// ==============================
// WINDOW SIGNATURE (STABLE)
// ==============================
function getWindowSignature(tabs, essentialUrls) {
  const domains = new Set();
  let count = 0;

  for (const t of tabs) {
    if (!t.url || !t.url.startsWith("http")) continue;
    if (essentialUrls.has(t.url)) continue;

    const url = new URL(t.url);
    domains.add(url.hostname);
    count++;
  }

  return JSON.stringify({
    d: [...domains].sort(),
    c: count
  });
}

// ==============================
// FIND / CREATE WINDOW FOLDER
// ==============================
async function findWindowFolder(rootId, signature) {
  const children = await browser.bookmarks.getChildren(rootId);

  for (const c of children) {
    if (c.url) continue;

    const match = c.title.match(/\[(.*)\]/);
    if (!match) continue;

    if (match[1] === signature) {
      return c;
    }
  }

  return null;
}

async function getWindowFolder(rootId, signature) {
  let folder = await findWindowFolder(rootId, signature);

  if (!folder) {
    folder = await browser.bookmarks.create({
      title: `Window [${signature}]`,
      parentId: rootId
    });
  }

  return folder;
}

// ==============================
// MAIN SAVE
// ==============================
async function saveSession() {
  console.log("Autosave start");

  const root = await getRootFolder();
  const windows = await browser.windows.getAll({ populate: true });

  for (const win of windows) {
    await saveWindow(win, root.id);
  }

  console.log("Autosave done");
}

// ==============================
// SAVE SINGLE WINDOW (SPACE)
// ==============================
async function saveWindow(win, rootId) {
  const essentials = getEssentialUrls(win.tabs);
  const signature = getWindowSignature(win.tabs, essentials);

  const windowFolder = await getWindowFolder(rootId, signature);

  await clearFolder(windowFolder.id);

  const sortedTabs = [...win.tabs].sort((a, b) => a.index - b.index);

  const groups = new Map();
  const ungrouped = [];

  for (const tab of sortedTabs) {
    if (!tab.url || !tab.url.startsWith("http")) continue;
    if (essentials.has(tab.url)) continue;

    if (tab.groupId && tab.groupId !== -1) {
      if (!groups.has(tab.groupId)) {
        groups.set(tab.groupId, []);
      }
      groups.get(tab.groupId).push(tab);
    } else {
      ungrouped.push(tab);
    }
  }

  // Ungrouped jako luźne zakładki
  for (const tab of ungrouped) {
    await browser.bookmarks.create({
      title: tab.title || tab.url,
      url: tab.url,
      parentId: windowFolder.id
    });
  }

  // Grupy
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