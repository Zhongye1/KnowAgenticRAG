import { useEffect, useState, useCallback } from 'react';
import { Info, CircleAlert, CircleX, CircleCheck } from 'lucide-react';

const icons = {
  info: <Info className="size-6 text-primary-6" aria-hidden="true" />,
  success: <CircleCheck className="size-6 text-success-6" aria-hidden="true" />,
  warning: <CircleAlert className="size-6 text-warning-6" aria-hidden="true" />,
  error: <CircleX className="size-6 text-danger-6" aria-hidden="true" />,
};

export type NotificationProps = {
  notification: {
    id: string;
    type: keyof typeof icons;
    title: string;
    message?: string;
  };
  onDismiss: (id: string) => void;
};

export const Notification = ({
  notification: { id, type, title, message },
  onDismiss,
}: NotificationProps) => {
  const [isLeaving, setIsLeaving] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsLeaving(true);
    setTimeout(() => onDismiss(id), 300);
  }, [id, onDismiss]);

  useEffect(() => {
    const timer = setTimeout(handleDismiss, 3000);
    return () => clearTimeout(timer);
  }, [handleDismiss]);

  return (
    <>
      <style>{`
        @keyframes notification-slide-in {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes notification-slide-out {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(100%); }
        }
      `}</style>
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        <div
          className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-large bg-color-bg-2 shadow-3-center ring-1 ring-color-black/5"
          style={{
            animation: isLeaving
              ? 'notification-slide-out 0.3s ease-in forwards'
              : 'notification-slide-in 0.3s ease-out forwards',
          }}
        >
          <div className="p-4" role="alert" aria-label={title}>
            <div className="flex items-start">
              <div className="shrink-0">{icons[type]}</div>
              <div className="ml-3 w-0 flex-1 pt-0.5">
                <p className="text-sm font-medium text-color-text-1">{title}</p>
                <p className="mt-1 text-sm text-color-text-3">{message}</p>
              </div>
              <div className="ml-4 flex shrink-0">
                <button
                  className="inline-flex rounded-medium bg-color-bg-2 text-color-text-4 hover:text-color-text-3 focus:outline-none focus:ring-2 focus:ring-primary-6 focus:ring-offset-2"
                  onClick={handleDismiss}
                >
                  <span className="sr-only">Close</span>
                  <CircleX className="size-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
