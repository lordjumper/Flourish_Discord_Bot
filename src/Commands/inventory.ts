import { SlashCommandBuilder } from '@discordjs/builders';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, CommandInteraction, StringSelectMenuInteraction, ButtonInteraction, ComponentType, CommandInteractionOptionResolver, CacheType } from 'discord.js';
import { getUserProfile, getItemQuantity, removeItemFromInventory, updateUserData } from './Data/userData';
import { getItemById, getAllItems, ItemCategory } from './Data/shopData';
import * as fs from 'fs';
import * as path from 'path';

// Timeout for interactions in ms (3 minutes)
const INTERACTION_TIMEOUT = 180000;
// Maximum items to show per page
const ITEMS_PER_PAGE = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View and manage your inventory')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View items in your inventory')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Filter by category')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All Items', value: 'all' },
                            { name: 'Collectibles', value: ItemCategory.COLLECTIBLE },
                            { name: 'Consumables', value: ItemCategory.CONSUMABLE },
                            { name: 'Roles', value: ItemCategory.ROLE },
                            { name: 'Special', value: ItemCategory.SPECIAL }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('use')
                .setDescription('Use an item from your inventory')
                .addStringOption(option =>
                    option
                        .setName('item_id')
                        .setDescription('ID of the item to use')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    // Autocomplete handler for item selection from inventory
    async autocomplete(interaction) {
        const userId = interaction.user.id;
        const user = getUserProfile(userId);
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        if (!user.inventory || user.inventory.length === 0) {
            await interaction.respond([]);
            return;
        }
        
        // Get user's items
        const inventoryItems = user.inventory
            .filter(invItem => {
                const item = getItemById(invItem.id);
                // For 'use' command, only show usable items
                if (interaction.options.getSubcommand() === 'use' && item && !item.usable) {
                    return false;
                }
                return item && (item.name.toLowerCase().includes(focusedValue) || 
                              invItem.id.toLowerCase().includes(focusedValue));
            })
            .slice(0, 25); // Max 25 choices
        
        // Format for autocomplete
        const options = inventoryItems.map(invItem => {
            const item = getItemById(invItem.id);
            if (!item) return null;
            return {
                name: `${item.emoji} ${item.name} (x${invItem.quantity})`,
                value: invItem.id
            };
        }).filter(item => item !== null);
        
        await interaction.respond(options);
    },

    async execute(interaction: CommandInteraction) {
        const subcommand = (interaction.options as CommandInteractionOptionResolver).getSubcommand();
        
        if (subcommand === 'view') {
            await handleInventoryView(interaction);
        } else if (subcommand === 'use') {
                        await handleItemUse(interaction);
            
            async function handleItemUse(interaction: CommandInteraction) {
                // Define the logic for handling item use here
                await interaction.reply({ content: 'Item use functionality is not implemented yet.', ephemeral: true });
            }
        }
    }
};

