// Statistics Dashboard
let statsCharts = {};
let statsUpdateInterval = null;
let currentStatsTab = 'summary';

// Initialize statistics dashboard
function initStats() {
    setupTabNavigation();
    loadStatsSummary();
    
    // Set up auto-refresh every 30 seconds
    statsUpdateInterval = setInterval(() => {
        if (currentStatsTab !== 'player' && currentStatsTab !== 'sounds') {
            refreshCurrentStats();
        }
    }, 30000);
}

// Tab navigation
function setupTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show/hide content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none';
            });
            
            if (tabName === 'player') {
                document.getElementById('tab-player').style.display = 'block';
            } else if (tabName === 'sounds') {
                document.getElementById('tab-player').style.display = 'block';
                // Scroll to sounds section
                document.querySelector('.sounds-panel').scrollIntoView({ behavior: 'smooth' });
            } else if (tabName === 'stats') {
                document.getElementById('tab-stats').style.display = 'block';
                currentStatsTab = 'summary';
                if (!document.getElementById('stats-container')) {
                    loadStatsSummary();
                }
            }
        });
    });
}

// Load statistics summary
async function loadStatsSummary() {
    const container = document.getElementById('stats-container');
    container.innerHTML = '<div class="stats-loading">Loading statistics...</div>';
    
    try {
        const data = await api('/stats/summary');
        
        container.innerHTML = `
            <div class="stats-header">
                <h2>Statistics Dashboard</h2>
                <div class="stats-tabs">
                    <button class="stats-tab-btn active" data-stats-tab="summary">Summary</button>
                    <button class="stats-tab-btn" data-stats-tab="commands">Commands</button>
                    <button class="stats-tab-btn" data-stats-tab="sounds">Sounds</button>
                    <button class="stats-tab-btn" data-stats-tab="users">Users</button>
                    <button class="stats-tab-btn" data-stats-tab="guilds">Guilds</button>
                    <button class="stats-tab-btn" data-stats-tab="queue">Queue</button>
                    <button class="stats-tab-btn" data-stats-tab="time">Time Trends</button>
                    <button class="stats-tab-btn" data-stats-tab="history">Listening History</button>
                </div>
            </div>
            <div id="stats-content"></div>
        `;
        
        setupStatsTabs();
        renderStatsSummary(data);
        
        // Set current tab to summary
        currentStatsTab = 'summary';
    } catch (error) {
        container.innerHTML = `<div class="stats-error">Error loading statistics: ${error.message}</div>`;
    }
}

// Setup statistics sub-tabs
function setupStatsTabs() {
    const tabs = document.querySelectorAll('.stats-tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.statsTab;
            currentStatsTab = tabName;
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            switch(tabName) {
                case 'summary':
                    loadStatsSummary();
                    break;
                case 'commands':
                    loadCommandsStats();
                    break;
                case 'sounds':
                    loadSoundsStats();
                    break;
                case 'users':
                    loadUsersStats();
                    break;
                case 'guilds':
                    loadGuildsStats();
                    break;
                case 'queue':
                    loadQueueStats();
                    break;
                case 'time':
                    loadTimeStats();
                    break;
                case 'history':
                    loadHistoryStats();
                    break;
            }
        });
    });
}

// Render summary dashboard
function renderStatsSummary(data) {
    const content = document.getElementById('stats-content');
    content.innerHTML = `
        <div class="stats-summary">
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="stat-value">${data.totalCommands.toLocaleString()}</div>
                    <div class="stat-label">Total Commands</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.totalSounds.toLocaleString()}</div>
                    <div class="stat-label">Sounds Played</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.uniqueUsers.toLocaleString()}</div>
                    <div class="stat-label">Active Users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.uniqueGuilds.toLocaleString()}</div>
                    <div class="stat-label">Active Guilds</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.successRate.toFixed(1)}%</div>
                    <div class="stat-label">Success Rate</div>
                </div>
            </div>
        </div>
    `;
}

