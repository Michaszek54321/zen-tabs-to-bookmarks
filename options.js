async function restore() {
    const data = await browser.storage.local.get({
        delay: 5,
        essentials: 3
    });

    document.getElementById("delay").value = data.delay;
    document.getElementById("essentials").value = data.essentials;
}

async function save() {
    const delay = parseInt(document.getElementById("delay").value, 10);
    const essentials = parseInt(document.getElementById("essentials").value, 10);

    await browser.storage.local.set({ delay, essentials });
    alert("Saved");
}

document.getElementById("save").addEventListener("click", save);
restore();