"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTypographySettings } from "@/lib/actions/typography";
import {
  FONT_FAMILIES,
  FONT_FAMILY_LABELS,
  FONT_SIZES,
  FONT_SIZE_LABELS,
  type FontFamily,
  type FontSize,
  type TypographySettings,
} from "@/lib/theme/typography-shared";

export function TypographySettingsCard({ initial }: { initial: TypographySettings }) {
  const [fontFamily, setFontFamily] = useState<FontFamily>(initial.form_font_family);
  const [fontSize, setFontSize] = useState<FontSize>(initial.form_font_size);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await updateTypographySettings({ form_font_family: fontFamily, form_font_size: fontSize });
        toast.success("Typography updated for the whole app");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Typography</CardTitle>
        <CardDescription>
          Applies to every form across the dashboard and POS — not just this page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="font-family">Font family</Label>
          <Select value={fontFamily} onValueChange={(value) => setFontFamily((value ?? "geist") as FontFamily)}>
            <SelectTrigger id="font-family" disabled={isPending}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((family) => (
                <SelectItem key={family} value={family}>
                  {FONT_FAMILY_LABELS[family]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="font-size">Font size</Label>
          <Select value={fontSize} onValueChange={(value) => setFontSize((value ?? "medium") as FontSize)}>
            <SelectTrigger id="font-size" disabled={isPending}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_SIZES.map((size) => (
                <SelectItem key={size} value={size}>
                  {FONT_SIZE_LABELS[size]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
