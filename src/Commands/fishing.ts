import { SlashCommandBuilder } from '@discordjs/builders';
import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  CommandInteraction, 
  ButtonInteraction,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';
import { getUserProfile, updateUserData, hasItem, getItemQuantity, removeItemFromInventory, addItemToInventory, updateItemMetadata } from './Data/userData';
import { getItemById, ItemCategory } from './Data/shopData';
import * as path from 'path';
import * as fs from 'fs';

// Timeout for interactions in ms (30 seconds)
const INTERACTION_TIMEOUT = 30000;

// Load fish data from file
const fishDataPath = path.join(__dirname, 'Data', 'fish.json');
const FISH_TYPES = JSON.parse(fs.readFileSync(fishDataPath, 'utf8'));

// Default fishing stats
const DEFAULT_FISHING_STATS = {
  totalCaught: 0,
  commonCaught: 0,
  uncommonCaught: 0,
  rareCaught: 0,
  legendaryCaught: 0,
  junkCaught: 0,
  totalValue: 0,
  rods: {} // Will store rod durability
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fishing')
    .setDescription('Go fishing and catch some fish!')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Start fishing with your equipped rod'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View your fishing statistics'))
    .addSubcommand(subcommand => 
      subcommand
        .setName('sell')
        .setDescription('Sell your caught fish')
        .addStringOption(option => 
          option
            .setName('option')
            .setDescription('What fish to sell')
            .setRequired(true)
            .addChoices(
              { name: 'All fish', value: 'all' },
              { name: 'All common fish', value: 'common' },
              { name: 'All uncommon fish', value: 'uncommon' },
              { name: 'All rare fish', value: 'rare' },
              { name: 'All legendary fish', value: 'legendary' },
              { name: 'All junk items', value: 'junk' },
              { name: 'Select specific fish', value: 'select' }
            ))),

  execute: async function(interaction: CommandInteraction) {
    const subcommand = (interaction.options as any).getSubcommand();
    
    switch(subcommand) {
      case 'start':
        await handleFishing(interaction);
        break;
      case 'stats':
        await showFishingStats(interaction);
        break;
      case 'sell':
        await sellFish(interaction);
        break;
    }
  },
  
  // Export the equipRod function so it can be used by inventory.ts
  equipRod
};

/**
 * Check if user has a rod equipped or any rod in inventory
 */
async function checkFishingRod(interaction: CommandInteraction): Promise<string | null> {
  const userId = interaction.user.id;
  const user = getUserProfile(userId);
  
  // Check if user has fishing stats and an equipped rod
  if (user.fishing && user.fishing.equippedRod) {
    const rodId = user.fishing.equippedRod;
    return rodId;
  }
  
  // No rod found
  try {
    await interaction.reply({
      content: "You don't have a fishing rod equipped! Use a rod from your inventory with `/inventory use`.",
      flags: 64  // Using flags instead of ephemeral
    });
  } catch (error) {
    console.error("Failed to reply to interaction - it may have expired:", error);
  }
  
  return null;
}

/**
 * Equip a rod for a user - Called from inventory use function
 */
