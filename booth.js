"use strict";

const el = (id) => document.getElementById(id);
const camera = el("camera");
const shutter = el("shutter");
const slots = [...document.querySelectorAll(".slot")];
const film = el("booth-film");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let sessionId = 0;
let stream = null;
let photos = [];
let stripUrl = "";
let page = "booth";
let retryCamera = false;
let filmPaused = reducedMotion.matches;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function syncFilm() {
  if (page === "booth" && !filmPaused && !document.hidden) {
    film.play().catch(() => {});
  } else {
    film.pause();
  }
}
function updateFilmButton() {
  el("film-toggle").setAttribute("aria-label", film.paused ? "Play booth film" : "Pause booth film");
  el("film-toggle").querySelector("use").setAttribute("href", film.paused ? "#i-play" : "#i-pause");
}
film.addEventListener("play", updateFilmButton);
film.addEventListener("pause", updateFilmButton);
el("film-toggle").onclick = () => { filmPaused = !film.paused; syncFilm(); };
reducedMotion.addEventListener("change", () => { filmPaused = reducedMotion.matches; syncFilm(); });
document.addEventListener("visibilitychange", syncFilm);
updateFilmButton();
syncFilm();

function stopCamera() {
  sessionId++;
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  camera.srcObject = null;
  el("count").textContent = "";
}
function showPage(name) {
  page = name;
  for (const section of ["booth", "session", "result"]) el(section).hidden = section !== name;
  if (el("how")) el("how").hidden = name !== "booth";
  el("home-link")?.classList.toggle("current", name === "booth");
  syncFilm();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function clearPhotos() {
  photos = [];
  slots.forEach((slot, i) => { slot.textContent = String(i + 1).padStart(2, "0"); });
  if (stripUrl) URL.revokeObjectURL(stripUrl);
  stripUrl = "";
  el("finished-strip").removeAttribute("src");
  el("save")?.removeAttribute("href");
}
function home() {
  stopCamera();
  clearPhotos();
  showPage("booth");
  el("enter").focus({ preventScroll: true });
}
el("leave")?.addEventListener("click", home);
el("home-link")?.addEventListener("click", (event) => { event.preventDefault(); home(); });
el("how-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  if (page !== "booth") home();
  el("how")?.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth" });
});

function setCameraError(message) {
  stopCamera();
  retryCamera = true;
  el("view-message").hidden = false;
  el("view-message").textContent = message;
  el("capture-status").textContent = "";
  el("shutter-label").textContent = "Try camera again";
  shutter.disabled = false;
}
async function openCamera() {
  stopCamera();
  const id = sessionId;
  retryCamera = false;
  shutter.disabled = true;
  el("shutter-label").textContent = "Opening camera…";
  el("capture-status").textContent = "";
  el("view-message").hidden = false;
  el("view-message").textContent = "Allow camera access to see yourself here.";
  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraError("Open the booth in a camera-enabled browser over HTTPS or localhost.");
    return;
  }
  try {
    const incoming = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }
    });
    if (id !== sessionId) { incoming.getTracks().forEach(track => track.stop()); return; }
    stream = incoming;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (sessionId === id && photos.length < 3) setCameraError("Your camera disconnected. Reconnect it to finish your strip.");
    }, { once: true });
    camera.srcObject = stream;
    await camera.play();
    if (id !== sessionId) return;
    el("view-message").hidden = true;
    el("capture-status").textContent = "Three seconds before each photo";
    el("shutter-label").textContent = "Capture";
    shutter.disabled = false;
  } catch (error) {
    if (id !== sessionId) return;
    const messages = {
      NotAllowedError: "Allow camera access in your browser’s site settings, then try again.",
      NotFoundError: "Connect a camera to this device, then try again.",
      NotReadableError: "Your camera may be in use. Close the other camera app, then try again."
    };
    setCameraError(messages[error.name] || "The camera couldn’t start. Check your camera and try again.");
  }
}
function enterBooth() {
  clearPhotos();
  showPage("session");
  el("session-title")?.focus({ preventScroll: true });
  openCamera();
}
el("enter").onclick = enterBooth;
el("again")?.addEventListener("click", enterBooth);