// Load commands statistics
async function loadCommandsStats() {
    const content = document.getElementById('stats-content');
    content.innerHTML = '<div class="stats-loading">Loading command statistics...</div>';
    
    try {
        const data = await api('/stats/commands');
        
        content.innerHTML = `
            <div class="stats-section">
                <h3>Top Commands</h3>
                <canvas id="commands-chart"></canvas>
            </div>
            <div class="stats-section">
                <h3>Command Success Rate</h3>
                <canvas id="commands-success-chart"></canvas>
            </div>
            <div class="stats-table-section">
                <h3>Command Details</h3>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Command</th>
                            <th>Count</th>
                            <th>Success</th>
                            <th>Errors</th>
                            <th>Success Rate</th>
                        </tr>
                    </thead>
                    <tbody id="commands-table-body"></tbody>
                </table>
            </div>
        `;
        
        // Render charts
        renderCommandsChart(data.commands);
        renderCommandsSuccessChart(data);
        renderCommandsTable(data.commands);
    } catch (error) {
        content.innerHTML = `<div class="stats-error">Error: ${error.message}</div>`;
    }
}

// Render commands bar chart
function renderCommandsChart(commands) {
    const ctx = document.getElementById('commands-chart');
    if (!ctx) return;
    
    if (statsCharts.commands) {
        statsCharts.commands.destroy();
    }
    
    const top10 = commands.slice(0, 10);
    statsCharts.commands = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10.map(c => c.command_name),
            datasets: [{
                label: 'Usage Count',
                data: top10.map(c => parseInt(c.count)),
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render commands success rate chart
function renderCommandsSuccessChart(data) {
    const ctx = document.getElementById('commands-success-chart');
    if (!ctx) return;
    
    if (statsCharts.commandsSuccess) {
        statsCharts.commandsSuccess.destroy();
    }
    
    statsCharts.commandsSuccess = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Success', 'Errors'],
            datasets: [{
                data: [data.total - (data.total - data.commands.reduce((sum, c) => sum + parseInt(c.success_count || 0), 0)), 
                       data.total - data.commands.reduce((sum, c) => sum + parseInt(c.success_count || 0), 0)],
                backgroundColor: ['rgba(34, 197, 94, 0.5)', 'rgba(239, 68, 68, 0.5)'],
                borderColor: ['rgba(34, 197, 94, 1)', 'rgba(239, 68, 68, 1)'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true
        }
    });
}

// Render commands table
function renderCommandsTable(commands) {
    const tbody = document.getElementById('commands-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = commands.map(cmd => {
        const successCount = parseInt(cmd.success_count || 0);
        const errorCount = parseInt(cmd.error_count || 0);
        const total = successCount + errorCount;
        const successRate = total > 0 ? ((successCount / total) * 100).toFixed(1) : 0;
        
        return `
            <tr>
                <td>${escapeHtml(cmd.command_name)}</td>
                <td>${parseInt(cmd.count).toLocaleString()}</td>
                <td>${successCount.toLocaleString()}</td>
                <td>${errorCount.toLocaleString()}</td>
                <td>${successRate}%</td>
            </tr>
        `;
    }).join('');
}

// Load sounds statistics
async function loadSoundsStats() {
    const content = document.getElementById('stats-content');
    content.innerHTML = '<div class="stats-loading">Loading sound statistics...</div>';
    
    try {
        const data = await api('/stats/sounds');
        
        content.innerHTML = `
            <div class="stats-section">
                <h3>Top Sounds</h3>
                <canvas id="sounds-chart"></canvas>
            </div>
            <div class="stats-section">
                <h3>Source Type Breakdown</h3>
                <canvas id="sounds-source-chart"></canvas>
            </div>
            <div class="stats-section">
                <h3>Soundboard vs Regular</h3>
                <canvas id="sounds-soundboard-chart"></canvas>
            </div>
        `;
        
        renderSoundsChart(data.sounds);
        renderSoundsSourceChart(data.sourceTypes);
        renderSoundsSoundboardChart(data.soundboardBreakdown);
    } catch (error) {
        content.innerHTML = `<div class="stats-error">Error: ${error.message}</div>`;
    }
}

// Render sounds chart
function renderSoundsChart(sounds) {
    const ctx = document.getElementById('sounds-chart');
    if (!ctx) return;
    
    if (statsCharts.sounds) {
        statsCharts.sounds.destroy();
    }
    
    const top10 = sounds.slice(0, 10);
    statsCharts.sounds = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10.map(s => s.sound_name.length > 30 ? s.sound_name.substring(0, 30) + '...' : s.sound_name),
            datasets: [{
                label: 'Play Count',
                data: top10.map(s => parseInt(s.count)),
                backgroundColor: 'rgba(139, 92, 246, 0.5)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render sounds source type chart
function renderSoundsSourceChart(sourceTypes) {
    const ctx = document.getElementById('sounds-source-chart');
    if (!ctx) return;
    
    if (statsCharts.soundsSource) {
        statsCharts.soundsSource.destroy();
    }
    
    statsCharts.soundsSource = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: sourceTypes.map(s => s.source_type),
            datasets: [{
                data: sourceTypes.map(s => parseInt(s.count)),
                backgroundColor: [
                    'rgba(59, 130, 246, 0.5)',
                    'rgba(239, 68, 68, 0.5)',
                    'rgba(34, 197, 94, 0.5)',
                    'rgba(251, 146, 60, 0.5)',
                    'rgba(168, 85, 247, 0.5)'
                ]
            }]
        },
        options: {
            responsive: true
        }
    });
}

// Render soundboard chart
function renderSoundsSoundboardChart(breakdown) {
    const ctx = document.getElementById('sounds-soundboard-chart');
    if (!ctx) return;
    
    if (statsCharts.soundsSoundboard) {
        statsCharts.soundsSoundboard.destroy();
    }
    
    statsCharts.soundsSoundboard = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: breakdown.map(b => b.is_soundboard ? 'Soundboard' : 'Regular'),
            datasets: [{
                data: breakdown.map(b => parseInt(b.count)),
                backgroundColor: ['rgba(139, 92, 246, 0.5)', 'rgba(59, 130, 246, 0.5)']
            }]
        },
        options: {
            responsive: true
        }
    });
}

