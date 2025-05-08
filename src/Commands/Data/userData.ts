import fs from 'fs';
import path from 'path';
import { ShopItem } from './shopData';
import { AnimeCharacter } from './animeData';
// Update the import path to the correct location of animeDataUtils
import { loadAnimeData, saveAnimeData } from '../Data/animeDataUtils';

// Path to user data file
export const USER_DATA_PATH = path.join(__dirname, 'userdata.json');

// Default values
export const DEFAULT_BALANCE = 1000;

// User inventory item interface
export interface InventoryItem {
    id: string;          // Item ID from shopData
    quantity: number;    // How many of this item the user has
    acquired: number;    // Timestamp when first acquired
    metadata?: {         // Optional metadata for storing item-specific data like durability
        [key: string]: any;
    };
}

// Card collection interface - updated with print number system
export interface CardData {
    id: string;           // Card ID from animeData (jikan_[mal_id])
    uniqueId: string;     // Unique 8-digit ID for this specific card
    printNumber: number;  // Print number (lower numbers are rarer)
    acquired: number;     // Timestamp when acquired
    character: {          // Store character data directly to avoid lookups
        name: string;
        anime: string;
        image_url: string;
    };
}

// Generic user data interface that allows for any game stats
export interface UserData {
    [userId: string]: UserProfile;
}

export interface UserProfile {
    balance: number;
    inventory?: InventoryItem[];
    cards?: CardData[];      // Collection of anime character cards
    lastCardDrop?: number;   // Timestamp of last card drop
    [gameKey: string]: any;  // Allow any game to add its own stats
}

// Ensures the user data file exists
export function ensureUserDataFileExists(): void {
    const dataDir = path.dirname(USER_DATA_PATH);
    
    // Create Data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Create empty userdata.json if it doesn't exist
    if (!fs.existsSync(USER_DATA_PATH)) {
        fs.writeFileSync(USER_DATA_PATH, '{}', 'utf8');
    }
}

