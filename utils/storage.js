const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');
const { loadConfig } = require('./config');

const log = createLogger('STORAGE');

let s3Client = null;
let storageType = 'local';
let bucketName = null;
let soundsDir = null;

/**
 * Initialize storage - supports local filesystem or Railway S3-compatible buckets
 */
function initStorage() {
    const config = loadConfig();
    
    // Log which storage config vars are present
    // Railway auto-injects: BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT, REGION
    const storageVars = {
        'bucket (BUCKET)': !!config.storageBucketName,
        'accessKey (ACCESS_KEY_ID)': !!config.storageAccessKey,
        'secretKey (SECRET_ACCESS_KEY)': !!config.storageSecretKey,
        'endpoint (ENDPOINT)': !!config.storageEndpoint,
    };
    
    const missingVars = Object.entries(storageVars)
        .filter(([, present]) => !present)
        .map(([name]) => name);
    
    const presentVars = Object.entries(storageVars)
        .filter(([, present]) => present)
        .map(([name]) => name);
    
    if (presentVars.length > 0) {
        log.debug(`S3 config present: ${presentVars.join(', ')}`);
    }
    if (missingVars.length > 0 && presentVars.length > 0) {
        log.warn(`S3 config MISSING: ${missingVars.join(', ')} - will use local storage`);
    }
    
    // Check if Railway storage is configured (ALL vars required)
    if (config.storageBucketName && config.storageAccessKey && config.storageSecretKey && config.storageEndpoint) {
        try {
            // Use Railway S3-compatible storage
            const { S3Client } = require('@aws-sdk/client-s3');
            
            s3Client = new S3Client({
                endpoint: config.storageEndpoint,
                region: config.storageRegion || 'us-east-1',
                credentials: {
                    accessKeyId: config.storageAccessKey,
                    secretAccessKey: config.storageSecretKey,
                },
                forcePathStyle: true, // Required for Railway
            });
            
            bucketName = config.storageBucketName;
            storageType = 's3';
            
            log.info(`✓ Storage initialized: S3 bucket "${bucketName}" at ${config.storageEndpoint}`);
        } catch (error) {
            log.error(`✗ Failed to initialize S3 storage: ${error.message}`);
            log.warn('Falling back to local storage');
            initLocalStorage();
        }
    } else {
        // Use local filesystem storage
        if (missingVars.length === 4) {
            log.info('No S3 storage configured, using local filesystem');
        }
        initLocalStorage();
    }
}

/**
 * Initialize local filesystem storage
 */
function initLocalStorage() {
    storageType = 'local';
    soundsDir = path.join(__dirname, '..', 'sounds');
    
    // Ensure sounds directory exists
    if (!fs.existsSync(soundsDir)) {
        fs.mkdirSync(soundsDir, { recursive: true });
    }
    
    log.info(`✓ Storage initialized: Local filesystem (${soundsDir})`);
}

/**
 * List all sound files
 * Combines sounds from S3 and local storage (for migration compatibility)
 */
async function listSounds() {
    const sounds = [];
    const seenNames = new Set();
    
    if (storageType === 's3') {
        const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
        
        try {
            const command = new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: 'sounds/',
            });
            
            const response = await s3Client.send(command);
            
            if (response.Contents) {
                response.Contents
                    .filter(obj => /\.(mp3|wav|ogg|m4a|webm|flac)$/i.test(obj.Key))
                    .forEach(obj => {
                        const name = path.basename(obj.Key);
                        if (!seenNames.has(name)) {
                            sounds.push({
                                name: name,
                                size: obj.Size,
                                createdAt: obj.LastModified,
                                source: 's3',
                            });
                            seenNames.add(name);
                        }
                    });
            }
        } catch (error) {
            log.warn(`Error listing sounds from S3: ${error.message}, continuing with local storage...`);
        }
    }
    
    // Also check local storage (for migration compatibility)
    const localSoundsDir = path.join(__dirname, '..', 'sounds');
    if (fs.existsSync(localSoundsDir)) {
        const files = fs.readdirSync(localSoundsDir);
        files
            .filter(file => /\.(mp3|wav|ogg|m4a|webm|flac)$/i.test(file))
            .forEach(file => {
                if (!seenNames.has(file)) {
                    const filePath = path.join(localSoundsDir, file);
                    const stats = fs.statSync(filePath);
                    sounds.push({
                        name: file,
                        size: stats.size,
                        createdAt: stats.birthtime,
                        source: 'local',
                    });
                    seenNames.add(file);
                }
            });
    }
    
    return sounds;
}

/**
 * Get a readable stream for a sound file
 * Falls back to local storage if not found in S3 (for migration compatibility)
 */
