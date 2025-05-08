import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getUserProfile, initGameStats, updateUserData } from './Data/userData';

// Default blackjack stats structure
const DEFAULT_BLACKJACK_STATS = {
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesTied: 0,
    blackjacks: 0,
    totalWinnings: 0,
    highestWin: 0
};

// Card values and suits for the game
const SUITS = ['♥', '♦', '♠', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Create a new deck of cards
function createDeck() {
    const deck: { value: string; suit: string }[] = [];
    for (const suit of SUITS) {
        for (const value of VALUES) {
            deck.push({ value, suit });
        }
    }
    return shuffle(deck);
}

// Shuffle the deck
function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Calculate the score of a hand
function calculateHandValue(hand) {
    let value = 0;
    let aces = 0;
    
    for (const card of hand) {
        if (card.value === 'A') {
            aces++;
            value += 11;
        } else if (['K', 'Q', 'J'].includes(card.value)) {
            value += 10;
        } else {
            value += parseInt(card.value);
        }
    }
    
    // Adjust for aces if necessary
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    
    return value;
}

// Format a hand for display
function formatHand(hand, hideSecond = false) {
    if (hideSecond && hand.length > 1) {
        return `${hand[0].value}${hand[0].suit}, ?`;
    }
    return hand.map(card => `${card.value}${card.suit}`).join(', ');
}

// Update user stats based on game outcome
function handleGameOutcome(userId: string, betAmount: number, outcome: 'win' | 'blackjack' | 'lose' | 'tie'): any {
    // Make sure blackjack stats exist
    initGameStats(userId, 'blackjack', DEFAULT_BLACKJACK_STATS);
    
    const userProfile = getUserProfile(userId);
    const updates: Record<string, any> = {
        blackjack: {
            gamesPlayed: (userProfile.blackjack?.gamesPlayed || 0) + 1
        }
    };
    
    switch (outcome) {
        case 'win':
            updates.balance = userProfile.balance + betAmount;
            updates.blackjack.gamesWon = (userProfile.blackjack?.gamesWon || 0) + 1;
            updates.blackjack.totalWinnings = (userProfile.blackjack?.totalWinnings || 0) + betAmount;
            
            if (betAmount > (userProfile.blackjack?.highestWin || 0)) {
                updates.blackjack.highestWin = betAmount;
            }
            break;
            
        case 'blackjack':
            // Blackjack typically pays 3:2
            const winnings = Math.floor(betAmount * 1.5);
            updates.balance = userProfile.balance + winnings;
            updates.blackjack.gamesWon = (userProfile.blackjack?.gamesWon || 0) + 1;
            updates.blackjack.blackjacks = (userProfile.blackjack?.blackjacks || 0) + 1;
            updates.blackjack.totalWinnings = (userProfile.blackjack?.totalWinnings || 0) + winnings;
            
            if (winnings > (userProfile.blackjack?.highestWin || 0)) {
                updates.blackjack.highestWin = winnings;
            }
            break;
            
        case 'lose':
            updates.balance = userProfile.balance - betAmount;
            updates.blackjack.gamesLost = (userProfile.blackjack?.gamesLost || 0) + 1;
            break;
            
        case 'tie':
            updates.blackjack.gamesTied = (userProfile.blackjack?.gamesTied || 0) + 1;
            break;
    }
    
    return updateUserData(userId, updates);
}

// Game state storage - map of user ID to their current game
const activeGames = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play a game of blackjack!')
        .addSubcommand(subcommand =>
            subcommand
                .setName('play')
                .setDescription('Start a new blackjack game')
                .addIntegerOption(option =>
                    option.setName('bet')
                        .setDescription('Amount to bet')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View your blackjack statistics')),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        
        if (subcommand === 'stats') {
            // Initialize stats if they don't exist
            initGameStats(userId, 'blackjack', DEFAULT_BLACKJACK_STATS);
            const userProfile = getUserProfile(userId);
            const stats = userProfile.blackjack;
            
            const winRate = stats.gamesPlayed > 0 
                ? ((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(2)
                : '0.00';
            
            const embed = new EmbedBuilder()
                .setTitle('🎲 Blackjack Statistics')
                .setColor('#4169E1')
                .addFields(
                    { name: 'Games Played', value: `${stats.gamesPlayed}`, inline: true },
                    { name: 'Win Rate', value: `${winRate}%`, inline: true },
                    { name: 'Blackjacks', value: `${stats.blackjacks}`, inline: true },
                    { name: 'Games Won', value: `${stats.gamesWon}`, inline: true },
                    { name: 'Games Lost', value: `${stats.gamesLost}`, inline: true },
                    { name: 'Games Tied', value: `${stats.gamesTied}`, inline: true },
                    { name: 'Total Winnings', value: `${stats.totalWinnings}`, inline: true },
                    { name: 'Highest Win', value: `${stats.highestWin}`, inline: true }
                );
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (subcommand === 'play') {
            // Check if user is already in a game
            if (activeGames.has(userId)) {
                return interaction.reply({ 
                    content: 'You already have an active blackjack game!', 
                    ephemeral: true 
                });
            }
            
            const betAmount = interaction.options.getInteger('bet');
            const userProfile = getUserProfile(userId);
            
            // Validate bet amount
            if (betAmount <= 0) {
                return interaction.reply({ 
                    content: 'Your bet must be greater than 0!', 
                    ephemeral: true 
                });
            }
            
            if (betAmount > userProfile.balance) {
                return interaction.reply({ 
                    content: `You don't have enough coins! Your balance: ${userProfile.balance}. Use /balance to check your coins.`, 
                    ephemeral: true 
                });
            }
            
            // Initialize blackjack stats if they don't exist
            initGameStats(userId, 'blackjack', DEFAULT_BLACKJACK_STATS);
            
            // Create a new game
            const deck = createDeck();
            const playerHand = [deck.pop(), deck.pop()];
            const dealerHand = [deck.pop(), deck.pop()];
            
            const playerValue = calculateHandValue(playerHand);
            const dealerValue = calculateHandValue(dealerHand);
            
            // Store game state
            activeGames.set(userId, {
                deck,
                playerHand,
                dealerHand,
                betAmount,
                status: 'playing'
            });
            
            // Create game buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('blackjack_hit')
                        .setLabel('Hit')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('blackjack_stand')
                        .setLabel('Stand')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            // Create game embed
            const embed = createGameEmbed(playerHand, dealerHand, true, betAmount);
            
            // Check for natural blackjack
            if (playerValue === 21) {
                if (dealerValue === 21) {
                    // Both have blackjack, it's a tie
                    activeGames.delete(userId);
                    handleGameOutcome(userId, betAmount, 'tie');
                    
                    // Use new minimal result embed
                    const resultEmbed = createResultEmbed(playerHand, dealerHand, betAmount, 'tie', userProfile.balance);
                    
                    return interaction.reply({ embeds: [resultEmbed] });
                } else {
                    // Player has blackjack, dealer doesn't
                    activeGames.delete(userId);
                    const updatedProfile = handleGameOutcome(userId, betAmount, 'blackjack');
                    
                    // Use new minimal result embed
                    const resultEmbed = createResultEmbed(playerHand, dealerHand, betAmount, 'blackjack', updatedProfile.balance);
                    
                    return interaction.reply({ embeds: [resultEmbed] });
                }
            }
            
            // Normal gameplay continues
            await interaction.reply({ embeds: [embed], components: [row] });
            
            // Set up a collector for button interactions
            const filter = i => i.user.id === userId && 
                (i.customId === 'blackjack_hit' || i.customId === 'blackjack_stand');
            
            const collector = interaction.channel.createMessageComponentCollector({ 
                filter, 
                time: 60000 // 60 second timeout
            });
            
            collector.on('collect', async i => {
                const gameState = activeGames.get(userId);
                
                if (!gameState || gameState.status !== 'playing') {
                    return;
                }
                
                if (i.customId === 'blackjack_hit') {
                    // Player takes a card
                    const newCard = gameState.deck.pop();
                    gameState.playerHand.push(newCard);
                    
                    const playerValue = calculateHandValue(gameState.playerHand);
                    
                    // Update the embed
                    const embed = createGameEmbed(
                        gameState.playerHand, 
                        gameState.dealerHand, 
                        true, 
                        gameState.betAmount
                    );
                    
                    // Check if player busts
                    if (playerValue > 21) {
                        gameState.status = 'bust';
                        activeGames.delete(userId);
                        
                        const updatedProfile = handleGameOutcome(userId, gameState.betAmount, 'lose');
                        
                        // Use new minimal result embed for bust
                        const bustEmbed = createResultEmbed(
                            gameState.playerHand, 
                            gameState.dealerHand, 
                            gameState.betAmount, 
                            'bust', 
                            updatedProfile.balance
                        );
                        
                        await i.update({ embeds: [bustEmbed], components: [] });
                        collector.stop();
                    } else {
                        await i.update({ embeds: [embed], components: [row] });
                    }
                } 
                else if (i.customId === 'blackjack_stand') {
                    // Player stands, dealer's turn
                    gameState.status = 'dealer';
                    
                    // Reveal dealer's hand
                    let dealerValue = calculateHandValue(gameState.dealerHand);
                    
                    // Dealer draws cards until they have at least 17
                    while (dealerValue < 17) {
                        const newCard = gameState.deck.pop();
                        gameState.dealerHand.push(newCard);
                        dealerValue = calculateHandValue(gameState.dealerHand);
                    }
                    
                    const playerValue = calculateHandValue(gameState.playerHand);
                    
                    // Determine outcome
                    let outcome: 'win' | 'blackjack' | 'lose' | 'tie';
                    
                    if (dealerValue > 21) {
                        outcome = 'win';
                        const updatedProfile = handleGameOutcome(userId, gameState.betAmount, outcome);
                        
                        // Create modern result embed
                        const resultEmbed = createResultEmbed(
                            gameState.playerHand, 
                            gameState.dealerHand, 
                            gameState.betAmount, 
                            'win', 
                            updatedProfile.balance
                        );
                        
                        activeGames.delete(userId);
                        await i.update({ embeds: [resultEmbed], components: [] });
                    } else if (playerValue > dealerValue) {
                        outcome = 'win';
                        const updatedProfile = handleGameOutcome(userId, gameState.betAmount, outcome);
                        
                        // Create modern result embed
                        const resultEmbed = createResultEmbed(
                            gameState.playerHand, 
                            gameState.dealerHand, 
                            gameState.betAmount, 
                            'win', 
                            updatedProfile.balance
                        );
                        
                        activeGames.delete(userId);
                        await i.update({ embeds: [resultEmbed], components: [] });
                    } else if (playerValue < dealerValue) {
                        outcome = 'lose';
                        const updatedProfile = handleGameOutcome(userId, gameState.betAmount, outcome);
                        
                        // Create modern result embed
                        const resultEmbed = createResultEmbed(
                            gameState.playerHand, 
                            gameState.dealerHand, 
                            gameState.betAmount, 
                            'lose', 
                            updatedProfile.balance
                        );
                        
                        activeGames.delete(userId);
                        await i.update({ embeds: [resultEmbed], components: [] });
                    } else {
                        outcome = 'tie';
                        handleGameOutcome(userId, gameState.betAmount, outcome);
                        
                        // Create modern result embed
                        const resultEmbed = createResultEmbed(
                            gameState.playerHand, 
                            gameState.dealerHand, 
                            gameState.betAmount, 
                            'tie'
                        );
                        
                        activeGames.delete(userId);
                        await i.update({ embeds: [resultEmbed], components: [] });
                    }
                    
                    collector.stop();
                }
            });
            
            collector.on('end', async (collected, reason) => {
                if (reason === 'time' && activeGames.has(userId)) {
                    const gameState = activeGames.get(userId);
                    if (gameState.status === 'playing') {
                        // Timeout - player loses
                        const updatedProfile = handleGameOutcome(userId, gameState.betAmount, 'lose');
                        
                        // Create modern timeout result embed
                        const timeoutEmbed = createResultEmbed(
                            gameState.playerHand, 
                            gameState.dealerHand, 
                            gameState.betAmount, 
                            'timeout', 
                            updatedProfile.balance
                        );
                        
                        activeGames.delete(userId);
                        
                        await interaction.followUp({ 
                            content: `<@${userId}> Your blackjack game has timed out.`, 
                            embeds: [timeoutEmbed], 
                            components: [] 
                        });
                    }
                }
            });
        }
    }
};

// Helper functions for modern card visualization
function formatHandWithEmojis(hand, hideSecond = false) {
    if (hideSecond && hand.length > 1) {
        // Show first card and a face down card
        return `${formatCardModern(hand[0])} ${formatCardBack()}`;
    }
    
    return hand.map(card => formatCardModern(card)).join(' ');
}

function formatCardModern(card) {
    const suit = card.suit;
    const value = card.value;
    
    // Modern suit emoji mapping
    const suitEmoji = {
        '♠': '♠️',
        '♥': '♥️',
        '♦': '♦️',
        '♣': '♣️'
    };
    
    // Color coding based on suit
    const isRed = (suit === '♥' || suit === '♦');
    
    // Format the card with padding for alignment
    const displayValue = value.length === 1 ? `${value} ` : value;
    
    // Return a clean card representation with color coding via emoji
    return isRed ? `\`${displayValue}${suitEmoji[suit]}\`` : `\`${displayValue}${suitEmoji[suit]}\``;
}

// Format a card back (hidden card)
function formatCardBack() {
    return '`🂠`';
}

// Helper function to create game embed with minimal modern design
function createGameEmbed(playerHand, dealerHand, hideSecond, betAmount) {
    const playerValue = calculateHandValue(playerHand);
    const dealerValue = hideSecond ? null : calculateHandValue(dealerHand);
    
    // Status indicators
    const isBlackjack = playerValue === 21 && playerHand.length === 2;
    const isBust = playerValue > 21;
    
    // Create a clean, minimal embed
    let description = '';
    
    // Dealer section - clean and minimal
    description += `**Dealer** ${!hideSecond ? `· ${dealerValue}` : ''}\n`;
    description += formatHandWithEmojis(dealerHand, hideSecond);
    
    // Spacer for visual separation
    description += '\n\n';
    
    // Player section - clean with status indicator
    description += `**You** · ${playerValue}`;
    
    // Add subtle status indicators only when needed
    if (isBlackjack) {
        description += ' · Blackjack!';
    } else if (isBust) {
        description += ' · Bust';
    }
    
    description += '\n';
    description += formatHandWithEmojis(playerHand);
    
    // Clean bet display at bottom
    description += `\n\n📊 Bet: \`${betAmount} coins\``;
    
    // Modern color scheme
    let color;
    if (isBlackjack) {
        color = 0xF1C40F; // Gold for blackjack
    } else if (isBust) {
        color = 0xE74C3C; // Red for bust
    } else {
        color = 0x3498DB; // Blue for ongoing game
    }
    
    return new EmbedBuilder()
        .setTitle('Blackjack')
        .setDescription(description ?? null)
        .setColor(color)
        .setFooter({ 
            text: hideSecond ? 'Your turn' : 'Game finished'
        });
}

// Create a modern result embed
function createResultEmbed(playerHand, dealerHand, betAmount, result, balance: number | null | undefined = null) {
    // Start with the base game embed
    const embed = createGameEmbed(playerHand, dealerHand, false, betAmount);
    
    const playerValue = calculateHandValue(playerHand);
    const dealerValue = calculateHandValue(dealerHand);
    
    // Determine result details based on outcome
    let resultColor, resultIcon, resultText;
    
    switch(result) {
        case 'win':
            resultColor = 0x2ECC71; // Green
            resultIcon = '✅';
            resultText = `You win ${betAmount} coins`;
            embed.setTitle('You win!');
            break;
        case 'blackjack':
            resultColor = 0xF1C40F; // Gold
            resultIcon = '🌟';
            const winnings = Math.floor(betAmount * 1.5);
            resultText = `Blackjack! You win ${winnings} coins`;
            embed.setTitle('Blackjack!');
            break;
        case 'lose':
            resultColor = 0xE74C3C; // Red
            resultIcon = '❌';
            resultText = `You lose ${betAmount} coins`;
            embed.setTitle('Dealer wins');
            break;
        case 'bust':
            resultColor = 0xE74C3C; // Red
            resultIcon = '💥';
            resultText = `Bust! You lose ${betAmount} coins`;
            embed.setTitle('Bust!');
            break;
        case 'tie':
            resultColor = 0x95A5A6; // Gray
            resultIcon = '🔄';
            resultText = 'Push - bet returned';
            embed.setTitle('Tie');
            break;
        case 'timeout':
            resultColor = 0xE74C3C; // Red
            resultIcon = '⏱️';
            resultText = `Timeout - you lose ${betAmount} coins`;
            embed.setTitle('Game timed out');
            break;
    }
    
    // Clean modern layout with outcome and balance
    let description = embed.data.description;
    description += `\n\n${resultIcon} **${resultText}**`;
    
    if (balance !== null) {
        description += `\n💰 Balance: \`${balance} coins\``;
    }
    
    return embed
        .setDescription(description ?? null)
        .setColor(resultColor);
}