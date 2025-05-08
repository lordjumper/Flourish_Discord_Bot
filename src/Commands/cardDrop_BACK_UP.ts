import { ActionRowBuilder, SlashCommandBuilder } from 'discord.js';
import { createCanvas, loadImage } from 'canvas';
import path from 'path';
import { AnimeCharacter, getRandomCharacters } from './Data/animeData';
import { getDropCooldownMinutes, getTotalPrints } from './Data/animeDataUtils';
import { addCardToCollection, canDropCards, updateLastCardDrop } from './Data/userData';

export const data = new SlashCommandBuilder()
    .setName('cards')
    .setDescription('Anime character card commands')
    .addSubcommand(subcommand =>
        subcommand
            .setName('drop')
            .setDescription('Drop some anime character cards to collect')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('collection')
            .setDescription('View your anime card collection')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('The user whose collection to view (defaults to yourself)')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('view')
            .setDescription('View details of a specific card in your collection')
            .addStringOption(option =>
                option
                    .setName('card_id')
                    .setDescription('The 4-digit ID of the card to view')
                    .setRequired(true)
            )
    );

export async function execute(interaction) {
    if (interaction.options.getSubcommand() === 'drop') {
        await handleCardDrop(interaction);
    } else if (interaction.options.getSubcommand() === 'collection') {
        const userId = interaction.user.id;
        const characterId = 'exampleCharacterId'; // Replace with the actual character ID
        const characterData = {
            name: 'Example Name', // Replace with the actual character name
            anime: 'Example Anime', // Replace with the actual anime name
            image_url: 'https://example.com/image.png' // Replace with the actual image URL
        };
        addCardToCollection(userId, characterId, characterData);
    } else if (interaction.options.getSubcommand() === 'view') {
        const cardId = interaction.options.getString('card_id');
        const { getUserCards } = require('./Data/userData');
        const cards = getUserCards(interaction.user.id);
        const cardFound = cards.find(card => card.uniqueId.slice(-4) === cardId);
        
        if (!cardFound) {
            return interaction.reply({
                content: `Could not find a card with ID ${cardId} in your collection.`,
                ephemeral: true
            });
        }
        
        await displayCardDetails(interaction, cardFound);
    }
}

// Handle the card drop command
async function handleCardDrop(interaction) {
    await interaction.deferReply();
    
    const userId = interaction.user.id;
    const cooldownMinutes = getDropCooldownMinutes();
    
    // Check if user is on cooldown
    if (!canDropCards(userId, cooldownMinutes)) {
        const user = await interaction.client.users.fetch(userId);
        return interaction.editReply({
            content: `You must wait ${cooldownMinutes} minutes between card drops! Try again later.`
        });
    }
    
    try {
        // Get 3 random characters
        const characters = await getRandomCharacters(3);
        
        // Create a canvas with the card drop
        const cardImage = await createCardDropImage(characters);
        
        // Update user's cooldown timestamp
        updateLastCardDrop(userId);
        
        // Send the drop as an attachment
        await interaction.editReply({
            content: `**${interaction.user.username}** just dropped some anime character cards!\n` +
                     `React with 1️⃣, 2️⃣, or 3️⃣ to collect the corresponding card! (First come, first served)\n` +
                     `The person who dropped the cards (${interaction.user}) gets first pick!`,
            files: [{ attachment: cardImage, name: 'card_drop.png' }]
        });
        
        // Get the sent message
        const message = await interaction.fetchReply();
        
        // Add reactions for collecting each card
        await message.react('1️⃣');
        await message.react('2️⃣');
        await message.react('3️⃣');
        
        // Set up collectors for each reaction
        const filter = (reaction, user) => {
            return ['1️⃣', '2️⃣', '3️⃣'].includes(reaction.emoji.name) && !user.bot;
        };
        
        // Create collector that lasts for 60 seconds
        const collector = message.createReactionCollector({ filter, time: 60000, dispose: true });
        
        const cardsClaimed = new Set(); // Track which cards have been claimed
        const claimedBy = {}; // Track who claimed each card
        
        // Handle collection
        collector.on('collect', async (reaction, user) => {
            // Get the card index based on reaction (0, 1, or 2)
            let cardIndex;
            if (reaction.emoji.name === '1️⃣') cardIndex = 0;
            else if (reaction.emoji.name === '2️⃣') cardIndex = 1;
            else if (reaction.emoji.name === '3️⃣') cardIndex = 2;
            else return;
            
            // Check if card is already claimed
            if (cardsClaimed.has(cardIndex)) {
                // Remove the user's reaction if the card is already claimed
                await reaction.users.remove(user.id);
                return;
            }
            
            // Give priority to the person who dropped the cards
            if (user.id !== interaction.user.id) {
                // Check if the dropper has reacted to this card
                const userReactions = message.reactions.cache.filter(r => 
                    ['1️⃣', '2️⃣', '3️⃣'].includes(r.emoji.name));
                
                for (const [emojiName, userReaction] of userReactions.entries()) {
                    const dropperReacted = userReaction.users.cache.has(interaction.user.id);
                    const isThisCard = 
                        (emojiName === '1️⃣' && cardIndex === 0) || 
                        (emojiName === '2️⃣' && cardIndex === 1) || 
                        (emojiName === '3️⃣' && cardIndex === 2);
                    
                    if (dropperReacted && isThisCard) {
                        // Dropper has priority
                        await reaction.users.remove(user.id);
                        return;
                    }
                }
            }
            
            // Mark the card as claimed
            cardsClaimed.add(cardIndex);
            claimedBy[cardIndex] = user.id;
            
            // Add card to user's collection with character data
            const card = characters[cardIndex];
            const characterData = {
                name: card.name,
                anime: card.anime || "Unknown Anime",
                image_url: card.image_url
            };
            
            addCardToCollection(user.id, card.id, characterData);
            
            // Get the print number for this card (we'll fetch it from the database)
            const printCount = getTotalPrints(card.id);
            
            // Notify in channel about card claim
            await interaction.followUp({
                content: `**${user.username}** claimed card #${cardIndex + 1}: ` +
                         `**${card.name}** (${card.alias}) from **${card.anime || "Unknown Anime"}**!\n` +
                         `This is print #${printCount} of this character!`
            });
        });
        
        // When the collector ends
        collector.on('end', async () => {
            let unclaimed: string[] = [];
            for (let i = 0; i < characters.length; i++) {
                if (!cardsClaimed.has(i)) {
                    unclaimed.push(`Card #${i + 1}: ${characters[i].name}`);
                }
            }
            
            if (unclaimed.length > 0) {
                await interaction.followUp({
                    content: `Some cards weren't claimed and have disappeared:\n${unclaimed.join('\n')}`
                });
            }
        });
        
    } catch (error) {
        console.error('Error in card drop command:', error);
        return interaction.editReply({
            content: 'There was an error while generating the card drop. Please try again later.'
        });
    }
}

