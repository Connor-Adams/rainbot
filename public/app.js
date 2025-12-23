// State
let guilds = [];
let sounds = [];
let connections = [];
let selectedGuildId = null;
let isAuthenticated = false;
let queueData = { nowPlaying: null, queue: [], totalInQueue: 0 };
let serverSelector = null;

// DOM Elements
const botStatus = document.getElementById('bot-status');
const connectionsList = document.getElementById('connections-list');
const serversList = document.getElementById('servers-list');
const urlInput = document.getElementById('url-input');
const playUrlBtn = document.getElementById('play-url-btn');
const stopBtn = document.getElementById('stop-btn');
// Removed old nowPlaying elements - using nowPlayingCard instead
const soundsGrid = document.getElementById('sounds-grid');
const searchInput = document.getElementById('search-input');
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const uploadArea = document.getElementById('upload-area');
const toastContainer = document.getElementById('toast-container');
const loadingOverlay = document.getElementById('loading-overlay');
const loginBtn = document.getElementById('login-btn');
const loginBtnCentered = document.getElementById('login-btn-centered');
const loginContainer = document.getElementById('login-container');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const queueList = document.getElementById('queue-list');
const queueCount = document.getElementById('queue-count');
const clearSearchBtn = document.getElementById('clear-search-btn');
const clearQueueBtn = document.getElementById('clear-queue-btn');
const nowPlayingCard = document.getElementById('now-playing-card');
const trackTitle = document.getElementById('track-title');
const trackArtist = document.getElementById('track-artist');
const progressFill = document.getElementById('progress-fill');
const progressHandle = document.getElementById('progress-handle');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const playPauseBtn = document.getElementById('play-pause-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const progressBar = document.getElementById('progress-bar');
const trackLink = document.getElementById('track-link');

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
        connectionsList.innerHTML = '<p class="empty-state text-gray-500 text-sm text-center py-8 px-6 flex flex-col items-center gap-2"><span class="text-2xl opacity-50">🔇</span>No active connections<br><small class="block mt-2 text-xs">Join a voice channel to get started</small></p>';
        nowPlayingCard.style.display = 'none';
        return;
    }

    connectionsList.innerHTML = connections.map(conn => `
        <div class="connection-item flex items-center gap-3">
            <span class="icon text-xl">🔊</span>
            <div class="info flex-1 min-w-0">
                <div class="name text-sm font-medium text-white whitespace-nowrap overflow-hidden text-ellipsis">${escapeHtml(conn.channelName)}</div>
                ${conn.nowPlaying ? `<div class="playing text-xs text-green-500 font-mono">♪ ${escapeHtml(conn.nowPlaying)}</div>` : '<div class="detail text-xs text-gray-500">Idle</div>'}
            </div>
        </div>
    `).join('');

    // Update now playing card - use queueData.currentTrack if available
    const playing = connections.find(c => c.nowPlaying);
    if (playing && selectedGuildId) {
        // Use currentTrack from queueData if available, otherwise use connection data
        const title = queueData.currentTrack?.title || playing.nowPlaying;
        updateNowPlayingCard(title, selectedGuildId);
    } else {
        nowPlayingCard.style.display = 'none';
    }
}

