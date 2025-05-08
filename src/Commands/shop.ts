import { SlashCommandBuilder } from '@discordjs/builders';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, CommandInteraction, StringSelectMenuInteraction, ButtonInteraction, ComponentType, CommandInteractionOptionResolver, CacheType, MessageFlags } from 'discord.js';
import { getUserProfile, updateUserData, addItemToInventory } from './Data/userData';
import { getAllItems, getItemById, getItemsByCategory, ItemCategory } from './Data/shopData';

// Timeout for interactions in ms (3 minutes)
const INTERACTION_TIMEOUT = 180000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Shop for items using your coins')
        .addSubcommand(subcommand =>
            subcommand
                .setName('browse')
                .setDescription('Browse available items in the shop')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Filter by category')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All Items', value: 'all' },
                            { name: 'Tools', value: ItemCategory.TOOL },
                            { name: 'Special', value: ItemCategory.SPECIAL }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Purchase an item from the shop')
                .addStringOption(option =>
                    option
                        .setName('item_id')
                        .setDescription('ID of the item to purchase')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('quantity')
                        .setDescription('How many to purchase (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                )
        ),

    // Autocomplete handler for item selection
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const allItems = getAllItems();
        
        // Filter items based on input
        const filtered = allItems.filter(item => 
            item.name.toLowerCase().includes(focusedValue) || 
            item.id.toLowerCase().includes(focusedValue)
        ).slice(0, 25); // Max 25 choices
        
        // Format for autocomplete
        const options = filtered.map(item => ({
            name: `${item.emoji} ${item.name} (${item.price} coins)`,
            value: item.id
        }));
        
        await interaction.respond(options);
    },

    async execute(interaction: CommandInteraction) {
        const subcommand = (interaction.options as CommandInteractionOptionResolver).getSubcommand();
        
        if (subcommand === 'browse') {
            await handleShopBrowse(interaction);
        } else if (subcommand === 'buy') {
            await handleShopBuy(interaction);
        }
    }
};

// Create an embed for a specific shop item
function createItemEmbed(item: any, userBalance: number): EmbedBuilder {
    const canAfford = userBalance >= item.price;
    
    return new EmbedBuilder()
        .setTitle(`${item.emoji} ${item.name}`)
        .setDescription(item.description)
        .setColor(canAfford ? 0x2ECC71 : 0xE74C3C) // Green if can afford, red if cannot
        .addFields(
            { name: 'Price', value: `${item.price} coins`, inline: true },
            { name: 'Category', value: `${item.category}`, inline: true },
            { name: 'Status', value: canAfford ? '✅ Affordable' : '❌ Not enough coins', inline: true }
        )
        .setFooter({ text: `Item ID: ${item.id}` });
}

// Create an embed for shop categories
function createShopEmbed(category: string | null, userBalance: number): EmbedBuilder {
    // Determine which items to show based on category
    let items: any[];
    let title = '🛍️ Shop';

    if (category && category !== 'all') {
        items = getItemsByCategory(category);
        title = `🛍️ Shop - ${category.charAt(0).toUpperCase() + category.slice(1)}s`;
    } else {
        items = getAllItems();
    }

    // Create embed
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`You have **${userBalance} coins** to spend.`)
        .setColor(0x3498DB);

    // Group items by category for better organization
    const categories = [...new Set(items.map(item => item.category))];

    for (const cat of categories) {
        const categoryItems = items.filter(item => item.category === cat);
        let fieldValue = '';
        
        for (const item of categoryItems) {
            const canAfford = userBalance >= item.price;
            const affordIcon = canAfford ? '✅' : '❌';
            fieldValue += `${item.emoji} **${item.name}** - ${item.price} coins ${affordIcon}\n`;
        }
        
        if (fieldValue) {
            embed.addFields({
                name: `${cat.charAt(0).toUpperCase() + cat.slice(1)}s`, 
                value: fieldValue
            });
        }
    }

    return embed;
}

