import { Client, GatewayIntentBits } from "discord.js";
import http from "http";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const QUEST_CHANNEL_ID = process.env.QUEST_CHANNEL_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_NAME = process.env.REPO_NAME;

if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN");
  process.exit(1);
}

// Render wants an open port
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Agent poo is alive.");
}).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

async function createGithubIssue(title, body) {
  if (!GITHUB_TOKEN || !REPO_NAME) throw new Error("Missing GITHUB_TOKEN or REPO_NAME in Render env vars.");

  const res = await fetch(`https://api.github.com/repos/${REPO_NAME}/issues`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "agent-poo"
    },
    body: JSON.stringify({ title, body })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}\n${err}`);
  }

  return res.json();
}

function questsText() {
  return `🧠 Daily Build Quests
Say: "approve 1/2/3" (no extra commands needed after)

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

// State: after you approve a quest, your next normal message becomes the answer.
let awaitingAnswerForQuest = null;
let lastIssueUrl = null;

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await postDailyQuests();
  setInterval(postDailyQuests, 24 * 60 * 60 * 1000);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  // Only operate naturally in the quest channel
  if (QUEST_CHANNEL_ID && msg.channelId !== QUEST_CHANNEL_ID) return;

  const raw = msg.content.trim();
  const text = raw.toLowerCase();

  // Always-available tiny command
  if (text === "ping") {
    await msg.reply("pong ✅");
    return;
  }

  // Approvals
  const approveMatch = text.match(/^approve\s+([123])$/);
  if (approveMatch) {
    const n = Number(approveMatch[1]);
    awaitingAnswerForQuest = n;

    const question =
      n === 1 ? "Quick choice: BNKR orange/black vibe or retro terminal?"
      : n === 2 ? "Tone: funny (overdue bills fall) or clean/minimal?"
      : "Style: public-facing pretty or internal functional?";

    await msg.reply(
      `✅ Approved Quest ${n}.\n${question}\n\nJust reply normally with your answer.`
    );
    return;
  }

  // If we’re awaiting an answer, treat the next normal message as the answer
  if (awaitingAnswerForQuest) {
    const n = awaitingAnswerForQuest;
    awaitingAnswerForQuest = null;

    await msg.reply("🛠️ Creating GitHub issue…");

    try {
      const issue = await createGithubIssue(
        `Quest ${n}: Build`,
        `Quest: ${n}\nUser answer: ${raw}\n\nCreated via Discord agent.`
      );
      lastIssueUrl = issue.html_url;
      await msg.reply(`✅ Issue created:\n${issue.html_url}`);
    } catch (err) {
      await msg.reply(`❌ GitHub error:\n${err.message}`);
    }
    return;
  }

  // Light “natural” talk, but it won’t build unless you approve
  // Keep it minimal to avoid spam.
  if (text.includes("help") || text.includes("what now") || text.includes("next")) {
    await msg.reply(
      `Say "approve 1/2/3" to pick a quest. After you approve, your next message becomes the answer and I’ll create a GitHub issue.\n` +
      (lastIssueUrl ? `Last issue: ${lastIssueUrl}` : "")
    );
  }
});

client.login(DISCORD_TOKEN);
