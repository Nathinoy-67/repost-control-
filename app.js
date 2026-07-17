// ==========================================================
// REPOST.CTRL — logique de l'app
// VERSION: 2026-07-15-g (fix sélection vidéo mobile + #Shorts)
// ==========================================================
console.log('REPOST.CTRL version 2026-07-15-g');

const els = {
  fileInput: document.getElementById('file-input'),
  dropzone: document.getElementById('dropzone'),
  dropzoneText: document.getElementById('dropzone-text'),
  preview: document.getElementById('preview'),
  presetSelect: document.getElementById('preset-select'),
  captionText: document.getElementById('caption-text'),
  presetName: document.getElementById('preset-name'),
  savePreset: document.getElementById('save-preset'),
  targetYoutube: document.getElementById('target-youtube'),
  targetInstagram: document.getElementById('target-instagram'),
  publishBtn: document.getElementById('publish-btn'),
  logBody: document.getElementById('log-body'),
  ledYoutube: document.getElementById('led-youtube'),
  ledInstagram: document.getElementById('led-instagram'),
  connectYoutube: document.getElementById('connect-youtube'),
  connectInstagram: document.getElementById('connect-instagram'),
};

let selectedFile = null;

function log(msg, type = ''){
  const line = document.createElement('div');
  if (type) line.className = type;
  const time = new Date().toLocaleTimeString('fr-FR');
  line.textContent = `[${time}] ${msg}`;
  els.logBody.appendChild(line);
  els.logBody.scrollTop = els.logBody.scrollHeight;
}

function updatePublishButton(){
  const anyTarget = els.targetYoutube.checked || els.targetInstagram.checked;
  els.publishBtn.disabled = !(selectedFile && anyTarget);
}

// ---------- Presets (description) ----------
function loadPresets(){
  const presets = JSON.parse(localStorage.getItem('repost_presets') || '{}');
  els.presetSelect.innerHTML = '<option value="">— Choisir un modèle —</option>';
  Object.keys(presets).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    els.presetSelect.appendChild(opt);
  });
  return presets;
}
els.presetSelect.addEventListener('change', () => {
  const presets = JSON.parse(localStorage.getItem('repost_presets') || '{}');
  if (els.presetSelect.value) els.captionText.value = presets[els.presetSelect.value];
});
els.savePreset.addEventListener('click', () => {
  const name = els.presetName.value.trim();
  if (!name){ log('Donne un nom au modèle avant de l\'enregistrer.', 'err'); return; }
  const presets = JSON.parse(localStorage.getItem('repost_presets') || '{}');
  presets[name] = els.captionText.value;
  localStorage.setItem('repost_presets', JSON.stringify(presets));
  els.presetName.value = '';
  loadPresets();
  log(`Modèle "${name}" enregistré.`, 'ok');
});
loadPresets();

// ---------- Vidéo ----------
// Le <label for="file-input"> ouvre déjà le sélecteur nativement.
// (un addEventListener('click') en plus provoquait un double-déclenchement
// sur certains navigateurs mobiles, qui faisait perdre le fichier choisi)
els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  selectedFile = file;
  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  els.dropzoneText.textContent = `✅ ${file.name} (${sizeMb} Mo) sélectionnée`;
  els.dropzoneText.style.display = 'block';
  els.preview.style.display = 'none';
  updatePublishButton();
});
els.targetYoutube.addEventListener('change', updatePublishButton);
els.targetInstagram.addEventListener('change', updatePublishButton);

// ==========================================================
// GOOGLE / YOUTUBE — OAuth PKCE 100% côté navigateur
// ==========================================================
const GOOGLE_REDIRECT_URI = 'https://nathinoy-67.github.io/repost-control-/';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

function base64url(buffer){
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(input){
  const data = new TextEncoder().encode(input);
  return await crypto.subtle.digest('SHA-256', data);
}
function randomString(len = 64){
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return base64url(arr.buffer).slice(0, len);
}

async function connectYoutube(){
  const verifier = randomString();
  sessionStorage.setItem('gv', verifier);
  const challenge = base64url(await sha256(verifier));
  const params = new URLSearchParams({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    state: 'google',
  });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function handleOAuthRedirect(){
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return;
  if (state === 'google'){
    await handleGoogleRedirect(code);
  } else if (state === 'instagram'){
    await handleInstagramRedirect(code);
  }
  window.history.replaceState({}, '', GOOGLE_REDIRECT_URI);
  refreshConnectionUI();
}

async function handleGoogleRedirect(code){
  const verifier = sessionStorage.getItem('gv');
  const res = await fetch(`${CONFIG.WORKER_URL}/exchange-google-code`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ code, verifier, redirectUri: GOOGLE_REDIRECT_URI }),
  });
  const data = await res.json();
  if (data.access_token){
    localStorage.setItem('yt_access_token', data.access_token);
    localStorage.setItem('yt_refresh_token', data.refresh_token || localStorage.getItem('yt_refresh_token') || '');
    localStorage.setItem('yt_token_expiry', Date.now() + (data.expires_in * 1000));
    log('YouTube connecté.', 'ok');
  } else {
    log('Échec connexion YouTube : ' + JSON.stringify(data), 'err');
  }
}

