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

    const rootFolder = await getOrCreateRootFolder();

    const windows = await browser.windows.getAll({ populate: true });

    // Zen ma tylko aktywny Space → bierzemy pierwszy window
    const spaceData = await browser.sessions.getWindowValue(
        windows[0].id,
        "zen-space"
    );

    const spaceName = spaceData?.title || "Default Space";

    // folder tylko dla tego Space
    const spaceFolder = await getOrCreateSubfolder(
        rootFolder.id,
        `Space: ${spaceName}`
    );

    //  czyścimy TYLKO ten Space (nie cały root)
    await clearFolder(spaceFolder.id);

    // Będziemy agregować karty per Space (nie per window)
    const spaces = {};

    for (const win of windows) {
        // 🔑 Space jest własnością okna
        const spaceData = await browser.sessions.getWindowValue(
        win.id,
        "zen-space"
        );

        const spaceName = spaceData?.title || "Default Space";

        if (!spaces[spaceName]) {
        spaces[spaceName] = {
            groups: {},
            ungrouped: []
        };
        }

        for (const tab of win.tabs) {
        if (!tab.url.startsWith("http")) continue;

        const groupData = await browser.sessions.getTabValue(
            tab.id,
            "zen-tab-group"
        );

        if (groupData && groupData.groupId) {
            if (!spaces[spaceName].groups[groupData.groupId]) {
            spaces[spaceName].groups[groupData.groupId] = {
                title: groupData.groupTitle || "Unnamed Group",
                tabs: []
            };
            }

            spaces[spaceName].groups[groupData.groupId].tabs.push(tab);
        } else {
            spaces[spaceName].ungrouped.push(tab);
        }
        }
    }

    // 🔨 Teraz budujemy zakładki idealnie jak Zen
    for (const [spaceName, space] of Object.entries(spaces)) {
        const spaceFolder = await browser.bookmarks.create({
            title: `Space: ${spaceName}`,
            parentId: spaceFolder.id
        });

        // Grupy
        for (const group of Object.values(space.groups)) {
        const groupFolder = await browser.bookmarks.create({
            title: group.title,
            parentId: spaceFolder.id
        });

        for (const tab of group.tabs) {
            await browser.bookmarks.create({
            title: tab.title,
            url: tab.url,
            parentId: groupFolder.id
            });
        }
        }

        // Karty bez grup
        if (space.ungrouped.length > 0) {
        const otherFolder = await browser.bookmarks.create({
            title: "Ungrouped Tabs",
            parentId: spaceFolder.id
        });

        for (const tab of space.ungrouped) {
            await browser.bookmarks.create({
            title: tab.title,
            url: tab.url,
            parentId: otherFolder.id
            });
        }
        }
    }

    console.log("Zen autosave done");
}