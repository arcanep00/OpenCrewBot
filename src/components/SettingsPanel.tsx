"use client";

import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { useApp } from "./OpenCrewBotApp";
import { Drawer } from "./ui";

function KeyRow({ name, envVar, ok, what, href }: { name: string; envVar: string; ok: boolean; what: string; href: string }) {
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14.5px] font-medium">{name}</span>
        <span className={clsx("flex items-center gap-1.5 text-[12.5px]", ok ? "text-ok" : "text-faint")}>
          <span className={clsx("h-2 w-2 rounded-full", ok ? "bg-ok" : "bg-[#3a3a3a]")} />
          {ok ? "Connected" : "Not set"}
        </span>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-mute">{what}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <code className="rounded-md bg-raised-2 px-1.5 py-0.5 font-mono text-[12px] text-mute">{envVar}</code>
        <a className="inline-flex items-center gap-0.5 text-[12.5px] text-mute hover:text-ink" href={href} target="_blank" rel="noopener noreferrer">
          Get a key <ArrowUpRight size={13} />
        </a>
      </div>
    </li>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const status = state.status;
  return (
    <Drawer title="Settings" onClose={onClose}>
      <section>
        <h3 className="text-[12.5px] font-medium text-mute">API keys</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-mute">
          Keys live on the server in <code className="rounded-md bg-raised-2 px-1 font-mono text-[12px]">.env</code>, never in the browser. Add them,
          then restart <code className="rounded-md bg-raised-2 px-1 font-mono text-[12px]">pnpm dev</code>.
        </p>
        <ul className="mt-3 divide-y divide-line rounded-2xl bg-raised">
          <KeyRow
            name="Nebius Token Factory"
            envVar="NEBIUS_API_KEY"
            ok={Boolean(status?.keys.nebius)}
            what="Open-source models. Without it, bots use a scripted mock model."
            href="https://tokenfactory.nebius.com"
          />
          <KeyRow
            name="OpenAI"
            envVar="OPENAI_API_KEY"
            ok={Boolean(status?.keys.openai)}
            what="GPT-4o, o3-mini and other OpenAI models. Required to use them."
            href="https://platform.openai.com/api-keys"
          />
          <KeyRow
            name="Anthropic"
            envVar="ANTHROPIC_API_KEY"
            ok={Boolean(status?.keys.anthropic)}
            what="Claude Sonnet, Haiku and Opus. Required to use them."
            href="https://console.anthropic.com/settings/keys"
          />
          <KeyRow name="Tavily" envVar="TAVILY_API_KEY" ok={Boolean(status?.keys.tavily)} what="Web search, page reading and site crawls." href="https://app.tavily.com" />
          <KeyRow
            name="Browserbase"
            envVar="BROWSERBASE_API_KEY"
            ok={Boolean(status?.keys.browserbase)}
            what="Cloud browsers for bots with the Browser tool. Watch them live and take over."
            href="https://www.browserbase.com"
          />
          <KeyRow
            name="Composio"
            envVar="COMPOSIO_API_KEY"
            ok={Boolean(status?.keys.composio)}
            what="Connected apps: Slack, GitHub, Gmail, Notion and 1,000+ more, with sign-in handled by Composio."
            href="https://platform.composio.dev"
          />
          <KeyRow
            name="Jev (TypeSafe)"
            envVar="TYPESAFE_API_KEY"
            ok={Boolean(status?.keys.jev)}
            what="Picks who answers in Auto rooms. Without it, the room's lead answers."
            href="https://typesafe.ai"
          />
        </ul>
      </section>
      <section className="mt-7">
        <h3 className="text-[12.5px] font-medium text-mute">Integrations status</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-mute">
          Connect apps in the Connections panel. This shows which are live vs not yet connected.
        </p>
        <ul className="mt-3 divide-y divide-line rounded-2xl bg-raised">
          {[
            { name: "GitHub", what: "Inspect repos, open issues, review PRs. Connect via Composio.", key: "composio" },
            { name: "Gmail", what: "Draft and send emails. Connect via Composio.", key: "composio" },
            { name: "Slack", what: "Post messages, read channels. Connect via Composio.", key: "composio" },
            { name: "Notion", what: "Read and write pages. Connect via Composio.", key: "composio" },
          ].map((item) => (
            <li key={item.name} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-medium">{item.name}</span>
                <span className={clsx("text-[12px]", status?.keys.composio ? "text-ok" : "text-faint")}>
                  {status?.keys.composio ? "Available via Composio" : "Needs COMPOSIO_API_KEY"}
                </span>
              </div>
              <p className="mt-0.5 text-[12.5px] text-mute">{item.what}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-7">
        <h3 className="text-[12.5px] font-medium text-mute">Data</h3>
        <p className="mt-1 text-[13px] text-mute">
          Bots, chats and each bot&apos;s <code className="rounded-md bg-raised-2 px-1 font-mono text-[12px]">MEMORY.md</code> are stored locally in:
        </p>
        <p className="mt-2 rounded-2xl bg-raised px-4 py-3 font-mono text-[12px] break-all text-mute">{status?.dataDir}</p>
      </section>
    </Drawer>
  );
}
