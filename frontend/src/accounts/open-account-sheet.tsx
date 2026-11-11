import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { api } from '@/api/client';
import type { Account } from '@/api/types';
import { FilterChips } from '@/components/filter-chips';
import { sheetStyles } from '@/components/select';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useI18n } from '@/i18n/provider';
import { ACCOUNT_CURRENCIES, type AccountCurrency } from '@/lib/money';

type AccountType = 'checking' | 'savings';

/** Open a new account: choose its type and its currency (ruble, rial or dollar). */
export function OpenAccountSheet({ visible, onClose, onOpened }: { visible: boolean; onClose: () => void; onOpened: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const describe = useErrors();
  const [type, setType] = useState<AccountType>('checking');
  const [currency, setCurrency] = useState<AccountCurrency>('RUB');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api<Account>('/accounts', { method: 'POST', body: { type, currency } });
      onOpened();
      onClose();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel={t('pickers.close')} />
      <View style={[sheetStyles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{t('openAccount.title')}</Text>

        <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{t('openAccount.type')}</Text>
        <FilterChips<AccountType>
          value={type}
          onChange={setType}
          options={[
            { value: 'checking', label: t('accountTypes.checking') },
            { value: 'savings', label: t('accountTypes.savings') },
          ]}
        />

        <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{t('openAccount.currency')}</Text>
        <FilterChips<AccountCurrency> value={currency} onChange={setCurrency} options={ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: `${c} · ${t(`rates.currencies.${c}`)}` }))} />

        <ErrorText>{error}</ErrorText>
        <View style={{ gap: Spacing.two }}>
          <Button title={t('openAccount.create')} icon="add-circle-outline" onPress={create} loading={busy} />
          <Button title={t('pickers.close')} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
