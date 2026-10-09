import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-ink-100">
          <Compass className="size-5 text-ink-500" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-ink-900">That page does not exist</h1>
        <p className="mt-2 text-sm text-ink-600">
          The link may be out of date, or the section may not be built yet.
        </p>
        <Button as={Link} to="/" className="mt-6">
          Back to the dashboard
        </Button>
      </div>
    </div>
  );
}
