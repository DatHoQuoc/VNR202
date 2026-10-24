import { redirect } from 'next/navigation';

/** Old player link: keep it working by forwarding to the player entrance. */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  redirect(`/play${code ? `?code=${encodeURIComponent(code.toUpperCase().slice(0, 5))}` : ''}`);
}
