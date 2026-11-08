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
  StringSelectMenuOptionBuilder 
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

if (!TOKEN || !CLIENT_ID || !CLIENT_SECRET || !MONGO_URI) {
  console.error("❌ [FATAL ERROR]: Missing critical environment variables in Render settings.");
  process.exit(1);
}

const startTime = Date.now();

// ==================== MONGODB DATABASE SCHEMAS ====================
mongoose.connect(MONGO_URI)
  .then(() => console.log("⚡ [DATABASE] Connected to MongoDB Atlas successfully!"))
  .catch(err => console.error("❌ [DATABASE ERROR]:", err));

// Verified OAuth2 Tokens Collection
const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  username: String,
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verifiedAt: { type: Date, default: Date.now }
}, { collection: 'verifiedusers' });
const VerifiedUser = mongoose.model('VerifiedUser', userSchema);

// User Credit Balances Collection
const creditSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  offline: { type: Number, default: 0 },
  online: { type: Number, default: 0 },
  reaction: { type: Number, default: 0 }
}, { collection: 'usercredits' });
const UserCredit = mongoose.model('UserCredit', creditSchema);

// Active interactive sessions map
const activeSessions = new Map();

// ==================== EXPRESS WEB SERVER SETUP ====================
const app = express();
app.use(express.json());

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

    await VerifiedUser.findOneAndUpdate(
      { discordId: userResponse.data.id },
      { username: userResponse.data.username, accessToken: access_token, refreshToken: refresh_token, expiresAt, verifiedAt: Date.now() },
      { upsert: true, new: true }
    );

    res.send(successHtml);
  } catch (error) {
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

// ==================== BACKGROUND TOKEN REFRESH GUARDIAN ====================
setInterval(async () => {
  try {
    const users = await VerifiedUser.find({});
    for (const user of users) {
      if (user.expiresAt < new Date(Date.now() + 86400000)) { // Refresh if expiring within 24h
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
}, 3600000); // Check every hour

// ==================== BOT COMMANDS ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // 1. !panel command -> Sends the Purchase Ticket Embed & Buttons[cite: 14, 15]
  if (command === 'panel') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Access Denied: Administrator permissions required.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x7000ff)
      .setTitle('Member Purchase Ticket 👥')
      .setDescription('You must buy credits before purchasing members. After buying credits, press **Add Members** to start adding members to your server.\nFast and high-quality service to ensure your satisfaction ❤️.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Buy Credits').setStyle(ButtonStyle.Link).setURL(`${PUBLIC_URL}/verify`),
      new ButtonBuilder().setCustomId('btn_my_credits').setLabel('My Credits').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_add_members').setLabel('Add Members').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setLabel('Add Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot`)
    );

    return message.reply({ embeds: [embed], components: [row] });
  }

  // 2. !gc command -> Admin Credit Distribution (`!gc @user offline 1000`)[cite: 14]
  if (command === 'gc') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Access Denied.');
    }

    const targetUser = message.mentions.users.first();
    const type = args[1]?.toLowerCase();
    const amount = parseInt(args[2], 10);

    if (!targetUser || !['offline', 'online', 'reaction'].includes(type) || isNaN(amount)) {
      return message.reply('❌ Usage: `!gc @user <offline/online/reaction> <amount>`');
    }

    let userCredit = await UserCredit.findOne({ discordId: targetUser.id });
    if (!userCredit) {
      userCredit = new UserCredit({ discordId: targetUser.id, offline: 0, online: 0, reaction: 0 });
    }

    userCredit[type] += amount;
    await userCredit.save();

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('📦 Credits Received!')
      .setDescription(`🖤 **${amount.toLocaleString()}** ${type} credits have been added to your balance!`)
      .addFields(
        { name: 'Your Balance:', value: `🟢 Online: \`${userCredit.online}\`\n⚫ Offline: \`${userCredit.offline}\`\n🎉 Reaction: \`${userCredit.reaction}\``, inline: false }
      )
      .setTimestamp();

    return message.reply({ content: `<@${targetUser.id}>`, embeds: [embed] });
  }

  // 3. !stats command -> Cyberpunk Neural Telemetry Matrix
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
      .setFooter({ text: 'ABYSSAL MANAGEMENT • Secure Telemetry v3.5' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
});

