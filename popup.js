async function restore() {
    const data = await browser.storage.local.get({
        delay: 5,
        essentials: 3,
        deviceName: "My-Computer"
    });

    delay.value = data.delay;
    essentials.value = data.essentials;
    deviceName.value = data.deviceName;
}

async function saveSettings() {
    await browser.storage.local.set({
        delay: parseInt(delay.value, 10),
        essentials: parseInt(essentials.value, 10),
        deviceName: deviceName.value.trim()
    });
}

async function saveNow() {
    const bg = await browser.runtime.getBackgroundPage();
    bg.saveSession();
}

document.getElementById("saveSettings").onclick = saveSettings;
document.getElementById("saveNow").onclick = saveNow;

restore();