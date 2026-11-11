import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dimensions, Keyboard, Platform, ScrollView, TextInput, View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** How tall the on-screen keyboard is right now (0 when hidden). Always 0 on the web, which has no on-screen keyboard. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** Fields call this when they get focus, so the surrounding scroll view can bring them into view. */
const RevealContext = createContext<(() => void) | null>(null);
export const useRevealFocusedField = () => useContext(RevealContext);

/**
 * A scroll view that is never covered by the keyboard.
 * The app draws edge to edge on Android, so the system no longer shrinks the screen for the keyboard: this does it itself.
 * It leaves room for the keyboard under the content, and scrolls the field you tapped up above the keyboard (also when you
 * move from one field to the next).
 */
export function KeyboardScrollView({ children, contentContainerStyle, ...rest }: ScrollViewProps & { children?: ReactNode }) {
  const ref = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const room = Math.max(0, keyboard - insets.bottom); // the screen already keeps the bottom inset clear

  const reveal = useCallback(() => {
    // Wait a moment: the keyboard and the new layout need to settle before the field's position is final.
    setTimeout(() => {
      const field = TextInput.State.currentlyFocusedInput?.();
      field?.measureInWindow((_x, y, _w, h) => {
        const visibleBottom = Dimensions.get('window').height - (keyboard || 0);
        const overflow = y + h + 24 - visibleBottom;
        if (overflow > 0) ref.current?.scrollTo({ y: offset.current + overflow, animated: true });
      });
    }, 150);
  }, [keyboard]);

  useEffect(() => {
    if (keyboard > 0) reveal();
  }, [keyboard, reveal]);

  const value = useMemo(() => reveal, [reveal]);
  return (
    <RevealContext.Provider value={value}>
      <View style={{ flex: 1, paddingBottom: room }}>
        <ScrollView
          ref={ref}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={32}
          onScroll={(e) => {
            offset.current = e.nativeEvent.contentOffset.y;
            rest.onScroll?.(e);
          }}
          contentContainerStyle={contentContainerStyle}
          {...rest}>
          {children}
        </ScrollView>
      </View>
    </RevealContext.Provider>
  );
}
