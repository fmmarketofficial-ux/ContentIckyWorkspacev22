const {
    Events,
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
    getAccountPack,
} = require("../util/sheets.js");
const { getOtpFromWebmail } = require("../util/webmail.js");
const { createOrUpdatePanel } = require("../util/panelManager.js");
const { EMOJIS, STATUS_EMOJIS } = require("../util/constants.js");
const axios = require("axios");

const activeRequests = new Set();
const cooldowns = new Map();
const formatEmoji = (id, animated = false) =>
    `<${animated ? "a" : ""}:${id}:${id}>`;

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
    const userId = interaction.user.id;
    if (activeRequests.has(userId)) {
        return interaction.reply({
            content: `${formatEmoji(STATUS_EMOJIS.loading, true)} Ya tienes una petición en curso...`,
            ephemeral: true,
        });
    }

    try {
        activeRequests.add(userId);
        const cooldownAmount = 10 * 1000;
        const now = Date.now();
        if (cooldowns.has(userId) && now < cooldowns.get(userId)) {
            const timeLeft = (cooldowns.get(userId) - now) / 1000;
            return interaction.reply({
                content: `${formatEmoji(STATUS_EMOJIS.loading, true)} Debes esperar **${timeLeft.toFixed(1)} segundos** más.`,
                ephemeral: true,
            });
        }
        cooldowns.set(userId, now + cooldownAmount);

        await interaction.deferReply({ ephemeral: true });
        const account = await getAvailableAccount(
            category,
            interaction.user,
            serverFilter,
        );

        if (!account) {
            let replyMessage = `${formatEmoji(STATUS_EMOJIS.error)} No hay cuentas de **${category}** disponibles.`;
            if (serverFilter) replyMessage += `\n*Filtro: "${serverFilter}".*`;
            await interaction.editReply({
                content: replyMessage,
                components: [],
            });
            return;
        }

        const actionRow = new ActionRowBuilder();
        const lowerCategory = category.toLowerCase();

        if (lowerCategory === "discord" && account.twoFactorToken) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`get_2fa_${account.twoFactorToken}`)
                    .setLabel("Pedir 2FA")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(EMOJIS.otp),
            );
        } else if (lowerCategory === "fivem") {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`get_otp_${account.email}_${account.pass}`)
                    .setLabel("Pedir OTP")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(EMOJIS.otp),
            );
        }

        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`add_ban_${account.email}`)
                .setLabel("Añadir Baneo")
                .setStyle(ButtonStyle.Danger)
                .setEmoji(EMOJIS.ban),
            new ButtonBuilder()
                .setCustomId(`release_account_${account.email}`)
                .setLabel("Devolver Cuenta")
                .setStyle(ButtonStyle.Success)
                .setEmoji(EMOJIS.check),
        );

        const dmEmbed = new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle(
                `${formatEmoji(STATUS_EMOJIS.success)} Cuenta de ${category} Asignada`,
            )
            .addFields(
                {
                    name: `<:${EMOJIS.mail}:${EMOJIS.mail}> Email / Usuario`,
                    value: `\`\`\`${account.email}\`\`\``,
                },
                {
                    name: `<:${EMOJIS.password}:${EMOJIS.password}> Contraseña`,
                    value: `\`\`\`${account.pass}\`\`\``,
                },
                {
                    name: `<:${EMOJIS.ban}:${EMOJIS.ban}> Baneos Conocidos`,
                    value: `\`\`\`${account.bans}\`\`\``,
                },
            )
            .setFooter({
                text: "Puedes usar los botones de abajo para gestionar esta cuenta.",
            })
            .setTimestamp();

        await interaction.user.send({
            embeds: [dmEmbed],
            components: [actionRow],
        });
        let replyMessage = `${formatEmoji(STATUS_EMOJIS.success)} ¡Revisa tus mensajes privados!`;
        if (serverFilter)
            replyMessage += `\n*Filtrado para no baneadas en "${serverFilter}".*`;
        await interaction.editReply({ content: replyMessage });
    } catch (error) {
        console.error(
            `--- ERROR FATAL EN handleGetAccount para ${category} ---`,
            error,
        );
        const errorMsg = `${formatEmoji(STATUS_EMOJIS.error)} **¡Error Crítico!** Revisa la consola.`;
        if (!interaction.replied && !interaction.deferred)
            await interaction.reply({ content: errorMsg, ephemeral: true });
        else await interaction.editReply({ content: errorMsg });
    } finally {
        activeRequests.delete(userId);
    }
}

