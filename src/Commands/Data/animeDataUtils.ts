import fs from 'fs';
import path from 'path';

// Path to anime data file
const ANIME_DATA_PATH = path.join(__dirname, 'anime.json');

// Interface for anime data
export interface AnimeData {
  config: {
    drop_cooldown_minutes: number;
    card_width: number;
    card_height: number;
    use_jikan_api: boolean;
    preferred_series?: string[];
  };
  print_counts: {
    [characterId: string]: number;
  };
}

/**
 * Load anime data from file
 */
export function loadAnimeData(): AnimeData {
  try {
    // Ensure the file exists
    if (!fs.existsSync(ANIME_DATA_PATH)) {
      // Create default anime data if it doesn't exist
      const defaultData: AnimeData = {
        config: {
          drop_cooldown_minutes: 60,
          card_width: 400,
          card_height: 600,
          use_jikan_api: true,
          preferred_series: []
        },
        print_counts: {}
      };
      saveAnimeData(defaultData);
      return defaultData;
    }

    const data = fs.readFileSync(ANIME_DATA_PATH, 'utf8');
    const animeData = JSON.parse(data);
    
    // Ensure the print_counts object exists
    if (!animeData.print_counts) {
      animeData.print_counts = {};
    }
    
    return animeData;
  } catch (error) {
    console.error('Error reading anime data:', error);
    throw new Error('Failed to load anime data');
  }
}

/**
 * Save anime data to file
 */
export function saveAnimeData(animeData: AnimeData): void {
  try {
    fs.writeFileSync(ANIME_DATA_PATH, JSON.stringify(animeData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving anime data:', error);
    throw new Error('Failed to save anime data');
  }
}

/**
 * Get the drop cooldown minutes
 */
export function getDropCooldownMinutes(): number {
  const animeData = loadAnimeData();
  return animeData.config.drop_cooldown_minutes;
}

/**
 * Get card dimensions
 */
export function getCardDimensions(): { width: number, height: number } {
  const animeData = loadAnimeData();
  return {
    width: animeData.config.card_width,
    height: animeData.config.card_height
  };
}

/**
 * Get the total number of prints for a character
 */
export function getTotalPrints(characterId: string): number {
  const animeData = loadAnimeData();
  return animeData.print_counts[characterId] || 0;
}

/**
 * Get preferred anime series
 */
export function getPreferredSeries(): string[] {
  const animeData = loadAnimeData();
  return animeData.config.preferred_series || [];
}