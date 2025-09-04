const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.data.toJSON());
}

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.guildId;

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`Empezando a refrescar ${commands.length} comandos de aplicación (/).`);
        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        console.log(`✅ Recargados ${data.length} comandos de aplicación (/) con éxito.`);
    } catch (error) {
        console.error(error);
    }
})();