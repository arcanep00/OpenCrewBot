// GET /api/skills — list all available skills
// GET /api/skills?task=... — suggest skills for a task description
import { handle } from "@/lib/server/http";
import { ALL_SKILLS, selectSkillsForTask } from "@/lib/server/skills";

export async function GET(request: Request) {
  return handle(async () => {
    const { searchParams } = new URL(request.url);
    const task = searchParams.get("task");
    if (task) {
      const suggested = selectSkillsForTask(task, 3);
      return { skills: suggested };
    }
    return { skills: ALL_SKILLS };
  });
}
