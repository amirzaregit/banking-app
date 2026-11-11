import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import type { Account } from '@/api/types';
import { AmountText } from '@/components/amount-text';
import { Text } from '@/components/text';
import { Chip } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';

const GAP = Spacing.three;
type Slide = { kind: 'account'; account: Account } | { kind: 'add' };

/**
 * Every account as a swipeable card, with dots showing where you are and a last "open an account" card.
 * The strip itself is laid out left-to-right in every language (the first card is the first account), while the text
 * inside each card follows the language's own direction.
 */
export function AccountsCarousel({ accounts, onAdd }: { accounts: Account[]; onAdd: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const { t, rtl } = useI18n();
  const fmt = useFormat();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<Slide>>(null);

  const slides: Slide[] = [...accounts.map((account) => ({ kind: 'account' as const, account })), { kind: 'add' as const }];
  const cardWidth = Math.max(220, width * 0.84); // the next card peeks in, a hint that you can swipe
  const step = cardWidth + GAP;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / step);
    setIndex(Math.max(0, Math.min(slides.length - 1, i)));
  }

  return (
    <View style={{ gap: Spacing.three }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <FlatList
          ref={list}
          data={slides}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => (s.kind === 'account' ? s.account.id : 'add')}
          snapToInterval={step}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          onScroll={onScroll}
          scrollEventThrottle={16}
          // physical left-to-right strip: see the note above
          style={{ direction: 'ltr' }}
          contentContainerStyle={{ gap: GAP }}
          renderItem={({ item }) => (
            <View style={{ width: cardWidth, direction: rtl ? 'rtl' : 'ltr' }}>
              {item.kind === 'account' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t(`accountTypes.${item.account.type}`)} ${item.account.currency}`}
                  onPress={() => router.push({ pathname: '/account/[id]', params: { id: item.account.id } })}
                  style={({ pressed }) => [styles.card, { backgroundColor: theme.hero, opacity: pressed ? 0.92 : 1 }]}>
                  <View style={[styles.coin, { backgroundColor: theme.gold }]} />
                  <View style={styles.top}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text numberOfLines={1} style={{ color: theme.onHero, fontSize: 17, fontWeight: '800' }}>
                        {t(`accountTypes.${item.account.type}`)}
                      </Text>
                      <Text style={{ color: theme.onHeroMuted, fontSize: 14, fontWeight: '600' }}>{fmt.num(`•••• ${item.account.account_number.slice(-4)}`)}</Text>
                    </View>
                    <Chip>{item.account.currency}</Chip>
                  </View>
                  <View style={{ gap: 6 }}>
                    <AmountText text={fmt.money(item.account.balance, item.account.currency)} maxSize={30} minSize={14} color={theme.onHero} />
                    {item.account.is_default ? (
                      <View style={styles.row}>
                        <Ionicons name="call" size={14} color={theme.onHeroMuted} />
                        <Text style={{ color: theme.onHeroMuted, fontSize: 13, fontWeight: '600', flexShrink: 1 }}>{t('home.phonePayments')}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('openAccount.title')}
                  onPress={onAdd}
                  style={({ pressed }) => [styles.card, styles.addCard, { borderColor: theme.primary, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 }]}>
                  <Ionicons name="add-circle-outline" size={40} color={theme.primaryText} />
                  <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>{t('openAccount.title')}</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      ) : null}

      <View style={[styles.dots, { direction: 'ltr' }]} accessibilityLabel={t('home.accountOf', { n: index + 1, total: slides.length })}>
        {slides.map((s, i) => (
          <View key={s.kind === 'account' ? s.account.id : 'add'} style={[styles.dot, i === index ? { width: 22, backgroundColor: theme.primary } : { backgroundColor: theme.border }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, padding: Spacing.four, height: 170, justifyContent: 'space-between', overflow: 'hidden' },
  addCard: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  coin: { position: 'absolute', end: -40, top: -50, width: 150, height: 150, borderRadius: 75, opacity: 0.22 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: Radius.pill },
});
