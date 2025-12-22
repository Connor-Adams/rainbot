// State
let guilds = [];
let sounds = [];
let connections = [];
let selectedGuildId = null;
let isAuthenticated = false;

// DOM Elements
const botStatus = document.getElementById('bot-status');
const connectionsList = document.getElementById('connections-list');
const serversList = document.getElementById('servers-list');
const guildSelect = document.getElementById('guild-select');
const urlInput = document.getElementById('url-input');
const playUrlBtn = document.getElementById('play-url-btn');
const stopBtn = document.getElementById('stop-btn');
const nowPlaying = document.getElementById('now-playing');
const nowPlayingTitle = document.getElementById('now-playing-title');
const soundsGrid = document.getElementById('sounds-grid');
const searchInput = document.getElementById('search-input');
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const uploadArea = document.getElementById('upload-area');
const toastContainer = document.getElementById('toast-container');
const loadingOverlay = document.getElementById('loading-overlay');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// API Helpers
async function api(endpoint, options = {}) {
    const res = await fetch(`/api${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// Toast Notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span>
        <span class="toast-message">${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Format file size
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Update bot status display
function updateStatusDisplay(data) {
    const dot = botStatus.querySelector('.status-dot');
    const text = botStatus.querySelector('.status-text');
    
    if (data.online) {
        dot.className = 'status-dot online';
        text.textContent = data.username;
    } else {
        dot.className = 'status-dot offline';
        text.textContent = 'Offline';
    }
}

// Render connections list
function renderConnections() {
    if (connections.length === 0) {
        connectionsList.innerHTML = '<p class="empty-state">No active connections</p>';
        nowPlaying.classList.add('hidden');
        return;
    }

    connectionsList.innerHTML = connections.map(conn => `
        <div class="connection-item">
            <span class="icon">🔊</span>
            <div class="info">
                <div class="name">${conn.channelName}</div>
                ${conn.nowPlaying ? `<div class="playing">♪ ${conn.nowPlaying}</div>` : '<div class="detail">Idle</div>'}
            </div>
        </div>
    `).join('');

    // Update now playing
    const playing = connections.find(c => c.nowPlaying);
    if (playing) {
        nowPlayingTitle.textContent = playing.nowPlaying;
        nowPlaying.classList.remove('hidden');
    } else {
        nowPlaying.classList.add('hidden');
    }
}

// Render servers list
function renderServers() {
    if (guilds.length === 0) {
        serversList.innerHTML = '<p class="empty-state">No servers</p>';
        return;
    }

    serversList.innerHTML = guilds.map(guild => `
        <div class="server-item" data-guild-id="${guild.id}">
            <span class="icon">🏠</span>
            <div class="info">
                <div class="name">${guild.name}</div>
                <div class="detail">${guild.memberCount} members</div>
            </div>
        </div>
    `).join('');

    // Update guild select dropdown
    guildSelect.innerHTML = '<option value="">Select server...</option>' +
        guilds.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    
    if (selectedGuildId) {
        guildSelect.value = selectedGuildId;
    }
}

// Render sounds grid
function renderSounds(filter = '') {
    const filtered = sounds.filter(s => 
        s.name.toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
        soundsGrid.innerHTML = filter 
            ? '<p class="empty-state">No matching sounds</p>'
            : '<p class="empty-state">No sounds uploaded yet</p>';
        return;
    }

    soundsGrid.innerHTML = filtered.map(sound => `
        <div class="sound-card" data-name="${sound.name}">
            <div class="sound-icon">🎵</div>
            <div class="sound-name" title="${sound.name}">${sound.name}</div>
            <div class="sound-size">${formatSize(sound.size)}</div>
            <div class="sound-actions">
                <button class="btn btn-primary btn-small play-sound-btn">▶</button>
                <button class="btn btn-danger btn-small delete-sound-btn">✕</button>
            </div>
        </div>
    `).join('');

    // Add event listeners
    soundsGrid.querySelectorAll('.play-sound-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.sound-card');
            const name = card.dataset.name;
            playSound(name);
        });
    });

    soundsGrid.querySelectorAll('.delete-sound-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.sound-card');
            const name = card.dataset.name;
            deleteSound(name);
        });
    });
}

// Fetch status from API
async function fetchStatus() {
    try {
        const data = await api('/status');
        guilds = data.guilds || [];
        connections = data.connections || [];
        updateStatusDisplay(data);
        renderConnections();
        renderServers();
    } catch (error) {
        updateStatusDisplay({ online: false });
    }
}

// Fetch sounds from API
async function fetchSounds() {
    try {
        sounds = await api('/sounds');
        renderSounds(searchInput.value);
    } catch (error) {
        console.error('Failed to fetch sounds:', error);
    }
}

// Play a sound
async function playSound(source) {
    const guildId = guildSelect.value;
    if (!guildId) {
        showToast('Please select a server first', 'error');
        return;
    }

    try {
        const data = await api('/play', {
            method: 'POST',
            body: JSON.stringify({ guildId, source }),
        });
        showToast(`Playing: ${data.title}`);
        fetchStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Stop playback
async function stopPlayback() {
    const guildId = guildSelect.value;
    if (!guildId) {
        showToast('Please select a server first', 'error');
        return;
    }

    try {
        await api('/stop', {
            method: 'POST',
            body: JSON.stringify({ guildId }),
        });
        showToast('Playback stopped');
        fetchStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Delete a sound
async function deleteSound(name) {
    if (!confirm(`Delete "${name}"?`)) return;

    try {
        await api(`/sounds/${encodeURIComponent(name)}`, { method: 'DELETE' });
        showToast('Sound deleted');
        fetchSounds();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Upload files
async function uploadFiles(files) {
    for (const file of files) {
        const formData = new FormData();
        formData.append('sound', file);

        try {
            const res = await fetch('/api/sounds', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast(`Uploaded: ${file.name}`);
        } catch (error) {
            showToast(`Failed to upload ${file.name}: ${error.message}`, 'error');
        }
    }
    fetchSounds();
}

// Event Listeners
playUrlBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) {
        showToast('Please enter a URL', 'error');
        return;
    }
    playSound(url);
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') playUrlBtn.click();
});

stopBtn.addEventListener('click', stopPlayback);

guildSelect.addEventListener('change', (e) => {
    selectedGuildId = e.target.value;
});

searchInput.addEventListener('input', (e) => {
    renderSounds(e.target.value);
});

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        uploadFiles(e.target.files);
        e.target.value = '';
    }
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragging');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragging');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragging');
    const files = Array.from(e.dataTransfer.files).filter(f => 
        /\.(mp3|wav|ogg|m4a|webm|flac)$/i.test(f.name)
    );
    if (files.length > 0) {
        uploadFiles(files);
    }
});

// Authentication functions
async function checkAuth() {
    try {
        console.log('Checking authentication status...');
        const res = await fetch('/auth/check', {
            credentials: 'include', // Important: include cookies
        });
        
        console.log('Auth check response:', res.status, res.statusText);
        
        const data = await res.json();
        console.log('Auth check data:', data);

        if (res.status === 401) {
            // Not authenticated
            showLoginUI();
            return false;
        }

        if (res.status === 403) {
            // Authenticated but no access
            showAccessDenied();
            return false;
        }

        if (data.authenticated && data.hasAccess) {
            // Authenticated and has access
            isAuthenticated = true;
            await getUserInfo();
            showDashboardUI();
            return true;
        }

        showLoginUI();
        return false;
    } catch (error) {
        console.error('Auth check failed:', error);
        showLoginUI();
        return false;
    }
}

async function getUserInfo() {
    try {
        const res = await fetch('/auth/me');
        if (!res.ok) throw new Error('Failed to get user info');
        
        const user = await res.json();
        userAvatar.src = user.avatarUrl;
        userName.textContent = user.username + (user.discriminator !== '0' ? `#${user.discriminator}` : '');
    } catch (error) {
        console.error('Failed to get user info:', error);
    }
}