async function getSoundStream(filename) {
    if (storageType === 's3') {
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { Readable } = require('stream');
        
        try {
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: `sounds/${filename}`,
            });
            
            const response = await s3Client.send(command);
            
            // Convert AWS SDK stream to Node.js stream if needed
            if (response.Body instanceof Readable) {
                return response.Body;
            } else if (response.Body && typeof response.Body.transformToWebStream === 'function') {
                // Handle web streams (newer AWS SDK versions)
                const webStream = response.Body.transformToWebStream();
                return Readable.fromWeb(webStream);
            } else {
                // Fallback: convert to buffer then stream
                const chunks = [];
                for await (const chunk of response.Body) {
                    chunks.push(chunk);
                }
                return Readable.from(Buffer.concat(chunks));
            }
        } catch (error) {
            // If not found in S3, try local storage as fallback
            if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
                log.debug(`Sound ${filename} not found in S3, checking local storage...`);
                return getLocalSoundStream(filename);
            }
            throw error;
        }
    } else {
        // Local storage only
        return getLocalSoundStream(filename);
    }
}

/**
 * Get sound stream from local filesystem
 */
function getLocalSoundStream(filename) {
    const localSoundsDir = path.join(__dirname, '..', 'sounds');
    const filePath = path.join(localSoundsDir, filename);
    
    // Prevent path traversal
    if (!filePath.startsWith(localSoundsDir)) {
        throw new Error('Invalid filename');
    }
    
    if (!fs.existsSync(filePath)) {
        throw new Error('Sound not found');
    }
    
    return fs.createReadStream(filePath);
}

/**
 * Upload a sound file
 */
async function uploadSound(fileStream, filename) {
    if (storageType === 's3') {
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
        
        // Sanitize filename
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        
        // Read stream into buffer (required for S3)
        const chunks = [];
        for await (const chunk of fileStream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: `sounds/${safeName}`,
            Body: buffer,
            ContentType: getContentType(safeName),
        });
        
        await s3Client.send(command);
        log.info(`Uploaded sound to S3: ${safeName}`);
        return safeName;
    } else {
        // Local storage
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = path.join(soundsDir, safeName);
        
        return new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(filePath);
            fileStream.pipe(writeStream);
            
            writeStream.on('finish', () => {
                log.info(`Uploaded sound: ${safeName}`);
                resolve(safeName);
            });
            
            writeStream.on('error', reject);
            fileStream.on('error', reject);
        });
    }
}

/**
 * Delete a sound file
 */
async function deleteSound(filename) {
    if (storageType === 's3') {
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        
        const command = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: `sounds/${filename}`,
        });
        
        await s3Client.send(command);
        log.info(`Deleted sound from S3: ${filename}`);
        return true;
    } else {
        // Local storage
        const filePath = path.join(soundsDir, filename);
        
        // Prevent path traversal
        if (!filePath.startsWith(soundsDir)) {
            throw new Error('Invalid filename');
        }

        if (!fs.existsSync(filePath)) {
            throw new Error('Sound not found');
        }

        fs.unlinkSync(filePath);
        log.info(`Deleted sound: ${filename}`);
        return true;
    }
}

/**
 * Check if a sound file exists
 * Checks S3 first, then falls back to local storage (for migration compatibility)
 */
async function soundExists(filename) {
    if (storageType === 's3') {
        const { HeadObjectCommand } = require('@aws-sdk/client-s3');
        
        try {
            const command = new HeadObjectCommand({
                Bucket: bucketName,
                Key: `sounds/${filename}`,
            });
            
            await s3Client.send(command);
            return true;
        } catch (error) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                // Not found in S3, check local storage as fallback
                const localSoundsDir = path.join(__dirname, '..', 'sounds');
                const filePath = path.join(localSoundsDir, filename);
                if (filePath.startsWith(localSoundsDir) && fs.existsSync(filePath)) {
                    log.debug(`Sound ${filename} found in local storage (fallback)`);
                    return true;
                }
                return false;
            }
            throw error;
        }
    } else {
        const filePath = path.join(soundsDir, filename);
        return fs.existsSync(filePath);
    }
}

/**
 * Get content type based on file extension
 */
function getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.webm': 'audio/webm',
        '.flac': 'audio/flac',
    };
    return types[ext] || 'application/octet-stream';
}

/**
 * Get the storage directory path (for local storage) or null (for S3)
 */
function getSoundsDir() {
    return storageType === 'local' ? soundsDir : null;
}

// Initialize storage on module load
initStorage();

module.exports = {
    listSounds,
    getSoundStream,
    uploadSound,
    deleteSound,
    soundExists,
    getSoundsDir,
    getStorageType: () => storageType,
};

