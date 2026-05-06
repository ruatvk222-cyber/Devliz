import type { ProfileStatus } from '@shared/types';

const labels: Record<ProfileStatus, string> = {
  idle: 'Idle',
  launching: 'Launching',
  running: 'Running',
  closing: 'Closing',
  error: 'Error',
};

export function StatusBadge({ status }: { status: ProfileStatus }): JSX.Element {
  let cls = 'badge-idle';
  if (status === 'running') cls = 'badge-running';
  else if (status === 'launching' || status === 'closing') cls = 'badge-launching';
  else if (status === 'error') cls = 'badge-error';

  return (
    <span className={cls}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'running'
            ? 'bg-success'
            : status === 'error'
              ? 'bg-danger'
              : status === 'launching' || status === 'closing'
                ? 'bg-warn animate-pulse'
                : 'bg-text-dim'
        }`}
      />
      {labels[status]}
    </span>
  );
}
