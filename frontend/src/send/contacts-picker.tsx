import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import type { ContactMatch } from '@/api/types';
import { Text } from '@/components/text';
import { Body, Button, Caption, ErrorText, IconBadge, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';

import type { Recipient } from './draft';

type Entry = { number: string; contactName: string; bankName: string };

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; entries: Entry[] };

const BATCH = 500; // the server accepts at most 500 numbers per request
const MAX_NUMBER_LENGTH = 32; // same limit the server enforces per number

/** Read the address book, ask the server which numbers belong to customers. Nothing is stored. */
async function findCustomersInContacts(): Promise<Entry[] | 'denied'> {
  const permission = await requestPermissionsAsync();
  if (permission.status !== 'granted') return 'denied';

  const contacts = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES]);

  const nameByNumber = new Map<string, string>();
  for (const contact of contacts) {
    for (const phone of contact.phones ?? []) {
      const number = phone.number?.trim();
      if (number && number.length <= MAX_NUMBER_LENGTH && !nameByNumber.has(number)) {
        nameByNumber.set(number, contact.fullName?.trim() || number);
      }
    }
  }

  const numbers = [...nameByNumber.keys()];
  const matches: ContactMatch[] = [];
  for (let i = 0; i < numbers.length; i += BATCH) {
    matches.push(...(await api<ContactMatch[]>('/recipients/match', { method: 'POST', body: { phones: numbers.slice(i, i + BATCH) } })));
  }

  return matches
    .map((m) => ({ number: m.input, contactName: nameByNumber.get(m.input) ?? m.input, bankName: m.name }))
    .sort((a, b) => a.contactName.localeCompare(b.contactName));
}

export function ContactsPicker({ onPick }: { onPick: (recipient: Recipient) => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const describe = useErrors();
  const fmt = useFormat();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return q ? state.entries.filter((e) => e.contactName.toLowerCase().includes(q)) : state.entries;
  }, [state, query]);

  async function load() {
    setState({ kind: 'loading' });
    try {
      const result = await findCustomersInContacts();
      setState(result === 'denied' ? { kind: 'denied' } : { kind: 'ready', entries: result });
    } catch (e) {
      setState({ kind: 'error', message: describe(e, 'errors.generic') });
    }
  }

  if (Platform.OS === 'web') return <Body muted>{t('send.contactsWebOnly')}</Body>;

  if (state.kind === 'idle' || state.kind === 'loading') {
    return (
      <View style={{ gap: Spacing.three }}>
        <Body muted>{t('send.contactsIntro')}</Body>
        <Button title={t('send.findContacts')} icon="people-outline" onPress={load} loading={state.kind === 'loading'} />
      </View>
    );
  }

  if (state.kind === 'denied') {
    return (
      <View style={{ gap: Spacing.three }}>
        <Body muted>{t('send.contactsDenied')}</Body>
        <Button title={t('send.openSettings')} variant="secondary" onPress={() => Linking.openSettings()} />
        <Button title={t('common.tryAgain')} onPress={load} />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={{ gap: Spacing.three }}>
        <ErrorText>{state.message}</ErrorText>
        <Button title={t('common.tryAgain')} onPress={load} />
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.two }}>
      {state.entries.length === 0 ? (
        <Body muted>{t('send.noContacts')}</Body>
      ) : (
        <TextField label={t('send.searchContacts')} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
      )}
      {visible.map((e) => (
        <Pressable
          key={e.number}
          accessibilityRole="button"
          accessibilityLabel={t('send.payContact', { name: e.contactName })}
          onPress={() => onPick({ via: 'phone', value: e.number, name: e.bankName, hint: e.contactName })}
          style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
          <IconBadge name="person-outline" tone="teal" size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{fmt.name(e.contactName)}</Text>
            <Caption>
              {fmt.name(e.bankName)} · {fmt.num(e.number)}
            </Caption>
          </View>
        </Pressable>
      ))}
      <Button title={t('send.refreshContacts')} variant="secondary" onPress={load} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
});
