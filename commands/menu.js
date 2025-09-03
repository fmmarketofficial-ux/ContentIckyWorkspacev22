const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('menu')
        .setDescription('Muestra el menú para obtener cuentas (requiere login).'),
    async execute(interaction) {
        if (!interaction.member.roles.cache.has(process.env.verifiedRoleId)) {
            return interaction.reply({ content: '❌ No tienes acceso. Usa `/login` primero.', ephemeral: true });
        }

        const embed = new EmbedBuilder().setColor('#3498db').setTitle('🚀 Panel de Cuentas').setDescription('Selecciona una categoría del menú desplegable para obtener una cuenta.');
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('account_select')
            .setPlaceholder('Elige un tipo de cuenta...')
            .addOptions(
                { label: 'FiveM', description: 'Obtener una cuenta para FiveM', value: 'FiveM', emoji: '🚗' },
                { label: 'Steam', description: 'Obtener una cuenta para Steam', value: 'Steam', emoji: '🎮' },
                { label: 'Discord', description: 'Obtener una cuenta para Discord', value: 'Discord', emoji: '💬' }
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    },
};