import { Client, Collection, Events, GatewayIntentBits, REST, Routes, Interaction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Initialize client with minimal required intents (only Guilds is required for slash commands)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

// Extend the Client interface to include commands
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, any>;
  }
}

// Initialize the commands collection
client.commands = new Collection();

// Function to load all commands
async function loadCommands() {
  const commandsPath = path.join(__dirname, 'Commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => 
    (file.endsWith('.js') || file.endsWith('.ts')) && !file.startsWith('Data') && !file.startsWith('reset')
  );

  const commands: any[] = [];

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
      console.log(`Loaded command: ${command.data.name}`);
    } else {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  }

  return commands;
}

// Register slash commands
async function registerCommands() {
  try {
    const commands = await loadCommands();
    
    console.log(`Started refreshing ${commands.length} application (/) commands.`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN || '');
    
    // Debug logging to help understand what environment variables are available
    console.log('Environment variables check:');
    console.log(`- DEV_MODE: ${process.env.DEV_MODE}`);
    console.log(`- GUILD_ID: ${process.env.GUILD_ID}`);
    console.log(`- CLIENT_ID: ${process.env.CLIENT_ID}`);
    
    // Convert DEV_MODE string to boolean
    const devMode = process.env.DEV_MODE?.toLowerCase() === 'true';
    const clientId = process.env.CLIENT_ID || '';
    const guildId = process.env.GUILD_ID;
    
    if (!clientId) {
      console.error('ERROR: CLIENT_ID is not configured in .env file');
      return;
    }
    
    // Only register guild commands if both GUILD_ID exists AND DEV_MODE is true
    if (devMode && guildId) {
      console.log('DEVELOPMENT MODE: Registering commands for development guild only');
      
      // Step 1: Clear any existing global commands first
      console.log('Step 1: Clearing any existing global commands...');
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: [] }
      );
      console.log('✓ Global commands cleared');
      
      // Step 2: Register commands to the development guild only
      console.log(`Step 2: Registering commands for guild ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`✓ Successfully registered ${commands.length} commands for guild ${guildId} only`);
    } else {
      console.log('PRODUCTION MODE: Registering global commands');
      
      // Step 1: Clear any existing guild commands if a guild ID is configured
      if (guildId) {
        console.log(`Step 1: Clearing any existing guild commands from ${guildId}...`);
        await rest.put(
          Routes.applicationGuildCommands(clientId, guildId),
          { body: [] }
        );
        console.log(`✓ Guild commands cleared from ${guildId}`);
      }
      
      // Step 2: Register global commands
      console.log('Step 2: Registering global commands...');
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log(`✓ Successfully registered ${commands.length} global application commands`);
    }
    
    console.log('Command registration complete!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, async (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  
  // Register commands
  await registerCommands();
  
  // Display a clear startup completion message with a timestamp
  const timestamp = new Date().toLocaleTimeString();
  console.log('\n===========================================');
  console.log(`🚀 BOT STARTUP COMPLETE AT ${timestamp}`);
  console.log(`🤖 ${c.user.tag} is online and ready!`);
  console.log('===========================================\n');
});

// Command handling
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // Handle slash commands
  if (interaction.isCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error);
      
      try {
        const errorMessage = { 
          content: 'There was an error while executing this command!', 
          flags: 64  // Using flags: 64 instead of ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      } catch (replyError) {
        console.error('Failed to send error response:', replyError);
      }
    }
  }
  
  // Handle component interactions (buttons, select menus)
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    try {
      // Try to handle trade interactions
      const tradeModule = require('./Commands/trade');
      if (tradeModule.handleTradeInteractions) {
        const handled = await tradeModule.handleTradeInteractions(interaction);
        if (handled) return; // If trade module handled it, we're done
      }
      
      // Handle other component interactions here if needed for other commands
      
    } catch (error) {
      console.error('Error handling component interaction:', error);
    }
  }
  
  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    try {
      // Handle trade modals (custom money amount, item quantity)
      const tradeModule = require('./Commands/trade');
      if (tradeModule.handleTradeModalSubmit) {
        const handled = await tradeModule.handleTradeModalSubmit(interaction);
        if (handled) return; // If trade module handled it, we're done
      }
      
      // Handle other modal submissions here if needed
      
    } catch (error) {
      console.error('Error handling modal submission:', error);
    }
  }
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);