import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import type { IconName } from '../ui/icons';

const RELEASES_URL = 'https://github.com/alexalghisi/collab/releases/latest';

interface Feature {
  readonly icon: IconName;
  readonly color: string;
  readonly title: string;
  readonly body: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: 'code-slash',
    color: '#7c3aed',
    title: 'Live code, together',
    body: 'A shared editor right inside the call. Everyone types in the same file with their own coloured cursor, then hits Run and JavaScript, TypeScript, Python, Go or C++ executes for the whole room. No more squinting at a screen-shared IDE.',
  },
  {
    icon: 'videocam',
    color: colors.primary,
    title: 'Video that stays sharp',
    body: 'Up to 1080p at 60 fps, with up to 6 Mbit/s for your camera and 8 Mbit/s for a shared screen. Faces stay crisp and shared text stays readable instead of dissolving into blur.',
  },
  {
    icon: 'mic',
    color: colors.success,
    title: 'Noise cancellation that works',
    body: 'Fullband 48 kHz Opus at 64 kbit/s, about three times what typical messengers send, plus echo cancellation, ML noise suppression and voice isolation. Keyboards, fans and traffic stay out of the call.',
  },
  {
    icon: 'grid',
    color: colors.warning,
    title: 'One dashboard for everything',
    body: 'Meetings, a calendar that syncs with Google Calendar, team chat, files and search across past meetings, all from one home screen. Stop juggling five apps to run one meeting.',
  },
  {
    icon: 'sparkles',
    color: '#db2777',
    title: 'Whiteboard, captions and an AI assistant',
    body: 'Sketch ideas on a shared whiteboard, follow live captions, and ask the meeting assistant what was decided while the call is still running.',
  },
  {
    icon: 'phone-portrait',
    color: '#0891b2',
    title: 'Runs on every device',
    body: 'Install it on Windows, macOS, iOS or Android, or skip the install and open it straight in the browser. Responsive and pixel-perfect from a phone to a 4K monitor.',
  },
];

function FeatureTile({ icon, color, title, body }: Feature) {
  return (
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={22} color={colors.text} />
      </View>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileBody}>{body}</Text>
    </View>
  );
}

/** Home-screen pitch: what Collab offers beyond Zoom, Meet, Teams or WhatsApp. */
export function WhyCollabCard() {
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.badge}>
        <Ionicons name="gift" size={14} color={colors.success} />
        <Text style={styles.badgeText}>Free for now · every feature included</Text>
      </View>
      <Text style={styles.title}>More than a video call</Text>
      <Text style={styles.lead}>
        Zoom, Google Meet, Microsoft Teams and WhatsApp get you onto a call. Collab gives you a
        place to actually work together once you are there: code, draw, decide and follow up without
        leaving the meeting.
      </Text>

      <View style={styles.grid}>
        {FEATURES.map((feature) => (
          <FeatureTile key={feature.title} {...feature} />
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Free while we grow. No credit card, no trial countdown.
        </Text>
        <Pressable
          style={styles.download}
          onPress={() => void Linking.openURL(RELEASES_URL)}
          accessibilityRole="link"
          accessibilityLabel="Download Collab for desktop and mobile"
        >
          <Ionicons name="download-outline" size={18} color={colors.text} />
          <Text style={styles.downloadLabel}>Get the apps</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  badgeText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  lead: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  tile: {
    flexGrow: 1,
    flexBasis: 260,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tileTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  tileBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 14,
    flexShrink: 1,
  },
  download: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  downloadLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