function equipRod(userId: string, rodId: string): boolean | { alreadyEquipped: boolean; rodName: string } {
  try {
    // Initialize fishing stats if they don't exist
    const user = getUserProfile(userId);
    
    if (!user.fishing) {
      updateUserData(userId, { fishing: {
        totalCaught: 0,
        commonCaught: 0,
        uncommonCaught: 0,
        rareCaught: 0,
        legendaryCaught: 0,
        junkCaught: 0,
        totalValue: 0,
        equippedRod: null
      }});
    }
    
    // Get the rod item data
    const rod = getItemById(rodId);
    if (!rod) {
      console.error(`Rod item with ID ${rodId} not found`);
      return false;
    }
    
    // Check if user already has this exact rod equipped
    if (user.fishing?.equippedRod === rodId) {
      console.log(`User ${userId} tried to equip the same rod (${rodId}) that is already equipped`);
      // Return object with alreadyEquipped flag so the calling function can show an error message
      return { 
        alreadyEquipped: true,
        rodName: rod.name
      };
    }
    
    // Get max durability from rod effects
    const maxDurability = rod.effects?.durability || 10;
    
    // Check for previously equipped rod and swap it back to inventory if it exists
    if (user.fishing?.equippedRod && user.fishing.equippedRod !== rodId) {
      const oldRodId = user.fishing.equippedRod;
      console.log(`Swapping old rod ${oldRodId} back to inventory`);
      
      // Get the old rod item data
      const oldRod = getItemById(oldRodId);
      if (!oldRod) {
        console.error(`Old rod item with ID ${oldRodId} not found`);
      } else {
        // Find old rod in inventory to get its durability
        const userInventory = user.inventory || [];
        const oldRodItem = userInventory.find(item => item.id === oldRodId);
        
        if (oldRodItem && oldRodItem.metadata?.durability) {
          // Get current durability
          const currentDurability = oldRodItem.metadata.durability;
          
          // First unequip the old rod
          updateUserData(userId, {
            fishing: {
              ...user.fishing,
              equippedRod: null
            }
          });
          
          // Check if user already has this rod in inventory (shouldn't happen, but just in case)
          if (hasItem(userId, oldRodId)) {
            // Just update the metadata to preserve durability
            console.log(`Old rod ${oldRodId} already in inventory, updating metadata`);
            updateItemMetadata(userId, oldRodId, { durability: currentDurability });
          } else {
            // Add old rod back to inventory with its current durability
            console.log(`Adding old rod ${oldRodId} back to inventory with durability ${currentDurability}`);
            addItemToInventory(userId, oldRodId, 1);
            updateItemMetadata(userId, oldRodId, { durability: currentDurability });
          }
        }
      }
    }
    
    // Set this rod as the equipped rod
    updateUserData(userId, { 
      fishing: {
        ...user.fishing,
        equippedRod: rodId
      }
    });
    
    // Check if rod already has durability set in inventory metadata
    // If not, set its initial durability
    const userInventory = user.inventory || [];
    const rodInventoryItem = userInventory.find(item => item.id === rodId);
    
    if (rodInventoryItem && !rodInventoryItem.metadata?.durability) {
      // Update the rod with new metadata containing durability
      updateItemMetadata(userId, rodId, { durability: maxDurability });
      console.log(`Set durability for rod ${rodId} to ${maxDurability}`);
    }
    
    console.log(`Equipped rod ${rodId} successfully`);
    return true;
  } catch (error) {
    console.error('Error equipping rod:', error);
    return false;
  }
}

/**
 * Handle fishing mini-game
 */
