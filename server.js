// server.js
const express = require('express');
const nodemailer = require('nodemailer');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const fs = require('fs').promises;
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const MINIMUM_CHECK_INTERVAL = 10000; // 10 seconds
let lastCheckTime = 0;

async function checkEmails() {
    const now = Date.now();
    if (now - lastCheckTime < MINIMUM_CHECK_INTERVAL) {
        return {
            success: true,
            message: 'Skipped check - too soon',
            skipped: true
        };
    }
    lastCheckTime = now;

    const data = await readData();
    const { emailConfig: config, rules } = data;
    
    if (!config.email || !config.password) {
        return { success: false, message: 'Email configuration missing' };
    }

    const imapConfig = {
        imap: {
            user: config.email,
            password: config.password,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 3000
        }
    };

    let connection;
    try {
        connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');

        // Search for unread messages
        const searchCriteria = ['UNSEEN'];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''], // Include empty string for full message
            markSeen: false
        };

        const results = await connection.search(searchCriteria, fetchOptions);
        console.log(`Found ${results.length} new emails`);

        if (results.length === 0) {
            return { 
                success: true, 
                message: 'No new emails',
                emailCount: 0,
                responseCount: 0
            };
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: config.email,
                pass: config.password
            }
        });

        let responsesSent = 0;

        for (const result of results) {
            try {
                // Get the full message part
                const fullMessage = result.parts.find(p => p.which === '');
                if (!fullMessage || !fullMessage.body) {
                    console.error('Invalid message structure:', result);
                    continue;
                }

                // Parse the email
                const email = await simpleParser(fullMessage.body);
                const emailText = email.text || email.html || '';

                // Check rules
                for (const rule of rules) {
                    const hasKeyword = rule.keywords.some(keyword => 
                        emailText.toLowerCase().includes(keyword.toLowerCase())
                    );

                    if (hasKeyword) {
                        try {
                            await transporter.sendMail({
                                from: config.email,
                                to: email.from.text,
                                subject: rule.subject,
                                text: rule.response
                            });
                            responsesSent++;
                            
                            // Mark email as seen
                            const uid = result.attributes.uid;
                            await connection.addFlags(uid, ['\\Seen']);
                            break; // Stop after first matching rule
                        } catch (sendError) {
                            console.error('Error sending response:', sendError);
                        }
                    }
                }
            } catch (parseError) {
                console.error('Error processing email:', parseError);
            }
        }

        return { 
            success: true, 
            message: `Processed ${results.length} emails, sent ${responsesSent} responses`,
            emailCount: results.length,
            responseCount: responsesSent
        };
    } catch (error) {
        console.error('Email checking error:', error);
        return { success: false, message: error.message };
    } finally {
        if (connection) {
            connection.end();
        }
    }
}

// File storage functions
const DATA_FILE = path.join(__dirname, 'data', 'settings.json');

async function initializeDataStorage() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
        try {
            await fs.access(DATA_FILE);
        } catch {
            await fs.writeFile(DATA_FILE, JSON.stringify({ emailConfig: {}, rules: [] }));
        }
    } catch (error) {
        console.error('Error initializing data storage:', error);
    }
}

async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading data:', error);
        return { emailConfig: {}, rules: [] };
    }
}

async function writeData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing data:', error);
    }
}

// API Routes
app.post('/api/save-config', async (req, res) => {
    try {
        const data = await readData();
        data.emailConfig = req.body;
        await writeData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/save-rule', async (req, res) => {
    try {
        const data = await readData();
        data.rules.push({ ...req.body, id: Date.now() });
        await writeData(data);
        res.json({ success: true, rules: data.rules });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/delete-rule/:id', async (req, res) => {
    try {
        const data = await readData();
        data.rules = data.rules.filter(rule => rule.id !== parseInt(req.params.id));
        await writeData(data);
        res.json({ success: true, rules: data.rules });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/get-data', async (req, res) => {
    try {
        const data = await readData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/check-emails', async (req, res) => {
    try {
        const result = await checkEmails();
        if (result.skipped) {
            res.status(429).json(result);
        } else {
            res.json(result);
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Initialize data storage and start server
const PORT = process.env.PORT || 3000;
initializeDataStorage().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
