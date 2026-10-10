'use client';

import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Heading } from '@/components/Heading';
import { Modal } from '@/components/Modal';
import { Text } from '@/components/Text';
import { Actions, Cell, Status } from './releases.styles';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  error?: string | null;
  progress?: number | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ open, title, body, confirmLabel, busy, error, progress, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} label={title}>
      <Cell>
        <Heading $level={3}>{title}</Heading>
        <Text $variant="muted">{body}</Text>
        {progress != null ? <Status role="status">Uploading… {Math.round(progress * 100)}%</Status> : null}
        {error ? <Alert $tone="error" role="alert">{error}</Alert> : null}
        <Actions>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="button" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </Actions>
      </Cell>
    </Modal>
  );
}
