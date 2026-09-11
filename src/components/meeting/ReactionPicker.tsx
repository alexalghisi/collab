import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉'];

export interface ReactionPickerProps {
  onPick: (emoji: string) => void;
}

export function ReactionPicker({ onPick }: ReactionPickerProps) {
  return (
    <View style={styles.row}>
      {REACTIONS.map((emoji) => (
        <Pressable
          key={emoji}
          style={styles.item}
          onPress={() => onPick(emoji)}
          accessibilityRole="button"
          accessibilityLabel={`React with ${emoji}`}
        >
          <Text style={styles.emoji}>{emoji}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 4,
    padding: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  item: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 26,
  },
});
