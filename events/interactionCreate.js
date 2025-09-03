const { Events, InteractionType, EmbedBuilder } = require('discord.js');
const { verifyAuthCode, getAvailableAccount } = require('../util/sheets.js');

const cooldowns = new Map();

async function logAction(client, message) {
    try {
        const logChannel = await client.channels.fetch(process.env.logChannelId);
        if (logChannel && logChannel.isTextBased()) {
            const embed = new EmbedBuilder().setDescription(message).setColor('#f1c40f').setTimestamp();
            logChannel.send({ embeds: [embed] });
        }
    } catch (error) { console.error('Error al enviar log:', error); }
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Ejecutor de Comandos Slash
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Hubo un error ejecutando este comando.', ephemeral: true });
            }
            return;
        }

        // Manejador de Menú Desplegable
        if (interaction.isStringSelectMenu() && interaction.customId === 'account_select') {
            const cooldownAmount = 10 * 1000;
            const now = Date.now();
            if (cooldowns.has(interaction.user.id) && now < cooldowns.get(interaction.user.id)) {
                const timeLeft = (cooldowns.get(interaction.user.id) - now) / 1000;
                return interaction.reply({ content: `⏳ Debes esperar **${timeLeft.toFixed(1)} segundos** más.`, ephemeral: true });
            }
            cooldowns.set(interaction.user.id, now + cooldownAmount);
            
            await interaction.deferReply({ ephemeral: true });
            const sheetName = interaction.values[0];
            const account = await getAvailableAccount(sheetName, interaction.user.tag);
            
            if (account) {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#2ecc71').setTitle(`✅ Cuenta de ${sheetName} Asignada`).setDescription('**IMPORTANTE:** No compartas estos datos.')
                    .addFields(
                        { name: '📧 Email / Usuario', value: `\`\`\`${account.email}\`\`\`` },
                        { name: '🔑 Contraseña', value: `\`\`\`${account.pass}\`\`\`` },
                        { name: '🚫 Baneos Conocidos', value: `\`\`\`${account.bans}\`\`\`` }
                    ).setTimestamp();
                try {
                    await interaction.user.send({ embeds: [dmEmbed] });
                    await interaction.editReply({ content: '✅ ¡Revisa tus mensajes privados! Te he enviado los detalles.' });
                    await logAction(interaction.client, `🧾 **${interaction.user.tag}** ha obtenido una cuenta de **${sheetName}**.`);
                } catch (error) {
                    await interaction.editReply({ content: '❌ No pude enviarte un DM. Revisa tu configuración de privacidad.' });
                    await logAction(interaction.client, `🚫 **${interaction.user.tag}** no pudo recibir el DM para una cuenta de **${sheetName}**.`);
                }
            } else {
                await interaction.editReply({ content: `❌ Lo sentimos, no hay cuentas de **${sheetName}** disponibles.` });
                await logAction(interaction.client, `⚠️ **${interaction.user.tag}** intentó obtener una cuenta de **${sheetName}** (Sin stock).`);
            }
        }

        // Manejador de Modal
        if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'auth_modal') {
            await interaction.deferReply({ ephemeral: true });
            const code = interaction.fields.getTextInputValue('auth_code_input');
            const result = await verifyAuthCode(code, interaction.user.id);

            if (result.success) {
                try {
                    const role = await interaction.guild.roles.fetch(process.env.verifiedRoleId);
                    if (role) {
                        await interaction.member.roles.add(role);
                        await interaction.editReply({ content: `✅ ${result.message} Se te ha concedido acceso. Ahora puedes usar el comando \`/menu\`.` });
                        await logAction(interaction.client, `🔑 **${interaction.user.tag}** se ha verificado con éxito.`);
                    } else {
                        await interaction.editReply({ content: '⚠️ Código verificado, pero no se pudo encontrar el rol. Contacta a un administrador.' });
                    }
                } catch(e){
                     await interaction.editReply({ content: '⚠️ Hubo un error al asignar el rol. Revisa que el ID del rol sea correcto y que el bot tenga permisos.' });
                }
            } else {
                await interaction.editReply({ content: `❌ ${result.message}` });
            }
        }
    },
};