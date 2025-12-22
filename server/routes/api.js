const express = require('express');
const multer = require('multer');
const path = require('path');
const voiceManager = require('../../utils/voiceManager');
const storage = require('../../utils/storage');
const server = require('../index');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
// If using S3, we'll handle uploads differently
const storageType = storage.getStorageType();
let upload;

if (storageType === 's3') {
    // For S3, use memory storage and upload directly
    upload = multer({
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
} else {
    // For local storage, use disk storage
    const diskStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            const soundsDir = storage.getSoundsDir();
            cb(null, soundsDir);
        },
        filename: (req, file, cb) => {
            // Sanitize filename
            const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            cb(null, safeName);
        },
    });

    upload = multer({
        storage: diskStorage,
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
}

// GET /api/sounds - List all sounds
router.get('/sounds', async (req, res) => {
    try {
        const sounds = await voiceManager.listSounds();
        res.json(sounds);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/sounds - Upload a sound
router.post('/sounds', requireAuth, upload.single('sound'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        let filename;
        
        if (storageType === 's3') {
            // Upload to S3
            const fileStream = require('stream').Readable.from(req.file.buffer);
            filename = await storage.uploadSound(fileStream, req.file.originalname);
        } else {
            // Local storage - file already saved by multer
            filename = req.file.filename;
        }

        res.json({
            message: 'File uploaded successfully',
            file: {
                name: filename,
                size: req.file.size,
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
        const title = await voiceManager.playSound(guildId, source);
        res.json({ message: 'Playing', title });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/stop - Stop playback
router.post('/stop', requireAuth, (req, res) => {
    const { guildId } = req.body;

    if (!guildId) {
        return res.status(400).json({ error: 'guildId is required' });
    }

    const stopped = voiceManager.stopSound(guildId);
    if (stopped) {
        res.json({ message: 'Playback stopped' });
    } else {
        res.status(400).json({ error: 'Not playing anything' });
    }
});

// GET /api/status - Get bot status
router.get('/status', (req, res) => {
    const client = server.getClient();

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
    const client = server.getClient();

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

// Error handling for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Max size is 50MB.' });
        }
    }
    res.status(400).json({ error: error.message });
});

module.exports = router;