async function getYoutubeAccessToken(){
  const expiry = Number(localStorage.getItem('yt_token_expiry') || 0);
  if (Date.now() < expiry - 60000) return localStorage.getItem('yt_access_token');
  const refresh = localStorage.getItem('yt_refresh_token');
  if (!refresh) return null;
  const res = await fetch(`${CONFIG.WORKER_URL}/refresh-google-token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ refreshToken: refresh }),
  });
  const data = await res.json();
  if (data.access_token){
    localStorage.setItem('yt_access_token', data.access_token);
    localStorage.setItem('yt_token_expiry', Date.now() + (data.expires_in * 1000));
    return data.access_token;
  }
  return null;
}

async function uploadToYoutube(file, caption){
  const token = await getYoutubeAccessToken();
  if (!token) throw new Error('YouTube non connecté.');

  const title = caption.split('\n')[0].slice(0, 95) || 'Short';
  const descriptionWithTag = caption.toLowerCase().includes('#shorts')
    ? caption
    : `${caption}\n\n#Shorts`;
  const metadata = {
    snippet: { title, description: descriptionWithTag, categoryId: '22' },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  };

  log('Initialisation de l\'upload YouTube…');
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': file.type,
        'X-Upload-Content-Length': file.size,
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initRes.ok) throw new Error('Init YouTube échouée : ' + await initRes.text());
  const uploadUrl = initRes.headers.get('Location');

  log('Envoi de la vidéo vers YouTube…');
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  const result = await putRes.json();
  if (!putRes.ok) throw new Error('Upload YouTube échoué : ' + JSON.stringify(result));
  log(`YouTube publié : ${result.id}`, 'ok');
  return result;
}

// ==========================================================
// INSTAGRAM — connexion directe (Instagram API with Instagram login)
// ==========================================================
const INSTAGRAM_SCOPE = 'instagram_business_basic,instagram_business_content_publish';

function connectInstagram(){
  const params = new URLSearchParams({
    client_id: CONFIG.INSTAGRAM_APP_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: INSTAGRAM_SCOPE,
    state: 'instagram',
  });
  location.href = `https://www.instagram.com/oauth/authorize?${params}`;
}

async function handleInstagramRedirect(code){
  log('Retour d\'Instagram, échange du code…');
  const res = await fetch(`${CONFIG.WORKER_URL}/exchange-ig-code`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ code, redirectUri: GOOGLE_REDIRECT_URI }),
  });
  const data = await res.json();
  if (!data.access_token) { log('Échec échange token IG : ' + JSON.stringify(data), 'err'); return; }
  localStorage.setItem('ig_user_id', data.user_id);
  localStorage.setItem('ig_page_token', data.access_token);
  log('Instagram connecté.', 'ok');
}

async function publishToInstagram(file, caption){
  const igUserId = localStorage.getItem('ig_user_id');
  const token = localStorage.getItem('ig_page_token');
  if (!igUserId || !token) throw new Error('Instagram non connecté.');

  log('Envoi vers Instagram (via le worker)…');
  const form = new FormData();
  form.append('video', file);
  form.append('caption', caption);
  form.append('igUserId', igUserId);
  form.append('accessToken', token);

  const res = await fetch(`${CONFIG.WORKER_URL}/instagram-publish`, { method: 'POST', body: form });
  const result = await res.json();
  if (!res.ok || result.error) throw new Error('Instagram : ' + JSON.stringify(result));
  log(`Instagram Reel publié : ${result.id}`, 'ok');
  return result;
}

// ---------- Connexion UI ----------
function refreshConnectionUI(){
  const ytOk = !!localStorage.getItem('yt_refresh_token');
  const igOk = !!localStorage.getItem('ig_user_id');
  els.ledYoutube.classList.toggle('connected', ytOk);
  els.ledInstagram.classList.toggle('connected', igOk);
}

els.connectYoutube.addEventListener('click', connectYoutube);
els.connectInstagram.addEventListener('click', connectInstagram);

// ---------- Publication ----------
els.publishBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  const caption = els.captionText.value.trim();
  els.publishBtn.disabled = true;
  log('--- Nouvelle publication ---', 'info');
  try{
    if (els.targetYoutube.checked) await uploadToYoutube(selectedFile, caption);
    if (els.targetInstagram.checked) await publishToInstagram(selectedFile, caption);
    log('Terminé.', 'ok');
  } catch (e){
    log(e.message, 'err');
  } finally {
    updatePublishButton();
  }
});

// ---------- Init ----------
handleOAuthRedirect();
refreshConnectionUI();

if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
