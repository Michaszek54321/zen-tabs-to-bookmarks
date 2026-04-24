async function restore() {
  const data = await browser.storage.local.get({
    delay: 5
  });

  document.getElementById("delay").value = data.delay;
}

async function save() {
  const delay = parseInt(document.getElementById("delay").value, 10);
  await browser.storage.local.set({ delay });
  alert("Saved");
}

document.getElementById("save").addEventListener("click", save);
restore();