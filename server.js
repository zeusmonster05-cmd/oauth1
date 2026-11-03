const express = require('express');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());

const DB_FILE = './tokens.json';

// Helper to load/save token database
function loadDb() {
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({}));
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// OAuth2 Callback route where users land after authorizing
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('No authorization code provided.');

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.REDIRECT_URI,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        // Get User ID
        const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const userId = userResponse.data.id;

        // Save into JSON database
        let db = loadDb();
        db[userId] = {
            refresh_token,
            expiresAt: Date.now() + (expires_in * 1000)
        };
        saveDb(db);

        res.send('<h2>Authentication successful! You can now close this window and let the bot pull you.</h2>');
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).send('Authentication failed.');
    }
});

app.listen(process.env.PORT, () => {
    console.log(`OAuth Server running on port ${process.env.PORT}`);
});