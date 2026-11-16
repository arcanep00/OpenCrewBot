// Skills Ecosystem — Module F
// 8 reusable skills that agents can dynamically load.
// Each skill adds specific instructions and identifies required tools.

import type { Skill, SkillId, BotTools } from "@/lib/shared/types";

// ── Skill definitions ─────────────────────────────────────────────────────

export const SKILLS: Record<SkillId, Skill> = {
  "market-research": {
    id: "market-research",
    name: "Market Research",
    description: "Research markets, industries, trends, and opportunities.",
    instructions: [
      "## Market Research Skill",
      "When performing market research:",
      "1. Identify the target market and its key segments.",
      "2. Research market size, growth rate, and trends using web search.",
      "3. Identify key players, their market share, and positioning.",
      "4. Look for unmet needs, gaps, and emerging opportunities.",
      "5. Summarise findings in a structured report with sources.",
      "Always cite your sources. Distinguish between verified data and estimates.",
    ].join("\n"),
    requiredTools: ["webSearch"],
  },

  "competitor-analysis": {
    id: "competitor-analysis",
    name: "Competitor Analysis",
    description: "Analyse competitors' products, pricing, strengths, and weaknesses.",
    instructions: [
      "## Competitor Analysis Skill",
      "When analysing competitors:",
      "1. Identify direct and indirect competitors.",
      "2. For each competitor, research: products/services, pricing (if public), target customers, positioning, strengths, weaknesses.",
      "3. Build a comparison table.",
      "4. Identify gaps and strategic opportunities.",
      "5. Present findings with evidence and source links.",
      "Focus on publicly available information only.",
    ].join("\n"),
    requiredTools: ["webSearch"],
  },

  "financial-modelling": {
    id: "financial-modelling",
    name: "Financial Modelling",
    description: "Build financial models, analyse numbers, and produce projections.",
    instructions: [
      "## Financial Modelling Skill",
      "When building financial models:",
      "1. Clarify assumptions explicitly before calculating.",
      "2. Structure: Revenue model → Cost structure → Margin analysis → Projections.",
      "3. Use code mode for calculations to ensure accuracy.",
      "4. Present results in tables. Show formulae or working where helpful.",
      "5. Include sensitivity analysis (best/base/worst case).",
      "6. Flag assumptions that have high uncertainty.",
      "Always label currency and time periods clearly.",
    ].join("\n"),
    requiredTools: ["codeMode"],
  },

  "presentation-creation": {
    id: "presentation-creation",
    name: "Presentation Creation",
    description: "Structure and write presentation content, slide decks, and pitches.",
    instructions: [
      "## Presentation Creation Skill",
      "When creating presentations:",
      "1. Start with the narrative arc: problem → solution → evidence → call to action.",
      "2. Structure into clear sections. Each slide should have one key message.",
      "3. Write slide titles as headlines (not labels).",
      "4. Keep body text short — 3-5 bullet points max per slide.",
      "5. Suggest visuals (charts, diagrams) where data would be clearer visually.",
      "6. End with a clear summary and next steps.",
      "Output as structured Markdown with ## headings for each slide.",
    ].join("\n"),
    requiredTools: [],
  },

  "email-drafting": {
    id: "email-drafting",
    name: "Email Drafting",
    description: "Draft professional emails, outreach messages, and follow-ups.",
    instructions: [
      "## Email Drafting Skill",
      "When drafting emails:",
      "1. Identify: recipient, purpose, desired outcome, tone (formal/informal).",
      "2. Subject line: specific, outcome-oriented, under 60 characters.",
      "3. Opening: acknowledge context or relationship.",
      "4. Body: one clear ask or message per email. No more than 3 paragraphs.",
      "5. CTA: specific, actionable, with a deadline if relevant.",
      "6. Closing: professional and warm.",
      "Provide subject line + body. Flag if sending requires approval.",
    ].join("\n"),
    requiredTools: [],
  },

  "code-review": {
    id: "code-review",
    name: "Code Review",
    description: "Review code for bugs, security issues, performance, and best practices.",
    instructions: [
      "## Code Review Skill",
      "When reviewing code:",
      "1. Check for: bugs and logic errors, security vulnerabilities (injection, auth, secrets), performance issues, code clarity and naming.",
      "2. Check adherence to the language's idiomatic style.",
      "3. Look for missing error handling and edge cases.",
      "4. Prioritise issues: Critical (must fix) → Major (should fix) → Minor (nice to fix).",
      "5. For each issue: file/line, description, suggested fix.",
      "6. End with a summary verdict: Approve / Request changes / Block.",
      "Be specific. Quote the relevant code when pointing to an issue.",
    ].join("\n"),
    requiredTools: ["codeMode"],
  },

  "data-analysis": {
    id: "data-analysis",
    name: "Data Analysis",
    description: "Analyse datasets, identify patterns, and produce insights.",
    instructions: [
      "## Data Analysis Skill",
      "When analysing data:",
      "1. First describe the dataset: shape, columns, data types, missing values.",
      "2. Summary statistics: mean, median, min, max, distributions.",
      "3. Identify patterns, trends, correlations, and outliers.",
      "4. Segment analysis where relevant (by category, time period, etc.).",
      "5. Produce clear findings with supporting numbers.",
      "6. Recommend actions based on the data.",
      "Use code mode for calculations. Present results in tables where possible.",
    ].join("\n"),
    requiredTools: ["codeMode"],
  },

  "lead-generation": {
    id: "lead-generation",
    name: "Lead Generation",
    description: "Research and identify potential customers, partners, or contacts.",
    instructions: [
      "## Lead Generation Skill",
      "When generating leads:",
      "1. Define the ideal customer/partner profile first.",
      "2. Research potential leads using web search.",
      "3. For each lead: name/company, contact info (if public), why they fit the profile, potential value.",
      "4. Prioritise leads by fit and accessibility.",
      "5. Suggest a personalised outreach approach for top leads.",
      "6. Output a structured list with source links.",
      "Only use publicly available information. Never fabricate contacts.",
    ].join("\n"),
    requiredTools: ["webSearch"],
  },
};

