import { Client, GatewayIntentBits } from "discord.js";
import http from "http";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const QUEST_CHANNEL_ID = process.env.QUEST_CHANNEL_ID;

if (!DISCORD_TOKEN) {
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

// Keeps Render happy (needs a port)
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Agent poo is alive.");
}).listen(process.env.PORT || 3000);

function questsText() {
  return `🧠 Daily Build Quests
Reply: "approve 1/2/3" or "tweak 2 ..."

1) (S) Ok Computer microsite: single page + one interactive element.
2) (M) Mini clicker game: “everything becomes computer” progress bar.
3) (S) Repo tool: webpage that renders AGENT_CONTEXT.md nicely.`;
}

async function postDailyQuests() {
  if (!QUEST_CHANNEL_ID) return;
  const ch = await client.channels.fetch(QUEST_CHANNEL_ID).catch(() => null);
  if (!ch) return;
  await ch.send(questsText());
}

function planFor(n, tweakText = "") {
  const tweakLine = tweakText ? `\nTweak noted: ${tweakText}\n` : "\n";
  if (n === 1) {
    return `✅ Approved Quest 1${tweakLine}
Plan (short):
- Create a simple single-page site (HTML/CSS/JS).
- One interactive element (button/slider) that changes the “Ok Computer” vibe.
- Add a tiny README with how to run it locally.

Files:
- /apps/microsite/index.html
- /apps/microsite/style.css
- /apps/microsite/app.js

Question:
- Should the vibe be more “BNKR orange/black” or classic retro terminal?`;
  }
  if (n === 2) {
    return `✅ Approved Quest 2${tweakLine}
Plan (short):
- Build a mini clicker game (single page).
- Clicking fills a progress bar: “everything becomes computer”.
- Add simple win state + reset.

Files:
- /apps/clicker/index.html
- /apps/clicker/style.css
- /apps/clicker/app.js

Question:
- Do you want it funny (“overdue bills fall”) or clean/minimal?`;
  }
  if (n === 3) {
    return `✅ Approved Quest 3${tweakLine}
Plan (short):
- Make a webpage that displays AGENT_CONTEXT.md nicely.
- Simple styling + readable layout.

Files:
- /apps/context-viewer/index.html
- /apps/context-viewer/style.css
- /apps/context-viewer/app.js

Question:
- Should it be public-facing (pretty) or internal (plain + functional)?`;
  }
  return `I only understand: approve 1, approve 2, approve 3, or tweak 2 ...`;
}

let latestTweaks = { 1: "", 2: "", 3: "" };

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await postDailyQuests();
  setInterval(postDailyQuests, 24 * 60 * 60 * 1000);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const text = msg.content.trim();

  // Ping test still works
  if (text.toLowerCase() === "ping") {
    await msg.reply("pong ✅");
    return;
  }

  // Only respond in the quest channel (keeps it from being annoying)
  if (QUEST_CHANNEL_ID && msg.channelId !== QUEST_CHANNEL_ID) return;

  // tweak N ...
  const tweakMatch = text.match(/^tweak\s+([123])\s+(.+)$/i);
  if (tweakMatch) {
    const n = Number(tweakMatch[1]);
    const tweakText = tweakMatch[2].trim();
    latestTweaks[n] = tweakText;
    await msg.reply(`📝 Got it. I’ll apply that tweak to Quest ${n}: "${tweakText}"`);
    return;
  }

  // approve N
  const approveMatch = text.match(/^approve\s+([123])$/i);
  if (approveMatch) {
    const n = Number(approveMatch[1]);
    const tweakText = latestTweaks[n] || "";
    await msg.reply(planFor(n, tweakText));
    return;
  }
});

client.login(DISCORD_TOKEN);
