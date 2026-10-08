"use client";
import { use } from "react";
import { AnalysisReport } from "@/components/analysis-report";
export default function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return (
    <div className="public-report">
      <div className="public-brand">
        pitchgrill<span> / shared idea analysis</span>
      </div>
      <AnalysisReport token={token} />
      <p>
        Read-only report shared by its owner. Estimates and practice judgments,
        not investment or legal advice.
      </p>
    </div>
  );
}
