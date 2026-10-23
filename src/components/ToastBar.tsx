import type { Toast } from '../hooks/useToast';

interface ToastBarProps {
  toast: Toast | null;
}

export default function ToastBar({ toast }: ToastBarProps) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role="status" aria-live="polite" data-testid="toast">
      {toast.text}
    </div>
  );
}