// Handle browsing the shop
async function handleShopBrowse(interaction: CommandInteraction) {
    const userId = interaction.user.id;
    const user = getUserProfile(userId);
    const category = (interaction.options as CommandInteractionOptionResolver).getString('category') || 'all';

    // Create shop embed
    const embed = createShopEmbed(category, user.balance);

    // Create item selection menu
    const items = category === 'all' ? getAllItems() : getItemsByCategory(category as ItemCategory);
    
    // Skip creating components if no items available
    if (items.length === 0) {
        return interaction.reply({
            embeds: [embed.setDescription('No items available in this category.')],
            flags: 64
        });
    }

    const selectOptions = items.map(item => {
        const canAfford = user.balance >= item.price;
        
        return new StringSelectMenuOptionBuilder()
            .setLabel(`${item.name} - ${item.price} coins`)
            .setValue(item.id)
            .setDescription(item.description.substring(0, 100))
            .setEmoji(item.emoji)
            .setDefault(false);
    });

    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('shop_select_item')
                .setPlaceholder('Select an item to view details')
                .addOptions(selectOptions)
        );

    // Send embed with selection menu
    const response = await interaction.reply({
        embeds: [embed],
        components: [row]
    });

    // Create collector for menu interactions
    const collector = response.createMessageComponentCollector({ 
        componentType: ComponentType.StringSelect,
        time: INTERACTION_TIMEOUT
    });

    collector.on('collect', async (i: StringSelectMenuInteraction) => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'This menu is not for you.', flags: 64 });
        }

        const selectedItemId = i.values[0];
        const selectedItem = getItemById(selectedItemId);

        if (!selectedItem) {
            return i.reply({ content: 'Item not found.', flags: 64 });
        }

        // Get fresh user data
        const user = getUserProfile(userId);
        
        // Create item embed
        const itemEmbed = createItemEmbed(selectedItem, user.balance);

        // Create buy button
        const buyRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`buy_item_${selectedItemId}`)
                    .setLabel(`Buy for ${selectedItem.price} coins`)
                    .setStyle(user.balance >= selectedItem.price ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(user.balance < selectedItem.price),
                new ButtonBuilder()
                    .setCustomId('back_to_shop')
                    .setLabel('Back to shop')
                    .setStyle(ButtonStyle.Secondary)
            );

        await i.update({ embeds: [itemEmbed], components: [buyRow] });
    });

    // Create collector for button interactions
    const buttonCollector = response.createMessageComponentCollector({ 
        componentType: ComponentType.Button,
        time: INTERACTION_TIMEOUT
    });

    buttonCollector.on('collect', async (i: ButtonInteraction) => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'This button is not for you.', flags: 64 });
        }

        const customId = i.customId;

        if (customId === 'back_to_shop') {
            // Go back to shop view
            await i.update({ embeds: [embed], components: [row] });
        } else if (customId.startsWith('buy_item_')) {
            const itemId = customId.replace('buy_item_', '');
            const item = getItemById(itemId);

            if (!item) {
                return i.reply({ content: 'Item not found.', flags: 64 });
            }

            // Get fresh user data
            const user = getUserProfile(userId);

            // Check if user can afford the item
            if (user.balance < item.price) {
                return i.reply({
                    content: `You don't have enough coins to buy ${item.emoji} ${item.name}. You need ${item.price - user.balance} more coins.`,
                    flags: 64
                });
            }

            // Process purchase
            const newBalance = user.balance - item.price;
            updateUserData(userId, { balance: newBalance });
            addItemToInventory(userId, item.id);

            // Update embeds
            const purchaseEmbed = new EmbedBuilder()
                .setTitle(`${item.emoji} Purchase Successful!`)
                .setDescription(`You purchased **${item.name}** for **${item.price} coins**.\nYour new balance: **${newBalance} coins**`)
                .setColor(0x2ECC71);

            await i.update({ embeds: [purchaseEmbed], components: [] });
        }
    });

    // Handle when collector ends
    collector.on('end', collected => {
        if (collected.size === 0) {
            // If no interactions, update message to show timeout
            interaction.editReply({
                embeds: [embed.setFooter({ text: 'Shop menu has timed out. Use /shop browse again.' })],
                components: []
            }).catch(console.error);
        }
    });
}

// Handle buying an item
async function handleShopBuy(interaction: CommandInteraction) {
    const userId = interaction.user.id;
    const itemId = (interaction.options as CommandInteractionOptionResolver).getString('item_id', true);
    const quantity = (interaction.options as CommandInteractionOptionResolver).getInteger('quantity') || 1;
    
    // Find the item
    const item = getItemById(itemId);
    
    if (!item) {
        return interaction.reply({
            content: `Item with ID "${itemId}" not found in the shop.`,
            flags: 64
        });
    }
    
    // Get user data
    const user = getUserProfile(userId);
    
    // Calculate total price
    const totalPrice = item.price * quantity;
    
    // Check if user can afford it
    if (user.balance < totalPrice) {
        return interaction.reply({
            content: `You don't have enough coins to buy ${quantity}x ${item.emoji} ${item.name}. You need ${totalPrice - user.balance} more coins.`,
            flags: 64
        });
    }
    
    // Process purchase
    const newBalance = user.balance - totalPrice;
    updateUserData(userId, { balance: newBalance });
    addItemToInventory(userId, item.id, quantity);
    
    // Confirm purchase
    const embed = new EmbedBuilder()
        .setTitle(`${item.emoji} Purchase Successful!`)
        .setDescription(`You purchased **${quantity}x ${item.name}** for **${totalPrice} coins**.\nYour new balance: **${newBalance} coins**`)
        .setColor(0x2ECC71);
    
    return interaction.reply({
        embeds: [embed],
        flags: 64
    });
}