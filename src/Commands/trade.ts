import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChatInputCommandInteraction,
  SlashCommandBuilder, 
  User, 
  ButtonInteraction,
  EmbedBuilder,
  Message,
  MessageComponentInteraction,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { getItemById } from './Data/shopData';

// Path to user data file
const USER_DATA_PATH = path.join(__dirname, '..', 'Commands', 'Data', 'userdata.json');

// For debugging
console.log('User data path:', USER_DATA_PATH);

// Maximum time a trade offer remains active (1 minute)
const TRADE_TIMEOUT_MS = 1 * 60 * 1000;

// Interface for trade items
interface TradeItem {
  itemId: string;
  quantity: number;
}

// Interface for tracking trade offers
interface Trade {
  tradeId: string;
  initiatorId: string;
  targetId: string;
  initiatorItems: TradeItem[];
  targetItems: TradeItem[];
  initiatorMoney: number;
  targetMoney: number;
  initiatorReady: boolean;
  targetReady: boolean;
  createdAt: number;
  message?: Message;
}

// User data interfaces
interface InventoryItem {
  id: string;
  quantity: number;
  acquired: number;
  metadata?: {
    [key: string]: any;
  };
}

interface UserProfile {
  balance: number;
  inventory: InventoryItem[];
  [key: string]: any;
}

interface UserData {
  [userId: string]: UserProfile;
}

// Global active trades map
const activeTrades = new Map<string, Trade>();

// Generate a unique trade ID
function generateTradeId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// Format money display
function formatMoney(amount: number): string {
  return `💰 ${amount.toLocaleString()} coins`;
}

