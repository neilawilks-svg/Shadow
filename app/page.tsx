import Link from "next/link";

import { Badge } from "@/components/badge";
import { SectionCard } from "@/components/section-card";

const modules = [
  {
    title: "Live Meeting Cockpit",
    href: "/meeting",
    description:
      "Capture meeting audio, stream transcript context, detect raise-hand moments, and invite Morgan for on-demand perspective.",
  },
  {
    title: "Persona Studio",
    href: "/personas",
    description:
      "Build fixed and interview-derived board personas using values and decision style without identity imitation.",
  },
  {
    title: "Virtual Shadow Board",
    href: "/shadow-board",
    description:
      "Run eight fixed board personas against upcoming agenda topics and synthesize consensus, dissent, and recommendations.",
  },
  {
    title: "Demo Control",
    href: "/demo",
    description:
      "Reset state, apply presets, and follow presenter prompts for a consistent client-facing narrative.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
      <SectionCard
        title="Morgan Virtual Board Member"
        subtitle="AI-powered eighth board member, persona panel, and shadow board simulation"
        rightSlot={
          <div className="flex flex-wrap gap-2">
            <Badge label="Local-First" tone="good" />
            <Badge label="Consent + Redaction" tone="good" />
            <Badge label="No Raw Audio Save" tone="good" />
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {modules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-4 transition hover:-translate-y-0.5 hover:bg-white"
            >
              <h2 className="mb-1 text-lg font-semibold text-[color:var(--ink-1)]">{module.title}</h2>
              <p className="text-sm text-[color:var(--ink-2)]">{module.description}</p>
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Architecture Highlights" subtitle="Implementation choices aligned to the decision-complete plan">
        <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--ink-2)]">
          <li>TypeScript full-stack Next.js app with App Router APIs.</li>
          <li>OpenAI Realtime token endpoint for transcription session init.</li>
          <li>Model-only intervention judgment with cooldown and SSE push updates.</li>
          <li>Eight fixed personas plus guided interview synthesis for custom personas.</li>
          <li>Shadow board simulation output with consensus and dissent summaries.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
