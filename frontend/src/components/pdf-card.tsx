import { View } from 'react-native';

import { isWeb } from '@/certificates/pdf';
import type { PdfDocument } from '@/hooks/use-pdf-document';
import { useTheme } from '@/hooks/use-theme';
import { LANG_CODES, type Lang } from '@/i18n';
import { useI18n } from '@/i18n/provider';
import { Spacing } from '@/constants/theme';

import { Text } from './text';
import { Button, Caption, Card, ErrorText, Heading, Segmented } from './ui';

/**
 * The buttons for one document as a file: open, save to the phone, share, print. It only draws what `usePdfDocument` tracks, so
 * every screen that offers a file looks and behaves the same. Pass `language` to let the customer choose the document's language.
 */
export function PdfCard({ pdf, title, subtitle, language }: { pdf: PdfDocument; title: string; subtitle?: string; language?: { value: Lang; onChange: (lang: Lang) => void } }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Card>
      <View style={{ gap: Spacing.three }}>
        <View style={{ gap: 2 }}>
          <Heading>{title}</Heading>
          {subtitle ? <Caption>{subtitle}</Caption> : null}
        </View>
        {language ? (
          <>
            <Caption>{t('files.language')}</Caption>
            <Segmented<Lang> value={language.value} onChange={language.onChange} options={LANG_CODES.map((l) => ({ value: l, label: t(`languages.${l}`) }))} />
          </>
        ) : null}
        <Button title={t('files.view')} icon="eye-outline" onPress={pdf.view} loading={pdf.busy === 'view'} disabled={!pdf.ready} />
        <Button title={isWeb ? t('files.openPdf') : t('files.save')} icon={isWeb ? 'print-outline' : 'download-outline'} variant="secondary" onPress={pdf.save} loading={pdf.busy === 'save'} disabled={!pdf.ready} />
        {!isWeb ? <Button title={t('files.share')} icon="share-outline" variant="secondary" onPress={pdf.share} loading={pdf.busy === 'share'} disabled={!pdf.ready} /> : null}
        {!isWeb ? <Button title={t('files.print')} icon="print-outline" variant="secondary" onPress={pdf.print} loading={pdf.busy === 'print'} disabled={!pdf.ready} /> : null}
        <ErrorText>{pdf.error}</ErrorText>
        {pdf.detail ? <Caption>{pdf.detail}</Caption> : null}
        {pdf.notice ? <Text style={{ color: theme.success, fontWeight: '700', fontSize: 15 }}>{pdf.notice}</Text> : null}
      </View>
    </Card>
  );
}
