import { useState } from 'react';
import { View } from 'react-native';

import { fitFontSize } from '@/lib/fit-text';

import { Text } from './text';

/**
 * A money amount that ALWAYS fits on one line: the font shrinks as the number gets longer (rials run to a dozen
 * digits), from `maxSize` down to `minSize`. It measures the space it is given, so it works the same on every phone
 * and in the browser, in every currency and language.
 */
export function AmountText({
  text,
  maxSize,
  minSize = 12,
  color,
  weight = '800',
  align,
}: {
  text: string;
  maxSize: number;
  minSize?: number;
  color: string;
  weight?: '600' | '700' | '800';
  align?: 'left' | 'right' | 'center';
}) {
  const [width, setWidth] = useState(0);
  const size = fitFontSize(text, width, maxSize, minSize);
  return (
    <View style={{ alignSelf: 'stretch' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* numberOfLines + adjustsFontSizeToFit are the phone's own second safety net if the estimate is a little off */}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color, fontSize: size, fontWeight: weight, textAlign: align }}>
        {text}
      </Text>
    </View>
  );
}
