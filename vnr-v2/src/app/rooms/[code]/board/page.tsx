import { RoomView } from '@/components/room-view';

export default async function BoardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomView code={code.toUpperCase()} mode="projector" />;
}
