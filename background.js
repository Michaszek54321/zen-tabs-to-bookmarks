let saveTimer = null;
let lastSave = 0;
let ESSENTIAL_URLS = new Set();

const MIN_INTERVAL = 7000;
const ROOT_TITLE = "Latest Autosave";

let SETTINGS = {
    delay: 5,
    essentials: 3,
    deviceName: "My-Computer"
};

async function loadSettings() {
    const data = await browser.storage.local.get({
        delay: 5,
        essentials: 3,
        deviceName: "My-Computer"
    });

    SETTINGS = data;
}

loadSettings();
browser.storage.onChanged.addListener(loadSettings);

browser.tabs.onCreated.addListener(scheduleSave);
browser.tabs.onRemoved.addListener(scheduleSave);
browser.tabs.onUpdated.addListener(scheduleSave);

// browser.browserAction.onClicked.addListener(saveSession);

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

function scheduleSave(tab) {
    console.log("Tab event detected, scheduling save...");
    if (saveTimer) clearTimeout(saveTimer);

    saveTimer = setTimeout(async () => {
        const now = Date.now();
        if (now - lastSave > MIN_INTERVAL) {
            await saveSession();
            lastSave = now;
        }
    }, SETTINGS.delay * 1000);
}

function getEssentialUrlsFromTabs(tabs) {
    const sorted = [...tabs].sort((a, b) => a.index - b.index);

    const EssentialTabs = sorted
        .filter(t => t.pinned && t.url && t.url.startsWith("http"))
        .slice(0, SETTINGS.essentials);

    return new Set(EssentialTabs.map(t => t.url));
}

async function getDeviceRootFolder() {
    const found = await browser.bookmarks.search({ title: SETTINGS.deviceName });

    for (const f of found) {
        if (!f.url) return f.id;
    }

    const folder = await browser.bookmarks.create({
        title: SETTINGS.deviceName
    });

    return folder.id;
}

async function clearFolder(folderId) {
    const children = await browser.bookmarks.getChildren(folderId);
    for (const child of children) {
        await browser.bookmarks.removeTree(child.id);
    }
}

async function saveSession() {
    const startTime = Date.now();
    console.log("Autosave started");

    const root = await getDeviceRootFolder();
    const windows = await browser.windows.getAll({ populate: true });

    for (const win of windows) {
        await updateWindow(win, root);
    }

    console.log("Autosave completed");
    console.log("Autosave time:", (Date.now() - startTime) + "ms");
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
    const ESSENTIAL_URLS = getEssentialUrlsFromTabs(tabs);

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
    const ESSENTIAL_URLS = getEssentialUrlsFromTabs(win.tabs);

    let windowFolder = await findMatchingWindowFolder(rootId, win.tabs);

    if (!windowFolder) {
        windowFolder = await browser.bookmarks.create({
            title: `Space ${Date.now()}`,
            parentId: rootId
        });
    }

    const sortedTabs = [...win.tabs].sort((a, b) => a.index - b.index);

    // ===== AKTUALNY STAN TABS =====
    const desired = [];

    for (const tab of sortedTabs) {
        if (!tab.url || !tab.url.startsWith("http")) continue;
        if (ESSENTIAL_URLS.has(tab.url)) continue;

        desired.push({
            url: tab.url,
            title: tab.title || tab.url,
            groupId: tab.groupId
        });
    }

    // ===== OBECNY STAN BOOKMARKÓW =====
    const existingMap = new Map(); // url -> bookmark node
    const existingTree = await browser.bookmarks.getSubTree(windowFolder.id);

    function walk(nodes) {
        for (const n of nodes) {
            if (n.url) existingMap.set(n.url, n);
            if (n.children) walk(n.children);
        }
    }
    walk(existingTree);

    const desiredUrls = new Set(desired.map(d => d.url));

    // ===== USUŃ NIEISTNIEJĄCE =====
    for (const [url, node] of existingMap.entries()) {
        if (!desiredUrls.has(url)) {
            await browser.bookmarks.remove(node.id);
        }
    }

    // ===== GRUPY =====
    // ===== WYZNACZ KTÓRE URL SĄ NOWE =====
    const newItems = desired.filter(d => !existingMap.has(d.url));

    // ===== GRUPY TYLKO DLA NOWYCH =====
    const groupFolders = new Map();
    let groupCounter = 1;

    for (const d of newItems) {
        if (d.groupId === -1) continue;

        if (!groupFolders.has(d.groupId)) {
            const folder = await browser.bookmarks.create({
                title: `Group ${groupCounter++}`,
                parentId: windowFolder.id
            });
            groupFolders.set(d.groupId, folder.id);
        }
    }

    // ===== DODAJ NOWE =====
    for (const d of newItems) {
        let parentId = windowFolder.id;

        if (d.groupId !== -1 && groupFolders.has(d.groupId)) {
            parentId = groupFolders.get(d.groupId);
        }

        await browser.bookmarks.create({
            title: d.title,
            url: d.url,
            parentId
        });
    }
}