async function handleFishing(interaction: CommandInteraction) {
  const userId = interaction.user.id;
  
  // Check if user has a fishing rod
  const rodId = await checkFishingRod(interaction);
  if (!rodId) return; // Already handled in checkFishingRod
  
  // Get rod data
  const rod = getItemById(rodId);
  if (!rod) {
    await interaction.reply({ 
      content: `Error retrieving your fishing rod data.`,
      ephemeral: true
    });
    return;
  }
  
  // Get user's fishing stats
  const user = getUserProfile(userId);
  
  // Check rod durability in inventory metadata
  const userInventory = user.inventory || [];
  const rodItem = userInventory.find(item => item.id === rodId);
  
  // If rod doesn't exist in inventory or has no durability, it's broken or missing
  if (!rodItem || !rodItem.metadata?.durability || rodItem.metadata.durability <= 0) {
    await interaction.reply({
      content: `Your ${rod.name} is broken or missing! You need to buy a new one from the shop.`,
      ephemeral: true
    });
    return;
  }
  
  // Create initial embed for fishing animation
  const fishingEmbed = new EmbedBuilder()
    .setTitle('🎣 Fishing')
    .setDescription('Casting your line...\n\n🌊🌊🌊🌊🌊')
    .setColor(0x3498DB)
    .addFields(
      { name: 'Rod', value: rod.name, inline: true },
      { name: 'Durability', value: `${rodItem.metadata.durability}/${rod.effects?.durability || 'N/A'}`, inline: true }
    )
    .setFooter({ text: 'Wait for a fish to bite...' });
  
  // Create action buttons for the fishing mini-game
  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('catch_fish')
        .setLabel('🎯 Catch!')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true), // Disabled until fish bites
      new ButtonBuilder()
        .setCustomId('cancel_fishing')
        .setLabel('✖️ Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
  
  // Send initial response
  const response = await interaction.reply({
    embeds: [fishingEmbed],
    components: [actionRow],
    fetchReply: true
  });
  
  // Calculate waiting time based on rod speed
  const baseWaitTime = Math.random() * 5000 + 2000; // 2-7 seconds
  const rodSpeed = rod.effects?.speed || 1.0;
  const waitTime = baseWaitTime / rodSpeed;
  
  // Visual updates for the fishing process
  const stages = [
    '🌊🌊🌊🌊🌊',
    '🌊🌊🎣🌊🌊',
    '🌊🎣🌊🌊🌊',
    '🎣🌊🌊🌊🌊',
    '🌊🌊🌊🎣🌊',
    '🌊🌊🎣🌊🌊'
  ];
  
  // Start the animation
  let currentStage = 0;
  const animationInterval = setInterval(async () => {
    currentStage = (currentStage + 1) % stages.length;
    fishingEmbed.setDescription(`Fishing in progress...\n\n${stages[currentStage]}`);
    
    try {
      await interaction.editReply({ embeds: [fishingEmbed] });
    } catch (error) {
      clearInterval(animationInterval);
    }
  }, 1000);
  
  // Wait for fish to bite
  setTimeout(async () => {
    clearInterval(animationInterval);
    
    // Check if the message still exists
    try {
      // Fish is biting!
      const newActionRow = ActionRowBuilder.from(actionRow.toJSON());
      (newActionRow.components[0] as ButtonBuilder).setDisabled(false);
      
      fishingEmbed
        .setTitle('🎣 Fish on the line!')
        .setDescription('Quick! Click the Catch button before it gets away!')
        .setColor(0xE74C3C) // Red color for urgency
        .setFooter({ text: 'You have 5 seconds to catch the fish!' });
      
      await interaction.editReply({ 
        embeds: [fishingEmbed],
        components: [newActionRow.toJSON()]
      });
      
      // Create a collector for button interactions
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 5000 // 5 seconds to catch the fish
      });
      
      // Fish got away timeout
      const fishEscapeTimeout = setTimeout(async () => {
        if (collector.ended) return;
        
        collector.stop('timeout');
        
        fishingEmbed
          .setTitle('🎣 The fish got away!')
          .setDescription('You were too slow and the fish escaped.\n\n🌊🌊🌊🌊🌊')
          .setColor(0xE67E22) // Orange color
          .setFooter({ text: 'Try again with /fishing start' });
        
        // Disable the catch button
        const timeoutRow = ActionRowBuilder.from(newActionRow.toJSON());
        (timeoutRow.components[0] as ButtonBuilder).setDisabled(true);
        (timeoutRow.components[1] as ButtonBuilder).setDisabled(true);
        
        // Reduce rod durability slightly
        updateRodDurability(userId, rodId, -1);
        
        try {
          await interaction.editReply({ 
            embeds: [fishingEmbed],
            components: [timeoutRow.toJSON()]
          });
        } catch (error) {
          console.error('Error updating fishing message:', error);
        }
      }, 5000);
      
      // Handle button clicks
      collector.on('collect', async (i: ButtonInteraction) => {
        // Only the command user can interact with buttons
        if (i.user.id !== userId) {
          await i.reply({ 
            content: "This isn't your fishing session!",
            ephemeral: true
          });
          return;
        }
        
        clearTimeout(fishEscapeTimeout);
        
        if (i.customId === 'catch_fish') {
          collector.stop('caught');
          // Process the catch
          const result = await processCatch(userId, rodId);
          
          // Create result embed
          const resultEmbed = createCatchResultEmbed(result, rod.name);
          
          // Disable all buttons
          const finalRow = ActionRowBuilder.from(newActionRow.toJSON());
          finalRow.components.forEach(component => {
            if (component instanceof ButtonBuilder) {
              component.setDisabled(true);
            }
          });
          
          // Show the results
          await i.update({ 
            embeds: [resultEmbed],
            components: [finalRow.toJSON()]
          });
        } 
        else if (i.customId === 'cancel_fishing') {
          collector.stop('cancelled');
          
          fishingEmbed
            .setTitle('🎣 Fishing Cancelled')
            .setDescription('You packed up your fishing gear.\n\n🌊🌊🌊🌊🌊')
            .setColor(0x95A5A6) // Gray color
            .setFooter({ text: 'You can start again with /fishing start' });
          
          // Create a cancelRow from newActionRow
          const cancelRow = ActionRowBuilder.from(newActionRow.toJSON());
          cancelRow.components.forEach(component => {
            if (component instanceof ButtonBuilder) {
              component.setDisabled(true);
            }
          });

          await i.update({ 
            embeds: [fishingEmbed],
            components: [cancelRow.toJSON()]
          });
        }
      });
      
      // Handle collector end
      collector.on('end', (_, reason) => {
        clearTimeout(fishEscapeTimeout);
        
        if (reason !== 'caught' && reason !== 'cancelled' && reason !== 'timeout') {
          // This will handle other end cases like interaction expires
          try {
            const finalRow = ActionRowBuilder.from(newActionRow.toJSON());
            finalRow.components.forEach(component => {
              if (component instanceof ButtonBuilder) {
                component.setDisabled(true);
              }
            });
            
            fishingEmbed
              .setTitle('🎣 Fishing Session Ended')
              .setDescription('The fishing session has expired.\n\n🌊🌊🌊🌊🌊')
              .setColor(0x95A5A6) // Gray color
              .setFooter({ text: 'You can start again with /fishing start' });
            
            interaction.editReply({ 
              embeds: [fishingEmbed],
              components: [finalRow.toJSON()]
            }).catch(console.error);
          } catch (error) {
            console.error('Error updating final fishing state:', error);
          }
        }
      });
    } catch (error) {
      console.error('Error in fishing process:', error);
    }
  }, waitTime);
}