function showLoginUI() {
    loadingOverlay.style.display = 'none';
    loginBtn.style.display = 'block';
    userInfo.style.display = 'none';
    document.querySelector('.main').style.display = 'none';
}

function showDashboardUI() {
    loadingOverlay.style.display = 'none';
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    document.querySelector('.main').style.display = 'flex';
}

function showAccessDenied() {
    loadingOverlay.style.display = 'none';
    document.querySelector('.main').innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100%; flex-direction: column; gap: 1rem;">
            <h2 style="color: var(--danger);">Access Denied</h2>
            <p>You do not have the required role to access this dashboard.</p>
            <button class="btn btn-primary" onclick="window.location.href='/auth/discord'">Try Again</button>
        </div>
    `;
}

// Login button handler
loginBtn.addEventListener('click', () => {
    window.location.href = '/auth/discord';
});

// Logout button handler
logoutBtn.addEventListener('click', async () => {
    try {
        await fetch('/auth/logout');
        window.location.href = '/auth/discord';
    } catch (error) {
        console.error('Logout failed:', error);
        window.location.href = '/auth/discord';
    }
});

// Check if we just came back from OAuth (check URL params)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('code') || window.location.pathname === '/') {
    // Just redirected from OAuth or on home page - check auth status
    console.log('Checking auth status after redirect...');
}

// Initial load - check auth first
checkAuth().then(authenticated => {
    if (authenticated) {
        fetchStatus();
        fetchSounds();
        // Poll for updates every 5 seconds
        setInterval(fetchStatus, 5000);
    } else {
        // If not authenticated, check again after a short delay (in case session is still being created)
        setTimeout(() => {
            console.log('Re-checking auth status...');
            checkAuth();
        }, 1000);
    }
});

