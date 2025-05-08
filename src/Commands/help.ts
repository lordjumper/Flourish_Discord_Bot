import { SlashCommandBuilder } from '@discordjs/builders';
import { 
  CommandInteraction, 
  EmbedBuilder
} from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help with FlourishBot commands')
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('Get detailed help for a specific command')
        .setRequired(false)
        .addChoices(
          { name: 'balance', value: 'balance' },
          { name: 'blackjack', value: 'blackjack' },
          { name: 'fishing', value: 'fishing' },
          { name: 'inventory', value: 'inventory' },
          { name: 'shop', value: 'shop' },
          { name: 'ping', value: 'ping' }
        )),

  async execute(interaction: CommandInteraction) {
    const commandName = interaction.options.get('command')?.value as string | undefined;
    
    if (commandName) {
      // Show detailed help for specific command
      await showCommandHelp(interaction, commandName);
    } else {
      // Show general help with all commands
      await showGeneralHelp(interaction);
    }
  }
};

/**
 * Show general help with a list of all available commands
 */
async function showGeneralHelp(interaction: CommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('🌟 FlourishBot Commands')
    .setDescription('Here are all the available commands in FlourishBot. Use `/help [command]` for more details about a specific command.')
    .setColor(0x3498DB)
    .addFields(
      { 
        name: '💰 Economy', 
        value: '`/balance` - Check your current coin balance\n`/shop` - Buy items from the shop' 
      },
      { 
        name: '🎮 Games', 
        value: '`/blackjack` - Play a game of blackjack to earn coins\n`/fishing` - Go fishing and catch fish to sell'
      },
      { 
        name: '🎒 Inventory', 
        value: '`/inventory` - View and manage your items'
      },
      { 
        name: '🛠️ Utility', 
        value: '`/help` - Show this help message\n`/ping` - Check the bot\'s response time'
      }
    )
    .setFooter({ text: 'Use /help [command] for detailed information about a command' });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Show detailed help for a specific command
 */
async function showCommandHelp(interaction: CommandInteraction, commandName: string) {
  switch(commandName.toLowerCase()) {
    case 'balance':
      await showBalanceHelp(interaction);
      break;
    case 'blackjack':
      await showBlackjackHelp(interaction);
      break;
    case 'fishing':
      await showFishingHelp(interaction);
      break;
    case 'inventory':
      await showInventoryHelp(interaction);
      break;
    case 'shop':
      await showShopHelp(interaction);
      break;
    case 'ping':
      await showPingHelp(interaction);
      break;
    default:
      await interaction.reply({ 
        content: 'Help information for this command is not available.',
        ephemeral: true 
      });
  }
}

/**
 * Display help for the balance command
 */
async function showBalanceHelp(interaction: CommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('💰 Balance Command Help')
    .setDescription('The `/balance` command shows your current coin balance in FlourishBot.')
    .setColor(0xF1C40F) // Gold color
    .addFields(
      { 
        name: 'Usage', 
        value: '`/balance`' 
      },
      { 
        name: 'Description', 
        value: 'This command displays your current coin balance and shows ways to earn more coins.'
      },
      { 
        name: 'Ways to earn coins', 
        value: '• Win games of `/blackjack`\n• Catch and sell fish with `/fishing`\n• Complete other activities in the bot'
      }
    )
    .setFooter({ text: 'Your balance is shown in coins (💰)' });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Display help for the blackjack command
 */
async function showBlackjackHelp(interaction: CommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('🎮 Blackjack Command Help')
    .setDescription('Play blackjack to win coins! Try to get as close to 21 as possible without going over.')
    .setColor(0x2ECC71) // Green color
    .addFields(
      { 
        name: 'Subcommands', 
        value: '`/blackjack play [bet]` - Play a game with a certain bet amount\n`/blackjack stats` - View your blackjack statistics' 
      },
      { 
        name: 'How to play', 
        value: '1. Start a game with `/blackjack play [bet]`\n2. You\'ll receive two cards, and the dealer gets two cards (one face down)\n3. Choose to "Hit" to get another card or "Stand" to keep your current hand\n4. Try to get closer to 21 than the dealer without going over ("busting")'
      },
      { 
        name: 'Card Values', 
        value: '• Number cards (2-10): Face value\n• Face cards (J, Q, K): 10 points\n• Ace: 1 or 11 points (whichever benefits you most)'
      },
      { 
        name: 'Winning', 
        value: '• If you get closer to 21 than the dealer without busting, you win your bet amount\n• If you get a blackjack (21 with 2 cards), you win 1.5x your bet\n• If the dealer busts, you win your bet amount\n• If you tie with the dealer, your bet is returned'
      }
    )
    .setFooter({ text: 'Cards will time out after 60 seconds of inactivity' });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Display help for the fishing command
 */
async function showFishingHelp(interaction: CommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('🎣 Fishing Command Help')
    .setDescription('Catch fish and sell them for coins! Different rarity types have different values.')
    .setColor(0x3498DB) // Blue color
    .addFields(
      { 
        name: 'Subcommands', 
        value: '`/fishing start` - Start fishing with your equipped rod\n`/fishing stats` - View your fishing statistics\n`/fishing sell [option]` - Sell your caught fish' 
      },
      { 
        name: 'How to fish', 
        value: '1. Buy a fishing rod from the `/shop`\n2. Use the rod from your inventory with `/inventory use`\n3. Start fishing with `/fishing start`\n4. Click the "Catch" button when a fish bites\n5. Sell your fish with `/fishing sell`'
      },
      { 
        name: 'Fish Rarities', 
        value: '🗑️ Junk - Lowest value items\n🐟 Common - Basic fish (most common)\n🐡 Uncommon - Better than common fish\n🐠 Rare - Valuable fish (harder to catch)\n✨ Legendary - Extremely valuable fish (very rare)'
      },
      { 
        name: 'Fishing Rods', 
        value: 'Better rods improve your chances of catching rare fish and may have other benefits. Rods have limited durability that decreases with use.'
      },
      { 
        name: 'Selling Fish', 
        value: 'You can sell fish using:\n`/fishing sell all` - Sell all fish\n`/fishing sell [rarity]` - Sell all fish of a specific rarity\n`/fishing sell select` - Choose specific fish to sell'
      }
    )
    .setFooter({ text: 'Your fishing rod will break after its durability reaches zero' });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Display help for the inventory command
 */
async function showInventoryHelp(interaction: CommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('🎒 Inventory Command Help')
    .setDescription('View and manage your items in FlourishBot.')
    .setColor(0x9B59B6) // Purple color
    .addFields(
      { 
        name: 'Subcommands', 
        value: '`/inventory view` - View all items in your inventory\n`/inventory use [item]` - Use or equip an item' 
      },
      { 
        name: 'Item Categories', 
        value: '• Fishing Rods - Used for fishing\n• Fish - Can be sold for coins\n• Other Items - Various items with different uses'
      },
      { 
        name: 'Using Items', 
        value: 'Different items have different effects when used:\n• Fishing Rods: Equipped for fishing\n• Consumable Items: Grant various effects\n• Some items cannot be used directly'
      }
    )
    .setFooter({ text: 'Buy more items from the /shop' });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Display help for the shop command
 */
async function showShopHelp(interaction: CommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('🛒 Shop Command Help')
    .setDescription('Buy items from the shop using your coins.')
    .setColor(0xE67E22) // Orange color
    .addFields(
      { 
        name: 'Subcommands', 
        value: '`/shop view` - Browse the available items in the shop\n`/shop buy [item] [quantity]` - Purchase an item from the shop' 
      },
      { 
        name: 'Shop Categories', 
        value: '• Fishing Rods - Used for fishing with varying stats\n• Boosters - Items that can improve gameplay\n• Special Items - Unique items with special effects'
      },
      { 
        name: 'Buying Items', 
        value: '1. Check your balance with `/balance`\n2. Browse the shop with `/shop view`\n3. Buy an item with `/shop buy [item] [quantity]`\n4. The item will be added to your inventory'
      }
    )
    .setFooter({ text: 'Earn coins through games and activities' });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Display help for the ping command
 */
async function showPingHelp(interaction: CommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('🏓 Ping Command Help')
    .setDescription('The ping command is a simple utility to check if the bot is responsive.')
    .setColor(0x95A5A6) // Gray color
    .addFields(
      { 
        name: 'Usage', 
        value: '`/ping`' 
      },
      { 
        name: 'Description', 
        value: 'This command shows the bot\'s current latency (response time).'
      }
    )
    .setFooter({ text: 'A lower ping means better response time' });

  await interaction.reply({ embeds: [embed] });
}