async function restore() {
    const data = await browser.storage.local.get({
        delay: 5,
        essentials: 3,
        deviceName: "My-Computer"
    });

    document.getElementById("delay").value = data.delay;
    document.getElementById("essentials").value = data.essentials;
    document.getElementById("deviceName").value = data.deviceName;
}

async function save() {
    const delay = parseInt(document.getElementById("delay").value, 10);
    const essentials = parseInt(document.getElementById("essentials").value, 10);
    const deviceName = document.getElementById("deviceName").value.trim();

    await browser.storage.local.set({ delay, essentials, deviceName });
    alert("Saved");
}

document.getElementById("save").addEventListener("click", save);
restore();