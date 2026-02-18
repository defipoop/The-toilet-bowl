
import { Client, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const QUEST_CHANNEL_ID = process.env.QUEST_CHANNEL_ID;

if (!token) {
  console.error("Missing DISCORD_TOKEN env var");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  // Simple ping check so we know it works
  if (msg.content.trim().toLowerCase() === "ping") {
    await msg.reply("pong ✅");
  }
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
client.login(token);
import http from "http";

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Agent poo is alive.");
}).listen(process.env.PORT || 3000);