// Update Spotify-like now playing card
function updateNowPlayingCard(title, guildId) {
    if (!title || !guildId) {
        nowPlayingCard.style.display = 'none';
        return;
    }

    nowPlayingCard.style.display = 'block';
    trackTitle.textContent = title;
    
    // Get current track from queueData (includes currentTrack from API)
    const currentTrack = queueData.currentTrack;
    const currentQueue = queueData.queue || [];
    const nowPlayingTrack = currentTrack || currentQueue.find(t => t.title === title) || 
                           (queueData.nowPlaying === title ? { isLocal: false } : null);
    
    if (nowPlayingTrack) {
        // Update artist/source
        if (nowPlayingTrack.isLocal) {
            trackArtist.textContent = 'Local Sound';
            trackLink.style.display = 'none';
        } else if (nowPlayingTrack.spotifyUrl || nowPlayingTrack.spotifyId) {
            trackArtist.textContent = 'Spotify';
            // Use Spotify URL if available, otherwise use YouTube URL
            if (nowPlayingTrack.spotifyUrl) {
                trackLink.href = nowPlayingTrack.spotifyUrl;
                trackLink.style.display = 'flex';
            } else if (nowPlayingTrack.url) {
                trackLink.href = nowPlayingTrack.url;
                trackLink.style.display = 'flex';
            } else {
                trackLink.style.display = 'none';
            }
        } else if (nowPlayingTrack.url?.includes('youtube') || nowPlayingTrack.url?.includes('youtu.be')) {
            trackArtist.textContent = 'YouTube';
            trackLink.href = nowPlayingTrack.url;
            trackLink.style.display = 'flex';
        } else if (nowPlayingTrack.url?.includes('soundcloud')) {
            trackArtist.textContent = 'SoundCloud';
            trackLink.href = nowPlayingTrack.url;
            trackLink.style.display = 'flex';
        } else if (nowPlayingTrack.url) {
            trackArtist.textContent = 'Stream';
            trackLink.href = nowPlayingTrack.url;
            trackLink.style.display = 'flex';
        } else {
            trackArtist.textContent = 'Playing';
            trackLink.style.display = 'none';
        }
        
        // Update total time if available
        if (nowPlayingTrack.duration) {
            totalTimeEl.textContent = formatDuration(nowPlayingTrack.duration);
        }
    } else {
        trackArtist.textContent = 'Playing';
        trackLink.style.display = 'none';
    }

    // Update play/pause button state - will be updated when we fetch status
    // The button state is managed by the pause endpoint response

    // Update progress (simulated for now - would need real-time updates)
    updateProgress(0, nowPlayingTrack?.duration || 0);
}

// Update progress bar
function updateProgress(current, total) {
    if (total > 0) {
        const percentage = (current / total) * 100;
        progressFill.style.width = `${percentage}%`;
        progressHandle.style.left = `${percentage}%`;
        currentTimeEl.textContent = formatDuration(current);
        totalTimeEl.textContent = formatDuration(total);
    } else {
        progressFill.style.width = '0%';
        progressHandle.style.left = '0%';
        currentTimeEl.textContent = '0:00';
        totalTimeEl.textContent = '0:00';
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
        serversList.innerHTML = '<p class="empty-state text-gray-500 text-sm text-center py-8 px-6 flex flex-col items-center gap-2"><span class="text-2xl opacity-50">🏠</span>No servers available</p>';
        return;
    }

    serversList.innerHTML = guilds.map(guild => `
        <div class="server-item flex items-center gap-3" data-guild-id="${guild.id}">
            <span class="icon text-xl">🏠</span>
            <div class="info flex-1 min-w-0">
                <div class="name text-sm font-medium text-white whitespace-nowrap overflow-hidden text-ellipsis">${escapeHtml(guild.name)}</div>
                <div class="detail text-xs text-gray-500">${guild.memberCount} members</div>
            </div>
        </div>
    `).join('');

    // Update server selector component
    if (serverSelector) {
        serverSelector.setGuilds(guilds);
        // Restore persisted selection if available
        const persistedId = serverSelector.getSelectedGuildId();
        if (persistedId) {
            selectedGuildId = persistedId;
            // Trigger queue fetch if we have a persisted selection
            fetchQueue(persistedId);
        }
    }
}

