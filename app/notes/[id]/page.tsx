import ResultPageClient from '@/src/components/ResultPageClient';
import { getSampleQaPairs, getSampleResearchNote } from '@/src/sampleNotes';

interface NotePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function NotePage({ params }: NotePageProps) {
  const { id } = await params;
  const note = getSampleResearchNote(id);
  const qaPairs = getSampleQaPairs(note.id);

  return <ResultPageClient note={note} noteId={note.id} qaPairs={qaPairs} />;
}
