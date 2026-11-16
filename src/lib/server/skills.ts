import type { Skill, SkillId, BotTools } from "@/lib/shared/types";

export const SKILLS: Record<SkillId, Skill> = {
  "market-research": {
    id: "market-research",
    name: "Market Research",
    description: "Research markets, industries, trends, and opportunities.",
    instructions: [
      "## Market Research",
      "1. Identify the target market and its key segments.",
      "2. Research market size, growth rate, and trends using web search.",
      "3. Identify key players, their market share, and positioning.",
      "4. Look for unmet needs, gaps, and emerging opportunities.",
      "5. Summarise findings with sources. Distinguish verified data from estimates.",
    ].join("\n"),
    requiredTools: ["webSearch"],
  },
  "competitor-analysis": {
    id: "competitor-analysis",
    name: "Competitor Analysis",
    description: "Analyse competitors' products, pricing, strengths, and weaknesses.",
    instructions: [
      "## Competitor Analysis",
      "1. Identify direct and indirect competitors.",
      "2. For each: products, pricing (if public), target customers, positioning, strengths, weaknesses.",
      "3. Build a comparison table.",
      "4. Identify gaps and strategic opportunities with source links.",
    ].join("\n"),
    requiredTools: ["webSearch"],
  },
  "financial-modelling": {
    id: "financial-modelling",
    name: "Financial Modelling",
    description: "Build financial models, analyse numbers, and produce projections.",
    instructions: [
      "## Financial Modelling",
      "1. State assumptions explicitly before calculating.",
      "2. Structure: Revenue model → Cost structure → Margin analysis → Projections.",
      "3. Use code mode for calculations. Present results in tables.",
      "4. Include sensitivity analysis (best/base/worst case).",
      "5. Label currency and time periods clearly.",
    ].join("\n"),
    requiredTools: ["codeMode"],
  },
  "presentation-creation": {
    id: "presentation-creation",
    name: "Presentation Creation",
    description: "Structure and write presentation content, slide decks, and pitches.",
    instructions: [
      "## Presentation Creation",
      "1. Narrative arc: problem → solution → evidence → call to action.",
      "2. One key message per slide. Titles as headlines, not labels.",
      "3. 3–5 bullet points max per slide.",
      "4. Suggest visuals where data would be clearer visually.",
      "5. End with summary and next steps. Output as Markdown with ## headings per slide.",
    ].join("\n"),
    requiredTools: [],
  },
  "email-drafting": {
    id: "email-drafting",
    name: "Email Drafting",
    description: "Draft professional emails, outreach messages, and follow-ups.",
    instructions: [
      "## Email Drafting",
      "1. Subject line: specific, outcome-oriented, under 60 characters.",
      "2. Opening: acknowledge context or relationship.",
      "3. Body: one clear ask per email, max 3 paragraphs.",
      "4. CTA: specific and actionable. Flag if sending requires approval.",
    ].join("\n"),
    requiredTools: [],
  },
  "code-review": {
    id: "code-review",
    name: "Code Review",
    description: "Review code for bugs, security issues, performance, and best practices.",
    instructions: [
      "## Code Review",
      "1. Check for bugs, logic errors, security issues, performance problems, and naming clarity.",
      "2. Look for missing error handling and edge cases.",
      "3. Prioritise: Critical → Major → Minor.",
      "4. For each issue: location, description, suggested fix.",
      "5. End with verdict: Approve / Request changes / Block.",
    ].join("\n"),
    requiredTools: ["codeMode"],
  },
  "data-analysis": {
    id: "data-analysis",
    name: "Data Analysis",
    description: "Analyse datasets, identify patterns, and produce insights.",
    instructions: [
      "## Data Analysis",
      "1. Describe the dataset: columns, types, missing values.",
      "2. Summary statistics: mean, median, min, max, distributions.",
      "3. Identify patterns, trends, correlations, outliers.",
      "4. Produce findings with supporting numbers in tables.",
      "5. Recommend actions based on the data.",
    ].join("\n"),
    requiredTools: ["codeMode"],
  },
  "lead-generation": {
    id: "lead-generation",
    name: "Lead Generation",
    description: "Research and identify potential customers, partners, or contacts.",
    instructions: [
      "## Lead Generation",
      "1. Define the ideal profile first.",
      "2. Research potential leads using web search.",
      "3. For each lead: name/company, public contact info, why they fit, potential value.",
      "4. Prioritise by fit. Suggest personalised outreach for top leads.",
      "5. Output a structured list with source links. Never fabricate contacts.",
    ].join("\n"),
    requiredTools: ["webSearch"],
  },
};

export const ALL_SKILLS = Object.values(SKILLS);

export function selectSkillsForTask(description: string, max = 2): Skill[] {
  const d = description.toLowerCase();
  const scored = ALL_SKILLS.map((skill) => {
    let score = skill.name.toLowerCase().split(/\W+/).filter((w) => d.includes(w)).length * 2;
    if (/market|industry|trend/i.test(d) && skill.id === "market-research") score += 5;
    if (/compet|rival|benchmark/i.test(d) && skill.id === "competitor-analysis") score += 5;
    if (/financ|revenue|cost|profit/i.test(d) && skill.id === "financial-modelling") score += 5;
    if (/slide|presentation|deck|pitch/i.test(d) && skill.id === "presentation-creation") score += 5;
    if (/email|draft|outreach|follow/i.test(d) && skill.id === "email-drafting") score += 5;
    if (/code|review|bug|security/i.test(d) && skill.id === "code-review") score += 5;
    if (/data|analy|spreadsheet|insight/i.test(d) && skill.id === "data-analysis") score += 5;
    if (/lead|prospect|customer|contact/i.test(d) && skill.id === "lead-generation") score += 5;
    return { skill, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.skill);
}

export function skillsPromptSection(skills: Skill[]): string {
  if (!skills.length) return "";
  return ["## Active skills", ...skills.map((s) => s.instructions)].join("\n\n");
}

export function botCanUseSkill(botTools: BotTools, skill: Skill): boolean {
  return skill.requiredTools.every((t) => botTools[t as keyof BotTools]);
}

export function availableSkillsForBot(botTools: BotTools): Skill[] {
  return ALL_SKILLS.filter((s) => botCanUseSkill(botTools, s));
}
