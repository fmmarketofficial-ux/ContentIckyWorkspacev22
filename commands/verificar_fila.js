const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
} = require("discord.js");
const { getRawRowData } = require("../util/sheets.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("verificar_fila")
        .setDescription(
            'Lee una fila específica de la hoja "Discord" para depurar.',
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption((option) =>
            option
                .setName("numero_de_fila")
                .setDescription(
                    "El número exacto de la fila que quieres verificar (ej: 2).",
                )
                .setRequired(true),
        ),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const rowNumber = interaction.options.getInteger("numero_de_fila");

        if (rowNumber < 2) {
            return interaction.editReply(
                "Error: El número de la fila debe ser 2 o mayor.",
            );
        }

        const result = await getRawRowData("Discord", rowNumber);

        if (!result.success) {
            return interaction.editReply(
                `❌ Error al leer la Fila ${rowNumber}: ${result.message}`,
            );
        }

        const rowData = result.data;
        // Rellenamos por si la fila llega corta, para que no crashee
        while (rowData.length < 6) {
            rowData.push("(celda vacía)");
        }

        const token = rowData[4] || "(celda vacía)"; // Columna E (índice 4)
        const estado = rowData[5] || "(celda vacía)"; // Columna F (índice 5)

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Depuración de la Fila ${rowNumber} | Hoja "Discord"`)
            .setColor("#FFD700")
            .setDescription(
                "Esta es la información **exacta** que la API de Google le está dando al bot para la fila solicitada.",
            )
            .addFields(
                {
                    name: "Datos Crudos Recibidos (Array Completo)",
                    value: `\`\`\`json\n${JSON.stringify(rowData, null, 2)}\`\`\``,
                },
                {
                    name: "Longitud del Array",
                    value: `\`${rowData.length}\` elementos`,
                    inline: true,
                },
                {
                    name: "Columna A (Usado)",
                    value: `\`${rowData[0]}\``,
                    inline: true,
                },
                {
                    name: "Columna B (Email)",
                    value: `\`${rowData[1]}\``,
                    inline: true,
                },
                {
                    name: "Columna C (Pass)",
                    value: `\`${rowData[2]}\``,
                    inline: true,
                },
                {
                    name: "Columna D (Baneos)",
                    value: `\`${rowData[3]}\``,
                    inline: true,
                },
                {
                    name: "Columna E (2FA Token)",
                    value: `\`${token}\``,
                    inline: true,
                },
                {
                    name: "Columna F (Estado)",
                    value: `\`${estado}\``,
                    inline: true,
                },
            )
            .setFooter({
                text: "Si el token aparece aquí pero el botón no, el error está en interactionCreate.js. Si no, está en la hoja.",
            });

        await interaction.editReply({ embeds: [embed] });
    },
};
