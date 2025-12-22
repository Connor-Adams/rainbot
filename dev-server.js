const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mock authentication endpoints
app.get('/auth/check', (req, res) => {
    res.json({
        authenticated: true,
        hasAccess: true,
        cached: true,
        user: {
            id: '123456789012345678',
            username: 'devuser',
            discriminator: '0',
            avatar: null,
        }
    });
});

app.get('/auth/me', (req, res) => {
    res.json({
        id: '123456789012345678',
        username: 'devuser',
        discriminator: '0',
        avatar: null,
        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
    });
});

app.get('/auth/discord', (req, res) => {
    // Simulate login redirect
    res.redirect('/');
});

app.get('/auth/logout', (req, res) => {
    res.redirect('/');
});

// Mock API endpoints
app.get('/api/status', (req, res) => {
    res.json({
        online: true,
        username: 'Rainbot',
        discriminator: '0',
        guilds: [
            { id: '111111111111111111', name: 'Test Server 1', memberCount: 42 },
            { id: '222222222222222222', name: 'Test Server 2', memberCount: 128 },
            { id: '333333333333333333', name: 'Test Server 3', memberCount: 256 },
        ],
        connections: [
            { guildId: '111111111111111111', channelName: 'General', nowPlaying: 'Test Song - Artist' },
        ],
    });
});

// Get sounds from actual sounds directory
function getMockSounds() {
    try {
        const soundsDir = path.join(__dirname, 'sounds');
        const files = fs.readdirSync(soundsDir);
        return files
            .filter(file => /\.(mp3|wav|ogg|m4a|webm|flac)$/i.test(file))
            .map(file => {
                const filePath = path.join(soundsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: stats.size,
                };
            });
    } catch (error) {
        // Fallback mock data if sounds directory doesn't exist
        return [
            { name: 'baloons.ogg', size: 102400 },
            { name: 'blowie.ogg', size: 204800 },
            { name: 'dickHead.ogg', size: 153600 },
            { name: 'fruity.ogg', size: 256000 },
            { name: 'ohfuckyeah.ogg', size: 307200 },
            { name: 'ppoundin.ogg', size: 179200 },
            { name: 'theEdge.ogg', size: 230400 },
        ];
    }
}

app.get('/api/sounds', (req, res) => {
    res.json(getMockSounds());
});

app.post('/api/sounds', (req, res) => {
    res.json({
        message: 'Successfully uploaded 1 file(s)',
        files: [{ name: 'test.ogg', originalName: 'test.ogg', size: 1024 }],
    });
});

app.delete('/api/sounds/:name', (req, res) => {
    res.json({ message: 'Sound deleted successfully' });
});

app.post('/api/play', (req, res) => {
    res.json({
        message: 'Playing',
        title: req.body.source.includes('youtube') ? 'YouTube Video' : req.body.source,
        added: 1,
        totalInQueue: 1,
        tracks: [{
            title: req.body.source.includes('youtube') ? 'YouTube Video' : req.body.source,
            url: req.body.source,
            duration: 180,
            isLocal: !req.body.source.startsWith('http'),
        }],
    });
});

app.post('/api/stop', (req, res) => {
    res.json({ message: 'Playback stopped' });
});

app.get('/api/queue/:guildId', (req, res) => {
    res.json({
        nowPlaying: 'Test Song - Artist',
        queue: [
            { title: 'Queued Track 1', url: 'https://example.com/track1', duration: 240, isLocal: false },
            { title: 'Queued Track 2', url: 'https://example.com/track2', duration: 195, isLocal: false },
        ],
        totalInQueue: 2,
    });
});

app.post('/api/queue/:guildId/clear', (req, res) => {
    res.json({ message: 'Cleared 2 tracks', cleared: 2 });
});

app.delete('/api/queue/:guildId/:index', (req, res) => {
    res.json({ message: 'Track removed', track: { title: 'Removed Track' } });
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for all unmatched routes (SPA fallback)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(port, 'localhost', () => {
    console.log(`\n🌧️  Rainbot UI Dev Server`);
    console.log(`   Running at http://localhost:${port}`);
    console.log(`   Serving static files from ./public/`);
    console.log(`   Mock API endpoints enabled (no bot required)`);
    console.log(`   Mock authentication enabled (logged in as devuser)\n`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${port} is already in use.`);
        console.error(`   Try setting a different port: PORT=3002 npm run dev:ui\n`);
        process.exit(1);
    } else {
        console.error(`\n❌ Server error: ${err.message}\n`);
        process.exit(1);
    }
});

