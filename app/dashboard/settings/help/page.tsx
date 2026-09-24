import { redirect } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HelpStep } from "@/lib/help/types";

export const dynamic = "force-dynamic";

export default async function HelpManagementPage() {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userResult.user!.id)
    .single();
  if (profile?.role !== "super_admin") redirect("/dashboard/settings/appearance");

  const { data: workflows } = await supabase
    .from("help_workflows")
    .select("id, title, category_id, version, allowed_roles, steps, drift_detected, updated_at, target_route")
    .order("category_id")
    .order("title");

  const rows = workflows ?? [];
  const drifted = rows.filter((w) => w.drift_detected).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Help Center content</CardTitle>
        <CardDescription>
          {rows.length} workflows. Screenshots are regenerated with{" "}
          <code className="rounded bg-muted px-1">npm run help:refresh-assets</code>; drift is checked by{" "}
          <code className="rounded bg-muted px-1">npm run help:check-drift</code> and the post-deploy cron.
          {drifted > 0 && ` ${drifted} need attention.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.map((wf) => {
          const steps = (wf.steps ?? []) as HelpStep[];
          const shots = steps.filter((s) => s.desktop_image_url).length;
          return (
            <div key={wf.id} data-testid={`help-mgmt-${wf.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{wf.title}</p>
                <p className="text-xs text-muted-foreground">
                  {wf.id} · v{wf.version} · {(wf.allowed_roles as string[]).join(", ")} · {shots}/{steps.length} screenshots
                </p>
              </div>
              {wf.drift_detected ? (
                <Badge className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="size-3" />
                  UI changes detected. Screenshots out of date.
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-emerald-600">
                  <CheckCircle2 className="size-3" />
                  Up to date
                </Badge>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