// Get all user data or create the file if it doesn't exist
export function getUserData(): UserData {
    ensureUserDataFileExists();
    try {
        const data = fs.readFileSync(USER_DATA_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading user data:', error);
        return {};
    }
}

// Save user data to file
export function saveUserData(userData: UserData): void {
    try {
        fs.writeFileSync(USER_DATA_PATH, JSON.stringify(userData, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving user data:', error);
    }
}

// Get a user's data or create a new entry if they don't exist
export function getUserProfile(userId: string): UserProfile {
    const userData = getUserData();
    if (!userData[userId]) {
        // Create a complete user profile with all required fields
        userData[userId] = {
            balance: DEFAULT_BALANCE,
            inventory: [],
            cards: [],
            lastCardDrop: 0,
            // Initialize fishing data structure
            fishing: {
                totalCaught: 0,
                commonCaught: 0,
                uncommonCaught: 0,
                rareCaught: 0,
                legendaryCaught: 0,
                junkCaught: 0,
                totalValue: 0,
                equippedRod: null,
                rods: {}
            },
            // Initialize other game structures as needed
            blackjack: {
                gamesPlayed: 0,
                gamesWon: 0,
                totalWinnings: 0
            }
        };
        saveUserData(userData);
    } else {
        // Add any missing fields for existing users
        if (!userData[userId].inventory) {
            userData[userId].inventory = [];
        }
        
        // Make sure cards collection exists
        if (!userData[userId].cards) {
            userData[userId].cards = [];
        }
        
        // Make sure fishing data exists
        if (!userData[userId].fishing) {
            userData[userId].fishing = {
                totalCaught: 0,
                commonCaught: 0,
                uncommonCaught: 0,
                rareCaught: 0,
                legendaryCaught: 0,
                junkCaught: 0,
                totalValue: 0,
                equippedRod: null,
                rods: {}
            };
        }
        
        // Make sure blackjack data exists
        if (!userData[userId].blackjack) {
            userData[userId].blackjack = {
                gamesPlayed: 0,
                gamesWon: 0,
                totalWinnings: 0
            };
        }
        
        saveUserData(userData);
    }
    return userData[userId];
}

// Initialize game stats for a user if they don't exist
export function initGameStats(userId: string, game: string, defaultStats: any): void {
    const userData = getUserData();
    if (!userData[userId]) {
        getUserProfile(userId);
    }
    
    if (!userData[userId][game]) {
        userData[userId][game] = defaultStats;
        saveUserData(userData);
    }
}

// Update user data with custom field changes
export function updateUserData(
    userId: string,
    updates: Record<string, any>
): UserProfile | null {
    const userData = getUserData();
    const user = userData[userId];
    
    if (!user) return null;
    
    // Apply all updates
    Object.entries(updates).forEach(([key, value]) => {
        // Handle nested updates
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            user[key] = user[key] || {};
            Object.entries(value).forEach(([subKey, subValue]) => {
                user[key][subKey] = subValue;
            });
        } else {
            user[key] = value;
        }
    });
    
    saveUserData(userData);
    return user;
}

// Inventory management functions

/**
 * Add an item to user's inventory
 * @param userId User ID
 * @param itemId Item ID from shop
 * @param quantity Quantity to add (default: 1)
 * @param timestamp Timestamp when first acquired (default: current time)
 * @returns Updated user profile or null if user not found
 */
export function addItemToInventory(
    userId: string,
    itemId: string,
    quantity: number = 1,
    timestamp: number = Date.now()
): UserProfile | null {
    const userData = getUserData();
    const user = userData[userId];
    
    if (!user) return null;
    
    // Initialize inventory if it doesn't exist
    if (!user.inventory) {
        user.inventory = [];
    }
    
    // Check if user already has this item
    const existingItem = user.inventory.find(item => item.id === itemId);
    
    if (existingItem) {
        // Increase quantity of existing item
        existingItem.quantity += quantity;
    } else {
        // Add new item to inventory
        user.inventory.push({
            id: itemId,
            quantity,
            acquired: timestamp
        });
    }
    
    saveUserData(userData);
    return user;
}

/**
 * Remove an item from user's inventory
 * @param userId User ID
 * @param itemId Item ID from shop
 * @param quantity Quantity to remove (default: 1)
 * @returns Updated user profile or null if user not found or doesn't have the item
 */
export function removeItemFromInventory(
    userId: string,
    itemId: string,
    quantity: number = 1
): UserProfile | null {
    const userData = getUserData();
    const user = userData[userId];
    
    if (!user || !user.inventory) return null;
    
    // Find the item in inventory
    const itemIndex = user.inventory.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) return null; // Item not found
    
    const item = user.inventory[itemIndex];
    
    if (item.quantity <= quantity) {
        // Remove item completely if quantity is <= requested removal amount
        user.inventory.splice(itemIndex, 1);
    } else {
        // Decrease quantity
        item.quantity -= quantity;
    }
    
    saveUserData(userData);
    return user;
}

/**
 * Check if user has the specified quantity of an item
 * @param userId User ID
 * @param itemId Item ID from shop
 * @param quantity Quantity to check for (default: 1)
 * @returns Boolean indicating if user has the item in specified quantity
 */
export function hasItem(userId: string, itemId: string, quantity: number = 1): boolean {
    const user = getUserProfile(userId);
    
    if (!user.inventory) return false;
    
    const item = user.inventory.find(item => item.id === itemId);
    
    return item !== undefined && item.quantity >= quantity;
}

/**
 * Get quantity of an item in user's inventory
 * @param userId User ID
 * @param itemId Item ID from shop
 * @returns Quantity of the item or 0 if not found
 */
export function getItemQuantity(userId: string, itemId: string): number {
    const user = getUserProfile(userId);
    
    if (!user.inventory) return 0;
    
    const item = user.inventory.find(item => item.id === itemId);
    
    return item ? item.quantity : 0;
}

/**
 * Update metadata for an item in the user's inventory
 * @param userId User ID
 * @param itemId Item ID from shop
 * @param metadata Object containing metadata to update
 * @returns Updated user profile or null if user not found or doesn't have the item
 */
export function updateItemMetadata(
    userId: string,
    itemId: string,
    metadata: Record<string, any>
): UserProfile | null {
    const userData = getUserData();
    const user = userData[userId];
    
    if (!user || !user.inventory) return null;
    
    // Find the item in inventory
    const inventoryItem = user.inventory.find(item => item.id === itemId);
    
    if (!inventoryItem) return null; // Item not found
    
    // Initialize metadata if it doesn't exist
    if (!inventoryItem.metadata) {
        inventoryItem.metadata = {};
    }
    
    // Update metadata with provided values
    Object.entries(metadata).forEach(([key, value]) => {
        inventoryItem.metadata![key] = value;
    });
    
    saveUserData(userData);
    return user;
}

// Card collection management functions

/**
 * Generate a unique 8-digit ID for a card
 * @returns A unique 8-digit string ID
 */
function generateUniqueCardId(): string {
    // Generate a random 8-digit number
    const randomNum = Math.floor(10000000 + Math.random() * 90000000);
    return randomNum.toString();
}

/**
 * Get the next print number for a character
 * @param characterId The character's Jikan ID
 * @returns The next print number
 */
function getNextPrintNumber(characterId: string): number {
    const animeData = loadAnimeData();
    
    // Initialize print counts if needed
    if (!animeData.print_counts) {
        animeData.print_counts = {};
    }
    
    // If this is the first print of this character, start at 1
    if (!animeData.print_counts[characterId]) {
        animeData.print_counts[characterId] = 1;
    } else {
        // Increment the print count
        animeData.print_counts[characterId]++;
    }
    
    // Save updated print counts
    saveAnimeData(animeData);
    
    return animeData.print_counts[characterId];
}

/**
 * Add a card to user's collection with a unique ID and print number
 * @param userId User ID
 * @param characterId Character ID from animeData (jikan_[mal_id])
 * @param characterData Character data to store with the card
 * @returns Updated user profile
 */
export function addCardToCollection(
    userId: string,
    characterId: string,
    characterData: {
        name: string;
        anime: string;
        image_url: string;
    }
): UserProfile {
    const userData = getUserData();
    const user = getUserProfile(userId);
    
    // Initialize cards collection if it doesn't exist
    if (!user.cards) {
        user.cards = [];
    }
    
    // Generate unique ID for this card
    const uniqueId = generateUniqueCardId();
    
    // Get the next print number for this character
    const printNumber = getNextPrintNumber(characterId);
    
    // Add new card to collection
    user.cards.push({
        id: characterId,
        uniqueId: uniqueId,
        printNumber: printNumber,
        acquired: Date.now(),
        character: characterData
    });
    
    // Save the updated user data
    userData[userId] = user;
    saveUserData(userData);
    
    return user;
}

/**
 * Get all cards in user's collection
 * @param userId User ID
 * @returns Array of card data
 */
export function getUserCards(userId: string): CardData[] {
    const user = getUserProfile(userId);
    return user.cards || [];
}

/**
 * Check if user has a specific card
 * @param userId User ID
 * @param characterId Character ID from animeData
 * @returns Boolean indicating if user has the card
 */
export function hasCard(userId: string, characterId: string): boolean {
    const user = getUserProfile(userId);
    
    if (!user.cards) return false;
    
    return user.cards.some(card => card.id === characterId);
}

/**
 * Update the timestamp of the last card drop for a user
 * @param userId User ID
 * @returns Updated user profile
 */
export function updateLastCardDrop(userId: string): UserProfile {
    const userData = getUserData();
    const user = getUserProfile(userId);
    
    user.lastCardDrop = Date.now();
    
    // Save the updated user data
    userData[userId] = user;
    saveUserData(userData);
    
    return user;
}

/**
 * Check if a user is eligible for a card drop
 * @param userId User ID
 * @param cooldownMinutes Cooldown period in minutes
 * @returns Boolean indicating if user is eligible for a drop
 */
export function canDropCards(userId: string, cooldownMinutes: number): boolean {
    const user = getUserProfile(userId);
    
    // If user has never had a drop, they're eligible
    if (!user.lastCardDrop) return true;
    
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const now = Date.now();
    
    return now - user.lastCardDrop >= cooldownMs;
}