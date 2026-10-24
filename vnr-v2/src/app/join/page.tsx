import { Landing } from '@/components/landing';

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return <Landing initialCode={(code ?? '').toUpperCase().slice(0, 5)} />;
}
