import { Client, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const QUEST_CHANNEL_ID = process.env.QUEST_CHANNEL_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

async function postDailyQuests() {
  if (!QUEST_CHANNEL_ID) return;

  const ch = await client.channels.fetch(QUEST_CHANNEL_ID).catch(() => null);
  if (!ch) return;

  await ch.send(
`🧠 Daily Build Quests
Reply: "approve 1/2/3" or "tweak 2 ..."

1) (S) Ok Computer microsite: single page + one interactive element.
2) (M) Mini clicker game: “everything becomes computer” progress bar.
3) (S) Repo tool: webpage that renders AGENT_CONTEXT.md nicely.`
  );
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  postDailyQuests();
  setInterval(postDailyQuests, 24 * 60 * 60 * 1000);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  if (msg.content.trim().toLowerCase() === "ping") {
    await msg.reply("pong ✅");
  }
});

client.login(token);
