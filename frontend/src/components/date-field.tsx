import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';
import { calendarFor, formatDay, monthCells, monthOf, monthTitle, shiftMonth, todayIso, weekdayHeadings, weekStartFor, type YearMonth } from '@/lib/calendar';

import { sheetStyles } from './select';
import { Text } from './text';
import { Button } from './ui';

/** A field showing a date (or "any date") that opens a calendar. A small clear button resets it. */
export function DateField({ label, value, onChange, min, max, invalid }: { label: string; value?: string; onChange: (iso: string | undefined) => void; min?: string; max?: string; invalid?: boolean }) {
  const theme = useTheme();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <View style={[styles.field, { backgroundColor: theme.backgroundElement, borderColor: invalid ? theme.danger : open ? theme.primary : theme.border, borderWidth: invalid ? 2 : 1 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? formatDay(value, lang) : t('pickers.anyDate')}`} onPress={() => setOpen(true)} style={styles.fieldMain}>
          <Ionicons name="calendar-outline" size={20} color={theme.primaryText} />
          <Text numberOfLines={1} style={{ flex: 1, color: value ? theme.text : theme.textSecondary, fontSize: 15, fontWeight: '600' }}>
            {value ? formatDay(value, lang) : t('pickers.anyDate')}
          </Text>
        </Pressable>
        {value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('pickers.clear')} hitSlop={8} onPress={() => onChange(undefined)}>
            <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {/* Mounted only while open, so the calendar always starts on the selected month. */}
      {open ? (
        <CalendarSheet
          title={label}
          selected={value}
          min={min}
          max={max}
          onPick={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

function CalendarSheet({ title, selected, min, max, onPick, onClose }: { title: string; selected?: string; min?: string; max?: string; onPick: (iso: string) => void; onClose: () => void }) {
  const theme = useTheme();
  const { t, lang, rtl } = useI18n();
  const kind = calendarFor(lang);
  const today = todayIso();
  const [ym, setYm] = useState<YearMonth>(() => monthOf(kind, selected ?? min ?? max ?? today));
  const cells = monthCells(kind, ym, weekStartFor(lang));
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  // "previous" points toward the start of the line: left in English/Russian, right in Persian.
  const prev = rtl ? 'chevron-forward' : 'chevron-back';
  const next = rtl ? 'chevron-back' : 'chevron-forward';
  const prevYear = rtl ? 'play-skip-forward' : 'play-skip-back';
  const nextYear = rtl ? 'play-skip-back' : 'play-skip-forward';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel={t('pickers.close')} />
      <View style={[sheetStyles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{title}</Text>
        <View style={styles.header}>
          <NavButton icon={prevYear} label={t('pickers.prevYear')} onPress={() => setYm((v) => shiftMonth(v, -12))} />
          <NavButton icon={prev} label={t('pickers.prevMonth')} onPress={() => setYm((v) => shiftMonth(v, -1))} />
          <Text style={{ flex: 1, textAlign: 'center', color: theme.text, fontSize: 17, fontWeight: '800' }}>{monthTitle(lang, ym)}</Text>
          <NavButton icon={next} label={t('pickers.nextMonth')} onPress={() => setYm((v) => shiftMonth(v, 1))} />
          <NavButton icon={nextYear} label={t('pickers.nextYear')} onPress={() => setYm((v) => shiftMonth(v, 12))} />
        </View>
        <View style={styles.week}>
          {weekdayHeadings(lang).map((w, i) => (
            <View key={i} style={styles.cell}>
              <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700' }}>{w}</Text>
            </View>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((cell, ci) => {
              if (!cell) return <View key={ci} style={styles.cell} />;
              const isSelected = cell.iso === selected;
              const disabled = (!!max && cell.iso > max) || (!!min && cell.iso < min);
              return (
                <View key={ci} style={styles.cell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${cell.day}`}
                    accessibilityState={{ selected: isSelected, disabled }}
                    disabled={disabled}
                    onPress={() => onPick(cell.iso)}
                    style={[styles.day, isSelected && { backgroundColor: theme.primary }, !isSelected && cell.iso === today && { borderColor: theme.primary, borderWidth: 1.5 }, disabled && { opacity: 0.3 }]}>
                    <Text style={{ color: isSelected ? theme.onPrimary : theme.text, fontSize: 15, fontWeight: isSelected ? '800' : '600' }}>{cell.day}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Button title={t('pickers.today')} variant="secondary" disabled={(!!max && today > max) || (!!min && today < min)} onPress={() => onPick(today)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={t('pickers.close')} variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NavButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={[styles.nav, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Ionicons name={icon} size={18} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, borderRadius: Radius.md, borderWidth: 1.5, paddingHorizontal: Spacing.three },
  fieldMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nav: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
