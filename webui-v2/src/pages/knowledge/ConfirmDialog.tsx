import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** 危险操作二次确认(默认红色确认按钮) */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "删除",
  loading,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "处理中…" : confirmText}
          </Button>
        </>
      }
    >
      <p className="text-text-2">{description}</p>
    </Dialog>
  );
}
