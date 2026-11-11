import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components/text';
import { Body, Button, Caption, FormScreen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';
import { articleById } from '@/news/articles';

/** One newsletter article. */
export default function Article() {
  const theme = useTheme();
  const router = useRouter();
  const { t, lang } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const article = articleById(id);

  if (!article) {
    return (
      <FormScreen>
        <Body muted>{t('errors.loadData')}</Body>
        <Button title={t('news.back')} variant="secondary" onPress={() => router.back()} />
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <View style={{ backgroundColor: theme.hero, borderRadius: 28, padding: Spacing.four, gap: Spacing.two }}>
        <Ionicons name={article.icon as React.ComponentProps<typeof Ionicons>['name']} size={36} color={theme.gold} />
        <Text style={{ color: theme.onHeroMuted, fontSize: 13, fontWeight: '700' }}>{t(`news.categories.${article.category}`)}</Text>
        <Text style={{ color: theme.onHero, fontSize: 24, fontWeight: '800' }}>{article.title[lang]}</Text>
        <Text style={{ color: theme.gold, fontSize: 13, fontWeight: '700' }}>{t('news.readTime', { n: article.minutes })}</Text>
      </View>
      <Caption>{article.summary[lang]}</Caption>
      {article.body[lang].map((paragraph, i) => (
        <Text key={i} style={{ color: theme.text, fontSize: 16, lineHeight: lang === 'fa' ? 30 : 24 }}>
          {paragraph}
        </Text>
      ))}
      <Button title={t('news.back')} variant="secondary" onPress={() => router.back()} />
    </FormScreen>
  );
}