async function handleGetPack(interaction, serverFilter = null) {
    const userId = interaction.user.id;
    if (activeRequests.has(userId)) {
        return interaction.reply({
            content: `${formatEmoji(STATUS_EMOJIS.loading, true)} Ya tienes una petición en curso...`,
            ephemeral: true,
        });
    }
    try {
        activeRequests.add(userId);
        const cooldownAmount = 20 * 1000;
        const now = Date.now();
        if (cooldowns.has(userId) && now < cooldowns.get(userId)) {
            const timeLeft = (cooldowns.get(userId) - now) / 1000;
            return interaction.reply({
                content: `${formatEmoji(STATUS_EMOJIS.loading, true)} Debes esperar **${timeLeft.toFixed(1)} segundos** para pedir otro pack.`,
                ephemeral: true,
            });
        }
        cooldowns.set(userId, now + cooldownAmount);
        await interaction.deferReply({ ephemeral: true });
        const result = await getAccountPack(interaction.user, serverFilter);
        if (!result.success) {
            return interaction.editReply({
                content: `${formatEmoji(STATUS_EMOJIS.error)} **Error al generar el pack:** ${result.error}`,
            });
        }
        const { pack } = result;
        await interaction.editReply(
            `${formatEmoji(STATUS_EMOJIS.success)} ¡Pack generado! Revisa tus mensajes privados...`,
        );
        const packEmails = Object.values(pack)
            .map((acc) => acc.email)
            .join(",");
        let dmContent = `**<:${EMOJIS.pack}:${EMOJIS.pack}> Aquí tienes tu pack de cuentas:**\n\n`;
        dmContent += `**<:${EMOJIS.fivem}:${EMOJIS.fivem}> FiveM:** \`${pack.FiveM.email}\`:\`${pack.FiveM.pass}\`\n`;
        dmContent += `**<:${EMOJIS.discord}:${EMOJIS.discord}> Discord:** \`${pack.Discord.email}\`:\`${pack.Discord.pass}\`\n`;
        dmContent += `**<:${EMOJIS.steam}:${EMOJIS.steam}> Steam:** \`${pack.Steam.email}\`:\`${pack.Steam.pass}\`\n`;
        await interaction.user.send({ content: dmContent });
        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pack_otp_${pack.FiveM.email}_${pack.FiveM.pass}`)
                .setLabel("OTP FiveM")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(EMOJIS.otp),
            new ButtonBuilder()
                .setCustomId(`pack_2fa_${pack.Discord.twoFactorToken}`)
                .setLabel("2FA Discord")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(EMOJIS.otp),
            new ButtonBuilder()
                .setCustomId(`pack_add_ban_${packEmails}`)
                .setLabel("Añadir Baneo")
                .setStyle(ButtonStyle.Danger)
                .setEmoji(EMOJIS.ban),
            new ButtonBuilder()
                .setCustomId(`pack_release_${packEmails}`)
                .setLabel("Devolver Pack")
                .setStyle(ButtonStyle.Success)
                .setEmoji(EMOJIS.check),
        );
        await interaction.user.send({
            content: "**Panel de Control para tu Pack:**",
            components: [actionRow],
        });
    } catch (error) {
        console.error("Error enviando el pack:", error);
        await interaction.editReply(
            `${formatEmoji(STATUS_EMOJIS.error)} No pude enviarte todos los DMs del pack.`,
        );
    } finally {
        activeRequests.delete(userId);
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
        if (interaction.inGuild()) {
            if (
                !interaction.member.roles.cache.has(process.env.verifiedRoleId)
            ) {
                if (
                    interaction.isModalSubmit() &&
                    interaction.customId === "auth_modal"
                ) {
                } else {
                    return interaction.reply({
                        content: `${formatEmoji(STATUS_EMOJIS.error)} **Acceso denegado.**\nDebes verificarte con \`/login\`.`,
                        ephemeral: true,
                    });
                }
            }
        }
        if (interaction.isButton()) {
            const [action, ...args] = interaction.customId.split("_");
            switch (action) {
                case "panel":
                    if (args[0] === "get" && args[1] === "pack") {
                        const modal = new ModalBuilder()
                            .setCustomId(`filter_modal_pack`)
                            .setTitle(`Obtener Pack Completo`);
                        const serverInput = new TextInputBuilder()
                            .setCustomId("filter_server")
                            .setLabel("Servidor sin baneo (opcional)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false);
                        modal.addComponents(
                            new ActionRowBuilder().addComponents(serverInput),
                        );
                        await interaction.showModal(modal);
                    } else if (args[0] === "add" && args[1] === "accounts") {
                        await interaction.reply({
                            content: `${formatEmoji(STATUS_EMOJIS.success)} Te he enviado un mensaje privado para continuar.`,
                            ephemeral: true,
                        });
                        const embed = new EmbedBuilder()
                            .setColor("#2ecc71")
                            .setTitle(
                                `${formatEmoji(EMOJIS.add)} Añadir Cuentas en Masa`,
                            )
                            .setDescription(
                                "Selecciona la categoría de las cuentas que deseas añadir.",
                            );
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("add_category_FiveM")
                                .setLabel("FiveM")
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji(EMOJIS.fivem),
                            new ButtonBuilder()
                                .setCustomId("add_category_Discord")
                                .setLabel("Discord")
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji(EMOJIS.discord),
                            new ButtonBuilder()
                                .setCustomId("add_category_Steam")
                                .setLabel("Steam")
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji(EMOJIS.steam),
                        );
                        await interaction.user.send({
                            embeds: [embed],
                            components: [row],
                        });
                    } else if (args[0] === "get") {
                        const category = args[1];
                        const modal = new ModalBuilder()
                            .setCustomId(`filter_modal_${category}`)
                            .setTitle(`Obtener Cuenta de ${category}`);
                        const serverInput = new TextInputBuilder()
                            .setCustomId("filter_server")
                            .setLabel("Servidor sin baneo (opcional)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false);
                        modal.addComponents(
                            new ActionRowBuilder().addComponents(serverInput),
                        );
                        await interaction.showModal(modal);
                    }
                    break;
                case "add":
                    if (args[0] === "category") {
                        const category = args[1];
                        const format =
                            category === "Discord"
                                ? "`E-Mail: mail | Pass: pass | 2FA Token: token`"
                                : "`usuario:contraseña`";
                        const embed = new EmbedBuilder()
                            .setColor("#3498db")
                            .setTitle(`Añadir Cuentas de ${category}`)
                            .setDescription(
                                `Sube un \`.txt\` con una cuenta por línea en el formato:\n${format}`,
                            );
                        await interaction.update({
                            embeds: [embed],
                            components: [],
                        });
                        const channel = await interaction.client.channels.fetch(
                            interaction.channelId,
                        );
                        if (!channel)
                            return console.error(
                                `No se pudo encontrar el canal de DM para ${interaction.user.id}`,
                            );
                        const filter = (m) =>
                            m.author.id === interaction.user.id &&
                            m.attachments.size > 0 &&
                            m.attachments.first().name.endsWith(".txt");
                        try {
                            const collector = channel.createMessageCollector({
                                filter,
                                time: 300000,
                                max: 1,
                            });
                            collector.on("collect", async (msg) => {
                                const file = msg.attachments.first();
                                try {
                                    const response = await axios.get(file.url);
                                    const accountsList = response.data;
                                    const result = await addMultipleAccounts(
                                        category,
                                        accountsList,
                                    );
                                    if (result.error)
                                        return msg.reply(
                                            `${formatEmoji(STATUS_EMOJIS.error)} Error: ${result.message}`,
                                        );
                                    let report = `${formatEmoji(STATUS_EMOJIS.success)} Proceso completado para **${category}**:\n- Cuentas añadidas: ${result.added}\n- Duplicadas ignoradas: ${result.duplicates}`;
                                    await msg.reply(report);
                                    if (result.added > 0)
                                        createOrUpdatePanel(
                                            interaction.client,
                                            process.env.PANEL_CHANNEL_ID,
                                            process.env.PANEL_MESSAGE_ID,
                                        );
                                } catch (e) {
                                    console.error(e);
                                    await msg.reply(
                                        `${formatEmoji(STATUS_EMOJIS.error)} Hubo un error al procesar tu archivo.`,
                                    );
                                }
                            });
                            collector.on("end", (collected) => {
                                if (collected.size === 0)
                                    channel.send({
                                        content: `${formatEmoji(STATUS_EMOJIS.loading, true)} Se acabó el tiempo.`,
                                    });
                            });
                        } catch (e) {
                            console.error(e);
                        }
                    } else if (args[0] === "ban") {
                        const email = args.slice(1).join("_");
                        const modal = new ModalBuilder()
                            .setCustomId(`add_ban_server_modal_${email}`)
                            .setTitle(
                                `Añadir ban a: ${email.substring(0, 25)}...`,
                            );
                        const serverInput = new TextInputBuilder()
                            .setCustomId("ban_server")
                            .setLabel("Servidor del baneo")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);
                        modal.addComponents(
                            new ActionRowBuilder().addComponents(serverInput),
                        );
                        await interaction.showModal(modal);
                    }
                    break;
                case "release":
                    if (args[0] === "account") {
                        await interaction.deferUpdate();
                        const email = args.slice(1).join("_");
                        const result = await releaseAccountByEmail(email);
                        if (result.success) {
                            try {
                                const channel =
                                    await interaction.client.channels.fetch(
                                        interaction.channelId,
                                    );
                                const message = await channel.messages.fetch(
                                    interaction.message.id,
                                );
                                const disabledRow = ActionRowBuilder.from(
                                    message.components[0],
                                );
                                disabledRow.components.forEach((c) =>
                                    c.setDisabled(true),
                                );
                                await message.edit({
                                    components: [disabledRow],
                                });
                            } catch (editError) {
                                console.error(
                                    "Error al editar mensaje (borrado/reiniciado):",
                                    editError.message,
                                );
                            }
                            await interaction.followUp({
                                content: `<:${EMOJIS.check}:${EMOJIS.check}> Cuenta devuelta.`,
                                ephemeral: true,
                            });
                        } else {
                            await interaction.followUp({
                                content: `${formatEmoji(STATUS_EMOJIS.error)} ${result.message}`,
                                ephemeral: true,
                            });
                        }
                    }
                    break;
                case "get":
                    if (args[0] === "otp") {
                        await interaction.reply({
                            content: `${formatEmoji(STATUS_EMOJIS.key)} Buscando código OTP...`,
                            ephemeral: true,
                        });
                        const result = await getOtpFromWebmail(
                            args[1],
                            args[2],
                        );
                        await interaction.editReply(
                            result.success
                                ? `${formatEmoji(STATUS_EMOJIS.success)} **Código OTP:** \`${result.code}\``
                                : `${formatEmoji(STATUS_EMOJIS.error)} **Error:** ${result.error}`,
                        );
                    } else if (args[0] === "2fa") {
                        await interaction.reply({
                            content: `${formatEmoji(STATUS_EMOJIS.key)} Pidiendo código 2FA...`,
                            ephemeral: true,
                        });
                        try {
                            const token2FA = args.slice(1).join("_");
                            const response = await axios.get(
                                `https://2fa.fb.rip/api/otp/${token2FA}`,
                            );
                            await interaction.editReply(
                                response.data.token
                                    ? `${formatEmoji(STATUS_EMOJIS.success)} **Código 2FA:** \`${response.data.token}\``
                                    : `${formatEmoji(STATUS_EMOJIS.error)} **Error:** API no devolvió un código.`,
                            );
                        } catch (error) {
                            await interaction.editReply(
                                `${formatEmoji(STATUS_EMOJIS.error)} **Error:** No se pudo conectar con la API de 2FA.`,
                            );
                        }
                    }
                    break;
                case "pack":
                    const packEmailsRaw = args.slice(2).join("_");
                    const packEmails = packEmailsRaw.split(",");
                    if (args[0] === "add" && args[1] === "ban") {
                        const modal = new ModalBuilder()
                            .setCustomId(`pack_ban_modal_${packEmailsRaw}`)
                            .setTitle(`Añadir Baneo al Pack`);
                        const serverInput = new TextInputBuilder()
                            .setCustomId("ban_server")
                            .setLabel("Nombre del servidor")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);
                        modal.addComponents(
                            new ActionRowBuilder().addComponents(serverInput),
                        );
                        await interaction.showModal(modal);
                    }
                    if (args[0] === "release") {
                        await interaction.deferUpdate();
                        for (const email of packEmails) {
                            if (email) await releaseAccountByEmail(email);
                        }
                        try {
                            const channel =
                                await interaction.client.channels.fetch(
                                    interaction.channelId,
                                );
                            const message = await channel.messages.fetch(
                                interaction.message.id,
                            );
                            const disabledRow = ActionRowBuilder.from(
                                message.components[0],
                            );
                            disabledRow.components.forEach((c) =>
                                c.setDisabled(true),
                            );
                            await message.edit({ components: [disabledRow] });
                        } catch (editError) {
                            console.error(
                                "Error al editar mensaje del pack (borrado/reiniciado):",
                                editError.message,
                            );
                        }
                        await interaction.followUp({
                            content: `<:${EMOJIS.check}:${EMOJIS.check}> Pack completo devuelto.`,
                            ephemeral: true,
                        });
                    }
                    if (args[0] === "otp") {
                        await interaction.reply({
                            content: `${formatEmoji(STATUS_EMOJIS.key)} Buscando OTP para el pack...`,
                            ephemeral: true,
                        });
                        const result = await getOtpFromWebmail(
                            args[1],
                            args[2],
                        );
                        await interaction.editReply(
                            result.success
                                ? `${formatEmoji(STATUS_EMOJIS.success)} **Código OTP:** \`${result.code}\``
                                : `${formatEmoji(STATUS_EMOJIS.error)} **Error:** ${result.error}`,
                        );
                    }
                    if (args[0] === "2fa") {
                        await interaction.reply({
                            content: `${formatEmoji(STATUS_EMOJIS.key)} Pidiendo 2FA para el pack...`,
                            ephemeral: true,
                        });
                        try {
                            const token2FA = args.slice(1).join("_");
                            const response = await axios.get(
                                `https://2fa.fb.rip/api/otp/${token2FA}`,
                            );
                            await interaction.editReply(
                                response.data.token
                                    ? `${formatEmoji(STATUS_EMOJIS.success)} **Código 2FA:** \`${response.data.token}\``
                                    : `${formatEmoji(STATUS_EMOJIS.error)} **Error:** API no devolvió un código.`,
                            );
                        } catch (error) {
                            await interaction.editReply(
                                `${formatEmoji(STATUS_EMOJIS.error)} **Error:** No se pudo conectar con la API de 2FA.`,
                            );
                        }
                    }
                    break;
            }
        }
        if (interaction.isModalSubmit()) {
            const { customId } = interaction;
            const [action, ...args] = customId.split("_");
            switch (action) {
                case "filter":
                    const category = args[1];
                    const serverFilter =
                        interaction.fields
                            .getTextInputValue("filter_server")
                            .trim() || null;
                    if (category === "pack")
                        await handleGetPack(interaction, serverFilter);
                    else
                        await handleGetAccount(
                            interaction,
                            category,
                            serverFilter,
                        );
                    break;
                case "add":
                    if (
                        args[0] === "ban" &&
                        args[1] === "server" &&
                        args[2] === "modal"
                    ) {
                        await interaction.deferReply({ ephemeral: true });
                        const prefix = "add_ban_server_modal_";
                        const email = customId.substring(prefix.length);
                        const server =
                            interaction.fields.getTextInputValue("ban_server");
                        const result = await addBanByEmail(email, server);
                        await interaction.editReply(result.message);
                    }
                    break;
                case "pack":
                    if (args[0] === "ban" && args[1] === "modal") {
                        await interaction.deferReply({ ephemeral: true });
                        const prefix = "pack_ban_modal_";
                        const emails = customId
                            .substring(prefix.length)
                            .split(",");
                        const server =
                            interaction.fields.getTextInputValue("ban_server");
                        let successCount = 0;
                        for (const email of emails) {
                            if (email) await addBanByEmail(email, server);
                            successCount++;
                        }
                        await interaction.editReply(
                            `${formatEmoji(STATUS_EMOJIS.success)} Ban en "${server}" añadido a las ${successCount} cuentas del pack.`,
                        );
                    }
                    break;
                case "auth":
                    if (customId === "auth_modal") {
                        await interaction.deferReply({ ephemeral: true });
                        const code =
                            interaction.fields.getTextInputValue(
                                "auth_code_input",
                            );
                        const result = await verifyAuthCode(
                            code,
                            interaction.user.id,
                        );
                        if (result.success) {
                            try {
                                const role =
                                    await interaction.guild.roles.fetch(
                                        process.env.verifiedRoleId,
                                    );
                                await interaction.member.roles.add(role);
                                await interaction.editReply({
                                    content: `${formatEmoji(STATUS_EMOJIS.success)} ${result.message}`,
                                });
                            } catch (e) {
                                console.error(e);
                                await interaction.editReply({
                                    content: `${formatEmoji(STATUS_EMOJIS.error)} Error al asignar el rol. ¿ID de rol bien configurado?`,
                                });
                            }
                        } else {
                            await interaction.editReply({
                                content: `${formatEmoji(STATUS_EMOJIS.error)} ${result.message}`,
                            });
                        }
                    }
                    break;
            }
        }
    },
};
