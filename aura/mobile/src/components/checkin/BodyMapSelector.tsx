import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SegmentedControl } from '@/src/components/SegmentedControl';
import { StatusPill } from '@/src/components/StatusPill';
import { useTokens } from '@/src/theme/tokens';
import type { CheckinBodyMapDraft } from '@/src/types/checkin';
import { regionLabel, type BodyMapRegion } from '@/src/utils/bodyMapLabels';

type BodyMapView = 'front' | 'back';

type BodyMapSelectorProps = {
  value: CheckinBodyMapDraft;
  onToggleRegion: (region: BodyMapRegion) => void;
  onSetPrimaryRegion: (region: BodyMapRegion) => void;
};

type Hotspot = {
  region: BodyMapRegion;
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
};

const FRONT_HOTSPOTS: Hotspot[] = [
  { region: 'head', x: 88, y: 10, width: 44, height: 44, radius: 22 },
  { region: 'neck', x: 96, y: 58, width: 28, height: 22, radius: 10 },
  { region: 'shoulder_left', x: 38, y: 82, width: 46, height: 28, radius: 14 },
  { region: 'shoulder_right', x: 136, y: 82, width: 46, height: 28, radius: 14 },
  { region: 'arm_left', x: 28, y: 112, width: 36, height: 74, radius: 18 },
  { region: 'arm_right', x: 156, y: 112, width: 36, height: 74, radius: 18 },
  { region: 'elbow_left', x: 28, y: 188, width: 36, height: 28, radius: 14 },
  { region: 'elbow_right', x: 156, y: 188, width: 36, height: 28, radius: 14 },
  { region: 'wrist_hand_left', x: 24, y: 220, width: 42, height: 34, radius: 16 },
  { region: 'wrist_hand_right', x: 154, y: 220, width: 42, height: 34, radius: 16 },
  { region: 'hip_left', x: 72, y: 204, width: 34, height: 34, radius: 17 },
  { region: 'hip_right', x: 114, y: 204, width: 34, height: 34, radius: 17 },
  { region: 'knee_left', x: 72, y: 276, width: 34, height: 34, radius: 17 },
  { region: 'knee_right', x: 114, y: 276, width: 34, height: 34, radius: 17 },
  { region: 'ankle_foot_left', x: 66, y: 336, width: 40, height: 30, radius: 14 },
  { region: 'ankle_foot_right', x: 114, y: 336, width: 40, height: 30, radius: 14 },
];

const BACK_HOTSPOTS: Hotspot[] = [
  { region: 'head', x: 88, y: 10, width: 44, height: 44, radius: 22 },
  { region: 'neck', x: 96, y: 58, width: 28, height: 22, radius: 10 },
  { region: 'upper_back', x: 70, y: 84, width: 80, height: 78, radius: 26 },
  { region: 'lower_back', x: 78, y: 164, width: 64, height: 56, radius: 22 },
  { region: 'shoulder_left', x: 36, y: 84, width: 40, height: 26, radius: 13 },
  { region: 'shoulder_right', x: 144, y: 84, width: 40, height: 26, radius: 13 },
  { region: 'arm_left', x: 24, y: 112, width: 36, height: 74, radius: 18 },
  { region: 'arm_right', x: 160, y: 112, width: 36, height: 74, radius: 18 },
  { region: 'elbow_left', x: 24, y: 188, width: 36, height: 28, radius: 14 },
  { region: 'elbow_right', x: 160, y: 188, width: 36, height: 28, radius: 14 },
  { region: 'wrist_hand_left', x: 22, y: 220, width: 42, height: 34, radius: 16 },
  { region: 'wrist_hand_right', x: 156, y: 220, width: 42, height: 34, radius: 16 },
  { region: 'hip_left', x: 72, y: 224, width: 34, height: 34, radius: 17 },
  { region: 'hip_right', x: 114, y: 224, width: 34, height: 34, radius: 17 },
  { region: 'knee_left', x: 72, y: 292, width: 34, height: 34, radius: 17 },
  { region: 'knee_right', x: 114, y: 292, width: 34, height: 34, radius: 17 },
  { region: 'ankle_foot_left', x: 66, y: 338, width: 40, height: 30, radius: 14 },
  { region: 'ankle_foot_right', x: 114, y: 338, width: 40, height: 30, radius: 14 },
];