function capturePortrait() {
  if (!camera.videoWidth || camera.readyState < 2) throw new Error("Missing camera frame");
  const photo = document.createElement("canvas");
  photo.width = 720;
  photo.height = 540;
  const ctx = photo.getContext("2d", { willReadFrequently: true });
  const scale = Math.max(photo.width / camera.videoWidth, photo.height / camera.videoHeight);
  const width = camera.videoWidth * scale;
  const height = camera.videoHeight * scale;
  ctx.translate(photo.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(camera, (photo.width - width) / 2, (photo.height - height) / 2, width, height);
  const pixels = ctx.getImageData(0, 0, photo.width, photo.height);
  const rgb = pixels.data;
  for (let i = 0; i < rgb.length; i += 4) {
    const light = (.30 * rgb[i] + .59 * rgb[i + 1] + .11 * rgb[i + 2]) / 255;
    // Lift the blacks and roll off the whites like a scanned booth print.
    const curve = light + .32 * light * (1 - light) * (2 * light - 1);
    const grain = (Math.random() + Math.random() - 1) * 6;
    const tone = 17 + 218 * curve + grain;
    rgb[i] = tone + 2 + 5 * light;
    rgb[i + 1] = tone + 2 * light;
    rgb[i + 2] = tone - 2 - 7 * light;
  }
  ctx.putImageData(pixels, 0, 0);
  photo.setAttribute("role", "img");
  photo.setAttribute("aria-label", "Warm monochrome portrait " + (photos.length + 1));
  return photo;
}
async function finishStrip() {
  stopCamera();
  const id = sessionId;
  const strip = document.createElement("canvas");
  strip.width = 768;
  strip.height = 1800;
  const ctx = strip.getContext("2d");
  ctx.fillStyle = "#FFF0DC";
  ctx.fillRect(0, 0, strip.width, strip.height);
  photos.forEach((photo, index) => ctx.drawImage(photo, 24, 24 + index * 552));
  ctx.fillStyle = "#790B13";
  ctx.textAlign = "center";
  ctx.font = '17px "DM Sans", Arial, sans-serif';
  ctx.fillText(new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }), 384, 1777);
  const blob = await new Promise(resolve => strip.toBlob(resolve, "image/png"));
  if (sessionId !== id) return;
  stripUrl = blob ? URL.createObjectURL(blob) : strip.toDataURL("image/png");
  el("finished-strip").src = stripUrl;
  if (el("save")) el("save").href = stripUrl;
  showPage("result");
  el("result").focus({ preventScroll: true });
}
async function takeTimedPhoto(id) {
  el("capture-status").textContent = "Photo " + (photos.length + 1) + " of 3";
  for (let seconds = 3; seconds > 0; seconds--) {
    el("count").textContent = seconds;
    await delay(1000);
    if (id !== sessionId) return;
  }
  el("count").textContent = "";
  let photo;
  try { photo = capturePortrait(); }
  catch { setCameraError("The camera frame was interrupted. Reconnect to keep shooting."); return; }
  const slot = slots[photos.length];
  photos.push(photo);
  slot.replaceChildren(photo);
  const popout = photo.cloneNode(false);
  popout.setAttribute("aria-hidden", "true");
  popout.getContext("2d").drawImage(photo, 0, 0);
  camera.parentElement.append(popout);
  if (!reducedMotion.matches) el("flash").animate([{ opacity: .78 }, { opacity: 0 }], 230);
  el("capture-status").textContent = photos.length + " of 3 captured";
  await delay(850);
  popout.remove();
}
async function captureStrip() {
  if (shutter.disabled || !stream) return;
  const id = sessionId;
  shutter.disabled = true;
  el("shutter-label").textContent = "Capturing…";
  while (id === sessionId && photos.length < 3) {
    await takeTimedPhoto(id);
  }
  if (id === sessionId) await finishStrip();
}
shutter.onclick = () => retryCamera ? openCamera() : captureStrip();
window.addEventListener("pagehide", stopCamera);
window.addEventListener("pageshow", event => { if (event.persisted && page === "session") openCamera(); });

const musicButton = el("music-toggle");
const musicPanel = el("music-panel");
const trackId = "55G1N3RrCpxGAgHcbqclUF";
let controller;
let playerReady = false;
let playing = false;
let playRequested = true;
let hasStarted = false;
function playSoundtrack() {
  if (hasStarted) controller.resume();
  else controller.restart();
}
function startMusicOnInteraction(event) {
  if (event.target.closest?.(".sound") || hasStarted) return;
  playRequested = true;
  if (playerReady) {
    playRequested = false;
    playSoundtrack();
  }
}
document.addEventListener("click", startMusicOnInteraction);
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") startMusicOnInteraction(event);
});
function setPanel(open) {
  musicPanel.hidden = !open;
  musicButton.setAttribute("aria-expanded", String(open));
}
function showEmbedFallback() {
  if (el("player-box").querySelector("iframe")) return;
  const frame = document.createElement("iframe");
  frame.src = "https://open.spotify.com/embed/track/" + trackId + "?theme=0";
  frame.title = "Take Me to Church by Hozier on Spotify";
  frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
  frame.height = "80";
  el("player-box").replaceChildren(frame);
}
window.onSpotifyIframeApiReady = (api) => {
  const mount = el("spotify");
  if (!mount) return;
  api.createController(mount, { uri: "spotify:track:" + trackId, width: "100%", height: 80 }, (embed) => {
    controller = embed;
    embed.addListener("ready", () => {
      playerReady = true;
      if (playRequested) { playRequested = false; playSoundtrack(); }
    });
    embed.addListener("playback_update", ({ data }) => {
      playing = !data.isPaused;
      if (playing && !data.isBuffering) hasStarted = true;
      el("music-icon").setAttribute("href", playing ? "#i-pause" : "#i-play");
      musicButton.setAttribute("aria-label", (playing ? "Pause" : "Play") + " Take Me to Church by Hozier");
    });
  });
};
const apiScript = document.createElement("script");
apiScript.src = "https://open.spotify.com/embed/iframe-api/v1";
apiScript.onerror = showEmbedFallback;
document.head.append(apiScript);
musicButton.onclick = () => {
  if (playing && controller) { controller.pause(); playRequested = false; setPanel(false); return; }
  setPanel(true);
  if (playerReady) playSoundtrack();
  else { playRequested = true; setTimeout(showEmbedFallback, 1800); }
};
el("music-close").onclick = () => { setPanel(false); musicButton.focus(); };
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !musicPanel.hidden) { setPanel(false); musicButton.focus(); }
});
document.addEventListener("pointerdown", event => {
  if (!musicPanel.hidden && !event.target.closest(".sound")) setPanel(false);
});