// ==================== INTERACTIVE BUTTONS & MODALS FLOW ====================
client.on('interactionCreate', async (interaction) => {
  // 1. Button Clicks
  if (interaction.isButton()) {
    if (interaction.customId === 'btn_my_credits') {
      let uc = await UserCredit.findOne({ discordId: interaction.user.id });
      if (!uc) uc = { online: 0, offline: 0, reaction: 0 };
      return interaction.reply({
        content: `💳 **Your Balance:**\n🟢 Online: \`${uc.online}\`\n⚫ Offline: \`${uc.offline}\`\n🎉 Reaction: \`${uc.reaction}\``,
        ephemeral: true
      });
    }

    if (interaction.customId === 'btn_add_members') {
      // Open Modal to input Server ID[cite: 5, 16]
      const modal = new ModalBuilder()
        .setCustomId('modal_server_id')
        .setTitle('Scan');

      const serverIdInput = new TextInputBuilder()
        .setCustomId('input_server_id')
        .setLabel('Server ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 1285560083786371085')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(serverIdInput));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_confirm_purchase') {
      const session = activeSessions.get(interaction.user.id);
      if (!session) return interaction.reply({ content: '❌ Session expired. Please start again.', ephemeral: true });

      await interaction.update({ content: `Adding members ⏳\nProgress: 0/${session.quantity}\n🆔 Operation: \`${session.opId}\``, components: [] });

      try {
        const targetGuild = await client.guilds.fetch(session.serverId);
        const verifiedUsers = await VerifiedUser.find({});
        let successful = 0;
        const startTimePull = Date.now();

        for (const userRecord of verifiedUsers) {
          if (successful >= session.quantity) break;
          try {
            const member = await targetGuild.members.fetch(userRecord.discordId).catch(() => null);
            if (member) continue; // Skip if already in server

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
          .setTitle('✅ Members added successfully!')
          .addFields(
            { name: '📊 Accounts Added', value: `\`${successful} accounts\``, inline: true },
            { name: '🏷️ Account Type', value: `\`${session.tokenType}\``, inline: true },
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

  // 2. Modal Submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_server_id') {
      const serverId = interaction.fields.getTextInputValue('input_server_id');
      activeSessions.set(interaction.user.id, { serverId });

      // Show Token Type Select Menu[cite: 6, 17]
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_token_type')
        .setPlaceholder('Select token type')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('offline').setDescription('Stock available in database').setValue('offline'),
          new StringSelectMenuOptionBuilder().setLabel('online').setDescription('Active tokens').setValue('online')
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return interaction.reply({ content: `Please select the token type you want to buy`, components: [row], ephemeral: true });
    }

    if (interaction.customId === 'modal_quantity') {
      const qtyStr = interaction.fields.getTextInputValue('input_quantity');
      const quantity = parseInt(qtyStr, 10);
      const session = activeSessions.get(interaction.user.id);

      if (isNaN(quantity) || quantity <= 0) {
        return interaction.reply({ content: '❌ Invalid quantity entered.', ephemeral: true });
      }

      session.quantity = quantity;
      session.opId = `OP-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const totalStock = await VerifiedUser.countDocuments();
      let uc = await UserCredit.findOne({ discordId: interaction.user.id });
      const userBalance = uc ? uc[session.tokenType] : 0;

      let guildName = 'Unknown Guild';
      try {
        const g = await client.guilds.fetch(session.serverId);
        guildName = g.name;
      } catch (e) {}

      // Confirmation Embed[cite: 9]
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle(`Confirm Addition — ${session.tokenType}`)
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

      return interaction.update({ content: null, embeds: [confirmEmbed], components: [row] });
    }
  }

  // 3. String Select Menu Selections
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_token_type') {
      const tokenType = interaction.values[0];
      const session = activeSessions.get(interaction.user.id);
      session.tokenType = tokenType;

      const totalStock = await VerifiedUser.countDocuments();

      // Open Quantity Modal[cite: 8, 18]
      const modal = new ModalBuilder()
        .setCustomId('modal_quantity')
        .setTitle('Buy Members');

      const qtyInput = new TextInputBuilder()
        .setCustomId('input_quantity')
        .setLabel('Quantity')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Stock : ${totalStock}`)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
      return interaction.showModal(modal);
    }
  }
});

client.login(TOKEN);
