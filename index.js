const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
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

// Your exact exclusive owner Discord ID
const OWNER_ID = '1370594462941581433';

// Direct CDN Image URL for Panel & Verify embeds
const BANNER_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1531305989410787418/1568198735694139402/Gemini_Generated_Image_xjoeqcxjoeqcxjoe.png?ex=6af19562&is=6af043e2&hm=4298d9d755b0a7b4ffe1b1afa3b14ff15639d997e53a1a0e110589ff341f2da2&';

if (!TOKEN || !CLIENT_ID || !CLIENT_SECRET || !MONGO_URI) {
  console.error("❌ [FATAL ERROR]: Missing critical environment variables in Render settings.");
  process.exit(1);
}

const startTime = Date.now();

// ==================== MONGODB DATABASE SCHEMAS ====================
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
}, { collection: 'verifiedusers' });
const VerifiedUser = mongoose.model('VerifiedUser', userSchema);

const creditSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 }
}, { collection: 'usercredits' });
const UserCredit = mongoose.model('UserCredit', creditSchema);

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

// ==================== BOT COMMANDS ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // 1. !verify command
  if (command === 'verify') {
    const embed = new EmbedBuilder()
      .setColor(0x7000ff)
      .setTitle('⚡ System Clearance & Verification')
      .setDescription('Click the secure button below to complete OAuth2 authorization and verify your account.')
      .setImage(BANNER_IMAGE_URL)
      .setFooter({ text: 'Abyssal Security Protocol' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Verify System Clearance')
        .setStyle(ButtonStyle.Link)
        .setURL(`${PUBLIC_URL}/verify`)
    );

    return message.reply({ embeds: [embed], components: [row] });
  }

  // 2. !panel command
  if (command === 'panel') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Access Denied: Administrator permissions required.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x7000ff)
      .setTitle('Member Purchase Ticket 👥')
      .setDescription('You must buy credits before purchasing members. After buying credits, press **Add Members** to start adding members to your server.\nFast and high-quality service to ensure your satisfaction ❤️.')
      .setImage(BANNER_IMAGE_URL);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Buy Credits').setStyle(ButtonStyle.Link).setURL(`${PUBLIC_URL}/verify`),
      new ButtonBuilder().setCustomId('btn_my_credits').setLabel('My Credits').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_add_members').setLabel('Add Members').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setLabel('Add Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot`)
    );

    return message.reply({ embeds: [embed], components: [row] });
  }

  // 3. !gc command -> OWNER ONLY (Strictly your ID: 1370594462941581433)
  if (command === 'gc') {
    if (message.author.id !== OWNER_ID) {
      return message.reply('❌ Access Denied: Only the bot owner can issue credits.');
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
    await userCredit.save();

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('📦 Credits Issued!')
      .setDescription(`🖤 **${amount.toLocaleString()}** credits have been added to <@${targetUser.id}>'s account by the owner!`)
      .addFields(
        { name: 'Current User Balance:', value: `\`${userCredit.balance} credits\``, inline: false },
        { name: 'Database Stock Remaining:', value: `\`${totalStock} accounts\``, inline: false }
      )
      .setTimestamp();

    return message.reply({ content: `<@${targetUser.id}>`, embeds: [embed] });
  }

  // 4. !rc command -> OWNER ONLY
  if (command === 'rc') {
    if (message.author.id !== OWNER_ID) {
      return message.reply('❌ Access Denied: Only the bot owner can remove credits.');
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

    userCredit.balance = Math.max(0, userCredit.balance - amount);
    await userCredit.save();

    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle('🔻 Credits Deducted')
      .setDescription(`🖤 **${amount.toLocaleString()}** credits have been removed from <@${targetUser.id}>'s balance!`)
      .addFields(
        { name: 'New User Balance:', value: `\`${userCredit.balance} credits\``, inline: false }
      )
      .setTimestamp();

    return message.reply({ content: `<@${targetUser.id}>`, embeds: [embed] });
  }

  // 5. !resetcredits command -> OWNER ONLY
  if (command === 'resetcredits') {
    if (message.author.id !== OWNER_ID) return message.reply('❌ Access Denied.');
    const targetUser = message.mentions.users.first();
    if (!targetUser) return message.reply('❌ Usage: `!resetcredits @user`');

    await UserCredit.findOneAndUpdate({ discordId: targetUser.id }, { balance: 0 }, { upsert: true });
    return message.reply(`✨ Successfully wiped all credits for <@${targetUser.id}>.`);
  }

  // 6. !pull command -> OWNER ONLY (The classic manual direct pull command)
  if (command === 'pull') {
    if (message.author.id !== OWNER_ID) {
      return message.reply('❌ Access Denied: Only the bot owner can run manual pull protocols.');
    }

    const targetGuildId = args[0];
    if (!targetGuildId) {
      return message.reply('❌ Error: Please provide a target Guild ID. Usage: `!pull <GUILD_ID> [LIMIT]`');
    }

    const pullLimit = args[1] ? parseInt(args[1], 10) : null;
    const statusMsg = await message.reply(`🚀 **Owner Protocol:** Synchronizing database tokens into target \`${targetGuildId}\`...\n*Please wait...*`);

    try {
      const targetGuild = await client.guilds.fetch(targetGuildId);
      const verifiedUsers = await VerifiedUser.find({});
      if (verifiedUsers.length === 0) {
        return statusMsg.edit('⚠️ **Abyssal Warning:** No verified users found in MongoDB storage.');
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
        .setTitle('🔥 ABYSSAL // Manual Pull Execution Report')
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

  // 7. !bal command
  if (command === 'bal' || command === 'balance') {
    const targetUser = message.mentions.users.first() || message.author;
    let uc = await UserCredit.findOne({ discordId: targetUser.id });
    if (!uc) uc = { balance: 0 };

    const embed = new EmbedBuilder()
      .setColor(0x38bdf8)
      .setTitle(`💳 Balance Overview — ${targetUser.username}`)
      .addFields(
        { name: 'Available Pull Credits', value: `\`${uc.balance}\``, inline: true }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // 8. !stock command
  if (command === 'stock') {
    const totalStock = await VerifiedUser.countDocuments();
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('📦 Database Stock Overview')
      .addFields(
        { name: '⚫ Total Verified Accounts', value: `\`${totalStock}\``, inline: true },
        { name: '⚡ System Status', value: '`ONLINE // READY`', inline: false }
      )
      .setFooter({ text: 'Abyssal Inventory Engine' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // 9. !stats command
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
  if (interaction.isButton()) {
    if (interaction.customId === 'btn_my_credits') {
      let uc = await UserCredit.findOne({ discordId: interaction.user.id });
      if (!uc) uc = { balance: 0 };
      return interaction.reply({
        content: `💳 **Your Balance:** \`${uc.balance}\` credits`,
        ephemeral: true
      });
    }

    if (interaction.customId === 'btn_add_members') {
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
      return await interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_confirm_purchase') {
      const session = activeSessions.get(interaction.user.id);
      if (!session) return interaction.reply({ content: '❌ Session expired. Please start again.', ephemeral: true });

      let uc = await UserCredit.findOne({ discordId: interaction.user.id });
      if (!uc || uc.balance < session.quantity) {
        return interaction.update({ content: `❌ Insufficient credits. You need **${session.quantity}** credits, but your balance is **${uc ? uc.balance : 0}**.`, embeds: [], components: [] });
      }

      uc.balance -= session.quantity;
      await uc.save();

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
          .setTitle('✅ Members added successfully!')
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

  // Modal Submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_server_id') {
      const serverId = interaction.fields.getTextInputValue('input_server_id');
      activeSessions.set(interaction.user.id, { serverId });

      const totalStock = await VerifiedUser.countDocuments();

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
      return await interaction.showModal(modal);
    }

    if (interaction.customId === 'modal_quantity') {
      const qtyStr = interaction.fields.getTextInputValue('input_quantity');
      const quantity = parseInt(qtyStr, 10);
      const session = activeSessions.get(interaction.user.id);

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
        .setTitle(`Confirm Addition — Member Sync`)
        .addFields(
          { name: '🏰 Target Server', value: `${guildName}\n\`${session.serverId}\``, inline: true },
          { name: '📦 Available DB Stock', value: `${totalStock}`, inline: true },
          { name: '🔢 Add Count', value: `${quantity}`, inline: true },
          { name: '💵 Cost', value: `${quantity} Credits`, inline: true },
          { name: '💳 Your Balance', value: `${userBalance} Credits`, inline: true }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_confirm_purchase').setLabel('Purchase').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_cancel_purchase').setLabel('Cancel').setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
    }
  }
});

client.login(TOKEN);
