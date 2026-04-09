import {
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  ChannelType,
} from "discord.js";
import { client } from "./client.js";
import { handleSetupCommand, handleSendPanelCommand, handleStartVerifyButton, handleVerifyButton } from "./handlers.js";

const commands = [
  new SlashCommandBuilder()
    .setName("setup-verification")
    .setDescription("Configure the biker verification system (admin only)")
    .addChannelOption((opt) => opt.setName("channel").setDescription("Verification channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addRoleOption((opt) => opt.setName("role").setDescription("Role to assign to verified bikers").setRequired(true)),
  new SlashCommandBuilder()
    .setName("send-panel")
    .setDescription("Post the verification panel (admin only)")
    .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to post the panel in").addChannelTypes(ChannelType.GuildText).setRequired(true)),
].map((cmd) => cmd.toJSON());

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) { console.error("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID"); process.exit(1); }

const rest = new REST({ version: "10" }).setToken(token);
if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log(`Slash commands registered for guild ${guildId}`);
} else {
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log("Slash commands registered globally");
}

client.once(Events.ClientReady, (c) => console.log(`✅ Bot online: ${c.user.tag}`));

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup-verification") await handleSetupCommand(interaction);
      else if (interaction.commandName === "send-panel") await handleSendPanelCommand(interaction);
    } else if (interaction.isButton()) {
      if (interaction.customId === "start_verify") await handleStartVerifyButton(interaction);
      else if (interaction.customId.startsWith("verify_approve:") || interaction.customId.startsWith("verify_deny:")) await handleVerifyButton(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
  }
});

await client.login(token);
