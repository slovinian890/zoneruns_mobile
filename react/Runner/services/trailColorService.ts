import AsyncStorage from '@react-native-async-storage/async-storage';

const TRAIL_COLOR_KEY = '@runner:trail_color';

// 12 beautiful trail color options
export const TRAIL_COLORS = [
  { name: 'Cool Steel', hex: '#5B7EA4' },
  { name: 'Ocean Blue', hex: '#2196F3' },
  { name: 'Electric Blue', hex: '#00B0FF' },
  { name: 'Teal', hex: '#009688' },
  { name: 'Emerald', hex: '#4CAF50' },
  { name: 'Lime', hex: '#8BC34A' },
  { name: 'Sunset Orange', hex: '#FF9800' },
  { name: 'Coral', hex: '#FF6F61' },
  { name: 'Hot Pink', hex: '#E91E63' },
  { name: 'Purple', hex: '#9C27B0' },
  { name: 'Deep Purple', hex: '#673AB7' },
  { name: 'Red', hex: '#F44336' },
];

export const DEFAULT_TRAIL_COLOR = '#5B7EA4';

export const getTrailColor = async (): Promise<string> => {
  try {
    const color = await AsyncStorage.getItem(TRAIL_COLOR_KEY);
    return color || DEFAULT_TRAIL_COLOR;
  } catch {
    return DEFAULT_TRAIL_COLOR;
  }
};

export const setTrailColor = async (color: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(TRAIL_COLOR_KEY, color);
  } catch (e) {
    console.error('Error saving trail color:', e);
  }
};
