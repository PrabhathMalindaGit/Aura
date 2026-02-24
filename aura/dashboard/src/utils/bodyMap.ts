export function bodyMapRegionLabel(region: string): string {
  const labels: Record<string, string> = {
    head: 'Head',
    neck: 'Neck',
    shoulder_left: 'Left shoulder',
    shoulder_right: 'Right shoulder',
    upper_back: 'Upper back',
    lower_back: 'Lower back',
    arm_left: 'Left arm',
    arm_right: 'Right arm',
    elbow_left: 'Left elbow',
    elbow_right: 'Right elbow',
    wrist_hand_left: 'Left wrist/hand',
    wrist_hand_right: 'Right wrist/hand',
    hip_left: 'Left hip',
    hip_right: 'Right hip',
    knee_left: 'Left knee',
    knee_right: 'Right knee',
    ankle_foot_left: 'Left ankle/foot',
    ankle_foot_right: 'Right ankle/foot',
  };

  return labels[region] ?? region;
}
