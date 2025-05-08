import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
  console.error('Error: Missing TOKEN in .env file');
  process.exit(1);
}

if (!clientId) {
  console.error('Error: Missing CLIENT_ID in .env file');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

async function clearCommands() {
  try {
    // Clear commands based on command line arguments
    const args = process.argv.slice(2);
    const scope = args[0] || 'help';
    
    if (scope === 'help') {
      console.log(`
Command usage:
  npm run clear-commands guild    - Clear all commands in development guild
  npm run clear-commands global   - Clear all global commands
  npm run clear-commands all      - Clear both guild and global commands
      `);
      return;
    }
    
    if (scope === 'guild' || scope === 'all') {
      if (!guildId) {
        console.error('Error: Missing GUILD_ID in .env file for clearing guild commands');
        if (scope !== 'all') return;
      } else {
        console.log('Clearing guild-based commands...');
        try {
          await rest.put(Routes.applicationGuildCommands(clientId || '', guildId || ''), { body: [] });
          console.log('Successfully cleared all guild commands.');
        } catch (err) {
          console.error('Failed to clear guild commands:', err);
        }
      }
    }
    
    if (scope === 'global' || scope === 'all') {
      console.log('Clearing global commands...');
      try {
        await rest.put(Routes.applicationCommands(clientId || ''), { body: [] });
        console.log('Successfully cleared all global commands.');
      } catch (err) {
        console.error('Failed to clear global commands:', err);
      }
    }
    
    console.log('Done!');
  } catch (error) {
    console.error('Error clearing commands:', error);
  }
}

clearCommands();