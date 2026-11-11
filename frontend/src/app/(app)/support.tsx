import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/components/keyboard';

import { telUrl } from '@/branches/directions';
import { FilterChips } from '@/components/filter-chips';
import { Text, TextInput } from '@/components/text';
import { Button, Caption, Card, Chip, IconBadge, SectionTitle } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { normalizeDigits } from '@/i18n/digits';
import { localBot, SUPPORT_EMAIL, SUPPORT_PHONE, type BotProvider, type BotTopic } from '@/support/bot';

// A message is stored as who said it plus WHAT (a topic or the user's own text), and translated when drawn,
// so changing the language re-translates the whole conversation.
type Message = { id: number; from: 'bot'; topic: BotTopic | 'welcome' } | { id: number; from: 'me'; text: string };

// The one place to plug a real assistant in later: replace `localBot` with a provider that calls your server.
const bot: BotProvider = localBot;

export default function Support() {
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const [messages, setMessages] = useState<Message[]>([{ id: 0, from: 'bot', topic: 'welcome' }]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const nextId = useRef(1);
  const scroller = useRef<ScrollViewInstance>(null);
  const insets = useSafeAreaInsets();
  const keyboardRoom = Math.max(0, useKeyboardHeight() - insets.bottom); // edge to edge: leave room for the keyboard ourselves

  async function ask(text: string) {
    const message = text.trim();
    if (!message || typing) return;
    setDraft('');
    setMessages((m) => [...m, { id: nextId.current++, from: 'me', text: message }]);
    setTyping(true);
    let topic: BotTopic;
    try {
      topic = await bot.reply(message);
    } catch {
      topic = 'fallback'; // a failing provider must never leave the chat stuck on "typing…"
    }
    setTyping(false);
    setMessages((m) => [...m, { id: nextId.current++, from: 'bot', topic }]);
  }

  const quick = [
    { value: 'pin', label: t('support.quick.pin') },
    { value: 'card', label: t('support.quick.card') },
    { value: 'limits', label: t('support.quick.limits') },
    { value: 'branch', label: t('support.quick.branch') },
  ];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
      <View style={{ flex: 1, paddingBottom: keyboardRoom }}>
        <ScrollView ref={scroller} contentContainerStyle={styles.content} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
          <SectionTitle>{t('support.contact')}</SectionTitle>
          <Card>
            <View style={{ gap: Spacing.three }}>
              <View style={styles.row}>
                <IconBadge name="call-outline" tone="teal" size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Caption>{t('support.phone')}</Caption>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{fmt.num(SUPPORT_PHONE)}</Text>
                  <Caption>{t('support.hours')}</Caption>
                </View>
              </View>
              <Button title={t('support.call')} icon="call" onPress={() => Linking.openURL(telUrl(SUPPORT_PHONE)).catch(() => {})} />
              <View style={styles.row}>
                <IconBadge name="mail-outline" tone="teal" size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Caption>{t('support.email')}</Caption>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{fmt.num(SUPPORT_EMAIL)}</Text>
                </View>
              </View>
              <Button title={t('support.writeEmail')} icon="mail" variant="secondary" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})} />
            </View>
          </Card>

          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <SectionTitle>{t('support.chatTitle')}</SectionTitle>
          </View>
          <Chip>{t('support.badge')}</Chip>

          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
          {typing ? <Caption>{t('support.typing')}</Caption> : null}

          <FilterChips options={quick} value={'' as string} onChange={(v) => ask(t(`support.quick.${v}`))} />
        </ScrollView>

        <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <TextInput
            value={draft}
            onChangeText={(text) => setDraft(normalizeDigits(text))}
            onSubmitEditing={() => ask(draft)}
            placeholder={t('support.placeholder')}
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel={t('support.placeholder')}
            returnKeyType="send"
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border, fontSize: 16 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('support.send')}
            disabled={!draft.trim() || typing}
            onPress={() => ask(draft)}
            style={[styles.sendBtn, { backgroundColor: theme.primary, opacity: !draft.trim() || typing ? 0.5 : 1 }]}>
            <Ionicons name="send" size={20} color={theme.onPrimary} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Bubble({ message }: { message: Message }) {
  const theme = useTheme();
  const { t, rtl } = useI18n();
  const mine = message.from === 'me';
  const text = message.from === 'me' ? message.text : message.topic === 'welcome' ? t('support.welcome') : t(`support.answers.${message.topic}`);
  return (
    // alignSelf 'flex-end' is the END of the row: right in English/Russian, left in Persian, as a chat should mirror.
    <View
      style={[
        styles.bubble,
        mine ? { alignSelf: 'flex-end', backgroundColor: theme.primary } : { alignSelf: 'flex-start', backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 },
        // the "tail" corner follows the writing direction
        mine ? (rtl ? { borderBottomLeftRadius: 4 } : { borderBottomRightRadius: 4 }) : rtl ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 },
      ]}>
      <Text style={{ color: mine ? theme.onPrimary : theme.text, fontSize: 15 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  bubble: { maxWidth: '85%', paddingHorizontal: Spacing.three, paddingVertical: 10, borderRadius: Radius.lg },
  composer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
  input: { flex: 1, minHeight: 48, borderRadius: Radius.pill, borderWidth: 1.5, paddingHorizontal: Spacing.three },
  sendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
