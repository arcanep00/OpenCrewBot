<div align="center">

<img src="docs/logo.svg" alt="OpenCrewBot mascot" width="96" height="96">

# OpenCrewBot 2.0

### An Autonomous AI Workforce

**Built on the OpenCrewBot MIT foundation. Multiple specialised agents that plan work, collaborate, use tools, remember context, and deliver business outcomes.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![Mastra](https://img.shields.io/badge/harness-Mastra-6d28d9)

</div>

---

## What it does

Give one complex instruction. The Chief of Staff breaks it into tasks, assigns each task to the right agent based on their skills, runs independent tasks in parallel, and delivers a consolidated result. Every step is visible in the Task Dashboard.

Built on top of [Studio1-OSS/OpenCrewBot](https://github.com/Studio1-OSS/OpenCrewBot) (MIT) with substantial new engineering across all ten modules.

---

## Get started

Requires **Node.js 22.13+** and **pnpm**.

```sh
git clone https://github.com/arcanep00/OpenCrewBot.git
cd OpenCrewBot
pnpm install
cp .env.example .env
pnpm dev
```

Open **http://localhost:3000**. No keys needed — the app runs in mock mode so you can try every feature first.

On first run, the app creates:
- Three original bots: Scout (research), Quill (writing), Atlas (planning)
- Four MeetUniversity agents: Priya (market analyst), Arjun (marketer), Dev (tech reviewer), Sage (data analyst)
- Four demo rooms: Market Intelligence, Campaign Studio, Dev Review, Analytics
- Two scheduled workflows: Weekly Competitor Monitor, Daily Market Summary

---

## Environment variables

| Variable | What it turns on |
|----------|-----------------|
| `NEBIUS_API_KEY` | Open-source models on Nebius Token Factory |
| `OPENAI_API_KEY` | GPT-4o, o3-mini, o4-mini |
| `ANTHROPIC_API_KEY` | Claude Sonnet, Haiku, Opus |
| `TAVILY_API_KEY` | Web search, page reading, site crawls |
| `BROWSERBASE_API_KEY` | Cloud browser for bots |
| `COMPOSIO_API_KEY` | GitHub, Gmail, Slack, Notion and 1000+ apps |
| `TYPESAFE_API_KEY` | Jev routing in Auto rooms |
| `OPENCREWBOT_DATA_DIR` | Where data lives (default `./data`) |

Every key is optional. Without any model key the app uses a scripted mock model.

---

## The seven demonstrations (MeetUniversity)

All demos use the pre-seeded MeetUniversity agents and rooms.

### Demo 1 — Market Intelligence
Open **Market Intelligence** room → `+` → **Orchestrate with this team**
Instruction: `Research MeetUniversity's competitive landscape. Identify competitors (iDreamCareer, Leverage Edu, Collegedunia, Shiksha), their products, pricing, target customers, and positioning. Produce a comparison table and strategic opportunities.`

### Demo 2 — Marketing Campaign
Open **Campaign Studio** room → Orchestrate
Instruction: `Create a 30-day content calendar for the Aspirations product targeting Class 11 students. Research their career anxieties, develop campaign concepts, and produce sample social media posts.`

### Demo 3 — Business Analysis
Open **Analytics** room → Orchestrate
Instruction: `Analyse a sample sales dataset: 500 leads, 120 consultations, 45 enrolments. Calculate conversion rates at each stage, identify bottlenecks, segment by product line, and produce revenue improvement recommendations.`

### Demo 4 — Development Team
Open **Dev Review** room → Orchestrate
Instruction: `Inspect the OpenCrewBot GitHub repository at https://github.com/Studio1-OSS/OpenCrewBot. Identify technical issues, documentation gaps, and security concerns. Produce a prioritised improvement plan. Ask for approval before proposing any code changes.`

### Demo 5 — Autonomous Routine
Sidebar → ⚙️ Workflows → **Weekly Competitor Monitor** → **Run now**
Watch execution history update. The workflow runs automatically every week.

### Demo 6 — Memory
1. Chat with Priya: `remember that I always want competitor pricing in Indian Rupees`
2. Check her Memory tab — the preference is saved
3. Restart the app (`Ctrl+C`, `pnpm dev`)
4. Chat with Priya about competitors — she remembers the preference
5. Edit her MEMORY.md directly from the Memory tab, change the preference
6. Priya respects the corrected preference in her next reply

### Demo 7 — Human Intervention
1. Chat with Dev: `Open https://github.com/Studio1-OSS/OpenCrewBot and check the latest issues`
2. Dev asks for browser approval — click **Deny**
3. Dev continues without opening the browser — the action never executed

---

## Architecture

```
Browser ──SSE──► Next.js API routes
                    │
                    ├── service.ts          CRUD, validation, seeding
                    ├── runtime.ts          One AgentController per bot
                    ├── chief-of-staff.ts   Task decomposition and orchestration
                    ├── task-engine.ts      Plan lifecycle, parallel execution, retries
                    ├── rooms.ts            Room routing, hand-offs, shared memory
                    ├── scheduler.ts        Scheduled workflow timers
                    ├── skills.ts           8 reusable skill instruction sets
                    ├── shared-memory.ts    Room and project memory (SQLite + Markdown)
                    └── db.ts               SQLite via libsql
```

### Storage

| File | Contents |
|------|----------|
| `data/opencrewbot.db` | Bots, rooms, messages, task plans, workflows, audit log, shared memory |
| `data/mastra.db` | Mastra thread history per bot |
| `data/workspaces/<botId>/MEMORY.md` | Each bot's individual memory |
| `data/workspaces/_shared/<scope>.md` | Room and project shared memory |

### Agent execution flow

1. User sends a message or triggers orchestration
2. `chief-of-staff.ts` decomposes the instruction into tasks
3. Tasks are assigned to bots by capability scoring
4. `task-engine.ts` fires ready tasks in parallel, respects dependencies
5. Each task runs via `runtime.ts` → Mastra `AgentController`
6. Results are consolidated and displayed in the Task Dashboard

---

## Feature audit

### Original OpenCrewBot features (preserved)

| Feature | Status |
|---------|--------|
| Bot creation with name, role, model, tools | ✅ Preserved + extended |
| Rooms with @mentions and hand-offs (2 hops) | ✅ Preserved + extended |
| MEMORY.md per bot, editable in UI | ✅ Preserved + extended |
| Approval cards (Allow/Deny) | ✅ Preserved + extended |
| Composio + MCP integrations | ✅ Preserved + extended |
| Mock mode (no keys needed) | ✅ Preserved |
| Web search, browser tools | ✅ Preserved |
| SQLite persistent storage | ✅ Preserved |
| Streaming SSE events | ✅ Preserved |

### New features built for v2.0

| Feature | Module | Status |
|---------|--------|--------|
| Chief of Staff — task decomposition | A | ✅ Working |
| Parallel task execution with dependencies | A/D | ✅ Working |
| Task Execution Dashboard | D | ✅ Working |
| Task approval/rejection UI | D/G | ✅ Working |
| Retry on failure (max 2) | D | ✅ Working |
| Task timeout (5 min) | D | ✅ Working |
| Dynamic agent creation from natural language | B | ✅ Working |
| Agent permission level selection | B/G | ✅ Working |
| Three approval modes (ask/controlled/full) | G | ✅ Working |
| Audit log | G | ✅ Working |
| Shared room memory | E | ✅ Working |
| Project memory with scopes | E | ✅ Working |
| Memory provenance (date + source) | E | ✅ Working |
| Room Memory tab in Inspector | E | ✅ Working |
| 8 reusable skills | F | ✅ Working |
| Skills auto-injected into prompts | F | ✅ Working |
| Skills Manager UI | F | ✅ Working |
| OpenAI model support | J | ✅ Working |
| Anthropic model support | J | ✅ Working |
| Task-based model routing | J | ✅ Working |
| Model fallback on failure | J | ✅ Working |
| Scheduled workflows (hourly/daily/weekly) | I | ✅ Working |
| Workflow run history | I | ✅ Working |
| Pause/resume workflows | I | ✅ Working |
| Orchestrate button in room UI | A | ✅ Working |
| Project Memory Panel | E | ✅ Working |
| MeetUniversity demo agents + rooms | — | ✅ Seeded |
| MeetUniversity scheduled workflows | I | ✅ Seeded |

---

## Live vs mocked features

| Feature | Status |
|---------|--------|
| Mock model (no key) | ✅ Live — scripted responses exercise all UI |
| Task decomposition in mock mode | ✅ Live — rule-based decomposition |
| Agent creation in mock mode | ✅ Live — name extracted from description |
| Memory (MEMORY.md, shared, project) | ✅ Live — SQLite + files |
| Task execution engine | ✅ Live — full lifecycle |
| Scheduled workflow timers | ✅ Live — in-process timers |
| Approval enforcement | ✅ Live — Mastra enforces, rejected tools never run |
| Audit log | ✅ Live — every approval/denial recorded |
| Nebius models | ✅ Live with `NEBIUS_API_KEY` |
| OpenAI models | ✅ Live with `OPENAI_API_KEY` |
| Anthropic models | ✅ Live with `ANTHROPIC_API_KEY` |
| Web search | ✅ Live with `TAVILY_API_KEY` |
| Browser | ✅ Live with `BROWSERBASE_API_KEY` |
| GitHub/Gmail/Slack/Notion integrations | ✅ Live with `COMPOSIO_API_KEY` + app connection |
| Jev room routing | ✅ Live with `TYPESAFE_API_KEY` |
| Task-based model routing | ✅ Live with any model key — falls back to bot's model |
| LLM-based task decomposition | 🔵 Live with model key; rule-based in mock mode |
| LLM-based agent generation | 🔵 Live with model key; keyword extraction in mock mode |

---

## Cost and dependency breakdown

| Dependency | Purpose | Cost |
|------------|---------|------|
| Nebius Token Factory | Open-source model inference | Pay per token (see model picker) |
| OpenAI API | GPT-4o, o3-mini, o4-mini | Pay per token (see model picker) |
| Anthropic API | Claude models | Pay per token (see model picker) |
| Tavily | Web search and page extraction | Free tier: 1,000 searches/month |
| Browserbase | Cloud browser sessions | Free tier: 100 hours/month |
| Composio | App integrations (Slack, GitHub, etc.) | Free tier: 1,000 actions/month |
| TypeSafe Jev | Room routing decisions | Contact TypeSafe |
| Mastra | Agent orchestration framework | Open source (Apache 2.0) |
| libSQL | SQLite database | Open source |
| Next.js 16 | Web framework | Open source (MIT) |

All infrastructure is local. No separate hosting required to run the app.

---

## Known limitations

- The app has no authentication — it is designed for one local user. Do not expose it to the internet without adding sign-in.
- Browserbase sessions are not supported in mock mode.
- Jev room routing falls back to the lead bot without `TYPESAFE_API_KEY`.
- LLM-based task decomposition and agent generation require at least one model key; mock fallbacks are rule-based and simpler.
- Composio integrations require each app to be connected individually through the Connections panel.
- Scheduled workflow timers reset if the server restarts between trigger times (they reschedule on boot based on `nextRunAt`).

---

## License

[MIT](LICENSE) © 2026 Studio1HQ (original OpenCrewBot)

Extensions © 2026 — built as EDXSO AI Engineering Intern Assignment 3.

Original MIT licence and attribution are retained. All additional dependencies use MIT, Apache 2.0, or compatible licences.