// Create the card drop image with multiple characters
async function createCardDropImage(cards) {
    const canvas = createCanvas(1100, 480); // Increased canvas height from 450 to 480
    const ctx = canvas.getContext('2d');
    
    // Set background
    ctx.fillStyle = '#36393f'; // Discord dark theme background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw cards with full height - no title/subtitle text
    const cardWidth = 320;
    const cardHeight = 450; // Increased height from 420 to 450 to fill the frame
    const padding = 40;
    
    // Adjust starting X position to center cards
    let startX = (canvas.width - (cardWidth * 3 + padding * 2)) / 2;
    
    // Process each card - handle errors individually so one bad image doesn't break the whole drop
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const x = startX + (cardWidth + padding) * i;
        const y = 15; // Positioned closer to the top
        
        try {
            console.log(`Attempting to load image for ${card.name} from ${card.image_url}`);
            
            // Create a promise that resolves with a placeholder after a timeout
            const imageLoadPromise = new Promise<any>(async (resolve) => {
                try {
                    // Try loading the image with a timeout
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
                    
                    const image = await loadImage(card.image_url);
                    clearTimeout(timeoutId);
                    resolve(image);
                } catch (err) {
                    console.error(`Failed to load image for ${card.name}:`, err);
                    // Resolve with null to indicate failure
                    resolve(null);
                }
            });
            
            // Wait for the image or timeout
            const image = await imageLoadPromise;
            
            // Generate a unique frame style based on character
            const frameStyle = generateFrameStyle(card);
            
            // Draw the base image first (full card area)
            if (image) {
                // Draw the character image to fill the entire card area
                drawImageCovered(ctx, image, x, y, cardWidth, cardHeight);
                
                // Add a gradient overlay to improve text readability
                const gradient = ctx.createLinearGradient(x, y, x, y + cardHeight);
                gradient.addColorStop(0, `rgba(${frameStyle.r}, ${frameStyle.g}, ${frameStyle.b}, 0.7)`);
                gradient.addColorStop(0.2, `rgba(${frameStyle.r}, ${frameStyle.g}, ${frameStyle.b}, 0.1)`);
                gradient.addColorStop(0.8, `rgba(${frameStyle.r}, ${frameStyle.g}, ${frameStyle.b}, 0.1)`);
                gradient.addColorStop(1, `rgba(${frameStyle.r}, ${frameStyle.g}, ${frameStyle.b}, 0.7)`);
                ctx.fillStyle = gradient;
                ctx.fillRect(x, y, cardWidth, cardHeight);
            } else {
                // Failed to load image - draw placeholder with frame color
                ctx.fillStyle = `rgb(${frameStyle.r}, ${frameStyle.g}, ${frameStyle.b})`;
                ctx.fillRect(x, y, cardWidth, cardHeight);
                ctx.fillStyle = 'white';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`Image not available`, x + cardWidth / 2, y + cardHeight / 2 - 15);
                ctx.fillText(`for ${card.name}`, x + cardWidth / 2, y + cardHeight / 2 + 15);
            }
            
            // Draw decorative frame
            drawStylizedFrame(ctx, x, y, cardWidth, cardHeight, frameStyle);
            
            // Draw character name at the top with special styling
            ctx.fillStyle = 'white';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Draw name with a slight glow effect
            ctx.fillText(card.name, x + cardWidth / 2, y + 40);
            ctx.shadowBlur = 0; // Reset shadow
            
            // Draw anime name at bottom
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 3;
            let animeTitle = card.anime;
            if (animeTitle && animeTitle.length > 35) {
                animeTitle = animeTitle.substring(0, 32) + '...';
            } else if (!animeTitle) {
                animeTitle = "Unknown Anime";
            }
            ctx.fillText(animeTitle, x + cardWidth / 2, y + cardHeight - 20);
            ctx.shadowBlur = 0; // Reset shadow
            
            // Draw print/card number in the corner
            const printId = Math.floor(Math.random() * 9000) + 1000; // Example ID
            ctx.font = '12px Arial';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.textAlign = 'right';
            ctx.fillText(`${printId}-${i+1}`, x + cardWidth - 10, y + cardHeight - 5);
            
            // Add card ID for reference
            card.displayPosition = i + 1;
            card.frameColor = `rgb(${frameStyle.r}, ${frameStyle.g}, ${frameStyle.b})`;
        } catch (error) {
            // Extra safety - catch any unexpected errors
            console.error(`Error processing card ${card.name}:`, error);
            ctx.fillStyle = '#555555';
            ctx.fillRect(x, y, cardWidth, cardHeight);
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Error loading image`, x + cardWidth / 2, y + cardHeight / 2);
            ctx.fillText(card.name, x + cardWidth / 2, y + cardHeight - 40);
            
            // Add card ID for reference
            card.displayPosition = i + 1;
        }
    }
    
    return canvas.toBuffer();
}

// Draw character information at the bottom of the card
function drawCharacterInfo(ctx: any, character: AnimeCharacter, x: number, y: number, width: number, height: number) {
    const infoHeight = 100; // Height reserved for character info
    const infoY = y + height - infoHeight;

    // Draw background for the info section
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, infoY, width, infoHeight);

    // Set text styles
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';

    // Draw character name
    ctx.fillText(character.name, x + width / 2, infoY + 30);

    // Draw anime name
    ctx.font = '16px Arial';
    ctx.fillText(character.anime || 'Unknown Anime', x + width / 2, infoY + 60);
}

// Draw an image that covers the entire target area (similar to CSS background-size: cover)
function drawImageCovered(ctx: any, image: any, x: number, y: number, width: number, height: number) {
    // Save the current context state
    ctx.save();
    
    // Create a clipping path with rounded corners to match the frame
    const cornerRadius = 20; // Match the frame's corner radius
    
    // Define the clipping path (rounded rectangle)
    ctx.beginPath();
    ctx.moveTo(x + cornerRadius, y);
    ctx.lineTo(x + width - cornerRadius, y);
    ctx.arcTo(x + width, y, x + width, y + cornerRadius, cornerRadius);
    ctx.lineTo(x + width, y + height - cornerRadius);
    ctx.arcTo(x + width, y + height, x + width - cornerRadius, y + height, cornerRadius);
    ctx.lineTo(x + cornerRadius, y + height);
    ctx.arcTo(x, y + height, x, y + height - cornerRadius, cornerRadius);
    ctx.lineTo(x, y + cornerRadius);
    ctx.arcTo(x, y, x + cornerRadius, y, cornerRadius);
    ctx.closePath();
    
    // Apply the clipping path
    ctx.clip();
    
    // Calculate dimensions to maintain aspect ratio
    const aspectRatio = image.width / image.height;
    const targetAspectRatio = width / height;
    
    let drawWidth, drawHeight, drawX, drawY;
    
    // Make the image take up more space by increasing the scale factor
    const scaleFactor = 1.25; // Increased from 1.15 to 1.25 to make the image larger
    
    if (aspectRatio > targetAspectRatio) {
        // Image is wider than target area, crop sides and scale up
        drawHeight = height * scaleFactor;
        drawWidth = drawHeight * aspectRatio;
        drawX = x - (drawWidth - width) / 2;
        drawY = y - (drawHeight - height) / 2;
    } else {
        // Image is taller than target area, crop top/bottom and scale up
        drawWidth = width * scaleFactor;
        drawHeight = drawWidth / aspectRatio;
        drawX = x - (drawWidth - width) / 2;
        drawY = y - (drawHeight - height) / 2;
    }
    
    // Draw the image
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    
    // Apply brightness enhancement
    ctx.globalCompositeOperation = 'screen'; 
    ctx.fillStyle = 'rgba(75, 75, 75, 0.35)'; // Brightening overlay - adjust alpha for intensity
    ctx.fillRect(x, y, width, height);
    
    // Reset composite operation before applying gradient overlay
    ctx.globalCompositeOperation = 'source-over';
    
    // Create a gradient that only affects top and bottom (not center)
    const topGradientHeight = height * 0.2; // Top 20% of card
    const bottomGradientHeight = height * 0.2; // Bottom 20% of card
    
    // Apply top gradient
    const topGradient = ctx.createLinearGradient(x, y, x, y + topGradientHeight);
    topGradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    topGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGradient;
    ctx.fillRect(x, y, width, topGradientHeight);
    
    // Apply bottom gradient
    const bottomGradient = ctx.createLinearGradient(x, y + height - bottomGradientHeight, x, y + height);
    bottomGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGradient.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(x, y + height - bottomGradientHeight, width, bottomGradientHeight);
    
    // No overlay in the center area - keeping it clear
    
    // Add a subtle contrast enhancement
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(20, 20, 20, 0.1)';
    ctx.fillRect(x, y, width, height);
    
    // Restore the context state (removes clipping path and resets composite operations)
    ctx.restore();
}

// Draw a luxury card frame and return the color used
function drawLuxuryFrame(ctx, x, y, width, height) {
    // Collection of possible frame colors to randomly select from
    const frameColors = [
        '#FFD700', // Gold (default)
        '#FFD700', // Gold (increased chance)
        '#FFC125', // Golden orange
        '#E6BE8A', // Pale gold
        '#CFB53B', // Old gold
        '#D4AF37'  // Metallic gold
    ];
    
    // Randomly select a color from the collection (gold is most common)
    const frameColor = frameColors[Math.floor(Math.random() * frameColors.length)];
    const cornerRadius = 20; // Rounded corners
    
    // Draw the main rounded rectangle frame
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + cornerRadius, y);
    ctx.lineTo(x + width - cornerRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
    ctx.lineTo(x + width, y + height - cornerRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height);
    ctx.lineTo(x + cornerRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
    ctx.lineTo(x, y + cornerRadius);
    ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
    ctx.closePath();
    
    // Add shadow effect
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    
    // Draw outer frame with gradient
    const frameGradient = ctx.createLinearGradient(x, y, x + width, y + height);
    frameGradient.addColorStop(0, frameColor);
    frameGradient.addColorStop(0.5, '#FFFFFF'); // Highlight
    frameGradient.addColorStop(1, frameColor);
    
    ctx.strokeStyle = frameGradient;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
    
    // Draw a second inner frame (thinner)
    ctx.save();
    ctx.beginPath();
    const innerMargin = 4;
    ctx.moveTo(x + cornerRadius + innerMargin, y + innerMargin);
    ctx.lineTo(x + width - cornerRadius - innerMargin, y + innerMargin);
    ctx.quadraticCurveTo(x + width - innerMargin, y + innerMargin, x + width - innerMargin, y + cornerRadius + innerMargin);
    ctx.lineTo(x + width - innerMargin, y + height - cornerRadius - innerMargin);
    ctx.quadraticCurveTo(x + width - innerMargin, y + height - innerMargin, x + width - cornerRadius - innerMargin, y + height - innerMargin);
    ctx.lineTo(x + cornerRadius + innerMargin, y + height - innerMargin);
    ctx.quadraticCurveTo(x + innerMargin, y + height - innerMargin, x + innerMargin, y + height - cornerRadius - innerMargin);
    ctx.lineTo(x + innerMargin, y + cornerRadius + innerMargin);
    ctx.quadraticCurveTo(x + innerMargin, y + innerMargin, x + cornerRadius + innerMargin, y + innerMargin);
    ctx.closePath();
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    
    // Draw decorative corner embellishments
    const cornerSize = 35;
    const cornerOffset = 5;
    
    // Function to draw a corner embellishment
    const drawCornerEmbellishment = (cornerX, cornerY, rotation) => {
        ctx.save();
        ctx.translate(cornerX, cornerY);
        ctx.rotate(rotation * Math.PI / 2);
        
        // Draw the fancy corner design
        ctx.beginPath();
        
        // Outer corner line
        ctx.moveTo(0, -cornerSize);
        ctx.lineTo(0, 0);
        ctx.lineTo(-cornerSize, 0);
        
        // Decorative fleur
        ctx.moveTo(-cornerSize/2, -5);
        ctx.arc(-cornerSize/2, -5, 5, 0, Math.PI * 2);
        
        ctx.moveTo(-5, -cornerSize/2);
        ctx.arc(-5, -cornerSize/2, 5, 0, Math.PI * 2);
        
        // Draw the design
        ctx.strokeStyle = frameColor;
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Add small decorative dot
        ctx.beginPath();
        ctx.arc(-cornerSize/2, -cornerSize/2, 3, 0, Math.PI * 2);
        ctx.fillStyle = frameColor;
        ctx.fill();
        
        ctx.restore();
    };
    
    // Top-left corner
    drawCornerEmbellishment(x + cornerOffset, y + cornerOffset, 0);
    
    // Top-right corner
    drawCornerEmbellishment(x + width - cornerOffset, y + cornerOffset, 1);
    
    // Bottom-right corner
    drawCornerEmbellishment(x + width - cornerOffset, y + height - cornerOffset, 2);
    
    // Bottom-left corner
    drawCornerEmbellishment(x + cornerOffset, y + height - cornerOffset, 3);
    
    // Return the color used for this frame
    return frameColor;
}

// Helper to generate frame style based on character traits
function generateFrameStyle(card) {
    // Use character name to generate a consistent color
    let hash = 0;
    for (let i = 0; i < card.name.length; i++) {
        hash = card.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Get anime-based modifier
    let animeHash = 0;
    if (card.anime) {
        for (let i = 0; i < card.anime.length; i++) {
            animeHash = card.anime.charCodeAt(i) + ((animeHash << 5) - animeHash);
        }
    }
    
    // Create vibrant but not too bright colors
    const r = 50 + Math.abs((hash % 150));
    const g = 50 + Math.abs(((hash >> 8) % 150));
    const b = 50 + Math.abs(((animeHash >> 4) % 150));
    
    // Frame style (elegant, rustic, futuristic, etc.)
    const styles = ['elegant', 'magical', 'futuristic', 'nature', 'royal'];
    const frameType = styles[Math.abs(hash % styles.length)];
    
    // Return style object
    return {
        r, g, b,
        frameType,
        brightness: (r * 0.299 + g * 0.587 + b * 0.114) / 255
    };
}

// Draw a stylized frame on the card
function drawStylizedFrame(ctx, x, y, width, height, style) {
    // Set frame color
    const frameColor = `rgb(${style.r}, ${style.g}, ${style.b})`;
    const frameColorTransparent = `rgba(${style.r}, ${style.g}, ${style.b}, 0.5)`;
    
    // Draw main border (2px)
    ctx.lineWidth = 3;
    ctx.strokeStyle = frameColor;
    ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    
    // Add decorative elements based on frame type
    switch (style.frameType) {
        case 'elegant':
            // Draw elegant corners
            const cornerSize = 30;
            ctx.lineWidth = 2;
            
            // Top-left corner
            ctx.beginPath();
            ctx.moveTo(x + cornerSize, y + 3);
            ctx.lineTo(x + 3, y + 3);
            ctx.lineTo(x + 3, y + cornerSize);
            ctx.stroke();
            
            // Top-right corner
            ctx.beginPath();
            ctx.moveTo(x + width - cornerSize, y + 3);
            ctx.lineTo(x + width - 3, y + 3);
            ctx.lineTo(x + width - 3, y + cornerSize);
            ctx.stroke();
            
            // Bottom-left corner
            ctx.beginPath();
            ctx.moveTo(x + 3, y + height - cornerSize);
            ctx.lineTo(x + 3, y + height - 3);
            ctx.lineTo(x + cornerSize, y + height - 3);
            ctx.stroke();
            
            // Bottom-right corner
            ctx.beginPath();
            ctx.moveTo(x + width - 3, y + height - cornerSize);
            ctx.lineTo(x + width - 3, y + height - 3);
            ctx.lineTo(x + width - cornerSize, y + height - 3);
            ctx.stroke();
            
            // Add small flourishes
            ctx.lineWidth = 1;
            drawFlourish(ctx, x + 3, y + 3, cornerSize, 0, frameColor);
            drawFlourish(ctx, x + width - 3, y + 3, cornerSize, 1, frameColor);
            drawFlourish(ctx, x + 3, y + height - 3, cornerSize, 3, frameColor);
            drawFlourish(ctx, x + width - 3, y + height - 3, cornerSize, 2, frameColor);
            break;
            
        case 'magical':
            // Draw magical runes and symbols
            ctx.lineWidth = 2;
            
            // Draw glowing edges
            const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
            gradient.addColorStop(0, frameColorTransparent);
            gradient.addColorStop(0.5, frameColor);
            gradient.addColorStop(1, frameColorTransparent);
            ctx.strokeStyle = gradient;
            ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
            
            // Draw magical symbols in corners
            drawMagicalSymbol(ctx, x + 20, y + 20, frameColor);
            drawMagicalSymbol(ctx, x + width - 20, y + 20, frameColor);
            drawMagicalSymbol(ctx, x + 20, y + height - 20, frameColor);
            drawMagicalSymbol(ctx, x + width - 20, y + height - 20, frameColor);
            break;
            
        case 'futuristic':
            // Draw tech-style corners
            ctx.lineWidth = 1;
            const techSize = 40;
            
            // Draw circuit-like patterns
            drawTechPattern(ctx, x + 3, y + 3, techSize, 0, frameColor);
            drawTechPattern(ctx, x + width - techSize - 3, y + 3, techSize, 1, frameColor);
            drawTechPattern(ctx, x + 3, y + height - techSize - 3, techSize, 3, frameColor);
            drawTechPattern(ctx, x + width - techSize - 3, y + height - techSize - 3, techSize, 2, frameColor);
            break;
            
        case 'nature':
            // Nature-inspired frame with vines
            ctx.lineWidth = 1.5;
            drawNaturalPattern(ctx, x, y, width, height, frameColor);
            break;
            
        case 'royal':
            // Royal/ornate frame with crown-like elements
            ctx.lineWidth = 2;
            const royalSize = 35;
            drawRoyalPattern(ctx, x, y, width, height, royalSize, frameColor);
            break;
            
        default:
            // Basic frame
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);
    }
    
    // Add inner glow effect
    const innerGlow = ctx.createLinearGradient(x, y, x, y + height);
    innerGlow.addColorStop(0, `rgba(${style.r}, ${style.g}, ${style.b}, 0.2)`);
    innerGlow.addColorStop(0.5, `rgba(${style.r}, ${style.g}, ${style.b}, 0.05)`);
    innerGlow.addColorStop(1, `rgba(${style.r}, ${style.g}, ${style.b}, 0.2)`);
    
    ctx.fillStyle = innerGlow;
    ctx.fillRect(x + 3, y + 3, width - 6, height - 6);
}

// Helper for elegant frame
function drawFlourish(ctx, x, y, size, position, color) {
    const originalStroke = ctx.strokeStyle;
    ctx.strokeStyle = color;
    
    ctx.beginPath();
    
    switch (position) {
        case 0: // Top-left
            ctx.moveTo(x + 10, y + 5);
            ctx.bezierCurveTo(
                x + 15, y + 15, 
                x + 25, y + 15, 
                x + 30, y + 5
            );
            break;
        case 1: // Top-right
            ctx.moveTo(x - 10, y + 5);
            ctx.bezierCurveTo(
                x - 15, y + 15, 
                x - 25, y + 15, 
                x - 30, y + 5
            );
            break;
        case 2: // Bottom-right
            ctx.moveTo(x - 10, y - 5);
            ctx.bezierCurveTo(
                x - 15, y - 15, 
                x - 25, y - 15, 
                x - 30, y - 5
            );
            break;
        case 3: // Bottom-left
            ctx.moveTo(x + 10, y - 5);
            ctx.bezierCurveTo(
                x + 15, y - 15, 
                x + 25, y - 15, 
                x + 30, y - 5
            );
            break;
    }
    
    ctx.stroke();
    ctx.strokeStyle = originalStroke;
}

// Helper for magical frame
function drawMagicalSymbol(ctx, x, y, color) {
    const originalStroke = ctx.strokeStyle;
    ctx.strokeStyle = color;
    
    // Draw a magical symbol (pentagram-like)
    ctx.beginPath();
    const radius = 7;
    for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
        const nextIndex = (i + 2) % 5;
        const nextAngle = (nextIndex * 2 * Math.PI / 5) - Math.PI / 2;
        
        const startX = x + radius * Math.cos(angle);
        const startY = y + radius * Math.sin(angle);
        const endX = x + radius * Math.cos(nextAngle);
        const endY = y + radius * Math.sin(nextAngle);
        
        if (i === 0) {
            ctx.moveTo(startX, startY);
        }
        ctx.lineTo(endX, endY);
    }
    ctx.stroke();
    
    // Add circle
    ctx.beginPath();
    ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
    ctx.stroke();
    
    ctx.strokeStyle = originalStroke;
}

// Helper for futuristic frame
function drawTechPattern(ctx, x, y, size, position, color) {
    const originalStroke = ctx.strokeStyle;
    ctx.strokeStyle = color;
    
    // Draw tech lines based on position
    switch (position) {
        case 0: // Top-left
            ctx.beginPath();
            ctx.moveTo(x, y + 10);
            ctx.lineTo(x + 10, y + 10);
            ctx.lineTo(x + 10, y + 20);
            ctx.lineTo(x + 20, y + 20);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x + 5, y);
            ctx.lineTo(x + 5, y + 15);
            ctx.lineTo(x + 15, y + 15);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x + 15, y);
            ctx.lineTo(x + 15, y + 5);
            ctx.lineTo(x + 25, y + 5);
            ctx.stroke();
            break;
        
        case 1: // Top-right
            ctx.beginPath();
            ctx.moveTo(x + size, y + 10);
            ctx.lineTo(x + size - 10, y + 10);
            ctx.lineTo(x + size - 10, y + 20);
            ctx.lineTo(x + size - 20, y + 20);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x + size - 5, y);
            ctx.lineTo(x + size - 5, y + 15);
            ctx.lineTo(x + size - 15, y + 15);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x + size - 15, y);
            ctx.lineTo(x + size - 15, y + 5);
            ctx.lineTo(x + size - 25, y + 5);
            ctx.stroke();
            break;
            
        case 2: // Bottom-right
            ctx.beginPath();
            ctx.moveTo(x + size, y + size - 10);
            ctx.lineTo(x + size - 10, y + size - 10);
            ctx.lineTo(x + size - 10, y + size - 20);
            ctx.lineTo(x + size - 20, y + size - 20);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x + size - 5, y + size);
            ctx.lineTo(x + size - 5, y + size - 15);
            ctx.lineTo(x + size - 15, y + size - 15);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x + size - 15, y + size);
            ctx.lineTo(x + size - 15, y + size - 5);
            ctx.lineTo(x + size - 25, y + size - 5);
            ctx.stroke();
            break;
            
        case 3: // Bottom-left
            ctx.beginPath();
            ctx.moveTo(x, y + size - 10);
            ctx.lineTo(x + 10, y + size - 10);
            ctx.lineTo(x + 10, y + size - 20);
            ctx.lineTo(x + 20, y + size - 20);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x + 5, y + size);
            ctx.lineTo(x + 5, y + size - 15);
            ctx.lineTo(x + 15, y + size - 15);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x + 15, y + size);
            ctx.lineTo(x + 15, y + size - 5);
            ctx.lineTo(x + 25, y + size - 5);
            ctx.stroke();
            break;
    }
    
    ctx.strokeStyle = originalStroke;
}

// Helper for nature frame
function drawNaturalPattern(ctx, x, y, width, height, color) {
    const originalStroke = ctx.strokeStyle;
    ctx.strokeStyle = color;
    
    // Draw vine patterns in corners
    // Top left
    drawVine(ctx, x + 5, y + 5, 0, color);
    
    // Top right
    drawVine(ctx, x + width - 5, y + 5, 1, color);
    
    // Bottom left
    drawVine(ctx, x + 5, y + height - 5, 3, color);
    
    // Bottom right
    drawVine(ctx, x + width - 5, y + height - 5, 2, color);
    
    // Add subtle leaf pattern along edges
    const leafSpacing = 40;
    for (let i = leafSpacing; i < width - leafSpacing; i += leafSpacing) {
        drawLeaf(ctx, x + i, y + 5, 0, color);
        drawLeaf(ctx, x + i, y + height - 5, 2, color);
    }
    
    for (let i = leafSpacing; i < height - leafSpacing; i += leafSpacing) {
        drawLeaf(ctx, x + 5, y + i, 3, color);
        drawLeaf(ctx, x + width - 5, y + i, 1, color);
    }
    
    ctx.strokeStyle = originalStroke;
}

// Helper for drawing vine pattern
function drawVine(ctx, x, y, direction, color) {
    const originalStroke = ctx.strokeStyle;
    ctx.strokeStyle = color;
    
    ctx.beginPath();
    
    switch (direction) {
        case 0: // Top-left
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x + 15, y + 5,
                x + 20, y + 15,
                x + 30, y + 20
            );
            ctx.stroke();
            
            // Add small leaf
            ctx.beginPath();
            ctx.moveTo(x + 15, y + 5);
            ctx.bezierCurveTo(
                x + 20, y, 
                x + 25, y + 7,
                x + 20, y + 10
            );
            ctx.stroke();
            break;
            
        case 1: // Top-right
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x - 15, y + 5,
                x - 20, y + 15,
                x - 30, y + 20
            );
            ctx.stroke();
            
            // Add small leaf
            ctx.beginPath();
            ctx.moveTo(x - 15, y + 5);
            ctx.bezierCurveTo(
                x - 20, y, 
                x - 25, y + 7,
                x - 20, y + 10
            );
            ctx.stroke();
            break;
            
        case 2: // Bottom-right
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x - 15, y - 5,
                x - 20, y - 15,
                x - 30, y - 20
            );
            ctx.stroke();
            
            // Add small leaf
            ctx.beginPath();
            ctx.moveTo(x - 15, y - 5);
            ctx.bezierCurveTo(
                x - 20, y, 
                x - 25, y - 7,
                x - 20, y - 10
            );
            ctx.stroke();
            break;
            
        case 3: // Bottom-left
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x + 15, y - 5,
                x + 20, y - 15,
                x + 30, y - 20
            );
            ctx.stroke();
            
            // Add small leaf
            ctx.beginPath();
            ctx.moveTo(x + 15, y - 5);
            ctx.bezierCurveTo(
                x + 20, y, 
                x + 25, y - 7,
                x + 20, y - 10
            );
            ctx.stroke();
            break;
    }
    
    ctx.strokeStyle = originalStroke;
}

// Helper for drawing leaf pattern
function drawLeaf(ctx, x, y, direction, color) {
    const originalStroke = ctx.strokeStyle;
    ctx.strokeStyle = color;
    
    const size = 5;
    
    ctx.beginPath();
    
    switch (direction) {
        case 0: // Up
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x - size, y + size,
                x + size, y + size,
                x, y
            );
            break;
        case 1: // Right
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x - size, y - size,
                x - size, y + size,
                x, y
            );
            break;
        case 2: // Down
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x - size, y - size,
                x + size, y - size,
                x, y
            );
            break;
        case 3: // Left
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x + size, y - size,
                x + size, y + size,
                x, y
            );
            break;
    }
    
    ctx.stroke();
    ctx.strokeStyle = originalStroke;
}

// Helper for royal frame
function drawRoyalPattern(ctx, x, y, width, height, size, color) {
    const originalStroke = ctx.strokeStyle;
    ctx.strokeStyle = color;
    
    // Draw crown-like decorations on corners
    // Top edge decorations
    for (let i = x + 30; i < x + width - 30; i += 40) {
        drawCrownElement(ctx, i, y + 5, 0, color);
    }
    
    // Bottom edge decorations
    for (let i = x + 30; i < x + width - 30; i += 40) {
        drawCrownElement(ctx, i, y + height - 5, 2, color);
    }
    
    // Side edge decorations
    for (let i = y + 30; i < y + height - 30; i += 40) {
        drawCrownElement(ctx, x + 5, i, 3, color);
        drawCrownElement(ctx, x + width - 5, i, 1, color);
    }
    
    // Draw ornate corner designs
    drawOrnateCorner(ctx, x + 5, y + 5, 0, color); // Top-left
    drawOrnateCorner(ctx, x + width - 5, y + 5, 1, color); // Top-right
    drawOrnateCorner(ctx, x + width - 5, y + height - 5, 2, color); // Bottom-right
    drawOrnateCorner(ctx, x + 5, y + height - 5, 3, color); // Bottom-left
    
    ctx.strokeStyle = originalStroke;
}

// Helper for drawing crown elements
function drawCrownElement(ctx, x, y, direction, color) {
    const originalStroke = ctx.strokeStyle;
    ctx.strokeStyle = color;
    
    const size = 5;
    ctx.beginPath();
    
    switch (direction) {
        case 0: // Top
            ctx.moveTo(x - size, y);
            ctx.lineTo(x, y - size);
            ctx.lineTo(x + size, y);
            break;
        case 1: // Right
            ctx.moveTo(x, y - size);
            ctx.lineTo(x + size, y);
            ctx.lineTo(x, y + size);
            break;
        case 2: // Bottom
            ctx.moveTo(x - size, y);
            ctx.lineTo(x, y + size);
            ctx.lineTo(x + size, y);
            break;
        case 3: // Left
            ctx.moveTo(x, y - size);
            ctx.lineTo(x - size, y);
            ctx.lineTo(x, y + size);
            break;
    }
    
    ctx.stroke();
    ctx.strokeStyle = originalStroke;
}

// Helper for drawing ornate corners
function drawOrnateCorner(ctx, x, y, corner, color) {
    const originalStroke = ctx.strokeStyle;
    ctx.strokeStyle = color;
    
    const size = 15;
    ctx.beginPath();
    
    switch (corner) {
        case 0: // Top-left
            // Decorative curl
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x + 5, y + 10,
                x + 15, y + 5, 
                x + 20, y + 15
            );
            
            // Second decorative curl
            ctx.moveTo(x + 10, y);
            ctx.bezierCurveTo(
                x + 15, y + 5,
                x + 20, y, 
                x + 25, y + 10
            );
            break;
            
        case 1: // Top-right
            // Decorative curl
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x - 5, y + 10,
                x - 15, y + 5, 
                x - 20, y + 15
            );
            
            // Second decorative curl
            ctx.moveTo(x - 10, y);
            ctx.bezierCurveTo(
                x - 15, y + 5,
                x - 20, y, 
                x - 25, y + 10
            );
            break;
            
        case 2: // Bottom-right
            // Decorative curl
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x - 5, y - 10,
                x - 15, y - 5, 
                x - 20, y - 15
            );
            
            // Second decorative curl
            ctx.moveTo(x - 10, y);
            ctx.bezierCurveTo(
                x - 15, y - 5,
                x - 20, y, 
                x - 25, y - 10
            );
            break;
            
        case 3: // Bottom-left
            // Decorative curl
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x + 5, y - 10,
                x + 15, y - 5, 
                x + 20, y - 15
            );
            
            // Second decorative curl
            ctx.moveTo(x + 10, y);
            ctx.bezierCurveTo(
                x + 15, y - 5,
                x + 20, y, 
                x + 25, y - 10
            );
            break;
    }
    
    ctx.stroke();
    ctx.strokeStyle = originalStroke;
}

function displayCardDetails(interaction: any, cardFound: any) {
    throw new Error('Function not implemented.');
}
