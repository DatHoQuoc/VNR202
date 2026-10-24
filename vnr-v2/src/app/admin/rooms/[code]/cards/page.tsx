import { CardLibrary } from '@/components/card-library';

export default async function AdminCardsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CardLibrary code={code.toUpperCase()} />;
}
