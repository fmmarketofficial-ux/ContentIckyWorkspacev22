const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDashboardStats } = require('../util/sheets.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Muestra las estadísticas de cuentas disponibles.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const stats = await getDashboardStats();

        if (stats) {
            const embed = new EmbedBuilder()
                .setColor('#1abc9c').setTitle('📊 Estadísticas de Inventario')
                .addFields(
                    { name: '🚗 FIVEM', value: `**Disponibles: ${stats.fivem.available}** / ${stats.fivem.total}`, inline: true },
                    { name: '💬 DISCORD', value: `**Disponibles: ${stats.discord.available}** / ${stats.discord.total}`, inline: true },
                    { name: '🎮 STEAM', value: `**Disponibles: ${stats.steam.available}** / ${stats.steam.total}`, inline: true }
                ).setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply({ content: '❌ No se pudieron obtener las estadísticas.' });
        }
    },
};