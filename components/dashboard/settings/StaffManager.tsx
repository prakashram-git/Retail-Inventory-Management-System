"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InviteStaffDialog } from "./InviteStaffDialog";
import { StaffAssignmentDialog } from "./StaffAssignmentDialog";
import type { StaffMember, UserRole } from "@/lib/types/domain";

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: "Super admin",
  store_manager: "Store manager",
  cashier: "Cashier",
};

const ROLE_VARIANT: Record<UserRole, "default" | "secondary" | "outline"> = {
  super_admin: "default",
  store_manager: "secondary",
  cashier: "outline",
};

interface StaffManagerProps {
  staff: StaffMember[];
  stores: { id: string; name: string }[];
}

export function StaffManager({ staff, stores }: StaffManagerProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedStaff = staff.find((member) => member.id === selectedId) ?? null;
  const storeNameById = new Map(stores.map((store) => [store.id, store.name]));

  return (
    <>
      <Card size="sm">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Staff</CardTitle>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus />
            Invite staff
          </Button>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No staff accounts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((member) => (
                  <TableRow
                    key={member.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(member.id)}
                  >
                    <TableCell className="font-medium">{member.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    <TableCell>
                      {member.store_id ? (
                        <Badge variant="outline">
                          {storeNameById.get(member.store_id) ?? "Unknown store"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Mall-wide</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_VARIANT[member.role]}>{ROLE_LABEL[member.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.is_active ? "secondary" : "outline"}>
                        {member.is_active ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InviteStaffDialog open={inviteOpen} onOpenChange={setInviteOpen} stores={stores} />
      <StaffAssignmentDialog
        open={!!selectedStaff}
        onOpenChange={(open) => !open && setSelectedId(null)}
        staffMember={selectedStaff}
        stores={stores}
      />
    </>
  );
}
