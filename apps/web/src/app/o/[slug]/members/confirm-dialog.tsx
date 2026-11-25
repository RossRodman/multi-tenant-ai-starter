"use client";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  action,
  fields,
  title,
  description,
  confirmLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  title: string;
  description: string;
  confirmLabel: string;
}) {
  async function submit(formData: FormData) {
    try {
      await action(formData);
    } finally {
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle className="text-lg font-semibold">{title}</AlertDialogTitle>
        <AlertDialogDescription className="text-muted-foreground">
          {description}
        </AlertDialogDescription>
        <form action={submit} className="flex justify-end gap-2">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline" className="w-auto px-4">
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button type="submit" className="w-auto px-4">
            {confirmLabel}
          </Button>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
