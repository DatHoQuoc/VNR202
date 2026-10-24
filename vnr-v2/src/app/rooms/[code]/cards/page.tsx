import { CardLibrary } from '@/components/card-library';

export default async function RoomCardsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CardLibrary code={code.toUpperCase()} />;
}
