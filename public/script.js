// script.js
class EmailBot {
    constructor() {
        this.rules = [];
        this.isRunning = false;
        this.interval = null;
        this.loadData();
        this.setupEventListeners();
    }

    async loadData() {
        try {
            const response = await fetch('/api/get-data');
            const data = await response.json();
            this.rules = data.rules || [];
            
            // Load email config
            if (data.emailConfig) {
                document.getElementById('emailAddress').value = data.emailConfig.email || '';
                document.getElementById('appPassword').value = data.emailConfig.password || '';
            }
            
            this.renderRules();
        } catch (error) {
            this.showStatus('Error loading data: ' + error.message, 'error');
        }
    }

    setupEventListeners() {
        // Password visibility toggle
        const toggleBtn = document.querySelector('.toggle-password');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const passwordInput = document.getElementById('appPassword');
                const icon = toggleBtn.querySelector('i');
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                } else {
                    passwordInput.type = 'password';
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            });
        }

        // Form submission listeners
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.target.id === 'appPassword') {
                this.saveEmailConfig();
            }
        });
    }

    async saveEmailConfig() {
        const config = {
            email: document.getElementById('emailAddress').value,
            password: document.getElementById('appPassword').value
        };

        if (!config.email || !config.password) {
            this.showStatus('Please fill in all email settings', 'error');
            return;
        }

        try {
            const response = await fetch('/api/save-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                this.showStatus('Email configuration saved successfully', 'success');
            } else {
                throw new Error('Failed to save configuration');
            }
        } catch (error) {
            this.showStatus('Error saving configuration: ' + error.message, 'error');
        }
    }

    async addRule() {
        const keywords = document.getElementById('keywords').value;
        const subject = document.getElementById('subject').value;
        const response = document.getElementById('response').value;

        if (!keywords || !subject || !response) {
            this.showStatus('Please fill in all rule fields', 'error');
            return;
        }

        const rule = {
            keywords: keywords.split(',').map(k => k.trim()),
            subject: subject,
            response: response
        };

        try {
            const response = await fetch('/api/save-rule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rule)
            });

            const data = await response.json();
            if (data.success) {
                this.rules = data.rules;
                this.renderRules();
                this.clearInputs();
                this.showStatus('Rule added successfully', 'success');
            } else {
                throw new Error('Failed to save rule');
            }
        } catch (error) {
            this.showStatus('Error adding rule: ' + error.message, 'error');
        }
    }

    async deleteRule(id) {
        try {
            const response = await fetch(`/api/delete-rule/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            if (data.success) {
                this.rules = data.rules;
                this.renderRules();
                this.showStatus('Rule deleted successfully', 'success');
            } else {
                throw new Error('Failed to delete rule');
            }
        } catch (error) {
            this.showStatus('Error deleting rule: ' + error.message, 'error');
        }
    }

    renderRules() {
        const rulesList = document.getElementById('rulesList');
        rulesList.innerHTML = this.rules.map(rule => `
            <div class="rule-card">
                <div class="rule-header">
                    <h3>Rule</h3>
                    <button class="btn danger" onclick="emailBot.deleteRule(${rule.id})">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
                <div class="rule-content">
                    <div class="keywords-list">
                        ${rule.keywords.map(keyword => 
                            `<span class="keyword-tag">${keyword}</span>`
                        ).join('')}
                    </div>
                    <p><strong>Subject:</strong> ${rule.subject}</p>
                    <p><strong>Response:</strong> ${rule.response}</p>
                </div>
            </div>
        `).join('');
    }

    clearInputs() {
        ['keywords', 'subject', 'response'].forEach(id => 
            document.getElementById(id).value = ''
        );
    }

    async toggleBot() {
        this.isRunning = !this.isRunning;
        const btn = document.getElementById('botStatus');
        const icon = btn.querySelector('i');

        if (this.isRunning) {
            btn.innerHTML = '<i class="fas fa-stop"></i> Stop Bot';
            btn.classList.add('running');
            this.startBot();
        } else {
            btn.innerHTML = '<i class="fas fa-play"></i> Start Bot';
            btn.classList.remove('running');
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
            }
        }
    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('statusMessage');
        statusElement.textContent = message;
        statusElement.className = `status-message ${type}`;

        // Clear message after 5 seconds
        setTimeout(() => {
            statusElement.textContent = '';
            statusElement.className = 'status-message';
        }, 5000);
    }

    async startBot() {
        if (!this.isRunning) return;

        const checkEmails = async () => {
            try {
                const response = await fetch('/api/check-emails', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();
                
                if (result.success) {
                    this.showStatus(result.message, 'success');
                    this.updateCounters(result);
                } else {
                    throw new Error(result.message);
                }
            } catch (error) {
                this.showStatus('Error: ' + error.message, 'error');
            }
        };

        // Initial check
        await checkEmails();

        // Set up interval for checking emails (every 1 minute)
        this.interval = setInterval(checkEmails, 60000);
    }

    updateCounters(result) {
        // Update email and response counters if provided in the result
        if (result.emailCount !== undefined) {
            document.getElementById('emailCount').textContent = 
                `${result.emailCount} emails processed`;
        }
        if (result.responseCount !== undefined) {
            document.getElementById('responseCount').textContent = 
                `${result.responseCount} responses sent`;
        }
    }
}

// Initialize the bot
const emailBot = new EmailBot();

// Global functions for HTML onclick
function saveEmailConfig() {
    emailBot.saveEmailConfig();
}

function addRule() {
    emailBot.addRule();
}

function toggleBot() {
    emailBot.toggleBot();
}
