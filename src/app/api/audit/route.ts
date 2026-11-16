// GET /api/audit — audit log
import { handle } from "@/lib/server/http";
import { listAuditLog } from "@/lib/server/db";

export async function GET() {
  return handle(async () => {
    const entries = await listAuditLog(100);
    return { entries };
  });
}