// Direct file operations for reliability
function getUserData(): UserData {
  try {
    const data = fs.readFileSync(USER_DATA_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading user data:', error);
    return {};
  }
}

function saveUserData(userData: UserData): void {
  try {
    fs.writeFileSync(USER_DATA_PATH, JSON.stringify(userData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

function getUserProfile(userId: string): UserProfile {
  const userData = getUserData();
  if (!userData[userId]) {
    userData[userId] = {
      balance: 1000, // Default balance
      inventory: []
    };
    saveUserData(userData);
  }
  
  // Ensure inventory exists
  if (!userData[userId].inventory) {
    userData[userId].inventory = [];
    saveUserData(userData);
  }
  
  return userData[userId];
}

// Check if item is tradeable
function isItemTradeable(itemId: string): boolean {
  const item = getItemById(itemId);
  return item ? item.tradeable !== false : false;
}

// Create trade embed
function createTradeEmbed(trade: Trade, initiator: User, target: User): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Trade: ${initiator.username} ⟷ ${target.username}`)
    .setColor(0x0099ff)
    .setTimestamp()
    .setFooter({ text: `Trade ID: ${trade.tradeId}` });

  // Format initiator's offerings
  let initiatorItemsText = trade.initiatorItems.length > 0 
    ? trade.initiatorItems.map(item => {
        const shopItem = getItemById(item.itemId);
        return shopItem 
          ? `${shopItem.emoji || '📦'} ${item.quantity}x ${shopItem.name}`
          : `📦 ${item.quantity}x Unknown Item`;
      }).join('\n')
    : "No items added";
  
  if (trade.initiatorMoney > 0) {
    initiatorItemsText += `\n${formatMoney(trade.initiatorMoney)}`;
  }

  // Format target's offerings
  let targetItemsText = trade.targetItems.length > 0 
    ? trade.targetItems.map(item => {
        const shopItem = getItemById(item.itemId);
        return shopItem 
          ? `${shopItem.emoji || '📦'} ${item.quantity}x ${shopItem.name}`
          : `📦 ${item.quantity}x Unknown Item`;
      }).join('\n')
    : "No items added";
  
  if (trade.targetMoney > 0) {
    targetItemsText += `\n${formatMoney(trade.targetMoney)}`;
  }

  // Add ready status
  const initiatorStatus = trade.initiatorReady ? '✅ Ready' : '⏳ Not Ready';
  const targetStatus = trade.targetReady ? '✅ Ready' : '⏳ Not Ready';
  
  embed.addFields(
    { name: `${initiator.username}'s Offer (${initiatorStatus})`, value: initiatorItemsText },
    { name: `${target.username}'s Offer (${targetStatus})`, value: targetItemsText }
  );
  
  return embed;
}

// Custom ID format: trade:<action>:<tradeId>:<userId>:<extraData>
function createCustomId(action: string, tradeId: string, userId?: string, extraData?: string): string {
  let id = `trade:${action}:${tradeId}`;
  if (userId) id += `:${userId}`;
  if (extraData) id += `:${extraData}`;
  return id;
}

function parseCustomId(customId: string): { action: string, tradeId: string, userId?: string, extraData?: string } {
  const parts = customId.split(':');
  return {
    action: parts[1],
    tradeId: parts[2],
    userId: parts[3],
    extraData: parts[4]
  };
}

// Create initial trade offer
async function createTrade(interaction: ChatInputCommandInteraction, initiator: User, target: User): Promise<void> {
  // Check if either user is already trading
  const isAlreadyTrading = Array.from(activeTrades.values()).some(
    t => t.initiatorId === initiator.id || t.targetId === initiator.id || 
         t.initiatorId === target.id || t.targetId === target.id
  );

  if (isAlreadyTrading) {
    await interaction.reply({
      content: "One or both users are already in an active trade.",
      ephemeral: true
    });
    return;
  }

  // Create new trade
  const tradeId = generateTradeId();
  const trade: Trade = {
    tradeId,
    initiatorId: initiator.id,
    targetId: target.id,
    initiatorItems: [],
    targetItems: [],
    initiatorMoney: 0,
    targetMoney: 0,
    initiatorReady: false,
    targetReady: false,
    createdAt: Date.now()
  };

  // Create embed
  const embed = createTradeEmbed(trade, initiator, target);

  // Create controls for initiator
  const initiatorControls = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(createCustomId('add_items', tradeId, initiator.id))
        .setLabel('Add Items')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(createCustomId('add_money', tradeId, initiator.id))
        .setLabel('Add Money')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(createCustomId('ready', tradeId, initiator.id))
        .setLabel('Ready')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(createCustomId('cancel', tradeId))
        .setLabel('Cancel Trade')
        .setStyle(ButtonStyle.Danger)
    );

  // Create controls for target
  const targetControls = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(createCustomId('add_items', tradeId, target.id))
        .setLabel('Add Items')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(createCustomId('add_money', tradeId, target.id))
        .setLabel('Add Money')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(createCustomId('ready', tradeId, target.id))
        .setLabel('Ready')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(createCustomId('reject', tradeId))
        .setLabel('Reject Trade')
        .setStyle(ButtonStyle.Danger)
    );

  // Send the public trade message
  const reply = await interaction.reply({
    content: `${target}, ${initiator} wants to trade with you!`,
    embeds: [embed],
    fetchReply: true
  });

  trade.message = reply as Message;

  // Send private controls
  await interaction.followUp({
    content: `Use these controls to manage your trade with ${target.username}:`,
    components: [initiatorControls],
    ephemeral: true
  });

  try {
    await target.send({
      content: `${initiator.username} wants to trade with you! Use these controls to manage the trade:`,
      components: [targetControls]
    });
  } catch {
    await interaction.followUp({
      content: `${target}, I couldn't send you a direct message. Use these controls to manage your side of the trade:`,
      components: [targetControls],
      ephemeral: true
    });
  }

  // Store the trade
  activeTrades.set(tradeId, trade);

  // Set auto-expire timeout
  setTimeout(() => {
    const currentTrade = activeTrades.get(tradeId);
    if (currentTrade && !currentTrade.initiatorReady && !currentTrade.targetReady) {
      activeTrades.delete(tradeId);
      
      if (currentTrade.message) {
        currentTrade.message.edit({
          content: "This trade has expired due to inactivity.",
          embeds: [
            new EmbedBuilder()
              .setTitle("Trade Expired")
              .setDescription("This trade offer has expired.")
              .setColor(0xff0000)
          ],
          components: []
        }).catch(console.error);
      }
    }
  }, TRADE_TIMEOUT_MS);
}

// Add item to trade
function addItemToTrade(trade: Trade, userId: string, itemId: string, quantity: number): boolean {
  const items = userId === trade.initiatorId ? trade.initiatorItems : trade.targetItems;
  
  // Find existing item
  const existingItem = items.find(item => item.itemId === itemId);
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    items.push({ itemId, quantity });
  }

  // Reset ready status
  trade.initiatorReady = false;
  trade.targetReady = false;
  
  return true;
}

