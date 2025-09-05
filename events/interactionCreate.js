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
        
        console.log(`🔍 DEBUG - Botones del pack creados:`);
        console.log(`- OTP Button ID: "pack_otp_${pack.FiveM.email}_${pack.FiveM.pass}"`);
        console.log(`- 2FA Button ID: "pack_2fa_${pack.Discord.twoFactorToken}"`);
        console.log(`- Ban Button ID: "pack_add_ban_${packEmails}"`);
        console.log(`- Release Button ID: "pack_release_${packEmails}"`);
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
            console.log(`🔍 DEBUG - Button pressed:`);
            console.log(`- customId completo: "${interaction.customId}"`);
            
            const [action, ...args] = interaction.customId.split("_");
            console.log(`- action: "${action}"`);
            console.log(`- args: [${args.map(a => `"${a}"`).join(', ')}]`);
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
                            const apiUrl = `https://2fa.fb.rip/api/otp/${token2FA}`;

                            console.log(`🔍 DEBUG COMPLETO - 2FA Request:`);
                            console.log(`- Token 2FA: "${token2FA}"`);
                            console.log(`- URL completa: "${apiUrl}"`);
                            console.log(`- args array:`, args);

                            const response = await axios.get(apiUrl, {
                                timeout: 10000,
                                headers: {
                                    "User-Agent": "Discord-Bot/1.0",
                                },
                            });

                            console.log(
                                `🔍 DEBUG - Respuesta HTTP Status:`,
                                response.status,
                            );
                            console.log(
                                `🔍 DEBUG - Respuesta Headers:`,
                                response.headers,
                            );
                            console.log(
                                `🔍 DEBUG - Respuesta Data (raw):`,
                                JSON.stringify(response.data, null, 2),
                            );
                            console.log(
                                `🔍 DEBUG - Tipo de response.data:`,
                                typeof response.data,
                            );

                            // Si la respuesta es un string, intentar parsearlo
                            let parsedData;
                            if (typeof response.data === "string") {
                                try {
                                    parsedData = JSON.parse(response.data);
                                    console.log(
                                        `🔍 DEBUG - Datos parseados:`,
                                        parsedData,
                                    );
                                } catch (parseError) {
                                    console.error(
                                        `❌ Error al parsear JSON:`,
                                        parseError,
                                    );
                                    return await interaction.editReply(
                                        `${formatEmoji(STATUS_EMOJIS.error)} **Error:** La respuesta de la API no es JSON válido.`,
                                    );
                                }
                            } else {
                                parsedData = response.data;
                            }

                            console.log(`🔍 DEBUG - Estructura analizada:`);
                            console.log(`- parsedData.ok:`, parsedData.ok);
                            console.log(`- parsedData.data:`, parsedData.data);
                            console.log(
                                `- parsedData.data?.otp:`,
                                parsedData.data?.otp,
                            );
                            console.log(
                                `- parsedData.data?.timeRemaining:`,
                                parsedData.data?.timeRemaining,
                            );

                            // Intentar múltiples estructuras posibles
                            let otpCode = null;
                            let timeRemaining = null;
                            let errorMessage = null;

                            // Estructura 1: {ok: true, data: {otp: "123456", timeRemaining: 30}}
                            if (
                                parsedData &&
                                parsedData.ok &&
                                parsedData.data &&
                                parsedData.data.otp
                            ) {
                                otpCode = parsedData.data.otp;
                                timeRemaining = parsedData.data.timeRemaining;
                                console.log(
                                    `✅ Estructura 1 detectada - OTP: ${otpCode}`,
                                );
                            }
                            // Estructura 2: {token: "123456"}
                            else if (parsedData && parsedData.token) {
                                otpCode = parsedData.token;
                                console.log(
                                    `✅ Estructura 2 detectada - Token: ${otpCode}`,
                                );
                            }
                            // Estructura 3: {otp: "123456"}
                            else if (parsedData && parsedData.otp) {
                                otpCode = parsedData.otp;
                                console.log(
                                    `✅ Estructura 3 detectada - OTP: ${otpCode}`,
                                );
                            }
                            // Estructura 4: "123456" (string directo)
                            else if (
                                typeof parsedData === "string" &&
                                /^\d{6}$/.test(parsedData.trim())
                            ) {
                                otpCode = parsedData.trim();
                                console.log(
                                    `✅ Estructura 4 detectada - String directo: ${otpCode}`,
                                );
                            }
                            // Error de la API
                            else if (parsedData && parsedData.ok === false) {
                                errorMessage =
                                    parsedData.error ||
                                    parsedData.message ||
                                    "Error desconocido de la API";
                                console.log(
                                    `❌ API devolvió error: ${errorMessage}`,
                                );
                            }
                            // Estructura no reconocida
                            else {
                                console.error(
                                    `❌ Estructura no reconocida:`,
                                    parsedData,
                                );

                                // Buscar cualquier cosa que parezca un código de 6 dígitos
                                const jsonString = JSON.stringify(parsedData);
                                const codeMatch = jsonString.match(/\b\d{6}\b/);

                                if (codeMatch) {
                                    otpCode = codeMatch[0];
                                    console.log(
                                        `🔍 Código encontrado mediante regex: ${otpCode}`,
                                    );
                                }
                            }

                            if (otpCode) {
                                const timeText = timeRemaining
                                    ? `\n*Tiempo restante: ${timeRemaining}s*`
                                    : "";
                                await interaction.editReply(
                                    `${formatEmoji(STATUS_EMOJIS.success)} **Código 2FA:** \`${otpCode}\`${timeText}`,
                                );
                            } else if (errorMessage) {
                                await interaction.editReply(
                                    `${formatEmoji(STATUS_EMOJIS.error)} **Error de la API:** ${errorMessage}`,
                                );
                            } else {
                                await interaction.editReply(
                                    `${formatEmoji(STATUS_EMOJIS.error)} **Error:** No se pudo extraer el código 2FA.\n*Revisa la consola para más detalles.*`,
                                );
                            }
                        } catch (error) {
                            console.error(
                                "❌ ERROR COMPLETO AL CONECTAR CON LA API DE 2FA:",
                            );
                            console.error("- Mensaje:", error.message);
                            console.error("- Stack:", error.stack);

                            if (error.response) {
                                console.error(
                                    "- HTTP Status:",
                                    error.response.status,
                                );
                                console.error(
                                    "- HTTP Status Text:",
                                    error.response.statusText,
                                );
                                console.error(
                                    "- Response Headers:",
                                    error.response.headers,
                                );
                                console.error(
                                    "- Response Data:",
                                    error.response.data,
                                );

                                await interaction.editReply(
                                    `${formatEmoji(STATUS_EMOJIS.error)} **Error HTTP ${error.response.status}:** ${error.response.statusText}\n*Datos: ${JSON.stringify(error.response.data)}*`,
                                );
                            } else if (error.request) {
                                console.error("- No response received");
                                console.error("- Request:", error.request);
                                await interaction.editReply(
                                    `${formatEmoji(STATUS_EMOJIS.error)} **Error de conexión:** No se recibió respuesta de la API.`,
                                );
                            } else {
                                console.error("- Setup error:", error.message);
                                await interaction.editReply(
                                    `${formatEmoji(STATUS_EMOJIS.error)} **Error de configuración:** ${error.message}`,
                                );
                            }
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
                    console.log(`🔍 DEBUG - Entrando en case "pack" con args:`, args);
                    
                    const packEmailsRaw = args.slice(2).join("_");
                    const packEmails = packEmailsRaw.split(",");
                    
                    console.log(`🔍 DEBUG - Pack parsing:`);
                    console.log(`- args[0]: "${args[0]}"`);
                    console.log(`- args[1]: "${args[1]}"`);
                    console.log(`- packEmailsRaw: "${packEmailsRaw}"`);
                    console.log(`- packEmails: [${packEmails.map(e => `"${e}"`).join(', ')}]`);

                    if (args[0] === "add" && args[1] === "ban") {
                        console.log(`✅ Ejecutando pack add ban`);
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
                        console.log(`✅ Ejecutando pack release`);
                        await interaction.deferUpdate();
                        console.log(
                            `🔍 DEBUG - Liberando pack con emails: ${packEmails}`,
                        );

                        let releasedCount = 0;
                        for (const email of packEmails) {
                            if (email && email.trim()) {
                                const result = await releaseAccountByEmail(
                                    email.trim(),
                                );
                                if (result.success) releasedCount++;
                            }
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
                            content: `<:${EMOJIS.check}:${EMOJIS.check}> Pack liberado: ${releasedCount} cuentas devueltas.`,
                            ephemeral: true,
                        });
                    }

                    if (args[0] === "otp") {
                        console.log(`✅ Ejecutando pack OTP`);
                        await interaction.reply({
                            content: `${formatEmoji(STATUS_EMOJIS.key)} Buscando OTP del pack...`,
                            ephemeral: true,
                        });
                        console.log(`🔍 DEBUG - Pack OTP args:`, args);

                        const email = args[1];
                        const password = args[2];
                        console.log(`🔍 Pack OTP - email: "${email}", password: "${password}"`);

                        const result = await getOtpFromWebmail(email, password);
                        await interaction.editReply(
                            result.success
                                ? `${formatEmoji(STATUS_EMOJIS.success)} **Código OTP (FiveM del Pack):** \`${result.code}\``
                                : `${formatEmoji(STATUS_EMOJIS.error)} **Error:** ${result.error}`,
                        );
                    }

                    if (args[0] === "2fa") {
                        console.log(`✅ Ejecutando pack 2FA`);
                        await interaction.reply({
                            content: `${formatEmoji(STATUS_EMOJIS.key)} Pidiendo 2FA del pack...`,
                            ephemeral: true,
                        });

                        try {
                            const token2FA = args.slice(1).join("_");
                            const apiUrl = `https://2fa.fb.rip/api/otp/${token2FA}`;

                            console.log(`🔍 DEBUG - Pack 2FA Request:`);
                            console.log(`- Token 2FA: "${token2FA}"`);
                            console.log(`- URL: "${apiUrl}"`);

                            const response = await axios.get(apiUrl, {
                                timeout: 10000,
                                headers: {
                                    "User-Agent": "Discord-Bot/1.0",
                                },
                            });

                            console.log(
                                `🔍 DEBUG - Pack 2FA Response:`,
                                JSON.stringify(response.data, null, 2),
                            );

                            let parsedData = response.data;
                            let otpCode = null;
                            let timeRemaining = null;

                            // Misma lógica que el 2FA individual
                            if (
                                parsedData &&
                                parsedData.ok &&
                                parsedData.data &&
                                parsedData.data.otp
                            ) {
                                otpCode = parsedData.data.otp;
                                timeRemaining = parsedData.data.timeRemaining;
                            } else if (parsedData && parsedData.token) {
                                otpCode = parsedData.token;
                            } else if (parsedData && parsedData.otp) {
                                otpCode = parsedData.otp;
                            }

                            if (otpCode) {
                                const timeText = timeRemaining
                                    ? `\n*Tiempo restante: ${timeRemaining}s*`
                                    : "";
                                await interaction.editReply(
                                    `${formatEmoji(STATUS_EMOJIS.success)} **Código 2FA (Discord del Pack):** \`${otpCode}\`${timeText}`,
                                );
                            } else {
                                await interaction.editReply(
                                    `${formatEmoji(STATUS_EMOJIS.error)} **Error:** No se pudo obtener el código 2FA del pack.`,
                                );
                            }
                        } catch (error) {
                            console.error(
                                "Error al obtener 2FA del pack:",
                                error,
                            );

                            if (error.response) {
                                await interaction.editReply(
                                    `${formatEmoji(STATUS_EMOJIS.error)} **Error HTTP ${error.response.status}:** ${error.response.statusText}`,
                                );
                            } else {
                                await interaction.editReply(
                                    `${formatEmoji(STATUS_EMOJIS.error)} **Error:** No se pudo conectar con la API de 2FA.`,
                                );
                            }
                        }
                    }
                    break;
            }
        }
    },
};
