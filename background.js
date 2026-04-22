let saveTimer = null;
let lastSave = 0;
let ESSENTIAL_URLS = new Set();

const DEBOUNCE_MS = 5000;
const MIN_INTERVAL = 15000;
const ROOT_TITLE = "Latest Autosave";

browser.tabs.onCreated.addListener(scheduleSave);
browser.tabs.onRemoved.addListener(scheduleSave);
browser.tabs.onUpdated.addListener(scheduleSave);

browser.browserAction.onClicked.addListener(saveSession);

async function detectEssentials() {
    const windows = await browser.windows.getAll({ populate: true });
    if (windows.length === 0) return;

    const urls = windows[0].tabs
        .filter(t => t.url && t.pinned) // essentials są pinned
        .map(t => t.url);

    ESSENTIAL_URLS = new Set(urls);
    console.log("Detected essentials:", ESSENTIAL_URLS);
}

detectEssentials();

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

function getWindowFingerprint(tabs) {
    const urls = tabs
        .filter(t => t.url && t.url.startsWith("http"))
        .slice(0, 5)
        .map(t => t.url)
        .join("|");

    let hash = 0;
    for (let i = 0; i < urls.length; i++) {
        hash = (hash << 5) - hash + urls.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash).toString(16).slice(0, 6);
}

async function findMatchingWindowFolder(rootId, tabs) {
    const children = await browser.bookmarks.getChildren(rootId);

    const currentUrls = tabs
        .filter(t =>
            t.url &&
            t.url.startsWith("http") &&
            !ESSENTIAL_URLS.has(t.url)
        )
        .map(t => t.url);   

    for (const child of children) {
        if (child.url) continue; // tylko foldery

        const savedUrls = await getAllUrlsFromFolder(child.id);

        const matches = currentUrls.filter(url => savedUrls.includes(url));

        // jeśli >50% URL się pokrywa → to ten Space
        if (matches.length > currentUrls.length * 0.5) {
        return child;
        }
    }

    return null;
}

async function getAllUrlsFromFolder(folderId) {
    const tree = await browser.bookmarks.getSubTree(folderId);
    const urls = [];

    function walk(nodes) {
        for (const node of nodes) {
        if (node.url) urls.push(node.url);
        if (node.children) walk(node.children);
        }
    }

    walk(tree);
    return urls;
}

async function updateWindow(win, rootId) {
    let windowFolder = await findMatchingWindowFolder(rootId, win.tabs);

    if (!windowFolder) {
        windowFolder = await browser.bookmarks.create({
            title: `Window ${Date.now()}`,
            parentId: rootId
        });
    }

    await clearFolder(windowFolder.id);

    const sortedTabs = [...win.tabs].sort((a, b) => a.index - b.index);

    const groups = new Map();
    const ungrouped = [];

    for (const tab of sortedTabs) {
        if (tab.pinned) continue; // KLUCZOWE
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

    // TERAZ zapisujemy ungrouped jako luźne zakładki
    for (const tab of ungrouped) {
        await browser.bookmarks.create({
        title: tab.title || tab.url,
        url: tab.url,
        parentId: windowFolder.id
        });
    }

    // TERAZ zapisujemy grupy
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
}