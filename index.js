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

// -------------------- GitHub helpers --------------------
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

async function readFile(branch, path) {
  const obj = await gh(`/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, "GET");
  const b64 = obj.content?.replace(/\n/g, "") || "";
  const txt = Buffer.from(b64, "base64").toString("utf8");
  return { text: txt, sha: obj.sha };
}

async function createGithubIssue(title, body) {
  return gh(`/issues`, "POST", { title, body });
}

async function openPullRequest(title, headBranch, baseBranch, body) {
  return gh(`/pulls`, "POST", { title, head: headBranch, base: baseBranch, body });
}

async function commentOnPullRequest(prNumber, body) {
  return gh(`/issues/${prNumber}/comments`, "POST", { body });
}

async function mergePullRequest(prNumber) {
  return gh(`/pulls/${prNumber}/merge`, "PUT", { merge_method: "squash" });
}

// -------------------- Persistent state --------------------
const STATE_BRANCH = "agent-state";
const STATE_PATH = "agent_state.json";

let state = {
  awaitingAnswerForQuest: null, // 1/2/3
  lastIssue: null,             // { number, url, quest, answer }
  lastPr: null                 // { number, url }
};

async function ensureStateBranch() {
  try {
    await getBranchSha(STATE_BRANCH);
    return;
  } catch {
    const base = await getDefaultBranch();
    await createBranch(STATE_BRANCH, base);
  }
}

async function loadState() {
  await ensureStateBranch();
  try {
    const { text } = await readFile(STATE_BRANCH, STATE_PATH);
    const parsed = JSON.parse(text);
    // only accept known keys
    state.awaitingAnswerForQuest = parsed.awaitingAnswerForQuest ?? null;
    state.lastIssue = parsed.lastIssue ?? null;
    state.lastPr = parsed.lastPr ?? null;
    console.log("State loaded:", JSON.stringify(state));
  } catch {
    // First run: create file
    await saveState("agent: init state");
  }
}

async function saveState(message = "agent: save state") {
  await ensureStateBranch();
  const safe = JSON.stringify(state, null, 2);
  await upsertFile(STATE_BRANCH, STATE_PATH, safe, message);
}

// -------------------- Quests / content --------------------
function questsText() {
  return `🧠 Daily Build Quests
approve 1/2/3 → reply normally → issue created
build now → PR created
merge → merges the latest PR I created

1) microsite
2) clicker
3) context viewer`;
}

async function postDailyQuests() {
  if (!QUEST_CHANNEL_ID) return;
  const ch = await client.channels.fetch(QUEST_CHANNEL_ID).catch(() => null);
  if (!ch) return;
  await ch.send(questsText());
}

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

function prSummaryText(prUrl, quest, issueUrl) {
  return `### ✅ Summary
- Starter scaffolding for Quest ${quest}
- Linked to: ${issueUrl}

### 🗂️ Files
- /apps/... (starter HTML/CSS/JS)
- README_AGENT.md

PR: ${prUrl}`;
}

function prSelfReviewChecklist() {
  return `### 🤖 Self-review
