import { redirect } from 'next/navigation';
import { defaultSampleNoteId } from '@/src/sampleNotes';

export default function HomePage() {
  redirect(`/notes/${defaultSampleNoteId}`);
}