/**
 * Process the result of a successful catch
 */
async function processCatch(userId: string, rodId: string): Promise<any> {
  // Get user data and rod info
  const user = getUserProfile(userId);
  const rod = getItemById(rodId);
  
  if (!rod || !user.fishing) {
    return { success: false };
  }
  
  // Calculate catch probabilities based on rod stats
  const fishingSuccess = rod.effects?.fishingSuccess || 0.6;
  const rareFishChance = rod.effects?.rareFishChance || 0.05;
  
  // Determine if catch is successful
  if (Math.random() > fishingSuccess) {
    // Catch failed
    // Reduce rod durability
    updateRodDurability(userId, rodId, -1);
    return { 
      success: false, 
      message: "The fish slipped off your hook at the last moment!"
    };
  }
  
  // Catch succeeded - determine what was caught
  let catchType = '';
  const randomValue = Math.random();
  
  if (randomValue < 0.15) { // 15% chance for junk
    catchType = 'junk';
  } else if (randomValue < 0.15 + rareFishChance * 0.5) { // Chance for legendary based on rod
    catchType = 'legendary';
  } else if (randomValue < 0.15 + rareFishChance + 0.1) { // Chance for rare based on rod
    catchType = 'rare';
  } else if (randomValue < 0.15 + rareFishChance + 0.1 + 0.25) { // 25% for uncommon
    catchType = 'uncommon';
  } else { // Remainder chance for common
    catchType = 'common';
  }
  
  // Get random fish from the category
  const fishList = FISH_TYPES[catchType];
  const fish = fishList[Math.floor(Math.random() * fishList.length)];
  
  // Calculate a random weight within the fish's range
  const weightRange = fish.weight.split('-').map(Number);
  const weight = weightRange[0] + Math.random() * (weightRange[1] - weightRange[0]);
  const formattedWeight = weight.toFixed(1);
  
  // Add fish to user's inventory
  addItemToInventory(userId, fish.id, 1);
  
  // Reduce rod durability (more for bigger fish)
  const durabilityLoss = catchType === 'legendary' ? -3 : 
                          catchType === 'rare' ? -2 : -1;
  updateRodDurability(userId, rodId, durabilityLoss);
  
  // Update fishing stats
  const updatedStats = { 
    fishing: {
      ...user.fishing,
      totalCaught: (user.fishing.totalCaught || 0) + 1,
      [`${catchType}Caught`]: (user.fishing[`${catchType}Caught`] || 0) + 1,
      totalValue: (user.fishing.totalValue || 0) + fish.value
    }
  };
  
  updateUserData(userId, updatedStats);
  
  // Add coins to user's balance
  updateUserData(userId, { 
    balance: user.balance + fish.value
  });
  
  // Get current durability from user inventory
  const userInventory = user.inventory || [];
  const rodItem = userInventory.find(item => item.id === rodId);
  const currentDurability = rodItem && rodItem.metadata ? rodItem.metadata.durability : 0;
  const maxDurability = rod.effects?.durability || 10;
  
  // Return catch details
  return {
    success: true,
    fish: fish,
    type: catchType,
    weight: formattedWeight,
    value: fish.value,
    fishId: fish.id,
    rodDurability: currentDurability,
    maxDurability: maxDurability
  };
}