- [ ] Matches approved quest + answer
- [ ] No secrets committed
- [ ] Runs without console errors
- [ ] Clear next step for v2`;
}

// -------------------- Bot logic --------------------
let buildInProgress = false;

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await loadState();          // << persistence
  await postDailyQuests();    // single post on boot
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

  if (text === "status") {
    await msg.reply(
      `State:\nawaitingAnswerForQuest=${state.awaitingAnswerForQuest ?? "null"}\n` +
      `lastIssue=${state.lastIssue?.url ?? "null"}\n` +
      `lastPr=${state.lastPr?.url ?? "null"}`
    );
    return;
  }

  // merge
  if (text === "merge") {
    if (!state.lastPr) {
      await msg.reply("No PR to merge yet. Use `build now` first.");
      return;
    }
    await msg.reply(`Merging PR #${state.lastPr.number}…`);
    try {
      await mergePullRequest(state.lastPr.number);
      await msg.reply(`✅ Merged: ${state.lastPr.url}`);
      state.lastPr = null;
      await saveState("agent: cleared lastPr after merge");
    } catch (err) {
      await msg.reply(`❌ Merge failed:\n${err.message}`);
    }
    return;
  }

  // approve N
  const approveMatch = text.match(/^approve\s+([123])$/);
  if (approveMatch) {
    const n = Number(approveMatch[1]);
    state.awaitingAnswerForQuest = n;
    await saveState(`agent: awaiting answer for quest ${n}`);

    const q =
      n === 1 ? "Quick choice: BNKR orange/black vibe or retro terminal?"
      : n === 2 ? "Tone: funny (overdue bills fall) or clean/minimal?"
      : "Style: public-facing pretty or internal functional?";

    await msg.reply(`✅ Approved Quest ${n}. ${q}\nJust reply normally with your answer.`);
    return;
  }

  // answer capture
  if (state.awaitingAnswerForQuest) {
    const n = state.awaitingAnswerForQuest;
    state.awaitingAnswerForQuest = null;
    await saveState(`agent: got answer for quest ${n}`);

    await msg.reply("🛠️ Creating GitHub issue…");
    try {
      const issue = await createGithubIssue(
        `Quest ${n}: Build`,
        `Quest: ${n}\nUser answer: ${raw}\n\nNext: say "build now" to generate a starter PR.`
      );
      state.lastIssue = { number: issue.number, url: issue.html_url, quest: n, answer: raw };
      await saveState(`agent: set lastIssue #${issue.number}`);

      await msg.reply(`✅ Issue created:\n${issue.html_url}\n\nWhen ready: type "build now"`);
    } catch (err) {
      await msg.reply(`❌ GitHub error:\n${err.message}`);
    }
    return;
  }

  // build now
  if (text === "build now") {
    if (buildInProgress) {
      await msg.reply("⏳ Build already running.");
      return;
    }
    if (!state.lastIssue) {
      await msg.reply('No issue yet. Do "approve 1/2/3" first.');
      return;
    }

    buildInProgress = true;
    try {
      const base = await getDefaultBranch();
      const branch = `agent/quest-${state.lastIssue.quest}-issue-${state.lastIssue.number}`;

      await msg.reply(`🧱 Building starter PR on \`${branch}\`…`);

      await createBranch(branch, base);

      const starter = starterFilesForQuest(state.lastIssue.quest, state.lastIssue.answer);

      await upsertFile(
        branch,
        "README_AGENT.md",
        `# Agent Builds\n\nLatest build: Quest ${state.lastIssue.quest}\nIssue: ${state.lastIssue.url}\n`,
        `agent: add README_AGENT for issue #${state.lastIssue.number}`
      );

      for (const [path, content] of Object.entries(starter.files)) {
        await upsertFile(branch, path, content, `agent: start quest ${state.lastIssue.quest} (issue #${state.lastIssue.number})`);
      }

      const pr = await openPullRequest(
        `Quest ${state.lastIssue.quest} starter (issue #${state.lastIssue.number})`,
        branch,
        base,
        `Starter implementation for issue #${state.lastIssue.number}\n\nIssue: ${state.lastIssue.url}`
      );

      await commentOnPullRequest(pr.number, prSummaryText(pr.html_url, state.lastIssue.quest, state.lastIssue.url));
      await commentOnPullRequest(pr.number, prSelfReviewChecklist());

      state.lastPr = { number: pr.number, url: pr.html_url };
      await saveState(`agent: set lastPr #${pr.number}`);

      await msg.reply(`✅ PR opened:\n${pr.html_url}\n\nType \`merge\` to merge it.`);
    } catch (err) {
      await msg.reply(`❌ Build failed:\n${err.message}`);
    } finally {
      buildInProgress = false;
    }
    return;
  }

  // help
  if (text.includes("help") || text.includes("what now") || text.includes("next")) {
    await msg.reply(
      `approve 1/2/3 → answer normally → issue\nbuild now → PR\nmerge → merge latest PR\n` +
      (state.lastIssue ? `Last issue: ${state.lastIssue.url}\n` : "") +
      (state.lastPr ? `Last PR: ${state.lastPr.url}` : "")
    );
  }
});

client.login(DISCORD_TOKEN);
