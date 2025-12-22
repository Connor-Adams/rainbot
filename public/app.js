// State
let guilds = [];
let sounds = [];
let connections = [];
let selectedGuildId = null;
let isAuthenticated = false;
let queueData = { nowPlaying: null, queue: [], totalInQueue: 0 };

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
const queueList = document.getElementById('queue-list');
const queueCount = document.getElementById('queue-count');
const clearSearchBtn = document.getElementById('clear-search-btn');
const clearQueueBtn = document.getElementById('clear-queue-btn');

// API Helpers
async function api(endpoint, options = {}) {
    const res = await fetch(`/api${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: include cookies for authentication
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
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.success}</span>
        <span class="toast-message">${message}</span>
    `;
    toastContainer.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(calc(100% + 1.5rem))';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
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
        connectionsList.innerHTML = '<p class="empty-state">🔇 No active connections<br><small style="margin-top: 0.5rem; display: block;">Join a voice channel to get started</small></p>';
        nowPlaying.classList.add('hidden');
        return;
    }

    connectionsList.innerHTML = connections.map(conn => `
        <div class="connection-item">
            <span class="icon">🔊</span>
            <div class="info">
                <div class="name">${escapeHtml(conn.channelName)}</div>
                ${conn.nowPlaying ? `<div class="playing">♪ ${escapeHtml(conn.nowPlaying)}</div>` : '<div class="detail">Idle</div>'}
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

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Render servers list
function renderServers() {
    if (guilds.length === 0) {
        serversList.innerHTML = '<p class="empty-state">🏠 No servers available</p>';
        return;
    }

    serversList.innerHTML = guilds.map(guild => `
        <div class="server-item" data-guild-id="${guild.id}">
            <span class="icon">🏠</span>
            <div class="info">
                <div class="name">${escapeHtml(guild.name)}</div>
                <div class="detail">${guild.memberCount} members</div>
            </div>
        </div>
    `).join('');

    // Update guild select dropdown
    guildSelect.innerHTML = '<option value="">Select server...</option>' +
        guilds.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    
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
            ? '<p class="empty-state">🔍 No matching sounds</p>'
            : '<p class="empty-state">📭 No sounds uploaded yet<br><small style="margin-top: 0.5rem; display: block;">Upload your first sound to get started</small></p>';
        return;
    }

    soundsGrid.innerHTML = filtered.map(sound => `
        <div class="sound-card" data-name="${sound.name}">
            <div class="sound-icon">🎵</div>
            <div class="sound-info">
                <div class="sound-name" title="${escapeHtml(sound.name)}">${escapeHtml(sound.name)}</div>
                <div class="sound-meta">
                    <span class="sound-size">${formatSize(sound.size)}</span>
                </div>
            </div>
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
            playSound(name, e);
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

// Fetch queue data
async function fetchQueue(guildId) {
    if (!guildId) {
        queueData = { nowPlaying: null, queue: [], totalInQueue: 0 };
        renderQueue();
        return;
    }

    try {
        const data = await api(`/queue/${guildId}`);
        queueData = data;
        renderQueue();
    } catch (error) {
        console.error('Failed to fetch queue:', error);
        queueData = { nowPlaying: null, queue: [], totalInQueue: 0 };
        renderQueue();
    }
}

// Render queue
function renderQueue() {
    queueCount.textContent = queueData.totalInQueue || 0;
    
    // Show/hide clear button
    const hasQueue = (queueData.nowPlaying || (queueData.queue && queueData.queue.length > 0));
    clearQueueBtn.style.display = hasQueue ? 'flex' : 'none';

    if (!queueData.nowPlaying && queueData.queue.length === 0) {
        queueList.innerHTML = '<p class="queue-empty">Queue is empty<br><small style="margin-top: 0.5rem; display: block;">Add tracks to start playing</small></p>';
        return;
    }

    let html = '';

    // Now playing item
    if (queueData.nowPlaying) {
        html += `
            <div class="queue-item playing">
                <div class="queue-position">▶</div>
                <div class="queue-item-info">
                    <div class="queue-item-title">${escapeHtml(queueData.nowPlaying)}</div>
                    <div class="queue-item-meta">
                        <span class="queue-item-source">🎵 Now Playing</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Queue items
    if (queueData.queue && queueData.queue.length > 0) {
        html += queueData.queue.map((track, index) => {
            const sourceIcon = track.isLocal ? '📁' : (track.url?.includes('youtube') ? '▶️' : '🎵');
            const sourceText = track.isLocal ? 'Local' : (track.url?.includes('youtube') ? 'YouTube' : 'Stream');
            return `
                <div class="queue-item" data-index="${index}">
                    <div class="queue-position">${index + 1}</div>
                    <div class="queue-item-info">
                        <div class="queue-item-title" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</div>
                        <div class="queue-item-meta">
                            <span class="queue-item-source">${sourceIcon} ${sourceText}</span>
                            ${track.duration ? `<span>${formatDuration(track.duration)}</span>` : ''}
                        </div>
                    </div>
                    <div class="queue-item-actions">
                        <button class="btn btn-danger btn-small remove-queue-item-btn" data-index="${index}">✕</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    queueList.innerHTML = html;

    // Add event listeners for remove buttons
    queueList.querySelectorAll('.remove-queue-item-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = parseInt(e.target.dataset.index);
            await removeFromQueue(index);
        });
    });
}

