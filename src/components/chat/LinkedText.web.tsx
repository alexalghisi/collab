import { createElement } from 'react';
import { StyleSheet, Text } from 'react-native';
import { splitMessageLinks } from '../../chat/links';
import { colors } from '../../theme';
import type { LinkedTextProps } from './LinkedText';

export type { LinkedTextProps };

export function LinkedText({ text, mine }: LinkedTextProps) {
  return (
    <Text style={styles.text} selectable>
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
                  color: mine ? '#ffffff' : '#93c5fd',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  overflowWrap: 'anywhere',
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
    lineHeight: 21,
  },
});