/**
 * Update rod durability and handle broken rods
 */
function updateRodDurability(userId: string, rodId: string, change: number): boolean {
  try {
    const user = getUserProfile(userId);
    if (!user.fishing) return false;
    
    // Get rod item from inventory
    const userInventory = user.inventory || [];
    const rodItem = userInventory.find(item => item.id === rodId);
    
    if (!rodItem || !rodItem.metadata) {
      // Initialize metadata if it doesn't exist
      const rod = getItemById(rodId);
      if (rod) {
        updateItemMetadata(userId, rodId, { durability: Math.max(1, (rod.effects?.durability || 10) + change) });
        return true;
      }
      return false;
    }
    
    // Update durability in metadata
    const currentDurability = rodItem.metadata.durability || 0;
    let newDurability = Math.max(0, currentDurability + change);
    
    // Update the durability in item metadata
    updateItemMetadata(userId, rodId, { durability: newDurability });
    
    // Handle broken rod
    if (newDurability <= 0) {
      // Unequip the rod if it breaks
      updateUserData(userId, {
        fishing: {
          ...user.fishing,
          equippedRod: null
        }
      });
      
      // Remove the broken rod from inventory
      removeItemFromInventory(userId, rodId, 1);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error updating rod durability:', error);
    return false;
  }
}

/**
 * Create an embed for catch results
 */
function createCatchResultEmbed(result: any, rodName: string): EmbedBuilder {
  if (!result.success) {
    // Failed catch
    return new EmbedBuilder()
      .setTitle('🎣 Fish Got Away!')
      .setDescription(result.message || 'The fish escaped at the last moment!')
      .setColor(0xE67E22) // Orange color
      .addFields(
        { name: 'Rod', value: rodName, inline: true },
        { name: 'Durability', value: `Decreased by 1`, inline: true }
      )
      .setFooter({ text: 'Better luck next time! Use /fishing start to try again.' });
  }
  
  // Get emoji based on fish type
  let typeEmoji = '🐟';
  let typeColor = 0x3498DB; // Default blue
  
  switch(result.type) {
    case 'junk':
      typeEmoji = '🗑️';
      typeColor = 0x95A5A6; // Gray
      break;
    case 'common':
      typeEmoji = '🐟';
      typeColor = 0x3498DB; // Blue
      break;
    case 'uncommon':
      typeEmoji = '🐡';
      typeColor = 0x2ECC71; // Green
      break;
    case 'rare':
      typeEmoji = '🐠';
      typeColor = 0x9B59B6; // Purple
      break;
    case 'legendary':
      typeEmoji = '✨';
      typeColor = 0xF1C40F; // Gold
      break;
  }
  
  // Create different water line based on fish type
  let waterLine = '';
  switch(result.type) {
    case 'legendary':
      waterLine = '✨🌊✨🌊✨🌊✨';
      break;
    case 'rare':
      waterLine = '🌟🌊🌟🌊🌟';
      break;
    case 'uncommon':
      waterLine = '🌿🌊🌿🌊🌿';
      break;
    default:
      waterLine = '🌊🌊🌊🌊🌊';
  }
  
  // Build the embed
  return new EmbedBuilder()
    .setTitle(`${typeEmoji} Caught: ${result.fish.name}!`)
    .setDescription(`You caught a ${result.fish.emoji} **${result.fish.name}**!\n\n${waterLine}`)
    .setColor(typeColor)
    .addFields(
      { name: 'Type', value: `${typeEmoji} ${result.type.charAt(0).toUpperCase() + result.type.slice(1)}`, inline: true },
      { name: 'Weight', value: `${result.weight} kg`, inline: true },
      { name: 'Value', value: `${result.fish.value} coins`, inline: true },
      { name: 'Rod', value: rodName, inline: true },
      { name: 'Durability', value: `${result.rodDurability}/${result.maxDurability}`, inline: true }
    )
    .setFooter({ text: 'The value has been added to your balance! Fish again with /fishing start' });
}

/**
 * Show user's fishing statistics
 */
async function showFishingStats(interaction: CommandInteraction) {
  const userId = interaction.user.id;
  const user = getUserProfile(userId);
  
  // If user has no fishing stats
  if (!user.fishing) {
    await interaction.reply({
      content: "You haven't been fishing yet! Use `/fishing start` to begin.",
      ephemeral: true
    });
    return;
  }
  
  // Calculate catch percentages
  const totalCaught = user.fishing.totalCaught || 0;
  const commonPercent = totalCaught > 0 ? Math.round((user.fishing.commonCaught || 0) / totalCaught * 100) : 0;
  const uncommonPercent = totalCaught > 0 ? Math.round((user.fishing.uncommonCaught || 0) / totalCaught * 100) : 0;
  const rarePercent = totalCaught > 0 ? Math.round((user.fishing.rareCaught || 0) / totalCaught * 100) : 0;
  const legendaryPercent = totalCaught > 0 ? Math.round((user.fishing.legendaryCaught || 0) / totalCaught * 100) : 0;
  const junkPercent = totalCaught > 0 ? Math.round((user.fishing.junkCaught || 0) / totalCaught * 100) : 0;
  
  // Get equipped rod info
  let rodInfo = "No rod equipped";
  if (user.fishing.equippedRod) {
    const rod = getItemById(user.fishing.equippedRod);
    
    // Get the rod item from inventory to check its durability in metadata
    const userInventory = user.inventory || [];
    const rodItem = userInventory.find(item => item.id === user.fishing.equippedRod);
    const durability = rodItem && rodItem.metadata ? rodItem.metadata.durability : 0;
    const maxDurability = rod?.effects?.durability || 10;
    
    if (rod) {
      rodInfo = `${rod.emoji} ${rod.name} (${durability}/${maxDurability} durability)`;
    }
  }
  
  // Create stats embed
  const statsEmbed = new EmbedBuilder()
    .setTitle('🎣 Fishing Statistics')
    .setDescription(`Here are your fishing statistics, <@${userId}>!`)
    .setColor(0x3498DB)
    .addFields(
      { name: 'Total Catches', value: `${totalCaught}`, inline: true },
      { name: 'Total Value Earned', value: `${user.fishing.totalValue || 0} coins`, inline: true },
      { name: 'Equipped Rod', value: rodInfo, inline: false },
      { name: 'Catch Breakdown', value: 
        `🐟 Common: ${user.fishing.commonCaught || 0} (${commonPercent}%)\n` +
        `🐡 Uncommon: ${user.fishing.uncommonCaught || 0} (${uncommonPercent}%)\n` +
        `🐠 Rare: ${user.fishing.rareCaught || 0} (${rarePercent}%)\n` +
        `✨ Legendary: ${user.fishing.legendaryCaught || 0} (${legendaryPercent}%)\n` +
        `🗑️ Junk: ${user.fishing.junkCaught || 0} (${junkPercent}%)`
      }
    )
    .setFooter({ text: 'Use /fishing start to go fishing!' });
  
  await interaction.reply({ embeds: [statsEmbed] });
}

/**
 * Sell fish from the user's inventory
 */
async function sellFish(interaction: CommandInteraction) {
  const userId = interaction.user.id;
  const option = interaction.options.get('option')?.value as string;

  if (option === 'select') {
    // Show a select menu for specific fish selection
    await handleSelectFishSale(interaction, userId);
  } else {
    // Sell all fish of specific type or all fish
    await handleBulkFishSale(interaction, userId, option);
  }
}

/**
 * Handle the selection of specific fish to sell
 */
async function handleSelectFishSale(interaction: CommandInteraction, userId: string) {
  const user = getUserProfile(userId);
  
  // Get all fish from user inventory
  const fishItems = user.inventory?.filter(item => 
    item.id.startsWith('fish_')
  ) || [];
  
  if (fishItems.length === 0) {
    await interaction.reply({ 
      content: "You don't have any fish to sell!",
      ephemeral: true 
    });
    return;
  }
  
  // Create select menu with fish options (limited to 25 choices)
  const selectOptions: StringSelectMenuOptionBuilder[] = [];
  let totalValue = 0;
  
  // Find all fish types in player's inventory
  for (const item of fishItems.slice(0, 25)) { // Discord limit of 25 options
    const fishType = item.id.split('_')[1] || 'unknown'; // common, rare, etc.
    const fishId = item.id;
    const quantity = item.quantity || 1;
    
    // Find the fish data
    let fishData: { id: string; name: string; value: number; emoji: string; weight: string } | null = null;
    for (const type in FISH_TYPES) {
      const matchingFish = FISH_TYPES[type].find(f => f.id === fishId);
      if (matchingFish) {
        fishData = matchingFish;
        break;
      }
    }
    
    if (fishData) {
      const value = fishData.value * quantity;
      totalValue += value;
      
      selectOptions.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${fishData.name} (${quantity})`)
          .setDescription(`${fishData.value} coins each - Total: ${value} coins`)
          .setValue(fishId)
          .setEmoji(fishData.emoji)
      );
    }
  }
  
  // Create the select menu
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('sell_fish_select')
    .setPlaceholder('Select fish to sell...')
    .addOptions(selectOptions)
    .setMinValues(1)
    .setMaxValues(Math.min(selectOptions.length, 25));
  
  const row = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(selectMenu);
  
  // Create embed for fish selection
  const embed = new EmbedBuilder()
    .setTitle('🐟 Sell Fish')
    .setDescription('Select which fish you want to sell from your inventory.')
    .setColor(0x3498DB)
    .addFields(
      { name: 'Total Fish', value: `${fishItems.length}`, inline: true },
      { name: 'Max Value', value: `${totalValue} coins`, inline: true }
    )
    .setFooter({ text: 'You can select multiple fish to sell at once.' });
  
  // Send the selection menu
  const response = await interaction.reply({
    embeds: [embed],
    components: [row],
    fetchReply: true,
    ephemeral: true
  });
  
  // Create collector for selection
  const collector = response.createMessageComponentCollector({ 
    componentType: ComponentType.StringSelect, 
    time: 30000 
  });
  
  // Handle selection
  collector.on('collect', async i => {
    if (i.user.id !== userId) {
      await i.reply({ 
        content: "This isn't your menu!",
        ephemeral: true
      });
      return;
    }
    
    // Process the selected fish to sell
    await sellSelectedFish(i, i.values);
    collector.stop();
  });
  
  // Handle timeout
  collector.on('end', async (collected, reason) => {
    if (reason === 'time') {
      const timeoutEmbed = new EmbedBuilder()
        .setTitle('⏰ Time Expired')
        .setDescription('The fish sale menu has expired.')
        .setColor(0x95A5A6);
      
      await interaction.editReply({
        embeds: [timeoutEmbed],
        components: []
      });
    }
  });
}

/**
 * Handle bulk sale of fish by type
 */
async function handleBulkFishSale(interaction: CommandInteraction, userId: string, option: string) {
  const user = getUserProfile(userId);
  
  // Get fish from inventory based on option
  type InventoryItem = { id: string; quantity?: number };
  let fishToSell: InventoryItem[] = [];
  
  if (option === 'all') {
    // Sell all fish of any type
    fishToSell = (user.inventory?.filter(item => item.id.startsWith('fish_')) || []) as InventoryItem[];
  } else {
    // Sell specific type (common, rare, etc.)
    fishToSell = (user.inventory?.filter(item => 
      item.id.startsWith(`fish_${option}`)
    ) || []) as InventoryItem[];
  }
  
  if (fishToSell.length === 0) {
    await interaction.reply({ 
      content: `You don't have any ${option === 'all' ? '' : option + ' '}fish to sell!`,
      ephemeral: true 
    });
    return;
  }
  
  // Calculate total value and prepare for sale
  let totalValue = 0;
  let fishSold = 0;
  const soldDetails: { name: string; emoji: string; quantity: number; value: number; total: number }[] = [];
  
  for (const item of fishToSell) {
    // Find fish details
    let fishData: any = null;
    for (const type in FISH_TYPES) {
      const matchingFish = FISH_TYPES[type].find((f: any) => f.id === item.id);
      if (matchingFish) {
        fishData = matchingFish;
        break;
      }
    }
    
    if (fishData) {
      const quantity = item.quantity || 1;
      const value = fishData.value * quantity;
      totalValue += value;
      fishSold += quantity;
      
      // Remove from inventory
      removeItemFromInventory(userId, item.id, quantity);
      
      // Keep track for display purposes
      soldDetails.push({
        name: fishData.name,
        emoji: fishData.emoji,
        quantity,
        value: fishData.value,
        total: value
      });
    }
  }
  
  // Add the value to user's balance
  updateUserData(userId, {
    balance: user.balance + totalValue
  });
  
  // Create result embed
  const embed = new EmbedBuilder()
    .setTitle('💰 Fish Sold')
    .setDescription(`You sold ${fishSold} fish for a total of ${totalValue} coins!`)
    .setColor(0x2ECC71);
  
  // Add details about what was sold
  if (soldDetails.length <= 10) {
    // Show detailed breakdown if not too many types
    const detailText = soldDetails.map(fish => 
      `${fish.emoji} **${fish.name}** x${fish.quantity}: ${fish.total} coins`
    ).join('\n');
    
    embed.addFields({ name: 'Sold Fish', value: detailText });
  } else {
    // Just show summary if many types
    embed.addFields(
      { name: 'Fish Sold', value: `${fishSold}`, inline: true },
      { name: 'Total Value', value: `${totalValue} coins`, inline: true },
    );
  }
  
  embed.addFields({ 
    name: 'New Balance', 
    value: `${user.balance + totalValue} coins` 
  });
  
  await interaction.reply({ embeds: [embed] });
}

