import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from "discord.js";
import { getGuildConfig, setGuildConfig } from "./store.js";

const pendingVerifications = new Set();

async function openVerificationThread(member, channel) {
  const thread = await channel.threads.create({
    name: `📸 Verify — ${member.user.username}`,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 1440,
    invitable: false,
  });
  await thread.members.add(member.user.id);
  await thread.send(
    `Hey <@${member.user.id}>! 👋 To get verified as a biker, post **2 photos** here:\n\n` +
    `**1.** 📸 A photo of your bike\n` +
    `**2.** 📸 A photo of **your bike** with a page showing **your Discord username (\`${member.user.username}\`) and your bike keys** all visible in the same shot\n\n` +
    `This confirms you own the bike. Staff will review and approve your request once you've posted both photos. 🏍️`,
  );
  const embed = new EmbedBuilder()
    .setTitle("🏍️ Verification Request")
    .setColor(0xe65c00)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: "👤 User", value: `<@${member.user.id}>`, inline: true },
      { name: "🆔 Username", value: member.user.username, inline: true },
      { name: "📸 Status", value: "Waiting for photos above ↑", inline: false },
    )
    .setTimestamp()
    .setFooter({ text: "Biker Verification System — staff only" });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`verify_approve:${member.user.id}`).setLabel("✅ Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`verify_deny:${member.user.id}`).setLabel("❌ Deny").setStyle(ButtonStyle.Danger),
  );
  await thread.send({ embeds: [embed], components: [row] });
  return thread;
}

export async function handleSendPanelCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "❌ You need the **Manage Server** permission.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ This command must be used in a server.", flags: MessageFlags.Ephemeral });
    return;
  }
  const config = getGuildConfig(interaction.guildId);
  if (!config.channelId || !config.roleId) {
    await interaction.reply({ content: "❌ Run `/setup-verification` first.", flags: MessageFlags.Ephemeral });
    return;
  }
  const panelEmbed = new EmbedBuilder()
    .setTitle("🏍️ Biker Verification")
    .setColor(0xe65c00)
    .setDescription(
      "Want to become a **Verified Biker** on this server?\n\n" +
      "Click the button below to start the verification process.\n\n" +
      "You will need to provide **2 photos**:\n" +
      "**1.** 📸 A photo of your bike\n" +
      "**2.** 📸 A photo of your bike with a page showing your **Discord username + bike keys** in the same shot\n\n" +
      "A private thread will open just for you and the staff team. 🤙",
    )
    .setFooter({ text: "Biker Verification System" })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("start_verify").setLabel("🏍️ Verify").setStyle(ButtonStyle.Primary),
  );
  const targetChannel = interaction.options.getChannel("channel", true);
  const channel = interaction.guild.channels.cache.get(targetChannel.id);
  if (!channel) {
    await interaction.reply({ content: "❌ Could not find that channel.", flags: MessageFlags.Ephemeral });
    return;
  }
  await channel.send({ embeds: [panelEmbed], components: [row] });
  await interaction.reply({ content: `✅ Panel posted in <#${channel.id}>!`, flags: MessageFlags.Ephemeral });
}

