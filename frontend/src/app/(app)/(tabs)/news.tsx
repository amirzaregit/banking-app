import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChips } from '@/components/filter-chips';
import { Text } from '@/components/text';
import { Body, Caption, IconBadge, Title } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';
import { ARTICLES, CATEGORIES, type NewsCategory } from '@/news/articles';

type Filter = 'all' | NewsCategory;

/** The newsletter: short articles on staying safe, how banking works, money habits and bank news. */
export default function News() {
  const theme = useTheme();
  const router = useRouter();
  const { t, lang, rtl } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const shown = ARTICLES.filter((a) => filter === 'all' || a.category === filter);
  const [first, ...rest] = shown;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t('news.title')}</Title>
        <Body muted>{t('news.intro')}</Body>
        <FilterChips<Filter> value={filter} onChange={setFilter} options={[{ value: 'all', label: t('news.categories.all') }, ...CATEGORIES.map((c) => ({ value: c, label: t(`news.categories.${c}`) }))]} />

        {first ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/news/[id]', params: { id: first.id } })} style={({ pressed }) => [styles.feature, { backgroundColor: theme.hero, opacity: pressed ? 0.92 : 1 }]}>
            <View style={[styles.coin, { backgroundColor: theme.gold }]} />
            <Ionicons name={first.icon as React.ComponentProps<typeof Ionicons>['name']} size={34} color={theme.gold} />
            <Text style={{ color: theme.onHeroMuted, fontSize: 13, fontWeight: '700' }}>{t(`news.categories.${first.category}`)}</Text>
            <Text style={{ color: theme.onHero, fontSize: 22, fontWeight: '800' }}>{first.title[lang]}</Text>
            <Text style={{ color: theme.onHeroMuted, fontSize: 14 }}>{first.summary[lang]}</Text>
            <Text style={{ color: theme.gold, fontSize: 13, fontWeight: '700' }}>{t('news.readTime', { n: first.minutes })}</Text>
          </Pressable>
        ) : null}

        {rest.map((a) => (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/news/[id]', params: { id: a.id } })}
            style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.88 : 1 }]}>
            <IconBadge name={a.icon as React.ComponentProps<typeof Ionicons>['name']} size={46} />
            <View style={{ flex: 1, gap: 3 }}>
              <Caption>
                {t(`news.categories.${a.category}`)} · {t('news.readTime', { n: a.minutes })}
              </Caption>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{a.title[lang]}</Text>
              <Text numberOfLines={2} style={{ color: theme.textSecondary, fontSize: 13 }}>
                {a.summary[lang]}
              </Text>
            </View>
            <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.textSecondary} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
  feature: { borderRadius: 28, padding: Spacing.four, gap: Spacing.two, overflow: 'hidden' },
  coin: { position: 'absolute', end: -40, top: -50, width: 150, height: 150, borderRadius: 75, opacity: 0.18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.three },
});
