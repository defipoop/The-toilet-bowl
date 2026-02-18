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

// Render port requirement
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
  const res = await fetch(`https://api.github.com/repos/${REPO_NAME}/issues`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title, body })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  return res.json();
}

let lastApproved = null;

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (msg.channelId !== QUEST_CHANNEL_ID) return;

  const text = msg.content.trim().toLowerCase();

  if (text === "ping") {
    await msg.reply("pong ✅");
    return;
  }

  if (text === "approve 1") {
    lastApproved = 1;
    await msg.reply("Approved Quest 1.\nReply with: answer <your choice>");
    return;
  }

  if (text.startsWith("answer ") && lastApproved === 1) {
    const answer = msg.content.slice(7);

    await msg.reply("Creating GitHub issue...");

    try {
      const issue = await createGithubIssue(
        "Quest 1: Microsite Build",
        `User decision: ${answer}\n\nCreated via Discord agent.`
      );

      await msg.reply(`✅ Issue created:\n${issue.html_url}`);
    } catch (err) {
      await msg.reply(`❌ GitHub error:\n${err.message}`);
    }
  }
});

client.login(DISCORD_TOKEN);
