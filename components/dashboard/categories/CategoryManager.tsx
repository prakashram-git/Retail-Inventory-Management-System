"use client";

import { useMemo, useState } from "react";
import { Plus, FolderPlus, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryCard } from "./CategoryCard";
import { CategoryDialog } from "./CategoryDialog";
import { DeleteCategoryDialog } from "./DeleteCategoryDialog";
import type { CategoryWithCount } from "@/lib/types/domain";

export function CategoryManager({ categories }: { categories: CategoryWithCount[] }) {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    category: CategoryWithCount | null;
    defaultParentId: string | null;
  }>({ open: false, category: null, defaultParentId: null });
  const [deleteTarget, setDeleteTarget] = useState<CategoryWithCount | null>(null);

  const topLevel = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories]
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, CategoryWithCount[]>();
    for (const category of categories) {
      if (!category.parent_id) continue;
      const list = map.get(category.parent_id) ?? [];
      list.push(category);
      map.set(category.parent_id, list);
    }
    return map;
  }, [categories]);

  function openCreate(defaultParentId: string | null) {
    setDialogState({ open: true, category: null, defaultParentId });
  }

  function openEdit(category: CategoryWithCount) {
    setDialogState({ open: true, category, defaultParentId: null });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => openCreate(null)}>
          <Plus />
          New category
        </Button>
      </div>

      {topLevel.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center text-muted-foreground">
          <FolderTree className="size-8" />
          <p className="text-sm">No categories yet.</p>
          <Button variant="outline" size="sm" onClick={() => openCreate(null)}>
            Create your first category
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {topLevel.map((parent) => {
            const children = childrenByParent.get(parent.id) ?? [];
            return (
              <div key={parent.id} className="flex flex-col gap-3">
                <CategoryCard
                  category={parent}
                  variant="parent"
                  onEdit={() => openEdit(parent)}
                  onDelete={() => setDeleteTarget(parent)}
                />

                <div className="ml-4 grid gap-2 border-l pl-4 sm:grid-cols-2 lg:grid-cols-3">
                  {children.map((child) => (
                    <CategoryCard
                      key={child.id}
                      category={child}
                      variant="child"
                      onEdit={() => openEdit(child)}
                      onDelete={() => setDeleteTarget(child)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => openCreate(parent.id)}
                    className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                  >
                    <FolderPlus className="size-4" />
                    Add subcategory
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CategoryDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((prev) => ({ ...prev, open }))}
        parentOptions={topLevel}
        category={dialogState.category}
        defaultParentId={dialogState.defaultParentId}
      />

      <DeleteCategoryDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        category={deleteTarget}
        childCount={deleteTarget ? (childrenByParent.get(deleteTarget.id)?.length ?? 0) : 0}
        reassignmentOptions={categories.filter(
          (c) => c.id !== deleteTarget?.id && c.parent_id !== deleteTarget?.id
        )}
      />
    </div>
  );
}