// Create an embed for inventory view
function createInventoryEmbed(
    userId: string, 
    category: string | null = null, 
    page: number = 0
): { embed: EmbedBuilder, totalPages: number, items: any[] } {
    const user = getUserProfile(userId);
    const embed = new EmbedBuilder()
        .setTitle('🎒 Your Inventory')
        .setColor(0x9B59B6);
        
    // Check if inventory exists and has items
    if (!user.inventory || user.inventory.length === 0) {
        embed.setDescription('Your inventory is empty. Use `/shop browse` to buy items!');
        return { embed, totalPages: 0, items: [] };
    }
    
    // Filter inventory by category if specified
    let inventoryItems = user.inventory;
    
    if (category && category !== 'all') {
        inventoryItems = inventoryItems.filter(invItem => {
            const item = getItemById(invItem.id);
            return item && item.category === category;
        });
    }
    
    // If no items in category
    if (inventoryItems.length === 0) {
        embed.setDescription(`You don't have any items${category !== 'all' ? ` in the ${category} category` : ''}.`);
        return { embed, totalPages: 0, items: [] };
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(inventoryItems.length / ITEMS_PER_PAGE);
    const validPage = Math.max(0, Math.min(page, totalPages - 1)); // Ensure page is in bounds
    
    // Get items for current page
    const pageItems = inventoryItems.slice(
        validPage * ITEMS_PER_PAGE, 
        (validPage + 1) * ITEMS_PER_PAGE
    );
    
    // Format each item
    let description = `Showing **${pageItems.length}** of **${inventoryItems.length}** items.\n\n`;
    
    // Group items by category for better organization
    const categorizedItems = {};
    
    for (const invItem of pageItems) {
        // Special handling for fish items which may not be in shopData
        if (invItem.id.startsWith('fish_')) {
            // Add fish to their own category
            if (!categorizedItems['Fish']) {
                categorizedItems['Fish'] = [];
            }
            
            // Try to find fish data from fish.json
            try {
                // Attempt to get fish data from fish.json
                const fishDataPath = path.join(__dirname, 'Data', 'fish.json');
                const FISH_TYPES = JSON.parse(fs.readFileSync(fishDataPath, 'utf8'));
                
                // Search for this fish in all categories
                let fishData: { id: string; name: string; rarity?: string; weight?: string; value?: number; emoji?: string } | null = null;
                for (const type in FISH_TYPES) {
                    const fishList = FISH_TYPES[type];
                    for (const fish of fishList) {
                        if (fish.id === invItem.id) {
                            fishData = fish;
                            break;
                        }
                    }
                    if (fishData) break;
                }
                
                if (fishData) {
                    categorizedItems['Fish'].push({
                        ...(typeof fishData === 'object' && fishData !== null ? fishData : {}),
                        category: 'Fish',
                        usable: false,
                        tradeable: true,
                        quantity: invItem.quantity || 1
                    });
                    continue;
                } else {
                    // Fallback for fish not found in the data
                    categorizedItems['Fish'].push({
                        id: invItem.id,
                        name: invItem.id.split('_').slice(1).join(' ').replace(/\b\w/g, l => l.toUpperCase()),
                        emoji: '🐟',
                        description: 'A fish you caught',
                        category: 'Fish',
                        usable: false,
                        tradeable: true,
                        quantity: invItem.quantity || 1
                    });
                    continue;
                }
            } catch (error) {
                console.error('Error loading fish data:', error);
                // Fallback for error situations
                categorizedItems['Fish'].push({
                    id: invItem.id,
                    name: 'Unknown Fish',
                    emoji: '🐟',
                    description: 'A mysterious fish',
                    category: 'Fish',
                    usable: false,
                    tradeable: true,
                    quantity: invItem.quantity || 1
                });
                continue;
            }
        }
        
        const item = getItemById(invItem.id);
        if (!item) continue;
        
        if (!categorizedItems[item.category]) {
            categorizedItems[item.category] = [];
        }
        
        categorizedItems[item.category].push({
            ...item,
            quantity: invItem.quantity || 1
        });
    }
    
    // Add items to embed by category
    for (const [catName, items] of Object.entries(categorizedItems)) {
        let fieldValue = '';

        // Explicitly type 'items' as an array of any (or replace 'any' with your item type if available)
        for (const item of items as any[]) {
            const usableIcon = item.usable ? ' (🔘 Usable)' : '';
            const emoji = item.emoji || '🔹';
            fieldValue += `${emoji} **${item.name}** x${item.quantity}${usableIcon}\n`;
            const desc = item.description || 'A collectible item';
            fieldValue += `└ *${desc.substring(0, 40)}${desc.length > 40 ? '...' : ''}*\n\n`;
        }

        if (fieldValue) {
            embed.addFields({
                name: `${catName.charAt(0).toUpperCase() + catName.slice(1)}`, 
                value: fieldValue
            });
        }
    }
    
    // Add page info
    if (totalPages > 1) {
        embed.setFooter({ text: `Page ${validPage + 1}/${totalPages}` });
    }
    
    return { embed, totalPages, items: pageItems };
}

// Create an embed for item detail view
function createItemDetailEmbed(userId: string, itemId: string): EmbedBuilder | null {
    const user = getUserProfile(userId);
    const quantity = getItemQuantity(userId, itemId);
    
    if (quantity === 0) return null;
    
    // Special handling for fish items
    if (itemId.startsWith('fish_')) {
        try {
            const fishDataPath = path.join(__dirname, 'Data', 'fish.json');
            const FISH_TYPES = JSON.parse(fs.readFileSync(fishDataPath, 'utf8'));
            
            // Search for this fish in all categories
            let fishData: { id: string; name: string; rarity?: string; weight?: string; value?: number; emoji?: string } | null = null;
            for (const type in FISH_TYPES) {
                const fishList = FISH_TYPES[type];
                for (const fish of fishList) {
                    if (fish.id === itemId) {
                        fishData = fish;
                        break;
                    }
                }
                if (fishData) break;
            }
            
            // If fish found in the data
            if (fishData) {
                // Find the inventory item to get the acquired timestamp
                const inventoryItem = user.inventory?.find(item => item.id === itemId);
                if (!inventoryItem) return null;
                
                // Format the acquisition date
                const acquiredDate = new Date(inventoryItem.acquired);
                const formattedDate = `${acquiredDate.toLocaleDateString()} at ${acquiredDate.toLocaleTimeString()}`;
                
                const embed = new EmbedBuilder()
                    .setTitle(`${fishData.emoji || '🐟'} ${fishData.name} (x${quantity})`)
                    .setDescription(fishData && 'description' in fishData ? String(fishData.description) : 'A fish you caught')
                    .setColor(0x3498DB) // Blue color for fish
                    .addFields(
                        { name: 'Category', value: 'Fish', inline: true },
                        { name: 'Rarity', value: (fishData?.rarity ?? 'Unknown').charAt(0).toUpperCase() + (fishData?.rarity ?? 'Unknown').slice(1), inline: true },
                        { name: 'Weight', value: fishData.weight || 'Unknown', inline: true },
                        { name: 'Value', value: `${fishData.value || '0'} coins`, inline: true },
                        { name: 'Tradeable', value: 'Yes', inline: true },
                        { name: 'Acquired', value: formattedDate, inline: false }
                    );
                    
                return embed;
            }
        } catch (error) {
            console.error('Error creating fish detail embed:', error);
        }
        
        // Fallback for fish not found in data
        const inventoryItem = user.inventory?.find(item => item.id === itemId);
        if (!inventoryItem) return null;
        
        // Format the acquisition date
        const acquiredDate = new Date(inventoryItem.acquired);
        const formattedDate = `${acquiredDate.toLocaleDateString()} at ${acquiredDate.toLocaleTimeString()}`;
        
        // Create a basic embed with derived fish info
        const fishName = itemId.split('_').slice(1).join(' ').replace(/\b\w/g, l => l.toUpperCase());
        return new EmbedBuilder()
            .setTitle(`🐟 ${fishName} (x${quantity})`)
            .setDescription('A fish you caught')
            .setColor(0x3498DB)
            .addFields(
                { name: 'Category', value: 'Fish', inline: true },
                { name: 'Tradeable', value: 'Yes', inline: true },
                { name: 'Acquired', value: formattedDate, inline: false }
            );
    }
    
    // Regular item handling
    const item = getItemById(itemId);
    if (!item) return null;
    
    // Find the inventory item to get the acquired timestamp
    const inventoryItem = user.inventory?.find(item => item.id === itemId);
    if (!inventoryItem) return null;
    
    // Format the acquisition date
    const acquiredDate = new Date(inventoryItem.acquired);
    const formattedDate = `${acquiredDate.toLocaleDateString()} at ${acquiredDate.toLocaleTimeString()}`;
    
    const embed = new EmbedBuilder()
        .setTitle(`${item.emoji} ${item.name} (x${quantity})`)
        .setDescription(item.description)
        .setColor(0x9B59B6)
        .addFields(
            { name: 'Category', value: item.category, inline: true },
            { name: 'Usable', value: item.usable ? 'Yes' : 'No', inline: true },
            { name: 'Tradeable', value: item.tradeable ? 'Yes' : 'No', inline: true },
            { name: 'Acquired', value: formattedDate, inline: false }
        );
        
    return embed;
}

// Handle inventory viewing
async function handleInventoryView(interaction: CommandInteraction) {
    const userId = interaction.user.id;
    const category = (interaction.options as CommandInteractionOptionResolver).getString('category') || 'all';
    
    // Initial page
    let currentPage = 0;
    
    // Create initial embed
    const { embed, totalPages, items } = createInventoryEmbed(userId, category, currentPage);
    
    // If no items, just return the embed
    if (totalPages === 0) {
        return interaction.reply({
            embeds: [embed]
        });
    }
    
    // Create pagination buttons if needed
    const components: ActionRowBuilder<any>[] = [];
    
    if (totalPages > 1) {
        components.push(
            new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_page')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage >= totalPages - 1)
                )
        );
    }
    
    // Create item selection menu
    if (items.length > 0) {
        const selectOptions = items.map(invItem => {
            // Special handling for fish items
            if (invItem.id.startsWith('fish_')) {
                // Try to get fish data from fish.json
                try {
                    const fishDataPath = path.join(__dirname, 'Data', 'fish.json');
                    const FISH_TYPES = JSON.parse(fs.readFileSync(fishDataPath, 'utf8'));
                    
                    // Search for this fish in all categories
                    let fishData: { id: string; name: string; rarity?: string; weight?: string; value?: number; emoji?: string; description?: string } | null = null;
                    for (const type in FISH_TYPES) {
                        const fishList = FISH_TYPES[type];
                        for (const fish of fishList) {
                            if (fish.id === invItem.id) {
                                fishData = fish;
                                break;
                            }
                        }
                        if (fishData) break;
                    }
                    
                    if (fishData) {
                        return new StringSelectMenuOptionBuilder()
                            .setLabel(`${fishData.name} (x${invItem.quantity})`)
                            .setValue(invItem.id)
                            .setDescription(fishData?.description?.substring(0, 100) || 'No description available')
                            .setEmoji(fishData.emoji || '🐟')
                            .setDefault(false);
                    }
                } catch (error) {
                    console.error('Error loading fish data for dropdown:', error);
                    // Fallback for errors
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(`Fish Item (x${invItem.quantity})`)
                        .setValue(invItem.id)
                        .setDescription('A fish you caught')
                        .setEmoji('🐟')
                        .setDefault(false);
                }
            }
            
            // Regular item handling
            const item = getItemById(invItem.id);
            if (!item) return null;
            
            return new StringSelectMenuOptionBuilder()
                .setLabel(`${item.name} (x${invItem.quantity})`)
                .setValue(invItem.id)
                .setDescription(item.description.substring(0, 100))
                .setEmoji(item.emoji)
                .setDefault(false);
        }).filter((option): option is StringSelectMenuOptionBuilder => option !== null);
        
        if (selectOptions.length > 0) {
            components.push(
                new ActionRowBuilder<StringSelectMenuBuilder>()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('select_item')
                            .setPlaceholder('Select an item to view details')
                            .addOptions(selectOptions)
                    )
            );
        }
    }
    
    // Send embed with components
    const response = await interaction.reply({
        embeds: [embed],
        components
    });
    
    // Create collector for button interactions
    const collector = response.createMessageComponentCollector({ 
        time: INTERACTION_TIMEOUT 
    });
    
    collector.on('collect', async i => {
        if (i.user.id !== userId) {
            return i.reply({ content: 'This menu is not for you.', flags: 64 });
        }
        
        // Handle pagination
        if (i.customId === 'prev_page') {
            currentPage = Math.max(0, currentPage - 1);
            const { embed: newEmbed, totalPages: newTotalPages } = createInventoryEmbed(userId, category, currentPage);
            
            // Update buttons
            const updatedComponents = [...components];
            updatedComponents[0] = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_page')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage >= newTotalPages - 1)
                );
                
            await i.update({ embeds: [newEmbed], components: updatedComponents });
        } 
        else if (i.customId === 'next_page') {
            currentPage = currentPage + 1;
            const { embed: newEmbed, totalPages: newTotalPages } = createInventoryEmbed(userId, category, currentPage);
            
            // Update buttons
            const updatedComponents = [...components];
            updatedComponents[0] = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_page')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage >= newTotalPages - 1)
                );
                
            await i.update({ embeds: [newEmbed], components: updatedComponents });
        }
        else if (i.customId === 'select_item') {
            // Item details view
            if (i.isStringSelectMenu()) {
                const selectedItemId = i.values[0];
                const detailEmbed = createItemDetailEmbed(userId, selectedItemId);
                
                if (!detailEmbed) {
                    await i.reply({ content: 'Item not found or no longer in your inventory.', flags: 64 });
                    return;
                }
                
                // Create back button and possible use/trade buttons
                const item = getItemById(selectedItemId);
                const actionRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('back_to_inventory')
                            .setLabel('Back to Inventory')
                            .setStyle(ButtonStyle.Secondary)
                    );
                    
                // Add use button if item is usable
                if (item?.usable) {
                    actionRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`use_item_${selectedItemId}`)
                            .setLabel('Use Item')
                            .setStyle(ButtonStyle.Primary)
                    );
                }
                
                await i.update({ embeds: [detailEmbed], components: [actionRow] });
            }
        }
        else if (i.customId === 'back_to_inventory') {
            // Go back to inventory view
            const { embed: newEmbed } = createInventoryEmbed(userId, category, currentPage);
            await i.update({ embeds: [newEmbed], components });
        }
        else if (i.customId.startsWith('use_item_')) {
            const itemId = i.customId.replace('use_item_', '');
            if (i.isButton()) {
                await handleItemUseFromButton(i, userId, itemId);
            }
        }
    });
    
    // Handle when collector ends
    collector.on('end', () => {
        // Optional: Update message to show timeout
        interaction.editReply({
            components: []
        }).catch(console.error);
    });
}

