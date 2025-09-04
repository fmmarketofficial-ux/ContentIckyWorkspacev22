const {
    Events,
    InteractionType,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const {
    verifyAuthCode,
    getAvailableAccount,
    addBanByEmail,
    addMultipleAccounts,
    releaseAccountByEmail,
} = require("../util/sheets.js");
const { getOtpFromWebmail } = require("../util/webmail.js");
const { createOrUpdatePanel } = require('../util/panelManager.js');
const axios = require("axios");

const cooldowns = new Map();

async function logAction(client, message) {
    try {
        const logChannel = await client.channels.fetch(
            process.env.logChannelId,
        );
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setDescription(message)
                .setColor("#f1c40f")
                .setTimestamp();
            logChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error("Error en logAction:", error);
    }
}

async function handleGetAccount(interaction, category, serverFilter = null) {
    const cooldownAmount = 10 * 1000;
    const now = Date.now();
    if (
        cooldowns.has(interaction.user.id) &&
        now < cooldowns.get(interaction.user.id)
    ) {
        const timeLeft = (cooldowns.get(interaction.user.id) - now) / 1000;
        await interaction.reply({
            content: `⏳ Debes esperar **${timeLeft.toFixed(1)} segundos** más.`,
            ephemeral: true,
        });
        return;
    }
    cooldowns.set(interaction.user.id, now + cooldownAmount);

    await interaction.deferReply({ ephemeral: true });

    try {
        const account = await getAvailableAccount(category, interaction.user, serverFilter);

        // --- INICIO DE LA CORRECCIÓN "UNDEFINED" ---
        if (!account) {
            let replyMessage = `❌ Lo sentimos, no hay cuentas de **${category}** disponibles en este momento.`;
            if (serverFilter) replyMessage += `\n*Que cumplan el filtro de no baneo en "${serverFilter}".*`;
            await interaction.editReply({ content: replyMessage, components: [] });
            await logAction(interaction.client, `⚠️ **${interaction.user.tag} (${interaction.user.id})** intentó obtener una cuenta de **${category}** (Sin stock o sin cumplir filtro).`);
            return; // Detenemos la ejecución aquí
        }
        // --- FIN DE LA CORRECCIÓN ---
    try {
        const account = await getAvailableAccount(
            category,
            interaction.user,
            serverFilter,
        );
        if (account) {
            const actionRow = new ActionRowBuilder();

            if (category === "Discord" && account.twoFactorToken) {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`get_2fa_${account.twoFactorToken}`)
                        .setLabel("Pedir 2FA")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("🔑"),
                );
            } else if (category === "FiveM") {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`get_otp_${account.email}_${account.pass}`)
                        .setLabel("Pedir OTP")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("🔑"),
                );
            }

            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`add_ban_${account.email}`)
                    .setLabel("Añadir Baneo")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji("🚫"),
                new ButtonBuilder()
                    .setCustomId(`release_account_${account.email}`)
                    .setLabel("Devolver Cuenta")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji("✅"),
            );

            const dmEmbed = new EmbedBuilder()
                .setColor("#2ecc71")
                .setTitle(`✅ Cuenta de ${category} Asignada`)
                .addFields(
                    {
                        name: "📧 Email / Usuario",
                        value: `\`\`\`${account.email}\`\`\``,
                    },
                    {
                        name: "🔑 Contraseña",
                        value: `\`\`\`${account.pass}\`\`\``,
                    },
                    {
                        name: "🚫 Baneos Conocidos",
                        value: `\`\`\`${account.bans}\`\`\``,
                    },
                )
                .setFooter({
                    text: "Puedes usar los botones de abajo para gestionar esta cuenta.",
                })
                .setTimestamp();

            try {
                await interaction.user.send({
                    embeds: [dmEmbed],
                    components: [actionRow],
                });
                let replyMessage = "✅ ¡Revisa tus mensajes privados!";
                if (serverFilter)
                    replyMessage += `\n*Filtrado para no baneadas en "${serverFilter}".*`;
                await interaction.editReply({
                    content: replyMessage,
                    components: [],
                });
                await logAction(
                    interaction.client,
                    `🧾 **${interaction.user.tag} (${interaction.user.id})** obtuvo una cuenta de **${category}**.`,
                );
            } catch {
                await interaction.editReply({
                    content:
                        "❌ No pude enviarte un DM. Revisa tu configuración de privacidad.",
                    components: [],
                });
            }
        } else {
            let replyMessage = `❌ No hay cuentas de **${category}** disponibles.`;
            if (serverFilter)
                replyMessage += `\n*Que cumplan el filtro de no baneo en "${serverFilter}".*`;
            await interaction.editReply({
                content: replyMessage,
                components: [],
            });
            await logAction(
                interaction.client,
                `⚠️ **${interaction.user.tag} (${interaction.user.id})** intentó obtener una cuenta de **${category}** (Sin stock o sin cumplir filtro).`,
            );
        }
    } catch (error) {
            console.error("--- ERROR FATAL EN handleGetAccount ---", error);
            await interaction.editReply({ content: '❌ **¡Error Crítico!** Revisa la consola de Replit.' });
        }
    }

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(
                interaction.commandName,
            );
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
            }
            return;
        }

        if (interaction.isButton()) {
            const buttonId = interaction.customId;

            if (interaction.inGuild()) {
                if (
                    !interaction.member.roles.cache.has(
                        process.env.verifiedRoleId,
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ **Acceso denegado.**\nDebes verificarte primero con `/login`.",
                        ephemeral: true,
                    });
                }
            }

            if (buttonId.startsWith("panel_get_")) {
                const category = buttonId.split("_").pop();
                const modal = new ModalBuilder()
                    .setCustomId(`filter_modal_${category}`)
                    .setTitle(`Obtener Cuenta de ${category}`);
                const serverInput = new TextInputBuilder()
                    .setCustomId("filter_server")
                    .setLabel("Servidor sin baneo (opcional)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder(
                        "Ej: DespistaosRP (déjalo en blanco si no importa)",
                    );
                modal.addComponents(
                    new ActionRowBuilder().addComponents(serverInput),
                );
                await interaction.showModal(modal);
            }

            if (buttonId === "panel_add_accounts") {
                const modal = new ModalBuilder()
                    .setCustomId("add_accounts_modal")
                    .setTitle("➕ Añadir Cuentas en Masa");
                const categoryInput = new TextInputBuilder()
                    .setCustomId("add_category")
                    .setLabel("Categoría (FiveM, Discord, o Steam)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder(
                        "Escribe exactamente el nombre de la hoja: FiveM",
                    );
                const accountsInput = new TextInputBuilder()
                    .setCustomId("add_accounts_list")
                    .setLabel("Lista de Cuentas")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder(
                        `FiveM/Steam -> email:pass
Discord -> E-Mail: user@mail.com | Pass: ... | 2FA: ...`,
                    );
                modal.addComponents(
                    new ActionRowBuilder().addComponents(categoryInput),
                    new ActionRowBuilder().addComponents(accountsInput),
                );
                await interaction.showModal(modal);
            }

            if (buttonId.startsWith("add_ban_")) {
                const email = buttonId.substring(8);
                const modal = new ModalBuilder()
                    .setCustomId(`add_ban_server_modal_${email}`)
                    .setTitle(`Añadir ban a: ${email.substring(0, 25)}...`);
                const serverInput = new TextInputBuilder()
                    .setCustomId("ban_server")
                    .setLabel("Nombre del servidor del baneo")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                modal.addComponents(
                    new ActionRowBuilder().addComponents(serverInput),
                );
                await interaction.showModal(modal);
            }

            if (buttonId.startsWith("release_account_")) {
                await interaction.deferUpdate();
                const email = buttonId.substring(16);
                const result = await releaseAccountByEmail(email);

                if (result.success) {
                    const originalMessage = interaction.message;
                    const disabledRow = ActionRowBuilder.from(
                        originalMessage.components[0],
                    );
                    disabledRow.components.forEach((component) =>
                        component.setDisabled(true),
                    );
                    disabledRow.components
                        .find((c) => c.customId.startsWith("release_account_"))
                        .setLabel("Cuenta Devuelta");

                    await originalMessage.edit({ components: [disabledRow] });
                    await interaction.followUp({
                        content: "✅ Cuenta devuelta con éxito.",
                        ephemeral: true,
                    });
                    await logAction(
                        interaction.client,
                        `✅ **${interaction.user.tag}** ha devuelto la cuenta \`${email}\`.`,
                    );
                } else {
                    await interaction.followUp({
                        content: `❌ ${result.message}`,
                        ephemeral: true,
                    });
                }
            }

            if (buttonId.startsWith("get_otp_")) {
                await interaction.reply({
                    content:
                        "🔑 Accediendo al webmail y buscando el código OTP... esto puede tardar unos segundos.",
                    ephemeral: true,
                });
                const parts = buttonId.split("_");
                const email = parts[2];
                const password = parts[3];
                const result = await getOtpFromWebmail(email, password);

                if (result.success) {
                    await interaction.editReply(
                        `✅ **Código OTP encontrado:** \`${result.code}\``,
                    );
                    await logAction(
                        interaction.client,
                        `🔑 **${interaction.user.tag}** ha obtenido un código OTP para la cuenta \`${email}\`.`,
                    );
                } else {
                    await interaction.editReply(
                        `❌ **Error:** ${result.error}`,
                    );
                }
            }

            if (buttonId.startsWith("get_2fa_")) {
                await interaction.reply({
                    content:
                        "🔑 Conectando a la API y pidiendo el código 2FA...",
                    ephemeral: true,
                });
                const token2FA = buttonId.substring(8);
                const apiUrl = `https://2fa.fb.rip/api/otp/${token2FA}`;

                try {
                    const response = await axios.get(apiUrl);
                    const otpCode = response.data.token;
                    if (otpCode) {
                        await interaction.editReply(
                            `✅ **Código 2FA obtenido:** \`${otpCode}\``,
                        );
                        await logAction(
                            interaction.client,
                            `🔑 **${interaction.user.tag}** ha obtenido un código 2FA.`,
                        );
                    } else {
                        await interaction.editReply(
                            `❌ **Error:** La API no devolvió un código válido.`,
                        );
                    }
                } catch (error) {
                    console.error(
                        "Error al llamar a la API de 2FA:",
                        error.message,
                    );
                    await interaction.editReply(
                        `❌ **Error:** No se pudo conectar con la API de 2FA. (Status: ${error.response ? error.response.status : "N/A"})`,
                    );
                }
            }
        }

        if (interaction.isModalSubmit()) {
            const modalId = interaction.customId;

            if (modalId.startsWith("filter_modal_")) {
                const category = modalId.split("_").pop();
                const serverFilter =
                    interaction.fields
                        .getTextInputValue("filter_server")
                        .trim() || null;
                await handleGetAccount(interaction, category, serverFilter);
            }

            if (modalId.startsWith("add_ban_server_modal_")) {
                await interaction.deferReply({ ephemeral: true });
                const email = modalId.substring(23);
                const server =
                    interaction.fields.getTextInputValue("ban_server");
                const result = await addBanByEmail(email, server);
                await interaction.editReply(result.message);

                if (result.success) {
                    await logAction(
                        interaction.client,
                        `🚫 **${interaction.user.tag}** ha añadido un ban de **${server}** a la cuenta \`${email}\`.`,
                    );
                    if (interaction.message) {
                        const originalMessage = interaction.message;
                        const newActionRow = ActionRowBuilder.from(
                            originalMessage.components[0],
                        );
                        const banButton = newActionRow.components.find((c) =>
                            c.customId.startsWith("add_ban_"),
                        );
                        if (banButton) banButton.setDisabled(true);
                        await originalMessage.edit({
                            components: [newActionRow],
                        });
                    }
                }
            }

            if (modalId === "add_accounts_modal") {
                await interaction.deferReply({ ephemeral: true });
                const category = interaction.fields
                    .getTextInputValue("add_category")
                    .trim();
                const accountsList =
                    interaction.fields.getTextInputValue("add_accounts_list");

                if (!["FiveM", "Discord", "Steam"].includes(category)) {
                    return interaction.editReply({
                        content: `❌ La categoría "${category}" no es válida. Debe ser "FiveM", "Discord", o "Steam".`,
                    });
                }
                const result = await addMultipleAccounts(
                    category,
                    accountsList,
                );
                if (result.error)
                    return interaction.editReply({
                        content: `❌ Error: ${result.message}`,
                    });
                let report = `✅ Proceso completado para **${category}**:\n- **Cuentas nuevas añadidas:** ${result.added}`;
                if (result.duplicates > 0) {
                    report += `\n- **Cuentas duplicadas ignoradas:** ${result.duplicates}`;
                }
                await interaction.editReply({ content: report });
            }

            // --- INICIO DE LA MEJORA DE REFRESCO ---
            // Si se añadieron cuentas, forzamos la actualización del panel
            if (result.added > 0) {
                const channelId = process.env.PANEL_CHANNEL_ID;
                const messageId = process.env.PANEL_MESSAGE_ID;
                if (channelId && messageId) {
                    await createOrUpdatePanel(interaction.client, channelId, messageId);
                    console.log("Panel actualizado tras añadir cuentas.");
                }
            }
            // --- FIN DE LA MEJORA DE REFRESCO ---
            await logAction(
                interaction.client,
                `➕ **${interaction.user.tag}** ha añadido **${result.added}** cuentas nuevas a **${category}**.`,
            );

            
            if (modalId === "auth_modal") {
                await interaction.deferReply({ ephemeral: true });
                const code =
                    interaction.fields.getTextInputValue("auth_code_input");
                const result = await verifyAuthCode(code, interaction.user.id);
                if (result.success) {
                    try {
                        const role = await interaction.guild.roles.fetch(
                            process.env.verifiedRoleId,
                        );
                        if (role) {
                            await interaction.member.roles.add(role);
                            await interaction.editReply({
                                content: `✅ ${result.message} Ahora puedes usar el panel.`,
                            });
                            await logAction(
                                interaction.client,
                                `🔑 **${interaction.user.tag}** se ha verificado.`,
                            );
                        }
                    } catch (e) {
                        await interaction.editReply({
                            content: "⚠️ Hubo un error al asignar el rol.",
                        });
                    }
                } else {
                    await interaction.editReply({
                        content: `❌ ${result.message}`,
                    });
                }
            }
        }
    },
};
