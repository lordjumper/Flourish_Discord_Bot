import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong and latency information!'),
  
  async execute(interaction: CommandInteraction) {
    // Record the start time
    const startTime = Date.now();
    
    // Send an initial response
    await interaction.reply({ content: 'Calculating ping...' });
    const sent = await interaction.fetchReply();
    
    // Calculate round-trip latency based on message timestamps
    const roundTripLatency = sent.createdTimestamp - interaction.createdTimestamp;
    
    // Get WebSocket API latency
    const apiLatency = Math.round(interaction.client.ws.ping);
    
    // Create a fancy embed
    const embed = new EmbedBuilder()
      .setColor(0x3498DB) // Nice blue color
      .setTitle('🏓 Pong!')
      .setDescription('Bot latency information')
      .addFields(
        { name: '🤖 Round Trip Latency', value: `${roundTripLatency}ms`, inline: true },
        { name: '📡 API Latency', value: `${apiLatency}ms`, inline: true }
      )
      .setFooter({ text: 'Bot is online and working!' })
      .setTimestamp();
    
    // Determine status based on API latency (more reliable metric)
    if (apiLatency < 100) {
      embed.setColor(0x2ECC71); // Green for good latency
    } else if (apiLatency < 200) {
      embed.setColor(0xF1C40F); // Yellow for acceptable latency
    } else {
      embed.setColor(0xE74C3C); // Red for poor latency
    }
    
    // Send the embed
    await interaction.editReply({ content: null, embeds: [embed] });
  },
};