// Handle using an item from button
async function handleItemUseFromButton(
    interaction: ButtonInteraction, 
    userId: string, 
    itemId: string
) {
    const item = getItemById(itemId);
    
    if (!item) {
        await interaction.reply({ content: 'Item not found.', flags: 64 });
        return;
    }
    
    if (!item.usable) {
        await interaction.reply({ content: 'This item cannot be used.', flags: 64 });
        return;
    }
    
    // Check if user has the item
    if (!hasItem(userId, itemId)) {
        await interaction.reply({ content: 'You no longer have this item.', flags: 64 });
        return;
    }
    
    // Handle item use effects
    let resultEmbed: EmbedBuilder;
    let keepItem = false; // Flag to determine if we should remove the item from inventory
    
    // Check if this is a fishing rod (all fishing rod IDs start with "fishing_rod_")
    if (itemId.startsWith('fishing_rod_')) {
        try {
            // Import the equipRod function from fishing.ts
            const fishingModule = require('./fishing');
            
            // Try to equip the rod using the correct ID
            const result = fishingModule.equipRod(userId, itemId);
            
            // Check if the result indicates the same rod is already equipped
            if (result && typeof result === 'object' && result.alreadyEquipped) {
                resultEmbed = new EmbedBuilder()
                    .setTitle(`${item.emoji} Already Equipped`)
                    .setDescription(`You already have a **${result.rodName}** equipped! You need to equip a different type of rod instead.`)
                    .setColor(0xE74C3C);
                
                // Don't remove the item from inventory since we didn't equip it
                keepItem = true;
            }
            else if (result) {
                resultEmbed = new EmbedBuilder()
                    .setTitle(`${item.emoji} Rod Equipped`)
                    .setDescription(`You equipped the **${item.name}**! You can now use \`/fishing start\` to go fishing.`)
                    .setColor(0x3498DB)
                    .addFields(
                        { name: 'Durability', value: `${item.effects?.durability || '10'} uses`, inline: true },
                        { name: 'Next Step', value: 'Use `/fishing start` to begin fishing!', inline: true }
                    )
                    .setFooter({ text: 'Your rod has been moved to your fishing equipment slot.' });
                
                // Don't remove the item as equipRod already handles this
                keepItem = true;
            } else {
                resultEmbed = new EmbedBuilder()
                    .setTitle(`${item.emoji} Error`)
                    .setDescription(`Failed to equip the **${item.name}**. Please try again.`)
                    .setColor(0xE74C3C);
            }
        } catch (error) {
            console.error('Error equipping fishing rod:', error);
            
            resultEmbed = new EmbedBuilder()
                .setTitle(`${item.emoji} Error`)
                .setDescription(`Something went wrong when equipping the **${item.name}**. Please try again later.`)
                .setColor(0xE74C3C);
        }
    }
    else switch (item.id) {
        case 'common_lootbox':
        case 'rare_lootbox':
            // Define a placeholder function for handleLootboxUse
            async function handleLootboxUse(userId: string, item: any): Promise<EmbedBuilder> {
                return new EmbedBuilder()
                    .setTitle(`${item.emoji} Lootbox Opened`)
                    .setDescription(`You opened a **${item.name}** and received some rewards!`)
                    .setColor(0xFFD700);
            }
            
                        resultEmbed = await handleLootboxUse(userId, item);
            break;
        default:
            resultEmbed = new EmbedBuilder()
                .setTitle(`${item.emoji} Item Used`)
                .setDescription(`You used **${item.name}**. Nothing special happened.`)
                .setColor(0x9B59B6);
    }
    
    // Remove the item from inventory unless we should keep it (like for fishing rods)
    if (!keepItem) {
        removeItemFromInventory(userId, itemId);
    }
    
    // Show result
    await interaction.reply({ embeds: [resultEmbed] });
}

// Check if user has item (imported from userData)
function hasItem(userId: string, itemId: string, quantity: number = 1): boolean {
    const user = getUserProfile(userId);
    
    if (!user.inventory) return false;
    
    const item = user.inventory.find(item => item.id === itemId);
    
    return item !== undefined && item.quantity >= quantity;
}