export async function handleStartVerifyButton(interaction) {
  if (!interaction.guildId || !interaction.guild || !interaction.member) {
    await interaction.reply({ content: "❌ This can only be used in a server.", flags: MessageFlags.Ephemeral });
    return;
  }
  const member = interaction.member;
  const lockKey = `${interaction.guildId}:${member.user.id}`;
  if (pendingVerifications.has(lockKey)) {
    await interaction.reply({ content: "⏳ Already processing, please wait.", flags: MessageFlags.Ephemeral });
    return;
  }
  const config = getGuildConfig(interaction.guildId);
  if (!config.channelId || !config.roleId) {
    await interaction.reply({ content: "❌ Ask an admin to run `/setup-verification`.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (member.roles.cache.has(config.roleId)) {
    await interaction.reply({ content: "✅ You are already a Verified Biker!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.channelId) {
    const existingThread = interaction.guild.channels.cache.find(
      (ch) => ch.isThread() && !ch.archived && ch.name === `📸 Verify — ${member.user.username}` && ch.parentId === interaction.channelId,
    );
    if (existingThread) {
      await interaction.reply({ content: `⚠️ You already have an open thread: <#${existingThread.id}>`, flags: MessageFlags.Ephemeral });
      return;
    }
  }
  pendingVerifications.add(lockKey);
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch {
    pendingVerifications.delete(lockKey);
    return;
  }
  try {
    const fetched = await interaction.guild.channels.fetch(interaction.channelId);
    if (!fetched || fetched.type !== ChannelType.GuildText) {
      await interaction.editReply("❌ The panel must be in a regular text channel.");
      return;
    }
    const thread = await openVerificationThread(member, fetched);
    await interaction.editReply(`✅ Thread opened! Go to <#${thread.id}> and upload your photos.`);
  } catch (err) {
    try {
      await interaction.editReply(`❌ Error: \`${err.message}\`\n\nMake sure the bot has **Create Private Threads** permission.`);
    } catch { }
  } finally {
    pendingVerifications.delete(lockKey);
  }
}

export async function handleSetupCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "❌ You need the **Manage Server** permission.", flags: MessageFlags.Ephemeral });
    return;
  }
  const channel = interaction.options.getChannel("channel", true);
  const role = interaction.options.getRole("role", true);
  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "❌ Please select a text channel.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ This command must be used in a server.", flags: MessageFlags.Ephemeral });
    return;
  }
  setGuildConfig(interaction.guildId, { channelId: channel.id, roleId: role.id });
  await interaction.reply({
    content: `✅ Setup complete!\n• Channel → <#${channel.id}>\n• Role → <@&${role.id}>\n\nNow run \`/send-panel\` to post the panel.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleVerifyButton(interaction) {
  const [action, targetUserId] = interaction.customId.split(":");
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "❌ Could not resolve server.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: "❌ You need the **Manage Roles** permission.", flags: MessageFlags.Ephemeral });
    return;
  }
  const config = getGuildConfig(interaction.guildId);
  if (!config.roleId) {
    await interaction.reply({ content: "❌ No role configured. Run `/setup-verification`.", flags: MessageFlags.Ephemeral });
    return;
  }
  let targetMember;
  try {
    targetMember = await interaction.guild.members.fetch(targetUserId);
  } catch {
    await interaction.reply({ content: "❌ User not found — they may have left.", flags: MessageFlags.Ephemeral });
    return;
  }
  const adminTag = interaction.member.user.tag;
  const thread = interaction.channel;
  if (action === "verify_approve") {
    try {
      await targetMember.roles.add(config.roleId);
    } catch {
      await interaction.reply({ content: "❌ Failed to assign role. Make sure the bot role is above the Verified Biker role.", flags: MessageFlags.Ephemeral });
      return;
    }
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57f287).setTitle("🏍️ Verification — ✅ APPROVED").setFooter({ text: `Approved by ${adminTag}` });
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("done_approve").setLabel("✅ Approved").setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId("done_deny").setLabel("❌ Deny").setStyle(ButtonStyle.Danger).setDisabled(true),
    );
    await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });
    try { if (thread?.isThread()) { await thread.send(`✅ Approved by ${adminTag}. Welcome! 🏍️`); await thread.setArchived(true); } } catch { }
    try { await targetMember.send(`✅ **You've been verified** on **${interaction.guild.name}**! Welcome to the club! 🏍️`); } catch { }
  } else {
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xed4245).setTitle("🏍️ Verification — ❌ DENIED").setFooter({ text: `Denied by ${adminTag}` });
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("done_approve").setLabel("✅ Approve").setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId("done_deny").setLabel("❌ Denied").setStyle(ButtonStyle.Danger).setDisabled(true),
    );
    await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });
    try { if (thread?.isThread()) { await thread.send(`❌ Denied by ${adminTag}.`); await thread.setArchived(true); } } catch { }
    try { await targetMember.send(`❌ Your verification on **${interaction.guild.name}** was not approved. Contact an admin if needed.`); } catch { }
  }
}
