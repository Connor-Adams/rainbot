const express = require('express');
const multer = require('multer');
const voiceManager = require('../../utils/voiceManager');
const storage = require('../../utils/storage');
const clientStore = require('../client');
const { requireAuth } = require('../middleware/auth');
const stats = require('../../utils/statistics');

const router = express.Router();

function getAuthUser(req) {
    const user = req.user || {};
    return {
        id: user.id || null,
        username: user.username || null,
        discriminator: user.discriminator || null,
    };
}

// Configure multer for file uploads
// Always use memory storage - files are uploaded to S3
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /\.(mp3|wav|ogg|m4a|webm|flac)$/i;
        if (allowedTypes.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: mp3, wav, ogg, m4a, webm, flac'));
        }
    },
});

// GET /api/sounds - List all sounds
router.get('/sounds', async (req, res) => {
    try {
        const sounds = await voiceManager.listSounds();
        res.json(sounds);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/sounds/:name/download - Download a sound file
router.get('/sounds/:name/download', async (req, res) => {
    try {
        const filename = req.params.name;
        const stream = await storage.getSoundStream(filename);
        
        // Set headers for download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        
        stream.pipe(res);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});

// POST /api/sounds - Upload one or more sounds
router.post('/sounds', requireAuth, upload.array('sound', 50), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = [];
    const errors = [];

    for (const file of req.files) {
        try {
            // Upload to S3 storage
            const { Readable } = require('stream');
            const fileStream = Readable.from(file.buffer);
            const filename = await storage.uploadSound(fileStream, file.originalname);

            results.push({
                name: filename,
                originalName: file.originalname,
                size: file.size,
            });
        } catch (error) {
            errors.push({
                originalName: file.originalname,
                error: error.message,
            });
        }
    }

    if (results.length === 0) {
        return res.status(500).json({ 
            error: 'All uploads failed',
            errors: errors,
        });
    }

    res.json({
        message: `Successfully uploaded ${results.length} file(s)${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
        files: results,
        errors: errors.length > 0 ? errors : undefined,
    });
});

// DELETE /api/sounds/:name - Delete a sound
router.delete('/sounds/:name', requireAuth, async (req, res) => {
    try {
        await voiceManager.deleteSound(req.params.name);
        res.json({ message: 'Sound deleted successfully' });
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});

// POST /api/play - Play a sound
router.post('/play', requireAuth, async (req, res) => {
    const { guildId, source } = req.body;

    if (!guildId || !source) {
        return res.status(400).json({ error: 'guildId and source are required' });
    }

    try {
        const { id: userId, username, discriminator } = getAuthUser(req);
        // Pass 'api' as source indicator
        const result = await voiceManager.playSound(guildId, source, userId, 'api', username, discriminator);
        
        // Extract title from first track
        const title = result.tracks && result.tracks.length > 0 
            ? result.tracks[0].title 
            : 'Unknown';
        
        // Track API command
        if (userId) {
            stats.trackCommand('play', userId, guildId, 'api', true, null, username, discriminator);
        }
        
        // Sanitize tracks array to remove stream objects (which have circular references)
        const sanitizedTracks = result.tracks ? result.tracks.map(track => ({
            title: track.title,
            url: track.url,
            duration: track.duration,
            isLocal: track.isLocal,
            // Explicitly exclude 'source' and 'isStream' to avoid circular references
        })) : [];
        
        res.json({ 
            message: 'Playing', 
            title,
            added: result.added,
            totalInQueue: result.totalInQueue,
            tracks: sanitizedTracks,
        });
    } catch (error) {
        const { id: userId, username, discriminator } = getAuthUser(req);
        if (userId) {
            stats.trackCommand('play', userId, guildId, 'api', false, error.message, username, discriminator);
        }
        res.status(400).json({ error: error.message });
    }
});

// POST /api/soundboard - Play a soundboard sound with overlay (ducks music)
router.post('/soundboard', requireAuth, async (req, res) => {
    const { guildId, sound } = req.body;

    if (!guildId || !sound) {
        return res.status(400).json({ error: 'guildId and sound are required' });
    }

    try {
        const { id: userId, username, discriminator } = getAuthUser(req);
        const result = await voiceManager.playSoundboardOverlay(guildId, sound, userId, 'api', username, discriminator);
        
        // Track API command
        if (userId) {
            stats.trackCommand('soundboard', userId, guildId, 'api', true, null, username, discriminator);
        }
        
        res.json(result);
    } catch (error) {
        const { id: userId, username, discriminator } = getAuthUser(req);
        if (userId) {
            stats.trackCommand('soundboard', userId, guildId, 'api', false, error.message, username, discriminator);
        }
        res.status(400).json({ error: error.message });
    }
});

// POST /api/stop - Stop playback
router.post('/stop', requireAuth, (req, res) => {
    const { guildId } = req.body;

    if (!guildId) {
        return res.status(400).json({ error: 'guildId is required' });
    }

    const { id: userId, username, discriminator } = getAuthUser(req);
    const stopped = voiceManager.stopSound(guildId);
    if (stopped) {
        // Track stop as clear operation
        if (userId) {
            stats.trackCommand('stop', userId, guildId, 'api', true, null, username, discriminator);
            stats.trackQueueOperation('clear', userId, guildId, 'api', { cleared: 0 });
        }
        res.json({ message: 'Playback stopped' });
    } else {
        if (userId) {
            stats.trackCommand('stop', userId, guildId, 'api', false, 'Not playing anything', username, discriminator);
        }
        res.status(400).json({ error: 'Not playing anything' });
    }
});

// POST /api/skip - Skip to next track
router.post('/skip', requireAuth, (req, res) => {
    const { guildId } = req.body;

    if (!guildId) {
        return res.status(400).json({ error: 'guildId is required' });
    }

    try {
        const { id: userId, username, discriminator } = getAuthUser(req);
        const skipped = voiceManager.skip(guildId);
        if (skipped && skipped.length > 0) {
            // Track API command and queue operation
            if (userId) {
                stats.trackCommand('skip', userId, guildId, 'api', true, null, username, discriminator);
            }
            res.json({ message: `Skipped ${skipped.length} track(s)`, skipped });
        } else {
            if (userId) {
                stats.trackCommand('skip', userId, guildId, 'api', false, 'No track to skip', username, discriminator);
            }
            res.status(400).json({ error: 'No track to skip' });
        }
    } catch (error) {
        const { id: userId, username, discriminator } = getAuthUser(req);
        if (userId) {
            stats.trackCommand('skip', userId, guildId, 'api', false, error.message, username, discriminator);
        }
        res.status(400).json({ error: error.message });
    }
});

// POST /api/pause - Toggle pause/resume
router.post('/pause', requireAuth, (req, res) => {
    const { guildId } = req.body;

    if (!guildId) {
        return res.status(400).json({ error: 'guildId is required' });
    }

    try {
        const { id: userId, username, discriminator } = getAuthUser(req);
        const paused = voiceManager.togglePause(guildId);
        
        // Track API command
        if (userId) {
            stats.trackCommand('pause', userId, guildId, 'api', true, null, username, discriminator);
        }
        
        res.json({ message: paused ? 'Paused' : 'Resumed', paused });
    } catch (error) {
        const { id: userId, username, discriminator } = getAuthUser(req);
        if (userId) {
            stats.trackCommand('pause', userId, guildId, 'api', false, error.message, username, discriminator);
        }
        res.status(400).json({ error: error.message });
    }
});

// POST /api/volume - Set volume
router.post('/volume', requireAuth, (req, res) => {
    const { guildId, level } = req.body;

    if (!guildId) {
        return res.status(400).json({ error: 'guildId is required' });
    }

    if (level === undefined || level === null) {
        return res.status(400).json({ error: 'level is required (1-100)' });
    }

    try {
        const { id: userId, username, discriminator } = getAuthUser(req);
        const volume = voiceManager.setVolume(guildId, level);
        
        if (userId) {
            stats.trackCommand('volume', userId, guildId, 'api', true, null, username, discriminator);
        }
        
        res.json({ message: `Volume set to ${volume}%`, volume });
    } catch (error) {
        const { id: userId, username, discriminator } = getAuthUser(req);
        if (userId) {
            stats.trackCommand('volume', userId, guildId, 'api', false, error.message, username, discriminator);
        }
        res.status(400).json({ error: error.message });
    }
});

// GET /api/status - Get bot status
router.get('/status', (req, res) => {
    const client = clientStore.getClient();

    if (!client || !client.isReady()) {
        return res.json({
            online: false,
            guilds: [],
            connections: [],
        });
    }

    const guilds = client.guilds.cache.map(guild => ({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
    }));

    const connections = voiceManager.getAllConnections();

    res.json({
        online: true,
        username: client.user.username,
        discriminator: client.user.discriminator,
        guilds,
        connections,
    });
});

// GET /api/guilds/:id/channels - Get voice channels for a guild
router.get('/guilds/:id/channels', (req, res) => {
    const client = clientStore.getClient();

    if (!client || !client.isReady()) {
        return res.status(503).json({ error: 'Bot not ready' });
    }

    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) {
        return res.status(404).json({ error: 'Guild not found' });
    }

    const voiceChannels = guild.channels.cache
        .filter(channel => channel.type === 2) // 2 = GuildVoice
        .map(channel => ({
            id: channel.id,
            name: channel.name,
        }));

    res.json(voiceChannels);
});

// GET /api/queue/:guildId - Get queue for a guild
router.get('/queue/:guildId', requireAuth, (req, res) => {
    const { guildId } = req.params;

    try {
        const queue = voiceManager.getQueue(guildId);
        res.json(queue);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/queue/:guildId/clear - Clear the queue
router.post('/queue/:guildId/clear', requireAuth, (req, res) => {
    const { guildId } = req.params;

    try {
        const { id: userId, username, discriminator } = getAuthUser(req);
        const cleared = voiceManager.clearQueue(guildId);
        
        // Track API command
        if (userId) {
            stats.trackCommand('clear', userId, guildId, 'api', true, null, username, discriminator);
        }
        
        res.json({ message: `Cleared ${cleared} tracks`, cleared });
    } catch (error) {
        const { id: userId, username, discriminator } = getAuthUser(req);
        if (userId) {
            stats.trackCommand('clear', userId, guildId, 'api', false, error.message, username, discriminator);
        }
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/queue/:guildId/:index - Remove a track from queue by index
router.delete('/queue/:guildId/:index', requireAuth, (req, res) => {
    const { guildId, index } = req.params;
    const trackIndex = parseInt(index);

    if (isNaN(trackIndex) || trackIndex < 0) {
        return res.status(400).json({ error: 'Invalid index' });
    }

    try {
        const { id: userId, username, discriminator } = getAuthUser(req);
        const removed = voiceManager.removeTrackFromQueue(guildId, trackIndex);
        
        // Track API command
        if (userId) {
            stats.trackCommand('remove', userId, guildId, 'api', true, null, username, discriminator);
        }
        
        res.json({ message: 'Track removed', track: removed });
    } catch (error) {
        const { id: userId, username, discriminator } = getAuthUser(req);
        if (userId) {
            stats.trackCommand('remove', userId, guildId, 'api', false, error.message, username, discriminator);
        }
        res.status(400).json({ error: error.message });
    }
});

// Error handling for multer
router.use((error, req, res, _next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Max size is 50MB.' });
        }
    }
    res.status(400).json({ error: error.message });
});

module.exports = router;
