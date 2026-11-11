import { useRouter } from 'expo-router';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Body, Button, IconBadge } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';

/**
 * Personal details (name, phone, ...) are not editable in the app: a bank must verify identity, so changes happen
 * at a branch or through the government services app. The dialog only explains that and points to the branches.
 */
export function EditProfileDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.center}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('profile.close')} />
        <View accessibilityViewIsModal style={[styles.box, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <IconBadge name="create-outline" size={52} />
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{t('profile.editTitle')}</Text>
          <Body muted>{t('profile.editBody', { service: t('profile.service') })}</Body>
          <View style={{ gap: Spacing.two }}>
            <Button
              title={t('profile.findBranch')}
              icon="location-outline"
              onPress={() => {
                onClose();
                router.push('/branches');
              }}
            />
            <Button title={t('profile.close')} variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  box: { width: '100%', maxWidth: MaxContentWidth / 2, borderRadius: 28, borderWidth: 1, padding: Spacing.four, gap: Spacing.three },
});
