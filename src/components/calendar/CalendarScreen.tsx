import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  WEEKDAY_LABELS,
  addMonths,
  formatLongDay,
  formatMonth,
  isSameDay,
  monthGrid,
} from '../../meeting/calendar';
import type { Meeting } from '../../meeting/types';
import { colors } from '../../theme';
import { MeetingList } from '../meetings/MeetingList';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

export interface CalendarScreenProps {
  meetings: Meeting[];
  onStart: (meeting: Meeting) => void;
  onDelete: (meeting: Meeting) => void;
  onSchedule: (day: Date) => void;
}

export function CalendarScreen({ meetings, onStart, onDelete, onSchedule }: CalendarScreenProps) {
  const today = new Date();
  const [month, setMonth] = useState(() => addMonths(today, 0));
  const [selected, setSelected] = useState(today);

  const meetingsOn = (day: Date) =>
    meetings.filter((meeting) => isSameDay(new Date(meeting.startsAt), day));
  const selectedMeetings = meetingsOn(selected);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
        <Button label="Schedule" icon="add" compact onPress={() => onSchedule(selected)} />
      </View>

      <View style={styles.monthBar}>
        <IconButton
          icon="chevron-back"
          label="Previous month"
          onPress={() => setMonth(addMonths(month, -1))}
        />
        <Text style={styles.monthLabel}>{formatMonth(month)}</Text>
        <IconButton
          icon="chevron-forward"
          label="Next month"
          onPress={() => setMonth(addMonths(month, 1))}
        />
      </View>

      <View style={styles.week}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {monthGrid(month).map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isSelected = isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          const count = meetingsOn(day).length;
          return (
            <Pressable
              key={day.getTime()}
              style={[styles.day, isSelected && styles.daySelected]}
              onPress={() => setSelected(day)}
              accessibilityRole="button"
              accessibilityLabel={formatLongDay(day)}
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.dayNumber,
                  !inMonth && styles.dayOutside,
                  isToday && styles.dayToday,
                ]}
              >
                {day.getDate()}
              </Text>
              {count > 0 && (
                <View style={styles.dots}>
                  {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                    <View key={index} style={styles.dot} />
                  ))}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <MeetingList
        title={formatLongDay(selected)}
        meetings={selectedMeetings}
        emptyText="No meetings on this day."
        onStart={onStart}
        onDelete={onDelete}
      />
      {selectedMeetings.length === 0 && (
        <Pressable
          style={styles.inlineSchedule}
          onPress={() => onSchedule(selected)}
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.inlineScheduleText}>Schedule something for this day</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 16,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  day: {
    width: `${100 / 7}%`,
    aspectRatio: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  daySelected: {
    backgroundColor: colors.surfaceRaised,
  },
  dayNumber: {
    color: colors.text,
    fontSize: 15,
  },
  dayOutside: {
    color: colors.textSubtle,
  },
  dayToday: {
    color: colors.primary,
    fontWeight: '800',
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  inlineSchedule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineScheduleText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
