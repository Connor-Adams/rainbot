const path = require('path');
const { createLogger } = require('./logger');
const { loadConfig } = require('./config');

const log = createLogger('STORAGE');

let s3Client = null;
let bucketName = null;

/**
 * Initialize storage - requires Railway S3-compatible bucket
 */
function initStorage() {
    const config = loadConfig();
    
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
    
    // Require all S3 configuration variables
    if (missingVars.length > 0) {
        log.error(`S3 storage configuration incomplete. Missing: ${missingVars.join(', ')}`);
        throw new Error(`S3 storage is required but not fully configured. Missing: ${missingVars.join(', ')}`);
    }
    
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
            forcePathStyle: false, // Railway uses virtual-hosted-style URLs (bucket.endpoint/key)
        });
        
        bucketName = config.storageBucketName;
        
        log.info(`✓ Storage initialized: S3 bucket "${bucketName}" at ${config.storageEndpoint}`);
    } catch (error) {
        log.error(`✗ Failed to initialize S3 storage: ${error.message}`);
        throw error;
    }
}

/**
 * List all sound files from S3
 */
async function listSounds() {
    const sounds = [];
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
                    sounds.push({
                        name: name,
                        size: obj.Size,
                        createdAt: obj.LastModified,
                    });
                });
        }
    } catch (error) {
        log.error(`Error listing sounds from S3: ${error.message}`);
        throw error;
    }
    
    return sounds;
}

/**
 * Get a readable stream for a sound file from S3
 */
async function getSoundStream(filename) {
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
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            throw new Error(`Sound not found: ${filename}`);
        }
        throw error;
    }
}

/**
 * Upload a sound file to S3
 */
async function uploadSound(fileStream, filename) {
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
}

/**
 * Delete a sound file from S3
 */
async function deleteSound(filename) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    
    const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: `sounds/${filename}`,
    });
    
    await s3Client.send(command);
    log.info(`Deleted sound from S3: ${filename}`);
    return true;
}

/**
 * Check if a sound file exists in S3
 */
async function soundExists(filename) {
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

// Initialize storage on module load
initStorage();

module.exports = {
    listSounds,
    getSoundStream,
    uploadSound,
    deleteSound,
    soundExists,
    getStorageType: () => 's3',
};