// Add money to trade
function addMoneyToTrade(trade: Trade, userId: string, amount: number): boolean {
  if (userId === trade.initiatorId) {
    trade.initiatorMoney = amount;
  } else {
    trade.targetMoney = amount;
  }
  
  // Reset ready status
  trade.initiatorReady = false;
  trade.targetReady = false;
  
  return true;
}

// Execute trade when both users are ready
function executeTrade(trade: Trade): boolean {
  try {
    // Load fresh user data
    const userData = getUserData();
    const initiator = userData[trade.initiatorId];
    const target = userData[trade.targetId];
    
    if (!initiator || !target) {
      console.error("Trade failed: User not found");
      return false;
    }

    // Verify balances
    if (initiator.balance < trade.initiatorMoney || target.balance < trade.targetMoney) {
      console.error(`Trade failed: Insufficient balance`);
      return false;
    }

    // Verify item quantities
    for (const item of trade.initiatorItems) {
      const userItem = initiator.inventory?.find(i => i.id === item.itemId);
      if (!userItem || userItem.quantity < item.quantity) {
        console.error(`Trade failed: Initiator doesn't have enough ${item.itemId}`);
        return false;
      }
    }

    for (const item of trade.targetItems) {
      const userItem = target.inventory?.find(i => i.id === item.itemId);
      if (!userItem || userItem.quantity < item.quantity) {
        console.error(`Trade failed: Target doesn't have enough ${item.itemId}`);
        return false;
      }
    }

    // Create timestamp for trading
    const timestamp = Date.now();

    // TRANSFER ITEMS FROM INITIATOR TO TARGET
    for (const item of trade.initiatorItems) {
      // Remove from initiator
      const initiatorItem = initiator.inventory.find(i => i.id === item.itemId)!;
      if (initiatorItem.quantity <= item.quantity) {
        // Remove completely
        initiator.inventory = initiator.inventory.filter(i => i.id !== item.itemId);
      } else {
        // Reduce quantity
        initiatorItem.quantity -= item.quantity;
      }

      // Add to target
      const targetItem = target.inventory.find(i => i.id === item.itemId);
      if (targetItem) {
        // Increase existing
        targetItem.quantity += item.quantity;
      } else {
        // Add new
        target.inventory.push({
          id: item.itemId,
          quantity: item.quantity,
          acquired: timestamp
        });
      }
    }

    // TRANSFER ITEMS FROM TARGET TO INITIATOR
    for (const item of trade.targetItems) {
      // Remove from target
      const targetItem = target.inventory.find(i => i.id === item.itemId)!;
      if (targetItem.quantity <= item.quantity) {
        // Remove completely
        target.inventory = target.inventory.filter(i => i.id !== item.itemId);
      } else {
        // Reduce quantity
        targetItem.quantity -= item.quantity;
      }

      // Add to initiator
      const initiatorItem = initiator.inventory.find(i => i.id === item.itemId);
      if (initiatorItem) {
        // Increase existing
        initiatorItem.quantity += item.quantity;
      } else {
        // Add new
        initiator.inventory.push({
          id: item.itemId,
          quantity: item.quantity,
          acquired: timestamp
        });
      }
    }

    // TRANSFER MONEY
    initiator.balance -= trade.initiatorMoney;
    initiator.balance += trade.targetMoney;
    target.balance -= trade.targetMoney;
    target.balance += trade.initiatorMoney;

    // SAVE CHANGES TO FILE
    saveUserData(userData);
    
    console.log(`TRADE COMPLETED: ${trade.tradeId}`);
    console.log(`- Initiator (${trade.initiatorId}) transferred ${trade.initiatorItems.length} items and ${trade.initiatorMoney} money`);
    console.log(`- Target (${trade.targetId}) transferred ${trade.targetItems.length} items and ${trade.targetMoney} money`);
    
    return true;
  } catch (error) {
    console.error("Error executing trade:", error);
    return false;
  }
}

// Handle adding items
async function handleAddItems(interaction: ButtonInteraction, trade: Trade): Promise<void> {
  const profile = getUserProfile(interaction.user.id);
  
  if (!profile.inventory || profile.inventory.length === 0) {
    await interaction.reply({
      content: "You don't have any items in your inventory to trade.",
      ephemeral: true
    });
    return;
  }
  
  // Filter tradeable items
  const tradeableItems = profile.inventory.filter(item => isItemTradeable(item.id));
  
  if (tradeableItems.length === 0) {
    await interaction.reply({
      content: "You don't have any tradeable items.",
      ephemeral: true
    });
    return;
  }

  // Create item selection menu
  const menu = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(createCustomId('select_item', trade.tradeId, interaction.user.id))
        .setPlaceholder('Select an item to trade')
        .addOptions(
          tradeableItems.slice(0, 25).map(item => {
            const shopItem = getItemById(item.id);
            return {
              label: shopItem ? shopItem.name : item.id,
              description: `You have: ${item.quantity}`,
              value: item.id,
              emoji: shopItem?.emoji || '📦'
            };
          })
        )
    );
  
  await interaction.reply({
    content: "Select an item to add to the trade:",
    components: [menu],
    ephemeral: true
  });
}