// Load users statistics
async function loadUsersStats() {
    const content = document.getElementById('stats-content');
    content.innerHTML = '<div class="stats-loading">Loading user statistics...</div>';
    
    try {
        const data = await api('/stats/users');
        
        content.innerHTML = `
            <div class="stats-table-section">
                <h3>Top Users</h3>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>User ID</th>
                            <th>Guild ID</th>
                            <th>Commands</th>
                            <th>Sounds</th>
                            <th>Total</th>
                            <th>Last Active</th>
                        </tr>
                    </thead>
                    <tbody id="users-table-body"></tbody>
                </table>
            </div>
        `;
        
        renderUsersTable(data.users);
    } catch (error) {
        content.innerHTML = `<div class="stats-error">Error: ${error.message}</div>`;
    }
}

// Render users table
function renderUsersTable(users) {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = users.map(user => {
        const commandCount = parseInt(user.command_count || 0);
        const soundCount = parseInt(user.sound_count || 0);
        const total = commandCount + soundCount;
        const lastActive = user.last_active ? new Date(user.last_active).toLocaleString() : 'Never';
        
        return `
            <tr>
                <td>${escapeHtml(user.user_id)}</td>
                <td>${escapeHtml(user.guild_id)}</td>
                <td>${commandCount.toLocaleString()}</td>
                <td>${soundCount.toLocaleString()}</td>
                <td>${total.toLocaleString()}</td>
                <td>${lastActive}</td>
            </tr>
        `;
    }).join('');
}

