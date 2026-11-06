const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// ==================== CONFIGURATION & ENVIRONMENT ====================
const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://oauth1-bb1j.onrender.com';
const REDIRECT_URI = process.env.REDIRECT_URI || `${PUBLIC_URL}/callback`;
const MONGO_URI = process.env.MONGO_URI;
const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || null;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || null;

if (!TOKEN || !CLIENT_ID || !CLIENT_SECRET || !MONGO_URI) {
  console.error("❌ [FATAL ERROR]: Missing critical environment variables (BOT_TOKEN/DISCORD_TOKEN, CLIENT_ID, CLIENT_SECRET, MONGO_URI) in Render settings.");
  process.exit(1);
}

// Track bot start time for Uptime calculation
const startTime = Date.now();

// ==================== MONGODB DATABASE SCHEMA ====================
mongoose.connect(MONGO_URI)
  .then(() => console.log("⚡ [DATABASE] Connected to MongoDB Atlas successfully!"))
  .catch(err => console.error("❌ [DATABASE ERROR]:", err));

const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  username: String,
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verifiedAt: { type: Date, default: Date.now }
}, { collection: 'verifiedusers' }); // Explicit collection name ensures your data persists correctly

const VerifiedUser = mongoose.model('VerifiedUser', userSchema);

// ==================== EXPRESS WEB SERVER SETUP ====================
const app = express();
app.use(express.json());

