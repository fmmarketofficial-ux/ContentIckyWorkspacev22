const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const { getDashboardStats } = require("./sheets.js");

// --- EMOJIS CORREGIDOS ---
const EMOJIS = {
    fivem: "1412905986598895626",
    discord: "1412905987899133965",
    steam: "1412905989350621229",
    pack: "1413217971324719124",
    add: "1413208229030400170", // Emoji corregido para "Añadir Cuentas"
};

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
            "Haz clic en un botón para obtener una cuenta o un pack completo.",
        )
        .setFooter({ text: "Las estadísticas se actualizan cada minuto." })
        .setTimestamp();

    for (const [key, data] of Object.entries(stats)) {
        const lines = [];
        // --- INICIO DE LA CORRECCIÓN DEL CRASH ---
        // Ahora el valor del campo nunca estará vacío.
        if (data.available === 0) {
            lines.push("*No hay cuentas disponibles.*");
        } else {
            lines.push(`**Cuentas sin ningún baneo:** ${data.fullyAvailable}`);
            if (data.bannedOn.size > 0) {
                lines.push("\u200b"); // Espacio en blanco para separar
                lines.push("**Disponibles con baneo en:**");
                for (const [server, count] of data.bannedOn.entries()) {
                    lines.push(`- \`${server}\`: ${count}`);
                }
            }
        }
        const fieldValue = lines.join("\n");
        // --- FIN DE LA CORRECCIÓN DEL CRASH ---

        embed.addFields({
            name: `<:${key}:${EMOJIS[key]}> ${key.toUpperCase()}`,
            value: fieldValue,
            inline: true,
        });
    }

    // --- BOTONES CORREGIDOS ---
    // Ahora se crean dos filas de botones para que quepan todos.
    const row1 = new ActionRowBuilder().addComponents(
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
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("panel_get_pack")
            .setLabel("El Pack")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(EMOJIS.pack),
        new ButtonBuilder()
            .setCustomId("panel_add_accounts")
            .setLabel("Añadir Cuentas")
            .setStyle(ButtonStyle.Success)
            .setEmoji(EMOJIS.add),
    );

    try {
        const channel = await client.channels.fetch(channelId);
        // Ahora pasamos un array con las dos filas de botones
        if (messageId) {
            const message = await channel.messages.fetch(messageId);
            await message.edit({ embeds: [embed], components: [row1, row2] });
            return { success: true };
        } else {
            const panelMessage = await channel.send({
                embeds: [embed],
                components: [row1, row2],
            });
            return { success: true, panelMessage };
        }
    } catch (error) {
        console.error("Error en createOrUpdatePanel:", error.message);
        return { error: "No se pudo crear/actualizar el panel." };
    }
}

module.exports = { createOrUpdatePanel };