// Load guilds statistics
async function loadGuildsStats() {
    const content = document.getElementById('stats-content');
    content.innerHTML = '<div class="stats-loading">Loading guild statistics...</div>';
    
    try {
        const data = await api('/stats/guilds');
        
        content.innerHTML = `
            <div class="stats-table-section">
                <h3>Top Guilds</h3>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Guild ID</th>
                            <th>Commands</th>
                            <th>Sounds</th>
                            <th>Unique Users</th>
                            <th>Total</th>
                            <th>Last Active</th>
                        </tr>
                    </thead>
                    <tbody id="guilds-table-body"></tbody>
                </table>
            </div>
        `;
        
        renderGuildsTable(data.guilds);
    } catch (error) {
        content.innerHTML = `<div class="stats-error">Error: ${error.message}</div>`;
    }
}

// Render guilds table
function renderGuildsTable(guilds) {
    const tbody = document.getElementById('guilds-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = guilds.map(guild => {
        const commandCount = parseInt(guild.command_count || 0);
        const soundCount = parseInt(guild.sound_count || 0);
        const total = commandCount + soundCount;
        const lastActive = guild.last_active ? new Date(guild.last_active).toLocaleString() : 'Never';
        
        return `
            <tr>
                <td>${escapeHtml(guild.guild_id)}</td>
                <td>${commandCount.toLocaleString()}</td>
                <td>${soundCount.toLocaleString()}</td>
                <td>${parseInt(guild.unique_users || 0).toLocaleString()}</td>
                <td>${total.toLocaleString()}</td>
                <td>${lastActive}</td>
            </tr>
        `;
    }).join('');
}

// Load queue statistics
async function loadQueueStats() {
    const content = document.getElementById('stats-content');
    content.innerHTML = '<div class="stats-loading">Loading queue statistics...</div>';
    
    try {
        const data = await api('/stats/queue');
        
        content.innerHTML = `
            <div class="stats-section">
                <h3>Queue Operations</h3>
                <canvas id="queue-chart"></canvas>
            </div>
        `;
        
        renderQueueChart(data.operations);
    } catch (error) {
        content.innerHTML = `<div class="stats-error">Error: ${error.message}</div>`;
    }
}

