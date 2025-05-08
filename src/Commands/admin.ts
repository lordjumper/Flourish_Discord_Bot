import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, PermissionFlagsBits, EmbedBuilder, CommandInteractionOptionResolver } from 'discord.js';
import { getUserProfile, updateUserData, addItemToInventory, removeItemFromInventory, getUserData, saveUserData } from './Data/userData';
import { getItemById } from './Data/shopData';

module.exports = {
    // Define the admin command with various subcommands
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Administrative commands for bot management')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Require administrator permission
        // Balance management
        .addSubcommandGroup(group =>
            group
                .setName('balance')
                .setDescription('Manage user balance')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add coins to a user\'s balance')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('The user to add coins to')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName('amount')
                                .setDescription('Amount of coins to add')
                                .setRequired(true)
                                .setMinValue(1)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('set')
                        .setDescription('Set a user\'s balance to a specific amount')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('The user to set coins for')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName('amount')
                                .setDescription('New balance amount')
                                .setRequired(true)
                                .setMinValue(0)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove coins from a user\'s balance')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('The user to remove coins from')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName('amount')
                                .setDescription('Amount of coins to remove')
                                .setRequired(true)
                                .setMinValue(1)
                        )
                )
        )
        // Inventory management
        .addSubcommandGroup(group =>
            group
                .setName('inventory')
                .setDescription('Manage user inventory')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('give')
                        .setDescription('Give an item to a user')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('The user to give the item to')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName('item_id')
                                .setDescription('ID of the item to give')
                                .setRequired(true)
                                .setAutocomplete(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName('quantity')
                                .setDescription('Quantity to give (default: 1)')
                                .setMinValue(1)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove an item from a user\'s inventory')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('The user to remove the item from')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName('item_id')
                                .setDescription('ID of the item to remove')
                                .setRequired(true)
                                .setAutocomplete(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName('quantity')
                                .setDescription('Quantity to remove (default: all)')
                                .setMinValue(1)
                        )
                )
        )
        // User data management
        .addSubcommandGroup(group =>
            group
                .setName('user')
                .setDescription('Manage user data')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('reset')
                        .setDescription('Reset a user\'s data')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('The user to reset')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName('type')
                                .setDescription('What to reset')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Everything', value: 'everything' },
                                    { name: 'Balance', value: 'balance' },
                                    { name: 'Inventory', value: 'inventory' },
                                    { name: 'Fishing Stats', value: 'fishing' },
                                    { name: 'Blackjack Stats', value: 'blackjack' }
                                )
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('view')
                        .setDescription('View detailed user data')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('The user to view')
                                .setRequired(true)
                        )
                )
        ),

    // Autocomplete handler for item selection
    async autocomplete(interaction) {
        if (!interaction.isAutocomplete()) return;
        
        const focusedValue = interaction.options.getFocused();
        let items: { id: string; name: string }[] = [];
        
        try {
            // Require a module containing all items
            const { getAllItems } = require('./Data/shopData');
            items = getAllItems();
            
            // Filter items based on user input
            const filtered = items.filter(item => 
                item.id.toLowerCase().includes(focusedValue.toLowerCase()) || 
                item.name.toLowerCase().includes(focusedValue.toLowerCase())
            );
            
            // Return top 25 matches (Discord limit)
            await interaction.respond(
                filtered.slice(0, 25).map(item => ({
                    name: `${item.name} (${item.id})`,
                    value: item.id,
                }))
            );
        } catch (error) {
            console.error('Error in autocomplete:', error);
            await interaction.respond([]);
        }
    },

    // Execute the command
    async execute(interaction: CommandInteraction) {
        if (!interaction.isCommand()) return;
        
        // Only administrators can use this command
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: 'You do not have permission to use this command.', 
                ephemeral: true 
            });
        }
        
        const subcommandGroup = (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup();
        const subcommand = (interaction.options as CommandInteractionOptionResolver).getSubcommand();
        
        // Handle balance management commands
        if (subcommandGroup === 'balance') {
            const user = (interaction.options as CommandInteractionOptionResolver).getUser('user');
            const amount = (interaction.options as CommandInteractionOptionResolver).getInteger('amount') || 0;
            
            if (!user) {
                return interaction.reply({ content: 'User not found.', ephemeral: true });
            }
            
            const userProfile = getUserProfile(user.id);
            
            if (subcommand === 'add') {
                // Add coins to balance
                const newBalance = userProfile.balance + amount;
                updateUserData(user.id, { balance: newBalance });
                
                return interaction.reply({ 
                    content: `Added ${amount} coins to ${user.username}'s balance. New balance: ${newBalance} coins.`,
                    ephemeral: true 
                });
            } else if (subcommand === 'set') {
                // Set balance to specific amount
                updateUserData(user.id, { balance: amount });
                
                return interaction.reply({ 
                    content: `Set ${user.username}'s balance to ${amount} coins.`,
                    ephemeral: true 
                });
            } else if (subcommand === 'remove') {
                // Remove coins from balance
                const newBalance = Math.max(0, userProfile.balance - amount);
                updateUserData(user.id, { balance: newBalance });
                
                return interaction.reply({ 
                    content: `Removed ${amount} coins from ${user.username}'s balance. New balance: ${newBalance} coins.`,
                    ephemeral: true 
                });
            }
        }
        
        // Handle inventory management commands
        else if (subcommandGroup === 'inventory') {
            const user = (interaction.options as CommandInteractionOptionResolver).getUser('user');
            const itemId = (interaction.options as CommandInteractionOptionResolver).getString('item_id');
            const quantity = (interaction.options as CommandInteractionOptionResolver).getInteger('quantity') || 1;
            
            if (!user) {
                return interaction.reply({ content: 'User not found.', ephemeral: true });
            }
            
            if (!itemId) {
                return interaction.reply({ content: 'Item ID is required.', ephemeral: true });
            }
            
            // Validate the item exists
            const item = getItemById(itemId);
            if (!item) {
                return interaction.reply({ content: `Item with ID "${itemId}" not found.`, ephemeral: true });
            }
            
            if (subcommand === 'give') {
                // Add item to user's inventory
                addItemToInventory(user.id, itemId, quantity);
                
                return interaction.reply({ 
                    content: `Added ${quantity}x ${item.name} to ${user.username}'s inventory.`,
                    ephemeral: true 
                });
            } else if (subcommand === 'remove') {
                // Get current quantity the user has
                const userProfile = getUserProfile(user.id);
                const userItem = userProfile.inventory?.find(i => i.id === itemId);
                
                if (!userItem) {
                    return interaction.reply({ 
                        content: `${user.username} doesn't have any ${item.name} in their inventory.`,
                        ephemeral: true 
                    });
                }
                
                // If quantity not specified, remove all
                const removeQuantity = quantity || userItem.quantity;
                
                // Remove item from user's inventory
                removeItemFromInventory(user.id, itemId, removeQuantity);
                
                return interaction.reply({ 
                    content: `Removed ${removeQuantity}x ${item.name} from ${user.username}'s inventory.`,
                    ephemeral: true 
                });
            }
        }
        
        // Handle user data management commands
        else if (subcommandGroup === 'user') {
            const user = (interaction.options as CommandInteractionOptionResolver).getUser('user');
            
            if (!user) {
                return interaction.reply({ content: 'User not found.', ephemeral: true });
            }
            
            if (subcommand === 'reset') {
                const resetType = (interaction.options as CommandInteractionOptionResolver).getString('type', true);
                
                if (resetType === 'everything') {
                    // Reset entire user profile
                    const userData = getUserData();
                    delete userData[user.id];
                    saveUserData(userData);
                    
                    return interaction.reply({ 
                        content: `Reset all data for ${user.username}. A new profile will be created when they next use the bot.`,
                        ephemeral: true 
                    });
                } else {
                    // Reset specific data section
                    if (resetType === 'balance') {
                        // Reset balance to default
                        updateUserData(user.id, { balance: 1000 });
                    } else if (resetType === 'inventory') {
                        // Reset inventory to empty
                        updateUserData(user.id, { inventory: [] });
                    } else {
                        // Reset specific game stats (fishing, blackjack, etc.)
                        updateUserData(user.id, { [resetType]: null });
                        
                        // Re-initialize with default values
                        const userProfile = getUserProfile(user.id);
                        return interaction.reply({ 
                            content: `Reset ${resetType} data for ${user.username}.`,
                            ephemeral: true 
                        });
                    }
                    
                    return interaction.reply({ 
                        content: `Reset ${resetType} data for ${user.username}.`,
                        ephemeral: true 
                    });
                }
            } else if (subcommand === 'view') {
                // Get detailed user data
                const userProfile = getUserProfile(user.id);
                
                // Create an embed with the user data
                const embed = new EmbedBuilder()
                    .setTitle(`User Data: ${user.username}`)
                    .setDescription(`User ID: ${user.id}`)
                    .addFields(
                        { name: 'Balance', value: `${userProfile.balance} coins`, inline: true },
                        { name: 'Inventory Items', value: `${userProfile.inventory?.length || 0}`, inline: true }
                    )
                    .setColor('#00AAFF')
                    .setTimestamp();
                
                // Add fishing stats if they exist
                if (userProfile.fishing) {
                    embed.addFields({
                        name: 'Fishing Stats', 
                        value: `Total Caught: ${userProfile.fishing.totalCaught}\n` +
                               `Rarity Breakdown: ${userProfile.fishing.commonCaught} Common, ${userProfile.fishing.uncommonCaught} Uncommon, ${userProfile.fishing.rareCaught} Rare, ${userProfile.fishing.legendaryCaught} Legendary\n` +
                               `Total Value: ${userProfile.fishing.totalValue} coins`,
                        inline: false
                    });
                }
                
                // Add blackjack stats if they exist
                if (userProfile.blackjack) {
                    embed.addFields({
                        name: 'Blackjack Stats',
                        value: `Games Played: ${userProfile.blackjack.gamesPlayed}\n` +
                               `Games Won: ${userProfile.blackjack.gamesWon}\n` +
                               `Win Rate: ${userProfile.blackjack.gamesPlayed > 0 ? 
                                    Math.round((userProfile.blackjack.gamesWon / userProfile.blackjack.gamesPlayed) * 100) : 0}%\n` +
                               `Total Winnings: ${userProfile.blackjack.totalWinnings} coins`,
                        inline: false
                    });
                }
                
                return interaction.reply({ 
                    embeds: [embed],
                    ephemeral: true 
                });
            }
        }
        
        // Fallback for unhandled commands
        return interaction.reply({ 
            content: 'Unknown command or incorrect usage.',
            ephemeral: true 
        });
    },
};