import { PlayEntry } from '@/components/play-entry';

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return <PlayEntry initialCode={(code ?? '').toUpperCase().slice(0, 5)} />;
}
