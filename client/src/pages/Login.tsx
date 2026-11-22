import { useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import { Button, Card, Input } from '../components/ui';

export function Login() {
  const { setToken } = useFleet();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/fleet/verify', {
        headers: { Authorization: `Bearer ${password.trim()}` },
      });
      if (!response.ok) {
        setError('That password is not correct.');
        return;
      }
      setToken(password.trim());
      setPassword('');
    } catch {
      setError('Could not reach the dashboard. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-base px-4">
      <Card title="SystemScope" subtitle="Enter the dashboard password to view enrolled computers" className="w-full max-w-sm">
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted">Password</span>
            <Input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Dashboard password"
            />
          </label>
          {error && <p className="text-xs text-bad">{error}</p>}
          <Button variant="primary" type="submit" loading={busy} className="w-full">
            <LockKeyhole size={14} /> Unlock dashboard
          </Button>
          <p className="text-[11px] leading-relaxed text-muted">
            The password is kept in this browser tab only. Agent tokens are separate and are never accepted here.
          </p>
        </form>
      </Card>
    </div>
  );
}