// Handle adding money
async function handleAddMoney(interaction: ButtonInteraction, trade: Trade): Promise<void> {
  const profile = getUserProfile(interaction.user.id);
  
  // Create money buttons
  const buttons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(createCustomId('money', trade.tradeId, interaction.user.id, '100'))
        .setLabel('100')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createCustomId('money', trade.tradeId, interaction.user.id, '500'))
        .setLabel('500')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createCustomId('money', trade.tradeId, interaction.user.id, '1000'))
        .setLabel('1000')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createCustomId('money', trade.tradeId, interaction.user.id, '5000'))
        .setLabel('5000')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createCustomId('money_custom', trade.tradeId, interaction.user.id))
        .setLabel('Custom Amount')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.reply({
    content: `Your balance: ${formatMoney(profile.balance)}\nSelect an amount to add:`,
    components: [buttons],
    ephemeral: true
  });
}

// Handle ready status toggle
async function handleReady(interaction: ButtonInteraction, trade: Trade, userId: string): Promise<void> {
  const isInitiator = userId === trade.initiatorId;
  
  // Toggle ready state
  if (isInitiator) {
    trade.initiatorReady = !trade.initiatorReady;
  } else {
    trade.targetReady = !trade.targetReady;
  }
  
  // If both ready, execute trade
  if (trade.initiatorReady && trade.targetReady) {
    const success = executeTrade(trade);
    
    if (success) {
      // Update message
      if (trade.message) {
        const completedEmbed = new EmbedBuilder()
          .setTitle("Trade Completed")
          .setDescription("Trade completed successfully! Both parties have received their items and money.")
          .setColor(0x00ff00)
          .setTimestamp();
        
        await trade.message.edit({
          content: "✅ Trade completed successfully!",
          embeds: [completedEmbed],
          components: []
        });
      }
      
      await interaction.reply({
        content: "Trade completed successfully! Check your inventory and balance.",
        ephemeral: true
      });
      
      // Remove from active trades
      activeTrades.delete(trade.tradeId);
    } else {
      // Handle failure
      if (trade.message) {
        const failedEmbed = new EmbedBuilder()
          .setTitle("Trade Failed")
          .setDescription("The trade couldn't be completed. This could be because one of you no longer has the offered items or sufficient balance.")
          .setColor(0xff0000)
          .setTimestamp();
        
        await trade.message.edit({
          content: "❌ Trade failed!",
          embeds: [failedEmbed],
          components: []
        });
      }
      
      await interaction.reply({
        content: "The trade failed. This could be because one of you no longer has the offered items or sufficient balance.",
        ephemeral: true
      });
      
      // Reset ready status
      trade.initiatorReady = false;
      trade.targetReady = false;
    }
  } else {
    // Update the trade message with new ready status
    if (trade.message) {
      const initiator = await interaction.client.users.fetch(trade.initiatorId);
      const target = await interaction.client.users.fetch(trade.targetId);
      
      const updatedEmbed = createTradeEmbed(trade, initiator, target);
      
      await trade.message.edit({
        embeds: [updatedEmbed]
      });
      
      await interaction.reply({
        content: `You are now ${isInitiator ? (trade.initiatorReady ? "ready" : "not ready") : (trade.targetReady ? "ready" : "not ready")} for the trade.`,
        ephemeral: true
      });
    }
  }
}

// Handle cancel trade
async function handleCancel(interaction: ButtonInteraction, trade: Trade): Promise<void> {
  if (interaction.user.id !== trade.initiatorId) {
    await interaction.reply({
      content: "Only the person who initiated the trade can cancel it.",
      ephemeral: true
    });
    return;
  }
  
  // Cancel trade
  activeTrades.delete(trade.tradeId);
  
  if (trade.message) {
    const cancelledEmbed = new EmbedBuilder()
      .setTitle("Trade Cancelled")
      .setDescription(`Trade cancelled by ${interaction.user.username}`)
      .setColor(0xff0000)
      .setTimestamp();
    
    await trade.message.edit({
      content: "Trade has been cancelled.",
      embeds: [cancelledEmbed],
      components: []
    });
  }
  
  await interaction.reply({
    content: "You have cancelled the trade.",
    ephemeral: true
  });
}

