import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  WEEKDAY_LABELS,
  addMonths,
  formatLongDay,
  formatMonth,
  isSameDay,
  monthGrid,
  parseDateTime,
  toDateInput,
} from '../../meeting/calendar';
import { colors } from '../../theme';
import { placePopover, type AnchorBox } from './popoverPlacement';

const CALENDAR_WIDTH = 520;
const CALENDAR_HEIGHT = 560;
const TIME_WIDTH = 280;
const TIME_HEIGHT = 420;
const TIME_ROW = 52;

const fieldDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const QUARTER_HOURS = Array.from({ length: 24 * 4 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
});

function parseIsoDate(value: string): Date | null {
  const ms = parseDateTime(value, '00:00');
  return ms === null ? null : new Date(ms);
}

function timeChoices(current: string): readonly string[] {
  if (QUARTER_HOURS.includes(current) || !/^\d{2}:\d{2}$/.test(current)) {
    return QUARTER_HOURS;
  }
  return [...QUARTER_HOURS, current].sort();
}

function useAnchor() {
  const ref = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorBox>({ x: 16, y: 16, width: 280, height: 52 });

  const close = useCallback(() => setOpen(false), []);

  const openAtAnchor = () => {
    const node = ref.current;
    if (!node) {
      setOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setAnchor({ x, y, width, height });
      }
      setOpen(true);
    });
  };

  return { ref, open, anchor, openAtAnchor, close };
}