// Format duration
function formatDuration(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Remove track from queue
async function removeFromQueue(index) {
    const guildId = guildSelect.value;
    if (!guildId) {
        showToast('Please select a server first', 'error');
        return;
    }

    try {
        await api(`/queue/${guildId}/${index}`, { method: 'DELETE' });
        showToast('Track removed from queue');
        await fetchQueue(guildId);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Clear queue
async function clearQueue() {
    const guildId = guildSelect.value;
    if (!guildId) {
        showToast('Please select a server first', 'error');
        return;
    }

    if (!confirm('Clear the entire queue?')) return;

    try {
        await api(`/queue/${guildId}/clear`, { method: 'POST' });
        showToast('Queue cleared');
        await fetchQueue(guildId);
    } catch (error) {
        showToast(error.message, 'error');
    }
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
        
        // Fetch queue if a guild is selected
        if (selectedGuildId) {
            await fetchQueue(selectedGuildId);
        }
    } catch (error) {
        updateStatusDisplay({ online: false });
        // Clear skeleton loaders on error
        connectionsList.innerHTML = '<p class="empty-state">❌ Failed to load connections</p>';
        serversList.innerHTML = '<p class="empty-state">❌ Failed to load servers</p>';
    }
}

// Fetch sounds from API
async function fetchSounds() {
    try {
        // Show skeleton loader
        soundsGrid.innerHTML = `
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
        `;
        
        sounds = await api('/sounds');
        renderSounds(searchInput.value);
    } catch (error) {
        console.error('Failed to fetch sounds:', error);
        soundsGrid.innerHTML = '<p class="empty-state">❌ Failed to load sounds</p>';
    }
}

// Play a sound
async function playSound(source, event) {
    const guildId = guildSelect.value;
    if (!guildId) {
        showToast('Please select a server first', 'error');
        return;
    }

    // Set loading state
    const btn = event?.target?.closest('.play-sound-btn') || event?.target?.closest('#play-url-btn');
    if (btn) {
        btn.classList.add('loading');
        btn.disabled = true;
    }

    try {
        const data = await api('/play', {
            method: 'POST',
            body: JSON.stringify({ guildId, source }),
        });
        showToast(`Added to queue: ${data.title}`);
        await fetchStatus();
        await fetchQueue(guildId);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        if (btn) {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
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
    if (files.length === 0) return;

    // Disable upload button during upload
    const originalText = uploadBtn.textContent;
    uploadBtn.disabled = true;
    uploadBtn.textContent = `Uploading ${files.length} file(s)...`;

    const formData = new FormData();
    // Append all files to the same FormData
    for (const file of files) {
        formData.append('sound', file);
    }

    try {
        const res = await fetch('/api/sounds', {
            method: 'POST',
            credentials: 'include', // Important: include cookies for authentication
            body: formData,
        });
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        // Show success message
        if (data.files && data.files.length > 0) {
            const successCount = data.files.length;
            const failCount = data.errors ? data.errors.length : 0;
            
            if (failCount === 0) {
                showToast(`Successfully uploaded ${successCount} file(s)`);
            } else {
                showToast(`Uploaded ${successCount} file(s), ${failCount} failed`, 'warning');
                console.error('Upload errors:', data.errors);
            }
        } else {
            showToast(data.message || 'Upload completed');
        }

        // Refresh sounds list
        await fetchSounds();
    } catch (error) {
        showToast(`Failed to upload files: ${error.message}`, 'error');
        console.error('Upload error:', error);
    } finally {
        // Re-enable upload button
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
    }
}

// Event Listeners
playUrlBtn.addEventListener('click', (e) => {
    const url = urlInput.value.trim();
    if (!url) {
        showToast('Please enter a URL', 'error');
        return;
    }
    playSound(url, e);
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') playUrlBtn.click();
});

stopBtn.addEventListener('click', stopPlayback);

guildSelect.addEventListener('change', async (e) => {
    selectedGuildId = e.target.value;
    if (selectedGuildId) {
        await fetchQueue(selectedGuildId);
    } else {
        queueData = { nowPlaying: null, queue: [], totalInQueue: 0 };
        renderQueue();
    }
});

searchInput.addEventListener('input', (e) => {
    renderSounds(e.target.value);
    clearSearchBtn.style.display = e.target.value ? 'flex' : 'none';
});

clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    renderSounds('');
});

clearQueueBtn.addEventListener('click', clearQueue);

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
        setInterval(async () => {
            await fetchStatus();
            if (selectedGuildId) {
                await fetchQueue(selectedGuildId);
            }
        }, 5000);
    } else {
        // If not authenticated, check again after a short delay (in case session is still being created)
        setTimeout(() => {
            console.log('Re-checking auth status...');
            checkAuth();
        }, 1000);
    }
});

