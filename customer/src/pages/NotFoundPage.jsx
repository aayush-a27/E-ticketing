import { Link } from 'react-router-dom';
import { Clapperboard } from 'lucide-react';
import { Button } from '../components/common/Button.jsx';

export default function NotFoundPage() {
  return (
    <div className="page-shell flex min-h-[70vh] flex-col items-center justify-center text-center">
      <Clapperboard className="mb-5 size-10 text-ivory-muted/50" aria-hidden="true" />
      <h1 className="font-display text-5xl text-ivory">404</h1>
      <p className="mt-3 max-w-sm text-ivory-muted">
        That page is not showing. It may have moved, or the link may be wrong.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button as={Link} to="/">
          Back to home
        </Button>
        <Button as={Link} to="/movies" variant="secondary">
          Browse movies
        </Button>
      </div>
    </div>
  );
}
