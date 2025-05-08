import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder, CommandInteraction } from 'discord.js';
import { getUserProfile } from './Data/userData';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your current coin balance'),

  async execute(interaction: CommandInteraction) {
    const userId = interaction.user.id;
    const userProfile = getUserProfile(userId);
    
    const embed = new EmbedBuilder()
      .setTitle('💰 Your Balance')
      .setDescription(`You currently have **${userProfile.balance}** coins`)
      .setColor(0xF1C40F) // Gold color
      .setFooter({ text: 'Earn coins by playing games and activities!' });
    
    // Add more details for visual appeal
    embed.addFields(
      { 
        name: 'Ways to earn coins', 
        value: '• Play `/blackjack`\n• Go `/fishing`\n• Use the `/shop`', 
        inline: true 
      },
      { 
        name: 'Current Balance', 
        value: `${userProfile.balance} 💰`, 
        inline: true 
      }
    );
    
    // Add a timestamp to show when this was checked
    embed.setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
};