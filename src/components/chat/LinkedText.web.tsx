import { createElement } from 'react';
import { StyleSheet, Text } from 'react-native';
import { splitMessageLinks } from '../../chat/links';
import { colors } from '../../theme';
import type { LinkedTextProps } from './LinkedText';

export type { LinkedTextProps };

export function LinkedText({ text }: LinkedTextProps) {
  return (
    <Text style={styles.text}>
      {splitMessageLinks(text).map((part, index) =>
        part.kind === 'link'
          ? createElement(
              'a',
              {
                key: `${part.href}-${index}`,
                href: part.href,
                target: '_blank',
                rel: 'noopener noreferrer',
                style: {
                  color: '#93c5fd',
                  textDecoration: 'underline',
                  fontSize: 14,
                  cursor: 'pointer',
                },
              },
              part.value,
            )
          : createElement(Text, { key: `text-${index}` }, part.value),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.text,
    fontSize: 14,
  },
});