// Render sounds grid
function renderSounds(filter = '') {
    const filtered = sounds.filter(s => 
        s.name.toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
        soundsGrid.innerHTML = filter 
            ? '<p class="empty-state text-gray-500 text-sm text-center py-8 px-6 flex flex-col items-center gap-2"><span class="text-2xl opacity-50">🔍</span>No matching sounds</p>'
            : '<p class="empty-state text-gray-500 text-sm text-center py-8 px-6 flex flex-col items-center gap-2"><span class="text-2xl opacity-50">📭</span>No sounds uploaded yet<br><small class="block mt-2 text-xs">Upload your first sound to get started</small></p>';
        return;
    }

    soundsGrid.innerHTML = filtered.map(sound => `
        <div class="sound-card bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-col gap-3 transition-all hover:border-blue-500 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/20 hover:bg-gray-800" data-name="${sound.name}">
            <div class="sound-icon text-3xl text-center">🎵</div>
            <div class="sound-info flex flex-col gap-1 flex-1">
                <div class="sound-name text-sm font-medium text-white whitespace-nowrap overflow-hidden text-ellipsis text-center" title="${escapeHtml(sound.name)}">${escapeHtml(sound.name)}</div>
                <div class="sound-meta flex items-center justify-center gap-2 flex-wrap">
                    <span class="sound-size text-xs text-gray-500 font-mono">${formatSize(sound.size)}</span>
                </div>
            </div>
            <div class="sound-actions flex gap-2 mt-auto">
                <button class="btn btn-primary btn-small play-sound-btn flex-1">▶</button>
                <button class="btn btn-danger btn-small delete-sound-btn flex-1">✕</button>
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

    // Update now playing card
    if (queueData.nowPlaying && selectedGuildId) {
        updateNowPlayingCard(queueData.nowPlaying, selectedGuildId);
    }

    if (!queueData.nowPlaying && queueData.queue.length === 0) {
        queueList.innerHTML = '<p class="queue-empty text-center py-8 text-gray-500"><span class="block text-2xl mb-2 opacity-50">🎵</span>Queue is empty<br><small class="block mt-2 text-sm">Add tracks to start playing</small></p>';
        return;
    }

    let html = '';

    // Queue items (now playing is shown in the card, not in queue list)
    if (queueData.queue && queueData.queue.length > 0) {
        html += queueData.queue.map((track, index) => {
            let sourceIcon, sourceText;
            if (track.isLocal) {
                sourceIcon = '📁';
                sourceText = 'Local';
            } else if (track.spotifyUrl || track.spotifyId) {
                sourceIcon = '🎵';
                sourceText = 'Spotify';
            } else if (track.url?.includes('youtube')) {
                sourceIcon = '▶️';
                sourceText = 'YouTube';
            } else if (track.url?.includes('soundcloud')) {
                sourceIcon = '🎧';
                sourceText = 'SoundCloud';
            } else {
                sourceIcon = '🎵';
                sourceText = 'Stream';
            }
            return `
                <div class="queue-item flex items-center gap-3 px-3 py-3 bg-gray-900 border border-gray-700 rounded-lg transition-all hover:border-blue-500 hover:bg-gray-800 hover:translate-x-1 hover:shadow-lg hover:shadow-blue-500/20" data-index="${index}">
                    <div class="queue-position w-6 h-6 flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-500 text-white rounded-full text-xs font-bold flex-shrink-0 shadow-lg shadow-blue-500/40">${index + 1}</div>
                    <div class="queue-item-info flex-1 min-w-0">
                        <div class="queue-item-title text-sm font-semibold text-white whitespace-nowrap overflow-hidden text-ellipsis mb-1" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</div>
                        <div class="queue-item-meta flex items-center gap-3 text-xs text-gray-400 font-medium">
                            <span class="queue-item-source flex items-center gap-1">${sourceIcon} ${sourceText}</span>
                            ${track.duration ? `<span>${formatDuration(track.duration)}</span>` : ''}
                        </div>
                    </div>
                    <div class="queue-item-actions flex gap-2">
                        <button class="btn btn-danger btn-small remove-queue-item-btn px-2 py-2 min-w-[36px] h-9 rounded-full transition-all hover:scale-110 hover:shadow-md" data-index="${index}" title="Remove">✕</button>
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
    const guildId = serverSelector ? serverSelector.getSelectedGuildId() : null;
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
    const guildId = serverSelector ? serverSelector.getSelectedGuildId() : null;
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
    const guildId = serverSelector ? serverSelector.getSelectedGuildId() : null;
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
    const guildId = serverSelector ? serverSelector.getSelectedGuildId() : null;
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

// Server selector change handler (set up during initialization)
function handleServerSelectorChange(guildId) {
    selectedGuildId = guildId;
    if (selectedGuildId) {
        fetchQueue(selectedGuildId);
    } else {
        queueData = { nowPlaying: null, queue: [], totalInQueue: 0 };
        renderQueue();
    }
}

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

// Player control event listeners
playPauseBtn.addEventListener('click', async () => {
    const guildId = serverSelector ? serverSelector.getSelectedGuildId() : null;
    if (!guildId) {
        showToast('Please select a server first', 'error');
        return;
    }
    
    playPauseBtn.disabled = true;
    
    try {
        const data = await api('/pause', {
            method: 'POST',
            body: JSON.stringify({ guildId }),
        });
        
        // Update button state
        const playIcon = playPauseBtn.querySelector('.play-icon');
        const pauseIcon = playPauseBtn.querySelector('.pause-icon');
        
        if (data.paused) {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        } else {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        }
        
        await fetchStatus();
        await fetchQueue(guildId);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        playPauseBtn.disabled = false;
    }
});

prevBtn.addEventListener('click', async () => {
    const guildId = serverSelector ? serverSelector.getSelectedGuildId() : null;
    if (!guildId) {
        showToast('Please select a server first', 'error');
        return;
    }
    // Previous track not implemented yet - would need history
    showToast('Previous track functionality coming soon', 'info');
});

nextBtn.addEventListener('click', async () => {
    const guildId = serverSelector ? serverSelector.getSelectedGuildId() : null;
    if (!guildId) {
        showToast('Please select a server first', 'error');
        return;
    }
    
    // Add loading state
    nextBtn.disabled = true;
    
    try {
        await api('/skip', {
            method: 'POST',
            body: JSON.stringify({ guildId }),
        });
        showToast('Skipped to next track');
        await fetchStatus();
        await fetchQueue(guildId);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        nextBtn.disabled = false;
    }
});

// Progress bar interaction
let isDragging = false;
progressBar.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateProgressFromEvent(e);
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        updateProgressFromEvent(e);
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});

