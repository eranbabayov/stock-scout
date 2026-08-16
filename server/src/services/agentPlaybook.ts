import { desc } from "drizzle-orm";
import { db } from "../db";
import { agentPlaybook } from "../db/schema";

// A personal bot's playbook stays small for years, so a plain recency cap
// (no eviction, no relevance ranking) is enough — the model itself decides
// at read time whether any given rule applies.
const PLAYBOOK_LIMIT = 30;

export interface PlaybookRule {
  triggerSummary: string;
  ruleText: string;
}

export async function getPlaybookRules(): Promise<PlaybookRule[]> {
  return db
    .select({ triggerSummary: agentPlaybook.triggerSummary, ruleText: agentPlaybook.ruleText })
    .from(agentPlaybook)
    .orderBy(desc(agentPlaybook.createdAt))
    .limit(PLAYBOOK_LIMIT);
}

export async function addPlaybookRule(triggerSummary: string, ruleText: string): Promise<void> {
  await db.insert(agentPlaybook).values({ triggerSummary, ruleText });
}