// Handle reject trade
async function handleReject(interaction: ButtonInteraction, trade: Trade): Promise<void> {
  if (interaction.user.id !== trade.targetId) {
    await interaction.reply({
      content: "Only the recipient of the trade request can reject it.",
      ephemeral: true
    });
    return;
  }
  
  // Cancel trade
  activeTrades.delete(trade.tradeId);
  
  if (trade.message) {
    const rejectedEmbed = new EmbedBuilder()
      .setTitle("Trade Rejected")
      .setDescription(`Trade rejected by ${interaction.user.username}`)
      .setColor(0xff0000)
      .setTimestamp();
    
    await trade.message.edit({
      content: "Trade has been rejected.",
      embeds: [rejectedEmbed],
      components: []
    });
  }
  
  await interaction.reply({
    content: "You have rejected the trade.",
    ephemeral: true
  });
}

// Command data for Discord.js
export const data = new SlashCommandBuilder()
  .setName('trade')
  .setDescription('Trade items or money with another user')
  .addUserOption(option => 
    option.setName('user')
      .setDescription('The user to trade with')
      .setRequired(true));

// Command execution
export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser('user');
  
  if (!target) {
    await interaction.reply({
      content: "You need to specify a user to trade with.",
      ephemeral: true
    });
    return;
  }
  
  if (target.id === interaction.user.id) {
    await interaction.reply({
      content: "You can't trade with yourself.",
      ephemeral: true
    });
    return;
  }
  
  if (target.bot) {
    await interaction.reply({
      content: "You can't trade with bots.",
      ephemeral: true
    });
    return;
  }
  
  await createTrade(interaction, interaction.user, target);
}

// Handle all trade-related button and select menu interactions
export async function handleTradeInteractions(interaction: MessageComponentInteraction): Promise<boolean> {
  const customId = interaction.customId;
  
  // Check if this is a trade interaction
  if (!customId.startsWith('trade:')) {
    return false;
  }
  
  const { action, tradeId, userId, extraData } = parseCustomId(customId);
  const trade = activeTrades.get(tradeId);
  
  if (!trade) {
    await interaction.reply({
      content: "This trade is no longer active.",
      ephemeral: true
    });
    return true;
  }
  
  // Check if user is allowed
  if ((userId && userId !== interaction.user.id) || 
      (interaction.user.id !== trade.initiatorId && interaction.user.id !== trade.targetId)) {
    await interaction.reply({
      content: "You are not part of this trade.",
      ephemeral: true
    });
    return true;
  }
  
  try {
    // Handle different actions
    switch (action) {
      case 'add_items':
        await handleAddItems(interaction as ButtonInteraction, trade);
        break;
        
      case 'add_money':
        await handleAddMoney(interaction as ButtonInteraction, trade);
        break;
        
      case 'select_item':
        if (interaction.isStringSelectMenu()) {
          const itemId = interaction.values[0];
          const modal = new ModalBuilder()
            .setCustomId(`trade:quantity:${tradeId}:${interaction.user.id}:${itemId}`)
            .setTitle('Add Item to Trade');
          
          const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('How many do you want to trade?')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(3)
            .setPlaceholder('Enter a number (1-999)')
            .setRequired(true);
          
          const row = new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput);
          modal.addComponents(row);
          
          await interaction.showModal(modal);
        }
        break;
        
      case 'money':
        if (extraData && !isNaN(parseInt(extraData))) {
          const amount = parseInt(extraData);
          const profile = getUserProfile(interaction.user.id);
          
          if (profile.balance < amount) {
            await interaction.reply({
              content: `You don't have enough money. Your balance: ${formatMoney(profile.balance)}`,
              ephemeral: true
            });
            break;
          }
          
          addMoneyToTrade(trade, interaction.user.id, amount);
          
          // Update trade message
          if (trade.message) {
            const initiator = await interaction.client.users.fetch(trade.initiatorId);
            const target = await interaction.client.users.fetch(trade.targetId);
            const updatedEmbed = createTradeEmbed(trade, initiator, target);
            await trade.message.edit({ embeds: [updatedEmbed] });
          }
          
          await interaction.reply({
            content: `Added ${formatMoney(amount)} to the trade.`,
            ephemeral: true
          });
        }
        break;
        
      case 'money_custom':
        const modal = new ModalBuilder()
          .setCustomId(`trade:money_amount:${tradeId}:${interaction.user.id}`)
          .setTitle('Add Money to Trade');
        
        const amountInput = new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Enter amount')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(10)
          .setPlaceholder('Enter amount of coins')
          .setRequired(true);
        
        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
        modal.addComponents(row);
        
        await interaction.showModal(modal);
        break;
        
      case 'ready':
        await handleReady(interaction as ButtonInteraction, trade, interaction.user.id);
        break;
        
      case 'cancel':
        await handleCancel(interaction as ButtonInteraction, trade);
        break;
        
      case 'reject':
        await handleReject(interaction as ButtonInteraction, trade);
        break;
    }
  } catch (error) {
    console.error('Error handling trade interaction:', error);
    await interaction.reply({
      content: 'Something went wrong with the trade.',
      ephemeral: true
    }).catch(() => {});
  }
  
  return true;
}

