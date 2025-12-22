const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');
const storage = require('./storage');

const log = createLogger('MIGRATE');

/**
 * Migrate all local sound files to S3 storage
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
async function migrateLocalToS3() {
    if (storage.getStorageType() !== 's3') {
        throw new Error('S3 storage is not configured. Cannot migrate.');
    }

    const localSoundsDir = path.join(__dirname, '..', 'sounds');
    
    if (!fs.existsSync(localSoundsDir)) {
        log.info('No local sounds directory found');
        return { success: 0, failed: 0, errors: [] };
    }

    const files = fs.readdirSync(localSoundsDir).filter(file => 
        /\.(mp3|wav|ogg|m4a|webm|flac)$/i.test(file)
    );

    if (files.length === 0) {
        log.info('No sound files found in local storage');
        return { success: 0, failed: 0, errors: [] };
    }

    log.info(`Starting migration of ${files.length} files to S3...`);

    const results = {
        success: 0,
        failed: 0,
        errors: [],
    };

    for (const file of files) {
        try {
            // Check if file already exists in S3
            const exists = await storage.soundExists(file);
            if (exists) {
                log.debug(`File ${file} already exists in S3, skipping`);
                results.success++;
                continue;
            }

            // Read local file
            const filePath = path.join(localSoundsDir, file);
            const fileStream = fs.createReadStream(filePath);

            // Upload to S3
            await storage.uploadSound(fileStream, file);
            log.info(`Migrated: ${file}`);
            results.success++;
        } catch (error) {
            log.error(`Failed to migrate ${file}: ${error.message}`);
            results.failed++;
            results.errors.push({
                file,
                error: error.message,
            });
        }
    }

    log.info(`Migration complete: ${results.success} succeeded, ${results.failed} failed`);
    return results;
}

module.exports = {
    migrateLocalToS3,
};

