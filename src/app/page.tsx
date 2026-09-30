import type { Metadata } from 'next';
import JellyMovers from '@/components/JellyMovers';

export const metadata: Metadata = {
  title: 'Jelly Movers — squishy co-op moving mayhem',
  description:
    'A local co-op soft-body physics game. Squishy jelly blobs run a moving company: carry the furniture out of the house and into the truck before the timer runs out.',
  keywords: ['game', 'physics', 'co-op', 'soft body', 'jelly', 'local multiplayer'],
};

export default function Page() {
  return <JellyMovers />;
}