/**
 * Process the selected fish to sell
 */
async function sellSelectedFish(interaction: any, selectedFishIds: string[]) {
  const userId = interaction.user.id;
  const user = getUserProfile(userId);
  
  let totalValue = 0;
  let fishSold = 0;
  const soldDetails: { name: string; emoji: string; quantity: number; value: number; total: number }[] = [];
  
  for (const fishId of selectedFishIds) {
    // Find fish in inventory
    const inventoryItem = user.inventory?.find(item => item.id === fishId);
    if (!inventoryItem) continue;
    
    // Find fish details
    let fishData: any = null;
    for (const type in FISH_TYPES) {
      const matchingFish = FISH_TYPES[type].find((f: any) => f.id === fishId);
      if (matchingFish) {
        fishData = matchingFish;
        break;
      }
    }
    
    if (fishData) {
      const quantity = inventoryItem.quantity || 1;
      const value = fishData.value * quantity;
      totalValue += value;
      fishSold += quantity;
      
      // Remove from inventory
      removeItemFromInventory(userId, fishId, quantity);
      
      // Keep track for display purposes
      soldDetails.push({
        name: fishData.name || 'Unknown Fish',
        emoji: fishData.emoji || '🐟',
        quantity: quantity,
        value: fishData.value || 0,
        total: value
      });
    }
  }
  
  // Add the value to user's balance
  updateUserData(userId, {
    balance: user.balance + totalValue
  });
  
  // Create result embed
  const embed = new EmbedBuilder()
    .setTitle('💰 Fish Sold')
    .setDescription(`You sold ${fishSold} fish for a total of ${totalValue} coins!`)
    .setColor(0x2ECC71);
  
  // Add details about what was sold
  const detailText = soldDetails.map(fish => 
    `${fish.emoji} **${fish.name}** x${fish.quantity}: ${fish.total} coins`
  ).join('\n');
  
  embed.addFields(
    { name: 'Sold Fish', value: detailText || "No fish were sold." },
    { name: 'New Balance', value: `${user.balance + totalValue} coins` }
  );
  
  await interaction.update({ 
    embeds: [embed],
    components: []
  });
}