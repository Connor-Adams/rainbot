// Server Selector Component
// Provides a reusable server selector with localStorage persistence

class ServerSelector {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.onChange = options.onChange || null;
        this.guilds = [];
        this.selectedGuildId = null;
        this.storageKey = 'rainbot_selected_guild_id';
        
        this.init();
    }

    init() {
        // Load persisted selection
        this.selectedGuildId = localStorage.getItem(this.storageKey) || null;
        
        // Create the component HTML
        this.render();
    }

    render() {
        if (!this.container) return;
        
        const hasGuilds = this.guilds.length > 0;
        const selectedGuild = this.guilds.find(g => g.id === this.selectedGuildId);
        
        this.container.innerHTML = `
            <div class="server-selector-wrapper mb-6">
                <label for="server-selector" class="block text-sm font-medium text-gray-300 mb-2">
                    Select Server
                </label>
                <select 
                    id="server-selector" 
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-medium 
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent 
                           transition-all duration-200 hover:border-gray-600
                           appearance-none cursor-pointer"
                    ${!hasGuilds ? 'disabled' : ''}
                >
                    <option value="">${hasGuilds ? 'Select a server...' : 'Loading servers...'}</option>
                    ${this.guilds.map(guild => `
                        <option value="${guild.id}" ${guild.id === this.selectedGuildId ? 'selected' : ''}>
                            ${this.escapeHtml(guild.name)}
                        </option>
                    `).join('')}
                </select>
                ${selectedGuild ? `
                    <p class="mt-2 text-xs text-gray-400">
                        Selected: <span class="text-blue-400 font-medium">${this.escapeHtml(selectedGuild.name)}</span>
                    </p>
                ` : ''}
            </div>
        `;

        // Add custom dropdown arrow styling
        const style = document.createElement('style');
        style.textContent = `
            #server-selector {
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23a1a1b0' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 1rem center;
                padding-right: 2.5rem;
            }
            #server-selector:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        `;
        if (!document.getElementById('server-selector-styles')) {
            style.id = 'server-selector-styles';
            document.head.appendChild(style);
        }

        // Add event listener
        const select = this.container.querySelector('#server-selector');
        if (select) {
            select.addEventListener('change', (e) => {
                this.handleChange(e.target.value);
            });
        }
    }

    handleChange(guildId) {
        this.selectedGuildId = guildId || null;
        
        // Persist to localStorage
        if (guildId) {
            localStorage.setItem(this.storageKey, guildId);
        } else {
            localStorage.removeItem(this.storageKey);
        }

        // Call onChange callback if provided
        if (this.onChange) {
            this.onChange(guildId);
        }

        // Re-render to update display
        this.render();
    }

    setGuilds(guilds) {
        this.guilds = guilds || [];
        
        // If we have a persisted selection, verify it still exists
        if (this.selectedGuildId && !this.guilds.find(g => g.id === this.selectedGuildId)) {
            this.selectedGuildId = null;
            localStorage.removeItem(this.storageKey);
        }
        
        this.render();
    }

    getSelectedGuildId() {
        return this.selectedGuildId;
    }

    setSelectedGuildId(guildId) {
        this.handleChange(guildId);
    }

    show() {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServerSelector;
}

