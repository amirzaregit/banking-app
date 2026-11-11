import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { BlockRequest } from '@/api/types';
import { KeyboardScrollView } from '@/components/keyboard';
import { Body, Button, Caption, ErrorText, OptionRow, ResultHeader, SectionTitle, TextField } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useI18n } from '@/i18n/provider';

// Same lists as the server (backend/app/services/card_services.py). "other" is the free-text one that needs a specialist.
const ACCOUNT_REASONS = ['fraud_suspected', 'unauthorized_access', 'not_using', 'switching_bank', 'other'] as const;
const CARD_REASONS = ['lost', 'stolen', 'swallowed_by_atm', 'damaged', 'fraud_suspected', 'other'] as const;
const MIN_DETAILS = 10;
const LOST_OR_STOLEN = new Set(['lost', 'stolen', 'swallowed_by_atm']);

/**
 * Block an account (`?id=<account>`) or one of its cards (`?id=<account>&card=<card>`).
 * Ready-made reasons block at once; "Another reason" asks for an explanation and goes to a specialist first.
 */
export default function BlockScreen() {
  const { id, card } = useLocalSearchParams<{ id: string; card?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { t } = useI18n();
  const describe = useErrors();
  const isCard = Boolean(card);
  const reasons: readonly string[] = isCard ? CARD_REASONS : ACCOUNT_REASONS;

  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BlockRequest | null>(null);

  const other = reason === 'other';
  const detailsOk = !other || details.trim().length >= MIN_DETAILS;

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const path = isCard ? `/cards/${card}/block` : `/accounts/${id}/block`;
      setResult(await api<BlockRequest>(path, { method: 'POST', body: { reason, details: other ? details.trim() : null } }));
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const waiting = result.status === 'pending_review';
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ResultHeader
            icon={waiting ? 'time-outline' : 'lock-closed'}
            tone={waiting ? 'neutral' : 'success'}
            title={waiting ? t('cardServices.doneReview') : t(isCard ? 'cardServices.doneCard' : 'cardServices.doneAccount')}
            body={waiting ? t(isCard ? 'cardServices.doneReviewCard' : 'cardServices.doneReviewAccount') : undefined}
          />
          {/* A lost or stolen card is replaced, not repaired. */}
          {isCard && !waiting ? <Button title={t('cardServices.replacement')} icon="card-outline" onPress={() => router.replace({ pathname: '/card-order', params: { id } })} /> : null}
          <Button title={t('cardServices.toAccount')} variant={isCard && !waiting ? 'secondary' : 'primary'} onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
      <KeyboardScrollView contentContainerStyle={styles.content}>
        <SectionTitle>{t(isCard ? 'cardServices.blockCardTitle' : 'cardServices.blockAccountTitle')}</SectionTitle>
        <Body muted>{t('cardServices.reasonTitle')}</Body>

        <View style={{ gap: Spacing.two }}>
          {reasons.map((r) => (
            <OptionRow
              key={r}
              title={t(`cardServices.reasons.${isCard ? 'card' : 'account'}.${r}`)}
              selected={r === reason}
              onPress={() => setReason(r)}
              leading={isCard && LOST_OR_STOLEN.has(r) ? <Ionicons name="alert-circle-outline" size={22} color={theme.danger} /> : undefined}
            />
          ))}
        </View>

        {other ? (
          <View style={{ gap: Spacing.one }}>
            <TextField label={t('cardServices.detailsLabel')} value={details} onChangeText={setDetails} multiline maxLength={500} style={{ minHeight: 110, textAlignVertical: 'top' }} />
            <Caption>{t('cardServices.detailsHint', { min: MIN_DETAILS })}</Caption>
          </View>
        ) : null}

        {reason ? <Caption>{other ? t('cardServices.reviewNote') : t('cardServices.nowNote')}</Caption> : null}
        {isCard ? <Caption>{t('cardServices.cardFinal')}</Caption> : null}
        <ErrorText>{error}</ErrorText>
        <Button
          title={other ? t('cardServices.submitReview') : t(isCard ? 'cardServices.confirmBlockCard' : 'cardServices.confirmBlockAccount')}
          icon={other ? 'paper-plane-outline' : 'lock-closed-outline'}
          disabled={!reason || !detailsOk}
          loading={busy}
          onPress={submit}
        />
      </KeyboardScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
});
