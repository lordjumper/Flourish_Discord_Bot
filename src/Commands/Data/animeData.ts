import fs from 'fs';
import path from 'path';
import * as jikanApi from './jikanApi';
import { loadAnimeData, getDropCooldownMinutes, getCardDimensions } from './animeDataUtils';

// Interface for anime character
export interface AnimeCharacter {
    id: string;
    name: string;
    alias: string;
    image_url: string;
    anime?: string;
    anime_id?: number;
}

// Get random characters from enabled series - can specify count for how many to return
export async function getRandomCharacters(count: number = 3): Promise<AnimeCharacter[]> {
    // Use Jikan API to get random characters
    return jikanApi.getRandomCharacters(count);
}

// Get character by ID
export function getCharacterById(characterId: string): AnimeCharacter | null {
    // For now, just return null since we're not storing characters locally anymore
    return null;
}

// Get series by character ID
export function getSeriesByCharacterId(characterId: string): string | null {
    return "Unknown Anime";
}