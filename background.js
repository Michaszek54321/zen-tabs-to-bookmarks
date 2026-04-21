let saveTimer = null;
let lastSaveTime = 0;

const DEBOUNCE_MS = 5000;
const MIN_TIME_BETWEEN_SAVES = 30000;
const ROOT_FOLDER_TITLE = "Latest Autosave";

browser.tabs.onCreated.addListener(scheduleSave);
browser.browserAction.onClicked.addListener(saveSession);

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
        const now = Date.now();
        if (now - lastSaveTime > MIN_TIME_BETWEEN_SAVES) {
        saveSession();
        lastSaveTime = now;
        }
    }, DEBOUNCE_MS);
}

async function getOrCreateSubfolder(parentId, title) {
    const children = await browser.bookmarks.getChildren(parentId);
    for (const child of children) {
        if (child.title === title && !child.url) return child;
    }

    return browser.bookmarks.create({
        title,
        parentId
    });
}

async function getOrCreateRootFolder() {
    const existing = await browser.bookmarks.search({ title: ROOT_FOLDER_TITLE });

    for (const item of existing) {
        if (!item.url) return item; // folder
    }

    return browser.bookmarks.create({ title: ROOT_FOLDER_TITLE });
}

async function clearFolder(folderId) {
    const children = await browser.bookmarks.getChildren(folderId);
    for (const child of children) {
        await browser.bookmarks.removeTree(child.id);
    }
}

async function saveSession() {
    console.log("Zen autosave start");

    // =========================
    // 1. POBRANIE DANYCH
    // =========================
    const rootFolder = await getOrCreateRootFolder();
    const windows = await browser.windows.getAll({ populate: true });

    if (!windows || windows.length === 0) {
        console.warn("No windows found");
        return;
    }

    const activeWindow = windows[0];

    const spaceData = await browser.sessions.getWindowValue(
        activeWindow.id,
        "zen-space"
    );

    const spaceName = spaceData?.title || "Default Space";

    // =========================
    // 2. STRUKTURA SPACE
    // =========================
    const spaceFolder = await getOrCreateSubfolder(
        rootFolder.id,
        `Space: ${spaceName}`
    );

    await clearFolder(spaceFolder.id);

    // =========================
    // 3. AGREGACJA DANYCH
    // =========================
    const groups = {};
    const ungrouped = [];

    for (const win of windows) {
        const tabs = win.tabs || [];

        for (const tab of tabs) {
        if (!tab.url || !tab.url.startsWith("http")) continue;

        const groupData = await browser.sessions.getTabValue(
            tab.id,
            "zen-tab-group"
        );

        if (groupData && groupData.groupId) {
            if (!groups[groupData.groupId]) {
            groups[groupData.groupId] = {
                title: groupData.groupTitle || "Unnamed Group",
                tabs: []
            };
            }

            groups[groupData.groupId].tabs.push(tab);
        } else {
            ungrouped.push(tab);
        }
        }
    }

    // =========================
    // 4. ZAPIS DO ZAKŁADEK
    // =========================

    // Grupy Zen
    for (const groupId of Object.keys(groups)) {
        const group = groups[groupId];

        const groupFolder = await browser.bookmarks.create({
        title: group.title,
        parentId: spaceFolder.id
        });

        for (const tab of group.tabs) {
        await browser.bookmarks.create({
            title: tab.title || tab.url,
            url: tab.url,
            parentId: groupFolder.id
        });
        }
    }

    // Ungrouped
    if (ungrouped.length > 0) {
        const ungroupedFolder = await browser.bookmarks.create({
        title: "Ungrouped Tabs",
        parentId: spaceFolder.id
        });

        for (const tab of ungrouped) {
        await browser.bookmarks.create({
            title: tab.title || tab.url,
            url: tab.url,
            parentId: ungroupedFolder.id
        });
        }
    }

    console.log("Zen autosave completed");
}