export const ALL_SKILLS = Object.values(SKILLS);

// ── Dynamic skill selection ───────────────────────────────────────────────

/** Pick the most relevant skills for a task based on its description. */
export function selectSkillsForTask(taskDescription: string, maxSkills = 2): Skill[] {
  const desc = taskDescription.toLowerCase();
  const scored = ALL_SKILLS.map((skill) => {
    let score = 0;
    const keywords = skill.name.toLowerCase().split(/\W+/);
    for (const kw of keywords) {
      if (desc.includes(kw)) score += 2;
    }
    // Specific pattern matches
    if (/market|industry|trend|landscape/i.test(desc) && skill.id === "market-research") score += 5;
    if (/compet|rival|benchmark|compare/i.test(desc) && skill.id === "competitor-analysis") score += 5;
    if (/financ|revenue|cost|profit|model|project/i.test(desc) && skill.id === "financial-modelling") score += 5;
    if (/slide|presentation|deck|pitch/i.test(desc) && skill.id === "presentation-creation") score += 5;
    if (/email|draft|message|outreach|follow/i.test(desc) && skill.id === "email-drafting") score += 5;
    if (/code|review|bug|security|pr|pull request/i.test(desc) && skill.id === "code-review") score += 5;
    if (/data|analy|spreadsheet|csv|insight|metric/i.test(desc) && skill.id === "data-analysis") score += 5;
    if (/lead|prospect|customer|contact|outreach/i.test(desc) && skill.id === "lead-generation") score += 5;
    return { skill, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSkills)
    .map((s) => s.skill);
}

/** Build the skills instruction block for a bot's system prompt. */
export function skillsPromptSection(skills: Skill[]): string {
  if (!skills.length) return "";
  return ["## Active skills", ...skills.map((s) => s.instructions)].join("\n\n");
}

/** Check if a bot has the tools required by a skill. */
export function botCanUseSkill(botTools: BotTools, skill: Skill): boolean {
  return skill.requiredTools.every((tool) => botTools[tool]);
}

/** Get all skills a bot can use given its tools. */
export function availableSkillsForBot(botTools: BotTools): Skill[] {
  return ALL_SKILLS.filter((s) => botCanUseSkill(botTools, s));
}
