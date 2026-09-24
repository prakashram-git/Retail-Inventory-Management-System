"use client";

import { useState } from "react";
import { ReportDirectory } from "./ReportDirectory";
import { CustomReportBuilder } from "./CustomReportBuilder";

export function ReportLibraryClient({
  isSuperAdmin,
  storeName,
  timezone,
}: {
  isSuperAdmin: boolean;
  storeName: string;
  timezone: string;
}) {
  const [reportId, setReportId] = useState<string | null>(null);

  if (reportId) {
    return (
      <CustomReportBuilder
        reportId={reportId}
        onBack={() => setReportId(null)}
        isSuperAdmin={isSuperAdmin}
        storeName={storeName}
        timezone={timezone}
      />
    );
  }

  return <ReportDirectory onSelectReport={setReportId} />;
}
