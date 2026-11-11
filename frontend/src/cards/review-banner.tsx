import { useState } from 'react';
import { View } from 'react-native';

import { api } from '@/api/client';
import type { BlockRequest } from '@/api/types';
import { Body, Button, Card, Chip, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useErrors } from '@/i18n/errors';
import { useI18n } from '@/i18n/provider';

/** "Waiting for a specialist": a block request that was sent for review. In this demo, buttons play the specialist. */
export function ReviewBanner({ request, onDecided }: { request: BlockRequest; onDecided: () => void }) {
  const { t } = useI18n();
  const describe = useErrors();
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(approve ? 'yes' : 'no');
    setError(null);
    try {
      await api<BlockRequest>(`/block-requests/${request.id}/demo-review`, { method: 'POST', body: { approve } });
      onDecided();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <View style={{ gap: Spacing.two }}>
        <Chip>{t('cardServices.review')}</Chip>
        <Body>{t('cardServices.reviewSub', { target: t(request.target === 'card' ? 'cardServices.targetCard' : 'cardServices.targetAccount') })}</Body>
        <ErrorText>{error}</ErrorText>
        <Button title={t('cardServices.demoApprove')} variant="secondary" onPress={() => decide(true)} loading={busy === 'yes'} disabled={busy !== null} />
        <Button title={t('cardServices.demoReject')} variant="secondary" onPress={() => decide(false)} loading={busy === 'no'} disabled={busy !== null} />
      </View>
    </Card>
  );
}
