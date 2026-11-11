import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GIFT_DESIGNS, GiftArt, GiftCard, type GiftDesign } from '@/components/gift-card';
import { Text, TextInput } from '@/components/text';
import { Body, Button, FormScreen, Segmented, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/auth/session';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { useDraft, type Recipient } from '@/send/draft';
import { LookupForm } from '@/send/lookup-form';

/** Send money with a greeting card: pick a design and a message, then choose who gets it. */
export default function Gift() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const { user } = useSession();
  const { startPayment, generation } = useDraft();
  const [design, setDesign] = useState<GiftDesign>('birthday');
  const [message, setMessage] = useState(t('gift.messages.birthday'));
  const [step, setStep] = useState<'card' | 'who'>('card');
  const [mode, setMode] = useState<'phone' | 'account'>('phone');

  function pick(next: GiftDesign) {
    setDesign(next);
    // A ready-made design brings its own greeting; "custom" starts empty for the user's own words.
    setMessage(next === 'custom' ? '' : t(`gift.messages.${next}`));
  }

  const from = user ? t('gift.from', { name: fmt.name(user.full_name) }) : undefined;

  if (step === 'who') {
    return (
      <FormScreen>
        <GiftCard design={design} message={message} from={from} compact />
        <SectionTitle>{t('gift.toWhom')}</SectionTitle>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'phone', label: t('send.phone') },
            { value: 'account', label: t('send.account') },
          ]}
        />
        <LookupForm
          key={`${mode}-${generation}`}
          mode={mode}
          onChoose={(recipient: Recipient) => {
            startPayment(recipient, { gift: { design, message }, note: message });
            router.push('/send/amount');
          }}
        />
        <Button title={t('common.back')} variant="secondary" onPress={() => setStep('card')} />
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <Body muted>{t('gift.intro')}</Body>
      <SectionTitle>{t('gift.pickDesign')}</SectionTitle>
      <View style={styles.grid}>
        {GIFT_DESIGNS.map((d) => {
          const selected = d === design;
          return (
            <Pressable
              key={d}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`gift.designs.${d}`)}
              onPress={() => pick(d)}
              style={[styles.tile, { backgroundColor: theme.hero, borderColor: selected ? theme.gold : 'transparent' }]}>
              <GiftArt design={d} width={104} />
              <Text style={{ color: theme.onHero, fontSize: 13, fontWeight: '700' }}>{t(`gift.designs.${d}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle>{t('gift.message')}</SectionTitle>
      <TextInput
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={140}
        placeholder={t('gift.customPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={t('gift.message')}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border, fontSize: 16 }]}
      />
      <GiftCard design={design} message={message} from={from} />
      <Button title={t('gift.next')} icon="arrow-forward" onPress={() => setStep('who')} disabled={design === 'custom' && !message.trim()} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: '48.5%', flexGrow: 1, borderRadius: Radius.lg, borderWidth: 3, padding: Spacing.two, alignItems: 'center', gap: 4 },
  input: { minHeight: 90, borderWidth: 1.5, borderRadius: Radius.md, padding: Spacing.three, textAlignVertical: 'top' },
});
