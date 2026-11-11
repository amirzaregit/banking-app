import { useState } from 'react';
import { View } from 'react-native';

import { api } from '@/api/client';
import type { RecipientLookup } from '@/api/types';
import { Text } from '@/components/text';
import { Body, Button, Caption, Card, Chip, ErrorText, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';

import type { Recipient } from './draft';

/** Type a phone number or account number, check WHO it is, then continue. */
export function LookupForm({ mode, onChoose }: { mode: 'phone' | 'account'; onChoose: (r: Recipient) => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const describe = useErrors();
  const fmt = useFormat();
  const [text, setText] = useState('');
  const [found, setFound] = useState<RecipientLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isPhone = mode === 'phone';

  function edit(value: string) {
    setText(value);
    setFound(null); // any edit invalidates the previous result
    setError(null);
  }

  async function find() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      setFound(
        await api<RecipientLookup>('/recipients/lookup', {
          method: 'POST',
          body: isPhone ? { phone: text.trim() } : { account_number: text.trim() },
        }),
      );
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <TextField
        label={isPhone ? t('send.phoneLabel') : t('send.accountLabel')}
        value={text}
        onChangeText={edit}
        keyboardType={isPhone ? 'phone-pad' : 'number-pad'}
        autoComplete={isPhone ? 'tel' : 'off'}
        autoCorrect={false}
        placeholder={isPhone ? t('send.phonePlaceholder') : t('send.accountPlaceholder')}
        returnKeyType="search"
        onSubmitEditing={find}
      />
      <ErrorText>{error}</ErrorText>

      {found ? (
        <>
          <Card>
            <Caption>{t('send.recipient')}</Caption>
            <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{fmt.name(found.name)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 17, fontWeight: '600' }}>{fmt.num(found.phone_masked ?? found.account_number ?? '')}</Text>
            {found.is_self ? (
              <View style={{ marginTop: Spacing.two }}>
                <Chip>{t('send.youLabel')}</Chip>
              </View>
            ) : null}
          </Card>
          <Body muted>{t('send.checkPerson')}</Body>
          <Button
            title={t('common.continue')}
            onPress={() =>
              onChoose({
                via: mode,
                value: text.trim(),
                name: found.name,
                hint: found.phone_masked ?? found.account_number ?? '',
                accountId: found.account_id, // present only when the destination is one of YOUR accounts
                currency: found.currency,
              })
            }
          />
        </>
      ) : (
        <Button title={t('send.find')} icon="search" onPress={find} loading={busy} disabled={!text.trim()} />
      )}
    </View>
  );
}
