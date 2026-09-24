"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignStoreProfileAction,
  updateProfileDefinitionAction,
  type StoreAssignmentRow,
} from "@/lib/actions/profileActions";
import { FEATURE_KEYS, FEATURE_LABELS, type StoreProfileDefinition } from "@/lib/profiles/types";

/**
 * Local, optimistic-ish editable state, one per tab: the Matrix tab edits a profile's
 * definition (affects every store on it); the Assignment tab edits one store's pick of
 * profile. Both call the same super-admin-gated server actions and revalidate /dashboard
 * and /pos, so a change is visible on the next load of either.
 */
export function ProfileManagerStudio({
  initialProfiles,
  initialStores,
}: {
  initialProfiles: StoreProfileDefinition[];
  initialStores: StoreAssignmentRow[];
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [stores, setStores] = useState(initialStores);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleFeature(profileId: string, key: string, checked: boolean) {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    const nextFeatures = { ...profile.features, [key]: checked };
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, features: nextFeatures } : p)));

    const savingId = `${profileId}:${key}`;
    setSavingKey(savingId);
    startTransition(async () => {
      const result = await updateProfileDefinitionAction(profileId, nextFeatures);
      setSavingKey((k) => (k === savingId ? null : k));
      if (!result.success) {
        toast.error(result.error ?? "Could not update the profile");
        setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, features: profile.features } : p)));
      }
    });
  }

  function assignProfile(storeId: string, profileId: string) {
    const previous = stores.find((s) => s.id === storeId)?.active_profile_id ?? profileId;
    setStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, active_profile_id: profileId } : s)));
    setSavingKey(storeId);
    startTransition(async () => {
      const result = await assignStoreProfileAction(storeId, profileId);
      setSavingKey((k) => (k === storeId ? null : k));
      if (!result.success) {
        toast.error(result.error ?? "Could not assign the profile");
        setStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, active_profile_id: previous } : s)));
      } else {
        toast.success("Profile assigned — the store will pick it up on next load");
      }
    });
  }

  return (
    <Tabs defaultValue="matrix">
      <TabsList>
        <TabsTrigger value="matrix">Profile Matrix</TabsTrigger>
        <TabsTrigger value="assignment">Store Assignment</TabsTrigger>
      </TabsList>

      <TabsContent value="matrix" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Profile Matrix</CardTitle>
            <CardDescription>
              Toggle a feature for a whole profile — every store assigned to it picks up the change
              immediately (subject to a per-store override on the Store Assignment tab).
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3 font-medium">Feature</th>
                  {profiles.map((p) => (
                    <th key={p.id} className="px-3 py-2 text-center font-medium">
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{p.name}</span>
                        {p.is_default && (
                          <Badge variant="secondary" className="text-[10px]">
                            Default
                          </Badge>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_KEYS.map((key) => (
                  <tr key={key} className="border-b last:border-0">
                    <td className="py-2 pr-3 text-muted-foreground">{FEATURE_LABELS[key]}</td>
                    {profiles.map((p) => {
                      const id = `${p.id}:${key}`;
                      return (
                        <td key={p.id} className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Checkbox
                              checked={!!p.features[key]}
                              onCheckedChange={(v) => toggleFeature(p.id, key, v === true)}
                              aria-label={`${FEATURE_LABELS[key]} for ${p.name}`}
                              data-testid={`feature-${p.id}-${key}`}
                            />
                            {savingKey === id && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="assignment" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Store Assignment</CardTitle>
            <CardDescription>Pick which profile each store runs. Switching takes effect immediately.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {stores.map((store) => (
              <div key={store.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{store.name}</span>
                  {Object.keys(store.custom_feature_overrides ?? {}).length > 0 && (
                    <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                      Custom overrides
                    </Badge>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {savingKey === store.id && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                  <Select value={store.active_profile_id ?? undefined} onValueChange={(v) => v && assignProfile(store.id, v)}>
                    <SelectTrigger size="sm" className="w-56" data-testid={`store-profile-select-${store.id}`}>
                      <SelectValue placeholder="Choose a profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
