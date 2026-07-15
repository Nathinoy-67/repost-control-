// ==========================================================
// REPOST.CTRL — logique de l'app
// ==========================================================

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
els.dropzone.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  selectedFile = file;
  const url = URL.createObjectURL(file);
  els.preview.src = url;
  els.preview.style.display = 'block';
  els.dropzoneText.style.display = 'none';
  els.preview.play().catch(()=>{});
  updatePublishButton();
});
els.targetYoutube.addEventListener('change', updatePublishButton);
els.targetInstagram.addEventListener('change', updatePublishButton);

// ==========================================================
// GOOGLE / YOUTUBE — OAuth PKCE + échange de code via le Worker
// (client type "Web application" : le secret reste sur Cloudflare)
// ==========================================================
const GOOGLE_REDIRECT_URI = location.origin + location.pathname;
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
  });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function handleGoogleRedirect(){
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (!code) return;
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
  window.history.replaceState({}, '', GOOGLE_REDIRECT_URI);
  refreshConnectionUI();
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
  const metadata = {
    snippet: { title, description: caption, categoryId: '22' },
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
// FACEBOOK / INSTAGRAM — login navigateur + publication via le Worker
// ==========================================================
window.fbAsyncInit = function(){
  FB.init({ appId: CONFIG.FACEBOOK_APP_ID, xfbml: false, version: 'v21.0' });
};

function connectInstagram(){
  FB.login((response) => {
    if (response.authResponse){
      const shortToken = response.authResponse.accessToken;
      exchangeAndStoreFbToken(shortToken);
    } else {
      log('Connexion Instagram annulée.', 'err');
    }
  }, { scope: 'instagram_business_basic,instagram_business_content_publish,pages_show_list,pages_read_engagement' });
}

async function exchangeAndStoreFbToken(shortToken){
  log('Échange du token Instagram (via le worker)…');
  const res = await fetch(`${CONFIG.WORKER_URL}/exchange-fb-token?token=${encodeURIComponent(shortToken)}`);
  const data = await res.json();
  if (!data.access_token) { log('Échec échange token IG : ' + JSON.stringify(data), 'err'); return; }
  localStorage.setItem('fb_long_token', data.access_token);
  await resolveInstagramAccount(data.access_token);
}

async function resolveInstagramAccount(token){
  const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${token}`);
  const pages = await pagesRes.json();
  const page = pages.data && pages.data[0];
  if (!page) { log('Aucune Page Facebook trouvée sur ce compte.', 'err'); return; }
  const igRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${token}`);
  const igData = await igRes.json();
  if (!igData.instagram_business_account) { log('Aucun compte Instagram Business lié à cette Page.', 'err'); return; }
  localStorage.setItem('ig_user_id', igData.instagram_business_account.id);
  localStorage.setItem('ig_page_token', page.access_token);
  log('Instagram connecté.', 'ok');
  refreshConnectionUI();
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
handleGoogleRedirect();
refreshConnectionUI();

if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
