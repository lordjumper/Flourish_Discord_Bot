import fs from 'fs';
import path from 'path';

// Shop system data structure
export interface ShopItem {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    emoji: string;
    effects?: {
        [key: string]: any
    };
    usable?: boolean;
    tradeable?: boolean;
}

// Category enum - now supports "tool" for fishing rod
export enum ItemCategory {
    COLLECTIBLE = "collectible",
    CONSUMABLE = "consumable",
    ROLE = "role",
    SPECIAL = "special",
    TOOL = "tool"
}

// Path to shop items file
const SHOP_ITEMS_PATH = path.join(__dirname, 'shopItems.json');

// Load shop items from JSON file
function loadShopItems(): ShopItem[] {
    try {
        const data = fs.readFileSync(SHOP_ITEMS_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading shop items:', error);
        return [];
    }
}

// Save shop items to JSON file (useful for admin commands to add/edit items)
export function saveShopItems(items: ShopItem[]): boolean {
    try {
        fs.writeFileSync(SHOP_ITEMS_PATH, JSON.stringify(items, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving shop items:', error);
        return false;
    }
}

// Get the shop items (always reload from file to get latest data)
export function getAllItems(): ShopItem[] {
    return loadShopItems();
}

// Function to get an item by its ID
export function getItemById(id: string): ShopItem | undefined {
    return getAllItems().find(item => item.id === id);
}

// Functions to get items by category
export function getItemsByCategory(category: string): ShopItem[] {
    return getAllItems().filter(item => item.category === category);
}