function AnchoredPopover({
  open,
  anchor,
  preferredWidth,
  preferredHeight,
  onClose,
  label,
  children,
}: {
  open: boolean;
  anchor: AnchorBox;
  preferredWidth: number;
  preferredHeight: number;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const frame = placePopover(anchor, windowWidth, windowHeight, preferredWidth, preferredHeight);

  useEffect(() => {
    if (!open || Platform.OS !== 'web') {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.modalRoot} pointerEvents="box-none">
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${label}`}
        />
        <View
          style={[
            styles.panel,
            { top: frame.top, left: frame.left, width: frame.width, height: frame.maxHeight },
          ]}
          accessibilityLabel={label}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { ref, open, anchor, openAtAnchor, close } = useAnchor();
  const selected = parseIsoDate(value);
  const [month, setMonth] = useState(() => {
    const current = selected ?? new Date();
    return new Date(current.getFullYear(), current.getMonth(), 1);
  });
  const today = new Date();
  const label = selected ? fieldDateFormat.format(selected) : 'Choose a date';

  const onPress = () => {
    if (open) {
      close();
      return;
    }
    const current = parseIsoDate(value) ?? new Date();
    setMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    openAtAnchor();
  };

  const choose = (day: Date) => {
    onChange(toDateInput(day));
    close();
  };

  return (
    <>
      <View ref={ref} collapsable={false}>
        <Pressable
          style={[styles.trigger, open && styles.triggerOpen]}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Choose date, ${selected ? formatLongDay(selected) : 'no date selected'}`}
          accessibilityState={{ expanded: open }}
          testID="date-field"
        >
          <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          <Text style={styles.triggerText} numberOfLines={1}>
            {label}
          </Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </Pressable>
      </View>
      <AnchoredPopover
        open={open}
        anchor={anchor}
        preferredWidth={CALENDAR_WIDTH}
        preferredHeight={CALENDAR_HEIGHT}
        onClose={close}
        label="Calendar"
      >
        <View style={styles.calendar} testID="date-popover">
          <View style={styles.monthBar}>
            <Pressable
              style={styles.step}
              onPress={() => setMonth((current) => addMonths(current, -1))}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.monthLabel}>{formatMonth(month)}</Text>
            <Pressable
              style={styles.step}
              onPress={() => setMonth((current) => addMonths(current, 1))}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.week}>
            {WEEKDAY_LABELS.map((day) => (
              <Text key={day} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>
          <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
            {monthGrid(month).map((day) => {
              const inMonth = day.getMonth() === month.getMonth();
              const isSelected = selected !== null && isSameDay(day, selected);
              const isToday = isSameDay(day, today);
              return (
                <Pressable
                  key={toDateInput(day)}
                  style={styles.day}
                  onPress={() => choose(day)}
                  accessibilityRole="button"
                  accessibilityLabel={formatLongDay(day)}
                  accessibilityState={{ selected: isSelected }}
                >
                  <View
                    style={[
                      styles.dayFace,
                      isToday && !isSelected && styles.dayToday,
                      isSelected && styles.daySelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        !inMonth && styles.dayOutside,
                        isToday && !isSelected && styles.dayNumberToday,
                        isSelected && styles.dayNumberSelected,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            style={styles.today}
            onPress={() => choose(today)}
            accessibilityRole="button"
            accessibilityLabel="Choose today"
          >
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
        </View>
      </AnchoredPopover>
    </>
  );
}

export function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { ref, open, anchor, openAtAnchor, close } = useAnchor();
  const listRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  const choices = timeChoices(value);
  const label = /^\d{2}:\d{2}$/.test(value) ? value : 'Choose a time';

  useEffect(() => {
    if (!open) {
      scrolled.current = false;
    }
  }, [open]);

  const scrollToSelected = () => {
    if (scrolled.current) {
      return;
    }
    const index = choices.indexOf(value);
    if (index < 0) {
      return;
    }
    scrolled.current = true;
    listRef.current?.scrollTo({
      y: Math.max(0, index * TIME_ROW - TIME_ROW * 2),
      animated: false,
    });
  };

  return (
    <>
      <View ref={ref} collapsable={false}>
        <Pressable
          style={[styles.trigger, open && styles.triggerOpen]}
          onPress={() => (open ? close() : openAtAnchor())}
          accessibilityRole="button"
          accessibilityLabel={`Choose time, ${label}`}
          accessibilityState={{ expanded: open }}
          testID="time-field"
        >
          <Ionicons name="time-outline" size={22} color={colors.primary} />
          <Text style={styles.triggerText} numberOfLines={1}>
            {label}
          </Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </Pressable>
      </View>
      <AnchoredPopover
        open={open}
        anchor={anchor}
        preferredWidth={Math.max(anchor.width, TIME_WIDTH)}
        preferredHeight={TIME_HEIGHT}
        onClose={close}
        label="Time"
      >
        <ScrollView
          ref={listRef}
          style={styles.timeList}
          onContentSizeChange={scrollToSelected}
          testID="time-popover"
        >
          {choices.map((option) => {
            const selected = option === value;
            return (
              <Pressable
                key={option}
                style={[styles.timeRow, selected && styles.timeRowSelected]}
                onPress={() => {
                  onChange(option);
                  close();
                }}
                accessibilityRole="button"
                accessibilityLabel={option}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.timeText, selected && styles.timeTextSelected]}>{option}</Text>
                {selected ? <Ionicons name="checkmark" size={18} color={colors.text} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </AnchoredPopover>
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  panel: {
    position: 'absolute',
    zIndex: 2,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 18,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  triggerOpen: {
    borderColor: colors.primary,
  },
  triggerText: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  calendar: {
    flex: 1,
    gap: 8,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  monthLabel: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.textSubtle,
    fontSize: 13,
    fontWeight: '700',
  },
  gridScroll: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  day: {
    width: `${100 / 7}%`,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayFace: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: {
    backgroundColor: colors.primary,
  },
  dayToday: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  dayNumber: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  dayOutside: {
    color: colors.textSubtle,
  },
  dayNumberToday: {
    color: colors.primary,
    fontWeight: '800',
  },
  dayNumberSelected: {
    color: colors.text,
    fontWeight: '800',
  },
  today: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  todayText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  timeList: {
    flex: 1,
    marginHorizontal: -8,
  },
  timeRow: {
    height: TIME_ROW,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
  },
  timeRowSelected: {
    backgroundColor: colors.primary,
  },
  timeText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  timeTextSelected: {
    fontWeight: '800',
  },
});
