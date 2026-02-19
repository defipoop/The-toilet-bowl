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

async function gh(path, method = "GET", bodyObj = null) {
  if (!GITHUB_TOKEN || !REPO_NAME) throw new Error("Missing GITHUB_TOKEN or REPO_NAME.");

  const res = await fetch(`https://api.github.com/repos/${REPO_NAME}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "agent-poo"
    },
    body: bodyObj ? JSON.stringify(bodyObj) : null
  });

  const text = await res.text().catch(() => "");
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}\n${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function createGithubIssue(title, body) {
  return gh(`/issues`, "POST", { title, body });
}

async function getDefaultBranch() {
  const repo = await gh(``, "GET");
  return repo.default_branch || "main";
}

async function getBranchSha(branch) {
  const ref = await gh(`/git/ref/heads/${branch}`, "GET");
  return ref.object.sha;
}

async function createBranch(newBranch, fromBranch) {
  const sha = await getBranchSha(fromBranch);
  await gh(`/git/refs`, "POST", { ref: `refs/heads/${newBranch}`, sha });
}

async function upsertFile(branch, path, content, message) {
  const b64 = Buffer.from(content, "utf8").toString("base64");

  let existing = null;
  try {
    existing = await gh(`/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, "GET");
  } catch {
    existing = null;
  }

  const payload = { message, content: b64, branch };
  if (existing?.sha) payload.sha = existing.sha;

  return gh(`/contents/${encodeURIComponent(path)}`, "PUT", payload);
}

async function openPullRequest(title, headBranch, baseBranch, body) {
  return gh(`/pulls`, "POST", { title, head: headBranch, base: baseBranch, body });
}

// PR comments go through Issues API
async function commentOnPullRequest(prNumber, body) {
  return gh(`/issues/${prNumber}/comments`, "POST", { body });
}

function questsText() {
  return `🧠 Daily Build Quests
Say: "approve 1/2/3" → reply normally → I create an issue.
Then say: "build now" → I open a starter PR + comment summary + self-review.

1) (S) Ok Computer microsite
2) (M) Mini clicker game
3) (S) Context viewer webpage`;
}

async function postDailyQuests() {
  if (!QUEST_CHANNEL_ID) return;
  const ch = await client.channels.fetch(QUEST_CHANNEL_ID).catch(() => null);
  if (!ch) return;
  await ch.send(questsText());
}

let awaitingAnswerForQuest = null;
let lastIssue = null; // { number, url, quest, answer }
let buildInProgress = false;

function starterFilesForQuest(n, answer) {
  if (n === 1) {
    return {
      files: {
        "apps/microsite/index.html": `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ok Computer Microsite</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <main class="wrap">
    <h1>Ok Computer</h1>
    <p class="sub">Vibe: ${answer}</p>
    <button id="btn">make it more computer</button>
    <div id="meter" class="meter"></div>
  </main>
  <script src="./app.js"></script>
</body>
</html>
`,
        "apps/microsite/style.css": `body{font-family:system-ui,sans-serif;margin:0}
.wrap{max-width:720px;margin:48px auto;padding:0 16px}
button{padding:12px 16px;font-size:16px;cursor:pointer}
.meter{margin-top:16px;height:12px;width:0%;background:#111;transition:width 200ms ease}
.sub{opacity:.7}
`,
        "apps/microsite/app.js": `let lvl=0;
const meter=document.getElementById("meter");
document.getElementById("btn").addEventListener("click",()=>{
  lvl=Math.min(100,lvl+10);
  meter.style.width=lvl+"%";
});
`
      }
    };
  }

  if (n === 2) {
    return {
      files: {
        "apps/clicker/index.html": `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Everything Becomes Computer</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <main class="wrap">
    <h1>Everything Becomes Computer</h1>
    <p class="sub">Tone: ${answer}</p>
    <button id="click">click</button>
    <div class="bar"><div id="fill" class="fill"></div></div>
    <p id="status"></p>
  </main>
  <script src="./app.js"></script>
</body>
</html>
`,
        "apps/clicker/style.css": `body{font-family:system-ui,sans-serif;margin:0}
.wrap{max-width:720px;margin:48px auto;padding:0 16px}
button{padding:12px 16px;font-size:16px;cursor:pointer}
.bar{margin-top:16px;height:14px;background:#eee}
.fill{height:14px;width:0%;background:#111;transition:width 120ms ease}
.sub{opacity:.7}
`,
        "apps/clicker/app.js": `let p=0;
const fill=document.getElementById("fill");
const status=document.getElementById("status");
document.getElementById("click").addEventListener("click",()=>{
  p=Math.min(100,p+5);
  fill.style.width=p+"%";
  status.textContent=p>=100?"✅ everything is computer now":"";
});
`
      }
    };
  }

  return {
    files: {
      "apps/context-viewer/index.html": `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Agent Context Viewer</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <main class="wrap">
    <h1>AGENT_CONTEXT.md</h1>
    <p class="sub">Style: ${answer}</p>
    <pre id="out">loading…</pre>
  </main>
  <script src="./app.js"></script>
</body>
</html>
`,
      "apps/context-viewer/style.css": `body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:0}
.wrap{max-width:900px;margin:40px auto;padding:0 16px}
pre{white-space:pre-wrap;background:#111;color:#eee;padding:16px;border-radius:8px}
.sub{opacity:.7;font-family:system-ui,sans-serif}
`,
      "apps/context-viewer/app.js": `fetch("../../AGENT_CONTEXT.md")
  .then(r=>r.text())
  .then(t=>document.getElementById("out").textContent=t)
  .catch(()=>document.getElementById("out").textContent="failed to load");`
    }
  };
}

