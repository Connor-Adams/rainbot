/**
 * Centralized Discord client storage to avoid circular dependencies
 */
let discordClient = null;

function setClient(client) {
    discordClient = client;
}

function getClient() {
    return discordClient;
}

module.exports = {
    setClient,
    getClient,
};