function updateProgressFromEvent(e) {
    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    progressFill.style.width = `${percentage}%`;
    progressHandle.style.left = `${percentage}%`;
    // Would seek to position here if API supported it
}

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
    loginBtn.style.display = 'none';
    loginContainer.style.display = 'flex';
    userInfo.style.display = 'none';
    document.querySelector('.main').style.display = 'none';
    // Hide status in header when showing login
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        const status = headerRight.querySelector('.status');
        if (status) status.style.display = 'none';
    }
}

function showDashboardUI() {
    loadingOverlay.style.display = 'none';
    loginBtn.style.display = 'none';
    loginContainer.style.display = 'none';
    userInfo.style.display = 'flex';
    document.querySelector('.main').style.display = 'flex';
    // Show status in header when showing dashboard
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        const status = headerRight.querySelector('.status');
        if (status) status.style.display = 'flex';
    }
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

// Login button handlers
loginBtn.addEventListener('click', () => {
    window.location.href = '/auth/discord';
});

loginBtnCentered.addEventListener('click', () => {
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

// Initialize server selector component
function initServerSelector() {
    if (typeof ServerSelector === 'undefined') {
        console.error('ServerSelector component not loaded');
        return;
    }

    serverSelector = new ServerSelector('server-selector-container', {
        onChange: handleServerSelectorChange
    });

    // Set up context-aware visibility based on active tab
    window.updateServerSelectorVisibility();
    
    // Set up basic tab navigation if not already handled by stats.js
    // This ensures server selector visibility updates when tabs change
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
        // Check if tab already has click handler (from stats.js)
        // If not, add one
        if (!tab.dataset.hasHandler) {
            tab.dataset.hasHandler = 'true';
            tab.addEventListener('click', () => {
                setTimeout(() => {
                    if (window.updateServerSelectorVisibility) {
                        window.updateServerSelectorVisibility();
                    }
                }, 100);
            });
        }
    });
}

// Update server selector visibility based on active tab (global function)
window.updateServerSelectorVisibility = function() {
    if (!serverSelector) return;

    const activeTab = document.querySelector('.nav-tab.active');
    if (!activeTab) {
        serverSelector.hide();
        return;
    }

    const tabName = activeTab.dataset.tab;
    // Show selector in Player, Sounds, and Stats tabs
    const shouldShow = ['player', 'sounds', 'stats'].includes(tabName);
    
    if (shouldShow) {
        serverSelector.show();
    } else {
        serverSelector.hide();
    }
}

// Initial load - check auth first
checkAuth().then(authenticated => {
    if (authenticated) {
        // Initialize server selector after auth
        initServerSelector();
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
            checkAuth().then(auth => {
                if (auth) {
                    initServerSelector();
                }
            });
        }, 1000);
    }
});