function prSummaryText(prUrl) {
  return `### ✅ What I did
- Created starter files for the approved quest
- Kept scope intentionally small (starter scaffolding)

### 🗂️ Files added
- /apps/... (starter HTML/CSS/JS)
- README_AGENT.md

### ▶️ How to run
Open the relevant \`index.html\` file in a browser (or serve the repo with any static server).

PR: ${prUrl}`;
}

function prSelfReviewChecklist() {
  return `### 🤖 Self-review
- [ ] The build matches the approved quest + your answer
- [ ] No secrets/tokens committed
- [ ] Files are in the right folders
- [ ] JS runs without console errors
- [ ] Naming is consistent
- [ ] Next improvement noted for v2`;
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await postDailyQuests();
  setInterval(postDailyQuests, 24 * 60 * 60 * 1000);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (QUEST_CHANNEL_ID && msg.channelId !== QUEST_CHANNEL_ID) return;

  const raw = msg.content.trim();
  const text = raw.toLowerCase();

  if (text === "ping") {
    await msg.reply("pong ✅");
    return;
  }

  const approveMatch = text.match(/^approve\s+([123])$/);
  if (approveMatch) {
    const n = Number(approveMatch[1]);
    awaitingAnswerForQuest = n;

    const q =
      n === 1 ? "Quick choice: BNKR orange/black vibe or retro terminal?"
      : n === 2 ? "Tone: funny (overdue bills fall) or clean/minimal?"
      : "Style: public-facing pretty or internal functional?";

    await msg.reply(`✅ Approved Quest ${n}. ${q}\nJust reply normally with your answer.`);
    return;
  }

  if (awaitingAnswerForQuest) {
    const n = awaitingAnswerForQuest;
    awaitingAnswerForQuest = null;

    await msg.reply("🛠️ Creating GitHub issue…");
    try {
      const issue = await createGithubIssue(
        `Quest ${n}: Build`,
        `Quest: ${n}\nUser answer: ${raw}\n\nNext: say "build now" to generate a starter PR.`
      );
      lastIssue = { number: issue.number, url: issue.html_url, quest: n, answer: raw };
      await msg.reply(`✅ Issue created:\n${issue.html_url}\n\nWhen ready: type "build now"`);
    } catch (err) {
      await msg.reply(`❌ GitHub error:\n${err.message}`);
    }
    return;
  }

  if (text === "build now") {
    if (buildInProgress) {
      await msg.reply("⏳ Build already running.");
      return;
    }
    if (!lastIssue) {
      await msg.reply('No issue yet. Do "approve 1/2/3" first.');
      return;
    }

    buildInProgress = true;
    try {
      const base = await getDefaultBranch();
      const branch = `agent/quest-${lastIssue.quest}-issue-${lastIssue.number}`;

      await msg.reply(`🧱 Building starter PR on \`${branch}\`…`);

      await createBranch(branch, base);

      const starter = starterFilesForQuest(lastIssue.quest, lastIssue.answer);

      await upsertFile(
        branch,
        "README_AGENT.md",
        `# Agent Builds\n\nLatest build: Quest ${lastIssue.quest}\nIssue: ${lastIssue.url}\n`,
        `agent: add README_AGENT for issue #${lastIssue.number}`
      );

      for (const [path, content] of Object.entries(starter.files)) {
        await upsertFile(branch, path, content, `agent: start quest ${lastIssue.quest} (issue #${lastIssue.number})`);
      }

      const pr = await openPullRequest(
        `Quest ${lastIssue.quest} starter (issue #${lastIssue.number})`,
        branch,
        base,
        `Starter implementation for issue #${lastIssue.number}\n\nIssue: ${lastIssue.url}`
      );

      // PR comments
      await commentOnPullRequest(pr.number, prSummaryText(pr.html_url));
      await commentOnPullRequest(pr.number, prSelfReviewChecklist());

      await msg.reply(`✅ PR opened + commented:\n${pr.html_url}`);
    } catch (err) {
      await msg.reply(`❌ Build failed:\n${err.message}`);
    } finally {
      buildInProgress = false;
    }
    return;
  }

  if (text.includes("help") || text.includes("what now") || text.includes("next")) {
    await msg.reply(
      `Say "approve 1/2/3". After you answer, I create an issue.\nThen say "build now" to open a starter PR.\n` +
      (lastIssue ? `Last issue: ${lastIssue.url}` : "")
    );
  }
});

client.login(DISCORD_TOKEN);
