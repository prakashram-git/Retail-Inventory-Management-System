import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RUNBOOKS } from "@/lib/docs/runbooks";

export const dynamic = "force-dynamic";

export default async function TechnicalDocsPage() {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userResult.user!.id)
    .single();
  if (profile?.role !== "super_admin") redirect("/dashboard/settings/appearance");

  return (
    <div className="flex flex-col gap-4" data-testid="technical-docs">
      {RUNBOOKS.map((book) => (
        <Card key={book.id} id={book.id}>
          <CardHeader>
            <CardTitle>{book.title}</CardTitle>
            <CardDescription>{book.summary}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {book.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {book.commands && (
              <div className="flex flex-col gap-1.5">
                {book.commands.map((c) => (
                  <code key={c} className="rounded-md bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-100">
                    {c}
                  </code>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
