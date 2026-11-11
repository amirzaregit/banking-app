import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Body, Button, Caption, Card, ErrorText, IconBadge } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { BRANCHES, type Branch, type BranchId } from '@/branches/data';
import { directionsUrl, geoUrl, telUrl, type NavigatorId } from '@/branches/directions';
import { BranchMap } from '@/branches/map-view';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';

const MAP_HEIGHT = 360;

export default function Branches() {
  const { t } = useI18n();
  const fmt = useFormat();
  const [selected, setSelected] = useState<BranchId | null>(null);
  const [focus, setFocus] = useState<BranchId | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [sheetFor, setSheetFor] = useState<Branch | null>(null);

  const pick = (id: BranchId) => {
    setSelected(id);
    setFocus(id);
  };
  const showAll = () => {
    setSelected(null);
    setFocus(null);
    setFitSignal((n) => n + 1);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={BRANCHES}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three, marginBottom: Spacing.three }}>
            <BranchMap height={MAP_HEIGHT} selected={selected} onSelect={pick} fitSignal={fitSignal} focus={focus} />
            <Button title={t('branches.showAll')} variant="secondary" icon="map-outline" onPress={showAll} />
            <Caption>{t('branches.demoNote')}</Caption>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ marginBottom: Spacing.three }}>
            <BranchCard branch={item} active={item.id === selected} onPress={() => pick(item.id)} onDirections={() => setSheetFor(item)} fmtNum={fmt.num} />
          </View>
        )}
      />
      <DirectionsSheet branch={sheetFor} onClose={() => setSheetFor(null)} />
    </SafeAreaView>
  );
}

function BranchCard({ branch, active, onPress, onDirections, fmtNum }: { branch: Branch; active: boolean; onPress: () => void; onDirections: () => void; fmtNum: (s: string) => string }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    // The card is a plain View: the tappable info row and the action buttons are siblings, because a button must not contain a button.
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: active ? theme.primary : theme.border, borderWidth: active ? 2 : 1 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t(`branches.items.${branch.id}.name`)} onPress={onPress} style={styles.row}>
        <IconBadge name="business-outline" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{t(`branches.items.${branch.id}.name`)}</Text>
          <Caption>{t(`branches.items.${branch.id}.address`)}</Caption>
          <Caption>{branch.hours === 'daily' ? t('branches.hoursDaily') : t('branches.hoursWeekdays')}</Caption>
          <Caption>{fmtNum(branch.phone)}</Caption>
        </View>
      </Pressable>
      {active ? (
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button title={t('branches.directions')} icon="navigate-outline" onPress={onDirections} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={t('branches.call')} icon="call-outline" variant="secondary" onPress={() => Linking.openURL(telUrl(branch.phone)).catch(() => {})} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Lets the user pick which navigator opens the route. Android also gets the system chooser (every installed navigator). */
function DirectionsSheet({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
      setFailed(false);
      onClose();
    } catch {
      setFailed(true); // e.g. no app can handle the link
    }
  };

  const name = branch ? t(`branches.items.${branch.id}.name`) : '';
  const dest = branch ? { lat: branch.lat, lon: branch.lon, label: name } : null;
  const options: { id: NavigatorId; label: string }[] = [
    { id: 'yandex', label: t('branches.yandex') },
    { id: 'twoGis', label: t('branches.twoGis') },
    { id: 'google', label: t('branches.google') },
    ...(Platform.OS === 'android' ? [] : [{ id: 'apple' as const, label: t('branches.apple') }]),
    { id: 'osm', label: t('branches.osm') },
  ];

  return (
    <Modal visible={!!branch} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('profile.close')} />
      <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{t('branches.chooseTitle')}</Text>
        <Body muted>{t('branches.chooseSub', { name })}</Body>
        {dest ? (
          <View style={{ gap: Spacing.two }}>
            {Platform.OS === 'android' ? <SheetRow icon="apps-outline" label={t('branches.otherApp')} onPress={() => open(geoUrl(dest))} /> : null}
            {options.map((o) => (
              <SheetRow key={o.id} icon="navigate-circle-outline" label={o.label} onPress={() => open(directionsUrl(o.id, dest))} />
            ))}
          </View>
        ) : null}
        {failed ? <ErrorText>{t('errors.generic')}</ErrorText> : null}
        <Button title={t('profile.close')} variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

function SheetRow({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <Ionicons name={icon} size={24} color={theme.primaryText} />
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600', flex: 1 }}>{label}</Text>
        <Ionicons name="open-outline" size={18} color={theme.textSecondary} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { padding: Spacing.four, gap: Spacing.three, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
});
