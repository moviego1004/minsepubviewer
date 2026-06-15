const params = new URLSearchParams(window.location.search);
const id = params.get("id") || "";
const image = document.querySelector("#imagePreview");
const status = document.querySelector("#status");

function setStatus(message) {
  status.textContent = message;
  status.hidden = false;
}

async function loadImage() {
  if (!id) {
    setStatus("Image not found.");
    return;
  }

  const response = await fetch(`/__image-viewer-state?id=${encodeURIComponent(id)}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    setStatus("Image not found.");
    return;
  }

  const payload = await response.json();

  if (!payload.src) {
    setStatus("Image not found.");
    return;
  }

  document.title = payload.title || payload.alt || "Image";
  image.alt = payload.alt || "";
  image.addEventListener("load", () => {
    status.hidden = true;
  }, { once: true });
  image.addEventListener("error", () => {
    setStatus("Could not load image.");
  }, { once: true });
  image.src = payload.src;
}

loadImage().catch(() => {
  setStatus("Could not load image.");
});
