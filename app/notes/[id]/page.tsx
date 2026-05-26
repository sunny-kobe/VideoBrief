import ResultPageClient from '@/src/components/ResultPageClient';
import { getMockResearchNote } from '@/src/mockData';

interface NotePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function NotePage({ params }: NotePageProps) {
  const { id } = await params;
  const note = getMockResearchNote(id);

  return <ResultPageClient note={note} noteId={id} />;
}
