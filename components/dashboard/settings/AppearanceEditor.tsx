"use client";

import { useRef, useState, useTransition, type DragEvent } from "react";
import { toast } from "sonner";
import { UploadCloud, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/utils/image-compress";
import { updateAppearance, type AppearanceInput } from "@/lib/actions/appearance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface AppearanceEditorProps {
  scope: "global" | "store";
  uploadStoreId: string;
  initial: AppearanceInput;
}

export function AppearanceEditor({ scope, uploadStoreId, initial }: AppearanceEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backgroundUrl, setBackgroundUrl] = useState(initial.home_background_url);
  const [blur, setBlur] = useState(initial.blur_strength);
  const [opacity, setOpacity] = useState(initial.overlay_opacity);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      toast.error("Please choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be smaller than 5MB.");
      return;
    }

    setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      const supabase = createClient();
      const path = `backgrounds/${uploadStoreId}/${crypto.randomUUID()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("mall-assets")
        .upload(path, compressed, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("mall-assets").getPublicUrl(path);
      setBackgroundUrl(data.publicUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  function submit() {
    startTransition(async () => {
      try {
        await updateAppearance(scope, {
          home_background_url: backgroundUrl,
          blur_strength: blur,
          overlay_opacity: opacity,
        });
        toast.success("Appearance updated");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  const busy = isPending || isUploading;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{scope === "global" ? "Mall homepage wallpaper" : "Store login wallpaper"}</CardTitle>
        <CardDescription>
          {scope === "global"
            ? "Shown on the login screen when a store hasn't set its own wallpaper."
            : "Shown on the login screen when this store is the active store."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex h-56 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-center transition-colors ${
            isDraggingOver ? "border-primary bg-primary/5" : "border-input"
          }`}
        >
          {backgroundUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={backgroundUrl} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <div
            className="absolute inset-0"
            style={{
              backdropFilter: backgroundUrl ? `blur(${blur}px)` : undefined,
              backgroundColor: backgroundUrl ? `rgba(0, 0, 0, ${opacity})` : undefined,
            }}
          />
          <div className="relative z-10 flex flex-col items-center gap-1.5 text-white">
            {isUploading ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <UploadCloud className="size-6" />
            )}
            <p className="text-sm font-medium">Drag and drop an image, or click to browse</p>
            <p className="text-xs text-white/70">This preview reflects the blur and opacity below.</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Blur strength</Label>
            <span className="font-mono text-xs text-muted-foreground">{blur}px</span>
          </div>
          <Slider
            value={blur}
            min={0}
            max={25}
            step={1}
            onValueChange={(value) => setBlur(Number(value))}
            disabled={busy}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Overlay opacity</Label>
            <span className="font-mono text-xs text-muted-foreground">{Math.round(opacity * 100)}%</span>
          </div>
          <Slider
            value={opacity}
            min={0.1}
            max={0.9}
            step={0.05}
            onValueChange={(value) => setOpacity(Number(value))}
            disabled={busy}
          />
        </div>

        <Button onClick={submit} disabled={busy || !backgroundUrl} className="w-full sm:w-fit">
          {isPending ? "Saving..." : "Save appearance"}
        </Button>
      </CardContent>
    </Card>
  );
}