export function BodyMapSelector({ value, onToggleRegion, onSetPrimaryRegion }: BodyMapSelectorProps) {
  const [view, setView] = useState<BodyMapView>('front');
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const hotspots = view === 'front' ? FRONT_HOTSPOTS : BACK_HOTSPOTS;

  return (
    <View style={styles.stack}>
      <SegmentedControl
        value={view}
        onChange={setView}
        options={[
          { value: 'front', label: 'Front' },
          { value: 'back', label: 'Back' },
        ]}
        size="sm"
        tone="accent"
        accessibilityLabel="Body map view"
      />

      <View style={styles.canvas}>
        <View style={styles.silhouette}>
          <View style={styles.head} />
          <View style={[styles.neck, view === 'back' ? styles.neckBack : null]} />
          <View style={[styles.torso, view === 'back' ? styles.torsoBack : null]} />
          <View style={[styles.hips, view === 'back' ? styles.hipsBack : null]} />
          <View style={styles.armLeft} />
          <View style={styles.armRight} />
          <View style={styles.forearmLeft} />
          <View style={styles.forearmRight} />
          <View style={styles.legLeft} />
          <View style={styles.legRight} />
          <View style={styles.calfLeft} />
          <View style={styles.calfRight} />
        </View>

        {hotspots.map((spot) => {
          const selected = value.selectedRegions.includes(spot.region);
          const primary = value.primaryRegion === spot.region;
          return (
            <Pressable
              key={`${view}-${spot.region}`}
              accessibilityRole="button"
              accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${regionLabel(spot.region)}${primary ? ', primary pain area' : ''}`}
              accessibilityState={{ selected }}
              onPress={() => onToggleRegion(spot.region)}
              style={({ pressed }) => [
                styles.hotspot,
                {
                  left: spot.x,
                  top: spot.y,
                  width: spot.width,
                  height: spot.height,
                  borderRadius: spot.radius ?? 14,
                },
                selected ? styles.hotspotSelected : null,
                primary ? styles.hotspotPrimary : null,
                pressed ? styles.hotspotPressed : null,
              ]}
            >
              {primary ? <Text style={styles.primaryGlyph}>★</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {value.selectedRegions.length > 0 ? (
        <View style={styles.selectionStack}>
          <Text style={styles.selectionLabel}>Selected regions</Text>
          <View style={styles.selectionRow}>
            {value.selectedRegions.map((region) => {
              const isPrimary = value.primaryRegion === region;
              return (
                <Pressable
                  key={`primary-${region}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${regionLabel(region)} as the most bothersome area`}
                  onPress={() => onSetPrimaryRegion(region)}
                  style={({ pressed }) => [
                    styles.selectionChip,
                    isPrimary ? styles.selectionChipPrimary : null,
                    pressed ? styles.selectionChipPressed : null,
                  ]}
                >
                  <Text style={[styles.selectionChipText, isPrimary ? styles.selectionChipTextPrimary : null]}>
                    {regionLabel(region)}
                  </Text>
                  {isPrimary ? <StatusPill label="Primary" variant="warning" accessible={false} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <Text style={styles.helperText}>Tap body regions to mark where symptoms are showing up today.</Text>
      )}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  const limbColor = tokens.scheme === 'dark' ? '#22354b' : '#d9e8f7';
  const torsoColor = tokens.scheme === 'dark' ? '#2b4360' : '#d1e2f2';

  return StyleSheet.create({
    stack: {
      gap: tokens.spacing.md,
    },
    canvas: {
      position: 'relative',
      alignSelf: 'center',
      width: 220,
      height: 372,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      overflow: 'hidden',
    },
    silhouette: {
      position: 'absolute',
      inset: 0,
      alignItems: 'center',
    },
    head: {
      position: 'absolute',
      top: 10,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: torsoColor,
    },
    neck: {
      position: 'absolute',
      top: 54,
      width: 22,
      height: 18,
      borderRadius: 10,
      backgroundColor: torsoColor,
    },
    neckBack: {
      top: 56,
    },
    torso: {
      position: 'absolute',
      top: 74,
      width: 78,
      height: 132,
      borderRadius: 30,
      backgroundColor: torsoColor,
    },
    torsoBack: {
      width: 84,
      height: 148,
    },
    hips: {
      position: 'absolute',
      top: 198,
      width: 66,
      height: 42,
      borderRadius: 20,
      backgroundColor: torsoColor,
    },
    hipsBack: {
      top: 218,
      width: 72,
      height: 44,
    },
    armLeft: {
      position: 'absolute',
      top: 92,
      left: 42,
      width: 22,
      height: 84,
      borderRadius: 12,
      backgroundColor: limbColor,
    },
    armRight: {
      position: 'absolute',
      top: 92,
      right: 42,
      width: 22,
      height: 84,
      borderRadius: 12,
      backgroundColor: limbColor,
    },
    forearmLeft: {
      position: 'absolute',
      top: 176,
      left: 38,
      width: 20,
      height: 78,
      borderRadius: 12,
      backgroundColor: limbColor,
    },
    forearmRight: {
      position: 'absolute',
      top: 176,
      right: 38,
      width: 20,
      height: 78,
      borderRadius: 12,
      backgroundColor: limbColor,
    },
    legLeft: {
      position: 'absolute',
      top: 238,
      left: 78,
      width: 22,
      height: 86,
      borderRadius: 14,
      backgroundColor: limbColor,
    },
    legRight: {
      position: 'absolute',
      top: 238,
      right: 78,
      width: 22,
      height: 86,
      borderRadius: 14,
      backgroundColor: limbColor,
    },
    calfLeft: {
      position: 'absolute',
      top: 320,
      left: 74,
      width: 24,
      height: 40,
      borderRadius: 14,
      backgroundColor: limbColor,
    },
    calfRight: {
      position: 'absolute',
      top: 320,
      right: 74,
      width: 24,
      height: 40,
      borderRadius: 14,
      backgroundColor: limbColor,
    },
    hotspot: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
    },
    hotspotSelected: {
      borderColor: tokens.colors.accent,
      backgroundColor: `${tokens.colors.accent}33`,
    },
    hotspotPrimary: {
      borderColor: tokens.colors.warning,
      backgroundColor: `${tokens.colors.warning}33`,
    },
    hotspotPressed: {
      opacity: 0.82,
    },
    primaryGlyph: {
      color: tokens.colors.warning,
      fontSize: 12,
      lineHeight: 14,
      fontWeight: tokens.typography.weights.semibold,
    },
    selectionStack: {
      gap: tokens.spacing.sm,
    },
    selectionLabel: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    selectionRow: {
      gap: tokens.spacing.sm,
    },
    selectionChip: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
    },
    selectionChipPrimary: {
      borderColor: tokens.colors.warning,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    selectionChipPressed: {
      opacity: 0.84,
    },
    selectionChipText: {
      flex: 1,
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    selectionChipTextPrimary: {
      color: tokens.colors.warning,
    },
    helperText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
  });
}
