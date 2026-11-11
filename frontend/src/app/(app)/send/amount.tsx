import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import type { Account } from '@/api/types';
import { Text } from '@/components/text';
import { Body, Button, Caption, Card, Chip, ErrorText, FormScreen, SectionTitle, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { minorToInput, parseAmount, sanitizeAmountInput } from '@/lib/money';
import { GiftCard, isGiftDesign } from '@/components/gift-card';
import { useSession } from '@/auth/session';
import { useDraft } from '@/send/draft';

const fetchAccounts = () => api<Account[]>('/accounts');

export default function Amount() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const { draft, update } = useDraft();
  const { data: accounts, error } = useFocusData(fetchAccounts);
  const { user } = useSession();
  // A request for an exact amount fixes it: the field starts filled in and cannot be changed.
  const fixed = draft.fixedAmount;
  const [text, setText] = useState(fixed !== null && draft.recipient?.currency ? minorToInput(fixed, draft.recipient.currency) : '');
  const [note, setNote] = useState(draft.note);
  const [chosenId, setChosenId] = useState<string | null>(null);

  if (!draft.recipient) return <Redirect href="/transfer" />;

  // You cannot pay an account FROM itself. When the destination is one of your own accounts,
  // that account is shown but disabled, and the choice below skips it.
  const destinationId = draft.recipient.accountId ?? null;
  const active = (accounts ?? []).filter((a) => a.status === 'active');
  // Money of different currencies cannot be sent straight to an account: only accounts in the recipient's currency can pay.
  const recipientCurrency = draft.recipient.currency;
  const sameCurrency = (a: Account) => !recipientCurrency || a.currency === recipientCurrency;
  const selectable = active.filter((a) => a.id !== destinationId && sameCurrency(a));
  const from = selectable.find((a) => a.id === chosenId) ?? selectable.find((a) => a.is_default) ?? selectable[0];
  const nothingToSendFrom = accounts !== null && active.length > 0 && selectable.length === 0;
  const currency = from?.currency ?? 'USD';

  const cents = parseAmount(text, currency);
  const tooMuch = cents !== null && from !== undefined && cents > from.balance;
  const ready = cents !== null && from !== undefined && !tooMuch;

  function next() {
    if (!ready || !from || cents === null) return;
    update({ fromAccountId: from.id, amountCents: cents, note: draft.gift ? draft.gift.message : note.trim() });
    router.push('/send/review');
  }

  return (
    <FormScreen>
      <Card>
        <Caption>{t('amount.sendingTo')}</Caption>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>{fmt.name(draft.recipient.name)}</Text>
        <Caption>{fmt.num(draft.recipient.hint)}</Caption>
      </Card>

      {draft.gift && isGiftDesign(draft.gift.design) ? <GiftCard design={draft.gift.design} message={draft.gift.message} from={user ? t('gift.from', { name: fmt.name(user.full_name) }) : undefined} compact /> : null}

      <TextField
        editable={fixed === null}
        label={t('amount.amountLabel')}
        value={text}
        onChangeText={(v) => setText(sanitizeAmountInput(v, currency))}
        grouped
        keyboardType="decimal-pad"
        placeholder={currency === 'IRR' ? '0' : '0.00'}
        autoFocus
        style={{ fontSize: 28, fontWeight: '800' }}
      />
      {tooMuch && from ? <ErrorText>{t('amount.notEnough', { balance: fmt.money(from.balance, from.currency) })}</ErrorText> : null}
      {text !== '' && cents === null ? <ErrorText>{t('amount.invalid')}</ErrorText> : null}

      <SectionTitle>{t('amount.from')}</SectionTitle>
      <ErrorText>{error}</ErrorText>
      {active.length === 0 && !error ? <Body muted>{t('amount.loadingAccounts')}</Body> : null}
      {nothingToSendFrom ? (
        <>
          <ErrorText>{recipientCurrency && !active.every((a) => a.id === destinationId) ? t('amount.noMatchingCurrency', { currency: recipientCurrency }) : t('amount.noOtherAccount')}</ErrorText>
          {destinationId ? <Button title={t('amount.useExchange')} variant="secondary" icon="swap-horizontal" onPress={() => router.push('/convert')} /> : null}
        </>
      ) : null}
      {active.map((a) => {
        const same = a.id === destinationId;
        const otherCurrency = !same && !sameCurrency(a);
        const selected = !same && a.id === from?.id;
        const typeName = t(`accountTypes.${a.type}`);
        return (
          <Pressable
            key={a.id}
            disabled={same || otherCurrency}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: same || otherCurrency }}
            accessibilityLabel={`${t('amount.accountOptionLabel', { type: typeName, balance: fmt.money(a.balance, a.currency) })}${same ?  `. ${t('amount.sameAsDestination')}` : ''}`}
            onPress={() => setChosenId(a.id)}
            style={[
              styles.option,
              {
                borderColor: selected ? theme.primary : theme.border,
                backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                opacity: same || otherCurrency ? 0.45 : 1, // grayed out: this is where the money is going, or its currency cannot pay it
              },
            ]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>
                {t('amount.accountOption', { type: typeName, last4: a.account_number.slice(-4) })} · {a.currency}
              </Text>
              {same ? (
                <View style={{ marginTop: 2 }}>
                  <Chip>{t('amount.sameAsDestination')}</Chip>
                </View>
              ) : otherCurrency ? (
                <View style={{ marginTop: 2 }}>
                  <Chip>{t('amount.differentCurrency')}</Chip>
                </View>
              ) : (
                <Caption>{t('amount.available', { balance: fmt.money(a.balance, a.currency) })}</Caption>
              )}
            </View>
            <Ionicons name={same ? 'ban-outline' : selected ? 'radio-button-on' : 'radio-button-off'} size={24} color={selected ? theme.primaryText : theme.textSecondary} />
          </Pressable>
        );
      })}

      {draft.gift ? null : <TextField label={t('amount.messageLabel')} value={note} onChangeText={setNote} maxLength={140} returnKeyType="done" />}
      <Button title={t('amount.review')} onPress={next} disabled={!ready} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 2, borderRadius: Radius.md, padding: Spacing.three },
});