// Handle modal submissions
export async function handleTradeModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean> {
  const customId = interaction.customId;
  
  if (!customId.startsWith('trade:')) {
    return false;
  }
  
  const { action, tradeId, userId, extraData } = parseCustomId(customId);
  const trade = activeTrades.get(tradeId);
  
  if (!trade) {
    await interaction.reply({
      content: "This trade is no longer active.",
      ephemeral: true
    });
    return true;
  }
  
  try {
    switch (action) {
      case 'quantity':
        // Add item to trade (extraData = itemId)
        const itemId = extraData!;
        const quantityStr = interaction.fields.getTextInputValue('quantity');
        const quantity = parseInt(quantityStr);
        
        if (isNaN(quantity) || quantity <= 0) {
          await interaction.reply({
            content: "Please enter a valid positive number.",
            ephemeral: true
          });
          return true;
        }
        
        // Verify user has enough
        const profile = getUserProfile(interaction.user.id);
        const inventoryItem = profile.inventory.find(item => item.id === itemId);
        
        if (!inventoryItem || inventoryItem.quantity < quantity) {
          await interaction.reply({
            content: `You don't have ${quantity} of this item.`,
            ephemeral: true
          });
          return true;
        }
        
        // Add to trade
        addItemToTrade(trade, interaction.user.id, itemId, quantity);
        
        // Update trade message
        if (trade.message) {
          const initiator = await interaction.client.users.fetch(trade.initiatorId);
          const target = await interaction.client.users.fetch(trade.targetId);
          const updatedEmbed = createTradeEmbed(trade, initiator, target);
          await trade.message.edit({ embeds: [updatedEmbed] });
        }
        
        const shopItem = getItemById(itemId);
        const itemName = shopItem ? shopItem.name : "item";
        
        await interaction.reply({
          content: `Added ${quantity}x ${itemName} to the trade.`,
          ephemeral: true
        });
        break;
        
      case 'money_amount':
        const amountStr = interaction.fields.getTextInputValue('amount');
        const amount = parseInt(amountStr);
        
        if (isNaN(amount) || amount <= 0) {
          await interaction.reply({
            content: "Please enter a valid positive amount.",
            ephemeral: true
          });
          return true;
        }
        
        // Verify user has enough
        const user = getUserProfile(interaction.user.id);
        
        if (user.balance < amount) {
          await interaction.reply({
            content: `You don't have enough money. Your balance: ${formatMoney(user.balance)}`,
            ephemeral: true
          });
          return true;
        }
        
        // Add to trade
        addMoneyToTrade(trade, interaction.user.id, amount);
        
        // Update trade message
        if (trade.message) {
          const initiator = await interaction.client.users.fetch(trade.initiatorId);
          const target = await interaction.client.users.fetch(trade.targetId);
          const updatedEmbed = createTradeEmbed(trade, initiator, target);
          await trade.message.edit({ embeds: [updatedEmbed] });
        }
        
        await interaction.reply({
          content: `Added ${formatMoney(amount)} to the trade.`,
          ephemeral: true
        });
        break;
    }
  } catch (error) {
    console.error('Error handling trade modal:', error);
    await interaction.reply({
      content: 'Something went wrong with the trade.',
      ephemeral: true
    }).catch(() => {});
  }
  
  return true;
}