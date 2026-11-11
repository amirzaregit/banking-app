import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { useState, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LANG_CODES, type Lang } from '@/i18n';
import { normalizeDigits, toPersianDigits } from '@/i18n/digits';
import { groupDigits, ungroupInput } from '@/lib/money';
import { useI18n } from '@/i18n/provider';

import { Flag } from './flags';
import { KeyboardScrollView, useRevealFocusedField } from './keyboard';
import { Glass } from './glass';
import { Text, TextInput } from './text';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---- page containers ------------------------------------------------------------------

/** Full-screen container for forms: safe area, keyboard avoidance, scrolling, centered max width. */
export function FormScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardScrollView contentContainerStyle={styles.formContent}>
        <View style={styles.inner}>{children}</View>
      </KeyboardScrollView>
    </SafeAreaView>
  );
}

/** Centered scrolling page for read-only screens (no form fields). */
export function Page({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
      <KeyboardScrollView contentContainerStyle={styles.pageContent}>
        <View style={styles.inner}>{children}</View>
      </KeyboardScrollView>
    </SafeAreaView>
  );
}

// ---- typography -----------------------------------------------------------------------

export function Title({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.title, { color: theme.text }]}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const theme = useTheme();
  return <Text style={[styles.body, { color: muted ? theme.textSecondary : theme.text }]}>{children}</Text>;
}

export function Caption({ children, color }: { children: ReactNode; color?: string }) {
  const theme = useTheme();
  return <Text style={[styles.caption, { color: color ?? theme.textSecondary }]}>{children}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{children}</Text>;
}

/** The heading of a card or of a result ("Your card is on its way"): one size everywhere. */
export function Heading({ children, center }: { children: ReactNode; center?: boolean }) {
  const theme = useTheme();
  return <Text style={[styles.heading, { color: theme.text }, center && { textAlign: 'center' }]}>{children}</Text>;
}

/** A value shown under its label (name, policy number, amount): the label is a Caption, the value this. */
export function Strong({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.strong, { color: theme.text }]}>{children}</Text>;
}

/** A label with its value underneath, used for the facts of a record (policy, order, account details). */
export function Detail({ label, value, leading }: { label: string; value: string; leading?: ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <Caption>{label}</Caption>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        {leading}
        <View style={{ flexShrink: 1 }}>
          <Strong>{value}</Strong>
        </View>
      </View>
    </View>
  );
}

/** The top of a "done" screen: a large icon, a heading, and one line of explanation. */
export function ResultHeader({ icon, tone = 'success', title, body }: { icon: IconName; tone?: 'success' | 'neutral'; title: string; body?: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.four }}>
      <Ionicons name={icon} size={72} color={tone === 'success' ? theme.success : theme.primaryText} />
      <Heading center>{title}</Heading>
      {body ? <Body muted>{body}</Body> : null}
    </View>
  );
}

/** The small label above a field or a choice (same look as the label inside TextField and Select). */
export function FieldLabel({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.label, { color: theme.textSecondary }]}>{children}</Text>;
}

/** One choice in a list where exactly one can be picked (a plan, a branch, a reason). */
export function OptionRow({ title, sub, selected, onPress, leading }: { title: string; sub?: string; selected: boolean; onPress: () => void; leading?: ReactNode }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      onPress={onPress}
      style={[styles.option, { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement, borderColor: selected ? theme.primary : theme.border }]}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: selected ? '800' : '600' }}>{title}</Text>
        {sub ? <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{sub}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={22} color={theme.primaryText} /> : null}
    </Pressable>
  );
}