// Cyberpunk Success HTML template
const successHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ABYSSAL // Authorization Complete</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Rajdhani:wght@500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #06070d;
      background-image: 
        radial-gradient(circle at 50% 30%, rgba(112, 0, 255, 0.15), transparent 60%),
        linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 100% 100%, 40px 40px, 40px 40px;
      color: #e2e8f0;
      font-family: 'Rajdhani', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .container { width: 100%; max-width: 440px; padding: 20px; position: relative; }
    .card {
      background: rgba(13, 14, 24, 0.85);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 16px;
      padding: 40px 30px;
      text-align: center;
      backdrop-filter: blur(12px);
      box-shadow: 0 0 40px rgba(112, 0, 255, 0.2), inset 0 0 15px rgba(139, 92, 246, 0.1);
    }
    .subtitle { font-family: 'Orbitron', sans-serif; font-size: 0.75rem; letter-spacing: 3px; color: #a78bfa; text-transform: uppercase; margin-bottom: 8px; }
    .title {
      font-family: 'Orbitron', sans-serif; font-size: 1.6rem; font-weight: 800; letter-spacing: 2px;
      background: linear-gradient(135deg, #ffffff 0%, #38bdf8 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 25px; text-transform: uppercase;
    }
    .icon-wrapper {
      width: 72px; height: 72px; margin: 0 auto 25px; border-radius: 50%;
      background: rgba(16, 185, 129, 0.1); border: 2px dashed #10b981;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
      animation: pulseGlow 2.5s infinite ease-in-out;
    }
    .icon-wrapper svg { width: 34px; height: 34px; stroke: #10b981; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; fill: none; }
    .divider { height: 2px; width: 100%; background: linear-gradient(90deg, transparent, #8b5cf6, #38bdf8, transparent); margin-bottom: 25px; }
    .status-box { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 16px; margin-bottom: 25px; }
    .status-title { font-family: 'Orbitron', sans-serif; font-size: 0.8rem; color: #38bdf8; letter-spacing: 1.5px; margin-bottom: 6px; }
    .status-desc { font-size: 0.95rem; color: #94a3b8; }
    .btn {
      width: 100%; padding: 14px; font-family: 'Orbitron', sans-serif; font-size: 0.85rem; font-weight: 700; letter-spacing: 2px;
      color: #ffffff; background: linear-gradient(135deg, #6366f1 0%, #3b82f6 100%);
      border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4); transition: all 0.2s ease;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6); }
    @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 15px rgba(16, 185, 129, 0.3); } 50% { box-shadow: 0 0 30px rgba(16, 185, 129, 0.6); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="subtitle">System Authorization</div>
      <h1 class="title">Abyssal Management</h1>
      <div class="icon-wrapper">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      <div class="divider"></div>
      <div class="status-box">
        <div class="status-title">ACCESS GRANTED // VERIFIED</div>
        <div class="status-desc">Welcome, Operative. Clearance established successfully.</div>
      </div>
      <button class="btn" onclick="window.close()">TERMINATE WINDOW</button>
    </div>
  </div>
</body>
</html>
`;

// Redirect to Discord OAuth2 Authorization Code endpoint
app.get('/verify', (req, res) => {
  const discordOAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;
  res.redirect(discordOAuthUrl);
});

// OAuth2 Callback endpoint
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('❌ Authorization failed: No code provided.');

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const discordId = userResponse.data.id;
    const username = userResponse.data.username;

    await VerifiedUser.findOneAndUpdate(
      { discordId },
      { username, accessToken: access_token, refreshToken: refresh_token, expiresAt, verifiedAt: Date.now() },
      { upsert: true, new: true }
    );

    if (MAIN_GUILD_ID && VERIFIED_ROLE_ID) {
      try {
        const guild = await client.guilds.fetch(MAIN_GUILD_ID);
        const member = await guild.members.fetch(discordId);
        if (member) {
          await member.roles.add(VERIFIED_ROLE_ID);
          console.log(`🛡️ [AUTO-ROLE]: Granted verified role to ${username} (${discordId})`);
        }
      } catch (roleErr) {
        console.log(`⚠️ [AUTO-ROLE]: User ${username} not present in main guild.`);
      }
    }

    res.send(successHtml);
  } catch (error) {
    console.error('OAuth Callback Error:', error.response?.data || error.message);
    res.status(500).send('❌ Authentication protocol failed.');
  }
});

app.get('/', (req, res) => res.status(200).send('⚡ ABYSSAL OAUTH SYSTEM ONLINE'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 [WEB SERVER] Running live on port ${PORT}`));

// ==================== DISCORD BOT SETUP ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

client.once('clientReady', () => {
  console.log(`🤖 [DISCORD BOT] Online and locked in as ${client.user.tag}!`);
});

// ==================== COMMAND HANDLERS ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // 1. !verify
  if (command === 'verify') {
    const embed = new EmbedBuilder()
      .setColor(0x7000ff)
      .setTitle('⚡ System Clearance & Verification')
      .setDescription('Click the secure button below to complete OAuth2 authentication and grant access clearance.')
      .setFooter({ text: 'Abyssal Security Protocol' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Verify System Clearance')
        .setStyle(ButtonStyle.Link)
        .setURL(`${PUBLIC_URL}/verify`)
    );

    return message.reply({ embeds: [embed], components: [row] });
  }

  // 2. !stats (Exact Neural Telemetry Matrix Style)
  if (command === 'stats') {
    const totalUsers = await VerifiedUser.countDocuments();
    
    // Calculate uptime in hours and minutes
    const uptimeMs = Date.now() - startTime;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const uptimeMins = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));

    // Calculate memory heap usage in MB
    const memoryUsageMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

    // Count user presences if cached in guild
    let onlineCount = 0, idleCount = 0, dndCount = 0, offlineCount = 0;
    if (message.guild) {
      message.guild.members.cache.forEach(member => {
        const status = member.presence?.status;
        if (status === 'online') onlineCount++;
        else if (status === 'idle') idleCount++;
        else if (status === 'dnd') dndCount++;
        else offlineCount++;
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x10b981) // Cyberpunk emerald border
      .setTitle('📊 ABYSSAL // Neural Telemetry Matrix')
      .setDescription('💎 Real-time diagnostic metrics across database nodes and active sessions.')
      .addFields(
        { name: '🧬 Total Verified Users', value: `\`${totalUsers}\``, inline: false },
        { name: '🟢 Online', value: `\`${onlineCount}\``, inline: true },
        { name: '🟡 Idle', value: `\`${idleCount}\``, inline: true },
        { name: '🔴 Do Not Disturb', value: `\`${dndCount}\``, inline: true },
        { name: '⚫ Offline / Cached', value: `\`${offlineCount}\``, inline: true },
        { name: '📡 API Latency', value: `\`${client.ws.ping}ms\``, inline: true },
        { name: '💻 RAM Heap', value: `\`${memoryUsageMB} MB\``, inline: true },
        { name: '⏳ Core Uptime', value: `\`${uptimeHours}h ${uptimeMins}m\``, inline: false },
        { name: '⚡ Database Status', value: '`Connected & Stable (Atlas)`', inline: false }
      )
      .setFooter({ text: `ABYSSAL MANAGEMENT • Secure Telemetry v3.5` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // 3. !dashboard
  if (command === 'dashboard') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Access Denied: Administrator permissions required.');
    }

    const count = await VerifiedUser.countDocuments();
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('🎛️ ABYSSAL // Administrative Control Panel')
      .setDescription('Manage active tokens or review system telemetry using the interface controls below.')
      .addFields({ name: 'Database Tokens', value: `\`${count} users registered\``, inline: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_stats').setLabel('Refresh Stats').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_purge').setLabel('Purge Expired').setStyle(ButtonStyle.Danger)
    );

    return message.reply({ embeds: [embed], components: [row] });
  }

  // 4. !pull <GUILD_ID> [LIMIT]
  if (command === 'pull') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Access Denied: Administrator permissions required.');
    }

    const targetGuildId = args[0];
    if (!targetGuildId) {
      return message.reply('❌ Error: Please provide a target Guild ID. Usage: `!pull <GUILD_ID> [LIMIT]`');
    }

    const pullLimit = args[1] ? parseInt(args[1], 10) : null;
    if (args[1] && (isNaN(pullLimit) || pullLimit <= 0)) {
      return message.reply('❌ Error: Limit parameter must be a valid positive number.');
    }

    const limitNotice = pullLimit ? `(Target Limit: ${pullLimit} users)` : '(Unlimited)';
    const statusMsg = await message.reply(`🚀 **Deploying Protocol:** Processing member synchronization into target \`${targetGuildId}\` ${limitNotice}...\n*Please wait...*`);

    try {
      const targetGuild = await client.guilds.fetch(targetGuildId);
      if (!targetGuild) {
        return statusMsg.edit('❌ Error: Bot is not present in the target guild or Guild ID is invalid.');
      }

      const verifiedUsers = await VerifiedUser.find({});
      if (verifiedUsers.length === 0) {
        return statusMsg.edit('⚠️ **Abyssal Warning:** No verified users found in MongoDB storage.');
      }

      let successfulJoins = 0;
      let alreadyInServer = 0;
      let failedJoins = 0;

      for (const userRecord of verifiedUsers) {
        if (pullLimit && successfulJoins >= pullLimit) {
          break;
        }

        try {
          let isMember = false;
          try {
            const member = await targetGuild.members.fetch(userRecord.discordId);
            if (member) isMember = true;
          } catch (e) {
            isMember = false;
          }

          if (isMember) {
            alreadyInServer++;
            continue;
          }

          await targetGuild.members.add(userRecord.discordId, {
            accessToken: userRecord.accessToken,
          });

          successfulJoins++;
          await new Promise(resolve => setTimeout(resolve, 800));

        } catch (apiError) {
          console.error(`Failed to pull user ${userRecord.discordId}:`, apiError.message);
          failedJoins++;
        }
      }

      const reportEmbed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('🔥 ABYSSAL // Execution Report Complete')
        .addFields(
          { name: '🎯 Target Guild ID', value: `\`${targetGuildId}\``, inline: false },
          { name: '⚙️ Execution Limit', value: `\`${pullLimit ? pullLimit : 'Unlimited'}\``, inline: true },
          { name: '✅ Successful Joins', value: `\`${successfulJoins}\``, inline: true },
          { name: '🔄 Already in Server', value: `\`${alreadyInServer}\``, inline: true },
          { name: '❌ Failed / Expired', value: `\`${failedJoins}\``, inline: true }
        )
        .setFooter({ text: 'ABYSSAL MANAGEMENT • Mission Accomplished' })
        .setTimestamp();

      await statusMsg.edit({ content: null, embeds: [reportEmbed] });

    } catch (error) {
      console.error('Pull Protocol Error:', error);
      await statusMsg.edit('❌ Critical failure executing member synchronization.');
    }
  }
});

// Interactive Dashboard Button Handlers
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'btn_stats') {
    const count = await VerifiedUser.countDocuments();
    return interaction.reply({ content: `📊 Current live database token count: **${count}**`, ephemeral: true });
  }

  if (interaction.customId === 'btn_purge') {
    const result = await VerifiedUser.deleteMany({ expiresAt: { $lt: new Date() } });
    return interaction.reply({ content: `🧹 Purge complete. Removed **${result.deletedCount}** expired tokens.`, ephemeral: true });
  }
});

// Start Discord Bot
client.login(TOKEN);
