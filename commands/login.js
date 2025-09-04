const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} = require("discord.js");
module.exports = {
    data: new SlashCommandBuilder()
        .setName("login")
        .setDescription(
            "Inicia sesión con tu código de acceso para usar el panel.",
        ),
    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId("auth_modal")
            .setTitle("Verificación de Acceso");
        const codeInput = new TextInputBuilder()
            .setCustomId("auth_code_input")
            .setLabel("Introduce tu código de acceso")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    },
};
