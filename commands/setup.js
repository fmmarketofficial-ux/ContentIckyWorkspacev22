const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
} = require("discord.js");
const { createOrUpdatePanel } = require("../util/panelManager.js");

// Ya no está hardcodeado, se carga desde los Secrets de Replit para mayor seguridad.
const OWNER_ID = process.env.OWNER_ID;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setup")
        .setDescription(
            "Crea el panel de control interactivo en un canal (Solo Propietario).",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("El canal donde se creará el panel.")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
        ),
    async execute(interaction) {
        // Comprobamos si el ID del propietario está configurado en los Secrets.
        if (!OWNER_ID) {
            return interaction.reply({
                content:
                    "❌ El `OWNER_ID` no está configurado en los Secrets del bot.",
                ephemeral: true,
            });
        }

        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content:
                    "❌ Este comando solo puede ser ejecutado por el propietario del bot.",
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.options.getChannel("channel");

        const result = await createOrUpdatePanel(
            interaction.client,
            channel.id,
        );

        if (result.error) {
            return interaction.editReply(
                `❌ Error al crear el panel: ${result.error}`,
            );
        }

        try {
            await interaction.editReply(
                `✅ Panel creado en ${channel}.\n**IMPORTANTE:** Copia estos IDs en los Secrets:\n- \`PANEL_CHANNEL_ID\`: \`${channel.id}\`\n- \`PANEL_MESSAGE_ID\`: \`${result.panelMessage.id}\`\n- \`OWNER_ID\`: \`Tu ID de usuario de Discord\``,
            );
        } catch (error) {
            console.error(error);
            await interaction.editReply(
                "❌ No pude enviar el mensaje en ese canal. ¿Tengo permisos?",
            );
        }
    },
};
