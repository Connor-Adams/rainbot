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
    
    // Check if Railway storage is configured
    if (config.storageBucketName && config.storageAccessKey && config.storageSecretKey && config.storageEndpoint) {
        try {
            // Use Railway S3-compatible storage
            const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
            
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
            
            log.info(`Storage initialized: Railway S3 bucket "${bucketName}"`);
        } catch (error) {
            log.warn(`Failed to initialize S3 storage: ${error.message}, falling back to local storage`);
            storageType = 'local';
        }
    } else {
        // Use local filesystem storage
        storageType = 'local';
        soundsDir = path.join(__dirname, '..', 'sounds');
        
        // Ensure sounds directory exists
        if (!fs.existsSync(soundsDir)) {
            fs.mkdirSync(soundsDir, { recursive: true });
        }
        
        log.info(`Storage initialized: Local filesystem (${soundsDir})`);
    }
}

/**
 * List all sound files
 */
async function listSounds() {
    if (storageType === 's3') {
        const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
        
        try {
            const command = new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: 'sounds/',
            });
            
            const response = await s3Client.send(command);
            
            if (!response.Contents) {
                return [];
            }
            
            return response.Contents
                .filter(obj => /\.(mp3|wav|ogg|m4a|webm|flac)$/i.test(obj.Key))
                .map(obj => ({
                    name: path.basename(obj.Key),
                    size: obj.Size,
                    createdAt: obj.LastModified,
                }));
        } catch (error) {
            log.error(`Error listing sounds from S3: ${error.message}`);
            throw error;
        }
    } else {
        // Local storage
        if (!fs.existsSync(soundsDir)) {
            return [];
        }

        const files = fs.readdirSync(soundsDir);
        return files
            .filter(file => /\.(mp3|wav|ogg|m4a|webm|flac)$/i.test(file))
            .map(file => {
                const filePath = path.join(soundsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: stats.size,
                    createdAt: stats.birthtime,
                };
            });
    }
}

/**
 * Get a readable stream for a sound file
 */
function getSoundStream(filename) {
    if (storageType === 's3') {
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: `sounds/${filename}`,
        });
        
        return s3Client.send(command).then(response => response.Body);
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
        
        return fs.createReadStream(filePath);
    }
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

