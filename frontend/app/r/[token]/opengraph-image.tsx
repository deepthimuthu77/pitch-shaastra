import { ImageResponse } from "next/og";
export const runtime = "nodejs";
export const alt = "PitchGrill shared idea analysis";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let title = "An idea worth challenging.";
  try {
    const result = await fetch(
      `${process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/public/analysis/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (result.ok) title = (await result.json()).title;
  } catch {}
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b0e13",
          display: "flex",
          flexDirection: "column",
          padding: 80,
          fontFamily: "sans-serif",
          color: "#edf0f4",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#b9f9d0" }}>
          pitchgrill. / idea analysis
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            lineHeight: 1.1,
            marginTop: 100,
            maxWidth: 980,
          }}
        >
          {title.slice(0, 100)}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 23,
            color: "#a0a8b5",
            marginTop: 50,
          }}
        >
          Transparent assumptions. Visible uncertainty. A sharper next step.
        </div>
      </div>
    ),
    size,
  );
}
