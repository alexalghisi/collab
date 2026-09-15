import { Linking, Platform, StyleSheet, Text } from 'react-native';
import { splitMessageLinks } from '../../chat/links';
import { colors } from '../../theme';

export interface LinkedTextProps {
  readonly text: string;
}

function openHref(href: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(href);
}

/** Renders chat text with http(s) URLs as links that open outside the call. */
export function LinkedText({ text }: LinkedTextProps) {
  return (
    <Text style={styles.text}>
      {splitMessageLinks(text).map((part, index) =>
        part.kind === 'link' ? (
          <Text
            key={`${part.href}-${index}`}
            style={styles.link}
            accessibilityRole="link"
            accessibilityLabel={part.value}
            onPress={() => openHref(part.href)}
          >
            {part.value}
          </Text>
        ) : (
          <Text key={`text-${index}`}>{part.value}</Text>
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.text,
    fontSize: 14,
  },
  link: {
    color: '#93c5fd',
    textDecorationLine: 'underline',
  },
});
