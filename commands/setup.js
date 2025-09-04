const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const { getDashboardStats } = require("../util/sheets.js");

const OWNER_ID = "1246475575888052350"; // Tu ID de propietario

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setup")
        .setDescription(
            "Crea el panel de control interactivo en un canal (Solo Propietario).",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Sigue siendo necesario para que aparezca solo a admins
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("El canal donde se creará el panel.")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
        ),
    async execute(interaction) {
        // --- INICIO DE LA MODIFICACIÓN ---
        // Comprobamos si el usuario que ejecuta el comando es el propietario
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content:
                    "❌ Este comando solo puede ser ejecutado por el propietario del bot.",
                ephemeral: true,
            });
        }
        // --- FIN DE LA MODIFICACIÓN ---

        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.options.getChannel("channel");

        // ... (el resto del código se mantiene igual que antes)
        const stats = await getDashboardStats();
        if (!stats)
            return interaction.editReply(
                "❌ No se pudieron obtener las estadísticas iniciales.",
            );

        const embed = new EmbedBuilder()
            .setColor("#0099ff")
            .setTitle("Panel de Control de Cuentas")
            .setDescription(
                "Haz clic en un botón para obtener una cuenta de esa categoría.\n\n**Estadísticas de Cuentas Disponibles:**",
            )
            .addFields(
                {
                    name: "<:fivem:1199780732411858944> FIVEM",
                    value: `Disponibles: **${stats.fivem.available}**`,
                    inline: true,
                },
                {
                    name: "<:discord:1309247066660143284> DISCORD",
                    value: `Disponibles: **${stats.discord.available}**`,
                    inline: true,
                },
                {
                    name: "<:steam:1324741325324550166> STEAM",
                    value: `Disponibles: **${stats.steam.available}**`,
                    inline: true,
                },
            )
            .setFooter({
                text: "Las estadísticas se actualizan automáticamente.",
            })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("panel_get_fivem")
                .setLabel("FiveM")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("1199780732411858944"),
            new ButtonBuilder()
                .setCustomId("panel_get_discord")
                .setLabel("Discord")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("1309247066660143284"),
            new ButtonBuilder()
                .setCustomId("panel_get_steam")
                .setLabel("Steam")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("1324741325324550166"),
            new ButtonBuilder()
                .setCustomId("panel_add_accounts")
                .setLabel("Añadir Cuentas")
                .setStyle(ButtonStyle.Success)
                .setEmoji("➕"),
        );

        try {
            const panelMessage = await channel.send({
                embeds: [embed],
                components: [row],
            });
            await interaction.editReply(
                `✅ Panel creado en ${channel}.\n**IMPORTANTE:** Copia estos IDs en los Secrets:\n- \`PANEL_CHANNEL_ID\`: \`${channel.id}\`\n- \`PANEL_MESSAGE_ID\`: \`${panelMessage.id}\``,
            );
        } catch (error) {
            console.error(error);
            await interaction.editReply(
                "❌ No pude enviar el mensaje en ese canal. ¿Tengo permisos?",
            );
        }
    },
};