/** A boxed message: a warning (something must be fixed before going on) or a note. */
export function Notice({ tone, icon, children }: { tone: 'warning' | 'info'; icon: IconName; children: string }) {
  const theme = useTheme();
  const color = tone === 'warning' ? theme.danger : theme.primaryText;
  return (
    <View accessibilityRole={tone === 'warning' ? 'alert' : undefined} style={[styles.notice, { borderColor: color, backgroundColor: tone === 'warning' ? `${theme.danger}14` : theme.backgroundSelected }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={{ flex: 1, color: theme.text, fontSize: 16, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

/**
 * What to show where data has not arrived yet: a spinner while it is on its way, or why it never will (a failed request).
 * A spinner must never be on screen unless a request is really running, so every "not loaded yet" place uses this.
 */
export function Loading({ error }: { error?: string | null }) {
  const theme = useTheme();
  if (error) return <ErrorText>{error}</ErrorText>;
  return <ActivityIndicator color={theme.primary} style={{ margin: Spacing.four }} />;
}

export function ErrorText({ children }: { children?: string | null }) {
  const theme = useTheme();
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
      {children}
    </Text>
  );
}

// ---- inputs and buttons ---------------------------------------------------------------

type FieldProps = TextInputProps & {
  label: string;
  ref?: Ref<TextInputInstance>;
  /** Show thousands separators while an amount is typed ("1,234,567"). The value the screen stores stays plain. */
  grouped?: boolean;
};

const NUMERIC_KEYBOARDS = new Set(['number-pad', 'decimal-pad', 'phone-pad', 'numeric']);

const LRM = '\u200E'; // left-to-right mark: an invisible character that makes the whole line read left-to-right

export function TextField({ label, style, ref, onFocus, onBlur, onChangeText, value, placeholder, grouped, ...props }: FieldProps) {
  const theme = useTheme();
  const { rtl } = useI18n();
  const [focused, setFocused] = useState(false);
  // Digits stay the way the customer types them: Persian digits from a Persian keyboard, Latin digits from a Latin one. Showing
  // anything else would swap the characters under their finger ("1" turning into "۱" a moment after it was typed).
  const [typedPersian, setTypedPersian] = useState(false);
  const reveal = useRevealFocusedField();
  const numeric = NUMERIC_KEYBOARDS.has(props.keyboardType ?? '') || props.secureTextEntry;
  // A number in a right-to-left screen: the invisible LRM in front makes Android and browsers lay the line out
  // left-to-right (otherwise "+7 912 ..." gets its "+" thrown to the far end). The value in our state stays plain ASCII:
  // the marker and the thousands commas are added for display and removed again on input.
  const shaped = numeric && rtl && !props.secureTextEntry;
  const digitsAs = (text: string) => (typedPersian ? toPersianDigits(text) : text);
  const shownValue = typeof value === 'string' && numeric && !props.secureTextEntry ? (shaped ? LRM : '') + digitsAs(grouped ? groupDigits(value) : value) : value;

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        // Persian keyboards type ۱۲۳: convert to ASCII before the value reaches our state or the server.
        onChangeText={
          onChangeText
            ? (text) => {
                const raw = text.replace(/\u200E/g, '');
                if (numeric) setTypedPersian(/[\u06F0-\u06F9\u0660-\u0669]/.test(raw));
                const ascii = normalizeDigits(raw);
                onChangeText(grouped ? ungroupInput(ascii) : ascii);
              }
            : undefined
        }
        value={shownValue}
        placeholder={placeholder}
        onFocus={(e) => {
          setFocused(true);
          reveal?.();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: focused ? theme.primary : theme.border },
          // Numbers always read left-to-right, but sit at the start edge of the field.
          numeric ? { writingDirection: 'ltr', textAlign: rtl ? 'right' : 'left' } : null,
          // The browser's own focus ring would sit on top of our teal focus border.
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          style,
        ]}
        {...props}
      />
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  icon?: IconName;
};

export function Button({ title, onPress, loading, disabled, variant = 'primary', icon }: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const inactive = disabled || loading;
  const ink = primary ? theme.onPrimary : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        // the secondary button is a faint glass panel (so it reads over the pattern), the primary one is solid teal
        primary ? { backgroundColor: theme.primary } : { backgroundColor: `${theme.backgroundElement}B3`, borderColor: theme.border, borderWidth: 1.5 },
        { opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : (
        <View style={styles.buttonRow}>
          {icon ? <Ionicons name={icon} size={20} color={ink} /> : null}
          <Text style={[styles.buttonText, { color: ink }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A tappable list row on glass: round icon, a title that wraps onto as many lines as it needs, and an arrow. */
export function ActionRow({ title, sub, icon, onPress, loading, disabled }: { title: string; sub?: string; icon: IconName; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const theme = useTheme();
  const { rtl } = useI18n();
  const inactive = disabled || loading;
  return (
    <Glass radius={Radius.lg} style={{ opacity: inactive ? 0.55 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        disabled={inactive}
        onPress={onPress}
        style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.8 : 1 }]}>
        <IconBadge name={icon} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
          {sub ? <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{sub}</Text> : null}
        </View>
        {loading ? <ActivityIndicator color={theme.primary} /> : <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={20} color={theme.textSecondary} />}
      </Pressable>
    </Glass>
  );
}

// ---- cards, chips, badges -------------------------------------------------------------

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  if (!onPress) return <Glass radius={Radius.lg} style={styles.card}>{children}</Glass>;
  return (
    <Glass radius={Radius.lg}>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
        {children}
      </Pressable>
    </Glass>
  );
}

/** A small gold label (dark ink on gold: 7:1). */
export function Chip({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'danger' | 'success' }) {
  const theme = useTheme();
  const colors =
    tone === 'gold'
      ? { bg: theme.goldSoft, fg: theme.onGoldSoft }
      : tone === 'danger'
        ? { bg: theme.backgroundSelected, fg: theme.danger }
        : { bg: theme.backgroundSelected, fg: theme.success };
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      <Text style={[styles.chipText, { color: colors.fg }]}>{children}</Text>
    </View>
  );
}

/** A round icon on a soft background (account types, list rows). */
export function IconBadge({ name, tone = 'gold', size = 44 }: { name: IconName; tone?: 'gold' | 'teal'; size?: number }) {
  const theme = useTheme();
  const bg = tone === 'gold' ? theme.goldSoft : theme.backgroundSelected;
  const fg = tone === 'gold' ? theme.onGoldSoft : theme.primaryText;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.5} color={fg} />
    </View>
  );
}

/** The app's mark: a teal tile with a wallet and a gold coin. */
export function BrandMark({ size = 64 }: { size?: number }) {
  const theme = useTheme();
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ flex: 1, borderRadius: size * 0.3, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="wallet" size={size * 0.52} color={theme.onPrimary} />
      </View>
      <View
        style={{ position: 'absolute', end: -size * 0.08, top: -size * 0.08, width: size * 0.34, height: size * 0.34, borderRadius: size, backgroundColor: theme.gold, borderWidth: 2, borderColor: theme.background }}
      />
    </View>
  );
}

/** An inline link in the brand's readable teal. */
export function TextLink({ href, children }: { href: Href; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" hitSlop={8}>
        <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 15 }}>{children}</Text>
      </Pressable>
    </Link>
  );
}

// ---- selection ------------------------------------------------------------------------

/** A row of mutually exclusive tabs (e.g. Phone | Account | Contacts). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: theme.primary }]}>
            <Text style={{ color: selected ? theme.onPrimary : theme.textSecondary, fontWeight: selected ? '700' : '600', fontSize: 15 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Three language pills, each written in its own language and font. */
export function LanguageSwitcher() {
  const theme = useTheme();
  const { lang, setLanguage, t } = useI18n();
  return (
    <View style={styles.langRow} accessibilityRole="radiogroup" accessibilityLabel={t('settings.language')}>
      {LANG_CODES.map((code: Lang) => {
        const selected = code === lang;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => !selected && setLanguage(code)}
            style={[
              styles.langPill,
              selected ? { backgroundColor: theme.primary, borderColor: theme.primary } : { borderColor: theme.border, backgroundColor: theme.backgroundElement },
            ]}>
            <View style={styles.langInner}>
              <Flag lang={code} size={20} />
              {/* lang={code}: "فارسی" is drawn in Vazirmatn even while the interface is English */}
              <Text lang={code} style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: selected ? '700' : '600', fontSize: 14 }}>
                {t(`languages.${code}`)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  formContent: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four },
  pageContent: { flexGrow: 1, padding: Spacing.four },
  inner: { width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center', gap: Spacing.three },
  title: { fontSize: 30, fontWeight: '800' },
  heading: { fontSize: 20, fontWeight: '800' },
  strong: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 16 },
  caption: { fontSize: 13 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: Spacing.two },
  error: { fontSize: 14, fontWeight: '600' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: 16, padding: Spacing.three, minHeight: 56 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.three },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: 14, fontSize: 16, minHeight: 52 },
  button: { borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  // flexShrink lets a long label (Russian!) wrap onto a second line instead of running out of the button
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, flexShrink: 1 },
  buttonText: { fontSize: 16, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 12, minHeight: 64 },
  card: { padding: Spacing.three, gap: Spacing.one },
  chip: { alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 12, fontWeight: '700' },
  segmented: { flexDirection: 'row', borderRadius: Radius.md, padding: 4, borderWidth: 1 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.sm },
  langRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  langPill: { borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 8 },
  langInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
