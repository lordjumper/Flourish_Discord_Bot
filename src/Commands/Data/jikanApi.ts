import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { AnimeCharacter } from './animeData';
import { getPreferredSeries } from './animeDataUtils';

// Base URL for the Jikan API
const JIKAN_API_BASE_URL = 'https://api.jikan.moe/v4';

// Path to store cached data to avoid hitting rate limits
const CACHE_PATH = path.join(__dirname, 'jikanCache.json');

// Interface for the cache structure
interface JikanCache {
  anime: JikanAnimeCache;
  characters: JikanCharacterCache;
  lastUpdate: number;
}

interface JikanAnimeCache {
  [animeId: string]: any;
}

interface JikanCharacterCache {
  [characterId: string]: any;
}

// Initialize cache
let cache: JikanCache = {
  anime: {},
  characters: {},
  lastUpdate: 0
};

// Load cache from disk if exists
function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const data = fs.readFileSync(CACHE_PATH, 'utf8');
      cache = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading Jikan cache:', error);
    // If there's an error, use the default empty cache
  }
}

// Save cache to disk
function saveCache() {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving Jikan cache:', error);
  }
}

// Load cache on module initialization
loadCache();

// Helper function to handle API rate limits
async function apiRequest(endpoint: string) {
  try {
    // Jikan has a rate limit of 3 requests per second and 60 requests per minute
    // Add a small delay to ensure we don't hit the rate limit
    await new Promise(resolve => setTimeout(resolve, 350));
    
    const response = await axios.get(`${JIKAN_API_BASE_URL}${endpoint}`);
    return response.data;
  } catch (error) {
    console.error(`Error querying Jikan API (${endpoint}):`, error);
    // If we hit the rate limit, wait and try again
    if (error.response && error.response.status === 429) {
      console.log('Rate limited, waiting 1 second...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return apiRequest(endpoint);
    }
    throw error;
  }
}

// Get anime by ID
export async function getAnime(animeId: number) {
  // Check cache first
  const cacheKey = animeId.toString();
  if (cache.anime[cacheKey]) {
    return cache.anime[cacheKey];
  }
  
  const data = await apiRequest(`/anime/${animeId}`);
  
  // Cache the result
  cache.anime[cacheKey] = data;
  saveCache();
  
  return data;
}

// Get character by ID
export async function getCharacter(characterId: number) {
  // Check cache first
  const cacheKey = characterId.toString();
  if (cache.characters[cacheKey]) {
    return cache.characters[cacheKey];
  }
  
  const data = await apiRequest(`/characters/${characterId}`);
  
  // Cache the result
  cache.characters[cacheKey] = data;
  saveCache();
  
  return data;
}

// Search for anime
export async function searchAnime(query: string, limit: number = 5) {
  const data = await apiRequest(`/anime?q=${encodeURIComponent(query)}&limit=${limit}`);
  return data.data;
}

// Search for characters from a specific anime
export async function searchCharactersByAnime(animeTitle: string, limit: number = 25) {
  try {
    // First search for the anime
    const animeData = await searchAnime(animeTitle, 1);
    
    if (!animeData || animeData.length === 0) {
      return [];
    }
    
    // Get characters from that anime
    const animeId = animeData[0].mal_id;
    const charactersData = await apiRequest(`/anime/${animeId}/characters`);
    
    return charactersData.data || [];
  } catch (error) {
    console.error(`Error searching characters for anime ${animeTitle}:`, error);
    return [];
  }
}

// Search for characters
export async function searchCharacters(query: string, limit: number = 5) {
  const data = await apiRequest(`/characters?q=${encodeURIComponent(query)}&limit=${limit}`);
  return data.data;
}

// Get random anime
export async function getRandomAnime() {
  const data = await apiRequest('/random/anime');
  return data.data;
}

// Try to get preferred anime from the config
async function tryGetPreferredAnime() {
  const preferredSeries = getPreferredSeries();
  
  // If we have preferred series, try to get one of them
  if (preferredSeries && preferredSeries.length > 0) {
    // Choose a random series from the preferred list
    const randomSeries = preferredSeries[Math.floor(Math.random() * preferredSeries.length)];
    
    try {
      // Search for the anime
      const animeResults = await searchAnime(randomSeries, 5);
      
      // Filter for exact or close matches
      const matchingAnime = animeResults.filter(anime => 
        anime.title.toLowerCase().includes(randomSeries.toLowerCase()) ||
        (anime.title_english && anime.title_english.toLowerCase().includes(randomSeries.toLowerCase()))
      );
      
      if (matchingAnime.length > 0) {
        // Return a random match from the filtered results
        return matchingAnime[Math.floor(Math.random() * matchingAnime.length)];
      }
    } catch (error) {
      console.error(`Error fetching preferred anime ${randomSeries}:`, error);
      // Continue with random anime if there's an error
    }
  }
  
  return null;
}

// Get random characters from an anime
export async function getRandomCharacters(count: number = 3): Promise<AnimeCharacter[]> {
  const characters: AnimeCharacter[] = [];
  const usedCharacterIds = new Set();
  const usedAnimeIds = new Set(); // Track used anime to ensure variety
  
  // Get the list of preferred series - we'll ONLY use these
  const preferredSeries = getPreferredSeries();
  
  // Check if we have preferred series configured
  if (!preferredSeries || preferredSeries.length === 0) {
    console.error("No preferred anime series configured. Please add some in anime.json");
    return characters; // Return empty array if no preferred series
  }
  
  // Shuffle the preferred series to get variety
  const shuffledPreferredSeries = [...preferredSeries].sort(() => 0.5 - Math.random());
  
  // Keep trying until we have enough characters or we've tried all preferred anime
  let seriesIndex = 0;
  while (characters.length < count && seriesIndex < shuffledPreferredSeries.length) {
    try {
      const currentSeries = shuffledPreferredSeries[seriesIndex];
      seriesIndex++; // Move to next series for next iteration
      
      console.log(`Attempting to get character from: ${currentSeries}`);
      
      // Search for the anime
      const animeResults = await searchAnime(currentSeries, 5);
      
      // Filter for exact or close matches
      const matchingAnime = animeResults.filter(anime => 
        anime.title.toLowerCase().includes(currentSeries.toLowerCase()) ||
        (anime.title_english && anime.title_english.toLowerCase().includes(currentSeries.toLowerCase()))
      );
      
      if (matchingAnime.length === 0) {
        console.log(`No matching anime found for ${currentSeries}`);
        continue;
      }
      
      // Get a random anime from the matches
      const selectedAnime = matchingAnime[Math.floor(Math.random() * matchingAnime.length)];
      
      // Skip if we've already used this anime
      if (usedAnimeIds.has(selectedAnime.mal_id)) {
        console.log(`Already used anime: ${selectedAnime.title}, skipping`);
        continue;
      }
      
      usedAnimeIds.add(selectedAnime.mal_id);
      
      // Get characters from that anime
      const charactersData = await apiRequest(`/anime/${selectedAnime.mal_id}/characters`);
      
      if (!charactersData.data || charactersData.data.length === 0) {
        console.log(`No characters found for ${selectedAnime.title}`);
        continue;
      }
      
      // Filter to only include Main or Supporting characters
      const validCharacters = charactersData.data.filter(char => {
        return char.role === 'Main' || char.role === 'Supporting';
      }).sort(() => 0.5 - Math.random());
      
      if (validCharacters.length === 0) {
        console.log(`No valid characters found for ${selectedAnime.title}`);
        continue;
      }
      
      // Try to add one character from this anime if we haven't already reached our goal
      if (characters.length < count) {
        const randomIndex = Math.floor(Math.random() * Math.min(3, validCharacters.length));
        const char = validCharacters[randomIndex];
        
        // Skip if we already have this character
        if (usedCharacterIds.has(char.character.mal_id)) {
          continue;
        }
        
        // Get full character details
        const fullCharacter = await getCharacter(char.character.mal_id);
        
        if (fullCharacter.data) {
          // Verify this is an actual character by checking for required fields
          if (!isValidAnimeCharacter(fullCharacter.data)) {
            console.log(`Skipping invalid character data: ${fullCharacter.data.name}`);
            continue;
          }
          
          // Get available images
          const imageVariants = getCharacterImageVariants(fullCharacter.data);
          const selectedImage = imageVariants[Math.floor(Math.random() * imageVariants.length)];
          
          // Create character data
          const characterData: AnimeCharacter = {
            id: `jikan_${fullCharacter.data.mal_id}`,
            name: fullCharacter.data.name,
            alias: fullCharacter.data.nicknames && fullCharacter.data.nicknames.length > 0 
              ? fullCharacter.data.nicknames[0]
              : fullCharacter.data.name.split(' ')[0],
            image_url: selectedImage,
            anime: selectedAnime.title,
            anime_id: selectedAnime.mal_id
          };
          
          characters.push(characterData);
          usedCharacterIds.add(char.character.mal_id);
          console.log(`Added character: ${characterData.name} from ${characterData.anime}`);
        }
      }
    } catch (error) {
      console.error('Error getting characters:', error);
      // Wait a bit before trying again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // If we still don't have enough characters, cycle through the preferred list again
  // but allow reusing animes (different characters)
  if (characters.length < count) {
    console.log(`Still need ${count - characters.length} more characters, allowing anime reuse`);
    
    seriesIndex = 0;
    while (characters.length < count && seriesIndex < shuffledPreferredSeries.length) {
      try {
        const currentSeries = shuffledPreferredSeries[seriesIndex];
        seriesIndex++;
        
        // Search for the anime
        const animeResults = await searchAnime(currentSeries, 5);
        const matchingAnime = animeResults.filter(anime => 
          anime.title.toLowerCase().includes(currentSeries.toLowerCase()) ||
          (anime.title_english && anime.title_english.toLowerCase().includes(currentSeries.toLowerCase()))
        );
        
        if (matchingAnime.length === 0) continue;
        
        // Can reuse anime, just get different characters
        const selectedAnime = matchingAnime[Math.floor(Math.random() * matchingAnime.length)];
        
        // Get characters from that anime
        const charactersData = await apiRequest(`/anime/${selectedAnime.mal_id}/characters`);
        
        if (!charactersData.data || charactersData.data.length === 0) continue;
        
        // Filter valid characters that we haven't used yet
        const validCharacters = charactersData.data
          .filter(char => 
            (char.role === 'Main' || char.role === 'Supporting') && 
            !usedCharacterIds.has(char.character.mal_id)
          )
          .sort(() => 0.5 - Math.random());
        
        if (validCharacters.length === 0) continue;
        
        if (characters.length < count) {
          const randomIndex = Math.floor(Math.random() * validCharacters.length);
          const char = validCharacters[randomIndex];
          
          // Get full character details
          const fullCharacter = await getCharacter(char.character.mal_id);
          
          if (fullCharacter.data && isValidAnimeCharacter(fullCharacter.data)) {
            const imageVariants = getCharacterImageVariants(fullCharacter.data);
            const selectedImage = imageVariants[Math.floor(Math.random() * imageVariants.length)];
            
            const characterData: AnimeCharacter = {
              id: `jikan_${fullCharacter.data.mal_id}`,
              name: fullCharacter.data.name,
              alias: fullCharacter.data.nicknames && fullCharacter.data.nicknames.length > 0 
                ? fullCharacter.data.nicknames[0]
                : fullCharacter.data.name.split(' ')[0],
              image_url: selectedImage,
              anime: selectedAnime.title,
              anime_id: selectedAnime.mal_id
            };
            
            characters.push(characterData);
            usedCharacterIds.add(char.character.mal_id);
            console.log(`Added character: ${characterData.name} from ${characterData.anime}`);
          }
        }
      } catch (error) {
        console.error('Error getting characters in second pass:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  // Shuffle the final array to mix up the order
  return characters.sort(() => 0.5 - Math.random());
}

// Function to get different image variants for a character
function getCharacterImageVariants(characterData: any): string[] {
  const variants: string[] = [];
  
  // Add the default image
  if (characterData.images?.jpg?.image_url) {
    variants.push(characterData.images.jpg.image_url);
  }
  
  // Add large image if available
  if (characterData.images?.jpg?.large_image_url) {
    variants.push(characterData.images.jpg.large_image_url);
  }
  
  // Add webp version if available
  if (characterData.images?.webp?.image_url) {
    variants.push(characterData.images.webp.image_url);
  }
  
  // Add large webp version if available
  if (characterData.images?.webp?.large_image_url) {
    variants.push(characterData.images.webp.large_image_url);
  }
  
  // If we somehow have no images, return the default image or a placeholder
  if (variants.length === 0 && characterData.images?.jpg?.image_url) {
    return [characterData.images.jpg.image_url];
  } else if (variants.length === 0) {
    return ["https://via.placeholder.com/225x350?text=No+Image"];
  }
  
  return variants;
}

// Function to validate if data represents an actual anime character
function isValidAnimeCharacter(characterData: any): boolean {
  // Check for suspicious names that might indicate non-character entries
  const suspiciousNames = ['Editor', 'Director', 'Producer', 'Author', 'Writer', 'Staff', 'Animation', 
                          'Storyboard', 'Art', 'Sound', 'Music', 'Original Creator'];
  
  // Check if the name matches any suspicious terms
  if (suspiciousNames.some(term => 
      characterData.name.includes(term) || 
      (characterData.about && characterData.about.includes("staff")) ||
      (characterData.about && characterData.about.includes("production"))
    )) {
    return false;
  }
  
  // Check for meaningful character data
  if (!characterData.name || characterData.name.length === 0) {
    return false;
  }
  
  // Ensure there is at least one image
  if (!characterData.images || 
      (!characterData.images.jpg?.image_url && !characterData.images.webp?.image_url)) {
    return false;
  }
  
  return true;
}