"use client";
import { use } from "react";
import { AnalysisReport } from "@/components/analysis-report";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AnalysisReport id={id} />;
}