// Render queue chart
function renderQueueChart(operations) {
    const ctx = document.getElementById('queue-chart');
    if (!ctx) return;
    
    if (statsCharts.queue) {
        statsCharts.queue.destroy();
    }
    
    statsCharts.queue = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: operations.map(o => o.operation_type),
            datasets: [{
                label: 'Count',
                data: operations.map(o => parseInt(o.count)),
                backgroundColor: 'rgba(251, 146, 60, 0.5)',
                borderColor: 'rgba(251, 146, 60, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Load time trends statistics
async function loadTimeStats() {
    const content = document.getElementById('stats-content');
    content.innerHTML = '<div class="stats-loading">Loading time trends...</div>';
    
    try {
        const granularity = 'day';
        const data = await api(`/stats/time?granularity=${granularity}`);
        
        content.innerHTML = `
            <div class="stats-section">
                <h3>Usage Over Time</h3>
                <canvas id="time-chart"></canvas>
            </div>
        `;
        
        renderTimeChart(data);
    } catch (error) {
        content.innerHTML = `<div class="stats-error">Error: ${error.message}</div>`;
    }
}

// Render time trends chart
function renderTimeChart(data) {
    const ctx = document.getElementById('time-chart');
    if (!ctx) return;
    
    if (statsCharts.time) {
        statsCharts.time.destroy();
    }
    
    // Combine commands and sounds data by date
    const dates = [...new Set([
        ...data.commands.map(c => c.date),
        ...data.sounds.map(s => s.date)
    ])].sort();
    
    const commandData = dates.map(date => {
        const cmd = data.commands.find(c => c.date === date);
        return cmd ? parseInt(cmd.command_count) : 0;
    });
    
    const soundData = dates.map(date => {
        const snd = data.sounds.find(s => s.date === date);
        return snd ? parseInt(snd.sound_count) : 0;
    });
    
    statsCharts.time = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => new Date(d).toLocaleDateString()),
            datasets: [
                {
                    label: 'Commands',
                    data: commandData,
                    borderColor: 'rgba(59, 130, 246, 1)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4
                },
                {
                    label: 'Sounds',
                    data: soundData,
                    borderColor: 'rgba(139, 92, 246, 1)',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Refresh current statistics
function refreshCurrentStats() {
    switch(currentStatsTab) {
        case 'summary':
            loadStatsSummary();
            break;
        case 'commands':
            loadCommandsStats();
            break;
        case 'sounds':
            loadSoundsStats();
            break;
        case 'users':
            loadUsersStats();
            break;
        case 'guilds':
            loadGuildsStats();
            break;
        case 'queue':
            loadQueueStats();
            break;
        case 'time':
            loadTimeStats();
            break;
        case 'history':
            loadHistoryStats();
            break;
    }
}

// Format duration helper
function formatDuration(seconds) {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Load listening history statistics
async function loadHistoryStats() {
    const content = document.getElementById('stats-content');
    content.innerHTML = '<div class="stats-loading">Loading listening history...</div>';
    
    try {
        // Get current user info
        let userId = null;
        try {
            const userRes = await fetch('/auth/me');
            if (userRes.ok) {
                const user = await userRes.json();
                userId = user.id;
            }
        } catch (e) {
            console.error('Failed to get user info:', e);
        }
        
        if (!userId) {
            content.innerHTML = '<div class="stats-error">Please log in to view your listening history</div>';
            return;
        }
        
        const guildId = document.getElementById('guild-select')?.value || null;
        
        const params = new URLSearchParams();
        params.append('userId', userId);
        if (guildId) params.append('guildId', guildId);
        params.append('limit', '100');
        
        const data = await api(`/stats/history?${params.toString()}`);
        
        content.innerHTML = `
            <div class="stats-section">
                <h3>Your Listening History</h3>
                <div class="history-filters" style="margin-bottom: 1rem;">
                    <input type="date" id="history-start-date" placeholder="Start date" />
                    <input type="date" id="history-end-date" placeholder="End date" />
                    <button class="btn btn-secondary" id="history-filter-btn">Filter</button>
                </div>
                <div id="history-list" class="history-list"></div>
            </div>
        `;
        
        renderHistoryList(data.history || []);
        
        // Set up filter
        document.getElementById('history-filter-btn').addEventListener('click', async () => {
            const startDate = document.getElementById('history-start-date').value;
            const endDate = document.getElementById('history-end-date').value;
            const filterParams = new URLSearchParams();
            if (userId) filterParams.append('userId', userId);
            if (guildId) filterParams.append('guildId', guildId);
            if (startDate) filterParams.append('startDate', startDate);
            if (endDate) filterParams.append('endDate', endDate);
            filterParams.append('limit', '100');
            
            const filteredData = await api(`/stats/history?${filterParams.toString()}`);
            renderHistoryList(filteredData.history || []);
        });
    } catch (error) {
        content.innerHTML = `<div class="stats-error">Error: ${error.message}</div>`;
    }
}

// Render listening history list
function renderHistoryList(history) {
    const container = document.getElementById('history-list');
    if (!container) return;
    
    if (history.length === 0) {
        container.innerHTML = '<p class="empty-state">No listening history found</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Track</th>
                    <th>Source</th>
                    <th>Duration</th>
                    <th>Played At</th>
                </tr>
            </thead>
            <tbody>
                ${history.map(entry => {
                    const playedAt = new Date(entry.played_at);
                    const sourceIcon = entry.source_type === 'youtube' ? '▶️' :
                                      entry.source_type === 'spotify' ? '🎵' :
                                      entry.source_type === 'soundcloud' ? '🎧' :
                                      entry.source_type === 'local' ? '📁' : '🎵';
                    const duration = entry.duration ? formatDuration(entry.duration) : '-';
                    
                    return `
                        <tr>
                            <td>
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    ${entry.is_soundboard ? '🔊' : ''}
                                    <span>${escapeHtml(entry.track_title)}</span>
                                </div>
                            </td>
                            <td>${sourceIcon} ${entry.source_type}</td>
                            <td>${duration}</td>
                            <td>${playedAt.toLocaleString()}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStats);
} else {
    initStats();
}

