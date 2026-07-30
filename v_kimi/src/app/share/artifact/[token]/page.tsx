import { notFound } from "next/navigation";
import type { Artifact } from "@/lib/types";
import { SharedArtifactView } from "./view";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";

export default async function SharedArtifactPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/i.test(token)) notFound();

  const res = await fetch(`${BACKEND_URL}/api/artifacts/shared/${token}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) notFound();

  const artifact = (await res.json()) as Artifact;
  return <SharedArtifactView artifact={artifact} />;
}
