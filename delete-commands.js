// delete-commands.js
const { REST, Routes } = require("discord.js");

// Carga las variables desde los Secrets de Replit
const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.guildId;

// Comprobación de que las variables existen
if (!token || !clientId || !guildId) {
    console.error(
        "Error: Asegúrate de que DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, y guildId están configurados en los Secrets de Replit.",
    );
    process.exit(1); // Detiene el script si falta alguna variable
}

const rest = new REST({ version: "10" }).setToken(token);

// Enviamos una lista VACÍA de comandos, lo que le dice a Discord que borre todos los existentes.
console.log(
    "Empezando a borrar todos los comandos de aplicación (/) del servidor.",
);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] })
    .then(() =>
        console.log(
            "✅ Se han borrado todos los comandos del servidor con éxito.",
        ),
    )
    .catch(console.error);
