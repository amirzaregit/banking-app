import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Body, Button, Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';
import { tokenFromText } from '@/payments/request-link';

/** Scan a payment request's QR code with the camera; a valid one opens the payment screen. */
export default function Scan() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.page}>
        <Card>
          <Body muted>{t('scan.webOnly')}</Body>
        </Card>
      </View>
    );
  }
  if (!permission) return <View style={styles.page} />;
  if (!permission.granted) {
    return (
      <View style={styles.page}>
        <Card>
          <Body muted>{t('scan.needed')}</Body>
        </Card>
        <Button title={t('scan.allow')} icon="camera-outline" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={[styles.frame, { borderColor: theme.primary }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (handled.current || !tokenFromText(data)) return; // ignore other codes and keep looking
            handled.current = true;
            router.replace({ pathname: '/pay-link', params: { code: data } });
          }}
        />
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 15, textAlign: 'center' }}>{t('scan.hint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: Spacing.four, gap: Spacing.three, justifyContent: 'center' },
  frame: { aspectRatio: 1, width: '100%', maxWidth: 420, alignSelf: 'center', borderRadius: Radius.lg, borderWidth: 3, overflow: 'hidden' },
});
