const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const { getDashboardStats } = require("./sheets.js");

// La constante de Emojis debe estar aquí, a nivel global del archivo.
const EMOJIS = {
    fivem: "1412905986598895626",
    discord: "1412905987899133965",
    steam: "1412905989350621229",
    mas: "1337064960701763594",
};

// La función debe ser declarada antes de ser exportada.
async function createOrUpdatePanel(client, channelId, messageId = null) {
    const stats = await getDashboardStats();
    if (!stats) {
        console.error("No se pudieron obtener las estadísticas para el panel.");
        return { error: "No se pudieron obtener las estadísticas." };
    }

    const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("Panel de Control de Cuentas")
        .setDescription(
            "Haz clic en un botón para obtener una cuenta de esa categoría.\n\n**Estadísticas de Cuentas Disponibles:**",
        )
        .setFooter({ text: "Las estadísticas se actualizan cada 5 minutos." })
        .setTimestamp();

    for (const [key, data] of Object.entries(stats)) {
        const lines = [`**Cuentas sin ningún baneo:** ${data.fullyAvailable}`];
        if (data.bannedOn.size > 0) {
            lines.push("\u200b"); // Espacio en blanco para separar
            lines.push("**Disponibles con baneo en:**");
            for (const [server, count] of data.bannedOn.entries()) {
                lines.push(`- \`${server}\`: ${count}`);
            }
        }
        const fieldValue = lines.join("\n");
        embed.addFields({
            name: `<:${key}:${EMOJIS[key]}> ${key.toUpperCase()}`,
            value: fieldValue,
            inline: true,
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("panel_get_fivem")
            .setLabel("FiveM")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(EMOJIS.fivem),
        new ButtonBuilder()
            .setCustomId("panel_get_discord")
            .setLabel("Discord")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(EMOJIS.discord),
        new ButtonBuilder()
            .setCustomId("panel_get_steam")
            .setLabel("Steam")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(EMOJIS.steam),
        new ButtonBuilder()
            .setCustomId("panel_add_accounts")
            .setLabel("Añadir Cuentas")
            .setStyle(ButtonStyle.Success)
            .setEmoji(EMOJIS.mas),
    );

    try {
        const channel = await client.channels.fetch(channelId);
        if (messageId) {
            const message = await channel.messages.fetch(messageId);
            await message.edit({ embeds: [embed], components: [row] });
            return { success: true };
        } else {
            const panelMessage = await channel.send({
                embeds: [embed],
                components: [row],
            });
            return { success: true, panelMessage };
        }
    } catch (error) {
        console.error("Error en createOrUpdatePanel:", error.message);
        return {
            error: "No se pudo crear o actualizar el panel. Revisa los permisos y los IDs.",
        };
    }
}

// La exportación debe estar al final, después de haber declarado todo.
module.exports = { createOrUpdatePanel };
